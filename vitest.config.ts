import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      { test: { name: 'shared', root: 'packages/shared', include: ['src/**/*.test.ts'] } },
      { test: { name: 'server', root: 'apps/server', include: ['src/**/*.test.ts'] } },
      {
        // Needs the dev stack (`pnpm dev`); run with `pnpm test:integration`.
        test: {
          name: 'integration',
          root: 'apps/server',
          include: ['test/integration/**/*.test.ts'],
          testTimeout: 900_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
