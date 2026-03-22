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

await import('../src/tools/versions.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('list_versions', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns mapped versions', async () => {
    const handler = getHandler('list_versions', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      versions: [
        { id: 'v1', label: 'Initial', description: 'First version', created_at: '2024-01-01T00:00:00Z', user: { handle: 'alice' } },
        { id: 'v2', label: null, description: null, created_at: '2024-01-02T00:00:00Z', user: { id: 'u2' } },
      ],
    }));

    const result = await handler({ file_key: 'abc123' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe('v1');
    expect(parsed[0].label).toBe('Initial');
    expect(parsed[0].user).toBe('alice');
    expect(parsed[1].user).toBe('u2');
  });

  it('returns message when no versions', async () => {
    const handler = getHandler('list_versions', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({ versions: [] }));

    const result = await handler({ file_key: 'abc123' });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toBe('No versions found.');
  });

  it('handles API errors', async () => {
    const handler = getHandler('list_versions', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ file_key: 'abc123' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});

describe('create_version', () => {
  beforeEach(() => {
    mockInternalAxios.post.mockReset();
  });

  it('creates version successfully', async () => {
    const handler = getHandler('create_version', cookieOnlyConfig());

    mockInternalAxios.post.mockResolvedValueOnce(axiosResponse({
      meta: {
        id: 'v-new',
        label: 'Release 1.0',
        description: 'Stable release',
        created_at: '2024-03-01T12:00:00Z',
      },
    }));

    const result = await handler({ file_key: 'abc123', title: 'Release 1.0', description: 'Stable release' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.id).toBe('v-new');
    expect(parsed.label).toBe('Release 1.0');
    expect(parsed.description).toBe('Stable release');
  });

  it('handles API errors', async () => {
    const handler = getHandler('create_version', cookieOnlyConfig());

    mockInternalAxios.post.mockRejectedValueOnce(axiosError(500, 'Server error'));

    const result = await handler({ file_key: 'abc123', title: 'Test' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('server error');
  });
});

