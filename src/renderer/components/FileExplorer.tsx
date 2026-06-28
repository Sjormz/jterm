import React, { useState, useEffect, useCallback } from 'react';

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mtime: string;
}

export default function FileExplorer() {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Record<string, FileEntry[]>>({});

  // Initialize with home directory
  useEffect(() => {
    window.jterm.fsGetHome().then((home) => {
      setCurrentPath(home);
    });
  }, []);

  // Load directory contents when path changes
  useEffect(() => {
    if (!currentPath) return;
    loadDirectory(currentPath);
  }, [currentPath, showHidden]);

  const loadDirectory = async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.jterm.fsListDir({ dirPath, showHidden });
      setEntries(result);
    } catch (err: any) {
      setError(err.message || 'Failed to list directory');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const navigateTo = (dirPath: string) => {
    setHistory(prev => [...prev, currentPath]);
    setCurrentPath(dirPath);
  };

  const goBack = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory(prev => prev.slice(0, -1));
      setCurrentPath(prev);
    }
  };

  const toggleExpand = async (dirPath: string) => {
    if (expandedDirs.has(dirPath)) {
      setExpandedDirs(prev => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    } else {
      // Load the directory contents
      try {
        const result = await window.jterm.fsListDir({ dirPath, showHidden: false });
        setDirContents(prev => ({ ...prev, [dirPath]: result }));
      } catch {}
      setExpandedDirs(prev => new Set(prev).add(dirPath));
    }
  };

  const handleFileClick = (entry: FileEntry) => {
    if (entry.isDirectory) {
      navigateTo(entry.path);
    }
  };

  // Get the path segments for breadcrumb
  const pathSegments = currentPath.split(/[/\\]/).filter(Boolean);

  return (
    <div className="file-explorer">
      <div className="explorer-header">
        <span className="section-title">Explorer</span>
        <div className="explorer-toolbar">
          <button className="icon-btn" onClick={goBack} disabled={history.length === 0} title="Go back">
            ←
          </button>
          <button className="icon-btn" onClick={() => setShowHidden(!showHidden)} title="Show hidden files">
            {showHidden ? '👁' : '👁‍🗨'}
          </button>
          <button className="icon-btn" onClick={() => loadDirectory(currentPath)} title="Refresh">
            ↻
          </button>
        </div>
      </div>

      <div className="explorer-breadcrumb">
        {currentPath.startsWith('/') && (
          <button className="crumb" onClick={() => navigateTo('/')}>/</button>
        )}
        {currentPath.match(/^[A-Z]:/) && (
          <button className="crumb drive-crumb" onClick={async () => {
            const drives = await window.jterm.fsGetDrives();
            // Just go to drive root
            const driveRoot = currentPath.substring(0, 3);
            navigateTo(driveRoot);
          }}>
            {currentPath.substring(0, 2)}
          </button>
        )}
        {pathSegments.map((seg, i) => {
          const pathSoFar = currentPath.split(/[/\\]/).slice(0, i + 1).join('/');
          // Fix Windows paths
          const isDrive = seg.match(/^[A-Z]:$/i) || seg.match(/^[A-Z]$/i);
          if (isDrive && i === 0) return null; // Skip drive letter in breadcrumb after button
          return (
            <React.Fragment key={pathSoFar}>
              <span className="crumb-sep">/</span>
              <button className="crumb" onClick={() => navigateTo(pathSoFar)}>
                {seg}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div className="explorer-tree">
        {loading && <div className="explorer-loading">Loading...</div>}
        {error && <div className="explorer-error">{error}</div>}

        {/* Current directory entries */}
        {entries.map((entry) => (
          <div
            key={entry.path}
            className={`explorer-item ${entry.isDirectory ? 'dir' : 'file'}`}
            onClick={() => handleFileClick(entry)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', entry.path);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className="item-icon">
              {entry.isDirectory ? (expandedDirs.has(entry.path) ? '📂' : '📁') : getFileIcon(entry.name)}
            </span>
            <span className="item-name">{entry.name}</span>
          </div>
        ))}

        {!loading && entries.length === 0 && !error && (
          <div className="explorer-empty">Empty directory</div>
        )}
      </div>
    </div>
  );
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    js: '📜', ts: '📘', jsx: '⚛️', tsx: '⚛️',
    py: '🐍', rs: '🦀', go: '🔷',
    json: '📋', yaml: '📋', yml: '📋', toml: '📋',
    md: '📝', txt: '📄',
    html: '🌐', css: '🎨', scss: '🎨',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️',
    mp3: '🎵', wav: '🎵', mp4: '🎬',
    zip: '📦', tar: '📦', gz: '📦',
    exe: '⚙️', dll: '⚙️',
    gitignore: '🙈',
    lock: '🔒',
  };
  return iconMap[ext || ''] || '📄';
}
