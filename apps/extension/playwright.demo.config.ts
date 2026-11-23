import { defineConfig } from '@playwright/test';

/** README demo clips (e2e/demo/*.demo.ts); not part of the e2e tests. */
export default defineConfig({
  testDir: './e2e/demo',
  testMatch: '*.demo.ts',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
});
