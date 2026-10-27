import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const SESSION = path.resolve(import.meta.dirname, '../.cache/e2e/session.json')

// Browser tests drive the dev stack through Traefik, exactly like a visitor. The browser runs in
// Playwright's Docker image on the `hangar` network (see e2e/README.md), so this machine needs no
// browser libraries; the test runner stays here, where it can reach Docker and the database.
export default defineConfig({
  testDir: '.',
  timeout: 6 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  outputDir: path.resolve(import.meta.dirname, '../.cache/e2e/results'),
  use: {
    baseURL: 'http://tower.127-0-0-1.sslip.io',
    connectOptions: { wsEndpoint: process.env.PLAYWRIGHT_WS ?? 'ws://127.0.0.1:3333/' },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /setup\.spec\.ts/,
      use: { viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'desktop',
      testMatch: /flows\.spec\.ts/,
      dependencies: ['setup'],
      use: { viewport: { width: 1366, height: 900 }, storageState: SESSION },
    },
    {
      name: 'phone',
      testMatch: /flows\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'], storageState: SESSION },
    },
  ],
})
