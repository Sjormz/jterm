import React from 'react';
import { SidebarSection } from './Titlebar';
import { FilesIcon, SSHIcon, SourceControlIcon, SettingsIconCmp } from '../icons';

interface ActivityBarProps {
  section: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  sidebarOpen: boolean;
}

/**
 * DEPRECATED: section nav is now embedded in the titlebar.
 * Kept as a thin re-export so legacy imports keep working during the
 * transition. Renders nothing.
 */
export default function ActivityBar(_props: ActivityBarProps) {
  return null;
}

// Re-export for convenience
export type { SidebarSection };
export { FilesIcon, SSHIcon, SourceControlIcon, SettingsIconCmp };
