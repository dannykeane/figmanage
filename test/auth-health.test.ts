import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatApiError } from '../src/helpers.js';
import { dualAuthConfig, patOnlyConfig } from './helpers.js';

const publicGet = vi.hoisted(() => vi.fn());
const internalGet = vi.hoisted(() => vi.fn());
vi.mock('../src/clients/public-api.js', () => ({ publicClient: () => ({ get: publicGet }) }));
vi.mock('../src/clients/internal-api.js', () => ({ internalClient: () => ({ get: internalGet }) }));
import { setupStatus } from '../src/auth/setup-status.js';

beforeEach(() => {
  for (const key of ['FIGMA_PAT', 'FIGMA_AUTH_COOKIE', 'FIGMA_USER_ID']) vi.stubEnv(key, undefined);
  publicGet.mockResolvedValue({ data: { id: '12345', handle: 'Test' } });
  internalGet.mockResolvedValue({ data: { meta: { user: { id: '12345', handle: 'Test' } } } });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('setup diagnostics', () => {
  it('allows PAT-only work without requiring a browser session', async () => {
    const status = await setupStatus(patOnlyConfig());
    expect(status).toMatchObject({ ready: true, capabilities: { public_api: true, workspace_api: false } });
    expect(status.next_actions).toEqual([expect.objectContaining({ action: 'connect_browser', needed_for: 'workspace_api' })]);
    expect(internalGet).not.toHaveBeenCalled();
  });

  it('reports missing credentials without network access', async () => {
    const status = await setupStatus({});
    expect(status).toMatchObject({ ready: false, credential_source: 'none' });
    expect(publicGet).not.toHaveBeenCalled(); expect(internalGet).not.toHaveBeenCalled();
  });

  it('distinguishes expired sessions from permission errors', async () => {
    internalGet.mockRejectedValueOnce({ response: { status: 401 } });
    expect((await setupStatus(dualAuthConfig())).next_actions[0].action).toBe('connect_browser');
    internalGet.mockRejectedValueOnce({ response: { status: 403 } });
    expect((await setupStatus(dualAuthConfig())).next_actions[0].action).toBe('check_access');
  });

  it('does not recommend replacing credentials after a network failure', async () => {
    publicGet.mockRejectedValueOnce(new Error('Offline'));
    const result = await setupStatus(patOnlyConfig());
    expect(result.next_actions.find(action => action.needed_for === 'public_api')).toMatchObject({ action: 'retry_check', requires_user_action: false });
  });

  it('detects mismatched accounts and never exposes secrets', async () => {
    publicGet.mockResolvedValueOnce({ data: { id: 'someone-else', handle: 'Other' } });
    const config = dualAuthConfig();
    const result = await setupStatus(config);
    expect(result).toMatchObject({ ready: false, identity_match: false });
    expect(result.next_actions[0].action).toBe('choose_account');
    expect(JSON.stringify(result)).not.toContain(config.pat);
    expect(JSON.stringify(result)).not.toContain(config.cookie);
  });

  it('explains environment precedence instead of recommending ineffective saved login', async () => {
    vi.stubEnv('FIGMA_PAT', 'env-pat');
    const result = await setupStatus(patOnlyConfig());
    expect(result.credential_source).toBe('environment');
    expect(result.next_actions[0].action).toBe('update_environment');
  });

  it('does not treat an API error envelope as a valid session', async () => {
    internalGet.mockResolvedValueOnce({ data: { error: true } });
    const result = await setupStatus(dualAuthConfig());
    expect(result.status.cookie.valid).toBe(false);
  });

  it('omits boolean API error details from recovery messages', () => {
    const message = formatApiError({ response: { status: 401, data: { error: true, message: '' } } });
    expect(message).toContain('setup_status');
    expect(message).not.toContain(': true');
  });
});
