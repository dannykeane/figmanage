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

await import('../src/tools/webhooks.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('list_webhooks', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns webhooks for team', async () => {
    const handler = getHandler('list_webhooks', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      webhooks: [
        { id: 'wh-1', team_id: 'team-1', event_type: 'FILE_UPDATE', endpoint: 'https://example.com/hook' },
      ],
    }));

    const result = await handler({ team_id: 'team-1' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.count).toBe(1);
    expect(parsed.webhooks).toHaveLength(1);
    expect(parsed.webhooks[0].id).toBe('wh-1');
    expect(mockPublicAxios.get).toHaveBeenCalledWith('/v2/teams/team-1/webhooks');
  });

  it('returns error on API failure', async () => {
    const handler = getHandler('list_webhooks', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(403, 'Forbidden'));

    const result = await handler({ team_id: 'team-1' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Insufficient permissions');
  });
});

describe('create_webhook', () => {
  beforeEach(() => {
    mockPublicAxios.post.mockReset();
  });

  it('creates webhook successfully', async () => {
    const handler = getHandler('create_webhook', patOnlyConfig());

    const webhookData = {
      id: 'wh-new',
      team_id: 'team-1',
      event_type: 'FILE_UPDATE',
      endpoint: 'https://example.com/hook',
      status: 'ACTIVE',
    };
    mockPublicAxios.post.mockResolvedValueOnce(axiosResponse(webhookData));

    const result = await handler({
      team_id: 'team-1',
      event_type: 'FILE_UPDATE',
      endpoint: 'https://example.com/hook',
      passcode: 'secret123',
      description: undefined,
    });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.id).toBe('wh-new');
    expect(mockPublicAxios.post).toHaveBeenCalledWith('/v2/webhooks', {
      team_id: 'team-1',
      event_type: 'FILE_UPDATE',
      endpoint: 'https://example.com/hook',
      passcode: 'secret123',
    });
  });

  it('returns error on API failure', async () => {
    const handler = getHandler('create_webhook', patOnlyConfig());

    mockPublicAxios.post.mockRejectedValueOnce(axiosError(400, 'Bad request'));

    const result = await handler({
      team_id: 'team-1',
      event_type: 'FILE_UPDATE',
      endpoint: 'https://example.com/hook',
      passcode: 'secret',
      description: undefined,
    });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Bad request');
  });
});

describe('update_webhook', () => {
  beforeEach(() => {
    mockPublicAxios.put.mockReset();
  });

  it('updates webhook successfully', async () => {
    const handler = getHandler('update_webhook', patOnlyConfig());

    mockPublicAxios.put.mockResolvedValueOnce(axiosResponse({
      id: 'wh-1',
      event_type: 'FILE_COMMENT',
      endpoint: 'https://example.com/new-hook',
      status: 'ACTIVE',
    }));

    const result = await handler({
      webhook_id: 'wh-1',
      event_type: 'FILE_COMMENT',
      endpoint: 'https://example.com/new-hook',
      passcode: undefined,
      description: undefined,
      status: undefined,
    });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.event_type).toBe('FILE_COMMENT');
    expect(mockPublicAxios.put).toHaveBeenCalledWith('/v2/webhooks/wh-1', {
      event_type: 'FILE_COMMENT',
      endpoint: 'https://example.com/new-hook',
    });
  });

  it('returns error on API failure', async () => {
    const handler = getHandler('update_webhook', patOnlyConfig());

    mockPublicAxios.put.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({
      webhook_id: 'wh-missing',
      event_type: undefined,
      endpoint: undefined,
      passcode: undefined,
      description: undefined,
      status: undefined,
    });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('delete_webhook', () => {
  beforeEach(() => {
    mockPublicAxios.delete.mockReset();
  });

  it('deletes webhook successfully', async () => {
    const handler = getHandler('delete_webhook', patOnlyConfig());

    mockPublicAxios.delete.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ webhook_id: 'wh-1' });
    const text = getToolText(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('wh-1');
  });

  it('returns error on 404', async () => {
    const handler = getHandler('delete_webhook', patOnlyConfig());

    mockPublicAxios.delete.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ webhook_id: 'wh-missing' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('webhook_requests', () => {
  beforeEach(() => {
    mockPublicAxios.get.mockReset();
  });

  it('returns delivery attempts', async () => {
    const handler = getHandler('webhook_requests', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      requests: [{
        id: 'req-1',
        endpoint: 'https://example.com/hook',
        payload: { event_type: 'FILE_UPDATE' },
        response_status_code: 200,
        error_msg: null,
        sent_at: '2024-01-01T00:00:00Z',
      }],
    }));

    const result = await handler({ webhook_id: 'wh-1' });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.count).toBe(1);
    expect(parsed.requests[0].id).toBe('req-1');
    expect(parsed.requests[0].status).toBe(200);
    expect(mockPublicAxios.get).toHaveBeenCalledWith('/v2/webhooks/wh-1/requests');
  });

  it('returns message when no deliveries', async () => {
    const handler = getHandler('webhook_requests', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({ requests: [] }));

    const result = await handler({ webhook_id: 'wh-1' });
    const text = getToolText(result);

    expect(text).toContain('No webhook deliveries');
  });

  it('handles API error', async () => {
    const handler = getHandler('webhook_requests', patOnlyConfig());

    mockPublicAxios.get.mockRejectedValueOnce(axiosError(404, 'Not found'));

    const result = await handler({ webhook_id: 'wh-1' });

    expect(result.isError).toBe(true);
  });
});
