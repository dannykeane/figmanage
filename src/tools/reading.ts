import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
import { getFile, getNodes } from '../operations/reading.js';

// -- get_file --

defineTool({
  toolset: 'reading',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'get_file',
      {
        description: 'Read file contents as a node tree. Use depth to limit response size (full trees can be very large). depth=1 returns pages only. To read a branch, use the branch file key from list_branches.',
        inputSchema: {
          file_key: figmaId.describe('File key (or branch file key from list_branches)'),
          depth: z.number().int().optional().describe('Tree depth limit. 0=root, 1=pages, 2=top-level frames. Omit for full tree.'),
          node_id: figmaId.optional().describe('Start from a specific node instead of document root'),
        },
      },
      async ({ file_key, depth, node_id }) => {
        try {
          const result = await getFile(config, { file_key, depth, node_id });
          const name = result.name || 'Untitled';
          const pages = result.document?.children?.length || 0;
          return toolSummary(`${name}: ${pages} page(s). Use depth parameter to limit response size.`, result);
        } catch (e: any) {
          return toolError(`Failed to get file: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- get_nodes --

defineTool({
  toolset: 'reading',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'get_nodes',
      {
        description: 'Read specific nodes from a file. Returns the full node tree for each ID including type, name, layout properties, fills, strokes, and children.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          node_ids: z.array(figmaId).min(1).describe('Node IDs to fetch'),
          depth: z.number().int().optional().describe('Depth limit per node'),
        },
      },
      async ({ file_key, node_ids, depth }) => {
        try {
          const result = await getNodes(config, { file_key, node_ids, depth });
          const nodeCount = result.nodes ? Object.keys(result.nodes).length : 0;
          return toolSummary(`${nodeCount} node(s) returned.`, result);
        } catch (e: any) {
          return toolError(`Failed to get nodes: ${formatApiError(e)}`);
        }
      },
    );
  },
});
