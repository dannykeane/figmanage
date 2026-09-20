import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { formatApiError } from '../helpers.js';
import {
  branchCleanup,
  cleanupStaleFiles,
  fileSummary,
  openComments,
  organizeProject,
  permissionAudit,
  seatOptimization,
  setupProjectStructure,
  workspaceOverview,
} from '../operations/compound.js';
import { inputSchemas } from '../schemas.js';
import { defineTool, toolError, toolSummary } from './register.js';

// -- file_summary --

defineTool({
  toolset: 'compound',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'file_summary',
      {
        description: 'Quick overview of a Figma file. Fetches pages, components, styles, and comment counts in parallel.',
        inputSchema: inputSchemas.file_summary,
      },
      async ({ file_key }) => {
        try {
          const result = await fileSummary(config, { file_key });
          return toolSummary(
            `${result.name}: ${result.pages?.length || 0} pages, ${result.component_count} components, ${result.unresolved_comment_count} unresolved comments.`,
            result,
          );
        } catch (e: any) {
          return toolError(`Failed to summarize file: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- workspace_overview --

defineTool({
  toolset: 'compound',
  auth: 'cookie',
  adminOnly: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'workspace_overview',
      {
        description: 'Full org snapshot: teams with member/project counts, seat breakdown, and billing summary.',
        inputSchema: inputSchemas.workspace_overview,
      },
      async ({ org_id }) => {
        try {
          const result = await workspaceOverview(config, { org_id });
          const teamCount = result.teams?.length || 0;
          return toolSummary(`${teamCount} team(s). Seats and billing included.`, result);
        } catch (e: any) {
          return toolError(`Failed to fetch workspace overview: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- open_comments --

defineTool({
  toolset: 'compound',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'open_comments',
      {
        description: 'Aggregated unresolved comments across all files in a project. Checks up to 20 files.',
        inputSchema: inputSchemas.open_comments,
      },
      async ({ project_id }) => {
        try {
          const result = await openComments(config, { project_id });
          const total = result.total_unresolved || 0;
          const fileCount = result.files?.length || 0;
          return toolSummary(
            `${total} unresolved comment(s) across ${fileCount} file(s).`,
            result,
            'Use post_comment with file_key and parent_id to reply.',
          );
        } catch (e: any) {
          return toolError(`Failed to fetch open comments: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- cleanup_stale_files --

defineTool({
  toolset: 'compound',
  auth: 'either',
  mutates: true,
  destructive: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'cleanup_stale_files',
      {
        description: 'Find files not modified in N days and optionally trash them. dry_run=true (default) previews which files would be trashed without trashing them. Set dry_run=false to execute.',
        inputSchema: inputSchemas.cleanup_stale_files,
      },
      async ({ project_id, days_stale, dry_run: rawDryRun }) => {
        try {
          const result = await cleanupStaleFiles(config, {
            project_id,
            days_stale: days_stale ?? 90,
            dry_run: rawDryRun ?? true,
          });
          const count = result.stale_files?.length || 0;
          const action = result.dry_run ? `${count} stale file(s) found. Set dry_run=false to trash them.` : `Trashed ${result.trashed_count || 0} file(s).`;
          return toolSummary(action, result);
        } catch (e: any) {
          return toolError(`Failed to cleanup stale files: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- organize_project --

defineTool({
  toolset: 'compound',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'organize_project',
      {
        description: 'Move files into a target project in a single batch. Files are moved (not copied) from their current project.',
        inputSchema: inputSchemas.organize_project,
      },
      async ({ file_keys, target_project_id }) => {
        try {
          const result = await organizeProject(config, { file_keys, target_project_id });
          return toolSummary(`Moved ${result.moved} file(s) to project ${result.target_project_id}.`, result);
        } catch (e: any) {
          return toolError(`Failed to organize project: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- setup_project_structure --

defineTool({
  toolset: 'compound',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'setup_project_structure',
      {
        description: 'Create multiple projects in a team from a plan. Optionally set descriptions.',
        inputSchema: inputSchemas.setup_project_structure,
      },
      async ({ team_id, projects }) => {
        try {
          const result = await setupProjectStructure(config, { team_id, projects });
          return toolSummary(`Created ${result.created?.length || 0} project(s).`, result);
        } catch (e: any) {
          return toolError(`Failed to setup project structure: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- seat_optimization --

defineTool({
  toolset: 'compound',
  auth: 'cookie',
  adminOnly: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'seat_optimization',
      {
        description: 'Identify inactive paid seats and calculate potential savings. Fetches members, seat counts, and pricing to find optimization opportunities.',
        inputSchema: inputSchemas.seat_optimization,
      },
      async ({ org_id, days_inactive, include_cost }) => {
        try {
          const result = await seatOptimization(config, {
            org_id,
            days_inactive: days_inactive ?? 90,
            include_cost: include_cost ?? true,
          });
          const inactive = result.summary?.inactive_paid || 0;
          const savingsCents = result.summary?.monthly_waste_cents || 0;
          const savingsStr = savingsCents > 0 ? ` Potential savings: $${(savingsCents / 100).toFixed(2)}/mo.` : '';
          return toolSummary(`${inactive} inactive paid seat(s).${savingsStr}`, result, 'Use change_seat to downgrade inactive users, or offboard_user for full removal.');
        } catch (e: any) {
          return toolError(`Failed to analyze seat optimization: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- permission_audit --

defineTool({
  toolset: 'compound',
  auth: 'cookie',
  adminOnly: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'permission_audit',
      {
        description: 'Audit permissions across a team or project. Scans files for external editors, open link access, and elevated individual permissions.',
        inputSchema: inputSchemas.permission_audit,
      },
      async ({ scope_type, scope_id, flag_external, org_id }) => {
        try {
          const result = await permissionAudit(config, {
            scope_type,
            scope_id,
            flag_external: flag_external ?? true,
            org_id,
          });
          const flagCount = result.flags?.length || 0;
          return toolSummary(
            `${flagCount} issue(s) flagged.`,
            result,
            flagCount > 0 ? 'Use revoke_access or set_permissions to address flagged issues.' : undefined,
          );
        } catch (e: any) {
          return toolError(`Failed to audit permissions: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- branch_cleanup --

defineTool({
  toolset: 'compound',
  auth: 'either',
  mutates: true,
  destructive: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'branch_cleanup',
      {
        description: 'Find stale branches across a project and optionally archive them. dry_run=true (default) previews which branches would be archived. Archives move branch files to trash (recoverable).',
        inputSchema: inputSchemas.branch_cleanup,
      },
      async ({ project_id, days_stale, dry_run: rawDryRun }) => {
        try {
          const result = await branchCleanup(config, {
            project_id,
            days_stale: days_stale ?? 60,
            dry_run: rawDryRun ?? true,
          });
          const stale = result.stale_branches?.length || 0;
          const action = result.dry_run ? `${stale} stale branch(es) found. Set dry_run=false to archive.` : `Archived ${result.archived_count || 0} branch(es).`;
          return toolSummary(action, result);
        } catch (e: any) {
          return toolError(`Failed to cleanup branches: ${formatApiError(e)}`);
        }
      },
    );
  },
});
