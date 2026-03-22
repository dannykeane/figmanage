import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config module before importing auth/client
const mockGetActiveWorkspace = vi.hoisted(() => vi.fn());

vi.mock('../src/config.js', () => ({
  getActiveWorkspace: mockGetActiveWorkspace,
}));

import { loadAuthConfig, loadFromEnv, loadFromConfigFile, hasPat, hasCookie } from '../src/auth/client.js';

describe('auth resolution', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear all Figma env vars
    delete process.env.FIGMA_PAT;
    delete process.env.FIGMA_AUTH_COOKIE;
    delete process.env.FIGMA_USER_ID;
    delete process.env.FIGMA_ORG_ID;
    delete process.env.FIGMA_ORGS;
    mockGetActiveWorkspace.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadFromEnv', () => {
    it('loads PAT from env', () => {
      process.env.FIGMA_PAT = 'figd_test';
      const config = loadFromEnv();
      expect(config.pat).toBe('figd_test');
    });

    it('loads cookie auth from env', () => {
      process.env.FIGMA_AUTH_COOKIE = 'cookie-val';
      process.env.FIGMA_USER_ID = '123';
      process.env.FIGMA_ORG_ID = 'org-1';
      const config = loadFromEnv();
      expect(config.cookie).toBe('cookie-val');
      expect(config.userId).toBe('123');
      expect(config.orgId).toBe('org-1');
    });

    it('parses FIGMA_ORGS JSON', () => {
      process.env.FIGMA_ORGS = JSON.stringify([{ id: '1', name: 'Acme' }]);
      const config = loadFromEnv();
      expect(config.orgs).toEqual([{ id: '1', name: 'Acme' }]);
    });

    it('returns empty config when no env vars set', () => {
      const config = loadFromEnv();
      expect(config.pat).toBeUndefined();
      expect(config.cookie).toBeUndefined();
      expect(config.userId).toBeUndefined();
    });
  });

  describe('loadFromConfigFile', () => {
    it('returns null when no config file', () => {
      mockGetActiveWorkspace.mockReturnValue(null);
      expect(loadFromConfigFile()).toBeNull();
    });

    it('returns null when workspace has no credentials', () => {
      mockGetActiveWorkspace.mockReturnValue({ org_id: 'org-1' });
      expect(loadFromConfigFile()).toBeNull();
    });

    it('loads PAT from config file', () => {
      mockGetActiveWorkspace.mockReturnValue({ pat: 'figd_file' });
      const config = loadFromConfigFile();
      expect(config?.pat).toBe('figd_file');
    });

    it('loads cookie auth from config file', () => {
      mockGetActiveWorkspace.mockReturnValue({
        cookie: 'file-cookie',
        user_id: '456',
        org_id: 'org-2',
      });
      const config = loadFromConfigFile();
      expect(config?.cookie).toBe('file-cookie');
      expect(config?.userId).toBe('456');
      expect(config?.orgId).toBe('org-2');
    });
  });

  describe('loadAuthConfig (fallback chain)', () => {
    it('env vars take precedence over config file', () => {
      process.env.FIGMA_PAT = 'figd_env';
      mockGetActiveWorkspace.mockReturnValue({ pat: 'figd_file' });

      const config = loadAuthConfig();
      expect(config.pat).toBe('figd_env');
      // Config file should not even be queried when env vars are sufficient
    });

    it('env cookie auth takes precedence over config file', () => {
      process.env.FIGMA_AUTH_COOKIE = 'env-cookie';
      process.env.FIGMA_USER_ID = '111';
      mockGetActiveWorkspace.mockReturnValue({ pat: 'figd_file' });

      const config = loadAuthConfig();
      expect(config.cookie).toBe('env-cookie');
      expect(config.userId).toBe('111');
      expect(config.pat).toBeUndefined();
    });

    it('config file used when env vars are empty', () => {
      mockGetActiveWorkspace.mockReturnValue({
        pat: 'figd_from_file',
        cookie: 'file-cookie',
        user_id: '789',
        org_id: 'org-3',
      });

      const config = loadAuthConfig();
      expect(config.pat).toBe('figd_from_file');
      expect(config.cookie).toBe('file-cookie');
      expect(config.userId).toBe('789');
    });

    it('returns empty config when neither env vars nor config file exist', () => {
      mockGetActiveWorkspace.mockReturnValue(null);

      const config = loadAuthConfig();
      expect(config.pat).toBeUndefined();
      expect(config.cookie).toBeUndefined();
      expect(hasPat(config)).toBe(false);
      expect(hasCookie(config)).toBe(false);
    });

    it('backwards compatible: partial env vars (only PAT) works', () => {
      process.env.FIGMA_PAT = 'figd_partial';
      mockGetActiveWorkspace.mockReturnValue(null);

      const config = loadAuthConfig();
      expect(config.pat).toBe('figd_partial');
      expect(hasPat(config)).toBe(true);
    });

    it('falls through when env has cookie but no userId', () => {
      // Cookie without userId is not usable -- should fall through to config
      process.env.FIGMA_AUTH_COOKIE = 'orphan-cookie';
      mockGetActiveWorkspace.mockReturnValue({ pat: 'figd_fallback' });

      const config = loadAuthConfig();
      expect(config.pat).toBe('figd_fallback');
    });
  });

  describe('hasPat / hasCookie', () => {
    it('hasPat returns true with PAT', () => {
      expect(hasPat({ pat: 'figd_x' })).toBe(true);
    });

    it('hasPat returns false without PAT', () => {
      expect(hasPat({})).toBe(false);
    });

    it('hasCookie requires both cookie and userId', () => {
      expect(hasCookie({ cookie: 'x', userId: '1' })).toBe(true);
      expect(hasCookie({ cookie: 'x' })).toBe(false);
      expect(hasCookie({ userId: '1' })).toBe(false);
      expect(hasCookie({})).toBe(false);
    });
  });
});
