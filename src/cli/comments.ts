import { Command } from 'commander';
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
import { output, error } from './format.js';
import { formatApiError } from '../helpers.js';
import { requirePat, requireCookie } from './helpers.js';

export function commentsCommand(): Command {
  const comments = new Command('comments')
    .description('Manage file comments');

  comments
    .command('list <file-key>')
    .description('List comments on a file')
    .option('--md', 'Format as markdown threads')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: { md?: boolean; json?: boolean }) => {
      try {
        const config = requirePat();
        const result = await listComments(config, { file_key: fileKey });
        if (options.md) {
          console.log(formatCommentsAsMarkdown(result));
          return;
        }
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  comments
    .command('post <file-key>')
    .description('Post a comment on a file')
    .requiredOption('--message <text>', 'Comment text')
    .option('--reply-to <comment-id>', 'Parent comment ID to reply to')
    .option('--node <node-id>', 'Node ID to pin the comment to')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, options: {
      message: string;
      replyTo?: string;
      node?: string;
      json?: boolean;
    }) => {
      try {
        const config = requirePat();
        const result = await postComment(config, {
          file_key: fileKey,
          message: options.message,
          comment_id: options.replyTo,
          node_id: options.node,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  comments
    .command('delete <file-key> <comment-id>')
    .description('Delete a comment (removes entire thread if top-level)')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, commentId: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        const { confirmAction } = await import('./helpers.js');
        if (!await confirmAction(`Delete comment ${commentId}? For top-level comments, the entire thread is removed.`)) {
          console.log('Cancelled.');
          return;
        }
        await deleteComment(config, { file_key: fileKey, comment_id: commentId });
        output({ deleted: commentId }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  comments
    .command('reactions <file-key> <comment-id>')
    .description('List emoji reactions on a comment')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, commentId: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        const result = await listCommentReactions(config, {
          file_key: fileKey,
          comment_id: commentId,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  comments
    .command('resolve <file-key> <comment-id>')
    .description('Resolve a comment thread')
    .option('--unresolve', 'Unresolve instead of resolve')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, commentId: string, options: {
      unresolve?: boolean;
      json?: boolean;
    }) => {
      try {
        const config = requireCookie();
        const msg = await resolveComment(config, {
          file_key: fileKey,
          comment_id: commentId,
          resolved: !options.unresolve,
        });
        output({ message: msg }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  comments
    .command('edit <file-key> <comment-id> <message>')
    .description('Edit the text of an existing comment')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, commentId: string, message: string, options: { json?: boolean }) => {
      try {
        const config = requireCookie();
        const msg = await editComment(config, {
          file_key: fileKey,
          comment_id: commentId,
          message,
        });
        output({ message: msg }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  comments
    .command('react <file-key> <comment-id> <emoji>')
    .description('Add an emoji reaction to a comment')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, commentId: string, emoji: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        const result = await addCommentReaction(config, {
          file_key: fileKey,
          comment_id: commentId,
          emoji,
        });
        output(result, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  comments
    .command('unreact <file-key> <comment-id> <emoji>')
    .description('Remove an emoji reaction from a comment')
    .option('--json', 'Force JSON output')
    .action(async (fileKey: string, commentId: string, emoji: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        await removeCommentReaction(config, {
          file_key: fileKey,
          comment_id: commentId,
          emoji,
        });
        output({ removed: emoji, comment_id: commentId }, options);
      } catch (e: any) {
        error(formatApiError(e));
        process.exit(1);
      }
    });

  return comments;
}
