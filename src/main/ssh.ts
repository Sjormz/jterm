import { Client, ClientChannel } from 'ssh2';
import * as path from 'path';

interface SSHConnection {
  client: Client;
  id: string;
  config: {
    host: string;
    port: number;
    username: string;
  };
  shells: Map<string, ClientChannel>;
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

  createShell(sessionId: string, termId: string, size: { cols: number; rows: number }): { onData: (cb: (data: string) => void) => void } {
    const conn = this.connections.get(sessionId);
    if (!conn) throw new Error(`SSH session ${sessionId} not found`);

    const stream = conn.client.shell({
      cols: size.cols,
      rows: size.rows,
      term: 'xterm-256color',
    });

    const callbacks: Array<(data: string) => void> = [];

    stream.on('data', (data: Buffer) => {
      const str = data.toString('utf-8');
      for (const cb of callbacks) {
        cb(str);
      }
    });

    stream.stderr.on('data', (data: Buffer) => {
      const str = data.toString('utf-8');
      for (const cb of callbacks) {
        cb(str);
      }
    });

    stream.on('close', () => {
      conn.shells.delete(termId);
    });

    conn.shells.set(termId, stream);

    return {
      onData: (cb: (data: string) => void) => {
        callbacks.push(cb);
      },
    };
  }

  writeShell(termId: string, data: string): void {
    for (const [, conn] of this.connections) {
      const shell = conn.shells.get(termId);
      if (shell) {
        shell.write(data);
        return;
      }
    }
  }

  resizeShell(termId: string, cols: number, rows: number): void {
    for (const [, conn] of this.connections) {
      const shell = conn.shells.get(termId);
      if (shell) {
        shell.setWindow(rows, cols, 0, 0);
        return;
      }
    }
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
            const isDir = (item.attrs.isDirectory && item.longname?.startsWith?.('d')) || 
                          item.attrs.isDirectory();
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
      for (const [, shell] of conn.shells) {
        try { shell.close(); } catch {}
      }
      conn.client.end();
      this.connections.delete(id);
    }
  }

  listConnections(): Array<{ id: string; host: string; port: number; username: string }> {
    const result: Array<{ id: string; host: string; port: number; username: string }> = [];
    for (const [, conn] of this.connections) {
      result.push({
        id: conn.id,
        host: conn.config.host,
        port: conn.config.port,
        username: conn.config.username,
      });
    }
    return result;
  }

  cleanup(): void {
    for (const [id] of this.connections) {
      this.disconnect(id);
    }
  }
}
