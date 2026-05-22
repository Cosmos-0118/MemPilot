export const IDLE_TIMEOUT_OPTIONS = [
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '60 minutes' },
] as const;

export type IdleTimeoutMinutes = (typeof IDLE_TIMEOUT_OPTIONS)[number]['value'];
