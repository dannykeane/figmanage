import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { formatApiError } from '../helpers.js';
import { componentUsage, libraryUsage } from '../operations/analytics.js';
import { inputSchemas } from '../schemas.js';
import { defineTool, toolError, toolSummary } from './register.js';

// -- library_usage --

defineTool({
  toolset: 'analytics',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'library_usage',
      {
        description: 'Team-level library adoption metrics. Shows how a published library is used across teams.',
        inputSchema: inputSchemas.library_usage,
      },
      async ({ library_file_key, days }) => {
        try {
          const result = await libraryUsage(config, { library_file_key, days });
          return toolSummary('Library usage:', result);
        } catch (e: any) {
          return toolError(`Failed to fetch library usage: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- component_usage --

defineTool({
  toolset: 'analytics',
  adminOnly: true,
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'component_usage',
      {
        description: 'Per-file component usage analytics. Shows which files use a specific component.',
        inputSchema: inputSchemas.component_usage,
      },
      async ({ component_key, org_id }) => {
        try {
          const result = await componentUsage(config, { component_key, org_id });
          return toolSummary('Component usage:', result);
        } catch (e: any) {
          return toolError(`Failed to fetch component usage: ${formatApiError(e)}`);
        }
      },
    );
  },
});
