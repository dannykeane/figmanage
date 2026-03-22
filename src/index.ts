#!/usr/bin/env node

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
  const { Command } = await import('commander');
  const { registerCliCommands } = await import('./cli/index.js');

  const program = new Command();
  program
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
    await program.parseAsync(process.argv);
  }
}
