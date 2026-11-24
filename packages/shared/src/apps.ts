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

export interface CatalogApp {
  id: string
  name: string
  category: 'media' | 'photos' | 'files' | 'home' | 'smart-home' | 'monitoring' | 'developer'
  summary: string
  /** A paragraph for the install page: what it does and what you need. */
  description: string
  website: string
  image: string
  port: number
  memoryLimitMb: number
  /** A longer download time limit than the default, for large apps (minutes). */
  buildTimeoutMinutes?: number
  volumes: { name: string; mountPath: string; purpose: string; backup: boolean }[]
  /** A library to ask for at install: the folder of files the app serves. */
  library?: { label: string; mountPath: string; hint: string; writable: boolean }
  /** Offer the graphics chip when the computer has one. */
  gpu?: { hint: string }
  env: Record<string, string>
  /** Env vars generated at install, a long random value each, kept encrypted like any env var. */
  secrets?: string[]
  /** Supporting containers, started in this order before the app (D44). */
  services?: CatalogService[]
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
      'Before giving it a public address, add the env var PAPERLESS_CSRF_TRUSTED_ORIGINS with that address (like https://docs.example.com) under Settings, then Update, or sign-ins from it are refused.',
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
]

/** The image a service runs for an app at `appImage`: `{version}` becomes the app's tag. */
export function serviceImage(service: CatalogService, appImage: string): string {
  return service.image.replaceAll('{version}', imageTag(appImage) ?? 'latest')
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
