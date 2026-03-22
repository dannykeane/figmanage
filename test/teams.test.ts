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

await import('../src/tools/teams.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('create_team', () => {
  beforeEach(() => {
    mockInternalAxios.post.mockReset();
  });

  it('creates team successfully', async () => {
    const handler = getHandler('create_team', cookieOnlyConfig());

    mockInternalAxios.post.mockResolvedValueOnce(axiosResponse({
      meta: { team: { id: 'team-123', name: 'New Team' } },
    }));

    const result = await handler({ name: 'New Team', org_id: undefined });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('team-123');
    expect(text).toContain('New Team');
  });

  it('requires org context', async () => {
    const handler = getHandler('create_team', cookieOnlyConfig({ orgId: undefined }));

    const result = await handler({ name: 'New Team', org_id: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Org context required');
  });
});

describe('rename_team', () => {
  beforeEach(() => {
    mockInternalAxios.put.mockReset();
  });

  it('renames team successfully', async () => {
    const handler = getHandler('rename_team', cookieOnlyConfig());

    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ team_id: 'team-123', name: 'Renamed Team' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('team-123');
  });

  it('handles 404', async () => {
    const handler = getHandler('rename_team', cookieOnlyConfig());

    mockInternalAxios.put.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ team_id: 'team-missing', name: 'Whatever' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('delete_team', () => {
  beforeEach(() => {
    mockInternalAxios.delete.mockReset();
  });

  it('deletes team successfully', async () => {
    const handler = getHandler('delete_team', cookieOnlyConfig());

    mockInternalAxios.delete.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ team_id: 'team-123' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('team-123');
  });

  it('handles 403', async () => {
    const handler = getHandler('delete_team', cookieOnlyConfig());

    mockInternalAxios.delete.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ team_id: 'team-456' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});

describe('add_team_member', () => {
  beforeEach(() => {
    mockInternalAxios.post.mockReset();
  });

  it('invites member with default view level', async () => {
    const handler = getHandler('add_team_member', cookieOnlyConfig());

    mockInternalAxios.post.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ team_id: 'team-123', email: 'alice@example.com', level: undefined });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('alice@example.com');
    expect(text).toContain('team-123');
    expect(mockInternalAxios.post).toHaveBeenCalledWith(
      '/api/invites',
      {
        emails: ['alice@example.com'],
        resource_type: 'team',
        resource_id_or_key: 'team-123',
        level: 100,
        user_group_ids: [],
      },
    );
  });

  it('passes custom level', async () => {
    const handler = getHandler('add_team_member', cookieOnlyConfig());

    mockInternalAxios.post.mockResolvedValueOnce(axiosResponse({}));

    await handler({ team_id: 'team-123', email: 'alice@example.com', level: 300 });

    expect(mockInternalAxios.post).toHaveBeenCalledWith(
      '/api/invites',
      expect.objectContaining({ level: 300 }),
    );
  });

  it('handles API error', async () => {
    const handler = getHandler('add_team_member', cookieOnlyConfig());

    mockInternalAxios.post.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ team_id: 'team-123', email: 'alice@example.com', level: undefined });

    expect(result.isError).toBe(true);
  });
});

describe('remove_team_member', () => {
  beforeEach(() => {
    mockInternalAxios.get.mockReset();
    mockInternalAxios.delete.mockReset();
  });

  it('looks up role_id and removes member', async () => {
    const handler = getHandler('remove_team_member', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: [
        { id: 'u456', name: 'Alice', email: 'alice@example.com', team_role: { id: 'role-789', level: 300 } },
      ],
    }));
    mockInternalAxios.delete.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ team_id: 'team-123', user_id: 'u456' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('Alice');
    expect(mockInternalAxios.get).toHaveBeenCalledWith('/api/teams/team-123/members');
    expect(mockInternalAxios.delete).toHaveBeenCalledWith('/api/roles/role-789');
  });

  it('errors when user not found in team', async () => {
    const handler = getHandler('remove_team_member', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: [] }));

    const result = await handler({ team_id: 'team-123', user_id: 'u999' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
    expect(mockInternalAxios.delete).not.toHaveBeenCalled();
  });

  it('errors when user has no direct team role', async () => {
    const handler = getHandler('remove_team_member', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: [{ id: 'u456', name: 'Alice', email: 'alice@example.com', team_role: null }],
    }));

    const result = await handler({ team_id: 'team-123', user_id: 'u456' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('no direct team role');
    expect(mockInternalAxios.delete).not.toHaveBeenCalled();
  });
});
