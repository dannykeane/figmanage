import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
import { listVersions, createVersion } from '../operations/versions.js';

// -- list_versions --

defineTool({
  toolset: 'versions',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_versions',
      {
        description: 'List version history for a file. Returns named snapshots and auto-saves.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
        },
      },
      async ({ file_key }) => {
        try {
          const result = await listVersions(config, { file_key });
          if (result.length === 0) return toolResult('No versions found.');
          return toolSummary(`${result.length} version(s).`, result, 'Use create_version to add a named checkpoint.');
        } catch (e: any) {
          return toolError(`Failed to list versions: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- create_version --

defineTool({
  toolset: 'versions',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'create_version',
      {
        description: 'Create a named version (checkpoint) in a file\'s history.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          title: z.string().describe('Version title/label'),
          description: z.string().optional().describe('Version description'),
        },
      },
      async ({ file_key, title, description }) => {
        try {
          const result = await createVersion(config, { file_key, title, description });
          return toolSummary(`Created version "${result.label}".`, result);
        } catch (e: any) {
          return toolError(`Failed to create version: ${formatApiError(e)}`);
        }
      },
    );
  },
});

