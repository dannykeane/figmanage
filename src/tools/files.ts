import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { formatApiError } from '../helpers.js';
import {
  createFile,
  duplicateFile,
  favoriteFile,
  moveFiles,
  renameFile,
  restoreFiles,
  setLinkAccess,
  trashFiles,
} from '../operations/files.js';
import { inputSchemas } from '../schemas.js';
import { defineTool, toolError, toolResult, toolSummary } from './register.js';

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
        inputSchema: inputSchemas.create_file,
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
        inputSchema: inputSchemas.rename_file,
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
        inputSchema: inputSchemas.move_files,
      },
      async ({ file_keys, destination_project_id }) => {
        try {
          const result = await moveFiles(config, { file_keys, destination_project_id });
          let msg = `Moved ${result.succeeded} file(s) to project ${destination_project_id}`;
          if (result.failed > 0) msg += `. ${result.failed} failed: ${JSON.stringify(result.errors)}`;
          return toolResult(msg, result);
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
        inputSchema: inputSchemas.duplicate_file,
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
        inputSchema: inputSchemas.trash_files,
      },
      async ({ file_keys }) => {
        try {
          const result = await trashFiles(config, { file_keys });
          return toolResult(`Trashed ${result.succeeded} file(s)`, result);
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
        inputSchema: inputSchemas.restore_files,
      },
      async ({ file_keys }) => {
        try {
          const result = await restoreFiles(config, { file_keys });
          let msg = `Restored ${result.succeeded} file(s)`;
          if (result.failed > 0) msg += `. ${result.failed} failed: ${JSON.stringify(result.errors)}`;
          return toolResult(msg, result);
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
        inputSchema: inputSchemas.favorite_file,
      },
      async ({ file_key, favorited }) => {
        try {
          const result = await favoriteFile(config, { file_key, favorited });
          return toolResult(`${result.favorited ? 'Favorited' : 'Unfavorited'} file ${file_key}`, result);
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
        inputSchema: inputSchemas.set_link_access,
      },
      async ({ file_key, link_access }) => {
        try {
          const result = await setLinkAccess(config, { file_key, link_access });
          return toolResult(`Set link access to "${result.link_access}" on file ${file_key}`, result);
        } catch (e: any) {
          return toolError(`Failed to set link access: ${formatApiError(e)}`);
        }
      },
    );
  },
});
