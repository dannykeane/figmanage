import { Command } from 'commander';
import { readConfig, writeConfig } from '../config.js';
import {
  checkAuthStatus,
  getFileInfo,
  listFavorites,
  listFiles,
  listOrgs,
  listProjects,
  listRecentFiles,
  listTeams,
  search,
  switchOrg,
} from '../operations/navigate.js';
import { fail, isMachineOutput, output, outputEmpty } from './format.js';
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
        if (!result.status.pat.valid && !result.status.cookie.valid) process.exitCode = 1;
        if (isMachineOutput(options)) {
          output(result.status, options);
        } else {
          console.log(result.formatted);
        }
      } catch (e: any) {
        fail(e);
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
          outputEmpty(orgs, 'No workspaces found. You may be on a free/starter plan.', options);
          return;
        }
        output(orgs, options);
      } catch (e: any) {
        fail(e);
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
        if (process.env.FIGMA_ORG_ID && process.env.FIGMA_ORG_ID !== result.current.id) {
          throw new Error('FIGMA_ORG_ID overrides saved workspace selection. Change or unset it before switching.');
        }
        const saved = readConfig();
        if (!saved || !saved.workspaces[saved.active_workspace]) {
          throw new Error('No saved workspace to update. Set FIGMA_ORG_ID for environment-only authentication.');
        }
        saved.workspaces[saved.active_workspace].org_id = result.current.id;
        writeConfig(saved);
        output({
          previous: result.previous,
          current: result.current,
        }, options);
      } catch (e: any) {
        fail(e);
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
        fail(e);
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
        fail(e);
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
          page_size: options.pageSize ? Number(options.pageSize) : undefined,
          page_token: options.pageToken,
        });
        output(result, { ...options, collection: 'files' });
      } catch (e: any) {
        fail(e);
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
        fail(e);
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
          outputEmpty(results, 'No results found.', options);
          return;
        }
        output(results, options);
      } catch (e: any) {
        fail(e);
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
        fail(e);
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
          outputEmpty(favorites, 'No favorites found.', options);
          return;
        }
        output(favorites, options);
      } catch (e: any) {
        fail(e);
      }
    });

  return nav;
}
