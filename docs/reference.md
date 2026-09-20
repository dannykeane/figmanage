# Command reference

[README](../README.md) · [Setup](setup.md) · [Automation](automation.md) · [Command reference](reference.md)

## CLI examples

```sh
npm install -g figmanage
figmanage login
figmanage doctor
```

`login` connects your Chrome session and optionally accepts a PAT. You create the token in Figma; Figmanage validates and stores it.

Commands follow `figmanage <group> <action>`:

```sh
# Browse and inspect
figmanage navigate list-recent-files
figmanage org members --search alex
figmanage permissions audit --scope project --id 123

# Review seats or audit a departure without making changes
figmanage org seat-optimization
figmanage org offboard jordan@example.com --progress --jsonl

# Preview a move without API requests
figmanage files move --file-keys abc,def --destination 123 --dry-run

# Discover commands and input schemas
figmanage --help
figmanage schema
```

Replace example IDs, file keys, and emails with your own. Data commands use readable terminal output and emit JSON when piped. Use `--json` or `--jsonl` to choose a format explicitly.

### Onboarding and offboarding commands

These commands make changes. Review the audit and its reported prerequisites first.

```sh
# Invite a new member to two teams; paid seat changes require --confirm
figmanage org onboard alex@example.com --teams 123 456 \
  --role editor --seat full --confirm

# Transfer owned files, remove discovered grants, and downgrade paid seats
# Organization membership is retained
figmanage org offboard jordan@example.com --execute \
  --transfer-to alex@example.com

# Also remove organization membership permanently
figmanage org offboard jordan@example.com --execute \
  --transfer-to alex@example.com --remove-from-org
```

Offboarding checks nested folders and needs a PAT for the same account with `current_user:read` and `folders:read`. Incomplete discovery, unresolved team/folder ownership, and retained organization-admin roles can block execution. See [known limits](#known-limits) for scope.

## Known limits

- **Offboarding:** Discovery covers visible teams, folders, descendants, and direct file grants within scan limits. Pagination or unreadable resources block execution. Team/folder ownership handoff, groups, other admin roles, inherited/link access, drafts, and identity-provider work require separate review. New permission/ownership mutation checks have simulated coverage; dedicated live-account validation is pending.
- **Folders:** Ordinary project/file listings cover direct children. Nested creation and general recursive browsing are not exposed as dedicated commands.
- **Favorites:** Listing currently fails through Figma’s API.
- **User groups:** Create/delete and add/remove members are available; group listing is not yet exposed.
- **Branches and versions:** Branch merging and restoring historical versions are not supported.
- **Platform and plan:** Chrome extraction on Windows is best-effort. PAT-only setup supports public API operations. Variables require the relevant Enterprise access.

## All 102 operations

These are MCP operation names, grouped by workflow. Run `figmanage schema` for exact CLI commands and input schemas. `pat` means a Personal Access Token; `cookie` means your browser session. Available tools depend on credentials, permissions, plan, and toolset settings.

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
| `list_favorites` | cookie | Favorited files (currently unavailable; see known limits) |

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
| `offboard_user` | cookie + pat | Audit departure, transfer file ownership, verify planned access changes |
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
