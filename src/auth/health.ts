import type { AuthConfig } from './client.js';
import type { AuthStatus } from '../types/figma.js';
import { publicClient } from '../clients/public-api.js';
import { internalClient } from '../clients/internal-api.js';

export async function checkAuth(config: AuthConfig): Promise<AuthStatus> {
  const status: AuthStatus = {
    pat: { valid: false },
    cookie: { valid: false },
  };

  if (config.pat) {
    try {
      const res = await publicClient(config).get('/v1/me');
      status.pat = { valid: true, user: res.data.handle || res.data.email, user_id: res.data.id == null ? undefined : String(res.data.id) };
    } catch (e: any) {
      status.pat = {
        valid: false,
        reason: e.response?.status === 401 ? 'expired' : e.response?.status === 403 ? 'permission_denied' : 'check_failed',
        error: e.response?.status === 403
          ? 'Figma rejected the PAT identity check. Check token validity and the current_user:read scope in Figma settings.'
          : `PAT check failed: ${e.message}`,
      };
    }
  } else {
    status.pat = { valid: false, reason: 'missing', error: 'No PAT configured. A PAT is optional for browser-session workspace tools.' };
  }

  if (config.cookie && config.userId) {
    try {
      const res = await internalClient(config).get('/api/user/state');
      if (res.data?.error === true) throw new Error('Figma rejected the session check.');
      const user = res.data?.meta?.user || res.data?.user;
      status.cookie = { valid: true, user: user?.handle || user?.email || 'authenticated', user_id: String(user?.id || config.userId) };

      // Populate org registry from user/state response
      const orgs = (res.data?.meta?.orgs || []).map((o: any) => ({
        id: String(o.id),
        name: o.name,
      }));
      if (orgs.length > 0) config.orgs = orgs;
    } catch (e: any) {
      const code = e.response?.status;
      if (code === 401) {
        status.cookie = {
          valid: false,
          reason: 'expired',
          error: 'Figma session expired. Log into Figma in Chrome, then run figmanage login --refresh or use the MCP setup tools.',
        };
      } else {
        status.cookie = { valid: false, reason: code === 403 ? 'permission_denied' : 'check_failed', error: code === 403 ? 'Figma denied this session check. Verify account access; this does not establish that the session expired.' : `Cookie check failed: ${e.message}` };
      }
    }
  } else {
    const missing = [];
    if (!config.cookie) missing.push('FIGMA_AUTH_COOKIE');
    if (!config.userId) missing.push('FIGMA_USER_ID');
    status.cookie = { valid: false, reason: 'missing', error: `${missing.join(', ')} not set. Browser access is optional for PAT tools.` };
  }

  return status;
}

export function formatAuthStatus(status: AuthStatus, config?: AuthConfig): string {
  const lines = [];
  lines.push(`PAT: ${status.pat.valid ? `valid (${status.pat.user})` : status.pat.error}`);
  lines.push(`Session: ${status.cookie.valid ? `valid (${status.cookie.user})` : status.cookie.error}`);

  if (!status.pat.valid && !status.cookie.valid) {
    lines.push('\nNo valid auth. Set FIGMA_PAT for public API access or FIGMA_AUTH_COOKIE + FIGMA_USER_ID for full access.');
  } else if (!status.cookie.valid) {
    lines.push('\nPublic API only. Internal API tools (file CRUD, team management) unavailable.');
  }

  // Org context
  if (config) {
    if (config.orgId) {
      const currentOrg = config.orgs?.find(o => o.id === config.orgId);
      const orgLabel = currentOrg ? `${currentOrg.name} (${config.orgId})` : config.orgId;
      const role = config.isAdmin ? 'admin' : 'member';
      lines.push(`\nWorkspace: ${orgLabel} (${role})`);
      const others = (config.orgs || []).filter(o => o.id !== config.orgId);
      if (others.length > 0) {
        lines.push(`Other workspaces: ${others.map(o => `${o.name} (${o.id})`).join(', ')}`);
        lines.push('Use switch_org to change workspace.');
      }
    } else if (config.orgs && config.orgs.length > 0) {
      lines.push(`\nWorkspaces available: ${config.orgs.map(o => `${o.name} (${o.id})`).join(', ')}`);
      lines.push('Use switch_org to select a workspace.');
    } else {
      lines.push('\nWorkspace: not configured');
    }
  }

  return lines.join('\n');
}
