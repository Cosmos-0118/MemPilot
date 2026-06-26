let isPageDirty = false;

function onUserInteraction(): void {
  if (isPageDirty) return;
  isPageDirty = true;

  // Signal the service worker to block discard operations
  chrome.runtime.sendMessage({ type: 'UPDATE_TAB_STATE', isDirty: true });

  // Bind unload block
  window.addEventListener('beforeunload', blockUnloadEvent);
}

function blockUnloadEvent(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = ''; // Required for legacy Chrome compatibility
}

document.addEventListener('input', onUserInteraction, { capture: true, passive: true });
document.addEventListener('change', onUserInteraction, { capture: true, passive: true });
