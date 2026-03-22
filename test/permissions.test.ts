import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockServer,
  cookieOnlyConfig,
  getToolText,
  parseToolResult,
  axiosResponse,
  axiosError,
} from './helpers.js';

const mockInternalAxios = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
}));

const toolDefs = vi.hoisted(() => [] as Array<{ toolset: string; register: Function }>);

vi.mock('../src/clients/internal-api.js', () => ({
  internalClient: () => mockInternalAxios,
}));

vi.mock('../src/auth/client.js', () => ({
  hasPat: (config: any) => !!config.pat,
  hasCookie: (config: any) => !!config.cookie && !!config.userId,
}));

vi.mock('../src/auth/health.js', () => ({
  checkAuth: vi.fn(),
  formatAuthStatus: vi.fn(),
}));

vi.mock('../src/clients/public-api.js', () => ({
  publicClient: () => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  }),
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
    requireOrgId: (config: any, explicit?: string) => {
      const id = explicit || config.orgId;
      if (!id) throw new Error('Org context required. Run list_orgs to see available workspaces, or set FIGMA_ORG_ID.');
      return id;
    },
  };
});

await import('../src/tools/permissions.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('get_permissions', () => {
  beforeEach(() => {
    mockInternalAxios.get.mockReset();
  });

  it('returns formatted user roles', async () => {
    const handler = getHandler('get_permissions', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: [
        { id: 'role-1', user_id: '100', level: 300, user: { handle: 'alice', email: 'alice@example.com' } },
        { id: 'role-2', user_id: '200', level: 100, user: { handle: 'bob', email: 'bob@example.com' } },
        { id: 'role-3', user_id: null, level: 100, pending_email: 'pending@example.com' },
      ],
    }));

    const result = await handler({ resource_type: 'file', resource_id: 'abc123' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({ role_id: 'role-1', user_id: '100', handle: 'alice', role: 'editor' });
    expect(parsed[1]).toMatchObject({ role_id: 'role-2', user_id: '200', handle: 'bob', role: 'viewer' });
    expect(parsed[2]).toMatchObject({ role_id: 'role-3', email: 'pending@example.com', pending: true });
  });

  it('handles API error', async () => {
    const handler = getHandler('get_permissions', cookieOnlyConfig());

    mockInternalAxios.get.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ resource_type: 'team', resource_id: 'team-1' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});

describe('set_permissions', () => {
  beforeEach(() => {
    mockInternalAxios.get.mockReset();
    mockInternalAxios.put.mockReset();
  });

  it('updates role for existing user', async () => {
    const handler = getHandler('set_permissions', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: [
        { id: 'role-1', user_id: '999', level: 100, user: { handle: 'alice', email: 'a@b.com' } },
      ],
    }));
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ resource_type: 'file', resource_id: 'abc123', user_id: '999', role: 'editor' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('editor');
    expect(text).toContain('999');
    expect(mockInternalAxios.put).toHaveBeenCalledWith('/api/roles/role-1', expect.objectContaining({ level: 300 }));
  });

  it('returns error when user not found', async () => {
    const handler = getHandler('set_permissions', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: [
        { id: 'role-1', user_id: '111', level: 100, user: { handle: 'other' } },
      ],
    }));

    const result = await handler({ resource_type: 'file', resource_id: 'abc123', user_id: '999', role: 'editor' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('999');
    expect(getToolText(result)).toContain('no role');
  });
});

describe('share', () => {
  beforeEach(() => {
    mockInternalAxios.post.mockReset();
  });

  it('sends invite and returns role_id', async () => {
    const handler = getHandler('share', cookieOnlyConfig());

    mockInternalAxios.post.mockResolvedValueOnce(axiosResponse({
      meta: { invites: [{ id: 'invite-42' }] },
    }));

    const result = await handler({ resource_type: 'file', resource_id: 'abc123', email: 'new@example.com', role: 'editor' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('new@example.com');
    expect(text).toContain('editor');
    expect(text).toContain('invite-42');
    expect(mockInternalAxios.post).toHaveBeenCalledWith('/api/invites', expect.objectContaining({
      emails: ['new@example.com'],
      level: 300,
    }));
  });

  it('defaults to viewer role', async () => {
    const handler = getHandler('share', cookieOnlyConfig());

    mockInternalAxios.post.mockResolvedValueOnce(axiosResponse({ meta: { invites: [] } }));

    const result = await handler({ resource_type: 'folder', resource_id: 'proj-1', email: 'v@example.com' });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('viewer');
    expect(mockInternalAxios.post).toHaveBeenCalledWith('/api/invites', expect.objectContaining({ level: 100 }));
  });
});

describe('revoke_access', () => {
  beforeEach(() => {
    mockInternalAxios.get.mockReset();
    mockInternalAxios.delete.mockReset();
  });

  it('deletes role for existing user', async () => {
    const handler = getHandler('revoke_access', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: [
        { id: 'role-5', user_id: '777', level: 300, user: { handle: 'bob' } },
      ],
    }));
    mockInternalAxios.delete.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ resource_type: 'file', resource_id: 'abc123', user_id: '777' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('Revoked');
    expect(text).toContain('777');
    expect(mockInternalAxios.delete).toHaveBeenCalledWith('/api/roles/role-5');
  });

  it('returns error when user not found', async () => {
    const handler = getHandler('revoke_access', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: [] }));

    const result = await handler({ resource_type: 'team', resource_id: 'team-1', user_id: '999' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('999');
    expect(getToolText(result)).toContain('no role');
  });
});

describe('list_role_requests', () => {
  beforeEach(() => {
    mockInternalAxios.get.mockReset();
  });

  it('returns filtered role request notifications', async () => {
    const handler = getHandler('list_role_requests', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: [
        {
          notification_id: 'notif-1',
          notification_type: 'FileRoleRequestCreatedNotif',
          is_unread: true,
          preferred_attachments: [{
            body: {
              title: [{ html_text: 'alice@example.com' }],
              subtitle: [{ html_text: 'requested edit access' }, {}, { html_text: 'Design System' }],
              created_at: '2024-01-01',
            },
            actions: [{ label: 'Approve' }],
          }],
        },
        {
          notification_id: 'notif-2',
          notification_type: 'SomeOtherNotif',
          is_unread: false,
        },
      ],
    }));

    const result = await handler({});
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      notification_id: 'notif-1',
      email: 'alice@example.com',
      action: 'requested edit access',
      file_name: 'Design System',
      pending: true,
      is_unread: true,
    });
  });
});

describe('approve_role_request', () => {
  beforeEach(() => {
    mockInternalAxios.put.mockReset();
  });

  it('approves request by notification ID', async () => {
    const handler = getHandler('approve_role_request', cookieOnlyConfig());

    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({
      meta: {
        notification: {
          locals: { file_name: 'Homepage', user_id: '555' },
        },
      },
    }));

    const result = await handler({ notification_id: 'notif-1' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('Approved');
    expect(text).toContain('notif-1');
    expect(text).toContain('Homepage');
    expect(text).toContain('555');
    expect(mockInternalAxios.put).toHaveBeenCalledWith('/api/user_notifications/accept', expect.objectContaining({
      id: 'notif-1',
    }));
  });
});

describe('deny_role_request', () => {
  beforeEach(() => {
    mockInternalAxios.put.mockReset();
  });

  it('denies request by notification ID', async () => {
    const handler = getHandler('deny_role_request', cookieOnlyConfig());

    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ notification_id: 'notif-2' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('Declined');
    expect(text).toContain('notif-2');
    expect(mockInternalAxios.put).toHaveBeenCalledWith('/api/user_notifications/reject', expect.objectContaining({
      id: 'notif-2',
    }));
  });
});
