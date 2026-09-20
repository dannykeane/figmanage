import { Command } from 'commander';
import { z } from 'zod';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { inputSchemas, operationCatalog } from '../schemas.js';
import { output } from './format.js';

function describe(command: Command): unknown {
  return {
    name: command.name(),
    description: command.description(),
    arguments: command.registeredArguments.map(arg => ({
      name: arg.name(), required: arg.required, variadic: arg.variadic,
      description: arg.description, default: arg.defaultValue, choices: arg.argChoices,
    })),
    options: command.options.map(option => ({
      flags: option.flags, description: option.description,
      required: option.mandatory, default: option.defaultValue, choices: option.argChoices,
    })),
    commands: command.commands.map(describe),
  };
}

export function schemaCommand(program: Command): Command {
  return new Command('schema')
    .description('Print CLI commands and MCP operation schemas as JSON; no credentials or network needed')
    .action(() => {
      const operations = Object.entries(operationCatalog).map(([name, metadata]) => ({
        name, mutates: false, destructive: false, adminOnly: false, ...metadata,
        inputSchema: toJsonSchemaCompat(z.object({
          ...inputSchemas[name as keyof typeof inputSchemas],
          ...('mutates' in metadata ? { dry_run: z.boolean().optional().describe('MCP: preview validated inputs without API requests or remote-state checks.') } : {}),
        })),
      }));
      output({
        schema_version: 1, cli: describe(program), operations,
        output_formats: {
          jsonl: {
            version: 1,
            record_types: ['item', 'result', 'summary', 'error'],
            progress: 'org offboard --progress --jsonl additionally emits progress records during execution: {type:"progress",data:{operation,sequence,phase,message,resource_id?,status?}}. Progress is not a final result.',
            data: 'item/result records carry the original value in data; result records also carry collection metadata.',
            summary: 'Last stdout record: ok, count, and collection (null for root arrays; field name for wrapped lists; omitted for single results).',
            pagination: 'Preserved in result.data; ok does not mean that all pages were fetched.',
            errors: 'Typed error records on stderr. Missing summary means output did not finish. Exit 1 for failed or unknown outcomes.',
          },
        },
      }, { json: true });
    });
}
