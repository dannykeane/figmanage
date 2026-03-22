import type { Command } from 'commander';
import { navigateCommand } from './navigate.js';
import { filesCommand } from './files.js';
import { projectsCommand } from './projects.js';
import { permissionsCommand } from './permissions.js';
import { versionsCommand } from './versions.js';
import { branchingCommand } from './branching.js';
import { commentsCommand } from './comments.js';
import { exportCommand } from './export.js';
import { readingCommand } from './reading.js';
import { componentsCommand } from './components.js';
import { webhooksCommand } from './webhooks.js';
import { variablesCommand } from './variables.js';
import { analyticsCommand } from './analytics.js';
import { orgCommand } from './org.js';
import { librariesCommand } from './libraries.js';
import { teamsCommand } from './teams.js';
import { completionCommand } from './completion.js';
import {
  fileSummaryCommand,
  workspaceOverviewCommand,
  openCommentsCommand,
  cleanupStaleFilesCommand,
  organizeProjectCommand,
  setupProjectStructureCommand,
  seatOptimizationCommand,
  permissionAuditCommand,
  branchCleanupCommand,
  offboardUserCommand,
  onboardUserCommand,
  quarterlyReportCommand,
} from './compound-commands.js';

export function registerCliCommands(program: Command): void {
  // Auth commands (flat -- not resource-scoped)
  program
    .command('login')
    .description('Authenticate with Figma')
    .option('--refresh', 'Refresh cookie only')
    .option('--pat-only', 'PAT authentication only')
    .action(async (options: { refresh?: boolean; patOnly?: boolean }) => {
      const { handleLogin } = await import('./login.js');
      await handleLogin(options);
    });

  program
    .command('whoami')
    .description('Show current authentication status')
    .action(async () => {
      const { handleWhoami } = await import('./whoami.js');
      await handleWhoami();
    });

  program
    .command('logout')
    .description('Clear stored credentials')
    .action(async () => {
      const { handleLogout } = await import('./login.js');
      await handleLogout();
    });

  // Noun-verb subcommand groups
  const navigate = navigateCommand();
  const files = filesCommand();
  const projects = projectsCommand();
  const permissions = permissionsCommand();
  const versions = versionsCommand();
  const branches = branchingCommand();
  const comments = commentsCommand();
  const exp = exportCommand();
  const reading = readingCommand();
  const components = componentsCommand();
  const webhooks = webhooksCommand();
  const variables = variablesCommand();
  const analytics = analyticsCommand();
  const org = orgCommand();
  const libraries = librariesCommand();
  const teams = teamsCommand();

  // Route compound commands into noun groups
  files.addCommand(fileSummaryCommand());
  files.addCommand(cleanupStaleFilesCommand());
  projects.addCommand(organizeProjectCommand());
  projects.addCommand(setupProjectStructureCommand());
  comments.addCommand(openCommentsCommand());
  permissions.addCommand(permissionAuditCommand());
  branches.addCommand(branchCleanupCommand());
  org.addCommand(workspaceOverviewCommand());
  org.addCommand(seatOptimizationCommand());
  org.addCommand(offboardUserCommand());
  org.addCommand(onboardUserCommand());
  org.addCommand(quarterlyReportCommand());

  // Register all groups
  program.addCommand(navigate);
  program.addCommand(files);
  program.addCommand(projects);
  program.addCommand(permissions);
  program.addCommand(versions);
  program.addCommand(branches);
  program.addCommand(comments);
  program.addCommand(exp);
  program.addCommand(reading);
  program.addCommand(components);
  program.addCommand(webhooks);
  program.addCommand(variables);
  program.addCommand(analytics);
  program.addCommand(org);
  program.addCommand(libraries);
  program.addCommand(teams);

  // Completion must be registered last so it can introspect all commands above
  program.addCommand(completionCommand(program));
}
