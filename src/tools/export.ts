import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { formatApiError } from '../helpers.js';
import { exportNodes, getImageFills } from '../operations/export.js';
import { inputSchemas } from '../schemas.js';
import { defineTool, toolError, toolResult, toolSummary } from './register.js';

// -- export_nodes --

defineTool({
  toolset: 'export',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'export_nodes',
      {
        description: 'Export specific nodes from a file as images. Returns temporary URLs (valid ~14 days).',
        inputSchema: inputSchemas.export_nodes,
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
        inputSchema: inputSchemas.get_image_fills,
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
