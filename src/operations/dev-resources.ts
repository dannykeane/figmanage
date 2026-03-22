import type { AuthConfig } from '../auth/client.js';
import { publicClient } from '../clients/public-api.js';

export interface DevResource {
  id: string;
  name: string;
  url: string;
  file_key: string;
  node_id: string;
  dev_status?: string;
}

export async function listDevResources(
  config: AuthConfig,
  params: { file_key: string; node_ids?: string[] },
): Promise<DevResource[]> {
  const reqParams: Record<string, string> = {};
  if (params.node_ids?.length) reqParams.node_ids = params.node_ids.join(',');
  const res = await publicClient(config).get(
    `/v1/files/${params.file_key}/dev_resources`,
    { params: reqParams },
  );
  const resources = res.data?.dev_resources || [];
  return resources.map((r: any) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    file_key: r.file_key || params.file_key,
    node_id: r.node_id,
    dev_status: r.dev_status,
  }));
}

export interface CreateDevResourceParams {
  file_key: string;
  node_id: string;
  name: string;
  url: string;
}

export async function createDevResource(
  config: AuthConfig,
  params: CreateDevResourceParams,
): Promise<Record<string, any>> {
  const res = await publicClient(config).post('/v1/dev_resources', {
    dev_resources: [{
      file_key: params.file_key,
      node_id: params.node_id,
      name: params.name,
      url: params.url,
    }],
  });
  return res.data;
}

export async function deleteDevResource(
  config: AuthConfig,
  params: { file_key: string; dev_resource_id: string },
): Promise<void> {
  await publicClient(config).delete(
    `/v1/files/${params.file_key}/dev_resources/${params.dev_resource_id}`,
  );
}
