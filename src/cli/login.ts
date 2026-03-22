import { createInterface } from 'node:readline';
import { platform } from 'node:os';
import { setActiveWorkspace, deleteConfig, getConfigPath } from '../config.js';
import { extractCookies, validateSession, validatePat, resolveAccountInfo } from '../auth/cookie.js';
import type { WorkspaceConfig } from '../config.js';

function createPrompt() {
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return {
      ask: async (question: string): Promise<string> => {
        const answer = await new Promise<string>(resolve => rl.question(question, resolve));
        return answer.trim();
      },
      close: () => rl.close(),
    };
  }

  // Piped stdin: buffer all lines upfront since readline auto-closes on EOF
  let lines: string[] | null = null;
  let idx = 0;
  const readAll = (): Promise<string[]> => new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin });
    const buf: string[] = [];
    rl.on('line', (line) => buf.push(line));
    rl.on('close', () => resolve(buf));
  });

  return {
    ask: async (question: string): Promise<string> => {
      if (!lines) lines = await readAll();
      process.stdout.write(question);
      return (lines[idx++] || '').trim();
    },
    close: () => {},
  };
}

export interface LoginOptions {
  refresh?: boolean;
  patOnly?: boolean;
}

export async function handleLogin(options: LoginOptions = {}): Promise<void> {
  const workspace: WorkspaceConfig = {};
  const os = platform();
  const io = createPrompt();

  // Cookie extraction (unless --pat-only)
  if (!options.patOnly) {
    if (os !== 'darwin' && os !== 'linux' && os !== 'win32') {
      console.log(`Cookie extraction not supported on ${os}. Use --pat-only.`);
    } else {
      const promptLabel = os === 'darwin' ? ' (Keychain prompt may appear)' : '';
      console.log(`Reading Chrome cookies${promptLabel}...`);

      try {
        const accounts = extractCookies();

        if (accounts.length === 0) {
          if (os === 'win32') {
            console.log('  No Figma cookies extracted. Windows extraction is best-effort.');
          } else {
            console.log('  No Figma cookies found. Log into figma.com in Chrome.');
          }
        } else {
          // Pick account if multiple
          let selected = accounts[0];
          if (accounts.length > 1) {
            console.log(`\n  Found ${accounts.length} Figma accounts. Identifying...\n`);
            const infos = await Promise.all(accounts.map(a => resolveAccountInfo(a)));
            for (let i = 0; i < accounts.length; i++) {
              const info = infos[i];
              const label = info.figmaEmail || `User ${accounts[i].userId}`;
              console.log(`  [${i + 1}] ${label} (Chrome: ${info.profileName})`);
            }
            const answer = await io.ask(`\n  Select account [1-${accounts.length}]: `);
            const idx = parseInt(answer, 10) - 1;
            if (idx < 0 || idx >= accounts.length) {
              io.close();
              console.error('  Invalid selection.');
              process.exit(1);
            }
            selected = accounts[idx];
          }

          console.log(`  Cookie found for user ${selected.userId}`);

          // Validate session and detect org
          console.log('Validating session...');
          try {
            const session = await validateSession(selected.cookieValue, selected.userId);
            console.log(`  Session valid (user ${selected.userId})`);
            if (session.teams.length > 0) {
              console.log(`  Teams: ${session.teams.map(t => t.name).join(', ')}`);
            }

            workspace.cookie = selected.cookieValue;
            workspace.user_id = selected.userId;
            workspace.cookie_extracted_at = new Date().toISOString();

            // Org selection
            let orgId = session.orgId;
            if (session.orgs.length > 1) {
              console.log(`\n  Found ${session.orgs.length} workspaces:\n`);
              for (let i = 0; i < session.orgs.length; i++) {
                const o = session.orgs[i];
                const marker = o.id === orgId ? ' (current)' : '';
                console.log(`  [${i + 1}] ${o.name} (${o.id})${marker}`);
              }
              const answer = await io.ask(`\n  Default workspace [1-${session.orgs.length}] (Enter for 1): `);
              if (answer) {
                const idx = parseInt(answer, 10) - 1;
                if (idx >= 0 && idx < session.orgs.length) {
                  orgId = session.orgs[idx].id;
                }
              }
            }

            if (orgId) {
              workspace.org_id = orgId;
              const orgName = session.orgs.find(o => o.id === orgId)?.name;
              console.log(`  Workspace: ${orgName ? `${orgName} (${orgId})` : orgId}`);
            }
          } catch (e: any) {
            const status = e.response?.status;
            if (status === 401 || status === 403) {
              console.error('  Cookie expired. Log into figma.com in Chrome and try again.');
            } else {
              console.error(`  Session validation failed: ${e.message}`);
            }
            // Continue to PAT prompt -- cookie failed but PAT might work
          }
        }
      } catch (e: any) {
        if (os === 'win32') {
          console.log(`  Cookie extraction failed: ${e.message}`);
        } else {
          console.error(`  Cookie extraction failed: ${e.message}`);
        }
      }
    }
  }

  // PAT prompt
  console.log('\nA Personal Access Token enables comments, export, and version history.');
  console.log('Generate one at: https://www.figma.com/settings (Security > Personal access tokens)');
  const patInput = await io.ask('Paste your PAT (or press Enter to skip): ');

  if (patInput) {
    console.log('Validating PAT...');
    try {
      const patUser = await validatePat(patInput);
      console.log(`  PAT valid (${patUser})`);
      workspace.pat = patInput;
    } catch {
      console.log('  PAT invalid or expired -- skipping.');
    }
  }

  io.close();

  // Must have at least one credential
  if (!workspace.pat && !workspace.cookie) {
    console.error('\nNo credentials configured. Need at least a PAT or browser cookie.');
    process.exit(1);
  }

  // Derive a workspace name from the org or user
  const workspaceName = workspace.org_id || workspace.user_id || 'default';

  setActiveWorkspace(workspaceName, workspace);
  console.log(`\nCredentials saved to ${getConfigPath()}`);
  console.log('Done. figmanage will use these credentials automatically.');
}

export async function handleLogout(): Promise<void> {
  deleteConfig();
  console.log('Logged out. Config file removed.');
}
