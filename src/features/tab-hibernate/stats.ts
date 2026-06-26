import { STORAGE_KEYS } from '../../shared/constants/storage';
import type { PopupStats } from '../../shared/types/stats';
import { getBlockedDomainCount } from '../tracker-blocker';
import { loadState, getTabRegistry } from './state';
import { estimateTabMemoryMB, getTabLastActive } from './tabRules';

export const getStats = async (): Promise<PopupStats> => {
  const state = await loadState();
  const registry = await getTabRegistry();

  try {
    const allTabs = await chrome.tabs.query({});
    const discardedTabs = allTabs.filter((t) => t.discarded);
    const activeTabs = allTabs.filter((t) => !t.discarded);

    const trackerResult = await chrome.storage.local.get(STORAGE_KEYS.trackerBlocking);
    const trackerBlockingEnabled = trackerResult[STORAGE_KEYS.trackerBlocking] !== false;

    const webglResult = await chrome.storage.local.get(STORAGE_KEYS.webglEviction);
    const webglEvictionEnabled = webglResult[STORAGE_KEYS.webglEviction] !== false;

    const currentlySleepingMB = discardedTabs.length * estimateTabMemoryMB();

    return {
      activeTabs: activeTabs.length,
      discardedTabs: discardedTabs.length,
      totalTabs: allTabs.length,
      totalDiscarded: state.totalDiscarded,
      totalMemorySavedMB: state.totalMemorySavedMB,
      currentlySleepingMB,
      blockedDomainCount: await getBlockedDomainCount(),
      idleTimeoutMinutes: state.idleTimeoutMinutes,
      isEnabled: state.isEnabled,
      trackerBlockingEnabled,
      webglEvictionEnabled,
      tabs: allTabs.map((t) => ({
        id: t.id,
        title: t.title || 'Untitled',
        url: t.url || '',
        favIconUrl: t.favIconUrl || '',
        discarded: t.discarded || false,
        active: t.active || false,
        pinned: t.pinned || false,
        audible: t.audible || false,
        lastActive: t.id ? getTabLastActive(t, registry[t.id]) : undefined,
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
      blockedDomainCount: await getBlockedDomainCount(),
      idleTimeoutMinutes: state.idleTimeoutMinutes,
      isEnabled: state.isEnabled,
      trackerBlockingEnabled: true,
      webglEvictionEnabled: true,
      tabs: [],
    };
  }
};
