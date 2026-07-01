import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import { KeybindingsProvider } from '../renderer/KeybindingsContext';

class MockResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

class MockAddonFit {
  fit = vi.fn();
  proposeDimensions = vi.fn(() => ({ cols: 80, rows: 24 }));
}

class MockAddonSearch {
  onDidChangeResults = vi.fn(() => ({ dispose: vi.fn() }));
  findNext = vi.fn();
  findPrevious = vi.fn();
}

class MockTerminal {
  static instances: MockTerminal[] = [];

  options: Record<string, unknown> = {};
  element: HTMLElement | undefined;
  parser = {
    registerOscHandler: vi.fn(() => ({ dispose: vi.fn() })),
  };
  onData = vi.fn(() => ({ dispose: vi.fn() }));
  loadAddon = vi.fn();
  open = vi.fn();
  focus = vi.fn();
  dispose = vi.fn();
  attachCustomKeyEventHandler = vi.fn();
  write = vi.fn();

  constructor(options: Record<string, unknown>) {
    this.options = options;
    MockTerminal.instances.push(this);
  }
}

const terminalCreate = vi.fn(() => Promise.resolve({ pid: 123 }));
const terminalResize = vi.fn(() => Promise.resolve());
const terminalWrite = vi.fn(() => Promise.resolve());
const terminalDestroy = vi.fn(() => Promise.resolve());
let sshCreateShellImpl: () => Promise<unknown> = () => Promise.resolve({ connected: true });
const sshCreateShell = vi.fn(() => sshCreateShellImpl());
const sshResizeShell = vi.fn(() => Promise.resolve());
const sshWriteShell = vi.fn(() => Promise.resolve());
let terminalDataHandler: ((params: { id: string; data: string }) => void) | null = null;
const onTerminalData = vi.fn((cb: (params: { id: string; data: string }) => void) => {
  terminalDataHandler = cb;
  return () => { terminalDataHandler = null; };
});

vi.mock('@xterm/xterm', () => ({
  Terminal: MockTerminal,
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: MockAddonFit,
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class MockWebLinksAddon {},
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: MockAddonSearch,
}));

vi.mock('../renderer/components/SearchOverlay', () => ({
  default: () => null,
}));

vi.mock('../renderer/osc7', () => ({
  fileUrlToPath: vi.fn(() => null),
}));

beforeEach(() => {
  vi.clearAllMocks();
  MockTerminal.instances = [];
  MockTerminal.prototype.open = vi.fn(function open(this: MockTerminal, parent: HTMLElement) {
    if (!this.element) this.element = document.createElement('div');
    this.element.dataset.testid = 'xterm-dom';
    parent.appendChild(this.element);
  });
  vi.stubGlobal('ResizeObserver', MockResizeObserver as unknown as typeof ResizeObserver);
  sshCreateShellImpl = () => Promise.resolve({ connected: true });
  terminalDataHandler = null;
  Object.defineProperty(window, 'janet', {
    configurable: true,
    value: {
      terminalCreate,
      terminalResize,
      terminalWrite,
      terminalDestroy,
      onTerminalData,
      sshCreateShell,
      sshResizeShell,
      sshWriteShell,
    },
  });
});

async function loadTerminalPane() {
  return import('../renderer/components/TerminalPane');
}

describe('TerminalPane SSH reinitialization', () => {
  it('creates a new SSH shell when the pane switches from a local terminal to SSH props', async () => {
    const { default: TerminalPane } = await loadTerminalPane();
    const onReady = vi.fn();
    const onRemoved = vi.fn();

    const { rerender } = render(
      <KeybindingsProvider>
        <TerminalPane
          termId="term-local"
          tabType="local"
          onReady={onReady}
          onRemoved={onRemoved}
          themeName="tokyo-night"
        />
      </KeybindingsProvider>,
    );

    expect(terminalCreate).toHaveBeenCalledTimes(1);
    expect(sshCreateShell).not.toHaveBeenCalled();

    rerender(
      <KeybindingsProvider>
        <TerminalPane
          termId="term-ssh"
          tabType="ssh"
          sshSessionId="ssh-17"
          sshSessionLabel="skynet"
          onReady={onReady}
          onRemoved={onRemoved}
          themeName="tokyo-night"
        />
      </KeybindingsProvider>,
    );

    await waitFor(() => {
      expect(sshCreateShell).toHaveBeenCalledTimes(1);
    });
    expect(sshCreateShell).toHaveBeenCalledWith({
      id: 'ssh-17',
      termId: 'term-ssh',
      cols: 80,
      rows: 24,
    });
  });

  it('reuses the xterm instance when the same pane remounts during a split reshape', async () => {
    vi.useFakeTimers();
    const { default: TerminalPane } = await loadTerminalPane();
    const onReady = vi.fn();
    const onRemoved = vi.fn();

    const { unmount } = render(
      <KeybindingsProvider>
        <TerminalPane
          termId="term-reused"
          tabType="local"
          onReady={onReady}
          onRemoved={onRemoved}
          themeName="tokyo-night"
        />
      </KeybindingsProvider>,
    );

    expect(MockTerminal.instances).toHaveLength(1);
    expect(terminalCreate).toHaveBeenCalledTimes(1);
    expect(MockTerminal.instances[0].dispose).not.toHaveBeenCalled();

    unmount();

    expect(onRemoved).toHaveBeenCalledWith('term-reused');
    expect(MockTerminal.instances[0].dispose).not.toHaveBeenCalled();

    render(
      <KeybindingsProvider>
        <TerminalPane
          termId="term-reused"
          tabType="local"
          hasSession
          onReady={onReady}
          onRemoved={onRemoved}
          themeName="tokyo-night"
        />
      </KeybindingsProvider>,
    );

    expect(MockTerminal.instances).toHaveLength(1);
    expect(terminalCreate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);

    expect(MockTerminal.instances[0].dispose).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });
});

describe('TerminalPane SSH notice', () => {
  it('does not show the notice until the shell actually opens', async () => {
    const { default: TerminalPane } = await loadTerminalPane();
    // sshCreateShell won't resolve until we explicitly resolve it.
    let resolveShell: (value: unknown) => void = () => {};
    sshCreateShellImpl = () => new Promise((res) => { resolveShell = res; });

    render(
      <KeybindingsProvider>
        <TerminalPane
          termId="term-ssh"
          tabType="ssh"
          sshSessionId="ssh-1"
          sshSessionLabel="box"
          onReady={vi.fn()}
          onRemoved={vi.fn()}
          themeName="tokyo-night"
        />
      </KeybindingsProvider>,
    );

    // Before sshCreateShell resolves, the notice is hidden.
    expect(document.querySelector('[data-testid="ssh-terminal-notice"]')).toBeNull();

    // After the shell opens, the notice flips to "waiting".
    resolveShell({ connected: true });
    await waitFor(() => {
      expect(document.querySelector('[data-testid="ssh-terminal-notice"]'))
        ?.toHaveAttribute('data-state', 'waiting');
    });
  });

  it('hides the notice as soon as the first chunk of shell output arrives', async () => {
    const { default: TerminalPane } = await loadTerminalPane();

    render(
      <KeybindingsProvider>
        <TerminalPane
          termId="term-ssh-2"
          tabType="ssh"
          sshSessionId="ssh-2"
          onReady={vi.fn()}
          onRemoved={vi.fn()}
          themeName="tokyo-night"
        />
      </KeybindingsProvider>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-testid="ssh-terminal-notice"]'))
        ?.toHaveAttribute('data-state', 'waiting');
    });

    // Simulate the SSH server sending the first prompt byte.
    expect(terminalDataHandler).toBeTruthy();
    terminalDataHandler!({ id: 'term-ssh-2', data: '$ ' });

    await waitFor(() => {
      expect(document.querySelector('[data-testid="ssh-terminal-notice"]')).toBeNull();
    });
  });

  it('shows an error state with a retry button when sshCreateShell rejects', async () => {
    const { default: TerminalPane } = await loadTerminalPane();
    const onSshRetry = vi.fn();
    sshCreateShellImpl = () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:22'));

    render(
      <KeybindingsProvider>
        <TerminalPane
          termId="term-ssh-3"
          tabType="ssh"
          sshSessionId="ssh-3"
          onReady={vi.fn()}
          onRemoved={vi.fn()}
          onSshRetry={onSshRetry}
          themeName="tokyo-night"
        />
      </KeybindingsProvider>,
    );

    await waitFor(() => {
      const el = document.querySelector('[data-testid="ssh-terminal-notice"]');
      expect(el).toHaveAttribute('data-state', 'error');
      expect(el?.textContent).toContain('connect ECONNREFUSED 127.0.0.1:22');
    });

    fireEvent.click(document.querySelector('[data-testid="ssh-notice-retry"]')!);
    expect(onSshRetry).toHaveBeenCalledWith('term-ssh-3');
  });

  it('allows the user to dismiss the notice manually', async () => {
    const { default: TerminalPane } = await loadTerminalPane();

    render(
      <KeybindingsProvider>
        <TerminalPane
          termId="term-ssh-4"
          tabType="ssh"
          sshSessionId="ssh-4"
          onReady={vi.fn()}
          onRemoved={vi.fn()}
          themeName="tokyo-night"
        />
      </KeybindingsProvider>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-testid="ssh-terminal-notice"]'))
        ?.toHaveAttribute('data-state', 'waiting');
    });

    fireEvent.click(document.querySelector('[data-testid="ssh-notice-dismiss"]')!);
    expect(document.querySelector('[data-testid="ssh-terminal-notice"]')).toBeNull();
  });

  it('promotes "waiting" to "stalled" after the timeout when no output arrives', async () => {
    vi.useFakeTimers();
    try {
      const { default: TerminalPane } = await loadTerminalPane();
      render(
        <KeybindingsProvider>
          <TerminalPane
            termId="term-ssh-5"
            tabType="ssh"
            sshSessionId="ssh-5"
            onReady={vi.fn()}
            onRemoved={vi.fn()}
            onSshRetry={vi.fn()}
            themeName="tokyo-night"
          />
        </KeybindingsProvider>,
      );

      // Let the SSH shell open and the notice transition to "waiting",
      // then push past the stall timeout in one go.
      await vi.advanceTimersByTimeAsync(10_500);

      const notice = document.querySelector('[data-testid="ssh-terminal-notice"]');
      expect(notice).toHaveAttribute('data-state', 'stalled');
    } finally {
      vi.useRealTimers();
    }
  });
});
