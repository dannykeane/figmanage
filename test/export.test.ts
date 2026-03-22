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

await import('../src/tools/export.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('export_nodes', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('exports nodes successfully', async () => {
    const handler = getHandler('export_nodes', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      images: { '1:2': 'https://cdn.figma.com/img1.png', '3:4': 'https://cdn.figma.com/img2.png' },
      err: null,
    }));

    const result = await handler({ file_key: 'abc123', node_ids: ['1:2', '3:4'] });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed).toHaveLength(2);
    expect(parsed[0].node_id).toBe('1:2');
    expect(parsed[0].url).toBe('https://cdn.figma.com/img1.png');
  });

  it('passes format and scale params', async () => {
    const handler = getHandler('export_nodes', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      images: { '1:2': 'https://cdn.figma.com/img.svg' },
    }));

    await handler({ file_key: 'abc123', node_ids: ['1:2'], format: 'svg', scale: 2 });

    expect(mockPublicAxios.get).toHaveBeenCalledWith(
      '/v1/images/abc123',
      { params: { ids: '1:2', format: 'svg', scale: '2' } },
    );
  });

  it('returns error when response contains err', async () => {
    const handler = getHandler('export_nodes', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      images: {},
      err: 'Node not found',
    }));

    const result = await handler({ file_key: 'abc123', node_ids: ['bad:id'] });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Node not found');
  });

  it('handles API error', async () => {
    const handler = getHandler('export_nodes', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ file_key: 'abc123', node_ids: ['1:2'] });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('get_image_fills', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns image fills', async () => {
    const handler = getHandler('get_image_fills', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: {
        images: {
          'ref-abc': 'https://cdn.figma.com/fill1.png',
          'ref-def': 'https://cdn.figma.com/fill2.png',
        },
      },
    }));

    const result = await handler({ file_key: 'abc123' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed).toHaveLength(2);
    expect(parsed[0].image_ref).toBe('ref-abc');
    expect(parsed[0].url).toBe('https://cdn.figma.com/fill1.png');
  });

  it('returns message when no fills', async () => {
    const handler = getHandler('get_image_fills', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: { images: {} },
    }));

    const result = await handler({ file_key: 'abc123' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('No image fills');
  });

  it('handles API error', async () => {
    const handler = getHandler('get_image_fills', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(500, 'Server error'));

    const result = await handler({ file_key: 'abc123' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('server error');
  });
});
