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

await import('../src/tools/dev-resources.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('list_dev_resources', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns dev resources', async () => {
    const handler = getHandler('list_dev_resources', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      dev_resources: [
        { id: 'dr-1', name: 'Storybook', url: 'https://storybook.example.com/button', file_key: 'abc123', node_id: '1:2', dev_status: 'ready_for_dev' },
      ],
    }));

    const result = await handler({ file_key: 'abc123', node_ids: undefined });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('dr-1');
    expect(parsed[0].name).toBe('Storybook');
    expect(mockPublicAxios.get).toHaveBeenCalledWith(
      '/v1/files/abc123/dev_resources',
      expect.objectContaining({ params: {} }),
    );
  });

  it('returns message when no resources', async () => {
    const handler = getHandler('list_dev_resources', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({ dev_resources: [] }));

    const result = await handler({ file_key: 'abc123', node_ids: undefined });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toBe('No dev resources found.');
  });

  it('handles API error', async () => {
    const handler = getHandler('list_dev_resources', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ file_key: 'abc123', node_ids: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});

describe('create_dev_resource', () => {
  beforeEach(() => {
    mockPublicAxios.post.mockReset();
  });

  it('creates dev resource', async () => {
    const handler = getHandler('create_dev_resource', patOnlyConfig());

    mockPublicAxios.post.mockResolvedValueOnce(axiosResponse({
      dev_resources: [{ id: 'dr-new', name: 'Docs', url: 'https://docs.example.com' }],
    }));

    const result = await handler({
      file_key: 'abc123',
      node_id: '1:2',
      name: 'Docs',
      url: 'https://docs.example.com',
    });

    expect(result.isError).toBeUndefined();
    expect(mockPublicAxios.post).toHaveBeenCalledWith('/v1/dev_resources', {
      dev_resources: [{
        file_key: 'abc123',
        node_id: '1:2',
        name: 'Docs',
        url: 'https://docs.example.com',
      }],
    });
  });

  it('handles API error', async () => {
    const handler = getHandler('create_dev_resource', patOnlyConfig());

    mockPublicAxios.post.mockRejectedValueOnce(axiosError(400, 'Bad request'));

    const result = await handler({
      file_key: 'abc123',
      node_id: '1:2',
      name: 'Test',
      url: 'https://test.com',
    });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Bad request');
  });
});

describe('delete_dev_resource', () => {
  beforeEach(() => {
    mockPublicAxios.delete.mockReset();
  });

  it('deletes dev resource', async () => {
    const handler = getHandler('delete_dev_resource', patOnlyConfig());

    mockPublicAxios.delete.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ file_key: 'abc123', dev_resource_id: 'dr-1' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('dr-1');
    expect(mockPublicAxios.delete).toHaveBeenCalledWith('/v1/files/abc123/dev_resources/dr-1');
  });

  it('handles API error', async () => {
    const handler = getHandler('delete_dev_resource', patOnlyConfig());

    mockPublicAxios.delete.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ file_key: 'abc123', dev_resource_id: 'dr-missing' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});
