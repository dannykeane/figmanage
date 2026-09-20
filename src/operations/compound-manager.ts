import { validateInput } from '../validation.js';
import type { AuthConfig } from '../auth/client.js';
import { internalClient } from '../clients/internal-api.js';
import { discoverNestedProjects } from '../clients/folder-tree.js';
import { requireOrgId, formatApiError } from '../helpers.js';
import { levelName } from './compound.js';
import { checkOffboardWrite, findOffboardMember, readOffboardRoles, requireCompleteOffboardPage as requireCompletePage, revokeOffboardAccess, safeId, type OffboardProgress, type OffboardProgressHandler } from './offboard-support.js';

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
  onProgress?: OffboardProgressHandler,
) {
  validateInput('offboard_user', params);
  const { user_identifier, execute, transfer_to, remove_from_org } = params;
  const orgId = requireOrgId(config, params.org_id);
  const api = internalClient(config);
  const discoveryIssues: string[] = [];

  let sequence = 0;
  const progress = async (phase: OffboardProgress['phase'], message: string, resource_id?: string, status?: string) => {
    // A disconnected observer must not change the outcome of a workspace operation.
    try { await onProgress?.({ operation: 'offboard_user', sequence: ++sequence, phase, message, resource_id, status }); } catch { /* Results remain authoritative. */ }
  };
  await progress('discovery', 'Resolving the departing member.');
  const member = await findOffboardMember(api, orgId, user_identifier);

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
  requireCompletePage(teamsRes.data);
  const teamData = teamsRes.data?.meta || teamsRes.data;
  const allTeams: any[] = Array.isArray(teamData) ? teamData : teamData?.teams || [];
  if (!Array.isArray(teamData) && !Array.isArray(teamData?.teams)) throw new Error('Cannot inspect teams: unexpected response. No changes made.');
  if (allTeams.length > 30) discoveryIssues.push('Team discovery exceeds the 30-team limit.');
  const cappedTeams = allTeams.slice(0, 30);

  // Step 3: Check team membership (batched)
  const teamMemberships: Array<{ team_id: string; team_name: string; role: string }> = [];
  const memberResults = await batchProcess(cappedTeams, async (team: any) => {
    const res = await api.get(`/api/teams/${safeId(team.id)}/members`);
    requireCompletePage(res.data);
    const teamMembers = res.data?.meta ?? res.data;
    if (!Array.isArray(teamMembers)) throw new Error('Unexpected team membership response.');
    const roles = await readOffboardRoles(api, 'team', safeId(team.id));
    const directRoles = roles.filter(role => String(role.user_id) === userId);
    if (directRoles.length > 1) throw new Error('Multiple direct team roles found.');
    const directRole = directRoles[0];
    const match = teamMembers.find((m: any) => String(m.id) === userId);
    return { team, match, directRole };
  });

  for (const r of memberResults) {
    if (r.status === 'rejected') discoveryIssues.push('Could not inspect a team membership.');
    if (r.status === 'fulfilled' && (r.value.match || r.value.directRole)) {
      const { team, match, directRole } = r.value;
      teamMemberships.push({
        team_id: safeId(team.id),
        team_name: team.name,
        role: directRole?.level === 999 || match?.team_role?.level === 999 ? 'owner' : levelName(directRole?.level ?? match?.team_role?.level ?? 100),
      });
    }
  }

  // Direct project/file access can exist without team membership.
  if (allTeams.length > 10) discoveryIssues.push('Project discovery exceeds the 10-team limit.');
  const userTeams = cappedTeams.slice(0, 10).map(team => ({ team_id: safeId(team.id), team_name: team.name }));
  let allProjects: Array<{ project_id: string; project_name: string; team_name: string }> = [];

  const projectResults = await batchProcess(userTeams, async (tm) => {
    const res = await api.get(`/api/teams/${tm.team_id}/folders`);
    requireCompletePage(res.data);
    const raw = res.data?.meta?.folder_rows ?? res.data?.meta ?? res.data;
    if (!Array.isArray(raw)) throw new Error('Unexpected project listing response.');
    const folders = raw;
    return { team_name: tm.team_name, folders };
  });

  for (const r of projectResults) {
    if (r.status === 'rejected') discoveryIssues.push('Could not inspect projects in a team.');
    if (r.status === 'fulfilled') {
      for (const f of r.value.folders) {
        if (allProjects.length >= 50) { discoveryIssues.push('Project discovery exceeds the 50-project limit.'); break; }
        allProjects.push({
          project_id: safeId(f.id),
          project_name: f.name,
          team_name: r.value.team_name,
        });
      }
    }
  }

  // Team folder listings contain only roots. Check descendants before any writes.
  const hierarchy = await discoverNestedProjects(config, allProjects);
  allProjects = hierarchy.projects;
  discoveryIssues.push(...hierarchy.issues);

  // Step 5: Check project roles (batched)
  const projectPermissions: Array<{ project_id: string; project_name: string; team_name: string; role: string }> = [];

  const roleResults = await batchProcess(allProjects, async (proj) => {
    const roles = await readOffboardRoles(api, 'folder', proj.project_id);
    const matches = roles.filter((r: any) => String(r.user_id) === userId);
    if (matches.length > 1) throw new Error('Multiple direct folder roles found.');
    const match = matches[0];
    return { proj, match };
  });

  for (const r of roleResults) {
    if (r.status === 'rejected') discoveryIssues.push('Could not inspect project permissions.');
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

  // Step 6: Inspect direct file grants and ownership within the bounded scan.
  // Team access can be inherited without an explicit project role.
  if (allProjects.length > 10) discoveryIssues.push('File discovery exceeds the 10-project limit.');
  const projectsWithAccess = allProjects.slice(0, 10);
  const fileOwnership: Array<{ file_key: string; file_name: string; project_name: string; team_name: string }> = [];
  const filePermissions: Array<{ file_key: string; file_name: string; project_name: string; team_name: string; role: string }> = [];
  let totalFilesChecked = 0;

  for (const proj of projectsWithAccess) {
    if (totalFilesChecked >= 50) { discoveryIssues.push('File discovery exceeds the 50-file limit.'); break; }

    try {
      const filesRes = await api.get(`/api/folders/${proj.project_id}/paginated_files`, {
        params: { folderId: proj.project_id, page_size: 10 },
      });
      requireCompletePage(filesRes.data);
      const meta = filesRes.data?.meta || filesRes.data;
      const files = meta?.files ?? meta;
      if (!Array.isArray(files)) throw new Error('Unexpected file listing response');
      const pagination = filesRes.data?.pagination || meta?.pagination;
      if (pagination?.next_page || files.length > 10 || (files.length === 10 && !pagination)) {
        discoveryIssues.push(`File listing is incomplete for project ${proj.project_id}.`);
      }
      if (files.length > 50 - totalFilesChecked) discoveryIssues.push('File discovery exceeds the 50-file limit.');

      const fileRoleResults = await batchProcess(
        (files as any[]).slice(0, Math.min(10, 50 - totalFilesChecked)),
        async (file: any) => {
          const roles = await readOffboardRoles(api, 'file', safeId(file.key));
          const matches = roles.filter((r: any) => String(r.user_id) === userId);
          if (matches.length > 1) throw new Error('Multiple direct file roles found.');
          const match = matches[0];
          return { file, match };
        },
      );

      for (const r of fileRoleResults) {
        totalFilesChecked++;
        if (r.status === 'rejected') discoveryIssues.push('Could not inspect file permissions.');
        if (r.status === 'fulfilled' && r.value.match) {
          const file = { file_key: r.value.file.key, file_name: r.value.file.name, project_name: proj.project_name, team_name: proj.team_name };
          filePermissions.push({ ...file, role: levelName(r.value.match.level) });
          if (r.value.match.level === 999) fileOwnership.push(file);
        }
      }
    } catch {
      discoveryIssues.push(`Could not list files in project ${proj.project_id}.`);
    }
  }

  const summary = {
    teams: teamMemberships.length,
    projects_with_access: projectPermissions.length,
    files_owned: fileOwnership.length,
    files_with_access: filePermissions.length,
  };
  const ownershipHandoffs = [
    ...teamMemberships.filter(team => team.role === 'owner').map(team => ({ resource_type: 'team', resource_id: team.team_id, name: team.team_name })),
    ...projectPermissions.filter(project => project.role === 'owner').map(project => ({ resource_type: 'folder', resource_id: project.project_id, name: project.project_name })),
  ];
  const executionBlockers: Array<{ code: string; resource_type: string; resource_id: string; message: string }> = ownershipHandoffs.map(resource => ({ code: 'ownership_handoff_required', ...resource, message: 'Transfer team/folder ownership in Figma, then rerun the audit.' }));
  if (!remove_from_org && /admin|owner/i.test(user.permission ?? '')) {
    executionBlockers.push({ code: 'admin_role_retained', resource_type: 'organization', resource_id: orgId,
      message: 'Soft offboarding retains this administrative role. Change it in Figma and rerun the audit, or explicitly request organization removal.' });
  }
  const coverage = {
    scope: 'visible_organization_resources',
    checked: ['team_memberships', 'folder_roles', 'direct_file_roles', 'file_ownership'],
    not_checked: ['group_memberships', 'workspace_and_billing_admin_roles', 'drafts', 'public_and_org_wide_links', 'identity_provider', 'resources_outside_visible_scope'],
  };
  const remainingWork = [
    { code: 'groups_and_admin_roles', message: 'Review group membership and administrative roles; these are not changed by this workflow.' },
    { code: 'draft_handoff', message: 'Review drafts and, after organization removal, recover unassigned drafts in Figma Admin.' },
    { code: 'external_access', message: 'Review identity-provider access, public links, and resources outside the visible organization scope.' },
    ...(!remove_from_org ? [{ code: 'organization_access_retained', message: `User remains in the organization with permission ${user.permission ?? 'unknown'}. Organization-wide and group-based access may remain.` }] : []),
  ];
  await progress('discovery', 'Resource discovery finished.');

  const transferPlan: string[] = [];
  if (fileOwnership.length > 0) {
    transferPlan.push(`${fileOwnership.length} file(s) need ownership transfer before removal.`);
  }
  if (filePermissions.length > 0) transferPlan.push(`Revoke direct access to ${filePermissions.length} file(s).`);
  for (const handoff of ownershipHandoffs) transferPlan.push(`Transfer ${handoff.resource_type} ownership: ${handoff.name}.`);
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
    await progress('complete', 'Read-only audit finished. Review coverage and execution blockers.', undefined, discoveryIssues.length || executionBlockers.length ? 'incomplete' : 'done');
    return {
      user,
      team_memberships: teamMemberships,
      project_permissions: projectPermissions,
      file_ownership: fileOwnership,
      file_permissions: filePermissions,
      ownership_handoffs: ownershipHandoffs,
      execution_blockers: executionBlockers,
      coverage,
      remaining_work: remainingWork,
      summary,
      transfer_plan: transferPlan,
      discovery: { complete: discoveryIssues.length === 0, issues: discoveryIssues },
      note: discoveryIssues.length > 0
        ? 'Discovery is incomplete. Resolve the reported issues before executing offboarding. No changes made.'
        : executionBlockers.length > 0
          ? 'Resolve execution_blockers before executing. No changes made.'
          : 'Review coverage and remaining_work before running execute=true. Provide transfer_to for owned files. Organization removal requires remove_from_org=true.',
    };
  }

  // --- Execute mode ---
  if (discoveryIssues.length > 0) {
    throw new Error(`Offboarding blocked: ownership discovery is incomplete. ${discoveryIssues.join(' ')} No changes made.`);
  }

  if (executionBlockers.length > 0) throw new Error(`Offboarding blocked: ${executionBlockers.map(blocker => blocker.message).join(' ')} No changes made.`);

  // Validate: if user owns files, transfer_to is required
  if (fileOwnership.length > 0 && !transfer_to) {
    throw new Error(
      `User owns ${fileOwnership.length} file(s). Provide transfer_to (email or user_id) to transfer ownership before revoking access.`,
    );
  }

  // Resolve transfer_to user
  let transferToUserId: string | undefined;
  let transferToEmail: string | undefined;
  if (transfer_to) {
    const tMatch = await findOffboardMember(api, orgId, transfer_to);
    if (!tMatch) throw new Error(`Transfer target not found: ${transfer_to}`);
    transferToUserId = String(tMatch.user_id);
    transferToEmail = tMatch.user?.email;
    if (transferToUserId === userId) throw new Error('Transfer target must differ from the departing user.');
  }

  // Cap total mutations
  const totalMutations = fileOwnership.length * 3 + filePermissions.length + teamMemberships.length + projectPermissions.length + (user.seat_type ? 1 : 0) + (remove_from_org ? 1 : 0);
  if (totalMutations > MAX_REVOCATIONS) {
    throw new Error(
      `Offboarding would require ${totalMutations} mutations (cap: ${MAX_REVOCATIONS}). ` +
      `Reduce scope or execute manually with revoke_access and set_permissions.`,
    );
  }

  const actions: Array<{ action: string; status: string; resource_id?: string; detail?: string }> = [];
  const record = async (phase: OffboardProgress['phase'], action: string, resource_id: string, detail: string, error?: unknown) => {
    const message = error ? formatApiError(error) : detail;
    const status = error ? /outcome unknown/i.test(message) ? 'unknown' : 'failed' : 'done';
    actions.push({ action, status, resource_id, detail: error ? `${detail}: ${message}` : detail });
    await progress(phase, action, resource_id, status);
  };
  const finish = async (note: string, blocked: string[] = []) => {
    const succeeded = actions.filter(action => action.status === 'done').length;
    const failed = actions.filter(action => action.status === 'failed').length;
    const unknown = actions.filter(action => action.status === 'unknown').length;
    await progress('complete', note, undefined, failed || unknown || blocked.length ? 'incomplete' : 'done');
    const retained = remove_from_org && !actions.some(action => action.action === 'remove_from_org' && action.status === 'done')
      ? [{ code: 'organization_membership_unverified', message: 'Organization removal is not verified. Inspect membership before retrying.' }] : [];
    return { user, executed: true, actions, summary: { succeeded, failed, unknown, total: actions.length },
      coverage, remaining_work: [...remainingWork, ...retained], blocked,
      completion: { scope: 'planned_changes', verified: failed === 0 && unknown === 0 && blocked.length === 0, follow_up_required: true }, note };
  };

  // Transfer ownership before revoking any access. Every write is checked by a read.
  for (const file of fileOwnership) {
    try {
      const roles = await readOffboardRoles(api, 'file', file.file_key);
      const ownerRole = roles.find(role => String(role.user_id) === userId && role.level === 999);
      const transfereeRoles = roles.filter(role => String(role.user_id) === transferToUserId);
      if (transfereeRoles.length > 1) throw new Error('Multiple replacement-owner roles found. Inspect permissions before retrying.');
      let transfereeRole = transfereeRoles[0];
      if (!ownerRole && transfereeRole?.level !== 999) throw new Error('Ownership changed since the audit. Run a fresh audit before retrying.');
      if (!transfereeRole) {
        if (!transferToEmail) throw new Error('Replacement owner email unavailable; invite them to the file before retrying.');
        checkOffboardWrite(await api.post('/api/invites', {
          resource_type: 'file', resource_id_or_key: file.file_key, emails: [transferToEmail], level: 300,
        }));
        const invited = (await readOffboardRoles(api, 'file', file.file_key)).filter(role => String(role.user_id) === transferToUserId);
        if (invited.length !== 1) throw new Error('Replacement owner has no unique role yet. Complete the invitation before retrying.');
        transfereeRole = invited[0];
      }
      if (transfereeRole.level !== 999) checkOffboardWrite(await api.put(`/api/roles/${safeId(transfereeRole.id)}`, { level: 999 }));
      const verified = await readOffboardRoles(api, 'file', file.file_key);
      if (!verified.some(role => String(role.user_id) === transferToUserId && role.level === 999)) {
        throw new Error('Ownership transfer could not be verified. Access was not revoked.');
      }
      // Figma may already downgrade the old owner when the replacement is promoted.
      const previousOwner = verified.find(role => String(role.user_id) === userId && role.level === 999);
      if (previousOwner) checkOffboardWrite(await api.put(`/api/roles/${safeId(previousOwner.id)}`, { level: 300 }));
      const after = await readOffboardRoles(api, 'file', file.file_key);
      if (after.some(role => String(role.user_id) === userId && role.level === 999)
        || !after.some(role => String(role.user_id) === transferToUserId && role.level === 999)) {
        throw new Error('Final ownership state could not be verified. Access was not revoked.');
      }
      await record('transfer', 'transfer_ownership', file.file_key, `${file.file_name} -> ${transfer_to}`);
    } catch (error) {
      await record('transfer', 'transfer_ownership', file.file_key, file.file_name, error);
      return finish('Offboarding stopped during ownership transfer. Inspect current state before retrying.', ['revoke_access', 'downgrade_seat', 'remove_from_org']);
    }
  }

  const resources = [
    ...filePermissions.map(file => ({ type: 'file', id: file.file_key, name: file.file_name, action: 'revoke_file' })),
    ...projectPermissions.map(project => ({ type: 'folder', id: project.project_id, name: project.project_name, action: 'revoke_project' })),
    ...teamMemberships.map(team => ({ type: 'team', id: team.team_id, name: team.team_name, action: 'revoke_team' })),
  ];
  for (const resource of resources) {
    try {
      // Recheck replacement ownership immediately before removing file access.
      if (resource.type === 'file' && fileOwnership.some(file => file.file_key === resource.id)) {
        const roles = await readOffboardRoles(api, 'file', resource.id);
        if (!roles.some(role => String(role.user_id) === transferToUserId && role.level === 999)) throw new Error('Replacement ownership changed. Run a fresh audit.');
      }
      await revokeOffboardAccess(api, resource.type, resource.id, userId);
      if (resource.type === 'team') {
        const res = await api.get(`/api/teams/${resource.id}/members`);
        requireCompletePage(res.data);
        const members = res.data.meta ?? res.data;
        if (!Array.isArray(members) || members.some((row: any) => String(row.id) === userId)) throw new Error('Team membership removal could not be verified.');
      }
      await record('revoke', resource.action, resource.id, resource.name);
    } catch (error) {
      await record('revoke', resource.action, resource.id, resource.name, error);
      return finish('Offboarding stopped during access removal. Inspect current state before retrying.', ['remaining_access_changes', 'downgrade_seat', 'remove_from_org']);
    }
  }

  // Use fresh member metadata for the seat update and verify the resulting seat.
  if (user.seat_type) {
    try {
      const current = await findOffboardMember(api, orgId, userId);
      if (!current) throw new Error('Member disappeared during offboarding. Run a fresh audit.');
      const seat = current.active_seat_type?.key;
      if (!['view', 'viewer', 'starter'].includes(seat)) {
        checkOffboardWrite(await api.put(`/api/orgs/${orgId}/org_users`, {
          org_user_ids: [user.org_user_id],
          paid_statuses: { collaborator: 'starter', developer: 'starter', expert: 'starter' },
          entry_point: 'members_tab', seat_increase_authorized: 'true', seat_swap_intended: 'false',
          latest_ou_update: current.updated_at, showing_billing_groups: 'true',
        }, { 'axios-retry': { retries: 0 } } as any));
      }
      const verified = await findOffboardMember(api, orgId, userId);
      if (!verified || !['view', 'viewer', 'starter'].includes(verified.active_seat_type?.key)) throw new Error('Viewer seat could not be verified.');
      await record('seat', 'downgrade_seat', user.org_user_id, `${user.seat_type} -> viewer`);
    } catch (error) {
      await record('seat', 'downgrade_seat', user.org_user_id, 'Seat change', error);
      return finish('Offboarding stopped at seat verification. Inspect current state before retrying.', ['remove_from_org']);
    }
  }

  // Reconcile the discovered grants after all access and seat changes.
  try {
    for (const resource of resources) {
      const roles = await readOffboardRoles(api, resource.type, resource.id);
      if (roles.some(role => String(role.user_id) === userId)) throw new Error(`Direct access remains on ${resource.type} ${resource.id}.`);
      if (resource.type === 'file' && fileOwnership.some(file => file.file_key === resource.id)
        && !roles.some(role => String(role.user_id) === transferToUserId && role.level === 999)) throw new Error(`Replacement ownership is missing on file ${resource.id}.`);
    }
    await record('verification', 'verify_access_changes', orgId, 'Discovered direct grants are absent; transferred file owners are verified.');
  } catch (error) {
    await record('verification', 'verify_access_changes', orgId, 'Final access verification', error);
    return finish('Final access verification failed. Run a fresh audit before continuing.', ['remove_from_org']);
  }

  if (remove_from_org) {
    try {
      checkOffboardWrite(await api.delete(`/api/orgs/${orgId}/org_users`, { data: { org_user_ids: [user.org_user_id] } }));
      if (await findOffboardMember(api, orgId, userId)) throw new Error('Organization removal could not be verified.');
      await record('membership', 'remove_from_org', user.org_user_id, 'Organization removal verified');
    } catch (error) {
      await record('membership', 'remove_from_org', user.org_user_id, 'Organization removal', error);
      return finish('Organization removal was not verified. Inspect membership before retrying.');
    }
  }

  return finish(remove_from_org
    ? 'Planned changes verified, including organization removal. Review remaining_work for drafts and other follow-up.'
    : 'Planned direct-access changes verified. User remains in the organization; review remaining_work for other access paths.');
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
  validateInput('onboard_user', params);
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
  validateInput('quarterly_design_ops_report', params);
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
