import { HIBERNATE_DEFAULTS } from '../../shared/constants/storage';
import type { HibernateState } from './types';

export const estimateTabMemoryMB = (): number => HIBERNATE_DEFAULTS.estimatedMbPerTab;

export const getTabLastActive = (
  tab: chrome.tabs.Tab,
  state: HibernateState,
): number | undefined => {
  if (tab.id && state.tabLastActive[tab.id]) {
    return state.tabLastActive[tab.id];
  }
  if (typeof tab.lastAccessed === 'number' && tab.lastAccessed > 0) {
    return tab.lastAccessed;
  }
  return undefined;
};

export const isDiscardableTab = (tab: chrome.tabs.Tab): boolean => {
  if (!tab.id || tab.pinned || tab.discarded || tab.audible) return false;
  if (tab.active) return false;
  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    return false;
  }
  return true;
};
