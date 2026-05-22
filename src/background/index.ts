import { initMemoryManager } from './memoryManager';
import { initTrackerBlocker } from './trackerBlocker';

console.log('MemPilot: Background Service Worker Started');

// Initialize all subsystems
initMemoryManager();
initTrackerBlocker();

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('MemPilot: Extension installed for the first time');
  } else if (details.reason === 'update') {
    console.log(`MemPilot: Extension updated to version ${chrome.runtime.getManifest().version}`);
  }
});
