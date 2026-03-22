import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
import { libraryUsage, componentUsage } from '../operations/analytics.js';

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
        inputSchema: {
          library_file_key: figmaId.describe('File key of the library'),
          days: z.number().optional().describe('Lookback period in days (default 30). Suggest 30, 60, 90, or 365.'),
        },
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
        inputSchema: {
          component_key: figmaId.describe('Component key'),
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
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
