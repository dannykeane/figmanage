import type { AuthConfig } from '../auth/client.js';
import { internalClient } from '../clients/internal-api.js';

export interface CreatedProject {
  id: string;
  name: string;
  team_id: string;
}

export async function createProject(
  config: AuthConfig,
  params: { team_id: string; name: string },
): Promise<CreatedProject> {
  const res = await internalClient(config).post('/api/folders', {
    team_id: params.team_id,
    path: params.name,
    sharing_audience_control: 'org_view',
    team_access: 'team_edit',
  });
  const meta = res.data?.meta;
  const p = Array.isArray(meta) ? meta[0] : (meta?.folder || meta || res.data);
  return {
    id: String(p.id),
    name: p.name || p.path || params.name,
    team_id: params.team_id,
  };
}

export async function renameProject(
  config: AuthConfig,
  params: { project_id: string; name: string },
): Promise<void> {
  await internalClient(config).put('/api/folders/rename', {
    folder_id: params.project_id,
    name: params.name,
  });
}

export async function moveProject(
  config: AuthConfig,
  params: { project_id: string; destination_team_id: string },
): Promise<void> {
  await internalClient(config).put('/api/folders/move', {
    folder_id: params.project_id,
    team_id: params.destination_team_id,
  });
}

export async function trashProject(
  config: AuthConfig,
  params: { project_id: string },
): Promise<void> {
  await internalClient(config).put(`/api/folders/trash/${params.project_id}`);
}

export async function restoreProject(
  config: AuthConfig,
  params: { project_id: string },
): Promise<void> {
  await internalClient(config).put(`/api/folders/restore/${params.project_id}`);
}

export async function setProjectDescription(
  config: AuthConfig,
  params: { project_id: string; description: string },
): Promise<void> {
  await internalClient(config).put(`/api/folders/${params.project_id}/description`, {
    description: params.description,
  });
}
