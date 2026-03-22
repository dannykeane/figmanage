/**
 * Interactive setup tools for first-run MCP configuration.
 *
 * Guides the user through cookie extraction and PAT creation
 * via conversational tool calls. Registered when auth is missing;
 * replaced by the full toolset once setup completes.
 */

import { platform } from 'node:os';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  extractCookies,
  validateSession,
  validatePat,
  resolveAccountInfo,
  type FigmaAccount,
} from '../auth/cookie.js';
import { setActiveWorkspace, getActiveWorkspace } from '../config.js';
import { loadAuthConfig, hasPat, hasCookie } from '../auth/client.js';

// State shared across setup steps within a single session
let pendingAccounts: FigmaAccount[] = [];

export function registerSetupTools(
  server: McpServer,
  onSetupComplete: () => void,
): void {

  server.tool(
    'setup_status',
    'Check figmanage authentication status and get setup instructions. Always call this before using any other tool.',
    {},
    async () => {
      const config = loadAuthConfig();

      if (hasPat(config) && hasCookie(config)) {
        return { content: [{ type: 'text', text: 'figmanage is fully configured. All tools are available.' }] };
      }

      const os = platform();
      const lines: string[] = [
        'figmanage needs two credentials to give you full access to all 85 Figma workspace tools:',
        '',
        '1. Browser cookie -- extracted automatically from Chrome',
        '2. Personal Access Token (PAT) -- created in Figma settings',
        '',
      ];

      if (!hasCookie(config)) {
        lines.push('NEXT: Cookie extraction');
        lines.push('The user must be logged into figma.com in Chrome before proceeding.');
        if (os === 'darwin') {
          lines.push('');
          lines.push('When they proceed, a macOS Keychain prompt will appear asking to access');
          lines.push('"Chrome Safe Storage". They need to click Allow.');
        } else if (os === 'linux') {
          lines.push('');
          lines.push('On Linux, Chrome cookies are decrypted using the system keyring or a default key.');
        }
        lines.push('');
        lines.push('Ask the user to confirm they are logged into figma.com in Chrome, then call setup_extract_cookies.');
      } else {
        lines.push('Cookie auth is configured.');
        lines.push('');
        lines.push('NEXT: Personal Access Token');
        lines.push('Ask the user to create a PAT at: https://www.figma.com/settings');
        lines.push('(Security > Personal access tokens)');
        lines.push('Then call setup_save_pat with the token value.');
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.tool(
    'setup_extract_cookies',
    'Extract Figma session cookies from Chrome. On macOS this triggers a Keychain prompt. IMPORTANT: Before calling, confirm the user is logged into figma.com in Chrome and knows a system prompt may appear.',
    {},
    async () => {
      try {
        const accounts = extractCookies();

        if (accounts.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No Figma cookies found in Chrome. The user needs to log into figma.com in Chrome first, then try again.',
            }],
          };
        }

        pendingAccounts = accounts;

        const infos = await Promise.all(accounts.map(a => resolveAccountInfo(a)));

        const lines: string[] = [
          `Found ${accounts.length} Figma account${accounts.length > 1 ? 's' : ''}:`,
          '',
        ];
        for (let i = 0; i < accounts.length; i++) {
          const info = infos[i];
          const label = info.figmaEmail || `User ${accounts[i].userId}`;
          lines.push(`  ${i + 1}. ${label} (Chrome profile: ${info.profileName})`);
        }
        lines.push('');
        lines.push('Ask the user which account to use, then call setup_select_account with the chosen number.');

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Cookie extraction failed: ${e.message}` }],
        };
      }
    },
  );

  server.tool(
    'setup_select_account',
    'Select a Figma account and validate the session. Call after setup_extract_cookies.',
    {
      account_index: z.number().int().min(1).describe('Account number from the list returned by setup_extract_cookies'),
    },
    async ({ account_index }) => {
      if (pendingAccounts.length === 0) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'No accounts available. Call setup_extract_cookies first.' }],
        };
      }

      const idx = account_index - 1;
      if (idx < 0 || idx >= pendingAccounts.length) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Invalid selection. Choose 1-${pendingAccounts.length}.` }],
        };
      }

      const account = pendingAccounts[idx];

      try {
        const session = await validateSession(account.cookieValue, account.userId);

        let orgId = session.orgId;
        if (!orgId && session.orgs.length > 0) {
          orgId = session.orgs[0].id;
        }

        const workspaceName = orgId || account.userId || 'default';
        setActiveWorkspace(workspaceName, {
          cookie: account.cookieValue,
          user_id: account.userId,
          org_id: orgId || undefined,
          cookie_extracted_at: new Date().toISOString(),
        });

        const lines: string[] = [`Session valid (user ${account.userId}).`];
        if (session.orgs.length > 0) {
          const orgName = session.orgs.find(o => o.id === orgId)?.name;
          lines.push(`Workspace: ${orgName ? `${orgName} (${orgId})` : orgId}`);
        }
        if (session.teams.length > 0) {
          lines.push(`Teams: ${session.teams.map(t => t.name).join(', ')}`);
        }
        lines.push('');
        lines.push('Cookie saved. Now need a Personal Access Token for full access.');
        lines.push('Ask the user to create one at: https://www.figma.com/settings');
        lines.push('(Security > Personal access tokens)');
        lines.push('Then call setup_save_pat with the token.');

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (e: any) {
        const status = e.response?.status;
        if (status === 401 || status === 403) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Cookie expired or invalid. Log into figma.com in Chrome and run setup_extract_cookies again.' }],
          };
        }
        return {
          isError: true,
          content: [{ type: 'text', text: `Session validation failed: ${e.message}` }],
        };
      }
    },
  );

  server.tool(
    'setup_save_pat',
    'Validate and save a Figma Personal Access Token. Completes setup and activates all tools.',
    {
      pat: z.string().min(1).describe('Figma Personal Access Token (starts with figd_)'),
    },
    async ({ pat }) => {
      try {
        const patUser = await validatePat(pat);

        // Update the active workspace with the PAT
        const workspace = getActiveWorkspace();
        if (!workspace) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'No workspace configured. Run setup_extract_cookies and setup_select_account first.' }],
          };
        }

        workspace.pat = pat;
        const workspaceName = workspace.org_id || workspace.user_id || 'default';
        setActiveWorkspace(workspaceName, workspace);

        // Clear setup state
        pendingAccounts = [];

        // Trigger full tool registration
        onSetupComplete();

        return {
          content: [{
            type: 'text',
            text: `PAT valid (${patUser}). Setup complete -- all 85 figmanage tools are now available.`,
          }],
        };
      } catch {
        return {
          isError: true,
          content: [{ type: 'text', text: 'PAT invalid or expired. Check the token and try again.' }],
        };
      }
    },
  );
}
