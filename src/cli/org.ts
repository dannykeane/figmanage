import { Command } from 'commander';
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
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requireCookie } from './helpers.js';

export function orgCommand(): Command {
  const org = new Command('org')
    .description('Org administration and billing');

  org
    .command('list-admins')
    .description('List org admins with permission levels and seat status')
    .option('--org-id <id>', 'Org ID override')
    .option('--include-license-admins', 'Include license admins')
    .option('--json', 'Force JSON output')
    .action(async (options: { orgId?: string; includeLicenseAdmins?: boolean; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await listAdmins(config, {
          org_id: options.orgId,
          include_license_admins: options.includeLicenseAdmins,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('list-teams')
    .description('List all teams in the org')
    .option('--org-id <id>', 'Org ID override')
    .option('--include-secret-teams', 'Include secret teams')
    .option('--json', 'Force JSON output')
    .action(async (options: { orgId?: string; includeSecretTeams?: boolean; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await listOrgTeams(config, {
          org_id: options.orgId,
          include_secret_teams: options.includeSecretTeams,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('seat-usage')
    .description('Seat usage breakdown by type and activity')
    .option('--org-id <id>', 'Org ID override')
    .option('--search <query>', 'Filter counts by user search query')
    .option('--json', 'Force JSON output')
    .action(async (options: { orgId?: string; search?: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await seatUsage(config, {
          org_id: options.orgId,
          search_query: options.search,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('team-members <team-id>')
    .description('List members of a team')
    .option('--json', 'Force JSON output')
    .action(async (teamId: string, options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await listTeamMembers(config, { team_id: teamId });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('billing')
    .description('Org billing data including invoice history and amounts')
    .option('--org-id <id>', 'Org ID override')
    .option('--json', 'Force JSON output')
    .action(async (options: { orgId?: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await billingOverview(config, { org_id: options.orgId });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('invoices')
    .description('List open and upcoming invoices')
    .option('--org-id <id>', 'Org ID override')
    .option('--json', 'Force JSON output')
    .action(async (options: { orgId?: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await listInvoices(config, { org_id: options.orgId });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('domains')
    .description('Org domain configuration and SSO/SAML settings')
    .option('--org-id <id>', 'Org ID override')
    .option('--json', 'Force JSON output')
    .action(async (options: { orgId?: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await orgDomains(config, { org_id: options.orgId });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('ai-credits <team-id>')
    .description('AI credit usage summary (resolves billing plan from team)')
    .option('--plan-id <id>', 'Plan ID override (skips team folder lookup)')
    .option('--json', 'Force JSON output')
    .action(async (teamId: string, options: { planId?: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await aiCreditUsage(config, { team_id: teamId, plan_id: options.planId });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('export-members')
    .description('Trigger async CSV export of all org members')
    .option('--org-id <id>', 'Org ID override')
    .option('--json', 'Force JSON output')
    .action(async (options: { orgId?: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const msg = await exportMembers(config, { org_id: options.orgId });
        output({ message: msg }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('members')
    .description('List org members with seat type, permission, and activity')
    .option('--org-id <id>', 'Org ID override')
    .option('--search <query>', 'Filter members by name or email')
    .option('--json', 'Force JSON output')
    .action(async (options: { orgId?: string; search?: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await listOrgMembers(config, {
          org_id: options.orgId,
          search_query: options.search,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('contract-rates')
    .description('Seat pricing per type (expert, developer, collaborator)')
    .option('--org-id <id>', 'Org ID override')
    .option('--json', 'Force JSON output')
    .action(async (options: { orgId?: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await contractRates(config, { org_id: options.orgId });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('change-seat <user-id> <seat-type>')
    .description("Change a user's seat type (full, dev, collab, view)")
    .option('--org-id <id>', 'Org ID override')
    .option('--confirm', 'Authorize billing change for upgrades')
    .option('--json', 'Force JSON output')
    .action(async (
      userId: string,
      seatType: string,
      options: { orgId?: string; confirm?: boolean; json?: boolean },
    ) => {
      try {
        const config = requireCookie();
        const result = await changeSeat(config, {
          user_id: userId,
          seat_type: seatType,
          org_id: options.orgId,
          confirm: options.confirm,
        });
        if (typeof result === 'string') {
          output({ message: result }, options);
        } else {
          output(result, options);
        }
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('activity-log')
    .description('Org audit log. Filter by email for per-user activity.')
    .option('--org-id <id>', 'Org ID override')
    .option('--emails <list>', 'Comma-separated emails to filter')
    .option('--start <date>', 'Start date (ISO or YYYY-MM-DD)')
    .option('--end <date>', 'End date (ISO or YYYY-MM-DD)')
    .option('--page-size <n>', 'Entries per page')
    .option('--after <cursor>', 'Pagination cursor from previous response')
    .option('--json', 'Force JSON output')
    .action(async (options: {
      orgId?: string;
      emails?: string;
      start?: string;
      end?: string;
      pageSize?: string;
      after?: string;
      json?: boolean;
    }) => {
      try {
        const config = requireCookie();
        const result = await activityLog(config, {
          org_id: options.orgId,
          emails: options.emails,
          start_time: options.start,
          end_time: options.end,
          page_size: options.pageSize ? parseInt(options.pageSize, 10) : undefined,
          after: options.after,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('payments')
    .description('List paid invoices / payment history')
    .option('--org-id <id>', 'Org ID override')
    .option('--json', 'Force JSON output')
    .action(async (options: { orgId?: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await listPayments(config, { org_id: options.orgId });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('remove-org-member <user>')
    .description('Permanently remove a member from the org (cannot be undone)')
    .option('--org-id <id>', 'Org ID override')
    .option('--confirm', 'Confirm permanent removal')
    .option('--json', 'Force JSON output')
    .action(async (
      user: string,
      options: { orgId?: string; confirm?: boolean; json?: boolean },
    ) => {
      try {
        const config = requireCookie();
        const msg = await removeOrgMember(config, {
          user_identifier: user,
          org_id: options.orgId,
          confirm: options.confirm,
        });
        output({ message: msg }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('create-user-group <name>')
    .description('Create a user group')
    .option('--description <text>', 'Group description')
    .option('--team-id <id>', 'Team ID (resolves billing plan)')
    .option('--plan-id <id>', 'Plan ID override')
    .option('--emails <list>', 'Comma-separated emails to add as initial members')
    .option('--no-notify', 'Skip member notification')
    .option('--json', 'Force JSON output')
    .action(async (
      name: string,
      options: { description?: string; teamId?: string; planId?: string; emails?: string; notify?: boolean; json?: boolean },
    ) => {
      try {
        const config = requireCookie();
        const result = await createUserGroup(config, {
          name,
          description: options.description,
          team_id: options.teamId,
          plan_id: options.planId,
          emails: options.emails ? options.emails.split(',').map(e => e.trim()) : undefined,
          should_notify: options.notify,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('delete-user-groups <ids...>')
    .description('Delete one or more user groups')
    .option('--json', 'Force JSON output')
    .action(async (ids: string[], options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const msg = await deleteUserGroups(config, { user_group_ids: ids });
        output({ message: msg }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('add-user-group-members <group-id> <emails...>')
    .description('Add members to a user group by email')
    .option('--json', 'Force JSON output')
    .action(async (groupId: string, emails: string[], options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await addUserGroupMembers(config, { user_group_id: groupId, emails });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  org
    .command('remove-user-group-members <group-id> <user-ids...>')
    .description('Remove members from a user group')
    .option('--json', 'Force JSON output')
    .action(async (groupId: string, userIds: string[], options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await removeUserGroupMembers(config, { user_group_id: groupId, user_ids: userIds });
        output({ message: result }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  return org;
}
