import { mkdir } from 'node:fs/promises'
import { type LineHandler, runChecked } from './process.ts'

export interface CommitInfo {
  sha: string
  author: string
  message: string
}

const SHA_PATTERN = /^[0-9a-f]{40}$/

function isCommitSha(value: string): boolean {
  return SHA_PATTERN.test(value)
}

/**
 * Credentials travel as an HTTP header set through GIT_CONFIG_* variables, so the token never
 * appears in a URL, on a command line, in .git/config, or in logs.
 */
function gitEnv(repoUrl: string, token: string | null): Record<string, string> {
  const env: Record<string, string> = { GIT_TERMINAL_PROMPT: '0' }
  if (token && repoUrl.startsWith('https://')) {
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
    env.GIT_CONFIG_COUNT = '1'
    env.GIT_CONFIG_KEY_0 = 'http.extraHeader'
    env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${basic}`
  }
  return env
}

export function createGit() {
  return {
    /** The commit SHA at the tip of `branch`, or null if the branch does not exist. */
    async headOf(
      repoUrl: string,
      branch: string,
      token: string | null,
      signal?: AbortSignal,
    ): Promise<string | null> {
      const { stdout } = await runChecked(
        'git',
        ['ls-remote', '--', repoUrl, `refs/heads/${branch}`],
        { env: gitEnv(repoUrl, token), signal, captureStdout: true },
      )
      const sha = stdout.split('\t')[0]?.trim()
      return sha && isCommitSha(sha) ? sha : null
    },

    /** The branch the remote's HEAD points at (its default branch), or null. */
    async defaultBranch(
      repoUrl: string,
      token: string | null,
      signal?: AbortSignal,
    ): Promise<string | null> {
      const { stdout } = await runChecked('git', ['ls-remote', '--symref', '--', repoUrl, 'HEAD'], {
        env: gitEnv(repoUrl, token),
        signal,
        captureStdout: true,
      })
      const match = /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(stdout)
      return match?.[1] ?? null
    },

    /** Shallow-fetches exactly `sha` into `dir` (which must not exist yet) and checks it out. */
    async cloneAt(options: {
      repoUrl: string
      sha: string
      token: string | null
      dir: string
      signal?: AbortSignal
      onLine?: LineHandler
    }): Promise<CommitInfo> {
      const { repoUrl, sha, dir, signal, onLine } = options
      if (!isCommitSha(sha)) throw new Error(`Not a full commit SHA: ${sha}`)
      const env = gitEnv(repoUrl, options.token)
      const git = (...args: string[]) => runChecked('git', args, { cwd: dir, env, signal, onLine })

      await mkdir(dir, { recursive: true })
      await git('init', '--quiet')
      await git('remote', 'add', 'origin', repoUrl)
      await git('fetch', '--depth', '1', '--no-tags', 'origin', sha)
      await git('-c', 'advice.detachedHead=false', 'checkout', '--quiet', 'FETCH_HEAD')

      const { stdout } = await runChecked('git', ['log', '-1', '--format=%H%x00%an%x00%s'], {
        cwd: dir,
        signal,
        captureStdout: true,
      })
      const [head = '', author = '', message = ''] = stdout.trim().split('\0')
      if (head !== sha) throw new Error(`Checked out ${head} instead of ${sha}`)
      return { sha, author, message }
    },
  }
}

export type Git = ReturnType<typeof createGit>
