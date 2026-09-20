import { beforeEach, describe, expect, it, vi } from 'vitest';
import { patOnlyConfig, axiosResponse } from './helpers.js';

const get = vi.hoisted(() => vi.fn());
vi.mock('../src/clients/public-api.js', () => ({ publicClient: () => ({ get }) }));
import { publicFolderFiles, publicTeamFolders } from '../src/clients/folders.js';

beforeEach(() => { get.mockReset(); });

describe('public folder reads', () => {
  it('uses current team folders and preserves numeric IDs', async () => {
    const folders = [{ id: 123, name: 'Design', parent_folder_id: null }];
    get.mockResolvedValue(axiosResponse({ folders }));
    expect(await publicTeamFolders(patOnlyConfig(), 'team-1')).toEqual(folders);
    expect(get).toHaveBeenCalledExactlyOnceWith('/v2/teams/team-1/folders');
  });

  it('accepts legacy project responses for tokens with older scopes', async () => {
    get.mockRejectedValueOnce({ response: { status: 403, data: { message: 'Invalid scope: folders:read' } } });
    get.mockResolvedValueOnce(axiosResponse({ projects: [{ id: 'p1', name: 'Design' }] }));
    expect(await publicTeamFolders(patOnlyConfig(), 'team-1')).toEqual([{ id: 'p1', name: 'Design' }]);
    expect(get.mock.calls).toEqual([['/v2/teams/team-1/folders'], ['/v1/teams/team-1/projects']]);
  });

  it('uses the current file endpoint', async () => {
    get.mockResolvedValue(axiosResponse({ files: [{ key: 'f1', name: 'Design' }] }));
    expect(await publicFolderFiles(patOnlyConfig(), 'p1')).toEqual([{ key: 'f1', name: 'Design' }]);
    expect(get).toHaveBeenCalledExactlyOnceWith('/v2/folders/p1/files');
  });

  it.each([401, 403, 404, 429, 500])('does not fall back on ordinary HTTP %s errors', async status => {
    const error = Object.assign(new Error('Request denied'), { response: { status, data: { message: 'Request denied' } } });
    get.mockRejectedValue(error);
    await expect(publicFolderFiles(patOnlyConfig(), 'p1')).rejects.toBe(error);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed legacy fallback', async () => {
    const error = Object.assign(new Error('Invalid scope'), { response: { status: 403, data: { message: 'Invalid scope' } } });
    get.mockRejectedValue(error);
    await expect(publicFolderFiles(patOnlyConfig(), 'p1')).rejects.toBe(error);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('rejects missing collections instead of reporting an empty workspace', async () => {
    get.mockResolvedValue(axiosResponse({}));
    await expect(publicTeamFolders(patOnlyConfig(), 'team-1')).rejects.toThrow('folder list is missing');
    await expect(publicFolderFiles(patOnlyConfig(), 'p1')).rejects.toThrow('file list is missing');
  });
});
