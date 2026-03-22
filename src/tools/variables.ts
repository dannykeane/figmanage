import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
import {
  listLocalVariables,
  listPublishedVariables,
  updateVariables,
  isEnterpriseScopeError,
  ENTERPRISE_ERROR,
} from '../operations/variables.js';

// -- list_local_variables --

defineTool({
  toolset: 'variables',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_local_variables',
      {
        description: 'List local variables and variable collections in a file. Requires Enterprise plan.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
        },
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
        inputSchema: {
          file_key: figmaId.describe('File key'),
        },
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
        inputSchema: {
          file_key: figmaId.describe('File key'),
          variable_collections: z.array(z.record(z.any())).optional().describe('Collection operations (action: CREATE, UPDATE, or DELETE)'),
          variable_modes: z.array(z.record(z.any())).optional().describe('Mode operations (action: CREATE, UPDATE, or DELETE)'),
          variables: z.array(z.record(z.any())).optional().describe('Variable operations (action: CREATE, UPDATE, or DELETE)'),
          variable_mode_values: z.array(z.record(z.any())).optional().describe('Value assignments (action: CREATE, UPDATE, or DELETE)'),
        },
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
