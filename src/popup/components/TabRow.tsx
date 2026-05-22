import React from 'react';
import { canLoadFaviconInPopup } from '../../shared/lib/favicon';
import { timeAgo } from '../../shared/lib/format';
import { getDomain } from '../../shared/lib/tabDisplay';
import { Icons } from '../../shared/icons';
import type { TabInfo } from '../../shared/types/stats';

export const TabRow: React.FC<{
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
          {tab.pinned && (
            <span className="tab-pin" aria-hidden="true">
              <Icons.Pin />
            </span>
          )}
          <span className="tab-title-text">{tab.title}</span>
        </div>
        <span className="tab-meta">
          {domain}
          {!tab.discarded && !tab.active && tab.lastActive && <> · {timeAgo(tab.lastActive)}</>}
        </span>
      </div>

      <div className="tab-actions">
        {tab.discarded ? (
          <span className="tab-status-chip sleeping">
            <span className="chip-icon" aria-hidden="true">
              <Icons.Sleep />
            </span>
            <span className="chip-label">Sleeping</span>
          </span>
        ) : tab.active ? (
          <span className="tab-status-chip active-badge">
            <span className="chip-dot" aria-hidden="true" />
            <span className="chip-label">Active</span>
          </span>
        ) : tab.pinned ? (
          <span className="tab-status-chip pinned-badge">
            <span className="chip-icon" aria-hidden="true">
              <Icons.Pin />
            </span>
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
