import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const testDatabaseSchema = 'test_' + randomUUID().replaceAll('-', '');
export default defineConfig({
  testDir: './tests/e2e',
  metadata: { testDatabaseSchema },
  globalTeardown: './scripts/cleanup-e2e.mjs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:3330', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'node scripts/start-e2e.mjs',
    env: { CAT_CARE_E2E_SCHEMA: testDatabaseSchema },
    url: 'http://127.0.0.1:3330/api/account/options',
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
