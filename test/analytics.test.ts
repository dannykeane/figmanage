import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockServer,
  cookieOnlyConfig,
  getToolText,
  axiosResponse,
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

vi.mock('../src/clients/public-api.js', () => ({
  publicClient: () => ({
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

await import('../src/tools/analytics.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('library_usage', () => {
  beforeEach(() => {
    mockInternalAxios.get.mockReset();
  });

  it('returns library usage metrics', async () => {
    const handler = getHandler('library_usage', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      teams: [{ team_id: 't1', insertions: 42 }],
    }));

    const result = await handler({ library_file_key: 'lib-key-1', days: undefined });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('insertions');
    expect(mockInternalAxios.get).toHaveBeenCalledWith(
      '/api/dsa/library/lib-key-1/team_usage',
      expect.objectContaining({ params: expect.objectContaining({ start_ts: expect.any(Number), end_ts: expect.any(Number) }) }),
    );
  });
});

describe('component_usage', () => {
  beforeEach(() => {
    mockInternalAxios.get.mockReset();
  });

  it('returns component usage', async () => {
    const handler = getHandler('component_usage', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      files: [{ file_key: 'f1', usage_count: 10 }],
    }));

    const result = await handler({ component_key: 'comp-1', org_id: undefined });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('usage_count');
    expect(mockInternalAxios.get).toHaveBeenCalledWith(
      '/api/design_systems/component/comp-1/file_usage',
      { params: { org_id: 'org-1', fv: 4 } },
    );
  });

  it('requires org context', async () => {
    const handler = getHandler('component_usage', cookieOnlyConfig({ orgId: undefined }));

    const result = await handler({ component_key: 'comp-1', org_id: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Org context required');
  });
});
