import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { formatApiError } from '../helpers.js';
import { addTeamMember, createTeam, deleteTeam, removeTeamMember, renameTeam } from '../operations/teams.js';
import { inputSchemas } from '../schemas.js';
import { defineTool, toolError, toolResult, toolSummary } from './register.js';

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
        inputSchema: inputSchemas.create_team,
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
        inputSchema: inputSchemas.rename_team,
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
        inputSchema: inputSchemas.delete_team,
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
        inputSchema: inputSchemas.add_team_member,
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
        inputSchema: inputSchemas.remove_team_member,
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
