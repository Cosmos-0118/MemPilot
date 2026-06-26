# **System Architecture and Resource Optimization Blueprint for MemPilot**

The transition to Manifest V3 (MV3) within the Chromium extension ecosystem introduces significant structural boundaries for resource-optimization software1. Persistent background contexts have been replaced by transient, event-driven service workers that undergo aggressive dormancy lifecycles2. Designing client-side performance tools like MemPilot requires adapting to these execution constraints1. This report analyzes the technical challenges of resource management in modern browsers, focusing on persistent state management, intelligent tab hibernation, declarative net request implementations, and WebGL state restoration2.

## **Service Worker State Persistence and Inactivity Workarounds**

Under the MV3 runtime, background service workers are terminated by the browser after approximately 30 seconds of inactivity or when execution blocks exceed predefined thresholds5. Consequently, memory-allocated global variables or runtime caches are destroyed4. The persistence architecture must isolate transient states from long-term parameters using storage boundaries4.

### **Ephemeral Context Caching with Session Storage**

The standard browser storage APIs present different latency profiles9. For high-frequency metadata, such as the active timestamp of open tabs, the background worker uses chrome.storage.session5. This storage mechanism maintains data in volatile memory, avoiding disk write overheads5. It also enforces access policies across extension contexts, ensuring scripts have real-time visibility into the tab-state registry9.

TypeScript  
// Ephemeral tab tracking structure utilizing non-volatile session storage  
interface TabRegistry {  
  \[tabId: number\]: {  
    lastActive: number;  
    isDirty: boolean;  
    webglActive: boolean;  
  };  
}

async function updateTabState(tabId: number, patch: Partial\<TabRegistry\[number\]\>): Promise\<void\> {  
  const data \= await chrome.storage.session.get('tabRegistry');  
  const registry: TabRegistry \= data.tabRegistry || {};  
  registry\[tabId\] \= { ...registry\[tabId\], ...patch };  
  await chrome.storage.session.set({ tabRegistry: registry });  
}

### **Inactivity Timeout Mitigation**

For long-running background tasks, such as active WebSocket telemetry or coordinated tab synchronization, service worker termination can disrupt execution11. To maintain active background execution, a hybrid keepalive loop is required8:

1. **Scheduled Alarms**: Standard execution environments often rely on setInterval, which fails when the background worker is suspended2. Using the chrome.alarms API with a period of 24 seconds (![][image1] minutes) keeps the background context active7. When the alarm fires, executing a read or write operation to chrome.storage.session resets the browser's idle timer7.  
2. **Offscreen Document Heartbeat**: In scenarios requiring continuous background operation, the service worker can programmatically deploy a hidden document via the chrome.offscreen API4. This offscreen document runs in a full DOM context, allowing the use of setInterval to dispatch a message to the service worker every 20 seconds, maintaining active background execution14.

| Mitigation Approach | Implementation Interface | Persistence Lifetime | Overhead Cost | Native Platform Support |
| :---- | :---- | :---- | :---- | :---- |
| **Volatile Ephemeral Caching** | chrome.storage.session \[cite: 9, 10\] | Active browser session9 | Very Low5 | Native since Chrome 10210 |
| **Persistent Storage Sync** | chrome.storage.local \[cite: 9, 10\] | Extends until uninstalled9 | Medium (Disk writes)9 | Core extension API10 |
| **Scheduler Preservation** | chrome.alarms \[cite: 2, 5, 13\] | Persists across worker restarts5 | Low7 | Standardized since Chrome 1207 |
| **DOM Execution Bridge** | chrome.offscreen \[cite: 4, 14\] | Terminated dynamically4 | Medium (Separate page shell)4 | Stable since Chrome 10914 |

## **Advanced Tab Hibernation with Intelligent Form and State Protection**

Calling the native chrome.tabs.discard() API terminates the target tab's renderer process, reclaiming 90% to 95% of its occupied memory while leaving its tab strip indicator visible15. While this is highly effective, automated timers can cause data loss if they suspend tabs with unsaved user inputs or active processes16.

### **Multi-Signal Decision Logic**

To ensure smooth tab suspension, the service worker must evaluate several operational flags before calling chrome.tabs.discard(tabId)16:

* **Audible Media Verification**: Checked via the audible property of the tabs.Tab object to avoid disrupting active background audio16.  
* **Active Form Tracking**: Discarding a tab with partially filled forms can delete unsaved user input16.  
* **System Constraints**: The suspension engine should skip tabs with active file downloads, open screen-sharing sessions, or active WebUSB/WebBluetooth connections17.

### **Content-Script-Driven Interception of Unsaved Inputs**

Evaluating whether a tab contains unsaved form inputs requires page-level interaction monitoring19. This is handled by a content script injected at document\_start4. This script targets input fields, textareas, and select menus by binding listeners to input, change, and keyup events19.  
When a user modifies a field, the content script marks the tab as containing unsaved work19. This state is sent to the service worker to update its tracking registry in chrome.storage.session11. Additionally, the script dynamically registers a beforeunload event listener on the window object21. Because Chrome's tab discarding respects active page unload blocks, registering a beforeunload listener that calls event.preventDefault() creates a native barrier that protects the tab from unintended suspension21.

TypeScript  
// Content script tracking page state and preventing background discards  
let isPageDirty \= false;

function onUserInteraction(): void {  
  if (isPageDirty) return;  
  isPageDirty \= true;

  // Signal the service worker to block discard operations  
  chrome.runtime.sendMessage({ type: 'UPDATE\_TAB\_STATE', isDirty: true });

  // Bind unload block  
  window.addEventListener('beforeunload', blockUnloadEvent);  
}

function blockUnloadEvent(event: BeforeUnloadEvent): void {  
  event.preventDefault();  
  event.returnValue \= ''; // Required for legacy Chrome compatibility  
}

document.addEventListener('input', onUserInteraction, { capture: true, passive: true });

Once a form is submitted or cleared, the script resets the dirty flag and removes the beforeunload listener to allow safe hibernation19.

## **Scalable Declarative Net Request Network Filtering**

The replacement of the blocking webRequest API with the declarative declarativeNetRequest (DNR) model shifts request filtering to the browser kernel2. This architecture eliminates JavaScript execution overhead on each HTTP request but enforces strict limits on dynamic rules2.

### **Managing Rule Limits under Manifest V3**

The engine allocates distinct rule budgets across extensions23:

* **Static Rulesets**: Specified in the manifest under the declarative\_net\_request key, up to MAX\_NUMBER\_OF\_STATIC\_RULESETS (typically 10 rulesets)25. The total enabled static rules cannot exceed the global limit, which extensions query via getAvailableStaticRuleCount()23.  
* **Dynamic Rulesets**: Added or removed at runtime via updateDynamicRules(), capped at MAX\_NUMBER\_OF\_DYNAMIC\_RULES (typically 5,000 rules)25.  
* **Session Rulesets**: Configured via updateSessionRules(), which do not persist across browser restarts23.

To support comprehensive privacy filter lists like EasyPrivacy without exceeding these limits, MemPilot must use a pre-compiled static chunking strategy26:

1. **Rule Compilation**: Using compilation packages (e.g., @eyeo/abp2dnr or @adguard/tsurlfilter) during development, raw EasyPrivacy rules are compiled into structured DNR ruleset JSON files31.  
2. **Chunking and Partitioning**: The compiled rules are split into multiple static ruleset blocks (e.g., easyprivacy\_core.json, easyprivacy\_trackers.json, easyprivacy\_analytics.json), each limited to 10,000 rules27.  
3. **Dynamic Orchestration**: At runtime, the background service worker evaluates the user's configuration and calls chrome.declarativeNetRequest.updateEnabledRulesets to enable or disable these pre-compiled static chunks, preserving the dynamic rule quota for user-defined custom domains and whitelists23.

JSON  
{  
  "manifest\_version": 3,  
  "name": "MemPilot Engine",  
  "version": "1.1.0",  
  "permissions": \[  
    "declarativeNetRequest",  
    "declarativeNetRequestFeedback",  
    "storage"  
  \],  
  "declarative\_net\_request": {  
    "rule\_resources": \[  
      {  
        "id": "easyprivacy\_trackers",  
        "enabled": true,  
        "path": "rules/easyprivacy\_trackers.json"  
      },  
      {  
        "id": "easyprivacy\_analytics",  
        "enabled": false,  
        "path": "rules/easyprivacy\_analytics.json"  
      }  
    \]  
  }  
}

## **Proactive WebGL VRAM Eviction and Visual State Reconstruction**

WebGL execution environments often consume substantial system VRAM33. While Chrome's native memory management can discard background tabs, its reactive model often waits until system resources are critically low, which can cause GPU resets or context crashes35. Programmatic eviction of WebGL contexts when tabs go to the background offers a proactive way to reclaim VRAM37.

### **Context Interception and Eviction Mechanics**

The eviction script runs in the document context to intercept and store active rendering contexts39:

JavaScript  
// Interception layer injected on document\_start  
const activeWebGLContexts \= new Set();

HTMLCanvasElement.prototype.getContext \= (function(originalGetContext) {  
  return function(type, attributes) {  
    const context \= originalGetContext.apply(this, arguments);  
    if ((type \=== 'webgl' || type \=== 'webgl2') && context) {  
      activeWebGLContexts.add(context);  
      // Initialize the debugging extension explicitly  
      context.getExtension('WEBGL\_lose\_context');  
    }  
    return context;  
  };  
})(HTMLCanvasElement.prototype.getContext);

When the page visibility transitions to hidden, the script calls the loseContext() method on each registered context20. This immediately releases GPU allocations and system VRAM37.

### **Challenges in Restoration Recovery**

Rebuilding WebGL structures upon foreground restoration can be complex42. Libraries such as Three.js or Babylon.js often expect WebGL contexts to remain stable42. Simply calling restoreContext() can cause errors if the rendering library tries to draw before the GPU process reinitializes42. To prevent crashes, the eviction script must:

1. **Defer Drawing Operations**: Monitor and pause the parent application's requestAnimationFrame loop when the context is lost41.  
2. **Handle Event Ordering**: Wait for the browser to dispatch the native webglcontextrestored event before allowing the application to resume drawing41.  
3. **Rebuild WebGL Resources**: Recompile shaders, rebuild vertex buffer objects, and re-upload textures once the context is restored43.

### **Bypassing Visual Corruption via State Snapshot Placeholders**

A common issue with WebGL eviction is that the canvas may display a black box, a blank screen, or a broken layout while the context is lost43. To maintain a seamless visual experience, MemPilot can implement a fallback snapshot mechanism43:

1. **Preserve Drawing Buffer**: WebGL contexts must be initialized with preserveDrawingBuffer: true so the canvas contents remain readable34.  
2. **Snapshot Capture**: Immediately before calling loseContext(), the script captures the current canvas view using canvas.toDataURL('image/webp', 0.8)43.  
3. **Placeholder Replacement**: This static image is applied as a CSS background style on the canvas element, and the actual WebGL rendering context is evicted43.  
4. **Transition on Focus**: When the user returns to the tab, the static placeholder is displayed while the WebGL context is restored in the background47. Once the webglcontextrestored event fires and the first active frame renders, the placeholder background is removed, creating a seamless transition41.

## **Non-Invasive Memory Performance Diagnostics and Heuristic Analytics**

Programmatic monitoring of exact tab-level memory consumption is limited by browser sandboxing49. The chrome.processes API is restricted to the Developer channel and cannot be used in production Web Store builds50, while the newer web-standard performance.measureUserAgentSpecificMemory() requires strict COOP/COEP isolation headers, preventing its use on arbitrary websites51. To display resource savings in the popup UI, MemPilot must use a deterministic estimation heuristic53.

### **Mathematical Base Optimization Estimation**

The estimation engine categorizes tabs into distinct resource classes based on structural properties detected by the content scripts, using base allocation models derived from browser benchmarks49.  
The total estimated memory saved across all discarded tabs, denoted as ![][image2], is calculated using the following model:  
![][image3]  
Where:

* ![][image4] is the total number of discarded tabs.  
* ![][image5] is the empirical percentage of RAM recovered when discarding a tab (modeled as ![][image6], representing a ![][image7] average reduction)15.  
* ![][image8] is the estimated baseline memory footprint of the tab before suspension, determined by its resource profile:

![][image9]  
Where:

* ![][image10] is the base page memory overhead (assigned as ![][image11] for basic document structures)49.  
* ![][image12] is the total number of script resources loaded on the page, weighted by ![][image13] per script.  
* ![][image14] is a binary flag (![][image15] or ![][image16]) indicating the presence of an active WebGL context, weighted by ![][image17] to account for the associated GPU process memory.

If the tab is identified as a heavy Single-Page Application (such as a collaborative editor or dashboard), ![][image10] is dynamically adjusted to ![][image18]49.

## **Integrated System Metrics and Feature Capability Matrix**

To compare the resource utilization impact of the proposed design modifications, the performance metrics of the various components are compiled below.

| System Component | Resource Tracking Interface | Active RAM Allocation | Suspended RAM Allocation | Eviction Reclaim Metric |
| :---- | :---- | :---- | :---- | :---- |
| **Volatile System Base** | chrome.storage.session \[cite: 9, 10\] | ![][image19] | ![][image20] | ![][image21] (Volatile cache flush) |
| **Static Document Tab** | Dynamic Page Profile49 | ![][image22] \[cite: 49\] | ![][image23] \[cite: 15, 16\] | ![][image24] Reclaimed15 |
| **Rich Media Base** | Dynamic Page Profile | ![][image25] | ![][image26] | ![][image27] Reclaimed |
| **Complex SPA Context** | Dynamic Page Profile49 | ![][image28] \[cite: 49\] | ![][image29] | ![][image30] Reclaimed |
| **WebGL Graphics Tab** | Canvas Prototype Hook39 | ![][image31] \[cite: 49\] | ![][image32] | ![][image33] (VRAM \+ RAM released)37 |

## **Advanced Feature Optimization Blueprints**

To enhance MemPilot's capabilities, several advanced features can be integrated directly into the system architecture:

### **1\. Smart Tab Deduplication with Contextual Redirection**

Opening duplicate tabs of already-open websites is a common cause of memory bloat55. MemPilot can implement a preventive optimization layer that monitors tab creation and navigation events55:

* **Interceptive Verification**: When a user attempts to navigate to a URL, the background worker matches the target domain and path against all currently open tabs before the page loads55.  
* **Contextual Redirection Prompt**: If a duplicate is detected, the extension injects a lightweight, non-intrusive prompt overlay into the tab55. The overlay asks if the user wants to redirect to the existing active tab or continue opening the page in the current tab55.  
* **Preemptive Closure**: If the user chooses to redirect, the extension switches focus to the existing tab and closes the duplicate before its renderer process fully initializes, preventing unnecessary RAM and CPU usage55.

User Navigates to URL  
         │  
         ▼  
Service Worker checks active Tab Registry  
         │  
         ├──► \[URL is Unique\] ──────► ALLOW NORMAL LOAD  
         │  
         └──► \[URL is Duplicate\] ───► INJECT REDIRECTION OVERLAY  
                                               │  
               ┌───────────────────────────────┴───────────────────────────────┐  
               ▼                                                               ▼  
     \[User clicks "Switch"\]                                         \[User clicks "Stay"\]  
               │                                                               │  
               ├─► Focus existing Tab                                          └─► Dismiss Overlay  
               └─► Close duplicate Tab before full load                            and complete load

### **2\. Adaptive VRAM Management for Tab Hover Previews**

Modern Chromium-based browsers display live visual preview cards when hovering over background tabs57. Generating these previews often forces suspended tabs to wake up temporarily to capture a snapshot, which can cause sudden spikes in CPU and VRAM usage57.  
MemPilot can address this issue by managing background canvas states:

* **Hover State Overrides**: The content script monitors canvas visibility changes and intercepts drawing requests during hover-triggered snapshots57.  
* **Throttled Preview Updates**: Background WebGL canvases are restricted from executing full rendering passes for hover previews until a dwell threshold is crossed (e.g., hovering for more than 1.5 seconds)57.  
* **Fallback Image Previews**: Instead of waking up the WebGL context, the extension provides the cached static snapshot captured during eviction, satisfying the preview request without reloading the GPU context43.

### **3\. WebMCP-Compliant Local Automation Interface**

The emergence of local AI tools within the browser ecosystem has led to the development of WebMCP (Web Model Control Protocol) standards59. Integrating a WebMCP-compliant JSON schema into MemPilot's service worker allows external local models to inspect and configure browser performance settings59:

* **Diagnostic Access**: The service worker exposes a structured schema that allows authorized local agents to query the system state, including active tab profiles, whitelisted domains, and heuristic performance metrics59.  
* **Model-Driven Optimization**: Local models can programmatically trigger targeted tab hibernations, update exception lists, or adjust performance thresholds based on overall system resource pressure, integrating MemPilot into automated client-side resource management workflows59.

## **Implementation Roadmap**

To execute these updates systematically, developers should prioritize the following engineering steps:

### **Phase 1: Storage and Keepalive Stabilization**

1. Migrate the background service worker's runtime state tracking from memory-bound global variables to chrome.storage.session4.  
2. Implement a background keepalive alarm set to a 24-second interval8.  
3. Add a background state rehydration handler to rebuild the active tracking registry when the service worker wakes up4.

### **Phase 2: Form Protection and Validation**

1. Inject the form state tracking content script at document\_start across all matching pages4.  
2. Bind input-level listener handlers to track modifications, and use message passing to sync the dirty state with chrome.storage.session11.  
3. Configure the service worker's discard routine to skip tabs marked as dirty or containing unsaved work16.

### **Phase 3: Declarative Net Request Optimization**

1. Compile the EasyPrivacy filter rules into JSON formats matching the declarativeNetRequest rule schema31.  
2. Split the compiled rules into multiple static rulesets in the extension manifest27.  
3. Programmatically enable or disable rulesets using chrome.declarativeNetRequest.updateEnabledRulesets based on user settings, keeping the dynamic rule budget open for custom rules23.

### **Phase 4: WebGL Eviction and Visual Placeholders**

1. Override HTMLCanvasElement.prototype.getContext via content scripts to track and register active contexts39.  
2. Implement visibility event listeners to trigger loseContext() on hidden canvases38.  
3. Add the canvas snapshot placeholder fallback to store the last visual frame before eviction and display it as a static CSS background43. Clear the placeholder when the context is restored and rendering resumes41.

#### **Works cited**

1. Chrome Extension V3: Mitigate service worker timeout issue in the easiest way \- Medium, [https://medium.com/@bhuvan.gandhi/chrome-extension-v3-mitigate-service-worker-timeout-issue-in-the-easiest-way-fccc01877abd](https://medium.com/@bhuvan.gandhi/chrome-extension-v3-mitigate-service-worker-timeout-issue-in-the-easiest-way-fccc01877abd)  
2. Chrome Extension Manifest V3 Explained \- OpenReplay Blog, [https://blog.openreplay.com/chrome-extension-manifest-v3/](https://blog.openreplay.com/chrome-extension-manifest-v3/)  
3. background \- MDN Web Docs \- Mozilla, [https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)  
4. Chrome Manifest V3 Migration Guide \- onHover, [https://onhover.in/blog/chrome-extension-manifest-v3-guide](https://onhover.in/blog/chrome-extension-manifest-v3-guide)  
5. mv3 service workers are actually going to be the death of me : r/chrome\_extensions \- Reddit, [https://www.reddit.com/r/chrome\_extensions/comments/1sn48u1/mv3\_service\_workers\_are\_actually\_going\_to\_be\_the/](https://www.reddit.com/r/chrome_extensions/comments/1sn48u1/mv3_service_workers_are_actually_going_to_be_the/)  
6. How Multiple Tab Handler Manages Browser Tab Overload \- LifeTips \- Alibaba.com, [https://lifetips.alibaba.com/tech-efficiency/multiple-tab-handler-manages-browser-tab-overload](https://lifetips.alibaba.com/tech-efficiency/multiple-tab-handler-manages-browser-tab-overload)  
7. The extension service worker lifecycle \- Chrome for Developers, [https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)  
8. OpenClaw Chrome Extension Relay — Disconnect Fix (patches background.js) · GitHub, [https://gist.github.com/DgenKing/9b7d505c9794ae9bac2bdd915915e0a7](https://gist.github.com/DgenKing/9b7d505c9794ae9bac2bdd915915e0a7)  
9. chrome.storage | API \- Chrome for Developers, [https://developer.chrome.com/docs/extensions/reference/api/storage](https://developer.chrome.com/docs/extensions/reference/api/storage)  
10. chrome.storage | Reference \- Chrome for Developers, [https://developer.chrome.com/docs/extensions/mv2/reference/storage](https://developer.chrome.com/docs/extensions/mv2/reference/storage)  
11. Chrome extension: MV3 service worker dies after idle, relay drops silently \#21780 \- GitHub, [https://github.com/openclaw/openclaw/issues/21780](https://github.com/openclaw/openclaw/issues/21780)  
12. macOS \+ Brave: extension relay oscillates between attached and 'tab not found' / 20s timeouts (2026.2.6-3) \#12488 \- GitHub, [https://github.com/openclaw/openclaw/issues/12488](https://github.com/openclaw/openclaw/issues/12488)  
13. Migrate to a service worker \- Chrome for Developers, [https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)  
14. Persistent Service worker in Manifest V3 extension \- GitHub, [https://github.com/mad1ost/persistent-service-worker](https://github.com/mad1ost/persistent-service-worker)  
15. How to Auto-Close Chrome Tabs (Suspension Is Better) \- SuperchargeBrowser, [https://www.superchargebrowser.com/library/auto-close-inactive-chrome-tabs/](https://www.superchargebrowser.com/library/auto-close-inactive-chrome-tabs/)  
16. Tab Suspender Chrome Extensions: 6 Options Compared (2026) \- SuperchargeBrowser, [https://www.superchargebrowser.com/library/best-tab-suspender-extensions-chrome-2026/](https://www.superchargebrowser.com/library/best-tab-suspender-extensions-chrome-2026/)  
17. Personalize Chrome performance \- Google Help, [https://support.google.com/chrome/answer/12929150?hl=en](https://support.google.com/chrome/answer/12929150?hl=en)  
18. Auto Tab Discard (suspend) \- Chrome Web Store, [https://chromewebstore.google.com/detail/auto-tab-discard-suspend/jhnleheckmknfcgijgkadoemagpecfol](https://chromewebstore.google.com/detail/auto-tab-discard-suspend/jhnleheckmknfcgijgkadoemagpecfol)  
19. Detect if a form has unsaved changes before letting user focus to a different form, [https://stackoverflow.com/questions/39801363/detect-if-a-form-has-unsaved-changes-before-letting-user-focus-to-a-different-fo](https://stackoverflow.com/questions/39801363/detect-if-a-form-has-unsaved-changes-before-letting-user-focus-to-a-different-fo)  
20. Chrome browser: How to find tabs with unsaved changes \- Super User, [https://superuser.com/questions/1766193/chrome-browser-how-to-find-tabs-with-unsaved-changes](https://superuser.com/questions/1766193/chrome-browser-how-to-find-tabs-with-unsaved-changes)  
21. How to Trigger "Unsaved Changes" Alert in Your Web App to prevent Data Loss, [https://douiri.org/blog/unsaved-changes-alert/](https://douiri.org/blog/unsaved-changes-alert/)  
22. Unsaved Changes \- Detect page exit or reload \- Vaadin Forum, [https://vaadin.com/forum/t/unsaved-changes-detect-page-exit-or-reload/158419](https://vaadin.com/forum/t/unsaved-changes-detect-page-exit-or-reload/158419)  
23. chrome.declarativeNetRequest | API \- Chrome for Developers, [https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)  
24. Manifest V3: Web Request Changes \- Google Groups, [https://groups.google.com/a/chromium.org/g/chromium-extensions/c/veJy9uAwS00/m/OhNG9uaoGgAJ](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/veJy9uAwS00/m/OhNG9uaoGgAJ)  
25. chrome.declarativeNetRequest \- Google Chrome \- GitHub Pages, [https://sunnyzhou-1024.github.io/chrome-extension-docs/extensions/declarativeNetRequest.html](https://sunnyzhou-1024.github.io/chrome-extension-docs/extensions/declarativeNetRequest.html)  
26. Declarative Net Request: Introduce a global rule limit \[40635759\] \- Chromium, [https://issues.chromium.org/40635759](https://issues.chromium.org/40635759)  
27. declarative\_net\_request \- Mozilla \- MDN Web Docs, [https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/declarative\_net\_request](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/declarative_net_request)  
28. chrome.declarativeNetRequest \- Chrome Developers, [https://chrome.jscn.org/docs/extensions/reference/declarativeNetRequest](https://chrome.jscn.org/docs/extensions/reference/declarativeNetRequest)  
29. declarativeNetRequest \- Mozilla \- MDN Web Docs, [https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest)  
30. Declarative Net Request API —. Explained Like a Snack\! | by Tanvi Dadwal | Medium, [https://medium.com/@tanvidadwal799/declarative-net-request-api-cheat-sheet-c29ed3a4ce6a](https://medium.com/@tanvidadwal799/declarative-net-request-api-cheat-sheet-c29ed3a4ce6a)  
31. eyeo / adblockplus / abc / abp2dnr \- GitLab, [https://gitlab.com/eyeo/adblockplus/abc/abp2dnr](https://gitlab.com/eyeo/adblockplus/abc/abp2dnr)  
32. ghostery/urlfilter2dnr \- GitHub, [https://github.com/ghostery/urlfilter2dnr](https://github.com/ghostery/urlfilter2dnr)  
33. three.js \- WebGL scene does't render because of lost context \- Stack Overflow, [https://stackoverflow.com/questions/25219352/webgl-scene-doest-render-because-of-lost-context](https://stackoverflow.com/questions/25219352/webgl-scene-doest-render-because-of-lost-context)  
34. THREE.WebGLRenderer: Context Lost \- Stack Overflow, [https://stackoverflow.com/questions/70283197/three-webglrenderer-context-lost](https://stackoverflow.com/questions/70283197/three-webglrenderer-context-lost)  
35. Chrome does not recover from running out of vram with WebGL \[40616701\] \- Chromium, [https://issues.chromium.org/40616701](https://issues.chromium.org/40616701)  
36. Chrome's Memory Saver is underwhelming — this free extension does what it should have done \- MakeUseOf, [https://www.makeuseof.com/chrome-memory-saver-underwhelming-free-extension-does-what-it-should-have-done/](https://www.makeuseof.com/chrome-memory-saver-underwhelming-free-extension-does-what-it-should-have-done/)  
37. WebGL Context Lost in Chrome? 5 TESTED Fixes (2026) \- SuperchargeBrowser, [https://www.superchargebrowser.com/library/fix-chrome-webgl-context-lost/](https://www.superchargebrowser.com/library/fix-chrome-webgl-context-lost/)  
38. WEBGL\_lose\_context: loseContext() method \- Web APIs | MDN, [https://developer.mozilla.org/en-US/docs/Web/API/WEBGL\_lose\_context/loseContext](https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_lose_context/loseContext)  
39. 精通-jQuery-全- \- 绝不原创的飞龙- 博客园, [https://www.cnblogs.com/apachecn/p/18200700](https://www.cnblogs.com/apachecn/p/18200700)  
40. javascript \- Proper way to detect WebGL support? \- Stack Overflow, [https://stackoverflow.com/questions/11871077/proper-way-to-detect-webgl-support](https://stackoverflow.com/questions/11871077/proper-way-to-detect-webgl-support)  
41. HandlingContextLost \- WebGL Public Wiki, [https://wikis.khronos.org/webgl/HandlingContextLost](https://wikis.khronos.org/webgl/HandlingContextLost)  
42. Unable to create VAO on context lost with active frustum culling \- Bugs \- Babylon.js Forum, [https://forum.babylonjs.com/t/unable-to-create-vao-on-context-lost-with-active-frustum-culling/48968](https://forum.babylonjs.com/t/unable-to-create-vao-on-context-lost-with-active-frustum-culling/48968)  
43. Non-Intrusive WebGL. Part 1: Context Loss & Preloading | by Matt DesLauriers | Medium, [https://medium.com/@mattdesl/non-intrusive-webgl-cebd176c281d](https://medium.com/@mattdesl/non-intrusive-webgl-cebd176c281d)  
44. Canvas losing context more and more often \- Questions \- Babylon.js Forum, [https://forum.babylonjs.com/t/canvas-losing-context-more-and-more-often/19325](https://forum.babylonjs.com/t/canvas-losing-context-more-and-more-often/19325)  
45. Webgl context lost, how to restore lost context \- Unity Engine \- Unity Discussions, [https://discussions.unity.com/t/webgl-context-lost-how-to-restore-lost-context/669259](https://discussions.unity.com/t/webgl-context-lost-how-to-restore-lost-context/669259)  
46. Auto-closing inactive tabs · zen-browser desktop · Discussion \#5414 \- GitHub, [https://github.com/zen-browser/desktop/discussions/5414](https://github.com/zen-browser/desktop/discussions/5414)  
47. Sleeping tabs FAQ | Microsoft Community Hub, [https://techcommunity.microsoft.com/discussions/edgeinsiderannouncements/sleeping-tabs-faq/1705434](https://techcommunity.microsoft.com/discussions/edgeinsiderannouncements/sleeping-tabs-faq/1705434)  
48. I installed "Auto Tab Discard" and Chrome is so much faster on my laptop now \- MakeUseOf, [https://www.makeuseof.com/auto-tab-discard-chrome-much-faster-laptop/](https://www.makeuseof.com/auto-tab-discard-chrome-much-faster-laptop/)  
49. Chrome Using Too Much Memory? Fix High RAM Usage in Minutes \- Syncro, [https://syncrosecure.com/blog/chrome-using-too-much-memory/](https://syncrosecure.com/blog/chrome-using-too-much-memory/)  
50. API reference \- Chrome for Developers, [https://developer.chrome.com/docs/extensions/reference/api](https://developer.chrome.com/docs/extensions/reference/api)  
51. Performance: memory property \- Web APIs \- MDN Web Docs, [https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory)  
52. WICG/performance-measure-memory: performance.measureMemory API \- GitHub, [https://github.com/WICG/performance-measure-memory](https://github.com/WICG/performance-measure-memory)  
53. Tab Memory Usage \- MyBrowserAddon, [https://mybrowseraddon.com/tab-memory.html](https://mybrowseraddon.com/tab-memory.html)  
54. How to find memory used by a chrome tab using javascript \- Stack Overflow, [https://stackoverflow.com/questions/36382135/how-to-find-memory-used-by-a-chrome-tab-using-javascript](https://stackoverflow.com/questions/36382135/how-to-find-memory-used-by-a-chrome-tab-using-javascript)  
55. Tab Deduplication — No More Duplicate Tabs \- SuperchargeBrowser, [https://www.superchargebrowser.com/features/tab-deduplication/](https://www.superchargebrowser.com/features/tab-deduplication/)  
56. kylelibra/de-dupper: A Chrome extension to de-duplicate tabs \- GitHub, [https://github.com/kylelibra/de-dupper](https://github.com/kylelibra/de-dupper)  
57. Auto Tab Discard \- WebExtension.ORG, [https://webextension.org/listing/tab-discard.html](https://webextension.org/listing/tab-discard.html)  
58. Page Keep-Alive \- Chrome Web Store, [https://chromewebstore.google.com/detail/page-keep-alive/lkballmgonbgdmmhmgjljfeobibajocm](https://chromewebstore.google.com/detail/page-keep-alive/lkballmgonbgdmmhmgjljfeobibajocm)  
59. Discover Chrome \- Chrome for Developers, [https://developer.chrome.com/discover](https://developer.chrome.com/discover)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAYCAYAAADkgu3FAAABIklEQVR4Xu2TsU4CURBFBxtC6LSkt4MQGkM0NHR2AtoQkAoSCkJtySfwE4QfsLC1hN7OBiiMhYbESENwJjNrHtd9y8bOuCe52Z0zbzNLdiBK+EtkOQ+cHWfGSe23Y7Pm1FEG5EgHZKw+sfro+0Q8eqTPeQd9cKbg5pwNuEO80oFB0rwBd2c+Lu929Q6qkDYvwN+aPwYfRpvTsXvvoCFpswT+2vwZ+DBkAQK8g0akzQL4K/NN8MgL7W+od1CXtFkE3zBfBe9yyRmA8w4KvlEZfMu8rL6PTxQUMShN2vzN1j1C5C8hzzxZ/QNpjsHdm3eR4VGcUsQvEsLeXuqaU7+Z6zsOOSc9I9/dy4SztasclrV3yXOewbnIi6w4C87S6oSE/8AXXYhLbq5pqXQAAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAAZCAYAAABkdu2NAAACHUlEQVR4Xu2WTUhVQRTHj7kxCkREWpSrdJPhRmzXOqi2rQQXkQlGtIhACTFw0yLaBu0qKigIBEEoglbapkDEVSRYWuRHSlnZB9T/z5xpzjvvvqTg9a5wf/BjZs6ZO2/mzcx9T6SgoCBPjMAN+FN9VpouY15SXz53vjSdX+KkaSU64bCEPl0ul3sWJO1kJV7DSflzn1xyFJ6C41J58g+03GqXc8lTLXmfsia/G57VOvP3TW5bEBfFe8X6PpMjm1oekZA/YHLbgkVT5wJ6Tfsc3KV17nTWDuca7spp0+YCbpi2PY61vn9P5B8+P96/CAfg25K8sQkJuXsu9r/56wX6B+IuHYYHTfyYxjtMrBb4+W7JO9dekTDICxfnPxw/eB18CfvgZ9im8SV4RsIYLMkOSV/emMbskW+B7+ElOKMx0g6/wJvwqpTPoSJxcvzrZbkr2YPYyUSuwUNab5S0wB9aEv+Mbb8ydRufgj2w3sWJb2dyBa7DVfhRSid0HJ4w7U+S+n6A3+GQ5pokLfyWxiIX4XPNWfilntT6oJb7JfTj3adr8A68IOknKuLHqyp7tOTvIo/2qKRFN2jOT2ivxuybm+P4fuQy/OZiWf2qxm0Jx4jshNcl3JO53z3ShLpd7K1pE56MZtMekHCN7IJaXbvq8BjRR1I64VkJL4oJ2A+XTY7wivDl4Xks4Yg+NDG+tb/CaQn/meOVKCgoKKgNvwBHopNg4PeHswAAAABJRU5ErkJggg==>

[image3]: <data:image/png;base64,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>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAAZCAYAAADTyxWqAAAA3klEQVR4XmNgGAWUgnlA/BmI/0PxAhRZCPjLgJAHYWdUaUyArBgb2AfEKuiC2AAjEG8H4vUMEMOCUKXBAJclGCAfiE2gbFyu+4MugAu8RWJ/YIAYxockpgbEnUh8vADZJaBwAfFvIoktA2IeJD5OAAqvzWhi6F7F5m2sADm8kMVABnRD+b+Q5PCCd+gCUABznTYQt6DJ4QS4vLCbASJ3D4g50eSwAhYg3osuCAVMDJhhhxMwA/EbID6JLoEEvgHxD3RBdLAKiD8yQNIXKF2B8h42oA/E2eiCo2AU0BsAAOZXNN6XnT8LAAAAAElFTkSuQmCC>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAD8AAAAYCAYAAABN9iVRAAAB+UlEQVR4Xu2XzytEURTHjx/5FcnKipUsZMvCXyCSnT+AZGHBwkJkxUIJC6GkhNiRnQUbWYkUouRHk0j5UX6UIuJ7Ovc2Z+6MmTfJLN68T31699xzu++ed+fN3CEKCAhweIf5bmc60Ae/4Y2bSAe4cGuOk/M13XAQDpAUfxmZ9jdcsG6zWarPt7TBERUPkxR/rPp8i951i919X9MCJ91OMEFS/I6b8BPxdtfL7i9Q5JhW+KTiVNBLsoYGNxGPejjvdirmSCbddBMOuvhqOKriVLFPSRafaFcZL7ufKJ8K9iiJ4uvgitsZg1WS4vTYDJJj8CzJE9fF64fF4y5gO3yDFaafD1A8Zgh+UPgn9Q52wjNztfDYL5K59L124Ro8hyeURPF2kclo4XauE2tsPA1rTbuYwsVz3v5/uIJlpv1prky8ORkuvMO0mWvyWHw5RRfmxXGS3fxtYW5cYtrsoukrUvlY9FP0p4lJFIfIY/F/oZCib/xbXGquVfCB5PhcoPIa+6DyTOyOiRVnqjgEG1X8b/CNuQgda2y8ROH3mT/mM6bN+UrTZnrgGEX+n7Bz1Dix5RB2qfgFNqv438iGr3ADTpEszC7uGT6SfCEuG3ncrclbDkh2S/+M8nH6CK6TvM/3pp/PDTwn31OzBbfhKclcvIYmPSAgICC9+QGtjaHQOfIlgAAAAABJRU5ErkJggg==>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACUAAAAYCAYAAAB9ejRwAAABs0lEQVR4Xu2VvytGYRTHDwZJSmQyYDL5kUUiBpvJ70WySSaTZFCMsiCTVUkWg97BaFL8DSaK8iNFSflxvu85z+3c8957Xynb/dTpdj7nec593nvv87xEOTn/Ry3HGcc3xyVHRbycyTLHB8ncIVcLdHE8koy54KiPl0tpJhlco3mj5pXRiHReOa5M/sSxaXKwwLFj8gOS/j3GlfDGceQcbvTunGePpLmlKcEh/42LgeK0c6vqs0hrDLdi8ht1lrS5RQZJigPOz6lvcN6S1hjuzktD+MEjvhBYIhng3++U+l7nLVmLSvJglKS27QuWDZJBnc6PqZ9x3rJOpTfHZ5C2qC2OY45PjmFXizFP0qDb+Un1mZNJdt+5ye9J5uGISCPs9lNfCIRvqs/5WfVoUI41jheOXc0xzy40ibSnWaSapPiX3ZcEzjrMazcOr2vf5CAsym+wCBTt4QYK6i1YqKWFZIzdDCfqAhOa+17BVTkfkfRUkI+b/FndonH96jo0r9O8LRohwOGNBLCp4PDDMzkkecy4YgKOCgtufO0cCB/2rV5bY1UBZ90XSf1Br/g3yMnJySnHD4tPfOJ3c/BuAAAAAElFTkSuQmCC>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACYAAAAYCAYAAACWTY9zAAAB+ElEQVR4Xu2Vz0tXQRTFb5ZKECWFSET0B0QKgrjIViKiucjaFdHWVVvBrbRTUMFFuQhCUAlyoyIRQq0ibFFaIEYhukwXLtpEP+5h7vi97zijbgoX7wOH75xz75t53/ed7zyRkuNBg+oqh0Q1B/+ad6op1UPVDtUip1V/OMxRo3oj4YKXVIs0qbYl9LxV1RXLctFqkVeqXdVn1U1Vl+qr9dxwfVmaJTSfM99i3tOnGnN+UkIPro1MWxbBPD02PiXhSUFf9joOAZN9SGQr5PlmOVslf1I16Dz4RT5LvYTJnlD+3vLIFnnAN9ZPvkPV6Tye+JF+QvBAwmQjlC9ZnmNAQr3bZdgK/hq/+c+o1p0/lCuSfmIbll+gHNySUBvlgnJb9VP1TXXf5b/d+MhgkY+JDMIG9gypnkvYK+1Uy/FYdd35RxLmvuuyJFgAjTgyAPYKNj6yqthEXJJQn+MCcVa15vy8atHGL1SXXS0JTmucX59U16Ry3hxEfKoHwXX2uUM4Cy+Kn27CeRB72iiPPFW1On9C9t8Y+wJ8EzHrtfEd86keCOcVg7cCzjUmNUcWFH84vyz7HzF6ap1vtGzBZZ7cgpzzOgXwDsQFm/aJdyZzXsJfHvXv9jle6KjwTMI+TTGsmrHxrIQ/0X/jNQcEDnN8yXtcKCkpOa78Bcsfg4eoPVj0AAAAAElFTkSuQmCC>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAZCAYAAADe1WXtAAAA9ElEQVR4Xu2Svw7BUBjFP2Ex2SxYiNFiwhuIQcILWOyMXkRi9g4WiQeQWGyIWRCJRWLw79zcpvS02ksniV/yS5tzbr/e3Fbkjw8p2IEDmH3JKy/3xgzhHa5gDeZhH25g2eo+Qj1wgwkuQE90P+fCj4sE70L1DQ7fcRT9QJwLIuilNgXRi5dceGA89Cp6sdc5fo0aaLwDU8IMVd/CRVT0wC0XHvCLI7BJmY3JTkuwxaEfa9FD1a69UPmOshE8wBjlDtRQ9fPz4CLcU5aEOTiDdepcjOV5FCfr2nascBJ0ZB9ThQsOw3KGGTjhIgxdOIVpLv78CA+HEjTMC/QRWAAAAABJRU5ErkJggg==>

[image9]: <data:image/png;base64,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>

[image10]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACsAAAAZCAYAAACo79dmAAABtElEQVR4Xu2WPShFYRjHH7EYkEkxUTZSJh+TFIPNx+pjsMtEShkMJmUQJSmTklBKKcliwCITSVLkY7CQ8vn/97zn3sfb0b233HsM51e/zvs+z8n5n9d77jkiMTEpqYBDcB5WmXqTGUfOMvyC57ADVsNZeAsbXe9fwCCfsMRvgFHR/onfiIJ3Sb1q7Hf6xVzzJBqk0G94pLqZrFMrGuLMb4QQedgP0RBh+/TfwaCRr1i6ZBq2DT7DRb+RbfJFg975jRDsDY1JBGFJOivbAPvNnL+5kYS9EA3LVQ6D9XuvxrBb8BSuwmPTW4LDcB3umXozXIGToi+egH04DV9hjan/CsPypeAHrocPXo2MwG0zHzfzG1jmxo+wxY15jTw3ZmAyBTfcmKT6DyfYkeSW4APE4+CPM5Iw7KaZ86PHXqgL7sI32OtqXO3g73e7GsdcjGtn2mEzwQ8bvFgIj61ufAT73LjSHdtFzyl1xx5XzxoMe2jmM3BO9MViV+cFDojub1ufgOWwDl6ZOr/4/hyGLYCXohfjAxKwILqN+HNYLPowFbkazz2Aa4mz9fuYN8JesNdjYmJyyTfVpGrPIMLtNQAAAABJRU5ErkJggg==>

[image11]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADsAAAAYCAYAAABEHYUrAAACjklEQVR4Xu2WT4hPURTHD0MybJBSFmokoiQbKfm7MUtCIdlRSqEs/CkZ7GRhZ4HBTMhGSJEs7ETJwlaKRGHhXxIzzvedc3/3vOO+d2dmRd1Pffvd+z3n3nfP+9337iMqFAr/I/tZ11kLtb+ANcDa18kQprDus4ZZT1jj6uEkH0nyg9pYSjFviPVB/U/Gh75o7LPxejU3y0mqTwY9q2UQzVZ/svZnaH98J6MZ5OBmIv+Mi1lQFIpM3ZSpJP5NH2AekcR2+0CKY6yzrEuso6yuerjiG8mCLU9ZP5yXAsWep3gjm0AhuWL9GgK5uTugwDXedGCiLc47rH6OUOwekvxZ9XDFIdZEyhd71QeUERd7hNqLXUky0Qrn71R/uvM9oViA/BcmFggLHUuxp0lix30gBe7qKZIBF/X3nInjRQUPLxDLZvWXOd9ji31NfxfTzdqr7Vyxd1hzWfNYi1jP1fe7rpEDrHvOwwQntN2n/cUxXLFB/e3O96DYC9rGIjFmWwzTA9POFfuQtZa1jrWe4qNxLaaOHkwQLrpL20tiuGKT+rhwGyi23/QxBkUF3pp2rtjUNgaI/fJmitR5+ZviRcMzuzyGK3aoj2OpDRR72fT7ScbhuqtIzvXAWIvFDUM8t8uqJBz+3gsXnaRt/1yM5m18xfRRJMbhqPtqfJArtmm7PiaJ4whtBUkHE569aGqiu+rnQLGDzgs7x94EkCs2d86Gj55GvrNmmv5qkoHzjZf6F9Hf6LwUt0mKsAvZSjLeP0KhWO/PUf+W8yew3mkMR9CI8N+wPfVwBZ4X/CP4RY7/dk6Bb9g3JEcOFmXPwpem/Yr1nmIunsGwxe26IKzhJ8mfhE/MG6xpmlsoFAqFwr/CH98e0vJjM5xwAAAAAElFTkSuQmCC>

[image12]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADsAAAAZCAYAAACPQVaOAAACJ0lEQVR4Xu2XS0hVURSGVzZKB1IEojZpUEFIkCNBxKEDcRKF0wgSKiFomuQDHIk0ECxwKkEG1aSROlWhQaFYUSRkFFn4fuCr8v/Za3vX2RwfyL3CuZwPflj7X5t977prnccVSUlJSTJ90BL03+h3ZIfIislR9dF08vCFxNEBvQvNpHJCXKGfwwSYgBpCM8ncE1dso/EKoH9QofHyghmJjvBV6IdZ5xX2eu3VeCSTzi9Y3HtxHb6s671uVonGX6/bxutX777xssktaCE0j4M/Et/FXHa3AuoOzX14ERpHZa+iZsX558PEMVMlWSr2pLiC3oYJcEFcbj5MgGroOdQp7vHk6YGGoC5oQD2e8Rf6qrH3fLyhcTP0EVoWdy5p1ZzXJfV/QnehL+IuuUPxWNwhN8KE4j/kdIzPFxHiv9hNaFrjM9AvjYkv7EmMR/iD1Zo1c+woYcG2syXQG7M+sNhn4t6H51SrEu3QOXEd5bP2u7i9Uyb/QDI/xHX12L2W3R1RbGEe67G7lWY9Bk1qHBZL/GdzEnKOv47rJNP5NajNbwg4qNh1iRY7CI1r/Ah6pfFtyUxUMfQaWtR1zrBftB0qg2ok+vh6auLDFHvNrJkr0pgFDmvMwnkvuaNrEnd2VuHYf4NGoZfG518/jvMn6Kx6fJ7yzs4bj4fdoMfxJSy2CfoAbUHl6nt4HkUuipsg/gvj3lL1E8OmRMc4b7kibhQfQqeCXEpKisgOf5OafqmswaQAAAAASUVORK5CYII=>

[image13]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHMAAAAZCAYAAAACLBHaAAADM0lEQVR4Xu2YS6hOURTHl0fJY+I9EFeklMfEQGEgDBjJAAMjBoSIMjBA16MUJogUIsojkkRSMjAiJpSZyPt1IxTyXv+71+6sb519vn3Ol+u73bt/9e/s/V97n2/vs76zzz6HKJFIJBKJRHdkA2ulNSPMYLWx/rBusXrWhnM8YH0j1x66WxvO4dtBn1mbxH8fiGEcn5Q3T9p2G06zvlN2AVbVhuuyn3VQ1b+QO8cY5RWBdm/kWEQf1npybc6bGBhALnbRBpib5GIrbKC7UDWZaD814NVLkAdtJspxgYl5rsoxlsyzNiCUHUuXpEoy+1P4YoW8EL4Njj90QPFWjrFkYnUJUXYsOQ6zllqTGa3KWDIGqnpno0oywXbWdOOVvYC+zRlV1kxjTZZyI8ncQy621QZi4JnTi1znWcp/KR7wcTygOytVkxkC5/htzQD+umDDhPIhFQMfVTmWzMussaxxrAmse+IvypqW4xS5RAGcYGYWaq9fUPU75HZdjbKYdbJAJ1jHWcdYR1lHWHvbe5UH411tzQrcJ3eOfjYQwCfTl3UdnFPlWDJvkLuJZrPmkvtDwsddX4nNctxNtQPy/7hJyhvPOqDq4IqpNxOMd401S4KNEPoPtYEC9LVaJvUWqW+h7AYBsWSGllmA2E9rlgEdsdX2rBVP08oaJmWs6fMp36aZYCwYd1WwD0BfvEqUxc4b9UeqrGk0mf4xt8QGYqCTXqNfi6f5ZerAtqnHHNauCtrhupUGY1lnzQh+BdJg2Y9h+zwUDwlabmKxZBYtp7fJxffZQD38Nl2DOv4ZmmumDmy/ZoKxYMcdYiFruDUpvNkJeRY771Hi4cODJZbM2HtmXxuIgU4bpYxJ+xN5Hquyxk6qWQwhNxYs/5YelJ8P0F+OrOqBRw3a2M0WPHudBol/3fighVzskvF7U7YyhuYTZQplE3kinl86oMHiWWIT72iwa3zHes56Jkc8+5EoDT6Z4dutZwTlE+j1VbWzPGW9ouy39CvINtZIVf/AekFZW3xE2Ckx+5t4hGHMuLPx3Rbz+u/v9M1OZuIfkpLZBcBmCMtIG7lloej7ZCKRSCQSiUQi0TH8BbqxEAqnD0zvAAAAAElFTkSuQmCC>

[image14]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADUAAAAZCAYAAACRiGY9AAACC0lEQVR4Xu2YO0gdURCGxwhKEEnpI2AhpDOkSaONglqEFKIYLSRdikBIYiGIlVhqY6VgYSVW2liK2Cg+ggREwcI0CSkEE/KAgCEq+v+cs9xx2HX3qgu74X7wcWdnDp4zu+cs9ypSokRmeQgH4QxsVPkWFeeGOXgBP8Hn8BGchkew2ddyBRd8CqtsAYyIq+/ZQpY5k/inwHqPTWaVX+IWXG4LhrimM8NjcYv9Ygsh5Kapc3GLrbaFPMOGcvMEknJdU12wHbbCNtgh8ecuCbsSPWcUT+A3uGELYfCPc3AYb+CoFBofhveujLg5xTZFXkgRTcVNwPqhTd6SuDnD6JaETR2Im6DSFjxvxdX7Ve6+z9HXKn6lYn4zIWtwEv6FTT5HOIbbcAr+gWWq9hEuwGMfBzcgcVMkWIjdWg2qFobO63jIf47DJZWPGv9AXffBZR93wu8+JkU1RVal0MAP/znma4vBIAPH1Il7mv/E3ZQBU+d5/eqNakpfv4OfffwMrvuYsKlNdZ0KbGZb3DZ5CWfhb1XnQnm4w4hqiqzAffhT5Qib2jK5VOBigp8jjHtVja9h/U0lOGdEN1Ev7lyRp+JuUBjcmh9sMg1OVMxta2HDbIDN1ag87/qOuO3Fl1VAhRSOQSB//vBm8clxjtS34F3Dt6SG59Ru1dzBN+aEup6H79V1ruG/E2ptssT/wiVU/YlblMD4ZQAAAABJRU5ErkJggg==>

[image15]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAZCAYAAAAIcL+IAAAAp0lEQVR4XmNgGJpAHl0AHZwA4qtA7AbEj4H4AIosFMwF4r9oYv+BuBRNDKvgDKg4HEhDBTyRBYEgByoOBwlQAVNkQSCIgIqrwgQqoQL6MAEoCIaKw22qggqgKwyCiofDBNKgAgYwASgIgYo7wwTsoAKWMAEoiIWKgzwLBuxQgTCYABTAnIQCQAKT0MS2QcVRADbdID7IQxhgOQMkGkE0SFEBqvQowAMAoHwo5kKqEZIAAAAASUVORK5CYII=>

[image16]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAZCAYAAAAIcL+IAAAAZklEQVR4XmNgGLqAGV0AGYAka4D4PxBnocnBwQ0gXgfEfgwEFCKDoaIwB10QGwApzEUXxAZACvPQBbEBkMICdEFsAKSwEF0QHYgwQBT2oEvAwGogfg3ET4D4MZR+CcS/kBWNApwAANELGbNcp00DAAAAAElFTkSuQmCC>

[image17]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAZCAYAAAD6zOotAAAD1UlEQVR4Xu2ZWaiNURTHlyljyRAKUVJkSDxICeGBRzKETC+EiFAohZRCiuLFdJApJSFF8iCUePEgZZ4j15A5mdb/7r3Ot86637n7DLn3unf/6t/59lprn29/e51v7f19hygSiUQikUikfFawFlij5wNrJqsdqy1rEut9ToSjNesC6w/rBqtRrjuVt+TiRdUxmJK436wKb3+n7NAn7/uobON9bIPiKOsHJZOwMNedRU+eqFtOBFFXb2/p2x18u3E2Ij+IOU4ufpvxaZBIJBZxljbk7Kesg7lMzjffOhoSoQRvYu1ijTE+4Qu5JGlusr4bWxpI8F5Kfjz5QPJCCbZjEELfXe8JJTgEYqYY2xpvDyEJxvkR3yXXXclqVjMKJxhVKY2yErybNdcamZ7qeBm5NayuUk6CR5CLGW7ss729vbFbJMEA8beVT5AxlJLgreR8662jELCGNSH3BaOV/aW3AfFj0a+rhBJ8l9zEX2P9ZDVV/qU+BpsgzWRvH2rsFp3gZ1Q1ga1Yi/1xKMFnWb1YvVn9WLe83VaXgjhCLnkAXzIqcVW2T6o2dpXY3ZXKVNahPDrIyrD2k5uoPaztlb0KB+NdZI0e+Jqr9jlvEzb49kBlAxO8fYaxW5Dgff4YiUGf6YmbLqrjUIIvkbvRsFcYR0nZP5aEFs5a/7mFck+KAaM9QNn6sHaq9lMq48T/AIxF7pIQuBbEy/XP8+1B2QgHHqdgz7cxEzBfGdVGHyRSQDUUQglOK9EAPlSekkDn16q9xNs061id/DF2nMI9cmWptsF4Me40pEoJ8gO+49uyBg/LRjjw7Aw7HqGqA9+HKiRkyPXDc/RIcj8oodQEy5IZqiapoKOu8a+8TfNLHcOH8gEwKTY2jbGszUVoo+tWMBgD1lLLfXK+Fsomk3nFt1G+7RyAYnbRWGoEJBb9DrA+KzsIJThfRbxOzr/DOkLg7Y09Idq6rIDzpi2spKr9awOMATt9C5YSXXEAfpyI1+tk2uTZtTofSPBhY8MNgb468SCU4NBzsLyIKQp0XOWPO/u2HsQjdWxBXF9rrGE6khsHHics3VkPjA0vL74ZW9rdivZEY0vjDLnE6cmfRq6/fd0pCbb2Ht5+2tix25eKmnZ9BTGEkqQ+8TYpbRBe26WBLXx/a6xBTrDesJ6T2wfgE3sJPPppZpG7jhf+82quOwvWP9x5+ERcWsm3VFByfiRCP6s+VMePyY1NYlEhpXzLPIswBlzDV3KvN3GdNf4OIkPubgfLlT1SD8C/NtixziH3AryQ97WR/whbUvCXWSQSiUQikUgkUv/5C51eNuReEGjkAAAAAElFTkSuQmCC>

[image18]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEUAAAAYCAYAAACsnTAAAAACtklEQVR4Xu2XS6hOURTHFwbySB5dE3HFxEASg5tLBmSi1CVMJEVJmTAVBu7AwMwtGZgZIKYoTJVQHnmURHkkErk3j7zX/+617rfOumt/5/u+ojvYv/p39vqvtfc53z7fOXsfokKhUPg3rGK9Z/1h3WCNr6aHmcK6QqnmFmtcNT3CIdYg6wtrl8tFPGR9ozQudLuaHoXWQUOsg6xnVB0D7Y+sD6yv4uGaW2aAdcLE+DEYZIHx5og3SeJZEvvJe8S6auIHrOsmbgbGeyvHHBNZ+ynVXHA5oJPiwXXnciEo7Ak8O8Bn1jkTA9xR3BFlGsUnhTfdmwGoWyzHjS6nXJZju5MCnlDKbfUJDx6JaCDvRYMdEF+562IF3ilvBmhfHH/YhOGdHDuZlDuUcnt8IqKftdJ5dvDV0sZ7x7JD/JkS5y4o53u05qxpW3pZS6TdyaQ0y7UEOv+W9j6JlzXSw2wRXx+93Elzvkdr8J5C+6TJgU+mXTcpC0WLWBvEu2/q2gadMchkiY9IrHdJwXMPf5vEuR+f8z22Jupz3rTrJmWNaB1rPaUX/k/W/JHKNsBdx6Bdxtst3lLjgc3ir5U4+iEg53tszU6JuyU+zJrQSNdOSsRFSrk+n2jGDEqdsOxZ9J2ywvnbxcdyDXIXlPM9vgYx9h/atnQyKaAuX0GfY8tpOWKSkKtbfbCR8mMAeI+9GeD7PhVvKqV/q+W/TIq+VC3Ww0DHTQwuia9g0qITwlvuzQDfd5542Ex6OpkU7K6Rw063lu/UGMxL8f8KgHhT4Nl9wDHx6phNqW6v8+E9dx62APCvOR/461Z0QqLcKHT7HgnfDJYzrF9yRB5LtUe30zdZ9yjteHPfSMoL1hvWS9Yrqi69WPnmmhh3+TU1arGZO0qpj79+rDY4Px5r1LfyHVYoFAqFQmFs8BewSwd8VY5FEQAAAABJRU5ErkJggg==>

[image19]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADkAAAAVCAYAAAD8dkbIAAACOElEQVR4Xu2WzUsVYRTGT4WLWgsKboIQgmrjP6AYEQi1cmPLXFkUBSLkrkW7aNey8IMIPxaCiCT9ByKC1KZFBEWkZREGRlR6Hs853nPPnffemQHBxfzgwXeec2beeebOvL5EFRUVx51R1kg0W7DC2mP9YN0MtSy2SfpNzeihWt9/1jf137N+uxrGmP87a1e9Ve094CXrjxagW77YAvS36XhIj7dq5SQnWTMk/U9CzYObRrjUw0g9qNOUrhUKucxaCN4SyTWuBz+CkM+oyY0ouH6ZkOAdJWpFQv4l6R903gX1Np2XhYXEXOjvrC8f8IDkLSkbcp0StSIhu1hTwesjucZa8CMWEqD/rasZdoNlQyZrRUJm8YrkGhdjIeBDfqTGmznDuqPjPCHPqc6zrqm34frqQPF2NHNyiuT8ulUtAUI+13E3yXk3amV67cZ5QvarrrAGWG9IPqezh50OnGBPsChYulu9pgZCTrhjzIswxmc3zhMyC1sEG4B5N5o5wDc1G80mIKT/nidI5j7B6iV57YyyIUFmDea9aLZgnvUoePjOmoGQ0+4Y4TD3JOuX88GRhLwfTWU8GswYNe6QOlhPgxdByBfB+0cyvw8PyoYcpoxau5qPY4Fky4SaX3kvq5elq64vi0WSm8fOxLAdE35Vj4WMPkiFtICHtTnWV9YnktcMf/HPHFs94xLJftETg3nhl0qB/afN9YX10NX8HB9I7sN6sRjZq/yTGufEaoo97I72I2hFRcUxYx8eo83B1vsMLAAAAABJRU5ErkJggg==>

[image20]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACsAAAAVCAYAAADfLRcdAAACBUlEQVR4Xu2Wv0uWURTHjxlE1FJBi6RDNBkhLmFEQy06JuYiITgk1GKriFCLS5OT/0FFDSFSENHgFro4tIWC/bIIoyIJf6Dn+9zvfZ7zHN/3vfI2Cc8Hvtxzv9/j6/E+D/dVpKLi8HJC9Vq1q1pQtZTjfbxX/ZPQDy2W433EPuiPaoL+eo3sh+q38frYm9FG8zj3Z7g/knfUB33fuNbjmOq+hJ7nLgMnJWQvfKDMS8hGo/FX9TSPAzgpnFwKfNBFrjddFnnFNTWsnyESTzjfDBZZxjj9FLEH65YNDN+5poZ97AOSD3uNxdVSLDJM/7TzPXHYJ6a2XFFdYt3MsI8kZA+wGeOm23Yot+hfdr4nDoj3G/WMycAvU6eGnVOdV11QdaqW6OdP/SGN+NdH8P7BH3K+x54man+6z0ydGvat6rrqhqpXdZc+nlrGHRpd0SAD9PGDjbDDjXDfwf2kqrWIk8PWeg0Asm0U8Z3tKcUit+njWmuEP0nsl01taXbYL8LPwh2I4n9vg8gHehgAT82SGjZ/3I53Yn4Piukiy3hJP4Xvaae34XyQGvZA92ytU8S+33mesxL67jkf3orzcAXCf+N80CEhm3X+UdUaM1xhOXhfdrgixJXWiFXVV9VH1ScpX1G4Yc6Z/U/VZyl68SUxxSyeWhRm2JTwZPB/A26TU+ytqDhU7AFQea5i3aZPewAAAABJRU5ErkJggg==>

[image21]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACoAAAAVCAYAAAAw73wjAAACLElEQVR4Xu2Wz0sXURTFb20io4iyjf0PYbqQQFwoLVqEFtWiEBFB1EgUXAltJIgoiNwZtYqIaNeiha3bVKCCFbhw4Q8w2pWK2Q+7x7l3unO+83TnQv3AYd45b+bNnR/vzYjss7toVR3gkGjmYCc5qtpQnVV9U10vdue8Vj3i0BlS9XJoHFGNS3aSD5K+G7dV31Wrqi7qAz9VncFjPOiu6rzqjvm/YZ9NXqjW5f8BfcXuTU5L1nfY/EnzB/M9Mj6r3gY/rXoXPMBxuOjonRrbzqiqQl5BqtAV1UvKPqrWgj8mxZM6yI6Tj/wh3yhbPHInVSjya5QNW+5MkneQPSF/inyECy+lrNAmy3GlkQ7LT5hHm08KOJ9TPbZ2tep56JuVbR65U1bogOV1lF+1vME8F+SU5Zgor6R491pUD4PfEgx4k7IRy89QfsnyG+bLCgKpnIlF4yktqaZCVgAD3qKs2/Jayq9YjjsBUgWl8gheB19RQNz/V2jnYId+yvwdPUd5u+VYukCqoFTuXFDdD/6ZZOuwEydiDgbEOxk5ZPl2s/4HeQfZFw4Dv8ljyfsUfFto52DQQQ4ly0cpe2O5gwtJFVrPobEo2Y2IfJVioZgLBbBUYNAH3CGVdw/AXy7JeoLHI+XjnIuSTVTmnmo5+KfewDKBn4MF1bxtcVX4rEbwqcXMxLbsFQGYEOh7L9mMxWNM/RPgm58CY/hxXMeOMiaV/wkRfI4xoSa4Y589xT+R455KSKxbcgAAAABJRU5ErkJggg==>

[image22]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGYAAAAVCAYAAAC0aZsNAAABY0lEQVR4Xu2YTysGURTGDxaSHVlZKJtXFpKUFCJ7RdhIdtYoC39K+fMF7KyklHwB9foKlE9iSTbinLnPvHPnNPQu7sji+dXT3POcO5tzunPvHRFCCCGkXnZV96pRxCOqW9VOa0agV/Wo+lI9qTrKaZKacwnFjvVSmiEyCL8HcT/iztYMkpwT1aXqRnWs6iqnM94krKqYZ9WH80hCrBkL3nTY6lh33iF8UhNH8ntj5iQ0YMb5W/D7nE8ScaC6kFDkazyvorwdAsybiDxjDf6U80ki9lRN51nBzzA+RTxWpDOW4W84n9SIFTzfP7YxHi/SGavwF50fY6e3yTbVwDsEVN1HPqVoTL7HTBfpjE34dpT+iSHVUpuaxTsEWHFfK7y8Md0Y81T2x1hx9yu8uOg2trtOzAN8UhPvqoEonpdQ8PibX7U6LF5xHkmMfcryVWIaLqcz7iTsPfa0Of5fGiGEEEL+Od/LD1D23ySJ4gAAAABJRU5ErkJggg==>

[image23]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEoAAAAVCAYAAADhCHhTAAAAlElEQVR4Xu3WMQqDMBiG4dyha6WrB+g5vJ/gFRw6CQ5dOha8hIuDa2f7BRTbvxjj1sD7wAsxOH1TnAOA9FzUZC/xy4/EUDta9XIMFXRWNzU6hgpaxmGogFpl85mhNpzU/eOboTbYUWKHuh4oeaXKzV3sUMWBkteoh2l5R/lztf4KiwdnJIba0alB9XP+/Pz6AwDwd94Y5CxVwnFelAAAAABJRU5ErkJggg==>

[image24]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEoAAAAVCAYAAADhCHhTAAABO0lEQVR4Xu2XsUpDUQyGg4MFHURKcegguDgVQSwO2qm74BP4GD6ALyAUOrj6Fg4OTg461OIqiKt0rOCgzU9yMQ0Ru9We5oOfe/PnnCHh3HAuUZIkyWKwyrpjfbNuXK7imPVOsuaetTKdLp99kuI3NG5rbOmx+iYek6zZMV7xoOBB4A1dfGjiyvMNLZYGSbFXzn9UH6zru29K5BXLGUmxl86/Vb/ignVkYrBUjdqm+ES9ql93vgX5L2+WDAp+CjwIgz0C65Ff84mS6ZIUjSsCOCcZ5PCiKwCGOnKYb3+BE3kwo3Z1z79mi+T+9MxqsV4onj+bJH7NJ34Bn/bJjOronoUiGtQ4Xd67dnHRRE1BfOq8aHBHXrGgKbhpVzywRiYGn/TTUK+lYY+k4Dd94p/P0lQ/0odZlyRJksyBCV9xWShvPmNTAAAAAElFTkSuQmCC>

[image25]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAG8AAAAVCAYAAABIfLDHAAABc0lEQVR4Xu3YzyqEURgG8FdWNrLgBmzIlgvgBizdgI0/EWKhIQusWNkpJaUkVyBrGxuUuAA2kg0lKfG8c75jzvf2vTF1ZuX51dN0nnNmc95mpvlEiIiI/q9FZNKWMI8cIwPFuh85ROZ+TjSsIi/IGzJu9iizI+QD+SoyVd6u25DGfsxl6URwi5wl6xvkPFlTC3nDW0N2kANkBWkvb9d1Sni/pV2XLSk/b3g6sBFbGlfiD2/PlpSfN7ya/D68+HVqeT1l5g1vGdmUsL9fvO6WTvhD8nrKTC952pawgJyaTs+um3XVkLyeMtNLnrGlww7FriOvTw01EXLoJc/aEtpsAZ+Sb3ijTYQceslVf7y1f67o0qG8mnWk3Z0tKT+9aH2aYmm/VNGlwxoz60i7QVtSXt0SLnrbbkh41NWTrIclnO1LOqXdRLLeKjpqkRPkCXlA7ovXRwmPzFL6tRk/bZre8nZdh4S9C+QaeZfq30siIiKiP/kGfvxvdFCqztsAAAAASUVORK5CYII=>

[image26]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAF0AAAAVCAYAAAAkeuLCAAABDElEQVR4Xu3XMWoCYRAF4MFGSCoxqSwCabyAkCJ6hdxDg2IgN7C1C+QCKVLkIta5gmlCrBOwMM74T2D3OQvumsp9Hzxk3/9v85pFESIiOmWPmiGWrq9ZaX41C00jf0xlvGrWksa0jPLHO0+a58zzt6S715mOKioa3fqboLPQkaLRz73HgaOOKohGNzPNLXQc/Z8UjR6xuxssqTwb8h7LwLuku2d4QOXZkGMsgX1Q7d4lHgTamt6B6fo7tWNjTrDMaEm608SDAleauwMz8HdqxwadYunszxB+OF/gmSqwUR+wdNFHM+qohAtJo8/xQPL/WDFUwZvmS/OhWfrvp6ShTUf2h/7Lj98hIiKqnS2sEkccyteZtgAAAABJRU5ErkJggg==>

[image27]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEoAAAAVCAYAAADhCHhTAAABWElEQVR4Xu2XPy9EQRTFLwURhYSIQrGlyp8IEQka/SYEjYhOrZMofQJR+gLiCygUCi0KRCsRvY5ohHvMGe6O2WS7tfPuLzl5c87MFPdl9r5ZEcdxnM6gR3Wp+lSdJ3ORfglzWHOl6mqcLp9pCcUP0M/SW0aZ9dEP0Xf/rKgAKPg2k90b/6o6NR5cq96TrFiGJbyU4yS/YR7BeMN4sM+8EmxLKPYwyS+YgyWOF36nv4l7B5O8SGqSP1FPzNGLdjlGL7OsM59L8mJBsXeZDEJjP+B4omGFyArzzSQvlmUJBeOKAPYkNHJk+KrtcDzF+cgac+xvBk7kTIsa455/zYiEO9KDalz1KH971Dx9ZIs5rg7NqKnqLWqRezqK+NMDvRxX+qsH7EuxGXqQ9UfGgzPmlQHFvhmPi+SL8SB3euBXk6xoJiUU/cwn/vPlOFF98Il1uDY4juM4beYL1htYQ9zC5RAAAAAASUVORK5CYII=>

[image28]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAG8AAAAVCAYAAABIfLDHAAABn0lEQVR4Xu2YTStEYRiGXzZCyUdWdn6AhJLIxl4RNpKFkqW1smFpR1nZWcgfsGCthAUSf8KKfKR8PPec55155um8TZMzK/dVd3Pu6z2zeZ/OmTknBEIIIeT/MSF5kvxILiTN1csl2iWnITvnStJUvVxmU/IseZOsuDVSMHuSfdOx6RhQv3F96lq192j3Q36QnJl+Lzk3nRQMhjCa45DIq+TYdHAt+TC9I1R/JwLX6SX5O7gV+kEB73C8YDrYUB+5cT0Cd+AlKYZtybhzdniTeozfRcuy+m7tfuCRlCcNApv9rcfr2ocqyyXm1cdbbmpIKU8awF3INrtN+5b2gfIZGTPqF7WnhpTypGBwFWGje41bVTdoHJhTP6U9NaSUt4zUEZJDV8g2ucX5+Js35vySejxGgNSQUt4yXUeIA89rfoMP9RPDxFqtf5svrkfgHr0kxRH/nFiswwB2TQcn6iMYbmp4w16SYvgMlVubT8RfZQB9Nsetmb6jjjSA+NorL+/mPHAk+dJPrOMRwoPXZ1i7lNyG7A1M6h0oIYQQQkhNfgEbZ4D2Ath95AAAAABJRU5ErkJggg==>

[image29]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAF0AAAAVCAYAAAAkeuLCAAABJ0lEQVR4Xu3YMUtCURgG4C+C1sCaWhxbAgkaXKKxRdz8ESWGQb+g2Z8hOPgX/BE2BE0NKkI0aJMQiH6f55TnfJwT9567dd8HXvS+57q8iKJEAADwnz1x7nRpVThzzobzzjn2jyGPAeebzJiSe/9454jM4D8OyNx76XSQKDb6UhfsgrPWJeQXG116/bFTsz0UFBt9QeZs5HTy7r92riFRbPRD2n/mS2TwhncHJJNB27q0zsgf/tU/hlQyZkeX7Jazss9vaD/8y+8dYSecq4w5t68pHRnyQZcU/sKcULh3VTnNjCnt94OM2FVdy/Yh0td1CfnIiI+qkx9Af40OBZySGbGnD8j0z6qT67HqIKMh55Mz40zt4weZvwZcX2TGf7OPff8YAACgXLY5JEftMwj5gwAAAABJRU5ErkJggg==>

[image30]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEoAAAAVCAYAAADhCHhTAAABIUlEQVR4Xu2XsWoCQRCGB4u0FiaktLSSgCRlqvQBn8A6SkKEQF7CIrUvkMI3sEiROhYqaQXRRoSUKdLE+Zk5WIdV7BKZ+eDnmG/3ihnuljuiIAiC4+CE88755QzNmuWJc2elBxokAyprfaV1yivnRz3S3l72ARofZ9zUuAKXgzojabxv/Eh9DpeDapE0/mL8m/ocLgdVpfwTNVdfMR64HBRA45OMQ3CwW+A7VnrghqR5fCKAZ5KDHK5UbEqAv7dyB3giLw9MTe/515yTfD99cuqcGe0/ox6s3AFe7dsDc633HBXFq5cD/tFKD+SGgrppXAHWulZ6AI1/J/UH5yupU05J9vfsggcuSJpf6BX/fJYBZ81ZkuzDdUXyWxMEQRD8IRs5lkqVNZjlPQAAAABJRU5ErkJggg==>

[image31]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAG8AAAAVCAYAAABIfLDHAAABrklEQVR4Xu2YzSsGURTGLxaSklj6HxBKSjZ2FvK9kSyULK2VjS0byoqlkmxlwVoJC0r8A5ZsiGx8nOe954wz951rejOzcn71NPM89zaLc7ozd65zhmEYhvH/6CI9kb5I56TW9HCFZtKJ83MuSXXp4YRV0jPpjbQQjBkFs0TaUn7P+Qb1qKyDsyb27ezrkxmeO9Kp8rekM+WNgkEToN+yV9KB8uCK9K58i6t+DkCWtZKNAnhw1UUPm4f7GeXBCufCdeAFZLthaJSDNGWE/RD7wWSGZ57zNvZhw4VYbhTMmPOF3lTZMmf6GwimOe9nH2tSLDcKZIN0SPogDat8zfnid6oMjHM+yz7WpFhulIDsLI/YL7LvTmZ4pjiXRseaFMs1fTXIyEEXXL55Az/DFeY4R7NBrEmxXDNagwwFXpM7QSYFxyalke/zdpsvgReQ3Yeh8XcmXfbKkKxBef0jD445F9Dc8DkAWW8YGsWA4mJ1CdiYIENzhHCVAfiJjAwnNsI6Z0ZJ4D/t0/kiP/J1OzXDs+/8KxZXzMEvRAiOzzB2Qbpx/gQmdgZqGIZhGIaRyzcdWoAVep6wSAAAAABJRU5ErkJggg==>

[image32]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAF0AAAAVCAYAAAAkeuLCAAABRklEQVR4Xu2XvS4GQRSGh0ZQISqFRKMTEYmIn0YvIWhEdGq1kjsgcQMKcQMKVyChch1aP5H4Oe8373K+k5XMt1HZ90ne7JxnZpuzm9nZlIQQQvxHli2Plk/LraW/e7rDsOUm5TV3lr7uadELZ5ZzVz+n3Ngp5yboBlmPsa57OKIANG+hxiEVT5YrV4N7y2twogBsGbHBIDqMd1wNjuhFA04sS8H5pq9yjH3fs08/GrxoCJr5wfEh67mf6Q7b9HFrEg14SLmZQ6yPWc98r8hs0O8GL3oEby0aOe7cAd2sc2CLfi14D04584WZ5j2tYiTlJg4EX+3pi8Hv0eM4+RuTlvXCrPCe1oDzNhroueAVDwFzOr38MdVH0+MdmnvqanBNLxrwlnLz6lJR91aj3gxOFFD93tflxa0Dl5Z3XjGPo6QQQgjRWr4AEnBUyvCKYR8AAAAASUVORK5CYII=>

[image33]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEoAAAAVCAYAAADhCHhTAAABR0lEQVR4Xu2XPy9FQRDFJySU5IkoFEoVLxE6Kp1CiA+g9Q0k7zMokGhodVpRKBQqBQWilQglSp0/czKzyb6T9fI63r75JSf3zpnZYiZ7N3dFgiAIeoMh1aXqW3VOuURT9SZWc6UabU/Xz5xY8yMeL3ics6Xaz+JjsRqs7RvQ8G3Bu6eYh1fyqmVcrNlD8m/cT7xQDPpqUJtize6Sf+H+b7TE8iucqJUpKe+oJ/fHyAdrYrk9TtQOmr4reBAO9pwd1YnqU7VMuepBwxgKfhHAtthBDm8gFRGTYvlTThDYkfNdatrX/GsmxP6fHlQzqkfpfEaBtOs6gU97tUst+ZqegoeAT+0oi0GqWSS/WngoyVv39w2PSzXQIPnVgmY/svha9Z7FADXDWTzr3lnmVQ/ucGj62Z+48zEN1ZdY/tWfB20VQRAEwZ/wAy+XWEfLVr8XAAAAAElFTkSuQmCC>