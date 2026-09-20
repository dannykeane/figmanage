#!/usr/bin/env node

// Version queries need no command graph, config, or network.
if (process.argv.length === 3 && ['--version', '-V'].includes(process.argv[2])) {
  const { readFileSync } = await import('node:fs');
  console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
  process.exit(0);
}

// --setup flag: run the interactive setup wizard and exit.
// Checked before commander parses to preserve existing behavior
// (setup uses its own interactive prompts).
if (process.argv.includes('--setup')) {
  await import('./setup.js');
  process.exit(0);
}

// --mcp flag: start the MCP server (stdio or HTTP).
// This is the hot path for MCP clients -- tool modules are only
// loaded inside startMcpServer(), keeping CLI startup fast.
if (process.argv.includes('--mcp')) {
  const { startMcpServer } = await import('./mcp.js');
  await startMcpServer();
} else {
  // CLI mode: parse commands with commander
  const { Command, Option } = await import('commander');
  const { registerCliCommands } = await import('./cli/index.js');
  const { configureExecution } = await import('./execution.js');
  const { error, fail } = await import('./cli/format.js');

  const program = new Command();
  program
    .option('--jsonl', 'Emit typed JSON Lines records and a final summary; errors go to stderr')
    .name('figmanage')
    .description('Figma workspace management CLI')
    .version(
      JSON.parse(
        (await import('node:fs')).readFileSync(
          new URL('../package.json', import.meta.url), 'utf-8',
        ),
      ).version,
    );

  registerCliCommands(program);
  program
    .option('--yes', 'Confirm destructive commands without prompting')
    .option('--no-input', 'Never prompt; require --yes for destructive commands')
    .option('--dry-run', 'Preview validated mutation inputs without API requests; does not check remote state')
    .addOption(new Option('--error-format <format>', 'Runtime error format on stderr').choices(['text', 'json']).default('text'))
    .hook('preAction', (_root, command) => {
      const options = command.optsWithGlobals();
      configureExecution({ ...options, noInput: options.input === false });
      if (options.jsonl && (options.json || options.md)) {
        throw new Error('Invalid output options: use --jsonl, --json, or --md separately.');
      }
      if (options.jsonl && ['login', 'completion'].includes(command.name())) {
        throw new Error(`--jsonl is not supported for ${command.name()}; use it with data commands or schema.`);
      }
      if (options.dryRun && ['login', 'logout'].includes(command.name())) {
        throw new Error('--dry-run is not supported for authentication commands.');
      }
    });

  // Choice validation can fail before a later --jsonl flag is parsed.
  const wantsJsonl = () => {
    if (program.opts().jsonl) return true;
    const flags = new Command().exitOverride().configureOutput({ writeErr: () => {} });
    for (const option of program.options) flags.addOption(new Option(option.flags));
    try { flags.parseOptions(process.argv.slice(2)); } catch { /* Keep flags parsed before a missing value. */ }
    return flags.opts().jsonl === true;
  };

  // Commander rejects invalid arguments before preAction runs.
  const configureErrors = (command: InstanceType<typeof Command>) => {
    command.configureOutput({ outputError: (message, write) => {
      if (wantsJsonl()) {
        configureExecution({ jsonl: true });
        error(`Invalid input: ${message.trim().replace(/^error: /, '')}`);
      } else write(message);
    } });
    for (const child of command.commands) configureErrors(child);
  };
  configureErrors(program);

  // No subcommand given: if stdin is piped (MCP client), start MCP server.
  // Otherwise show help.
  if (process.argv.length <= 2) {
    if (!process.stdin.isTTY) {
      const { startMcpServer } = await import('./mcp.js');
      await startMcpServer();
      // Don't exit -- stdio transport keeps the process alive via stdin listener.
    } else {
      program.outputHelp();
      process.exit(0);
    }
  } else {
    try {
      await program.parseAsync(process.argv);
    } catch (e) {
      fail(e);
    }
  }
}
