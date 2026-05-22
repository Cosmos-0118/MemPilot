import { loadState, saveState } from './state';
import { estimateTabMemoryMB, getTabLastActive, isDiscardableTab } from './tabRules';

export const seedExistingTabs = async (): Promise<void> => {
  const state = await loadState();
  const now = Date.now();
  let changed = false;

  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id) continue;
      if (state.tabLastActive[tab.id]) continue;

      const lastActive = getTabLastActive(tab, state) ?? now;
      state.tabLastActive[tab.id] = lastActive;
      changed = true;
    }

    if (changed) await saveState(state);
  } catch (e) {
    console.warn('MemPilot: Failed to seed existing tabs', e);
  }
};

export const discardIdleTabs = async (): Promise<void> => {
  const state = await loadState();
  if (!state.isEnabled) return;

  const now = Date.now();
  const idleThreshold = state.idleTimeoutMinutes * 60 * 1000;

  try {
    const tabs = await chrome.tabs.query({
      active: false,
      discarded: false,
      audible: false,
    });

    let discardedCount = 0;
    let memorySavedThisCycle = 0;

    for (const tab of tabs) {
      if (!isDiscardableTab(tab) || tab.id === undefined) continue;
      const tabId = tab.id;

      const lastActive = getTabLastActive(tab, state);

      if (!lastActive) {
        state.tabLastActive[tabId] = now;
        continue;
      }

      if (now - lastActive > idleThreshold) {
        try {
          await chrome.tabs.discard(tabId);
          discardedCount++;
          const memSaved = estimateTabMemoryMB();
          memorySavedThisCycle += memSaved;
          delete state.tabLastActive[tabId];
          console.log(
            `MemPilot: Discarded tab ${tab.id} (${tab.title?.substring(0, 40)}), est. ${memSaved}MB saved`,
          );
        } catch (e) {
          console.warn(`MemPilot: Failed to discard tab ${tab.id}`, e);
        }
      }
    }

    if (discardedCount > 0) {
      state.totalDiscarded += discardedCount;
      state.totalMemorySavedMB += memorySavedThisCycle;
    }

    const currentTabs = await chrome.tabs.query({});
    const liveTabIds = new Set(currentTabs.map((t) => t.id).filter(Boolean));

    for (const idStr of Object.keys(state.tabLastActive)) {
      const id = Number(idStr);
      if (!liveTabIds.has(id)) {
        delete state.tabLastActive[id];
      }
    }

    await saveState(state);
  } catch (e) {
    console.error('MemPilot: Error in discardIdleTabs', e);
  }
};

export const discardTabById = async (tabId: number): Promise<void> => {
  await chrome.tabs.discard(tabId);
  const state = await loadState();
  state.totalDiscarded++;
  state.totalMemorySavedMB += estimateTabMemoryMB();
  delete state.tabLastActive[tabId];
  await saveState(state);
};

export const discardAllInactiveTabs = async (): Promise<void> => {
  const tabs = await chrome.tabs.query({ active: false, discarded: false, audible: false });
  const state = await loadState();
  for (const tab of tabs) {
    if (!isDiscardableTab(tab) || tab.id === undefined) continue;
    const tabId = tab.id;
    try {
      await chrome.tabs.discard(tabId);
      state.totalDiscarded++;
      state.totalMemorySavedMB += estimateTabMemoryMB();
      delete state.tabLastActive[tabId];
    } catch {
      /* tab may have closed or be protected */
    }
  }
  await saveState(state);
};
