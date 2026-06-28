import React from 'react';
import FileExplorer from './FileExplorer';
import SSHManager from './SSHManager';
import GitTree from './GitTree';
import ThemeSwitcher from './ThemeSwitcher';
import { SessionInfo } from '../types';
import { ThemeName } from '../themes';

type SidebarSection = 'files' | 'ssh' | 'git' | 'settings';

interface SidebarProps {
  section: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  sshSessions: SessionInfo[];
  onSSHConnected: (session: SessionInfo) => void;
  onSSHDisconnected: (sessionId: string) => void;
  currentTheme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  shortcutEditor?: React.ReactNode;
  /** Current working directory of the focused terminal (or home if none). */
  cwd: string;
  /** True once we have a usable cwd to show. */
  cwdReady: boolean;
  /** True if the active tab is an SSH tab. Sidebar shows a notice. */
  isRemote: boolean;
  /** Shell integration copy-paste hints, shown in Settings. */
  shellIntegrationHint?: React.ReactNode;
}

export default function Sidebar({
  section,
  sshSessions,
  onSSHConnected,
  onSSHDisconnected,
  currentTheme,
  onThemeChange,
  fontSize,
  onFontSizeChange,
  shortcutEditor,
  cwd,
  cwdReady,
  isRemote,
  shellIntegrationHint,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-content">
        {section === 'files' && <FileExplorer cwd={cwd} cwdReady={cwdReady} isRemote={isRemote} />}
        {section === 'ssh' && (
          <SSHManager
            sshSessions={sshSessions}
            onConnected={onSSHConnected}
            onDisconnected={onSSHDisconnected}
          />
        )}
        {section === 'git' && <GitTree cwd={cwd} cwdReady={cwdReady} isRemote={isRemote} />}
        {section === 'settings' && (
          <>
            <ThemeSwitcher
              currentTheme={currentTheme}
              onThemeChange={onThemeChange}
              fontSize={fontSize}
              onFontSizeChange={onFontSizeChange}
            />
            {shortcutEditor}
            {shellIntegrationHint}
          </>
        )}
      </div>
    </div>
  );
}
