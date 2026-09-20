import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { formatApiError } from '../helpers.js';
import {
  activityLog,
  addUserGroupMembers,
  aiCreditUsage,
  billingOverview,
  changeSeat,
  contractRates,
  createUserGroup,
  deleteUserGroups,
  exportMembers,
  listAdmins,
  listInvoices,
  listOrgMembers,
  listOrgTeams,
  listPayments,
  listTeamMembers,
  orgDomains,
  removeOrgMember,
  removeUserGroupMembers,
  seatUsage,
} from '../operations/org.js';
import { inputSchemas } from '../schemas.js';
import { defineTool, toolError, toolResult, toolSummary } from './register.js';

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
        inputSchema: inputSchemas.list_admins,
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
        inputSchema: inputSchemas.list_org_teams,
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
        inputSchema: inputSchemas.seat_usage,
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
        inputSchema: inputSchemas.list_team_members,
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
        inputSchema: inputSchemas.billing_overview,
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
        inputSchema: inputSchemas.list_invoices,
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
        inputSchema: inputSchemas.org_domains,
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
        inputSchema: inputSchemas.ai_credit_usage,
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
        inputSchema: inputSchemas.export_members,
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
        inputSchema: inputSchemas.list_org_members,
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
        inputSchema: inputSchemas.contract_rates,
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
        inputSchema: inputSchemas.change_seat,
      },
      async ({ user_id, seat_type, org_id, confirm }) => {
        try {
          const result = await changeSeat(config, { user_id, seat_type, org_id, confirm });
          if (typeof result === 'string') return toolResult(result, result);
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
        inputSchema: inputSchemas.activity_log,
      },
      async ({ org_id, emails, start_time, end_time, page_size, after }) => {
        try {
          const result = await activityLog(config, { org_id, emails, start_time, end_time, page_size, after });
          if (result.entries.length === 0) return toolResult('No activity log entries found.', result);
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
        inputSchema: inputSchemas.list_payments,
      },
      async ({ org_id }) => {
        try {
          const result = await listPayments(config, { org_id });
          if (result.length === 0) return toolResult('No paid invoices found.', result);
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
        inputSchema: inputSchemas.remove_org_member,
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
        inputSchema: inputSchemas.create_user_group,
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
        inputSchema: inputSchemas.delete_user_groups,
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
        inputSchema: inputSchemas.add_user_group_members,
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
        inputSchema: inputSchemas.remove_user_group_members,
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
