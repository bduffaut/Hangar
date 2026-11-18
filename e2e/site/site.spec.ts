// The public site: the front page leads to the guides and the tour, the tour shows the real
// dashboard with sample data, and anything that would change something leads to the install guide.
import { expect, test } from '@playwright/test'

test('the front page leads to the install guide and the tour', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Deploy from GitHub to a computer you own' }),
  ).toBeVisible()
  await expect(
    page.getByText('curl -fsSL https://hangar.benduffaut.com/install.sh | sudo bash').first(),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Install Hangar' }).first().click()
  await expect(page).toHaveURL(/\/docs\/install$/)
  await expect(page.getByRole('heading', { name: 'Install Hangar', level: 1 })).toBeVisible()
  // Links between guides stay on the site.
  // Followed from the keyboard: on a phone the link wraps over two lines, so a click aimed at
  // the middle of its box lands between them.
  await page.getByRole('link', { name: 'Why Tailscale?' }).press('Enter')
  await expect(page).toHaveURL(/\/docs\/tailscale$/)
})

test('the tour shows the dashboard and sends actions to the install guide', async ({ page }) => {
  await page.goto('/tour')
  // Phones show the short version of the banner.
  await expect(page.locator('.hg-demo-strip')).toContainText(
    /Sample hangar|This is a sample hangar/,
  )
  await expect(page.getByRole('dialog', { name: 'The flight deck' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip tour' }).click()
  await expect(page.getByText('recipes-api').first()).toBeVisible()

  await page.goto('/tour/projects/blog')
  await page.getByRole('button', { name: 'Deploy', exact: true }).click()
  const prompt = page.getByRole('dialog', { name: 'Ready to fly your own?' })
  await expect(prompt).toBeVisible()
  await expect(
    prompt.getByText('To deploy, install Hangar on a computer of your own.'),
  ).toBeVisible()
  await prompt.getByRole('button', { name: 'Read the install guide' }).click()
  await expect(page).toHaveURL(/\/docs\/install$/)
})

test('serves an install script pinned to this release', async ({ request }) => {
  const script = await (await request.get('/install.sh')).text()
  expect(script).toContain('sha256sum --check')
  expect(script).not.toContain('__HANGAR_VERSION__')
  expect(script).toMatch(/HANGAR_VERSION:-\d+\.\d+\.\d+/)
})
