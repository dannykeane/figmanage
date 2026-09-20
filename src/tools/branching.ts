import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { formatApiError } from '../helpers.js';
import { createBranch, deleteBranch, listBranches } from '../operations/branching.js';
import { inputSchemas } from '../schemas.js';
import { defineTool, toolError, toolResult, toolSummary } from './register.js';

// -- list_branches --

defineTool({
  toolset: 'branching',
  auth: 'either',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_branches',
      {
        description: 'List branches of a file.',
        inputSchema: inputSchemas.list_branches,
      },
      async ({ file_key }) => {
        try {
          const result = await listBranches(config, { file_key });
          if (result.length === 0) return toolResult('No branches found.', result);
          return toolSummary(`${result.length} branch(es).`, result, 'Use create_branch to add a branch, or delete_branch to archive one.');
        } catch (e: any) {
          return toolError(`Failed to list branches: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- create_branch --

defineTool({
  toolset: 'branching',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'create_branch',
      {
        description: 'Create a branch from a file.',
        inputSchema: inputSchemas.create_branch,
      },
      async ({ file_key, name }) => {
        try {
          const result = await createBranch(config, { file_key, name });
          return toolSummary('Created branch.', result, 'Use get_file with the branch file key to read the branch.');
        } catch (e: any) {
          return toolError(`Failed to create branch: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- delete_branch --
// Archiving a branch is the same as trashing the branch file.

defineTool({
  toolset: 'branching',
  auth: 'cookie',
  mutates: true,
  destructive: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'delete_branch',
      {
        description: 'Archive (delete) a branch. Uses the branch file key from list_branches.',
        inputSchema: inputSchemas.delete_branch,
      },
      async ({ branch_key }) => {
        try {
          await deleteBranch(config, { branch_key });
          return toolResult(`Archived branch ${branch_key}`);
        } catch (e: any) {
          return toolError(`Failed to delete branch: ${formatApiError(e)}`);
        }
      },
    );
  },
});
