import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthConfig } from '../auth/client.js';
import type { Toolset } from '../types/figma.js';
import { hasPat, hasCookie } from '../auth/client.js';
import { z } from 'zod';

/** Validates that a string is a safe Figma ID (alphanumeric, hyphens, underscores, dots, colons) */
export const figmaId = z.string().regex(/^[\w.:-]+$/, 'Invalid ID format');

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
          const augmented = { ...config, annotations: { ...annotations, ...((config.annotations as object) || {}) } };
          return (target.registerTool as Function).call(target, name, augmented, ...rest);
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

export function toolResult(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text }] };
}

/** Format a tool response with a summary line, JSON data, and optional next-step guidance. */
export function toolSummary(
  summary: string,
  data: unknown,
  nextStep?: string,
): { content: Array<{ type: 'text'; text: string }> } {
  const parts = [summary, '', JSON.stringify(data, null, 2)];
  if (nextStep) parts.push('', nextStep);
  return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
}

export function toolError(message: string): { isError: true; content: Array<{ type: 'text'; text: string }> } {
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

// Re-export from helpers so existing tool imports still work
export { resolveOrgId, requireOrgId } from '../helpers.js';
