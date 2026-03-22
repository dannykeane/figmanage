import { Command } from 'commander';

/**
 * Introspect a Commander program and extract its command tree.
 * Returns a map of command names to their subcommand names.
 * Top-level commands without subcommands (like login, whoami) get an empty array.
 */
function extractCommandTree(program: Command): Map<string, string[]> {
  const tree = new Map<string, string[]>();

  for (const cmd of program.commands) {
    const subs = cmd.commands.map((sub: Command) => sub.name());
    tree.set(cmd.name(), subs);
  }

  return tree;
}

/**
 * Extract all option flags from a command (including inherited ones).
 * Returns long-form flags like --json, --help.
 */
function extractOptions(cmd: Command): string[] {
  const flags: string[] = [];
  for (const opt of cmd.options) {
    if (opt.long) flags.push(opt.long);
  }
  return flags;
}

/**
 * Collect global options that appear across most commands.
 * These get offered at every completion point.
 */
function extractGlobalOptions(program: Command): string[] {
  const flags = new Set<string>();
  // Program-level options (--version, etc.)
  for (const opt of program.options) {
    if (opt.long) flags.add(opt.long);
  }
  // Common flags present on subcommands
  flags.add('--help');
  flags.add('--json');
  return [...flags];
}

function generateZshScript(program: Command): string {
  const tree = extractCommandTree(program);
  const globalOpts = extractGlobalOptions(program);

  const topLevelCmds = [...tree.keys()];

  // Build case arms for subcommand completion
  const caseArms: string[] = [];
  for (const [group, subs] of tree) {
    if (subs.length > 0) {
      caseArms.push(`      ${group})\n        local subcmds=(${subs.join(' ')})\n        _describe 'subcommand' subcmds\n        ;;`);
    }
  }

  return `#compdef figmanage

# Shell completion for figmanage
# Add to ~/.zshrc: eval "$(figmanage completion)"

_figmanage() {
  local -a commands
  commands=(${topLevelCmds.join(' ')})

  local global_opts=(${globalOpts.join(' ')})

  _arguments -C \\
    '1:command:->cmd' \\
    '2:subcommand:->sub' \\
    '*::options:->opts'

  case $state in
    cmd)
      _describe 'command' commands
      ;;
    sub)
      case $words[1] in
${caseArms.join('\n')}
      *)
        _describe 'option' global_opts
        ;;
      esac
      ;;
    opts)
      _values 'options' $global_opts
      ;;
  esac
}

compdef _figmanage figmanage
`;
}

function generateBashScript(program: Command): string {
  const tree = extractCommandTree(program);
  const globalOpts = extractGlobalOptions(program);

  const topLevelCmds = [...tree.keys()];

  // Build case arms for subcommand completion
  const caseArms: string[] = [];
  for (const [group, subs] of tree) {
    if (subs.length > 0) {
      caseArms.push(`      ${group})\n        COMPREPLY=($(compgen -W "${subs.join(' ')}" -- "$cur"))\n        ;;`);
    }
  }

  return `# Shell completion for figmanage
# Add to ~/.bashrc: eval "$(figmanage completion)"

_figmanage() {
  local cur prev words cword
  _init_completion || return

  local commands="${topLevelCmds.join(' ')}"
  local global_opts="${globalOpts.join(' ')}"

  case $cword in
    1)
      COMPREPLY=($(compgen -W "$commands" -- "$cur"))
      ;;
    2)
      case "\${words[1]}" in
${caseArms.join('\n')}
      *)
        COMPREPLY=($(compgen -W "$global_opts" -- "$cur"))
        ;;
      esac
      ;;
    *)
      COMPREPLY=($(compgen -W "$global_opts" -- "$cur"))
      ;;
  esac
}

complete -F _figmanage figmanage
`;
}

function detectShell(): 'zsh' | 'bash' {
  const shell = process.env.SHELL ?? '';
  if (shell.endsWith('/zsh')) return 'zsh';
  return 'bash';
}

/**
 * Create the `completion` command. Needs the parent program reference
 * so it can introspect the full command tree at runtime.
 */
export function completionCommand(program: Command): Command {
  const cmd = new Command('completion')
    .description('Output shell completion script')
    .option('--shell <shell>', 'Shell type (bash or zsh)')
    .action((options: { shell?: string }) => {
      const shell = options.shell ?? detectShell();

      if (shell !== 'bash' && shell !== 'zsh') {
        console.error(`Unsupported shell: ${shell}. Use --shell bash or --shell zsh.`);
        process.exit(1);
      }

      const script = shell === 'zsh'
        ? generateZshScript(program)
        : generateBashScript(program);

      process.stdout.write(script);
    });

  return cmd;
}
