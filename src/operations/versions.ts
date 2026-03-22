import type { AuthConfig } from '../auth/client.js';
import { publicClient } from '../clients/public-api.js';
import { internalClient } from '../clients/internal-api.js';

// Note: Version restore uses Figma's multiplayer WebSocket protocol
// and has no usable REST endpoint (same limitation as branch merging).

export interface Version {
  id: string;
  label: string | null;
  description: string | null;
  created_at: string;
  user: string | null;
}

export interface CreatedVersion {
  id: string | null;
  label: string;
  description: string | null;
  created_at: string | null;
}

export async function listVersions(
  config: AuthConfig,
  params: { file_key: string },
): Promise<Version[]> {
  const res = await publicClient(config).get(`/v1/files/${params.file_key}/versions`);
  const versions = res.data?.versions || [];
  return versions.map((v: any) => ({
    id: v.id,
    label: v.label || null,
    description: v.description || null,
    created_at: v.created_at,
    user: v.user?.handle || v.user?.id || null,
  }));
}

export async function createVersion(
  config: AuthConfig,
  params: { file_key: string; title: string; description?: string },
): Promise<CreatedVersion> {
  const res = await internalClient(config).post(`/api/multiplayer/${params.file_key}/create_savepoint`, {
    label: params.title,
    description: params.description || '',
  });
  const v = res.data?.meta || {};
  return {
    id: v.id || null,
    label: v.label || params.title,
    description: v.description || null,
    created_at: v.created_at || null,
  };
}
