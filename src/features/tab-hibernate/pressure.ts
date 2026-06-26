export type PressureTier = 'calm' | 'moderate' | 'critical';

export const getPressureTier = async (): Promise<PressureTier> => {
  if (typeof chrome !== 'undefined' && chrome.system && chrome.system.memory) {
    try {
      const { capacity, availableCapacity } = await chrome.system.memory.getInfo();
      const freeRatio = availableCapacity / capacity;
      if (freeRatio > 0.40) return 'calm';
      if (freeRatio > 0.15) return 'moderate';
      return 'critical';
    } catch (e) {
      console.warn('MemPilot: Failed to read system memory', e);
    }
  }
  return 'moderate'; // Default fallback
};
