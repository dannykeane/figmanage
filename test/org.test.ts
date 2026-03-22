import { describe, it, expect, vi } from 'vitest';
import {
  createMockServer,
  cookieOnlyConfig,
  patOnlyConfig,
  dualAuthConfig,
  axiosResponse,
  axiosError,
  parseToolResult,
  getToolText,
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

await import('../src/tools/org.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

describe('list_admins', () => {
  it('returns shaped admin data with expected fields', async () => {
    const handler = getHandler('list_admins', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: [
        {
          user_id: '111',
          user: { email: 'alice@acme.com', handle: 'Alice' },
          permission: 'org_owner',
          active_seat_type: { key: 'full_seat' },
          is_email_validated: true,
          license_admin: false,
          some_internal_field: 'secret',
          address: '123 Main St',
        },
        {
          user_id: '222',
          user: { email: 'bob@acme.com', handle: 'Bob' },
          permission: 'org_admin',
          active_seat_type: null,
          is_email_validated: false,
          license_admin: true,
        },
      ],
    }));

    const result = await handler({ include_license_admins: false, org_id: undefined });
    const admins = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(admins).toHaveLength(2);

    expect(admins[0]).toEqual({
      user_id: '111',
      email: 'alice@acme.com',
      name: 'Alice',
      permission: 'org_owner',
      seat_type: 'full_seat',
      is_email_validated: true,
      license_admin: false,
    });

    expect(admins[1].seat_type).toBeNull();
    expect(admins[1].license_admin).toBe(true);

    const rawText = getToolText(result);
    expect(rawText).not.toContain('some_internal_field');
    expect(rawText).not.toContain('123 Main St');
  });

  it('returns error when orgId is not configured', async () => {
    const handler = getHandler('list_admins', cookieOnlyConfig({ orgId: undefined }));

    const result = await handler({ include_license_admins: false, org_id: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Org context required');
  });

  it('passes include_license_admins parameter to API', async () => {
    const handler = getHandler('list_admins', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: [] }));

    await handler({ include_license_admins: true, org_id: undefined });

    expect(mockInternalAxios.get).toHaveBeenCalledWith(
      '/api/orgs/org-1/admins',
      { params: { include_license_admins: true } },
    );
  });

  it('defaults include_license_admins to false when undefined', async () => {
    const handler = getHandler('list_admins', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: [] }));

    await handler({ include_license_admins: undefined, org_id: undefined });

    expect(mockInternalAxios.get).toHaveBeenCalledWith(
      '/api/orgs/org-1/admins',
      { params: { include_license_admins: false } },
    );
  });

  it('handles API errors gracefully', async () => {
    const handler = getHandler('list_admins', cookieOnlyConfig());

    mockInternalAxios.get.mockRejectedValueOnce(axiosError(500));

    const result = await handler({ include_license_admins: false, org_id: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('server error');
  });

  it('uses orgId from config in the API URL', async () => {
    const handler = getHandler('list_admins', cookieOnlyConfig({ orgId: 'org-42' }));

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: [] }));

    await handler({ include_license_admins: false, org_id: undefined });

    expect(mockInternalAxios.get).toHaveBeenCalledWith(
      '/api/orgs/org-42/admins',
      expect.anything(),
    );
  });
});

// -- list_org_members tests --

describe('list_org_members', () => {
  it('returns shaped member data', async () => {
    const handler = getHandler('list_org_members', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: {
        users: [
          {
            id: '900',
            user_id: '100',
            user: { email: 'alice@acme.com', handle: 'Alice' },
            permission: 'member',
            active_seat_type: { key: 'developer' },
            last_seen: '2023-11-14T22:13:20.000Z',
          },
        ],
      },
    }));

    const result = await handler({ org_id: undefined, search_query: undefined });
    const members = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(members).toHaveLength(1);
    expect(members[0]).toEqual({
      org_user_id: '900',
      user_id: '100',
      email: 'alice@acme.com',
      name: 'Alice',
      permission: 'member',
      seat_type: 'developer',
      last_active: '2023-11-14T22:13:20.000Z',
    });
  });

  it('passes search_query to API', async () => {
    const handler = getHandler('list_org_members', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: { users: [] } }));

    await handler({ org_id: undefined, search_query: 'alice' });

    expect(mockInternalAxios.get).toHaveBeenCalledWith(
      '/api/v2/orgs/org-1/org_users',
      { params: { search_query: 'alice' } },
    );
  });
});

// -- contract_rates tests --

describe('contract_rates', () => {
  it('returns only seat products with correct field mapping', async () => {
    const handler = getHandler('contract_rates', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: {
        product_prices: [
          { billable_product_key: 'expert', amount: 5500 },
          { billable_product_key: 'developer', amount: 2500 },
          { billable_product_key: 'collaborator', amount: 500 },
          { billable_product_key: 'ai_credits', amount: 12000 },
          { billable_product_key: 'design', amount: 4500 },
        ],
      },
    }));

    const result = await handler({ org_id: undefined });
    const rates = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(rates).toHaveLength(3);
    expect(rates[0]).toEqual({ product: 'expert', monthly_cents: 5500, monthly_dollars: '55.00' });
    expect(rates[1]).toEqual({ product: 'developer', monthly_cents: 2500, monthly_dollars: '25.00' });
    expect(rates[2]).toEqual({ product: 'collaborator', monthly_cents: 500, monthly_dollars: '5.00' });
  });
});

// -- change_seat tests --

const mockOrgUser = (overrides: Record<string, any> = {}) => ({
  id: '900',
  user_id: '100',
  user: { email: 'alice@acme.com', handle: 'Alice' },
  permission: 'member',
  active_seat_type: { key: 'collaborator' },
  updated_at: '2026-03-17T00:00:00.000Z',
  ...overrides,
});

describe('change_seat', () => {
  it('downgrades without confirm flag', async () => {
    const handler = getHandler('change_seat', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: { users: [mockOrgUser()] } }));
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({ meta: [mockOrgUser({ active_seat_type: null })] }));

    const result = await handler({ user_id: '100', seat_type: 'view', org_id: undefined, confirm: undefined });

    expect(result.isError).toBeUndefined();
    const data = parseToolResult(result);
    expect(data.old_seat).toContain('Collaborator');
    expect(data.new_seat).toContain('Viewer');

    expect(mockInternalAxios.put).toHaveBeenCalledWith(
      '/api/orgs/org-1/org_users',
      expect.objectContaining({
        org_user_ids: ['900'],
        paid_statuses: { collaborator: 'starter', developer: 'starter', expert: 'starter' },
        latest_ou_update: '2026-03-17T00:00:00.000Z',
      }),
      expect.anything(),
    );
  });

  it('requires confirm for upgrades', async () => {
    const handler = getHandler('change_seat', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: [mockOrgUser({ active_seat_type: null })],
    }));

    const result = await handler({ user_id: '100', seat_type: 'full', org_id: undefined, confirm: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('confirm');
    expect(getToolText(result)).toContain('billing');
    expect(mockInternalAxios.put).not.toHaveBeenCalled();
  });

  it('executes upgrade when confirm is true', async () => {
    const handler = getHandler('change_seat', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: [mockOrgUser({ active_seat_type: null })],
    }));
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({ meta: [] }));

    const result = await handler({ user_id: '100', seat_type: 'full', org_id: undefined, confirm: true });

    expect(result.isError).toBeUndefined();
    expect(mockInternalAxios.put).toHaveBeenCalledWith(
      '/api/orgs/org-1/org_users',
      expect.objectContaining({
        paid_statuses: { expert: 'full' },
      }),
      expect.anything(),
    );
  });

  it('finds user by email', async () => {
    const handler = getHandler('change_seat', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: { users: [mockOrgUser()] } }));
    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({ meta: [] }));

    const result = await handler({ user_id: 'alice@acme.com', seat_type: 'view', org_id: undefined, confirm: undefined });

    expect(result.isError).toBeUndefined();
    expect(mockInternalAxios.get).toHaveBeenCalledWith(
      '/api/v2/orgs/org-1/org_users',
      { params: { search_query: 'alice@acme.com' } },
    );
  });

  it('returns error when user not found', async () => {
    const handler = getHandler('change_seat', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: { users: [] } }));

    const result = await handler({ user_id: 'nobody@acme.com', seat_type: 'view', org_id: undefined, confirm: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });

  it('returns early when already on target seat', async () => {
    const handler = getHandler('change_seat', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: { users: [mockOrgUser()] } }));

    const result = await handler({ user_id: '100', seat_type: 'collab', org_id: undefined, confirm: undefined });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('Already on');
    expect(mockInternalAxios.put).not.toHaveBeenCalled();
  });

  it('blocks self-change', async () => {
    const handler = getHandler('change_seat', cookieOnlyConfig({ userId: '100' }));

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: { users: [mockOrgUser()] } }));

    const result = await handler({ user_id: '100', seat_type: 'view', org_id: undefined, confirm: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Cannot change your own seat');
    expect(mockInternalAxios.put).not.toHaveBeenCalled();
  });
});

// -- activity_log tests --

describe('activity_log', () => {
  it('returns activity log entries from internal API', async () => {
    const handler = getHandler('activity_log', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: [
        [
          {
            id: 'log-1',
            created_at: '2024-01-01T00:00:00Z',
            event_name: 'file.opened',
            actor: { id: 'u1', email: 'alice@acme.com', name: 'Alice' },
            ip_address: '1.2.3.4',
            acted_on_type: 'file',
            acted_on_id_or_key: 'f1',
            metadata: { team_name: 'Design' },
          },
        ],
        { after: 'cursor-abc', column: 'created_at' },
      ],
    }));

    const result = await handler({
      org_id: undefined, emails: undefined, start_time: undefined,
      end_time: undefined, page_size: undefined, after: undefined,
    });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('log-1');
    expect(parsed[0].event).toBe('file.opened');
    expect(parsed[0].actor.email).toBe('alice@acme.com');
    expect(parsed[0].team).toBe('Design');
    expect(parsed[0].ip_address).toBe('1.2.3.4');
    expect(parsed[0].target).toEqual({ type: 'file', id_or_key: 'f1' });
    expect(mockInternalAxios.get).toHaveBeenCalledWith(
      '/api/activity_logs',
      expect.objectContaining({ params: expect.objectContaining({ org_id: 'org-1' }) }),
    );
    expect(getToolText(result)).toContain('cursor-abc');
  });

  it('returns message when no entries', async () => {
    const handler = getHandler('activity_log', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: [[]] }));

    const result = await handler({
      org_id: undefined, emails: undefined, start_time: undefined,
      end_time: undefined, page_size: undefined, after: undefined,
    });

    expect(getToolText(result)).toBe('No activity log entries found.');
  });

  it('passes email filter to API', async () => {
    const handler = getHandler('activity_log', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: [[]] }));

    await handler({
      org_id: undefined, emails: 'alice@acme.com', start_time: undefined,
      end_time: undefined, page_size: undefined, after: undefined,
    });

    expect(mockInternalAxios.get).toHaveBeenCalledWith(
      '/api/activity_logs',
      expect.objectContaining({
        params: expect.objectContaining({ emails: 'alice@acme.com' }),
      }),
    );
  });

  it('handles API error', async () => {
    const handler = getHandler('activity_log', cookieOnlyConfig());

    mockInternalAxios.get.mockRejectedValueOnce(axiosError(500));

    const result = await handler({
      org_id: undefined, emails: undefined, start_time: undefined,
      end_time: undefined, page_size: undefined, after: undefined,
    });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('server error');
  });
});

// -- ai_credit_usage tests --

describe('ai_credit_usage', () => {
  it('resolves plan_id from team folders', async () => {
    const handler = getHandler('ai_credit_usage', cookieOnlyConfig());

    mockInternalAxios.get
      .mockResolvedValueOnce(axiosResponse({
        meta: [{ id: 'folder-1', plan_id: 'plan-uuid-123', name: 'Main' }],
      }))
      .mockResolvedValueOnce(axiosResponse({
        metering_period: { start: '2024-01-01', end: '2024-02-01' },
        usage_buckets: [{ name: 'ai_actions', used: 150, limit: 500 }],
      }));

    const result = await handler({ team_id: 'team-1', plan_id: undefined });

    expect(result.isError).toBeUndefined();
    expect(mockInternalAxios.get).toHaveBeenCalledWith('/api/teams/team-1/folders');
    expect(mockInternalAxios.get).toHaveBeenCalledWith('/api/plans/plan-uuid-123/ai_credits/plan_usage_summary');
  });

  it('uses plan_id directly when provided', async () => {
    const handler = getHandler('ai_credit_usage', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      metering_period: { start: '2024-01-01', end: '2024-02-01' },
    }));

    const result = await handler({ team_id: 'team-1', plan_id: 'direct-plan-id' });

    expect(result.isError).toBeUndefined();
    expect(mockInternalAxios.get).toHaveBeenCalledWith('/api/plans/direct-plan-id/ai_credits/plan_usage_summary');
    expect(mockInternalAxios.get).not.toHaveBeenCalledWith('/api/teams/team-1/folders');
  });

  it('errors when no plan found in team folders', async () => {
    const handler = getHandler('ai_credit_usage', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: [] }));

    const result = await handler({ team_id: 'team-1', plan_id: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('No billing plan found');
  });
});

// -- list_payments tests --

describe('list_payments', () => {
  it('returns paid invoices', async () => {
    const handler = getHandler('list_payments', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: { invoices: [
        { id: 'inv-1', amount: 5500, status: 'paid' },
        { id: 'inv-2', amount: 0, status: 'upcoming' },
      ] },
    }));

    const result = await handler({ org_id: undefined });
    const parsed = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('inv-1');
    expect(mockInternalAxios.get).toHaveBeenCalledWith('/api/orgs/org-1/billing_data');
  });

  it('handles API error', async () => {
    const handler = getHandler('list_payments', cookieOnlyConfig());

    mockInternalAxios.get.mockRejectedValueOnce(axiosError(500, 'Server error'));

    const result = await handler({ org_id: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('server error');
  });
});

// -- remove_org_member tests --

describe('remove_org_member', () => {
  it('requires confirm flag', async () => {
    const handler = getHandler('remove_org_member', cookieOnlyConfig());

    const result = await handler({ user_identifier: 'alice@acme.com', org_id: undefined, confirm: undefined });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('permanent');
    expect(getToolText(result)).toContain('confirm');
    expect(mockInternalAxios.delete).not.toHaveBeenCalled();
  });

  it('removes member by email with confirm', async () => {
    const handler = getHandler('remove_org_member', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: { users: [{ id: '900', user_id: '100', user: { email: 'alice@acme.com', handle: 'Alice' } }] },
    }));
    mockInternalAxios.delete.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ user_identifier: 'alice@acme.com', org_id: undefined, confirm: true });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('Removed');
    expect(mockInternalAxios.delete).toHaveBeenCalledWith(
      '/api/orgs/org-1/org_users',
      { data: { org_user_ids: ['900'] } },
    );
  });

  it('removes member by user_id', async () => {
    const handler = getHandler('remove_org_member', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: { users: [{ id: '900', user_id: '100', user: { email: 'alice@acme.com', handle: 'Alice' } }] },
    }));
    mockInternalAxios.delete.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ user_identifier: '100', org_id: undefined, confirm: true });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('Removed');
  });

  it('errors when user not found', async () => {
    const handler = getHandler('remove_org_member', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({ meta: { users: [] } }));

    const result = await handler({ user_identifier: 'nobody@acme.com', org_id: undefined, confirm: true });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });

  it('blocks self-removal', async () => {
    const handler = getHandler('remove_org_member', cookieOnlyConfig({ userId: '100' }));

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: { users: [{ id: '900', user_id: '100', user: { email: 'alice@acme.com', handle: 'Alice' } }] },
    }));

    const result = await handler({ user_identifier: 'alice@acme.com', org_id: undefined, confirm: true });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Cannot remove yourself');
    expect(mockInternalAxios.delete).not.toHaveBeenCalled();
  });
});

// -- create_user_group tests --

describe('create_user_group', () => {
  it('creates group with plan_id resolved from team', async () => {
    const handler = getHandler('create_user_group', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: { folder_rows: [{ id: 'f1', plan_id: 'plan-abc' }] },
    }));
    mockInternalAxios.post.mockResolvedValueOnce(axiosResponse({
      meta: { user_group_id: 'ug-1', add_user_results: null },
    }));

    const result = await handler({
      name: 'Design Ops',
      description: 'Designers',
      team_id: 'team-1',
      plan_id: undefined,
      emails: undefined,
      should_notify: undefined,
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseToolResult(result);
    expect(parsed.user_group_id).toBe('ug-1');
    expect(mockInternalAxios.post).toHaveBeenCalledWith('/api/user_groups', {
      name: 'Design Ops',
      description: 'Designers',
      plan_id: 'plan-abc',
      emails: [],
      should_notify: true,
    });
  });

  it('uses plan_id directly when provided', async () => {
    const handler = getHandler('create_user_group', cookieOnlyConfig());

    mockInternalAxios.post.mockResolvedValueOnce(axiosResponse({
      meta: { user_group_id: 'ug-2', add_user_results: null },
    }));

    const result = await handler({
      name: 'Engineering',
      description: undefined,
      team_id: undefined,
      plan_id: 'direct-plan',
      emails: ['alice@acme.com'],
      should_notify: false,
    });

    expect(result.isError).toBeUndefined();
    expect(mockInternalAxios.get).not.toHaveBeenCalled();
    expect(mockInternalAxios.post).toHaveBeenCalledWith('/api/user_groups', {
      name: 'Engineering',
      description: '',
      plan_id: 'direct-plan',
      emails: ['alice@acme.com'],
      should_notify: false,
    });
  });

  it('errors when neither team_id nor plan_id provided', async () => {
    const handler = getHandler('create_user_group', cookieOnlyConfig());

    const result = await handler({
      name: 'Orphan',
      description: undefined,
      team_id: undefined,
      plan_id: undefined,
      emails: undefined,
      should_notify: undefined,
    });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('team_id or plan_id');
  });
});

// -- delete_user_groups tests --

describe('delete_user_groups', () => {
  it('deletes groups by ID', async () => {
    const handler = getHandler('delete_user_groups', cookieOnlyConfig());

    mockInternalAxios.delete.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ user_group_ids: ['ug-1', 'ug-2'] });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('Deleted 2');
    expect(mockInternalAxios.delete).toHaveBeenCalledWith('/api/user_groups', {
      data: { user_group_ids: ['ug-1', 'ug-2'] },
    });
  });

  it('handles API error', async () => {
    const handler = getHandler('delete_user_groups', cookieOnlyConfig());

    mockInternalAxios.delete.mockRejectedValueOnce(axiosError(403));

    const result = await handler({ user_group_ids: ['ug-1'] });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('permissions');
  });
});

// -- add_user_group_members tests --

describe('add_user_group_members', () => {
  it('adds members to a group by email', async () => {
    const handler = getHandler('add_user_group_members', cookieOnlyConfig());

    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({
      meta: { added: 2 },
    }));

    const result = await handler({ user_group_id: 'ug-1', emails: ['alice@acme.com', 'bob@acme.com'] });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('Added 2');
    expect(mockInternalAxios.put).toHaveBeenCalledWith(
      '/api/user_groups/ug-1/add_members',
      { emails: ['alice@acme.com', 'bob@acme.com'] },
    );
  });

  it('handles API error', async () => {
    const handler = getHandler('add_user_group_members', cookieOnlyConfig());

    mockInternalAxios.put.mockRejectedValueOnce(axiosError(404));

    const result = await handler({ user_group_id: 'bad-id', emails: ['alice@acme.com'] });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

// -- remove_user_group_members tests --

describe('remove_user_group_members', () => {
  it('removes members from a group', async () => {
    const handler = getHandler('remove_user_group_members', cookieOnlyConfig());

    mockInternalAxios.put.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ user_group_id: 'ug-1', user_ids: ['u1'] });

    expect(result.isError).toBeUndefined();
    expect(getToolText(result)).toContain('Removed 1');
    expect(mockInternalAxios.put).toHaveBeenCalledWith(
      '/api/user_groups/ug-1/remove_members',
      { user_ids: ['u1'] },
    );
  });

  it('handles API error', async () => {
    const handler = getHandler('remove_user_group_members', cookieOnlyConfig());

    mockInternalAxios.put.mockRejectedValueOnce(axiosError(500));

    const result = await handler({ user_group_id: 'ug-1', user_ids: ['u1'] });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('server error');
  });
});
