import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import { defineTool, toolResult, toolError, toolSummary, figmaId } from './register.js';
import { formatApiError } from '../helpers.js';
import {
  listComments,
  formatCommentsAsMarkdown,
  postComment,
  deleteComment,
  resolveComment,
  editComment,
  addCommentReaction,
  removeCommentReaction,
  listCommentReactions,
} from '../operations/comments.js';

// -- list_comments --

defineTool({
  toolset: 'comments',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_comments',
      {
        description: 'List comments on a file. Returns comment text, author, timestamps, and thread structure.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          as_md: z.boolean().optional().describe('Format as markdown thread (default: false)'),
        },
      },
      async ({ file_key, as_md }) => {
        try {
          const comments = await listComments(config, { file_key });
          if (as_md) {
            return toolResult(formatCommentsAsMarkdown(comments));
          }
          if (comments.length === 0) return toolResult('No comments on this file.');
          return toolSummary(`${comments.length} comment(s).`, comments, 'Use post_comment to reply, resolve_comment to close threads, or delete_comment to remove.');
        } catch (e: any) {
          return toolError(`Failed to list comments: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- post_comment --

defineTool({
  toolset: 'comments',
  auth: 'pat',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'post_comment',
      {
        description: 'Post a comment on a file. Optionally pin to a specific node or reply to an existing comment.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          message: z.string().describe('Comment text'),
          comment_id: figmaId.optional().describe('Parent comment ID to reply to'),
          node_id: figmaId.optional().describe('Node ID to pin the comment to'),
        },
      },
      async ({ file_key, message, comment_id, node_id }) => {
        try {
          const result = await postComment(config, { file_key, message, comment_id, node_id });
          return toolSummary('Posted comment.', result);
        } catch (e: any) {
          return toolError(`Failed to post comment: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- delete_comment --

defineTool({
  toolset: 'comments',
  auth: 'pat',
  mutates: true,
  destructive: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'delete_comment',
      {
        description: 'Permanently delete a comment. For top-level comments, the entire thread is removed. Cannot be undone.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          comment_id: figmaId.describe('Comment ID to delete'),
        },
      },
      async ({ file_key, comment_id }) => {
        try {
          await deleteComment(config, { file_key, comment_id });
          return toolResult(`Deleted comment ${comment_id}`);
        } catch (e: any) {
          return toolError(`Failed to delete comment: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- list_comment_reactions --

defineTool({
  toolset: 'comments',
  auth: 'pat',
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'list_comment_reactions',
      {
        description: 'List emoji reactions on a comment.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          comment_id: figmaId.describe('Comment ID'),
        },
      },
      async ({ file_key, comment_id }) => {
        try {
          const reactions = await listCommentReactions(config, { file_key, comment_id });
          if (reactions.length === 0) return toolResult('No reactions on this comment.');
          return toolSummary(`${reactions.length} reaction(s).`, reactions, 'Use add_comment_reaction or remove_comment_reaction to manage.');
        } catch (e: any) {
          return toolError(`Failed to list reactions: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- resolve_comment --

defineTool({
  toolset: 'comments',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'resolve_comment',
      {
        description: 'Resolve or unresolve a comment thread. Resolved comments are collapsed in the Figma UI.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          comment_id: figmaId.describe('Comment ID to resolve'),
          resolved: z.boolean().optional().describe('true to resolve (default), false to unresolve'),
        },
      },
      async ({ file_key, comment_id, resolved }) => {
        try {
          const msg = await resolveComment(config, { file_key, comment_id, resolved });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to resolve comment: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- edit_comment --

defineTool({
  toolset: 'comments',
  auth: 'cookie',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'edit_comment',
      {
        description: 'Edit the text of an existing comment.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          comment_id: figmaId.describe('Comment ID'),
          message: z.string().describe('New comment text'),
        },
      },
      async ({ file_key, comment_id, message }) => {
        try {
          const msg = await editComment(config, { file_key, comment_id, message });
          return toolResult(msg);
        } catch (e: any) {
          return toolError(`Failed to edit comment: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- add_comment_reaction --

defineTool({
  toolset: 'comments',
  auth: 'pat',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'add_comment_reaction',
      {
        description: 'Add an emoji reaction to a comment.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          comment_id: figmaId.describe('Comment ID'),
          emoji: z.string().describe('Emoji shortcode (e.g. ":thumbsup:", ":heart:")'),
        },
      },
      async ({ file_key, comment_id, emoji }) => {
        try {
          const result = await addCommentReaction(config, { file_key, comment_id, emoji });
          return toolSummary(`Added ${result.emoji} reaction.`, result);
        } catch (e: any) {
          return toolError(`Failed to add reaction: ${formatApiError(e)}`);
        }
      },
    );
  },
});

// -- remove_comment_reaction --

defineTool({
  toolset: 'comments',
  auth: 'pat',
  mutates: true,
  register(server: McpServer, config: AuthConfig) {
    server.registerTool(
      'remove_comment_reaction',
      {
        description: 'Remove your emoji reaction from a comment.',
        inputSchema: {
          file_key: figmaId.describe('File key'),
          comment_id: figmaId.describe('Comment ID'),
          emoji: z.string().describe('Emoji shortcode to remove (e.g. ":thumbsup:")'),
        },
      },
      async ({ file_key, comment_id, emoji }) => {
        try {
          await removeCommentReaction(config, { file_key, comment_id, emoji });
          return toolResult(`Removed ${emoji} reaction from comment ${comment_id}.`);
        } catch (e: any) {
          return toolError(`Failed to remove reaction: ${formatApiError(e)}`);
        }
      },
    );
  },
});
