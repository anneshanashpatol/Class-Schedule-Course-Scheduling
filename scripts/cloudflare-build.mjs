import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateProductionConfig } from './cloudflare-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const configPath = await generateProductionConfig();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CLOUDFLARE_WRANGLER_CONFIG: configPath },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
