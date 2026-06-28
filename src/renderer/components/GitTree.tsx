import React, { useState, useEffect, useCallback } from 'react';

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

export default function GitTree() {
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [searching, setSearching] = useState(true);
  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [expandedSection, setExpandedSection] = useState<string>('branches');

  // Try to find git repo starting from home
  useEffect(() => {
    window.jterm.fsGetHome().then((home) => {
      window.jterm.gitFindRepo({ startPath: home }).then((repo) => {
        setRepoPath(repo);
        setSearching(false);
        if (repo) {
          loadGitData(repo);
        }
      });
    });
  }, []);

  const loadGitData = async (repo: string) => {
    try {
      const [statusResult, branchesResult] = await Promise.all([
        window.jterm.gitStatus({ repoPath: repo }),
        window.jterm.gitBranches({ repoPath: repo }),
      ]);
      if (statusResult) setStatus(statusResult);
      if (branchesResult) setBranches(branchesResult);
    } catch {}
  };

  const handleCheckout = async (branchName: string) => {
    if (!repoPath) return;
    try {
      await window.jterm.gitCheckout({ repoPath, branch: branchName });
      loadGitData(repoPath);
    } catch {}
  };

  const getStatusIcon = (workingDir: string, index: string): string => {
    if (index === 'M' || index === 'A') return '📝';
    if (workingDir === 'M') return '✏️';
    if (workingDir === 'D' || index === 'D') return '🗑️';
    if (workingDir === '?' || workingDir === '??') return '❓';
    if (workingDir === 'U' || index === 'U') return '⚠️';
    if (index === 'R') return '🔀';
    return '📄';
  };

  if (searching) {
    return (
      <div className="git-tree">
        <div className="git-header">
          <span className="section-title">Git</span>
        </div>
        <div className="git-loading">Searching for git repos...</div>
      </div>
    );
  }

  if (!repoPath) {
    return (
      <div className="git-tree">
        <div className="git-header">
          <span className="section-title">Git</span>
        </div>
        <div className="git-empty">No git repo found in home directory</div>
        <div className="git-hint">Navigate to a repo in the file explorer to see git info here</div>
      </div>
    );
  }

  return (
    <div className="git-tree">
      <div className="git-header">
        <span className="section-title">Git</span>
        <button className="icon-btn" onClick={() => loadGitData(repoPath)} title="Refresh">
          ↻
        </button>
      </div>

      <div className="git-repo-path" title={repoPath}>
        {(status?.current || '')}
      </div>

      {/* Branches section */}
      <div className="git-section">
        <div
          className="git-section-header"
          onClick={() => setExpandedSection(expandedSection === 'branches' ? '' : 'branches')}
        >
          <span>{expandedSection === 'branches' ? '▼' : '▶'} Branches</span>
          <span className="badge">{branches.length}</span>
        </div>
        {expandedSection === 'branches' && (
          <div className="git-section-content">
            {branches.map((branch) => (
              <div
                key={branch.name}
                className={`git-branch-item ${branch.current ? 'current' : ''}`}
                onClick={() => !branch.current && handleCheckout(branch.name)}
              >
                <span className="branch-icon">{branch.current ? '●' : '○'}</span>
                <span className="branch-name">{branch.name}</span>
              </div>
            ))}
            {branches.length === 0 && <div className="git-empty">No branches</div>}
          </div>
        )}
      </div>

      {/* Changes section */}
      {status && (
        <div className="git-section">
          <div
            className="git-section-header"
            onClick={() => setExpandedSection(expandedSection === 'changes' ? '' : 'changes')}
          >
            <span>{expandedSection === 'changes' ? '▼' : '▶'} Changes</span>
            <span className="badge">{status.files.length}</span>
          </div>
          {expandedSection === 'changes' && (
            <div className="git-section-content">
              {status.files.length === 0 && (
                <div className="git-empty">Working tree clean</div>
              )}
              {status.conflicted.length > 0 && (
                <div className="git-conflicts">
                  <div className="git-subheader">Conflicts ({status.conflicted.length})</div>
                  {status.conflicted.map((f) => (
                    <div key={f} className="git-file-item conflicted">
                      <span className="file-status-icon">⚠️</span>
                      <span className="file-name">{f}</span>
                    </div>
                  ))}
                </div>
              )}
              {status.files.filter(f => f.staged).map((file) => (
                <div key={file.path} className="git-file-item staged">
                  <span className="file-status-icon">{getStatusIcon(file.working_dir, file.index)}</span>
                  <span className="file-name">{file.path}</span>
                </div>
              ))}
              {status.files.filter(f => !f.staged).map((file) => (
                <div key={file.path} className="git-file-item unstaged">
                  <span className="file-status-icon">{getStatusIcon(file.working_dir, file.index)}</span>
                  <span className="file-name">{file.path}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ahead/Behind */}
      {status && (status.ahead > 0 || status.behind > 0) && (
        <div className="git-ahead-behind">
          <span className={`ahead ${status.ahead > 0 ? 'active' : ''}`}>
            ↑{status.ahead}
          </span>
          <span className={`behind ${status.behind > 0 ? 'active' : ''}`}>
            ↓{status.behind}
          </span>
        </div>
      )}
    </div>
  );
}
