import type { AxiosInstance } from 'axios';

export interface OffboardProgress {
  operation: 'offboard_user';
  sequence: number;
  phase: 'discovery' | 'transfer' | 'revoke' | 'seat' | 'verification' | 'membership' | 'complete';
  message: string;
  resource_id?: string;
  status?: string;
}

export type OffboardProgressHandler = (event: OffboardProgress) => void | Promise<void>;

export function safeId(value: unknown): string {
  if ((typeof value !== 'string' && typeof value !== 'number')
    || (typeof value === 'number' && !Number.isSafeInteger(value))
    || !/^[\w.:-]+$/.test(String(value))) throw new Error('Invalid resource ID in discovery response.');
  return String(value);
}

export function requireCompleteOffboardPage(data: any): void {
  if (!data || data.error === true) throw new Error('Discovery response was unsuccessful.');
  for (const page of [data, data.pagination, data.meta, data.meta?.pagination]) {
    if (page?.has_more || page?.next_page || page?.next_cursor || page?.next_page_token
      || (Array.isArray(page?.cursor) ? page.cursor.length > 0 : !!page?.cursor)) {
      throw new Error('Discovery response contains another page.');
    }
  }
}

export async function readOffboardRoles(api: AxiosInstance, type: string, id: string): Promise<any[]> {
  const res = await api.get(`/api/roles/${type}/${safeId(id)}`);
  requireCompleteOffboardPage(res.data);
  if (!Array.isArray(res.data.meta) || res.data.meta.some((role: any) => !role || !Number.isInteger(role.level)
    || (role.user_id == null && !role.pending_email && !role.user_group_id))) {
    throw new Error('Unexpected permission listing response.');
  }
  for (const role of res.data.meta) if (role.user_id != null) safeId(role.user_id);
  return res.data.meta;
}

/** Do not infer absence from a missing collection or an unfinished member page. */
export async function findOffboardMember(api: AxiosInstance, orgId: string, identifier: string): Promise<any | undefined> {
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 200; page++) {
    const res = await api.get(`/api/v2/orgs/${orgId}/org_users`, {
      params: { page_size: 50, ...(identifier.includes('@') ? { search_query: identifier } : {}), ...(cursor ? { cursor } : {}) },
    });
    const data = res.data;
    const users = data?.meta?.users ?? data?.meta ?? data;
    if (data?.error === true || !Array.isArray(users)) throw new Error('Unexpected organization member response.');
    const member = users.find((row: any) => identifier.includes('@')
      ? row.user?.email?.toLowerCase() === identifier.toLowerCase()
      : String(row.user_id) === identifier);
    if (member) {
      safeId(member.user_id); safeId(member.id);
      return member;
    }
    const rawCursor = data?.meta?.cursor;
    if (Array.isArray(rawCursor) && rawCursor.length > 1) throw new Error('Cannot complete member discovery: ambiguous cursor.');
    const next = Array.isArray(rawCursor) ? rawCursor[0] : rawCursor;
    if (next == null || next === '') {
      requireCompleteOffboardPage(data);
      if (users.length >= 50 && rawCursor === undefined) throw new Error('Cannot complete member discovery: full page without pagination metadata.');
      return undefined;
    }
    if (typeof next !== 'string' || seen.has(next)) throw new Error('Cannot complete member discovery: invalid or repeated cursor.');
    seen.add(next); cursor = next;
  }
  throw new Error('Cannot complete member discovery: page limit reached.');
}

export function checkOffboardWrite(response: any): void {
  if (response?.data?.error === true) throw new Error('Figma rejected the requested change.');
}

/** Verify the explicit grant is gone; this does not establish effective access. */
export async function revokeOffboardAccess(api: AxiosInstance, type: string, id: string, userId: string): Promise<void> {
  const roles = await readOffboardRoles(api, type, id);
  const matches = roles.filter(role => String(role.user_id) === userId);
  if (matches.length > 1) throw new Error('Multiple direct roles found. Inspect permissions before retrying.');
  const role = matches[0];
  if (role?.level === 999) throw new Error('User still owns this resource. Transfer ownership before revoking access.');
  if (role) checkOffboardWrite(await api.delete(`/api/roles/${safeId(role.id)}`));
  const verified = await readOffboardRoles(api, type, id);
  if (verified.some(row => String(row.user_id) === userId)) throw new Error('Access removal could not be verified.');
}
