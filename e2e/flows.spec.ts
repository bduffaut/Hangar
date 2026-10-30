// The everyday flow, on desktop and on a phone: the tour, creating a project, watching it deploy,
// environment variables, redeploying, rolling back, live output, and deleting.
import { expect, test } from '@playwright/test'
import { FIXTURES_REPO, shot, waitForFinish } from './helpers.ts'

test('create, deploy, configure, roll back, and delete a project', async ({ page }, testInfo) => {
  const device = testInfo.project.name
  const name = `e2e-${device}`
  const appUrl = `http://${name}.127-0-0-1.sslip.io/`
  const appBody = async () => (await page.context().request.get(appUrl)).text()

  // First visit to the Control Tower: the tour walks through the main screen.
  await page.goto('/')
  await expect(page.getByRole('dialog', { name: 'Departures' })).toBeVisible()
  for (const step of ['Departures', 'Your projects', 'Make it yours', 'Add a project', 'Guide']) {
    await expect(page.getByRole('dialog', { name: step })).toBeVisible()
    await page.getByRole('button', { name: step === 'Guide' ? 'Done' : 'Next' }).click()
  }
  await expect(page.locator('.hg-tour')).toHaveCount(0)
  await expect(page.getByText('test-flight').first()).toBeVisible()
  await shot(page, `${device}-home`)

  // Customize the home screen: a removed widget moves to the add list, and the layout is saved.
  await page.getByRole('button', { name: 'Customize' }).click()
  await page.getByRole('button', { name: 'Remove Disk' }).click()
  await expect(page.locator('[data-widget="hangar.disk"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.reload()
  await expect(page.getByText('test-flight').first()).toBeVisible()
  await expect(page.locator('[data-widget="hangar.disk"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Customize' }).click()
  await page.getByRole('button', { name: /^Disk/ }).click()
  await expect(page.locator('[data-widget="hangar.disk"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Done' }).click()

  // Create a project from the fixtures repository.
  await page.getByRole('button', { name: 'New project' }).click()
  await expect(page).toHaveURL(/\/projects\/new$/)
  await page.getByLabel('Repository address').fill(FIXTURES_REPO)
  await page.getByLabel('Project name').fill(name)
  await expect(page.getByText(`http://${name}.127-0-0-1.sslip.io`)).toBeVisible()
  await page.getByRole('button', { name: 'Show options' }).click()
  await page.getByLabel('Root directory').fill('dockerfile-app')
  await shot(page, `${device}-new-project`)
  await page.getByRole('button', { name: 'Create and deploy' }).click()

  // The Flight Recorder follows the build until the app is live.
  await expect(page).toHaveURL(/\/deployments\//)
  await expect(page.getByRole('heading', { name: 'Deployment #1' })).toBeVisible()
  expect(await waitForFinish(page)).toBe('ready')
  await expect(page.getByRole('log')).toContainText('is live')
  await shot(page, `${device}-flight-recorder`)
  expect(await appBody()).toContain('fixture: dockerfile-app greeting=none')

  // Environment variables, applied by deploying again.
  await page.getByRole('link', { name }).first().click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Environment' }).click()
  await page.getByRole('button', { name: 'Add variables' }).click()
  await page.getByLabel('Name').first().fill('GREETING')
  await page.getByLabel('Value').first().fill('hello')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.hg-env-list')).toContainText('GREETING')
  await page.getByRole('button', { name: 'Show GREETING' }).click()
  await expect(page.locator('.hg-env-list')).toContainText('hello')
  await page.getByRole('button', { name: 'Deploy now' }).click()
  await expect(page.getByRole('heading', { name: 'Deployment #2' })).toBeVisible()
  expect(await waitForFinish(page)).toBe('ready')
  expect(await appBody()).toContain('greeting=hello')

  // History, charts, and rolling back to the first deployment.
  await page.getByRole('link', { name }).first().click()
  await expect(page.getByRole('tab', { name: 'Deployments' })).toBeVisible()
  const history = page.locator('.hg-table')
  await expect(history.locator('tbody tr')).toHaveCount(2)
  await expect(page.getByRole('img', { name: 'Build time per deployment' })).toBeVisible()
  await shot(page, `${device}-project`)
  await history.getByRole('row', { name: /#1/ }).getByRole('button', { name: 'Roll back' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Roll back' }).click()
  await expect(history.getByRole('row', { name: /#3/ })).toContainText('Airborne', {
    timeout: 2 * 60_000,
  })
  await expect(history.getByRole('row', { name: /#3/ })).toContainText('Current')
  expect(await appBody()).toContain('fixture: dockerfile-app')

  // Radio connects to the running app's output.
  await page.getByRole('tab', { name: 'Radio' }).click()
  await expect(page.getByText('Connected. The app has not printed anything yet.')).toBeVisible()

  // Delete it; the address stops serving.
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Delete project' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this project?' })
  await expect(dialog.getByRole('button', { name: 'Delete project' })).toBeDisabled()
  await dialog.getByLabel(`Type ${name} to confirm`).fill(name)
  await dialog.getByRole('button', { name: 'Delete project' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator(`[data-project="${name}"]`)).toHaveCount(0)
  await expect.poll(appBody, { timeout: 20_000 }).toContain("This app isn't running")
})
