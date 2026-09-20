import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const binary = resolve('dist/index.js');
let api: Server;
let origin: string;
let mode = '';
let offboardGate: Promise<void> | undefined;
let offboardRoleRemoved = false;
let requests: Array<{ method: string; path: string }> = [];
const directories: string[] = [];
const processes = new Set<ChildProcess>();
function environment(overrides: Record<string, string> = {}): Record<string, string> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && !/^FIGMA|^NODE_OPTIONS/.test(key))) as Record<string, string>;
  const config = mkdtempSync(join(tmpdir(), 'figmanage-test-')); directories.push(config);
  return { ...env, FIGMANAGE_CONFIG_DIR: config, FIGMA_PAT: 'test-pat', FIGMA_AUTH_COOKIE: 'test-cookie', FIGMA_USER_ID: 'self', FIGMA_ORG_ID: 'org-1', FIGMA_INTERNAL_BASE_URL: origin, FIGMA_PUBLIC_BASE_URL: origin, ...overrides };
}
function cli(args: string[], env = environment(), onOutput?: (stdout: string) => void): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [binary, ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    processes.add(child); child.stdin.end();
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    const timer = setTimeout(() => { child.kill(); reject(new Error('CLI timed out: '+args.join(' '))); }, 10000);
    child.stdout.on('data', chunk => { stdout += chunk; onOutput?.(stdout); });
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); processes.delete(child); resolveResult({ code, stdout, stderr }); });
  });
}
async function mcp(env = environment()) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [binary, '--mcp'], env, stderr: 'pipe' });
  transport.stderr?.resume();
  const client = new Client({ name: 'figmanage-contract-test', version: '1' });
  await client.connect(transport);
  return client;
}

beforeAll(async () => {
  api = createServer(async (req, res) => {
    requests.push({ method: req.method!, path: req.url! });
    for await (const _chunk of req) { /* Consume the request before simulating a lost response. */ }
    if (req.url === '/api/files/create' && mode === 'lost-write') { req.socket.destroy(); return; }
    res.setHeader('content-type', 'application/json');
    if (mode.startsWith('offboard')) {
      const path = req.url!.split('?')[0];
      let data: unknown;
      if (path === '/api/v2/orgs/org-1/org_users') {
        await offboardGate;
        data = { meta: { users: [{ id: 'ou-old', user_id: 'old', permission: 'member', user: { email: 'old@example.com' } }] } };
      }
      if (path === '/api/teams/team-1/members' || path === '/api/roles/team/team-1') data = { meta: [] };
      if (path === '/api/teams/team-1/folders') data = { meta: [{ id: 'project-1', name: 'Project' }] };
      if (path === '/v2/folders/project-1/folders') data = { folders: [] };
      if (path === '/api/roles/folder/project-1') data = { meta: [] };
      if (path === '/api/folders/project-1/paginated_files') data = { meta: { files: [{ key: 'file-1', name: 'Shared file' }] } };
      if (path === '/api/roles/file/file-1') data = { meta: offboardRoleRemoved ? [] : [{ id: 'direct-role', user_id: 'old', level: 300 }] };
      if (path === '/api/roles/direct-role' && req.method === 'DELETE') {
        if (mode !== 'offboard-unverified') offboardRoleRemoved = true;
        data = {};
      }
      if (data !== undefined) { res.end(JSON.stringify(data)); return; }
    }
    if (req.url?.endsWith('/admins?include_license_admins=false')) {
      if (mode === 'stalled-admin') return;
      if (mode === 'rate-limited-admin') { res.writeHead(429, { 'retry-after': '120' }); res.end('{}'); return; }
      res.end(JSON.stringify({ meta: [{ user_id: 'self' }] })); return;
    }
    if (req.url === '/v1/me') {
      if (mode === 'expired') { res.statusCode = 401; res.end('{}'); return; }
      res.end(JSON.stringify({ id: mode === 'identity-mismatch' ? 'other' : 'self', handle: 'Test' })); return;
    }
    if (req.url === '/api/user/state') {
      if (mode === 'expired') { res.statusCode = 401; res.end('{}'); return; }
      res.end(JSON.stringify({ meta: { orgs: [{ id: 'org-1', name: 'First' }, { id: 'org-2', name: 'Second' }], user: { handle: 'Test' } } })); return;
    }
    if (req.url?.startsWith('/api/search/')) { res.end(JSON.stringify({ meta: [] })); return; }
    if (req.url === '/v2/teams/team-1/webhooks') { res.end(JSON.stringify({ webhooks: [] })); return; }
    if (req.url === '/v2/folders/project-1/files') {
      if (mode === 'legacy-folder-token' || mode === 'folder-denied') {
        res.statusCode = 403; res.end(JSON.stringify({ message: mode === 'legacy-folder-token' ? 'Invalid scope: requires folders:read' : 'Permission denied' })); return;
      }
    }
    if (req.url === '/v1/projects/project-1/files' || req.url === '/v2/folders/project-1/files') { res.end(JSON.stringify({ files: Array.from({ length: mode === 'large-list' ? 2000 : 3 }, (_, i) => ({ key: `file-${i+1}`, name: mode === 'large-list' ? '界'.repeat(50) + '\nnext' : `File ${i+1}` })) })); return; }
    if (req.url === '/api/files_batch') { res.end(JSON.stringify({ meta: { success: { 'file-1': true }, errors: { 'file-2': 'denied' } } })); return; }
    if (req.url === '/api/files_batch/restore') { res.end(JSON.stringify({ meta: { success: {}, errors: { 'file-1': 'denied' } } })); return; }
    if (req.url?.match(/^\/api\/orgs\/[^/]+\/teams$/)) { res.end(JSON.stringify({ meta: [{ id: 'team-1', name: req.url }] })); return; }
    res.statusCode = 404; res.end(JSON.stringify({ message: 'Unexpected fixture request: '+req.url }));
  });
  await new Promise<void>(resolveReady => api.listen(0, '127.0.0.1', resolveReady));
  origin = `http://127.0.0.1:${(api.address() as any).port}`;
});
beforeEach(() => { requests = []; mode = ''; offboardGate = undefined; offboardRoleRemoved = false; });
afterAll(async () => {
  for (const child of processes) child.kill();
  await new Promise<void>(resolveClosed => api.close(() => resolveClosed()));
  for (const dir of directories) rmSync(dir, { recursive: true, force: true });
});

describe('CLI agent contracts', () => {
  it('generates native client config and JSONL setup instructions without API calls or saved settings', async () => {
    const env = environment();
    const native = await cli(['mcp-config', 'codex'], env);
    expect(native.code).toBe(0);
    expect(native.stdout).toMatch(/^\[mcp_servers.figmanage\]/);
    expect(native.stderr).toBe('');
    const result = await cli(['mcp-config', 'vscode', '--local', '--read-only', '--jsonl'], env);
    expect(result.code).toBe(0);
    const records = result.stdout.trim().split('\n').map(line => JSON.parse(line));
    expect(records.map(record => record.type)).toEqual(['result', 'summary']);
    const config = JSON.parse(records[0].data.config);
    expect(config.servers.figmanage).toMatchObject({ command: process.execPath, args: [binary, '--mcp'], env: { FIGMA_READ_ONLY: 'true' } });
    expect(records[0].data.next_steps.length).toBeGreaterThan(0);
    expect(records[1]).toMatchObject({ ok: true, count: 1 });
    expect(requests).toEqual([]);
    expect(readdirSync(env.FIGMANAGE_CONFIG_DIR)).toEqual([]);
  });
  it('rejects unsupported clients with structured errors', async () => {
    const result = await cli(['mcp-config', 'unknown', '--jsonl']);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ type: 'error' });
    expect(result.stdout).toBe('');
    expect(requests).toEqual([]);
  });
  it('streams offboarding progress before the audit can finish', async () => {
    mode = 'offboard';
    let release!: () => void;
    offboardGate = new Promise(resolveGate => { release = resolveGate; });
    try {
      const result = await cli(['org', 'offboard', 'old', '--execute', '--progress', '--jsonl'], environment(), stdout => {
        if (stdout.includes('"type":"progress"')) release();
      });
      expect(result.code).toBe(0);
      const records = result.stdout.trim().split('\n').map(line => JSON.parse(line));
      expect(records[0]).toMatchObject({ type: 'progress', data: { phase: 'discovery', sequence: 1 } });
      expect(records.find(record => record.type === 'result').data).toMatchObject({ completion: { verified: true, follow_up_required: true } });
      expect(records.at(-1)).toEqual({ type: 'summary', ok: true, count: 1 });
      expect(offboardRoleRemoved).toBe(true);
    } finally { release(); }
  });
  it('preserves JSONL records without the progress opt-in', async () => {
    mode = 'offboard';
    const result = await cli(['org', 'offboard', 'old', '--jsonl']);
    expect(result.code).toBe(0);
    expect(result.stdout.trim().split('\n').map(line => JSON.parse(line).type)).toEqual(['result', 'summary']);
    expect(requests.some(request => request.method !== 'GET')).toBe(false);
  });
  it('rejects progress without JSONL before any requests', async () => {
    const result = await cli(['org', 'offboard', 'old', '--progress']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--progress requires --jsonl');
    expect(requests).toEqual([]);
  });
  it('keeps failed verification in the JSONL result and exits nonzero', async () => {
    mode = 'offboard-unverified';
    const result = await cli(['org', 'offboard', 'old', '--execute', '--progress', '--jsonl']);
    expect(result.code).toBe(1);
    const records = result.stdout.trim().split('\n').map(line => JSON.parse(line));
    expect(records.find(record => record.type === 'result').data).toMatchObject({ summary: { failed: 1 }, completion: { verified: false } });
    expect(records.at(-1)).toMatchObject({ type: 'summary', ok: false });
  });
  it('sends requested MCP progress before completion and preserves structured results', async () => {
    mode = 'offboard';
    const client = await mcp();
    let release!: () => void;
    offboardGate = new Promise(resolveGate => { release = resolveGate; });
    const progress: any[] = [];
    try {
      const result = await client.callTool({ name: 'offboard_user', arguments: { user_identifier: 'old', execute: true } }, undefined, {
        onprogress: event => { progress.push(event); release(); },
      });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent?.result).toMatchObject({ completion: { verified: true } });
      expect(progress[0]).toMatchObject({ progress: 1 });
      expect(progress.length).toBeGreaterThan(2);
      expect(JSON.stringify(result.content)).not.toContain('Offboarding complete');
    } finally { release(); await client.close(); }
  });
  it('locates a readable bundled workflow skill without credentials', async () => {
    const result = await cli(['skills', '--jsonl'], environment({ FIGMA_PAT: '', FIGMA_AUTH_COOKIE: '', FIGMA_USER_ID: '' }));
    expect(result.code).toBe(0);
    const records = result.stdout.trim().split('\n').map(line => JSON.parse(line));
    expect(readFileSync(records[0].data.path, 'utf8')).toContain('name: figmanage');
    expect(requests).toEqual([]);
  });
  it('reports setup recovery in JSONL without credentials or API requests', async () => {
    const result = await cli(['doctor', '--jsonl'], environment({ FIGMA_PAT: '', FIGMA_AUTH_COOKIE: '', FIGMA_USER_ID: '' }));
    expect(result.code).toBe(1);
    const records = result.stdout.trim().split('\n').map(line => JSON.parse(line));
    expect(records[0].data).toMatchObject({ ready: false, credential_source: 'none' });
    expect(records.at(-1)).toMatchObject({ type: 'summary', ok: false });
    expect(requests).toEqual([]);
  });
  it('reports mismatched live identities as a failed diagnostic', async () => {
    mode = 'identity-mismatch';
    const result = await cli(['doctor', '--jsonl']);
    expect(result.code).toBe(1);
    const records = result.stdout.trim().split('\n').map(line => JSON.parse(line));
    expect(records[0].data).toMatchObject({ ready: false, identity_match: false });
    expect(records.at(-1)).toMatchObject({ ok: false });
  });
  it('keeps recovery diagnostics available over MCP after credentials expire', async () => {
    mode = 'expired';
    const client = await mcp();
    try {
      const result = await client.callTool({ name: 'setup_status', arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.structuredContent?.result).toMatchObject({ ready: false, configured: { pat: true, cookie: true } });
      expect((await client.listTools()).tools.map(tool => tool.name)).toContain('setup_extract_cookies');
    } finally { await client.close(); }
  });
  it('discovers all operations offline without credentials', async () => {
    const result = await cli(['schema'], environment({ FIGMA_PAT: '', FIGMA_AUTH_COOKIE: '', FIGMA_USER_ID: '' }));
    expect(result.code).toBe(0);
    const schema = JSON.parse(result.stdout);
    expect(schema.operations).toHaveLength(102);
    expect(schema.operations.find((op: any) => op.name === 'rename_file').inputSchema.required).toContain('file_key');
    expect(requests).toEqual([]);
  });
  it.each([
    ['files', 'rename', '../other', '--name', 'Name'],
    ['files', 'create', 'project-1', '--editor-type', 'invalid'],
    ['navigate', 'list-files', 'project-1', '--page-size', '-1'],
  ])('rejects invalid input before requests: %s %s', async (...args) => {
    const result = await cli([...args, '--error-format', 'json']);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr).error.code).toBe('invalid_input');
    expect(requests).toEqual([]);
  });
  it('previews a validated mutation without requests', async () => {
    const result = await cli(['files', 'trash', '--file-keys', 'file-1', '--dry-run']);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ dry_run: true, executed: false, operation: 'trash_files', input: { file_keys: ['file-1'] } });
    expect(requests).toEqual([]);
  });
  it('requires explicit confirmation on closed stdin', async () => {
    const result = await cli(['files', 'trash', '--file-keys', 'file-1', '--error-format', 'json']);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr).error.code).toBe('confirmation_required');
    expect(result.stdout).toBe('');
    expect(requests).toEqual([]);
  });
  it('executes --yes and signals partial failure without losing the payload', async () => {
    const result = await cli(['files', 'trash', '--file-keys', 'file-1,file-2', '--yes', '--json']);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ succeeded: 1, failed: 1 });
    expect(requests.filter(r => r.method === 'DELETE')).toHaveLength(1);
  });
  it('does not repeat a write after its response is lost', async () => {
    mode = 'lost-write';
    const result = await cli(['files', 'create', 'project-1', '--error-format', 'json']);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr).error.code).toBe('outcome_unknown');
    expect(requests.filter(r => r.method === 'POST')).toHaveLength(1);
  });
  it('emits JSON for empty results and auth checks when piped', async () => {
    const empty = await cli(['navigate', 'search', 'missing', '--json']);
    expect(JSON.parse(empty.stdout)).toEqual([]);
    mode = 'expired';
    for (const args of [['whoami'], ['navigate', 'check-auth']]) {
      const result = await cli(args);
      expect(result.code).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ pat: { valid: false }, cookie: { valid: false } });
    }
  });
  it('bounds PAT results and returns a reusable cursor', async () => {
    const first = JSON.parse((await cli(['navigate', 'list-files', 'project-1', '--page-size', '2'])).stdout);
    expect(first.files).toHaveLength(2);
    const second = JSON.parse((await cli(['navigate', 'list-files', 'project-1', '--page-size', '2', '--page-token', first.pagination.next_cursor])).stdout);
    expect(second.files.map((f: any) => f.key)).toEqual(['file-3']);
    expect(second.pagination.has_more).toBe(false);
  });
  it('supports legacy project scopes without changing JSONL results', async () => {
    mode = 'legacy-folder-token';
    const result = await cli(['navigate', 'list-files', 'project-1', '--page-size', '2', '--jsonl']);
    expect(result.code).toBe(0);
    expect(jsonLines(result.stdout).at(-1)).toEqual({ type: 'summary', ok: true, count: 2, collection: 'files' });
    expect(requests.map(request => request.path)).toEqual(['/v2/folders/project-1/files', '/v1/projects/project-1/files']);
  });
  it('does not fall back to another endpoint after an ordinary permission denial', async () => {
    mode = 'folder-denied';
    const result = await cli(['navigate', 'list-files', 'project-1', '--jsonl']);
    expect(result.code).toBe(1); expect(result.stdout).toBe('');
    expect(jsonLines(result.stderr)[0].error.code).toBe('permission_denied');
    expect(requests.map(request => request.path)).toEqual(['/v2/folders/project-1/files']);
  });
  it('persists workspace selection and respects an explicit environment override', async () => {
    const env = environment({ FIGMA_PAT: '', FIGMA_AUTH_COOKIE: '', FIGMA_USER_ID: '', FIGMA_ORG_ID: '' });
    writeFileSync(join(env.FIGMANAGE_CONFIG_DIR, 'config.json'), JSON.stringify({ active_workspace: 'test', workspaces: { test: { cookie: 'test-cookie', user_id: 'self', org_id: 'org-1' } } }));
    expect((await cli(['navigate', 'switch-org', 'Second'], env)).code).toBe(0);
    expect(JSON.parse(readFileSync(join(env.FIGMANAGE_CONFIG_DIR, 'config.json'), 'utf8')).workspaces.test.org_id).toBe('org-2');
    const result = await cli(['navigate', 'list-teams'], env);
    expect(result.code).toBe(0);
    expect(requests.some(r => r.path === '/api/orgs/org-2/teams')).toBe(true);
    await cli(['navigate', 'list-teams'], { ...env, FIGMA_ORG_ID: 'org-1' });
    expect(requests.at(-1)?.path).toBe('/api/orgs/org-1/teams');
  });
});

describe('MCP SDK integration', () => {
  it.each(['stalled-admin', 'rate-limited-admin'])('initializes before the client deadline with %s, then recovers admin tools', async failureMode => {
    mode = failureMode;
    const transport = new StdioClientTransport({ command: process.execPath, args: [binary, '--mcp'], env: environment(), stderr: 'pipe' });
    transport.stderr?.resume();
    const client = new Client({ name: 'startup-deadline-test', version: '1' });
    try {
      await client.connect(transport, { timeout: 8000 });
      expect((await client.listTools()).tools.map(tool => tool.name)).not.toContain('offboard_user');
      expect((await client.listTools()).tools.map(tool => tool.name)).toContain('setup_status');
      expect(requests.filter(request => request.path.includes('/admins'))).toHaveLength(1);
      mode = '';
      const result = await client.callTool({ name: 'setup_status', arguments: {} });
      expect(result.isError).not.toBe(true);
      expect((await client.listTools()).tools.map(tool => tool.name)).toContain('offboard_user');
    } finally { await client.close(); }
  }, 10000);
  it('filters mutations from readonly and rejects misspelled toolsets', async () => {
    const client = await mcp(environment({ FIGMA_TOOLSETS: 'readonly' }));
    try {
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every(tool => tool.annotations?.readOnlyHint === true)).toBe(true);
      expect(tools.some(tool => tool.name === 'post_comment')).toBe(false);
    } finally { await client.close(); }
    const result = await cli(['--mcp'], environment({ FIGMA_TOOLSETS: 'read-only' }));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Unknown FIGMA_TOOLSETS');
  });
  it('provides structured results and flags partial and zero-success failures', async () => {
    const client = await mcp();
    try {
      const preview = await client.callTool({ name: 'trash_files', arguments: { file_keys: ['file-1'], dry_run: true } });
      expect(preview.structuredContent).toMatchObject({ result: { dry_run: true, executed: false } });
      expect(requests.filter(r => r.method === 'DELETE')).toHaveLength(0);
      const result = await client.callTool({ name: 'move_files', arguments: { file_keys: ['file-1','file-2'], destination_project_id: 'project-1' } });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ result: { succeeded: 1, failed: 1 } });
      const restore = await client.callTool({ name: 'restore_files', arguments: { file_keys: ['file-1'] } });
      expect(restore.isError).toBe(true);
      expect(restore.structuredContent).toMatchObject({ result: { succeeded: 0, failed: 1 } });
    } finally { await client.close(); }
  });
  it('keeps an HTTP session usable across initialize, list and call', async () => {
    const reservation = createServer();
    await new Promise<void>(ready => reservation.listen(0, '127.0.0.1', ready));
    const port = (reservation.address() as any).port;
    await new Promise<void>(closed => reservation.close(() => closed()));
    const env = environment({ FIGMA_HTTP_TOKEN: 'local-test-token' });
    const child = spawn(process.execPath, [binary, '--mcp', '--http', String(port)], { env, stdio: ['pipe','pipe','pipe'] });
    processes.add(child); child.stdout.resume();
    const ready = new Promise<void>((resolveReady, reject) => {
      let log = ''; const timer = setTimeout(() => reject(new Error('HTTP startup timed out: '+log)), 5000);
      child.stderr.on('data', data => { log += data; if (log.includes('listening')) { clearTimeout(timer); resolveReady(); } });
      child.on('exit', code => { clearTimeout(timer); reject(new Error('HTTP exited '+code+': '+log)); });
    });
    const client = new Client({ name: 'http-contract-test', version: '1' });
    try {
      await ready;
      const url = new URL(`http://127.0.0.1:${port}/mcp`);
      expect((await fetch(url)).status).toBe(401);
      await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: 'Bearer local-test-token' } } }));
      expect((await client.listTools()).tools.length).toBeGreaterThan(50);
      const result = await client.callTool({ name: 'list_teams', arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toHaveProperty('result');
      expect((await client.listTools()).tools.length).toBeGreaterThan(50);
    } finally { await client.close(); child.kill(); processes.delete(child); }
  });
});

function jsonLines(text: string): any[] {
  expect(text.endsWith('\n')).toBe(true);
  return text.slice(0, -1).split('\n').map(line => JSON.parse(line));
}

describe('JSONL CLI contracts', () => {
  it('preserves empty wrapped collections in JSON and JSONL', async () => {
    const json = await cli(['webhooks', 'list', 'team-1', '--json']);
    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual({ count: 0, webhooks: [] });
    const jsonl = await cli(['webhooks', 'list', 'team-1', '--jsonl']);
    expect(jsonl.code).toBe(0);
    expect(jsonLines(jsonl.stdout)).toEqual([
      { type: 'result', data: { count: 0 } },
      { type: 'summary', ok: true, count: 0, collection: 'webhooks' },
    ]);
  });
  it('writes items, pagination metadata, and a final summary', async () => {
    const result = await cli(['navigate', 'list-files', 'project-1', '--page-size', '2', '--jsonl']);
    expect(result.code).toBe(0); expect(result.stderr).toBe('');
    const records = jsonLines(result.stdout);
    expect(records.map(record => record.type)).toEqual(['item','item','result','summary']);
    expect(records[2].data.pagination).toMatchObject({ has_more: true, next_cursor: 'offset:2' });
    expect(records.at(-1)).toEqual({ type: 'summary', ok: true, count: 2, collection: 'files' });
  });
  it('writes an explicit summary for an empty list', async () => {
    const result = await cli(['--jsonl', 'navigate', 'search', 'missing']);
    expect(result.code).toBe(0);
    expect(jsonLines(result.stdout)).toEqual([{ type: 'summary', ok: true, count: 0, collection: null }]);
  });
  it('keeps partial results and exits nonzero', async () => {
    const result = await cli(['files', 'trash', '--file-keys', 'file-1,file-2', '--yes', '--jsonl']);
    expect(result.code).toBe(1);
    const records = jsonLines(result.stdout);
    expect(records[0]).toMatchObject({ type: 'result', data: { succeeded: 1, failed: 1 } });
    expect(records.at(-1)).toMatchObject({ type: 'summary', ok: false });
  });
  it('previews writes using JSONL without making requests', async () => {
    const result = await cli(['files', 'trash', '--file-keys', 'file-1', '--dry-run', '--jsonl']);
    expect(result.code).toBe(0);
    expect(jsonLines(result.stdout)[0]).toMatchObject({ type: 'result', data: { dry_run: true, executed: false } });
    expect(requests).toEqual([]);
  });
  it.each([
    ['files', 'rename', '../other', '--name', 'Name', '--jsonl'],
    ['files', 'rename', 'file-1', '--jsonl'],
    ['--jsonl', 'files', 'rename', 'file-1', '--unknown'],
    ['navigate', 'list-teams', '--json', '--jsonl'],
    ['comments', 'list', 'file-1', '--md', '--jsonl'],
    ['login', '--jsonl'],
    ['completion', '--jsonl'],
    ['schema', '--error-format', 'invalid', '--jsonl'],
    ['schema', '--error-format=invalid', '--jsonl'],
    ['--jsonl', 'schema', '--error-format', 'invalid'],
  ])('keeps errors on stderr before any requests: %j', async (...args) => {
    const result = await cli(args);
    expect(result.code).toBe(1); expect(result.stdout).toBe('');
    expect(jsonLines(result.stderr)[0]).toMatchObject({ type: 'error', error: { message: expect.any(String) } });
    expect(requests).toEqual([]);
  });
  it.each([
    ['schema', '--error-format', '--jsonl'],
    ['schema', '--error-format', 'invalid', '--', '--jsonl'],
  ])('does not treat option values or literal arguments as JSONL flags: %j', async (...args) => {
    const result = await cli(args);
    expect(result.code).toBe(1); expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^error: /);
    expect(requests).toEqual([]);
  });
  it('honors JSONL for auth and offline schema output', async () => {
    for (const args of [['whoami'], ['navigate','check-auth'], ['schema']]) {
      const result = await cli([...args, '--jsonl']);
      expect(result.code).toBe(0);
      const records = jsonLines(result.stdout);
      expect(records[0].type).toBe('result');
      expect(records.at(-1)).toEqual({ type: 'summary', ok: true, count: 1 });
      if (args[0] === 'schema') expect(records[0].data.output_formats.jsonl.version).toBe(1);
    }
  });
  it('drains large UTF-8 output without truncating the final record', async () => {
    mode = 'large-list';
    const result = await cli(['navigate','list-files','project-1','--jsonl']);
    expect(result.code).toBe(0);
    const records = jsonLines(result.stdout);
    expect(records.filter(record => record.type === 'item')).toHaveLength(2000);
    expect(records[1999].data.name).toBe('界'.repeat(50) + '\nnext');
    expect(records.at(-1)).toMatchObject({ type: 'summary', ok: true, count: 2000 });
  });
});
