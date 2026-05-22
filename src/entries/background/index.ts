import { initTabHibernate } from '../../features/tab-hibernate';
import { initTrackerBlocker } from '../../features/tracker-blocker';

console.log('MemPilot: Background Service Worker Started');

initTabHibernate();
initTrackerBlocker();

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('MemPilot: Extension installed for the first time');
  } else if (details.reason === 'update') {
    console.log(`MemPilot: Extension updated to version ${chrome.runtime.getManifest().version}`);
  }
});
