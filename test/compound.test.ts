import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockServer,
  patOnlyConfig,
  cookieOnlyConfig,
  dualAuthConfig,
  axiosResponse,
  axiosError,
  parseToolResult,
  getToolText,
} from './helpers.js';

// Shared mocks -- declared via vi.hoisted so they exist before vi.mock factories run.
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
      if (!id) throw new Error('Org context required. Run list_orgs to see available workspaces, or set FIGMA_ORG_ID.');
      return id;
    },
  };
});

await import('../src/tools/compound.js');

function getHandler(toolName: string, config: any): (...args: any[]) => Promise<any> {
  const server = createMockServer();
  for (const def of toolDefs) {
    def.register(server, config);
  }
  return server.getHandler(toolName);
}

beforeEach(() => {
  mockPublicAxios.get.mockReset();
  mockPublicAxios.post.mockReset();
  mockPublicAxios.put.mockReset();
  mockPublicAxios.delete.mockReset();
  mockInternalAxios.get.mockReset();
  mockInternalAxios.post.mockReset();
  mockInternalAxios.put.mockReset();
  mockInternalAxios.delete.mockReset();
});

describe('file_summary', () => {
  let handler: (...args: any[]) => Promise<any>;

  beforeEach(() => {
    handler = getHandler('file_summary', patOnlyConfig());
  });

  it('returns summary with all parallel fetches succeeding', async () => {
    mockPublicAxios.get.mockImplementation((url: string) => {
      if (url.includes('/components')) {
        return Promise.resolve(axiosResponse({
          meta: { components: [{ key: 'c1' }, { key: 'c2' }] },
        }));
      }
      if (url.includes('/styles')) {
        return Promise.resolve(axiosResponse({
          meta: { styles: [{ key: 's1' }] },
        }));
      }
      if (url.includes('/comments')) {
        return Promise.resolve(axiosResponse({
          comments: [
            { id: '1', resolved_at: null, message: 'fix this' },
            { id: '2', resolved_at: '2024-01-01', message: 'done' },
            { id: '3', resolved_at: null, message: 'looks off' },
          ],
        }));
      }
      return Promise.resolve(axiosResponse({
        name: 'Design System',
        lastModified: '2024-06-15',
        version: '123',
        document: {
          children: [{ name: 'Page 1' }, { name: 'Page 2' }],
        },
      }));
    });

    const result = await handler({ file_key: 'abc123' });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.name).toBe('Design System');
    expect(data.pages).toEqual(['Page 1', 'Page 2']);
    expect(data.component_count).toBe(2);
    expect(data.style_count).toBe(1);
    expect(data.comment_count).toBe(3);
    expect(data.unresolved_comment_count).toBe(2);
  });

  it('gracefully degrades when components/styles/comments fail', async () => {
    mockPublicAxios.get.mockImplementation((url: string) => {
      if (url.includes('/components')) return Promise.reject(axiosError(500));
      if (url.includes('/styles')) return Promise.reject(axiosError(403));
      if (url.includes('/comments')) return Promise.reject(axiosError(429));
      return Promise.resolve(axiosResponse({
        name: 'My File',
        lastModified: '2024-06-15',
        version: '99',
        document: { children: [{ name: 'Home' }] },
      }));
    });

    const result = await handler({ file_key: 'abc123' });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.name).toBe('My File');
    expect(data.pages).toEqual(['Home']);
    expect(data.component_count).toBe(0);
    expect(data.style_count).toBe(0);
    expect(data.comment_count).toBe(0);
    expect(data.unresolved_comment_count).toBe(0);
  });

  it('returns error when the file fetch itself fails', async () => {
    mockPublicAxios.get.mockRejectedValue(axiosError(404));

    const result = await handler({ file_key: 'missing' });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('not found');
  });
});

describe('cleanup_stale_files', () => {
  it('defaults to dry_run=true and lists stale files without trashing', async () => {
    const handler = getHandler('cleanup_stale_files', dualAuthConfig());

    const now = Date.now();
    const staleDate = new Date(now - 100 * 86400000).toISOString();
    const freshDate = new Date(now - 10 * 86400000).toISOString();

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      files: [
        { key: 'old1', name: 'Old file', last_modified: staleDate },
        { key: 'fresh1', name: 'Fresh file', last_modified: freshDate },
        { key: 'old2', name: 'Also old', last_modified: staleDate },
      ],
    }));

    const result = await handler({ project_id: 'proj-1', days_stale: 90 });
    const data = parseToolResult(result);

    expect(data.dry_run).toBe(true);
    expect(data.trashed).toBe(false);
    expect(data.total_stale).toBe(2);
    expect(data.stale_files.map((f: any) => f.key)).toEqual(['old1', 'old2']);
    expect(mockInternalAxios.delete).not.toHaveBeenCalled();
  });

  it('defaults dry_run to true when parameter is undefined', async () => {
    const handler = getHandler('cleanup_stale_files', dualAuthConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({ files: [] }));

    const result = await handler({ project_id: 'proj-1', days_stale: 90, dry_run: undefined });
    const data = parseToolResult(result);

    expect(data.dry_run).toBe(true);
  });

  it('trashes stale files when dry_run=false with cookie auth', async () => {
    const handler = getHandler('cleanup_stale_files', dualAuthConfig());

    const staleDate = new Date(Date.now() - 200 * 86400000).toISOString();
    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      files: [{ key: 'old1', name: 'Old file', last_modified: staleDate }],
    }));
    mockInternalAxios.delete.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ project_id: 'proj-1', days_stale: 90, dry_run: false });
    const data = parseToolResult(result);

    expect(data.dry_run).toBe(false);
    expect(data.trashed).toBe(true);
    expect(mockInternalAxios.delete).toHaveBeenCalledWith('/api/files_batch', {
      data: { files: [{ key: 'old1' }], trashed: true },
    });
  });

  it('refuses to trash without cookie auth', async () => {
    const handler = getHandler('cleanup_stale_files', patOnlyConfig());

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      files: [{ key: 'old1', name: 'Old', last_modified: new Date(0).toISOString() }],
    }));

    const result = await handler({ project_id: 'proj-1', days_stale: 1, dry_run: false });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Cookie auth required');
  });

  it('rejects batch when stale count exceeds safety limit of 25', async () => {
    const handler = getHandler('cleanup_stale_files', dualAuthConfig());

    const staleDate = new Date(0).toISOString();
    const files = Array.from({ length: 30 }, (_, i) => ({
      key: `file-${i}`,
      name: `File ${i}`,
      last_modified: staleDate,
    }));

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({ files }));

    const result = await handler({ project_id: 'proj-1', days_stale: 1, dry_run: false });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('30 stale files exceeds safety limit of 25');
    expect(mockInternalAxios.delete).not.toHaveBeenCalled();
  });

  it('filters files by date correctly using days_stale parameter', async () => {
    const handler = getHandler('cleanup_stale_files', dualAuthConfig());

    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      files: [{ key: 'f1', name: 'File 1', last_modified: thirtyDaysAgo }],
    }));
    const result = await handler({ project_id: 'proj-1', days_stale: 14 });
    expect(parseToolResult(result).total_stale).toBe(1);

    mockPublicAxios.get.mockResolvedValueOnce(axiosResponse({
      files: [{ key: 'f1', name: 'File 1', last_modified: thirtyDaysAgo }],
    }));
    const result2 = await handler({ project_id: 'proj-1', days_stale: 90 });
    expect(parseToolResult(result2).total_stale).toBe(0);
  });

  it('uses internal API when only cookie auth available', async () => {
    const handler = getHandler('cleanup_stale_files', cookieOnlyConfig());

    mockInternalAxios.get.mockResolvedValueOnce(axiosResponse({
      meta: {
        files: [{ key: 'f1', name: 'File', touched_at: new Date(0).toISOString() }],
      },
    }));

    const result = await handler({ project_id: 'proj-1', days_stale: 1 });
    const data = parseToolResult(result);

    expect(data.total_stale).toBe(1);
    expect(mockInternalAxios.get).toHaveBeenCalledWith(
      '/api/folders/proj-1/paginated_files',
      expect.objectContaining({
        params: expect.objectContaining({ folderId: 'proj-1' }),
      }),
    );
    expect(mockPublicAxios.get).not.toHaveBeenCalled();
  });
});

describe('seat_optimization', () => {
  const now = Date.now();
  const staleDate = new Date(now - 120 * 86400000).toISOString();
  const freshDate = new Date(now - 10 * 86400000).toISOString();

  function makeMember(id: number, seatKey: string | null, lastActive: string | null) {
    return {
      id,
      user_id: id * 10,
      user: { email: `user${id}@example.com`, handle: `User ${id}` },
      active_seat_type: seatKey ? { key: seatKey } : null,
      last_seen: lastActive,
    };
  }

  it('returns full optimization report with inactive users and cost analysis', async () => {
    const handler = getHandler('seat_optimization', cookieOnlyConfig());

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.includes('/org_users') && !url.includes('filter_counts')) {
        return Promise.resolve(axiosResponse({
          meta: {
            users: [
              makeMember(1, 'expert', staleDate),
              makeMember(2, 'developer', freshDate),
              makeMember(3, 'collaborator', null),
              makeMember(4, null, staleDate), // viewer, should be skipped
            ],
            cursor: [],
          },
        }));
      }
      if (url.includes('filter_counts')) {
        return Promise.resolve(axiosResponse({ meta: { full: 5, dev: 3, collab: 2 } }));
      }
      if (url.includes('contract_rates')) {
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
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ org_id: 'org-1', days_inactive: 90, include_cost: true });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.summary.total_paid).toBe(3);
    expect(data.summary.inactive_paid).toBe(2); // expert (stale) + collaborator (null)
    expect(data.summary.monthly_waste_cents).toBe(5500 + 500); // expert + collaborator
    expect(data.summary.annual_savings_cents).toBe((5500 + 500) * 12);
    expect(data.seat_breakdown).toEqual({ full: 5, dev: 3, collab: 2 });
    expect(data.inactive_users).toHaveLength(2);
    expect(data.inactive_users[0].seat_type).toBe('full'); // expert -> full
    expect(data.inactive_users[1].seat_type).toBe('collab'); // collaborator -> collab
    expect(data.recommendations.length).toBeGreaterThan(0);
  });

  it('handles pagination across multiple pages', async () => {
    const handler = getHandler('seat_optimization', cookieOnlyConfig());

    // Page 1: 50 members (full page)
    const page1 = Array.from({ length: 50 }, (_, i) => makeMember(i + 1, 'expert', freshDate));
    // Page 2: 5 members (partial page, stops pagination)
    const page2 = Array.from({ length: 5 }, (_, i) => makeMember(i + 51, 'expert', freshDate));

    let pageCall = 0;
    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.includes('/org_users') && !url.includes('filter_counts')) {
        pageCall++;
        if (pageCall === 1) return Promise.resolve(axiosResponse({ meta: { users: page1, cursor: ['c1'] } }));
        if (pageCall === 2) return Promise.resolve(axiosResponse({ meta: { users: page2, cursor: [] } }));
        return Promise.resolve(axiosResponse({ meta: { users: [] } }));
      }
      if (url.includes('filter_counts')) {
        return Promise.resolve(axiosResponse({ meta: {} }));
      }
      if (url.includes('contract_rates')) {
        return Promise.resolve(axiosResponse({ meta: { product_prices: [] } }));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ org_id: 'org-1' });
    const data = parseToolResult(result);

    expect(data.summary.total_paid).toBe(55); // all 55 are expert seats
    expect(pageCall).toBe(2); // stopped after partial page
  });

  it('skips cost analysis when include_cost is false', async () => {
    const handler = getHandler('seat_optimization', cookieOnlyConfig());

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.includes('/org_users') && !url.includes('filter_counts')) {
        return Promise.resolve(axiosResponse({ meta: { users: [] } }));
      }
      if (url.includes('filter_counts')) {
        return Promise.resolve(axiosResponse({ meta: {} }));
      }
      // Should NOT be called
      if (url.includes('contract_rates')) {
        return Promise.reject(new Error('Should not call contract_rates'));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ org_id: 'org-1', include_cost: false });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.summary.monthly_waste_cents).toBe(0);
  });

  it('gracefully handles seat/rates API failures', async () => {
    const handler = getHandler('seat_optimization', cookieOnlyConfig());

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.includes('/org_users') && !url.includes('filter_counts')) {
        return Promise.resolve(axiosResponse({
          meta: { users: [makeMember(1, 'expert', staleDate)], cursor: [] },
        }));
      }
      if (url.includes('filter_counts')) {
        return Promise.reject(axiosError(500));
      }
      if (url.includes('contract_rates')) {
        return Promise.reject(axiosError(403));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ org_id: 'org-1' });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.seat_breakdown).toBeNull(); // failed
    expect(data.inactive_users).toHaveLength(1);
    expect(data.inactive_users[0].monthly_cost_cents).toBeNull(); // no rates
  });

  it('returns error when org context is missing', async () => {
    const handler = getHandler('seat_optimization', cookieOnlyConfig({ orgId: undefined }));

    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Org context required');
  });
});

describe('permission_audit', () => {
  it('audits project scope with external editor and open link access flags', async () => {
    const handler = getHandler('permission_audit', cookieOnlyConfig());

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.includes('/domains')) {
        return Promise.resolve(axiosResponse({ meta: [{ domain: 'company.com' }] }));
      }
      if (url.includes('/paginated_files')) {
        return Promise.resolve(axiosResponse({
          meta: {
            files: [
              { key: 'file-1', name: 'Design A' },
              { key: 'file-2', name: 'Design B' },
            ],
          },
        }));
      }
      if (url.includes('/roles/file/file-1')) {
        return Promise.resolve(axiosResponse({
          meta: [
            { user_id: 1, user: { email: 'alice@company.com', handle: 'Alice' }, level: 300 },
            { user_id: 2, user: { email: 'bob@external.com', handle: 'Bob' }, level: 300 },
          ],
        }));
      }
      if (url.includes('/roles/file/file-2')) {
        return Promise.resolve(axiosResponse({
          meta: [
            { user_id: 1, user: { email: 'alice@company.com', handle: 'Alice' }, level: 100 },
          ],
        }));
      }
      if (url.includes('/files/file-1')) {
        return Promise.resolve(axiosResponse({ meta: { link_access: 'edit' } }));
      }
      if (url.includes('/files/file-2')) {
        return Promise.resolve(axiosResponse({ meta: { link_access: 'view' } }));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ scope_type: 'project', scope_id: 'proj-1', flag_external: true });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.scope).toEqual({ type: 'project', id: 'proj-1' });
    expect(data.summary.unique_users).toBe(2);
    expect(data.summary.files_scanned).toBe(2);
    expect(data.summary.flags_found).toBe(2); // open_link_access + external_editor

    const flagTypes = data.flags.map((f: any) => f.type);
    expect(flagTypes).toContain('open_link_access');
    expect(flagTypes).toContain('external_editor');

    const externalFlag = data.flags.find((f: any) => f.type === 'external_editor');
    expect(externalFlag.details).toContain('bob@external.com');
    expect(externalFlag.severity).toBe('high');
  });

  it('audits team scope by iterating projects', async () => {
    const handler = getHandler('permission_audit', cookieOnlyConfig());

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.includes('/domains')) {
        return Promise.resolve(axiosResponse({ meta: [] }));
      }
      if (url.includes('/teams/team-1/folders')) {
        return Promise.resolve(axiosResponse({
          meta: { folder_rows: [{ id: 'p1', name: 'Project 1' }] },
        }));
      }
      if (url.includes('/paginated_files')) {
        return Promise.resolve(axiosResponse({
          meta: { files: [{ key: 'f1', name: 'File 1' }] },
        }));
      }
      if (url.includes('/roles/file/')) {
        return Promise.resolve(axiosResponse({ meta: [] }));
      }
      if (url.includes('/files/f1')) {
        return Promise.resolve(axiosResponse({ meta: { link_access: 'view' } }));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ scope_type: 'team', scope_id: 'team-1' });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.scope.type).toBe('team');
    expect(data.summary.files_scanned).toBe(1);
  });

  it('continues when individual file permission fetch fails', async () => {
    const handler = getHandler('permission_audit', cookieOnlyConfig());

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.includes('/domains')) {
        return Promise.resolve(axiosResponse({ meta: [] }));
      }
      if (url.includes('/paginated_files')) {
        return Promise.resolve(axiosResponse({
          meta: { files: [{ key: 'ok', name: 'OK' }, { key: 'fail', name: 'Fail' }] },
        }));
      }
      // The file-level fetches are wrapped in Promise.allSettled per batch item,
      // but each batch item does its own allSettled internally.
      // The outer Promise.allSettled catches the whole batch item failure.
      if (url.includes('/roles/file/ok')) {
        return Promise.resolve(axiosResponse({ meta: [] }));
      }
      if (url.includes('/roles/file/fail')) {
        return Promise.reject(axiosError(403));
      }
      if (url.includes('/files/ok')) {
        return Promise.resolve(axiosResponse({ meta: { link_access: 'view' } }));
      }
      if (url.includes('/files/fail')) {
        return Promise.reject(axiosError(403));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ scope_type: 'project', scope_id: 'proj-1', flag_external: false });
    const data = parseToolResult(result);

    // Should not be an error -- graceful degradation
    expect(result.isError).toBeUndefined();
    // At least the "ok" file should have been scanned.
    // The "fail" file still returns a fulfilled allSettled with empty roles/meta.
    expect(data.summary.files_scanned).toBeGreaterThanOrEqual(1);
  });

  it('caps files at 25 for team scope', async () => {
    const handler = getHandler('permission_audit', cookieOnlyConfig());

    // 2 projects, each with 20 files = 40 total, should cap at 25
    const makeFiles = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => ({ key: `${prefix}-${i}`, name: `${prefix} ${i}` }));

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.includes('/domains')) {
        return Promise.resolve(axiosResponse({ meta: [] }));
      }
      if (url.includes('/folders') && !url.includes('paginated')) {
        return Promise.resolve(axiosResponse({
          meta: { folder_rows: [{ id: 'p1' }, { id: 'p2' }] },
        }));
      }
      if (url.includes('/paginated_files')) {
        return Promise.resolve(axiosResponse({
          meta: { files: makeFiles('f', 20) },
        }));
      }
      if (url.includes('/roles/file/')) {
        return Promise.resolve(axiosResponse({ meta: [] }));
      }
      if (url.match(/\/files\/f-/)) {
        return Promise.resolve(axiosResponse({ meta: { link_access: 'view' } }));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ scope_type: 'team', scope_id: 'team-1', flag_external: false });
    const data = parseToolResult(result);

    expect(data.summary.total_files).toBe(25);
  });
});

describe('branch_cleanup', () => {
  const now = Date.now();
  const staleDate = new Date(now - 120 * 86400000).toISOString();
  const freshDate = new Date(now - 10 * 86400000).toISOString();

  it('returns stale and active branches in dry run mode', async () => {
    const handler = getHandler('branch_cleanup', dualAuthConfig());

    mockPublicAxios.get.mockImplementation((url: string) => {
      if (url.includes('/projects/')) {
        return Promise.resolve(axiosResponse({
          files: [
            { key: 'file-1', name: 'Design' },
            { key: 'file-2', name: 'Prototype' },
          ],
        }));
      }
      if (url.includes('/files/file-1')) {
        return Promise.resolve(axiosResponse({
          branches: [
            { key: 'br-1', name: 'old-branch', last_modified: staleDate },
            { key: 'br-2', name: 'new-branch', last_modified: freshDate },
          ],
        }));
      }
      if (url.includes('/files/file-2')) {
        return Promise.resolve(axiosResponse({
          branches: [
            { key: 'br-3', name: 'stale-proto', last_modified: staleDate },
          ],
        }));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ project_id: 'proj-1', days_stale: 60 });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.dry_run).toBe(true);
    expect(data.archived).toBe(false);
    expect(data.summary.files_scanned).toBe(2);
    expect(data.summary.total_branches).toBe(3);
    expect(data.summary.stale).toBe(2);
    expect(data.summary.active).toBe(1);
    expect(data.stale_branches.map((b: any) => b.branch_key)).toEqual(['br-1', 'br-3']);
    expect(data.active_branches[0].branch_key).toBe('br-2');
    expect(mockInternalAxios.delete).not.toHaveBeenCalled();
  });

  it('defaults dry_run to true when parameter is undefined', async () => {
    const handler = getHandler('branch_cleanup', dualAuthConfig());

    mockPublicAxios.get.mockImplementation((url: string) => {
      if (url.includes('/projects/')) return Promise.resolve(axiosResponse({ files: [] }));
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ project_id: 'proj-1', dry_run: undefined });
    const data = parseToolResult(result);

    expect(data.dry_run).toBe(true);
  });

  it('archives stale branches when dry_run=false with cookie auth', async () => {
    const handler = getHandler('branch_cleanup', dualAuthConfig());

    mockPublicAxios.get.mockImplementation((url: string) => {
      if (url.includes('/projects/')) {
        return Promise.resolve(axiosResponse({ files: [{ key: 'f1', name: 'File' }] }));
      }
      if (url.includes('/files/f1')) {
        return Promise.resolve(axiosResponse({
          branches: [{ key: 'br-old', name: 'old', last_modified: staleDate }],
        }));
      }
      return Promise.reject(axiosError(404));
    });
    mockInternalAxios.delete.mockResolvedValueOnce(axiosResponse({}));

    const result = await handler({ project_id: 'proj-1', days_stale: 60, dry_run: false });
    const data = parseToolResult(result);

    expect(data.dry_run).toBe(false);
    expect(data.archived).toBe(true);
    expect(mockInternalAxios.delete).toHaveBeenCalledWith('/api/files_batch', {
      data: { files: [{ key: 'br-old' }], trashed: true },
    });
  });

  it('refuses to archive without cookie auth', async () => {
    const handler = getHandler('branch_cleanup', patOnlyConfig());

    mockPublicAxios.get.mockImplementation((url: string) => {
      if (url.includes('/projects/')) {
        return Promise.resolve(axiosResponse({ files: [{ key: 'f1', name: 'File' }] }));
      }
      if (url.includes('/files/f1')) {
        return Promise.resolve(axiosResponse({
          branches: [{ key: 'br-1', name: 'stale', last_modified: staleDate }],
        }));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ project_id: 'proj-1', days_stale: 1, dry_run: false });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('Cookie auth required');
  });

  it('rejects batch when stale count exceeds safety limit of 25', async () => {
    const handler = getHandler('branch_cleanup', dualAuthConfig());

    // Single file with 30 stale branches
    const branches = Array.from({ length: 30 }, (_, i) => ({
      key: `br-${i}`,
      name: `Branch ${i}`,
      last_modified: staleDate,
    }));

    mockPublicAxios.get.mockImplementation((url: string) => {
      if (url.includes('/projects/')) {
        return Promise.resolve(axiosResponse({ files: [{ key: 'f1', name: 'File' }] }));
      }
      if (url.includes('/files/f1')) {
        return Promise.resolve(axiosResponse({ branches }));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ project_id: 'proj-1', days_stale: 1, dry_run: false });

    expect(result.isError).toBe(true);
    expect(getToolText(result)).toContain('30 stale branches exceeds safety limit of 25');
    expect(mockInternalAxios.delete).not.toHaveBeenCalled();
  });

  it('uses internal API when only cookie auth available', async () => {
    const handler = getHandler('branch_cleanup', cookieOnlyConfig());

    mockInternalAxios.get.mockImplementation((url: string) => {
      if (url.includes('/paginated_files')) {
        return Promise.resolve(axiosResponse({
          meta: { files: [{ key: 'f1', name: 'File' }] },
        }));
      }
      if (url.includes('/files/f1')) {
        return Promise.resolve(axiosResponse({
          meta: { branches: [{ key: 'br-1', name: 'Branch', last_modified: freshDate }] },
        }));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ project_id: 'proj-1' });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.summary.total_branches).toBe(1);
    expect(data.summary.active).toBe(1);
    expect(mockPublicAxios.get).not.toHaveBeenCalled();
  });

  it('continues scanning when individual file branch fetch fails', async () => {
    const handler = getHandler('branch_cleanup', dualAuthConfig());

    mockPublicAxios.get.mockImplementation((url: string) => {
      if (url.includes('/projects/')) {
        return Promise.resolve(axiosResponse({
          files: [{ key: 'ok', name: 'OK' }, { key: 'fail', name: 'Fail' }],
        }));
      }
      if (url.includes('/files/ok')) {
        return Promise.resolve(axiosResponse({
          branches: [{ key: 'br-1', name: 'Branch', last_modified: freshDate }],
        }));
      }
      if (url.includes('/files/fail')) {
        return Promise.reject(axiosError(500));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ project_id: 'proj-1' });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.summary.files_scanned).toBe(1); // only 'ok' succeeded
    expect(data.summary.total_branches).toBe(1);
  });

  it('treats branches with null last_modified as stale', async () => {
    const handler = getHandler('branch_cleanup', dualAuthConfig());

    mockPublicAxios.get.mockImplementation((url: string) => {
      if (url.includes('/projects/')) {
        return Promise.resolve(axiosResponse({ files: [{ key: 'f1', name: 'File' }] }));
      }
      if (url.includes('/files/f1')) {
        return Promise.resolve(axiosResponse({
          branches: [{ key: 'br-null', name: 'No date', last_modified: null }],
        }));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ project_id: 'proj-1' });
    const data = parseToolResult(result);

    expect(data.summary.stale).toBe(1);
    expect(data.stale_branches[0].branch_key).toBe('br-null');
  });

  it('handles empty project with no files', async () => {
    const handler = getHandler('branch_cleanup', dualAuthConfig());

    mockPublicAxios.get.mockImplementation((url: string) => {
      if (url.includes('/projects/')) {
        return Promise.resolve(axiosResponse({ files: [] }));
      }
      return Promise.reject(axiosError(404));
    });

    const result = await handler({ project_id: 'proj-1' });
    const data = parseToolResult(result);

    expect(data.summary.files_scanned).toBe(0);
    expect(data.summary.total_branches).toBe(0);
    expect(data.recommendations).toContain('No branches found in scanned files.');
  });
});
