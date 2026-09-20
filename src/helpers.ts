import type { AuthConfig } from './auth/client.js';

/**
 * Extract actionable error info from Figma API errors.
 * Includes response body when available, maps common status codes.
 */
export function formatApiError(e: any): string {
  if (e?.name === 'ZodError') return 'Invalid input: ' + e.issues.map((issue: any) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ');
  if (e?.isAxiosError && (!e.response || e.response.status >= 500) && !['get', 'head', 'options'].includes(e.config?.method?.toLowerCase())) {
    return 'Write outcome unknown: no successful response was received. Check the resource before retrying. ' + e.message;
  }
  const status = e.response?.status;
  if (!status) return e.message || 'Unknown error';

  const body = e.response?.data;
  const detail = typeof body === 'string'
    ? body
    : [body?.message, body?.err, body?.error].find(value => typeof value === 'string' && value) || '';

  const statusMessages: Record<number, string> = {
    400: 'Bad request',
    401: 'Authentication expired or invalid. Run figmanage doctor or call setup_status for recovery.',
    403: 'Insufficient permissions for this action',
    404: 'Resource not found. Check the ID.',
    409: 'Conflict -- resource may already exist or be in use',
    429: 'Rate limited. Try again in a moment.',
    500: 'Figma server error. Try again later.',
  };

  const base = statusMessages[status] || `HTTP ${status}`;
  return detail ? `${base}: ${detail}` : base;
}

/** Resolve an org ID from explicit param or config. Returns undefined if neither set. */
export function resolveOrgId(config: AuthConfig, explicit?: string): string | undefined {
  const id = explicit || config.orgId;
  if (id && !/^[\w.:-]+$/.test(id)) throw new Error('Invalid org ID format');
  return id;
}

/** Require an org ID, throwing with guidance if missing. */
export function requireOrgId(config: AuthConfig, explicit?: string): string {
  const id = explicit || config.orgId;
  if (!id) throw new Error('Org context required. Run list_orgs to see available workspaces, or set FIGMA_ORG_ID.');
  if (!/^[\w.:-]+$/.test(id)) throw new Error('Invalid org ID format');
  return id;
}
