export interface ExecutionOptions {
  yes?: boolean;
  noInput?: boolean;
  dryRun?: boolean;
  errorFormat?: string;
  jsonl?: boolean;
}

// A CLI process runs one command. MCP leaves these options unset.
export let executionOptions: ExecutionOptions = {};
export function configureExecution(options: ExecutionOptions): void {
  executionOptions = options;
}

export class DryRunPreview extends Error {
  constructor(public readonly operation: string, public readonly input: unknown) {
    super('Dry run');
  }
}
