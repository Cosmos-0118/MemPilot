export const isExtensionRuntime = (): boolean => {
  try {
    return typeof chrome !== 'undefined' && !!chrome?.runtime?.sendMessage;
  } catch {
    return false;
  }
};

/** Favicons from other extensions cannot load in our popup without web_accessible_resources. */
export const canLoadFaviconInPopup = (favIconUrl: string): boolean => {
  if (!favIconUrl) return false;
  try {
    const parsed = new URL(favIconUrl);
    if (parsed.protocol === 'chrome-extension:') {
      return isExtensionRuntime() && parsed.host === chrome.runtime.id;
    }
    if (parsed.protocol === 'chrome:') return false;
    return (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'data:'
    );
  } catch {
    return false;
  }
};
