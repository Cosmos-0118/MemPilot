import { STORAGE_KEYS, HIBERNATE_DEFAULTS } from '../../shared/constants/storage';
import type { HibernateState } from './types';

const DEFAULT_STATE: HibernateState = {
  tabLastActive: {},
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
