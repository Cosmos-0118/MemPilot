export interface TabInfo {
  id?: number;
  title: string;
  url: string;
  favIconUrl: string;
  discarded: boolean;
  active: boolean;
  pinned: boolean;
  audible?: boolean;
  lastActive?: number;
}

export interface PopupStats {
  activeTabs: number;
  discardedTabs: number;
  totalTabs: number;
  totalDiscarded: number;
  totalMemorySavedMB: number;
  currentlySleepingMB: number;
  blockedDomainCount: number;
  idleTimeoutMinutes: number;
  isEnabled: boolean;
  trackerBlockingEnabled: boolean;
  webglEvictionEnabled: boolean;
  tabs: TabInfo[];
}

export type PopupMessage =
  | { type: 'GET_STATS' }
  | { type: 'DISCARD_TAB'; tabId: number }
  | { type: 'DISCARD_ALL_INACTIVE' }
  | {
      type: 'SET_SETTINGS';
      idleTimeoutMinutes?: number;
      isEnabled?: boolean;
      trackerBlockingEnabled?: boolean;
      webglEvictionEnabled?: boolean;
    };
