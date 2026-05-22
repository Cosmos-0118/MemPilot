import { STORAGE_KEYS } from '../../shared/constants/storage';
import { TRACKER_DOMAINS } from './domains';

export const initTrackerBlocker = async (): Promise<void> => {
  console.log('MemPilot: Tracker Blocker Initializing');

  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) {
    console.warn('MemPilot: declarativeNetRequest API not available');
    return;
  }

  try {
    const storageResult = await chrome.storage.local.get(STORAGE_KEYS.trackerBlocking);
    const isEnabled = storageResult[STORAGE_KEYS.trackerBlocking] !== false;

    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existingRules.map((rule: chrome.declarativeNetRequest.Rule) => rule.id);

    if (!isEnabled) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingIds,
        addRules: [],
      });
      console.log('MemPilot: Tracker Blocker is disabled. Cleared all blocking rules.');
      return;
    }

    const rules: chrome.declarativeNetRequest.Rule[] = TRACKER_DOMAINS.map((domain, index) => ({
      id: index + 1,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.BLOCK,
      },
      condition: {
        requestDomains: [domain],
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.SCRIPT,
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
          chrome.declarativeNetRequest.ResourceType.IMAGE,
        ],
      },
    }));

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds,
      addRules: rules,
    });

    console.log(
      `MemPilot: Loaded ${rules.length} tracker blocking rules across ${TRACKER_DOMAINS.length} domains`,
    );
  } catch (error) {
    console.error('MemPilot: Failed to update tracker rules', error);
  }
};

export const getBlockedDomainCount = (): number => TRACKER_DOMAINS.length;
