import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ctx } from '../../context.ts'
import type { Project } from './repo.ts'

// The registry, stubbed: what it answers, and who asked.
let answer: () => Promise<string[]> = async () => []
const asked: string[] = []
vi.mock('../../platform/registry.ts', () => ({
  listTags: (repository: string) => {
    asked.push(repository)
    return answer()
  },
}))
const { appVersion } = await import('./versions.ts')

const ctx = { log: { info: () => {} } } as unknown as Ctx
const app = (image: string | null, kind: 'image' | 'source' = 'image') =>
  ({ kind, image }) as Project

describe('newer versions of an image app (D47)', () => {
  beforeEach(() => {
    asked.length = 0
  })

  it('offers the newest tag in the same style, asking the registry once per repository', async () => {
    answer = async () => ['v1.0.0', 'v1.2.0', 'latest', 'v2.0.0-rc1']
    const a = await appVersion(ctx, app('example.io/one/app:v1.0.0'))
    const b = await appVersion(ctx, app('example.io/one/app:v1.2.0'))
    expect([a.current, a.newest]).toEqual(['v1.0.0', 'v1.2.0'])
    expect([b.current, b.newest]).toEqual(['v1.2.0', null])
    expect(a.checkedAt).not.toBeNull()
    expect(asked).toEqual(['example.io/one/app'])
  })

  it('says nothing for projects, digests, and registries that cannot be read', async () => {
    const nothing = { newest: null, checkedAt: null }
    expect(await appVersion(ctx, app(null, 'source'))).toEqual({ current: null, ...nothing })
    expect(await appVersion(ctx, app('example.io/two/app:1.0@sha256:abc'))).toEqual({
      current: '1.0',
      ...nothing,
    })
    answer = async () => {
      throw new Error('down')
    }
    expect(await appVersion(ctx, app('example.io/three/app:1.0'))).toEqual({
      current: '1.0',
      ...nothing,
    })
    expect(asked).toEqual(['example.io/three/app'])
  })
})
