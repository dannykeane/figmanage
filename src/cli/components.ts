import { Command } from 'commander';
import {
  listFileComponents,
  listFileStyles,
  listTeamComponents,
  listTeamStyles,
} from '../operations/components.js';
import {
  listDevResources,
  createDevResource,
  deleteDevResource,
} from '../operations/dev-resources.js';
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requirePat } from './helpers.js';

export function componentsCommand(): Command {
  const components = new Command('components')
    .description('Manage components and styles');

  components
    .command('list-file-components <file-key>')
    .description('List components published from a specific file')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        const result = await listFileComponents(config, { file_key: fileKey });
        if (result.components.length === 0) {
          console.log('No components found.');
          return;
        }
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  components
    .command('list-file-styles <file-key>')
    .description('List styles in a specific file')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        const result = await listFileStyles(config, { file_key: fileKey });
        if (result.styles.length === 0) {
          console.log('No styles found.');
          return;
        }
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  components
    .command('list-team-components <team-id>')
    .description('List published components across a team')
    .option('--page-size <n>', 'Max items per page (default: 30)')
    .option('--cursor <cursor>', 'Pagination cursor from previous response')
    .option('--json', 'Force JSON output')
    .action(async (teamId: string, options: {
      pageSize?: string;
      cursor?: string;
      json?: boolean;
    }) => {
      try {
        const config = requirePat();
        const result = await listTeamComponents(config, {
          team_id: teamId,
          page_size: options.pageSize ? parseInt(options.pageSize, 10) : undefined,
          cursor: options.cursor,
        });
        if (result.components.length === 0) {
          console.log('No components found.');
          return;
        }
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  components
    .command('list-team-styles <team-id>')
    .description('List published styles across a team')
    .option('--page-size <n>', 'Max items per page (default: 30)')
    .option('--cursor <cursor>', 'Pagination cursor from previous response')
    .option('--json', 'Force JSON output')
    .action(async (teamId: string, options: {
      pageSize?: string;
      cursor?: string;
      json?: boolean;
    }) => {
      try {
        const config = requirePat();
        const result = await listTeamStyles(config, {
          team_id: teamId,
          page_size: options.pageSize ? parseInt(options.pageSize, 10) : undefined,
          cursor: options.cursor,
        });
        if (result.styles.length === 0) {
          console.log('No styles found.');
          return;
        }
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  components
    .command('list-dev-resources <file-key>')
    .description('List dev resources (links, annotations) on a file')
    .option('--node-ids <ids>', 'Comma-separated node IDs to filter')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { nodeIds?: string; json?: boolean }) => {
      try {
        const config = requirePat();
        const result = await listDevResources(config, {
          file_key: fileKey,
          node_ids: options.nodeIds?.split(','),
        });
        if (result.length === 0) {
          console.log('No dev resources found.');
          return;
        }
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  components
    .command('create-dev-resource <file-key> <node-id>')
    .description('Create a dev resource on a node')
    .requiredOption('--name <name>', 'Resource name/label')
    .requiredOption('--url <url>', 'Resource URL')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, nodeId: string, options: {
      name: string;
      url: string;
      json?: boolean;
    }) => {
      try {
        const config = requirePat();
        const result = await createDevResource(config, {
          file_key: fileKey,
          node_id: nodeId,
          name: options.name,
          url: options.url,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  components
    .command('delete-dev-resource <file-key> <dev-resource-id>')
    .description('Delete a dev resource')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, devResourceId: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        const { confirmAction } = await import('./helpers.js');
        if (!await confirmAction(`Delete dev resource ${devResourceId}?`)) {
          console.log('Cancelled.');
          return;
        }
        await deleteDevResource(config, { file_key: fileKey, dev_resource_id: devResourceId });
        output({ deleted: devResourceId }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  return components;
}
