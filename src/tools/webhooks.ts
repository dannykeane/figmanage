import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { formatApiError } from '../helpers.js';
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  updateWebhook,
  webhookRequests,
} from '../operations/webhooks.js';
import { inputSchemas } from '../schemas.js';
import { defineTool, toolError, toolResult, toolSummary } from './register.js';



// -- list_webhooks --

defineTool({
  toolset: 'webhooks',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_webhooks',
      {
        description: 'List webhook subscriptions for a team. Returns webhook IDs, endpoints, event types, and status.',
        inputSchema: inputSchemas.list_webhooks,
      },
      async ({ team_id }) => {
        try {
          const result = await listWebhooks(config, { team_id });
          if (result.count === 0) return toolResult('No webhooks configured for this team.', result);
          return toolSummary(`${result.count} webhook(s).`, result, 'Use webhook_requests to check delivery history, create_webhook to add, or update_webhook/delete_webhook to manage.');
        } catch (e: any) {
          return toolError(`Failed to list webhooks: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- create_webhook --

defineTool({
  toolset: 'webhooks',
  auth: 'pat',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'create_webhook',
      {
        description: 'Create a webhook subscription for a team.',
        inputSchema: inputSchemas.create_webhook,
      },
      async ({ team_id, event_type, endpoint, passcode, description }) => {
        try {
          const result = await createWebhook(config, { team_id, event_type, endpoint, passcode, description });
          return toolSummary(`Created webhook ${result.id || 'unknown'} for ${result.event_type || event_type} events.`, result);
        } catch (e: any) {
          return toolError(`Failed to create webhook: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- update_webhook --

defineTool({
  toolset: 'webhooks',
  auth: 'pat',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'update_webhook',
      {
        description: "Update a webhook's endpoint, event type, passcode, description, or status (ACTIVE/PAUSED).",
        inputSchema: inputSchemas.update_webhook,
      },
      async ({ webhook_id, event_type, endpoint, passcode, description, status }) => {
        try {
          const result = await updateWebhook(config, { webhook_id, event_type, endpoint, passcode, description, status });
          return toolSummary(`Updated webhook ${result.id || webhook_id}.`, result);
        } catch (e: any) {
          return toolError(`Failed to update webhook: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- webhook_requests --

defineTool({
  toolset: 'webhooks',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'webhook_requests',
      {
        description: 'List recent webhook delivery attempts (last 7 days). Shows payload, response status, and errors.',
        inputSchema: inputSchemas.webhook_requests,
      },
      async ({ webhook_id }) => {
        try {
          const result = await webhookRequests(config, { webhook_id });
          if (result.count === 0) return toolResult('No webhook deliveries in the last 7 days.', result);
          return toolSummary(`${result.count} delivery attempt(s).`, result, 'Use update_webhook to fix failing endpoints.');
        } catch (e: any) {
          return toolError(`Failed to list webhook requests: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- delete_webhook --

defineTool({
  toolset: 'webhooks',
  auth: 'pat',
  mutates: true,
  destructive: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'delete_webhook',
      {
        description: 'Permanently delete a webhook. The webhook stops receiving events immediately. Cannot be undone.',
        inputSchema: inputSchemas.delete_webhook,
      },
      async ({ webhook_id }) => {
        try {
          await deleteWebhook(config, { webhook_id });
          return toolResult(`Deleted webhook ${webhook_id}`);
        } catch (e: any) {
          return toolError(`Failed to delete webhook: ${formatApiError(e)}`);
        }
      },
    );
  },
});
