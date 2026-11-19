// `pnpm ship`: builds the production image here and installs (or updates) Hangar on a server over
// SSH, without publishing anything. The image travels as a `docker save` stream over the SSH
// connection; the server pulls only the public Postgres and Traefik images.
//
// Settings (environment variables):
//   HANGAR_SHIP_HOST  SSH destination (default bduffaut@homeserver)
//   HANGAR_TAILSCALE=0  install without Tailscale (by default the installer puts Hangar on the
//                       server's Tailscale address, D40); then also:
//   HANGAR_BIND_IP    address Hangar listens on there
//   HANGAR_LAN_IP     address devices use to reach it (default: same as HANGAR_BIND_IP)
//   HANGAR_SHIP_RATE_MB  cap on the image copy, in MB/s (default 6; 0 for no cap). The server
//                        may be running other sites: an uncapped copy can fill its network link
//                        long enough for their Cloudflare tunnels to drop.
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { Transform } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'
import { createGzip } from 'node:zlib'

const host = process.env.HANGAR_SHIP_HOST ?? 'bduffaut@homeserver'
const tailscale = process.env.HANGAR_TAILSCALE !== '0'
const bindIp = process.env.HANGAR_BIND_IP
const lanIp = process.env.HANGAR_LAN_IP ?? bindIp
if (!tailscale && (!bindIp || !/^\d{1,3}(\.\d{1,3}){3}$/.test(bindIp))) {
  console.error(
    'Without Tailscale, set HANGAR_BIND_IP to the address Hangar should listen on, e.g. HANGAR_TAILSCALE=0 HANGAR_BIND_IP=192.168.1.50 pnpm ship',
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

// Build for the server's processor, not this machine's.
const machine = execFileSync('ssh', ['-o', 'BatchMode=yes', host, 'uname -m'], {
  encoding: 'utf8',
}).trim()
const platform = { x86_64: 'linux/amd64', aarch64: 'linux/arm64' }[machine]
if (!platform) {
  console.error(`The server reports processor "${machine}"; Hangar supports x86_64 and aarch64.`)
  process.exit(1)
}

console.log(`Building ${image} for ${platform}…`)
sh('docker', [
  'build',
  '-f',
  'docker/core.Dockerfile',
  '--target',
  'runtime',
  '--platform',
  platform,
  '--build-arg',
  `HANGAR_VERSION=${version}-${commit}`,
  '-t',
  image,
  '.',
])

/** Passes bytes through at no more than `bytesPerSecond`. */
function throttle(bytesPerSecond) {
  const started = Date.now()
  let sent = 0
  return new Transform({
    async transform(chunk, _encoding, done) {
      sent += chunk.length
      const due = (sent / bytesPerSecond) * 1000 - (Date.now() - started)
      if (due > 0) await sleep(due)
      done(null, chunk)
    },
  })
}

const rateMb = Number(process.env.HANGAR_SHIP_RATE_MB ?? 6)
console.log(
  `Copying ${image} to ${host}, compressed${rateMb > 0 ? `, at up to ${rateMb} MB/s` : ''}…`,
)
await new Promise((resolve, reject) => {
  const save = spawn('docker', ['save', image], { stdio: ['ignore', 'pipe', 'inherit'] })
  // docker load reads gzip directly.
  const load = spawn('ssh', ['-o', 'BatchMode=yes', host, 'sudo docker load'], {
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  let stream = save.stdout.pipe(createGzip({ level: 1 }))
  if (rateMb > 0) stream = stream.pipe(throttle(rateMb * 1024 * 1024))
  stream.pipe(load.stdin)
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
  `HANGAR_TAILSCALE=${tailscale ? 1 : 0}`,
  ...(tailscale ? [] : [`HANGAR_BIND_IP=${bindIp}`, `HANGAR_LAN_IP=${lanIp}`]),
  `HANGAR_VERSION=${version}-${commit}`,
  'HANGAR_ASSUME_YES=1',
  'bash',
  'hangar-installer/install.sh',
)
