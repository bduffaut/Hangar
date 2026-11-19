import { describe, expect, it } from 'vitest'
import { checkProjectName } from './hostnames.ts'
import {
  CATALOG,
  checkLibraryPath,
  checkMountPath,
  imageRepository,
  imageTag,
  isMemberCatalogApp,
  serviceEnv,
  serviceImage,
  isPinnedImage,
  isValidImageRef,
  VOLUME_NAME_PATTERN,
} from './apps.ts'

describe('image references', () => {
  it.each([
    'jellyfin/jellyfin:12.4',
    'nginx',
    'nginx:1.29-alpine',
    'ghcr.io/home-assistant/home-assistant:stable',
    'localhost:5000/team/app:v1',
    'registry.example.com:8443/a/b/c:1.0',
    `traefik@sha256:${'a'.repeat(64)}`,
    `library/redis:8@sha256:${'b'.repeat(64)}`,
  ])('accepts %s', (ref) => expect(isValidImageRef(ref)).toBe(true))

  it.each([
    '',
    'Jellyfin/Jellyfin',
    'jellyfin/jellyfin:',
    'a b',
    '-nginx',
    'nginx:latest; rm -rf /',
    '--help',
    'nginx@sha256:short',
    `x/${'a'.repeat(260)}`,
    'https://hub.docker.com/r/jellyfin/jellyfin',
  ])('refuses %j', (ref) => expect(isValidImageRef(ref)).toBe(false))

  it('finds the tag, ignoring a registry port', () => {
    expect(imageTag('jellyfin/jellyfin:12.4')).toBe('12.4')
    expect(imageTag('localhost:5000/app')).toBeNull()
    expect(imageTag('localhost:5000/app:2')).toBe('2')
    expect(isPinnedImage('nginx')).toBe(false)
    expect(isPinnedImage('nginx:latest')).toBe(false)
    expect(isPinnedImage('nginx:1.29')).toBe(true)
    expect(isPinnedImage(`nginx@sha256:${'c'.repeat(64)}`)).toBe(true)
  })
})

describe('library folders', () => {
  it.each([
    '/srv/media',
    '/srv/media/movies',
    '/mnt/usb-drive/Photos',
    '/media/ben/Disk 1',
    '/home/ben/Videos',
    '/data',
    '/opt/media',
  ])('accepts %s', (path) => expect(checkLibraryPath(path)).toBeNull())

  it.each([
    ['relative/path', 'invalid'],
    ['/srv/../etc', 'invalid'],
    ['/srv//media', 'invalid'],
    ['/srv/./media', 'invalid'],
    ['/srv/media$(id)', 'invalid'],
    ['/srv/me\ndia', 'invalid'],
    ['/srv/media*', 'invalid'],
    ['/home/ben/.ssh', 'hidden'],
    ['/srv/.secrets/x', 'hidden'],
    ['/', 'too_broad'],
    ['/home', 'too_broad'],
    ['/home/ben', 'too_broad'],
    ['/var', 'too_broad'],
    ['/opt', 'too_broad'],
    ['/etc', 'system'],
    ['/etc/ssl', 'system'],
    ['/root/movies', 'system'],
    ['/var/lib/docker/volumes', 'system'],
    ['/var/run', 'system'],
    ['/run/docker.sock', 'system'],
    ['/opt/hangar', 'system'],
    ['/opt/hangar/backups', 'system'],
    ['/usr/share', 'system'],
    ['/proc/1', 'system'],
    ['/dev', 'system'],
  ])('refuses %j as %s', (path, problem) => expect(checkLibraryPath(path)).toBe(problem))
})

describe('mount paths inside an app', () => {
  it('accepts plain absolute folders', () => {
    expect(checkMountPath('/data')).toBeNull()
    expect(checkMountPath('/var/lib/app')).toBeNull()
  })
  it('refuses the root, system folders, and odd paths', () => {
    expect(checkMountPath('/')).toBe('reserved')
    expect(checkMountPath('/proc/x')).toBe('reserved')
    expect(checkMountPath('/dev')).toBe('reserved')
    expect(checkMountPath('data')).toBe('invalid')
    expect(checkMountPath('/data/../etc')).toBe('invalid')
    expect(checkMountPath('/data:ro')).toBe('invalid')
  })
})

describe('the catalog', () => {
  it('has valid, pinned, consistent templates', () => {
    const ids = new Set<string>()
    for (const app of CATALOG) {
      expect(ids.has(app.id)).toBe(false)
      ids.add(app.id)
      expect(isValidImageRef(app.image)).toBe(true)
      expect(isPinnedImage(app.image)).toBe(true)
      const targets = [...app.volumes.map((v) => v.mountPath), app.library?.mountPath].filter(
        (t): t is string => Boolean(t),
      )
      expect(new Set(targets).size).toBe(targets.length)
      for (const target of targets) expect(checkMountPath(target)).toBeNull()
      for (const volume of app.volumes) expect(VOLUME_NAME_PATTERN.test(volume.name)).toBe(true)
      // Anything reading the computer's folders or hardware needs an admin.
      if (app.library || app.gpu) expect(app.tier).toBe('elevated')
      expect(checkProjectName(app.id)).toBeNull()
      expect(app.port).toBeGreaterThan(0)
      expect(app.firstSteps.length).toBeGreaterThan(0)
    }
  })
  it('has consistent stacks (D44)', () => {
    for (const app of CATALOG) {
      const names = new Set(app.volumes.map((v) => v.name))
      const known = new Set([...Object.keys(app.env), ...(app.secrets ?? [])])
      const services = new Set<string>()
      for (const service of app.services ?? []) {
        // Its name is its address on the stack network.
        expect(VOLUME_NAME_PATTERN.test(service.name)).toBe(true)
        expect(services.has(service.name)).toBe(false)
        services.add(service.name)
        const image = serviceImage(service, app.image)
        expect([service.name, isValidImageRef(image)]).toEqual([service.name, true])
        expect([service.name, isPinnedImage(image)]).toEqual([service.name, true])
        expect(service.memoryLimitMb).toBeGreaterThan(0)
        for (const volume of service.volumes) {
          // Kept folders share one namespace per app (they become hangar-data-<app>-<name>).
          expect(names.has(volume.name)).toBe(false)
          names.add(volume.name)
          expect(VOLUME_NAME_PATTERN.test(volume.name)).toBe(true)
          expect(checkMountPath(volume.mountPath)).toBeNull()
        }
        // Every ${NAME} refers to the app's env or a generated secret.
        for (const value of Object.values(service.env)) {
          for (const [, name] of value.matchAll(/\$\{([A-Z0-9_]+)\}/g)) {
            expect([service.name, name, known.has(name!)]).toEqual([service.name, name, true])
          }
        }
      }
    }
  })
  it('offers members at least one app', () => {
    expect(CATALOG.some((app) => app.tier === 'standard')).toBe(true)
  })
})

describe('stack services', () => {
  const service = {
    name: 'ml',
    image: 'ghcr.io/x/ml:{version}',
    memoryLimitMb: 1,
    env: { PASSWORD: '${DB_PASSWORD}', PLAIN: 'v', BOTH: 'a-${A}-${MISSING}' },
    volumes: [],
  }
  it('follows the app version where asked', () => {
    expect(serviceImage(service, 'ghcr.io/x/server:v3.4.2')).toBe('ghcr.io/x/ml:v3.4.2')
    expect(serviceImage({ ...service, image: 'valkey/valkey:9' }, 'x/y:1')).toBe('valkey/valkey:9')
  })
  it('fills env from the app, and nothing else', () => {
    expect(serviceEnv(service, { DB_PASSWORD: 'secret', A: '1', OTHER: 'x' })).toEqual({
      PASSWORD: 'secret',
      PLAIN: 'v',
      BOTH: 'a-1-',
    })
  })
})

describe('image repositories', () => {
  it.each([
    ['jellyfin/jellyfin:12.4', 'jellyfin/jellyfin'],
    ['nginx', 'nginx'],
    ['localhost:5000/team/app:1.2', 'localhost:5000/team/app'],
    ['ghcr.io/owner/app@sha256:' + 'a'.repeat(64), 'ghcr.io/owner/app'],
    ['ghcr.io/owner/app:1.2@sha256:' + 'a'.repeat(64), 'ghcr.io/owner/app'],
  ])('%s → %s', (ref, repo) => expect(imageRepository(ref)).toBe(repo))
})

describe('what members may run (D43)', () => {
  const standard = CATALOG.find((app) => app.tier === 'standard')!
  const elevated = CATALOG.find((app) => app.tier === 'elevated')!
  const repo = imageRepository(standard.image)
  it('allows a standard template at any version of its own image', () => {
    expect(isMemberCatalogApp(standard.id, standard.image)).toBe(true)
    expect(isMemberCatalogApp(standard.id, `${repo}:9.9.9`)).toBe(true)
    expect(isMemberCatalogApp(standard.id, `${repo}@sha256:${'b'.repeat(64)}`)).toBe(true)
  })
  it('refuses other images, elevated templates, and unknown ids', () => {
    expect(isMemberCatalogApp(standard.id, 'evil/image:1.0')).toBe(false)
    expect(isMemberCatalogApp(standard.id, `${repo}-fork:1.0`)).toBe(false)
    expect(isMemberCatalogApp(standard.id, `ghcr.io/${repo}:1.0`)).toBe(false)
    expect(isMemberCatalogApp(standard.id, `${repo}:1.0 `)).toBe(false)
    expect(isMemberCatalogApp(elevated.id, elevated.image)).toBe(false)
    expect(isMemberCatalogApp('nope', standard.image)).toBe(false)
    expect(isMemberCatalogApp(null, standard.image)).toBe(false)
    expect(isMemberCatalogApp(standard.id, null)).toBe(false)
  })
})
