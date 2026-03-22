/**
 * Chrome cookie extraction and Figma session validation.
 *
 * Extracted from setup.ts so both the setup flow and the CLI login
 * command can reuse this logic.
 */

import { execFileSync } from 'child_process';
import { createDecipheriv, pbkdf2Sync } from 'crypto';
import { copyFileSync, unlinkSync, mkdtempSync, existsSync, rmdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir, platform } from 'os';
import axios from 'axios';

const COOKIE_NAME = '__Host-figma.authn';

// --- Platform-specific Chrome paths ---

function getChromePaths(): string[] {
  switch (platform()) {
    case 'darwin':
      return [join(homedir(), 'Library/Application Support/Google/Chrome')];
    case 'linux':
      return [
        join(homedir(), '.config/google-chrome'),
        join(homedir(), '.config/chromium'),
      ];
    case 'win32': {
      const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local');
      return [join(localAppData, 'Google/Chrome/User Data')];
    }
    default:
      return [];
  }
}

// --- Chrome profile discovery ---

function findChromeProfiles(): string[] {
  const chromePaths = getChromePaths();
  const profiles: string[] = [];

  for (const base of chromePaths) {
    if (!existsSync(base)) continue;

    const defaultProfile = join(base, 'Default');
    if (existsSync(join(defaultProfile, 'Cookies'))) profiles.push(defaultProfile);

    for (let i = 1; i <= 20; i++) {
      const profile = join(base, `Profile ${i}`);
      if (existsSync(join(profile, 'Cookies'))) profiles.push(profile);
    }
  }

  if (profiles.length === 0) throw new Error('No Chrome profiles with Cookies found.');
  return profiles;
}

// --- macOS cookie decryption ---

function getMacDecryptionKey(): Buffer {
  const password = execFileSync(
    'security',
    ['find-generic-password', '-w', '-s', 'Chrome Safe Storage'],
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();
  return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
}

// --- Linux cookie decryption ---

function getLinuxDecryptionKey(): Buffer {
  try {
    const password = execFileSync('secret-tool', ['lookup', 'application', 'chrome'], {
      encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (password) return pbkdf2Sync(password, 'saltysalt', 1, 16, 'sha1');
  } catch {
    // secret-tool not available or no entry
  }
  return pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');
}

// --- Windows cookie decryption ---

function getWindowsDecryptionKey(chromeBase: string): Buffer {
  const localStatePath = join(chromeBase, 'Local State');
  if (!existsSync(localStatePath)) {
    throw new Error('Chrome Local State file not found. Cannot decrypt cookies on Windows.');
  }

  const localState = JSON.parse(readFileSync(localStatePath, 'utf-8'));
  const encryptedKeyB64: string | undefined = localState?.os_crypt?.encrypted_key;
  if (!encryptedKeyB64) {
    throw new Error('No encrypted_key in Chrome Local State.');
  }

  const encryptedKey = Buffer.from(encryptedKeyB64, 'base64');
  if (encryptedKey.toString('utf-8', 0, 5) !== 'DPAPI') {
    throw new Error('Unexpected encrypted_key format (missing DPAPI prefix).');
  }

  const dpapiBlob = encryptedKey.slice(5).toString('base64');
  if (!/^[A-Za-z0-9+/=]+$/.test(dpapiBlob)) {
    throw new Error('Invalid base64 in Chrome encrypted_key.');
  }

  const psScript = `
    Add-Type -AssemblyName System.Security
    $blob = [Convert]::FromBase64String('${dpapiBlob}')
    $dec = [Security.Cryptography.ProtectedData]::Unprotect($blob, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Convert]::ToBase64String($dec)
  `.trim().replace(/\n/g, '; ');

  const decryptedB64 = execFileSync('powershell', [
    '-NoProfile', '-NonInteractive', '-Command', psScript,
  ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

  return Buffer.from(decryptedB64, 'base64');
}

// --- Decryption ---

function decryptCBC(encrypted: Buffer, key: Buffer): string {
  if (encrypted.length > 3 && encrypted[0] === 0x76 && encrypted[1] === 0x31 && encrypted[2] === 0x30) {
    const iv = Buffer.alloc(16, 0x20);
    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted.slice(3)), decipher.final()]);

    const str = decrypted.toString('binary');
    const jsonStart = str.indexOf('%7B');
    if (jsonStart >= 0) return str.slice(jsonStart);
    const rawJsonStart = str.indexOf('{');
    if (rawJsonStart >= 0) return str.slice(rawJsonStart);

    throw new Error('Decrypted cookie data does not contain expected JSON value');
  }
  return encrypted.toString('utf-8');
}

function decryptWindows(encrypted: Buffer, key: Buffer): string {
  if (encrypted.length > 3 && encrypted[0] === 0x76 && encrypted[1] === 0x31 && encrypted[2] === 0x30) {
    const nonce = encrypted.slice(3, 15);
    const ciphertextWithTag = encrypted.slice(15);
    const tag = ciphertextWithTag.slice(ciphertextWithTag.length - 16);
    const ciphertext = ciphertextWithTag.slice(0, ciphertextWithTag.length - 16);

    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    const str = decrypted.toString('utf-8');
    const jsonStart = str.indexOf('%7B');
    if (jsonStart >= 0) return str.slice(jsonStart);
    const rawJsonStart = str.indexOf('{');
    if (rawJsonStart >= 0) return str.slice(rawJsonStart);

    throw new Error('Decrypted cookie data does not contain expected JSON value');
  }
  return encrypted.toString('utf-8');
}

// --- Cookie extraction ---

function extractCookieFromProfile(profilePath: string): string {
  const cookiesDb = join(profilePath, 'Cookies');
  const tmpDir = mkdtempSync(join(tmpdir(), 'figmanage-'));
  const tmpDb = join(tmpDir, 'Cookies');

  copyFileSync(cookiesDb, tmpDb);
  for (const ext of ['-wal', '-shm']) {
    const src = cookiesDb + ext;
    if (existsSync(src)) copyFileSync(src, tmpDb + ext);
  }

  try {
    const sqliteBin = platform() === 'win32' ? 'sqlite3.exe' : 'sqlite3';
    const hex = execFileSync(sqliteBin, [
      tmpDb,
      `SELECT hex(encrypted_value) FROM cookies WHERE name = '${COOKIE_NAME}' AND host_key LIKE '%figma.com' ORDER BY last_access_utc DESC LIMIT 1;`,
    ], { encoding: 'utf-8' }).trim();

    if (!hex) throw new Error(`No ${COOKIE_NAME} cookie found. Are you logged into figma.com in Chrome?`);

    const encrypted = Buffer.from(hex, 'hex');
    const os = platform();

    if (os === 'darwin') {
      return decryptCBC(encrypted, getMacDecryptionKey());
    } else if (os === 'linux') {
      return decryptCBC(encrypted, getLinuxDecryptionKey());
    } else if (os === 'win32') {
      const chromeBase = join(profilePath, '..');
      return decryptWindows(encrypted, getWindowsDecryptionKey(chromeBase));
    }

    throw new Error(`Unsupported platform: ${os}`);
  } finally {
    for (const f of [tmpDb, tmpDb + '-wal', tmpDb + '-shm']) {
      try { unlinkSync(f); } catch {}
    }
    try { rmdirSync(tmpDir); } catch {}
  }
}

// --- Cookie parsing ---

export interface ParsedCookie {
  userId: string;
  token: string;
  cookieValue: string;
}

export function parseCookieValue(raw: string): ParsedCookie {
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch {}

  try {
    const parsed = JSON.parse(decoded);
    const entries = Object.entries(parsed);
    if (entries.length === 0) throw new Error('Empty cookie JSON');
    const [userId, token] = entries[0] as [string, string];
    return { userId, token, cookieValue: raw };
  } catch {
    throw new Error('Unexpected cookie format. Expected URL-encoded JSON with userId field.');
  }
}

// --- Figma session validation ---

export interface SessionInfo {
  orgId: string;
  orgs: { id: string; name: string }[];
  teams: { id: string; name: string }[];
}

export async function validateSession(cookieValue: string, userId: string): Promise<SessionInfo> {
  const headers = {
    'Cookie': `${COOKIE_NAME}=${cookieValue}`,
    'X-CSRF-Bypass': 'yes',
    'X-Figma-User-Id': userId,
  };

  const res = await axios.get('https://www.figma.com/api/user/state', {
    headers,
    timeout: 15000,
  });

  if (res.data?.error !== false) throw new Error('Session invalid');

  const meta = res.data.meta || {};
  const teams = (meta.teams || []).map((t: any) => ({ id: String(t.id), name: t.name }));
  const orgs = (meta.orgs || []).map((o: any) => ({ id: String(o.id), name: o.name }));

  let orgId = '';
  if (orgs.length > 0) {
    orgId = orgs[0].id;
  } else {
    try {
      const redirect = await axios.get('https://www.figma.com/files/recents-and-sharing', {
        headers,
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
        timeout: 10000,
      });
      const finalUrl = redirect.request?.res?.responseUrl || redirect.headers?.location || '';
      const match = finalUrl.match(/\/files\/(\d+)\//);
      if (match) orgId = match[1];
    } catch (e: any) {
      const loc = e.response?.headers?.location || '';
      const match = loc.match(/\/files\/(\d+)\//);
      if (match) orgId = match[1];
    }
  }

  if (orgId && orgs.length === 0) {
    let name = orgId;
    try {
      const domRes = await axios.get(`https://www.figma.com/api/orgs/${orgId}/domains`, {
        headers,
        timeout: 10000,
      });
      const domains = domRes.data?.meta || [];
      if (Array.isArray(domains) && domains.length > 0 && domains[0].domain) {
        name = domains[0].domain;
      }
    } catch { /* domain lookup optional */ }
    orgs.push({ id: orgId, name });
  }

  return { orgId, orgs, teams };
}

// --- PAT validation ---

export async function validatePat(pat: string): Promise<string> {
  const res = await axios.get('https://api.figma.com/v1/me', {
    headers: { 'X-Figma-Token': pat },
    timeout: 15000,
  });
  return res.data.handle || res.data.email || 'valid';
}

// --- Chrome profile info ---

export interface ProfileInfo {
  profileName: string;
  figmaEmail?: string;
}

function readChromeProfileName(profilePath: string): string {
  try {
    const prefsPath = join(profilePath, 'Preferences');
    if (!existsSync(prefsPath)) return profilePath.split(/[/\\]/).pop()!;
    const prefs = JSON.parse(readFileSync(prefsPath, 'utf-8'));
    return prefs?.profile?.name || profilePath.split(/[/\\]/).pop()!;
  } catch {
    return profilePath.split(/[/\\]/).pop()!;
  }
}

/**
 * Resolve display info for a Figma account: Figma email via API + Chrome profile name.
 * The API call is best-effort -- falls back to userId if it fails.
 */
export async function resolveAccountInfo(account: FigmaAccount): Promise<ProfileInfo> {
  const profileName = readChromeProfileName(account.profilePath);

  try {
    const headers = {
      'Cookie': `${COOKIE_NAME}=${account.cookieValue}`,
      'X-CSRF-Bypass': 'yes',
      'X-Figma-User-Id': account.userId,
    };
    const res = await axios.get(`https://www.figma.com/api/user/${account.userId}`, {
      headers,
      timeout: 5000,
    });
    const meta = res.data?.meta || {};
    return { profileName, figmaEmail: meta.email };
  } catch {
    return { profileName };
  }
}

// --- Public extraction API ---

export interface FigmaAccount {
  userId: string;
  cookieValue: string;
  profile: string;
  profilePath: string;
}

/**
 * Extract Figma auth cookies from all Chrome profiles.
 * Returns an array of accounts found (may be empty on Windows failure).
 * Throws on non-Windows platforms if no Chrome profiles exist.
 */
export function extractCookies(): FigmaAccount[] {
  const accounts: FigmaAccount[] = [];
  const profiles = findChromeProfiles();

  for (const profilePath of profiles) {
    try {
      const rawCookie = extractCookieFromProfile(profilePath);
      const { userId, cookieValue } = parseCookieValue(rawCookie);
      accounts.push({ userId, cookieValue, profile: profilePath.split(/[/\\]/).pop()!, profilePath });
    } catch {
      // Profile doesn't have a Figma cookie
    }
  }

  return accounts;
}
