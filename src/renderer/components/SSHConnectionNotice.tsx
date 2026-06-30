import React from 'react';
import { ServerIcon } from '../icons';

interface SSHConnectionNoticeProps {
  visible: boolean;
  label?: string;
}

export default function SSHConnectionNotice({ visible, label }: SSHConnectionNoticeProps) {
  if (!visible) return null;

  return (
    <div className="ssh-terminal-notice" data-testid="ssh-terminal-notice" aria-live="polite">
      <ServerIcon size="sm" className="ssh-terminal-notice-icon" />
      <div className="ssh-terminal-notice-text">
        <div className="ssh-terminal-notice-title">
          {label ? `Connected to ${label}` : 'SSH session connected'}
        </div>
        <div className="ssh-terminal-notice-subtitle">Waiting for shell output…</div>
      </div>
    </div>
  );
}
