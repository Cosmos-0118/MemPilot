import { STORAGE_KEYS, HIBERNATE_DEFAULTS } from '../../shared/constants/storage';
import type { HibernateState } from './types';

const DEFAULT_STATE: HibernateState = {
  totalDiscarded: 0,
  totalMemorySavedMB: 0,
  idleTimeoutMinutes: HIBERNATE_DEFAULTS.idleMinutes,
  isEnabled: true,
};

export const loadState = async (): Promise<HibernateState> => {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.hibernateState);
    const stored = result[STORAGE_KEYS.hibernateState] as Partial<HibernateState> | undefined;
    if (stored && typeof stored === 'object') {
      return { ...DEFAULT_STATE, ...stored };
    }
  } catch (e) {
    console.warn('MemPilot: Failed to load state, using defaults', e);
  }
  return { ...DEFAULT_STATE };
};

export const saveState = async (state: HibernateState): Promise<void> => {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.hibernateState]: state });
  } catch (e) {
    console.warn('MemPilot: Failed to persist state', e);
  }
};

export const updateTabState = async (tabId: number, patch: Partial<import('./types').TabRegistry[number]>): Promise<void> => {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request(`tab-registry-${tabId}`, async () => {
      const data = await chrome.storage.session.get('tabRegistry');
      const registry = (data.tabRegistry || {}) as import('./types').TabRegistry;
      registry[tabId] = { ...registry[tabId], ...patch };
      await chrome.storage.session.set({ tabRegistry: registry });
    });
  } else {
    const data = await chrome.storage.session.get('tabRegistry');
    const registry = (data.tabRegistry || {}) as import('./types').TabRegistry;
    registry[tabId] = { ...registry[tabId], ...patch };
    await chrome.storage.session.set({ tabRegistry: registry });
  }
};

export const getTabRegistry = async (): Promise<import('./types').TabRegistry> => {
  const data = await chrome.storage.session.get('tabRegistry');
  return (data.tabRegistry || {}) as import('./types').TabRegistry;
};

export const deleteTabState = async (tabId: number): Promise<void> => {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request(`tab-registry-${tabId}`, async () => {
      const data = await chrome.storage.session.get('tabRegistry');
      const registry = (data.tabRegistry || {}) as import('./types').TabRegistry;
      delete registry[tabId];
      await chrome.storage.session.set({ tabRegistry: registry });
    });
  } else {
    const data = await chrome.storage.session.get('tabRegistry');
    const registry = (data.tabRegistry || {}) as import('./types').TabRegistry;
    delete registry[tabId];
    await chrome.storage.session.set({ tabRegistry: registry });
  }
};
