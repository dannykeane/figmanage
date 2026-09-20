import type { Command } from 'commander';
import { analyticsCommand } from './analytics.js';
import { branchingCommand } from './branching.js';
import { commentsCommand } from './comments.js';
import { completionCommand } from './completion.js';
import { componentsCommand } from './components.js';
import {
  branchCleanupCommand,
  cleanupStaleFilesCommand,
  fileSummaryCommand,
  offboardUserCommand,
  onboardUserCommand,
  openCommentsCommand,
  organizeProjectCommand,
  permissionAuditCommand,
  quarterlyReportCommand,
  seatOptimizationCommand,
  setupProjectStructureCommand,
  workspaceOverviewCommand,
} from './compound-commands.js';
import { exportCommand } from './export.js';
import { filesCommand } from './files.js';
import { librariesCommand } from './libraries.js';
import { mcpConfigCommand } from './mcp-config.js';
import { navigateCommand } from './navigate.js';
import { orgCommand } from './org.js';
import { permissionsCommand } from './permissions.js';
import { projectsCommand } from './projects.js';
import { readingCommand } from './reading.js';
import { schemaCommand } from './schema.js';
import { teamsCommand } from './teams.js';
import { variablesCommand } from './variables.js';
import { versionsCommand } from './versions.js';
import { webhooksCommand } from './webhooks.js';

export function registerCliCommands(program: Command): void {
  program.addCommand(mcpConfigCommand());
  program.command('skills')
    .description('Locate the optional bundled agent workflow skill')
    .option('--json', 'Force JSON output')
    .action(async (options: { json?: boolean }) => {
      const { fileURLToPath } = await import('node:url');
      const { output } = await import('./format.js');
      output([{ name: 'figmanage', path: fileURLToPath(new URL('../../skills/figmanage/SKILL.md', import.meta.url)), description: 'Figma workspace management, setup recovery, and official Figma MCP handoffs' }], options);
    });

  program.command('doctor')
    .description('Check live credentials and show the next setup or recovery steps')
    .option('--json', 'Force JSON output')
    .action(async (options: { json?: boolean }) => {
      const { setupStatus } = await import('../auth/setup-status.js');
      const { output, fail, isMachineOutput } = await import('./format.js');
      try {
        const result = await setupStatus();
        if (!result.ready) process.exitCode = 1;
        if (isMachineOutput(options)) output(result, options);
        else {
          console.log(result.ready ? 'Ready for the available tools.' : 'Setup needs attention.');
          console.log(`Credentials: ${result.credential_source}`);
          console.log(`PAT: ${result.status.pat.valid ? `connected (${result.status.pat.user})` : result.status.pat.error}`);
          console.log(`Browser session: ${result.status.cookie.valid ? `connected (${result.status.cookie.user})` : result.status.cookie.error}`);
          for (const action of result.next_actions) console.log(`\n${action.message}`);
        }
      } catch (error) { fail(error); }
    });

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
    .option('--json', 'Force JSON output')
    .action(async (options: { json?: boolean }) => {
      const { handleWhoami } = await import('./whoami.js');
      await handleWhoami(options);
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
  program.addCommand(schemaCommand(program));
}
