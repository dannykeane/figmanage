import type { AuthConfig } from '../auth/client.js';
import { hasPat, hasCookie } from '../auth/client.js';
import { publicClient } from '../clients/public-api.js';
import { internalClient } from '../clients/internal-api.js';
import { requireOrgId, formatApiError } from '../helpers.js';

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

export const SEAT_KEY_MAP: Record<string, string> = {
  expert: 'full',
  developer: 'dev',
  collaborator: 'collab',
};

export const LEVEL_NAMES: Record<number, string> = { 999: 'owner', 300: 'editor', 100: 'viewer' };

export function levelName(level: number): string {
  return LEVEL_NAMES[level] || `level:${level}`;
}

// -- file_summary --

export async function fileSummary(
  config: AuthConfig,
  params: { file_key: string },
) {
  const api = publicClient(config);
  const [fileResult, componentsResult, stylesResult, commentsResult] = await Promise.allSettled([
    api.get(`/v1/files/${params.file_key}`, { params: { depth: '1' } }),
    api.get(`/v1/files/${params.file_key}/components`),
    api.get(`/v1/files/${params.file_key}/styles`),
    api.get(`/v1/files/${params.file_key}/comments`),
  ]);

  if (fileResult.status === 'rejected') {
    throw new Error(`Failed to fetch file: ${formatApiError(fileResult.reason)}`);
  }

  const fileData = fileResult.value.data;
  const pages = (fileData.document?.children || []).map((c: any) => c.name);
  const components = componentsResult.status === 'fulfilled' ? componentsResult.value.data?.meta?.components || [] : [];
  const styles = stylesResult.status === 'fulfilled' ? stylesResult.value.data?.meta?.styles || [] : [];
  const comments = commentsResult.status === 'fulfilled' ? commentsResult.value.data?.comments || [] : [];
  const unresolved = comments.filter((c: any) => !c.resolved_at);

  return {
    name: fileData.name,
    last_modified: fileData.lastModified,
    version: fileData.version,
    pages,
    component_count: components.length,
    style_count: styles.length,
    comment_count: comments.length,
    unresolved_comment_count: unresolved.length,
  };
}

// -- workspace_overview --

export async function workspaceOverview(
  config: AuthConfig,
  params: { org_id?: string },
) {
  const orgId = requireOrgId(config, params.org_id);
  const api = internalClient(config);

  const [teamsResult, seatsResult, billingResult] = await Promise.allSettled([
    api.get(`/api/orgs/${orgId}/teams`, {
      params: { include_member_count: true, include_project_count: true, include_top_members: true },
    }),
    api.get(`/api/orgs/${orgId}/org_users/filter_counts`),
    api.get(`/api/orgs/${orgId}/billing_data`),
  ]);

  const teamsData = teamsResult.status === 'fulfilled' ? (teamsResult.value.data?.meta || teamsResult.value.data) : null;
  const teamsRaw = teamsData ? (Array.isArray(teamsData) ? teamsData : (teamsData?.teams || [])) : [];
  const teams = teamsRaw.map((t: any) => ({
    id: String(t.id),
    name: t.name,
    members: t.member_count || 0,
    projects: t.project_count || 0,
  }));

  const seats = seatsResult.status === 'fulfilled' ? (seatsResult.value.data?.meta || seatsResult.value.data) : null;
  const rawBilling = billingResult.status === 'fulfilled' ? (billingResult.value.data?.meta || billingResult.value.data) : null;

  // Strip PII from billing data
  const billing = rawBilling ? { ...rawBilling } : null;
  if (billing) delete billing.shipping_address;

  const errors: string[] = [];
  if (teamsResult.status === 'rejected') errors.push(`teams: ${formatApiError(teamsResult.reason)}`);
  if (seatsResult.status === 'rejected') errors.push(`seats: ${formatApiError(seatsResult.reason)}`);
  if (billingResult.status === 'rejected') errors.push(`billing: ${formatApiError(billingResult.reason)}`);

  const overview: any = { teams, seats, billing };
  if (errors.length > 0) overview.errors = errors;
  return overview;
}

// -- open_comments --

export async function openComments(
  config: AuthConfig,
  params: { project_id: string },
) {
  const api = publicClient(config);
  const filesRes = await api.get(`/v1/projects/${params.project_id}/files`);
  const allFiles: any[] = filesRes.data?.files || [];
  const capped = allFiles.length > 20;
  const files = allFiles.slice(0, 20);

  const commentResults: any[] = [];
  for (const f of files) {
    try {
      const commentsRes = await api.get(`/v1/files/${f.key}/comments`);
      const comments = (commentsRes.data?.comments || [])
        .filter((c: any) => !c.resolved_at);
      commentResults.push({ file_key: f.key, file_name: f.name, comments });
    } catch (e: any) {
      commentResults.push({ file_key: f.key, file_name: f.name, comments: [], error: formatApiError(e) });
    }
  }

  const filesWithComments = commentResults
    .filter(f => f.comments.length > 0)
    .map(f => ({
      file_key: f.file_key,
      file_name: f.file_name,
      comments: f.comments.map((c: any) => ({
        id: c.id,
        author: c.user?.handle || c.user?.email || 'unknown',
        message: c.message,
        created_at: c.created_at,
      })),
    }));

  const totalUnresolved = filesWithComments.reduce((sum, f) => sum + f.comments.length, 0);

  const errors = commentResults
    .filter((f: any) => f.error)
    .map((f: any) => ({ file_key: f.file_key, file_name: f.file_name, error: f.error }));

  const result: any = {
    total_unresolved: totalUnresolved,
    files: filesWithComments,
  };
  if (errors.length > 0) {
    result.errors = errors;
  }
  if (capped) {
    result.note = `Project has ${allFiles.length} files; only the first 20 were checked.`;
  }

  return result;
}

// -- cleanup_stale_files --

const MAX_TRASH_BATCH = 25;

export async function cleanupStaleFiles(
  config: AuthConfig,
  params: { project_id: string; days_stale: number; dry_run: boolean },
) {
  const { project_id, days_stale, dry_run } = params;

  if (!dry_run && !hasCookie(config)) {
    throw new Error('Cookie auth required to trash files. Run with dry_run=true to preview, or configure cookie auth.');
  }

  let files: any[];

  if (hasPat(config)) {
    const res = await publicClient(config).get(`/v1/projects/${project_id}/files`);
    files = res.data?.files || [];
  } else {
    const res = await internalClient(config).get(
      `/api/folders/${project_id}/paginated_files`,
      { params: { folderId: project_id, sort_column: 'touched_at', sort_order: 'desc', page_size: 100, file_type: '' } },
    );
    const meta = res.data?.meta || res.data;
    files = meta?.files || meta || [];
  }

  const cutoff = Date.now() - days_stale * 86400000;
  const staleFiles = files.filter((f: any) => {
    const raw = f.last_modified || f.touched_at;
    if (!raw) return false;
    const modified = new Date(raw).getTime();
    return !isNaN(modified) && modified < cutoff;
  });

  const result: any = {
    stale_files: staleFiles.map((f: any) => ({
      key: f.key,
      name: f.name,
      last_modified: f.last_modified || f.touched_at,
    })),
    total_stale: staleFiles.length,
    dry_run,
    trashed: false,
  };

  if (!dry_run) {
    if (staleFiles.length > MAX_TRASH_BATCH) {
      throw new Error(
        `${staleFiles.length} stale files exceeds safety limit of ${MAX_TRASH_BATCH}. ` +
        `Run with dry_run=true to review, then trash in smaller batches using trash_files.`,
      );
    }
    if (staleFiles.length > 0) {
      await internalClient(config).delete('/api/files_batch', {
        data: { files: staleFiles.map((f: any) => ({ key: f.key })), trashed: true },
      });
      result.trashed = true;
      result.trashed_count = staleFiles.length;
      result.trashed_file_keys = staleFiles.map((f: any) => f.key);
    }
  }

  return result;
}

// -- organize_project --

export async function organizeProject(
  config: AuthConfig,
  params: { file_keys: string[]; target_project_id: string },
) {
  const payload = {
    files: params.file_keys.map(key => ({
      key,
      folder_id: params.target_project_id,
      is_multi_move: true,
      restore_files: false,
    })),
  };

  const res = await internalClient(config).put('/api/files_batch', payload);
  const data = res.data?.meta || res.data;
  const moved = Object.keys(data?.success || {}).length;
  const failed = Object.keys(data?.errors || {}).length;

  return {
    target_project_id: params.target_project_id,
    moved: moved || (failed === 0 ? params.file_keys.length : 0),
    moved_file_keys: params.file_keys,
    failed,
    errors: data?.errors || {},
  };
}

// -- setup_project_structure --

export async function setupProjectStructure(
  config: AuthConfig,
  params: { team_id: string; projects: Array<{ name: string; description?: string }> },
) {
  const api = internalClient(config);
  const created: any[] = [];
  const failed: any[] = [];

  for (const project of params.projects) {
    try {
      const createRes = await api.post('/api/folders', {
        team_id: params.team_id,
        path: project.name,
        sharing_audience_control: 'org_view',
        team_access: 'team_edit',
      });
      const meta = createRes.data?.meta;
      const p = Array.isArray(meta) ? meta[0] : (meta?.folder || meta || createRes.data);
      const folderId = p?.id != null ? String(p.id) : null;

      if (!folderId) {
        failed.push({ name: project.name, error: 'Could not extract project ID from response' });
        continue;
      }

      if (project.description) {
        await api.put(`/api/folders/${folderId}`, { description: project.description });
      }

      created.push({ id: folderId, name: project.name, description: project.description || null });
    } catch (e: any) {
      failed.push({ name: project.name, error: formatApiError(e) });
    }
  }

  return { created, failed };
}

// -- seat_optimization --

export async function seatOptimization(
  config: AuthConfig,
  params: { org_id?: string; days_inactive: number; include_cost: boolean },
) {
  const { days_inactive, include_cost } = params;
  const orgId = requireOrgId(config, params.org_id);
  const api = internalClient(config);
  const cutoff = Date.now() - days_inactive * 86400000;
  const paidKeys = new Set(['expert', 'developer', 'collaborator']);

  // Paginate org members (cursor-based)
  const allMembers: any[] = [];
  const warnings: string[] = [];
  let membersComplete = true;
  const MAX_PAGES = 200; // safety cap: 200 * 50 = 10,000 members
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      const params: Record<string, any> = { page_size: 50 };
      if (cursor) params.cursor = cursor;
      const res = await api.get(`/api/v2/orgs/${orgId}/org_users`, { params });
      const meta = res.data?.meta || {};
      const members = meta.users || [];
      if (!Array.isArray(members) || members.length === 0) break;
      allMembers.push(...members);
      cursor = Array.isArray(meta.cursor) ? meta.cursor[0] : meta.cursor;
      if (!cursor || members.length < 50) break;
    } catch (e: any) {
      membersComplete = false;
      warnings.push(`members: pagination stopped at page ${page + 1}, fetched ${allMembers.length} members (${formatApiError(e)})`);
      break;
    }
  }
  if (cursor && allMembers.length >= MAX_PAGES * 50) {
    membersComplete = false;
    warnings.push(`members: hit ${MAX_PAGES}-page safety cap at ${allMembers.length} members, org may have more`);
  }

  // Fetch seat breakdown and optionally contract rates in parallel
  const parallelCalls: Promise<any>[] = [
    api.get(`/api/orgs/${orgId}/org_users/filter_counts`),
  ];
  if (include_cost) {
    parallelCalls.push(
      api.get('/api/pricing/contract_rates', {
        params: { plan_parent_id: orgId, plan_type: 'organization' },
      }),
    );
  }

  const [seatsResult, ratesResult] = await Promise.allSettled(parallelCalls);
  const seats = seatsResult.status === 'fulfilled' ? (seatsResult.value.data?.meta || seatsResult.value.data) : null;

  // Build cost lookup: seat key -> monthly cents
  const costMap: Record<string, number> = {};
  if (include_cost && ratesResult?.status === 'fulfilled') {
    const prices = ratesResult.value.data?.meta?.product_prices || [];
    for (const p of prices) {
      if (paidKeys.has(p.billable_product_key)) {
        costMap[p.billable_product_key] = p.amount;
      }
    }
  }

  // Filter inactive paid members
  const inactiveUsers: any[] = [];
  let totalPaid = 0;

  for (const m of allMembers) {
    const seatKey = m.active_seat_type?.key;
    if (!seatKey || !paidKeys.has(seatKey)) continue;
    totalPaid++;

    const lastSeen = m.last_seen;
    const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : 0;
    const isInactive = !lastSeen || (lastSeenMs > 0 && lastSeenMs < cutoff) || isNaN(lastSeenMs);

    if (isInactive) {
      inactiveUsers.push({
        org_user_id: String(m.id),
        user_id: m.user_id,
        email: m.user?.email,
        name: m.user?.handle,
        seat_type: SEAT_KEY_MAP[seatKey] || seatKey,
        seat_key: seatKey,
        last_active: lastSeen || null,
        monthly_cost_cents: costMap[seatKey] || null,
      });
    }
  }

  const monthlyWasteCents = inactiveUsers.reduce(
    (sum, u) => sum + (u.monthly_cost_cents || 0), 0,
  );

  const recommendations: string[] = [];
  if (inactiveUsers.length > 0) {
    recommendations.push(
      `${inactiveUsers.length} paid seat(s) inactive for ${days_inactive}+ days. Review for downgrade to viewer.`,
    );
  }
  const neverActive = inactiveUsers.filter((u: any) => !u.last_active);
  if (neverActive.length > 0) {
    recommendations.push(
      `${neverActive.length} paid user(s) have never been active. Likely unused invites.`,
    );
  }
  if (monthlyWasteCents > 0) {
    recommendations.push(
      `Potential monthly savings: $${(monthlyWasteCents / 100).toFixed(2)} ($${((monthlyWasteCents * 12) / 100).toFixed(2)}/yr).`,
    );
  }

  const result: Record<string, any> = {
    summary: {
      total_paid: totalPaid,
      inactive_paid: inactiveUsers.length,
      monthly_waste_cents: monthlyWasteCents,
      annual_savings_cents: monthlyWasteCents * 12,
      members_complete: membersComplete,
    },
    seat_breakdown: seats,
    inactive_users: inactiveUsers,
    recommendations,
  };
  if (warnings.length > 0) result.warnings = warnings;
  return result;
}

// -- permission_audit --

export async function permissionAudit(
  config: AuthConfig,
  params: { scope_type: 'project' | 'team'; scope_id: string; flag_external: boolean; org_id?: string },
) {
  const { scope_type, scope_id, flag_external } = params;
  const api = internalClient(config);

  // Resolve org for domain lookup
  let orgId: string | undefined;
  let domainCheckSkipped = false;
  if (flag_external) {
    try { orgId = requireOrgId(config, params.org_id); } catch { domainCheckSkipped = true; }
  }

  // Fetch org verified domains for external detection
  let verifiedDomains: Set<string> = new Set();
  if (flag_external && orgId) {
    try {
      const domRes = await api.get(`/api/orgs/${orgId}/domains`);
      const domains = domRes.data?.meta || [];
      if (Array.isArray(domains)) {
        for (const d of domains) {
          if (d.domain) verifiedDomains.add(d.domain.toLowerCase());
        }
      }
    } catch { /* domain lookup optional, continue without */ }
  }

  // Collect file keys to scan
  let fileKeys: Array<{ key: string; name: string }> = [];

  if (scope_type === 'team') {
    // Fetch team projects, cap at 10
    const projectsRes = await api.get(`/api/teams/${scope_id}/folders`);
    const rows = projectsRes.data?.meta?.folder_rows || projectsRes.data || [];
    const projects = (Array.isArray(rows) ? rows : []).slice(0, 10);

    for (const proj of projects) {
      if (fileKeys.length >= 25) break;
      try {
        const filesRes = await api.get(`/api/folders/${proj.id}/paginated_files`, {
          params: { folderId: String(proj.id), page_size: 25, sort_column: 'touched_at', sort_order: 'desc', file_type: '' },
        });
        const meta = filesRes.data?.meta || filesRes.data;
        const files = meta?.files || meta || [];
        for (const f of (Array.isArray(files) ? files : [])) {
          if (fileKeys.length >= 25) break;
          fileKeys.push({ key: f.key, name: f.name });
        }
      } catch { /* skip inaccessible projects */ }
    }
  } else {
    // Project scope
    const filesRes = await api.get(`/api/folders/${scope_id}/paginated_files`, {
      params: { folderId: scope_id, page_size: 25, sort_column: 'touched_at', sort_order: 'desc', file_type: '' },
    });
    const meta = filesRes.data?.meta || filesRes.data;
    const files = meta?.files || meta || [];
    for (const f of (Array.isArray(files) ? files : [])) {
      if (fileKeys.length >= 25) break;
      fileKeys.push({ key: f.key, name: f.name });
    }
  }

  // Fetch permissions and file metadata in parallel, batched 5 at a time
  const allUsers = new Map<string, any>();
  const flags: Array<{ severity: string; type: string; details: string }> = [];
  let filesScanned = 0;

  for (let i = 0; i < fileKeys.length; i += 5) {
    const batch = fileKeys.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async (file) => {
        const [rolesRes, fileMetaRes] = await Promise.allSettled([
          api.get(`/api/roles/file/${file.key}`),
          api.get(`/api/files/${file.key}`),
        ]);

        const roles = rolesRes.status === 'fulfilled'
          ? (Array.isArray(rolesRes.value.data?.meta) ? rolesRes.value.data.meta : [])
          : [];
        const fileMeta = fileMetaRes.status === 'fulfilled'
          ? (fileMetaRes.value.data?.meta || fileMetaRes.value.data || {})
          : {};

        return { file, roles, fileMeta };
      }),
    );

    for (const r of results) {
      if (r.status === 'rejected') continue;
      filesScanned++;
      const { file, roles, fileMeta } = r.value;

      // Check link access
      const linkAccess = fileMeta.link_access;
      if (linkAccess === 'edit' || linkAccess === 'org_edit') {
        flags.push({
          severity: 'high',
          type: 'open_link_access',
          details: `${file.name} (${file.key}) has link_access="${linkAccess}"`,
        });
      }

      // Process roles
      for (const role of roles) {
        const email = role.user?.email || role.pending_email;
        const userId = role.user_id ? String(role.user_id) : email;
        const level = role.level;
        const roleName = level >= 999 ? 'owner' : level >= 300 ? 'editor' : 'viewer';

        if (userId && !allUsers.has(userId)) {
          allUsers.set(userId, {
            user_id: userId,
            email,
            name: role.user?.handle,
            files_accessed: [],
          });
        }

        if (userId) {
          const user = allUsers.get(userId)!;
          user.files_accessed.push({
            file_key: file.key,
            file_name: file.name,
            role: roleName,
          });
        }

        // External editor detection
        if (flag_external && email && verifiedDomains.size > 0) {
          const domain = email.split('@')[1]?.toLowerCase();
          if (domain && !verifiedDomains.has(domain) && (roleName === 'editor' || roleName === 'owner')) {
            flags.push({
              severity: 'high',
              type: 'external_editor',
              details: `${email} (external) has ${roleName} access to ${file.name} (${file.key})`,
            });
          }
        }
      }
    }
  }

  if (domainCheckSkipped) {
    flags.push({
      severity: 'info',
      type: 'domain_check_skipped',
      details: 'Could not resolve org ID; external user detection was skipped. Provide org_id or set FIGMA_ORG_ID.',
    });
  }

  return {
    scope: { type: scope_type, id: scope_id },
    summary: {
      unique_users: allUsers.size,
      files_scanned: filesScanned,
      total_files: fileKeys.length,
      flags_found: flags.length,
    },
    users: Array.from(allUsers.values()),
    flags,
  };
}

// -- branch_cleanup --

const MAX_ARCHIVE_BATCH = 25;

export async function branchCleanup(
  config: AuthConfig,
  params: { project_id: string; days_stale: number; dry_run: boolean },
) {
  const { project_id, days_stale, dry_run } = params;

  if (!dry_run && !hasCookie(config)) {
    throw new Error('Cookie auth required to archive branches. Run with dry_run=true to preview, or configure cookie auth.');
  }

  // Fetch project files
  const MAX_FILES = 20;
  let files: any[];
  if (hasPat(config)) {
    const res = await publicClient(config).get(`/v1/projects/${project_id}/files`);
    files = res.data?.files || [];
  } else {
    const res = await internalClient(config).get(
      `/api/folders/${project_id}/paginated_files`,
      { params: { folderId: project_id, sort_column: 'touched_at', sort_order: 'desc', page_size: MAX_FILES, file_type: '' } },
    );
    const meta = res.data?.meta || res.data;
    files = meta?.files || meta || [];
  }

  // Cap at 20 files
  const capped = files.length > 20;
  files = files.slice(0, 20);

  // Fetch branch data for each file in parallel
  const cutoff = Date.now() - days_stale * 86400000;
  const staleBranches: any[] = [];
  const activeBranches: any[] = [];
  let filesScanned = 0;
  let totalBranches = 0;

  const branchResults = await Promise.allSettled(
    files.map(async (file) => {
      let branches: any[];
      if (hasPat(config)) {
        const res = await publicClient(config).get(`/v1/files/${file.key}`, {
          params: { branch_data: 'true', depth: '0' },
        });
        branches = res.data?.branches || [];
      } else {
        const res = await internalClient(config).get(`/api/files/${file.key}`);
        const f = res.data?.meta || res.data;
        branches = f.branches || [];
      }
      return { file, branches };
    }),
  );

  for (const r of branchResults) {
    if (r.status === 'rejected') continue;
    filesScanned++;
    const { file, branches } = r.value;

    for (const branch of branches) {
      totalBranches++;
      const lastModified = branch.last_modified;
      const lastModifiedMs = lastModified ? new Date(lastModified).getTime() : 0;
      const isStale = !lastModified || (lastModifiedMs > 0 && lastModifiedMs < cutoff) || isNaN(lastModifiedMs);

      const entry = {
        branch_key: branch.key,
        branch_name: branch.name,
        parent_file_key: file.key,
        parent_file_name: file.name,
        last_modified: lastModified || null,
      };

      if (isStale) {
        staleBranches.push(entry);
      } else {
        activeBranches.push(entry);
      }
    }
  }

  let archived = false;

  if (!dry_run && staleBranches.length > 0) {
    if (staleBranches.length > MAX_ARCHIVE_BATCH) {
      throw new Error(
        `${staleBranches.length} stale branches exceeds safety limit of ${MAX_ARCHIVE_BATCH}. ` +
        `Run with dry_run=true to review, then archive in smaller batches using delete_branch.`,
      );
    }

    await internalClient(config).delete('/api/files_batch', {
      data: {
        files: staleBranches.map(b => ({ key: b.branch_key })),
        trashed: true,
      },
    });
    archived = true;
  }

  const archived_count = archived ? staleBranches.length : 0;

  const recommendations: string[] = [];
  if (staleBranches.length > 0) {
    recommendations.push(
      `${staleBranches.length} branch(es) stale for ${days_stale}+ days. ${dry_run ? 'Set dry_run=false to archive.' : 'Archived.'}`,
    );
  }
  if (capped) {
    recommendations.push(`Project has more than 20 files; only the first 20 were scanned.`);
  }
  if (staleBranches.length === 0 && activeBranches.length === 0) {
    recommendations.push('No branches found in scanned files.');
  }

  return {
    project_id,
    summary: {
      files_scanned: filesScanned,
      total_branches: totalBranches,
      stale: staleBranches.length,
      active: activeBranches.length,
    },
    stale_branches: staleBranches,
    active_branches: activeBranches,
    dry_run,
    archived,
    archived_count,
    recommendations,
  };
}
