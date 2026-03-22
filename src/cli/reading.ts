import { Command } from 'commander';
import { getFile, getNodes } from '../operations/reading.js';
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requirePat } from './helpers.js';

export function readingCommand(): Command {
  const reading = new Command('reading')
    .description('Read file contents and node trees');

  reading
    .command('get-file <file-key>')
    .description('Read file contents as a node tree')
    .option('--depth <n>', 'Tree depth limit (0=root, 1=pages, 2=top-level frames)')
    .option('--node-id <id>', 'Start from a specific node instead of document root')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: {
      depth?: string;
      nodeId?: string;
      json?: boolean;
    }) => {
      try {
        const config = requirePat();
        const result = await getFile(config, {
          file_key: fileKey,
          depth: options.depth !== undefined ? parseInt(options.depth, 10) : undefined,
          node_id: options.nodeId,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  reading
    .command('get-nodes <file-key> <node-ids...>')
    .description('Read specific nodes from a file')
    .option('--depth <n>', 'Depth limit per node')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, nodeIds: string[], options: {
      depth?: string;
      json?: boolean;
    }) => {
      try {
        const config = requirePat();
        const result = await getNodes(config, {
          file_key: fileKey,
          node_ids: nodeIds,
          depth: options.depth !== undefined ? parseInt(options.depth, 10) : undefined,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  return reading;
}
