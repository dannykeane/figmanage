# Contributing

Use Node 22 or newer for development. The published CLI and MCP server support Node 18 and newer.

```sh
npm ci --ignore-scripts
npm run build
npm run lint
npm test
```

Build before running integration tests: they launch the compiled CLI and MCP server from `dist/`. Tests use temporary configuration and a local fake API. No Figma credentials are needed. CI also installs the packed release and checks CLI/MCP startup on each supported runtime.

The public repository contains reviewed releases. Open issues and focused pull requests here; development changes are integrated before the next release. Public history and release tags are retained.

For a new operation:

1. Define its input shape and discovery metadata in `src/schemas.ts`.
2. Validate inputs with `validateInput` at the start of the operation in `src/operations/`. Return plain data and throw errors with useful context.
3. Add CLI and MCP wrappers. Use the shared input schema, mark mutations in `defineTool`, and include result data in `toolResult` or `toolSummary`.
4. Test observable behavior. Cover failed and partial responses for writes. Never use real accounts in tests.
5. Update the [command reference](docs/reference.md) and changelog. Keep the README focused on getting started.

Preserve command names, flags, and successful JSON shapes. Add structured fields when needed. Failed or unknown batch outcomes must produce a nonzero CLI exit and MCP `isError`. Avoid automatically retrying writes whose outcome is uncertain.

Route data through `output`/`outputEmpty` so `--jsonl` works on terminals and in pipes. For an object that wraps a list, declare its field: `output(result, { ...options, collection: 'files' })`. The JSONL writer emits items separately and preserves other fields in a result record. Undeclared objects remain intact. Keep stdout free of progress prose; the agent can use the final summary plus the exit status to determine whether it received a complete result.

`figmanage schema` describes commands without network access. CLI `--dry-run` and MCP `dry_run: true` preview mutation inputs without requests; compound audit modes provide separate read-only inspection of remote state.
