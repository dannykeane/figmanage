import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockServer,
  cookieOnlyConfig,
  patOnlyConfig,
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

const mockPublicAxios = vi.hoisted(() => ({
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

vi.mock('../src/clients/public-api.js', () => ({
  publicClient: () => mockPublicAxios,
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

await import('../src/tools/branching.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('list_branches', () => {
  beforeEach(() => {
    mockInternalAxios.get.mockReset();
    mockPublicAxios.get.mockReset();
  });

  it('uses internal API when cookie available', async () => {
    const handler = getHandler('list_branches', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: {
        branches: [
          { key: 'branch-1', name: 'Feature A', last_modified: '2024-01-01T00:00:00Z' },
        ],
      },
    }));

    const result = await handler({ file_key: 'abc123' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed).toHaveLength(1);
    expect(parsed[0].key).toBe('branch-1');
    expect(parsed[0].name).toBe('Feature A');
    expect(mockInternalAxios.get).toHaveBeenCalledWith('/api/files/abc123');
  });

  it('uses public API when PAT only', async () => {
    const handler = getHandler('list_branches', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      branches: [
        { key: 'branch-2', name: 'Feature B' },
      ],
    }));

    const result = await handler({ file_key: 'abc123' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed).toHaveLength(1);
    expect(parsed[0].key).toBe('branch-2');
    expect(mockPublicAxios.get).toHaveBeenCalledWith('/v1/files/abc123', {
      params: { branch_data: 'true', depth: '0' },
    });
  });

  it('returns message when no branches', async () => {
    const handler = getHandler('list_branches', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: { branches: [] },
    }));

    const result = await handler({ file_key: 'abc123' });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toBe('No branches found.');
  });

  it('handles API errors', async () => {
    const handler = getHandler('list_branches', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ file_key: 'abc123' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('create_branch', () => {
  beforeEach(() => {
    mockInternalAxios.post.mockReset();
  });

  it('creates branch successfully', async () => {
    const handler = getHandler('create_branch', cookieOnlyConfig());

    mockInternalAxios.post.mockResolvedValueOnce(axiosResponse({
      meta: { file: { key: 'branch-new' } },
    }));

    const result = await handler({ file_key: 'abc123', name: 'My Branch' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.key).toBe('branch-new');
    expect(parsed.name).toBe('My Branch');
    expect(parsed.main_file_key).toBe('abc123');
  });

  it('handles API errors', async () => {
    const handler = getHandler('create_branch', cookieOnlyConfig());

    mockInternalAxios.post.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ file_key: 'abc123', name: 'Test' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});

describe('delete_branch', () => {
  beforeEach(() => {
    mockInternalAxios.delete.mockReset();
  });

  it('deletes branch successfully', async () => {
    const handler = getHandler('delete_branch', cookieOnlyConfig());

    mockInternalAxios.delete.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ branch_key: 'branch-123' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('branch-123');
  });

  it('handles API errors', async () => {
    const handler = getHandler('delete_branch', cookieOnlyConfig());

    mockInternalAxios.delete.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ branch_key: 'branch-missing' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});
