import * as path from 'path';

/**
 * Returns a small shell-init snippet that, when sourced/eval'd by the
 * shell at startup, makes the shell emit an OSC 7 escape sequence
 * (file://HOST/PATH) before every prompt. JTerm's renderer listens for
 * OSC 7 via xterm's parser to keep the file-explorer / git-tree /
 * status-bar cwd in sync with the focused terminal.
 *
 * The snippets preserve the user's existing prompt: they chain to the
 * original prompt function / PROMPT_COMMAND / precmd / fish_prompt so
 * the user sees no visual difference. The only side effect is a single
 * escape sequence per prompt that the terminal consumes invisibly.
 *
 * Returns the empty string for shells we don't know how to instrument
 * (or `cmd.exe`, which has no scripting facility that can run on each
 * prompt without external tools).
 *
 * References:
 *   - WezTerm shell integration (canonical):
 *     https://wezfurlong.org/wezterm/shell-integration.html
 *   - PowerShell prompt override:
 *     https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_prompts
 */
export function buildShellInit(shell: string): string {
  const base = path.basename(shell).toLowerCase();

  // PowerShell (any version — both 5.1 and 7+). The trick: capture the
  // existing prompt function, then redefine it so it emits OSC 7 first
  // and then calls the original. This works regardless of whether the
  // user has a custom prompt or not.
  if (base === 'powershell' || base === 'powershell.exe' || base === 'pwsh' || base === 'pwsh.exe') {
    // We construct the OSC 7 escape sequence in PowerShell itself
    // (using [char]27 for ESC and string concatenation) rather than
    // embedding raw escape bytes in the JS source. That way we avoid
    // every form of double-escaping and PowerShell string-literal
    // quoting issue.
    //
    // The OSC 7 sequence we want PowerShell to print is:
    //   ESC ] 7 ; file://HOST/PATH ESC \
    // where the final "ESC \" is the ST (String Terminator). xterm's
    // parser accepts this on Windows, and we also accept BEL (0x07)
    // as a fallback (see src/renderer/osc7.ts / the xterm parser docs).
    const ps = [
      // Save the original prompt (or fall back to a simple one).
      "if (Test-Path Function:\\prompt) { $global:__jt_orig_prompt = ${Function:prompt} } else { $global:__jt_orig_prompt = { 'PS> ' } }",
      // Redefine prompt.
      "function global:prompt {",
      "  $e = [char]27",
      // Convert C:\foo to C:/foo (file:// wants forward slashes).
      "  $urlPath = ($PWD.ProviderPath -replace '\\\\','/')",
      // Build: ESC ] 7 ; file://HOST/PATH ESC \  (ST terminator).
      // Using single quotes for the literal so PowerShell doesn't try
      // to interpolate the escape characters. The trailing backslash
      // is [char]92 — the backslash in ST. xterm's parser also accepts
      // BEL ([char]7) as an alternative terminator, but ST is canonical.
      "  $osc = $e + ']7;file://' + $env:COMPUTERNAME + '/' + $urlPath + $e + [char]92",
      "  Write-Host -NoNewline $osc",
      "  & $global:__jt_orig_prompt",
      "}",
    ].join('\n');
    return ps;
  }

  // Bash. The canonical PROMPT_COMMAND snippet — also used by VS Code.
  if (base === 'bash' || base === 'bash.exe') {
    return [
      // Use a namespaced function name so we don't clobber the user's.
      "__jt_osc7() { printf '\\033]7;file://%s%s\\033\\\\' \"${HOSTNAME:-localhost}\" \"$PWD\"; }",
      // Prepend to any existing PROMPT_COMMAND.
      "PROMPT_COMMAND=\"__jt_osc7${PROMPT_COMMAND:+; $PROMPT_COMMAND}\"",
    ].join('\n');
  }

  // Zsh. The zsh-native way: a precmd hook.
  if (base === 'zsh' || base === 'zsh.exe') {
    return [
      "__jt_osc7() { print -Pn '\\e]7;file://%m%d\\a' }",
      "precmd_functions+=(__jt_osc7)",
    ].join('\n');
  }

  // Fish. The fish-prompt event handler.
  if (base === 'fish' || base === 'fish.exe') {
    return [
      "function __jt_osc7 --on-event fish_prompt",
      "  printf '\\033]7;file://%s%s\\033\\\\' (hostname) $PWD",
      "end",
    ].join('\n');
  }

  // cmd.exe has no scripting facility for per-prompt hooks. We could
  // fall back to a polling approach (read the cwd via the win32 API on
  // a timer) but that's out of scope for this fix. For now, return
  // empty so cmd.exe gets no init.
  return '';
}
