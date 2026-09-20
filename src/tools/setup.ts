import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadAuthConfig, type AuthConfig } from '../auth/client.js';
import { extractCookies, resolveAccountInfo, validatePatIdentity, validateSession, type FigmaAccount } from '../auth/cookie.js';
import { setupStatus } from '../auth/setup-status.js';
import { getActiveWorkspace, readConfig, setActiveWorkspace } from '../config.js';
import { formatApiError } from '../helpers.js';
import { toolError, toolResult } from './register.js';

const outputSchema = { result: z.unknown().optional(), error: z.object({ code: z.string(), message: z.string() }).optional() };
const writeAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

export function registerSetupTools(
  server: McpServer,
  onSetupComplete: () => Promise<void>,
  options: { readOnly?: boolean; getConfig?: () => AuthConfig; refreshCapabilities?: () => Promise<void> } = {},
): void {
  let pendingAccounts: FigmaAccount[] = [];
  const environmentAuthMessage = () => process.env.FIGMA_PAT || (process.env.FIGMA_AUTH_COOKIE && process.env.FIGMA_USER_ID)
    ? 'Environment credentials are active. Update them or remove their variables to use stored setup. Saved and environment credentials are not combined.'
    : undefined;

  server.registerTool('setup_status', {
    description: 'Check live authentication, retry admin access detection, and get structured next actions. Use before setup, after an authentication error, or when expected tools are missing. Does not read browser credentials or change settings.',
    outputSchema, annotations: { readOnlyHint: true, openWorldHint: true },
  }, async () => {
    await options.refreshCapabilities?.();
    const result = await setupStatus(options.getConfig?.() ?? loadAuthConfig());
    if (options.readOnly) result.guidance += ' Setup changes are disabled on this read-only connection. Use local CLI login and reconnect MCP to load saved credentials.';
    return toolResult(JSON.stringify(result, null, 2), result);
  });

  if (options.readOnly) return;

  server.registerTool('setup_extract_cookies', {
    description: 'Read Figma sessions from Chrome for setup or recovery. Requires permission to read browser credentials; reuse permission already granted in this conversation. The user must be logged into Figma. macOS may show a Keychain prompt. Never returns cookies.',
    outputSchema, annotations: writeAnnotations,
  }, async () => {
    try {
      const environmentMessage = environmentAuthMessage();
      if (environmentMessage) throw new Error(environmentMessage);
      pendingAccounts = [];
      const accounts = extractCookies();
      if (!accounts.length) return toolError('No Figma sessions found in Chrome. Log into figma.com in Chrome, then try again.');
      const infos = await Promise.all(accounts.map(resolveAccountInfo));
      pendingAccounts = accounts;
      const existing = getActiveWorkspace();
      let currentUser = existing?.user_id;
      if (!currentUser && existing?.pat) {
        try { currentUser = (await validatePatIdentity(existing.pat)).id; }
        catch { /* Leave account choice explicit when the saved identity cannot be checked. */ }
      }
      const matching = accounts.map((account, index) => ({ account, index })).filter(({ account }) => account.userId === currentUser);
      const recommended = matching.length === 1 ? matching[0].index + 1 : !currentUser && !existing?.pat && accounts.length === 1 ? 1 : null;
      const result = {
        accounts: accounts.map((account, index) => ({ account_index: index + 1, user_id: account.userId, label: infos[index].figmaEmail || `User ${account.userId}`, chrome_profile: infos[index].profileName })),
        recommended_account_index: recommended,
        next_action: 'setup_select_account',
        requires_user_action: recommended === null,
      };
      return toolResult(recommended
        ? `Use setup_select_account with account_index ${recommended}. This is the current account or the only account on first setup.`
        : 'Ask which Figma account to use, then call setup_select_account with its account_index.', result);
    } catch (error) { return toolError(`Cookie extraction failed: ${formatApiError(error)}`); }
  });

  server.registerTool('setup_select_account', {
    description: 'Validate and save a browser session after setup_extract_cookies. Use its recommended account without another question; ask when selection is ambiguous or changes the existing account. Preserves the PAT for the same account.',
    inputSchema: { account_index: z.number().int().min(1).describe('Account number returned by setup_extract_cookies') },
    outputSchema, annotations: writeAnnotations,
  }, async ({ account_index }) => {
    const account = pendingAccounts[account_index - 1];
    if (!account) return toolError('No matching account. Call setup_extract_cookies, then select one of its account numbers.');
    try {
      const environmentMessage = environmentAuthMessage();
      if (environmentMessage) throw new Error(environmentMessage);
      const session = await validateSession(account.cookieValue, account.userId);
      const saved = readConfig();
      const existing = getActiveWorkspace();
      let sameAccount = existing?.user_id === account.userId;
      if (existing?.pat && !existing.user_id) {
        const identity = await validatePatIdentity(existing.pat);
        if (!identity.id) throw new Error('Could not verify the saved PAT account. Stored credentials were preserved.');
        sameAccount = identity.id === account.userId;
      }
      const orgId = sameAccount && session.orgs.some(org => org.id === existing?.org_id)
        ? existing?.org_id : session.orgId || session.orgs[0]?.id;
      const workspaceName = sameAccount && saved ? saved.active_workspace : `${orgId || 'default'}:${account.userId}`;
      setActiveWorkspace(workspaceName, {
        ...(sameAccount ? existing : {}), cookie: account.cookieValue, user_id: account.userId,
        org_id: orgId || undefined, cookie_extracted_at: new Date().toISOString(),
      });
      await onSetupComplete();
      const result = { user_id: account.userId, org_id: orgId || null, pat_preserved: !!(sameAccount && existing?.pat), next_action: 'setup_status' };
      return toolResult('Browser session saved. Workspace tools are available within your permissions. A PAT is optional for additional public API tools. Call setup_status to verify.', result);
    } catch (error) { return toolError(`Session setup failed: ${formatApiError(error)}`); }
  });

  server.registerTool('setup_save_pat', {
    description: 'Validate and save a PAT already supplied by the user. Prefer local figmanage login --pat-only to keep tokens out of chat. Rejects a PAT belonging to a different saved browser account.',
    inputSchema: { pat: z.string().min(1).describe('Figma Personal Access Token') },
    outputSchema, annotations: writeAnnotations,
  }, async ({ pat }) => {
    try {
      const environmentMessage = environmentAuthMessage();
      if (environmentMessage) throw new Error(environmentMessage);
      const identity = await validatePatIdentity(pat);
      const workspace = getActiveWorkspace() || {};
      if (workspace.cookie && workspace.user_id && identity.id !== workspace.user_id) {
        throw new Error('PAT account does not match the saved browser account, or its identity could not be verified. Stored credentials were preserved.');
      }
      const workspaceName = readConfig()?.active_workspace || workspace.org_id || workspace.user_id || 'default';
      setActiveWorkspace(workspaceName, { ...workspace, pat });
      pendingAccounts = [];
      await onSetupComplete();
      return toolResult(`PAT valid (${identity.user}). Use tools supported by its scopes and your workspace permissions.`, { user: identity.user, next_action: 'setup_status' });
    } catch (error) { return toolError(`PAT setup failed: ${formatApiError(error)}`); }
  });
}
