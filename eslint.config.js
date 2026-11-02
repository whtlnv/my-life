import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/coverage/**',
      'docs/**',
      'profile/**',
      '.tdd-metrics/**',
      // Other agents' git worktrees (.claude/worktrees), whole copies of the repository.
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        // vitest.coverage.ts, the Vitest packages' shared coverage settings, sits at the root outside any package.
        projectService: { allowDefaultProject: ['vitest.coverage.ts'], defaultProject: 'tsconfig.base.json' },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // The domain is pure: no ambient time or randomness, no UI, no I/O, no app code.
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Inject a Clock; the domain never reads ambient time.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Inject a Clock; the domain never reads ambient time.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'Inject a random source; the domain is deterministic.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*'], message: 'The domain knows nothing of the UI.' },
            {
              group: ['node:*', 'hono', 'hono/*', 'better-sqlite3', 'wxt', 'wxt/*'],
              message: 'The domain does no I/O; declare a port instead.',
            },
            {
              group: ['@my-life/backend', '@my-life/dashboard', '@my-life/extension'],
              message: 'Apps depend on the domain, never the reverse.',
            },
          ],
        },
      ],
    },
  },
  {
    // The dashboard runs in the browser.
    files: ['apps/dashboard/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    // The extension runs in Chrome's extension runtime.
    files: ['apps/extension/src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
  },
  {
    // Tests read files and the clock freely.
    files: ['**/*.test.{ts,tsx}', '**/*.test-support.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off', 'no-restricted-syntax': 'off' },
  },
  prettier,
);
