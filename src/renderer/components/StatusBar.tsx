import React from 'react';
import { SessionInfo } from '../types';

interface StatusBarProps {
  sshSessions: SessionInfo[];
  activeTerminalsCount: number;
}

export default function StatusBar({ sshSessions, activeTerminalsCount }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-item">JTerm v0.1.0</span>
        {sshSessions.length > 0 && (
          <span className="status-item">
            🔒 {sshSessions.length} SSH session{sshSessions.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="status-right">
        <span className="status-item">{activeTerminalsCount} terminal{activeTerminalsCount !== 1 ? 's' : ''}</span>
        <span className="status-item platform">{navigator.platform}</span>
      </div>
    </div>
  );
}
