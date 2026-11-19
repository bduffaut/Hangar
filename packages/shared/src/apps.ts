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

// The catalog (phase 1: one template; see docs/ROADMAP.md)

export interface CatalogApp {
  id: string
  name: string
  category: 'media' | 'photos' | 'files' | 'smart-home' | 'monitoring' | 'developer'
  summary: string
  /** A paragraph for the install page: what it does and what you need. */
  description: string
  website: string
  image: string
  port: number
  memoryLimitMb: number
  volumes: { name: string; mountPath: string; purpose: string; backup: boolean }[]
  /** A library to ask for at install: the folder of files the app serves. */
  library?: { label: string; mountPath: string; hint: string; writable: boolean }
  /** Offer the graphics chip when the computer has one. */
  gpu?: { hint: string }
  env: Record<string, string>
  /** What to do once it is live: shown on the app's page until dismissed. */
  firstSteps: string[]
  /** `elevated`: needs an admin (it reads a library or uses hardware). */
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
    firstSteps: [
      'Open the app and follow its setup: pick a language and create your Jellyfin account.',
      'Add a library: choose "Movies" or "Shows" and the folder /media.',
      'Install the Jellyfin app on your phone or TV and sign in with this address.',
    ],
    tier: 'elevated',
  },
]

export function catalogApp(id: string): CatalogApp | null {
  return CATALOG.find((app) => app.id === id) ?? null
}
