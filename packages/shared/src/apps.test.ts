import { describe, expect, it } from 'vitest'
import {
  CATALOG,
  checkLibraryPath,
  checkMountPath,
  imageTag,
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
    }
  })
})
