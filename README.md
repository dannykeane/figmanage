# figmanage

Let agents manage your Figma workspace. Seats, teams, permissions, billing, offboarding, cleanup -- handled in conversation instead of clicking through admin panels.

Every Figma MCP is design-to-code. figmanage is the management layer: 102 tools that let agents operate on the workspace itself. Works with Claude Code, Cursor, OpenClaw, or as a standalone CLI.

[![npm](https://img.shields.io/npm/v/figmanage)](https://www.npmjs.com/package/figmanage)
[![downloads](https://img.shields.io/npm/dm/figmanage)](https://www.npmjs.com/package/figmanage)
[![tests](https://img.shields.io/badge/tests-257%20passing-brightgreen)](https://github.com/dannykeane/figmanage)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-marketplace-violet)](https://mcp-marketplace.io/server/io-github-dannykeane-figmanage)

## examples

### workspace management (admins)

```
"which paid seats haven't been active in 30 days? how much would we save?"

"offboard sarah@company.com -- show me everything she owns, then transfer it
 to jake and remove her from the org"

"set up a new hire: invite alex@company.com to Design and Engineering as an editor"

"create a user group called Platform Design and add the three designers"

"run a quarterly design ops report for the org"
```

### everyday design work (everyone)

```
"clean up the Mobile App project -- find stale files and archive dead branches"

"what are the unresolved comments across the Platform project?"

"export all the icons from the Design System file as SVGs"

"move the Q4 files into the Archive project"

"share the Homepage mockup with alex@company.com and set link access to view-only"

"summarize the Brand Guidelines file -- pages, components, styles"
```

## install

```bash
# Claude Code
claude mcp add figmanage -- npx -y figmanage

# Cursor / OpenClaw / other MCP clients
{
  "mcpServers": {
    "figmanage": {
      "command": "npx",
      "args": ["-y", "figmanage"]
    }
  }
}
```

On first run, figmanage walks you through setup in the conversation -- extracts your Chrome session cookie, asks you to create a PAT, stores credentials locally. No env vars, no JSON editing.

Also works as a CLI:

```bash
npm install -g figmanage
figmanage login
```

## how it works

Figma's public REST API covers design files but nothing on the management side -- no seats, no teams, no permissions, no billing. figmanage uses both APIs:

| API | Auth | What it covers |
|-----|------|---------------|
| Internal | Session cookie | Seats, teams, permissions, billing, user groups, org admin, search |
| Public | Personal Access Token | Files, comments, export, components, versions, webhooks, variables |

Both together unlock all 102 tools. Cookie-only or PAT-only works but limits available tools.

**Admin auto-detection.** At startup, figmanage checks whether you're an org admin. Admins see all 102 tools. Non-admins see 68 -- everything except org management, seat changes, billing, user groups, and offboarding. No configuration needed.

**Toolset presets.** Use `FIGMA_TOOLSETS` to expose only specific tool groups:

| Preset | What's included |
|--------|----------------|
| `starter` | navigate, reading, comments, export |
| `admin` | navigate, org, permissions, analytics, teams, libraries |
| `readonly` | navigate, reading, comments, export, components, versions |
| `full` | everything (default) |

## CLI

Commands use a noun-verb pattern: `figmanage <group> <action>`.

```bash
figmanage org seat-optimization                    # find inactive paid seats
figmanage org offboard sarah@co.com                # audit what a user owns
figmanage org offboard sarah@co.com --execute \
  --transfer-to jake@co.com                        # soft offboard
figmanage org offboard sarah@co.com --execute \
  --transfer-to jake@co.com --remove-from-org      # hard offboard (permanent)
figmanage org onboard alex@co.com --teams 123,456 \
  --role editor --seat full --confirm              # set up a new hire
figmanage org quarterly-report                     # org-wide design ops snapshot
figmanage org members --search danny               # find org members
figmanage permissions audit --scope team --id 789  # audit a team's permissions
figmanage branches cleanup 573408414               # find stale branches
```

All commands output JSON when piped or when `--json` is passed. Run `figmanage <group> --help` for subcommands.

## setup

Log into figma.com in Chrome, then:

```bash
figmanage login     # extract cookie, create PAT, store credentials
figmanage whoami    # verify auth
figmanage logout    # clear credentials
```

Credentials stored at `~/.config/figmanage/` with 0o600 permissions.

Env vars (`FIGMA_PAT`, `FIGMA_AUTH_COOKIE`, etc.) override the config file. HTTP transport available via `--mcp --http <port>`.

## tool reference

<details>
<summary>All 102 tools across 17 groups (click to expand)</summary>

The tables below show MCP tool names (snake_case). CLI equivalents use kebab-case: `list_recent_files` becomes `figmanage navigate list-recent-files`.

### navigate (10)

| Tool | Auth | Description |
|------|------|-------------|
| `check_auth` | either | Validate PAT and cookie authentication |
| `list_orgs` | cookie | List available Figma workspaces |
| `switch_org` | cookie | Switch active workspace for this session |
| `list_teams` | cookie | List teams in your org |
| `list_projects` | either | List projects in a team |
| `list_files` | either | List files in a project |
| `list_recent_files` | cookie | Recently viewed/edited files |
| `search` | cookie | Search files across the workspace |
| `get_file_info` | either | File metadata: name, project, team, link access |
| `list_favorites` | cookie | Favorited files (broken -- Figma BigInt bug) |

### files (10)

| Tool | Auth | Description |
|------|------|-------------|
| `create_file` | cookie | Create design, whiteboard, slides, or sites file |
| `rename_file` | cookie | Rename a file |
| `move_files` | cookie | Move files between projects (batch) |
| `duplicate_file` | cookie | Copy a file |
| `trash_files` | cookie | Move files to trash (batch) |
| `restore_files` | cookie | Restore files from trash (batch) |
| `favorite_file` | cookie | Add/remove from favorites |
| `set_link_access` | cookie | Set link sharing level |
| `file_summary` | pat | Pages, components, styles, comment counts |
| `cleanup_stale_files` | either | Find old files, optionally trash (dry run default) |

### projects (8)

| Tool | Auth | Description |
|------|------|-------------|
| `create_project` | cookie | Create a project in a team |
| `rename_project` | cookie | Rename a project |
| `move_project` | cookie | Move a project to another team |
| `trash_project` | cookie | Move a project to trash |
| `restore_project` | cookie | Restore a project from trash |
| `set_project_description` | cookie | Set or update project description |
| `organize_project` | cookie | Batch-move files into a project |
| `setup_project_structure` | cookie | Create multiple projects from a plan |

### permissions (8)

| Tool | Auth | Description |
|------|------|-------------|
| `get_permissions` | cookie | List who has access with roles |
| `set_permissions` | cookie | Change a user's access level |
| `share` | cookie | Invite someone by email |
| `revoke_access` | cookie | Remove someone's access |
| `list_role_requests` | cookie | List pending access requests |
| `approve_role_request` | cookie | Accept an access request |
| `deny_role_request` | cookie | Decline an access request |
| `permission_audit` | cookie | Team/project access audit with oversharing flags |

### org (24, admin-only)

| Tool | Auth | Description |
|------|------|-------------|
| `list_admins` | cookie | Org admins with permission levels |
| `list_org_teams` | cookie | All teams with member and project counts |
| `seat_usage` | cookie | Seat breakdown by type and activity |
| `list_team_members` | cookie | Team members with roles and activity |
| `list_org_members` | cookie | All org members with seats and activity |
| `contract_rates` | cookie | Per-seat pricing |
| `change_seat` | cookie | Change a user's seat type |
| `billing_overview` | cookie | Invoice history and billing status |
| `list_invoices` | cookie | Open and upcoming invoices |
| `list_payments` | cookie | Paid invoices / payment history |
| `org_domains` | cookie | Domain config and SSO/SAML |
| `ai_credit_usage` | cookie | AI credit usage (resolves plan from team) |
| `export_members` | cookie | Trigger CSV export of all members |
| `activity_log` | cookie | Org audit log with email filtering and pagination |
| `create_user_group` | cookie | Create a user group |
| `delete_user_groups` | cookie | Delete user groups |
| `add_user_group_members` | cookie | Add members to a user group by email |
| `remove_user_group_members` | cookie | Remove members from a user group |
| `remove_org_member` | cookie | Permanently remove a member from the org |
| `workspace_overview` | cookie | Org snapshot: teams, seats, billing |
| `seat_optimization` | cookie | Inactive seat detection with cost analysis |
| `offboard_user` | cookie | Audit + execute user departure (soft or hard) |
| `onboard_user` | cookie | Batch invite to teams, share files, set seat |
| `quarterly_design_ops_report` | cookie | Seat utilization, billing, teams, library adoption |

### teams (5, admin-only)

| Tool | Auth | Description |
|------|------|-------------|
| `create_team` | cookie | Create a team |
| `rename_team` | cookie | Rename a team |
| `delete_team` | cookie | Delete a team |
| `add_team_member` | cookie | Add a member by email |
| `remove_team_member` | cookie | Remove a member |

### analytics (2, admin-only)

| Tool | Auth | Description |
|------|------|-------------|
| `library_usage` | cookie | Team-level library adoption metrics |
| `component_usage` | cookie | Per-file component usage |

### comments (9)

| Tool | Auth | Description |
|------|------|-------------|
| `list_comments` | pat | Comments with thread structure |
| `post_comment` | pat | Post a comment |
| `delete_comment` | pat | Delete a comment |
| `resolve_comment` | cookie | Resolve or unresolve a comment thread |
| `edit_comment` | cookie | Edit the text of an existing comment |
| `list_comment_reactions` | pat | Emoji reactions on a comment |
| `add_comment_reaction` | pat | Add an emoji reaction |
| `remove_comment_reaction` | pat | Remove an emoji reaction |
| `open_comments` | pat | Unresolved comments across a project |

### versions (2)

| Tool | Auth | Description |
|------|------|-------------|
| `list_versions` | pat | Version history |
| `create_version` | cookie | Create a named version checkpoint |

### branches (4)

| Tool | Auth | Description |
|------|------|-------------|
| `list_branches` | either | List branches of a file |
| `create_branch` | cookie | Create a branch |
| `delete_branch` | cookie | Archive a branch |
| `branch_cleanup` | either | Stale branch detection with optional archival |

### reading (2)

| Tool | Auth | Description |
|------|------|-------------|
| `get_file` | pat | Read file as a node tree with depth control |
| `get_nodes` | pat | Read specific nodes by ID |

### export (2)

| Tool | Auth | Description |
|------|------|-------------|
| `export_nodes` | pat | Export as PNG, SVG, PDF, or JPG |
| `get_image_fills` | pat | URLs for all images used as fills |

### components (7)

| Tool | Auth | Description |
|------|------|-------------|
| `list_file_components` | pat | Components published from a file |
| `list_file_styles` | pat | Styles in a file |
| `list_team_components` | pat | Published components across a team |
| `list_team_styles` | pat | Published styles across a team |
| `list_dev_resources` | pat | Dev resources (links, annotations) on a file |
| `create_dev_resource` | pat | Attach a dev resource to a node |
| `delete_dev_resource` | pat | Remove a dev resource |

### webhooks (5)

| Tool | Auth | Description |
|------|------|-------------|
| `list_webhooks` | pat | List webhooks for a team |
| `create_webhook` | pat | Create a webhook subscription |
| `update_webhook` | pat | Update a webhook |
| `delete_webhook` | pat | Delete a webhook |
| `webhook_requests` | pat | Delivery history (last 7 days) |

### variables (3, Enterprise)

| Tool | Auth | Description |
|------|------|-------------|
| `list_local_variables` | pat | Local variables and collections |
| `list_published_variables` | pat | Published variables from a library |
| `update_variables` | pat | Bulk create, update, or delete variables |

### libraries (1)

| Tool | Auth | Description |
|------|------|-------------|
| `list_org_libraries` | cookie | Design system libraries with sharing info |

</details>

## security

All ID parameters validated against `/^[\w.:-]+$/`. Rate limit retries restricted to safe HTTP methods -- mutations never retried. Billing responses strip PII. Destructive operations default to dry-run mode. Org removal requires explicit double-confirmation. Config file stored with 0o600 permissions.

## known limitations

- **list_favorites**: Figma BigInt overflow bug on their server. `favorite_file` works fine.
- **Branch merging / version restore**: Require Figma's multiplayer protocol, no REST endpoint.
- **Cookie expiry**: ~30 days. Run `figmanage login --refresh` to renew.
- **Windows cookies**: Best-effort DPAPI extraction. Falls back to PAT-only.
- **Variables**: Enterprise-gated scopes.
- **User groups**: Write-only (create, delete, add/remove members). No list endpoint -- Figma renders the page server-side.

## development

```bash
git clone https://github.com/dannykeane/figmanage.git
cd figmanage
npm install
npm run build
npm test
```

Three-layer architecture: operations hold all business logic, tools and CLI are thin wrappers.

```
src/
  index.ts            Entry: --setup, --mcp, or CLI mode
  mcp.ts              MCP server setup, admin detection, toolset presets
  setup.ts            Cross-platform Chrome cookie extraction
  auth/               AuthConfig from env vars and config file
  clients/            Axios clients for internal (cookie) and public (PAT) APIs
  operations/         Shared business logic (19 modules)
  tools/              MCP tool wrappers (thin, call operations)
  cli/                CLI Commander wrappers (thin, call operations)
  types/figma.ts      Shared types including Toolset union
```

## license

MIT
