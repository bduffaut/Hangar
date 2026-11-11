// The front door, connecting a server, and the pages around it (D38): a visitor's landing page,
// the install command with its live wait, Publish, and settings in sections.
import { expect, test } from '@playwright/test'
import { shot } from './helpers.ts'

test('visitors get the front door, and signed-in people can add a server', async ({
  page,
  browser,
}) => {
  const visitor = await browser.newContext({
    baseURL: 'http://tower.127-0-0-1.sslip.io',
    storageState: { cookies: [], origins: [] },
  })
  const front = await visitor.newPage()
  await front.goto('/')
  await expect(front).toHaveURL(/\/welcome$/)
  await expect(
    front.getByRole('heading', { name: 'Deploy from GitHub to a computer you own' }),
  ).toBeVisible()
  await expect(front.getByRole('heading', { name: 'From sign-in to a live app' })).toBeVisible()
  await shot(front, 'landing')
  await visitor.close()

  // Adding a server gives a one-time command, then waits for the machine to connect.
  await page.goto('/servers')
  await page.getByRole('button', { name: 'Add a server' }).click()
  await page.getByLabel('What do you call it?').fill('e2e laptop')
  await page.getByRole('button', { name: 'Get the install command' }).click()
  await expect(page.getByText('Waiting for your server to connect…')).toBeVisible()
  const command = page.getByText(/HANGAR_PAIRING_CODE=/).first()
  await expect(command).toBeVisible()
  await shot(page, 'add-server')
  await expect(page.getByRole('heading', { name: 'e2e laptop' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove' }).last().click()
  await page.getByRole('button', { name: 'Remove server' }).click()
  await expect(page.getByRole('heading', { name: 'e2e laptop' })).toHaveCount(0)

  // Publish lists repositories once GitHub is connected; until then it says how.
  await page.goto('/publish')
  await expect(page.getByRole('heading', { name: 'Publish' })).toBeVisible()
  await expect(page.getByText('Connect GitHub first to see your repositories.')).toBeVisible()

  // Settings: one section at a time.
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Address' })).toBeVisible()
  await page.getByRole('link', { name: /Public access/ }).click()
  await expect(page).toHaveURL(/\/settings\/public$/)
  await expect(page.getByRole('heading', { name: 'Address' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '1. Connect a tunnel' })).toBeVisible()
  await page.getByRole('link', { name: /System/ }).click()
  await expect(page.getByRole('heading', { name: 'This machine' })).toBeVisible()
  await shot(page, 'settings-system')

  // Guided setup checks off what is already done.
  await page.goto('/start')
  await expect(page.getByRole('heading', { name: 'Get set up' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Connect your server\s*Done/ })).toBeVisible()
})
