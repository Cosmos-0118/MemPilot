import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import './Popup.css';

/* ================================================================
   Types
   ================================================================ */
interface TabInfo {
  id?: number;
  title: string;
  url: string;
  favIconUrl: string;
  discarded: boolean;
  active: boolean;
  pinned: boolean;
  audible?: boolean;
  lastActive?: number;
}

interface Stats {
  activeTabs: number;
  discardedTabs: number;
  totalTabs: number;
  totalDiscarded: number;
  totalMemorySavedMB: number;
  currentlySleepingMB: number;
  blockedDomainCount: number;
  idleTimeoutMinutes: number;
  isEnabled: boolean;
  trackerBlockingEnabled: boolean;
  webglEvictionEnabled: boolean;
  tabs: TabInfo[];
}

/* ================================================================
   SVG Icons (inline for zero network requests)
   ================================================================ */
const Icons = {
  Logo: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill="var(--accent-primary)" />
      <path d="M7 8h10M7 12h7M7 16h10" stroke="var(--text-inverse)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  Moon: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  Sun: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  Skull: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
      <path d="M8 20v1h8v-1" /><path d="M12 2C6.48 2 2 6.48 2 10c0 3 2 5.5 5 7v3h10v-3c3-1.5 5-4 5-7 0-3.52-4.48-8-10-8z" />
    </svg>
  ),
  Zap: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Shield: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Gpu: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  ),
  Clock: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Sleep: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  X: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Globe: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  Pin: () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" opacity="0.5">
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
    </svg>
  ),
  Loader: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="loader-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  ),
  ChevronDown: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  Check: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
};

const TIMEOUT_OPTIONS = [
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '60 minutes' },
] as const;

/* ================================================================
   Helpers
   ================================================================ */
const isExtension = (): boolean => {
  try {
    return typeof chrome !== 'undefined' && !!chrome?.runtime?.sendMessage;
  } catch { return false; }
};

const sendMessage = (message: Record<string, unknown>): Promise<Stats | null> => {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response: Stats) => {
        if (chrome.runtime.lastError) {
          console.warn('MemPilot:', chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch {
      resolve(null);
    }
  });
};

const formatMemory = (mb: number): string => {
  if (!Number.isFinite(mb) || mb <= 0) return '0 MB';
  if (mb >= 1024 * 1024) return `${(mb / (1024 * 1024)).toFixed(1)} TB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
};

const formatCount = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const sortTabsForDisplay = (tabs: TabInfo[]): TabInfo[] =>
  [...tabs].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.discarded !== b.discarded) return a.discarded ? 1 : -1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.lastActive ?? 0) - (a.lastActive ?? 0);
  });

const timeAgo = (timestamp: number | undefined): string => {
  if (!timestamp) return 'Unknown';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const getDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Favicons from other extensions/chrome pages cannot load in our popup (web_accessible_resources). */
const canLoadFaviconInPopup = (favIconUrl: string): boolean => {
  if (!favIconUrl) return false;
  try {
    const parsed = new URL(favIconUrl);
    if (parsed.protocol === 'chrome-extension:') {
      return isExtension() && parsed.host === chrome.runtime.id;
    }
    if (parsed.protocol === 'chrome:') return false;
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'data:';
  } catch {
    return false;
  }
};

/* ================================================================
   Mock data for development outside Chrome
   ================================================================ */
const MOCK_STATS: Stats = {
  activeTabs: 12,
  discardedTabs: 8,
  totalTabs: 20,
  totalDiscarded: 47,
  totalMemorySavedMB: 3760,
  currentlySleepingMB: 640,
  blockedDomainCount: 29,
  idleTimeoutMinutes: 15,
  isEnabled: true,
  trackerBlockingEnabled: true,
  webglEvictionEnabled: true,
  tabs: [
    { id: 1, title: 'Google Docs — Project Roadmap Q3 2025 Planning Document with Extended Title', url: 'https://docs.google.com/document/d/abc', favIconUrl: '', discarded: false, active: true, pinned: false, lastActive: Date.now() },
    { id: 2, title: 'GitHub — MemPilot Repository', url: 'https://github.com/user/mempilot', favIconUrl: '', discarded: false, active: false, pinned: true, lastActive: Date.now() - 120000 },
    { id: 3, title: 'YouTube — Never Gonna Give You Up', url: 'https://youtube.com/watch?v=dQw4w9WgXcQ', favIconUrl: '', discarded: false, active: false, pinned: false, lastActive: Date.now() - 900000 },
    { id: 4, title: 'Stack Overflow — How to reduce Chrome memory usage', url: 'https://stackoverflow.com/questions/123', favIconUrl: '', discarded: true, active: false, pinned: false, lastActive: Date.now() - 3600000 },
    { id: 5, title: 'Twitter', url: 'https://twitter.com', favIconUrl: '', discarded: true, active: false, pinned: false, lastActive: Date.now() - 7200000 },
    { id: 6, title: 'Reddit — r/webdev', url: 'https://reddit.com/r/webdev', favIconUrl: '', discarded: false, active: false, pinned: false, lastActive: Date.now() - 300000 },
    { id: 7, title: 'Figma — MemPilot Design System', url: 'https://figma.com/file/abc', favIconUrl: '', discarded: true, active: false, pinned: false, lastActive: Date.now() - 5400000 },
    { id: 8, title: 'Linear — Sprint Board', url: 'https://linear.app/team/board', favIconUrl: '', discarded: false, active: false, pinned: false, lastActive: Date.now() - 600000 },
  ],
};

/* ================================================================
   Custom timeout dropdown (replaces native select)
   ================================================================ */
const TimeoutDropdown: React.FC<{
  value: number;
  onChange: (minutes: number) => void;
}> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = TIMEOUT_OPTIONS.find((o) => o.value === value) ?? TIMEOUT_OPTIONS[1];

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="timeout-dropdown" ref={rootRef}>
      <button
        type="button"
        className={`timeout-dropdown-trigger${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Idle timeout: ${selected.label}`}
      >
        <span className="timeout-dropdown-value">{selected.label}</span>
        <span className={`timeout-dropdown-chevron${isOpen ? ' is-open' : ''}`} aria-hidden="true">
          <Icons.ChevronDown />
        </span>
      </button>

      {isOpen && (
        <ul className="timeout-dropdown-menu" role="listbox" aria-label="Idle timeout">
          {TIMEOUT_OPTIONS.map((option) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`timeout-dropdown-option${isSelected ? ' is-selected' : ''}`}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {isSelected && (
                    <span className="timeout-dropdown-check" aria-hidden="true">
                      <Icons.Check />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/* ================================================================
   Theme Toggle Component
   ================================================================ */
const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const themes: { key: Theme; icon: React.FC; label: string }[] = [
    { key: 'light', icon: Icons.Sun, label: 'Light' },
    { key: 'dark', icon: Icons.Moon, label: 'Dark' },
    { key: 'vampire', icon: Icons.Skull, label: 'Vampire' },
  ];

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Theme selection">
      {themes.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          className={`theme-btn ${theme === key ? 'active' : ''}`}
          onClick={() => setTheme(key)}
          title={label}
          role="radio"
          aria-checked={theme === key}
          aria-label={`${label} theme`}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
};

/* ================================================================
   Tab Row Component
   ================================================================ */
const TabRow: React.FC<{
  tab: TabInfo;
  onDiscard: (id: number) => void;
  isDiscarding: boolean;
}> = ({ tab, onDiscard, isDiscarding }) => {
  const domain = getDomain(tab.url);
  const showFavicon = canLoadFaviconInPopup(tab.favIconUrl);

  return (
    <div className={`tab-row ${tab.discarded ? 'discarded' : ''} ${tab.active ? 'is-active' : ''}`}>
      <div className="tab-favicon">
        {showFavicon ? (
          <img
            src={tab.favIconUrl}
            alt=""
            width="16"
            height="16"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <span className={`tab-favicon-fallback ${showFavicon ? 'hidden' : ''}`}>
          <Icons.Globe />
        </span>
      </div>

      <div className="tab-info">
        <div className="tab-title" title={tab.title}>
          {tab.pinned && <span className="tab-pin" aria-hidden="true"><Icons.Pin /></span>}
          <span className="tab-title-text">{tab.title}</span>
        </div>
        <span className="tab-meta">
          {domain}
          {!tab.discarded && !tab.active && tab.lastActive && (
            <> · {timeAgo(tab.lastActive)}</>
          )}
        </span>
      </div>

      <div className="tab-actions">
        {tab.discarded ? (
          <span className="tab-status-chip sleeping">
            <span className="chip-icon" aria-hidden="true"><Icons.Sleep /></span>
            <span className="chip-label">Sleeping</span>
          </span>
        ) : tab.active ? (
          <span className="tab-status-chip active-badge">
            <span className="chip-dot" aria-hidden="true" />
            <span className="chip-label">Active</span>
          </span>
        ) : tab.pinned ? (
          <span className="tab-status-chip pinned-badge">
            <span className="chip-icon" aria-hidden="true"><Icons.Pin /></span>
            <span className="chip-label">Pinned</span>
          </span>
        ) : tab.audible ? (
          <span className="tab-status-chip audible-badge">
            <span className="chip-dot chip-dot-pulse" aria-hidden="true" />
            <span className="chip-label">Playing</span>
          </span>
        ) : (
          <button
            className="tab-discard-btn"
            onClick={() => tab.id && onDiscard(tab.id)}
            disabled={isDiscarding}
            title="Put to sleep"
            aria-label={`Put ${tab.title} to sleep`}
          >
            {isDiscarding ? <Icons.Loader /> : <Icons.X />}
          </button>
        )}
      </div>
    </div>
  );
};

/* ================================================================
   Main Popup Component
   ================================================================ */
const Popup: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [discardingAll, setDiscardingAll] = useState(false);
  const [discardingTab, setDiscardingTab] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (isExtension()) {
      const result = await sendMessage({ type: 'GET_STATS' });
      if (result) {
        setStats(result);
        setError(null);
      } else {
        setError('Could not reach MemPilot background. Try reopening the popup.');
      }
    } else {
      setStats(MOCK_STATS);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void fetchStats(); }, 0);
    return () => window.clearTimeout(initial);
  }, [fetchStats]);

  useEffect(() => {
    if (!isExtension()) return;

    const interval = window.setInterval(() => { void fetchStats(); }, 4000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchStats();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchStats]);

  const handleDiscardAll = async () => {
    setDiscardingAll(true);
    if (isExtension()) {
      const result = await sendMessage({ type: 'DISCARD_ALL_INACTIVE' });
      if (result) setStats(result);
    }
    setDiscardingAll(false);
  };

  const handleDiscardTab = async (tabId: number) => {
    setDiscardingTab(tabId);
    if (isExtension()) {
      const result = await sendMessage({ type: 'DISCARD_TAB', tabId });
      if (result) setStats(result);
    } else {
      // Mock: mark as discarded
      setStats(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          tabs: prev.tabs.map(t => t.id === tabId ? { ...t, discarded: true } : t),
          activeTabs: prev.activeTabs - 1,
          discardedTabs: prev.discardedTabs + 1,
          currentlySleepingMB: prev.currentlySleepingMB + 80,
          totalMemorySavedMB: prev.totalMemorySavedMB + 80,
          totalDiscarded: prev.totalDiscarded + 1,
        };
      });
    }
    setDiscardingTab(null);
  };

  const handleToggleAutoHibernate = async () => {
    if (!stats) return;
    const nextEnabled = !stats.isEnabled;
    if (isExtension()) {
      await sendMessage({ type: 'SET_SETTINGS', isEnabled: nextEnabled });
      await fetchStats();
    } else {
      setStats(prev => prev ? { ...prev, isEnabled: nextEnabled } : prev);
    }
  };

  const handleChangeTimeout = async (minutes: number) => {
    if (!stats) return;
    if (isExtension()) {
      await sendMessage({ type: 'SET_SETTINGS', idleTimeoutMinutes: minutes });
      await fetchStats();
    } else {
      setStats(prev => prev ? { ...prev, idleTimeoutMinutes: minutes } : prev);
    }
  };

  const handleToggleTrackerBlocking = async () => {
    if (!stats) return;
    const nextEnabled = !stats.trackerBlockingEnabled;
    if (isExtension()) {
      await sendMessage({ type: 'SET_SETTINGS', trackerBlockingEnabled: nextEnabled });
      await fetchStats();
    } else {
      setStats(prev => prev ? { ...prev, trackerBlockingEnabled: nextEnabled } : prev);
    }
  };

  const handleToggleWebGLEviction = async () => {
    if (!stats) return;
    const nextEnabled = !stats.webglEvictionEnabled;
    if (isExtension()) {
      await sendMessage({ type: 'SET_SETTINGS', webglEvictionEnabled: nextEnabled });
      await fetchStats();
    } else {
      setStats(prev => prev ? { ...prev, webglEvictionEnabled: nextEnabled } : prev);
    }
  };

  /* ---- Loading State ---- */
  if (loading) {
    return (
      <div className="popup-container">
        <div className="loading-state">
          <Icons.Loader />
          <span>Loading MemPilot...</span>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="popup-container">
        <div className="loading-state error-state">
          <span>{error ?? 'Failed to load. Please reload the extension.'}</span>
          <button type="button" className="retry-btn" onClick={() => { setLoading(true); fetchStats(); }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const memorySavedDisplay = formatMemory(stats.totalMemorySavedMB);
  const sleepingNowDisplay = formatMemory(stats.currentlySleepingMB);
  const activeInactiveTabs = stats.tabs.filter(
    t => !t.discarded && !t.active && !t.pinned && !t.audible,
  );
  const sortedTabs = sortTabsForDisplay(stats.tabs);
  const heroValueClass =
    memorySavedDisplay.length > 10
      ? 'hero-value hero-value-compact'
      : 'hero-value';

  return (
    <div className="popup-container">
      {/* ---- Header ---- */}
      <header className="popup-header">
        <div className="logo-area">
          <Icons.Logo />
          <h1 className="logo-text">MemPilot</h1>
        </div>
        <ThemeToggle />
      </header>

      {/* ---- Hero Stats ---- */}
      <section className="hero-card">
        <span className="hero-label">Total Memory Saved</span>
        <span className={heroValueClass} title={memorySavedDisplay}>{memorySavedDisplay}</span>
        {stats.currentlySleepingMB > 0 && (
          <span className="hero-caption" title={`${sleepingNowDisplay} in sleeping tabs right now`}>
            {sleepingNowDisplay} currently in sleeping tabs
          </span>
        )}
        <div className="hero-sub-stats">
          <div className="hero-stat">
            <span className="hero-stat-value">{stats.activeTabs}</span>
            <span className="hero-stat-label">Active</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-value sleeping-color">{stats.discardedTabs}</span>
            <span className="hero-stat-label">Sleeping</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-value accent-color">{stats.totalTabs}</span>
            <span className="hero-stat-label">Total</span>
          </div>
        </div>
      </section>

      {/* ---- Action Button ---- */}
      <button
        className="action-btn"
        onClick={handleDiscardAll}
        disabled={discardingAll || activeInactiveTabs.length === 0}
        aria-label="Hibernate all inactive tabs"
      >
        {discardingAll ? (
          <><Icons.Loader /> Hibernating...</>
        ) : (
          <><Icons.Zap /> Hibernate {activeInactiveTabs.length > 0
            ? `${activeInactiveTabs.length} ${activeInactiveTabs.length === 1 ? 'Tab' : 'Tabs'}`
            : 'Tabs'}</>
        )}
      </button>

      {/* ---- Tab List ---- */}
      <section className="tab-section">
        <div className="section-header">
          <span className="section-title">Open Tabs</span>
          <span className="section-count">{stats.totalTabs}</span>
        </div>
        <div className="tab-list">
          {stats.tabs.length === 0 ? (
            <div className="empty-state">No tabs open</div>
          ) : (
            sortedTabs.map((tab) => (
              <TabRow
                key={tab.id ?? `${tab.url}-${tab.title}`}
                tab={tab}
                onDiscard={handleDiscardTab}
                isDiscarding={discardingTab === tab.id}
              />
            ))
          )}
        </div>
      </section>

      {/* ---- Protection / Interactive Features ---- */}
      <section className="features-section">
        <div className="section-header">
          <span className="section-title">Protection</span>
        </div>

        {/* Tracker Blocking */}
        <div className="feature-row">
          <div className="feature-icon-wrap accent-bg"><Icons.Shield /></div>
          <div className="feature-info">
            <span className="feature-name">Tracker Blocking</span>
            <span className="feature-desc">
              {stats.trackerBlockingEnabled
                ? `${stats.blockedDomainCount} tracker domains blocked`
                : 'Allocation blocking paused'}
            </span>
          </div>
          <label className="switch" aria-label="Toggle Tracker Blocking">
            <input
              type="checkbox"
              checked={stats.trackerBlockingEnabled}
              onChange={handleToggleTrackerBlocking}
            />
            <span className="slider"></span>
          </label>
        </div>

        {/* WebGL Eviction */}
        <div className="feature-row">
          <div className="feature-icon-wrap warning-bg"><Icons.Gpu /></div>
          <div className="feature-info">
            <span className="feature-name">WebGL Eviction</span>
            <span className="feature-desc">
              {stats.webglEvictionEnabled ? 'GPU VRAM reclaim active' : 'VRAM reclamation paused'}
            </span>
          </div>
          <label className="switch" aria-label="Toggle WebGL Eviction">
            <input
              type="checkbox"
              checked={stats.webglEvictionEnabled}
              onChange={handleToggleWebGLEviction}
            />
            <span className="slider"></span>
          </label>
        </div>

        {/* Auto-Hibernate */}
        <div className="feature-row feature-row--stacked">
          <div className="feature-icon-wrap success-bg"><Icons.Clock /></div>
          <div className="feature-info">
            <span className="feature-name">Auto-Hibernate</span>
            {stats.isEnabled ? (
              <TimeoutDropdown
                value={stats.idleTimeoutMinutes}
                onChange={handleChangeTimeout}
              />
            ) : (
              <span className="feature-desc">Automatic suspension disabled</span>
            )}
          </div>
          <label className="switch" aria-label="Toggle Auto-Hibernate">
            <input
              type="checkbox"
              checked={stats.isEnabled}
              onChange={handleToggleAutoHibernate}
            />
            <span className="slider"></span>
          </label>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="popup-footer">
        MemPilot v1.0 · {formatCount(stats.totalDiscarded)} tabs hibernated all-time
      </footer>
    </div>
  );
};

export default Popup;
