import type { AuthConfig } from '../auth/client.js';
import { publicClient } from '../clients/public-api.js';

export const ENTERPRISE_ERROR =
  'Variables API requires Figma Enterprise plan. The file_variables:read/write scopes are not available on standard plans.';

export function isEnterpriseScopeError(e: any): boolean {
  if (e.response?.status !== 403) return false;
  const data = e.response?.data;
  if (typeof data !== 'object' || !data) return false;
  const msg = String(data.message || data.error || data.err || '');
  return msg.toLowerCase().includes('scope');
}

export async function listLocalVariables(
  config: AuthConfig,
  params: { file_key: string },
): Promise<Record<string, any>> {
  const res = await publicClient(config).get(`/v1/files/${params.file_key}/variables/local`);
  return res.data?.meta ?? {};
}

export async function listPublishedVariables(
  config: AuthConfig,
  params: { file_key: string },
): Promise<Record<string, any>> {
  const res = await publicClient(config).get(`/v1/files/${params.file_key}/variables/published`);
  return res.data?.meta ?? {};
}

export async function updateVariables(
  config: AuthConfig,
  params: {
    file_key: string;
    variable_collections?: Record<string, any>[];
    variable_modes?: Record<string, any>[];
    variables?: Record<string, any>[];
    variable_mode_values?: Record<string, any>[];
  },
): Promise<any> {
  if (
    !params.variable_collections?.length &&
    !params.variable_modes?.length &&
    !params.variables?.length &&
    !params.variable_mode_values?.length
  ) {
    throw new Error('At least one operation array is required.');
  }

  const allOps = [
    ...(params.variable_collections || []),
    ...(params.variable_modes || []),
    ...(params.variables || []),
    ...(params.variable_mode_values || []),
  ];
  for (const op of allOps) {
    if (!op.action || !['CREATE', 'UPDATE', 'DELETE'].includes(op.action)) {
      throw new Error(`Each operation must have an action field (CREATE, UPDATE, or DELETE). Got: ${JSON.stringify(op.action)}`);
    }
  }

  const body: Record<string, any> = {};
  if (params.variable_collections) body.variableCollections = params.variable_collections;
  if (params.variable_modes) body.variableModes = params.variable_modes;
  if (params.variables) body.variables = params.variables;
  if (params.variable_mode_values) body.variableModeValues = params.variable_mode_values;

  const res = await publicClient(config).post(`/v1/files/${params.file_key}/variables`, body);
  return res.data;
}
