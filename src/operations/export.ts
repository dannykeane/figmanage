import type { AuthConfig } from '../auth/client.js';
import { publicClient } from '../clients/public-api.js';

export interface ExportedImage {
  node_id: string;
  url: string | null;
}

export interface ImageFill {
  image_ref: string;
  url: string;
}

export async function exportNodes(
  config: AuthConfig,
  params: { file_key: string; node_ids: string[]; format?: string; scale?: number },
): Promise<ExportedImage[]> {
  const queryParams: Record<string, string> = {
    ids: params.node_ids.join(','),
    format: params.format || 'png',
  };
  if (params.scale) queryParams.scale = String(Math.min(Math.max(params.scale, 0.01), 4));

  const res = await publicClient(config).get(`/v1/images/${params.file_key}`, { params: queryParams });
  const images = res.data?.images || {};
  const err = res.data?.err;

  if (err) throw new Error(`Export error: ${err}`);

  return Object.entries(images).map(([nodeId, url]) => ({
    node_id: nodeId,
    url: url as string | null,
  }));
}

export async function getImageFills(
  config: AuthConfig,
  params: { file_key: string },
): Promise<ImageFill[]> {
  const res = await publicClient(config).get(`/v1/files/${params.file_key}/images`);
  const images = res.data?.meta?.images || res.data?.images || {};
  return Object.entries(images).map(([ref, url]) => ({
    image_ref: ref,
    url: url as string,
  }));
}
