import { Command } from 'commander';
import { listOrgLibraries } from '../operations/libraries.js';
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requireCookie } from './helpers.js';

export function librariesCommand(): Command {
  const libraries = new Command('libraries')
    .description('Manage org design system libraries');

  libraries
    .command('list')
    .description('List all design system libraries in the org')
    .option('--org-id <id>', 'Org ID override (defaults to current workspace)')
    .option('--json', 'Force JSON output')
    .action(async (options: {
      orgId?: string;
      json?: boolean;
    }) => {
      try {
        const config = requireCookie();
        const result = await listOrgLibraries(config, { org_id: options.orgId });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  return libraries;
}
