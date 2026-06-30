import React, { useState, useEffect } from 'react';
import {
  RefreshIcon, ChevronDownIcon, ChevronRightIcon,
  GitCommitIcon, SourceControlIcon as GitBranchIcon, GitMergeIcon,
  TrashIcon, AlertIcon, CircleDotIcon, CircleIcon,
  fileIconFor,
} from '../icons';

interface GitStatusResult {
  current: string;
  files: Array<{ path: string; working_dir: string; index: string; staged: boolean }>;
  ahead: number;
  behind: number;
  created: string[];
  modified: string[];
  deleted: string[];
  conflicted: string[];
}

interface GitBranchInfo {
  name: string;
  current: boolean;
  label: string;
}

interface GitTreeProps {
  /** Cwd of the focused terminal — we look for a repo rooted at or above it. */
  cwd: string;
  /** True once we have a real cwd to search from. */
  cwdReady: boolean;
  /** True if the active tab is an SSH tab. */
  isRemote: boolean;
}

export default function GitTree({ cwd, cwdReady, isRemote }: GitTreeProps) {
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [searching, setSearching] = useState(true);
  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [expandedSection, setExpandedSection] = useState<string>('branches');

  // Whenever the focused terminal's cwd changes, look for a git repo at
  // or above that path. The same auto-follow behavior as the file explorer.
  useEffect(() => {
    if (!cwd) return;
    setSearching(true);
    window.janet.gitFindRepo({ startPath: cwd }).then((repo) => {
      setRepoPath(repo);
      setSearching(false);
      if (repo) loadGitData(repo);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  const loadGitData = async (repo: string) => {
    try {
      const [statusResult, branchesResult] = await Promise.all([
        window.janet.gitStatus({ repoPath: repo }),
        window.janet.gitBranches({ repoPath: repo }),
      ]);
      if (statusResult) setStatus(statusResult);
      if (branchesResult) setBranches(branchesResult);
    } catch {}
  };

  const handleCheckout = async (branchName: string) => {
    if (!repoPath) return;
    try {
      await window.janet.gitCheckout({ repoPath, branch: branchName });
      loadGitData(repoPath);
    } catch {}
  };

  if (searching) {
    return (
      <div className="git-tree">
        <div className="git-header">
          <span className="section-title">Source Control</span>
        </div>
        <div className="git-loading">Searching for git repos…</div>
      </div>
    );
  }

  if (!repoPath) {
    return (
      <div className="git-tree">
        <div className="git-header">
          <span className="section-title">Source Control</span>
        </div>
        <div className="git-empty">No git repo found in home directory</div>
        <div className="git-hint">Navigate to a repo in the file explorer to see git info here</div>
      </div>
    );
  }

  const ExpandIcon = expandedSection === 'branches' ? ChevronDownIcon : ChevronRightIcon;

  return (
    <div className="git-tree">
      <div className="git-header">
        <span className="section-title">Source Control</span>
        <button className="icon-btn" onClick={() => loadGitData(repoPath)} title="Refresh" aria-label="Refresh">
          <RefreshIcon size="sm" />
        </button>
      </div>

      <div className="git-repo-path" title={repoPath}>
        <GitBranchIcon size="xs" /> {status?.current || 'HEAD'}
      </div>

      <div className="git-section">
        <div
          className="git-section-header"
          onClick={() => setExpandedSection(expandedSection === 'branches' ? '' : 'branches')}
        >
          <span className="git-section-title">
            <ExpandIcon size="sm" /> Branches
          </span>
          <span className="badge">{branches.length}</span>
        </div>
        {expandedSection === 'branches' && (
          <div className="git-section-content">
            {branches.map((branch) => {
              const DotIcon = branch.current ? CircleDotIcon : CircleIcon;
              return (
                <div
                  key={branch.name}
                  className={`git-branch-item ${branch.current ? 'current' : ''}`}
                  onClick={() => !branch.current && handleCheckout(branch.name)}
                >
                  <DotIcon size="xs" className="branch-icon" />
                  <span className="branch-name">{branch.name}</span>
                </div>
              );
            })}
            {branches.length === 0 && <div className="git-empty">No branches</div>}
          </div>
        )}
      </div>

      {status && (
        <div className="git-section">
          <div
            className="git-section-header"
            onClick={() => setExpandedSection(expandedSection === 'changes' ? '' : 'changes')}
          >
            <span className="git-section-title">
              {expandedSection === 'changes'
                ? <ChevronDownIcon size="sm" />
                : <ChevronRightIcon size="sm" />}
              Changes
            </span>
            <span className="badge">{status.files.length}</span>
          </div>
          {expandedSection === 'changes' && (
            <div className="git-section-content">
              {status.files.length === 0 && (
                <div className="git-empty">Working tree clean</div>
              )}
              {status.conflicted.length > 0 && (
                <div className="git-conflicts">
                  <div className="git-subheader">
                    <AlertIcon size="xs" /> Conflicts ({status.conflicted.length})
                  </div>
                  {status.conflicted.map((f) => (
                    <div key={f} className="git-file-item conflicted">
                      <AlertIcon size="sm" className="file-status-icon conflicted" />
                      <span className="file-name">{f}</span>
                    </div>
                  ))}
                </div>
              )}
              {status.files.filter((f) => f.staged).map((file) => {
                const ext = file.path.split('.').pop() ?? '';
                const Icon = ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx'
                  ? GitCommitIcon : fileIconFor(file.path, false);
                return (
                  <div key={file.path} className="git-file-item staged">
                    <Icon size="sm" className="file-status-icon staged" />
                    <span className="file-name">{file.path}</span>
                  </div>
                );
              })}
              {status.files.filter((f) => !f.staged).map((file) => {
                const wd = file.working_dir;
                const Icon = wd === 'D' ? TrashIcon
                  : wd === 'R' ? GitMergeIcon
                  : GitCommitIcon;
                return (
                  <div key={file.path} className="git-file-item unstaged">
                    <Icon size="sm" className="file-status-icon unstaged" />
                    <span className="file-name">{file.path}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {status && (status.ahead > 0 || status.behind > 0) && (
        <div className="git-ahead-behind">
          <span className={`ahead ${status.ahead > 0 ? 'active' : ''}`}>↑{status.ahead}</span>
          <span className={`behind ${status.behind > 0 ? 'active' : ''}`}>↓{status.behind}</span>
        </div>
      )}
    </div>
  );
}
