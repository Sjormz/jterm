import { describe, it, expect } from 'vitest';
import {
  createOsc7State, parseChunk, fileUrlToPath,
} from '../renderer/osc7';

const ST = '\x1b\\'; // canonical terminator
const BEL = '\x07';

function feed(state: ReturnType<typeof createOsc7State>, ...chunks: string[]): string {
  let visible = '';
  for (const c of chunks) {
    const r = parseChunk(state, c);
    visible += r.visible;
  }
  return visible;
}

describe('OSC 7 parser', () => {
  it('extracts a path from a complete OSC 7 sequence (ST terminator)', () => {
    const s = createOsc7State();
    const out = feed(s, `\x1b]7;file://localhost/home/alice${ST}`);
    expect(out).toBe(''); // sequence was stripped
    expect(s.lastCwd).toBe('/home/alice');
  });

  it('accepts BEL terminator as a fallback', () => {
    const s = createOsc7State();
    const out = feed(s, `\x1b]7;file://localhost/tmp${BEL}`);
    expect(out).toBe('');
    expect(s.lastCwd).toBe('/tmp');
  });

  it('strips the sequence but keeps surrounding text', () => {
    const s = createOsc7State();
    const out = feed(s, `prompt> \x1b]7;file://localhost/home/alice${ST}\n$ `);
    expect(out).toBe('prompt> \n$ ');
    expect(s.lastCwd).toBe('/home/alice');
  });

  it('handles a sequence split across two chunks (mid-text)', () => {
    const s = createOsc7State();
    const full = `\x1b]7;file://localhost/some/dir${ST}`;
    const cut = 8; // somewhere inside the path
    const out1 = feed(s, full.slice(0, cut));
    expect(out1).toBe(''); // partial sequence is held
    const out2 = feed(s, full.slice(cut));
    expect(out2).toBe(''); // full sequence was held then stripped
    expect(s.lastCwd).toBe('/some/dir');
  });

  it('handles a sequence split exactly at the ESC of the terminator', () => {
    const s = createOsc7State();
    const full = `\x1b]7;file://localhost/dir${ST}`;
    const cut = full.length - 1; // chunk 1 ends with `\x1b`, chunk 2 is `\`
    const out1 = feed(s, full.slice(0, cut));
    const out2 = feed(s, full.slice(cut));
    expect(s.lastCwd).toBe('/dir');
    expect(out1 + out2).toBe('');
  });

  it('keeps the most recent cwd when several sequences are emitted', () => {
    const s = createOsc7State();
    feed(
      s,
      `\x1b]7;file://localhost/a${ST}`,
      `text in between`,
      `\x1b]7;file://localhost/b${ST}`,
    );
    expect(s.lastCwd).toBe('/b');
  });

  it('handles Windows file:// URLs (C:/...)', () => {
    const s = createOsc7State();
    feed(s, `\x1b]7;file://localhost/C:/Users/pckpr/projects/jterm${ST}`);
    expect(s.lastCwd).toBe('C:/Users/pckpr/projects/jterm');
  });

  it('handles percent-encoded paths', () => {
    const s = createOsc7State();
    feed(s, `\x1b]7;file://localhost/home/alice/My%20Projects/jterm${ST}`);
    expect(s.lastCwd).toBe('/home/alice/My Projects/jterm');
  });

  it('a sequence split across chunks reassembles across the chunk boundary', () => {
    const s = createOsc7State();
    // First chunk ends mid-path with no terminator visible. The parser
    // must hold the partial sequence in state.pending and not output it.
    const full = `\x1b]7;file://localhost/dir${ST}`;
    const out1 = feed(s, full.slice(0, full.length - 4)); // ends mid-`dir`
    expect(out1).toBe(''); // nothing visible yet
    expect(s.pending).not.toBe(''); // the partial sequence is being held
    // The next chunk contains the rest. It must complete the sequence.
    const out2 = feed(s, full.slice(full.length - 4));
    expect(out1 + out2).toBe(''); // still nothing visible
    expect(s.lastCwd).toBe('/dir');
  });

  it('does not match an incomplete sequence that never gets a terminator', () => {
    const s = createOsc7State();
    // A bare escape character with no follow-up. The parser must not
    // get stuck holding it forever.
    feed(s, `some text \x1b more text but no terminator`);
    // Either the whole thing is flushed (and no cwd) or the bare ESC
    // is still held; both are acceptable. The hard requirement is no
    // spurious cwd.
    expect(s.lastCwd).toBeNull();
  });

  it('leaves regular ANSI escape sequences intact (only OSC 7 is stripped)', () => {
    const s = createOsc7State();
    const data = `\x1b[31mred text\x1b[0m normal`;
    const out = feed(s, data);
    expect(out).toBe(data);
  });

  it('handles a stream with many OSC 7 sequences mixed with other escapes', () => {
    const s = createOsc7State();
    const out = feed(
      s,
      `\x1b[32m$ \x1b[0m`,
      `ls\n`,
      `\x1b]7;file://localhost/foo${ST}`,
      `file1 file2\n`,
      `\x1b]7;file://localhost/bar${ST}`,
    );
    expect(out).toBe('\x1b[32m$ \x1b[0mls\nfile1 file2\n');
    expect(s.lastCwd).toBe('/bar');
  });

  it('handles empty input', () => {
    const s = createOsc7State();
    expect(feed(s, '')).toBe('');
    expect(s.lastCwd).toBeNull();
  });
});

describe('fileUrlToPath', () => {
  it('decodes a POSIX file:// URL', () => {
    expect(fileUrlToPath('file://localhost/home/alice')).toBe('/home/alice');
  });

  it('decodes a Windows file:// URL (C:/...)', () => {
    expect(fileUrlToPath('file://localhost/C:/Users/pckpr')).toBe('C:/Users/pckpr');
  });

  it('decodes percent-encoded paths', () => {
    expect(fileUrlToPath('file://localhost/home/alice/My%20Dir')).toBe('/home/alice/My Dir');
  });

  it('rejects URLs without a path', () => {
    expect(fileUrlToPath('file://localhost')).toBeNull();
  });

  it('rejects non-file URLs', () => {
    expect(fileUrlToPath('https://example.com/foo')).toBeNull();
  });
});
