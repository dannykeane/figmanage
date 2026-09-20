import { afterEach, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { generateMcpConfig } from '../src/cli/mcp-config.js';

afterEach(() => vi.unstubAllEnvs());

it.each(['claude-code', 'claude-desktop', 'cursor', 'vscode', 'generic'] as const)('generates the %s stdio schema without credentials', client => {
  vi.stubEnv('FIGMA_PAT', 'do-not-copy-pat');
  vi.stubEnv('FIGMA_AUTH_COOKIE', 'do-not-copy-cookie');
  const result = generateMcpConfig(client, { platform: 'linux' });
  const config = JSON.parse(result.config);
  expect(Object.keys(config)).toEqual([client === 'vscode' ? 'servers' : 'mcpServers']);
  const server = (config.servers || config.mcpServers).figmanage;
  expect(server.command).toBe('npx');
  expect(server.args).toEqual(['-y', 'figmanage', '--mcp']);
  expect(server.env).toBeUndefined();
  if (['claude-code', 'cursor', 'vscode'].includes(client)) expect(server.type).toBe('stdio');
  expect(JSON.stringify(result)).not.toContain('do-not-copy');
});

it('generates Codex TOML with time for cold npx startup and compound workflows', () => {
  const result = generateMcpConfig('codex', { platform: 'darwin', readOnly: true, toolsets: 'starter' });
  expect(result.format).toBe('toml');
  expect(result.config).toContain('[mcp_servers.figmanage]\ncommand = "npx"');
  expect(result.config).toContain('args = ["-y","figmanage","--mcp"]');
  expect(result.config).toContain('startup_timeout_sec = 30');
  expect(result.config).toContain('tool_timeout_sec = 300');
  expect(result.config).toContain('[mcp_servers.figmanage.env]\nFIGMA_TOOLSETS = "starter"\nFIGMA_READ_ONLY = "true"');
});

it('wraps npx for native Windows without a shell on other platforms', () => {
  const server = JSON.parse(generateMcpConfig('claude-code', { platform: 'win32' }).config).mcpServers.figmanage;
  expect(server).toMatchObject({ command: 'cmd', args: ['/d', '/c', 'npx', '-y', 'figmanage', '--mcp'] });
});

it('uses absolute local paths and preserves read-only settings', () => {
  const server = JSON.parse(generateMcpConfig('vscode', { local: true, readOnly: true }).config).servers.figmanage;
  expect(server.command).toBe(process.execPath);
  expect(server.args[0]).toBe(fileURLToPath(new URL('../src/index.js', import.meta.url)));
  expect(server.args[1]).toBe('--mcp');
  expect(server.env).toEqual({ FIGMA_READ_ONLY: 'true' });
});
