import { loadState, saveState, getTabRegistry, updateTabState, deleteTabState } from './state';
import { estimateTabMemoryMB, getTabLastActive, isEligibleForBackgroundReclaim } from './tabRules';
import { getPressureTier } from './pressure';
import { addLedgerEntry } from '../../shared/db';

export const seedExistingTabs = async (): Promise<void> => {
  const registry = await getTabRegistry();
  const now = Date.now();

  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id) continue;
      if (registry[tab.id]) continue;

      const lastActive = getTabLastActive(tab) ?? now;
      await updateTabState(tab.id, { lastActive });
    }
  } catch (e) {
    console.warn('MemPilot: Failed to seed existing tabs', e);
  }
};

export const discardIdleTabs = async (): Promise<void> => {
  const state = await loadState();
  if (!state.isEnabled) return;

  const registry = await getTabRegistry();
  const pressure = await getPressureTier();
  
  let pressureMultiplier = 1;
  if (pressure === 'moderate') pressureMultiplier = 0.5;
  if (pressure === 'critical') pressureMultiplier = 0.1;

  const now = Date.now();
  const idleThreshold = state.idleTimeoutMinutes * 60 * 1000 * pressureMultiplier;

  try {
    const tabs = await chrome.tabs.query({
      active: false,
      discarded: false,
      audible: false,
    });

    let discardedCount = 0;
    let memorySavedThisCycle = 0;

    for (const tab of tabs) {
      if (!tab.id) continue;
      const tabId = tab.id;
      const regEntry = registry[tabId];

      if (!isEligibleForBackgroundReclaim(tab, regEntry)) continue;

      const lastActive = getTabLastActive(tab, regEntry);

      if (!lastActive) {
        await updateTabState(tabId, { lastActive: now });
        continue;
      }

      if (now - lastActive > idleThreshold) {
        try {
          await chrome.tabs.discard(tabId);
          discardedCount++;
          const memSaved = estimateTabMemoryMB();
          memorySavedThisCycle += memSaved;
          await deleteTabState(tabId);
          await addLedgerEntry({
            timestamp: now,
            action: 'discard',
            source: 'mempilot',
            tabId,
            url: tab.url || '',
          });
          console.log(
            `MemPilot: Discarded tab ${tab.id} (${tab.title?.substring(0, 40)}), est. ${memSaved}MB saved [Pressure: ${pressure}]`,
          );
        } catch (e) {
          console.warn(`MemPilot: Failed to discard tab ${tab.id}`, e);
        }
      }
    }

    if (discardedCount > 0) {
      state.totalDiscarded += discardedCount;
      state.totalMemorySavedMB += memorySavedThisCycle;
      await saveState(state);
    }

    const currentTabs = await chrome.tabs.query({});
    const liveTabIds = new Set(currentTabs.map((t) => t.id).filter(Boolean));

    for (const idStr of Object.keys(registry)) {
      const id = Number(idStr);
      if (!liveTabIds.has(id)) {
        await deleteTabState(id);
      }
    }
  } catch (e) {
    console.error('MemPilot: Error in discardIdleTabs', e);
  }
};

export const discardTabById = async (tabId: number): Promise<void> => {
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.discard(tabId);
  const state = await loadState();
  state.totalDiscarded++;
  state.totalMemorySavedMB += estimateTabMemoryMB();
  await deleteTabState(tabId);
  await saveState(state);
  await addLedgerEntry({
    timestamp: Date.now(),
    action: 'discard',
    source: 'mempilot',
    tabId,
    url: tab.url || '',
  });
};

export const discardAllInactiveTabs = async (): Promise<void> => {
  const tabs = await chrome.tabs.query({ active: false, discarded: false, audible: false });
  const state = await loadState();
  const registry = await getTabRegistry();
  const now = Date.now();

  for (const tab of tabs) {
    if (!tab.id) continue;
    const tabId = tab.id;
    if (!isEligibleForBackgroundReclaim(tab, registry[tabId])) continue;
    
    try {
      await chrome.tabs.discard(tabId);
      state.totalDiscarded++;
      state.totalMemorySavedMB += estimateTabMemoryMB();
      await deleteTabState(tabId);
      await addLedgerEntry({
        timestamp: now,
        action: 'discard',
        source: 'mempilot',
        tabId,
        url: tab.url || '',
      });
    } catch {
      /* tab may have closed or be protected */
    }
  }
  await saveState(state);
};
