// The tour without an account: a visitor sees the real dashboard filled with a sample hangar,
// and anything that would change something asks them to sign up.
import { expect, test } from '@playwright/test'
import { shot } from './helpers.ts'

test('a visitor can tour the dashboard and is asked to sign up to act', async ({ browser }) => {
  const visitor = await browser.newContext({
    baseURL: 'http://tower.127-0-0-1.sslip.io',
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1366, height: 900 },
  })
  const page = await visitor.newPage()
  // The landing page's "Take the tour" leads here (servers.spec.ts checks the landing page).
  await page.goto('/tour')

  // The guided tour opens on the sample dashboard.
  await expect(page.getByText('You are exploring a sample hangar.')).toBeVisible()
  await expect(page.getByText('1 of 7')).toBeVisible()
  await page.getByRole('button', { name: 'Skip tour' }).click()
  await expect(page.getByText('recipes-api').first()).toBeVisible()
  await shot(page, 'tour-home')

  // Deploying needs an account.
  await page.goto('/projects/blog')
  await page.getByRole('button', { name: 'Deploy', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Ready to fly your own?' })).toBeVisible()
  await expect(page.getByText('To deploy, create a free account.')).toBeVisible()
  await page.getByRole('button', { name: 'Keep exploring' }).click()

  // Leaving the tour goes back to this site as it really is, signed out.
  await page.getByRole('button', { name: 'Leave the tour' }).click()
  await expect(page.getByText('You are exploring a sample hangar.')).toBeHidden()
  await expect(page).not.toHaveURL(/\/projects\//)
  await visitor.close()
})
