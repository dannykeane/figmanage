import { hasCookie, hasPat, loadAuthConfig, type AuthConfig } from './client.js';
import { checkAuth } from './health.js';

/** Read-only diagnostics. Never extracts browser credentials or changes configuration. */
export async function setupStatus(config: AuthConfig = loadAuthConfig()) {
  const status = await checkAuth(config);
  const environment = !!(process.env.FIGMA_PAT || (process.env.FIGMA_AUTH_COOKIE && process.env.FIGMA_USER_ID));
  const configured = { pat: hasPat(config), cookie: hasCookie(config) };
  const identityMatch = status.pat.valid && status.cookie.valid && status.pat.user_id && status.cookie.user_id
    ? status.pat.user_id === status.cookie.user_id : null;
  const nextActions: Array<{ action: string; needed_for: string; requires_user_action: boolean; message: string }> = [];
  if (identityMatch === false) {
    nextActions.push({ action: 'choose_account', needed_for: 'combined_workflows', requires_user_action: true,
      message: 'The PAT and browser session belong to different accounts. Choose the intended account before combining tools.' });
  }
  for (const credential of ['cookie', 'pat'] as const) {
    if (status[credential].valid) continue;
    const neededFor = credential === 'cookie' ? 'workspace_api' : 'public_api';
    if (environment) {
      nextActions.push({ action: 'update_environment', needed_for: neededFor, requires_user_action: true,
        message: 'Environment credentials take precedence. Update the MCP or shell environment, or remove its credential variables to use saved login. Restart the MCP connection after changing environment variables.' });
    } else if (status[credential].reason === 'check_failed') {
      nextActions.push({ action: 'retry_check', needed_for: neededFor, requires_user_action: false,
        message: 'The identity check failed. Check connectivity and retry before changing credentials.' });
    } else if (status[credential].reason === 'permission_denied') {
      nextActions.push({ action: 'check_access', needed_for: neededFor, requires_user_action: true,
        message: status[credential].error! });
    } else if (credential === 'cookie') {
      nextActions.push({ action: 'connect_browser', needed_for: neededFor, requires_user_action: true,
        message: `For workspace management, log into Figma in Chrome and allow browser-session access. Then run figmanage login${config.userId ? ' --refresh' : ''} or call setup_extract_cookies if available. macOS may request Keychain access. Reuse permission already granted in this session.` });
    } else {
      nextActions.push({ action: 'connect_pat', needed_for: neededFor, requires_user_action: true,
        message: 'For public API tools, create a PAT in Figma settings with the scopes needed for the task, including current_user:read for identity checks and folders:read for folder browsing. Enter it locally with figmanage login --pat-only; avoid pasting tokens into chat.' });
    }
  }
  return {
    status,
    configured,
    ready: identityMatch !== false && (status.pat.valid || status.cookie.valid),
    credential_source: environment ? 'environment' : configured.pat || configured.cookie ? 'config' : 'none',
    org_id: config.orgId || null,
    identity_match: identityMatch,
    capabilities: { public_api: status.pat.valid, workspace_api: status.cookie.valid, resource_permissions: 'not_checked', operation_scopes: 'not_checked' },
    next_actions: nextActions,
    guidance: 'Use an available credential for the requested task. Only complete the setup steps needed for that task. Authentication does not establish every resource permission or API scope.',
  };
}
