function softSuspend() {
  // We can implement actual setInterval/rAF throttling here via script injection if needed,
  // but for now we rely on Chrome's native throttling which kicks in after 5 mins.
  // This acts as an immediate soft suspend signal for our own logic.
  console.log('MemPilot: Soft suspended tab (visibility hidden, no active media)');
}

function softResume() {
  console.log('MemPilot: Soft resumed tab');
}

document.addEventListener('visibilitychange', () => {
  const mediaElement = document.querySelector('audio, video') as HTMLMediaElement | null;
  const isMediaPlaying = mediaElement && !mediaElement.paused;

  if (document.visibilityState === 'hidden' && !isMediaPlaying) {
    softSuspend();
  } else if (document.visibilityState === 'visible') {
    softResume();
  }
});
