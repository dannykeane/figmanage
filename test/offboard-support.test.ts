import { expect, it, vi } from 'vitest';
import { findOffboardMember, readOffboardRoles, requireCompleteOffboardPage, revokeOffboardAccess } from '../src/operations/offboard-support.js';

it('follows member cursors before reporting absence', async () => {
  const get = vi.fn()
    .mockResolvedValueOnce({ data: { meta: { users: [], cursor: ['next'] } } })
    .mockResolvedValueOnce({ data: { meta: { users: [{ id: 'ou', user_id: 'target' }], cursor: [] } } });
  expect(await findOffboardMember({ get } as any, 'org', 'target')).toMatchObject({ user_id: 'target' });
  expect(get.mock.calls[1][1].params.cursor).toBe('next');
});

it.each([
  { meta: {} },
  { meta: { users: [], pagination: { has_more: true } } },
  { meta: { users: [] }, has_more: true },
  { error: true, meta: { users: [] } },
  { meta: { users: [], cursor: ['one', 'two'] } },
  { meta: { users: Array.from({ length: 50 }, (_, i) => ({ user_id: `other-${i}` })) } },
])('does not verify member absence from an incomplete or malformed response: %j', data => {
  const get = vi.fn().mockResolvedValue({ data });
  return expect(findOffboardMember({ get } as any, 'org', 'target')).rejects.toThrow();
});

it('rejects a repeated member cursor without looping', async () => {
  const get = vi.fn().mockResolvedValue({ data: { meta: { users: [], cursor: ['again'] } } });
  await expect(findOffboardMember({ get } as any, 'org', 'target')).rejects.toThrow('repeated cursor');
  expect(get).toHaveBeenCalledTimes(2);
});

it('matches email case without changing account identity', async () => {
  const get = vi.fn().mockResolvedValue({ data: { meta: { users: [{ id: 'ou', user_id: 'target', user: { email: 'Person@example.com' } }] } } });
  expect(await findOffboardMember({ get } as any, 'org', 'person@example.com')).toMatchObject({ user_id: 'target' });
});

it.each([{ pagination: {}, meta: { pagination: { next_cursor: 'next' } } }, { meta: { cursor: ['next'] } }])('checks all pagination envelopes: %j', data => {
  expect(() => requireCompleteOffboardPage(data)).toThrow('another page');
});

it.each([undefined, {}, { meta: {} }, { meta: [{ level: '999' }] }, { meta: [{ level: 300 }] }, { meta: [{ level: 300, user_id: ['old'] }] }, { meta: [], error: true }])('rejects malformed role collections: %j', data => {
  const get = vi.fn().mockResolvedValue({ data });
  return expect(readOffboardRoles({ get } as any, 'file', 'file')).rejects.toThrow();
});

it.each([
  [{ id: 'role', user_id: 'user', level: 999 }],
  [{ id: '../unsafe', user_id: 'user', level: 300 }],
  [{ id: 'a', user_id: 'user', level: 300 }, { id: 'b', user_id: 'user', level: 100 }],
])('refuses unsafe, ambiguous, or owner revocations: %j', async roles => {
  const api = { get: vi.fn().mockResolvedValue({ data: { meta: roles } }), delete: vi.fn() };
  await expect(revokeOffboardAccess(api as any, 'file', 'file', 'user')).rejects.toThrow();
  expect(api.delete).not.toHaveBeenCalled();
});

it('accepts a previously removed grant only after valid reads', async () => {
  const api = { get: vi.fn().mockResolvedValue({ data: { meta: [] } }), delete: vi.fn() };
  await revokeOffboardAccess(api as any, 'file', 'file', 'user');
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(api.delete).not.toHaveBeenCalled();
});
