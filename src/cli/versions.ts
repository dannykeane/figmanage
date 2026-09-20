import { Command } from 'commander';
import { createVersion, listVersions } from '../operations/versions.js';
import { fail, output } from './format.js';
import { requireCookie, requirePat } from './helpers.js';

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
        fail(e);
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
        fail(e);
      }
    });

  return versions;
}
