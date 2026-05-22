export interface HibernateState {
  tabLastActive: Record<number, number>;
  totalDiscarded: number;
  totalMemorySavedMB: number;
  idleTimeoutMinutes: number;
  isEnabled: boolean;
}
