import { Command } from 'commander';
import { exportNodes, getImageFills } from '../operations/export.js';
import { fail, output, outputEmpty } from './format.js';
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
          scale: options.scale ? Number(options.scale) : undefined,
        });
        output(result, options);
      } catch (e: any) {
        fail(e);
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
          outputEmpty(result, 'No image fills in this file.', options);
          return;
        }
        output(result, options);
      } catch (e: any) {
        fail(e);
      }
    });

  return exp;
}
