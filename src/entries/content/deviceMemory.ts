if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
  const deviceMemory = (navigator as unknown as { deviceMemory: number }).deviceMemory;
  chrome.runtime.sendMessage({ type: 'SET_DEVICE_MEMORY', memory: deviceMemory });
}
