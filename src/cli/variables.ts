import { Command } from 'commander';
import {
  listLocalVariables,
  listPublishedVariables,
  updateVariables,
  isEnterpriseScopeError,
  ENTERPRISE_ERROR,
} from '../operations/variables.js';
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requirePat } from './helpers.js';

export function variablesCommand(): Command {
  const variables = new Command('variables')
    .description('Manage file variables (Enterprise)');

  variables
    .command('list-local <file-key>')
    .description('List local variables and variable collections in a file')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        const result = await listLocalVariables(config, { file_key: fileKey });
        if (Object.keys(result.variables ?? {}).length === 0 && Object.keys(result.variableCollections ?? {}).length === 0) {
          console.log('No variables found.');
          return;
        }
        output(result, options);
      } catch (e: any) {
        if (isEnterpriseScopeError(e)) {
          error(ENTERPRISE_ERROR);
        } else {
          error(formatApiError(e));
        }
        process.exit(1);
      }
    });

  variables
    .command('list-published <file-key>')
    .description('List published variables from a library file')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        const result = await listPublishedVariables(config, { file_key: fileKey });
        if (Object.keys(result.variables ?? {}).length === 0 && Object.keys(result.variableCollections ?? {}).length === 0) {
          console.log('No published variables found.');
          return;
        }
        output(result, options);
      } catch (e: any) {
        if (isEnterpriseScopeError(e)) {
          error(ENTERPRISE_ERROR);
        } else {
          error(formatApiError(e));
        }
        process.exit(1);
      }
    });

  variables
    .command('update <file-key>')
    .description('Bulk create, update, or delete variables, collections, modes, and mode values')
    .option('--variable-collections <json>', 'Collection operations as JSON array')
    .option('--variable-modes <json>', 'Mode operations as JSON array')
    .option('--variables <json>', 'Variable operations as JSON array')
    .option('--variable-mode-values <json>', 'Value assignments as JSON array')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: {
      variableCollections?: string;
      variableModes?: string;
      variables?: string;
      variableModeValues?: string;
      json?: boolean;
    }) => {
      try {
        const config = requirePat();
        const variableCollections = options.variableCollections ? JSON.parse(options.variableCollections) : undefined;
        const variableModes = options.variableModes ? JSON.parse(options.variableModes) : undefined;
        const variables = options.variables ? JSON.parse(options.variables) : undefined;
        const variableModeValues = options.variableModeValues ? JSON.parse(options.variableModeValues) : undefined;

        const allOps = [...(variables || []), ...(variableCollections || []), ...(variableModes || []), ...(variableModeValues || [])];
        const hasDeletes = allOps.some((op: any) => op.action === 'DELETE');
        if (hasDeletes) {
          const { confirmAction } = await import('./helpers.js');
          if (!await confirmAction('This includes DELETE operations that cannot be undone. Continue?')) {
            console.log('Cancelled.');
            return;
          }
        }

        const result = await updateVariables(config, {
          file_key: fileKey,
          variable_collections: variableCollections,
          variable_modes: variableModes,
          variables: variables,
          variable_mode_values: variableModeValues,
        });
        output(result, options);
      } catch (e: any) {
        if (isEnterpriseScopeError(e)) {
          error(ENTERPRISE_ERROR);
        } else {
          error(formatApiError(e));
        }
        process.exit(1);
      }
    });

  return variables;
}
