import { Command } from 'commander';
import { createTeam, renameTeam, deleteTeam, addTeamMember, removeTeamMember } from '../operations/teams.js';
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requireCookie } from './helpers.js';

export function teamsCommand(): Command {
  const teams = new Command('teams')
    .description('Create, rename, and delete teams');

  teams
    .command('create <name>')
    .description('Create a new team in the org')
    .option('--org-id <id>', 'Org ID override')
    .option('--json', 'Force JSON output')
    .action(async (name: string, options: { orgId?: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await createTeam(config, { name, org_id: options.orgId });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  teams
    .command('rename <team-id> <name>')
    .description('Rename an existing team')
    .option('--json', 'Force JSON output')
    .action(async (teamId: string, name: string, options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const msg = await renameTeam(config, { team_id: teamId, name });
        output({ message: msg }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  teams
    .command('delete <team-id>')
    .description('Delete a team (destructive, cannot be undone)')
    .option('--json', 'Force JSON output')
    .action(async (teamId: string, options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const { confirmAction } = await import('./helpers.js');
        if (!await confirmAction(`Permanently delete team ${teamId}? All projects and files will be lost.`)) {
          console.log('Cancelled.');
          return;
        }
        const msg = await deleteTeam(config, { team_id: teamId });
        output({ message: msg }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  teams
    .command('add-member <team-id> <email>')
    .description('Add a member to a team by email')
    .option('--level <n>', 'Permission level: 100 = view (default), 300 = edit, 999 = admin')
    .option('--json', 'Force JSON output')
    .action(async (teamId: string, email: string, options: { level?: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const msg = await addTeamMember(config, {
          team_id: teamId,
          email,
          level: options.level ? parseInt(options.level, 10) : undefined,
        });
        output({ message: msg }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  teams
    .command('remove-member <team-id> <user-id>')
    .description('Remove a member from a team')
    .option('--json', 'Force JSON output')
    .action(async (teamId: string, userId: string, options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const { confirmAction } = await import('./helpers.js');
        if (!await confirmAction(`Remove user ${userId} from team ${teamId}?`)) {
          console.log('Cancelled.');
          return;
        }
        const msg = await removeTeamMember(config, { team_id: teamId, user_id: userId });
        output({ message: msg }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  return teams;
}
