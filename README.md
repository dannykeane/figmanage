# figmanage

**Manage your Figma workspace with your agent or terminal.**

Find files, organize projects, review access, and manage teams and seats. Connect Figmanage to your AI assistant through MCP, or use the command-line tool yourself.

[![npm](https://img.shields.io/npm/v/figmanage)](https://www.npmjs.com/package/figmanage)
[![CI](https://github.com/dannykeane/figmanage/actions/workflows/ci.yml/badge.svg)](https://github.com/dannykeane/figmanage/actions/workflows/ci.yml)

## Try asking

- “Find the files I worked on this week.”
- “Move these files into the Archive project.”
- “Show who has access to this project.”
- “Which paid seats have been inactive for 30 days?”
- “Check what needs handing over before Jordan leaves.”

Figmanage uses your Figma permissions. Admin tasks need admin access.

## Get started with your agent

You need **Node.js 18+** and an agent that supports local MCP servers.

**1. Add Figmanage.** In Claude Code, run:

```sh
claude mcp add --transport stdio --scope user figmanage -- npx -y figmanage --mcp
```

Using Codex, Cursor, VS Code, or Claude Desktop? [Generate your client config](docs/setup.md#other-mcp-clients).

**2. Sign in to Figma in Chrome**, then ask your agent:

> Set up Figmanage, then show my teams and recent files.

Your agent asks before reading your Chrome session. macOS may show a Keychain prompt. Your login is saved locally.

**3. Give it a task.** Start with one of the examples above.

Some features, such as comments and exports, also need a Figma Personal Access Token. Add it locally with `npx -y figmanage login --pat-only`, then reconnect MCP. Keep tokens out of chat. See [account setup](docs/setup.md#accounts-and-configuration).

## Use the terminal

```sh
npm install -g figmanage
figmanage login
figmanage navigate list-recent-files
```

Use `figmanage --help` to find commands, or `figmanage doctor` if setup needs attention.

## For agents and scripts

Use MCP for tool discovery, or the CLI for automation:

```sh
figmanage schema
figmanage navigate list-recent-files --jsonl --no-input
```

- **Readable by humans:** terminal output stays easy to scan.
- **Readable by scripts:** choose `--json` or `--jsonl`. With JSONL, require the final summary and check the exit code.
- **Check before changing:** `--dry-run` checks inputs without sending requests. It does not check live permissions.
- **Follow progress:** offboarding supports `--progress --jsonl` and MCP progress notifications when requested.

See the [automation guide](docs/automation.md) for output formats and the optional [agent skill](skills/figmanage/SKILL.md) for workflow recipes.

## Already use the official Figma MCP?

Use Figmanage to manage files, access, teams, and seats. Use the official Figma MCP for design work. Your agent can pass file links between them; each server has its own login. [How they work together](docs/automation.md#work-with-the-official-figma-mcp).

## More help

- [Setup and troubleshooting](docs/setup.md)
- [Commands and all 102 operations](docs/reference.md)
- [Offboarding and its limits](docs/reference.md#onboarding-and-offboarding-commands) — review the audit first. Execution can remove access, change file owners, and downgrade seats.
- [Contribute](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [MIT license](LICENSE)
