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

vi.mock('../src/clients/public-api.js', () => ({
  publicClient: () => mockPublicAxios,
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

await import('../src/tools/reading.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('get_file', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns file data', async () => {
    const handler = getHandler('get_file', patOnlyConfig());

    const fileData = {
      name: 'My Design',
      lastModified: '2024-01-01T00:00:00Z',
      version: '123',
      document: { id: '0:0', name: 'Document', type: 'DOCUMENT' },
    };
    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse(fileData));

    const result = await handler({ file_key: 'abc123' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.name).toBe('My Design');
    expect(parsed.document.type).toBe('DOCUMENT');
  });

  it('passes depth param', async () => {
    const handler = getHandler('get_file', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({ name: 'File' }));

    await handler({ file_key: 'abc123', depth: 1 });

    expect(mockPublicAxios.get).toHaveBeenCalledWith(
      '/v1/files/abc123',
      { params: { depth: '1' } },
    );
  });

  it('passes node-id param', async () => {
    const handler = getHandler('get_file', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({ name: 'File' }));

    await handler({ file_key: 'abc123', node_id: '1:2' });

    expect(mockPublicAxios.get).toHaveBeenCalledWith(
      '/v1/files/abc123',
      { params: { 'node-id': '1:2' } },
    );
  });

  it('handles API error', async () => {
    const handler = getHandler('get_file', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ file_key: 'bad-key' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('get_nodes', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns node data', async () => {
    const handler = getHandler('get_nodes', patOnlyConfig());

    const nodesData = {
      nodes: {
        '1:2': { document: { id: '1:2', name: 'Frame', type: 'FRAME' } },
        '3:4': { document: { id: '3:4', name: 'Text', type: 'TEXT' } },
      },
    };
    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse(nodesData));

    const result = await handler({ file_key: 'abc123', node_ids: ['1:2', '3:4'] });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.nodes['1:2'].document.name).toBe('Frame');
    expect(parsed.nodes['3:4'].document.type).toBe('TEXT');
  });

  it('joins node IDs and passes depth', async () => {
    const handler = getHandler('get_nodes', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({ nodes: {} }));

    await handler({ file_key: 'abc123', node_ids: ['1:2', '3:4'], depth: 2 });

    expect(mockPublicAxios.get).toHaveBeenCalledWith(
      '/v1/files/abc123/nodes',
      { params: { ids: '1:2,3:4', depth: '2' } },
    );
  });

  it('handles API error', async () => {
    const handler = getHandler('get_nodes', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(500, 'Server error'));

    const result = await handler({ file_key: 'abc123', node_ids: ['1:2'] });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('server error');
  });
});
