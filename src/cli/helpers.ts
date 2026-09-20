import * as readline from 'node:readline';
import { hasCookie, hasPat, loadAuthConfig, type AuthConfig } from '../auth/client.js';
import { executionOptions } from '../execution.js';
import { error } from './format.js';

const ID_PATTERN = /^[\w.:-]+$/;

export function validateId(value: string, label: string): string {
  if (!ID_PATTERN.test(value)) {
    error(`Invalid ${label}: must contain only letters, numbers, hyphens, underscores, dots, or colons.`);
    process.exit(1);
  }
  return value;
}

export function parsePositiveInt(value: string, label: string, fallback: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    error(`${label} must be a positive number.`);
    process.exit(1);
  }
  return n;
}

export function requireAuth(): AuthConfig {
  const config = loadAuthConfig();
  if (!hasPat(config) && !hasCookie(config)) {
    error('Not authenticated. Run `figmanage login` first.');
    process.exit(1);
  }
  return config;
}

export function requirePat(): AuthConfig {
  const config = loadAuthConfig();
  if (!hasPat(config)) {
    error('This command requires a Personal Access Token. Run `figmanage login` first.');
    process.exit(1);
  }
  return config;
}

export function requireCookie(): AuthConfig {
  const config = loadAuthConfig();
  if (!hasCookie(config)) {
    error('This command requires cookie auth. Run `figmanage login` (not --pat-only).');
    process.exit(1);
  }
  return config;
}

export async function confirmAction(message: string): Promise<boolean> {
  if (executionOptions.yes || executionOptions.dryRun) return true;
  if (executionOptions.noInput || !process.stdin.isTTY) {
    throw new Error('Confirmation required. Review the action and pass --yes for noninteractive execution.');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.once('close', () => resolve(false));
    rl.question(`${message} [y/N] `, (answer) => {
      resolve(answer.trim().toLowerCase() === 'y');
      rl.close();
    });
  });
}
