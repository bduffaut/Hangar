import { defineConfig, devices } from '@playwright/test'

// The public site (front page, guides, tour) is static, so these tests build it and serve it
// locally, with no dev stack. Run with `pnpm test:site`.
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: '../../.cache/site-results',
  use: { baseURL: 'http://localhost:4180', trace: 'retain-on-failure' },
  webServer: {
    command:
      'pnpm build:site && pnpm --filter @hangar/frontend exec vite preview --outDir dist-site --port 4180 --strictPort',
    url: 'http://localhost:4180',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1366, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
})
