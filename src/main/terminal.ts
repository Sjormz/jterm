import * as os from 'os';
import * as path from 'path';
import { spawn, IPty } from 'node-pty';

interface TerminalInstance {
  pty: IPty;
  id: string;
}

export class TerminalManager {
  private terminals: Map<string, TerminalInstance> = new Map();

  create(id: string, cwd?: string, shell?: string): IPty {
    const defaultShell = shell || (process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash');
    const defaultCwd = cwd || os.homedir();

    const pty = spawn(defaultShell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: defaultCwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });

    this.terminals.set(id, { pty, id });
    return pty;
  }

  resize(id: string, cols: number, rows: number): void {
    const term = this.terminals.get(id);
    if (term) {
      term.pty.resize(cols, rows);
    }
  }

  write(id: string, data: string): void {
    const term = this.terminals.get(id);
    if (term) {
      term.pty.write(data);
    }
  }

  destroy(id: string): void {
    const term = this.terminals.get(id);
    if (term) {
      try { term.pty.kill(); } catch {}
      this.terminals.delete(id);
    }
  }

  cleanup(): void {
    for (const [id] of this.terminals) {
      this.destroy(id);
    }
  }
}
