// OSC 7 cwd-tracking parser.
//
// Background:
//   OSC 7 is the canonical escape sequence terminals use to receive the
//   current working directory of the shell process. The shell emits it
//   (typically as part of its prompt hook), the terminal parses it, and
//   uses it to e.g. show the cwd in the title bar or to spawn new shells
//   in the same directory.
//
// The sequence looks like:
//
//     ESC ] 7 ; file://HOSTNAME/PATH ESC \
//
// Where the terminator is ST (String Terminator = ESC \). Some shells
// (notably iTerm2's user-var format) use BEL (0x07) as the terminator
// instead, so we accept both.
//
// References:
//   - WezTerm shell-integration docs (canonical): the format above.
//     https://wezfurlong.org/wezterm/shell-integration.html
//   - VS Code Terminal Shell Integration: also accepts
//     `OSC 1337 ; CurrentDir=<path> ST` (iTerm2 compat) and the
//     `OSC 633 ; P ; Cwd=<path> ST` (their own). We don't parse those —
//     OSC 7 is enough for our needs and is what bash/zsh/fish emit when
//     configured (e.g. via GNOME's vte.sh or a hand-rolled PROMPT_COMMAND).
//
// The parser is streaming: it can be fed chunks of PTY data and will
// detect complete (or split) sequences. The chunk may end mid-sequence;
// the residue is held in a buffer until the next chunk arrives.

export interface Osc7State {
  /** Carry-over for an OSC 7 sequence that was split across chunks. */
  pending: string;
  /** The last known cwd for this terminal. `null` if we haven't seen one yet. */
  lastCwd: string | null;
}

export function createOsc7State(): Osc7State {
  return { pending: '', lastCwd: null };
}

// Match a complete OSC 7 sequence. Two terminator forms:
//   1. ST  = ESC \            (canonical, what wezterm documents)
//   2. BEL = 0x07             (iTerm2-compatible, accepted by some shells)
//
// The body excludes ESC and BEL so the lazy match doesn't swallow across
// multiple sequences. The body also excludes 0x00 (NUL) since some shells
// pad with it.
const OSC7_COMPLETE_RE = /\x1b\]7;file:\/\/[^\x1b\x07\x00]+(?:\x1b\\|\x07)/g;

/**
 * Feed a chunk of PTY data to the parser. Returns the text that should be
 * written to the terminal (with OSC 7 sequences removed) and the cwd
 * extracted from the most recent complete OSC 7 sequence, if any.
 *
 * If the chunk ends mid-sequence, the residue is held in `state.pending`
 * and prepended to the next chunk automatically.
 */
export function parseChunk(
  state: Osc7State,
  data: string,
): { visible: string; cwd: string | null } {
  // Prepend any carry-over from a previous chunk.
  const combined = state.pending + data;

  // Find every complete OSC 7 sequence in the combined buffer.
  const re = new RegExp(OSC7_COMPLETE_RE.source, 'g');
  let lastIndex = 0;
  let cwd: string | null = null;
  let m: RegExpExecArray | null;
  let visible = '';

  while ((m = re.exec(combined)) !== null) {
    // Append the text between the previous match and this one.
    visible += combined.slice(lastIndex, m.index);
    lastIndex = re.lastIndex;

    // m[0] has the form:
    //   "\x1b]7;file://host/path"  + terminator
    // where the terminator is either BEL (1 byte: 0x07) or ST (2 bytes:
    // ESC + '\', 0x1b 0x5c). Find the `file://` prefix and slice to it,
    // then drop the terminator from the end.
    const matchStr = m[0];
    const fileIdx = matchStr.indexOf('file://');
    if (fileIdx < 0) continue;
    const lastChar = matchStr.charCodeAt(matchStr.length - 1);
    const prevChar = matchStr.charCodeAt(matchStr.length - 2);
    let url: string;
    if (lastChar === 0x07) {
      // BEL terminator (1 byte)
      url = matchStr.slice(fileIdx, -1);
    } else if (lastChar === 0x5c && prevChar === 0x1b) {
      // ST terminator (2 bytes: 0x1b 0x5c)
      url = matchStr.slice(fileIdx, -2);
    } else {
      // Regex guarantees one of the two forms. Skip defensively.
      continue;
    }
    const path = fileUrlToPath(url);
    if (path) cwd = path;
  }

  // Append the tail (text after the last complete match).
  const tail = combined.slice(lastIndex);

  // Now: is the tail the start of an in-progress OSC 7 sequence? We look
  // for `\x1b]7;file://` ANYWHERE in the tail — if it's there, the tail
  // is (at least partially) inside an OSC 7 sequence that hasn't been
  // completed yet. Anything before that prefix is visible, and everything
  // from that prefix onward is held in `state.pending` for the next chunk.
  //
  // We also need to catch a more subtle case: the tail may end with the
  // start of an ESC sequence (`\x1b`, `\x1b]`, `\x1b]7`, `\x1b]7;`,
  // `\x1b]7;f`, ...) that hasn't reached `file://` yet. In that case we
  // hold from the last `\x1b` onward.
  const osc7Idx = tail.indexOf('\x1b]7;file://');
  if (osc7Idx >= 0) {
    visible += tail.slice(0, osc7Idx);
    state.pending = tail.slice(osc7Idx);
    if (cwd !== null) state.lastCwd = cwd;
    return { visible, cwd: cwd ?? state.lastCwd };
  }

  // No `\x1b]7;file://` prefix in the tail. The tail might still be the
  // start of an OSC 7 sequence that hasn't been typed out far enough
  // (e.g. the chunk ended right at the ESC of a new OSC 7 sequence). If
  // the tail ends in the start of an escape sequence, hold from the last
  // ESC onward. Otherwise flush the whole tail to visible.
  //
  // This is tricky: a stray `\x1b` (perhaps from a Ctrl-C) followed by
  // text might be left as pending forever. We need to make sure we don't
  // hold too much. The rule: hold from the last `\x1b` only if the tail
  // since that `\x1b` looks like the start of an OSC 7 sequence (i.e.
  // starts with `\x1b]` and the text after that is short).
  const lastEsc = tail.lastIndexOf('\x1b');
  if (lastEsc >= 0) {
    const after = tail.slice(lastEsc);
    // `after` is the suspected partial sequence. We hold it if it starts
    // with `\x1b]` (any OSC sequence start) AND has not yet exceeded a
    // reasonable body length. We bound by 1024 chars so a runaway never
    // gets stuck in pending.
    if (after.startsWith('\x1b]') && after.length < 1024) {
      visible += tail.slice(0, lastEsc);
      state.pending = after;
    } else {
      // Not a plausible start to an OSC sequence — flush.
      visible += tail;
      state.pending = '';
    }
  } else {
    visible += tail;
    state.pending = '';
  }

  if (cwd !== null) state.lastCwd = cwd;
  return { visible, cwd: cwd ?? state.lastCwd };
}

/**
 * Convert a `file://HOSTNAME/PATH` URL to a local filesystem path.
 *
 * Handles:
 *   - file://host/path/with/slashes     → /path/with/slashes
 *   - file://host/C:/Users/x            → C:/Users/x   (Windows form)
 *   - Percent-encoded characters are decoded.
 */
export function fileUrlToPath(url: string): string | null {
  if (!url.startsWith('file://')) return null;
  const rest = url.slice('file://'.length);
  const firstSlash = rest.indexOf('/');
  if (firstSlash < 0) return null; // no path
  let path = rest.slice(firstSlash + 1);
  // Windows: `file://host/C:/foo`
  if (/^[A-Za-z]:/.test(path)) {
    return decodeURIComponent(path);
  }
  // POSIX: `/path/with/slashes`
  return '/' + decodeURIComponent(path);
}
