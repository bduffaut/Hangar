import { describe, expect, it } from 'vitest'
import { registryLocation } from './registry.ts'

describe('where an image repository lives', () => {
  it('reads Docker Hub names, with library/ for official images', () => {
    expect(registryLocation('postgres')).toEqual({
      host: 'registry-1.docker.io',
      path: 'library/postgres',
    })
    expect(registryLocation('jellyfin/jellyfin')).toEqual({
      host: 'registry-1.docker.io',
      path: 'jellyfin/jellyfin',
    })
    expect(registryLocation('docker.io/valkey/valkey')).toEqual({
      host: 'registry-1.docker.io',
      path: 'valkey/valkey',
    })
  })
  it('reads other registries by their host', () => {
    expect(registryLocation('ghcr.io/immich-app/immich-server')).toEqual({
      host: 'ghcr.io',
      path: 'immich-app/immich-server',
    })
    expect(registryLocation('localhost:5000/app')).toEqual({ host: 'localhost:5000', path: 'app' })
  })
})
