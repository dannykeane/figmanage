import axios from 'axios';
import { loadAuthConfig, hasPat, hasCookie } from '../auth/client.js';

export async function handleWhoami(): Promise<void> {
  const config = loadAuthConfig();

  if (!hasPat(config) && !hasCookie(config)) {
    console.error('No auth configured. Run `figmanage login` or set environment variables.');
    process.exit(1);
  }

  const authMethods: string[] = [];

  // Cookie auth: call internal API /api/me
  if (hasCookie(config)) {
    authMethods.push('cookie');
    try {
      const res = await axios.get('https://www.figma.com/api/user/state', {
        headers: {
          'Cookie': `__Host-figma.authn=${config.cookie}`,
          'X-CSRF-Bypass': 'yes',
          'X-Figma-User-Id': config.userId || '',
        },
        timeout: 15000,
      });

      const meta = res.data?.meta || res.data || {};
      const user = meta.user || meta;
      console.log(`User:  ${user.handle || user.email || config.userId}`);
      if (user.email) console.log(`Email: ${user.email}`);
    } catch (e: any) {
      const status = e.response?.status;
      if (status === 401 || status === 403) {
        console.log('Cookie: expired or invalid');
      } else {
        console.log(`Cookie: request failed (${e.message})`);
      }
    }
  }

  // PAT auth: call public API /v1/me
  if (hasPat(config)) {
    authMethods.push('PAT');
    try {
      const res = await axios.get('https://api.figma.com/v1/me', {
        headers: { 'X-Figma-Token': config.pat },
        timeout: 15000,
      });

      const user = res.data;
      // Only print user info if we didn't already from cookie
      if (!hasCookie(config)) {
        console.log(`User:  ${user.handle || user.email}`);
        if (user.email) console.log(`Email: ${user.email}`);
      }
    } catch (e: any) {
      const status = e.response?.status;
      if (status === 401 || status === 403) {
        console.log('PAT:   expired or invalid');
      } else {
        console.log(`PAT:   request failed (${e.message})`);
      }
    }
  }

  if (config.orgId) console.log(`Org:   ${config.orgId}`);
  console.log(`Auth:  ${authMethods.join(' + ')}`);
}
