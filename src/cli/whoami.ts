import { hasCookie, hasPat, loadAuthConfig } from '../auth/client.js';
import { checkAuth, formatAuthStatus } from '../auth/health.js';
import { error, isMachineOutput, output } from './format.js';

export async function handleWhoami(options: { json?: boolean } = {}): Promise<void> {
  const config = loadAuthConfig();
  if (!hasPat(config) && !hasCookie(config)) {
    error('No auth configured. Run `figmanage login` or set environment variables.');
    process.exitCode = 1;
    return;
  }
  const status = await checkAuth(config);
  const environmentCredentials = !!(process.env.FIGMA_PAT || (process.env.FIGMA_AUTH_COOKIE && process.env.FIGMA_USER_ID));
  const result = {
    ...status, org_id: config.orgId || null,
    credential_source: environmentCredentials ? 'environment' : 'config',
    workspace_source: process.env.FIGMA_ORG_ID ? 'environment' : 'config',
  };
  if (isMachineOutput(options)) output(result, options);
  else console.log(formatAuthStatus(status, config));
  if (!status.pat.valid && !status.cookie.valid) process.exitCode = 1;
}
