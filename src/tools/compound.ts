import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
import {
  fileSummary,
  workspaceOverview,
  openComments,
  cleanupStaleFiles,
  organizeProject,
  setupProjectStructure,
  seatOptimization,
  permissionAudit,
  branchCleanup,
} from '../operations/compound.js';

// -- file_summary --

defineTool({
  toolset: 'compound',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'file_summary',
      {
        description: 'Quick overview of a Figma file. Fetches pages, components, styles, and comment counts in parallel.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
        },
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
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
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
        inputSchema: {
          project_id: figmaId.describe('Project ID'),
        },
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
        inputSchema: {
          project_id: figmaId.describe('Project ID'),
          days_stale: z.number().optional().default(90).describe('Days since last modification (default: 90)'),
          dry_run: z.boolean().optional().default(true).describe('Preview only, no deletion (default: true)'),
        },
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
        inputSchema: {
          file_keys: z.array(figmaId).min(1).describe('File keys to move'),
          target_project_id: figmaId.describe('Destination project ID'),
        },
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
        inputSchema: {
          team_id: figmaId.describe('Team ID'),
          projects: z.array(z.object({
            name: z.string().describe('Project name'),
            description: z.string().optional().describe('Project description'),
          })).min(1).describe('Projects to create'),
        },
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
        inputSchema: {
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
          days_inactive: z.number().min(1).max(365).optional().default(90).describe('Days without activity to flag as inactive (default: 90)'),
          include_cost: z.boolean().optional().default(true).describe('Include cost analysis from contract rates (default: true)'),
        },
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
        inputSchema: {
          scope_type: z.enum(['project', 'team']).describe('Scope to audit'),
          scope_id: figmaId.describe('Team ID or project ID'),
          flag_external: z.boolean().optional().default(true).describe('Flag external users (default: true)'),
          org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
        },
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
        inputSchema: {
          project_id: figmaId.describe('Project ID'),
          days_stale: z.number().min(1).max(365).optional().default(60).describe('Days since last modification to flag as stale (default: 60)'),
          dry_run: z.boolean().optional().default(true).describe('Preview only, no archiving (default: true)'),
        },
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
