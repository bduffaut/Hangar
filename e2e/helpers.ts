import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'

export const CACHE = path.resolve(import.meta.dirname, '../.cache/e2e')
export const SCREENSHOTS = path.join(CACHE, 'screenshots')
/** Where hangar-core sees the fixtures repository (the repo is bind-mounted at /repo). */
export const FIXTURES_REPO = 'file:///repo/.cache/e2e/fixtures.git'
export const ACCOUNT = { username: 'e2e-admin', password: 'correct horse battery staple' }

export const setupCode = () => readFileSync(path.join(CACHE, 'setup-code'), 'utf8').trim()

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true })
}

/** Waits for a deployment page to reach a final status, and returns its label. */
export async function waitForFinish(page: Page, timeout = 5 * 60_000) {
  const badge = page.locator('.hg-page-header [data-status]').first()
  await expect(badge).toHaveAttribute('data-status', /ready|failed|cancelled/, { timeout })
  return badge.getAttribute('data-status')
}
