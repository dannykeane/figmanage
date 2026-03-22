import { Command } from 'commander';
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
import {
  offboardUser,
  onboardUser,
  quarterlyDesignOpsReport,
} from '../operations/compound-manager.js';
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requireAuth, requirePat, requireCookie, validateId, parsePositiveInt } from './helpers.js';

// -- compound.ts tools --

export function fileSummaryCommand(): Command {
  return new Command('summary')
    .description('Quick overview of a Figma file')
    .argument('<file-key>', 'File key')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { json?: boolean }) => {
      try {
        validateId(fileKey, 'file key');
        const config = requirePat();
        const result = await fileSummary(config, { file_key: fileKey });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });
}

export function workspaceOverviewCommand(): Command {
  return new Command('overview')
    .description('Full org snapshot: teams, seats, and billing')
    .option('--json', 'Force JSON output')
    .action(async (options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await workspaceOverview(config, {});
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });
}

export function openCommentsCommand(): Command {
  return new Command('open')
    .description('Aggregated unresolved comments across project files')
    .argument('<project-id>', 'Project ID')
    .option('--json', 'Force JSON output')
    .action(async (projectId: string, options: { json?: boolean }) => {
      try {
        validateId(projectId, 'project ID');
        const config = requirePat();
        const result = await openComments(config, { project_id: projectId });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });
}

export function cleanupStaleFilesCommand(): Command {
  return new Command('cleanup-stale')
    .description('Find and optionally trash stale files in a project')
    .argument('<project-id>', 'Project ID')
    .option('--days-stale <days>', 'Days since last modification', '90')
    .option('--execute', 'Trash stale files (default: dry run)')
    .option('--json', 'Force JSON output')
    .action(async (projectId: string, options: {
      daysStale?: string;
      execute?: boolean;
      json?: boolean;
    }) => {
      try {
        validateId(projectId, 'project ID');
        const config = requireAuth();
        const daysStale = parsePositiveInt(options.daysStale || '90', '--days-stale', 90);
        const result = await cleanupStaleFiles(config, {
          project_id: projectId,
          days_stale: daysStale,
          dry_run: !options.execute,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });
}

export function organizeProjectCommand(): Command {
  return new Command('organize')
    .description('Move multiple files into a target project')
    .requiredOption('--files <keys...>', 'File keys to move')
    .requiredOption('--target <project-id>', 'Destination project ID')
    .option('--json', 'Force JSON output')
    .action(async (options: {
      files: string[];
      target: string;
      json?: boolean;
    }) => {
      try {
        for (const key of options.files) validateId(key, 'file key');
        validateId(options.target, 'target project ID');
        const config = requireCookie();
        const result = await organizeProject(config, {
          file_keys: options.files,
          target_project_id: options.target,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });
}

export function setupProjectStructureCommand(): Command {
  return new Command('setup-structure')
    .description('Create multiple projects in a team from a JSON plan')
    .argument('<team-id>', 'Team ID')
    .requiredOption('--projects <json>', 'JSON array of {name, description?} objects')
    .option('--json', 'Force JSON output')
    .action(async (teamId: string, options: {
      projects: string;
      json?: boolean;
    }) => {
      try {
        validateId(teamId, 'team ID');
        let projects: Array<{ name: string; description?: string }>;
        try {
          projects = JSON.parse(options.projects);
        } catch {
          error('--projects must be valid JSON. Example: \'[{"name":"Design","description":"Main design files"}]\'');
          process.exit(1);
        }
        if (!Array.isArray(projects) || projects.length === 0) {
          error('--projects must be a non-empty array.');
          process.exit(1);
        }
        const config = requireCookie();
        const result = await setupProjectStructure(config, { team_id: teamId, projects });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });
}

export function seatOptimizationCommand(): Command {
  return new Command('seat-optimization')
    .description('Identify inactive paid seats and calculate savings')
    .option('--days-inactive <days>', 'Days threshold', '90')
    .option('--no-cost', 'Skip cost analysis')
    .option('--json', 'Force JSON output')
    .action(async (options: {
      daysInactive?: string;
      cost?: boolean;
      json?: boolean;
    }) => {
      try {
        const config = requireCookie();
        const daysInactive = parsePositiveInt(options.daysInactive || '90', '--days-inactive', 90);
        const result = await seatOptimization(config, {
          days_inactive: daysInactive,
          include_cost: options.cost !== false,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });
}

export function permissionAuditCommand(): Command {
  return new Command('audit')
    .description('Audit permissions across a team or project')
    .requiredOption('--scope <type>', 'Scope to audit: team or project', 'team')
    .requiredOption('--id <id>', 'Team ID or project ID')
    .option('--json', 'Force JSON output')
    .action(async (options: {
      scope: string;
      id: string;
      json?: boolean;
    }) => {
      try {
        const scopeType = options.scope;
        if (scopeType !== 'team' && scopeType !== 'project') {
          error(`Invalid scope: ${scopeType}. Must be "team" or "project".`);
          process.exit(1);
        }
        validateId(options.id, 'scope ID');
        const config = requireCookie();
        const result = await permissionAudit(config, {
          scope_type: scopeType as 'team' | 'project',
          scope_id: options.id,
          flag_external: true,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });
}

export function branchCleanupCommand(): Command {
  return new Command('cleanup')
    .description('Find and optionally archive stale branches in a project')
    .argument('<project-id>', 'Project ID')
    .option('--days-stale <days>', 'Days threshold', '60')
    .option('--execute', 'Archive stale branches (default: dry run)')
    .option('--json', 'Force JSON output')
    .action(async (projectId: string, options: {
      daysStale?: string;
      execute?: boolean;
      json?: boolean;
    }) => {
      try {
        validateId(projectId, 'project ID');
        const config = requireAuth();
        const daysStale = parsePositiveInt(options.daysStale || '60', '--days-stale', 60);
        const result = await branchCleanup(config, {
          project_id: projectId,
          days_stale: daysStale,
          dry_run: !options.execute,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });
}

// -- compound-manager.ts tools --

export function offboardUserCommand(): Command {
  return new Command('offboard')
    .description('Audit and optionally execute user offboarding')
    .argument('<user>', 'Email or user_id to offboard')
    .option('--execute', 'Execute the offboarding (default: audit only)')
    .option('--transfer-to <user>', 'Email or user_id to transfer file ownership to')
    .option('--remove-from-org', 'Permanently remove from org after offboarding (cannot be undone)')
    .option('--json', 'Force JSON output')
    .action(async (user: string, options: {
      execute?: boolean;
      transferTo?: string;
      removeFromOrg?: boolean;
      json?: boolean;
    }) => {
      try {
        const config = requireCookie();
        const result = await offboardUser(config, {
          user_identifier: user,
          execute: options.execute === true,
          transfer_to: options.transferTo,
          remove_from_org: options.removeFromOrg === true,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });
}

export function onboardUserCommand(): Command {
  return new Command('onboard')
    .description('Invite a user to teams and optionally share files and set seat type')
    .argument('<email>', 'Email address to invite')
    .requiredOption('--teams <ids...>', 'Team IDs to invite the user to')
    .option('--role <role>', 'Role for team access: editor or viewer', 'editor')
    .option('--share-files <keys...>', 'File keys to share (viewer access)')
    .option('--seat <type>', 'Seat type: full, dev, collab, view')
    .option('--confirm', 'Required to execute seat change')
    .option('--json', 'Force JSON output')
    .action(async (email: string, options: {
      teams: string[];
      role?: string;
      shareFiles?: string[];
      seat?: string;
      confirm?: boolean;
      json?: boolean;
    }) => {
      try {
        for (const id of options.teams) validateId(id, 'team ID');
        if (options.shareFiles) {
          for (const key of options.shareFiles) validateId(key, 'file key');
        }
        const config = requireCookie();
        const result = await onboardUser(config, {
          email,
          team_ids: options.teams,
          role: options.role || 'editor',
          share_files: options.shareFiles,
          seat_type: options.seat,
          confirm: options.confirm,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });
}

export function quarterlyReportCommand(): Command {
  return new Command('quarterly-report')
    .description('Org-wide design ops report: seats, teams, billing, library adoption')
    .option('--days <days>', 'Lookback period in days', '90')
    .option('--json', 'Force JSON output')
    .action(async (options: {
      days?: string;
      json?: boolean;
    }) => {
      try {
        const config = requireCookie();
        const days = parsePositiveInt(options.days || '90', '--days', 90);
        const result = await quarterlyDesignOpsReport(config, { days });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });
}
