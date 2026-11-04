// Two people on one Hangar: an admin invites a member, who signs up from the link and sees only
// their own things, and live address status on a project page.
import { expect, test } from '@playwright/test'
import { ACCOUNT, shot } from './helpers.ts'

test('an invited member sees only their own account', async ({ page, browser }) => {
  await page.goto('/people')
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible()
  await page.getByLabel('Who is it for? (optional)').fill('A friend')
  await page.getByRole('button', { name: 'Create invite link' }).click()
  await expect(page.getByText('Send this link to them.')).toBeVisible()
  await shot(page, 'people')
  const link = await page
    .locator('.hg-people-link code, .hg-people-link input')
    .first()
    .evaluate((el) => (el as HTMLInputElement).value || el.textContent || '')
  expect(link).toContain('/invite#')

  // Contexts inherit this project's signed-in storage state unless told otherwise.
  const member = await browser.newContext({
    baseURL: 'http://tower.127-0-0-1.sslip.io',
    storageState: { cookies: [], origins: [] },
  })
  const memberPage = await member.newPage()
  await memberPage.goto(link.trim())
  await expect(memberPage.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  // The token is read once and leaves the address bar at once.
  expect(new URL(memberPage.url()).hash).toBe('')
  await memberPage.getByLabel('Username').fill('e2e-friend')
  await memberPage.getByLabel('Password').fill('a member password here')
  await shot(memberPage, 'invite')
  await memberPage.getByRole('button', { name: 'Create account' }).click()

  await expect(memberPage.getByRole('link', { name: 'Account' })).toBeVisible()
  await expect(memberPage.getByRole('link', { name: 'Settings' })).toHaveCount(0)
  await expect(memberPage.getByRole('link', { name: 'People' })).toHaveCount(0)
  await expect(memberPage.getByText('test-flight')).toHaveCount(0)
  const theirs = await memberPage.evaluate(async () => (await fetch('/api/projects')).json())
  expect(theirs).toEqual([])
  await expect(memberPage.locator('[data-widget="hangar.disk"]')).toHaveCount(0)
  await memberPage.getByRole('button', { name: 'Skip tour' }).click()
  await shot(memberPage, 'member-home')
  // Typing an admin address gets them home, and the API says no regardless.
  await memberPage.goto('/settings')
  await expect(memberPage).toHaveURL(/\/$/)
  const denied = await memberPage.evaluate(async () => (await fetch('/api/users')).status)
  expect(denied).toBe(403)

  await memberPage.goto('/account')
  await memberPage.getByLabel('Current password').fill('a member password here')
  await memberPage.getByLabel('New password').fill('another member password')
  await memberPage.getByRole('button', { name: 'Change password' }).click()
  await expect(memberPage.getByLabel('Current password')).toHaveValue('')
  await shot(memberPage, 'account')
  await member.close()

  // Opening a link while signed in as someone else leaves nothing of that account on screen.
  const invite = await page.evaluate(async () => {
    const me = await (await fetch('/api/auth/me')).json()
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken },
      body: '{}',
    })
    return (await res.json()).token as string
  })
  const shared = await browser.newContext({ baseURL: 'http://tower.127-0-0-1.sslip.io' })
  const sharedPage = await shared.newPage()
  await sharedPage.goto(`/invite#${invite}`)
  await sharedPage.getByLabel('Username').fill('e2e-second')
  await sharedPage.getByLabel('Password').fill('a second member password')
  await sharedPage.getByRole('button', { name: 'Create account' }).click()
  await expect(sharedPage.getByText('e2e-second')).toBeVisible()
  await expect(sharedPage.getByText('test-flight')).toHaveCount(0)
  await shared.close()

  await page.goto('/people')
  await page.locator('[data-user="e2e-second"]').getByLabel('Delete e2e-second').click()
  await page.getByRole('button', { name: 'Delete account' }).click()
  await expect(page.locator('[data-user="e2e-second"]')).toHaveCount(0)
  await page.locator('[data-user="e2e-friend"]').getByLabel('Delete e2e-friend').click()
  await page.getByRole('button', { name: 'Delete account' }).click()
  await expect(page.locator('[data-user="e2e-friend"]')).toHaveCount(0)
  await expect(page.locator(`[data-user="${ACCOUNT.username}"]`)).toBeVisible()
})

test('an address shows what the server found, without a refresh', async ({ page }) => {
  await page.goto('/projects/test-flight/settings')
  const call = async (method: string, url: string, body: object) => {
    const status = await page.evaluate(
      async ([method, url, body]) => {
        const me = await (await fetch('/api/auth/me')).json()
        const res = await fetch(url as string, {
          method: method as string,
          headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken },
          body: JSON.stringify(body),
        })
        return res.status
      },
      [method, url, body] as const,
    )
    expect([url, status]).toEqual([url, 200])
  }
  const [{ id }] = await page.evaluate(async () => (await fetch('/api/projects')).json())
  await call('PATCH', `/api/projects/${id}`, { hostnames: [] })
  await call('PATCH', '/api/settings', { publicDomains: ['example.com'] })
  await page.reload()
  const status = page.locator('[data-address-status]')
  await expect(page.getByRole('heading', { name: 'Public addresses' })).toBeVisible()
  await expect(status).toHaveCount(0)

  // Changed behind the page's back: only the server's own push can bring this result here.
  await call('PATCH', `/api/projects/${id}`, { hostnames: ['test-flight.example.com'] })
  const result = page.locator('[data-address-status="no_tunnel"]')
  await expect(result).toBeVisible({ timeout: 70_000 })
  await expect(result).toContainText('test-flight.example.com')
  await expect(result).toContainText('Hangar has no tunnel yet')
  await expect(result).toContainText('checked')
  await shot(page, 'address-status')

  await call('PATCH', `/api/projects/${id}`, { hostnames: [] })
  await call('PATCH', '/api/settings', { publicDomains: [] })
})
