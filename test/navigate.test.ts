import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockServer,
  patOnlyConfig,
  cookieOnlyConfig,
  dualAuthConfig,
  getToolText,
  parseToolResult,
  axiosResponse,
} from './helpers.js';

const mockPublicAxios = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
}));

const mockInternalAxios = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
}));

const mockCheckAuth = vi.hoisted(() => vi.fn());
const mockFormatAuthStatus = vi.hoisted(() => vi.fn());

const toolDefs = vi.hoisted(() => [] as Array<{ toolset: string; register: Function }>);

vi.mock('../src/clients/public-api.js', () => ({
  publicClient: () => mockPublicAxios,
}));

vi.mock('../src/clients/internal-api.js', () => ({
  internalClient: () => mockInternalAxios,
}));

vi.mock('../src/auth/health.js', () => ({
  checkAuth: mockCheckAuth,
  formatAuthStatus: mockFormatAuthStatus,
}));

vi.mock('../src/auth/client.js', () => ({
  hasPat: (config: any) => !!config.pat,
  hasCookie: (config: any) => !!config.cookie && !!config.userId,
}));

vi.mock('../src/tools/register.js', async () => {
  const { z } = await import('zod');
  return {
    defineTool: (def: any) => { toolDefs.push(def); },
    toolResult: (text: string) => ({ content: [{ type: 'text', text }] }),
    toolSummary: (summary: string, data: unknown, nextStep?: string) => {
      const parts = [summary, '', JSON.stringify(data, null, 2)];
      if (nextStep) parts.push('', nextStep);
      return { content: [{ type: 'text', text: parts.join('\n') }] };
    },
    toolError: (message: string) => ({ isError: true, content: [{ type: 'text', text: message }] }),
    figmaId: z.string().regex(/^[\w.:-]+$/, 'Invalid ID format'),
    resolveOrgId: (config: any, explicit?: string) => explicit || config.orgId,
  };
});

await import('../src/tools/navigate.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('check_auth', () => {
  it('reports both PAT and cookie valid', async () => {
    const handler = getHandler('check_auth', dualAuthConfig());

    mockCheckAuth.mockResolvedValueOnce({
      pat: { valid: true, user: 'danny' },
      cookie: { valid: true, user: 'danny' },
    });
    mockFormatAuthStatus.mockReturnValueOnce('PAT: valid (danny)\nSession: valid (danny)');

    const result = await handler({});
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('PAT: valid (danny)');
    expect(text).toContain('Session: valid (danny)');
  });

  it('reports PAT valid, cookie missing', async () => {
    const handler = getHandler('check_auth', patOnlyConfig());

    mockCheckAuth.mockResolvedValueOnce({
      pat: { valid: true, user: 'danny' },
      cookie: { valid: false, error: 'FIGMA_AUTH_COOKIE, FIGMA_USER_ID not set' },
    });
    mockFormatAuthStatus.mockReturnValueOnce(
      'PAT: valid (danny)\nSession: FIGMA_AUTH_COOKIE, FIGMA_USER_ID not set\n\nPublic API only. Internal API tools unavailable.',
    );

    const result = await handler({});
    const text = getToolText(result);

    expect(text).toContain('PAT: valid');
    expect(text).toContain('Public API only');
  });

  it('reports both invalid', async () => {
    const config = { pat: 'fake' };
    const handler = getHandler('check_auth', config);

    mockCheckAuth.mockResolvedValueOnce({
      pat: { valid: false, error: 'PAT invalid or expired' },
      cookie: { valid: false, error: 'FIGMA_AUTH_COOKIE not set' },
    });
    mockFormatAuthStatus.mockReturnValueOnce(
      'PAT: PAT invalid or expired\nSession: FIGMA_AUTH_COOKIE not set\n\nNo valid auth.',
    );

    const result = await handler({});
    expect(getToolText(result)).toContain('No valid auth');
  });

  it('reports expired cookie with helpful message', async () => {
    const handler = getHandler('check_auth', dualAuthConfig());

    mockCheckAuth.mockResolvedValueOnce({
      pat: { valid: true, user: 'danny' },
      cookie: { valid: false, error: 'Session cookie expired' },
    });
    mockFormatAuthStatus.mockReturnValueOnce(
      'PAT: valid (danny)\nSession: Session cookie expired. Extract a new one from browser DevTools',
    );

    const result = await handler({});
    expect(getToolText(result)).toContain('cookie expired');
  });

  it('passes config to checkAuth', async () => {
    const config = dualAuthConfig();
    const handler = getHandler('check_auth', config);

    mockCheckAuth.mockResolvedValueOnce({
      pat: { valid: true, user: 'test' },
      cookie: { valid: true, user: 'test' },
    });
    mockFormatAuthStatus.mockReturnValueOnce('ok');

    await handler({});

    expect(mockCheckAuth).toHaveBeenCalledWith(config);
  });
});

describe('list_orgs', () => {
  beforeEach(() => {
    mockInternalAxios.get.mockReset();
  });

  it('uses meta.orgs when available (admin user)', async () => {
    const config = cookieOnlyConfig();
    const handler = getHandler('list_orgs', config);

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: {
        orgs: [
          { id: '111', name: 'Acme Corp' },
          { id: '222', name: 'Other Inc' },
        ],
        roles: [],
      },
    }));

    const result = await handler({});
    const parsed = parseToolResult(result);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ id: '111', name: 'Acme Corp', active: false });
    expect(parsed[1]).toEqual({ id: '222', name: 'Other Inc', active: false });
  });

  it('falls back to meta.roles org_ids for non-admin users', async () => {
    const config = cookieOnlyConfig({ orgId: 'org-a' });
    const handler = getHandler('list_orgs', config);

    mockInternalAxios.get
      // /api/user/state -- no orgs, but roles span two orgs
      .mockResolvedValueOnce(axiosResponse({
        meta: {
          orgs: [],
          roles: [
            { org_id: 'org-a', team_id: 't1', role: 'editor' },
            { org_id: 'org-b', team_id: 't2', role: 'viewer' },
            { org_id: 'org-a', team_id: 't3', role: 'editor' }, // duplicate org
          ],
        },
      }))
      // domain lookups
      .mockResolvedValueOnce(axiosResponse({ meta: [{ domain: 'acme.com' }] }))
      .mockResolvedValueOnce(axiosResponse({ meta: [{ domain: 'other.io' }] }));

    const result = await handler({});
    const parsed = parseToolResult(result);

    expect(parsed).toHaveLength(2);
    expect(parsed).toContainEqual({ id: 'org-a', name: 'acme.com', active: true });
    expect(parsed).toContainEqual({ id: 'org-b', name: 'other.io', active: false });
  });

  it('includes config.orgId even if not in roles', async () => {
    const config = cookieOnlyConfig({ orgId: 'org-x' });
    const handler = getHandler('list_orgs', config);

    mockInternalAxios.get
      .mockResolvedValueOnce(axiosResponse({
        meta: { orgs: [], roles: [{ org_id: 'org-y', team_id: 't1', role: 'editor' }] },
      }))
      // domain lookups for org-y and org-x
      .mockResolvedValueOnce(axiosResponse({ meta: [{ domain: 'y.com' }] }))
      .mockResolvedValueOnce(axiosResponse({ meta: [{ domain: 'x.com' }] }));

    const result = await handler({});
    const parsed = parseToolResult(result);

    expect(parsed).toHaveLength(2);
    expect(parsed).toContainEqual({ id: 'org-x', name: 'x.com', active: true });
    expect(parsed).toContainEqual({ id: 'org-y', name: 'y.com', active: false });
  });

  it('handles domain lookup failure gracefully', async () => {
    const config = cookieOnlyConfig({ orgId: 'org-z' });
    const handler = getHandler('list_orgs', config);

    mockInternalAxios.get
      .mockResolvedValueOnce(axiosResponse({
        meta: { orgs: [], roles: [{ org_id: 'org-z', team_id: 't1', role: 'editor' }] },
      }))
      .mockRejectedValueOnce(new Error('403 Forbidden'));

    const result = await handler({});
    const parsed = parseToolResult(result);

    // Falls back to using org ID as name
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({ id: 'org-z', name: 'org-z', active: true });
  });

  it('filters null org_ids from roles', async () => {
    const config = cookieOnlyConfig({ orgId: undefined });
    const handler = getHandler('list_orgs', config);

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: {
        orgs: [],
        roles: [
          { org_id: null, team_id: 't1', role: 'editor' },
          { org_id: 'org-real', team_id: 't2', role: 'viewer' },
        ],
      },
    }))
      .mockResolvedValueOnce(axiosResponse({ meta: [{ domain: 'real.com' }] }));

    const result = await handler({});
    const parsed = parseToolResult(result);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({ id: 'org-real', name: 'real.com', active: false });
  });
});
