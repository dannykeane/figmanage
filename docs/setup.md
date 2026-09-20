# Setup and troubleshooting

[README](../README.md) · [Setup](setup.md) · [Automation](automation.md) · [Command reference](reference.md)

Requires **Node.js 18 or newer** and an MCP client that can run a local server.

## Connect your agent

For [Claude Code](https://code.claude.com/docs/en/mcp):

```sh
claude mcp add --transport stdio --scope user figmanage -- npx -y figmanage --mcp
```

### Other MCP clients

Generate the configuration for your client:

```sh
npx -y figmanage mcp-config codex
```

Merge the printed entry into the location below, keeping your other settings. Figmanage only prints configuration; it does not edit client settings or copy credentials. All clients running as the same local user can reuse Figmanage’s saved login.

| Client argument | Where to apply it | Format |
|---|---|---|
| `claude-code` | Project `.mcp.json`; the command above also supports user scope | JSON `mcpServers` |
| `claude-desktop` | Settings → Developer → Edit Config | JSON `mcpServers` |
| `codex` | `~/.codex/config.toml`, or `$CODEX_HOME/config.toml` | TOML `mcp_servers` |
| `cursor` | `~/.cursor/mcp.json` or project `.cursor/mcp.json` | JSON `mcpServers` |
| `vscode` | **MCP: Open User Configuration** or project `.vscode/mcp.json` | JSON `servers` |
| `generic` | Your client’s local stdio MCP settings | JSON `mcpServers`; adapt to its schema |

Client references: [Claude Code](https://code.claude.com/docs/en/mcp), [Claude Desktop](https://modelcontextprotocol.io/docs/develop/connect-local-servers), [Codex](https://developers.openai.com/codex/mcp), [Cursor](https://cursor.com/docs/mcp), [VS Code](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

For example, Codex receives:

```toml
[mcp_servers.figmanage]
command = "npx"
args = ["-y", "figmanage", "--mcp"]
startup_timeout_sec = 30
tool_timeout_sec = 300
```

The startup allowance gives `npx` time to load the package. Long compound tasks may need a higher tool timeout. A client timeout does not establish whether a write completed; inspect current state before retrying.

Useful options:

```sh
figmanage mcp-config cursor --toolsets starter --read-only
figmanage mcp-config codex --jsonl
figmanage mcp-config claude-desktop --platform win32
```

`--json` and `--jsonl` include the native config text, its format, the target location, and setup steps. Without either flag, stdout contains only the native config, including when piped. Windows output wraps `npx` with `cmd /d /c`; WSL uses the Linux configuration.

If a desktop app cannot find `npx`, install Figmanage with `npm install -g figmanage`, then run `figmanage mcp-config <client> --local`. This uses absolute paths to the current Node executable and Figmanage installation. Regenerate after moving either installation. Avoid `--local` from a temporary `npx` install.

Reconnect or restart MCP after applying config, then ask your agent to call `setup_status`. If your client requires server trust or tool approval, complete that step in the client. Browser extraction needs Chrome on the machine running Figmanage; a remote container does not inherit your laptop’s browser session. Use an appropriate PAT or a separate configured profile there.

## Connect your Figma account

Sign in to **figma.com in Chrome**, then ask:

> Set up Figmanage for my Figma account, then show my teams and recent files.

Your agent guides setup and asks before reading your Chrome session. On macOS, you may see a Keychain prompt. Credentials are saved locally, so you can use them again next time.

Start with your browser session for workspace management. Add a Personal Access Token (PAT) when you need public API features such as comments, exports, or folder discovery. Enter tokens locally with `npx -y figmanage login --pat-only`, then reconnect MCP. You do not need to paste tokens into chat.

## Give it a task

Start with a read such as “Find my recent files” or “Show the projects in the Design team.” Then ask for the workspace changes you need. The bundled instructions guide your agent to check scope, verify results, and report anything incomplete.

## Accounts and configuration

Figmanage uses Figma’s public REST API and the internal API used by the Figma product. Which credentials you need depends on the task:

| Credential | Used for |
|---|---|
| Chrome session | Workspace management, permissions, teams, seats, billing, and administration |
| Personal Access Token | Public API features including comments, exports, file content, and folder browsing |
| Both, for the same account | Workflows such as offboarding that combine workspace management with nested-folder discovery |

Available operations also depend on your Figma plan, scopes, and resource permissions. PAT identity checks need `current_user:read`; current folder browsing uses `folders:read`. Older folder-token scopes have a narrow compatibility fallback. See [Figma’s scope reference](https://developers.figma.com/docs/rest-api/scopes/) for other features.

### Credentials, workspaces, and recovery

- Credentials are stored under `~/.config/figmanage/` (Windows: `%APPDATA%/figmanage/`) with file mode `0600` where supported. Set `FIGMANAGE_CONFIG_DIR` for a separate profile and pass it to each client that should use it.
- A usable environment PAT or cookie/user pair overrides saved credentials as a set. Environment and disk credentials are not merged across accounts. `whoami --json` reports effective sources without printing secrets.
- `FIGMA_PAT` supplies a PAT. `FIGMA_AUTH_COOKIE` and `FIGMA_USER_ID` supply a browser session. `FIGMA_ORG_ID` / `FIGMA_ORGS` override workspace context.
- CLI `navigate switch-org` persists the selected workspace. An explicit `FIGMA_ORG_ID` must be changed or unset first. MCP `switch_org` changes the current connection.
- `login --refresh` refreshes the saved browser account and preserves its PAT. Failed refreshes preserve saved credentials. `login --pat-only` hides terminal input and preserves a matching browser session.
- Reconnect MCP after local CLI login to load changed credentials. MCP setup/recovery tools remain available when saved credentials expire.
- `doctor` and `setup_status` check identity, credential sources, and available API families. They do not read Chrome credentials or change settings. A valid identity does not prove every resource permission or scope.
- Run `figmanage logout` to clear saved credentials.

### Limit which MCP tools are available

Set `FIGMA_TOOLSETS` to a preset or a comma-separated list of toolset names:

| Preset | Included toolsets |
|---|---|
| `starter` | navigate, reading, comments, export |
| `admin` | navigate, org, permissions, analytics, teams, libraries |
| `readonly` | Read-only tools from navigate, reading, comments, export, components, versions |
| `full` | All toolsets; the default |

`FIGMA_READ_ONLY=true` removes mutating tools from any preset. Admin-only tools are hidden from non-admins. Unknown toolsets stop startup with an error. Workspace changes recheck admin access and refresh the tool list.

MCP gives the admin check two seconds and does not retry it during startup. If it fails or times out, other tools remain available. Call `setup_status` to retry admin detection, then refresh the client’s tool list or reconnect if it caches tools. Some clients limit tool counts; use `--toolsets starter` when sharing the client with several MCP servers.

### HTTP transport

Run `figmanage --mcp --http 3000` for Streamable HTTP at `http://127.0.0.1:3000/mcp`. Set `FIGMA_HTTP_HOST` to choose another interface.

Set `FIGMA_HTTP_TOKEN`, or use the generated bearer token printed on stderr. Clients must retain the `Mcp-Session-Id` returned during initialization. Sessions expire after 30 minutes without requests.

## Troubleshooting

| Situation | Next step |
|---|---|
| Setup is incomplete or a request fails | Ask the agent to run `setup_status`, or run `figmanage doctor`. Follow its `next_actions`. |
| Browser session expired | Sign in again in Chrome, run `figmanage login --refresh`, then reconnect MCP. |
| Account mismatch | Use a PAT from the same account as the Chrome session. Check effective sources with `whoami --json`. |
| Expected tools are missing | Run `setup_status` to retry admin detection. Check credentials and toolsets, then refresh cached tools or reconnect. Not every operation needs both credential types. |
| Server cannot start or cannot find `npx` | Install Node.js and Figmanage, then generate config with `--local`. Check the client’s MCP logs. |
| Offboarding is blocked | Inspect `discovery`, `execution_blockers`, and `remaining_work`. Resolve the reported prerequisite and run a fresh audit. |
| A write outcome is unknown | Read the affected resource before deciding whether to retry. |
