import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import stringWidth from 'string-width';
import { formatOutput } from '../src/cli/format.js';
import { configureExecution } from '../src/execution.js';
import { setActiveWorkspace, getActiveWorkspace } from '../src/config.js';
const cookies = vi.hoisted(() => ({ extractCookies: vi.fn(), validateSession: vi.fn(), validatePat: vi.fn(), resolveAccountInfo: vi.fn() }));
vi.mock('../src/auth/cookie.js', () => cookies);
import { handleLogin } from '../src/cli/login.js';
let directory: string;
const originalTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
const originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'figmanage-cli-contract-'));
  vi.stubEnv('FIGMANAGE_CONFIG_DIR', directory);
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); configureExecution({});
  for (const [key, descriptor] of [['isTTY', originalTTY], ['columns', originalColumns]] as const) {
    if (descriptor) Object.defineProperty(process.stdout, key, descriptor);
    else delete (process.stdout as any)[key];
  }
  rmSync(directory, { recursive: true, force: true });
});
it('sanitizes terminal control sequences while preserving JSON data', () => {
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
  const rows = [{ name: '\u001b[31mName\u001b[0m\nnext', id: '123' }];
  const table = formatOutput(rows, {});
  expect(table).not.toContain('\u001b');
  expect(table.split('\n')).toHaveLength(2);
  expect(JSON.parse(formatOutput(rows, { json: true }))).toEqual(rows);
});
it('fits wide Unicode values within the available table width', () => {
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
  Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 24 });
  const table = formatOutput([{ name: '界'.repeat(20), key: 'file-1' }], {});
  for (const line of table.split('\n')) expect(stringWidth(line)).toBeLessThanOrEqual(24);
});
it('refreshes only the stored cookie account and retains its PAT', async () => {
  configureExecution({});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  setActiveWorkspace('org-1', { pat: 'stored-pat', cookie: 'old-cookie', user_id: 'self', org_id: 'org-1' });
  cookies.extractCookies.mockReturnValue([{ userId: 'other', cookieValue: 'other-cookie' }, { userId: 'self', cookieValue: 'new-cookie' }]);
  cookies.validateSession.mockResolvedValue({ orgId: 'org-2', orgs: [{ id: 'org-1', name: 'First' }, { id: 'org-2', name: 'Second' }], teams: [] });
  await handleLogin({ refresh: true });
  expect(getActiveWorkspace()).toMatchObject({ pat: 'stored-pat', cookie: 'new-cookie', user_id: 'self', org_id: 'org-1' });
  expect(cookies.validatePat).not.toHaveBeenCalled();
});
it('leaves saved credentials untouched when refresh fails', async () => {
  configureExecution({});
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
  const original = { pat: 'stored-pat', cookie: 'old-cookie', user_id: 'self', org_id: 'org-1' };
  setActiveWorkspace('org-1', original);
  cookies.extractCookies.mockReturnValue([{ userId: 'self', cookieValue: 'new-cookie' }]);
  cookies.validateSession.mockRejectedValue(new Error('Cookie expired'));
  await expect(handleLogin({ refresh: true })).rejects.toThrow('Stored credentials were preserved');
  expect(getActiveWorkspace()).toEqual(original);
});
