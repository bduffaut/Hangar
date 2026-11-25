import { describe, expect, it } from 'vitest'
import { checkProjectName } from './hostnames.ts'
import {
  addressEnvValue,
  newerVersion,
  CATALOG,
  checkLibraryPath,
  checkHostPort,
  checkMountPath,
  imageRepository,
  isSerialDevicePath,
  isTemplateFilePath,
  serialDeviceName,
  portLabel,
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
  it('has consistent ports and questions (D51, D52)', () => {
    for (const app of CATALOG) {
      const ports = app.ports ?? []
      for (const p of ports)
        expect([app.id, p.port, checkHostPort(p.port)]).toEqual([app.id, p.port, null])
      expect(new Set(ports.map((p) => `${p.port}/${p.protocol}`)).size).toBe(ports.length)
      // A port or a USB stick on the computer is an admin's to give.
      if (ports.length || app.device) expect(app.tier).toBe('elevated')
      if (app.device) expect(app.device.mountPath).toMatch(/^\/dev\/[a-z0-9]+$/)
      // An app that is not a web page is reached by its ports, or by its name from other apps
      // (Mosquitto); nobody opens it in a browser to claim it.
      if (app.web === false) expect(app.firstVisitorIsAdmin).toBe(false)
      // Starting files (D53) go into the app's own kept folders, at plain relative paths.
      for (const f of app.files ?? []) {
        expect(app.volumes.map((v) => v.name)).toContain(f.volume)
        expect([f.path, isTemplateFilePath(f.path)]).toEqual([f.path, true])
      }
      for (const q of app.questions ?? []) {
        expect(q.env).toMatch(/^[A-Z][A-Z0-9_]*$/)
        expect(app.env[q.env]).toBeUndefined()
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

describe('addresses an app is told about (D48)', () => {
  it('adds each public address to what the owner set, once', () => {
    expect(addressEnvValue(undefined, ['docs.example.com'])).toBe('https://docs.example.com')
    expect(
      addressEnvValue('https://a.example.com, https://docs.example.com', ['docs.example.com']),
    ).toBe('https://a.example.com,https://docs.example.com')
    expect(addressEnvValue('', [])).toBe('')
  })
})

describe('newer versions (D47)', () => {
  const tags = [
    'latest',
    'v3.4.1',
    'v3.4.2',
    'v3.5.0',
    'v3.10.0',
    '3.11.0',
    'v4.0.0-rc1',
    'nightly',
  ]
  it('picks the newest tag in the same style, comparing numbers', () => {
    expect(newerVersion('v3.4.2', tags)).toBe('v3.10.0')
    expect(newerVersion('12.4', ['12.3', '12.4', '12.5', '12.5.1', '13'])).toBe('12.5')
    expect(newerVersion('3.5.1', ['3.5.1', '3.5.2', 'v3.6.0'])).toBe('3.5.2')
  })
  it('offers nothing when already newest, or for tags that are not plain versions', () => {
    expect(newerVersion('v3.10.0', tags)).toBeNull()
    expect(newerVersion('latest', tags)).toBeNull()
    expect(newerVersion('9-alpine', ['10-alpine'])).toBeNull()
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

describe('ports on the computer (D51)', () => {
  it('keeps the computer’s own ports and the private HTTPS range', () => {
    expect(checkHostPort(25565)).toBeNull()
    expect(checkHostPort(53)).toBeNull()
    for (const port of [22, 80, 443, 8401, 8499]) expect(checkHostPort(port)).toBe('reserved')
    for (const port of [0, 65536, 1.5]) expect(checkHostPort(port)).toBe('invalid')
  })
  it('writes UDP ports so people can tell', () => {
    expect(portLabel({ hostPort: 25565, protocol: 'tcp' })).toBe('25565')
    expect(portLabel({ hostPort: 19132, protocol: 'udp' })).toBe('19132 (UDP)')
  })
})

describe('starting files (D53)', () => {
  it('only takes plain paths inside the kept folder', () => {
    expect(isTemplateFilePath('mosquitto.conf')).toBe(true)
    expect(isTemplateFilePath('conf/app.conf')).toBe(true)
    for (const path of ['/etc/passwd', '../x', 'a/../b', 'a//b', '', 'a b', 'a/./b']) {
      expect([path, isTemplateFilePath(path)]).toEqual([path, false])
    }
  })
})

describe('USB sticks (D55)', () => {
  it('takes only stable names under /dev/serial/by-id', () => {
    expect(isSerialDevicePath('/dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0-if00-port0')).toBe(
      true,
    )
    for (const path of [
      '/dev/ttyUSB0',
      '/dev/serial/by-id/../sda',
      '/dev/serial/by-id/a b',
      '/etc/passwd',
    ]) {
      expect([path, isSerialDevicePath(path)]).toEqual([path, false])
    }
  })
  it('names a stick the way its maker does', () => {
    expect(
      serialDeviceName(
        '/dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_e4b4cf2a1234-if00-port0',
      ),
    ).toBe('ITead Sonoff Zigbee 3.0 USB Dongle Plus')
    expect(
      serialDeviceName('/dev/serial/by-id/usb-Nabu_Casa_SkyConnect_v1.0_8a3c7f12-if00-port0'),
    ).toBe('Nabu Casa SkyConnect v1.0')
  })
})
