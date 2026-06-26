export interface HibernateState {
  totalDiscarded: number;
  totalMemorySavedMB: number;
  idleTimeoutMinutes: number;
  isEnabled: boolean;
}

export interface TabRegistry {
  [tabId: number]: {
    lastActive: number;
    isDirty?: boolean;
    webglActive?: boolean;
  };
}
