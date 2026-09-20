import { validateInput } from '../validation.js';
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
  unknown?: number;
}

function batchResult(data: any, requested: string[]): MoveResult {
  const success = data?.success || {};
  const errors = data?.errors || {};
  const succeeded = requested.filter(key => Object.prototype.hasOwnProperty.call(success, key)).length;
  const failed = requested.filter(key => Object.prototype.hasOwnProperty.call(errors, key)).length;
  const unknown = requested.filter(key => !Object.prototype.hasOwnProperty.call(success, key) && !Object.prototype.hasOwnProperty.call(errors, key)).length;
  return { succeeded, failed, ...(failed ? { errors } : {}), ...(unknown ? { unknown } : {}) };
}

export async function createFile(
  config: AuthConfig,
  params: {
    project_id: string;
    editor_type?: string;
    org_id?: string;
  },
): Promise<CreatedFile> {
  validateInput('create_file', params);
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
  validateInput('rename_file', params);
  await internalClient(config).put(`/api/files/${params.file_key}`, {
    key: params.file_key,
    name: params.name,
  });
}

export async function moveFiles(
  config: AuthConfig,
  params: { file_keys: string[]; destination_project_id: string },
): Promise<MoveResult> {
  validateInput('move_files', params);
  const files = params.file_keys.map(key => ({
    key,
    folder_id: params.destination_project_id,
    is_multi_move: params.file_keys.length > 1,
    restore_files: false,
  }));
  const res = await internalClient(config).put('/api/files_batch', { files });
  const data = res.data?.meta || res.data;
  return batchResult(data, params.file_keys);
}

export async function duplicateFile(
  config: AuthConfig,
  params: { file_key: string; project_id?: string },
): Promise<DuplicatedFile> {
  validateInput('duplicate_file', params);
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
): Promise<MoveResult> {
  validateInput('trash_files', params);
  const files = params.file_keys.map(key => ({ key }));
  const res = await internalClient(config).delete('/api/files_batch', {
    data: { files, trashed: true },
  });
  const data = res.data?.meta || res.data;
  return batchResult(data, params.file_keys);
}

export async function restoreFiles(
  config: AuthConfig,
  params: { file_keys: string[] },
): Promise<MoveResult> {
  validateInput('restore_files', params);
  const files = params.file_keys.map(key => ({ key }));
  const res = await internalClient(config).post('/api/files_batch/restore', { files });
  const data = res.data?.meta || res.data;
  return batchResult(data, params.file_keys);
}

export async function favoriteFile(
  config: AuthConfig,
  params: { file_key: string; favorited?: boolean },
): Promise<{ favorited: boolean }> {
  validateInput('favorite_file', params);
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
  validateInput('set_link_access', params);
  const res = await internalClient(config).put(`/api/files/${params.file_key}`, {
    link_access: params.link_access || 'inherit',
  });
  const newAccess = res.data?.meta?.link_access || params.link_access || 'inherit';
  return { link_access: newAccess };
}
