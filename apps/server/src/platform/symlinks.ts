import { readdir, readlink, realpath } from 'node:fs/promises'
import path from 'node:path'

const isInside = (root: string, target: string) =>
  target === root || target.startsWith(root + path.sep)

/**
 * Returns the first symlink under `dir` that resolves outside `root`, or null. Pass the whole
 * checkout as `dir`: a link inside the build context may lead to another link elsewhere. Build tools read
 * repository files with ordinary, symlink-following reads (Railpack copies some, like a Caddyfile,
 * into the image), so a link such as `Caddyfile -> /proc/1/environ` would hand them Hangar's own
 * secrets. Links that stay inside the repository are fine. Dangling links are judged by where they
 * point.
 */
export async function findEscapingSymlink(dir: string, root: string): Promise<string | null> {
  const realRoot = await realpath(root)
  const pending = [dir]
  while (pending.length > 0) {
    const current = pending.pop()!
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '.git') pending.push(full)
        continue
      }
      if (!entry.isSymbolicLink()) continue
      const resolved = await realpath(full).catch(async () =>
        // Dangling: resolve the link text lexically against the real directory it lives in.
        path.resolve(await realpath(current), await readlink(full)),
      )
      if (!isInside(realRoot, resolved)) return path.relative(root, full)
    }
  }
  return null
}
