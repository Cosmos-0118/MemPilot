import { ALARMS, HIBERNATE_DEFAULTS, STORAGE_KEYS } from '../../shared/constants/storage';
import { initTrackerBlocker } from '../tracker-blocker';
import {
  discardAllInactiveTabs,
  discardIdleTabs,
  discardTabById,
  seedExistingTabs,
} from './discard';
import { getStats } from './stats';
import { loadState, saveState, updateTabState, deleteTabState } from './state';
import { addLedgerEntry } from '../../shared/db';

export const initTabHibernate = (): void => {
  console.log('MemPilot: Tab Hibernate Initialized');

  seedExistingTabs().then(() => discardIdleTabs());

  chrome.alarms.create(ALARMS.hibernateCheck, {
    periodInMinutes: HIBERNATE_DEFAULTS.checkIntervalMinutes,
  });

  chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
    if (alarm.name === ALARMS.hibernateCheck) {
      discardIdleTabs();
    }
  });

  chrome.tabs.onActivated.addListener(async (activeInfo: { tabId: number; windowId: number }) => {
    await updateTabState(activeInfo.tabId, { lastActive: Date.now() });
  });

  chrome.tabs.onCreated.addListener(async (tab) => {
    if (!tab.id) return;
    await updateTabState(tab.id, { lastActive: Date.now() });
  });

  chrome.tabs.onRemoved.addListener(async (tabId: number) => {
    await deleteTabState(tabId);
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if ('discarded' in changeInfo || 'frozen' in changeInfo) {
      if (changeInfo.discarded || changeInfo.frozen) {
        const action = changeInfo.discarded ? 'discard' : 'freeze';
        await addLedgerEntry({
          timestamp: Date.now(),
          action,
          source: 'native', // MemPilot's discards will record their own, or we can just rely on this
          tabId,
          url: tab.url || '',
        });
      }
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
    if (message.type === 'UPDATE_TAB_STATE' && _sender.tab?.id) {
      updateTabState(_sender.tab.id, { isDirty: (message as { isDirty: boolean }).isDirty });
      return false;
    }
    if (message.type === 'GET_STATS') {
      getStats().then(sendResponse);
      return true;
    }

    if (message.type === 'DISCARD_TAB') {
      discardTabById(message.tabId)
        .then(() => getStats())
        .then(sendResponse)
        .catch((e) => {
          console.warn('MemPilot: Failed to discard tab', e);
          getStats().then(sendResponse);
        });
      return true;
    }

    if (message.type === 'DISCARD_ALL_INACTIVE') {
      discardAllInactiveTabs()
        .then(() => getStats())
        .then(sendResponse);
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
          await chrome.storage.local.set({
            [STORAGE_KEYS.trackerBlocking]: message.trackerBlockingEnabled,
          });
          await initTrackerBlocker();
        }
        if (message.webglEvictionEnabled !== undefined) {
          await chrome.storage.local.set({
            [STORAGE_KEYS.webglEviction]: message.webglEvictionEnabled,
          });
        }

        sendResponse({ success: true });
      })();
      return true;
    }

    return false;
  });
};
