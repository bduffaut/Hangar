// Bundles the server and the hangar-admin CLI into dist/ for the production image. Workspace
// packages (@hangar/shared, TypeScript source) are bundled in; everything installed from npm stays
// external and is loaded from node_modules at runtime (some, like argon2, are native).
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@hangar/'))

await build({
  entryPoints: { main: 'src/main.ts', cli: 'src/cli.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  external: [...external, ...external.map((name) => `${name}/*`)],
  logLevel: 'info',
})
