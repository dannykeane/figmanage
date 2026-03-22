import type { AuthConfig } from '../auth/client.js';
import { internalClient } from '../clients/internal-api.js';

import { requireOrgId } from '../helpers.js';

// -- Seat constants --

export const SEAT_HIERARCHY: Record<string, number> = {
  view: 0,
  collab: 1,
  dev: 2,
  full: 3,
};

export const SEAT_LABELS: Record<string, string> = {
  view: 'Viewer (free)',
  collab: 'Collaborator ($5/mo)',
  dev: 'Developer ($25/mo)',
  full: 'Full ($55/mo)',
};

export const PAID_STATUSES: Record<string, Record<string, string>> = {
  full: { expert: 'full' },
  dev: { developer: 'full' },
  collab: { collaborator: 'full' },
  view: { collaborator: 'starter', developer: 'starter', expert: 'starter' },
};

export const SEAT_KEY_TO_TYPE: Record<string, string> = {
  expert: 'full',
  developer: 'dev',
  collaborator: 'collab',
};

// -- Helpers --

/** Resolve a billing plan_id from a team's folders. */
export async function resolvePlanId(
  client: ReturnType<typeof internalClient>,
  teamId: string,
): Promise<string> {
  const foldersRes = await client.get(`/api/teams/${teamId}/folders`);
  const folders = foldersRes.data?.meta?.folder_rows || foldersRes.data?.meta || foldersRes.data || [];
  const folder = (Array.isArray(folders) ? folders : []).find((f: any) => f.plan_id);
  if (!folder?.plan_id) throw new Error('No billing plan found for this team. Try providing plan_id directly.');
  return folder.plan_id;
}

// -- Operations --

export interface Admin {
  user_id: string;
  email: string | undefined;
  name: string | undefined;
  permission: string;
  seat_type: string | null;
  is_email_validated: boolean;
  license_admin: boolean;
}

export async function listAdmins(
  config: AuthConfig,
  params: { org_id?: string; include_license_admins?: boolean },
): Promise<Admin[]> {
  const orgId = requireOrgId(config, params.org_id);
  const res = await internalClient(config).get(
    `/api/orgs/${orgId}/admins`,
    { params: { include_license_admins: params.include_license_admins ?? false } },
  );
  return (res.data?.meta || []).map((a: any) => ({
    user_id: a.user_id,
    email: a.user?.email,
    name: a.user?.handle,
    permission: a.permission,
    seat_type: a.active_seat_type?.key || null,
    is_email_validated: a.is_email_validated,
    license_admin: a.license_admin,
  }));
}

export interface OrgTeam {
  id: string;
  name: string;
  member_count: number | null;
  project_count: number | null;
  access_level: string | null;
}

export async function listOrgTeams(
  config: AuthConfig,
  params: { org_id?: string; include_secret_teams?: boolean },
): Promise<OrgTeam[]> {
  const orgId = requireOrgId(config, params.org_id);
  const res = await internalClient(config).get(
    `/api/orgs/${orgId}/teams`,
    {
      params: {
        include_member_count: true,
        include_project_count: true,
        include_top_members: true,
        include_secret_teams: params.include_secret_teams ?? false,
      },
    },
  );
  const teams = res.data?.meta || res.data;
  return (Array.isArray(teams) ? teams : []).map((t: any) => ({
    id: String(t.id),
    name: t.name,
    member_count: t.member_count ?? null,
    project_count: t.project_count ?? null,
    access_level: t.access_level ?? null,
  }));
}

export async function seatUsage(
  config: AuthConfig,
  params: { org_id?: string; search_query?: string },
): Promise<any> {
  const orgId = requireOrgId(config, params.org_id);
  const reqParams: Record<string, string> = {};
  if (params.search_query) reqParams.search_query = params.search_query;
  const res = await internalClient(config).get(
    `/api/orgs/${orgId}/org_users/filter_counts`,
    { params: reqParams },
  );
  return res.data?.meta || res.data;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  img_url: string;
  last_active: string | null;
  team_role: number | null;
  permission: string | null;
  seat_type: string | null;
}

export async function listTeamMembers(
  config: AuthConfig,
  params: { team_id: string },
): Promise<TeamMember[]> {
  const res = await internalClient(config).get(`/api/teams/${params.team_id}/members`);
  return (res.data?.meta || res.data || []).map((m: any) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    img_url: m.img_url,
    last_active: m.last_active,
    team_role: m.team_role?.level || null,
    permission: m.team_user?.permission || null,
    seat_type: m.seat_type || null,
  }));
}

export async function billingOverview(
  config: AuthConfig,
  params: { org_id?: string },
): Promise<any> {
  const orgId = requireOrgId(config, params.org_id);
  const res = await internalClient(config).get(`/api/orgs/${orgId}/billing_data`);
  const data = res.data?.meta || res.data;
  const { shipping_address, ...billing } = data;
  return billing;
}

export async function listInvoices(
  config: AuthConfig,
  params: { org_id?: string },
): Promise<Record<string, any>> {
  const orgId = requireOrgId(config, params.org_id);
  const client = internalClient(config);
  const [openResult, upcomingResult] = await Promise.allSettled([
    client.get(`/api/plans/organization/${orgId}/invoices/open`),
    client.get(`/api/plans/organization/${orgId}/invoices/upcoming`),
  ]);

  const response: Record<string, any> = {};
  if (openResult.status === 'fulfilled') response.open = openResult.value.data;
  else response.open_error = 'Failed to fetch open invoices';
  if (upcomingResult.status === 'fulfilled') response.upcoming = upcomingResult.value.data;
  else response.upcoming_error = 'Failed to fetch upcoming invoices';
  return response;
}

export async function orgDomains(
  config: AuthConfig,
  params: { org_id?: string },
): Promise<Record<string, any>> {
  const orgId = requireOrgId(config, params.org_id);
  const client = internalClient(config);
  const [domainsResult, ssoResult] = await Promise.allSettled([
    client.get(`/api/orgs/${orgId}/domains`),
    client.get(`/api/org/${orgId}/org_saml_config`),
  ]);

  const response: Record<string, any> = {};
  if (domainsResult.status === 'fulfilled') response.domains = domainsResult.value.data;
  else response.domains_error = 'Failed to fetch domains';
  if (ssoResult.status === 'fulfilled') response.sso = ssoResult.value.data;
  else response.sso_error = 'SSO config not available';
  return response;
}

export async function aiCreditUsage(
  config: AuthConfig,
  params: { team_id: string; plan_id?: string },
): Promise<any> {
  const client = internalClient(config);
  const planId = params.plan_id || await resolvePlanId(client, params.team_id);
  const res = await client.get(`/api/plans/${planId}/ai_credits/plan_usage_summary`);
  return res.data;
}

export async function exportMembers(
  config: AuthConfig,
  params: { org_id?: string },
): Promise<string> {
  const orgId = requireOrgId(config, params.org_id);
  await internalClient(config).post(`/api/orgs/${orgId}/export_members`);
  return 'CSV export queued. It will be emailed to the org admin.';
}

export interface OrgMember {
  org_user_id: string;
  user_id: string;
  email: string | undefined;
  name: string | undefined;
  permission: string;
  seat_type: string | null;
  last_active: string | null;
}

export async function listOrgMembers(
  config: AuthConfig,
  params: { org_id?: string; search_query?: string },
): Promise<OrgMember[]> {
  const orgId = requireOrgId(config, params.org_id);
  const reqParams: Record<string, string> = {};
  if (params.search_query) reqParams.search_query = params.search_query;
  const res = await internalClient(config).get(
    `/api/v2/orgs/${orgId}/org_users`,
    { params: reqParams },
  );
  const users = res.data?.meta?.users || res.data?.meta || res.data || [];
  return (Array.isArray(users) ? users : []).map((m: any) => ({
    org_user_id: String(m.id),
    user_id: m.user_id,
    email: m.user?.email,
    name: m.user?.handle,
    permission: m.permission,
    seat_type: m.active_seat_type?.key || null,
    last_active: m.last_seen || null,
  }));
}

export interface ContractRate {
  product: string;
  monthly_cents: number;
  monthly_dollars: string;
}

export async function contractRates(
  config: AuthConfig,
  params: { org_id?: string },
): Promise<ContractRate[]> {
  const orgId = requireOrgId(config, params.org_id);
  const res = await internalClient(config).get(
    `/api/pricing/contract_rates`,
    { params: { plan_parent_id: orgId, plan_type: 'organization' } },
  );
  const seatProducts = new Set(['expert', 'developer', 'collaborator']);
  const prices = res.data?.meta?.product_prices || [];
  return prices
    .filter((r: any) => seatProducts.has(r.billable_product_key))
    .map((r: any) => ({
      product: r.billable_product_key,
      monthly_cents: r.amount,
      monthly_dollars: (r.amount / 100).toFixed(2),
    }));
}

export interface ChangeSeatResult {
  user: string | undefined;
  email: string | undefined;
  old_seat: string;
  new_seat: string;
}

export async function changeSeat(
  config: AuthConfig,
  params: { user_id: string; seat_type: string; org_id?: string; confirm?: boolean },
): Promise<ChangeSeatResult | string> {
  const orgId = requireOrgId(config, params.org_id);

  const res = await internalClient(config).get(`/api/v2/orgs/${orgId}/org_users`, {
    params: params.user_id.includes('@') ? { search_query: params.user_id } : {},
  });
  const users = res.data?.meta?.users || res.data?.meta || res.data || [];
  const members = Array.isArray(users) ? users : [];
  const member = members.find((m: any) =>
    params.user_id.includes('@')
      ? m.user?.email === params.user_id
      : String(m.user_id) === String(params.user_id),
  );
  if (!member) throw new Error(`User not found: ${params.user_id}`);

  if (String(member.user_id) === String(config.userId)) {
    throw new Error('Cannot change your own seat type. Use the Figma admin panel.');
  }

  const currentKey = member.active_seat_type?.key || null;
  const currentType = currentKey ? (SEAT_KEY_TO_TYPE[currentKey] || 'view') : 'view';

  if (currentType === params.seat_type) {
    return `Already on ${SEAT_LABELS[params.seat_type]} seat. No change needed.`;
  }

  const isUpgrade = (SEAT_HIERARCHY[params.seat_type] ?? 0) > (SEAT_HIERARCHY[currentType] ?? 0);
  if (isUpgrade && !params.confirm) {
    throw new Error(
      `Upgrading from ${SEAT_LABELS[currentType]} to ${SEAT_LABELS[params.seat_type]} will increase billing. ` +
      `Set confirm: true to authorize.`,
    );
  }

  await internalClient(config).put(`/api/orgs/${orgId}/org_users`, {
    org_user_ids: [String(member.id)],
    paid_statuses: PAID_STATUSES[params.seat_type],
    entry_point: 'members_tab',
    seat_increase_authorized: 'true',
    seat_swap_intended: 'false',
    latest_ou_update: member.updated_at,
    showing_billing_groups: 'true',
  }, {
    'axios-retry': { retries: 0 },
  } as any);

  return {
    user: member.user?.handle || member.user?.email,
    email: member.user?.email,
    old_seat: SEAT_LABELS[currentType],
    new_seat: SEAT_LABELS[params.seat_type],
  };
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  event: string;
  actor: { id: string; email: string; name: string } | null;
  team: string | null;
  ip_address: string | null;
  target: { type: string; id_or_key: string } | null;
  metadata: Record<string, any> | null;
}

export interface ActivityLogResult {
  entries: ActivityLogEntry[];
  pagination?: { after: string; column: string };
}

export async function activityLog(
  config: AuthConfig,
  params: { org_id?: string; emails?: string; start_time?: string; end_time?: string; page_size?: number; after?: string },
): Promise<ActivityLogResult> {
  const orgId = requireOrgId(config, params.org_id);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const reqParams: Record<string, string> = {
    org_id: orgId,
    page_size: String(params.page_size || 50),
    start_time: params.start_time || thirtyDaysAgo.toISOString().split('T')[0],
    end_time: params.end_time || now.toISOString(),
    emails: params.emails || '',
  };
  if (params.after) reqParams.after = params.after;

  const res = await internalClient(config).get('/api/activity_logs', { params: reqParams });
  const meta = res.data?.meta;
  const rawLogs = Array.isArray(meta) && meta.length > 0 ? meta[0] : [];
  const pagination = Array.isArray(meta) && meta.length > 1 ? meta[1] : undefined;

  const entries = (Array.isArray(rawLogs) ? rawLogs : []).map((e: any) => ({
    id: e.id,
    timestamp: e.created_at,
    event: e.event_name,
    actor: e.actor ? { id: e.actor.id, email: e.actor.email, name: e.actor.name } : null,
    team: e.metadata?.team_name || null,
    ip_address: e.ip_address || null,
    target: e.acted_on_type ? { type: e.acted_on_type, id_or_key: e.acted_on_id_or_key } : null,
    metadata: e.metadata || null,
  }));

  const result: ActivityLogResult = { entries };
  if (pagination?.after) {
    result.pagination = { after: pagination.after, column: pagination.column };
  }
  return result;
}

export async function listPayments(
  config: AuthConfig,
  params: { org_id?: string },
): Promise<any[]> {
  const orgId = requireOrgId(config, params.org_id);
  const res = await internalClient(config).get(
    `/api/orgs/${orgId}/billing_data`,
  );
  const invoices = res.data?.meta?.invoices || [];
  return invoices.filter((inv: any) => inv.status === 'paid');
}

// -- Org member removal --

export async function removeOrgMember(
  config: AuthConfig,
  params: { user_identifier: string; org_id?: string; confirm?: boolean },
): Promise<string> {
  if (!params.confirm) {
    throw new Error(
      'Removing a member from the org is permanent and cannot be undone. ' +
      'They lose access to all teams, projects, files, and apps. ' +
      'Their drafts move to Unassigned drafts. Any paid seats are freed. ' +
      'Set confirm: true to proceed.',
    );
  }

  const orgId = requireOrgId(config, params.org_id);
  const client = internalClient(config);

  // Resolve org_user_id
  const res = await client.get(`/api/v2/orgs/${orgId}/org_users`, {
    params: params.user_identifier.includes('@') ? { search_query: params.user_identifier } : {},
  });
  const users = res.data?.meta?.users || res.data?.meta || res.data || [];
  const members = Array.isArray(users) ? users : [];
  const member = members.find((m: any) =>
    params.user_identifier.includes('@')
      ? m.user?.email === params.user_identifier
      : String(m.user_id) === String(params.user_identifier),
  );
  if (!member) throw new Error(`User not found: ${params.user_identifier}`);

  if (String(member.user_id) === String(config.userId)) {
    throw new Error('Cannot remove yourself from the org.');
  }

  await client.delete(`/api/orgs/${orgId}/org_users`, {
    data: { org_user_ids: [String(member.id)] },
  });

  return `Removed ${member.user?.handle || member.user?.email || params.user_identifier} from the org. This cannot be undone.`;
}

// -- User Group operations --

export interface CreateUserGroupResult {
  user_group_id: string;
  add_user_results: any;
}

export async function createUserGroup(
  config: AuthConfig,
  params: {
    name: string;
    description?: string;
    team_id?: string;
    plan_id?: string;
    emails?: string[];
    should_notify?: boolean;
  },
): Promise<CreateUserGroupResult> {
  const client = internalClient(config);
  let planId = params.plan_id;

  if (!planId) {
    if (!params.team_id) throw new Error('Either team_id or plan_id is required to create a user group.');
    planId = await resolvePlanId(client, params.team_id);
  }

  const res = await client.post('/api/user_groups', {
    name: params.name,
    description: params.description || '',
    plan_id: planId,
    emails: params.emails || [],
    should_notify: params.should_notify ?? true,
  });
  return res.data?.meta || res.data;
}

export async function deleteUserGroups(
  config: AuthConfig,
  params: { user_group_ids: string[] },
): Promise<string> {
  await internalClient(config).delete('/api/user_groups', {
    data: { user_group_ids: params.user_group_ids },
  });
  return `Deleted ${params.user_group_ids.length} user group(s).`;
}

export async function addUserGroupMembers(
  config: AuthConfig,
  params: { user_group_id: string; emails: string[] },
): Promise<any> {
  const res = await internalClient(config).put(
    `/api/user_groups/${params.user_group_id}/add_members`,
    { emails: params.emails },
  );
  return res.data?.meta || res.data;
}

export async function removeUserGroupMembers(
  config: AuthConfig,
  params: { user_group_id: string; user_ids: string[] },
): Promise<string> {
  await internalClient(config).put(
    `/api/user_groups/${params.user_group_id}/remove_members`,
    { user_ids: params.user_ids },
  );
  return `Removed ${params.user_ids.length} member(s) from group.`;
}
