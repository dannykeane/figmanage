import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockServer,
  patOnlyConfig,
  getToolText,
  axiosResponse,
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

await import('../src/tools/variables.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('list_local_variables', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns local variables', async () => {
    const handler = getHandler('list_local_variables', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: { variables: { 'var-1': { name: 'Primary' } } },
    }));

    const result = await handler({ file_key: 'abc123' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('Primary');
    expect(mockPublicAxios.get).toHaveBeenCalledWith('/v1/files/abc123/variables/local');
  });

  it('returns Enterprise error on 403 scope rejection', async () => {
    const handler = getHandler('list_local_variables', patOnlyConfig());

    const err = new Error('Forbidden') as any;
    err.response = { status: 403, data: { message: 'Invalid scope' } };
    mockPublicAxios.get.mockRejectedValueOnce(err);

    const result = await handler({ file_key: 'abc123' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Enterprise');
  });
});

describe('list_published_variables', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns published variables', async () => {
    const handler = getHandler('list_published_variables', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: { variables: { 'var-pub': { name: 'Accent' } } },
    }));

    const result = await handler({ file_key: 'file-key-1' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('Accent');
    expect(mockPublicAxios.get).toHaveBeenCalledWith('/v1/files/file-key-1/variables/published');
  });
});

describe('update_variables', () => {
  beforeEach(() => {
    mockPublicAxios.post.mockReset();
  });

  it('posts variable updates', async () => {
    const handler = getHandler('update_variables', patOnlyConfig());

    mockPublicAxios.post.mockResolvedValueOnce(axiosResponse({ status: 200 }));

    const result = await handler({
      file_key: 'abc123',
      variables: [{ action: 'CREATE', name: 'NewVar', resolvedType: 'STRING' }],
      variable_collections: undefined,
      variable_modes: undefined,
      variable_mode_values: undefined,
    });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('200');
    expect(mockPublicAxios.post).toHaveBeenCalledWith(
      '/v1/files/abc123/variables',
      { variables: [{ action: 'CREATE', name: 'NewVar', resolvedType: 'STRING' }] },
    );
  });
});
