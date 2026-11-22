// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Render text nodes instead (XSS).' },
        { property: 'outerHTML', message: 'Render text nodes instead (XSS).' },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['**/*.mjs', '**/*.cjs', 'scripts/**'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', fetch: 'readonly' },
    },
  },
  {
    // Playwright fixtures call `use()`, which is not a React hook.
    files: ['**/e2e/**'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  prettier,
);
