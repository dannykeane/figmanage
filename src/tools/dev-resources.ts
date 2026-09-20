import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { formatApiError } from '../helpers.js';
import {
  createDevResource,
  deleteDevResource,
  listDevResources,
} from '../operations/dev-resources.js';
import { inputSchemas } from '../schemas.js';
import { defineTool, toolError, toolResult, toolSummary } from './register.js';

// -- list_dev_resources --

defineTool({
  toolset: 'components',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_dev_resources',
      {
        description: 'List dev resources (links, annotations) attached to nodes in a file. Used in Dev Mode.',
        inputSchema: inputSchemas.list_dev_resources,
      },
      async ({ file_key, node_ids }) => {
        try {
          const result = await listDevResources(config, { file_key, node_ids });
          if (result.length === 0) return toolResult('No dev resources found.', result);
          return toolSummary(`${result.length} dev resource(s).`, result, 'Use create_dev_resource to add, or delete_dev_resource to remove.');
        } catch (e: any) {
          return toolError(`Failed to list dev resources: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- create_dev_resource --

defineTool({
  toolset: 'components',
  auth: 'pat',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'create_dev_resource',
      {
        description: 'Create a dev resource (link/annotation) on a node. Visible in Dev Mode.',
        inputSchema: inputSchemas.create_dev_resource,
      },
      async ({ file_key, node_id, name, url }) => {
        try {
          const result = await createDevResource(config, { file_key, node_id, name, url });
          return toolSummary('Created dev resource.', result);
        } catch (e: any) {
          return toolError(`Failed to create dev resource: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- delete_dev_resource --

defineTool({
  toolset: 'components',
  auth: 'pat',
  mutates: true,
  destructive: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'delete_dev_resource',
      {
        description: 'Delete a dev resource from a file.',
        inputSchema: inputSchemas.delete_dev_resource,
      },
      async ({ file_key, dev_resource_id }) => {
        try {
          await deleteDevResource(config, { file_key, dev_resource_id });
          return toolResult(`Deleted dev resource ${dev_resource_id}.`);
        } catch (e: any) {
          return toolError(`Failed to delete dev resource: ${formatApiError(e)}`);
        }
      },
    );
  },
});
