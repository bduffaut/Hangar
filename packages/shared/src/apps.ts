// Apps that run a published image (D42): the rules for image names, storage, and libraries, shared
// by the server (which enforces them) and the dashboard (which explains them as you type).

/** How an app is made: built from a GitHub repository, or a published image pulled as is. */
export const APP_KINDS = ['source', 'image'] as const
export type AppKind = (typeof APP_KINDS)[number]

/**
 * Rolling: start the new version, switch, then stop the old (no downtime). Recreate: stop the old
 * first, so two copies never write to the same storage. Apps with storage default to recreate.
 */
export const DEPLOY_STRATEGIES = ['rolling', 'recreate'] as const
export type DeployStrategy = (typeof DEPLOY_STRATEGIES)[number]

// Ports that are not web pages (D51): a game server, DNS, MQTT. Published on the computer's
// Tailscale address only, never on every network it is on.

export const PORT_PROTOCOLS = ['tcp', 'udp'] as const
export type PortProtocol = (typeof PORT_PROTOCOLS)[number]

export const MAX_APP_PORTS = 8

/**
 * Ports an app can never take on the computer: SSH, and Hangar's own web entrypoint and HTTPS.
 * 8401–8499 are kept for apps' private HTTPS (phase 3).
 */
export const RESERVED_HOST_PORTS = [22, 80, 443] as const
export const PRIVATE_HTTPS_PORTS = { from: 8401, to: 8499 } as const

export type HostPortProblem = 'invalid' | 'reserved'

export function checkHostPort(port: number): HostPortProblem | null {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 'invalid'
  if ((RESERVED_HOST_PORTS as readonly number[]).includes(port)) return 'reserved'
  if (port >= PRIVATE_HTTPS_PORTS.from && port <= PRIVATE_HTTPS_PORTS.to) return 'reserved'
  return null
}

export const hostPortProblemCopy: Record<HostPortProblem, string> = {
  invalid: 'A port is a whole number from 1 to 65535.',
  reserved: `Ports 22, 80, 443, and ${PRIVATE_HTTPS_PORTS.from}–${PRIVATE_HTTPS_PORTS.to} belong to the computer and Hangar itself.`,
}

/** How a port is written for people: `25565`, or `19132 (UDP)`. */
export function portLabel(port: { hostPort: number; protocol: PortProtocol }): string {
  return port.protocol === 'udp' ? `${port.hostPort} (UDP)` : String(port.hostPort)
}

/** A template file's path inside its kept folder: plain names, no `..`, no leading `/` (D53). */
export function isTemplateFilePath(path: string): boolean {
  return (
    /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/.test(path) &&
    !path.split('/').some((part) => part === '.' || part === '..')
  )
}

// USB devices (D55): a Zigbee or Z-Wave stick, by its stable name under /dev/serial/by-id, which
// stays the same when the stick moves to another socket (ttyUSB0 does not).

export const SERIAL_DEVICE_DIR = '/dev/serial/by-id'

export function isSerialDevicePath(path: string): boolean {
  return /^\/dev\/serial\/by-id\/[A-Za-z0-9._:+-]+$/.test(path) && !path.endsWith('/..')
}

/** `usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_1234-if00-port0` → `ITead Sonoff Zigbee 3.0 USB Dongle Plus`. */
export function serialDeviceName(path: string): string {
  const base = path.split('/').pop() ?? path
  return base
    .replace(/^usb-/, '')
    .replace(/-if\d+(-port\d+)?$/, '')
    .replace(/_[0-9a-fA-F]{8,}$/, '')
    .replaceAll('_', ' ')
}

export const MAX_APP_VOLUMES = 8
export const MAX_APP_LIBRARIES = 8
export const MAX_LIBRARIES = 32

// Image references

/**
 * `[registry[:port]/]path[:tag][@sha256:digest]`, as Docker accepts them, lowercase. A missing tag
 * means `latest`, which Hangar allows but shows as unpinned.
 */
const COMPONENT = '[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*'
const REGISTRY =
  '(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::\\d{1,5})?/)'
const IMAGE_PATTERN = new RegExp(
  `^${REGISTRY}?${COMPONENT}(?:/${COMPONENT})*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$`,
)

export function isValidImageRef(ref: string): boolean {
  return ref.length <= 255 && IMAGE_PATTERN.test(ref)
}

/** The tag of an image reference, or null when it has none (Docker then uses `latest`). */
export function imageTag(ref: string): string | null {
  const name = ref.split('@')[0]!
  const lastSlash = name.lastIndexOf('/')
  const colon = name.indexOf(':', lastSlash + 1)
  return colon === -1 ? null : name.slice(colon + 1)
}

/** The repository part of a reference, without version or digest: `ghcr.io/owner/app`. */
export function imageRepository(ref: string): string {
  const name = ref.split('@')[0]!
  const lastSlash = name.lastIndexOf('/')
  const colon = name.indexOf(':', lastSlash + 1)
  return colon === -1 ? name : name.slice(0, colon)
}

/** Whether a reference names a fixed version: a digest, or a tag other than latest. */
export function isPinnedImage(ref: string): boolean {
  if (ref.includes('@sha256:')) return true
  const tag = imageTag(ref)
  return tag !== null && tag !== 'latest'
}

/**
 * The newest release among `tags` in the same style as `current` (D47): the same `v` prefix and
 * the same number of parts, so `v3.4.2` only moves to tags like `v3.5.0` and `12.4` to `12.5`.
 * Anything else (`latest`, `nightly`, `3.5.0-rc1`, dates) is never offered. Null when `current`
 * is not a plain version or nothing newer exists.
 */
export function newerVersion(current: string, tags: string[]): string | null {
  const shape = /^(v?)(\d+(?:\.\d+){0,2})$/
  const parse = (tag: string) => {
    const match = shape.exec(tag)
    return match ? { prefix: match[1]!, parts: match[2]!.split('.').map(Number) } : null
  }
  const now = parse(current)
  if (!now) return null
  const compare = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!
    return 0
  }
  let best: { tag: string; parts: number[] } | null = null
  for (const tag of tags) {
    const v = parse(tag)
    if (!v || v.prefix !== now.prefix || v.parts.length !== now.parts.length) continue
    if (compare(v.parts, now.parts) <= 0) continue
    if (!best || compare(v.parts, best.parts) > 0) best = { tag, parts: v.parts }
  }
  return best?.tag ?? null
}

// Storage

/** A volume's short name, unique within its app: `config`, `data`. */
export const VOLUME_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/

const SAFE_PATH = /^\/[A-Za-z0-9._@+\- /]*$/

/** Where storage is mounted inside an app's container. */
export type MountPathProblem = 'invalid' | 'reserved'

export function checkMountPath(target: string): MountPathProblem | null {
  if (target === '/') return 'reserved'
  if (!SAFE_PATH.test(target) || target.length > 200) return 'invalid'
  const parts = target.split('/').slice(1)
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return 'invalid'
  if (['proc', 'sys', 'dev'].includes(parts[0]!) || target === '/') return 'reserved'
  return null
}

// Libraries: folders on the computer an admin shares with apps

/**
 * Folders that hold the system, other people's data, or Hangar itself. A library may not be one of
 * these, sit inside one, or contain one.
 */
const SYSTEM_FOLDERS = [
  '/bin',
  '/boot',
  '/dev',
  '/etc',
  '/lib',
  '/lib32',
  '/lib64',
  '/libx32',
  '/lost+found',
  '/opt/hangar',
  '/proc',
  '/root',
  '/run',
  '/sbin',
  '/snap',
  '/sys',
  '/tmp',
  '/usr',
  '/var/lib',
  '/var/log',
  '/var/run',
  '/var/cache',
  '/var/spool',
  '/var/tmp',
  '/var/mail',
  '/var/backups',
]

export type LibraryPathProblem = 'invalid' | 'hidden' | 'system' | 'too_broad'

/**
 * Checks a folder before it can become a library. It must be an absolute, plain path. It may not
 * be hidden or a system folder. A home folder itself is refused because it holds keys and
 * settings; a folder inside it (`/home/you/Videos`) is fine. The server also checks the real
 * folder on the computer: that it exists and that no part of the path is a link.
 */
export function checkLibraryPath(input: string): LibraryPathProblem | null {
  const folder = input.trim()
  if (folder === '/') return 'too_broad'
  if (!SAFE_PATH.test(folder) || folder.length > 400 || folder !== folder.trim()) return 'invalid'
  const parts = folder.split('/').slice(1)
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return 'invalid'
  if (parts.some((p) => p.startsWith('.'))) return 'hidden'
  if (folder === '/' || folder === '/home' || folder === '/var' || folder === '/opt') {
    return 'too_broad'
  }
  if (parts[0] === 'home' && parts.length < 3) return 'too_broad'
  const within = (inner: string, outer: string) => inner === outer || inner.startsWith(`${outer}/`)
  if (SYSTEM_FOLDERS.some((s) => within(folder, s) || within(s, folder))) return 'system'
  return null
}

export const libraryPathProblemCopy: Record<LibraryPathProblem, string> = {
  invalid:
    'Enter the full path of a folder, like /srv/media/movies, using letters, digits, spaces, and . _ - @ +.',
  hidden:
    'Hidden folders (starting with a dot) cannot be shared; they usually hold settings or keys.',
  system:
    'That is a system folder, or contains one. Share a folder that only holds your files, like /srv/media.',
  too_broad:
    'That folder is too broad to share. Pick the folder that holds the files, like /home/you/Videos.',
}

// The catalog (D42, D43): templates the server installs as written; see docs/ROADMAP.md

/**
 * A supporting container of a stack (D44): a database, a cache, a worker. It runs on the app's
 * own private network, reachable from the app at its `name`, and is never routed.
 */
export interface CatalogService {
  /** Also its address inside the stack, e.g. `database` or `redis`. */
  name: string
  /**
   * A pinned image. `{version}` stands for the app's own version (its image tag), for parts that
   * must match the app, like Immich's machine learning.
   */
  image: string
  memoryLimitMb: number
  /** Env vars. `${NAME}` is replaced by the app's env var of that name, such as a secret. */
  env: Record<string, string>
  volumes: { name: string; mountPath: string; purpose: string; backup: boolean }[]
  /** A shell command Docker runs to check it, when the image has no health check of its own. */
  healthCommand?: string
  /** Shared memory, for databases that need more than Docker's 64 MB. */
  shmSizeMb?: number
}

/**
 * Something the installer must answer before install, used nowhere else (D52). `accept`: a box
 * that must be ticked (a licence), which sets `env` to `value`.
 */
export interface CatalogQuestion {
  env: string
  kind: 'accept'
  label: string
  /** A sentence under the box, and a link to read first. */
  hint: string
  link?: string
  value: string
}

export interface CatalogApp {
  id: string
  name: string
  category:
    'media' | 'photos' | 'files' | 'home' | 'smart-home' | 'monitoring' | 'games' | 'developer'
  summary: string
  /** A paragraph for the install page: what it does and what you need. */
  description: string
  website: string
  image: string
  /** The app's web port; for an app without a web page (`web: false`), the port its check opens. */
  port: number
  /** The command to run instead of the image's own, for images that need one (`ntfy serve`). */
  command?: string[]
  /** False for apps that are not web pages (a game server): no address in the browser (D51). */
  web?: false
  /** Ports published on the computer's Tailscale address, at the same number (D51). */
  ports?: { port: number; protocol: PortProtocol; purpose: string }[]
  /** Required answers before install (D52). */
  questions?: CatalogQuestion[]
  /**
   * Files written into one of the app's kept folders before it starts, only when missing, so the
   * owner's own edits are never overwritten (D53): a config file the app cannot start well without.
   */
  files?: { volume: string; path: string; content: string }[]
  memoryLimitMb: number
  /** A longer download time limit than the default, for large apps (minutes). */
  buildTimeoutMinutes?: number
  volumes: { name: string; mountPath: string; purpose: string; backup: boolean }[]
  /** A library to ask for at install: the folder of files the app serves. */
  library?: { label: string; mountPath: string; hint: string; writable: boolean }
  /** Offer the graphics chip when the computer has one. */
  gpu?: { hint: string }
  /**
   * A USB stick the app needs (D55), picked by an admin at install and passed in at `mountPath`.
   */
  device?: { label: string; hint: string; mountPath: string }
  /**
   * Offer the computer's own network (admins), for apps that find devices by listening on the home
   * network (D54). The app then answers on every network the computer is on, at its port.
   */
  hostNetwork?: { hint: string }
  env: Record<string, string>
  /** Env vars generated at install, a long random value each, kept encrypted like any env var. */
  secrets?: string[]
  /** Supporting containers, started in this order before the app (D44). */
  services?: CatalogService[]
  /**
   * An env var Hangar fills with the app's public addresses (`https://name, ...`) when it starts,
   * for apps that refuse requests from addresses they were not told about (D48). A value the owner
   * set is kept and the addresses are added to it.
   */
  addressEnv?: string
  /**
   * Whoever opens it first becomes its admin (or it starts with a well-known password). Such an
   * app gets no public address at install: its owner finishes the setup first, then adds one.
   */
  firstVisitorIsAdmin: boolean
  /** What to do once it is live: shown on the app's page until dismissed. */
  firstSteps: string[]
  /**
   * `standard`: any account may install it. `elevated`: needs an admin, because it reads a library
   * or uses hardware. The server enforces this at install and at every deploy.
   */
  tier: 'standard' | 'elevated'
}

export const CATALOG: CatalogApp[] = [
  {
    id: 'jellyfin',
    name: 'Jellyfin',
    category: 'media',
    summary: 'Watch your movies and shows on any device, like your own Netflix.',
    description:
      'Jellyfin organizes the videos in a folder on this computer, with posters and descriptions, and streams them to phones, TVs, and browsers. It runs entirely here: no account with anyone else, and only your Tailscale devices can reach it unless you make it public.',
    website: 'https://jellyfin.org',
    image: 'jellyfin/jellyfin:12.4',
    port: 8096,
    memoryLimitMb: 2048,
    volumes: [
      {
        name: 'config',
        mountPath: '/config',
        purpose: 'Settings, users, and watch history',
        backup: true,
      },
      {
        name: 'cache',
        mountPath: '/cache',
        purpose: 'Thumbnails and converted video',
        backup: false,
      },
    ],
    library: {
      label: 'Movies and shows',
      mountPath: '/media',
      hint: 'The folder that holds your videos. Jellyfin only reads it.',
      writable: false,
    },
    gpu: { hint: 'Converts video with the graphics chip, so it plays smoothly on phones and TVs.' },
    env: {},
    firstVisitorIsAdmin: true,
    firstSteps: [
      'Open the app and follow its setup: pick a language and create your Jellyfin account.',
      'Add a library: choose "Movies" or "Shows" and the folder /media.',
      'Install the Jellyfin app on your phone or TV and sign in with this address.',
    ],
    tier: 'elevated',
  },
  {
    id: 'immich',
    name: 'Immich',
    category: 'photos',
    summary: 'Back up the photos and videos on your phone, like your own Google Photos.',
    description:
      'Immich backs up your phone’s camera roll automatically, then lets you browse it by date, place, and person, and search it by what is in the picture. It runs as four parts on this computer (the app, its database, a cache, and machine learning for faces and search), and Hangar keeps them together.',
    website: 'https://immich.app',
    image: 'ghcr.io/immich-app/immich-server:v3.4.2',
    port: 2283,
    memoryLimitMb: 2048,
    // Four images, several gigabytes in all on a first install.
    buildTimeoutMinutes: 45,
    volumes: [
      {
        name: 'library',
        mountPath: '/data',
        purpose: 'Your photos and videos',
        backup: true,
      },
    ],
    env: { DB_USERNAME: 'postgres', DB_DATABASE_NAME: 'immich' },
    secrets: ['DB_PASSWORD'],
    services: [
      {
        name: 'database',
        image:
          'ghcr.io/immich-app/postgres:14-vectorchord0.4.3-pgvectors0.2.0@sha256:bcf63357191b76a916ae5eb93464d65c07511da41e3bf7a8416db519b40b1c23',
        memoryLimitMb: 1024,
        env: {
          POSTGRES_PASSWORD: '${DB_PASSWORD}',
          POSTGRES_USER: 'postgres',
          POSTGRES_DB: 'immich',
          POSTGRES_INITDB_ARGS: '--data-checksums',
        },
        volumes: [
          {
            name: 'database',
            mountPath: '/var/lib/postgresql/data',
            purpose: 'Albums, people, and where each photo is',
            backup: true,
          },
        ],
        shmSizeMb: 128,
      },
      {
        name: 'redis',
        image:
          'valkey/valkey:9@sha256:418652cfb58ef879d4978c33553735d7147016032d5aefaa14c828e611eb9dfd',
        memoryLimitMb: 256,
        env: {},
        volumes: [],
        healthCommand: 'redis-cli ping | grep -q PONG',
      },
      {
        name: 'immich-machine-learning',
        image: 'ghcr.io/immich-app/immich-machine-learning:{version}',
        memoryLimitMb: 3072,
        env: { MACHINE_LEARNING_MODEL_REVISION: 'v2' },
        volumes: [
          {
            name: 'model-cache',
            mountPath: '/cache',
            purpose: 'Face and search models, downloaded once',
            backup: false,
          },
        ],
      },
    ],
    firstVisitorIsAdmin: true,
    firstSteps: [
      'Open the app and create the admin account.',
      'Install the Immich app on your phone, sign in with this address, and turn on backup.',
      'Faces and search start working after the first photos arrive: the models download once, which takes a few minutes.',
    ],
    tier: 'standard',
  },
  {
    id: 'paperless-ngx',
    name: 'Paperless-ngx',
    category: 'files',
    summary: 'Scan your paper documents once, then find any of them in seconds.',
    description:
      'Paperless-ngx reads every document you upload or scan (letters, bills, receipts, contracts), recognizes its text, and files it by date, sender, and type, so a search finds it later. It runs as three parts on this computer (the app, its database, and a queue for the reading work), and Hangar keeps them together.',
    website: 'https://docs.paperless-ngx.com',
    image: 'ghcr.io/paperless-ngx/paperless-ngx:3.5.1',
    port: 8000,
    memoryLimitMb: 2048,
    volumes: [
      {
        name: 'data',
        mountPath: '/usr/src/paperless/data',
        purpose: 'Search index, settings, and accounts',
        backup: true,
      },
      {
        name: 'media',
        mountPath: '/usr/src/paperless/media',
        purpose: 'Your documents, original and searchable copies',
        backup: true,
      },
    ],
    env: {
      PAPERLESS_DBENGINE: 'postgresql',
      PAPERLESS_DBHOST: 'database',
      PAPERLESS_DBUSER: 'paperless',
      PAPERLESS_DBNAME: 'paperless',
      PAPERLESS_REDIS: 'redis://redis:6379',
    },
    secrets: ['PAPERLESS_DBPASS', 'PAPERLESS_SECRET_KEY'],
    // Its sign-in form checks where requests come from; PAPERLESS_URL would also lock out the
    // private address, so only the trusted origins are set.
    addressEnv: 'PAPERLESS_CSRF_TRUSTED_ORIGINS',
    services: [
      {
        name: 'database',
        image:
          'postgres:18@sha256:f5cbc081c25690710f3fc6f4c61a7565382bae01ca0d0f2028a53d7926b85a20',
        memoryLimitMb: 512,
        env: {
          POSTGRES_PASSWORD: '${PAPERLESS_DBPASS}',
          POSTGRES_USER: 'paperless',
          POSTGRES_DB: 'paperless',
        },
        volumes: [
          {
            // Postgres 18 keeps its files in a folder per major version under this one.
            name: 'database',
            mountPath: '/var/lib/postgresql',
            purpose: 'Tags, correspondents, and where each document is',
            backup: true,
          },
        ],
        healthCommand: 'pg_isready -U paperless -d paperless',
      },
      {
        name: 'redis',
        image:
          'valkey/valkey:9@sha256:418652cfb58ef879d4978c33553735d7147016032d5aefaa14c828e611eb9dfd',
        memoryLimitMb: 256,
        env: {},
        volumes: [
          {
            name: 'queue',
            mountPath: '/data',
            purpose: 'Documents waiting to be read',
            backup: false,
          },
        ],
        healthCommand: 'valkey-cli ping | grep -q PONG',
      },
    ],
    firstVisitorIsAdmin: true,
    firstSteps: [
      'Open the app and create your account: the first one has full access.',
      'Upload a document by dragging it onto the page, or install a Paperless phone app to scan with your camera.',
    ],
    tier: 'standard',
  },
  {
    id: 'navidrome',
    name: 'Navidrome',
    category: 'media',
    summary: 'Stream your music collection to your phone, like your own Spotify.',
    description:
      'Navidrome reads the music in a folder on this computer and streams it to a web player and to dozens of phone apps (any app that speaks Subsonic). It is light enough for the smallest computer and handles very large collections.',
    website: 'https://www.navidrome.org',
    image: 'deluan/navidrome:0.64.2',
    port: 4533,
    memoryLimitMb: 512,
    volumes: [
      {
        name: 'data',
        mountPath: '/data',
        purpose: 'Accounts, playlists, and play counts',
        backup: true,
      },
    ],
    library: {
      label: 'Music',
      mountPath: '/music',
      hint: 'The folder that holds your music. Navidrome only reads it.',
      writable: false,
    },
    env: {},
    firstVisitorIsAdmin: true,
    firstSteps: [
      'Open the app and create the admin account.',
      'Navidrome finds the music in your library by itself; large collections take a few minutes.',
      'On your phone, install a Subsonic app (such as Substreamer or play:Sub) and sign in with this address.',
    ],
    tier: 'elevated',
  },
  {
    id: 'audiobookshelf',
    name: 'Audiobookshelf',
    category: 'media',
    summary: 'Listen to your audiobooks and podcasts anywhere, and pick up where you left off.',
    description:
      'Audiobookshelf organizes the audiobooks in a folder on this computer, remembers where each listener stopped, and has phone apps for listening on the go and offline. It can also follow podcasts and download new episodes.',
    website: 'https://www.audiobookshelf.org',
    image: 'ghcr.io/advplyr/audiobookshelf:2.38.0',
    port: 80,
    memoryLimitMb: 1024,
    volumes: [
      {
        name: 'config',
        mountPath: '/config',
        purpose: 'Accounts, progress, and settings',
        backup: true,
      },
      {
        name: 'metadata',
        mountPath: '/metadata',
        purpose: 'Covers, descriptions, and the app’s own backups',
        backup: false,
      },
    ],
    library: {
      label: 'Audiobooks',
      mountPath: '/audiobooks',
      hint: 'The folder that holds your audiobooks, one folder per book. Audiobookshelf only reads it.',
      writable: false,
    },
    env: {},
    firstVisitorIsAdmin: true,
    firstSteps: [
      'Open the app and create the root account.',
      'Add a library and choose the folder /audiobooks.',
      'Install the Audiobookshelf app on your phone and sign in with this address.',
    ],
    tier: 'elevated',
  },
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    category: 'monitoring',
    summary: 'Watch your websites and apps, and get told when one goes down.',
    description:
      'Uptime Kuma checks your sites, apps, and servers every minute and keeps a history of when each was up. It can alert you by email, Discord, Telegram, ntfy, and many others, and can show a public status page.',
    website: 'https://uptime.kuma.pet',
    image: 'louislam/uptime-kuma:2.5.12',
    port: 3001,
    memoryLimitMb: 512,
    volumes: [
      {
        name: 'data',
        mountPath: '/app/data',
        purpose: 'Monitors, history, and settings',
        backup: true,
      },
    ],
    env: {},
    firstVisitorIsAdmin: true,
    firstSteps: [
      'Open the app and choose SQLite as the database: it needs nothing else.',
      'Create your admin account.',
      'Add a monitor for each site or app you want to watch, and a notification to hear about it.',
    ],
    tier: 'standard',
  },
  {
    id: 'mealie',
    name: 'Mealie',
    category: 'home',
    summary: 'Keep your recipes in one place, plan meals, and build shopping lists.',
    description:
      'Mealie saves recipes from any website with one link, scales them, and turns a week of meals into a shopping list. Everyone in the household can have an account.',
    website: 'https://mealie.io',
    image: 'ghcr.io/mealie-recipes/mealie:v3.31.0',
    port: 9000,
    memoryLimitMb: 1024,
    volumes: [
      {
        name: 'data',
        mountPath: '/app/data',
        purpose: 'Recipes, photos, and accounts',
        backup: true,
      },
    ],
    env: { ALLOW_SIGNUP: 'false' },
    firstVisitorIsAdmin: true,
    firstSteps: [
      'Open the app and sign in with changeme@example.com and the password MyPassword.',
      'Follow its setup, then change that email and password under your profile right away.',
      'Add a recipe by pasting a link to any recipe page.',
    ],
    tier: 'standard',
  },
  {
    id: 'filebrowser',
    name: 'File Browser',
    category: 'files',
    summary: 'Upload, download, and share files from any browser.',
    description:
      'File Browser gives you a simple web page to keep files on this computer: upload from your phone, organize folders, and share a link to a file. Files are kept in storage that survives updates.',
    website: 'https://filebrowser.org',
    image: 'filebrowser/filebrowser:v2.63.23',
    port: 80,
    memoryLimitMb: 256,
    volumes: [
      { name: 'files', mountPath: '/srv', purpose: 'Your files', backup: true },
      { name: 'database', mountPath: '/database', purpose: 'Accounts and shares', backup: true },
      { name: 'config', mountPath: '/config', purpose: 'Settings', backup: true },
    ],
    env: {},
    firstVisitorIsAdmin: false,
    firstSteps: [
      'Open this app’s Logs in Hangar and find the password on the line that starts "User \'admin\' initialized".',
      'Sign in as admin with that password, then change it under Settings → Profile.',
      'Drag files onto the page to upload them.',
    ],
    tier: 'standard',
  },
  {
    // The first app that is not a web page (D51): players connect to its port over Tailscale.
    id: 'minecraft',
    name: 'Minecraft',
    category: 'games',
    summary: 'Your own Minecraft world, for friends and family to join from anywhere.',
    description:
      'A Minecraft: Java Edition server that runs all the time on this computer, so your world keeps going when you log off. Players join with the address Hangar shows, from any device with Tailscale: share this computer with friends in Tailscale and they can play too, with nothing open to the internet.',
    website: 'https://www.minecraft.net',
    image:
      'itzg/minecraft-server:2026.11.1-java25@sha256:0634ff76eee896c7e9760a35117d24fad394857d10bc8c1d9bc7f7ff7deef3c2',
    port: 25565,
    web: false,
    ports: [{ port: 25565, protocol: 'tcp', purpose: 'Players join here' }],
    questions: [
      {
        env: 'EULA',
        kind: 'accept',
        label: 'Accept the Minecraft EULA',
        hint: 'Mojang asks everyone who runs a server to accept its end user licence agreement.',
        link: 'https://www.minecraft.net/eula',
        value: 'TRUE',
      },
    ],
    memoryLimitMb: 3072,
    volumes: [
      {
        name: 'data',
        mountPath: '/data',
        purpose: 'The world, players, and server settings',
        backup: true,
      },
    ],
    // The game version is pinned like the image: a world opened by a newer version cannot go back.
    env: { TYPE: 'VANILLA', VERSION: '26.3', MEMORY: '2G', MOTD: 'A Hangar world' },
    firstVisitorIsAdmin: false,
    firstSteps: [
      'In Minecraft: Java Edition, open Multiplayer, then Add Server, and enter the address above.',
      'To play with friends, share this computer with them from the Tailscale admin console (Machines, then Share). They join with the same address.',
      'To be an operator, add an env var OPS with your Minecraft name under Environment, then press Deploy now.',
    ],
    tier: 'elevated',
  },
  {
    // Smart home (phase 3). Runs like every app, behind Hangar's proxy; its starting settings
    // trust that proxy, or it answers 400 to every visit (D53).
    id: 'home-assistant',
    name: 'Home Assistant',
    category: 'smart-home',
    summary: 'Your lights, sensors, and thermostat in one app, with automations that run at home.',
    description:
      'Home Assistant connects the smart devices in your home, from lights and plugs to thermostats and sensors, and runs automations on this computer instead of in someone else’s cloud. Its phone app gives you controls and notifications anywhere you have Tailscale.',
    website: 'https://www.home-assistant.io',
    image:
      'ghcr.io/home-assistant/home-assistant:2026.11.3@sha256:24e541ddae5818bf8eb27898b9ba00d0c344a655aa5097e9e9bd4b19356be847',
    port: 8123,
    hostNetwork: {
      hint: 'Find devices that announce themselves on your home network, like Chromecast, HomeKit, and DLNA. Home Assistant then also answers on port 8123 on every network this computer is on, including your home network.',
    },
    memoryLimitMb: 1536,
    volumes: [
      {
        name: 'config',
        mountPath: '/config',
        purpose: 'Settings, automations, and history',
        backup: true,
      },
    ],
    files: [
      {
        volume: 'config',
        path: 'configuration.yaml',
        content: [
          '# Written by Hangar when Home Assistant was installed. Edit it freely: Hangar never',
          '# writes it again while it exists.',
          'default_config:',
          '',
          'automation: !include automations.yaml',
          'script: !include scripts.yaml',
          'scene: !include scenes.yaml',
          '',
          'http:',
          "  # Every visit arrives through Hangar's proxy, on a private Docker network.",
          '  use_x_forwarded_for: true',
          '  trusted_proxies:',
          '    - 10.0.0.0/8',
          '    - 172.16.0.0/12',
          '    - 192.168.0.0/16',
          '',
        ].join('\n'),
      },
      { volume: 'config', path: 'automations.yaml', content: '[]\n' },
      { volume: 'config', path: 'scripts.yaml', content: '' },
      { volume: 'config', path: 'scenes.yaml', content: '' },
    ],
    env: {},
    firstVisitorIsAdmin: true,
    firstSteps: [
      'Open the app and create the owner account, then set your home’s location and time zone.',
      'Add your devices under Settings → Devices & services.',
      'Install the Home Assistant app on your phone and sign in with this address.',
    ],
    tier: 'standard',
  },
  {
    // A message broker for smart home apps. No web page and no port on the computer: other apps
    // of the same account reach it by name, mqtt://mosquitto:1883 (D50, D51).
    id: 'mosquitto',
    name: 'Mosquitto',
    category: 'smart-home',
    summary: 'The MQTT broker smart home apps and devices talk through.',
    description:
      'Mosquitto passes messages between smart home apps, like Home Assistant and Zigbee2MQTT. It has no web page: your other apps reach it by its name on port 1883, and nothing else can.',
    website: 'https://mosquitto.org',
    image:
      'eclipse-mosquitto:2.0.23@sha256:6a332cc7a8dbe011cbc076180cbb76b37c6f0f55809682ea08e7980ef0112ad9',
    port: 1883,
    web: false,
    memoryLimitMb: 128,
    volumes: [
      { name: 'config', mountPath: '/mosquitto/config', purpose: 'Settings', backup: true },
      { name: 'data', mountPath: '/mosquitto/data', purpose: 'Saved messages', backup: true },
    ],
    files: [
      {
        volume: 'config',
        path: 'mosquitto.conf',
        content: [
          '# Written by Hangar when Mosquitto was installed. Edit it freely: Hangar never writes',
          '# it again while it exists.',
          '# Only apps of the same Hangar account can reach this port.',
          'listener 1883',
          'allow_anonymous true',
          'persistence true',
          'persistence_location /mosquitto/data/',
          '',
        ].join('\n'),
      },
    ],
    env: {},
    firstVisitorIsAdmin: false,
    firstSteps: [
      'Your other apps reach it at mosquitto:1883 (its name, if you changed it). In Home Assistant, add the MQTT integration with that broker and port, and no user name.',
    ],
    tier: 'standard',
  },
  {
    // A Zigbee stick (D55) and Mosquitto by name (D50): Zigbee devices appear in Home Assistant.
    id: 'zigbee2mqtt',
    name: 'Zigbee2MQTT',
    category: 'smart-home',
    summary: 'Use Zigbee lights, sensors, and switches from any brand, with no hubs.',
    description:
      'Zigbee2MQTT talks to Zigbee devices (bulbs, buttons, door and motion sensors from IKEA, Aqara, Philips, and many more) through a USB stick plugged into this computer, and passes them to Home Assistant through Mosquitto. Install Mosquitto first, with the name mosquitto.',
    website: 'https://www.zigbee2mqtt.io',
    image:
      'koenkk/zigbee2mqtt:2.14.3@sha256:fb4a6b0f6868ad1cd6a9996479802b2420e599c3463b62bbff8c8cd9a908f43a',
    port: 8080,
    device: {
      label: 'Zigbee stick',
      hint: 'The USB stick that talks to your Zigbee devices, like a Sonoff Zigbee 3.0 Dongle or a SkyConnect.',
      mountPath: '/dev/zigbee',
    },
    memoryLimitMb: 512,
    volumes: [
      {
        name: 'data',
        mountPath: '/app/data',
        purpose: 'Settings, paired devices, and the Zigbee network key',
        backup: true,
      },
    ],
    files: [
      {
        volume: 'data',
        path: 'configuration.yaml',
        content: [
          '# Written by Hangar when Zigbee2MQTT was installed. Edit it freely: Hangar never writes',
          "# it again while it exists. Zigbee2MQTT replaces GENERATE with your network's own keys.",
          'version: 4',
          'homeassistant:',
          '  enabled: true',
          'mqtt:',
          '  server: mqtt://mosquitto:1883',
          'serial:',
          '  port: /dev/zigbee',
          'frontend:',
          '  enabled: true',
          '  port: 8080',
          'advanced:',
          '  network_key: GENERATE',
          '  pan_id: GENERATE',
          '  ext_pan_id: GENERATE',
          '',
        ].join('\n'),
      },
    ],
    env: {},
    // Its web page has no sign-in of its own.
    firstVisitorIsAdmin: true,
    firstSteps: [
      'Open the app: it shows the Zigbee network. Press Permit join, then pair each device as its manual says (often by holding its button).',
      'In Home Assistant, the devices appear by themselves through the MQTT integration.',
      'If it cannot reach the broker, install Mosquitto with the name mosquitto, or change mqtt.server in configuration.yaml.',
    ],
    tier: 'elevated',
  },
  {
    // DNS for the whole tailnet: port 53 on the Tailscale address (D51), its web page as usual.
    id: 'adguard-home',
    name: 'AdGuard Home',
    category: 'home',
    summary: 'Block ads and trackers on every device in your Tailscale network.',
    description:
      'AdGuard Home answers your devices’ DNS lookups and refuses the ones for ads, trackers, and malware, so pages load faster and cleaner on phones, laptops, and TVs, with nothing to install on them. Point your Tailscale network’s DNS at this computer and every device with Tailscale on uses it.',
    website: 'https://adguard.com/adguard-home/overview.html',
    image:
      'adguard/adguardhome:v1.0.0@sha256:f00a586f0d1caa74f149340bfb225014960310488ffa838406b89256900a96c2',
    // Its setup page, and its web page afterwards if it is kept on this port during setup.
    port: 3000,
    ports: [
      { port: 53, protocol: 'tcp', purpose: 'DNS' },
      { port: 53, protocol: 'udp', purpose: 'DNS' },
    ],
    memoryLimitMb: 256,
    volumes: [
      {
        name: 'conf',
        mountPath: '/opt/adguardhome/conf',
        purpose: 'Settings and accounts',
        backup: true,
      },
      {
        name: 'work',
        mountPath: '/opt/adguardhome/work',
        purpose: 'Block lists, query log, and statistics',
        backup: false,
      },
    ],
    env: {},
    firstVisitorIsAdmin: true,
    firstSteps: [
      'Open the app and follow its setup. Under Admin Web Interface, set the port to 3000 (not 80), so this address keeps working. Keep DNS on port 53.',
      'In the Tailscale admin console, open DNS, add a nameserver with this computer’s Tailscale address, and turn on Override DNS servers.',
      'Browse on any device with Tailscale on: the app’s Query Log shows each lookup, and blocked ones in red.',
    ],
    tier: 'elevated',
  },
  {
    // Phase 2's leftovers: none needs more than storage and a port.
    id: 'ntfy',
    name: 'ntfy',
    category: 'monitoring',
    summary: 'Send notifications to your phone from scripts, apps, and other servers.',
    description:
      'ntfy delivers push notifications to your phone and computer: anything that can send a web request (a script, a backup job, Uptime Kuma, Home Assistant) can notify you, by posting a message to a topic you subscribe to in the ntfy app.',
    website: 'https://ntfy.sh',
    image:
      'binwiederhier/ntfy:v2.38.2@sha256:ca35419d29a834824db2440fa9320897fbe40b026c5fc2360c76ed3501b5e716',
    command: ['serve'],
    port: 80,
    memoryLimitMb: 256,
    volumes: [
      {
        name: 'cache',
        mountPath: '/var/cache/ntfy',
        purpose: 'Messages not yet delivered',
        backup: false,
      },
    ],
    env: {
      NTFY_CACHE_FILE: '/var/cache/ntfy/cache.db',
      NTFY_BEHIND_PROXY: 'true',
    },
    firstVisitorIsAdmin: false,
    firstSteps: [
      'Install the ntfy app on your phone, add this address as your server (Settings, Default server), and subscribe to a topic with a hard-to-guess name.',
      'Send a test from any computer with Tailscale: curl -d "Hello" <this address>/<your topic>.',
      'Anyone who can reach it can use any topic, so keep it private, or set up its access control before giving it a public address.',
    ],
    tier: 'standard',
  },
  {
    id: 'actual',
    name: 'Actual Budget',
    category: 'home',
    summary: 'A budget for your household, by envelope, kept on your own computer.',
    description:
      'Actual Budget is a fast budgeting app built on envelope budgeting: give every dollar a job, import your bank’s files, and see where the money went. It syncs between your devices through this computer.',
    website: 'https://actualbudget.org',
    image:
      'actualbudget/actual-server:26.11.0@sha256:06cf186569cf58d93e12659ff1a517b65b5b0ebee7050a3991d4bd8a1d398da6',
    port: 5006,
    memoryLimitMb: 512,
    volumes: [
      {
        name: 'data',
        mountPath: '/data',
        purpose: 'Budgets and the server password',
        backup: true,
      },
    ],
    env: {},
    firstVisitorIsAdmin: true,
    firstSteps: [
      'Open the app and set the server password: anyone who knows it can open your budgets.',
      'Create a budget, or import one from YNAB or a file from your bank.',
    ],
    tier: 'standard',
  },
  {
    id: 'forgejo',
    name: 'Forgejo',
    category: 'developer',
    summary: 'Your own Git server, with issues and pull requests, like a private GitHub.',
    description:
      'Forgejo hosts Git repositories with a web page for code, issues, pull requests, and releases. Keep private projects at home, or mirror your GitHub repositories as a backup. Clone over HTTP with its address.',
    website: 'https://forgejo.org',
    image:
      'codeberg.org/forgejo/forgejo:17.0.2@sha256:879f4f10a98e3e167b32cde5f7ae3af0163d50bfacf567559a27a0e95a95670c',
    port: 3000,
    memoryLimitMb: 768,
    volumes: [
      {
        name: 'data',
        mountPath: '/data',
        purpose: 'Repositories, accounts, and settings',
        backup: true,
      },
    ],
    // Clones go over HTTP: its SSH port is not published.
    env: { FORGEJO__server__DISABLE_SSH: 'true' },
    firstVisitorIsAdmin: true,
    firstSteps: [
      'Open the app: its setup page is filled in. Under Server and third-party service settings, set the Server domain and Base URL to this address, then create the administrator account at the bottom.',
      'Create a repository, or use New migration to mirror one from GitHub.',
    ],
    tier: 'standard',
  },
  {
    id: 'kavita',
    name: 'Kavita',
    category: 'media',
    summary: 'Read your books, comics, and manga from any browser.',
    description:
      'Kavita organizes the ebooks, comics, and manga in a folder on this computer and lets you read them in any browser, keeping your place across devices. It also serves OPDS for reading apps.',
    website: 'https://www.kavitareader.com',
    image:
      'jvmilazz0/kavita:0.9.1@sha256:31181a32f0dda73cae68721867028a7253d57881b58bea5754cd9e578e75421a',
    port: 5000,
    memoryLimitMb: 768,
    volumes: [
      {
        name: 'config',
        mountPath: '/kavita/config',
        purpose: 'Accounts, progress, and covers',
        backup: true,
      },
    ],
    library: {
      label: 'Books',
      mountPath: '/books',
      hint: 'The folder that holds your books, comics, or manga. Kavita only reads it.',
      writable: false,
    },
    env: {},
    firstVisitorIsAdmin: true,
    firstSteps: [
      'Open the app and create the admin account.',
      'Add a library and choose the folder /books.',
    ],
    tier: 'elevated',
  },
]

/** The image a service runs for an app at `appImage`: `{version}` becomes the app's tag. */
export function serviceImage(service: CatalogService, appImage: string): string {
  return service.image.replaceAll('{version}', imageTag(appImage) ?? 'latest')
}

/** The env var value for a template's `addressEnv` (D48): the owner's own origins, then each address. */
export function addressEnvValue(own: string | undefined, hostnames: string[]): string {
  const origins = [
    ...(own ?? '').split(',').map((o) => o.trim()),
    ...hostnames.map((h) => `https://${h}`),
  ].filter(Boolean)
  return [...new Set(origins)].join(',')
}

/** Fills `${NAME}` in a service's env from the app's env vars; unknown names become empty. */
export function serviceEnv(
  service: CatalogService,
  appEnv: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(service.env).map(([key, value]) => [
      key,
      value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => appEnv[name] ?? ''),
    ]),
  )
}

export function catalogApp(id: string): CatalogApp | null {
  return CATALOG.find((app) => app.id === id) ?? null
}

/**
 * Whether an app may run without an admin (D43): it came from a standard template and still runs
 * that template's own image, at any version. Anything else from a published image needs an admin.
 */
export function isMemberCatalogApp(catalogId: string | null, image: string | null): boolean {
  const template = catalogId ? catalogApp(catalogId) : null
  if (!template || template.tier !== 'standard' || !image) return false
  return isValidImageRef(image) && imageRepository(image) === imageRepository(template.image)
}
