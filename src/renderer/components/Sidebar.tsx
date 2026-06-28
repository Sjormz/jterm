import React from 'react';
import FileExplorer from './FileExplorer';
import SSHManager from './SSHManager';
import GitTree from './GitTree';
import { SessionInfo } from '../types';

interface SidebarProps {
  section: 'files' | 'ssh' | 'git';
  onSectionChange: (section: 'files' | 'ssh' | 'git') => void;
  sshSessions: SessionInfo[];
  onSSHConnected: (session: SessionInfo) => void;
  onSSHDisconnected: (sessionId: string) => void;
}

export default function Sidebar({
  section,
  onSectionChange,
  sshSessions,
  onSSHConnected,
  onSSHDisconnected,
}: SidebarProps) {
  const sections: Array<{ key: 'files' | 'ssh' | 'git'; label: string; icon: string }> = [
    { key: 'files', label: 'Files', icon: '📁' },
    { key: 'ssh', label: 'SSH', icon: '🔒' },
    { key: 'git', label: 'Git', icon: '⎇' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-tabs">
        {sections.map((s) => (
          <button
            key={s.key}
            className={`sidebar-tab ${section === s.key ? 'active' : ''}`}
            onClick={() => onSectionChange(s.key)}
            title={s.label}
          >
            <span>{s.icon}</span>
          </button>
        ))}
      </div>
      <div className="sidebar-content">
        {section === 'files' && <FileExplorer />}
        {section === 'ssh' && (
          <SSHManager
            sshSessions={sshSessions}
            onConnected={onSSHConnected}
            onDisconnected={onSSHDisconnected}
          />
        )}
        {section === 'git' && <GitTree />}
      </div>
    </div>
  );
}
