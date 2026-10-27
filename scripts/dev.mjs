// `pnpm dev`: starts the dev stack (Postgres, Traefik, hangar-core with watch) and the Vite dev server.
import { spawn, spawnSync } from 'node:child_process'

const network = spawnSync('docker', ['network', 'inspect', 'hangar'], { stdio: 'ignore' })
if (network.error) {
  console.error('Docker is not available. Start Docker Desktop and try again.')
  process.exit(1)
}
if (network.status !== 0) {
  const created = spawnSync('docker', ['network', 'create', 'hangar'], { stdio: 'inherit' })
  if (created.status !== 0) process.exit(1)
}

const children = [
  spawn(
    'docker',
    ['compose', '-f', 'docker/compose.dev.yml', 'up', '--build', '--remove-orphans'],
    {
      stdio: 'inherit',
    },
  ),
  spawn('pnpm', ['--filter', '@hangar/web', 'dev'], { stdio: 'inherit' }),
]

let stopping = false
const stop = () => {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGINT')
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const child of children) child.on('exit', stop)
