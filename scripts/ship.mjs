// `pnpm ship`: builds the production image here and installs (or updates) Hangar on a server over
// SSH, without publishing anything. The image travels as a `docker save` stream over the SSH
// connection; the server pulls only the public Postgres and Traefik images.
//
// Settings (environment variables):
//   HANGAR_SHIP_HOST  SSH destination (default bduffaut@homeserver)
//   HANGAR_BIND_IP    address Hangar listens on there (required, e.g. the Tailscale IP)
//   HANGAR_LAN_IP     address devices use to reach it (default: same as HANGAR_BIND_IP)
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const host = process.env.HANGAR_SHIP_HOST ?? 'bduffaut@homeserver'
const bindIp = process.env.HANGAR_BIND_IP
const lanIp = process.env.HANGAR_LAN_IP ?? bindIp
if (!bindIp || !/^\d{1,3}(\.\d{1,3}){3}$/.test(bindIp)) {
  console.error(
    'Set HANGAR_BIND_IP to the address Hangar should listen on, e.g. HANGAR_BIND_IP=100.113.190.111 pnpm ship',
  )
  process.exit(1)
}

const version = JSON.parse(readFileSync('package.json', 'utf8')).version ?? '0.1.0'
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
const image = `hangar-core:${version}-${commit}`
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })

/** Runs a command on the server. Arguments are passed as one quoted string (ssh joins them). */
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`
const remote = (...args) => sh('ssh', ['-o', 'BatchMode=yes', host, args.map(quote).join(' ')])

console.log(`Building ${image}…`)
sh('docker', [
  'build',
  '-f',
  'docker/core.Dockerfile',
  '--target',
  'runtime',
  '--platform',
  'linux/amd64',
  '--build-arg',
  `HANGAR_VERSION=${version}-${commit}`,
  '-t',
  image,
  '.',
])

console.log(`Copying ${image} to ${host}…`)
await new Promise((resolve, reject) => {
  const save = spawn('docker', ['save', image], { stdio: ['ignore', 'pipe', 'inherit'] })
  const load = spawn('ssh', ['-o', 'BatchMode=yes', host, 'sudo docker load'], {
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  save.stdout.pipe(load.stdin)
  load.on('exit', (code) =>
    code === 0 ? resolve() : reject(new Error(`docker load exited with ${code}`)),
  )
  save.on('exit', (code) => code !== 0 && reject(new Error(`docker save exited with ${code}`)))
})

console.log('Copying the installer…')
const tar = spawn('tar', ['-C', 'installer', '-czf', '-', '.'], {
  stdio: ['ignore', 'pipe', 'inherit'],
})
await new Promise((resolve, reject) => {
  const untar = spawn(
    'ssh',
    [
      '-o',
      'BatchMode=yes',
      host,
      'rm -rf ~/hangar-installer && mkdir -p ~/hangar-installer && tar -C ~/hangar-installer -xzf -',
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  )
  tar.stdout.pipe(untar.stdin)
  untar.on('exit', (code) =>
    code === 0 ? resolve() : reject(new Error(`copying the installer failed (${code})`)),
  )
})

console.log('Installing…')
remote(
  'sudo',
  'env',
  `HANGAR_IMAGE=${image}`,
  'HANGAR_SKIP_PULL=1',
  `HANGAR_BIND_IP=${bindIp}`,
  `HANGAR_LAN_IP=${lanIp}`,
  `HANGAR_VERSION=${version}-${commit}`,
  'HANGAR_ASSUME_YES=1',
  'bash',
  'hangar-installer/install.sh',
)
