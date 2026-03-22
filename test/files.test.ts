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

await import('../src/tools/files.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('create_file', () => {
  beforeEach(() => { mockInternalAxios.post.mockReset(); });

  it('creates file successfully', async () => {
    const handler = getHandler('create_file', cookieOnlyConfig());
    mockInternalAxios.post.mockResolvedValueOnce(axiosResponse({
      meta: { fig_file: { key: 'abc123', name: 'Untitled', editor_type: 'design' } },
    }));

    const result = await handler({ project_id: 'proj-1', editor_type: undefined, org_id: undefined });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.key).toBe('abc123');
    expect(parsed.editor_type).toBe('design');
    expect(parsed.url).toContain('abc123');
  });

  it('handles API error', async () => {
    const handler = getHandler('create_file', cookieOnlyConfig());
    mockInternalAxios.post.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ project_id: 'proj-1', editor_type: undefined, org_id: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});

describe('rename_file', () => {
  beforeEach(() => { mockInternalAxios.put.mockReset(); });

  it('renames file successfully', async () => {
    const handler = getHandler('rename_file', cookieOnlyConfig());
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ file_key: 'file-1', name: 'New Name' });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('New Name');
  });

  it('handles API error', async () => {
    const handler = getHandler('rename_file', cookieOnlyConfig());
    mockInternalAxios.put.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ file_key: 'file-1', name: 'New Name' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('move_files', () => {
  beforeEach(() => { mockInternalAxios.put.mockReset(); });

  it('moves files successfully', async () => {
    const handler = getHandler('move_files', cookieOnlyConfig());
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({
      meta: { success: { 'file-1': true, 'file-2': true }, errors: {} },
    }));

    const result = await handler({ file_keys: ['file-1', 'file-2'], destination_project_id: 'proj-2' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('2 file(s)');
    expect(text).toContain('proj-2');
  });

  it('handles API error', async () => {
    const handler = getHandler('move_files', cookieOnlyConfig());
    mockInternalAxios.put.mockRejectedValueOnce(axiosError(500, 'Server error'));

    const result = await handler({ file_keys: ['file-1'], destination_project_id: 'proj-2' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('server error');
  });
});

describe('duplicate_file', () => {
  beforeEach(() => { mockInternalAxios.post.mockReset(); });

  it('duplicates file successfully', async () => {
    const handler = getHandler('duplicate_file', cookieOnlyConfig());
    mockInternalAxios.post.mockResolvedValueOnce(axiosResponse({
      meta: { fig_file: { key: 'dup-456', name: 'Copy of Design' } },
    }));

    const result = await handler({ file_key: 'file-1', project_id: undefined });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.key).toBe('dup-456');
    expect(parsed.name).toBe('Copy of Design');
    expect(parsed.url).toContain('dup-456');
  });

  it('handles API error', async () => {
    const handler = getHandler('duplicate_file', cookieOnlyConfig());
    mockInternalAxios.post.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ file_key: 'file-1', project_id: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('trash_files', () => {
  beforeEach(() => { mockInternalAxios.delete.mockReset(); });

  it('trashes files successfully', async () => {
    const handler = getHandler('trash_files', cookieOnlyConfig());
    mockInternalAxios.delete.mockResolvedValueOnce(axiosResponse({
      meta: { success: { 'file-1': true } },
    }));

    const result = await handler({ file_keys: ['file-1'] });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('1 file(s)');
  });

  it('handles API error', async () => {
    const handler = getHandler('trash_files', cookieOnlyConfig());
    mockInternalAxios.delete.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ file_keys: ['file-1'] });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});

describe('restore_files', () => {
  beforeEach(() => { mockInternalAxios.post.mockReset(); });

  it('restores files successfully', async () => {
    const handler = getHandler('restore_files', cookieOnlyConfig());
    mockInternalAxios.post.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ file_keys: ['file-1', 'file-2'] });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('2 file(s)');
  });

  it('handles API error', async () => {
    const handler = getHandler('restore_files', cookieOnlyConfig());
    mockInternalAxios.post.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ file_keys: ['file-1'] });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('favorite_file', () => {
  beforeEach(() => { mockInternalAxios.put.mockReset(); });

  it('favorites file', async () => {
    const handler = getHandler('favorite_file', cookieOnlyConfig());
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ file_key: 'file-1', favorited: true });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('Favorited');
    expect(getToolText(result)).toContain('file-1');
  });

  it('unfavorites file', async () => {
    const handler = getHandler('favorite_file', cookieOnlyConfig());
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ file_key: 'file-1', favorited: false });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('Unfavorited');
  });
});

describe('set_link_access', () => {
  beforeEach(() => { mockInternalAxios.put.mockReset(); });

  it('sets link access successfully', async () => {
    const handler = getHandler('set_link_access', cookieOnlyConfig());
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({
      meta: { link_access: 'org_view' },
    }));

    const result = await handler({ file_key: 'file-1', link_access: 'org_view' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('org_view');
    expect(text).toContain('file-1');
  });

  it('handles API error', async () => {
    const handler = getHandler('set_link_access', cookieOnlyConfig());
    mockInternalAxios.put.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ file_key: 'file-1', link_access: 'edit' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});
