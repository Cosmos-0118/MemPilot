import { ALARMS, HIBERNATE_DEFAULTS, STORAGE_KEYS } from '../../shared/constants/storage';
import type { PopupMessage } from '../../shared/types/stats';
import { initTrackerBlocker } from '../tracker-blocker';
import {
  discardAllInactiveTabs,
  discardIdleTabs,
  discardTabById,
  seedExistingTabs,
} from './discard';
import { getStats } from './stats';
import { loadState, saveState } from './state';

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
    const state = await loadState();
    state.tabLastActive[activeInfo.tabId] = Date.now();
    await saveState(state);
  });

  chrome.tabs.onCreated.addListener(async (tab) => {
    if (!tab.id) return;
    const state = await loadState();
    state.tabLastActive[tab.id] = Date.now();
    await saveState(state);
  });

  chrome.tabs.onRemoved.addListener(async (tabId: number) => {
    const state = await loadState();
    delete state.tabLastActive[tabId];
    await saveState(state);
  });

  chrome.runtime.onMessage.addListener((message: PopupMessage, _sender, sendResponse) => {
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
