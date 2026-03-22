import { Command } from 'commander';
import { listVersions, createVersion } from '../operations/versions.js';
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requirePat, requireCookie } from './helpers.js';

export function versionsCommand(): Command {
  const versions = new Command('versions')
    .description('Manage file version history');

  versions
    .command('list <file-key>')
    .description('List version history for a file')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        const result = await listVersions(config, { file_key: fileKey });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  versions
    .command('create <file-key>')
    .description('Create a named version (checkpoint)')
    .requiredOption('--title <title>', 'Version title/label')
    .option('--description <text>', 'Version description')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: {
      title: string;
      description?: string;
      json?: boolean;
    }) => {
      try {
        const config = requireCookie();
        const result = await createVersion(config, {
          file_key: fileKey,
          title: options.title,
          description: options.description,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  return versions;
}
