// src/content/webglEvictor.ts
// Hybrid WebGL Eviction Engine
// Safely evicts GPU VRAM when tabs are hidden, restores when visible
// IMPORTANT: We do NOT call getContext() ourselves as that can interfere
// with existing contexts. Instead, we intercept context creation.

(() => {
  // Store references to WebGL contexts that were created on this page
  const trackedContexts: Array<{
    canvas: HTMLCanvasElement;
    ext: WEBGL_lose_context;
    wasLost: boolean;
  }> = [];

  // Intercept canvas.getContext to track WebGL contexts automatically
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
    options?: WebGLContextAttributes
  ): RenderingContext | null {
    const ctx = originalGetContext.call(this, contextId, options);

    if (ctx && (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl')) {
      const gl = ctx as WebGLRenderingContext | WebGL2RenderingContext;
      const ext = gl.getExtension('WEBGL_lose_context');

      if (ext) {
        // Check if we're already tracking this canvas
        const alreadyTracked = trackedContexts.some(tc => tc.canvas === this);
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

  // Load setting and listen for changes
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
          // If disabled, restore any lost contexts immediately
          if (!isEvictionEnabled) {
            for (const entry of trackedContexts) {
              if (entry.wasLost) {
                try {
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
    // Fail silently outside extension environment
  }

  const canEvictOnPage = (): boolean => {
    try {
      const protocol = window.location.protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  };

  // Listen for visibility changes
  document.addEventListener('visibilitychange', () => {
    if (!canEvictOnPage()) return;

    if (document.visibilityState === 'hidden') {
      if (!isEvictionEnabled) return;
      // Evict all tracked WebGL contexts
      for (const entry of trackedContexts) {
        if (!entry.wasLost) {
          try {
            entry.ext.loseContext();
            entry.wasLost = true;
            console.log('MemPilot: Evicted WebGL context from hidden tab to save VRAM.');
          } catch {
            // Context may already be lost or canvas removed from DOM
          }
        }
      }
    } else if (document.visibilityState === 'visible') {
      // Restore all evicted contexts
      for (const entry of trackedContexts) {
        if (entry.wasLost) {
          try {
            entry.ext.restoreContext();
            entry.wasLost = false;
            console.log('MemPilot: Restored WebGL context in active tab.');
          } catch {
            // Restoration may fail if canvas was removed
          }
        }
      }
    }
  });

  // Clean up entries when canvases are removed from DOM
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
})();
