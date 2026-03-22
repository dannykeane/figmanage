import type { AuthConfig } from '../auth/client.js';
import { internalClient } from '../clients/internal-api.js';
import { resolveOrgId } from '../helpers.js';

export interface CreatedFile {
  key: string;
  name: string;
  editor_type: string;
  url: string;
}

export interface DuplicatedFile {
  key: string;
  name: string;
  url: string;
}

export interface MoveResult {
  succeeded: number;
  failed: number;
  errors?: Record<string, unknown>;
}

export async function createFile(
  config: AuthConfig,
  params: {
    project_id: string;
    editor_type?: string;
    org_id?: string;
  },
): Promise<CreatedFile> {
  const res = await internalClient(config).post('/api/files/create', {
    folder_id: params.project_id,
    org_id: resolveOrgId(config, params.org_id),
    editor_type: params.editor_type || 'design',
  });
  const f = res.data?.meta?.fig_file || res.data?.meta || res.data;
  return {
    key: f.key,
    name: f.name,
    editor_type: f.editor_type,
    url: `https://www.figma.com/design/${f.key}`,
  };
}

export async function renameFile(
  config: AuthConfig,
  params: { file_key: string; name: string },
): Promise<void> {
  await internalClient(config).put(`/api/files/${params.file_key}`, {
    key: params.file_key,
    name: params.name,
  });
}

export async function moveFiles(
  config: AuthConfig,
  params: { file_keys: string[]; destination_project_id: string },
): Promise<MoveResult> {
  const files = params.file_keys.map(key => ({
    key,
    folder_id: params.destination_project_id,
    is_multi_move: params.file_keys.length > 1,
    restore_files: false,
  }));
  const res = await internalClient(config).put('/api/files_batch', { files });
  const data = res.data?.meta || res.data;
  const succeeded = Object.keys(data.success || {}).length;
  const failed = Object.keys(data.errors || {}).length;
  return {
    succeeded,
    failed,
    errors: failed > 0 ? data.errors : undefined,
  };
}

export async function duplicateFile(
  config: AuthConfig,
  params: { file_key: string; project_id?: string },
): Promise<DuplicatedFile> {
  const res = await internalClient(config).post(
    `/api/multiplayer/${params.file_key}/copy`,
    null,
    {
      headers: { 'Content-Length': '0' },
      params: params.project_id ? { folder_id: params.project_id } : undefined,
    },
  );
  const f = res.data?.meta?.fig_file || res.data?.meta || res.data;
  return {
    key: f.key,
    name: f.name,
    url: `https://www.figma.com/design/${f.key}`,
  };
}

export async function trashFiles(
  config: AuthConfig,
  params: { file_keys: string[] },
): Promise<{ succeeded: number }> {
  const files = params.file_keys.map(key => ({ key }));
  const res = await internalClient(config).delete('/api/files_batch', {
    data: { files, trashed: true },
  });
  const data = res.data?.meta || res.data;
  const succeeded = Object.keys(data.success || {}).length;
  return { succeeded };
}

export async function restoreFiles(
  config: AuthConfig,
  params: { file_keys: string[] },
): Promise<MoveResult> {
  const files = params.file_keys.map(key => ({ key }));
  const res = await internalClient(config).post('/api/files_batch/restore', { files });
  const data = res.data?.meta || res.data;
  const succeeded = Object.keys(data?.success || {}).length || params.file_keys.length;
  const failed = Object.keys(data?.errors || {}).length;
  return {
    succeeded,
    failed,
    errors: failed > 0 ? data.errors : undefined,
  };
}

export async function favoriteFile(
  config: AuthConfig,
  params: { file_key: string; favorited?: boolean },
): Promise<{ favorited: boolean }> {
  const isFavorited = params.favorited !== false;
  await internalClient(config).put('/api/favorited_resources', {
    resource_type: 'file',
    resource_id_or_key: params.file_key,
    is_favorited: isFavorited,
  });
  return { favorited: isFavorited };
}

export async function setLinkAccess(
  config: AuthConfig,
  params: { file_key: string; link_access?: string },
): Promise<{ link_access: string }> {
  const res = await internalClient(config).put(`/api/files/${params.file_key}`, {
    link_access: params.link_access || 'inherit',
  });
  const newAccess = res.data?.meta?.link_access || params.link_access || 'inherit';
  return { link_access: newAccess };
}
