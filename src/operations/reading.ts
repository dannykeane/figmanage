import type { AuthConfig } from '../auth/client.js';
import { publicClient } from '../clients/public-api.js';

// WARNING: Response can be very large for complex files. Callers should
// encourage use of depth and node_id params to limit payload size.
export async function getFile(
  config: AuthConfig,
  params: { file_key: string; depth?: number; node_id?: string },
): Promise<any> {
  const queryParams: Record<string, string> = {};
  if (params.depth !== undefined) queryParams.depth = String(params.depth);
  if (params.node_id) queryParams['node-id'] = params.node_id;

  const res = await publicClient(config).get(`/v1/files/${params.file_key}`, { params: queryParams });
  return res.data;
}

export async function getNodes(
  config: AuthConfig,
  params: { file_key: string; node_ids: string[]; depth?: number },
): Promise<any> {
  const queryParams: Record<string, string> = {
    ids: params.node_ids.join(','),
  };
  if (params.depth !== undefined) queryParams.depth = String(params.depth);

  const res = await publicClient(config).get(`/v1/files/${params.file_key}/nodes`, { params: queryParams });
  return res.data;
}
