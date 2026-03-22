import type { AuthConfig } from '../auth/client.js';
import { publicClient } from '../clients/public-api.js';

export async function listFileComponents(
  config: AuthConfig,
  params: { file_key: string },
): Promise<{ count: number; components: any[] }> {
  const res = await publicClient(config).get(`/v1/files/${params.file_key}/components`);
  const components = res.data?.meta?.components || [];
  return { count: components.length, components };
}

export async function listFileStyles(
  config: AuthConfig,
  params: { file_key: string },
): Promise<{ count: number; styles: any[] }> {
  const res = await publicClient(config).get(`/v1/files/${params.file_key}/styles`);
  const styles = res.data?.meta?.styles || [];
  return { count: styles.length, styles };
}

export async function listTeamComponents(
  config: AuthConfig,
  params: { team_id: string; page_size?: number; cursor?: string },
): Promise<{ components: any[]; pagination: any }> {
  const queryParams: Record<string, string | number> = { page_size: params.page_size ?? 30 };
  if (params.cursor) queryParams.after = params.cursor;

  const res = await publicClient(config).get(`/v1/teams/${params.team_id}/components`, { params: queryParams });
  return {
    components: res.data?.meta?.components || [],
    pagination: res.data?.pagination || null,
  };
}

export async function listTeamStyles(
  config: AuthConfig,
  params: { team_id: string; page_size?: number; cursor?: string },
): Promise<{ styles: any[]; pagination: any }> {
  const queryParams: Record<string, string | number> = { page_size: params.page_size ?? 30 };
  if (params.cursor) queryParams.after = params.cursor;

  const res = await publicClient(config).get(`/v1/teams/${params.team_id}/styles`, { params: queryParams });
  return {
    styles: res.data?.meta?.styles || [],
    pagination: res.data?.pagination || null,
  };
}
