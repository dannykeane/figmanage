import type { AuthConfig } from '../auth/client.js';
import { internalClient } from '../clients/internal-api.js';
import { requireOrgId, formatApiError } from '../helpers.js';
import { levelName } from './compound.js';

// -- Shared helpers --

const BATCH_SIZE = 5;

async function batchProcess<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

const MAX_REVOCATIONS = 25;

const PAID_STATUSES: Record<string, Record<string, string>> = {
  full: { expert: 'full' },
  dev: { developer: 'full' },
  collab: { collaborator: 'full' },
  view: { collaborator: 'starter', developer: 'starter', expert: 'starter' },
};

const LEVEL_MAP: Record<string, number> = { editor: 300, viewer: 100 };

// -- offboard_user --

export async function offboardUser(
  config: AuthConfig,
  params: {
    user_identifier: string;
    execute: boolean;
    transfer_to?: string;
    remove_from_org?: boolean;
    org_id?: string;
  },
) {
  const { user_identifier, execute, transfer_to, remove_from_org } = params;
  const orgId = requireOrgId(config, params.org_id);
  const api = internalClient(config);

  // Step 1: Resolve user
  const userRes = await api.get(`/api/v2/orgs/${orgId}/org_users`, {
    params: user_identifier.includes('@') ? { search_query: user_identifier } : {},
  });
  const rawUsers = userRes.data?.meta?.users || userRes.data?.meta || userRes.data || [];
  const members = Array.isArray(rawUsers) ? rawUsers : [];
  const member = members.find((m: any) =>
    user_identifier.includes('@')
      ? m.user?.email === user_identifier
      : String(m.user_id) === String(user_identifier),
  );

  if (!member) {
    throw new Error(`User not found: ${user_identifier}`);
  }

  const userId = String(member.user_id);

  // Block self-offboarding
  if (userId === String(config.userId)) {
    throw new Error('Cannot audit yourself for offboarding.');
  }

  const user = {
    org_user_id: String(member.id),
    user_id: userId,
    name: member.user?.handle || null,
    email: member.user?.email || null,
    seat_type: member.active_seat_type?.key || null,
    permission: member.permission || null,
  };

  // Step 2: Fetch all org teams
  const teamsRes = await api.get(`/api/orgs/${orgId}/teams`);
  const allTeams: any[] = (teamsRes.data?.meta || teamsRes.data || []);
  const cappedTeams = allTeams.slice(0, 30);

  // Step 3: Check team membership (batched)
  const teamMemberships: Array<{ team_id: string; team_name: string; role: string }> = [];
  const memberResults = await batchProcess(cappedTeams, async (team: any) => {
    const res = await api.get(`/api/teams/${team.id}/members`);
    const teamMembers = res.data?.meta || res.data || [];
    const match = teamMembers.find((m: any) => String(m.id) === userId);
    return { team, match };
  });

  for (const r of memberResults) {
    if (r.status === 'fulfilled' && r.value.match) {
      const { team, match } = r.value;
      teamMemberships.push({
        team_id: String(team.id),
        team_name: team.name,
        role: match.team_role?.level ? levelName(match.team_role.level) : 'member',
      });
    }
  }

  // Step 4: For each team the user belongs to (cap 10), get projects
  const userTeams = teamMemberships.slice(0, 10);
  const allProjects: Array<{ project_id: string; project_name: string; team_name: string }> = [];

  const projectResults = await batchProcess(userTeams, async (tm) => {
    const res = await api.get(`/api/teams/${tm.team_id}/folders`);
    const raw = res.data?.meta?.folder_rows || res.data?.meta || res.data || [];
    const folders = Array.isArray(raw) ? raw : [];
    return { team_name: tm.team_name, folders };
  });

  for (const r of projectResults) {
    if (r.status === 'fulfilled') {
      for (const f of r.value.folders) {
        if (allProjects.length >= 50) break;
        allProjects.push({
          project_id: String(f.id),
          project_name: f.name,
          team_name: r.value.team_name,
        });
      }
    }
  }

  // Step 5: Check project roles (batched)
  const projectPermissions: Array<{ project_id: string; project_name: string; team_name: string; role: string }> = [];

  const roleResults = await batchProcess(allProjects, async (proj) => {
    const res = await api.get(`/api/roles/folder/${proj.project_id}`);
    const roles = res.data?.meta || [];
    const match = roles.find((r: any) => String(r.user_id) === userId);
    return { proj, match };
  });

  for (const r of roleResults) {
    if (r.status === 'fulfilled' && r.value.match) {
      const { proj, match } = r.value;
      projectPermissions.push({
        project_id: proj.project_id,
        project_name: proj.project_name,
        team_name: proj.team_name,
        role: levelName(match.level),
      });
    }
  }

  // Step 6: Sample files from projects where user has access
  const projectsWithAccess = projectPermissions.slice(0, 10);
  const fileOwnership: Array<{ file_key: string; file_name: string; project_name: string; team_name: string }> = [];
  let totalFilesChecked = 0;

  for (const proj of projectsWithAccess) {
    if (totalFilesChecked >= 50) break;

    try {
      const filesRes = await api.get(`/api/folders/${proj.project_id}/paginated_files`, {
        params: { folderId: proj.project_id, page_size: 10 },
      });
      const meta = filesRes.data?.meta || filesRes.data;
      const files = meta?.files || meta || [];

      const fileRoleResults = await batchProcess(
        (files as any[]).slice(0, Math.min(10, 50 - totalFilesChecked)),
        async (file: any) => {
          const res = await api.get(`/api/roles/file/${file.key}`);
          const roles = res.data?.meta || [];
          const match = roles.find((r: any) => String(r.user_id) === userId && r.level === 999);
          return { file, match };
        },
      );

      for (const r of fileRoleResults) {
        totalFilesChecked++;
        if (r.status === 'fulfilled' && r.value.match) {
          fileOwnership.push({
            file_key: r.value.file.key,
            file_name: r.value.file.name,
            project_name: proj.project_name,
            team_name: proj.team_name,
          });
        }
      }
    } catch {
      // Skip projects where file listing fails
    }
  }

  const summary = {
    teams: teamMemberships.length,
    projects_with_access: projectPermissions.length,
    files_owned: fileOwnership.length,
  };

  const transferPlan: string[] = [];
  if (fileOwnership.length > 0) {
    transferPlan.push(`${fileOwnership.length} file(s) need ownership transfer before removal.`);
  }
  if (teamMemberships.length > 0) {
    transferPlan.push(`Remove from ${teamMemberships.length} team(s).`);
  }
  if (projectPermissions.length > 0) {
    transferPlan.push(`Revoke access to ${projectPermissions.length} project(s).`);
  }
  if (user.seat_type) {
    transferPlan.push(`Downgrade or remove ${user.seat_type} seat.`);
  }

  // Audit-only mode
  if (!execute) {
    return {
      user,
      team_memberships: teamMemberships,
      project_permissions: projectPermissions,
      file_ownership: fileOwnership,
      summary,
      transfer_plan: transferPlan,
      note: 'Run with execute=true to perform offboarding. Provide transfer_to if the user owns files. Add remove_from_org=true to fully remove from the org (permanent).',
    };
  }

  // --- Execute mode ---

  // Validate: if user owns files, transfer_to is required
  if (fileOwnership.length > 0 && !transfer_to) {
    throw new Error(
      `User owns ${fileOwnership.length} file(s). Provide transfer_to (email or user_id) to transfer ownership before revoking access.`,
    );
  }

  // Resolve transfer_to user
  let transferToUserId: string | undefined;
  if (transfer_to) {
    const tRes = await api.get(`/api/v2/orgs/${orgId}/org_users`, {
      params: transfer_to.includes('@') ? { search_query: transfer_to } : {},
    });
    const tUsers = tRes.data?.meta?.users || tRes.data?.meta || tRes.data || [];
    const tList = Array.isArray(tUsers) ? tUsers : [];
    const tMatch = tList.find((m: any) =>
      transfer_to.includes('@')
        ? m.user?.email === transfer_to
        : String(m.user_id) === String(transfer_to),
    );
    if (!tMatch) throw new Error(`Transfer target not found: ${transfer_to}`);
    transferToUserId = String(tMatch.user_id);
  }

  // Cap total mutations
  const totalMutations = fileOwnership.length + teamMemberships.length + projectPermissions.length + 1;
  if (totalMutations > MAX_REVOCATIONS) {
    throw new Error(
      `Offboarding would require ${totalMutations} mutations (cap: ${MAX_REVOCATIONS}). ` +
      `Reduce scope or execute manually with revoke_access and set_permissions.`,
    );
  }

  const actions: Array<{ action: string; status: string; detail?: string }> = [];

  // Step A: Transfer file ownership
  if (fileOwnership.length > 0 && transferToUserId) {
    for (const file of fileOwnership) {
      try {
        // Get the role entry for the file
        const rolesRes = await api.get(`/api/roles/file/${file.file_key}`);
        const roles = rolesRes.data?.meta || [];
        const ownerRole = roles.find((r: any) => String(r.user_id) === userId && r.level === 999);
        const transfereeRole = roles.find((r: any) => String(r.user_id) === transferToUserId);

        // Give transfer target owner access
        if (transfereeRole) {
          await api.put(`/api/roles/${transfereeRole.id}`, { level: 999 });
        } else {
          // Invite as editor first, then promote -- can't directly set owner on uninvited user
          await api.post('/api/invites', {
            resource_type: 'file',
            resource_id_or_key: file.file_key,
            emails: [transfer_to],
            level: 300,
          });
          // Re-fetch roles to get the new role ID
          const rolesRes2 = await api.get(`/api/roles/file/${file.file_key}`);
          const roles2 = rolesRes2.data?.meta || [];
          const newRole = roles2.find((r: any) => String(r.user_id) === transferToUserId);
          if (newRole) {
            await api.put(`/api/roles/${newRole.id}`, { level: 999 });
          }
        }

        // Downgrade departing user from owner to editor (can't revoke owner directly)
        if (ownerRole) {
          await api.put(`/api/roles/${ownerRole.id}`, { level: 300 });
        }

        actions.push({ action: 'transfer_ownership', status: 'done', detail: `${file.file_name} -> ${transfer_to}` });
      } catch (e: any) {
        actions.push({ action: 'transfer_ownership', status: 'failed', detail: `${file.file_name}: ${formatApiError(e)}` });
      }
    }
  }

  // Step B: Revoke file access (now that they're no longer owner)
  for (const file of fileOwnership) {
    try {
      const rolesRes = await api.get(`/api/roles/file/${file.file_key}`);
      const roles = rolesRes.data?.meta || [];
      const role = roles.find((r: any) => String(r.user_id) === userId);
      if (role) {
        await api.delete(`/api/roles/${role.id}`);
        actions.push({ action: 'revoke_file', status: 'done', detail: file.file_name });
      }
    } catch (e: any) {
      actions.push({ action: 'revoke_file', status: 'failed', detail: `${file.file_name}: ${formatApiError(e)}` });
    }
  }

  // Step C: Revoke project access
  const projResults = await batchProcess(projectPermissions, async (proj) => {
    const rolesRes = await api.get(`/api/roles/folder/${proj.project_id}`);
    const roles = rolesRes.data?.meta || [];
    const role = roles.find((r: any) => String(r.user_id) === userId);
    if (role) await api.delete(`/api/roles/${role.id}`);
    return proj;
  });
  for (let i = 0; i < projectPermissions.length; i++) {
    const r = projResults[i];
    actions.push({
      action: 'revoke_project',
      status: r.status === 'fulfilled' ? 'done' : 'failed',
      detail: projectPermissions[i].project_name,
    });
  }

  // Step D: Revoke team memberships
  const teamResults = await batchProcess(teamMemberships, async (tm) => {
    const rolesRes = await api.get(`/api/roles/team/${tm.team_id}`);
    const roles = rolesRes.data?.meta || [];
    const role = roles.find((r: any) => String(r.user_id) === userId);
    if (role) await api.delete(`/api/roles/${role.id}`);
    return tm;
  });
  for (let i = 0; i < teamMemberships.length; i++) {
    const r = teamResults[i];
    actions.push({
      action: 'revoke_team',
      status: r.status === 'fulfilled' ? 'done' : 'failed',
      detail: teamMemberships[i].team_name,
    });
  }

  // Step E: Downgrade seat to viewer
  if (user.seat_type) {
    try {
      const viewStatuses: Record<string, string> = { collaborator: 'starter', developer: 'starter', expert: 'starter' };
      await api.put(`/api/orgs/${orgId}/org_users`, {
        org_user_ids: [user.org_user_id],
        paid_statuses: viewStatuses,
        entry_point: 'members_tab',
        seat_increase_authorized: 'true',
        seat_swap_intended: 'false',
        latest_ou_update: member.updated_at,
        showing_billing_groups: 'true',
      }, {
        'axios-retry': { retries: 0 },
      } as any);
      actions.push({ action: 'downgrade_seat', status: 'done', detail: `${user.seat_type} -> viewer` });
    } catch (e: any) {
      actions.push({ action: 'downgrade_seat', status: 'failed', detail: formatApiError(e) });
    }
  }

  // Step F: Remove from org (permanent, requires remove_from_org flag)
  if (remove_from_org) {
    try {
      await api.delete(`/api/orgs/${orgId}/org_users`, {
        data: { org_user_ids: [user.org_user_id] },
      });
      actions.push({ action: 'remove_from_org', status: 'done', detail: 'Permanently removed from org' });
    } catch (e: any) {
      actions.push({ action: 'remove_from_org', status: 'failed', detail: formatApiError(e) });
    }
  }

  const succeeded = actions.filter(a => a.status === 'done').length;
  const failed = actions.filter(a => a.status === 'failed').length;

  return {
    user,
    executed: true,
    actions,
    summary: { succeeded, failed, total: actions.length },
    note: failed > 0
      ? `${failed} action(s) failed. Review and retry manually.`
      : remove_from_org
        ? 'Offboarding complete. User permanently removed from org.'
        : 'Offboarding complete. User remains in org (use remove_from_org=true to fully remove).',
  };
}

// -- onboard_user --

export async function onboardUser(
  config: AuthConfig,
  params: {
    email: string;
    team_ids: string[];
    role: string;
    share_files?: string[];
    seat_type?: string;
    confirm?: boolean;
    org_id?: string;
  },
) {
  const { email, team_ids, role, share_files, seat_type, confirm } = params;
  const orgId = requireOrgId(config, params.org_id);

  // Enforce caps
  if (team_ids.length > 10) {
    throw new Error(`Too many teams: ${team_ids.length}. Maximum is 10.`);
  }
  if (share_files && share_files.length > 20) {
    throw new Error(`Too many files: ${share_files.length}. Maximum is 20.`);
  }

  const api = internalClient(config);
  const level = LEVEL_MAP[role || 'editor'];

  // Validate team_ids exist
  const teamsRes = await api.get(`/api/orgs/${orgId}/teams`);
  const orgTeams = teamsRes.data?.meta || teamsRes.data || [];
  const orgTeamMap = new Map<string, string>();
  for (const t of orgTeams) {
    orgTeamMap.set(String(t.id), t.name);
  }

  const invalidTeams = team_ids.filter(id => !orgTeamMap.has(id));
  if (invalidTeams.length > 0) {
    throw new Error(`Team(s) not found in org: ${invalidTeams.join(', ')}`);
  }

  // Invite to teams (batched)
  const teamsJoined: Array<{ team_id: string; team_name: string; role: string; status: string }> = [];

  const teamInviteResults = await batchProcess(team_ids, async (teamId) => {
    const res = await api.post('/api/invites', {
      resource_type: 'team',
      resource_id_or_key: teamId,
      emails: [email],
      level,
    });
    return { teamId, res };
  });

  for (let i = 0; i < team_ids.length; i++) {
    const r = teamInviteResults[i];
    teamsJoined.push({
      team_id: team_ids[i],
      team_name: orgTeamMap.get(team_ids[i]) || 'unknown',
      role: role || 'editor',
      status: r.status === 'fulfilled' ? 'invited' : 'failed',
    });
  }

  // Share files (batched, viewer access)
  const filesShared: Array<{ file_key: string; role: string; status: string }> = [];

  if (share_files && share_files.length > 0) {
    const fileShareResults = await batchProcess(share_files, async (fileKey) => {
      await api.post('/api/invites', {
        resource_type: 'file',
        resource_id_or_key: fileKey,
        emails: [email],
        level: 100, // viewer
      });
      return fileKey;
    });

    for (let i = 0; i < share_files.length; i++) {
      const r = fileShareResults[i];
      filesShared.push({
        file_key: share_files[i],
        role: 'viewer',
        status: r.status === 'fulfilled' ? 'shared' : 'failed',
      });
    }
  }

  // Seat change
  let seatChange: { status: string; note?: string } = { status: 'skipped', note: 'No seat_type specified.' };

  if (seat_type && confirm) {
    try {
      const userRes = await api.get(`/api/v2/orgs/${orgId}/org_users`, {
        params: { search_query: email },
      });
      const rawU = userRes.data?.meta?.users || userRes.data?.meta || userRes.data || [];
      const users = Array.isArray(rawU) ? rawU : [];
      const found = users.find((m: any) => m.user?.email === email);

      if (found) {
        await api.put(`/api/orgs/${orgId}/org_users`, {
          org_user_ids: [String(found.id)],
          paid_statuses: PAID_STATUSES[seat_type],
          entry_point: 'members_tab',
          seat_increase_authorized: 'true',
          seat_swap_intended: 'false',
          latest_ou_update: found.updated_at,
          showing_billing_groups: 'true',
        }, {
          'axios-retry': { retries: 0 },
        } as any);
        seatChange = { status: 'changed', note: `Set to ${seat_type}.` };
      } else {
        seatChange = { status: 'skipped', note: 'User not yet in org (invite pending). Seat change will need to be applied after they accept.' };
      }
    } catch (e: any) {
      seatChange = { status: 'failed', note: `Seat change failed: ${formatApiError(e)}` };
    }
  } else if (seat_type && !confirm) {
    seatChange = { status: 'skipped', note: `Set confirm: true to apply ${seat_type} seat change.` };
  }

  return {
    user_email: email,
    setup_results: {
      teams_joined: teamsJoined,
      files_shared: filesShared,
      seat_change: seatChange,
    },
    next_steps: [
      'User will receive invite emails for each team.',
      'Team-level projects are automatically accessible once they accept.',
    ],
  };
}

// -- quarterly_design_ops_report --

export async function quarterlyDesignOpsReport(
  config: AuthConfig,
  params: { org_id?: string; days: number },
) {
  const { days } = params;
  const orgId = requireOrgId(config, params.org_id);
  const api = internalClient(config);
  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 86400000);

  // Phase 1: Parallel fetches
  const [teamsResult, seatsResult, billingResult, upcomingResult, ratesResult] = await Promise.allSettled([
    api.get(`/api/orgs/${orgId}/teams`, {
      params: { include_member_count: true, include_project_count: true },
    }),
    api.get(`/api/orgs/${orgId}/org_users/filter_counts`),
    api.get(`/api/orgs/${orgId}/billing_data`),
    api.get(`/api/plans/organization/${orgId}/invoices/upcoming`),
    api.get(`/api/pricing/contract_rates`, {
      params: { plan_parent_id: orgId, plan_type: 'organization' },
    }),
  ]);

  // Paginate all members (cursor-based)
  const errors: string[] = [];
  const allMembers: any[] = [];
  let cursor: string | undefined;
  let membersComplete = true;
  const maxPages = 200; // safety cap: 200 * 50 = 10,000 members
  for (let page = 0; page < maxPages; page++) {
    try {
      const params: Record<string, any> = { page_size: 50 };
      if (cursor) params.cursor = cursor;
      const res = await api.get(`/api/v2/orgs/${orgId}/org_users`, { params });
      const meta = res.data?.meta || {};
      const batch = meta.users || [];
      if (!Array.isArray(batch) || batch.length === 0) break;
      allMembers.push(...batch);
      cursor = Array.isArray(meta.cursor) ? meta.cursor[0] : meta.cursor;
      if (!cursor || batch.length < 50) break;
    } catch (e: any) {
      membersComplete = false;
      errors.push(`members: pagination stopped at page ${page + 1} of ${maxPages}, fetched ${allMembers.length} members (${formatApiError(e)})`);
      break;
    }
  }
  if (cursor && allMembers.length >= maxPages * 50) {
    membersComplete = false;
    errors.push(`members: hit ${maxPages}-page safety cap at ${allMembers.length} members, org may have more`);
  }

  // Process teams
  const teamsRaw = teamsResult.status === 'fulfilled'
    ? (teamsResult.value.data?.meta || teamsResult.value.data || [])
    : [];
  const teamsArray = Array.isArray(teamsRaw) ? teamsRaw : [];
  const teams = teamsArray.map((t: any) => ({
    team_name: t.name,
    members: t.member_count || 0,
    projects: t.project_count || 0,
  }));

  // Seat utilization from member list
  const paidKeys = new Set(['expert', 'developer', 'collaborator']);
  const cutoffMs = now.getTime() - days * 86400000;

  let totalPaid = 0;
  let inactivePaid = 0;
  const seatCounts: Record<string, number> = {};

  for (const m of allMembers) {
    const seatKey = m.active_seat_type?.key;
    if (seatKey && paidKeys.has(seatKey)) {
      totalPaid++;
      seatCounts[seatKey] = (seatCounts[seatKey] || 0) + 1;

      const lastSeen = m.last_seen ? new Date(m.last_seen).getTime() : 0;
      if (!m.last_seen || lastSeen < cutoffMs) {
        inactivePaid++;
      }
    }
  }

  const activePaid = totalPaid - inactivePaid;
  const utilizationRate = totalPaid > 0
    ? Number(((activePaid / totalPaid) * 100).toFixed(1))
    : 0;

  // Billing
  let billing: Record<string, any> | null = null;

  if (ratesResult.status === 'fulfilled') {
    const prices = ratesResult.value.data?.meta?.product_prices || [];
    const seatProducts = new Set(['expert', 'developer', 'collaborator']);
    let monthlySpendCents = 0;

    for (const p of prices) {
      if (seatProducts.has(p.billable_product_key)) {
        const count = seatCounts[p.billable_product_key] || 0;
        monthlySpendCents += count * (p.amount || 0);
      }
    }

    const monthlySpendDollars = Number((monthlySpendCents / 100).toFixed(2));
    const costPerActiveUser = activePaid > 0
      ? Number((monthlySpendDollars / activePaid).toFixed(2))
      : 0;

    billing = {
      monthly_spend_dollars: monthlySpendDollars,
      cost_per_active_user: costPerActiveUser,
    };

    if (upcomingResult.status === 'fulfilled') {
      const upcoming = upcomingResult.value.data;
      billing.upcoming_invoice_date = upcoming?.date || upcoming?.period_end || null;
      billing.upcoming_amount = upcoming?.amount_due ?? upcoming?.total ?? null;
    }
  } else {
    errors.push('billing: rates unavailable (may require admin)');
  }

  if (billingResult.status === 'fulfilled' && billing) {
    const rawBilling = billingResult.value.data?.meta || billingResult.value.data;
    if (rawBilling) {
      const { shipping_address, ...safeBilling } = rawBilling;
      billing.plan_name = safeBilling.plan_name || safeBilling.name || null;
    }
  } else if (billingResult.status === 'rejected') {
    errors.push('billing_data: 403 (admin required)');
  }

  // Phase 2: Library adoption
  const libraryAdoption: Array<{ library_name: string; file_key: string; insertions: number }> = [];

  try {
    const libRes = await api.get('/api/design_systems/libraries', {
      params: { org_id: orgId },
    });
    const libraries = libRes.data?.libraries || libRes.data?.meta?.libraries || [];
    const cappedLibraries = (libraries as any[]).slice(0, 5);

    const endTs = Math.floor(now.getTime() / 1000);
    const startTs = Math.floor(periodStart.getTime() / 1000);

    const libResults = await batchProcess(cappedLibraries, async (lib: any) => {
      const res = await api.get(`/api/dsa/library/${lib.file_key || lib.key}/team_usage`, {
        params: { start_ts: startTs, end_ts: endTs },
      });
      return { lib, data: res.data };
    });

    for (const r of libResults) {
      if (r.status === 'fulfilled') {
        const { lib, data } = r.value;
        const teamUsages = data?.rows || data?.teams || [];
        let totalInsertions = 0;
        for (const tu of teamUsages) {
          totalInsertions += tu.insertions || tu.num_insertions || 0;
        }
        libraryAdoption.push({
          library_name: lib.name || lib.file_name || 'unknown',
          file_key: lib.file_key || lib.key,
          insertions: totalInsertions,
        });
      }
    }
  } catch {
    errors.push('libraries: failed to fetch (may be 404)');
  }

  // Highlights
  const highlights: string[] = [];
  highlights.push(`${utilizationRate}% seat utilization (${activePaid} active of ${totalPaid} paid).`);
  if (inactivePaid > 0) {
    highlights.push(`${inactivePaid} paid seat(s) inactive for ${days}+ days.`);
  }
  if (teams.length > 0) {
    highlights.push(`${teams.length} team(s), ${allMembers.length} total member(s).`);
  }
  if (libraryAdoption.length > 0) {
    const totalInsertions = libraryAdoption.reduce((sum, l) => sum + l.insertions, 0);
    highlights.push(`${totalInsertions} library component insertions across ${libraryAdoption.length} library/libraries.`);
  }

  const result: Record<string, any> = {
    highlights,
    ...(errors.length > 0 ? { errors } : {}),
    period: {
      start: periodStart.toISOString().split('T')[0],
      end: now.toISOString().split('T')[0],
      days,
    },
    org_overview: {
      total_teams: teams.length,
      total_members: allMembers.length,
      total_paid_seats: totalPaid,
      members_complete: membersComplete,
    },
    seat_utilization: {
      active_paid: activePaid,
      inactive_paid: inactivePaid,
      utilization_rate: utilizationRate,
    },
    teams,
    billing,
    library_adoption: libraryAdoption,
  };

  return result;
}
