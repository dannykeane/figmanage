import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockServer,
  cookieOnlyConfig,
  axiosResponse,
  axiosError,
  parseToolResult,
  getToolText,
} from './helpers.js';

const mockPublicAxios = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
}));

const mockInternalAxios = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
}));

const toolDefs = vi.hoisted(() => [] as Array<{ toolset: string; auth: string; mutates?: boolean; register: Function }>);

vi.mock('../src/clients/public-api.js', () => ({
  publicClient: () => mockPublicAxios,
}));

vi.mock('../src/clients/internal-api.js', () => ({
  internalClient: () => mockInternalAxios,
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
      if (!id) throw new Error('Org context required.');
      return id;
    },
  };
});

await import('../src/tools/compound-manager.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

beforeEach(() => {
  mockPublicAxios.get.mockReset(); mockPublicAxios.post.mockReset();
  mockInternalAxios.get.mockReset(); mockInternalAxios.post.mockReset();
  mockInternalAxios.put.mockReset(); mockInternalAxios.delete.mockReset();
});

// ---- offboard_user ----

describe('offboard_user', () => {
  const config = cookieOnlyConfig();

  it('audits user team memberships, project permissions, and file ownership', async () => {
    const handler = getHandler('offboard_user', config);

    mockInternalAxios.get.mockImplementation((url: string, opts?: any) => {
      // Resolve user
      if (url.includes('/org_users')) {
        return Promise.resolve(axiosResponse({
          meta: { users: [{
            id: 'ou-1',
            user_id: '999',
            user: { email: 'alice@example.com', handle: 'Alice' },
            active_seat_type: { key: 'expert' },
            permission: 'member',
          }] },
        }));
      }
      // Org teams
      if (url.match(/\/api\/orgs\/[^/]+\/teams$/)) {
        return Promise.resolve(axiosResponse({
          meta: [
            { id: 't1', name: 'Design' },
            { id: 't2', name: 'Engineering' },
          ],
        }));
      }
      // Team members
      if (url.includes('/teams/t1/members')) {
        return Promise.resolve(axiosResponse({
          meta: [{ id: '999', name: 'Alice', team_role: { level: 300 } }],
        }));
      }
      if (url.includes('/teams/t2/members')) {
        return Promise.resolve(axiosResponse({ meta: [] }));
      }
      // Team folders (projects)
      if (url.includes('/teams/t1/folders')) {
        return Promise.resolve(axiosResponse({
          meta: [{ id: 'p1', name: 'Brand' }],
        }));
      }
      // Project roles
      if (url.includes('/roles/folder/p1')) {
        return Promise.resolve(axiosResponse({
          meta: [{ user_id: '999', level: 300 }],
        }));
      }
      // Paginated files
      if (url.includes('/folders/p1/paginated_files')) {
        return Promise.resolve(axiosResponse({
          meta: { files: [{ key: 'f1', name: 'Logo.fig' }] },
        }));
      }
      // File roles
      if (url.includes('/roles/file/f1')) {
        return Promise.resolve(axiosResponse({
          meta: [{ user_id: '999', level: 999 }],
        }));
      }
      return Promise.resolve(axiosResponse({}));
    });

    const result = await handler({ user_identifier: 'alice@example.com' });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.user.email).toBe('alice@example.com');
    expect(data.user.user_id).toBe('999');
    expect(data.team_memberships).toHaveLength(1);
    expect(data.team_memberships[0].team_name).toBe('Design');
    expect(data.project_permissions).toHaveLength(1);
    expect(data.project_permissions[0].role).toBe('editor');
    expect(data.file_ownership).toHaveLength(1);
    expect(data.file_ownership[0].file_key).toBe('f1');
    expect(data.summary.files_owned).toBe(1);
    expect(data.transfer_plan.length).toBeGreaterThan(0);
    expect(data.note).toContain('execute=true');
  });

  it('blocks self-offboarding', async () => {
    const handler = getHandler('offboard_user', config);

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.includes('/org_users')) {
        return Promise.resolve(axiosResponse({
          meta: { users: [{
            id: 'ou-self',
            user_id: '12345', // matches config.userId
            user: { email: 'me@example.com', handle: 'Me' },
            active_seat_type: { key: 'expert' },
            permission: 'admin',
          }] },
        }));
      }
      return Promise.resolve(axiosResponse({}));
    });

    const result = await handler({ user_identifier: '12345' });
    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Cannot audit yourself');
  });

  it('returns error when user not found', async () => {
    const handler = getHandler('offboard_user', config);

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.includes('/org_users')) {
        return Promise.resolve(axiosResponse({ meta: { users: [] } }));
      }
      return Promise.resolve(axiosResponse({}));
    });

    const result = await handler({ user_identifier: 'nobody@example.com' });
    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('User not found');
  });

  it('handles team member fetch failures gracefully', async () => {
    const handler = getHandler('offboard_user', config);

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.includes('/org_users')) {
        return Promise.resolve(axiosResponse({
          meta: { users: [{
            id: 'ou-1', user_id: '999',
            user: { email: 'alice@example.com', handle: 'Alice' },
            active_seat_type: null, permission: 'member',
          }] },
        }));
      }
      if (url.match(/\/api\/orgs\/[^/]+\/teams$/)) {
        return Promise.resolve(axiosResponse({
          meta: [{ id: 't1', name: 'Design' }],
        }));
      }
      if (url.includes('/teams/t1/members')) {
        return Promise.reject(axiosError(500));
      }
      return Promise.resolve(axiosResponse({}));
    });

    const result = await handler({ user_identifier: 'alice@example.com' });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.team_memberships).toHaveLength(0);
    expect(data.summary.teams).toBe(0);
  });
});

// ---- onboard_user ----

describe('onboard_user', () => {
  const config = cookieOnlyConfig();

  it('invites user to teams and shares files', async () => {
    const handler = getHandler('onboard_user', config);

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.match(/\/api\/orgs\/[^/]+\/teams$/)) {
        return Promise.resolve(axiosResponse({
          meta: [
            { id: 'team-1', name: 'Design' },
            { id: 'team-2', name: 'Engineering' },
          ],
        }));
      }
      return Promise.resolve(axiosResponse({}));
    });

    mockInternalAxios.post.mockResolvedValue(axiosResponse({ meta: { invites: [{ id: 'inv-1' }] } }));

    const result = await handler({
      email: 'new@example.com',
      team_ids: ['team-1', 'team-2'],
      role: 'editor',
      share_files: ['file-abc'],
    });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.user_email).toBe('new@example.com');
    expect(data.setup_results.teams_joined).toHaveLength(2);
    expect(data.setup_results.teams_joined[0].status).toBe('invited');
    expect(data.setup_results.teams_joined[0].team_name).toBe('Design');
    expect(data.setup_results.files_shared).toHaveLength(1);
    expect(data.setup_results.files_shared[0].status).toBe('shared');

    // Verify invite calls
    expect(mockInternalAxios.post).toHaveBeenCalledWith('/api/invites', expect.objectContaining({
      resource_type: 'team',
      resource_id_or_key: 'team-1',
      emails: ['new@example.com'],
      level: 300,
    }));
  });

  it('rejects when team_ids exceed cap of 10', async () => {
    const handler = getHandler('onboard_user', config);

    const tooManyTeams = Array.from({ length: 11 }, (_, i) => `team-${i}`);
    const result = await handler({ email: 'test@example.com', team_ids: tooManyTeams });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Too many teams');
  });

  it('rejects when share_files exceed cap of 20', async () => {
    const handler = getHandler('onboard_user', config);

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.match(/\/api\/orgs\/[^/]+\/teams$/)) {
        return Promise.resolve(axiosResponse({ meta: [{ id: 'team-1', name: 'T1' }] }));
      }
      return Promise.resolve(axiosResponse({}));
    });

    const tooManyFiles = Array.from({ length: 21 }, (_, i) => `file-${i}`);
    const result = await handler({ email: 'test@example.com', team_ids: ['team-1'], share_files: tooManyFiles });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Too many files');
  });

  it('skips seat change without confirm flag', async () => {
    const handler = getHandler('onboard_user', config);

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.match(/\/api\/orgs\/[^/]+\/teams$/)) {
        return Promise.resolve(axiosResponse({ meta: [{ id: 'team-1', name: 'Design' }] }));
      }
      return Promise.resolve(axiosResponse({}));
    });
    mockInternalAxios.post.mockResolvedValue(axiosResponse({ meta: { invites: [] } }));

    const result = await handler({
      email: 'new@example.com',
      team_ids: ['team-1'],
      seat_type: 'full',
    });
    const data = parseToolResult(result);

    expect(data.setup_results.seat_change.status).toBe('skipped');
    expect(data.setup_results.seat_change.note).toContain('confirm');
  });

  it('applies seat change with confirm=true', async () => {
    const handler = getHandler('onboard_user', config);

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.match(/\/api\/orgs\/[^/]+\/teams$/)) {
        return Promise.resolve(axiosResponse({ meta: [{ id: 'team-1', name: 'Design' }] }));
      }
      if (url.includes('/org_users')) {
        return Promise.resolve(axiosResponse({
          meta: { users: [{ id: 'ou-new', user_id: '777', user: { email: 'new@example.com' }, updated_at: '2024-01-01' }] },
        }));
      }
      return Promise.resolve(axiosResponse({}));
    });
    mockInternalAxios.post.mockResolvedValue(axiosResponse({ meta: { invites: [] } }));
    mockInternalAxios.put.mockResolvedValue(axiosResponse({}));

    const result = await handler({
      email: 'new@example.com',
      team_ids: ['team-1'],
      seat_type: 'full',
      confirm: true,
    });
    const data = parseToolResult(result);

    expect(data.setup_results.seat_change.status).toBe('changed');
    expect(mockInternalAxios.put).toHaveBeenCalledWith(
      expect.stringContaining('/org_users'),
      expect.objectContaining({
        org_user_ids: ['ou-new'],
        paid_statuses: { expert: 'full' },
      }),
      expect.objectContaining({ 'axios-retry': { retries: 0 } }),
    );
  });

  it('errors when team_ids not found in org', async () => {
    const handler = getHandler('onboard_user', config);

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.match(/\/api\/orgs\/[^/]+\/teams$/)) {
        return Promise.resolve(axiosResponse({ meta: [{ id: 'team-1', name: 'Design' }] }));
      }
      return Promise.resolve(axiosResponse({}));
    });

    const result = await handler({ email: 'test@example.com', team_ids: ['team-1', 'team-999'] });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('team-999');
  });
});

// ---- quarterly_design_ops_report ----

describe('quarterly_design_ops_report', () => {
  const config = cookieOnlyConfig();

  function setupBasicMocks() {
    mockInternalAxios.get.mockImplementation((url: string, opts?: any) => {
      // Teams
      if (url.match(/\/api\/orgs\/[^/]+\/teams$/)) {
        return Promise.resolve(axiosResponse({
          meta: [
            { id: 't1', name: 'Design', member_count: 5, project_count: 3 },
            { id: 't2', name: 'Eng', member_count: 10, project_count: 7 },
          ],
        }));
      }
      // Filter counts
      if (url.includes('/filter_counts')) {
        return Promise.resolve(axiosResponse({
          meta: { total: 15, expert: 3, developer: 5, collaborator: 2 },
        }));
      }
      // Org members (cursor-based pagination)
      if (url.includes('/org_users')) {
        return Promise.resolve(axiosResponse({
          meta: {
            users: [
              { user_id: '1', active_seat_type: { key: 'expert' }, last_seen: new Date().toISOString() },
              { user_id: '2', active_seat_type: { key: 'developer' }, last_seen: new Date().toISOString() },
              { user_id: '3', active_seat_type: { key: 'developer' }, last_seen: null },
              { user_id: '4', active_seat_type: { key: 'collaborator' }, last_seen: new Date().toISOString() },
              { user_id: '5', active_seat_type: null, last_seen: null },
            ],
            cursor: [],
          },
        }));
      }
      // Billing
      if (url.includes('/billing_data')) {
        return Promise.resolve(axiosResponse({
          shipping_address: '123 Test St',
          plan: 'organization',
        }));
      }
      // Upcoming invoice
      if (url.includes('/invoices/upcoming')) {
        return Promise.resolve(axiosResponse({ date: '2024-07-01', amount_due: 5000 }));
      }
      // Contract rates
      if (url.includes('/contract_rates')) {
        return Promise.resolve(axiosResponse({
          meta: {
            product_prices: [
              { billable_product_key: 'expert', amount: 5500 },
              { billable_product_key: 'developer', amount: 2500 },
              { billable_product_key: 'collaborator', amount: 500 },
            ],
          },
        }));
      }
      // Libraries
      if (url.includes('/design_systems/libraries')) {
        return Promise.resolve(axiosResponse({
          libraries: [{ file_key: 'lib-1', name: 'Core UI' }],
        }));
      }
      // Library usage
      if (url.includes('/dsa/library/')) {
        return Promise.resolve(axiosResponse({
          rows: [
            { team_name: 'Design', insertions: 120 },
            { team_name: 'Eng', insertions: 80 },
          ],
        }));
      }
      return Promise.resolve(axiosResponse({}));
    });
  }

  it('generates full report with all sections', async () => {
    const handler = getHandler('quarterly_design_ops_report', config);
    setupBasicMocks();

    const result = await handler({ days: 90 });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.period.days).toBe(90);
    expect(data.org_overview.total_teams).toBe(2);
    expect(data.org_overview.total_members).toBe(5);
    expect(data.org_overview.total_paid_seats).toBe(4); // 1 expert + 2 developer + 1 collaborator
    expect(data.seat_utilization.active_paid).toBe(3); // user_id 3 has null last_active
    expect(data.seat_utilization.inactive_paid).toBe(1);
    expect(data.seat_utilization.utilization_rate).toBe(75);
    expect(data.teams).toHaveLength(2);
    expect(data.billing.monthly_spend_dollars).toBeGreaterThan(0);
    expect(data.billing.upcoming_invoice_date).toBe('2024-07-01');
    expect(data.library_adoption).toHaveLength(1);
    expect(data.library_adoption[0].insertions).toBe(200);
    expect(data.highlights.length).toBeGreaterThan(0);
  });

  it('degrades gracefully when billing returns 403', async () => {
    const handler = getHandler('quarterly_design_ops_report', config);

    mockInternalAxios.get.mockImplementation((url: string, opts?: any) => {
      if (url.match(/\/api\/orgs\/[^/]+\/teams$/)) {
        return Promise.resolve(axiosResponse({ meta: [] }));
      }
      if (url.includes('/filter_counts')) {
        return Promise.resolve(axiosResponse({ meta: {} }));
      }
      if (url.includes('/org_users')) {
        return Promise.resolve(axiosResponse({ meta: { users: [] } }));
      }
      if (url.includes('/billing_data')) {
        return Promise.reject(axiosError(403));
      }
      if (url.includes('/invoices/upcoming')) {
        return Promise.reject(axiosError(403));
      }
      if (url.includes('/contract_rates')) {
        return Promise.reject(axiosError(403));
      }
      if (url.includes('/design_systems/libraries')) {
        return Promise.resolve(axiosResponse({ libraries: [] }));
      }
      return Promise.resolve(axiosResponse({}));
    });

    const result = await handler({ days: 90 });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.billing).toBeNull();
    expect(data.errors).toBeDefined();
    expect(data.errors.some((e: string) => e.includes('billing') || e.includes('rates'))).toBe(true);
  });

  it('degrades gracefully when libraries return 404', async () => {
    const handler = getHandler('quarterly_design_ops_report', config);

    mockInternalAxios.get.mockImplementation((url: string, opts?: any) => {
      if (url.match(/\/api\/orgs\/[^/]+\/teams$/)) {
        return Promise.resolve(axiosResponse({ meta: [] }));
      }
      if (url.includes('/filter_counts')) {
        return Promise.resolve(axiosResponse({ meta: {} }));
      }
      if (url.includes('/org_users')) {
        return Promise.resolve(axiosResponse({ meta: { users: [] } }));
      }
      if (url.includes('/billing_data')) {
        return Promise.resolve(axiosResponse({}));
      }
      if (url.includes('/invoices/upcoming')) {
        return Promise.resolve(axiosResponse({}));
      }
      if (url.includes('/contract_rates')) {
        return Promise.resolve(axiosResponse({ meta: { product_prices: [] } }));
      }
      if (url.includes('/design_systems/libraries')) {
        return Promise.reject(axiosError(404));
      }
      return Promise.resolve(axiosResponse({}));
    });

    const result = await handler({ days: 30 });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.library_adoption).toEqual([]);
    expect(data.errors).toContain('libraries: failed to fetch (may be 404)');
  });
});
