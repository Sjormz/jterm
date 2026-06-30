import { Client, ClientChannel } from 'ssh2';

interface SSHConnection {
  client: Client;
  id: string;
  config: {
    host: string;
    port: number;
    username: string;
  };
  shells: Map<string, ClientChannel>;
  pendingWrites: Map<string, string[]>;
}

interface SSHShellHandle {
  onData: (cb: (data: string) => void) => void;
  ready: Promise<void>;
}

export class SSHManager {
  private connections: Map<string, SSHConnection> = new Map();

  async connect(id: string, config: {
    host: string;
    port: number;
    username: string;
    auth: string;
    password?: string;
    privateKey?: string;
  }): Promise<void> {
    const client = new Client();

    return new Promise((resolve, reject) => {
      client.on('ready', () => {
        this.connections.set(id, {
          client,
          id,
          config: { host: config.host, port: config.port, username: config.username },
          shells: new Map(),
          pendingWrites: new Map(),
        });
        resolve();
      });

      client.on('error', (err) => {
        reject(err);
      });

      const connectConfig: any = {
        host: config.host,
        port: config.port || 22,
        username: config.username,
        readyTimeout: 10000,
      };

      if (config.auth === 'password' && config.password) {
        connectConfig.password = config.password;
      } else if (config.auth === 'key' && config.privateKey) {
        connectConfig.privateKey = config.privateKey;
      }

      client.connect(connectConfig);
    });
  }

  createShell(sessionId: string, termId: string, size: { cols: number; rows: number }): SSHShellHandle {
    const conn = this.connections.get(sessionId);
    if (!conn) throw new Error(`SSH session ${sessionId} not found`);

    const callbacks: Array<(data: string) => void> = [];
    const pendingChunks: string[] = [];
    let resolveReady: (() => void) | null = null;
    let rejectReady: ((err: Error) => void) | null = null;

    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const dispatch = (str: string) => {
      if (callbacks.length === 0) {
        pendingChunks.push(str);
        return;
      }

      for (const cb of callbacks) {
        cb(str);
      }
    };

    conn.client.shell({
      cols: size.cols,
      rows: size.rows,
      term: 'xterm-256color',
    }, (err, stream) => {
      if (err || !stream) {
        rejectReady?.(err || new Error('Failed to create SSH shell'));
        return;
      }

      stream.on('data', (data: Buffer) => {
        dispatch(data.toString('utf-8'));
      });

      if (stream.stderr) {
        stream.stderr.on('data', (data: Buffer) => {
          dispatch(data.toString('utf-8'));
        });
      }

      stream.on('close', () => {
        conn.shells.delete(termId);
        conn.pendingWrites.delete(termId);
      });

      conn.shells.set(termId, stream);

      const queuedWrites = conn.pendingWrites.get(termId);
      if (queuedWrites && queuedWrites.length > 0) {
        for (const chunk of queuedWrites) {
          stream.write(chunk);
        }
        conn.pendingWrites.delete(termId);
      }

      resolveReady?.();
    });

    return {
      onData: (cb: (data: string) => void) => {
        callbacks.push(cb);
        if (pendingChunks.length > 0) {
          for (const chunk of pendingChunks) {
            cb(chunk);
          }
          pendingChunks.length = 0;
        }
      },
      ready,
    };
  }

  writeShell(termId: string, data: string): void {
    this.connections.forEach((conn) => {
      const shell = conn.shells.get(termId);
      if (shell) {
        shell.write(data);
        return;
      }
      const queued = conn.pendingWrites.get(termId) || [];
      queued.push(data);
      conn.pendingWrites.set(termId, queued);
    });
  }

  resizeShell(termId: string, cols: number, rows: number): void {
    this.connections.forEach((conn) => {
      const shell = conn.shells.get(termId);
      if (shell) {
        shell.setWindow(rows, cols, 0, 0);
        return;
      }
    });
  }

  async listDir(sessionId: string, remotePath: string): Promise<any[]> {
    const conn = this.connections.get(sessionId);
    if (!conn) throw new Error(`SSH session ${sessionId} not found`);

    return new Promise((resolve, reject) => {
      conn.client.sftp((err, sftp) => {
        if (err) return reject(err);

        sftp.readdir(remotePath, (err, list) => {
          sftp.end();
          if (err) return reject(err);

          const entries = list.map((item) => {
            const isDir = item.attrs.isDirectory;
            return {
              name: item.filename,
              path: remotePath === '/' ? `/${item.filename}` : `${remotePath}/${item.filename}`,
              isDirectory: isDir,
              isSymlink: item.attrs.isSymbolicLink(),
              size: item.attrs.size,
              mode: item.attrs.mode,
              mtime: new Date(item.attrs.mtime * 1000).toISOString(),
            };
          });

          resolve(entries);
        });
      });
    });
  }

  async disconnect(id: string): Promise<void> {
    const conn = this.connections.get(id);
    if (conn) {
      conn.shells.forEach((shell) => {
        try { shell.close(); } catch {}
      });
      conn.pendingWrites.clear();
      conn.client.end();
      this.connections.delete(id);
    }
  }

  listConnections(): Array<{ id: string; host: string; port: number; username: string }> {
    const result: Array<{ id: string; host: string; port: number; username: string }> = [];
    this.connections.forEach((conn) => {
      result.push({
        id: conn.id,
        host: conn.config.host,
        port: conn.config.port,
        username: conn.config.username,
      });
    });
    return result;
  }

  cleanup(): void {
    this.connections.forEach((_, id) => {
      this.disconnect(id);
    });
  }
}
