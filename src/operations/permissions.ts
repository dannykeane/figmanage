import type { AuthConfig } from '../auth/client.js';
import { internalClient } from '../clients/internal-api.js';

export const LEVEL_MAP: Record<string, number> = { owner: 999, editor: 300, viewer: 100 };
export const LEVEL_NAMES: Record<number, string> = { 999: 'owner', 300: 'editor', 100: 'viewer' };

export function levelName(level: number): string {
  return LEVEL_NAMES[level] || `level:${level}`;
}

export async function getRoles(config: AuthConfig, resourceType: string, resourceId: string): Promise<any[]> {
  const res = await internalClient(config).get(`/api/roles/${resourceType}/${resourceId}`);
  const meta = res.data?.meta;
  return Array.isArray(meta) ? meta : [];
}

export interface PermissionUser {
  role_id: string;
  user_id: string | undefined;
  handle: string | undefined;
  email: string | undefined;
  role: string;
  level: number;
  pending: boolean;
}

export async function getPermissions(
  config: AuthConfig,
  params: { resource_type: string; resource_id: string },
): Promise<PermissionUser[]> {
  const roles = await getRoles(config, params.resource_type, params.resource_id);
  return roles.map((r: any) => ({
    role_id: String(r.id),
    user_id: r.user_id ? String(r.user_id) : undefined,
    handle: r.user?.handle,
    email: r.user?.email || r.pending_email,
    role: levelName(r.level),
    level: r.level,
    pending: !!r.pending_email,
  }));
}

export async function setPermissions(
  config: AuthConfig,
  params: { resource_type: string; resource_id: string; user_id: string; role: string },
): Promise<string> {
  const roles = await getRoles(config, params.resource_type, params.resource_id);
  const target = roles.find((r: any) => String(r.user_id) === params.user_id);
  if (!target) {
    throw new Error(`User ${params.user_id} has no role on this ${params.resource_type}. Use share to invite them first.`);
  }
  const level = LEVEL_MAP[params.role];
  await internalClient(config).put(`/api/roles/${target.id}`, { level });
  return `Set ${params.role} (level ${level}) for user ${params.user_id} on ${params.resource_type} ${params.resource_id}`;
}

export interface ShareResult {
  email: string;
  role: string;
  resource_type: string;
  resource_id: string;
  role_id?: string;
}

export async function share(
  config: AuthConfig,
  params: { resource_type: string; resource_id: string; email: string; role?: string },
): Promise<ShareResult> {
  const role = params.role || 'viewer';
  const level = LEVEL_MAP[role];
  const res = await internalClient(config).post('/api/invites', {
    resource_type: params.resource_type,
    resource_id_or_key: params.resource_id,
    emails: [params.email],
    level,
  });
  const invites = res.data?.meta?.invites || [];
  const roleId = invites[0]?.id;
  return {
    email: params.email,
    role,
    resource_type: params.resource_type,
    resource_id: params.resource_id,
    role_id: roleId ? String(roleId) : undefined,
  };
}

export async function revokeAccess(
  config: AuthConfig,
  params: { resource_type: string; resource_id: string; user_id: string },
): Promise<string> {
  const roles = await getRoles(config, params.resource_type, params.resource_id);
  const target = roles.find((r: any) => String(r.user_id) === params.user_id);
  if (!target) {
    throw new Error(`User ${params.user_id} has no role on this ${params.resource_type}.`);
  }
  await internalClient(config).delete(`/api/roles/${target.id}`);
  return `Revoked access for user ${params.user_id} on ${params.resource_type} ${params.resource_id}`;
}

export interface RoleRequest {
  notification_id: string;
  email: string | undefined;
  action: string | undefined;
  file_name: string | undefined;
  pending: boolean;
  is_unread: boolean;
  created_at: string | undefined;
}

export async function listRoleRequests(config: AuthConfig): Promise<RoleRequest[]> {
  const res = await internalClient(config).get('/api/user_notifications/server_driven/plan', {
    params: { current_plan_id: '-1', app_version: '1', client_type: 'web' },
  });
  const notifications = res.data?.meta || [];
  return (Array.isArray(notifications) ? notifications : [])
    .filter((n: any) => n.notification_type === 'FileRoleRequestCreatedNotif')
    .map((n: any) => {
      const title = n.preferred_attachments?.[0]?.body?.title || [];
      const subtitle = n.preferred_attachments?.[0]?.body?.subtitle || [];
      const email = title[0]?.html_text?.replace(/<[^>]+>/g, '') || undefined;
      const action = subtitle[0]?.html_text || undefined;
      const fileName = subtitle[2]?.html_text || undefined;
      const hasActions = !!n.preferred_attachments?.[0]?.actions;
      return {
        notification_id: n.notification_id,
        email,
        action,
        file_name: fileName,
        pending: hasActions,
        is_unread: n.is_unread,
        created_at: n.preferred_attachments?.[0]?.body?.created_at,
      };
    });
}

export async function approveRoleRequest(
  config: AuthConfig,
  params: { notification_id: string },
): Promise<string> {
  const res = await internalClient(config).put('/api/user_notifications/accept', {
    id: params.notification_id,
    medium: 'web',
    appVersion: '1',
    clientType: 'web',
  });
  const notif = res.data?.meta?.notification;
  const locals = notif?.locals || {};
  let msg = `Approved access request ${params.notification_id}`;
  if (locals.file_name) msg += ` for ${locals.file_name}`;
  if (locals.user_id) msg += ` (user ${locals.user_id})`;
  return msg;
}

export async function denyRoleRequest(
  config: AuthConfig,
  params: { notification_id: string },
): Promise<string> {
  await internalClient(config).put('/api/user_notifications/reject', {
    id: params.notification_id,
    medium: 'web',
    appVersion: '1',
    clientType: 'web',
  });
  return `Declined access request ${params.notification_id}`;
}
