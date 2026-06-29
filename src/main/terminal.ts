import * as os from 'os';
import * as path from 'path';
import { spawn, IPty } from 'node-pty';
import { buildShellInit } from './shell-init';

interface TerminalInstance {
  pty: IPty;
  id: string;
}

export class TerminalManager {
  private terminals: Map<string, TerminalInstance> = new Map();

  create(id: string, cwd?: string, shell?: string): IPty {
    const defaultShell = shell || (process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash');
    const defaultCwd = cwd || os.homedir();

    const init = buildShellInit(defaultShell);

    // We pass the init as the first arg to the shell. For PowerShell
    // that's `-NoLogo -NoExit -Command <init>`. For bash/zsh/fish it's
    // `-c '<init>; exec <shell> -i'` so the init runs once and then we
    // get a normal interactive session. For unknown shells, fall back
    // to the bare spawn.
    const base = path.basename(defaultShell).toLowerCase();
    let args: string[] = [];
    if (!init) {
      args = [];
    } else if (base === 'powershell' || base === 'powershell.exe' || base === 'pwsh' || base === 'pwsh.exe') {
      args = ['-NoLogo', '-NoExit', '-Command', init];
    } else if (base === 'bash' || base === 'bash.exe' || base === 'zsh' || base === 'zsh.exe' || base === 'fish' || base === 'fish.exe') {
      // `<init>; exec <shell> -i` — eval the init, then start a fresh
      // interactive shell that inherits the modifications.
      args = ['-c', `${init}\nexec "${defaultShell}" -i`];
    }

    const pty = spawn(defaultShell, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: defaultCwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        // Ensure shells that key on these (some readline configs) stay
        // in their interactive mode.
        SHELL: defaultShell,
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
