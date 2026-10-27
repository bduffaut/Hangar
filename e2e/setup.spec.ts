// The Preflight Checklist from a fresh install: boarding pass, address, GitHub (skipped), and a
// test flight that deploys the sample site from Hangar's public repository.
import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { ACCOUNT, CACHE, SCREENSHOTS, setupCode, shot } from './helpers.ts'

test('a new owner completes the Preflight Checklist and takes a test flight', async ({ page }) => {
  mkdirSync(SCREENSHOTS, { recursive: true })
  await page.goto('/')
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await shot(page, 'setup-1-account')

  // A wrong code is explained plainly.
  await page.getByLabel('Boarding pass').fill('WRONG-CODE')
  await page.getByLabel('Username').fill(ACCOUNT.username)
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('That setup code is not correct.')).toBeVisible()

  await page.getByLabel('Boarding pass').fill(setupCode())
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('heading', { name: 'Confirm the address' })).toBeVisible()
  await expect(page.getByLabel('Server address')).toHaveValue('127.0.0.1')
  await expect(page.getByText('http://tower.127-0-0-1.sslip.io')).toBeVisible()
  await shot(page, 'setup-2-address')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Connect GitHub (optional)' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip for now' }).click()

  await expect(page.getByRole('heading', { name: 'Take a test flight' })).toBeVisible()
  await page.getByRole('button', { name: 'Deploy the sample' }).click()
  await expect(page.locator('.hg-flight [data-status]')).toHaveAttribute('data-status', 'ready', {
    timeout: 5 * 60_000,
  })
  await expect(
    page.getByRole('link', { name: 'http://test-flight.127-0-0-1.sslip.io' }),
  ).toBeVisible()
  await shot(page, 'setup-4-test-flight')

  // The sample is really live at its own address.
  const sample = await page.context().request.get('http://test-flight.127-0-0-1.sslip.io/')
  expect(await sample.text()).toContain('fixture: static-site')

  await page.getByRole('button', { name: 'Go to the Control Tower' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.context().storageState({ path: `${CACHE}/session.json` })
})
