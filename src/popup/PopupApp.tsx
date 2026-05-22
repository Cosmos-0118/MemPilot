import React, { useState } from 'react';
import { formatCount, formatMemory } from '../shared/lib/format';
import { sortTabsForDisplay } from '../shared/lib/tabDisplay';
import { Icons } from '../shared/icons';
import { TabRow } from './components/TabRow';
import { ThemeToggle } from './components/ThemeToggle';
import { TimeoutDropdown } from './components/TimeoutDropdown';
import { usePopupStats } from './hooks/usePopupStats';
import { isExtension, sendPopupMessage } from './lib/messaging';
import './styles/Popup.css';

const PopupApp: React.FC = () => {
  const { stats, setStats, loading, setLoading, error, fetchStats, refresh } = usePopupStats();
  const [discardingAll, setDiscardingAll] = useState(false);
  const [discardingTab, setDiscardingTab] = useState<number | null>(null);

  const handleDiscardAll = async () => {
    setDiscardingAll(true);
    if (isExtension()) {
      const result = await sendPopupMessage({ type: 'DISCARD_ALL_INACTIVE' });
      if (result) setStats(result);
    }
    setDiscardingAll(false);
  };

  const handleDiscardTab = async (tabId: number) => {
    setDiscardingTab(tabId);
    if (isExtension()) {
      const result = await sendPopupMessage({ type: 'DISCARD_TAB', tabId });
      if (result) setStats(result);
    } else if (stats) {
      setStats({
        ...stats,
        tabs: stats.tabs.map((t) => (t.id === tabId ? { ...t, discarded: true } : t)),
        activeTabs: stats.activeTabs - 1,
        discardedTabs: stats.discardedTabs + 1,
        currentlySleepingMB: stats.currentlySleepingMB + 80,
        totalMemorySavedMB: stats.totalMemorySavedMB + 80,
        totalDiscarded: stats.totalDiscarded + 1,
      });
    }
    setDiscardingTab(null);
  };

  const handleToggleAutoHibernate = async () => {
    if (!stats) return;
    const nextEnabled = !stats.isEnabled;
    if (isExtension()) {
      await sendPopupMessage({ type: 'SET_SETTINGS', isEnabled: nextEnabled });
      await refresh();
    } else {
      setStats({ ...stats, isEnabled: nextEnabled });
    }
  };

  const handleChangeTimeout = async (minutes: number) => {
    if (!stats) return;
    if (isExtension()) {
      await sendPopupMessage({ type: 'SET_SETTINGS', idleTimeoutMinutes: minutes });
      await refresh();
    } else {
      setStats({ ...stats, idleTimeoutMinutes: minutes });
    }
  };

  const handleToggleTrackerBlocking = async () => {
    if (!stats) return;
    const nextEnabled = !stats.trackerBlockingEnabled;
    if (isExtension()) {
      await sendPopupMessage({ type: 'SET_SETTINGS', trackerBlockingEnabled: nextEnabled });
      await refresh();
    } else {
      setStats({ ...stats, trackerBlockingEnabled: nextEnabled });
    }
  };

  const handleToggleWebGLEviction = async () => {
    if (!stats) return;
    const nextEnabled = !stats.webglEvictionEnabled;
    if (isExtension()) {
      await sendPopupMessage({ type: 'SET_SETTINGS', webglEvictionEnabled: nextEnabled });
      await refresh();
    } else {
      setStats({ ...stats, webglEvictionEnabled: nextEnabled });
    }
  };

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
          <button
            type="button"
            className="retry-btn"
            onClick={() => {
              setLoading(true);
              void fetchStats();
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const memorySavedDisplay = formatMemory(stats.totalMemorySavedMB);
  const sleepingNowDisplay = formatMemory(stats.currentlySleepingMB);
  const activeInactiveTabs = stats.tabs.filter(
    (t) => !t.discarded && !t.active && !t.pinned && !t.audible,
  );
  const sortedTabs = sortTabsForDisplay(stats.tabs);
  const heroValueClass =
    memorySavedDisplay.length > 10 ? 'hero-value hero-value-compact' : 'hero-value';

  return (
    <div className="popup-container">
      <header className="popup-header">
        <div className="logo-area">
          <Icons.Logo />
          <h1 className="logo-text">MemPilot</h1>
        </div>
        <ThemeToggle />
      </header>

      <section className="hero-card">
        <span className="hero-label">Total Memory Saved</span>
        <span className={heroValueClass} title={memorySavedDisplay}>
          {memorySavedDisplay}
        </span>
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

      <button
        className="action-btn"
        onClick={handleDiscardAll}
        disabled={discardingAll || activeInactiveTabs.length === 0}
        aria-label="Hibernate all inactive tabs"
      >
        {discardingAll ? (
          <>
            <Icons.Loader /> Hibernating...
          </>
        ) : (
          <>
            <Icons.Zap /> Hibernate{' '}
            {activeInactiveTabs.length > 0
              ? `${activeInactiveTabs.length} ${activeInactiveTabs.length === 1 ? 'Tab' : 'Tabs'}`
              : 'Tabs'}
          </>
        )}
      </button>

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

      <section className="features-section">
        <div className="section-header">
          <span className="section-title">Protection</span>
        </div>

        <div className="feature-row">
          <div className="feature-icon-wrap accent-bg">
            <Icons.Shield />
          </div>
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

        <div className="feature-row">
          <div className="feature-icon-wrap warning-bg">
            <Icons.Gpu />
          </div>
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

        <div className="feature-row feature-row--stacked">
          <div className="feature-icon-wrap success-bg">
            <Icons.Clock />
          </div>
          <div className="feature-info">
            <span className="feature-name">Auto-Hibernate</span>
            {stats.isEnabled ? (
              <TimeoutDropdown value={stats.idleTimeoutMinutes} onChange={handleChangeTimeout} />
            ) : (
              <span className="feature-desc">Automatic suspension disabled</span>
            )}
          </div>
          <label className="switch" aria-label="Toggle Auto-Hibernate">
            <input type="checkbox" checked={stats.isEnabled} onChange={handleToggleAutoHibernate} />
            <span className="slider"></span>
          </label>
        </div>
      </section>

      <footer className="popup-footer">
        MemPilot v1.0 · {formatCount(stats.totalDiscarded)} tabs hibernated all-time
      </footer>
    </div>
  );
};

export default PopupApp;
