import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mtime: string;
  mode: number;
}

export class FileSystemManager {
  getHome(): string {
    return os.homedir();
  }

  getDrives(): string[] {
    if (process.platform === 'win32') {
      const drives: string[] = [];
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        try {
          fs.accessSync(`${letter}:\\`);
          drives.push(`${letter}:`);
        } catch {}
      }
      return drives;
    }
    return ['/'];
  }

  async listDir(dirPath: string, showHidden: boolean = false): Promise<FileEntry[]> {
    // Normalize path
    const normalizedPath = path.resolve(dirPath);

    try {
      const entries = fs.readdirSync(normalizedPath, { withFileTypes: true });

      const result: FileEntry[] = [];

      for (const entry of entries) {
        // Skip hidden files unless showHidden is true
        if (!showHidden && entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(normalizedPath, entry.name);

        try {
          const stat = fs.statSync(fullPath);
          result.push({
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            isSymlink: entry.isSymbolicLink(),
            size: stat.size,
            mtime: stat.mtime.toISOString(),
            mode: stat.mode,
          });
        } catch {
          // Permission denied or other error - still add the entry but with limited info
          result.push({
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            isSymlink: entry.isSymbolicLink(),
            size: 0,
            mtime: new Date(0).toISOString(),
            mode: 0,
          });
        }
      }

      // Sort: directories first, then alphabetically
      result.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

      return result;
    } catch (err) {
      throw new Error(`Cannot list directory ${normalizedPath}: ${err}`);
    }
  }

  async stat(filePath: string): Promise<FileEntry | null> {
    try {
      const resolvedPath = path.resolve(filePath);
      const stat = fs.statSync(resolvedPath);
      return {
        name: path.basename(resolvedPath),
        path: resolvedPath,
        isDirectory: stat.isDirectory(),
        isSymlink: stat.isSymbolicLink(),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        mode: stat.mode,
      };
    } catch {
      return null;
    }
  }
}
