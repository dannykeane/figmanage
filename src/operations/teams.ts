import type { AuthConfig } from '../auth/client.js';
import { internalClient } from '../clients/internal-api.js';
import { requireOrgId } from '../helpers.js';

export interface CreatedTeam {
  id: string;
  name: string;
}

export async function createTeam(
  config: AuthConfig,
  params: { name: string; org_id?: string },
): Promise<CreatedTeam> {
  const orgId = requireOrgId(config, params.org_id);
  const res = await internalClient(config).post(
    '/api/teams/create',
    { team_name: params.name, org_id: orgId, sharing_audience_control: 'org_view' },
  );
  const team = res.data?.meta?.team || res.data?.meta || res.data;
  return { id: String(team.id), name: team.name };
}

export async function renameTeam(
  config: AuthConfig,
  params: { team_id: string; name: string },
): Promise<string> {
  await internalClient(config).put(`/api/teams/${params.team_id}`, { name: params.name });
  return `Team ${params.team_id} renamed to "${params.name}".`;
}

export async function addTeamMember(
  config: AuthConfig,
  params: { team_id: string; email: string; level?: number },
): Promise<string> {
  await internalClient(config).post('/api/invites', {
    emails: [params.email],
    resource_type: 'team',
    resource_id_or_key: params.team_id,
    level: params.level ?? 100,
    user_group_ids: [],
  });
  return `Invited ${params.email} to team ${params.team_id}.`;
}

export async function removeTeamMember(
  config: AuthConfig,
  params: { team_id: string; user_id: string },
): Promise<string> {
  const res = await internalClient(config).get(`/api/teams/${params.team_id}/members`);
  const members = res.data?.meta || res.data || [];
  const list = Array.isArray(members) ? members : [];
  const member = list.find((m: any) =>
    String(m.id) === String(params.user_id) || m.email === params.user_id,
  );
  if (!member) throw new Error(`User not found in team: ${params.user_id}`);

  const roleId = member.team_role?.id;
  if (!roleId) throw new Error(`User has no direct team role to remove (may have org-level access).`);

  await internalClient(config).delete(`/api/roles/${roleId}`);
  return `Removed ${member.name || member.email} from team ${params.team_id}.`;
}

export async function deleteTeam(
  config: AuthConfig,
  params: { team_id: string },
): Promise<string> {
  await internalClient(config).delete(`/api/teams/${params.team_id}`);
  return `Team ${params.team_id} deleted.`;
}
