import { chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
rmSync(new URL('dist/', root), { recursive: true, force: true });
const result = spawnSync(process.execPath, [fileURLToPath(new URL('node_modules/typescript/bin/tsc', root))], {
  cwd: fileURLToPath(root), stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
if (result.status === 0) chmodSync(new URL('dist/index.js', root), 0o755);
