import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findEscapingSymlink } from './symlinks.ts'

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'hangar-symlinks-'))
  mkdirSync(path.join(root, 'app/src'), { recursive: true })
  writeFileSync(path.join(root, 'shared.txt'), 'ok')
  writeFileSync(path.join(root, 'app/index.html'), 'hi')
  return root
}

describe('findEscapingSymlink', () => {
  it('allows links that stay inside the repository', async () => {
    const root = repo()
    symlinkSync('../shared.txt', path.join(root, 'app/shared.txt'))
    symlinkSync('index.html', path.join(root, 'app/home.html'))
    symlinkSync('missing-but-inside', path.join(root, 'app/dangling'))
    expect(await findEscapingSymlink(path.join(root, 'app'), root)).toBeNull()
  })

  it('finds absolute links out of the repository', async () => {
    const root = repo()
    symlinkSync('/proc/1/environ', path.join(root, 'app/src/Caddyfile'))
    expect(await findEscapingSymlink(path.join(root, 'app'), root)).toBe('app/src/Caddyfile')
  })

  it('finds relative and chained links out of the repository', async () => {
    const root = repo()
    symlinkSync('../../../etc/hostname', path.join(root, 'app/src/x'))
    expect(await findEscapingSymlink(root, root)).toBe('app/src/x')

    const chained = repo()
    symlinkSync('/etc', path.join(chained, 'outside'))
    symlinkSync('../outside/hostname', path.join(chained, 'app/inner'))
    expect(await findEscapingSymlink(path.join(chained, 'app'), chained)).toBe('app/inner')
  })

  it('finds dangling links that point outside', async () => {
    const root = repo()
    symlinkSync('/nonexistent/secret', path.join(root, 'app/gone'))
    expect(await findEscapingSymlink(root, root)).toBe('app/gone')
  })
})
