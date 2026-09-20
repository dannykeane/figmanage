import { Command } from 'commander';
import {
  approveRoleRequest,
  denyRoleRequest,
  getPermissions,
  listRoleRequests,
  revokeAccess,
  setPermissions,
  share,
} from '../operations/permissions.js';
import { fail, output } from './format.js';
import { requireCookie } from './helpers.js';

export function permissionsCommand(): Command {
  const permissions = new Command('permissions')
    .description('Manage file, project, and team permissions');

  permissions
    .command('get <resource-type> <resource-id>')
    .description('See who has access to a file, project, or team')
    .option('--json', 'Force JSON output')
    .action(async (resourceType: string, resourceId: string, options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await getPermissions(config, {
          resource_type: resourceType,
          resource_id: resourceId,
        });
        output(result, options);
      } catch (e: any) {
        fail(e);
      }
    });

  permissions
    .command('set <resource-type> <resource-id> <user-id> <role>')
    .description('Change access level for a user on a file, project, or team')
    .option('--json', 'Force JSON output')
    .action(async (
      resourceType: string,
      resourceId: string,
      userId: string,
      role: string,
      options: { json?: boolean },
    ) => {
      try {
        const config = requireCookie();
        const msg = await setPermissions(config, {
          resource_type: resourceType,
          resource_id: resourceId,
          user_id: userId,
          role,
        });
        output({ message: msg }, options);
      } catch (e: any) {
        fail(e);
      }
    });

  permissions
    .command('share <resource-type> <resource-id> <email>')
    .description('Share a file or project with someone by email')
    .option('--role <role>', 'Role to grant (editor or viewer)', 'viewer')
    .option('--json', 'Force JSON output')
    .action(async (
      resourceType: string,
      resourceId: string,
      email: string,
      options: { role?: string; json?: boolean },
    ) => {
      try {
        const config = requireCookie();
        const result = await share(config, {
          resource_type: resourceType,
          resource_id: resourceId,
          email,
          role: options.role,
        });
        output(result, options);
      } catch (e: any) {
        fail(e);
      }
    });

  permissions
    .command('revoke <resource-type> <resource-id> <user-id>')
    .description("Remove someone's access to a file, project, or team")
    .option('--json', 'Force JSON output')
    .action(async (
      resourceType: string,
      resourceId: string,
      userId: string,
      options: { json?: boolean },
    ) => {
      try {
        const config = requireCookie();
        const { confirmAction } = await import('./helpers.js');
        if (!await confirmAction(`Revoke ${userId}'s access to ${resourceType} ${resourceId}?`)) {
          throw new Error('Cancelled. No changes made.');
        }
        const msg = await revokeAccess(config, {
          resource_type: resourceType,
          resource_id: resourceId,
          user_id: userId,
        });
        output({ message: msg }, options);
      } catch (e: any) {
        fail(e);
      }
    });

  permissions
    .command('requests')
    .description('List pending file access requests')
    .option('--json', 'Force JSON output')
    .action(async (options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await listRoleRequests(config);
        output(result, options);
      } catch (e: any) {
        fail(e);
      }
    });

  permissions
    .command('approve <notification-id>')
    .description('Approve a pending file access request')
    .option('--json', 'Force JSON output')
    .action(async (notificationId: string, options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const msg = await approveRoleRequest(config, { notification_id: notificationId });
        output({ message: msg }, options);
      } catch (e: any) {
        fail(e);
      }
    });

  permissions
    .command('deny <notification-id>')
    .description('Decline a pending file access request')
    .option('--json', 'Force JSON output')
    .action(async (notificationId: string, options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const msg = await denyRoleRequest(config, { notification_id: notificationId });
        output({ message: msg }, options);
      } catch (e: any) {
        fail(e);
      }
    });

  return permissions;
}
