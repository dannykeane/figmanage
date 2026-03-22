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

await import('../src/tools/projects.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('create_project', () => {
  beforeEach(() => { mockInternalAxios.post.mockReset(); });

  it('creates project successfully', async () => {
    const handler = getHandler('create_project', cookieOnlyConfig());
    mockInternalAxios.post.mockResolvedValueOnce(axiosResponse({
      meta: [{ id: 777, name: 'New Project' }],
    }));

    const result = await handler({ team_id: 'team-1', name: 'New Project' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.id).toBe('777');
    expect(parsed.name).toBe('New Project');
    expect(parsed.team_id).toBe('team-1');
  });

  it('handles API error', async () => {
    const handler = getHandler('create_project', cookieOnlyConfig());
    mockInternalAxios.post.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ team_id: 'team-1', name: 'New Project' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});

describe('rename_project', () => {
  beforeEach(() => { mockInternalAxios.put.mockReset(); });

  it('renames project successfully', async () => {
    const handler = getHandler('rename_project', cookieOnlyConfig());
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ project_id: 'proj-1', name: 'Renamed' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('proj-1');
    expect(text).toContain('Renamed');
  });

  it('handles API error', async () => {
    const handler = getHandler('rename_project', cookieOnlyConfig());
    mockInternalAxios.put.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ project_id: 'proj-1', name: 'Renamed' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('move_project', () => {
  beforeEach(() => { mockInternalAxios.put.mockReset(); });

  it('moves project successfully', async () => {
    const handler = getHandler('move_project', cookieOnlyConfig());
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ project_id: 'proj-1', destination_team_id: 'team-2' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('proj-1');
    expect(text).toContain('team-2');
  });

  it('handles API error', async () => {
    const handler = getHandler('move_project', cookieOnlyConfig());
    mockInternalAxios.put.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ project_id: 'proj-1', destination_team_id: 'team-2' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});

describe('trash_project', () => {
  beforeEach(() => { mockInternalAxios.put.mockReset(); });

  it('trashes project successfully', async () => {
    const handler = getHandler('trash_project', cookieOnlyConfig());
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ project_id: 'proj-1' });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('proj-1');
  });

  it('handles API error', async () => {
    const handler = getHandler('trash_project', cookieOnlyConfig());
    mockInternalAxios.put.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ project_id: 'proj-1' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('restore_project', () => {
  beforeEach(() => { mockInternalAxios.put.mockReset(); });

  it('restores project successfully', async () => {
    const handler = getHandler('restore_project', cookieOnlyConfig());
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ project_id: 'proj-1' });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('proj-1');
  });

  it('handles API error', async () => {
    const handler = getHandler('restore_project', cookieOnlyConfig());
    mockInternalAxios.put.mockRejectedValueOnce(axiosError(500, 'Server error'));

    const result = await handler({ project_id: 'proj-1' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('server error');
  });
});

describe('set_project_description', () => {
  beforeEach(() => { mockInternalAxios.put.mockReset(); });

  it('sets description successfully', async () => {
    const handler = getHandler('set_project_description', cookieOnlyConfig());
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ project_id: 'proj-1', description: 'Updated desc' });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('proj-1');
  });

  it('handles API error', async () => {
    const handler = getHandler('set_project_description', cookieOnlyConfig());
    mockInternalAxios.put.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ project_id: 'proj-1', description: 'Updated desc' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});
