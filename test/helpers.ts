/**
 * Test helpers for figmanage tool tests.
 *
 * Strategy: Tools register themselves via defineTool(), which calls
 * server.registerTool(name, opts, handler) during registration.
 * We mock McpServer to capture handler functions, and mock the axios-based
 * API clients to return controlled responses.
 */

import { vi, type Mock } from 'vitest';
import type { AuthConfig } from '../src/auth/client.js';
import type { AxiosInstance, AxiosResponse } from 'axios';

// -- Auth configs for different test scenarios --

export function patOnlyConfig(overrides?: Partial<AuthConfig>): AuthConfig {
  return { pat: 'figd_test-pat-token', ...overrides };
}

export function cookieOnlyConfig(overrides?: Partial<AuthConfig>): AuthConfig {
  return { cookie: 'test-cookie', userId: '12345', orgId: 'org-1', ...overrides };
}

export function dualAuthConfig(overrides?: Partial<AuthConfig>): AuthConfig {
  return {
    pat: 'figd_test-pat-token',
    cookie: 'test-cookie',
    userId: '12345',
    orgId: 'org-1',
    ...overrides,
  };
}

export function noAuthConfig(): AuthConfig {
  return {};
}

// -- Mock McpServer --

/**
 * Captures handler functions passed to server.registerTool().
 * After a tool module's register() runs against this mock, you can
 * retrieve any handler by tool name.
 */
export interface MockServer {
  registerTool: Mock;
  handlers: Map<string, (...args: any[]) => Promise<any>>;
  getHandler: (name: string) => (...args: any[]) => Promise<any>;
}

export function createMockServer(): MockServer {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();

  const registerTool = vi.fn((name: string, _opts: any, handler: (...args: any[]) => Promise<any>) => {
    handlers.set(name, handler);
  });

  return {
    registerTool,
    handlers,
    getHandler(name: string) {
      const h = handlers.get(name);
      if (!h) throw new Error(`Tool "${name}" not registered. Available: ${[...handlers.keys()].join(', ')}`);
      return h;
    },
  };
}

// -- Mock Axios client --

export interface MockAxiosClient {
  get: Mock;
  post: Mock;
  put: Mock;
  delete: Mock;
  patch: Mock;
}

export function createMockAxios(): MockAxiosClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  };
}

/** Wrap a value in the shape axios returns */
export function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {} as any,
  };
}

/** Create an axios-like error with a response */
export function axiosError(status: number, message = 'Request failed'): Error & { response?: { status: number } } {
  const err = new Error(message) as Error & { response?: { status: number } };
  err.response = { status };
  return err;
}

// -- Result parsing --

/** Parse the JSON text from a toolResult/toolError response.
 *  Handles both plain JSON and summary-wrapped responses (summary\n\njson\n\nnext_step). */
export function parseToolResult(result: { content: Array<{ type: string; text: string }>; isError?: boolean }): any {
  const text = result.content[0]?.text;
  try {
    return JSON.parse(text);
  } catch {
    // Look for a JSON block in summary-wrapped response
    const sections = text.split('\n\n');
    for (const section of sections) {
      const trimmed = section.trim();
      if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && (trimmed.endsWith('}') || trimmed.endsWith(']'))) {
        try { return JSON.parse(trimmed); } catch { /* not valid json */ }
      }
    }
    return text;
  }
}

/** Get raw text from a tool response */
export function getToolText(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0]?.text ?? '';
}
