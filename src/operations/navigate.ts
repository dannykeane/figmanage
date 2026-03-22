import type { AuthConfig, OrgEntry } from '../auth/client.js';
import { hasCookie, hasPat } from '../auth/client.js';
import { publicClient } from '../clients/public-api.js';
import { internalClient } from '../clients/internal-api.js';
import { checkAuth, formatAuthStatus } from '../auth/health.js';
import type { AuthStatus } from '../types/figma.js';

export interface AuthCheckResult {
  status: AuthStatus;
  formatted: string;
}

export interface OrgListEntry {
  id: string;
  name: string;
  active: boolean;
}

export interface SwitchOrgResult {
  previous: string;
  current: { id: string; name: string };
}

export interface Team {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface FileEntry {
  key: string;
  name: string;
  last_modified?: string;
  thumbnail_url?: string;
  editor_type?: string;
}

export interface FileListResult {
  files: FileEntry[];
  pagination?: {
    has_more: boolean;
    hint: string;
  };
}

export interface RecentFile {
  key: string;
  name: string;
  team_id?: string;
  folder_id?: string;
  editor_type?: string;
  last_touched?: string;
  url: string;
}

export interface SearchResult {
  key: string;
  name: string;
  editor_type?: string;
  team_id?: string;
  folder_id?: string;
  last_modified?: string;
  url: string;
}

export interface FileInfo {
  key: string;
  name: string;
  last_modified?: string;
  updated_at?: string;
  editor_type?: string;
  folder_id?: string;
  team_id?: string;
  link_access?: string;
  url: string;
}

export interface Favorite {
  key: string;
  name: string;
  type?: string;
}

function requireOrgId(config: AuthConfig, explicit?: string): string {
  const id = explicit || config.orgId;
  if (!id) throw new Error('Org context required. Run list_orgs to see available workspaces, or set FIGMA_ORG_ID.');
  if (!/^[\w.:-]+$/.test(id)) throw new Error('Invalid org ID format');
  return id;
}

/**
 * Check if the current user is an org admin.
 * Returns false on any error (no org, 403, network) -- safe default.
 */
export async function checkIsAdmin(config: AuthConfig): Promise<boolean> {
  const orgId = config.orgId || process.env.FIGMA_ORG_ID;
  if (!orgId || !config.cookie) return false;
  try {
    const res = await internalClient(config).get(
      `/api/orgs/${orgId}/admins`,
      { params: { include_license_admins: false } },
    );
    const admins: Array<{ user_id?: string; user?: { id: string } }> = res.data?.meta?.admins || res.data?.meta || [];
    return admins.some(a => (a.user_id || a.user?.id) === config.userId);
  } catch {
    return false;
  }
}

export async function checkAuthStatus(config: AuthConfig): Promise<AuthCheckResult> {
  const status = await checkAuth(config);
  if (config.isAdmin === undefined && config.cookie) {
    config.isAdmin = await checkIsAdmin(config);
  }
  const formatted = formatAuthStatus(status, config);
  return { status, formatted };
}

export async function listOrgs(config: AuthConfig): Promise<OrgListEntry[]> {
  const api = internalClient(config);
  const res = await api.get('/api/user/state');
  let orgs: OrgEntry[] = (res.data?.meta?.orgs || [])
    .filter((o: any) => o && o.id)
    .map((o: any) => ({ id: String(o.id), name: o.name || String(o.id) }));

  // Fallback: meta.orgs is empty for non-admin users.
  // Extract unique org_ids from meta.roles instead.
  if (orgs.length === 0) {
    const roles: any[] = res.data?.meta?.roles || [];
    const orgIds = [...new Set(
      roles
        .map((r: any) => r.org_id)
        .filter((id: any) => id != null)
        .map(String)
    )];

    // Also include config.orgId if not already covered
    if (config.orgId && !orgIds.includes(config.orgId)) {
      orgIds.push(config.orgId);
    }

    // Resolve names via domain lookup
    orgs = await Promise.all(
      orgIds.map(async (id) => {
        let name = id;
        try {
          const domRes = await api.get(`/api/orgs/${id}/domains`);
          const domains = domRes.data?.meta || [];
          if (Array.isArray(domains) && domains.length > 0) {
            name = domains[0].domain || id;
          }
        } catch { /* domain lookup optional */ }
        return { id, name };
      })
    );
  }

  // Merge with any existing registry entries (preserves names from setup)
  if (config.orgs && config.orgs.length > 0) {
    for (const existing of config.orgs) {
      if (!orgs.find(o => o.id === existing.id)) {
        orgs.push(existing);
      } else {
        // Prefer stored name over ID-only fallback
        const entry = orgs.find(o => o.id === existing.id)!;
        if (entry.name === entry.id && existing.name !== existing.id) {
          entry.name = existing.name;
        }
      }
    }
  }

  if (orgs.length === 0) return [];

  return orgs.map(o => ({
    id: o.id,
    name: o.name,
    active: o.id === config.orgId,
  }));
}

export async function switchOrg(
  config: AuthConfig,
  params: { org: string },
): Promise<SwitchOrgResult> {
  // Ensure we have an org list
  if (!config.orgs || config.orgs.length === 0) {
    const res = await internalClient(config).get('/api/user/state');
    const orgs: OrgEntry[] = (res.data?.meta?.orgs || []).map((o: any) => ({
      id: String(o.id),
      name: o.name,
    }));
    if (orgs.length > 0) config.orgs = orgs;
  }

  if (!config.orgs || config.orgs.length === 0) {
    throw new Error('No workspaces found. You may be on a free/starter plan.');
  }

  // Try exact ID match first
  let match = config.orgs.find(o => o.id === params.org);

  // Then case-insensitive substring match on name
  if (!match) {
    const lower = params.org.toLowerCase();
    const matches = config.orgs.filter(o => o.name.toLowerCase().includes(lower));
    if (matches.length === 1) {
      match = matches[0];
    } else if (matches.length > 1) {
      const names = matches.map(o => `${o.name} (${o.id})`).join(', ');
      throw new Error(`Ambiguous: "${params.org}" matches multiple workspaces: ${names}. Be more specific or use the org ID.`);
    }
  }

  if (!match) {
    const available = config.orgs.map(o => `${o.name} (${o.id})`).join(', ');
    throw new Error(`No workspace matching "${params.org}". Available: ${available}`);
  }

  const previousId = config.orgId;
  const previousOrg = config.orgs.find(o => o.id === previousId);
  const previousLabel = previousOrg ? `${previousOrg.name} (${previousId})` : (previousId || 'none');

  return {
    previous: previousLabel,
    current: { id: match.id, name: match.name },
  };
}

export async function listTeams(config: AuthConfig): Promise<Team[]> {
  if (config.orgId) {
    const res = await internalClient(config).get(`/api/orgs/${config.orgId}/teams`);
    const data = res.data?.meta || res.data;
    return (data.teams || (Array.isArray(data) ? data : [])).map((t: any) => ({
      id: String(t.id),
      name: t.name,
    }));
  }
  // Fallback: get teams from user/state
  const res = await internalClient(config).get('/api/user/state');
  return (res.data?.meta?.teams || []).map((t: any) => ({
    id: String(t.id),
    name: t.name,
  }));
}

export async function listProjects(
  config: AuthConfig,
  params: { team_id: string },
): Promise<Project[]> {
  if (hasCookie(config)) {
    const res = await internalClient(config).get(`/api/teams/${params.team_id}/folders`);
    const rows = res.data?.meta?.folder_rows || res.data || [];
    return (Array.isArray(rows) ? rows : []).map((p: any) => ({
      id: String(p.id),
      name: p.name || p.path,
    }));
  } else {
    const res = await publicClient(config).get(`/v1/teams/${params.team_id}/projects`);
    return (res.data.projects || []).map((p: any) => ({
      id: String(p.id),
      name: p.name,
    }));
  }
}

export async function listFiles(
  config: AuthConfig,
  params: { project_id: string; page_size?: number; page_token?: string },
): Promise<FileListResult> {
  // Prefer public API when PAT available -- returns keys compatible
  // with all public endpoints (versions, comments, export).
  if (hasPat(config)) {
    const res = await publicClient(config).get(`/v1/projects/${params.project_id}/files`);
    const files = (res.data.files || []).map((f: any) => ({
      key: f.key,
      name: f.name,
      last_modified: f.last_modified,
      thumbnail_url: f.thumbnail_url,
    }));
    return { files };
  } else {
    const pageSize = Math.min(params.page_size || 25, 100);
    const urlParams = new URLSearchParams({
      folderId: params.project_id,
      sort_column: 'touched_at',
      sort_order: 'desc',
      page_size: String(pageSize),
      file_type: '',
    });
    if (params.page_token) urlParams.set('before', params.page_token);

    const res = await internalClient(config).get(
      `/api/folders/${params.project_id}/paginated_files?${urlParams}`,
    );
    const meta = res.data?.meta || res.data;
    const files = (meta.files || meta.results || []).map((f: any) => ({
      key: f.key,
      name: f.name,
      last_modified: f.touched_at || f.updated_at || f.last_modified,
      editor_type: f.editor_type,
    }));

    const pagination = res.data?.pagination;
    const result: FileListResult = { files };
    if (pagination?.next_page || files.length === pageSize) {
      result.pagination = {
        has_more: true,
        hint: `To get the next page, call list_files again with page_token="${pagination?.next_page || files[files.length - 1]?.last_modified || ''}"`,
      };
    }
    return result;
  }
}

export async function listRecentFiles(config: AuthConfig): Promise<RecentFile[]> {
  const res = await internalClient(config).get('/api/recent_files');
  return (res.data?.meta?.recent_files || []).map((f: any) => ({
    key: f.key,
    name: f.name,
    team_id: f.team_id,
    folder_id: f.folder_id,
    editor_type: f.editor_type,
    last_touched: f.touched_at,
    url: f.url || `https://www.figma.com/design/${f.key}`,
  }));
}

export async function search(
  config: AuthConfig,
  params: { query: string; sort?: string; org_id?: string },
): Promise<SearchResult[]> {
  const orgId = requireOrgId(config, params.org_id);

  const apiParams: Record<string, string> = {
    query: params.query,
    sort: params.sort || 'relevancy',
    desc: 'true',
    is_global: 'true',
    org_id: orgId,
    current_org_id: orgId,
    plan_type: 'org',
  };

  const res = await internalClient(config).get('/api/search/file_browser_preview', { params: apiParams });
  const meta = res.data?.meta;
  const categories = Array.isArray(meta) ? meta : [];
  const fileCategory = categories.find((c: any) => c.search_model_type === 'files') || categories[0];
  const rawResults = fileCategory?.results || [];

  return rawResults.map((r: any) => {
    const m = r.model || r;
    return {
      key: m.key,
      name: m.name,
      editor_type: m.editor_type,
      team_id: m.team_id ? String(m.team_id) : undefined,
      folder_id: m.folder_id ? String(m.folder_id) : undefined,
      last_modified: m.touched_at,
      url: m.url || `https://www.figma.com/design/${m.key}`,
    };
  });
}

export async function getFileInfo(
  config: AuthConfig,
  params: { file_key: string },
): Promise<FileInfo> {
  if (hasPat(config)) {
    const res = await publicClient(config).get(`/v1/files/${params.file_key}/meta`);
    const f = res.data.file || res.data;
    return {
      key: f.key || params.file_key,
      name: f.name,
      last_modified: f.lastModified || f.last_modified,
      editor_type: f.editorType || f.editor_type,
      url: `https://www.figma.com/design/${params.file_key}`,
    };
  } else {
    const res = await internalClient(config).get(`/api/files/${params.file_key}`);
    const f = res.data?.meta || res.data;
    return {
      key: f.key || params.file_key,
      name: f.name,
      updated_at: f.updated_at,
      editor_type: f.editor_type,
      folder_id: f.folder_id ? String(f.folder_id) : undefined,
      team_id: f.team_id ? String(f.team_id) : undefined,
      link_access: f.link_access,
      url: f.url || `https://www.figma.com/design/${params.file_key}`,
    };
  }
}

export async function listFavorites(config: AuthConfig): Promise<Favorite[]> {
  const res = await internalClient(config).get('/api/user/favorited_resources');
  const data = res.data?.meta || res.data;
  return (Array.isArray(data) ? data : data.favorites || data.resources || []).map((f: any) => ({
    key: f.key || f.file_key || f.id,
    name: f.name,
    type: f.resource_type || f.type,
  }));
}
