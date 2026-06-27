let isPageDirty = false;

function onUserInteraction(): void {
  if (isPageDirty) return;
  isPageDirty = true;

  // Signal the service worker to block discard operations
  chrome.runtime.sendMessage({ type: 'UPDATE_TAB_STATE', isDirty: true });
}

document.addEventListener('input', onUserInteraction, { capture: true, passive: true });
document.addEventListener('change', onUserInteraction, { capture: true, passive: true });
