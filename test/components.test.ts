import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockServer,
  patOnlyConfig,
  getToolText,
  parseToolResult,
  axiosResponse,
  axiosError,
} from './helpers.js';

const mockPublicAxios = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
}));

const toolDefs = vi.hoisted(() => [] as Array<{ toolset: string; register: Function }>);

vi.mock('../src/clients/public-api.js', () => ({
  publicClient: () => mockPublicAxios,
}));

vi.mock('../src/clients/internal-api.js', () => ({
  internalClient: () => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  }),
}));

vi.mock('../src/auth/client.js', () => ({
  hasPat: (config: any) => !!config.pat,
  hasCookie: (config: any) => !!config.cookie && !!config.userId,
}));

vi.mock('../src/auth/health.js', () => ({
  checkAuth: vi.fn(),
  formatAuthStatus: vi.fn(),
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

await import('../src/tools/components.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('list_file_components', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns components from file', async () => {
    const handler = getHandler('list_file_components', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: { components: [{ key: 'comp-1', name: 'Button' }] },
    }));

    const result = await handler({ file_key: 'abc123' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.count).toBe(1);
    expect(parsed.components).toHaveLength(1);
    expect(parsed.components[0].name).toBe('Button');
    expect(mockPublicAxios.get).toHaveBeenCalledWith('/v1/files/abc123/components');
  });

  it('returns error on API failure', async () => {
    const handler = getHandler('list_file_components', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ file_key: 'abc123' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});

describe('list_file_styles', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns styles from file', async () => {
    const handler = getHandler('list_file_styles', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: { styles: [{ key: 'style-1', name: 'Primary Color' }] },
    }));

    const result = await handler({ file_key: 'file-key-1' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.count).toBe(1);
    expect(parsed.styles).toHaveLength(1);
    expect(parsed.styles[0].name).toBe('Primary Color');
    expect(mockPublicAxios.get).toHaveBeenCalledWith('/v1/files/file-key-1/styles');
  });

  it('returns error on API failure', async () => {
    const handler = getHandler('list_file_styles', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(500, 'Internal server error'));

    const result = await handler({ file_key: 'file-key-1' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('server error');
  });
});

describe('list_team_components', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns components with pagination cursor', async () => {
    const handler = getHandler('list_team_components', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: {
        components: [
          { key: 'comp-1', name: 'Button' },
          { key: 'comp-2', name: 'Card' },
        ],
      },
      pagination: { after: 'cursor-xyz', before: null },
    }));

    const result = await handler({ team_id: 'team-1', page_size: 2, cursor: undefined });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.components).toHaveLength(2);
    expect(parsed.pagination.after).toBe('cursor-xyz');
    expect(mockPublicAxios.get).toHaveBeenCalledWith('/v1/teams/team-1/components', {
      params: { page_size: 2 },
    });
  });

  it('returns error on API failure', async () => {
    const handler = getHandler('list_team_components', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ team_id: 'team-missing', page_size: 30, cursor: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('list_team_styles', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns styles from team', async () => {
    const handler = getHandler('list_team_styles', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: {
        styles: [{ key: 'style-1', name: 'Heading 1' }],
      },
      pagination: { after: null, before: null },
    }));

    const result = await handler({ team_id: 'team-2', page_size: 30, cursor: undefined });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.styles).toHaveLength(1);
    expect(parsed.styles[0].name).toBe('Heading 1');
  });

  it('returns error on API failure', async () => {
    const handler = getHandler('list_team_styles', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(401, 'Unauthorized'));

    const result = await handler({ team_id: 'team-2', page_size: 30, cursor: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Authentication expired');
  });
});
