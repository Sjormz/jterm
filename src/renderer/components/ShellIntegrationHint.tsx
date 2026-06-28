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
// Note: `\033` (ESC) cannot be used in string literals inside an ES
// module (Vite/esbuild treats it as a deprecated octal escape). We
// use \u001b instead — same character, allowed in module code.
const BASH_SNIPPET = (
  '# JTerm auto-injects a PROMPT_COMMAND that emits OSC 7.\n' +
  '# To make bash in other terminals (e.g. VS Code) also track cwd,\n' +
  '# add the following to your ~/.bashrc:\n' +
  '__jt_osc7() { printf "\u001b]7;file://%s%s\u001b\\" "${HOSTNAME:-localhost}" "$PWD"; }\n' +
  'PROMPT_COMMAND="__jt_osc7${PROMPT_COMMAND:+; $PROMPT_COMMAND}"'
);

const ZSH_SNIPPET = (
  '# JTerm auto-injects a precmd hook that emits OSC 7.\n' +
  '# To make zsh in other terminals (e.g. VS Code) also track cwd,\n' +
  '# add the following to ~/.zshrc:\n' +
  "precmd() { print -Pn '\\e]7;file://%m%d\\a' }"
);

const FISH_SNIPPET = (
  '# JTerm auto-injects a fish_prompt hook that emits OSC 7.\n' +
  '# To make fish in other terminals also track cwd, add the\n' +
  '# following to ~/.config/fish/config.fish:\n' +
  'function __jt_osc7 --on-event fish_prompt\n' +
  '  printf "\u001b]7;file://%s%s\u001b\\" (hostname) $PWD\n' +
  'end'
);

const POWERSHELL_SNIPPET = (
  '# JTerm auto-injects a prompt function that emits OSC 7.\n' +
  '# This is the equivalent snippet to put in your $PROFILE if you\n' +
  "# want other terminals (e.g. VS Code, Windows Terminal) to track cwd too:\n" +
  'function global:prompt {\n' +
  '  $e = [char]27\n' +
  // PowerShell single-quoted strings don't interpolate, so we keep
  // the OSC 7 payload as a plain literal. [char]92 is the backslash
  // in the ST terminator; [char]34 is the double-quote.
  '  $urlPath = ($PWD.ProviderPath -replace [char]92, [char]47)\n' +
  "  Write-Host -NoNewline ($e + [char]34 + ']7;file://' + $env:COMPUTERNAME + [char]47 + $urlPath + $e + [char]92 + [char]34)\n" +
  '  & $global:__jt_orig_prompt\n' +
  '}'
);
const SAMPLES: Array<{ label: string; snippet: string; ready: boolean }> = [
  { label: 'PowerShell 5+',       snippet: POWERSHELL_SNIPPET, ready: true },
  { label: 'Bash',                snippet: BASH_SNIPPET,      ready: true },
  { label: 'Zsh',                 snippet: ZSH_SNIPPET,       ready: true },
  { label: 'Fish',                snippet: FISH_SNIPPET,      ready: true },
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
          OSC&nbsp;7 escape sequences. JTerm auto-injects the right prompt hook
          for each shell, so this works out of the box. The snippets below are
          for reference or for if you want to copy them into your own config to
          make other terminals (e.g. VS Code's integrated terminal) track cwd
          too.
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
