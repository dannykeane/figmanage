# Workspace workflows

Discover schemas before executing these recipes. Names below refer to figmanage MCP tools; CLI equivalents appear in `figmanage schema`.

## Start a project and hand it to design tools

1. Use `list_teams` and `list_projects` to find the requested destination. Verify existing names before creating duplicates.
2. Create the requested project/file with figmanage, or let the official Figma MCP create a file and retain the returned key. Do not create the same file twice.
3. If the official server created the file in drafts, use `move_files` only after verifying the intended destination and access.
4. Pass the returned file URL/key to the official server for design work. Discover its metadata tools to find page/node IDs; follow its canvas skill.
5. Use `get_file_info` and `list_files` to verify placement. Report the file link and design result separately from workspace changes.

## Prepare a review

1. Locate the file with `search` or `list_files` and verify its identity with `get_file_info`.
2. Inspect comments, requested collaborators, and current access. Use `permission_audit` only within the requested scope; inspect its scan limits and errors.
3. Ask the official Figma MCP for the relevant design context or screenshot when useful.
4. Apply only requested sharing changes. Do not make a file public merely to make a handoff work. Re-read permissions and report who gained access.

## Clean up a workspace

1. Use the existing cleanup or branch audit mode to identify candidates. Check dates, pagination, and incomplete scans.
2. Present names, links, and the proposed destination or trash action when the user has not yet selected a concrete scope.
3. Apply authorized changes in bounded batches. Retain the original IDs and locations for verification and recovery.
4. Read back results. Report successful, failed, and unknown items separately. Do not retry unknown writes blindly.

## Review seats or offboard someone

1. Verify the organization and identify the exact user. Run the relevant audit before changing seats or membership.
2. Check discovery completeness, `execution_blockers`, `coverage`, transfer destinations, billing effects, and the existing confirmation requirements. Group membership and draft recovery are not automated.
3. Stop if discovery is incomplete or a prerequisite transfer fails. Do not remove a user while ownership transfers remain unresolved.
4. Inspect `completion.verified` and every `remaining_work` entry. Verified planned changes do not establish that every access path has been removed. Soft offboarding retains organization access and may retain inherited grants.
5. For CLI updates use `org offboard <user> --progress --jsonl`; for MCP request progress notifications. Only the final result establishes the outcome. On failure, inspect recorded resource IDs and run a fresh audit before retrying. There is no automatic resume journal.

## Onboard someone or change their team

1. Identify the exact user, destination teams, required files, and intended seat. Read current membership and permissions to avoid duplicate invitations.
2. Use `onboard_user` for authorized invitations and file sharing. Seat changes retain their separate confirmation requirement. Group changes require explicit group IDs; do not infer membership from names.
3. Verify new access before removing old access during a team change. Transfer owned resources before revoking permissions. Do not use organization offboarding for a transfer between teams.
4. Report verified membership, seat, and sharing changes separately from pending invitations and external identity-provider work.

## Review contractor access

1. Start with a user-supplied contractor list, expiration dates, and resource scope. Figmanage does not infer employment status or schedule automatic expiry.
2. Inspect direct permissions and group/admin access where available. Report unknown or incomplete discovery instead of treating absence from one listing as no access.
3. Apply only the authorized removals and verify the resulting permissions. Public-link changes affect everyone using the link and need their own explicit scope.
4. Return a report of removed grants and remaining access paths. Use an external scheduler only if the user has requested scheduled reviews.

## Hand off or archive a project

1. Confirm source, destination, replacement owners, and the user's meaning of archive: moving to a retained folder and trashing are different actions.
2. Inventory files and nested folders; inspect scan limits, ownership, and inherited permissions. Ordinary project listing covers direct children only.
3. Hand over ownership and verify destination access before moving resources or removing collaborators. Built-in offboarding does not automate team/folder ownership handoffs.
4. Read back file locations and permissions. Keep source IDs and destinations in the result so an interrupted workflow can be inspected before retrying.
5. Removed users' drafts require a separate Figma Admin recovery step until validated draft-recovery tools are available.

## Recover from an authentication failure

1. Run `setup_status` or `figmanage doctor --jsonl`. A permission error, missing scope, network error, and expired session require different responses.
2. For stored browser sessions, use the MCP extraction/selection flow or local `figmanage login --refresh` with prior browser-access permission. Select the current account when recommended.
3. If environment credentials are active, changing saved login alone will not replace them. Update the environment or remove its credential variables, then reconnect.
4. After local CLI login, reconnect MCP and verify identity. Retry a failed read. Inspect state before retrying any write.
