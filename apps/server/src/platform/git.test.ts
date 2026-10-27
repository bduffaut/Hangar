import { describe, expect, it } from 'vitest'
import { gitEnv } from './git.ts'

describe('gitEnv', () => {
  it('sends the GitHub token to github.com only', () => {
    expect(gitEnv('https://github.com/me/app', 'tok').GIT_CONFIG_VALUE_0).toMatch(
      /^Authorization: Basic /,
    )
    for (const url of [
      'https://gitlab.com/me/app',
      'https://codeberg.org/me/app',
      'https://github.com.evil.example/me/app',
      'https://evil.example/github.com/me/app',
      'https://github.com:8443/me/app',
      'http://github.com/me/app',
      'file:///repo/x.git',
    ]) {
      expect(gitEnv(url, 'tok'), url).toEqual({ GIT_TERMINAL_PROMPT: '0' })
    }
  })

  it('sends nothing without a token', () => {
    expect(gitEnv('https://github.com/me/app', null)).toEqual({ GIT_TERMINAL_PROMPT: '0' })
  })
})
