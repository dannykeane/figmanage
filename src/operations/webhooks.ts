import type { AuthConfig } from '../auth/client.js';
import { publicClient } from '../clients/public-api.js';

export type WebhookEventType =
  | 'FILE_UPDATE'
  | 'FILE_DELETE'
  | 'FILE_VERSION_UPDATE'
  | 'LIBRARY_PUBLISH'
  | 'FILE_COMMENT'
  | 'PING';

export type WebhookStatus = 'ACTIVE' | 'PAUSED';

export async function listWebhooks(
  config: AuthConfig,
  params: { team_id: string },
): Promise<{ count: number; webhooks: any[] }> {
  const res = await publicClient(config).get(`/v2/teams/${params.team_id}/webhooks`);
  const webhooks = res.data?.webhooks || [];
  return { count: webhooks.length, webhooks };
}

export async function createWebhook(
  config: AuthConfig,
  params: {
    team_id: string;
    event_type: WebhookEventType;
    endpoint: string;
    passcode: string;
    description?: string;
  },
): Promise<Record<string, any>> {
  const body: any = {
    team_id: params.team_id,
    event_type: params.event_type,
    endpoint: params.endpoint,
    passcode: params.passcode,
  };
  if (params.description) body.description = params.description;

  const res = await publicClient(config).post('/v2/webhooks', body);
  const { passcode: _, ...safe } = res.data || {};
  return safe;
}

export async function updateWebhook(
  config: AuthConfig,
  params: {
    webhook_id: string;
    event_type?: WebhookEventType;
    endpoint?: string;
    passcode?: string;
    description?: string;
    status?: WebhookStatus;
  },
): Promise<Record<string, any>> {
  const body: any = {};
  if (params.event_type) body.event_type = params.event_type;
  if (params.endpoint) body.endpoint = params.endpoint;
  if (params.passcode) body.passcode = params.passcode;
  if (params.description) body.description = params.description;
  if (params.status) body.status = params.status;

  const res = await publicClient(config).put(`/v2/webhooks/${params.webhook_id}`, body);
  const { passcode: _, ...safe } = res.data || {};
  return safe;
}

export interface WebhookRequest {
  id: string;
  endpoint: string;
  payload: Record<string, any> | null;
  status: number | null;
  error: string | null;
  sent_at: string;
}

export async function webhookRequests(
  config: AuthConfig,
  params: { webhook_id: string },
): Promise<{ count: number; requests: WebhookRequest[] }> {
  const res = await publicClient(config).get(`/v2/webhooks/${params.webhook_id}/requests`);
  const requests = (res.data?.requests || []).map((r: any) => ({
    id: r.id,
    endpoint: r.endpoint,
    payload: r.payload || null,
    status: r.response_status_code ?? null,
    error: r.error_msg || null,
    sent_at: r.sent_at,
  }));
  return { count: requests.length, requests };
}

export async function deleteWebhook(
  config: AuthConfig,
  params: { webhook_id: string },
): Promise<void> {
  await publicClient(config).delete(`/v2/webhooks/${params.webhook_id}`);
}
