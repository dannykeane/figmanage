import type { AuthConfig } from '../auth/client.js';
import { publicClient } from './public-api.js';

async function readFolderEndpoint(config: AuthConfig, current: string, legacy: string) {
  const api = publicClient(config);
  try {
    return await api.get(current);
  } catch (error: any) {
    // Older tokens can have projects:read without the newer folders:read scope.
    if (error.response?.status === 403 && /invalid scope/i.test(error.response.data?.message || '')) {
      return api.get(legacy);
    }
    throw error;
  }
}

export async function publicTeamFolders(config: AuthConfig, teamId: string): Promise<Array<{ id: string | number; name: string }>> {
  const res = await readFolderEndpoint(config, `/v2/teams/${teamId}/folders`, `/v1/teams/${teamId}/projects`);
  const folders = res.data?.folders ?? res.data?.projects;
  if (!Array.isArray(folders)) throw new Error('Unexpected Figma response: folder list is missing.');
  return folders;
}

export async function publicFolderFiles(config: AuthConfig, folderId: string): Promise<Array<{
  key: string; name: string; last_modified?: string; thumbnail_url?: string;
}>> {
  const res = await readFolderEndpoint(config, `/v2/folders/${folderId}/files`, `/v1/projects/${folderId}/files`);
  if (!Array.isArray(res.data?.files)) throw new Error('Unexpected Figma response: file list is missing.');
  return res.data.files;
}
