import { getActiveWorkspace } from '../config.js';

export interface OrgEntry {
  id: string;
  name: string;
}

export interface AuthConfig {
  pat?: string;
  cookie?: string;
  userId?: string;
  orgId?: string;
  orgs?: OrgEntry[];
  isAdmin?: boolean;
}

function parseOrgs(raw?: string): OrgEntry[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter((o: any) => o.id && o.name);
  } catch {
    return undefined;
  }
}

/**
 * Load auth from environment variables. This is the original path --
 * env vars set by MCP client config or shell.
 */
export function loadFromEnv(): AuthConfig {
  return {
    pat: process.env.FIGMA_PAT,
    cookie: process.env.FIGMA_AUTH_COOKIE,
    userId: process.env.FIGMA_USER_ID,
    orgId: process.env.FIGMA_ORG_ID,
    orgs: parseOrgs(process.env.FIGMA_ORGS),
  };
}

/**
 * Load auth from the config file's active workspace.
 * Returns null if no config file or active workspace found.
 */
export function loadFromConfigFile(): AuthConfig | null {
  const workspace = getActiveWorkspace();
  if (!workspace) return null;

  // Only return if the workspace has usable credentials
  const hasCreds = workspace.pat || (workspace.cookie && workspace.user_id);
  if (!hasCreds) return null;

  return {
    pat: workspace.pat,
    cookie: workspace.cookie,
    userId: workspace.user_id,
    orgId: workspace.org_id,
  };
}

/**
 * Load auth config with fallback chain:
 * 1. Environment variables (backwards compatible)
 * 2. Config file (~/.config/figmanage/config.json)
 * 3. Empty config (caller decides what to do)
 */
export function loadAuthConfig(): AuthConfig {
  // Env vars take precedence -- backwards compatible
  const envConfig = loadFromEnv();
  if (envConfig.pat || (envConfig.cookie && envConfig.userId)) {
    return envConfig;
  }

  // Fall back to config file
  const fileConfig = loadFromConfigFile();
  if (fileConfig) return fileConfig;

  // Return env config as-is (empty or partial)
  return envConfig;
}

export function hasPat(config: AuthConfig): boolean {
  return !!config.pat;
}

export function hasCookie(config: AuthConfig): boolean {
  return !!config.cookie && !!config.userId;
}
