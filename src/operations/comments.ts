import type { AuthConfig } from '../auth/client.js';
import { publicClient } from '../clients/public-api.js';
import { internalClient } from '../clients/internal-api.js';

export interface Comment {
  id: string;
  parent_id: string | null;
  message: string;
  author: string;
  author_id: string;
  created_at: string;
  resolved_at: string | null;
  node_id: string | null;
  order_id: number;
}

export interface PostedComment {
  id: string;
  message: string;
  author: string;
  created_at: string;
  parent_id: string | null;
}

export interface Reaction {
  emoji: string;
  user: string;
  created_at: string;
}

export async function listComments(
  config: AuthConfig,
  params: { file_key: string },
): Promise<Comment[]> {
  const res = await publicClient(config).get(`/v1/files/${params.file_key}/comments`);
  const comments = res.data?.comments || [];
  return comments.map((c: any) => ({
    id: c.id,
    parent_id: c.parent_id || null,
    message: c.message,
    author: c.user?.handle,
    author_id: c.user?.id,
    created_at: c.created_at,
    resolved_at: c.resolved_at || null,
    node_id: c.client_meta?.node_id || c.client_meta?.node_offset?.node_id || null,
    order_id: c.order_id,
  }));
}

export function formatCommentsAsMarkdown(comments: Comment[]): string {
  const threads = new Map<string, Comment[]>();
  for (const c of comments) {
    const parentId = c.parent_id || c.id;
    if (!threads.has(parentId)) threads.set(parentId, []);
    threads.get(parentId)!.push(c);
  }

  const lines: string[] = [];
  for (const [, thread] of threads) {
    thread.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (const c of thread) {
      const indent = c.parent_id ? '  ' : '';
      const resolved = c.resolved_at ? ' [resolved]' : '';
      lines.push(`${indent}- **${c.author}** (${c.created_at})${resolved}: ${c.message}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function postComment(
  config: AuthConfig,
  params: { file_key: string; message: string; comment_id?: string; node_id?: string },
): Promise<PostedComment> {
  const body: any = { message: params.message };
  if (params.comment_id) body.comment_id = params.comment_id;
  if (params.node_id) body.client_meta = { node_id: params.node_id, node_offset: { x: 0, y: 0 } };

  const res = await publicClient(config).post(`/v1/files/${params.file_key}/comments`, body);
  const c = res.data;
  return {
    id: c.id,
    message: c.message,
    author: c.user?.handle,
    created_at: c.created_at,
    parent_id: c.parent_id || null,
  };
}

export async function deleteComment(
  config: AuthConfig,
  params: { file_key: string; comment_id: string },
): Promise<void> {
  await publicClient(config).delete(`/v1/files/${params.file_key}/comments/${params.comment_id}`);
}

export async function resolveComment(
  config: AuthConfig,
  params: { file_key: string; comment_id: string; resolved?: boolean },
): Promise<string> {
  const resolve = params.resolved !== false;
  await internalClient(config).put(
    `/api/file/${params.file_key}/comments/${params.comment_id}`,
    { resolved_at: resolve ? 'true' : null },
  );
  return `Comment ${params.comment_id} ${resolve ? 'resolved' : 'unresolved'}.`;
}

export async function editComment(
  config: AuthConfig,
  params: { file_key: string; comment_id: string; message: string },
): Promise<string> {
  await internalClient(config).put(
    `/api/file/${params.file_key}/comments/${params.comment_id}`,
    { message_meta: [{ t: params.message }] },
  );
  return `Comment ${params.comment_id} updated.`;
}

export interface AddedReaction {
  emoji: string;
  user: string;
  created_at: string;
}

export async function addCommentReaction(
  config: AuthConfig,
  params: { file_key: string; comment_id: string; emoji: string },
): Promise<AddedReaction> {
  const res = await publicClient(config).post(
    `/v1/files/${params.file_key}/comments/${params.comment_id}/reactions`,
    { emoji: params.emoji },
  );
  const r = res.data;
  return {
    emoji: r.emoji || params.emoji,
    user: r.user?.handle || '',
    created_at: r.created_at || new Date().toISOString(),
  };
}

export async function removeCommentReaction(
  config: AuthConfig,
  params: { file_key: string; comment_id: string; emoji: string },
): Promise<void> {
  await publicClient(config).delete(
    `/v1/files/${params.file_key}/comments/${params.comment_id}/reactions`,
    { params: { emoji: params.emoji } },
  );
}

export async function listCommentReactions(
  config: AuthConfig,
  params: { file_key: string; comment_id: string },
): Promise<Reaction[]> {
  const res = await publicClient(config).get(
    `/v1/files/${params.file_key}/comments/${params.comment_id}/reactions`,
  );
  const reactions = res.data?.reactions || [];
  return reactions.map((r: any) => ({
    emoji: r.emoji,
    user: r.user?.handle,
    created_at: r.created_at,
  }));
}
