# AGENTS.md

Instructions for AI coding agents working in this repository. Human contributors: see [CONTRIBUTING.md](CONTRIBUTING.md), which this file follows.

figmanage is a CLI and MCP server for Figma workspace admin: seats, permissions, billing, files, components. It ships to npm as `figmanage`.

## Commands

Use Node 22 or newer to develop. The published package supports Node 18 and newer.

```sh
npm ci --ignore-scripts
npm run build    # compile to dist/
npm run lint     # tsc --noEmit
npm test         # vitest run
```

Build before testing: integration tests launch the compiled CLI and MCP server from `dist/` against a local fake API. Tests never need Figma credentials. Never use a real account in a test.

## Layout

```
src/
  operations/   business logic, one module per area; pure functions that return data and throw on error
  tools/        MCP wrappers; defineTool() in tools/register.ts
  cli/          CLI wrappers (noun-verb subcommands); output helpers in cli/format.ts
  schemas.ts    input schemas and discovery metadata, shared by CLI and MCP
  validation.ts validateInput()
  mcp.ts        toolsets and presets
  types/        shared types, including the Toolset union
test/           one test file per module; shared mocks in test/helpers.ts
```

Operations hold all logic. Tools and CLI commands are thin wrappers that call an operation and format the result for their surface.

## Adding an operation

1. Define its input shape and discovery metadata in `src/schemas.ts`. Use `figmaId` for every ID parameter.
2. Implement it in `src/operations/`: call `validateInput` first, return plain data, throw errors with useful context. No MCP or CLI concerns.
3. Add the MCP wrapper with `defineTool` (mark mutations; `destructive: true` where it deletes or removes access) and return through `toolResult`, `toolSummary` or `toolError`.
4. Add the CLI subcommand. Route data through `output`/`outputEmpty`, declaring the list field for wrapped lists (`collection: 'files'`) so `--jsonl` works.
5. Test observable behavior, including failed and partial responses for writes.
6. Update [docs/reference.md](docs/reference.md) and the changelog. Keep the README to getting started.

A new toolset also needs the `Toolset` type in `src/types/` and an entry in `ALL_TOOLSETS` in `src/mcp.ts`.

## Rules

- Preserve command names, flags and successful JSON shapes. Add fields; don't rename or remove them.
- Failed or unknown batch outcomes exit nonzero in the CLI and set `isError` in MCP.
- Never retry automatically a write whose outcome is uncertain.
- Keep stdout free of progress prose; the final summary and exit status tell the caller whether the result is complete.
- `figmanage schema` works without network access. `--dry-run` (CLI) and `dry_run: true` (MCP) preview mutations without sending requests.
- Never commit credentials, cookies, tokens or real workspace data.

## Using figmanage as an agent

To operate a Figma workspace rather than change this code, use the published package: `npx -y figmanage --mcp` as a local MCP server, or the `figmanage` CLI ([setup](docs/setup.md)). The agent skill in [skills/figmanage/SKILL.md](skills/figmanage/SKILL.md) covers workflows; [docs/reference.md](docs/reference.md) lists every command.
