import { defineConfig, devices } from '@playwright/test';
import chromium from '@sparticuz/chromium';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    launchOptions: process.env.CHROMIUM_EXECUTABLE
      ? {
          executablePath: process.env.CHROMIUM_EXECUTABLE,
          args: chromium.args.filter((arg) => arg !== '--single-process'),
        }
      : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: process.env.E2E_EXTERNAL
    ? undefined
    : [
        {
          command: 'pnpm --filter @bingo/web dev',
          env: { NODE_ENV: 'development' },
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
        },
        {
          command: 'pnpm --filter @bingo/admin dev',
          env: { NODE_ENV: 'development' },
          url: 'http://localhost:3001',
          reuseExistingServer: !process.env.CI,
        },
      ],
});
