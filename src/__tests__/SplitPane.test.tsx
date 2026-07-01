import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../renderer/App';

const mountedTermIds: string[] = [];

vi.mock('../renderer/components/Titlebar', () => ({
  default: () => <div data-testid="titlebar" />,
}));
vi.mock('../renderer/components/VerticalTabBar', () => ({
  default: () => <div data-testid="vertical-tab-bar" />,
}));
vi.mock('../renderer/components/Sidebar', () => ({
  default: () => <div data-testid="sidebar" />,
}));
vi.mock('../renderer/components/StatusBar', () => ({
  default: () => <div data-testid="statusbar" />,
}));
vi.mock('../renderer/components/CommandPalette', () => ({
  default: () => null,
}));
vi.mock('../renderer/components/ShortcutEditor', () => ({
  default: () => null,
}));
vi.mock('../renderer/components/ShellIntegrationHint', () => ({
  default: () => null,
}));
vi.mock('../renderer/components/UpdateBanner', () => ({
  default: () => null,
}));
vi.mock('../renderer/components/TerminalPane', async () => {
  const React = await import('react');

  function MockTerminalPane({
    termId,
    hasSession,
    initialCwd,
    onReady,
    onRemoved,
  }: {
    termId: string;
    hasSession?: boolean;
    initialCwd?: string;
    onReady?: (id: string) => void;
    onRemoved?: (id: string) => void;
  }) {
    React.useEffect(() => {
      mountedTermIds.push(termId);
      if (!hasSession) {
        window.janet.terminalCreate({ id: termId, cwd: initialCwd });
      }
      onReady?.(termId);
      return () => {
        onRemoved?.(termId);
      };
    }, []);

    return <div data-testid={`terminal-${termId}`}>{termId}</div>;
  }

  return { default: MockTerminalPane };
});

beforeEach(() => {
  mountedTermIds.length = 0;
  (window as any).janet = {
    fsGetHome: vi.fn().mockResolvedValue('/home/test'),
    getSettings: vi.fn().mockResolvedValue({ keybindings: {}, workspaceTabs: [] }),
    setSettings: vi.fn().mockResolvedValue(undefined),
    terminalCreate: vi.fn().mockResolvedValue(undefined),
    terminalDestroy: vi.fn().mockResolvedValue(undefined),
    terminalWrite: vi.fn(),
    terminalResize: vi.fn(),
    onTerminalData: vi.fn(() => ({ dispose: vi.fn() })),
    sshCreateShell: vi.fn().mockResolvedValue(undefined),
    sshWriteShell: vi.fn(),
    sshResizeShell: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
  };
});

describe('split panes in the app', () => {
  it('keeps existing terminals alive when splitting deeper panes', async () => {
    render(<App />);

    const splitButton = await screen.findByRole('button', { name: /split right/i });
    expect(mountedTermIds).toHaveLength(1);
    expect(window.janet.terminalCreate).toHaveBeenCalledTimes(1);

    fireEvent.click(splitButton);

    await waitFor(() => {
      expect(screen.getAllByTestId(/terminal-/)).toHaveLength(2);
      expect(mountedTermIds).toHaveLength(2);
      expect(window.janet.terminalCreate).toHaveBeenCalledTimes(2);
      expect(window.janet.terminalDestroy).not.toHaveBeenCalled();
    });

    const splitButtons = screen.getAllByRole('button', { name: /split right/i });
    fireEvent.click(splitButtons[1]);

    await waitFor(() => {
      expect(screen.getAllByTestId(/terminal-/)).toHaveLength(3);
      expect(mountedTermIds).toHaveLength(3);
      expect(window.janet.terminalCreate).toHaveBeenCalledTimes(3);
      expect(window.janet.terminalDestroy).not.toHaveBeenCalled();
    });

    expect(new Set(mountedTermIds).size).toBe(3);
  });

  it('restores saved local workspace tab layouts with their cwd', async () => {
    window.janet.getSettings = vi.fn().mockResolvedValue({
      keybindings: {},
      workspaceTabs: [{
        id: 'workspace-tab-1',
        name: 'JaneT repo',
        type: 'local',
        cwd: 'C:/Users/pckpr/projects/JaneT',
        terminalCount: 3,
        splitDirection: 'vertical',
      }],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByTestId(/terminal-/)).toHaveLength(3);
      expect(window.janet.terminalCreate).toHaveBeenCalledWith(expect.objectContaining({
        cwd: 'C:/Users/pckpr/projects/JaneT',
      }));
    });
  });

  it('restores a saved session with multiple tabs, pane tree, and active tab', async () => {
    window.janet.getSettings = vi.fn().mockResolvedValue({
      keybindings: {},
      workspaceTabs: [],
      session: {
        tabs: [
          {
            id: 'tab-1',
            title: 'project',
            type: 'local',
            cwd: 'C:/repo',
            root: {
              type: 'split',
              direction: 'vertical',
              sizes: [1, 1],
              children: [{ type: 'leaf' }, { type: 'leaf' }],
            },
          },
          {
            id: 'tab-2',
            title: 'docs',
            type: 'local',
            root: { type: 'leaf' },
          },
        ],
        activeTabId: 'tab-1',
        sidebarOpen: true,
        tabsOpen: true,
        sidebarSection: 'files',
      },
    });

    render(<App />);

    // Active tab is `project` (2-leaf split) — we should see 2 terminals
    // both created with the cwd saved in the session, proving the
    // restored tree (not the starter) is what's mounted.
    await waitFor(() => {
      expect(screen.getAllByTestId(/terminal-/)).toHaveLength(2);
    });

    const projectCreates = (window.janet.terminalCreate as any).mock.calls.filter(
      (call: any[]) => call[0]?.cwd === 'C:/repo',
    );
    expect(projectCreates).toHaveLength(2);
  });

  it('persists the open tabs to settings after a tab change', async () => {
    window.janet.getSettings = vi.fn().mockResolvedValue({ keybindings: {}, workspaceTabs: [] });
    window.janet.setSettings = vi.fn().mockResolvedValue(undefined);

    render(<App />);

    // Wait for the initial terminal to mount.
    await waitFor(() => {
      expect(screen.getAllByTestId(/terminal-/)).toHaveLength(1);
    });

    // Split right — adds a leaf to the active tab.
    fireEvent.click(screen.getByRole('button', { name: /split right/i }));

    // Wait past the 500ms debounce window for the save to flush.
    await new Promise((r) => setTimeout(r, 700));

    const calls = (window.janet.setSettings as any).mock.calls as Array<[any]>;
    const sessionCalls = calls.filter(([arg]) => arg && Object.prototype.hasOwnProperty.call(arg, 'session'));
    expect(sessionCalls.length).toBeGreaterThan(0);
    const lastSession = sessionCalls.at(-1)![0].session as any;
    expect(Array.isArray(lastSession.tabs)).toBe(true);
    expect(lastSession.tabs.length).toBeGreaterThan(0);
    // The active tab was split — root should now be a split, not a leaf.
    expect(lastSession.tabs[0].root.type).toBe('split');
  }, 5000);
});
