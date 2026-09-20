import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { setActiveWorkspace, getActiveWorkspace, readConfig } from '../src/config.js';

vi.mock('../src/auth/cookie.js', () => ({
  validatePat: vi.fn(async () => 'Test'),
  validatePatIdentity: vi.fn(async () => ({ id: 'self', user: 'Test' })),
  validateSession: vi.fn(async () => ({ orgId: 'org-1', orgs: [{ id: 'org-1', name: 'First' }], teams: [] })),
  extractCookies: vi.fn(() => [{ userId: 'self', cookieValue: 'test-cookie' }]),
  resolveAccountInfo: vi.fn(async () => ({ figmaEmail: 'test@example.com', profileName: 'Test' })),
}));
vi.mock('../src/clients/public-api.js', () => ({ publicClient: () => ({ get: async () => ({ data: { id: 'self', handle: 'Test' } }) }) }));
vi.mock('../src/clients/internal-api.js', () => ({ internalClient: () => ({ get: async (path: string) => ({ data: { meta: path.includes('/org-2/') ? [] : [{ user_id: 'self' }] } }) }) }));
const { createMcpServer } = await import('../src/mcp.js');
const { validatePatIdentity, extractCookies, validateSession } = await import('../src/auth/cookie.js');
let directory: string;
beforeEach(() => {
  for (const key of Object.keys(process.env).filter(key => /^FIGMA/.test(key))) vi.stubEnv(key, undefined);
  directory = mkdtempSync(join(tmpdir(), 'figmanage-setup-test-'));
  vi.stubEnv('FIGMANAGE_CONFIG_DIR', directory);
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
async function connect() {
  const server = await createMcpServer();
  const client = new Client({ name: 'setup-test', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}
it('sets up PAT-only credentials in a fresh config and permits repeated setup', async () => {
  const session = await connect();
  try {
    for (const pat of ['test-pat-1','test-pat-2']) {
      const result = await session.client.callTool({ name: 'setup_save_pat', arguments: { pat } });
      expect(result.isError).not.toBe(true);
      const { tools } = await session.client.listTools();
      expect(tools.some(tool => tool.name === 'list_comments')).toBe(true);
      expect(tools.some(tool => tool.name === 'create_file')).toBe(false);
      expect(new Set(tools.map(tool => tool.name)).size).toBe(tools.length);
      expect(getActiveWorkspace()?.pat).toBe(pat);
    }
  } finally { await session.close(); }
});
it('activates cookie tools immediately after account selection', async () => {
  const session = await connect();
  try {
    await session.client.callTool({ name: 'setup_extract_cookies', arguments: {} });
    const result = await session.client.callTool({ name: 'setup_select_account', arguments: { account_index: 1 } });
    expect(result.isError).not.toBe(true);
    expect((await session.client.listTools()).tools.some(tool => tool.name === 'create_file')).toBe(true);
  } finally { await session.close(); }
});
it('adds PAT tools to an existing cookie session without duplicate registration', async () => {
  setActiveWorkspace('first', { cookie: 'test-cookie', user_id: 'self', org_id: 'org-1' });
  const session = await connect();
  try {
    const result = await session.client.callTool({ name: 'setup_save_pat', arguments: { pat: 'test-pat' } });
    expect(result.isError).not.toBe(true);
    const { tools } = await session.client.listTools();
    expect(tools.some(tool => tool.name === 'list_comments')).toBe(true);
    expect(tools.filter(tool => tool.name === 'check_auth')).toHaveLength(1);
  } finally { await session.close(); }
});
it('rechecks admin capabilities after switching workspaces', async () => {
  vi.stubEnv('FIGMA_PAT', 'test-pat'); vi.stubEnv('FIGMA_AUTH_COOKIE', 'test-cookie'); vi.stubEnv('FIGMA_USER_ID', 'self');
  vi.stubEnv('FIGMA_ORG_ID', 'org-1'); vi.stubEnv('FIGMA_ORGS', JSON.stringify([{ id: 'org-1', name: 'First' }, { id: 'org-2', name: 'Second' }]));
  const session = await connect();
  try {
    const before = (await session.client.listTools()).tools.map(tool => tool.name);
    expect(before).toContain('offboard_user');
    const result = await session.client.callTool({ name: 'switch_org', arguments: { org: 'Second' } });
    expect(result.isError).not.toBe(true);
    expect((await session.client.listTools()).tools.map(tool => tool.name)).not.toContain('offboard_user');
  } finally { await session.close(); }
});

it('keeps recovery tools available with both credentials and preserves the saved PAT', async () => {
  setActiveWorkspace('named-workspace', { cookie: 'old-cookie', user_id: 'self', org_id: 'org-1', pat: 'keep-pat' });
  const session = await connect();
  try {
    const names = (await session.client.listTools()).tools.map(tool => tool.name);
    expect(names).toContain('setup_status');
    expect(names).toContain('setup_extract_cookies');
    const extracted = await session.client.callTool({ name: 'setup_extract_cookies', arguments: {} });
    expect(extracted.structuredContent?.result).toMatchObject({ recommended_account_index: 1, requires_user_action: false });
    expect(JSON.stringify(extracted)).not.toContain('test-cookie');
    await session.client.callTool({ name: 'setup_select_account', arguments: { account_index: 1 } });
    expect(getActiveWorkspace()).toMatchObject({ cookie: 'test-cookie', pat: 'keep-pat', user_id: 'self' });
    expect(readConfig()?.active_workspace).toBe('named-workspace');
  } finally { await session.close(); }
});

it('preserves a PAT-only setup when the browser account matches', async () => {
  setActiveWorkspace('default', { pat: 'keep-pat' });
  const session = await connect();
  try {
    await session.client.callTool({ name: 'setup_extract_cookies', arguments: {} });
    await session.client.callTool({ name: 'setup_select_account', arguments: { account_index: 1 } });
    expect(getActiveWorkspace()).toMatchObject({ cookie: 'test-cookie', pat: 'keep-pat' });
  } finally { await session.close(); }
});

it('keeps the previous account intact when selecting another account in the same org', async () => {
  setActiveWorkspace('org-1', { cookie: 'old-cookie', user_id: 'other', org_id: 'org-1', pat: 'old-pat' });
  const session = await connect();
  try {
    const extracted = await session.client.callTool({ name: 'setup_extract_cookies', arguments: {} });
    expect(extracted.structuredContent?.result).toMatchObject({ recommended_account_index: null, requires_user_action: true });
    await session.client.callTool({ name: 'setup_select_account', arguments: { account_index: 1 } });
    expect(getActiveWorkspace()?.pat).toBeUndefined();
    expect(readConfig()?.workspaces['org-1']).toMatchObject({ pat: 'old-pat', user_id: 'other' });
  } finally { await session.close(); }
});

it('rejects a mismatched PAT without changing saved credentials', async () => {
  setActiveWorkspace('first', { cookie: 'keep-cookie', user_id: 'other', pat: 'keep-pat' });
  const session = await connect();
  try {
    const result = await session.client.callTool({ name: 'setup_save_pat', arguments: { pat: 'wrong-account' } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error).toMatchObject({ code: 'authentication_required' });
    expect(getActiveWorkspace()).toMatchObject({ cookie: 'keep-cookie', pat: 'keep-pat' });
    expect(validatePatIdentity).toHaveBeenCalledWith('wrong-account');
  } finally { await session.close(); }
});

it('does not recommend a browser account that differs from a PAT-only setup', async () => {
  setActiveWorkspace('first', { pat: 'keep-pat' });
  vi.mocked(validatePatIdentity).mockResolvedValueOnce({ id: 'other', user: 'Other' });
  const session = await connect();
  try {
    const result = await session.client.callTool({ name: 'setup_extract_cookies', arguments: {} });
    expect(result.structuredContent?.result).toMatchObject({ recommended_account_index: null, requires_user_action: true });
    expect(getActiveWorkspace()).toEqual({ pat: 'keep-pat' });
  } finally { await session.close(); }
});

it('preserves credentials when session validation fails', async () => {
  setActiveWorkspace('first', { cookie: 'keep-cookie', user_id: 'self', pat: 'keep-pat' });
  const session = await connect();
  try {
    await session.client.callTool({ name: 'setup_extract_cookies', arguments: {} });
    vi.mocked(validateSession).mockRejectedValueOnce(new Error('Network unavailable'));
    const result = await session.client.callTool({ name: 'setup_select_account', arguments: { account_index: 1 } });
    expect(result.isError).toBe(true);
    expect(getActiveWorkspace()).toMatchObject({ cookie: 'keep-cookie', pat: 'keep-pat' });
  } finally { await session.close(); }
});

it('does not read Chrome credentials when environment auth overrides saved setup', async () => {
  vi.stubEnv('FIGMA_PAT', 'environment-pat');
  const session = await connect();
  try {
    const result = await session.client.callTool({ name: 'setup_extract_cookies', arguments: {} });
    expect(result.isError).toBe(true);
    expect(extractCookies).not.toHaveBeenCalled();
  } finally { await session.close(); }
});

it('exposes read-only diagnostics without credential-writing tools in read-only mode', async () => {
  vi.stubEnv('FIGMA_READ_ONLY', 'true');
  const session = await connect();
  try {
    const tools = (await session.client.listTools()).tools;
    expect(tools.map(tool => tool.name)).toContain('setup_status');
    expect(tools.every(tool => tool.annotations?.readOnlyHint)).toBe(true);
    expect(tools.map(tool => tool.name)).not.toContain('setup_extract_cookies');
    const result = await session.client.callTool({ name: 'setup_status', arguments: {} });
    expect(result.structuredContent?.result).toMatchObject({ ready: false, credential_source: 'none' });
    expect(extractCookies).not.toHaveBeenCalled();
  } finally { await session.close(); }
});
