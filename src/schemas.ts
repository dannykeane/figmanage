import { z } from 'zod';

export const figmaId = z.string().regex(/^[\w.:-]+$/, 'Invalid ID format').refine(value => value !== '.' && value !== '..', 'Invalid ID format');
const eventTypeEnum = z.enum(['FILE_UPDATE', 'FILE_DELETE', 'FILE_VERSION_UPDATE', 'LIBRARY_PUBLISH', 'FILE_COMMENT', 'PING']);

// Shared by MCP, CLI operations, and offline command discovery.
export const inputSchemas = {
  library_usage: {
    library_file_key: figmaId.describe('File key of the library'),
    days: z.number().optional().describe('Lookback period in days (default 30). Suggest 30, 60, 90, or 365.'),
  },
  component_usage: {
    component_key: figmaId.describe('Component key'),
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  list_branches: {
    file_key: figmaId.describe('File key of the main file'),
  },
  create_branch: {
    file_key: figmaId.describe('File key to branch from'),
    name: z.string().describe('Branch name'),
  },
  delete_branch: {
    branch_key: figmaId.describe('Branch file key (from list_branches)'),
  },
  list_comments: {
    file_key: figmaId.describe('File key'),
    as_md: z.boolean().optional().describe('Format as markdown thread (default: false)'),
  },
  post_comment: {
    file_key: figmaId.describe('File key'),
    message: z.string().describe('Comment text'),
    comment_id: figmaId.optional().describe('Parent comment ID to reply to'),
    node_id: figmaId.optional().describe('Node ID to pin the comment to'),
  },
  delete_comment: {
    file_key: figmaId.describe('File key'),
    comment_id: figmaId.describe('Comment ID to delete'),
  },
  list_comment_reactions: {
    file_key: figmaId.describe('File key'),
    comment_id: figmaId.describe('Comment ID'),
  },
  resolve_comment: {
    file_key: figmaId.describe('File key'),
    comment_id: figmaId.describe('Comment ID to resolve'),
    resolved: z.boolean().optional().describe('true to resolve (default), false to unresolve'),
  },
  edit_comment: {
    file_key: figmaId.describe('File key'),
    comment_id: figmaId.describe('Comment ID'),
    message: z.string().describe('New comment text'),
  },
  add_comment_reaction: {
    file_key: figmaId.describe('File key'),
    comment_id: figmaId.describe('Comment ID'),
    emoji: z.string().describe('Emoji shortcode (e.g. ":thumbsup:", ":heart:")'),
  },
  remove_comment_reaction: {
    file_key: figmaId.describe('File key'),
    comment_id: figmaId.describe('Comment ID'),
    emoji: z.string().describe('Emoji shortcode to remove (e.g. ":thumbsup:")'),
  },
  list_file_components: {
    file_key: figmaId.describe('File key'),
  },
  list_file_styles: {
    file_key: figmaId.describe('File key'),
  },
  list_team_components: {
    team_id: figmaId.describe('Team ID'),
    page_size: z.number().int().min(1).max(100).optional().default(30).describe('Max items per page (default: 30)'),
    cursor: z.string().optional().describe('Pagination cursor from previous response'),
  },
  list_team_styles: {
    team_id: figmaId.describe('Team ID'),
    page_size: z.number().int().min(1).max(100).optional().default(30).describe('Max items per page (default: 30)'),
    cursor: z.string().optional().describe('Pagination cursor from previous response'),
  },
  offboard_user: {
    user_identifier: z.string().describe('Email or user_id of the user to offboard'),
    execute: z.boolean().optional().default(false).describe('Execute the offboarding (default: false, audit only)'),
    transfer_to: z.string().optional().describe('Email or user_id to transfer file ownership to (required if user owns files and execute=true)'),
    remove_from_org: z.boolean().optional().default(false).describe('Permanently remove from org after offboarding (cannot be undone). Requires execute=true.'),
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  onboard_user: {
    email: z.string().email().describe('Email address to invite'),
    team_ids: z.array(figmaId).min(1).describe('Team IDs to invite the user to'),
    role: z.enum(['editor', 'viewer']).optional().default('editor').describe('Role for team access (default: editor)'),
    share_files: z.array(figmaId).optional().describe('File keys to share with the user (viewer access)'),
    seat_type: z.enum(['full', 'dev', 'collab', 'view']).optional().describe('Seat type to assign after invite'),
    confirm: z.boolean().optional().describe('Required to execute seat change'),
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  quarterly_design_ops_report: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
    days: z.number().min(1).max(365).optional().default(90).describe('Lookback period in days (default: 90)'),
  },
  file_summary: {
    file_key: figmaId.describe('File key'),
  },
  workspace_overview: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  open_comments: {
    project_id: figmaId.describe('Project ID'),
  },
  cleanup_stale_files: {
    project_id: figmaId.describe('Project ID'),
    days_stale: z.number().optional().default(90).describe('Days since last modification (default: 90)'),
    dry_run: z.boolean().optional().default(true).describe('Preview only, no deletion (default: true)'),
  },
  organize_project: {
    file_keys: z.array(figmaId).min(1).describe('File keys to move'),
    target_project_id: figmaId.describe('Destination project ID'),
  },
  setup_project_structure: {
    team_id: figmaId.describe('Team ID'),
    projects: z.array(z.object({
      name: z.string().describe('Project name'),
      description: z.string().optional().describe('Project description'),
    })).min(1).describe('Projects to create'),
  },
  seat_optimization: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
    days_inactive: z.number().min(1).max(365).optional().default(90).describe('Days without activity to flag as inactive (default: 90)'),
    include_cost: z.boolean().optional().default(true).describe('Include cost analysis from contract rates (default: true)'),
  },
  permission_audit: {
    scope_type: z.enum(['project', 'team']).describe('Scope to audit'),
    scope_id: figmaId.describe('Team ID or project ID'),
    flag_external: z.boolean().optional().default(true).describe('Flag external users (default: true)'),
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  branch_cleanup: {
    project_id: figmaId.describe('Project ID'),
    days_stale: z.number().min(1).max(365).optional().default(60).describe('Days since last modification to flag as stale (default: 60)'),
    dry_run: z.boolean().optional().default(true).describe('Preview only, no archiving (default: true)'),
  },
  list_dev_resources: {
    file_key: figmaId.describe('File key'),
    node_ids: z.array(figmaId).optional().describe('Filter by specific node IDs'),
  },
  create_dev_resource: {
    file_key: figmaId.describe('File key'),
    node_id: figmaId.describe('Node ID to attach the resource to'),
    name: z.string().describe('Resource name/label'),
    url: z.string().describe('Resource URL'),
  },
  delete_dev_resource: {
    file_key: figmaId.describe('File key'),
    dev_resource_id: figmaId.describe('Dev resource ID (from list_dev_resources)'),
  },
  export_nodes: {
    file_key: figmaId.describe('File key'),
    node_ids: z.array(figmaId).min(1).describe('Node IDs to export (e.g. ["1:2", "3:4"])'),
    format: z.enum(['png', 'svg', 'pdf', 'jpg']).optional().describe('Image format (default: png)'),
    scale: z.number().optional().describe('Scale factor, 0.01-4 (default: 1)'),
  },
  get_image_fills: {
    file_key: figmaId.describe('File key'),
  },
  create_file: {
    project_id: figmaId.describe('Project (folder) ID to create the file in'),
    editor_type: z.enum(['design', 'whiteboard', 'slides', 'sites']).optional().describe('File type (default: design)'),
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  rename_file: {
    file_key: figmaId.describe('File key'),
    name: z.string().describe('New name'),
  },
  move_files: {
    file_keys: z.array(figmaId).min(1).describe('Array of file keys to move'),
    destination_project_id: figmaId.describe('Destination project (folder) ID'),
  },
  duplicate_file: {
    file_key: figmaId.describe('File key to duplicate'),
    project_id: figmaId.optional().describe('Destination project ID (optional, defaults to same project)'),
  },
  trash_files: {
    file_keys: z.array(figmaId).min(1).describe('Array of file keys to trash'),
  },
  restore_files: {
    file_keys: z.array(figmaId).min(1).describe('Array of file keys to restore'),
  },
  favorite_file: {
    file_key: figmaId.describe('File key'),
    favorited: z.boolean().optional().describe('true to favorite, false to unfavorite (default: true)'),
  },
  set_link_access: {
    file_key: figmaId.describe('File key'),
    link_access: z.enum(['inherit', 'view', 'edit', 'org_view', 'org_edit']).optional().describe('Link access level (default: inherit)'),
  },
  list_org_libraries: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  check_auth: {},
  list_orgs: {},
  switch_org: {
    org: z.string().describe('Org name or ID to switch to'),
  },
  list_teams: {},
  list_projects: {
    team_id: figmaId.describe('Team ID'),
  },
  list_files: {
    project_id: figmaId.describe('Project (folder) ID'),
    page_size: z.number().int().min(1).max(100).optional().describe('Results per page (default 25, max 100)'),
    page_token: z.string().optional().describe('Pagination token from previous response'),
  },
  list_recent_files: {},
  search: {
    query: z.string().describe('Search query'),
    sort: z.enum(['relevancy', 'last_modified']).optional().describe('Sort order (default: relevancy)'),
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  get_file_info: {
    file_key: figmaId.describe('Figma file key (from the URL)'),
  },
  list_favorites: {},
  list_admins: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
    include_license_admins: z.boolean().optional().describe('Include license admins (default false)'),
  },
  list_org_teams: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
    include_secret_teams: z.boolean().optional().describe('Include secret teams (default false)'),
  },
  seat_usage: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
    search_query: z.string().optional().describe('Filter counts by user search query'),
  },
  list_team_members: {
    team_id: figmaId.describe('Team ID'),
  },
  billing_overview: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  list_invoices: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  org_domains: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  ai_credit_usage: {
    team_id: figmaId.describe('Team ID (used to resolve the billing plan)'),
    plan_id: figmaId.optional().describe('Plan ID override (skips team folder lookup)'),
  },
  export_members: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  list_org_members: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
    search_query: z.string().optional().describe('Filter members by name or email'),
  },
  contract_rates: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  change_seat: {
    user_id: z.string().describe('User ID or email address of the target user'),
    seat_type: z.enum(['full', 'dev', 'collab', 'view']).describe('Target seat type'),
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
    confirm: z.boolean().optional().describe('Required when upgrading to a higher/paid seat. Set to true to authorize the billing change.'),
  },
  activity_log: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
    emails: z.string().optional().describe('Comma-separated emails to filter (e.g. "alice@acme.com,bob@acme.com")'),
    start_time: z.string().optional().describe('Start date (ISO or YYYY-MM-DD). Defaults to 30 days ago.'),
    end_time: z.string().optional().describe('End date (ISO or YYYY-MM-DD). Defaults to now.'),
    page_size: z.number().int().min(1).max(100).int().optional().describe('Entries per page (default: 50)'),
    after: z.string().optional().describe('Pagination cursor from previous response'),
  },
  list_payments: {
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  remove_org_member: {
    user_identifier: z.string().describe('Email or user_id of the member to remove'),
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
    confirm: z.boolean().optional().describe('Must be true to execute. Without it, returns a warning explaining consequences.'),
  },
  create_user_group: {
    name: z.string().describe('Group name'),
    description: z.string().optional().describe('Group description'),
    team_id: figmaId.optional().describe('Team ID (used to resolve billing plan)'),
    plan_id: figmaId.optional().describe('Plan ID override (skips team lookup)'),
    emails: z.array(z.string()).optional().describe('Emails to add as initial members'),
    should_notify: z.boolean().optional().describe('Notify members (default true)'),
  },
  delete_user_groups: {
    user_group_ids: z.array(figmaId).describe('User group IDs to delete'),
  },
  add_user_group_members: {
    user_group_id: figmaId.describe('User group ID'),
    emails: z.array(z.string()).describe('Email addresses to add'),
  },
  remove_user_group_members: {
    user_group_id: figmaId.describe('User group ID'),
    user_ids: z.array(z.string()).describe('User IDs to remove'),
  },
  get_permissions: {
    resource_type: z.enum(['file', 'folder', 'team']).describe('Type of resource'),
    resource_id: figmaId.describe('Resource ID (file key, folder ID, or team ID)'),
  },
  set_permissions: {
    resource_type: z.enum(['file', 'folder', 'team']).describe('Type of resource'),
    resource_id: figmaId.describe('Resource ID'),
    user_id: figmaId.describe('User ID to change access for'),
    role: z.enum(['owner', 'editor', 'viewer']).describe('Role to assign'),
  },
  share: {
    resource_type: z.enum(['file', 'folder', 'team']).describe('Type of resource'),
    resource_id: figmaId.describe('Resource ID (file key, folder ID, or team ID)'),
    email: z.string().describe('Email address to invite'),
    role: z.enum(['editor', 'viewer']).optional().describe('Role to grant (default: viewer)'),
  },
  revoke_access: {
    resource_type: z.enum(['file', 'folder', 'team']).describe('Type of resource'),
    resource_id: figmaId.describe('Resource ID'),
    user_id: figmaId.describe('User ID to revoke access from'),
  },
  list_role_requests: {},
  approve_role_request: {
    notification_id: figmaId.describe('Notification ID from list_role_requests'),
  },
  deny_role_request: {
    notification_id: figmaId.describe('Notification ID from list_role_requests'),
  },
  create_project: {
    team_id: figmaId.describe('Team ID to create the project in'),
    name: z.string().describe('Project name'),
  },
  rename_project: {
    project_id: figmaId.describe('Project ID'),
    name: z.string().describe('New name'),
  },
  move_project: {
    project_id: figmaId.describe('Project ID to move'),
    destination_team_id: figmaId.describe('Destination team ID'),
  },
  trash_project: {
    project_id: figmaId.describe('Project ID to trash'),
  },
  restore_project: {
    project_id: figmaId.describe('Project ID to restore'),
  },
  set_project_description: {
    project_id: figmaId.describe('Project ID'),
    description: z.string().describe('New description text'),
  },
  get_file: {
    file_key: figmaId.describe('File key (or branch file key from list_branches)'),
    depth: z.number().int().optional().describe('Tree depth limit. 0=root, 1=pages, 2=top-level frames. Omit for full tree.'),
    node_id: figmaId.optional().describe('Start from a specific node instead of document root'),
  },
  get_nodes: {
    file_key: figmaId.describe('File key'),
    node_ids: z.array(figmaId).min(1).describe('Node IDs to fetch'),
    depth: z.number().int().optional().describe('Depth limit per node'),
  },
  create_team: {
    name: z.string().describe('Team name'),
    org_id: figmaId.optional().describe('Org ID override (defaults to current workspace)'),
  },
  rename_team: {
    team_id: figmaId.describe('Team ID'),
    name: z.string().describe('New team name'),
  },
  delete_team: {
    team_id: figmaId.describe('Team ID'),
  },
  add_team_member: {
    team_id: figmaId.describe('Team ID'),
    email: z.string().describe('Email address of the user to add'),
    level: z.number().int().optional().describe('Permission level: 100 = view (default), 300 = edit, 999 = admin'),
  },
  remove_team_member: {
    team_id: figmaId.describe('Team ID'),
    user_id: figmaId.describe('User ID to remove'),
  },
  list_local_variables: {
    file_key: figmaId.describe('File key'),
  },
  list_published_variables: {
    file_key: figmaId.describe('File key'),
  },
  update_variables: {
    file_key: figmaId.describe('File key'),
    variable_collections: z.array(z.record(z.any())).optional().describe('Collection operations (action: CREATE, UPDATE, or DELETE)'),
    variable_modes: z.array(z.record(z.any())).optional().describe('Mode operations (action: CREATE, UPDATE, or DELETE)'),
    variables: z.array(z.record(z.any())).optional().describe('Variable operations (action: CREATE, UPDATE, or DELETE)'),
    variable_mode_values: z.array(z.record(z.any())).optional().describe('Value assignments (action: CREATE, UPDATE, or DELETE)'),
  },
  list_versions: {
    file_key: figmaId.describe('File key'),
  },
  create_version: {
    file_key: figmaId.describe('File key'),
    title: z.string().describe('Version title/label'),
    description: z.string().optional().describe('Version description'),
  },
  list_webhooks: {
    team_id: figmaId.describe('Team ID'),
  },
  create_webhook: {
    team_id: figmaId.describe('Team ID'),
    event_type: eventTypeEnum.describe('Event type to subscribe to'),
    endpoint: z.string().describe('URL to receive webhook payloads'),
    passcode: z.string().describe('Secret for signature verification'),
    description: z.string().optional().describe('Webhook description'),
  },
  update_webhook: {
    webhook_id: figmaId.describe('Webhook ID'),
    event_type: eventTypeEnum.optional().describe('Event type to subscribe to'),
    endpoint: z.string().optional().describe('URL to receive webhook payloads'),
    passcode: z.string().optional().describe('Secret for signature verification'),
    description: z.string().optional().describe('Webhook description'),
    status: z.enum(['ACTIVE', 'PAUSED']).optional().describe('Webhook status'),
  },
  webhook_requests: {
    webhook_id: figmaId.describe('Webhook ID'),
  },
  delete_webhook: {
    webhook_id: figmaId.describe('Webhook ID'),
  },
};

export const operationCatalog = {
  library_usage: { description: 'Team-level library adoption metrics. Shows how a published library is used across teams.', toolset: 'analytics', auth: 'cookie', adminOnly: true },
  component_usage: { description: 'Per-file component usage analytics. Shows which files use a specific component.', toolset: 'analytics', auth: 'cookie', adminOnly: true },
  list_branches: { description: 'List branches of a file.', toolset: 'branching', auth: 'either' },
  create_branch: { description: 'Create a branch from a file.', toolset: 'branching', auth: 'cookie', mutates: true },
  delete_branch: { description: 'Archive (delete) a branch. Uses the branch file key from list_branches.', toolset: 'branching', auth: 'cookie', mutates: true, destructive: true },
  list_comments: { description: 'List comments on a file. Returns comment text, author, timestamps, and thread structure.', toolset: 'comments', auth: 'pat' },
  post_comment: { description: 'Post a comment on a file. Optionally pin to a specific node or reply to an existing comment.', toolset: 'comments', auth: 'pat', mutates: true },
  delete_comment: { description: 'Permanently delete a comment. For top-level comments, the entire thread is removed. Cannot be undone.', toolset: 'comments', auth: 'pat', mutates: true, destructive: true },
  list_comment_reactions: { description: 'List emoji reactions on a comment.', toolset: 'comments', auth: 'pat' },
  resolve_comment: { description: 'Resolve or unresolve a comment thread. Resolved comments are collapsed in the Figma UI.', toolset: 'comments', auth: 'cookie', mutates: true },
  edit_comment: { description: 'Edit the text of an existing comment.', toolset: 'comments', auth: 'cookie', mutates: true },
  add_comment_reaction: { description: 'Add an emoji reaction to a comment.', toolset: 'comments', auth: 'pat', mutates: true },
  remove_comment_reaction: { description: 'Remove your emoji reaction from a comment.', toolset: 'comments', auth: 'pat', mutates: true },
  list_file_components: { description: 'List components published from a file. Only published library components appear -- local unpublished components are not included.', toolset: 'components', auth: 'pat' },
  list_file_styles: { description: 'List styles published from a file. Only published library styles appear.', toolset: 'components', auth: 'pat' },
  list_team_components: { description: 'List published components across a team. Pass the cursor from the response\'s pagination object to fetch the next page.', toolset: 'components', auth: 'pat' },
  list_team_styles: { description: 'List published styles across a team. Pass the cursor from the response\'s pagination object to fetch the next page.', toolset: 'components', auth: 'pat' },
  offboard_user: { description: 'Audit and optionally execute user offboarding. Default: read-only audit. Complete nested-folder discovery requires a PAT for the browser account with current_user:read and folders:read. With execute=true: transfers file ownership, removes discovered direct grants, and verifies access and seat changes. Team/folder ownership and retained org admin roles can block execution. Inspect coverage, execution_blockers, and remaining_work; groups, drafts, and inherited access require separate review. With remove_from_org=true: also permanently removes the user from the org (cannot be undone).', toolset: 'compound', auth: 'cookie', mutates: true, destructive: true, adminOnly: true },
  onboard_user: { description: 'Invite a user to teams and optionally share files and set seat type. Sends invite emails per team.', toolset: 'compound', auth: 'cookie', mutates: true, adminOnly: true },
  quarterly_design_ops_report: { description: 'Org-wide design ops snapshot: seat utilization, team activity, billing, and library adoption over a given period.', toolset: 'compound', auth: 'cookie', adminOnly: true },
  file_summary: { description: 'Quick overview of a Figma file. Fetches pages, components, styles, and comment counts in parallel.', toolset: 'compound', auth: 'pat' },
  workspace_overview: { description: 'Full org snapshot: teams with member/project counts, seat breakdown, and billing summary.', toolset: 'compound', auth: 'cookie', adminOnly: true },
  open_comments: { description: 'Aggregated unresolved comments across all files in a project. Checks up to 20 files.', toolset: 'compound', auth: 'pat' },
  cleanup_stale_files: { description: 'Find files not modified in N days and optionally trash them. dry_run=true (default) previews which files would be trashed without trashing them. Set dry_run=false to execute.', toolset: 'compound', auth: 'either', mutates: true, destructive: true },
  organize_project: { description: 'Move files into a target project in a single batch. Files are moved (not copied) from their current project.', toolset: 'compound', auth: 'cookie', mutates: true },
  setup_project_structure: { description: 'Create multiple projects in a team from a plan. Optionally set descriptions.', toolset: 'compound', auth: 'cookie', mutates: true },
  seat_optimization: { description: 'Identify inactive paid seats and calculate potential savings. Fetches members, seat counts, and pricing to find optimization opportunities.', toolset: 'compound', auth: 'cookie', adminOnly: true },
  permission_audit: { description: 'Audit permissions across a team or project. Scans files for external editors, open link access, and elevated individual permissions.', toolset: 'compound', auth: 'cookie', adminOnly: true },
  branch_cleanup: { description: 'Find stale branches across a project and optionally archive them. dry_run=true (default) previews which branches would be archived. Archives move branch files to trash (recoverable).', toolset: 'compound', auth: 'either', mutates: true, destructive: true },
  list_dev_resources: { description: 'List dev resources (links, annotations) attached to nodes in a file. Used in Dev Mode.', toolset: 'components', auth: 'pat' },
  create_dev_resource: { description: 'Create a dev resource (link/annotation) on a node. Visible in Dev Mode.', toolset: 'components', auth: 'pat', mutates: true },
  delete_dev_resource: { description: 'Delete a dev resource from a file.', toolset: 'components', auth: 'pat', mutates: true, destructive: true },
  export_nodes: { description: 'Export specific nodes from a file as images. Returns temporary URLs (valid ~14 days).', toolset: 'export', auth: 'pat' },
  get_image_fills: { description: 'Get download URLs for all images used as fills in a file.', toolset: 'export', auth: 'pat' },
  create_file: { description: 'Create a new Figma file in a project. Supports design, whiteboard, slides, sites.', toolset: 'files', auth: 'cookie', mutates: true },
  rename_file: { description: 'Rename a Figma file.', toolset: 'files', auth: 'cookie', mutates: true },
  move_files: { description: 'Move one or more files to a different project. Supports batch moves.', toolset: 'files', auth: 'cookie', mutates: true },
  duplicate_file: { description: 'Duplicate a file. Optionally specify a destination project.', toolset: 'files', auth: 'cookie', mutates: true },
  trash_files: { description: 'Move files to trash (recoverable via restore_files). Supports batch operations.', toolset: 'files', auth: 'cookie', mutates: true, destructive: true },
  restore_files: { description: 'Restore files from trash.', toolset: 'files', auth: 'cookie', mutates: true },
  favorite_file: { description: 'Add or remove a file from your sidebar favorites.', toolset: 'files', auth: 'cookie', mutates: true },
  set_link_access: { description: 'Set link access on a file. Use "inherit" to remove custom access and fall back to project/team defaults.', toolset: 'files', auth: 'cookie', mutates: true },
  list_org_libraries: { description: 'List all design system libraries in the org with sharing group info.', toolset: 'libraries', auth: 'cookie' },
  check_auth: { description: 'Check authentication status for both PAT and session cookie', toolset: 'navigate', auth: 'either' },
  list_orgs: { description: 'List all Figma workspaces (orgs) you belong to. Shows which is currently active.', toolset: 'navigate', auth: 'cookie' },
  switch_org: { description: 'Switch active workspace. Accepts org name (fuzzy match) or ID. Use list_orgs to see available workspaces.', toolset: 'navigate', auth: 'cookie' },
  list_teams: { description: 'List all teams you belong to. Returns team IDs and names.', toolset: 'navigate', auth: 'cookie' },
  list_projects: { description: 'List projects (folders) in a team. Returns project IDs, names.', toolset: 'navigate', auth: 'either' },
  list_files: { description: 'List files in a project. Returns file keys, names, last modified, editor type. Supports pagination.', toolset: 'navigate', auth: 'either' },
  list_recent_files: { description: 'List your recently viewed/edited files across all teams.', toolset: 'navigate', auth: 'cookie' },
  search: { description: 'Search for files across the workspace. Requires org context for results.', toolset: 'navigate', auth: 'cookie' },
  get_file_info: { description: 'Get metadata for a file: name, last modified, editor type, project, team.', toolset: 'navigate', auth: 'either' },
  list_favorites: { description: 'List your starred/favorited files. Note: may not work on all account types.', toolset: 'navigate', auth: 'cookie' },
  list_admins: { description: 'List org admins with their permission levels, seat status, and email validation state.', toolset: 'org', auth: 'cookie', adminOnly: true },
  list_org_teams: { description: 'List all teams in the org with member counts, project counts, and access levels.', toolset: 'org', auth: 'cookie', adminOnly: true },
  seat_usage: { description: 'Seat usage breakdown: permission counts, seat types, activity recency, and account type distribution.', toolset: 'org', auth: 'cookie', adminOnly: true },
  list_team_members: { description: 'List members of a team with name, email, avatar, last active date, and role.', toolset: 'org', auth: 'cookie', adminOnly: true },
  billing_overview: { description: 'Org billing data including invoice history, status, amounts, and billing periods.', toolset: 'org', auth: 'cookie', adminOnly: true },
  list_invoices: { description: 'List open and upcoming invoices for the org.', toolset: 'org', auth: 'cookie', adminOnly: true },
  org_domains: { description: 'Org domain configuration and SSO/SAML settings.', toolset: 'org', auth: 'cookie', adminOnly: true },
  ai_credit_usage: { description: 'AI credit usage summary. Provide a team_id and the plan is resolved automatically, or pass plan_id directly.', toolset: 'org', auth: 'cookie', adminOnly: true },
  export_members: { description: 'Trigger async CSV export of all org members. The CSV is sent to the admin email on file.', toolset: 'org', auth: 'cookie', mutates: true, adminOnly: true },
  list_org_members: { description: 'List org members with seat type, permission, email, and last active date. Use to resolve org_user_ids for change_seat.', toolset: 'org', auth: 'cookie', adminOnly: true },
  contract_rates: { description: 'Seat pricing for the org. Returns monthly cost per seat type (expert, developer, collaborator).', toolset: 'org', auth: 'cookie', adminOnly: true },
  change_seat: { description: 'Change a user\'s seat type. Accepts user_id or email to identify the user. Upgrades affect billing.', toolset: 'org', auth: 'cookie', mutates: true, destructive: true, adminOnly: true },
  activity_log: { description: 'Org audit log. Shows who did what, when. Filter by email for per-user activity. Supports date ranges and cursor pagination.', toolset: 'org', auth: 'cookie', adminOnly: true },
  list_payments: { description: 'List paid invoices / payment history for the org.', toolset: 'org', auth: 'cookie', adminOnly: true },
  remove_org_member: { description: 'Permanently remove a member from the org. They lose all access to teams, projects, files, and apps. Cannot be undone. Requires confirm: true.', toolset: 'org', auth: 'cookie', mutates: true, destructive: true, adminOnly: true },
  create_user_group: { description: 'Create a user group. Provide team_id to auto-resolve the billing plan, or pass plan_id directly.', toolset: 'org', auth: 'cookie', mutates: true, adminOnly: true },
  delete_user_groups: { description: 'Delete one or more user groups by ID.', toolset: 'org', auth: 'cookie', mutates: true, destructive: true, adminOnly: true },
  add_user_group_members: { description: 'Add members to a user group by email.', toolset: 'org', auth: 'cookie', mutates: true, adminOnly: true },
  remove_user_group_members: { description: 'Remove members from a user group by user ID.', toolset: 'org', auth: 'cookie', mutates: true, adminOnly: true },
  get_permissions: { description: 'See who has access to a file, project, or team. Returns users with roles and role IDs.', toolset: 'permissions', auth: 'cookie' },
  set_permissions: { description: 'Change access level for a user on a file, project, or team. Looks up the role by user_id.', toolset: 'permissions', auth: 'cookie', mutates: true },
  share: { description: 'Share a file or project with someone by email. Sends an invite.', toolset: 'permissions', auth: 'cookie', mutates: true },
  revoke_access: { description: "Remove a user's access to a file, project, or team. The user loses access immediately.", toolset: 'permissions', auth: 'cookie', mutates: true, destructive: true },
  list_role_requests: { description: 'List pending file access requests. These come through the notification system.', toolset: 'permissions', auth: 'cookie', adminOnly: true },
  approve_role_request: { description: 'Approve a pending file access request by notification ID.', toolset: 'permissions', auth: 'cookie', mutates: true, adminOnly: true },
  deny_role_request: { description: 'Decline a pending file access request by notification ID.', toolset: 'permissions', auth: 'cookie', mutates: true, adminOnly: true },
  create_project: { description: 'Create a new project (folder) in a team.', toolset: 'projects', auth: 'cookie', mutates: true },
  rename_project: { description: 'Rename a project (folder).', toolset: 'projects', auth: 'cookie', mutates: true },
  move_project: { description: 'Move a project to a different team.', toolset: 'projects', auth: 'cookie', mutates: true },
  trash_project: { description: 'Move a project and all its files to trash. Recoverable via restore_project.', toolset: 'projects', auth: 'cookie', mutates: true, destructive: true },
  restore_project: { description: 'Restore a project from trash.', toolset: 'projects', auth: 'cookie', mutates: true },
  set_project_description: { description: 'Set or update a project description.', toolset: 'projects', auth: 'cookie', mutates: true },
  get_file: { description: 'Read file contents as a node tree. Use depth to limit response size (full trees can be very large). depth=1 returns pages only. To read a branch, use the branch file key from list_branches.', toolset: 'reading', auth: 'pat' },
  get_nodes: { description: 'Read specific nodes from a file. Returns the full node tree for each ID including type, name, layout properties, fills, strokes, and children.', toolset: 'reading', auth: 'pat' },
  create_team: { description: 'Create a new team in the org.', toolset: 'teams', auth: 'cookie', mutates: true, adminOnly: true },
  rename_team: { description: 'Rename an existing team.', toolset: 'teams', auth: 'cookie', mutates: true },
  delete_team: { description: 'Permanently delete a team and all its projects/files. This cannot be undone. All team members lose access.', toolset: 'teams', auth: 'cookie', mutates: true, destructive: true, adminOnly: true },
  add_team_member: { description: 'Add a member to a team by email. Level: 100 = can view (default), 300 = can edit, 999 = admin.', toolset: 'teams', auth: 'cookie', mutates: true, adminOnly: true },
  remove_team_member: { description: 'Remove a member from a team. The user loses access to all team projects and files.', toolset: 'teams', auth: 'cookie', mutates: true, destructive: true, adminOnly: true },
  list_local_variables: { description: 'List local variables and variable collections in a file. Requires Enterprise plan.', toolset: 'variables', auth: 'pat' },
  list_published_variables: { description: 'List published variables from a library file. Requires Enterprise plan.', toolset: 'variables', auth: 'pat' },
  update_variables: { description: 'Bulk create, update, or delete variables, collections, modes, and mode values. Requires Enterprise plan. Each operation object needs an action field (CREATE, UPDATE, or DELETE). Deletions are immediate and cannot be undone -- list variables first to verify IDs.', toolset: 'variables', auth: 'pat', mutates: true, destructive: true },
  list_versions: { description: 'List version history for a file. Returns named snapshots and auto-saves.', toolset: 'versions', auth: 'pat' },
  create_version: { description: 'Create a named version (checkpoint) in a file\'s history.', toolset: 'versions', auth: 'cookie', mutates: true },
  list_webhooks: { description: 'List webhook subscriptions for a team. Returns webhook IDs, endpoints, event types, and status.', toolset: 'webhooks', auth: 'pat' },
  create_webhook: { description: 'Create a webhook subscription for a team.', toolset: 'webhooks', auth: 'pat', mutates: true },
  update_webhook: { description: "Update a webhook's endpoint, event type, passcode, description, or status (ACTIVE/PAUSED).", toolset: 'webhooks', auth: 'pat', mutates: true },
  webhook_requests: { description: 'List recent webhook delivery attempts (last 7 days). Shows payload, response status, and errors.', toolset: 'webhooks', auth: 'pat' },
  delete_webhook: { description: 'Permanently delete a webhook. The webhook stops receiving events immediately. Cannot be undone.', toolset: 'webhooks', auth: 'pat', mutates: true, destructive: true },
};
