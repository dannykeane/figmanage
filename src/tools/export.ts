import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
import { exportNodes, getImageFills } from '../operations/export.js';

// -- export_nodes --

defineTool({
  toolset: 'export',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'export_nodes',
      {
        description: 'Export specific nodes from a file as images. Returns temporary URLs (valid ~14 days).',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          node_ids: z.array(figmaId).min(1).describe('Node IDs to export (e.g. ["1:2", "3:4"])'),
          format: z.enum(['png', 'svg', 'pdf', 'jpg']).optional().describe('Image format (default: png)'),
          scale: z.number().optional().describe('Scale factor, 0.01-4 (default: 1)'),
        },
      },
      async ({ file_key, node_ids, format, scale }) => {
        try {
          const result = await exportNodes(config, { file_key, node_ids, format, scale });
          return toolSummary(`Exported ${result.length} node(s). URLs valid ~14 days.`, result);
        } catch (e: any) {
          return toolError(`Failed to export nodes: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- get_image_fills --

defineTool({
  toolset: 'export',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'get_image_fills',
      {
        description: 'Get download URLs for all images used as fills in a file.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
        },
      },
      async ({ file_key }) => {
        try {
          const results = await getImageFills(config, { file_key });
          if (results.length === 0) return toolResult('No image fills in this file.');
          return toolSummary(`${results.length} image fill(s).`, results);
        } catch (e: any) {
          return toolError(`Failed to get image fills: ${formatApiError(e)}`);
        }
      },
    );
  },
});
