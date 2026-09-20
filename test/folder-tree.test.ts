import { beforeEach, expect, it, vi } from 'vitest';
const get = vi.hoisted(() => vi.fn());
vi.mock('../src/clients/public-api.js', () => ({ publicClient: () => ({ get }) }));
import { discoverNestedProjects } from '../src/clients/folder-tree.js';

const config = { pat: 'test-pat', cookie: 'test-cookie', userId: 'self' };
const roots = [{ project_id: 'root', project_name: 'Root', team_name: 'Team' }];
let folders: Record<string, unknown>;
beforeEach(() => {
  folders = {
    root: [{ id: 'child', name: 'Child', parent_folder_id: 'root' }],
    child: [{ id: 'leaf', name: 'Leaf', parent_folder_id: 'child' }], leaf: [],
  };
  get.mockImplementation(async (url: string) => url === '/v1/me'
    ? { data: { id: 'self' } }
    : { data: { folders: folders[url.split('/')[3]] } });
});

it('traverses every descendant, including children appended after a short batch', async () => {
  const result = await discoverNestedProjects(config, roots);
  expect(result.issues).toEqual([]);
  expect(result.projects.map(project => project.project_id)).toEqual(['root', 'child', 'leaf']);
  expect(result.projects.every(project => project.team_name === 'Team')).toBe(true);
  expect(get).toHaveBeenCalledWith('/v2/folders/leaf/folders');
});

it('reports incomplete discovery without a PAT instead of assuming no children', async () => {
  const result = await discoverNestedProjects({ cookie: 'test', userId: 'self' }, roots);
  expect(result.issues.join(' ')).toContain('requires a PAT');
  expect(result.projects).toEqual(roots);
  expect(get).not.toHaveBeenCalled();
});

it('does not require a PAT when the verified team listing has no folders', async () => {
  expect(await discoverNestedProjects({}, [])).toEqual({ projects: [], issues: [] });
  expect(get).not.toHaveBeenCalled();
});

it('blocks discovery across mismatched accounts', async () => {
  get.mockResolvedValueOnce({ data: { id: 'other' } });
  const result = await discoverNestedProjects(config, roots);
  expect(result.issues.join(' ')).toContain('PAT identity must match');
  expect(get).toHaveBeenCalledTimes(1);
});

it('reports an unreadable descendant without substituting a flat legacy listing', async () => {
  get.mockResolvedValueOnce({ data: { id: 'self' } });
  get.mockRejectedValueOnce({ response: { status: 403, data: { message: 'Invalid scope: folders:read' } } });
  const result = await discoverNestedProjects(config, roots);
  expect(result.issues.join(' ')).toContain('Could not inspect subfolders of root');
  expect(get).toHaveBeenCalledTimes(2);
});

it.each([
  { rows: [{ id: '../escape', name: 'Bad', parent_folder_id: 'root' }] },
  { rows: [{ id: 'child', name: 'Wrong parent', parent_folder_id: 'other' }] },
  { rows: [{ id: null, name: 'Missing ID', parent_folder_id: 'root' }] },
  { rows: [null] },
])('rejects malformed hierarchy rows without requesting their IDs', async ({ rows }) => {
  folders.root = rows;
  const result = await discoverNestedProjects(config, roots);
  expect(result.issues.join(' ')).toContain('Unexpected subfolder entry');
  expect(get).toHaveBeenCalledTimes(2);
});

it('reports missing collections and cycles as incomplete', async () => {
  folders.child = undefined;
  expect((await discoverNestedProjects(config, roots)).issues.join(' ')).toContain('Unexpected subfolder response');
  folders.child = [{ id: 'root', name: 'Cycle', parent_folder_id: 'child' }];
  expect((await discoverNestedProjects(config, roots)).issues.join(' ')).toContain('Repeated folder root');
});

it('stops at the folder bound and reports remaining descendants', async () => {
  const result = await discoverNestedProjects(config, roots, 2);
  expect(result.projects.map(project => project.project_id)).toEqual(['root', 'child']);
  expect(result.issues.join(' ')).toContain('2-folder limit');
  expect(get).not.toHaveBeenCalledWith('/v2/folders/leaf/folders');
});

it('does not claim completion when a response has another page', async () => {
  get.mockResolvedValueOnce({ data: { id: 'self' } });
  get.mockResolvedValueOnce({ data: { folders: [], pagination: { has_more: true } } });
  expect((await discoverNestedProjects(config, roots)).issues.join(' ')).toContain('another page');
});
