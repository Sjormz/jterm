import { describe, it, expect, vi, beforeEach } from 'vitest';

class MiniEmitter {
  private listeners = new Map<string, Array<(...args: any[]) => void>>();

  on(event: string, cb: (...args: any[]) => void) {
    const list = this.listeners.get(event) || [];
    list.push(cb);
    this.listeners.set(event, list);
    return this;
  }

  emit(event: string, ...args: any[]) {
    for (const cb of this.listeners.get(event) || []) {
      cb(...args);
    }
  }
}

class MockShellStream extends MiniEmitter {
  stderr = new MiniEmitter();
  write = vi.fn();
  setWindow = vi.fn();
  close = vi.fn();
}

const mocks = {
  shellMock: vi.fn(),
  connectMock: vi.fn(),
  lastClient: null as MiniEmitter | null,
};

async function loadSSHManager() {
  vi.resetModules();
  vi.doMock('ssh2', () => {
    class MockClient extends MiniEmitter {
      shell = mocks.shellMock;
      connect = mocks.connectMock;
      sftp = vi.fn();
      end = vi.fn();

      constructor() {
        super();
        mocks.lastClient = this;
      }
    }

    return { Client: MockClient };
  });

  return import('../main/ssh');
}

beforeEach(() => {
  mocks.shellMock.mockReset();
  mocks.connectMock.mockReset();
  mocks.lastClient = null;
  vi.resetModules();
});

describe('SSHManager', () => {
  it('buffers early shell output until the renderer registers onData', async () => {
    mocks.shellMock.mockImplementation((opts: unknown, cb: (err: Error | undefined, stream?: MockShellStream) => void) => {
      const stream = new MockShellStream();
      cb(undefined, stream);
      stream.emit('data', Buffer.from('early output'));
    });

    mocks.connectMock.mockImplementation(() => {
      queueMicrotask(() => mocks.lastClient?.emit('ready'));
    });

    const { SSHManager } = await loadSSHManager();
    const manager = new SSHManager();
    await manager.connect('session-1', {
      host: 'example.com',
      port: 22,
      username: 'alice',
      auth: 'password',
      password: 'secret',
    });

    const handle = manager.createShell('session-1', 'term-1', { cols: 80, rows: 24 });
    const received: string[] = [];
    handle.onData((chunk) => received.push(chunk));

    await handle.ready;

    expect(mocks.shellMock).toHaveBeenCalledWith(
      expect.objectContaining({ cols: 80, rows: 24, term: 'xterm-256color' }),
      expect.any(Function),
    );
    expect(received).toEqual(['early output']);
  });

  it('queues writes until the SSH shell stream exists', async () => {
    type ShellCallback = Parameters<typeof mocks.shellMock.mockImplementation>[0] extends (
      opts: unknown,
      cb: infer Callback,
    ) => unknown
      ? Callback
      : never;

    let shellCallback: ShellCallback | null = null;
    mocks.shellMock.mockImplementation((opts: unknown, cb: ShellCallback) => {
      shellCallback = cb;
    });

    mocks.connectMock.mockImplementation(() => {
      queueMicrotask(() => mocks.lastClient?.emit('ready'));
    });

    const { SSHManager } = await loadSSHManager();
    const manager = new SSHManager();
    await manager.connect('session-2', {
      host: 'example.com',
      port: 22,
      username: 'alice',
      auth: 'password',
      password: 'secret',
    });

    const handle = manager.createShell('session-2', 'term-2', { cols: 100, rows: 30 });
    manager.writeShell('term-2', 'ls -la\n');

    const stream = new MockShellStream();
    shellCallback?.(undefined, stream);
    await handle.ready;

    expect(stream.write).toHaveBeenCalledWith('ls -la\n');
  });
});
