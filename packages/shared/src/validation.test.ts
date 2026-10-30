import { describe, expect, it } from 'vitest'
import {
  githubRepoSlug,
  isValidBranchName,
  isValidDomain,
  isValidRepoUrl,
  normalizeRootDir,
  parseDotenv,
  parseWholeNumber,
} from './validation.ts'

describe('isValidBranchName', () => {
  it.each(['main', 'feature/login', 'release-1.2', 'user/name_x'])('accepts %s', (name) => {
    expect(isValidBranchName(name)).toBe(true)
  })
  it.each([
    '',
    '-rf',
    '/main',
    'main/',
    'a..b',
    'a b',
    'a~1',
    'a^',
    'a:b',
    'a?',
    'a*',
    'a[b',
    'a\\b',
    'x.lock',
    '.hidden',
    'a/.b',
    'a@{1}',
    '@',
    'a//b',
    'end.',
  ])('rejects %j', (name) => {
    expect(isValidBranchName(name)).toBe(false)
  })
})

describe('isValidRepoUrl', () => {
  it('accepts plain https URLs', () => {
    expect(isValidRepoUrl('https://github.com/bduffaut/hangar')).toBe(true)
    expect(isValidRepoUrl('https://gitlab.example.com/a/b.git')).toBe(true)
  })
  it.each([
    'http://github.com/a/b',
    'git@github.com:a/b.git',
    'file:///etc',
    'ssh://github.com/a/b',
    'https://user:pass@github.com/a/b',
    'https://token@github.com/a/b',
    'https://github.com/',
    'https://github.com/a/b?x=1',
    '--upload-pack=touch',
    'not a url',
  ])('rejects %s', (url) => {
    expect(isValidRepoUrl(url)).toBe(false)
  })
})

describe('githubRepoSlug', () => {
  it('extracts owner/name', () => {
    expect(githubRepoSlug('https://github.com/bduffaut/hangar')).toBe('bduffaut/hangar')
    expect(githubRepoSlug('https://github.com/bduffaut/hangar.git')).toBe('bduffaut/hangar')
    expect(githubRepoSlug('https://gitlab.com/a/b')).toBeNull()
  })
})

describe('isValidDomain', () => {
  it('accepts domains', () => {
    expect(isValidDomain('example.com')).toBe(true)
    expect(isValidDomain('apps.my-site.co.uk')).toBe(true)
  })
  it.each(['localhost', 'Example.com', '-a.com', 'a..com', 'a.com.', '*.a.com', 'a_b.com'])(
    'rejects %s',
    (domain) => {
      expect(isValidDomain(domain)).toBe(false)
    },
  )
})

describe('normalizeRootDir', () => {
  it('normalizes', () => {
    expect(normalizeRootDir('')).toBe('')
    expect(normalizeRootDir('.')).toBe('')
    expect(normalizeRootDir('./apps/web/')).toBe('apps/web')
    expect(normalizeRootDir('/apps/web')).toBe('apps/web')
  })
  it.each(['../x', 'a/../../b', 'a/./b', 'a//b', 'a\\b'])('rejects %s', (dir) => {
    expect(normalizeRootDir(dir)).toBeNull()
  })
})

describe('parseWholeNumber', () => {
  it('accepts whole numbers in range', () => {
    expect(parseWholeNumber('8080', 1, 65535)).toBe(8080)
    expect(parseWholeNumber(' 64 ', 64, 65536)).toBe(64)
  })
  it.each(['', '0', '65536', '3.5', '1e3', '-1', 'abc', '80x'])('rejects %s', (text) => {
    expect(parseWholeNumber(text, 1, 65535)).toBeNull()
  })
})

describe('parseDotenv', () => {
  it('reads keys and values, skipping comments and blank lines', () => {
    const text =
      '# app\nAPI_KEY=abc\n\nexport NODE_ENV=production\nGREETING="hello world"\nEMPTY=\nURL=https://x.dev/?a=b'
    expect(parseDotenv(text)).toEqual({
      vars: {
        API_KEY: 'abc',
        NODE_ENV: 'production',
        GREETING: 'hello world',
        EMPTY: '',
        URL: 'https://x.dev/?a=b',
      },
      badLines: [],
    })
  })

  it('reports lines it cannot read', () => {
    expect(parseDotenv('OK=1\njust words\n1BAD=2').badLines).toEqual([2, 3])
  })
})
