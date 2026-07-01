import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export function runCleanup(entries: unknown[]): void {
  for (const entry of entries) {
    try {
      if (typeof entry === 'function') entry();
      else if (entry && typeof (entry as { dispose?: () => void }).dispose === 'function') {
        (entry as { dispose: () => void }).dispose();
      }
    } catch (e) {
      console.warn('[JaneT] cleanup error:', e);
    }
  }
}
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import SearchOverlay from './SearchOverlay';
import SSHConnectionNotice from './SSHConnectionNotice';
import { getTheme, ThemeName } from '../themes';
import { useKeybindings } from '../KeybindingsContext';
import { matchesShortcut } from '../keybindings';
import { fileUrlToPath } from '../osc7';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  termId: string;
  tabType: 'local' | 'ssh';
  sshSessionId?: string;
  sshSessionLabel?: string;
  onReady: (termId: string) => void;
  onRemoved: (termId: string) => void;
  themeName?: string;
  fontSize?: number;
  onCwdChange?: (termId: string, cwd: string) => void;
  onFocus?: (termId: string) => void;
  initialCwd?: string;
  hasSession?: boolean;
  /**
   * Called when the user clicks "Retry" on the SSH notice after the
   * initial shell-open call rejected (or stalled past the timeout).
   * App re-runs `ssh:createShell` and updates the term's data listener
   * to wire the new shell's output.
   */
  onSshRetry?: (termId: string) => void;
}

const REMOUNT_DISPOSE_DELAY_MS = 250;
const SSH_STALL_TIMEOUT_MS = 10_000;

type SshNoticeState =
  | { kind: 'hidden' }
  | { kind: 'waiting' }
  | { kind: 'stalled' }
  | { kind: 'error'; message: string }
  | { kind: 'reconnecting' };

interface CachedTerminalPane {
  term: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  cleanup: unknown[];
  tabType: 'local' | 'ssh';
  sshSessionId?: string;
  disposeTimer: ReturnType<typeof setTimeout> | null;
}

const terminalPaneCache = new Map<string, CachedTerminalPane>();

function disposeCachedTerminal(termId: string): void {
  const cached = terminalPaneCache.get(termId);
  if (!cached) return;
  if (cached.disposeTimer) clearTimeout(cached.disposeTimer);
  runCleanup(cached.cleanup);
  cached.cleanup = [];
  cached.term.dispose();
  terminalPaneCache.delete(termId);
}

function scheduleCachedTerminalDispose(termId: string): void {
  const cached = terminalPaneCache.get(termId);
  if (!cached || cached.disposeTimer) return;
  cached.disposeTimer = setTimeout(() => {
    disposeCachedTerminal(termId);
  }, REMOUNT_DISPOSE_DELAY_MS);
}

export default function TerminalPane({
  termId,
  tabType,
  sshSessionId,
  sshSessionLabel,
  onReady,
  onRemoved,
  themeName,
  fontSize,
  onCwdChange,
  onFocus,
  initialCwd,
  hasSession,
  onSshRetry,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ resultIndex: 0, resultCount: 0 });
  // SSH notice state machine. The notice stays hidden until the shell
  // actually opens (sshCreateShell resolves) — only then do we switch
  // to `waiting`. A 10s timer without data promotes us to `stalled`,
  // an IPC rejection jumps to `error`, both of which expose a Retry
  // button so the user can recover without closing the tab.
  const [sshNotice, setSshNotice] = useState<SshNoticeState>(() => {
    if (tabType !== 'ssh') return { kind: 'hidden' };
    // hasSession=true means a previous mount already opened the shell
    // and the term is reused from cache — don't flash a notice on
    // remount if the data listener will fire momentarily.
    return hasSession ? { kind: 'hidden' } : { kind: 'hidden' };
  });
  const searchVisibleRef = useRef(false);
  searchVisibleRef.current = searchVisible;

  const { bindings: kbBindings } = useKeybindings();

  const kbBindingsRef = useRef(kbBindings);
  kbBindingsRef.current = kbBindings;

  const closeSearch = () => {
    setSearchVisible(false);
    setSearchQuery('');
    setSearchResults({ resultIndex: 0, resultCount: 0 });
    if (searchAddonRef.current) {
      searchAddonRef.current.findNext('', { decorations: {} as any } as any);
    }
    termRef.current?.focus();
  };

  const clearStallTimer = () => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  };

  // Called by the data listener when any chunk of shell output arrives.
  // First chunk dismisses the visible notice and cancels the stall
  // timer so we don't promote a healthy connection to "stalled".
  const onShellOutput = () => {
    clearStallTimer();
    setSshNotice({ kind: 'hidden' });
  };

  // Drive the "stalled" promotion from notice state. Whenever the
  // notice becomes `waiting` or `reconnecting`, arm a timer that
  // promotes to `stalled` if no shell output arrives. Any output
  // (via the data listener) cancels the timer and hides the notice.
  useEffect(() => {
    if (sshNotice.kind !== 'waiting' && sshNotice.kind !== 'reconnecting') {
      clearStallTimer();
      return;
    }
    clearStallTimer();
    const timer = setTimeout(() => {
      setSshNotice((prev) => (prev.kind === 'waiting' || prev.kind === 'reconnecting' ? { kind: 'stalled' } : prev));
    }, SSH_STALL_TIMEOUT_MS);
    stallTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [sshNotice.kind]);

  const doSearch = (query: string, dir: 'next' | 'prev' = 'next') => {
    if (!query || !searchAddonRef.current) {
      setSearchResults({ resultIndex: 0, resultCount: 0 });
      return;
    }
    const options = {
      decorations: {
        searchHighlight: true,
        matchOverviewRuler: true,
      } as any,
    };
    searchAddonRef.current[dir === 'next' ? 'findNext' : 'findPrevious'](query, options);
  };


  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cached = terminalPaneCache.get(termId);
    if (cached && cached.tabType === tabType && cached.sshSessionId === sshSessionId) {
      if (cached.disposeTimer) {
        clearTimeout(cached.disposeTimer);
        cached.disposeTimer = null;
      }

      const mountCleanup: unknown[] = [];
      const { term, fitAddon, searchAddon } = cached;

      if (term.element && term.element.parentElement !== container) {
        container.appendChild(term.element);
      } else if (!term.element) {
        term.open(container);
      }

      try { fitAddon.fit(); } catch {}

      const resultsDisposable = searchAddon.onDidChangeResults((results) => {
        setSearchResults(results);
      });
      mountCleanup.push(resultsDisposable);

      const resizeObserver = new ResizeObserver(() => {
        try { fitAddon.fit(); } catch {}
      });
      resizeObserver.observe(container);
      mountCleanup.push(() => resizeObserver.disconnect());

      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      const notifyResize = () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          try {
            fitAddon.fit();
            const dims = fitAddon.proposeDimensions();
            if (dims) {
              if (tabType === 'local') {
                window.janet.terminalResize({ id: termId, cols: dims.cols, rows: dims.rows });
              } else if (tabType === 'ssh') {
                window.janet.sshResizeShell({ termId, cols: dims.cols, rows: dims.rows });
              }
            }
          } catch {}
        }, 150);
      };

      const initialResizeTimer = setTimeout(notifyResize, 0);
      mountCleanup.push(() => clearTimeout(initialResizeTimer));
      mountCleanup.push(() => { if (resizeTimer) clearTimeout(resizeTimer); });

      window.addEventListener('resize', notifyResize);
      mountCleanup.push(() => window.removeEventListener('resize', notifyResize));

      const clickListener = () => term.focus();
      container.addEventListener('click', clickListener);
      mountCleanup.push(() => container.removeEventListener('click', clickListener));

      const focusListener = () => onFocus?.(termId);
      container.addEventListener('focusin', focusListener);
      mountCleanup.push(() => container.removeEventListener('focusin', focusListener));

      termRef.current = term;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;
      onReady(termId);

      return () => {
        runCleanup(mountCleanup);
        onRemoved(termId);
        scheduleCachedTerminalDispose(termId);
        termRef.current = null;
        fitAddonRef.current = null;
        searchAddonRef.current = null;
      };
    }

    if (cached) disposeCachedTerminal(termId);

    const resolvedTheme = themeName ? getTheme(themeName as ThemeName).xterm : undefined;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: fontSize || 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
      lineHeight: 1.2,
      theme: resolvedTheme || {
        background: '#0f0f1a',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
        selectionBackground: '#33467c',
        black: '#1d1f2b',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
        brightBlack: '#414868',
        brightRed: '#f7768e',
        brightGreen: '#9ece6a',
        brightYellow: '#e0af68',
        brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff',
        brightWhite: '#c0caf5',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    searchAddon.onDidChangeResults((results) => {
      setSearchResults(results);
    });

    term.open(container);
    fitAddon.fit();

    if (hasSession) {
      onReady(termId);
    } else if (tabType === 'local') {
      window.janet.terminalCreate({ id: termId, cwd: initialCwd }).then(() => {
        onReady(termId);
      }).catch(console.error);
    } else if (tabType === 'ssh' && sshSessionId) {
      const dims = fitAddon.proposeDimensions();
      const openShell = window.janet.sshCreateShell({
        id: sshSessionId,
        termId,
        cols: dims?.cols || 80,
        rows: dims?.rows || 24,
      });
      openShell.then(() => {
        onReady(termId);
        term.focus();
        // Shell opened on the server. The dedicated effect below will
        // arm a stall timer; if a data event arrives first (the
        // common case), the listener hides the notice.
        setSshNotice((prev) => (prev.kind === 'hidden' ? { kind: 'waiting' } : prev));
      }).catch((err: any) => {
        console.error('Failed to open SSH shell:', err);
        onReady(termId);
        setSshNotice({
          kind: 'error',
          message: err?.message || 'Failed to open SSH shell. The connection may have dropped.',
        });
      });
    }

    const disposable = term.onData((data) => {
      if (tabType === 'local') {
        window.janet.terminalWrite({ id: termId, data });
      } else if (tabType === 'ssh') {
        window.janet.sshWriteShell({ termId, data });
      }
    });
    cleanupRef.current.push(() => disposable.dispose());

    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    resizeObserver.observe(container);
    cleanupRef.current.push(() => resizeObserver.disconnect());

    let resizeTimer: any;
    const notifyResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          fitAddon.fit();
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            if (tabType === 'local') {
              window.janet.terminalResize({ id: termId, cols: dims.cols, rows: dims.rows });
            } else if (tabType === 'ssh') {
              window.janet.sshResizeShell({ termId, cols: dims.cols, rows: dims.rows });
            }
          }
        } catch {}
      }, 150);
    };

    setTimeout(notifyResize, 100);

    window.addEventListener('resize', notifyResize);
    cleanupRef.current.push(() => window.removeEventListener('resize', notifyResize));

    const clickListener = () => term.focus();
    container.addEventListener('click', clickListener);
    cleanupRef.current.push(() => container.removeEventListener('click', clickListener));

    const focusListener = () => onFocus?.(termId);
    container.addEventListener('focusin', focusListener);
    cleanupRef.current.push(() => container.removeEventListener('focusin', focusListener));

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    let lastReportedCwd: string | null = initialCwd || null;
    if (initialCwd) onCwdChange?.(termId, initialCwd);

    let cwdDebounce: ReturnType<typeof setTimeout> | null = null;
    const reportCwd = (newCwd: string) => {
      if (newCwd === lastReportedCwd) return;
      lastReportedCwd = newCwd;
      if (cwdDebounce) clearTimeout(cwdDebounce);
      cwdDebounce = setTimeout(() => {
        onCwdChange?.(termId, newCwd);
      }, 80);
    };

    const oscDisposable = term.parser.registerOscHandler(7, (data) => {
      const path = fileUrlToPath(data);
      if (path) reportCwd(path);
      return true;
    });
    cleanupRef.current.push(() => oscDisposable.dispose());
    cleanupRef.current.push(() => {
      if (cwdDebounce) clearTimeout(cwdDebounce);
    });

    const cleanupListener = window.janet.onTerminalData(({ id, data }) => {
      if (id === termId) {
        if (tabType === 'ssh') {
          onShellOutput();
        }
        term.write(data);
      }
    });
    cleanupRef.current.push(cleanupListener);
    cleanupRef.current.push(clearStallTimer);

    terminalPaneCache.set(termId, {
      term,
      fitAddon,
      searchAddon,
      cleanup: cleanupRef.current,
      tabType,
      sshSessionId,
      disposeTimer: null,
    });

    term.attachCustomKeyEventHandler((e) => {
      const currentBindings = kbBindingsRef.current;
      if (matchesShortcut(e, currentBindings['search-toggle'])) {
        e.preventDefault();
        setSearchVisible((v) => !v);
        return false;
      }
      if (e.key === 'Escape' && searchVisibleRef.current) {
        e.preventDefault();
        closeSearch();
        return false;
      }
      return true;
    });

    return () => {
      clearStallTimer();
      onRemoved(termId);
      scheduleCachedTerminalDispose(termId);
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [termId, tabType, sshSessionId, initialCwd, onReady, onRemoved, onFocus, onCwdChange]);

  useEffect(() => {
    if (termRef.current && themeName) {
      const themeDef = getTheme(themeName as ThemeName);
      termRef.current.options.theme = themeDef.xterm;
    }
  }, [themeName]);

  useEffect(() => {
    if (termRef.current && fontSize) {
      termRef.current.options.fontSize = fontSize;
      setTimeout(() => {
        try { fitAddonRef.current?.fit(); } catch {}
      }, 10);
    }
  }, [fontSize]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (fitAddonRef.current) {
        try { fitAddonRef.current.fit(); } catch {}
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="terminal-container" ref={containerRef}>
      <SearchOverlay
        query={searchQuery}
        results={searchResults}
        visible={searchVisible}
        onQueryChange={(q) => {
          setSearchQuery(q);
          if (q) {
            doSearch(q);
          } else {
            setSearchResults({ resultIndex: 0, resultCount: 0 });
            if (searchAddonRef.current) {
              searchAddonRef.current.findNext('', { decorations: {} as any } as any);
            }
          }
        }}
        onNext={() => doSearch(searchQuery, 'next')}
        onPrev={() => doSearch(searchQuery, 'prev')}
        onClose={closeSearch}
      />
      <SSHConnectionNotice
        state={sshNotice}
        label={sshSessionLabel}
        onDismiss={() => {
          clearStallTimer();
          setSshNotice({ kind: 'hidden' });
        }}
        onRetry={onSshRetry ? () => {
          setSshNotice({ kind: 'reconnecting' });
          onSshRetry(termId);
        } : undefined}
      />
    </div>
  );
}
