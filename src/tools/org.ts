import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId, requireOrgId } from './register.js';
import { formatApiError } from '../helpers.js';
import {
  listAdmins,
  listOrgTeams,
  seatUsage,
  listTeamMembers,
  billingOverview,
  listInvoices,
  orgDomains,
  aiCreditUsage,
  exportMembers,
  listOrgMembers,
  contractRates,
  changeSeat,
  activityLog,
  listPayments,
  removeOrgMember,
  createUserGroup,
  deleteUserGroups,
  addUserGroupMembers,
  removeUserGroupMembers,
} from '../operations/org.js';

// -- list_admins --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_admins',
      {
        description: 'List org admins with their permission levels, seat status, and email validation state.',
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
          include_license_admins: z.boolean().optional().describe('Include license admins (default false)'),
        },
      },
      async ({ org_id, include_license_admins }) => {
        try {
          const result = await listAdmins(config, { org_id, include_license_admins });
          return toolSummary(`${result.length} admin(s).`, result);
        } catch (e: any) {
          return toolError(`Failed to list admins: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_org_teams --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_org_teams',
      {
        description: 'List all teams in the org with member counts, project counts, and access levels.',
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
          include_secret_teams: z.boolean().optional().describe('Include secret teams (default false)'),
        },
      },
      async ({ org_id, include_secret_teams }) => {
        try {
          const result = await listOrgTeams(config, { org_id, include_secret_teams });
          return toolSummary(`${result.length} team(s) in the org.`, result, 'Use list_team_members for member details.');
        } catch (e: any) {
          return toolError(`Failed to list org teams: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- seat_usage --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'seat_usage',
      {
        description: 'Seat usage breakdown: permission counts, seat types, activity recency, and account type distribution.',
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
          search_query: z.string().optional().describe('Filter counts by user search query'),
        },
      },
      async ({ org_id, search_query }) => {
        try {
          const result = await seatUsage(config, { org_id, search_query });
          return toolSummary('Seat usage breakdown:', result, 'Use seat_optimization to find inactive seats, or change_seat to modify.');
        } catch (e: any) {
          return toolError(`Failed to fetch seat usage: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_team_members --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_team_members',
      {
        description: 'List members of a team with name, email, avatar, last active date, and role.',
        inputSchema: {
          team_id: figmaId.describe('Team ID'),
        },
      },
      async ({ team_id }) => {
        try {
          const result = await listTeamMembers(config, { team_id });
          return toolSummary(`${result.length} member(s).`, result, 'Use add_team_member or remove_team_member to manage membership.');
        } catch (e: any) {
          return toolError(`Failed to list team members: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- billing_overview --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'billing_overview',
      {
        description: 'Org billing data including invoice history, status, amounts, and billing periods.',
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
      },
      async ({ org_id }) => {
        try {
          const result = await billingOverview(config, { org_id });
          return toolSummary('Billing overview:', result, 'Use list_invoices for open invoices, list_payments for payment history, or contract_rates for per-seat pricing.');
        } catch (e: any) {
          return toolError(`Failed to fetch billing overview: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_invoices --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_invoices',
      {
        description: 'List open and upcoming invoices for the org.',
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
      },
      async ({ org_id }) => {
        try {
          const result = await listInvoices(config, { org_id });
          return toolSummary(`${result.length} invoice(s).`, result);
        } catch (e: any) {
          return toolError(`Failed to list invoices: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- org_domains --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'org_domains',
      {
        description: 'Org domain configuration and SSO/SAML settings.',
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
      },
      async ({ org_id }) => {
        try {
          const result = await orgDomains(config, { org_id });
          return toolSummary('Domain configuration:', result);
        } catch (e: any) {
          return toolError(`Failed to fetch org domains: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- ai_credit_usage --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'ai_credit_usage',
      {
        description: 'AI credit usage summary. Provide a team_id and the plan is resolved automatically, or pass plan_id directly.',
        inputSchema: {
          team_id: figmaId.describe('Team ID (used to resolve the billing plan)'),
          plan_id: figmaId.optional().describe('Plan ID override (skips team folder lookup)'),
        },
      },
      async ({ team_id, plan_id }) => {
        try {
          const result = await aiCreditUsage(config, { team_id, plan_id });
          return toolSummary('AI credit usage:', result);
        } catch (e: any) {
          return toolError(`Failed to fetch AI credit usage: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- export_members --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'export_members',
      {
        description: 'Trigger async CSV export of all org members. The CSV is sent to the admin email on file.',
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
      },
      async ({ org_id }) => {
        try {
          const msg = await exportMembers(config, { org_id });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to export members: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_org_members --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_org_members',
      {
        description: 'List org members with seat type, permission, email, and last active date. Use to resolve org_user_ids for change_seat.',
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
          search_query: z.string().optional().describe('Filter members by name or email'),
        },
      },
      async ({ org_id, search_query }) => {
        try {
          const result = await listOrgMembers(config, { org_id, search_query });
          return toolSummary(`${result.length} member(s).`, result, 'Use change_seat to modify seat types.');
        } catch (e: any) {
          return toolError(`Failed to list org members: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- contract_rates --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'contract_rates',
      {
        description: 'Seat pricing for the org. Returns monthly cost per seat type (expert, developer, collaborator).',
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
      },
      async ({ org_id }) => {
        try {
          const result = await contractRates(config, { org_id });
          return toolSummary('Seat pricing:', result);
        } catch (e: any) {
          return toolError(`Failed to fetch contract rates: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- change_seat --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  mutates: true,
  destructive: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'change_seat',
      {
        description: 'Change a user\'s seat type. Accepts user_id or email to identify the user. Upgrades affect billing.',
        inputSchema: {
          user_id: z.string().describe('User ID or email address of the target user'),
          seat_type: z.enum(['full', 'dev', 'collab', 'view']).describe('Target seat type'),
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
          confirm: z.boolean().optional().describe('Required when upgrading to a higher/paid seat. Set to true to authorize the billing change.'),
        },
      },
      async ({ user_id, seat_type, org_id, confirm }) => {
        try {
          const result = await changeSeat(config, { user_id, seat_type, org_id, confirm });
          if (typeof result === 'string') return toolResult(result);
          return toolSummary(`Seat changed: ${result.old_seat} -> ${result.new_seat}.`, result);
        } catch (e: any) {
          return toolError(`Failed to change seat: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- activity_log --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'activity_log',
      {
        description: 'Org audit log. Shows who did what, when. Filter by email for per-user activity. Supports date ranges and cursor pagination.',
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
          emails: z.string().optional().describe('Comma-separated emails to filter (e.g. "alice@acme.com,bob@acme.com")'),
          start_time: z.string().optional().describe('Start date (ISO or YYYY-MM-DD). Defaults to 30 days ago.'),
          end_time: z.string().optional().describe('End date (ISO or YYYY-MM-DD). Defaults to now.'),
          page_size: z.number().int().optional().describe('Entries per page (default: 50)'),
          after: z.string().optional().describe('Pagination cursor from previous response'),
        },
      },
      async ({ org_id, emails, start_time, end_time, page_size, after }) => {
        try {
          const result = await activityLog(config, { org_id, emails, start_time, end_time, page_size, after });
          if (result.entries.length === 0) return toolResult('No activity log entries found.');
          const paginationNote = result.pagination
            ? `\nMore results available. Pass after: "${result.pagination.after}" to get the next page.`
            : '';
          return toolSummary(`${result.entries.length} log entry/entries.${paginationNote}`, result.entries);
        } catch (e: any) {
          return toolError(`Failed to fetch activity log: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_payments --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_payments',
      {
        description: 'List paid invoices / payment history for the org.',
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
      },
      async ({ org_id }) => {
        try {
          const result = await listPayments(config, { org_id });
          if (result.length === 0) return toolResult('No paid invoices found.');
          return toolSummary(`${result.length} paid invoice(s).`, result, 'Use billing_overview for current billing status, or list_invoices for open invoices.');
        } catch (e: any) {
          return toolError(`Failed to list payments: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- remove_org_member --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  mutates: true,
  destructive: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'remove_org_member',
      {
        description: 'Permanently remove a member from the org. They lose all access to teams, projects, files, and apps. Cannot be undone. Requires confirm: true.',
        inputSchema: {
          user_identifier: z.string().describe('Email or user_id of the member to remove'),
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
          confirm: z.boolean().optional().describe('Must be true to execute. Without it, returns a warning explaining consequences.'),
        },
      },
      async ({ user_identifier, org_id, confirm }) => {
        try {
          const msg = await removeOrgMember(config, { user_identifier, org_id, confirm });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- create_user_group --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'create_user_group',
      {
        description: 'Create a user group. Provide team_id to auto-resolve the billing plan, or pass plan_id directly.',
        inputSchema: {
          name: z.string().describe('Group name'),
          description: z.string().optional().describe('Group description'),
          team_id: figmaId.optional().describe('Team ID (used to resolve billing plan)'),
          plan_id: figmaId.optional().describe('Plan ID override (skips team lookup)'),
          emails: z.array(z.string()).optional().describe('Emails to add as initial members'),
          should_notify: z.boolean().optional().describe('Notify members (default true)'),
        },
      },
      async ({ name, description, team_id, plan_id, emails, should_notify }) => {
        try {
          const result = await createUserGroup(config, { name, description, team_id, plan_id, emails, should_notify });
          return toolSummary(`User group "${name}" created.`, result, 'Use add_user_group_members to add members, or delete_user_groups to remove.');
        } catch (e: any) {
          return toolError(`Failed to create user group: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- delete_user_groups --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  mutates: true,
  destructive: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'delete_user_groups',
      {
        description: 'Delete one or more user groups by ID.',
        inputSchema: {
          user_group_ids: z.array(figmaId).describe('User group IDs to delete'),
        },
      },
      async ({ user_group_ids }) => {
        try {
          const msg = await deleteUserGroups(config, { user_group_ids });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to delete user groups: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- add_user_group_members --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'add_user_group_members',
      {
        description: 'Add members to a user group by email.',
        inputSchema: {
          user_group_id: figmaId.describe('User group ID'),
          emails: z.array(z.string()).describe('Email addresses to add'),
        },
      },
      async ({ user_group_id, emails }) => {
        try {
          const result = await addUserGroupMembers(config, { user_group_id, emails });
          return toolSummary(`Added ${emails.length} member(s) to group.`, result);
        } catch (e: any) {
          return toolError(`Failed to add members to group: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- remove_user_group_members --

defineTool({
  toolset: 'org',
  adminOnly: true,
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'remove_user_group_members',
      {
        description: 'Remove members from a user group by user ID.',
        inputSchema: {
          user_group_id: figmaId.describe('User group ID'),
          user_ids: z.array(z.string()).describe('User IDs to remove'),
        },
      },
      async ({ user_group_id, user_ids }) => {
        try {
          const msg = await removeUserGroupMembers(config, { user_group_id, user_ids });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to remove members from group: ${formatApiError(e)}`);
        }
      },
    );
  },
});
