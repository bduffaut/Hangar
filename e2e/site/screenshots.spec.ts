// The pictures in the app guides (docs/guides/apps-*.md), taken from the tour so they always show
// the current dashboard. Only runs when asked, at desktop size:
//   HANGAR_DOCS_SHOTS=1 pnpm test:site screenshots --project=desktop
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const OUT = path.resolve(import.meta.dirname, '../../docs/images/guides')

test.skip(!process.env.HANGAR_DOCS_SHOTS, 'Set HANGAR_DOCS_SHOTS=1 to retake the guide pictures')
test.use({ viewport: { width: 1280, height: 800 } })

async function open(page: Page, url: string) {
  // The tour's welcome dialog opens once per browser; mark it seen first.
  await page.goto('/tour')
  const skip = page.getByRole('button', { name: 'Skip tour' })
  if (await skip.isVisible().catch(() => false)) await skip.click()
  await page.goto(url)
}

/** The banner saying this is the tour is left out: the guides show a real Hangar. */
async function shoot(page: Page, name: string, clip?: { y: number; height: number }) {
  await page.addStyleTag({ content: '.hg-demo-strip { display: none !important }' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    clip: clip ? { x: 0, width: 1280, ...clip } : undefined,
  })
}

test('pictures for the app guides', async ({ page }) => {
  await open(page, '/tour/apps')
  await expect(page.getByText('Jellyfin').first()).toBeVisible()
  await shoot(page, 'catalog')

  for (const id of [
    'jellyfin',
    'immich',
    'paperless-ngx',
    'mealie',
    'minecraft',
    'home-assistant',
    'zigbee2mqtt',
  ]) {
    await page.goto(`/tour/apps/${id}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Its address comes from the settings, which load just after the page.
    await expect(page.getByText(/tail1234\.ts\.net|\.sslip\.io/).first()).toBeVisible()
    await shoot(page, `install-${id}`)
  }

  await page.goto('/tour/projects/immich/radio')
  const parts = page.getByRole('group', { name: 'Parts of this app' })
  await parts.getByRole('button', { name: /^database/ }).click()
  await expect(page.getByText(/checkpoint/).first()).toBeVisible()
  // The parts and the start of their output, scrolled to the top.
  await parts.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 140))
  await shoot(page, 'immich-parts', { y: 0, height: 560 })

  // An app that is not a web page: the address players connect to.
  await page.goto('/tour/projects/minecraft')
  await expect(page.getByText('hangar.tail1234.ts.net:25565').first()).toBeVisible()
  await shoot(page, 'minecraft', { y: 0, height: 560 })

  await page.goto('/tour/projects/immich')
  await expect(page.getByText('Version v3.5.0 is out. This app runs v3.4.2.')).toBeVisible()
  await shoot(page, 'immich-update', { y: 0, height: 380 })
})
