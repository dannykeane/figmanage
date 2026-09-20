import { Command } from 'commander';
import { createBranch, deleteBranch, listBranches } from '../operations/branching.js';
import { fail, output } from './format.js';
import { requireAuth, requireCookie } from './helpers.js';

export function branchingCommand(): Command {
  const branching = new Command('branches')
    .description('Manage file branches');

  branching
    .command('list <file-key>')
    .description('List branches of a file')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { json?: boolean }) => {
      try {
        const config = requireAuth();
        const result = await listBranches(config, { file_key: fileKey });
        output(result, options);
      } catch (e: any) {
        fail(e);
      }
    });

  branching
    .command('create <file-key>')
    .description('Create a branch from a file')
    .requiredOption('--name <name>', 'Branch name')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { name: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await createBranch(config, { file_key: fileKey, name: options.name });
        output(result, options);
      } catch (e: any) {
        fail(e);
      }
    });

  branching
    .command('delete <branch-key>')
    .description('Archive (delete) a branch')
    .option('--json', 'Force JSON output')
    .action(async (branchKey: string, options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const { confirmAction } = await import('./helpers.js');
        if (!await confirmAction(`Delete branch ${branchKey}?`)) {
          throw new Error('Cancelled. No changes made.');
        }
        await deleteBranch(config, { branch_key: branchKey });
        output({ archived: branchKey }, options);
      } catch (e: any) {
        fail(e);
      }
    });

  return branching;
}
