import * as path from 'path';
import * as fs from 'fs';

// Use simple-git for rich git operations
let simpleGit: any = null;
try {
  simpleGit = require('simple-git');
} catch {
  // fallback: simple-git not available
}

interface GitStatusResult {
  current: string;
  tracking: string;
  files: Array<{
    path: string;
    working_dir: string;
    index: string;
    staged: boolean;
  }>;
  ahead: number;
  behind: number;
  created: string[];
  deleted: string[];
  modified: string[];
  renamed: string[];
  conflicted: string[];
}

interface GitBranchInfo {
  name: string;
  current: boolean;
  commit: string;
  label: string;
}

interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
}

export class GitManager {
  async findRepo(startPath: string): Promise<string | null> {
    let current = path.resolve(startPath);
    const root = process.platform === 'win32' ? current.split(path.sep)[0] + '\\' : '/';

    while (true) {
      const gitDir = path.join(current, '.git');
      try {
        const stat = fs.statSync(gitDir);
        if (stat.isDirectory() || stat.isFile()) {
          return current;
        }
      } catch {}

      if (current === root) break;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  }

  async status(repoPath: string): Promise<GitStatusResult | null> {
    if (!simpleGit) return null;
    try {
      const git = simpleGit(repoPath);
      const status = await git.status();
      return {
        current: status.current,
        tracking: status.tracking || '',
        files: status.files.map((f: any) => ({
          path: f.path,
          working_dir: f.working_dir,
          index: f.index,
          staged: f.staged,
        })),
        ahead: status.ahead,
        behind: status.behind,
        created: status.created,
        deleted: status.deleted,
        modified: status.modified,
        renamed: status.renamed,
        conflicted: status.conflicted,
      };
    } catch {
      return null;
    }
  }

  async branches(repoPath: string): Promise<GitBranchInfo[] | null> {
    if (!simpleGit) return null;
    try {
      const git = simpleGit(repoPath);
      const result = await git.branch();
      return result.all.map((name: string) => ({
        name,
        current: name === result.current,
        commit: result.branches[name]?.commit || '',
        label: result.branches[name]?.label || name,
      }));
    } catch {
      return null;
    }
  }

  async log(repoPath: string, maxCount: number = 20): Promise<GitLogEntry[] | null> {
    if (!simpleGit) return null;
    try {
      const git = simpleGit(repoPath);
      const log = await git.log({ maxCount });
      return log.all.map((entry: any) => ({
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        author_name: entry.author_name,
        author_email: entry.author_email,
      }));
    } catch {
      return null;
    }
  }

  async checkout(repoPath: string, branch: string): Promise<boolean> {
    if (!simpleGit) return false;
    try {
      const git = simpleGit(repoPath);
      await git.checkout(branch);
      return true;
    } catch {
      return false;
    }
  }
}
