import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getActiveWorkspace, readConfig, setActiveWorkspace } from '../src/config.js';
import { configureExecution } from '../src/execution.js';

vi.mock('node:readline', () => ({ createInterface: () => ({
  question: (_question: string, answer: (value: string) => void) => queueMicrotask(() => answer('new-test-pat')),
  close: () => {},
}) }));
vi.mock('../src/auth/cookie.js', () => ({
  validatePatIdentity: vi.fn(async () => ({ id: 'self', user: 'Test' })),
  extractCookies: vi.fn(), resolveAccountInfo: vi.fn(), validateSession: vi.fn(),
}));
const { handleLogin } = await import('../src/cli/login.js');
const { validatePatIdentity } = await import('../src/auth/cookie.js');
let directory: string;
let tty: PropertyDescriptor | undefined;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'figmanage-login-test-'));
  vi.stubEnv('FIGMANAGE_CONFIG_DIR', directory);
  configureExecution({});
  tty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  if (tty) Object.defineProperty(process.stdin, 'isTTY', tty);
  else Reflect.deleteProperty(process.stdin, 'isTTY');
  vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true });
});

it('adds a PAT locally without discarding the matching browser session or workspace name', async () => {
  setActiveWorkspace('named', { cookie: 'keep-cookie', user_id: 'self', org_id: 'org-1' });
  await handleLogin({ patOnly: true });
  expect(getActiveWorkspace()).toMatchObject({ cookie: 'keep-cookie', pat: 'new-test-pat', user_id: 'self' });
  expect(readConfig()?.active_workspace).toBe('named');
});

it('rejects a PAT from another account and preserves saved credentials', async () => {
  setActiveWorkspace('named', { cookie: 'keep-cookie', user_id: 'other', pat: 'keep-pat' });
  await expect(handleLogin({ patOnly: true })).rejects.toThrow('does not match');
  expect(getActiveWorkspace()).toMatchObject({ cookie: 'keep-cookie', pat: 'keep-pat' });
});

it('preserves saved credentials when PAT validation fails', async () => {
  setActiveWorkspace('named', { cookie: 'keep-cookie', user_id: 'self', pat: 'keep-pat' });
  vi.mocked(validatePatIdentity).mockRejectedValueOnce(new Error('Token rejected'));
  await expect(handleLogin({ patOnly: true })).rejects.toThrow('Token rejected');
  expect(getActiveWorkspace()?.pat).toBe('keep-pat');
});
