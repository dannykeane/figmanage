import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthConfig } from '../auth/client.js';
import { hasCookie, hasPat } from '../auth/client.js';
import { errorCode, hasFailures } from '../results.js';
import type { inputSchemas } from '../schemas.js';
import type { Toolset } from '../types/figma.js';
import { mutationPreview } from '../validation.js';

/** Validates that a string is a safe Figma ID (alphanumeric, hyphens, underscores, dots, colons) */
export { figmaId } from '../schemas.js';

export type AuthRequirement = 'pat' | 'cookie' | 'either';

export interface ToolDef {
  toolset: Toolset;
  auth: AuthRequirement;
  mutates?: boolean;
  destructive?: boolean;
  adminOnly?: boolean;
  register: (server: McpServer, config: AuthConfig) => void;
}

const allTools: ToolDef[] = [];
const registered = new WeakMap<McpServer, Map<string, RegisteredTool>>();

export function defineTool(def: ToolDef): void {
  allTools.push(def);
}

/** Build MCP tool annotations from ToolDef flags. */
function buildAnnotations(tool: ToolDef): Record<string, boolean> {
  const annotations: Record<string, boolean> = { openWorldHint: true };
  if (!tool.mutates) {
    annotations.readOnlyHint = true;
  } else {
    annotations.destructiveHint = !!tool.destructive;
  }
  return annotations;
}

/**
 * Wrap an McpServer so that every registerTool call automatically
 * injects annotations derived from the ToolDef metadata.
 */
function withAnnotations(server: McpServer, tool: ToolDef): McpServer {
  const annotations = buildAnnotations(tool);
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop === 'registerTool') {
        return (name: string, config: Record<string, unknown>, ...rest: unknown[]) => {
          const augmented = { ...config, outputSchema: { result: z.unknown().optional(), error: z.object({ code: z.string(), message: z.string() }).optional() }, annotations: { ...annotations, ...((config.annotations as object) || {}) } };
          if (tool.mutates) {
            Object.assign(augmented, { inputSchema: { ...(config.inputSchema as object), dry_run: z.boolean().optional().describe('Preview validated inputs without API requests. Does not check permissions or remote state.') } });
          }
          const handler = rest[0] as (...args: any[]) => Promise<any>;
          const wrapped = async (...args: any[]) => {
            if (tool.mutates && args[0]?.dry_run) return toolSummary('Dry run: no API requests sent.', mutationPreview(name as keyof typeof inputSchemas, args[0]));
            const result = await handler(...args);
            if (!result.structuredContent) {
              const text = result.content?.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') || '';
              result.structuredContent = result.isError ? { error: { code: errorCode(text), message: text } } : { result: { message: text } };
            }
            return result;
          };
          const handle = (target.registerTool as Function).call(target, name, augmented, wrapped);
          registered.get(server)?.set(name, handle);
          return handle;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export function registerTools(
  server: McpServer,
  config: AuthConfig,
  enabledToolsets: Set<Toolset>,
  readOnly: boolean,
  isAdmin: boolean = true,
): void {
  for (const handle of registered.get(server)?.values() || []) handle.remove();
  registered.set(server, new Map());
  for (const tool of allTools) {
    // Filter by enabled toolsets
    if (!enabledToolsets.has(tool.toolset)) continue;

    // Filter admin-only tools for non-admin users
    if (tool.adminOnly && !isAdmin) continue;

    // Filter by read-only mode
    if (readOnly && tool.mutates) continue;

    // Filter by available auth
    if (tool.auth === 'pat' && !hasPat(config)) continue;
    if (tool.auth === 'cookie' && !hasCookie(config)) continue;
    if (tool.auth === 'either' && !hasPat(config) && !hasCookie(config)) continue;

    tool.register(withAnnotations(server, tool), config);
  }
}

export function toolResult(text: string, data?: unknown): { content: Array<{ type: 'text'; text: string }>; structuredContent?: { result: unknown }; isError?: true } {
  return {
    content: [{ type: 'text' as const, text }],
    ...(data !== undefined ? { structuredContent: { result: data } } : {}),
    ...(hasFailures(data) ? { isError: true as const } : {}),
  };
}

/** Format a tool response with a summary line, JSON data, and optional next-step guidance. */
export function toolSummary(
  summary: string,
  data: unknown,
  nextStep?: string,
): { content: Array<{ type: 'text'; text: string }>; structuredContent: { result: unknown }; isError?: true } {
  const parts = [summary, '', JSON.stringify(data, null, 2)];
  if (nextStep) parts.push('', nextStep);
  return { content: [{ type: 'text' as const, text: parts.join('\n') }], structuredContent: { result: data }, ...(hasFailures(data) ? { isError: true as const } : {}) };
}

export function toolError(message: string): { isError: true; content: Array<{ type: 'text'; text: string }>; structuredContent: { error: { code: string; message: string } } } {
  return { isError: true, content: [{ type: 'text' as const, text: message }], structuredContent: { error: { code: errorCode(message), message } } };
}

// Re-export from helpers so existing tool imports still work
export { requireOrgId, resolveOrgId } from '../helpers.js';
