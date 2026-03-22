import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';

// Mock os.homedir() to redirect config to a temp directory.
// On non-Windows, config path is $HOME/.config/figmanage/config.json
let fakeHome: string;

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return {
    ...original,
    homedir: () => fakeHome,
  };
});

// Import after mock setup
const { readConfig, writeConfig, getActiveWorkspace, setActiveWorkspace, deleteConfig, getConfigPath, getConfigDir } =
  await import('../src/config.js');

describe('config', () => {
  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'figmanage-home-'));
    // Clear APPDATA so Windows path isn't used on macOS/Linux
    delete process.env.APPDATA;
  });

  afterEach(() => {
    try {
      rmSync(fakeHome, { recursive: true, force: true });
    } catch {}
  });

  function configDir() {
    return join(fakeHome, '.config', 'figmanage');
  }

  function configPath() {
    return join(configDir(), 'config.json');
  }

  describe('readConfig', () => {
    it('returns null when file does not exist', () => {
      expect(readConfig()).toBeNull();
    });

    it('returns null for malformed JSON', () => {
      const dir = configDir();
      const { mkdirSync } = require('node:fs');
      mkdirSync(dir, { recursive: true });
      writeFileSync(configPath(), 'not json {{{');
      expect(readConfig()).toBeNull();
    });

    it('returns null for JSON missing required fields', () => {
      const dir = configDir();
      const { mkdirSync } = require('node:fs');
      mkdirSync(dir, { recursive: true });
      writeFileSync(configPath(), JSON.stringify({ foo: 'bar' }));
      expect(readConfig()).toBeNull();
    });

    it('returns null when workspaces is not an object', () => {
      const dir = configDir();
      const { mkdirSync } = require('node:fs');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        configPath(),
        JSON.stringify({ workspaces: 'not-obj', active_workspace: 'x' }),
      );
      expect(readConfig()).toBeNull();
    });

    it('parses valid config', () => {
      const config = {
        workspaces: {
          default: { pat: 'figd_abc', user_id: '123' },
        },
        active_workspace: 'default',
      };
      const dir = configDir();
      const { mkdirSync } = require('node:fs');
      mkdirSync(dir, { recursive: true });
      writeFileSync(configPath(), JSON.stringify(config));
      expect(readConfig()).toEqual(config);
    });
  });

  describe('writeConfig', () => {
    it('creates directory and file', () => {
      const config = {
        workspaces: { test: { pat: 'figd_xyz' } },
        active_workspace: 'test',
      };
      writeConfig(config);

      expect(existsSync(configPath())).toBe(true);
      const written = JSON.parse(readFileSync(configPath(), 'utf-8'));
      expect(written).toEqual(config);
    });

    it('roundtrips with readConfig', () => {
      const config = {
        workspaces: {
          myworkspace: {
            cookie: 'cookie-val',
            user_id: '456',
            org_id: 'org-99',
            pat: 'figd_roundtrip',
            cookie_extracted_at: '2026-03-18T12:00:00.000Z',
          },
        },
        active_workspace: 'myworkspace',
      };

      writeConfig(config);
      expect(readConfig()).toEqual(config);
    });

    it('writes with 0o600 permissions on non-Windows', () => {
      if (platform() === 'win32') return;

      const config = {
        workspaces: { w: { pat: 'secret' } },
        active_workspace: 'w',
      };
      writeConfig(config);

      const stats = statSync(configPath());
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('overwrites existing config', () => {
      writeConfig({ workspaces: { a: { pat: 'first' } }, active_workspace: 'a' });
      writeConfig({ workspaces: { b: { pat: 'second' } }, active_workspace: 'b' });

      const result = readConfig();
      expect(result?.active_workspace).toBe('b');
      expect(result?.workspaces.b?.pat).toBe('second');
    });
  });

  describe('getActiveWorkspace', () => {
    it('returns null when no config exists', () => {
      expect(getActiveWorkspace()).toBeNull();
    });

    it('returns null when active workspace not in workspaces', () => {
      writeConfig({
        workspaces: { a: { pat: 'x' } },
        active_workspace: 'missing',
      });
      expect(getActiveWorkspace()).toBeNull();
    });

    it('returns correct workspace', () => {
      const workspace = { pat: 'figd_active', user_id: '789', org_id: 'org-5' };
      writeConfig({
        workspaces: {
          first: { pat: 'figd_other' },
          second: workspace,
        },
        active_workspace: 'second',
      });
      expect(getActiveWorkspace()).toEqual(workspace);
    });
  });

  describe('setActiveWorkspace', () => {
    it('creates config when none exists', () => {
      setActiveWorkspace('new-ws', { pat: 'figd_new' });

      const config = readConfig();
      expect(config?.active_workspace).toBe('new-ws');
      expect(config?.workspaces['new-ws']?.pat).toBe('figd_new');
    });

    it('merges with existing config', () => {
      writeConfig({
        workspaces: { existing: { pat: 'figd_old' } },
        active_workspace: 'existing',
      });

      setActiveWorkspace('added', { cookie: 'cook', user_id: '111' });

      const config = readConfig();
      expect(config?.active_workspace).toBe('added');
      expect(config?.workspaces.existing?.pat).toBe('figd_old');
      expect(config?.workspaces.added?.cookie).toBe('cook');
    });

    it('overwrites existing workspace entry', () => {
      setActiveWorkspace('ws', { pat: 'first' });
      setActiveWorkspace('ws', { pat: 'second', user_id: '222' });

      const ws = getActiveWorkspace();
      expect(ws?.pat).toBe('second');
      expect(ws?.user_id).toBe('222');
    });
  });

  describe('deleteConfig', () => {
    it('removes config file', () => {
      writeConfig({ workspaces: { x: {} }, active_workspace: 'x' });
      expect(existsSync(configPath())).toBe(true);

      deleteConfig();
      expect(existsSync(configPath())).toBe(false);
    });

    it('does not error when file does not exist', () => {
      expect(() => deleteConfig()).not.toThrow();
    });
  });
});
