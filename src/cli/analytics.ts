import { Command } from 'commander';
import { libraryUsage, componentUsage } from '../operations/analytics.js';
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requireCookie } from './helpers.js';

export function analyticsCommand(): Command {
  const analytics = new Command('analytics')
    .description('Design system analytics');

  analytics
    .command('library-usage <library-file-key>')
    .description('Team-level library adoption metrics')
    .option('--days <n>', 'Lookback period in days (default: 30)')
    .option('--json', 'Force JSON output')
    .action(async (libraryFileKey: string, options: {
      days?: string;
      json?: boolean;
    }) => {
      try {
        const config = requireCookie();
        const result = await libraryUsage(config, {
          library_file_key: libraryFileKey,
          days: options.days ? parseInt(options.days, 10) : undefined,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  analytics
    .command('component-usage <component-key>')
    .description('Per-file component usage analytics')
    .option('--org-id <id>', 'Org ID override (defaults to current workspace)')
    .option('--json', 'Force JSON output')
    .action(async (componentKey: string, options: {
      orgId?: string;
      json?: boolean;
    }) => {
      try {
        const config = requireCookie();
        const result = await componentUsage(config, {
          component_key: componentKey,
          org_id: options.orgId,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  return analytics;
}
