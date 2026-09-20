import { z } from 'zod';
import { inputSchemas, operationCatalog } from './schemas.js';
import { DryRunPreview, executionOptions } from './execution.js';

export function validateInput(name: keyof typeof inputSchemas, input: unknown): void {
  const parsed = z.object(inputSchemas[name]).parse(input);
  if (executionOptions.dryRun && ('mutates' in operationCatalog[name] || name === 'switch_org')) {
    // A local input preview: no claim about permissions or current remote state.
    const safe = { ...parsed } as Record<string, unknown>;
    if ('passcode' in safe) safe.passcode = '[redacted]';
    throw new DryRunPreview(name, safe);
  }
}

export function mutationPreview(name: keyof typeof inputSchemas, input: unknown) {
  const parsed = z.object(inputSchemas[name]).parse(input) as Record<string, unknown>;
  if ('passcode' in parsed) parsed.passcode = '[redacted]';
  return { dry_run: true, operation: name, input: parsed, validation: 'local input only', executed: false };
}
