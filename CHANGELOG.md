# Changelog

## 1.5.0

- Generate credential-free MCP configuration for Claude Code, Claude Desktop, Codex, Cursor, VS Code, and generic clients. Support JSON/JSONL setup metadata, read-only presets, Windows launchers, and absolute local paths.
- Bound MCP startup admin checks to two seconds without retries. Keep other tools available during outages and retry admin detection through `setup_status`.
- Shorten the README into a plain-English quick start. Move setup, automation, and the full command reference into linked guides included in public source and npm.
- Audit and revoke direct non-owner file grants during offboarding. Verify ownership, access, seat, and membership changes; stop on failed verification or unknown writes.
- Report offboarding coverage and remaining work. Block known team/folder ownership handoffs and retained organization-admin roles before executing.
- Add opt-in offboarding `--progress --jsonl` and requested MCP progress notifications. Existing output without the progress opt-in remains compatible.
- Add agent recipes for onboarding, team changes, contractor reviews, and project handoffs, with explicit scope and verification steps.

- Include nested folders in offboarding discovery. Block execution if descendants, identity, pagination, or scan bounds cannot be verified.

- Support Figma's v2 folder endpoints and new `folders:read` tokens while retaining legacy project scopes and command output.
- Add read-only `doctor` diagnostics and structured MCP setup/recovery steps, including effective credential sources and account mismatch detection.
- Keep MCP recovery available after credentials expire. Preserve same-account credentials, avoid ambiguous automatic account changes, and hide PAT input in the terminal.
- Bundle an optional agent workflow skill, expose its path with `skills`, and add MCP instructions for workspace workflows and official Figma MCP handoffs.
- Add opt-in CLI `--jsonl`: typed item/result/summary records, preserved pagination, typed errors on stderr, and explicit completion/failure signals. Existing JSON, terminal, and MCP output remains compatible.
- Add offline `schema` discovery, shared CLI/MCP input validation, CLI `--yes`, `--no-input`, `--dry-run`, and `--error-format json`.
- Add MCP structured results, output schemas, and optional `dry_run` previews while retaining text responses.
- Signal partial and unknown batch outcomes with CLI exit 1 and MCP `isError`; preserve result payloads and confirmed success counts.
- Stop automatic retries for writes with lost responses. Block offboarding after incomplete discovery or unverified ownership transfer.
- Enforce the readonly toolset and reject unknown toolset names. Refresh tools after setup and workspace changes.
- Keep HTTP MCP sessions usable across requests; bind to loopback by default.
- Persist CLI workspace selection, honor environment workspace overrides, support fresh PAT-only MCP setup, and preserve credentials during cookie refresh.
- Return JSON for empty results and authentication checks, expose pagination cursors, and bound explicitly paginated PAT file results.
- Sanitize terminal values and measure table columns by display width. Speed up `--version` and remove stale build output before compilation.
- Restore dependency compatibility with Node 18, update compatible vulnerable dependencies, add CLI/MCP integration coverage and package runtime CI.

Behavior corrections: invalid IDs/enums are rejected before requests; noninteractive destructive commands require `--yes`; partial results now exit nonzero. Dry-run previews validate inputs only, not permissions or remote state. Raw successful CLI JSON shapes remain unchanged.
