import React, { useState } from 'react';

/**
 * "Shell integration" hint, shown in the Settings sidebar.
 *
 * The file explorer and git tree follow the cwd of the focused terminal by
 * parsing OSC 7 escape sequences from the PTY output. Most modern shells
 * already emit OSC 7 out of the box:
 *
 *   - PowerShell 7+       — yes, default.
 *   - zsh (modern Fedora) — yes, via /etc/profile.d/vte.sh.
 *   - bash (modern Fedora)— yes, via /etc/profile.d/vte.sh.
 *   - fish                — yes, via fish_prompt hooks.
 *   - nushell             — yes.
 *   - bash on most other distros / Git Bash on Windows — NO.
 *
 * For shells that don't, the canonical way to enable OSC 7 is to add a
 * `PROMPT_COMMAND` hook to your `.bashrc` (or the zsh equivalent). This
 * component shows the exact one-liner so the user can copy it.
 *
 * References:
 *   - WezTerm shell integration docs:
 *     https://wezfurlong.org/wezterm/shell-integration.html
 *   - iTerm2 shell integration:
 *     https://iterm2.com/documentation-shell-integration.html
 *   - VS Code's terminal shell integration:
 *     https://code.visualstudio.com/docs/terminal/shell-integration
 */
// Note: these snippets contain literal `$` characters that JS template
// strings would try to interpolate. We use a placeholder (\\$PROMPT_COMMAND)
// inside the backtick string, then string-replace it back to `$PROMPT_COMMAND`
// at runtime. This keeps the snippets readable while dodging JS parsing.
const BASH_SNIPPET = (
  '# Emit OSC 7 so JTerm can track the cwd. Add to ~/.bashrc:\n' +
  "__jterm_osc7() { printf '\\033]7;file://%s%s\\033\\\\' \"${HOSTNAME}\" \"$PWD\"; }\n" +
  'PROMPT_COMMAND="__jterm_osc7${DOLLAR}{PROMPT_COMMAND:+; $PROMPT_COMMAND}"'
).replace(/\$\{DOLLAR\}/g, '${');

const ZSH_SNIPPET = (
  '# Emit OSC 7 so JTerm can track the cwd. Add to ~/.zshrc:\n' +
  "precmd() { print -Pn '\\e]7;file://%m%d\\a' }"
);

const FISH_SNIPPET = (
  '# Emit OSC 7 so JTerm can track the cwd. Add to ~/.config/fish/config.fish:\n' +
  'function fish_jterm_osc7 --on-event fish_prompt\n' +
  "  printf '\\033]7;file://%s%s\\033\\\\' (hostname) $PWD\n" +
  'end'
);

const POWERSHELL_SNIPPET = (
  '# PowerShell 7+ emits OSC 7 by default. No setup needed.\n' +
  '# (If you have disabled it, see: https://learn.microsoft.com/powershell/)'
);

const SAMPLES: Array<{ label: string; snippet: string; ready: boolean }> = [
  { label: 'PowerShell 7+',     snippet: POWERSHELL_SNIPPET, ready: true },
  { label: 'Bash',              snippet: BASH_SNIPPET,      ready: false },
  { label: 'Zsh',               snippet: ZSH_SNIPPET,       ready: false },
  { label: 'Fish',              snippet: FISH_SNIPPET,      ready: false },
];

interface CopyState { [key: string]: boolean }

export default function ShellIntegrationHint() {
  const [copied, setCopied] = useState<CopyState>({});

  const handleCopy = async (label: string, snippet: string) => {
    try {
      // Try the modern clipboard API first; fall back to the deprecated one
      // (Electron's renderer may have either depending on permissions).
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(snippet);
      } else {
        const ta = document.createElement('textarea');
        ta.value = snippet;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied((s) => ({ ...s, [label]: true }));
      setTimeout(() => setCopied((s) => ({ ...s, [label]: false })), 1500);
    } catch {
      // ignore — user can manually select & copy
    }
  };

  return (
    <div className="shell-integration-hint">
      <div className="theme-section">
        <h3 className="theme-section-title">Shell Integration</h3>
        <p className="hint-description">
          JTerm follows the working directory of the focused terminal by parsing
          OSC&nbsp;7 escape sequences. Most shells emit this automatically; if
          yours doesn't, copy the snippet for your shell into the appropriate
          config file (<code>~/.bashrc</code>, <code>~/.zshrc</code>, etc).
        </p>
        {SAMPLES.map(({ label, snippet, ready }) => (
          <div key={label} className={`hint-shell-block ${ready ? 'ready' : 'needs-setup'}`}>
            <div className="hint-shell-header">
              <span className="hint-shell-name">{label}</span>
              <span className={`hint-shell-status ${ready ? 'status-ok' : 'status-needs'}`}>
                {ready ? '✓ built-in' : 'needs setup'}
              </span>
              <button
                className="icon-btn"
                onClick={() => handleCopy(label, snippet)}
                title={`Copy ${label} snippet`}
                aria-label={`Copy ${label} snippet`}
              >
                {copied[label] ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <pre className="hint-snippet">{snippet}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
