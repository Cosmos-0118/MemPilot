import { isExtensionRuntime } from '../../shared/lib/favicon';
import type { PopupMessage, PopupStats } from '../../shared/types/stats';

export { isExtensionRuntime as isExtension };

export const sendPopupMessage = (message: PopupMessage): Promise<PopupStats | null> =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response: PopupStats) => {
        if (chrome.runtime.lastError) {
          console.warn('MemPilot:', chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch {
      resolve(null);
    }
  });
