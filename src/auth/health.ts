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
      status.pat = { valid: true, user: res.data.handle || res.data.email };
    } catch (e: any) {
      status.pat = {
        valid: false,
        error: e.response?.status === 403
          ? 'PAT invalid or expired. Generate a new one at figma.com/developers'
          : `PAT check failed: ${e.message}`,
      };
    }
  } else {
    status.pat = { valid: false, error: 'No PAT configured (env or Keychain)' };
  }

  if (config.cookie && config.userId) {
    try {
      const res = await internalClient(config).get('/api/user/state');
      const user = res.data?.user;
      status.cookie = { valid: true, user: user?.handle || user?.email || 'authenticated' };

      // Populate org registry from user/state response
      const orgs = (res.data?.meta?.orgs || []).map((o: any) => ({
        id: String(o.id),
        name: o.name,
      }));
      if (orgs.length > 0) config.orgs = orgs;
    } catch (e: any) {
      const code = e.response?.status;
      if (code === 401 || code === 403) {
        status.cookie = {
          valid: false,
          error: 'Session cookie expired. Extract a new one from browser DevTools: Application > Cookies > __Host-figma.authn',
        };
      } else {
        status.cookie = { valid: false, error: `Cookie check failed: ${e.message}` };
      }
    }
  } else {
    const missing = [];
    if (!config.cookie) missing.push('FIGMA_AUTH_COOKIE');
    if (!config.userId) missing.push('FIGMA_USER_ID');
    status.cookie = { valid: false, error: `${missing.join(', ')} not set` };
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
