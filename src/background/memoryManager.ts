// src/background/memoryManager.ts
// Robust memory manager with persistent state across service worker restarts
import { initTrackerBlocker, getBlockedDomainCount } from './trackerBlocker';

const STORAGE_KEY = 'mempilot-state';
const DEFAULT_IDLE_MINUTES = 15;
const CHECK_INTERVAL_MINUTES = 2;

interface MemPilotState {
  tabLastActive: Record<number, number>;
  totalDiscarded: number;
  totalMemorySavedMB: number;
  idleTimeoutMinutes: number;
  isEnabled: boolean;
}

const DEFAULT_STATE: MemPilotState = {
  tabLastActive: {},
  totalDiscarded: 0,
  totalMemorySavedMB: 0,
  idleTimeoutMinutes: DEFAULT_IDLE_MINUTES,
  isEnabled: true,
};

/** Load persisted state from chrome.storage.local */
const loadState = async (): Promise<MemPilotState> => {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      return { ...DEFAULT_STATE, ...result[STORAGE_KEY] };
    }
  } catch (e) {
    console.warn('MemPilot: Failed to load state, using defaults', e);
  }
  return { ...DEFAULT_STATE };
};

/** Save state to chrome.storage.local */
const saveState = async (state: MemPilotState): Promise<void> => {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  } catch (e) {
    console.warn('MemPilot: Failed to persist state', e);
  }
};

/** Estimate memory saved per tab based on heuristics (50-150MB range) */
const estimateTabMemoryMB = (): number => 80;

/** Resolve last-active timestamp from persisted state or Chrome's tab metadata */
const getTabLastActive = (tab: chrome.tabs.Tab, state: MemPilotState): number | undefined => {
  if (tab.id && state.tabLastActive[tab.id]) {
    return state.tabLastActive[tab.id];
  }
  if (typeof tab.lastAccessed === 'number' && tab.lastAccessed > 0) {
    return tab.lastAccessed;
  }
  return undefined;
};

const isDiscardableTab = (tab: chrome.tabs.Tab): boolean => {
  if (!tab.id || tab.pinned || tab.discarded || tab.audible) return false;
  if (tab.active) return false;
  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    return false;
  }
  return true;
};

/** Seed tracking for tabs that existed before the service worker woke up */
const seedExistingTabs = async (): Promise<void> => {
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

/** Core discard logic */
const discardIdleTabs = async (): Promise<void> => {
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
        // First time seeing this tab — record it but don't discard yet
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
          console.log(`MemPilot: Discarded tab ${tab.id} (${tab.title?.substring(0, 40)}), est. ${memSaved}MB saved`);
        } catch (e) {
          // Tab may have been closed between query and discard
          console.warn(`MemPilot: Failed to discard tab ${tab.id}`, e);
        }
      }
    }

    if (discardedCount > 0) {
      state.totalDiscarded += discardedCount;
      state.totalMemorySavedMB += memorySavedThisCycle;
    }

    // Clean up stale tab IDs from state
    const currentTabs = await chrome.tabs.query({});
    const liveTabIds = new Set(currentTabs.map(t => t.id).filter(Boolean));
    
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

/** Get current stats for popup */
const getStats = async () => {
  const state = await loadState();
  
  try {
    const allTabs = await chrome.tabs.query({});
    const discardedTabs = allTabs.filter(t => t.discarded);
    const activeTabs = allTabs.filter(t => !t.discarded);

    // Load active settings from storage
    const trackerResult = await chrome.storage.local.get('tracker-blocking-enabled');
    const trackerBlockingEnabled = trackerResult['tracker-blocking-enabled'] !== false;

    const webglResult = await chrome.storage.local.get('webgl-eviction-enabled');
    const webglEvictionEnabled = webglResult['webgl-eviction-enabled'] !== false;

    const currentlySleepingMB = discardedTabs.length * estimateTabMemoryMB();

    return {
      activeTabs: activeTabs.length,
      discardedTabs: discardedTabs.length,
      totalTabs: allTabs.length,
      totalDiscarded: state.totalDiscarded,
      totalMemorySavedMB: state.totalMemorySavedMB,
      currentlySleepingMB,
      blockedDomainCount: getBlockedDomainCount(),
      idleTimeoutMinutes: state.idleTimeoutMinutes,
      isEnabled: state.isEnabled,
      trackerBlockingEnabled,
      webglEvictionEnabled,
      tabs: allTabs.map(t => ({
        id: t.id,
        title: t.title || 'Untitled',
        url: t.url || '',
        favIconUrl: t.favIconUrl || '',
        discarded: t.discarded || false,
        active: t.active || false,
        pinned: t.pinned || false,
        audible: t.audible || false,
        lastActive: t.id ? getTabLastActive(t, state) : undefined,
      })),
    };
  } catch (e) {
    console.error('MemPilot: Error getting stats', e);
    return {
      activeTabs: 0,
      discardedTabs: 0,
      totalTabs: 0,
      totalDiscarded: state.totalDiscarded,
      totalMemorySavedMB: state.totalMemorySavedMB,
      currentlySleepingMB: 0,
      blockedDomainCount: getBlockedDomainCount(),
      idleTimeoutMinutes: state.idleTimeoutMinutes,
      isEnabled: state.isEnabled,
      trackerBlockingEnabled: true,
      webglEvictionEnabled: true,
      tabs: [],
    };
  }
};

export const initMemoryManager = () => {
  console.log('MemPilot: Memory Manager Initialized');

  // Seed tab activity + run an immediate pass after worker restart
  seedExistingTabs().then(() => discardIdleTabs());

  // Set up periodic check alarm
  chrome.alarms.create('mempilot-check', { periodInMinutes: CHECK_INTERVAL_MINUTES });

  chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
    if (alarm.name === 'mempilot-check') {
      discardIdleTabs();
    }
  });

  // Track tab activation
  chrome.tabs.onActivated.addListener(async (activeInfo: { tabId: number; windowId: number }) => {
    const state = await loadState();
    state.tabLastActive[activeInfo.tabId] = Date.now();
    await saveState(state);
  });

  // New tabs start from "now" so they are not discarded immediately
  chrome.tabs.onCreated.addListener(async (tab) => {
    if (!tab.id) return;
    const state = await loadState();
    state.tabLastActive[tab.id] = Date.now();
    await saveState(state);
  });

  // Clean up when tabs are closed
  chrome.tabs.onRemoved.addListener(async (tabId: number) => {
    const state = await loadState();
    delete state.tabLastActive[tabId];
    await saveState(state);
  });

  // Handle messages from popup
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_STATS') {
      getStats().then(sendResponse);
      return true; // Keep channel open for async response
    }

    if (message.type === 'DISCARD_TAB') {
      const tabId = message.tabId as number;
      chrome.tabs.discard(tabId).then(async () => {
        const state = await loadState();
        state.totalDiscarded++;
        state.totalMemorySavedMB += 80;
        delete state.tabLastActive[tabId];
        await saveState(state);
        const stats = await getStats();
        sendResponse(stats);
      }).catch((e) => {
        console.warn('MemPilot: Failed to discard tab', e);
        getStats().then(sendResponse);
      });
      return true;
    }

    if (message.type === 'DISCARD_ALL_INACTIVE') {
      (async () => {
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
        const stats = await getStats();
        sendResponse(stats);
      })();
      return true;
    }

    if (message.type === 'SET_SETTINGS') {
      (async () => {
        const state = await loadState();
        if (message.idleTimeoutMinutes !== undefined) {
          state.idleTimeoutMinutes = message.idleTimeoutMinutes;
        }
        if (message.isEnabled !== undefined) {
          state.isEnabled = message.isEnabled;
        }
        await saveState(state);

        if (message.trackerBlockingEnabled !== undefined) {
          await chrome.storage.local.set({ 'tracker-blocking-enabled': message.trackerBlockingEnabled });
          await initTrackerBlocker();
        }
        if (message.webglEvictionEnabled !== undefined) {
          await chrome.storage.local.set({ 'webgl-eviction-enabled': message.webglEvictionEnabled });
        }

        sendResponse({ success: true });
      })();
      return true;
    }

    return false;
  });
};
