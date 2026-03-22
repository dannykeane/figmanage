#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import { extractCookies, parseCookieValue, validateSession, validatePat, resolveAccountInfo, type FigmaAccount } from './auth/cookie.js';

// --- MCP client detection and registration ---

function claudeCliAvailable(): boolean {
  try {
    const whichCmd = platform() === 'win32' ? 'where' : 'which';
    execFileSync(whichCmd, ['claude'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

function registerWithClaude(envVars: Record<string, string>): boolean {
  try {
    try {
      execFileSync('claude', ['mcp', 'remove', 'figmanage', '-s', 'user'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // Ignore if not previously registered
    }
    execFileSync('claude', [
      'mcp', 'add', 'figmanage', '--transport', 'stdio', '-s', 'user',
      ...Object.entries(envVars).flatMap(([k, v]) => ['--env', `${k}=${v}`]),
      '--', 'npx', '-y', 'figmanage',
    ], { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

function registerWithDesktop(envVars: Record<string, string>): boolean {
  const configPath = platform() === 'win32'
    ? join(process.env.APPDATA || join(homedir(), 'AppData/Roaming'), 'Claude/claude_desktop_config.json')
    : join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');

  try {
    let config: any = {};
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    }
    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers.figmanage = {
      command: 'npx',
      args: ['-y', 'figmanage'],
      env: envVars,
    };

    mkdirSync(join(configPath, '..'), { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    return true;
  } catch {
    return false;
  }
}

function printManualConfig(envVars: Record<string, string>): void {
  console.log('\nConfigure your MCP client manually.\n');

  console.log('Environment variables:');
  for (const [k, v] of Object.entries(envVars)) {
    const display = (k === 'FIGMA_AUTH_COOKIE' || k === 'FIGMA_PAT') ? '******' : v;
    console.log(`  ${k}=${display}`);
  }

  console.log('\nMCP server config (JSON):');
  const config = {
    figmanage: {
      command: 'npx',
      args: ['-y', 'figmanage'],
      env: Object.fromEntries(
        Object.entries(envVars).map(([k, v]) => [k, k === 'FIGMA_AUTH_COOKIE' || k === 'FIGMA_PAT' ? '<paste value>' : v]),
      ),
    },
  };
  console.log(JSON.stringify(config, null, 2));
}

// --- CLI arg parsing ---

function parseArgs(): { noPrompt: boolean; desktop: boolean; pat?: string } {
  const args = process.argv.slice(2);
  let noPrompt = false;
  let desktop = false;
  let pat: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-prompt') {
      noPrompt = true;
    } else if (args[i] === '--desktop') {
      desktop = true;
    } else if (args[i] === '--pat' && i + 1 < args.length) {
      pat = args[++i];
    }
  }

  return { noPrompt, desktop, pat };
}

// --- Main ---

async function setup() {
  console.log('figmanage setup\n');

  const { noPrompt, desktop, pat: patArg } = parseArgs();
  const os = platform();

  // Build env vars to register
  const envVars: Record<string, string> = {};
  // Registration uses npx -y figmanage (no local path needed)

  if (noPrompt) {
    // Non-interactive mode: skip cookie extraction, require --pat
    if (!patArg) {
      console.error('--no-prompt requires --pat <token>');
      process.exit(1);
    }

    console.log('Non-interactive mode. Validating PAT...');
    try {
      const patUser = await validatePat(patArg);
      console.log(`  PAT valid (${patUser})`);
      envVars.FIGMA_PAT = patArg;
    } catch {
      console.error('  PAT invalid or expired.');
      process.exit(1);
    }

    // Register with whatever client is available
    if (desktop) {
      console.log('\nRegistering with Claude Desktop...');
      if (registerWithDesktop(envVars)) {
        console.log('  Credentials written to claude_desktop_config.json');
        console.log('  Done. Restart Claude Desktop to use figmanage.');
      } else {
        printManualConfig(envVars);
      }
    } else if (claudeCliAvailable()) {
      console.log('\nRegistering with Claude Code...');
      if (registerWithClaude(envVars)) {
        console.log('  PAT stored in MCP server config');
        console.log('  Done. Restart Claude Code to use figmanage.');
      } else {
        printManualConfig(envVars);
      }
    } else {
      printManualConfig(envVars);
    }
    return;
  }

  // Interactive mode

  if (os !== 'darwin' && os !== 'linux' && os !== 'win32') {
    console.error(`Unsupported platform: ${os}. Provide credentials via --no-prompt --pat <token>.`);
    process.exit(1);
  }

  // 1. Extract cookies from all Chrome profiles
  const promptLabel = os === 'darwin' ? ' (Keychain prompt may appear)' : '';
  console.log(`Reading Chrome cookies${promptLabel}...`);

  let accounts: FigmaAccount[] = [];
  try {
    accounts = extractCookies();
  } catch (e: any) {
    if (os === 'win32') {
      console.log(`  Cookie extraction failed: ${e.message}`);
      console.log('  Windows cookie extraction is best-effort. Provide credentials manually.');
      console.log('  You can still enter a PAT below.\n');
    } else {
      throw e;
    }
  }

  let userId = '';
  let cookieValue = '';

  if (accounts.length === 0) {
    if (os === 'win32') {
      console.log('  No Figma auth cookies extracted. Continuing with PAT-only setup.');
    } else {
      console.error('No Figma auth cookies found. Log into figma.com in Chrome.');
      process.exit(1);
    }
  } else {
    // If multiple accounts, let user pick
    let selected = accounts[0];
    if (accounts.length > 1) {
      console.log(`\n  Found ${accounts.length} Figma accounts. Identifying...\n`);
      const infos = await Promise.all(accounts.map(a => resolveAccountInfo(a)));
      for (let i = 0; i < accounts.length; i++) {
        const info = infos[i];
        const label = info.figmaEmail || `User ${accounts[i].userId}`;
        console.log(`  [${i + 1}] ${label} (Chrome: ${info.profileName})`);
      }
      const { createInterface } = await import('readline');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question(`\n  Select account [1-${accounts.length}]: `, resolve);
      });
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      if (idx < 0 || idx >= accounts.length) {
        console.error('  Invalid selection.');
        process.exit(1);
      }
      selected = accounts[idx];
    }

    userId = selected.userId;
    cookieValue = selected.cookieValue;
    console.log(`  Cookie found for user ${userId}`);
  }

  // 2. Validate cookie against Figma (if we have one)
  let orgId = '';
  let orgs: { id: string; name: string }[] = [];

  if (cookieValue && userId) {
    console.log('Validating session...');
    try {
      const session = await validateSession(cookieValue, userId);
      console.log(`  Session valid (user ${userId})`);
      if (session.teams.length > 0) {
        console.log(`  Teams: ${session.teams.map(t => t.name).join(', ')}`);
      }
      orgId = session.orgId;
      orgs = session.orgs;
    } catch (e: any) {
      const status = e.response?.status;
      if (status === 401 || status === 403) {
        console.error('  Cookie expired. Log into figma.com in Chrome and try again.');
      } else {
        console.error(`  Validation failed: ${e.message}`);
      }
      process.exit(1);
    }

    if (orgs.length > 1) {
      console.log(`\n  Found ${orgs.length} workspaces:\n`);
      for (let i = 0; i < orgs.length; i++) {
        const o = orgs[i];
        const marker = o.id === orgId ? ' (current)' : '';
        console.log(`  [${i + 1}] ${o.name} (${o.id})${marker}`);
      }
      const { createInterface } = await import('readline');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question(`\n  Default workspace [1-${orgs.length}] (Enter for 1): `, resolve);
      });
      rl.close();
      const input = answer.trim();
      if (input) {
        const idx = parseInt(input, 10) - 1;
        if (idx >= 0 && idx < orgs.length) {
          orgId = orgs[idx].id;
        }
      }
    }
    if (orgId) {
      const orgName = orgs.find(o => o.id === orgId)?.name;
      console.log(`  Workspace: ${orgName ? `${orgName} (${orgId})` : orgId}`);
    }

    // Store cookie credentials
    envVars.FIGMA_AUTH_COOKIE = cookieValue;
    envVars.FIGMA_USER_ID = userId;
    if (orgId) envVars.FIGMA_ORG_ID = orgId;
    if (orgs.length > 0) envVars.FIGMA_ORGS = JSON.stringify(orgs);
  }

  // 3. PAT: arg > env > prompt
  let pat = patArg || process.env.FIGMA_PAT || '';
  if (pat) {
    console.log('Validating PAT...');
    try {
      const patUser = await validatePat(pat);
      console.log(`  PAT valid (${patUser})`);
    } catch {
      console.log('  PAT invalid or expired.');
      pat = '';
    }
  }
  if (!pat) {
    console.log('\nA Personal Access Token enables comments, export, and version history.');
    console.log('Generate one at: https://www.figma.com/settings (Security > Personal access tokens)');
    const { createInterface } = await import('readline');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question('Paste your PAT (or press Enter to skip): ', resolve);
    });
    rl.close();
    pat = answer.trim();
    if (pat) {
      try {
        const patUser = await validatePat(pat);
        console.log(`  PAT valid (${patUser})`);
      } catch {
        console.log('  PAT invalid -- skipping');
        pat = '';
      }
    }
  }
  if (pat) {
    envVars.FIGMA_PAT = pat;
  }

  // Must have at least one credential
  if (!envVars.FIGMA_PAT && !envVars.FIGMA_AUTH_COOKIE) {
    console.error('\nNo credentials configured. Need at least a PAT or browser cookie.');
    process.exit(1);
  }

  // 4. Register with MCP client
  console.log('\n--- Configuration ---\n');

  console.log(`FIGMA_USER_ID=${userId || '(none)'}`);
  console.log('FIGMA_AUTH_COOKIE=****** (stored in MCP server config)');
  if (orgId) console.log(`FIGMA_ORG_ID=${orgId}`);
  if (pat) console.log('FIGMA_PAT=****** (stored in MCP server config)');

  if (desktop) {
    console.log('\nRegistering with Claude Desktop...');
    if (registerWithDesktop(envVars)) {
      console.log('  Credentials written to claude_desktop_config.json');
      console.log('  Done. Restart Claude Desktop to use figmanage.');
    } else {
      console.log('  Could not write config automatically.');
      printManualConfig(envVars);
    }
  } else if (claudeCliAvailable()) {
    console.log('\nRegistering with Claude Code...');
    if (registerWithClaude(envVars)) {
      if (pat) console.log('  PAT stored in MCP server config');
      console.log('  Done. Restart Claude Code to use figmanage.');
    } else {
      console.log('  Could not register automatically.');
      printManualConfig(envVars);
    }
  } else {
    printManualConfig(envVars);
  }
}

setup().catch((err) => {
  console.error(`\nSetup failed: ${err.message}`);
  process.exit(1);
});
