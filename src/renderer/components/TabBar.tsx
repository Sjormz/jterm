import React from 'react';
import { TabInfo } from '../types';

interface TabBarProps {
  tabs: TabInfo[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  sidebarOpen,
  onToggleSidebar,
}: TabBarProps) {
  return (
    <div className="tab-bar">
      <button className="tab-btn sidebar-toggle" onClick={onToggleSidebar} title="Toggle sidebar">
        <span className="icon">{sidebarOpen ? '◀' : '▶'}</span>
      </button>
      <div className="tabs-container">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="tab-title">
              {tab.type === 'ssh' ? '🔒 ' : ''}{tab.title}
            </span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="tab-btn new-tab-btn" onClick={onNewTab} title="New terminal">
          +
        </button>
      </div>
      <div className="tab-actions">
        <button className="tab-btn" onClick={onNewTab} title="New terminal">
          +
        </button>
      </div>
    </div>
  );
}
