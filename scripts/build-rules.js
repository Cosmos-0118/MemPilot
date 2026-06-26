import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const URL_TRACKING = 'https://blocklistproject.github.io/Lists/tracking.txt';
const URL_ADS = 'https://blocklistproject.github.io/Lists/ads.txt';

const TRACKERS_PATH = path.resolve(__dirname, '../public/rules/easyprivacy_trackers.json');
const ANALYTICS_PATH = path.resolve(__dirname, '../public/rules/easyprivacy_analytics.json');

const fetchList = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
};

const parseDomains = (text) => {
  return text
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.startsWith('0.0.0.0'))
    .map(l => l.replace('0.0.0.0 ', '').trim());
};

const buildRules = (domains, startIndex) => {
  return domains.map((domain, i) => ({
    id: startIndex + i + 1,
    priority: 1,
    action: { type: 'block' },
    condition: {
      requestDomains: [domain],
      resourceTypes: ['script', 'xmlhttprequest', 'sub_frame', 'image', 'ping', 'other']
    }
  }));
};

const run = async () => {
  console.log('Downloading Blocklist Project lists...');
  
  const [trackingText, adsText] = await Promise.all([
    fetchList(URL_TRACKING),
    fetchList(URL_ADS)
  ]);
  
  const trackingDomains = parseDomains(trackingText);
  const adsDomains = parseDomains(adsText);

  console.log(`Parsed ${trackingDomains.length} tracking domains.`);
  console.log(`Parsed ${adsDomains.length} ads domains.`);

  const trackingRules = buildRules(trackingDomains, 0);
  const adsRules = buildRules(adsDomains, 500000); // Offset to avoid ID collisions

  fs.writeFileSync(TRACKERS_PATH, JSON.stringify(trackingRules, null, 2));
  fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(adsRules, null, 2));

  console.log(`Generated ${trackingRules.length} tracker rules.`);
  console.log(`Generated ${adsRules.length} analytics/ads rules.`);
};

run().catch(console.error);
