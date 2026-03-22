import { Command } from 'commander';
import {
  createFile,
  renameFile,
  moveFiles,
  duplicateFile,
  trashFiles,
  restoreFiles,
  favoriteFile,
  setLinkAccess,
} from '../operations/files.js';
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requireCookie } from './helpers.js';

export function filesCommand(): Command {
  const files = new Command('files')
    .description('Manage Figma files');

  files
    .command('create <project-id>')
    .description('Create a new file in a project')
    .option('--editor-type <type>', 'File type: design, whiteboard, slides, sites', 'design')
    .option('--org-id <id>', 'Org ID override')
    .option('--json', 'Force JSON output')
    .action(async (projectId: string, options: {
      editorType?: string;
      orgId?: string;
      json?: boolean;
    }) => {
      try {
        const config = requireCookie();
        const result = await createFile(config, {
          project_id: projectId,
          editor_type: options.editorType,
          org_id: options.orgId,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  files
    .command('rename <file-key>')
    .description('Rename a file')
    .requiredOption('--name <name>', 'New name')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { name: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        await renameFile(config, { file_key: fileKey, name: options.name });
        output({ renamed: fileKey, name: options.name }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  files
    .command('move')
    .description('Move files to a different project')
    .requiredOption('--file-keys <keys>', 'Comma-separated file keys', (v: string) => v.split(','))
    .requiredOption('--destination <project-id>', 'Destination project ID')
    .option('--json', 'Force JSON output')
    .action(async (options: {
      fileKeys: string[];
      destination: string;
      json?: boolean;
    }) => {
      try {
        const config = requireCookie();
        const result = await moveFiles(config, {
          file_keys: options.fileKeys,
          destination_project_id: options.destination,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  files
    .command('duplicate <file-key>')
    .description('Duplicate a file')
    .option('--project-id <id>', 'Destination project ID')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { projectId?: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await duplicateFile(config, {
          file_key: fileKey,
          project_id: options.projectId,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  files
    .command('trash')
    .description('Move files to trash')
    .requiredOption('--file-keys <keys>', 'Comma-separated file keys', (v: string) => v.split(','))
    .option('--json', 'Force JSON output')
    .action(async (options: { fileKeys: string[]; json?: boolean }) => {
      try {
        const config = requireCookie();
        const { confirmAction } = await import('./helpers.js');
        if (!await confirmAction(`Trash ${options.fileKeys.length} file(s)?`)) {
          console.log('Cancelled.');
          return;
        }
        const result = await trashFiles(config, { file_keys: options.fileKeys });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  files
    .command('restore')
    .description('Restore files from trash')
    .requiredOption('--file-keys <keys>', 'Comma-separated file keys', (v: string) => v.split(','))
    .option('--json', 'Force JSON output')
    .action(async (options: { fileKeys: string[]; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await restoreFiles(config, { file_keys: options.fileKeys });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  files
    .command('favorite <file-key>')
    .description('Add or remove a file from favorites')
    .option('--unfavorite', 'Remove from favorites')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { unfavorite?: boolean; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await favoriteFile(config, {
          file_key: fileKey,
          favorited: !options.unfavorite,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  files
    .command('link-access <file-key>')
    .description('Set link access on a file')
    .option('--level <level>', 'Access level: inherit, view, edit, org_view, org_edit', 'inherit')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { level?: string; json?: boolean }) => {
      try {
        const config = requireCookie();
        const result = await setLinkAccess(config, {
          file_key: fileKey,
          link_access: options.level,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  return files;
}
