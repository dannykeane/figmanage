import { Argument, Command, Option } from 'commander';
import { fileURLToPath } from 'node:url';
import { executionOptions } from '../execution.js';
import { output } from './format.js';

export const mcpClients = ['claude-code', 'claude-desktop', 'codex', 'cursor', 'vscode', 'generic'] as const;
type McpClient = typeof mcpClients[number];
type Platform = 'darwin' | 'linux' | 'win32';
interface ConfigOptions {
  local?: boolean;
  readOnly?: boolean;
  toolsets?: 'starter' | 'admin' | 'readonly' | 'full';
  platform?: Platform;
  json?: boolean;
}

/** Generate a snippet only. Never inspect credentials or edit client settings. */
export function generateMcpConfig(client: McpClient, options: ConfigOptions = {}) {
  const platform = options.platform ?? process.platform;
  const server = options.local
    ? { command: process.execPath, args: [fileURLToPath(new URL('../index.js', import.meta.url)), '--mcp'] }
    : platform === 'win32'
      ? { command: 'cmd', args: ['/d', '/c', 'npx', '-y', 'figmanage', '--mcp'] }
      : { command: 'npx', args: ['-y', 'figmanage', '--mcp'] };
  const env: Record<string, string> = {};
  if (options.toolsets) env.FIGMA_TOOLSETS = options.toolsets;
  if (options.readOnly) env.FIGMA_READ_ONLY = 'true';
  const locations: Record<McpClient, string> = {
    'claude-code': '.mcp.json (project scope)',
    'claude-desktop': 'Claude Desktop: Settings > Developer > Edit Config',
    codex: '~/.codex/config.toml (or $CODEX_HOME/config.toml)',
    cursor: '~/.cursor/mcp.json or .cursor/mcp.json',
    vscode: 'VS Code: MCP: Open User Configuration, or .vscode/mcp.json',
    generic: 'Your client’s local stdio MCP configuration',
  };
  let config: string;
  if (client === 'codex') {
    config = [
      '[mcp_servers.figmanage]',
      `command = ${JSON.stringify(server.command)}`,
      `args = ${JSON.stringify(server.args)}`,
      'startup_timeout_sec = 30',
      'tool_timeout_sec = 300',
      ...(Object.keys(env).length ? ['', '[mcp_servers.figmanage.env]', ...Object.entries(env).map(([key, value]) => `${key} = ${JSON.stringify(value)}`)] : []),
    ].join('\n') + '\n';
  } else {
    const entry = {
      ...(['claude-code', 'cursor', 'vscode'].includes(client) ? { type: 'stdio' } : {}),
      ...server,
      ...(Object.keys(env).length ? { env } : {}),
    };
    config = JSON.stringify({ [client === 'vscode' ? 'servers' : 'mcpServers']: { figmanage: entry } }, null, 2) + '\n';
  }
  return {
    client, format: client === 'codex' ? 'toml' : 'json', config,
    location: locations[client],
    next_steps: [
      'Merge the figmanage entry into the client configuration, preserving other servers and settings.',
      'Restart or reconnect MCP, then call setup_status. Figmanage reuses its saved login on this machine.',
      ...(options.local ? ['This configuration uses the current Node executable and Figmanage installation. Regenerate it if either moves; do not use a temporary npx installation for a permanent setup.'] : ['Node.js and npx must be available to the client. For an installed local copy, use --local to generate absolute paths.']),
    ],
  };
}

export function mcpConfigCommand(): Command {
  return new Command('mcp-config')
    .description('Print client MCP configuration without changing settings or reading credentials')
    .addArgument(new Argument('<client>', 'MCP client').choices([...mcpClients]))
    .option('--local', 'Use absolute paths to this Node executable and Figmanage installation')
    .option('--read-only', 'Expose only read-only MCP tools')
    .addOption(new Option('--toolsets <preset>', 'Choose MCP toolsets').choices(['starter', 'admin', 'readonly', 'full']))
    .addOption(new Option('--platform <platform>', 'Target operating system (default: current)').choices(['darwin', 'linux', 'win32']))
    .option('--json', 'Return configuration and setup steps as JSON')
    .action((client: McpClient, options: ConfigOptions) => {
      if (options.local && options.platform && options.platform !== process.platform) {
        throw new Error('Invalid options: --local uses this machine’s paths; omit --platform or select the current platform.');
      }
      const result = generateMcpConfig(client, options);
      if (options.json || executionOptions.jsonl) output(result, options);
      else process.stdout.write(result.config);
    });
}
