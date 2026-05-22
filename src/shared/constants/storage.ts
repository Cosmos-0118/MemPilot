export const STORAGE_KEYS = {
  hibernateState: 'mempilot-state',
  theme: 'mempilot-theme',
  trackerBlocking: 'tracker-blocking-enabled',
  webglEviction: 'webgl-eviction-enabled',
} as const;

export const ALARMS = {
  hibernateCheck: 'mempilot-check',
} as const;

export const HIBERNATE_DEFAULTS = {
  idleMinutes: 15,
  checkIntervalMinutes: 2,
  estimatedMbPerTab: 80,
} as const;
