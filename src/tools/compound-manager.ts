import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
import {
  offboardUser,
  onboardUser,
  quarterlyDesignOpsReport,
} from '../operations/compound-manager.js';

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
        description: 'Audit and optionally execute user offboarding. Default: read-only audit. With execute=true: transfers file ownership, revokes access, downgrades seat. With remove_from_org=true: also permanently removes the user from the org (cannot be undone).',
        inputSchema: {
          user_identifier: z.string().describe('Email or user_id of the user to offboard'),
          execute: z.boolean().optional().default(false).describe('Execute the offboarding (default: false, audit only)'),
          transfer_to: z.string().optional().describe('Email or user_id to transfer file ownership to (required if user owns files and execute=true)'),
          remove_from_org: z.boolean().optional().default(false).describe('Permanently remove from org after offboarding (cannot be undone). Requires execute=true.'),
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
      },
      async ({ user_identifier, execute, transfer_to, remove_from_org, org_id }) => {
        try {
          const result = await offboardUser(config, {
            user_identifier,
            execute: execute ?? false,
            transfer_to,
            remove_from_org: remove_from_org ?? false,
            org_id,
          });
          const mode = (execute ?? false) ? 'Offboarding complete.' : 'Offboarding audit (read-only). Set execute=true to proceed.';
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
        inputSchema: {
          email: z.string().email().describe('Email address to invite'),
          team_ids: z.array(figmaId).min(1).describe('Team IDs to invite the user to'),
          role: z.enum(['editor', 'viewer']).optional().default('editor').describe('Role for team access (default: editor)'),
          share_files: z.array(figmaId).optional().describe('File keys to share with the user (viewer access)'),
          seat_type: z.enum(['full', 'dev', 'collab', 'view']).optional().describe('Seat type to assign after invite'),
          confirm: z.boolean().optional().describe('Required to execute seat change'),
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
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
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
          days: z.number().min(1).max(365).optional().default(90).describe('Lookback period in days (default: 90)'),
        },
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
