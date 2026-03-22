import { Command } from 'commander';
import {
  createProject,
  renameProject,
  moveProject,
  trashProject,
  restoreProject,
  setProjectDescription,
} from '../operations/projects.js';
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requireCookie } from './helpers.js';

export function projectsCommand(): Command {
  const projects = new Command('projects')
    .description('Manage Figma projects');

  projects
    .command('create <team-id>')
    .description('Create a new project in a team')
    .requiredOption('--name <name>', 'Project name')
    .option('--json', 'Force JSON output')
    .action(async (teamId: string, options: { name: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await createProject(config, { team_id: teamId, name: options.name });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  projects
    .command('rename <project-id>')
    .description('Rename a project')
    .requiredOption('--name <name>', 'New name')
    .option('--json', 'Force JSON output')
    .action(async (projectId: string, options: { name: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        await renameProject(config, { project_id: projectId, name: options.name });
        output({ renamed: projectId, name: options.name }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  projects
    .command('move <project-id>')
    .description('Move a project to a different team')
    .requiredOption('--destination <team-id>', 'Destination team ID')
    .option('--json', 'Force JSON output')
    .action(async (projectId: string, options: { destination: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        await moveProject(config, {
          project_id: projectId,
          destination_team_id: options.destination,
        });
        output({ moved: projectId, destination_team_id: options.destination }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  projects
    .command('trash <project-id>')
    .description('Move a project to trash')
    .option('--json', 'Force JSON output')
    .action(async (projectId: string, options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const { confirmAction } = await import('./helpers.js');
        if (!await confirmAction(`Trash project ${projectId} and all its files?`)) {
          console.log('Cancelled.');
          return;
        }
        await trashProject(config, { project_id: projectId });
        output({ trashed: projectId }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  projects
    .command('restore <project-id>')
    .description('Restore a project from trash')
    .option('--json', 'Force JSON output')
    .action(async (projectId: string, options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        await restoreProject(config, { project_id: projectId });
        output({ restored: projectId }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  projects
    .command('set-description <project-id>')
    .description('Set or update a project description')
    .requiredOption('--description <text>', 'Description text')
    .option('--json', 'Force JSON output')
    .action(async (projectId: string, options: { description: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        await setProjectDescription(config, {
          project_id: projectId,
          description: options.description,
        });
        output({ updated: projectId }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  return projects;
}
