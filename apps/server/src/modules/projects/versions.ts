import { imageRepository, imageTag, newerVersion } from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { listTags } from '../../platform/registry.ts'
import type { Project } from './repo.ts'

// Update checks for image apps (D47): the newest version of an app's image in the same tag style,
// from the registry's public tag list. Asked when someone opens the app, cached per repository, so
// a registry hears from Hangar at most every 12 hours per image.

const CACHE_MS = 12 * 60 * 60_000
/** A registry that could not be read is asked again sooner. */
const FAILED_CACHE_MS = 60 * 60_000

interface Entry {
  tags: string[] | null
  at: number
}
const cache = new Map<string, Entry>()
const pending = new Map<string, Promise<Entry>>()

async function tagsOf(ctx: Ctx, repository: string): Promise<Entry> {
  const hit = cache.get(repository)
  if (hit && Date.now() - hit.at < (hit.tags ? CACHE_MS : FAILED_CACHE_MS)) return hit
  const inFlight = pending.get(repository)
  if (inFlight) return inFlight
  const lookup = listTags(repository)
    .then((tags): Entry => ({ tags, at: Date.now() }))
    .catch((error: unknown): Entry => {
      ctx.log.info({ err: error, repository }, 'Could not read the tags of an image')
      return { tags: null, at: Date.now() }
    })
    .then((entry) => {
      cache.set(repository, entry)
      pending.delete(repository)
      return entry
    })
  pending.set(repository, lookup)
  return lookup
}

export interface AppVersion {
  current: string | null
  newest: string | null
  checkedAt: string | null
}

/** The app's version and a newer one, if its registry lists one. Projects built from code: none. */
export async function appVersion(ctx: Ctx, project: Project): Promise<AppVersion> {
  const current = project.kind === 'image' && project.image ? imageTag(project.image) : null
  // A digest pins one exact build; there is no "newer" to offer for it.
  if (!current || project.image!.includes('@')) return { current, newest: null, checkedAt: null }
  const entry = await tagsOf(ctx, imageRepository(project.image!))
  return {
    current,
    newest: entry.tags ? newerVersion(current, entry.tags) : null,
    checkedAt: entry.tags ? new Date(entry.at).toISOString() : null,
  }
}
