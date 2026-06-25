import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome']
  },
  webServer: [
    {
      command: 'DOTNET_ROLL_FORWARD=Major dotnet run --project ../canvas-backend/src/Whiteboard.Api/Whiteboard.Api.csproj --urls http://localhost:8080',
      url: 'http://localhost:8080/api/boards',
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    },
    {
      command: 'npm run start -- --host 127.0.0.1',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    }
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
