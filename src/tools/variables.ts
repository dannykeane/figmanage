import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { formatApiError } from '../helpers.js';
import {
  ENTERPRISE_ERROR,
  isEnterpriseScopeError,
  listLocalVariables,
  listPublishedVariables,
  updateVariables,
} from '../operations/variables.js';
import { inputSchemas } from '../schemas.js';
import { defineTool, toolError, toolSummary } from './register.js';

// -- list_local_variables --

defineTool({
  toolset: 'variables',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_local_variables',
      {
        description: 'List local variables and variable collections in a file. Requires Enterprise plan.',
        inputSchema: inputSchemas.list_local_variables,
      },
      async ({ file_key }) => {
        try {
          const result = await listLocalVariables(config, { file_key });
          const vars = result.variables ? Object.keys(result.variables).length : 0;
          const collections = result.variableCollections ? Object.keys(result.variableCollections).length : 0;
          return toolSummary(`${vars} variable(s) in ${collections} collection(s).`, result);
        } catch (e: any) {
          if (isEnterpriseScopeError(e)) return toolError(ENTERPRISE_ERROR);
          return toolError(`Failed to list local variables: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_published_variables --

defineTool({
  toolset: 'variables',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_published_variables',
      {
        description: 'List published variables from a library file. Requires Enterprise plan.',
        inputSchema: inputSchemas.list_published_variables,
      },
      async ({ file_key }) => {
        try {
          const result = await listPublishedVariables(config, { file_key });
          const vars = result.variables ? Object.keys(result.variables).length : 0;
          return toolSummary(`${vars} published variable(s).`, result);
        } catch (e: any) {
          if (isEnterpriseScopeError(e)) return toolError(ENTERPRISE_ERROR);
          return toolError(`Failed to list published variables: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- update_variables --

defineTool({
  toolset: 'variables',
  auth: 'pat',
  mutates: true,
  destructive: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'update_variables',
      {
        description: 'Bulk create, update, or delete variables, collections, modes, and mode values. Requires Enterprise plan. Each operation object needs an action field (CREATE, UPDATE, or DELETE). Deletions are immediate and cannot be undone -- list variables first to verify IDs.',
        inputSchema: inputSchemas.update_variables,
      },
      async ({ file_key, variable_collections, variable_modes, variables, variable_mode_values }) => {
        try {
          const result = await updateVariables(config, {
            file_key,
            variable_collections,
            variable_modes,
            variables,
            variable_mode_values,
          });
          return toolSummary('Variables updated.', result, 'Use list_local_variables to verify changes.');
        } catch (e: any) {
          if (isEnterpriseScopeError(e)) return toolError(ENTERPRISE_ERROR);
          return toolError(`Failed to update variables: ${formatApiError(e)}`);
        }
      },
    );
  },
});
