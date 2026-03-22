import { Command } from 'commander';
import {
  checkAuthStatus,
  listOrgs,
  switchOrg,
  listTeams,
  listProjects,
  listFiles,
  listRecentFiles,
  search,
  getFileInfo,
  listFavorites,
} from '../operations/navigate.js';
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requireAuth, requireCookie } from './helpers.js';

export function navigateCommand(): Command {
  const nav = new Command('navigate')
    .description('Browse workspaces, teams, projects, and files');

  nav
    .command('check-auth')
    .description('Check authentication status for PAT and session cookie')
    .option('--json', 'Force JSON output')
    .action(async (options: { json?: boolean }) => {
      try {
        const config = requireAuth();
        const result = await checkAuthStatus(config);
        if (options.json) {
          output(result.status, options);
        } else {
          console.log(result.formatted);
        }
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  nav
    .command('list-orgs')
    .description('List all workspaces you belong to')
    .option('--json', 'Force JSON output')
    .action(async (options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const orgs = await listOrgs(config);
        if (orgs.length === 0) {
          console.log('No workspaces found. You may be on a free/starter plan.');
          return;
        }
        output(orgs, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  nav
    .command('switch-org <org>')
    .description('Switch active workspace (name or ID)')
    .option('--json', 'Force JSON output')
    .action(async (org: string, options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await switchOrg(config, { org });
        output({
          previous: result.previous,
          current: result.current,
        }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  nav
    .command('list-teams')
    .description('List all teams you belong to')
    .option('--json', 'Force JSON output')
    .action(async (options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const teams = await listTeams(config);
        output(teams, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  nav
    .command('list-projects <team-id>')
    .description('List projects (folders) in a team')
    .option('--json', 'Force JSON output')
    .action(async (teamId: string, options: { json?: boolean }) => {
      try {
        const config = requireAuth();
        const projects = await listProjects(config, { team_id: teamId });
        output(projects, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  nav
    .command('list-files <project-id>')
    .description('List files in a project')
    .option('--page-size <n>', 'Results per page (default 25, max 100)')
    .option('--page-token <token>', 'Pagination token from previous response')
    .option('--json', 'Force JSON output')
    .action(async (projectId: string, options: {
      pageSize?: string;
      pageToken?: string;
      json?: boolean;
    }) => {
      try {
        const config = requireAuth();
        const result = await listFiles(config, {
          project_id: projectId,
          page_size: options.pageSize ? parseInt(options.pageSize, 10) : undefined,
          page_token: options.pageToken,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  nav
    .command('list-recent-files')
    .description('List recently viewed/edited files')
    .option('--json', 'Force JSON output')
    .action(async (options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const files = await listRecentFiles(config);
        output(files, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  nav
    .command('search <query>')
    .description('Search for files across the workspace')
    .option('--sort <order>', 'Sort order: relevancy or last_modified')
    .option('--org-id <id>', 'Org ID override')
    .option('--json', 'Force JSON output')
    .action(async (query: string, options: {
      sort?: string;
      orgId?: string;
      json?: boolean;
    }) => {
      try {
        const config = requireCookie();
        const results = await search(config, {
          query,
          sort: options.sort,
          org_id: options.orgId,
        });
        if (results.length === 0) {
          console.log('No results found.');
          return;
        }
        output(results, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  nav
    .command('file-info <file-key>')
    .description('Get metadata for a file')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { json?: boolean }) => {
      try {
        const config = requireAuth();
        const info = await getFileInfo(config, { file_key: fileKey });
        output(info, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  nav
    .command('list-favorites')
    .description('List starred/favorited files')
    .option('--json', 'Force JSON output')
    .action(async (options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const favorites = await listFavorites(config);
        if (favorites.length === 0) {
          console.log('No favorites found.');
          return;
        }
        output(favorites, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  return nav;
}
