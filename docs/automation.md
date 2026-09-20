# Agents and automation

[README](../README.md) · [Setup](setup.md) · [Automation](automation.md) · [Command reference](reference.md)

CLI and MCP call the same operations and share input schemas. Agents can discover capabilities, inspect current state, apply scoped changes, and check the result.

| Capability | How to use it |
|---|---|
| Discover inputs | `figmanage schema`, command `--help`, or MCP tool discovery |
| Configure a client | `figmanage mcp-config <client> --jsonl`; merge its config into existing client settings |
| Diagnose setup | `figmanage doctor --jsonl` or MCP `setup_status` |
| Preview inputs | CLI `--dry-run` or MCP `dry_run: true`; no API requests |
| Read structured results | CLI JSON/JSONL or MCP `structuredContent.result` / `.error` |
| Receive progress | Offboarding `--progress --jsonl` or requested MCP progress notifications |
| Avoid interactive prompts | CLI `--no-input`; add `--yes`, `--execute`, or `--confirm` only for authorized changes |

## JSONL and progress

```sh
figmanage navigate list-files 123 --page-size 2 --jsonl --no-input
```

Illustrative list output:

```jsonl
{"type":"item","data":{"key":"abc","name":"Homepage"}}
{"type":"item","data":{"key":"def","name":"Settings"}}
{"type":"result","data":{"pagination":{"has_more":false,"cursor_source":"offset","hint":"No more files."}}}
{"type":"summary","ok":true,"count":2,"collection":"files"}
```

`item` carries a list entry. `result` preserves a single response or collection metadata. `summary` is the final stdout record; `error` records go to stderr. Offboarding adds `progress` records only when you opt in with `--progress`.

Require the final summary and check the exit code. Partial or unknown outcomes keep their result data but return `ok: false` and exit 1. MCP uses `isError: true`. Follow pagination separately: success does not mean every page was fetched.

## Output and execution contract

- Existing terminal output, `--json`, and default piped JSON remain available. `--jsonl` cannot be combined with `--json` or `--md`.
- `mcp-config` prints native client configuration by default. Add `--json` or `--jsonl` for its configuration and setup metadata.
- Root arrays emit `item` records followed by a summary with `collection: null`. Declared wrapped lists add a `result` for metadata and name the collection in the summary. Other values emit one `result` and one summary.
- The summary’s `count` is the item count, or 1 for a single result. Empty collections still produce a summary.
- Missing final summary means the output is incomplete. Progress can precede an error and never proves completion.
- Most commands emit records after the operation returns. Offboarding supports live opt-in progress. JSONL does not automatically fetch more pages.
- Pass `pagination.next_cursor` back as `--page-token` / `page_token`. PAT file pagination slices a fetched snapshot per call; cookie results identify inferred cursors with `cursor_source: "inferred"`.
- `--dry-run` validates inputs only. It does not verify permissions, resource existence, or remote state. Compound audit modes provide live read-only inspection.
- Destructive CLI commands retain confirmation requirements. `--no-input` prevents prompting; it does not grant permission. Offboarding uses `--execute`, including its seat downgrade. Standalone seat changes and onboarding seats use `--confirm`.
- Unknown write outcomes stop automatic retries. Inspect current state before retrying.
- `--error-format json` provides structured runtime errors without JSONL. With JSONL, stderr errors are typed records regardless of that setting.
- JSONL supports data commands, `doctor`, `whoami`, logout, and schema discovery. Login and shell completion reject it; help/version remain text.
- Offboarding exposes `coverage`, `execution_blockers`, and `remaining_work`. `completion.verified` refers to planned changes, and `follow_up_required` remains true for work outside that scope. There is no automatic resume journal.

## Optional agent skill

The MCP server includes baseline instructions. The bundled [Figmanage skill](../skills/figmanage/SKILL.md) adds recipes for setup recovery, project handoffs, onboarding, access reviews, and cleanup.

```sh
figmanage skills --json
```

This prints the installed skill’s location. Copy its `figmanage` directory into your client’s supported skills directory. The skill is optional; installation does not change client configuration or replace Figma’s design skills.

## Work with the official Figma MCP

| Use Figmanage for | Use the official Figma MCP for |
|---|---|
| Workspace organization, moving files, access, teams, seats, and administration | Design context, screenshots, canvas authoring, and Code Connect |

For example: create a project and place a file with Figmanage, hand its URL or key to the official server for design work, then use Figmanage to manage review access.

Keep both servers registered separately. Your agent coordinates the handoff; their authentication stays separate. Some capabilities overlap, including file creation and exports. See [Figma’s current tool reference](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/) for availability.
