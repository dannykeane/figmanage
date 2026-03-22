import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
import {
  createFile,
  renameFile,
  moveFiles,
  duplicateFile,
  trashFiles,
  restoreFiles,
  favoriteFile,
  setLinkAccess,
} from '../operations/files.js';

// -- create_file --

defineTool({
  toolset: 'files',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'create_file',
      {
        description: 'Create a new Figma file in a project. Supports design, whiteboard, slides, sites.',
        inputSchema: {
          project_id: figmaId.describe('Project (folder) ID to create the file in'),
          editor_type: z.enum(['design', 'whiteboard', 'slides', 'sites']).optional().describe('File type (default: design)'),
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
      },
      async ({ project_id, editor_type, org_id }) => {
        try {
          const result = await createFile(config, { project_id, editor_type, org_id });
          return toolSummary(`Created ${result.editor_type || 'design'} file.`, result);
        } catch (e: any) {
          return toolError(`Failed to create file: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- rename_file --

defineTool({
  toolset: 'files',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'rename_file',
      {
        description: 'Rename a Figma file.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          name: z.string().describe('New name'),
        },
      },
      async ({ file_key, name }) => {
        try {
          await renameFile(config, { file_key, name });
          return toolResult(`Renamed to "${name}"`);
        } catch (e: any) {
          return toolError(`Failed to rename file: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- move_files --

defineTool({
  toolset: 'files',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'move_files',
      {
        description: 'Move one or more files to a different project. Supports batch moves.',
        inputSchema: {
          file_keys: z.array(figmaId).min(1).describe('Array of file keys to move'),
          destination_project_id: figmaId.describe('Destination project (folder) ID'),
        },
      },
      async ({ file_keys, destination_project_id }) => {
        try {
          const result = await moveFiles(config, { file_keys, destination_project_id });
          let msg = `Moved ${result.succeeded} file(s) to project ${destination_project_id}`;
          if (result.failed > 0) msg += `. ${result.failed} failed: ${JSON.stringify(result.errors)}`;
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to move files: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- duplicate_file --

defineTool({
  toolset: 'files',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'duplicate_file',
      {
        description: 'Duplicate a file. Optionally specify a destination project.',
        inputSchema: {
          file_key: figmaId.describe('File key to duplicate'),
          project_id: figmaId.optional().describe('Destination project ID (optional, defaults to same project)'),
        },
      },
      async ({ file_key, project_id }) => {
        try {
          const result = await duplicateFile(config, { file_key, project_id });
          return toolSummary(`Duplicated file.`, result);
        } catch (e: any) {
          return toolError(`Failed to duplicate file: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- trash_files --

defineTool({
  toolset: 'files',
  auth: 'cookie',
  mutates: true,
  destructive: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'trash_files',
      {
        description: 'Move files to trash (recoverable via restore_files). Supports batch operations.',
        inputSchema: {
          file_keys: z.array(figmaId).min(1).describe('Array of file keys to trash'),
        },
      },
      async ({ file_keys }) => {
        try {
          const result = await trashFiles(config, { file_keys });
          return toolResult(`Trashed ${result.succeeded} file(s)`);
        } catch (e: any) {
          return toolError(`Failed to trash files: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- restore_files --

defineTool({
  toolset: 'files',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'restore_files',
      {
        description: 'Restore files from trash.',
        inputSchema: {
          file_keys: z.array(figmaId).min(1).describe('Array of file keys to restore'),
        },
      },
      async ({ file_keys }) => {
        try {
          const result = await restoreFiles(config, { file_keys });
          let msg = `Restored ${result.succeeded} file(s)`;
          if (result.failed > 0) msg += `. ${result.failed} failed: ${JSON.stringify(result.errors)}`;
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to restore files: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- favorite_file --

defineTool({
  toolset: 'files',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'favorite_file',
      {
        description: 'Add or remove a file from your sidebar favorites.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          favorited: z.boolean().optional().describe('true to favorite, false to unfavorite (default: true)'),
        },
      },
      async ({ file_key, favorited }) => {
        try {
          const result = await favoriteFile(config, { file_key, favorited });
          return toolResult(`${result.favorited ? 'Favorited' : 'Unfavorited'} file ${file_key}`);
        } catch (e: any) {
          return toolError(`Failed to toggle favorite: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- set_link_access --

defineTool({
  toolset: 'files',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'set_link_access',
      {
        description: 'Set link access on a file. Use "inherit" to remove custom access and fall back to project/team defaults.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          link_access: z.enum(['inherit', 'view', 'edit', 'org_view', 'org_edit']).optional().describe('Link access level (default: inherit)'),
        },
      },
      async ({ file_key, link_access }) => {
        try {
          const result = await setLinkAccess(config, { file_key, link_access });
          return toolResult(`Set link access to "${result.link_access}" on file ${file_key}`);
        } catch (e: any) {
          return toolError(`Failed to set link access: ${formatApiError(e)}`);
        }
      },
    );
  },
});
