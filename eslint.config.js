import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'apps/server/drizzle/**', '.cache/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: { globals: globals.node },
  },
  {
    files: ['frontend/src/**', 'fixtures/vite-app/src/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Optional TypeScript props are undefined by default; a default value adds nothing.
      'vue/require-default-prop': 'off',
    },
  },
  {
    // The component and chart libraries are reached only through their wrappers (frontend/src/ui
    // and frontend/src/charts), so either library can be replaced by rewriting one folder.
    files: ['frontend/src/**'],
    ignores: ['frontend/src/ui/**', 'frontend/src/charts/**', 'frontend/src/theme/preset.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['primevue', 'primevue/*', '@primevue/*', '@primeuix/*'],
              message: 'Use the Base* components from ui/ instead.',
            },
            {
              group: ['chart.js', 'chart.js/*'],
              message: 'Use BaseChart from charts/ instead (type-only imports are fine).',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  prettier,
)
