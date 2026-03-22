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

await import('../src/tools/libraries.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('list_org_libraries', () => {
  beforeEach(() => {
    mockInternalAxios.get.mockReset();
  });

  it('returns org libraries', async () => {
    const handler = getHandler('list_org_libraries', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      libraries: [{ key: 'lib-1', name: 'Design System' }],
    }));

    const result = await handler({ org_id: undefined });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('Design System');
    expect(mockInternalAxios.get).toHaveBeenCalledWith(
      '/api/design_systems/libraries',
      { params: { org_id: 'org-1', include_sharing_group_info: true } },
    );
  });

  it('requires org context', async () => {
    const handler = getHandler('list_org_libraries', cookieOnlyConfig({ orgId: undefined }));

    const result = await handler({ org_id: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Org context required');
  });
});
