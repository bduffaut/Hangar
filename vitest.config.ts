import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      { test: { name: 'shared', root: 'packages/shared', include: ['src/**/*.test.ts'] } },
      { test: { name: 'server', root: 'apps/server', include: ['src/**/*.test.ts'] } },
    ],
  },
})
