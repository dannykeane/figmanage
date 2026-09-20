import type { AuthConfig } from '../auth/client.js';
import { publicClient } from './public-api.js';
import { formatApiError } from '../helpers.js';

export interface DiscoveredProject {
  project_id: string;
  project_name: string;
  team_name: string;
}

/** Include descendants before a management audit can claim complete discovery. */
export async function discoverNestedProjects(config: AuthConfig, roots: DiscoveredProject[], limit = 50) {
  const projects = roots.slice(0, limit);
  const issues: string[] = roots.length > limit ? [`Folder discovery exceeds the ${limit}-folder limit.`] : [];
  if (!projects.length) return { projects, issues };
  if (!config.pat) {
    issues.push('Nested folder discovery requires a PAT for the same account with current_user:read and folders:read. No changes can be made until all descendants are checked.');
    return { projects, issues };
  }
  const api = publicClient(config);
  try {
    const identity = await api.get('/v1/me');
    if (!config.userId || identity.data?.id == null || String(identity.data.id) !== config.userId) {
      throw new Error('PAT identity must match the browser account before combining ownership discovery.');
    }
  } catch (error) {
    issues.push(`Could not verify the folder discovery account: ${formatApiError(error)}`);
    return { projects, issues };
  }

  const seen = new Set(projects.map(project => project.project_id));
  let cursor = 0;
  while (cursor < projects.length) {
    const batch = projects.slice(cursor, cursor + 5);
    cursor += batch.length;
    const results = await Promise.allSettled(batch.map(async project => {
      if (!/^[\w.:-]+$/.test(project.project_id)) throw new Error('Invalid parent folder ID.');
      const response = await api.get(`/v2/folders/${project.project_id}/folders`);
      const data = response.data;
      if (data?.error === true || !Array.isArray(data?.folders)) throw new Error('Unexpected subfolder response.');
      const page = data.pagination || data;
      if (page.has_more || page.next_page || page.next_cursor || page.next_page_token) throw new Error('Subfolder response contains another page.');
      return data.folders as Array<{ id: unknown; name: unknown; parent_folder_id: unknown }>;
    }));
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      const parent = batch[index];
      if (result.status === 'rejected') {
        issues.push(`Could not inspect subfolders of ${parent.project_id}: ${formatApiError(result.reason)}`);
        continue;
      }
      for (const folder of result.value) {
        const id = String(folder?.id);
        if (!folder || !['string', 'number'].includes(typeof folder.id)
          || (typeof folder.id === 'number' && !Number.isSafeInteger(folder.id))
          || !/^[\w.:-]+$/.test(id) || typeof folder.name !== 'string'
          || String(folder.parent_folder_id) !== parent.project_id) {
          issues.push(`Unexpected subfolder entry under ${parent.project_id}.`);
          continue;
        }
        if (seen.has(id)) {
          issues.push(`Repeated folder ${id} in hierarchy discovery.`);
          continue;
        }
        if (projects.length >= limit) {
          issues.push(`Folder discovery exceeds the ${limit}-folder limit.`);
          break;
        }
        seen.add(id);
        projects.push({ project_id: id, project_name: folder.name, team_name: parent.team_name });
      }
    }
  }
  return { projects, issues: [...new Set(issues)] };
}
