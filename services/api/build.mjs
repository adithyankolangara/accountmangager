// Bundles the API for Render. Workspace code (@smartfin/shared) is inlined; npm dependencies stay
// external and are installed by `npm ci` on Render.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@smartfin/'));

await build({
  entryPoints: { index: 'src/index.ts', 'migrate-cli': 'src/db/migrate-cli.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external,
  logLevel: 'info',
});
