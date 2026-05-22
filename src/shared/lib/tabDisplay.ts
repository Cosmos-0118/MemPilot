import type { TabInfo } from '../types/stats';

export const getDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export const sortTabsForDisplay = (tabs: TabInfo[]): TabInfo[] =>
  [...tabs].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.discarded !== b.discarded) return a.discarded ? 1 : -1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.lastActive ?? 0) - (a.lastActive ?? 0);
  });
