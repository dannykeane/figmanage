import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { formatApiError } from '../helpers.js';
import {
  approveRoleRequest,
  denyRoleRequest,
  getPermissions,
  listRoleRequests,
  revokeAccess,
  setPermissions,
  share,
} from '../operations/permissions.js';
import { inputSchemas } from '../schemas.js';
import { defineTool, toolError, toolResult, toolSummary } from './register.js';

// -- get_permissions --

defineTool({
  toolset: 'permissions',
  auth: 'cookie',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'get_permissions',
      {
        description: 'See who has access to a file, project, or team. Returns users with roles and role IDs.',
        inputSchema: inputSchemas.get_permissions,
      },
      async ({ resource_type, resource_id }) => {
        try {
          const result = await getPermissions(config, { resource_type, resource_id });
          return toolSummary(`${result.length} user(s) with access.`, result, 'Use set_permissions or revoke_access to modify.');
        } catch (e: any) {
          return toolError(`Failed to get permissions: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- set_permissions --

defineTool({
  toolset: 'permissions',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'set_permissions',
      {
        description: 'Change access level for a user on a file, project, or team. Looks up the role by user_id.',
        inputSchema: inputSchemas.set_permissions,
      },
      async ({ resource_type, resource_id, user_id, role }) => {
        try {
          const msg = await setPermissions(config, { resource_type, resource_id, user_id, role });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to set permissions: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- share --

defineTool({
  toolset: 'permissions',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'share',
      {
        description: 'Share a file or project with someone by email. Sends an invite.',
        inputSchema: inputSchemas.share,
      },
      async ({ resource_type, resource_id, email, role }) => {
        try {
          const result = await share(config, { resource_type, resource_id, email, role });
          let msg = `Invited ${result.email} as ${result.role} on ${result.resource_type} ${result.resource_id}`;
          if (result.role_id) msg += ` (role_id: ${result.role_id})`;
          return toolResult(msg, result);
        } catch (e: any) {
          return toolError(`Failed to share: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- revoke_access --

defineTool({
  toolset: 'permissions',
  auth: 'cookie',
  mutates: true,
  destructive: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'revoke_access',
      {
        description: "Remove a user's access to a file, project, or team. The user loses access immediately.",
        inputSchema: inputSchemas.revoke_access,
      },
      async ({ resource_type, resource_id, user_id }) => {
        try {
          const msg = await revokeAccess(config, { resource_type, resource_id, user_id });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to revoke access: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_role_requests --

defineTool({
  toolset: 'permissions',
  auth: 'cookie',
  adminOnly: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_role_requests',
      {
        description: 'List pending file access requests. These come through the notification system.',
        inputSchema: inputSchemas.list_role_requests,
      },
      async () => {
        try {
          const result = await listRoleRequests(config);
          if (result.length === 0) return toolResult('No pending access requests.', result);
          return toolSummary(`${result.length} pending request(s).`, result, 'Use approve_role_request or deny_role_request.');
        } catch (e: any) {
          return toolError(`Failed to list role requests: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- approve_role_request --

defineTool({
  toolset: 'permissions',
  auth: 'cookie',
  mutates: true,
  adminOnly: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'approve_role_request',
      {
        description: 'Approve a pending file access request by notification ID.',
        inputSchema: inputSchemas.approve_role_request,
      },
      async ({ notification_id }) => {
        try {
          const msg = await approveRoleRequest(config, { notification_id });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to approve request: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- deny_role_request --

defineTool({
  toolset: 'permissions',
  auth: 'cookie',
  mutates: true,
  adminOnly: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'deny_role_request',
      {
        description: 'Decline a pending file access request by notification ID.',
        inputSchema: inputSchemas.deny_role_request,
      },
      async ({ notification_id }) => {
        try {
          const msg = await denyRoleRequest(config, { notification_id });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to deny request: ${formatApiError(e)}`);
        }
      },
    );
  },
});
