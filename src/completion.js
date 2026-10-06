// completion.js — shell completion for `aio` (Stage 6): print a script to stdout.
import { msg } from './messages.js';
// Boring by design: static command/flag lists, no runtime probing — completion
// must work offline and inside a compiled binary. Also the SINGLE SOURCE the CLI
// dispatches from: bin/aio.js validates commands/flags against these exports (7d),
// so a new command or flag can never silently miss shell completion (or vice versa).
export const COMMANDS = ['preview', 'init', 'setup', 'status', 'ask', 'agent', 'borrow', 'skill', 'completion', 'doctor', 'verify', 'evolve', 'update', 'rollback', 'version', 'help'];
export const FLAGS = ['--yes', '--dry-run', '--show-block', '--json', '--check', '--fix', '--file', '--name', '--sha256', '--get', '--clean', '--list', '--copilot', '--add', '--help', '--version'];
export const SHORT_FLAGS = ['-h', '-v'];

const usage = msg('usageCompletion');

export function completion(shell) {
  const words = [...COMMANDS, ...FLAGS].join(' ');
  switch ((shell || '').toLowerCase()) {
    case 'bash':
      return {
        ok: true,
        text: [
          '# bash — add to ~/.bashrc:',
          `_aio() {`,
          `  local cur="\${COMP_WORDS[COMP_CWORD]}"`,
          `  local words="${words}"`,
          `  COMPREPLY=( $(compgen -W "$words" -- "$cur") )`,
          `}`,
          `complete -F _aio aio aioc`,
        ].join('\n'),
      };
    case 'zsh':
      return {
        ok: true,
        text: [
          '# zsh — add to ~/.zshrc (after compinit):',
          `#compdef aio aioc`,
          `_aio() {`,
          `  local -a words`,
          `  words=(${words})`,
          `  _describe 'aio' words`,
          `}`,
          `compdef _aio aio aioc`,
        ].join('\n'),
      };
    case 'fish':
      return {
        ok: true,
        text: [
          '# fish — add to ~/.config/fish/completions/aio.fish:',
          ...COMMANDS.map((c) => `complete -c aio -f -a "${c}"`),
          ...FLAGS.map((f) => `complete -c aio -l "${f.slice(2)}" -d flag`),
        ].join('\n'),
      };
    case 'pwsh':
    case 'powershell':
      return {
        ok: true,
        text: [
          '# PowerShell — add to $PROFILE:',
          "$aioWords = @('" + [...COMMANDS, ...FLAGS].join("','") + "')",
          "Register-ArgumentCompleter -CommandName aio,aioc -ScriptBlock {",
          '  param($wordToComplete, $commandAst, $cursorPosition)',
          '  $aioWords | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {',
          '    [System.Management.Automation.CompletionResult]::new($_, $_, ' +
            "'ParameterValue', $_)" +
            '  }',
          '}',
        ].join('\n'),
      };
    default:
      return { ok: false, text: usage };
  }
}
