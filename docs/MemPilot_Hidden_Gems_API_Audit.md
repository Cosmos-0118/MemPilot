# MemPilot: Hidden-Gem Architecture Audit (2026)

*A research addendum to MemPilot_Extension_Feature_Optimization.md — verified against current Chrome documentation, Chromium bug threads, and the wider tab-management extension ecosystem.*

This pass had two goals: **stress-test the original blueprint's technical claims** (a few don't hold up against current Chrome behavior), and **surface lesser-known browser surfaces** that most tab-suspender extensions never touch. Several of these let MemPilot do less custom work while getting more reliable results, because Chrome itself now ships native equivalents of things the original doc was building from scratch.

---

## Part 1 — Corrections to the Existing Blueprint

| # | Original claim | What's actually true | Why it matters |
|---|---|---|---|
| 1 | Keepalive alarm at "24 seconds (~0.4 min)" | Chrome enforces a **hard floor of 30 seconds** for any packed/published extension. Anything below `periodInMinutes: 0.5` is silently clamped to 30s (and logs a console warning). This floor was tightened from 1 minute to 30s as of a recent Chrome release specifically to match the service worker's own 30s idle window. | The 24-second value in the original code will never actually fire at that cadence in production — it'll run at 30s regardless, so the code should just say `0.5` and stop implying finer control than exists. |
| 2 | Offscreen document as a permanent "DOM Execution Bridge" heartbeat | `chrome.offscreen.createDocument()` requires a `reason` from a fixed enum (`CLIPBOARD`, `AUDIO_PLAYBACK`, `DOM_SCRAPING`, `WORKERS`, `BLOBS`, etc.) plus a human-readable `justification`. None of the reasons is "keep my service worker alive," and Chrome's own extensions team has stated they're watching for — and actively discourage — exactly this pattern (an offscreen doc opened under an unrelated reason purely to ping the worker every N seconds). It's also increasingly unnecessary: Chrome has already shipped service-worker lifetime extensions where *any* extension API call (not just events) resets the 30-second idle timer, and a single task can now run up to 5 minutes before the hard cutoff. | An always-on offscreen-document heartbeat is the kind of thing that (a) may draw Chrome Web Store review friction down the line as reasons get more strictly enforced, and (b) defeats MV3's actual point (battery/CPU savings) for an extension whose entire pitch is *saving* resources. See Part 2.1–2.3 for what to do instead. |
| 3 | "`chrome.processes` is dev-channel-only, so no production memory signal exists" | True as far as it goes, but there's a production-safe sibling the doc misses entirely: **`chrome.system.memory.getInfo()`** (Chrome 91+, plain `"system.memory"` permission, works in any channel). It only reports *whole-system* bytes (`capacity`, `availableCapacity`), not per-tab — but that's precisely the missing variable for turning the per-tab heuristic into a pressure-*aware* policy instead of a constant-aggressiveness one. See Part 2.4. |
| 4 | `updateTabState()`'s read-modify-write on `chrome.storage.session` | There's no lock around the `get → merge → set` sequence. In MV3, a re-spun-up worker can receive multiple events in close succession (tab updates fire fast), so two concurrent calls to `updateTabState()` can race and the second write silently overwrites the first's patch. | Wrap the critical section in the **Web Locks API** (`navigator.locks.request()`), which is available inside extension service workers exactly like any other worker context. Five extra lines fixes a real, currently-present bug. |

```typescript
// Corrected, race-free version of updateTabState()
async function updateTabState(tabId: number, patch: Partial<TabRegistry[number]>): Promise<void> {
  await navigator.locks.request(`tab-registry-${tabId}`, async () => {
    const data = await chrome.storage.session.get('tabRegistry');
    const registry: TabRegistry = data.tabRegistry || {};
    registry[tabId] = { ...registry[tabId], ...patch };
    await chrome.storage.session.set({ tabRegistry: registry });
  });
}
```

---

## Part 2 — Hidden-Gem APIs Most Tab Managers Never Touch

### 2.1 Read Chrome's own discard state before duplicating it

Three properties on `tabs.Tab` already do most of what the original blueprint hand-rolls:

- **`autoDiscardable`** (boolean, Chrome 54+, readable *and writable*) — this is the browser's own "never auto-discard this tab" switch. It already exists; nothing about it is custom to MemPilot. Writing `chrome.tabs.update(tabId, { autoDiscardable: false })` for a whitelisted domain makes that protection apply against Chrome's *own* native Memory Saver too, not just against MemPilot's logic — most homegrown whitelist UIs reinvent a weaker, extension-only version of this.
- **`discarded`** (boolean) — whether the tab is currently unloaded.
- **`frozen`** (boolean, **Chrome 132+**) — whether the tab's JS execution is paused while it stays loaded in memory. This is new and most extensions haven't accounted for it yet (see 2.2).

**The honesty gem:** track discards from *every* source, not just `chrome.tabs.discard()` calls MemPilot itself issued. Chrome's native Memory Saver and Energy Saver freeze/discard tabs on their own, and a power user who opens `chrome://discards` will notice if MemPilot's "total memory saved" counter doesn't account for those. Listen broadly:

```typescript
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ('discarded' in changeInfo || 'frozen' in changeInfo) {
    // Log to the ledger regardless of who triggered it (see Part 3.3)
    recordLifecycleEvent(tabId, changeInfo, tab);
  }
}, { properties: ['discarded', 'frozen'] }); // (filter object — Firefox/MV3 cross-browser shape)
```

### 2.2 A real third tier already ships in Chrome: native CPU freezing

Since **Chrome 133 (Energy Saver, Feb 2025)**, Chrome itself freezes "browsing context groups" that have been hidden and silent for 5+ minutes *and* are judged CPU-intensive — independent of any extension. Freezing pauses event handlers, timers, and rAF callbacks but keeps the tab fully loaded (no reload on return, no lost state) — strictly cheaper than discard, more thorough than doing nothing.

The interesting part: Chrome explicitly **excludes** tabs from freezing if they:
- run audio/video conferencing (mic, camera, screen capture, an open `RTCDataChannel`, or a live `MediaStreamTrack`)
- control an external device (WebUSB, WebBluetooth, WebHID, WebSerial)
- hold a **Web Lock** or a **blocking IndexedDB connection**

…which is almost exactly the original blueprint's "Multi-Signal Decision Logic" exclusion list for *discard*. That's not a coincidence — it's the same category of "this tab is doing something real in the background" signal. **Recommendation:** factor that check into one shared `isEligibleForBackgroundReclaim(tab)` predicate, and reuse it across all three tiers (soft-suspend → let-Chrome-freeze → hard-discard) instead of re-deriving slightly different versions for each.

You can check eligibility for the running browser at any time at `chrome://discards`, and you can observe transitions from the content-script side via the **Page Lifecycle API**'s `freeze`/`resume` events, plus `document.wasDiscarded` on load (see 3.4).

### 2.3 Fill the gap native freezing leaves open: a real soft-suspend tier

Native freezing only engages after 5 minutes hidden+silent, only for CPU-intensive groups, and (today) only when Energy Saver is active. That leaves a wide window — a chatty background tab with a polling `setInterval` or an idle `requestAnimationFrame` loop burns CPU the moment it's backgrounded, with nothing watching it. MemPilot's existing content script (already injected at `document_start` for form-dirty tracking) can close this gap itself, fully reversibly, with no Chrome flag dependency:

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && !document.querySelector('audio, video')?.matches(':not([paused])')) {
    softSuspend();   // cancel non-essential rAF loops, throttle setInterval polling to ~1/min
  } else {
    softResume();     // instantly restore on return — no reload, no state loss
  }
});
```

This is strictly *additive* to native freezing, not a duplicate of it — it covers the time and the tabs native freezing doesn't reach.

### 2.4 Use system-wide pressure as a throttle, not just a per-tab score

`chrome.system.memory.getInfo()` gives a cheap, production-safe read on whole-machine memory pressure. Use it to gate *how aggressive* the existing per-tab heuristic gets, instead of running one fixed aggressiveness level regardless of whether the machine has 200MB or 20GB free:

```typescript
async function getPressureTier(): Promise<'calm' | 'moderate' | 'critical'> {
  const { capacity, availableCapacity } = await chrome.system.memory.getInfo();
  const freeRatio = availableCapacity / capacity;
  if (freeRatio > 0.40) return 'calm';       // idle-timeout discarding only, generous timeouts
  if (freeRatio > 0.15) return 'moderate';   // shrink timeouts, prioritize lowest-score tabs (3.1)
  return 'critical';                          // discard aggressively, even recently-used background tabs
}
```

Poll this on the existing alarm tick — no new permission friction, since `"system.memory"` is a low-visibility permission compared to `"tabs"` and host permissions MemPilot already needs.

### 2.5 Calibrate defaults by device, not by a single global default

`navigator.deviceMemory` (a Web Platform API, readable from any extension page or content script) returns a rounded device RAM tier (commonly 1/2/4/8/16 GB buckets). Use it **once, at onboarding**, to pick a sane default aggressiveness — a default tuned on an 8GB developer machine is too lax for a 4GB Chromebook and too aggressive for a 32GB workstation.

### 2.6 Let content scripts read shared state without round-tripping the worker

`chrome.storage.session` is private to trusted extension contexts by default. One call changes that:

```typescript
// Once, from the service worker on install:
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
```

After this, the form-dirty-tracking content script can read/write session storage directly instead of `chrome.runtime.sendMessage()`-ing the service worker on every `input` event. Keep actual *decisions* (discard eligibility) in the worker — just stop bouncing low-stakes reads through it.

### 2.7 IndexedDB lives inside the service worker — no offscreen document needed

This is worth stating plainly because the original blueprint's storage section never mentions it: **IndexedDB is natively available inside MV3 extension service workers.** It's a worker API, not a `window` API — unlike `localStorage` (which genuinely isn't available in a service worker), IndexedDB needs nothing extra.

That matters because the original doc's "DOM Execution Bridge" framing implies an offscreen document is needed for anything beyond simple key-value state. It isn't — for **time-series or queryable data** (a savings-over-time log, a discard audit trail, per-domain access-pattern history for 3.1), IndexedDB with proper object stores beats repeatedly JSON-stringifying a growing blob into `chrome.storage.local`, which has a modest default disk quota unless the extension requests the `unlimitedStorage` permission, and isn't built for querying anyway. A clean split:

| Storage | Use for |
|---|---|
| `chrome.storage.local` | Small, persistent settings (whitelist, thresholds) |
| `chrome.storage.session` | Ephemeral per-session state (the `TabRegistry`) |
| `IndexedDB` (in the service worker) | Anything that grows or needs querying (history, ledgers, access patterns) |

### 2.8 Tab groups already get a freeze discount — use it as a softer action

Collapsing a tab group is itself one of the documented nudges toward Chrome freezing its members. A **"Park into collapsed group"** action — one click groups and collapses a cluster of related tabs — is a softer, fully reversible alternative to discard that rides on a mechanism Chrome already optimizes for, keeps favicons/titles visible in the strip, and gives users a middle option between "leave it" and "discard it."

### 2.9 The newest stealth memory cost: speculative prerendering

The **Speculation Rules API** (`<script type="speculationrules">`) lets *sites* tell Chrome to prefetch or fully prerender likely next pages — at the "eager" setting Chrome will hold up to 50 prefetches and 10 full prerenders in memory at once, each one roughly as expensive as an invisible `<iframe>`. Chrome already self-throttles this under Energy Saver, Save-Data mode, and low memory — but that's Chrome's own throttling, not something extensions get to inspect ("this tab has N invisible prerendered children" isn't exposed to extensions).

The one real lever extensions have is **`chrome.privacy.network.networkPredictionEnabled`**, with an important caveat: Chrome's own docs describe it as governing *Chrome's internal prediction service* (DNS pre-resolution, preconnects) specifically, separate from page-declared speculation rules, even though both sit under the same `chrome://settings/performance` "Preload pages" toggle in the UI. The honest framing for MemPilot: **surface the existing Settings toggle inside MemPilot's own UI for convenience and visibility**, rather than claiming the extension can fully police page-declared prerendering. Worth a watch-list entry in the roadmap rather than a feature ships-today.

### 2.10 `navigator.modelContext` / WebMCP — let agentic browsers drive MemPilot directly

The original blueprint's "WebMCP-Compliant Local Automation Interface" idea has the right instinct but the wrong shape. **WebMCP is real** — a W3C Web Machine Learning Community Group draft announced February 2026, currently in an origin trial (Chrome 149+, flag-gated) — but it's a **page-author-facing** API: a *website* calls `navigator.modelContext.registerTool()` to expose its own functionality to an in-browser AI agent, not an API for an extension's service worker to publish a schema for "local models" to inspect.

The accurate, and genuinely exciting, version: MemPilot's own extension surfaces — its options page, popup, or a side panel (2.11) — are real `Document` objects. They can call `navigator.modelContext.registerTool()` themselves to expose MemPilot's *own* actions:

```typescript
// Inside MemPilot's options page or side panel document:
navigator.modelContext.registerTool({
  name: 'freeUpMemory',
  description: 'Discard low-priority background tabs to reclaim RAM right now.',
  inputSchema: { type: 'object', properties: { aggressiveness: { enum: ['gentle', 'normal', 'max'] } } },
  execute: async ({ aggressiveness }) => runDiscardPass(aggressiveness),
});
```

That lets an agentic browsing session (Claude in Chrome, Gemini-in-Chrome, or whatever ships next) act on a plain request like "free up some memory" without a human needing to click the popup first. **Caveat clearly in the roadmap:** this is experimental and flag-gated as of mid-2026 — ship it behind MemPilot's own feature flag, not as a Phase 1 dependency.

### 2.11 Side panel as a persistent dashboard instead of a disappearing popup

`chrome.sidePanel` lets MemPilot keep a live "tab health" view open alongside normal browsing — a good home for the pressure gauge (2.4) and the honest savings ledger (3.3) — instead of forcing the open→read→close friction of a popup every time someone wants to check in.

### 2.12 `testMatchOutcome()` — for your own CI, not for users

`chrome.declarativeNetRequest.testMatchOutcome()` lets you simulate whether a hypothetical request would match your compiled DNR rules — exactly the kind of thing useful for validating the `abp2dnr`-compiled EasyPrivacy chunks before shipping. The catch: it's restricted to **unpacked extensions only**, so it's a development/CI tool (wire it into a Puppeteer test suite that runs against your compiled rulesets pre-release), not a "test my rule" button you can ship to end users running the packaged version from the Chrome Web Store.

---

## Part 3 — Product-Level Hidden Gems

### 3.1 Replace the idle-timer with an OS-style eviction score

Operating systems stopped using pure LRU for page replacement decades ago because it punishes a page that's reopened on a predictable rhythm just as harshly as one that's never touched again. The same logic applies to tabs: a user who reliably reopens their email tab every morning at 9am shouldn't have it discarded at 8:55 just because it sat idle overnight.

A lightweight version, buildable on the IndexedDB store from 2.7: keep a rolling count and the last ~5 access timestamps per domain, and only discard the *lowest-scoring* background tab when **both** (a) it's past a soft idle threshold and (b) system pressure (2.4) actually warrants discarding something. This turns "idle timeout" from the only signal into one input alongside frequency and recency — closer to an LFU/ARC-style cache policy than a flat timer.

### 3.2 Per-group memory budgets

Let a user cap a tab group ("Research") at N live tabs. Once exceeded, auto-soft-suspend (2.3) or park (2.8) the lowest-scoring member of *that specific group* rather than running one global free-for-all across the whole window. Pairs naturally with `chrome.tabGroups.onUpdated`.

### 3.3 One honest savings ledger

Combine 2.1's "track every discard, not just mine" with the existing memory-estimation math from the original blueprint, so the number in the popup survives a skeptical user cross-checking `chrome://discards`. Log freezes (2.2) as a separate "CPU/battery saved" stat rather than folding them into "RAM saved" — freezing and discarding reclaim genuinely different resources, and conflating them is the kind of thing that erodes trust in the headline number once a user notices.

### 3.4 Cold-restore acknowledgment

On content-script load, check `document.wasDiscarded`. If true, show a brief, unobtrusive "restored — scroll position kept" indicator instead of the silent reload most suspenders give you — and reuse that exact moment as the activation trigger for the WebGL canvas placeholder swap described in the original document's eviction section. Both features share the same underlying event; there's no reason to wire them up separately.

---

## Part 4 — Trust Architecture (a lesson the tab-suspender category already paid for)

The most popular tab suspender in Chrome history, **The Great Suspender** (2M+ users), was pulled from the Chrome Web Store by Google in February 2021 and flagged as malware. The original developer sold the project to an unidentified buyer in mid-2020; within months a version shipped that fetched and executed code from a remote server — Microsoft had already pulled it from the Edge store over the same issue weeks earlier. Several successor forks have repeated some version of the same pattern since. The category's reputation is genuinely scarred by this, and it's worth designing MemPilot specifically so it can't repeat it, not just because MV3 already forbids remotely-hosted code in general:

- **Compile, don't fetch.** The EasyPrivacy rule pipeline (`abp2dnr`/`tsurlfilter`) should run at build time, shipping signed static JSON — never a runtime fetch-and-eval of filter lists from a third-party server, even a "trusted" one.
- **Keep offscreen-document reasons honest** (Part 1, #2). An extension with a documented habit of stretching API "reasons" past their stated purpose is exactly the kind of codebase a future bad-faith buyer finds easiest to quietly repurpose without tripping review.
- **Minimize standing permissions.** `declarativeNetRequest` + `storage` + `alarms` + `system.memory` + `tabs` covers essentially everything in this document without broad `host_permissions` — a smaller permission footprint is a smaller blast radius if ownership or control ever changes hands, and a smaller warning surface at install time today.
- **Make the rule-compilation step reproducible and inspectable**, so a user or auditor can diff what's actually shipped against upstream EasyPrivacy source — the single biggest thing that would have caught the Great Suspender problem earlier was exactly this kind of diffability.

---

## Part 5 — Roadmap Addendum

Building on the original document's four-phase roadmap:

**Phase 5 — Pressure-Aware Policy Layer**
1. Wire `chrome.system.memory.getInfo()` into the alarm tick; derive the calm/moderate/critical tier (2.4).
2. Read `navigator.deviceMemory` once at onboarding to set a sane default tier (2.5).
3. Move the discard-eligibility check to a single shared `isEligibleForBackgroundReclaim()` used by soft-suspend, native-freeze awareness, and hard-discard alike (2.2).
4. Add the IndexedDB-backed access-pattern store and wire the eviction score (2.7, 3.1).

**Phase 6 — Trust & Agent-Readiness**
1. Harden the offscreen-document justification strings and permission footprint (Part 1 #2, Part 4).
2. Add the honest, multi-source savings ledger (2.1, 3.3) and the cold-restore indicator (3.4).
3. Ship `navigator.modelContext` tool registration behind a MemPilot feature flag, gated on the WebMCP origin trial actually being available in the user's Chrome build (2.10).

---

## Sources

- [chrome.alarms — Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [The extension service worker lifecycle — Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [chrome.offscreen — Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Offscreen Documents in Manifest V3 — Chrome blog](https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3)
- [chrome.tabs — Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Freezing on Energy Saver — Chrome blog](https://developer.chrome.com/blog/freezing-on-energy-saver)
- [chrome.system.memory — Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/system/memory)
- [chrome.privacy — Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/privacy)
- [chrome.storage — Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [chrome.declarativeNetRequest — Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
- [Prerender pages in Chrome — Chrome for Developers](https://developer.chrome.com/docs/web-platform/prerender-pages)
- [Speculation Rules API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API)
- [WebMCP specification — webmachinelearning.github.io](https://webmachinelearning.github.io/webmcp/)
- [WebMCP explainer — GitHub](https://github.com/webmachinelearning/webmcp)
- [Chrome Manifest V3 extension development advice — kzar.co.uk](https://kzar.co.uk/blog/2022/10/29/chrome-manifest-v3-extension-development-advice)
- [The Great Suspender's fall from grace — BleepingComputer](https://www.bleepingcomputer.com/news/security/the-great-suspender-chrome-extensions-fall-from-grace/)
