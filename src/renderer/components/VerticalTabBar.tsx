import React, { useState, useEffect } from 'react';
import { TabInfo } from '../types';
import { TerminalTabIcon, LockIcon, XCloseIcon } from '../icons';

interface VerticalTabBarProps {
  tabs: TabInfo[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 30) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Side panel listing the active terminals. The primary tab switcher now
 * lives in the titlebar; this view is a richer secondary list with
 * timestamps, shell info, and quick actions.
 */
export default function VerticalTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
}: VerticalTabBarProps) {
  const [now, setNow] = useState(Date.now());
  const [tabTimestamps, setTabTimestamps] = useState<Record<string, Date>>(() => {
    const map: Record<string, Date> = {};
    for (const tab of tabs) map[tab.id] = new Date();
    return map;
  });

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setTabTimestamps((prev) => {
      const next = { ...prev };
      for (const tab of tabs) if (!next[tab.id]) next[tab.id] = new Date();
      return next;
    });
  }, [tabs]);

  return (
    <div className="vtab-bar" aria-label="Terminal list">
      <div className="vtab-header">
        <span className="vtab-title">Terminals</span>
        <span className="vtab-count">{tabs.length}</span>
      </div>

      <div className="vtab-list">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isSSH = tab.type === 'ssh';
          const TabIcon = isSSH ? LockIcon : TerminalTabIcon;
          const relTime = tabTimestamps[tab.id]
            ? formatRelativeTime(tabTimestamps[tab.id])
            : 'now';

          return (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              className={`vtab-item ${isActive ? 'active' : ''} ${isSSH ? 'ssh' : ''}`}
              onClick={() => onSelectTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectTab(tab.id);
                }
              }}
            >
              <TabIcon size="sm" className="vtab-icon" />
              <div className="vtab-text">
                <div className="vtab-name" title={tab.title}>{tab.title}</div>
                <div className="vtab-sub">
                  {isSSH ? `SSH · ${tab.sshSessionId?.slice(0, 6) ?? ''}` : 'local · pwsh'}
                </div>
              </div>
              <div className="vtab-meta">
                <span className="vtab-time">{relTime}</span>
                {tabs.length > 1 && (
                  <button
                    className="vtab-close"
                    onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                    title="Close terminal"
                    aria-label="Close terminal"
                  >
                    <XCloseIcon size="xs" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
