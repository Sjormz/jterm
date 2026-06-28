import React, { useState, useCallback, useRef, useEffect } from 'react';
import TabBar from './components/TabBar';
import SplitPane from './components/SplitPane';
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
import {
  TabInfo, SessionInfo,
  PaneNode, TerminalLeaf,
  createLeaf, splitPane, removePane, getAllLeafIds, genId,
} from './types';

export default function App() {
  const [tabs, setTabs] = useState<TabInfo[]>([{
    id: genId('tab'),
    title: 'terminal',
    type: 'local',
    root: createLeaf('local'),
  }]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarSection, setSidebarSection] = useState<'files' | 'ssh' | 'git'>('files');
  const [sshSessions, setSshSessions] = useState<SessionInfo[]>([]);
  const [activeTerminals, setActiveTerminals] = useState<Set<string>>(new Set());

  const getTab = useCallback(
    (tabId: string) => tabs.find((t) => t.id === tabId) || tabs[0],
    [tabs],
  );

  const updateTab = useCallback(
    (tabId: string, updater: (tab: TabInfo) => TabInfo) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? updater(t) : t)),
      );
    },
    [],
  );

  // Track terminal registrations
  const handleTerminalReady = useCallback((termId: string) => {
    setActiveTerminals((prev) => new Set(prev).add(termId));
  }, []);

  // Called when a TerminalPane unmounts
  const handleTerminalRemoved = useCallback(
    (termId: string) => {
      setActiveTerminals((prev) => {
        const next = new Set(prev);
        next.delete(termId);
        return next;
      });
      window.jterm.terminalDestroy({ id: termId }).catch(() => {});
    },
    [],
  );

  // === Tab management ===

  const addTab = useCallback(
    (type: 'local' | 'ssh' = 'local', sshSessionId?: string) => {
      const tab: TabInfo = {
        id: genId('tab'),
        title: type === 'local' ? 'terminal' : `ssh-${sshSessionId?.slice(0, 6)}`,
        type,
        sshSessionId,
        root: createLeaf(type),
      };
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    },
    [],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        if (prev.length <= 1) return prev; // keep at least one tab
        const filtered = prev.filter((t) => t.id !== tabId);

        // Destroy all terminals in the closed tab
        const tab = prev.find((t) => t.id === tabId);
        if (tab) {
          for (const leafId of getAllLeafIds(tab.root)) {
            window.jterm.terminalDestroy({ id: leafId }).catch(() => {});
          }
        }

        if (activeTabId === tabId) {
          const newIdx = Math.min(idx, filtered.length - 1);
          setActiveTabId(filtered[newIdx].id);
        }
        return filtered;
      });
    },
    [activeTabId],
  );

  // === Split / close pane ===

  const handleSplitPane = useCallback(
    (tabId: string, leafId: string, direction: 'horizontal' | 'vertical') => {
      updateTab(tabId, (tab) => ({
        ...tab,
        root: splitPane(tab.root, leafId, direction),
      }));
    },
    [updateTab],
  );

  const handleClosePane = useCallback(
    (tabId: string, leafId: string) => {
      updateTab(tabId, (tab) => {
        const newRoot = removePane(tab.root, leafId);
        if (!newRoot) {
          // No more panes — close the tab entirely
          closeTab(tabId);
          return tab; // won't matter, tab will be removed
        }
        return { ...tab, root: newRoot };
      });
    },
    [updateTab, closeTab],
  );

  // === SSH session management ===

  const handleSSHConnected = useCallback(
    (session: SessionInfo) => {
      setSshSessions((prev) => [...prev, session]);
      addTab('ssh', session.id);
    },
    [addTab],
  );

  const handleSSHDisconnected = useCallback(
    (sessionId: string) => {
      setSshSessions((prev) => prev.filter((s) => s.id !== sessionId));
      // Close any tabs using this SSH session
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.sshSessionId !== sessionId);
        if (remaining.length === 0) {
          const newTab: TabInfo = {
            id: genId('tab'),
            title: 'terminal',
            type: 'local',
            root: createLeaf('local'),
          };
          setActiveTabId(newTab.id);
          return [newTab];
        }
        if (!remaining.find((t) => t.id === activeTabId)) {
          setActiveTabId(remaining[0].id);
        }
        return remaining;
      });
    },
    [activeTabId],
  );

  const activeTab = getTab(activeTabId);

  return (
    <div className="app">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={closeTab}
        onNewTab={() => addTab('local')}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />
      <div className="app-body">
        {sidebarOpen && (
          <Sidebar
            section={sidebarSection}
            onSectionChange={setSidebarSection}
            sshSessions={sshSessions}
            onSSHConnected={handleSSHConnected}
            onSSHDisconnected={handleSSHDisconnected}
          />
        )}
        <div className="terminal-area">
          <SplitPane
            node={activeTab.root}
            tabId={activeTab.id}
            tabType={activeTab.type}
            sshSessionId={activeTab.sshSessionId}
            onTerminalReady={handleTerminalReady}
            onTerminalRemoved={handleTerminalRemoved}
            onSplitPane={(leafId, dir) => handleSplitPane(activeTab.id, leafId, dir)}
            onClosePane={(leafId) => handleClosePane(activeTab.id, leafId)}
          />
        </div>
      </div>
      <StatusBar
        sshSessions={sshSessions}
        activeTerminalsCount={activeTerminals.size}
      />
    </div>
  );
}
