// src/background/trackerBlocker.ts
// Preventative memory allocation blocking via declarativeNetRequest
// Uses proper requestDomains syntax (not adblock filter syntax)

const TRACKER_DOMAINS: string[] = [
  // Analytics & tracking
  'google-analytics.com',
  'googletagmanager.com',
  'googlesyndication.com',
  'googleadservices.com',
  'analytics.google.com',
  // Facebook
  'connect.facebook.net',
  'pixel.facebook.com',
  'graph.facebook.com',
  // Ad networks
  'doubleclick.net',
  'adnxs.com',
  'adsrvr.org',
  'ads-twitter.com',
  'amazon-adsystem.com',
  'criteo.com',
  'criteo.net',
  'outbrain.com',
  'taboola.com',
  'rubiconproject.com',
  // Session replay & heatmaps
  'hotjar.com',
  'fullstory.com',
  'mouseflow.com',
  'luckyorange.com',
  // Measurement
  'quantserve.com',
  'scorecardresearch.com',
  'newrelic.com',
  'nr-data.net',
  // Social trackers
  'platform.twitter.com',
  'platform.linkedin.com',
  'snap.licdn.com',
];

export const initTrackerBlocker = async (): Promise<void> => {
  console.log('MemPilot: Tracker Blocker Initializing');

  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) {
    console.warn('MemPilot: declarativeNetRequest API not available');
    return;
  }

  try {
    // Check if tracker blocking is enabled in storage
    const storageResult = await chrome.storage.local.get('tracker-blocking-enabled');
    const isEnabled = storageResult['tracker-blocking-enabled'] !== false;

    // Remove all existing dynamic rules first
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

    console.log(`MemPilot: Loaded ${rules.length} tracker blocking rules across ${TRACKER_DOMAINS.length} domains`);
  } catch (error) {
    console.error('MemPilot: Failed to update tracker rules', error);
  }
};

/** Get count of blocked domains for UI display */
export const getBlockedDomainCount = (): number => TRACKER_DOMAINS.length;
