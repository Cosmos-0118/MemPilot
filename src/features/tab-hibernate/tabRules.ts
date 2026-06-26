import { HIBERNATE_DEFAULTS } from '../../shared/constants/storage';

export const estimateTabMemoryMB = (): number => HIBERNATE_DEFAULTS.estimatedMbPerTab;

export const getTabLastActive = (
  tab: chrome.tabs.Tab,
  registryEntry?: import('./types').TabRegistry[number],
): number | undefined => {
  if (registryEntry?.lastActive) {
    return registryEntry.lastActive;
  }
  if (typeof tab.lastAccessed === 'number' && tab.lastAccessed > 0) {
    return tab.lastAccessed;
  }
  return undefined;
};

export const isEligibleForBackgroundReclaim = (
  tab: chrome.tabs.Tab,
  registryEntry?: import('./types').TabRegistry[number],
): boolean => {
  if (!tab.id || tab.pinned || tab.discarded || tab.audible) return false;
  if (tab.active) return false;
  if (tab.autoDiscardable === false) return false; // Native whitelist support
  if (registryEntry?.isDirty) return false; // Form protection

  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    return false;
  }
  return true;
};
