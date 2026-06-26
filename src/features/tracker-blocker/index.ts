import { STORAGE_KEYS } from '../../shared/constants/storage';

const STATIC_RULESET_IDS = ['easyprivacy_trackers', 'easyprivacy_analytics'];

export const initTrackerBlocker = async (): Promise<void> => {
  console.log('MemPilot: Tracker Blocker Initializing');

  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) {
    console.warn('MemPilot: declarativeNetRequest API not available');
    return;
  }

  try {
    const storageResult = await chrome.storage.local.get(STORAGE_KEYS.trackerBlocking);
    const isEnabled = storageResult[STORAGE_KEYS.trackerBlocking] !== false;

    // We no longer build dynamic rules based on domains.ts. Instead we enable/disable
    // pre-compiled static chunks defined in manifest.json.
    if (isEnabled) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: STATIC_RULESET_IDS,
        disableRulesetIds: [],
      });
      console.log('MemPilot: Enabled static tracker blocking rulesets.');
    } else {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: [],
        disableRulesetIds: STATIC_RULESET_IDS,
      });
      console.log('MemPilot: Disabled static tracker blocking rulesets.');
    }

    if (!chrome.declarativeNetRequest.onRuleMatchedDebug.hasListeners()) {
      chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(() => {
        // We know all our static rules are 'block' rules
        chrome.storage.local.get(STORAGE_KEYS.blockedTrackerCount, (res) => {
          const currentCount = (res[STORAGE_KEYS.blockedTrackerCount] as number) || 0;
          chrome.storage.local.set({ [STORAGE_KEYS.blockedTrackerCount]: currentCount + 1 });
        });
      });
    }
  } catch (error) {
    console.error('MemPilot: Failed to update tracker rules', error);
  }
};

export const getBlockedDomainCount = async (): Promise<number> => {
  try {
    const res = await chrome.storage.local.get(STORAGE_KEYS.blockedTrackerCount);
    return (res[STORAGE_KEYS.blockedTrackerCount] as number) || 0;
  } catch {
    return 0;
  }
};
