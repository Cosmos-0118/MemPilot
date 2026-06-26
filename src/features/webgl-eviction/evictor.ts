(() => {
  const trackedContexts: Array<{
    canvas: HTMLCanvasElement;
    ext: WEBGL_lose_context;
    wasLost: boolean;
  }> = [];

  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
    options?: WebGLContextAttributes,
  ): RenderingContext | null {
    const ctx = originalGetContext.call(this, contextId, options);

    if (ctx && (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl')) {
      const gl = ctx as WebGLRenderingContext | WebGL2RenderingContext;
      const ext = gl.getExtension('WEBGL_lose_context');

      if (ext) {
        const alreadyTracked = trackedContexts.some((tc) => tc.canvas === this);
        if (!alreadyTracked) {
          trackedContexts.push({
            canvas: this,
            ext,
            wasLost: false,
          });
        }
      }
    }

    return ctx;
  } as typeof HTMLCanvasElement.prototype.getContext;

  let isEvictionEnabled = true;

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('webgl-eviction-enabled', (result) => {
        if (!chrome.runtime.lastError && result['webgl-eviction-enabled'] !== undefined) {
          isEvictionEnabled = result['webgl-eviction-enabled'] !== false;
        }
      });

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes['webgl-eviction-enabled']) {
          isEvictionEnabled = changes['webgl-eviction-enabled'].newValue !== false;
          if (!isEvictionEnabled) {
            for (const entry of trackedContexts) {
              if (entry.wasLost) {
                try {
                  entry.canvas.style.backgroundImage = '';
                  entry.ext.restoreContext();
                  entry.wasLost = false;
                  console.log('MemPilot: Restored WebGL context dynamically (Eviction disabled).');
                } catch {
                  /* context may already be restored */
                }
              }
            }
          }
        }
      });
    }
  } catch {
    /* fail silently outside extension environment */
  }

  const canEvictOnPage = (): boolean => {
    try {
      const protocol = window.location.protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (!canEvictOnPage()) return;

    if (document.visibilityState === 'hidden') {
      if (!isEvictionEnabled) return;
      for (const entry of trackedContexts) {
        if (!entry.wasLost) {
          try {
            try {
              const dataUrl = entry.canvas.toDataURL('image/webp', 0.8);
              if (dataUrl && dataUrl.length > 50) {
                entry.canvas.style.backgroundImage = `url(${dataUrl})`;
                entry.canvas.style.backgroundSize = 'contain';
                entry.canvas.style.backgroundPosition = 'center';
                entry.canvas.style.backgroundRepeat = 'no-repeat';
              }
            } catch {
              // ignore toDataURL errors (tainted canvases)
            }
            entry.ext.loseContext();
            entry.wasLost = true;
            console.log('MemPilot: Evicted WebGL context from hidden tab to save VRAM.');
          } catch {
            /* context may already be lost or canvas removed from DOM */
          }
        }
      }
    } else if (document.visibilityState === 'visible') {
      for (const entry of trackedContexts) {
        if (entry.wasLost) {
          try {
            const onRestore = () => {
              entry.canvas.style.backgroundImage = '';
              entry.canvas.removeEventListener('webglcontextrestored', onRestore);
            };
            entry.canvas.addEventListener('webglcontextrestored', onRestore);
            
            entry.ext.restoreContext();
            entry.wasLost = false;
            console.log('MemPilot: Restored WebGL context in active tab.');
          } catch {
            /* restoration may fail if canvas was removed */
          }
        }
      }
    }
  });

  const observer = new MutationObserver(() => {
    for (let i = trackedContexts.length - 1; i >= 0; i--) {
      if (!document.contains(trackedContexts[i].canvas)) {
        trackedContexts.splice(i, 1);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  if ((document as unknown as { wasDiscarded?: boolean }).wasDiscarded) {
    document.addEventListener('DOMContentLoaded', () => {
      const indicator = document.createElement('div');
      indicator.textContent = 'MemPilot: Restored — scroll position kept';
      Object.assign(indicator.style, {
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '8px 12px',
        borderRadius: '6px',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        zIndex: '999999',
        pointerEvents: 'none',
        transition: 'opacity 0.5s',
      });
      document.body?.appendChild(indicator);
      setTimeout(() => { indicator.style.opacity = '0'; }, 3000);
      setTimeout(() => { indicator.remove(); }, 3500);
    });
  }
})();
