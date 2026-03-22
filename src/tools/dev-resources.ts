import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
import {
  listDevResources,
  createDevResource,
  deleteDevResource,
} from '../operations/dev-resources.js';

// -- list_dev_resources --

defineTool({
  toolset: 'components',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_dev_resources',
      {
        description: 'List dev resources (links, annotations) attached to nodes in a file. Used in Dev Mode.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          node_ids: z.array(figmaId).optional().describe('Filter by specific node IDs'),
        },
      },
      async ({ file_key, node_ids }) => {
        try {
          const result = await listDevResources(config, { file_key, node_ids });
          if (result.length === 0) return toolResult('No dev resources found.');
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
        inputSchema: {
          file_key: figmaId.describe('File key'),
          node_id: figmaId.describe('Node ID to attach the resource to'),
          name: z.string().describe('Resource name/label'),
          url: z.string().describe('Resource URL'),
        },
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
        inputSchema: {
          file_key: figmaId.describe('File key'),
          dev_resource_id: figmaId.describe('Dev resource ID (from list_dev_resources)'),
        },
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
