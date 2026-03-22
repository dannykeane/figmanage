import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
import { createTeam, renameTeam, deleteTeam, addTeamMember, removeTeamMember } from '../operations/teams.js';

// -- create_team --

defineTool({
  toolset: 'teams',
  auth: 'cookie',
  mutates: true,
  adminOnly: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'create_team',
      {
        description: 'Create a new team in the org.',
        inputSchema: {
          name: z.string().describe('Team name'),
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
      },
      async ({ name, org_id }) => {
        try {
          const result = await createTeam(config, { name, org_id });
          return toolSummary(`Created team.`, result, 'Use create_project to add projects to this team.');
        } catch (e: any) {
          return toolError(`Failed to create team: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- rename_team --

defineTool({
  toolset: 'teams',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'rename_team',
      {
        description: 'Rename an existing team.',
        inputSchema: {
          team_id: figmaId.describe('Team ID'),
          name: z.string().describe('New team name'),
        },
      },
      async ({ team_id, name }) => {
        try {
          const msg = await renameTeam(config, { team_id, name });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to rename team: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- delete_team --

defineTool({
  toolset: 'teams',
  auth: 'cookie',
  mutates: true,
  destructive: true,
  adminOnly: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'delete_team',
      {
        description: 'Permanently delete a team and all its projects/files. This cannot be undone. All team members lose access.',
        inputSchema: {
          team_id: figmaId.describe('Team ID'),
        },
      },
      async ({ team_id }) => {
        try {
          const msg = await deleteTeam(config, { team_id });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to delete team: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- add_team_member --

defineTool({
  toolset: 'teams',
  auth: 'cookie',
  mutates: true,
  adminOnly: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'add_team_member',
      {
        description: 'Add a member to a team by email. Level: 100 = can view (default), 300 = can edit, 999 = admin.',
        inputSchema: {
          team_id: figmaId.describe('Team ID'),
          email: z.string().describe('Email address of the user to add'),
          level: z.number().int().optional().describe('Permission level: 100 = view (default), 300 = edit, 999 = admin'),
        },
      },
      async ({ team_id, email, level }) => {
        try {
          const msg = await addTeamMember(config, { team_id, email, level });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to add team member: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- remove_team_member --

defineTool({
  toolset: 'teams',
  auth: 'cookie',
  mutates: true,
  destructive: true,
  adminOnly: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'remove_team_member',
      {
        description: 'Remove a member from a team. The user loses access to all team projects and files.',
        inputSchema: {
          team_id: figmaId.describe('Team ID'),
          user_id: figmaId.describe('User ID to remove'),
        },
      },
      async ({ team_id, user_id }) => {
        try {
          const msg = await removeTeamMember(config, { team_id, user_id });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to remove team member: ${formatApiError(e)}`);
        }
      },
    );
  },
});
