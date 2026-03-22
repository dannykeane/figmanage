import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadAuthConfig, hasPat, hasCookie } from './auth/client.js';
import { registerTools } from './tools/register.js';
import { registerSetupTools } from './tools/setup.js';
import { checkIsAdmin } from './operations/navigate.js';
import type { Toolset } from './types/figma.js';

// Import tool modules (side-effect: registers via defineTool)
import './tools/navigate.js';
import './tools/files.js';
import './tools/projects.js';
import './tools/permissions.js';
import './tools/comments.js';
import './tools/export.js';
import './tools/versions.js';
import './tools/branching.js';
import './tools/components.js';
import './tools/dev-resources.js';
import './tools/webhooks.js';
import './tools/reading.js';
import './tools/analytics.js';
import './tools/variables.js';
import './tools/org.js';
import './tools/libraries.js';
import './tools/teams.js';
import './tools/compound.js';
import './tools/compound-manager.js';

const ALL_TOOLSETS: Toolset[] = [
  'navigate', 'files', 'projects', 'permissions', 'org',
  'versions', 'branching', 'comments', 'export',
  'analytics', 'reading', 'components', 'webhooks', 'variables',
  'compound', 'teams', 'libraries',
];

const TOOLSET_PRESETS: Record<string, Toolset[]> = {
  starter: ['navigate', 'reading', 'comments', 'export'],
  admin: ['navigate', 'org', 'permissions', 'analytics', 'teams', 'libraries'],
  readonly: ['navigate', 'reading', 'comments', 'export', 'components', 'versions'],
  full: ALL_TOOLSETS,
};

function parseToolsets(env: string | undefined): Set<Toolset> {
  if (!env) return new Set(ALL_TOOLSETS);
  if (env in TOOLSET_PRESETS) return new Set(TOOLSET_PRESETS[env]);
  const requested = env.split(',').map(s => s.trim()) as Toolset[];
  const valid = requested.filter(t => ALL_TOOLSETS.includes(t));
  return new Set(valid.length > 0 ? valid : ALL_TOOLSETS);
}

function parseHttpPort(argv: string[]): number | undefined {
  const idx = argv.indexOf('--http');
  if (idx === -1) return undefined;
  const port = Number(argv[idx + 1]);
  if (!port || port < 1 || port > 65535) {
    console.error('--http requires a valid port number (1-65535)');
    process.exit(1);
  }
  return port;
}

/**
 * Start the MCP server. Behavior is identical to the original entry point:
 * stdio by default, HTTP if --http <port> is present.
 */
export async function startMcpServer(): Promise<void> {
  const config = loadAuthConfig();
  const readOnly = process.env.FIGMA_READ_ONLY === '1' || process.env.FIGMA_READ_ONLY === 'true';
  const enabledToolsets = parseToolsets(process.env.FIGMA_TOOLSETS);

  const require = createRequire(import.meta.url);
  const { version } = require('../package.json');

  const server = new McpServer({
    name: 'figmanage',
    version,
  });

  const fullyConfigured = hasPat(config) && hasCookie(config);
  const isAdmin = hasCookie(config) ? await checkIsAdmin(config) : false;
  config.isAdmin = isAdmin;

  if (fullyConfigured) {
    registerTools(server, config, enabledToolsets, readOnly, isAdmin);
  } else {
    // No auth or partial auth: register setup tools.
    // If env vars provide some auth, also register whatever tools are available.
    if (hasPat(config) || hasCookie(config)) {
      registerTools(server, config, enabledToolsets, readOnly, isAdmin);
    }

    registerSetupTools(server, async () => {
      // Re-load config after setup wrote credentials to disk
      const newConfig = loadAuthConfig();
      const newIsAdmin = await checkIsAdmin(newConfig);
      newConfig.isAdmin = newIsAdmin;
      registerTools(server, newConfig, enabledToolsets, readOnly, newIsAdmin);
      server.server.sendToolListChanged();
    });
  }

  const httpPort = parseHttpPort(process.argv);

  if (httpPort) {
    // Bearer token auth for HTTP transport
    let httpToken = process.env.FIGMA_HTTP_TOKEN || '';
    if (!httpToken) {
      httpToken = randomBytes(32).toString('hex');
      console.error(`Generated HTTP bearer token: ${httpToken}`);
      console.error('Set FIGMA_HTTP_TOKEN to use a fixed token.');
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const httpServer = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${httpPort}`);
      if (url.pathname === '/mcp') {
        const auth = req.headers.authorization || '';
        if (auth !== `Bearer ${httpToken}`) {
          res.writeHead(401).end('Unauthorized');
          return;
        }
        await transport.handleRequest(req, res);
      } else {
        res.writeHead(404).end('Not found');
      }
    });
    await server.connect(transport);
    httpServer.listen(httpPort, () => {
      console.error(`figmanage HTTP server listening on http://localhost:${httpPort}/mcp`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}
