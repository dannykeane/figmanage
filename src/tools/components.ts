import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
import {
  listFileComponents,
  listFileStyles,
  listTeamComponents,
  listTeamStyles,
} from '../operations/components.js';

// -- list_file_components --

defineTool({
  toolset: 'components',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_file_components',
      {
        description: 'List components published from a file. Only published library components appear -- local unpublished components are not included.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
        },
      },
      async ({ file_key }) => {
        try {
          const result = await listFileComponents(config, { file_key });
          if (result.count === 0) return toolResult('No published components in this file. Components must be published to appear.');
          return toolSummary(`${result.count} published component(s).`, result);
        } catch (e: any) {
          return toolError(`Failed to list file components: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_file_styles --

defineTool({
  toolset: 'components',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_file_styles',
      {
        description: 'List styles published from a file. Only published library styles appear.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
        },
      },
      async ({ file_key }) => {
        try {
          const result = await listFileStyles(config, { file_key });
          if (result.count === 0) return toolResult('No published styles in this file.');
          return toolSummary(`${result.count} published style(s).`, result);
        } catch (e: any) {
          return toolError(`Failed to list file styles: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_team_components --

defineTool({
  toolset: 'components',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_team_components',
      {
        description: 'List published components across a team. Pass the cursor from the response\'s pagination object to fetch the next page.',
        inputSchema: {
          team_id: figmaId.describe('Team ID'),
          page_size: z.number().optional().default(30).describe('Max items per page (default: 30)'),
          cursor: z.string().optional().describe('Pagination cursor from previous response'),
        },
      },
      async ({ team_id, page_size, cursor }) => {
        try {
          const result = await listTeamComponents(config, { team_id, page_size, cursor });
          const count = result.components?.length || 0;
          const hasMore = !!result.pagination?.cursor;
          return toolSummary(
            `${count} component(s)${hasMore ? ' (more pages available)' : ''}.`,
            result,
            hasMore ? 'Pass the cursor from pagination to fetch the next page.' : undefined,
          );
        } catch (e: any) {
          return toolError(`Failed to list team components: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_team_styles --

defineTool({
  toolset: 'components',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_team_styles',
      {
        description: 'List published styles across a team. Pass the cursor from the response\'s pagination object to fetch the next page.',
        inputSchema: {
          team_id: figmaId.describe('Team ID'),
          page_size: z.number().optional().default(30).describe('Max items per page (default: 30)'),
          cursor: z.string().optional().describe('Pagination cursor from previous response'),
        },
      },
      async ({ team_id, page_size, cursor }) => {
        try {
          const result = await listTeamStyles(config, { team_id, page_size, cursor });
          const count = result.styles?.length || 0;
          const hasMore = !!result.pagination?.cursor;
          return toolSummary(
            `${count} style(s)${hasMore ? ' (more pages available)' : ''}.`,
            result,
            hasMore ? 'Pass the cursor from pagination to fetch the next page.' : undefined,
          );
        } catch (e: any) {
          return toolError(`Failed to list team styles: ${formatApiError(e)}`);
        }
      },
    );
  },
});
