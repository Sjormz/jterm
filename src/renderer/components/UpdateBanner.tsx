import React, { useEffect, useState, useCallback } from 'react';

interface UpdateBannerProps {}

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'not-available' }
  | { status: 'error'; message: string };

export default function UpdateBanner(_props: UpdateBannerProps) {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // Start in checking state only after the initial silent check triggers
    unsubs.push(
      window.jterm.onUpdateChecking(() => {
        setState({ status: 'checking' });
      }),
    );

    unsubs.push(
      window.jterm.onUpdateAvailable((info) => {
        setState({ status: 'available', version: info.version });
      }),
    );

    unsubs.push(
      window.jterm.onUpdateNotAvailable(() => {
        setState({ status: 'not-available' });
        // Auto-dismiss after a moment
        const timer = setTimeout(() => setState({ status: 'idle' }), 3000);
        unsubs.push(() => clearTimeout(timer));
      }),
    );

    unsubs.push(
      window.jterm.onUpdateDownloadProgress((progress) => {
        setState({ status: 'downloading', percent: progress.percent });
      }),
    );

    unsubs.push(
      window.jterm.onUpdateDownloaded((info) => {
        setState({ status: 'downloaded', version: info.version });
      }),
    );

    unsubs.push(
      window.jterm.onUpdateError((error) => {
        setState({ status: 'error', message: error.message });
        // Auto-dismiss errors after 10s
        const timer = setTimeout(() => setState({ status: 'idle' }), 10000);
        unsubs.push(() => clearTimeout(timer));
      }),
    );

    return () => unsubs.forEach((fn) => fn());
  }, []);

  const handleDownload = useCallback(() => {
    window.jterm.downloadUpdate().catch(() => {});
  }, []);

  const handleInstall = useCallback(() => {
    window.jterm.installUpdate().catch(() => {});
  }, []);

  const handleDismiss = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  const handleForceCheck = useCallback(() => {
    window.jterm.checkForUpdates().catch(() => {});
  }, []);

  if (state.status === 'idle') return null;

  // --- Banner styles ---
  const bannerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 'calc(var(--status-bar-height, 28px) + 8px)',
    right: '12px',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 14px',
    background: 'var(--glass-bg-strong)',
    backdropFilter: 'blur(var(--glass-blur, 18px))',
    WebkitBackdropFilter: 'blur(var(--glass-blur, 18px))',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--radius-md, 8px)',
    boxShadow: 'var(--glass-shadow)',
    fontSize: '13px',
    fontFamily: 'var(--font-ui)',
    color: 'var(--text-primary)',
    transition: 'opacity var(--transition-fast, 0.15s)',
  };

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    border: 'none',
    borderRadius: 'var(--radius-sm, 6px)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    transition: 'background var(--transition-fast, 0.15s)',
  };

  const primaryButton: React.CSSProperties = {
    ...buttonStyle,
    background: 'var(--blue, #7aa2f7)',
    color: '#fff',
  };

  const secondaryButton: React.CSSProperties = {
    ...buttonStyle,
    background: 'var(--bg-hover, #2a2b42)',
    color: 'var(--text-primary)',
  };

  // Progress bar style
  const progressContainer: React.CSSProperties = {
    width: '120px',
    height: '4px',
    background: 'var(--bg-tertiary, #24253b)',
    borderRadius: '2px',
    overflow: 'hidden',
  };

  const progressFill: React.CSSProperties = {
    height: '100%',
    width: `${state.status === 'downloading' ? state.percent : 0}%`,
    background: 'var(--blue, #7aa2f7)',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  };

  const dismissStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted, #565f89)',
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: 1,
    padding: '0 2px',
    fontFamily: 'var(--font-ui)',
  };

  switch (state.status) {
    case 'checking':
      return (
        <div style={bannerStyle}>
          <span style={{ color: 'var(--text-secondary)' }}>Checking for updates…</span>
        </div>
      );

    case 'available':
      return (
        <div style={bannerStyle}>
          <span style={{ color: 'var(--cyan, #7dcfff)', fontWeight: 600 }}>
            Update v{state.version} available
          </span>
          <button style={primaryButton} onClick={handleDownload}>
            Download
          </button>
          <button style={dismissStyle} onClick={handleDismiss} title="Dismiss">
            &times;
          </button>
        </div>
      );

    case 'downloading':
      return (
        <div style={bannerStyle}>
          <span style={{ color: 'var(--text-secondary)' }}>Downloading update…</span>
          <div style={progressContainer}>
            <div style={progressFill} />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '32px' }}>
            {state.percent}%
          </span>
        </div>
      );

    case 'downloaded':
      return (
        <div style={bannerStyle}>
          <span style={{ color: 'var(--green, #9ece6a)', fontWeight: 600 }}>
            Update v{state.version} ready
          </span>
          <button style={primaryButton} onClick={handleInstall}>
            Restart & Install
          </button>
          <button style={dismissStyle} onClick={handleDismiss} title="Dismiss">
            &times;
          </button>
        </div>
      );

    case 'not-available':
      return (
        <div style={bannerStyle}>
          <span style={{ color: 'var(--text-muted)' }}>You have the latest version</span>
        </div>
      );

    case 'error':
      return (
        <div style={bannerStyle}>
          <span style={{ color: 'var(--red, #f7768e)' }} title={state.message}>
            Update check failed
          </span>
          <button style={secondaryButton} onClick={handleForceCheck}>
            Retry
          </button>
          <button style={dismissStyle} onClick={handleDismiss} title="Dismiss">
            &times;
          </button>
        </div>
      );

    default:
      return null;
  }
}
