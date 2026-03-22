import type { AuthConfig } from '../auth/client.js';
import { internalClient } from '../clients/internal-api.js';
import { requireOrgId } from '../helpers.js';

export async function listOrgLibraries(
  config: AuthConfig,
  params: { org_id?: string },
): Promise<any> {
  const orgId = requireOrgId(config, params.org_id);

  const res = await internalClient(config).get('/api/design_systems/libraries', {
    params: { org_id: orgId, include_sharing_group_info: true },
  });
  return res.data;
}
