import { Command } from 'commander';
import { exportNodes, getImageFills } from '../operations/export.js';
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requirePat } from './helpers.js';

export function exportCommand(): Command {
  const exp = new Command('export')
    .description('Export images and fills from files');

  exp
    .command('nodes <file-key> <node-ids...>')
    .description('Export nodes as images (returns temporary URLs)')
    .option('--format <fmt>', 'Image format: png, svg, pdf, jpg (default: png)')
    .option('--scale <n>', 'Scale factor, 0.01-4 (default: 1)')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, nodeIds: string[], options: {
      format?: string;
      scale?: string;
      json?: boolean;
    }) => {
      try {
        const config = requirePat();
        const result = await exportNodes(config, {
          file_key: fileKey,
          node_ids: nodeIds,
          format: options.format,
          scale: options.scale ? parseFloat(options.scale) : undefined,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  exp
    .command('image-fills <file-key>')
    .description('Get download URLs for all images used as fills')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        const result = await getImageFills(config, { file_key: fileKey });
        if (result.length === 0) {
          console.log('No image fills in this file.');
          return;
        }
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  return exp;
}
