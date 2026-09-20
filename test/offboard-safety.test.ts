import { beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }));
const publicApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../src/clients/internal-api.js', () => ({ internalClient: () => api }));
vi.mock('../src/clients/public-api.js', () => ({ publicClient: () => publicApi }));
import { offboardUser } from '../src/operations/compound-manager.js';
import { hasFailures } from '../src/results.js';
const config = { cookie: 'test-cookie', pat: 'test-pat', userId: 'self', orgId: 'org-1' };
let scenario = '';
let promoted = false;
let oldLevel = 999;
let seat = 'expert';
let removed = false;
const deleted = new Set<string>();
const writes: string[] = [];
const unknownWrite = () => Object.assign(new Error('Response lost'), { isAxiosError: true, config: { method: 'delete' } });
beforeEach(() => {
  vi.clearAllMocks();
  scenario = ''; promoted = false; oldLevel = 999; seat = 'expert'; removed = false; deleted.clear(); writes.length = 0;
  publicApi.get.mockImplementation(async (url: string) => {
    if (url === '/v1/me') return { data: { id: scenario === 'mismatched-account' ? 'other' : 'self' } };
    if (scenario === 'unreadable-subfolders') throw new Error('Subfolders unavailable');
    return { data: { folders: scenario === 'nested' && url === '/v2/folders/project-1/folders'
      ? [{ id: 'nested-project', name: 'Nested', parent_folder_id: 'project-1' }] : [] } };
  });
  api.get.mockImplementation(async (url: string) => {
    let meta: any;
    if (url.includes('/org_users')) meta = { users: [
      ...(!removed ? [{ id: 'ou-old', user_id: 'old', permission: scenario === 'admin' ? 'admin' : 'member', user: { email: 'old@example.com' }, active_seat_type: { key: seat } }] : []),
      { id: 'ou-new', user_id: 'new', user: { email: 'new@example.com' } },
    ] };
    else if (url.endsWith('/teams')) meta = [{ id: 'team-1', name: 'Team' }];
    else if (url.endsWith('/members')) {
      if (scenario === 'incomplete') throw new Error('Membership unreadable');
      meta = deleted.has('team-role-old') ? [] : [{ id: 'old', team_role: { level: scenario === 'team-owner' ? 999 : 300 } }];
    }
    else if (url.endsWith('/folders')) meta = { folder_rows: Array.from({ length: scenario === 'many-direct' ? 3 : 1 }, (_, i) => ({ id: `project-${i+1}`, name: 'Project' })) };
    else if (url.includes('/roles/folder/')) meta = scenario === 'folder-owner'
      ? [{ id: 'folder-role', user_id: 'old', level: 999 }]
      : scenario === 'folder-grant' && !deleted.has('folder-role') ? [{ id: 'folder-role', user_id: 'old', level: 100 }] : [];
    else if (url.includes('/paginated_files')) meta = { files: scenario === 'many-direct'
      ? Array.from({ length: 10 }, (_, i) => ({ key: `${url.split('/')[3]}-file-${i}`, name: 'Shared' }))
      : [{ key: url.includes('/nested-project/') ? 'nested-file' : 'file-1', name: 'Owned' }],
      ...(scenario === 'file-pagination' ? { pagination: { has_more: true } } : scenario === 'many-direct' ? { pagination: { next_page: null } } : {}) };
    else if (url.includes('/roles/file/')) {
      if (scenario === 'malformed-roles') return { data: {} };
      meta = [
        ...(!deleted.has('role-old') ? [{ id: 'role-old', user_id: 'old', level: scenario === 'editor' || scenario === 'many-direct' ? 300 : scenario === 'viewer' ? 100 : oldLevel }] : []),
        ...(scenario === 'missing-role' ? [] : [{ id: 'role-new', user_id: 'new', level: promoted && scenario !== 'unverified' ? 999 : 300 }]),
      ];
    }
    else if (url.includes('/roles/team/')) meta = deleted.has('team-role-old') ? [] : [{ id: 'team-role-old', user_id: 'old', level: scenario === 'team-owner' ? 999 : 300 }];
    else throw new Error('Unexpected GET '+url);
    return { data: { meta } };
  });
  api.put.mockImplementation(async (url: string, data: any) => {
    writes.push('PUT '+url);
    if (url.endsWith('role-new')) {
      if (scenario === 'rejected') throw new Error('Promotion failed');
      promoted = true;
      if (scenario === 'unknown-transfer') throw unknownWrite();
    }
    if (url.endsWith('role-old')) oldLevel = data.level;
    if (url.endsWith('/org_users')) {
      if (scenario !== 'seat-unverified') seat = 'view';
      if (scenario === 'reappearing-access') deleted.delete('role-old');
    }
    return { data: {} };
  });
  api.post.mockImplementation(async (url: string) => { writes.push('POST '+url); return { data: {} }; });
  api.delete.mockImplementation(async (url: string) => {
    writes.push('DELETE '+url);
    if (scenario === 'rejected-delete') return { data: { error: true } };
    if (url.endsWith('/org_users')) { if (scenario !== 'org-unverified') removed = true; }
    else if (scenario !== 'delete-unverified') deleted.add(url.split('/').at(-1)!);
    if (scenario === 'unknown-delete') throw unknownWrite();
    return { data: {} };
  });
});
it('blocks all writes when discovery is incomplete', async () => {
  scenario = 'incomplete';
  await expect(offboardUser(config, { user_identifier: 'old', transfer_to: 'new', execute: true, remove_from_org: true })).rejects.toThrow('discovery is incomplete');
  expect(writes).toEqual([]);
});
it.each(['rejected', 'missing-role', 'unverified'])('preserves access and membership when ownership transfer is %s', async value => {
  scenario = value;
  const result = await offboardUser(config, { user_identifier: 'old', transfer_to: 'new', execute: true, remove_from_org: true });
  expect(result.summary).toMatchObject({ failed: 1 });
  expect(writes.some(write => write.startsWith('DELETE'))).toBe(false);
  expect(writes).not.toContain('PUT /api/roles/role-old');
  expect(writes).not.toContain('PUT /api/orgs/org-1/org_users');
});
it('verifies replacement ownership before revoking the departing user', async () => {
  const result = await offboardUser(config, { user_identifier: 'old', transfer_to: 'new', execute: true, remove_from_org: true });
  expect(result.summary).toMatchObject({ failed: 0 });
  expect(writes.indexOf('PUT /api/roles/role-new')).toBeLessThan(writes.indexOf('PUT /api/roles/role-old'));
  expect(writes.at(-1)).toBe('DELETE /api/orgs/org-1/org_users');
});

it('finds owned files inside nested folders omitted by the team listing', async () => {
  scenario = 'nested';
  const result = await offboardUser(config, { user_identifier: 'old', execute: false });
  expect(result.discovery).toEqual({ complete: true, issues: [] });
  expect(result.file_ownership?.map(file => file.file_key)).toEqual(['file-1', 'nested-file']);
  expect(writes).toEqual([]);
});

it.each(['unreadable-subfolders', 'mismatched-account', 'file-pagination'])('blocks every write when discovery has %s', async value => {
  scenario = value;
  await expect(offboardUser(config, { user_identifier: 'old', transfer_to: 'new', execute: true, remove_from_org: true })).rejects.toThrow('discovery is incomplete');
  expect(writes).toEqual([]);
});

it('keeps cookie-only audit findings but blocks execution without nested discovery', async () => {
  const cookieOnly = { ...config, pat: undefined };
  const result = await offboardUser(cookieOnly, { user_identifier: 'old', execute: false });
  expect(result.file_ownership).toHaveLength(1);
  expect(result.discovery?.complete).toBe(false);
  expect(result.discovery?.issues.join(' ')).toContain('requires a PAT');
  expect(result.note).toContain('Discovery is incomplete');
  await expect(offboardUser(cookieOnly, { user_identifier: 'old', transfer_to: 'new', execute: true })).rejects.toThrow('discovery is incomplete');
  expect(writes).toEqual([]);
  expect(publicApi.get).not.toHaveBeenCalled();
});

it.each(['editor', 'viewer'])('discovers and removes non-owner %s grants without requiring a replacement owner', async value => {
  scenario = value;
  const audit = await offboardUser(config, { user_identifier: 'old', execute: false });
  expect(audit.file_ownership).toEqual([]);
  expect(audit.file_permissions).toEqual([expect.objectContaining({ file_key: 'file-1', role: value })]);
  expect(audit.summary).toMatchObject({ files_owned: 0, files_with_access: 1 });
  expect(writes).toEqual([]);
  const result = await offboardUser(config, { user_identifier: 'old', execute: true });
  expect(deleted.has('role-old')).toBe(true);
  expect(result.completion).toMatchObject({ verified: true, follow_up_required: true });
  expect(result.remaining_work).toContainEqual(expect.objectContaining({ code: 'organization_access_retained' }));
  expect(api.post).not.toHaveBeenCalled();
  expect(result.note).not.toContain('Offboarding complete');
});

it.each(['team-owner', 'folder-owner', 'admin'])('reports %s prerequisites and blocks before any writes', async value => {
  scenario = value;
  const audit = await offboardUser(config, { user_identifier: 'old', execute: false });
  expect(audit.execution_blockers).toHaveLength(1);
  expect(hasFailures(audit)).toBe(true);
  await expect(offboardUser(config, { user_identifier: 'old', execute: true, transfer_to: 'new' })).rejects.toThrow('Offboarding blocked');
  expect(writes).toEqual([]);
});

it.each(['delete-unverified', 'rejected-delete'])('stops before seat or membership changes when access removal is %s', async value => {
  scenario = value;
  const result = await offboardUser(config, { user_identifier: 'old', execute: true, transfer_to: 'new', remove_from_org: true });
  expect(result.summary).toMatchObject({ failed: 1 });
  expect(result.completion?.verified).toBe(false);
  expect(writes).not.toContain('PUT /api/orgs/org-1/org_users');
  expect(writes).not.toContain('DELETE /api/orgs/org-1/org_users');
});

it.each(['unknown-delete', 'unknown-transfer'])('preserves %s outcomes and never repeats the write or continues', async value => {
  scenario = value;
  const result = await offboardUser(config, { user_identifier: 'old', execute: true, transfer_to: 'new', remove_from_org: true });
  expect(result.summary).toMatchObject({ unknown: 1, failed: 0 });
  expect(hasFailures(result)).toBe(true);
  expect(new Set(writes).size).toBe(writes.length);
  expect(writes).not.toContain('PUT /api/orgs/org-1/org_users');
  expect(writes).not.toContain('DELETE /api/orgs/org-1/org_users');
});

it.each(['seat-unverified', 'org-unverified', 'reappearing-access'])('does not claim verified completion for %s', async value => {
  scenario = value;
  const result = await offboardUser(config, { user_identifier: 'old', execute: true, transfer_to: 'new', remove_from_org: true });
  expect(result.summary).toMatchObject({ failed: 1 });
  expect(result.completion?.verified).toBe(false);
  if (value !== 'org-unverified') expect(writes).not.toContain('DELETE /api/orgs/org-1/org_users');
});

it('verifies explicit folder access removal as well as files and teams', async () => {
  scenario = 'folder-grant';
  const result = await offboardUser(config, { user_identifier: 'old', execute: true, transfer_to: 'new' });
  expect(result.summary).toMatchObject({ failed: 0, unknown: 0 });
  expect(deleted).toEqual(new Set(['role-old', 'folder-role', 'team-role-old']));
});

it('includes non-owner file grants in the mutation limit', async () => {
  scenario = 'many-direct';
  await expect(offboardUser(config, { user_identifier: 'old', execute: true })).rejects.toThrow('32 mutations');
  expect(writes).toEqual([]);
});

it('does not interpret a malformed role response as no access', async () => {
  scenario = 'malformed-roles';
  await expect(offboardUser(config, { user_identifier: 'old', execute: true, transfer_to: 'new' })).rejects.toThrow('discovery is incomplete');
  expect(writes).toEqual([]);
});

it('emits ordered progress while working and keeps the final result authoritative', async () => {
  const events: any[] = [];
  const result = await offboardUser(config, { user_identifier: 'old', execute: true, transfer_to: 'new' }, event => {
    events.push({ ...event, writes: writes.length });
    if (event.phase === 'transfer') throw new Error('Observer disconnected');
  });
  expect(events[0]).toMatchObject({ phase: 'discovery', writes: 0 });
  expect(events.map(event => event.sequence)).toEqual(events.map((_, index) => index + 1));
  expect(events.find(event => event.phase === 'transfer').writes).toBeLessThan(writes.length);
  expect(events.at(-1)).toMatchObject({ phase: 'complete', status: 'done' });
  expect(result.completion?.verified).toBe(true);
});
