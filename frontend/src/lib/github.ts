import type { schemas } from '@hangar/shared'
import type { z } from 'zod'
import { api } from '../api/client.ts'

/**
 * Leaves for GitHub to authorize Hangar's app. GitHub sends the browser back to /auth/github,
 * which finishes the sign-in (GithubCallbackView).
 */
export async function goToGithub(body: z.input<typeof schemas.githubStart>): Promise<void> {
  const { url } = await api('githubStart', { body })
  window.location.assign(url)
}
