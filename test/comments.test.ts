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

await import('../src/tools/comments.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('list_comments', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns comments as JSON', async () => {
    const handler = getHandler('list_comments', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      comments: [
        {
          id: 'c1',
          message: 'Looks good',
          user: { handle: 'alice', id: 'u1' },
          created_at: '2024-01-01T00:00:00Z',
          resolved_at: null,
          parent_id: null,
          client_meta: { node_id: '1:2' },
          order_id: 1,
        },
      ],
    }));

    const result = await handler({ file_key: 'abc123', as_md: false });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('c1');
    expect(parsed[0].author).toBe('alice');
    expect(parsed[0].node_id).toBe('1:2');
  });

  it('returns markdown when as_md is true', async () => {
    const handler = getHandler('list_comments', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      comments: [
        {
          id: 'c1',
          message: 'Top-level comment',
          user: { handle: 'alice' },
          created_at: '2024-01-01T00:00:00Z',
          resolved_at: null,
          parent_id: null,
        },
        {
          id: 'c2',
          message: 'Reply',
          user: { handle: 'bob' },
          created_at: '2024-01-01T01:00:00Z',
          resolved_at: null,
          parent_id: 'c1',
        },
      ],
    }));

    const result = await handler({ file_key: 'abc123', as_md: true });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('**alice**');
    expect(text).toContain('**bob**');
    expect(text).toContain('Top-level comment');
    expect(text).toContain('  -'); // reply indented
  });

  it('shows resolved tag in markdown', async () => {
    const handler = getHandler('list_comments', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      comments: [
        {
          id: 'c1',
          message: 'Done',
          user: { handle: 'alice' },
          created_at: '2024-01-01T00:00:00Z',
          resolved_at: '2024-01-02T00:00:00Z',
          parent_id: null,
        },
      ],
    }));

    const result = await handler({ file_key: 'abc123', as_md: true });
    const text = getToolText(result);

    expect(text).toContain('[resolved]');
  });

  it('handles API error', async () => {
    const handler = getHandler('list_comments', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ file_key: 'abc123' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});

describe('post_comment', () => {
  beforeEach(() => {
    mockPublicAxios.post.mockReset();
  });

  it('posts a comment', async () => {
    const handler = getHandler('post_comment', patOnlyConfig());

    mockPublicAxios.post.mockResolvedValueOnce(axiosResponse({
      id: 'c-new',
      message: 'Nice work',
      user: { handle: 'alice' },
      created_at: '2024-01-01T00:00:00Z',
      parent_id: null,
    }));

    const result = await handler({ file_key: 'abc123', message: 'Nice work' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.id).toBe('c-new');
    expect(parsed.message).toBe('Nice work');
  });

  it('posts a reply', async () => {
    const handler = getHandler('post_comment', patOnlyConfig());

    mockPublicAxios.post.mockResolvedValueOnce(axiosResponse({
      id: 'c-reply',
      message: 'Thanks',
      user: { handle: 'bob' },
      created_at: '2024-01-02T00:00:00Z',
      parent_id: 'c-new',
    }));

    const result = await handler({ file_key: 'abc123', message: 'Thanks', comment_id: 'c-new' });
    const parsed = parseToolResult(result);

    expect(parsed.parent_id).toBe('c-new');
    expect(mockPublicAxios.post).toHaveBeenCalledWith(
      '/v1/files/abc123/comments',
      expect.objectContaining({ message: 'Thanks', comment_id: 'c-new' }),
    );
  });

  it('handles API error', async () => {
    const handler = getHandler('post_comment', patOnlyConfig());

    mockPublicAxios.post.mockRejectedValueOnce(axiosError(400, 'Bad request'));

    const result = await handler({ file_key: 'abc123', message: 'test' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Bad request');
  });
});

describe('delete_comment', () => {
  beforeEach(() => {
    mockPublicAxios.delete.mockReset();
  });

  it('deletes a comment', async () => {
    const handler = getHandler('delete_comment', patOnlyConfig());

    mockPublicAxios.delete.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ file_key: 'abc123', comment_id: 'c1' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('c1');
    expect(mockPublicAxios.delete).toHaveBeenCalledWith('/v1/files/abc123/comments/c1');
  });

  it('handles API error', async () => {
    const handler = getHandler('delete_comment', patOnlyConfig());

    mockPublicAxios.delete.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ file_key: 'abc123', comment_id: 'c-missing' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('list_comment_reactions', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns reactions', async () => {
    const handler = getHandler('list_comment_reactions', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      reactions: [
        { emoji: ':thumbsup:', user: { handle: 'alice' }, created_at: '2024-01-01T00:00:00Z' },
        { emoji: ':heart:', user: { handle: 'bob' }, created_at: '2024-01-01T01:00:00Z' },
      ],
    }));

    const result = await handler({ file_key: 'abc123', comment_id: 'c1' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed).toHaveLength(2);
    expect(parsed[0].emoji).toBe(':thumbsup:');
    expect(parsed[1].user).toBe('bob');
  });

  it('handles API error', async () => {
    const handler = getHandler('list_comment_reactions', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(500, 'Server error'));

    const result = await handler({ file_key: 'abc123', comment_id: 'c1' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('server error');
  });
});

describe('resolve_comment', () => {
  beforeEach(() => {
    mockInternalAxios.put.mockReset();
  });

  it('resolves a comment', async () => {
    const handler = getHandler('resolve_comment', cookieOnlyConfig());

    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ file_key: 'abc123', comment_id: 'c1' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('resolved');
    expect(mockInternalAxios.put).toHaveBeenCalledWith('/api/file/abc123/comments/c1', { resolved_at: 'true' });
  });

  it('unresolves when resolved=false', async () => {
    const handler = getHandler('resolve_comment', cookieOnlyConfig());

    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ file_key: 'abc123', comment_id: 'c1', resolved: false });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('unresolved');
    expect(mockInternalAxios.put).toHaveBeenCalledWith('/api/file/abc123/comments/c1', { resolved_at: null });
  });

  it('handles API error', async () => {
    const handler = getHandler('resolve_comment', cookieOnlyConfig());

    mockInternalAxios.put.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ file_key: 'abc123', comment_id: 'c1' });

    expect(result.isError).toBe(true);
  });
});

describe('edit_comment', () => {
  beforeEach(() => {
    mockInternalAxios.put.mockReset();
  });

  it('edits a comment', async () => {
    const handler = getHandler('edit_comment', cookieOnlyConfig());

    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ file_key: 'abc123', comment_id: 'c1', message: 'Updated text' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('updated');
    expect(mockInternalAxios.put).toHaveBeenCalledWith('/api/file/abc123/comments/c1', {
      message_meta: [{ t: 'Updated text' }],
    });
  });

  it('handles API error', async () => {
    const handler = getHandler('edit_comment', cookieOnlyConfig());

    mockInternalAxios.put.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ file_key: 'abc123', comment_id: 'c1', message: 'test' });

    expect(result.isError).toBe(true);
  });
});

describe('add_comment_reaction', () => {
  beforeEach(() => {
    mockPublicAxios.post.mockReset();
  });

  it('adds a reaction', async () => {
    const handler = getHandler('add_comment_reaction', patOnlyConfig());

    mockPublicAxios.post.mockResolvedValueOnce(axiosResponse({
      emoji: ':thumbsup:',
      user: { handle: 'alice' },
      created_at: '2024-01-01T00:00:00Z',
    }));

    const result = await handler({ file_key: 'abc123', comment_id: 'c1', emoji: ':thumbsup:' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.emoji).toBe(':thumbsup:');
    expect(mockPublicAxios.post).toHaveBeenCalledWith(
      '/v1/files/abc123/comments/c1/reactions',
      { emoji: ':thumbsup:' },
    );
  });

  it('handles API error', async () => {
    const handler = getHandler('add_comment_reaction', patOnlyConfig());

    mockPublicAxios.post.mockRejectedValueOnce(axiosError(400, 'Bad request'));

    const result = await handler({ file_key: 'abc123', comment_id: 'c1', emoji: ':thumbsup:' });

    expect(result.isError).toBe(true);
  });
});

describe('remove_comment_reaction', () => {
  beforeEach(() => {
    mockPublicAxios.delete.mockReset();
  });

  it('removes a reaction', async () => {
    const handler = getHandler('remove_comment_reaction', patOnlyConfig());

    mockPublicAxios.delete.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ file_key: 'abc123', comment_id: 'c1', emoji: ':thumbsup:' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain(':thumbsup:');
    expect(mockPublicAxios.delete).toHaveBeenCalledWith(
      '/v1/files/abc123/comments/c1/reactions',
      { params: { emoji: ':thumbsup:' } },
    );
  });

  it('handles API error', async () => {
    const handler = getHandler('remove_comment_reaction', patOnlyConfig());

    mockPublicAxios.delete.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ file_key: 'abc123', comment_id: 'c1', emoji: ':thumbsup:' });

    expect(result.isError).toBe(true);
  });
});
