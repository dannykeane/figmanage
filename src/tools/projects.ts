import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
import {
  createProject,
  renameProject,
  moveProject,
  trashProject,
  restoreProject,
  setProjectDescription,
} from '../operations/projects.js';

// -- create_project --

defineTool({
  toolset: 'projects',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'create_project',
      {
        description: 'Create a new project (folder) in a team.',
        inputSchema: {
          team_id: figmaId.describe('Team ID to create the project in'),
          name: z.string().describe('Project name'),
        },
      },
      async ({ team_id, name }) => {
        try {
          const result = await createProject(config, { team_id, name });
          return toolSummary(`Created project "${result.name}".`, result, 'Use list_files to see files, or create_file to add one.');
        } catch (e: any) {
          return toolError(`Failed to create project: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- rename_project --

defineTool({
  toolset: 'projects',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'rename_project',
      {
        description: 'Rename a project (folder).',
        inputSchema: {
          project_id: figmaId.describe('Project ID'),
          name: z.string().describe('New name'),
        },
      },
      async ({ project_id, name }) => {
        try {
          await renameProject(config, { project_id, name });
          return toolResult(`Renamed project ${project_id} to "${name}"`);
        } catch (e: any) {
          return toolError(`Failed to rename project: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- move_project --

defineTool({
  toolset: 'projects',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'move_project',
      {
        description: 'Move a project to a different team.',
        inputSchema: {
          project_id: figmaId.describe('Project ID to move'),
          destination_team_id: figmaId.describe('Destination team ID'),
        },
      },
      async ({ project_id, destination_team_id }) => {
        try {
          await moveProject(config, { project_id, destination_team_id });
          return toolResult(`Moved project ${project_id} to team ${destination_team_id}`);
        } catch (e: any) {
          return toolError(`Failed to move project: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- trash_project --

defineTool({
  toolset: 'projects',
  auth: 'cookie',
  mutates: true,
  destructive: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'trash_project',
      {
        description: 'Move a project and all its files to trash. Recoverable via restore_project.',
        inputSchema: {
          project_id: figmaId.describe('Project ID to trash'),
        },
      },
      async ({ project_id }) => {
        try {
          await trashProject(config, { project_id });
          return toolResult(`Trashed project ${project_id}`);
        } catch (e: any) {
          return toolError(`Failed to trash project: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- restore_project --

defineTool({
  toolset: 'projects',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'restore_project',
      {
        description: 'Restore a project from trash.',
        inputSchema: {
          project_id: figmaId.describe('Project ID to restore'),
        },
      },
      async ({ project_id }) => {
        try {
          await restoreProject(config, { project_id });
          return toolResult(`Restored project ${project_id}`);
        } catch (e: any) {
          return toolError(`Failed to restore project: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- set_project_description --

defineTool({
  toolset: 'projects',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'set_project_description',
      {
        description: 'Set or update a project description.',
        inputSchema: {
          project_id: figmaId.describe('Project ID'),
          description: z.string().describe('New description text'),
        },
      },
      async ({ project_id, description }) => {
        try {
          await setProjectDescription(config, { project_id, description });
          return toolResult(`Updated description for project ${project_id}`);
        } catch (e: any) {
          return toolError(`Failed to set description: ${formatApiError(e)}`);
        }
      },
    );
  },
});
