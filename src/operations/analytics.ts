import type { AuthConfig } from '../auth/client.js';
import { internalClient } from '../clients/internal-api.js';
import { requireOrgId } from '../helpers.js';

export async function libraryUsage(
  config: AuthConfig,
  params: { library_file_key: string; days?: number },
): Promise<any> {
  const lookback = params.days ?? 30;
  const end_ts = Math.floor(Date.now() / 1000);
  const start_ts = end_ts - lookback * 86400;

  const res = await internalClient(config).get(
    `/api/dsa/library/${params.library_file_key}/team_usage`,
    { params: { start_ts, end_ts } },
  );
  return res.data;
}

export async function componentUsage(
  config: AuthConfig,
  params: { component_key: string; org_id?: string },
): Promise<any> {
  const orgId = requireOrgId(config, params.org_id);

  const res = await internalClient(config).get(
    `/api/design_systems/component/${params.component_key}/file_usage`,
    { params: { org_id: orgId, fv: 4 } },
  );
  return res.data;
}
