import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { formatApiError } from '../helpers.js';
import { hasFailures } from '../results.js';
import {
  offboardUser,
  onboardUser,
  quarterlyDesignOpsReport,
} from '../operations/compound-manager.js';
import { inputSchemas } from '../schemas.js';
import { defineTool, toolError, toolSummary } from './register.js';

// -- offboard_user --

defineTool({
  toolset: 'compound',
  auth: 'cookie',
  mutates: true,
  destructive: true,
  adminOnly: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'offboard_user',
      {
        description: 'Audit and optionally execute user offboarding. Default: read-only audit. Complete nested-folder discovery requires a PAT for the browser account with current_user:read and folders:read. With execute=true: transfers file ownership, removes discovered direct grants, and verifies access and seat changes. Team/folder ownership and retained org admin roles can block execution. Inspect coverage, execution_blockers, and remaining_work; groups, drafts, and inherited access require separate review. With remove_from_org=true: also permanently removes the user from the org (cannot be undone).',
        inputSchema: inputSchemas.offboard_user,
      },
      async ({ user_identifier, execute, transfer_to, remove_from_org, org_id }, extra) => {
        try {
          const result = await offboardUser(config, {
            user_identifier,
            execute: execute ?? false,
            transfer_to,
            remove_from_org: remove_from_org ?? false,
            org_id,
          }, extra?._meta?.progressToken !== undefined ? event => extra.sendNotification({
            method: 'notifications/progress',
            params: { progressToken: extra._meta!.progressToken!, progress: event.sequence, message: `${event.phase}: ${event.message}${event.resource_id ? ` (${event.resource_id})` : ''}${event.status ? ` — ${event.status}` : ''}` },
          }) : undefined);
          const mode = (execute ?? false)
            ? hasFailures(result) ? 'Offboarding stopped with failed or incomplete steps.' : 'Planned changes verified. Review remaining_work before treating the departure as complete.'
            : 'Offboarding audit (read-only). Review discovery completeness and the next step below.';
          return toolSummary(mode, result);
        } catch (e: any) {
          return toolError(`Failed to audit user for offboarding: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- onboard_user --

defineTool({
  toolset: 'compound',
  auth: 'cookie',
  mutates: true,
  adminOnly: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'onboard_user',
      {
        description: 'Invite a user to teams and optionally share files and set seat type. Sends invite emails per team.',
        inputSchema: inputSchemas.onboard_user,
      },
      async ({ email, team_ids, role, share_files, seat_type, confirm, org_id }) => {
        try {
          const result = await onboardUser(config, {
            email,
            team_ids,
            role: role || 'editor',
            share_files,
            seat_type,
            confirm,
            org_id,
          });
          return toolSummary(`Onboarding complete for ${email}.`, result);
        } catch (e: any) {
          return toolError(`Failed to onboard user: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- quarterly_design_ops_report --

defineTool({
  toolset: 'compound',
  auth: 'cookie',
  adminOnly: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'quarterly_design_ops_report',
      {
        description: 'Org-wide design ops snapshot: seat utilization, team activity, billing, and library adoption over a given period.',
        inputSchema: inputSchemas.quarterly_design_ops_report,
      },
      async ({ org_id, days }) => {
        try {
          const result = await quarterlyDesignOpsReport(config, {
            org_id,
            days: days ?? 90,
          });
          const highlightText = result.highlights?.join(' ') || 'Report generated.';
          return toolSummary(highlightText, result);
        } catch (e: any) {
          return toolError(`Failed to generate design ops report: ${formatApiError(e)}`);
        }
      },
    );
  },
});
