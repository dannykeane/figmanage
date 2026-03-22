import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface WorkspaceConfig {
  cookie?: string;
  user_id?: string;
  org_id?: string;
  pat?: string;
  cookie_extracted_at?: string; // ISO timestamp
}

export interface FigmanageConfig {
  workspaces: Record<string, WorkspaceConfig>;
  active_workspace: string;
}

export function getConfigDir(): string {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return join(process.env.APPDATA, 'figmanage');
  }
  return join(homedir(), '.config', 'figmanage');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

/**
 * Read and parse the config file. Returns null if not found or malformed.
 */
export function readConfig(): FigmanageConfig | null {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return null;

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

    // Basic shape validation
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.workspaces !== 'object' ||
      parsed.workspaces === null ||
      typeof parsed.active_workspace !== 'string'
    ) {
      return null;
    }

    return parsed as FigmanageConfig;
  } catch {
    return null;
  }
}

/**
 * Write config to disk with restricted permissions (0o600).
 * Creates the config directory if it doesn't exist.
 */
export function writeConfig(config: FigmanageConfig): void {
  const configDir = getConfigDir();
  mkdirSync(configDir, { recursive: true, mode: 0o700 });

  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  // Ensure permissions even if file pre-existed with broader mode
  if (process.platform !== 'win32') {
    chmodSync(configPath, 0o600);
  }
}

/**
 * Return the active workspace entry, or null if no config or workspace found.
 */
export function getActiveWorkspace(): WorkspaceConfig | null {
  const config = readConfig();
  if (!config) return null;

  const workspace = config.workspaces[config.active_workspace];
  return workspace ?? null;
}

/**
 * Set or update a workspace entry and make it active. Merges with existing config.
 */
export function setActiveWorkspace(name: string, workspace: WorkspaceConfig): void {
  const existing = readConfig() ?? { workspaces: {}, active_workspace: name };
  existing.workspaces[name] = workspace;
  existing.active_workspace = name;
  writeConfig(existing);
}

/**
 * Delete the config file. No-op if it doesn't exist.
 */
export function deleteConfig(): void {
  const configPath = getConfigPath();
  try {
    unlinkSync(configPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}
