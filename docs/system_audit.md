# MemPilot System Audit

This document provides a comprehensive audit of the **MemPilot** Chrome extension. It outlines the current features, how they are implemented under the hood, the project architecture, and proposes new features to enhance the system.

## 1. Project Architecture

MemPilot is built as an MV3 (Manifest V3) Chrome Extension using **TypeScript**, **React**, and **Vite**. 

### Key Components
- **Background Service Worker (`src/entries/background/index.ts`)**: Initializes the core features (Tab Hibernation and Tracker Blocking) and listens for messages from the popup.
- **Content Script (`src/entries/content/webglEvictor.ts`)**: Injected into all pages at `document_start` to manage WebGL contexts.
- **Popup UI (`src/popup/PopupApp.tsx`)**: A React-based user interface that communicates with the background worker to display stats and manage settings.

---

## 2. Current Features & Implementation

### A. Tab Hibernation
**Goal**: Automatically discard (sleep) tabs that haven't been used for a specified amount of time to free up RAM.

**Implementation Details (`src/features/tab-hibernate`)**:
- **Tracking Activity**: Uses `chrome.tabs.onActivated`, `chrome.tabs.onCreated`, and `chrome.tabs.onRemoved` to track the last active timestamp of every tab in the background state.
- **Periodic Checks**: Uses `chrome.alarms` to periodically check the tab list. If a tab's idle time exceeds the configured timeout (e.g., 30 minutes), it uses `chrome.tabs.discard(tabId)` to unload it from memory.
- **Manual Control**: Exposes messaging endpoints (`DISCARD_TAB`, `DISCARD_ALL_INACTIVE`) so the user can manually trigger hibernation from the popup.

### B. Tracker Blocking
**Goal**: Prevent known tracker scripts and analytics from loading, reducing initial RAM usage and CPU overhead.

**Implementation Details (`src/features/tracker-blocker`)**:
- **Rules Engine**: Uses the modern `chrome.declarativeNetRequest` API (MV3 standard) to block network requests.
- **Dynamic Rules**: Dynamically loads blocking rules based on a hardcoded list of domains (`src/features/tracker-blocker/domains.ts`).
- **Resource Types**: Blocks `SCRIPT`, `XMLHTTPREQUEST`, `SUB_FRAME`, and `IMAGE` requests matching the tracker domains.
- **Toggleable**: The rules are dynamically added or removed based on the user's settings in `chrome.storage.local`.

### C. WebGL VRAM Eviction
**Goal**: Free up GPU Memory (VRAM) when tabs with heavy WebGL content (like maps, games, 3D models) are in the background, and seamlessly restore them when they become active again.

**Implementation Details (`src/features/webgl-eviction`)**:
- **Context Interception**: The content script overrides `HTMLCanvasElement.prototype.getContext` to intercept and track all WebGL contexts created on the page.
- **Visibility Tracking**: Listens to the `visibilitychange` event on the document.
- **Eviction & Restoration**: 
  - When the tab is hidden (`visibilityState === 'hidden'`), it calls the `WEBGL_lose_context` extension's `loseContext()` method to force VRAM eviction.
  - When the tab is visible again, it calls `restoreContext()` to seamlessly resume rendering.

---

## 3. Storage & State Management
- **Settings**: Stored in `chrome.storage.local` (e.g., idle timeout, toggle states for tracker blocking and WebGL eviction).
- **Tab State**: The last active time for tabs is tracked in a local state object in the background worker and persisted/loaded from `chrome.storage.local` to survive service worker restarts.

---

## 4. Proposed Features for Improvement

To take MemPilot to the next level, here are several feature ideas we can implement:

### 1. Domain Whitelisting (Exceptions)
- **What**: Allow users to specify domains (e.g., `youtube.com`, `spotify.com`) that should **never** be hibernated or have their WebGL contexts evicted.
- **How**: Add a UI in the popup to manage a list of domains, and check this list before discarding tabs or evicting VRAM.

### 2. Advanced Tracker Blocking (Blocklists)
- **What**: Instead of a small hardcoded list of domains, support large privacy blocklists (like EasyPrivacy).
- **How**: Fetch and parse standard adblock filter lists and convert them to `declarativeNetRequest` rules dynamically.

### 3. Memory & CPU Metrics Display
- **What**: Show users exactly how much RAM they are saving.
- **How**: Use `chrome.processes` (if available) or estimate memory usage based on the number of discarded tabs. Display a "Total RAM Saved" metric in the popup.

### 4. CPU-based Auto-Hibernation
- **What**: Hibernate tabs that are heavily using the CPU in the background, even if the idle timeout hasn't been reached.
- **How**: Monitor background tab resource usage and aggressively discard tabs that drain battery.

### 5. Auto-Grouping of Idle Tabs
- **What**: Before discarding tabs, group them together into a "Sleeping Tabs" group to declutter the tab bar.
- **How**: Use the `chrome.tabGroups` API to automatically organize discarded tabs.

---

> [!TIP]
> **Next Steps**
> Review the proposed features above. Let me know which features you would like to prioritize, and I will create a detailed technical implementation plan to add them to MemPilot!
