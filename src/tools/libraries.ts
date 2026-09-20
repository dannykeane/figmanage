import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { formatApiError } from '../helpers.js';
import { listOrgLibraries } from '../operations/libraries.js';
import { inputSchemas } from '../schemas.js';
import { defineTool, toolError, toolResult, toolSummary } from './register.js';

// -- list_org_libraries --

defineTool({
  toolset: 'libraries',
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_org_libraries',
      {
        description: 'List all design system libraries in the org with sharing group info.',
        inputSchema: inputSchemas.list_org_libraries,
      },
      async ({ org_id }) => {
        try {
          const result = await listOrgLibraries(config, { org_id });
          if (result.length === 0) return toolResult('No libraries found.', result);
          return toolSummary(`${result.length} library/libraries.`, result, 'Use library_usage to see adoption metrics.');
        } catch (e: any) {
          return toolError(`Failed to list org libraries: ${formatApiError(e)}`);
        }
      },
    );
  },
});
