import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
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

// -- check_auth --

defineTool({
  toolset: 'navigate',
  auth: 'either',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'check_auth',
      { description: 'Check authentication status for both PAT and session cookie' },
      async () => {
        try {
          const result = await checkAuthStatus(config);
          return toolResult(result.formatted);
        } catch (e: any) {
          return toolError(`Auth check failed: ${e.message}`);
        }
      },
    );
  },
});

// -- list_orgs --

defineTool({
  toolset: 'navigate',
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_orgs',
      {
        description: 'List all Figma workspaces (orgs) you belong to. Shows which is currently active.',
      },
      async () => {
        try {
          const orgs = await listOrgs(config);

          // Side effect: update config org registry
          if (orgs.length > 0) {
            config.orgs = orgs.map(o => ({ id: o.id, name: o.name }));
          }

          if (orgs.length === 0) {
            return toolResult('No workspaces found. You may be on a free/starter plan.');
          }
          return toolSummary(`Found ${orgs.length} workspace(s).`, orgs, 'Use switch_org to change workspace, or list_teams to browse.');
        } catch (e: any) {
          return toolError(`Failed to list orgs: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- switch_org --

defineTool({
  toolset: 'navigate',
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'switch_org',
      {
        description: 'Switch active workspace. Accepts org name (fuzzy match) or ID. Use list_orgs to see available workspaces.',
        inputSchema: {
          org: z.string().describe('Org name or ID to switch to'),
        },
      },
      async ({ org }) => {
        try {
          const result = await switchOrg(config, { org });
          // Side effect: update config org ID
          config.orgId = result.current.id;
          return toolResult(`Switched workspace: ${result.previous} -> ${result.current.name} (${result.current.id})`);
        } catch (e: any) {
          return toolError(`Failed to switch org: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_teams --

defineTool({
  toolset: 'navigate',
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_teams',
      {
        description: 'List all teams you belong to. Returns team IDs and names.',
      },
      async () => {
        try {
          const teams = await listTeams(config);
          if (teams.length === 0) return toolResult('No teams found.');
          return toolSummary(`Found ${teams.length} team(s).`, teams, 'Use list_projects with a team_id to browse projects.');
        } catch (e: any) {
          return toolError(`Failed to list teams: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_projects --

defineTool({
  toolset: 'navigate',
  auth: 'either',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_projects',
      {
        description: 'List projects (folders) in a team. Returns project IDs, names.',
        inputSchema: {
          team_id: figmaId.describe('Team ID'),
        },
      },
      async ({ team_id }) => {
        try {
          const projects = await listProjects(config, { team_id });
          if (projects.length === 0) return toolResult('No projects found.');
          return toolSummary(`Found ${projects.length} project(s).`, projects, 'Use list_files with a project_id to see files.');
        } catch (e: any) {
          return toolError(`Failed to list projects: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_files --

defineTool({
  toolset: 'navigate',
  auth: 'either',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_files',
      {
        description: 'List files in a project. Returns file keys, names, last modified, editor type. Supports pagination.',
        inputSchema: {
          project_id: figmaId.describe('Project (folder) ID'),
          page_size: z.number().optional().describe('Results per page (default 25, max 100)'),
          page_token: z.string().optional().describe('Pagination token from previous response'),
        },
      },
      async ({ project_id, page_size, page_token }) => {
        try {
          const result = await listFiles(config, { project_id, page_size, page_token });
          const count = result.files.length;
          const summary = `${count} file(s).` + (result.pagination?.has_more ? ' More pages available.' : '');
          return toolSummary(summary, result, 'Use get_file_info or get_file for details.');
        } catch (e: any) {
          return toolError(`Failed to list files: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_recent_files --

defineTool({
  toolset: 'navigate',
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_recent_files',
      {
        description: 'List your recently viewed/edited files across all teams.',
      },
      async () => {
        try {
          const files = await listRecentFiles(config);
          if (files.length === 0) return toolResult('No recent files.');
          return toolSummary(`${files.length} recently accessed file(s).`, files, 'Use get_file_info for details.');
        } catch (e: any) {
          return toolError(`Failed to list recent files: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- search --

defineTool({
  toolset: 'navigate',
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'search',
      {
        description: 'Search for files across the workspace. Requires org context for results.',
        inputSchema: {
          query: z.string().describe('Search query'),
          sort: z.enum(['relevancy', 'last_modified']).optional().describe('Sort order (default: relevancy)'),
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
      },
      async ({ query, sort, org_id }) => {
        try {
          const results = await search(config, { query, sort, org_id });
          if (results.length === 0) {
            return toolResult('No results. Try list_recent_files or browse via list_projects + list_files.');
          }
          return toolSummary(`Found ${results.length} result(s).`, results, 'Use get_file_info for file details.');
        } catch (e: any) {
          return toolError(`Search failed: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- get_file_info --

defineTool({
  toolset: 'navigate',
  auth: 'either',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'get_file_info',
      {
        description: 'Get metadata for a file: name, last modified, editor type, project, team.',
        inputSchema: {
          file_key: figmaId.describe('Figma file key (from the URL)'),
        },
      },
      async ({ file_key }) => {
        try {
          const info = await getFileInfo(config, { file_key });
          return toolSummary(`${info.name} (${info.editor_type || 'design'})`, info);
        } catch (e: any) {
          return toolError(`Failed to get file info: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_favorites --

defineTool({
  toolset: 'navigate',
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_favorites',
      {
        description: 'List your starred/favorited files. Note: may not work on all account types.',
      },
      async () => {
        try {
          const favorites = await listFavorites(config);
          if (favorites.length === 0) return toolResult('No favorites found.');
          return toolSummary(`${favorites.length} favorited file(s).`, favorites, 'Use get_file_info for details.');
        } catch (e: any) {
          return toolError(`Failed to list favorites: ${formatApiError(e)}`);
        }
      },
    );
  },
});
