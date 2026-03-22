import type { AuthConfig } from '../auth/client.js';
import { hasCookie } from '../auth/client.js';
import { publicClient } from '../clients/public-api.js';
import { internalClient } from '../clients/internal-api.js';

export interface Branch {
  key: string;
  name: string;
  thumbnail_url: string | null;
  last_modified: string | null;
  link_access: string | null;
}

export interface CreatedBranch {
  key: string | null;
  name: string;
  main_file_key: string;
}

export async function listBranches(
  config: AuthConfig,
  params: { file_key: string },
): Promise<Branch[]> {
  let branches: any[];

  if (hasCookie(config)) {
    const res = await internalClient(config).get(`/api/files/${params.file_key}`);
    const f = res.data?.meta || res.data;
    branches = f.branches || [];
  } else {
    const res = await publicClient(config).get(`/v1/files/${params.file_key}`, {
      params: { branch_data: 'true', depth: '0' },
    });
    branches = res.data?.branches || [];
  }

  return branches.map((b: any) => ({
    key: b.key,
    name: b.name,
    thumbnail_url: b.thumbnail_url || null,
    last_modified: b.last_modified || null,
    link_access: b.link_access || null,
  }));
}

export async function createBranch(
  config: AuthConfig,
  params: { file_key: string; name: string },
): Promise<CreatedBranch> {
  const res = await internalClient(config).post(
    `/api/multiplayer/${params.file_key}/branch_create?name=${encodeURIComponent(params.name)}`,
  );
  const meta = res.data?.meta || res.data || {};
  const file = meta.file || meta;
  const branchKey = file.key || file.file_key || null;
  return {
    key: branchKey,
    name: params.name,
    main_file_key: params.file_key,
  };
}

export async function deleteBranch(
  config: AuthConfig,
  params: { branch_key: string },
): Promise<void> {
  await internalClient(config).delete('/api/files_batch', {
    data: { files: [{ key: params.branch_key }], trashed: true },
  });
}
