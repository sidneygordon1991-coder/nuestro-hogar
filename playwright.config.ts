import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.mjs',
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', {open: 'never'}]],
  use: {
    headless: true,
    serviceWorkers: 'block',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        }
      : {}
  },
  webServer: {
    command: 'npm run build:e2e && npm run preview -- --outDir dist-e2e --host 127.0.0.1 --port 4173 --strictPort',
    timeout: 120000,
    url: 'http://127.0.0.1:4173/nuestro-hogar/',
    reuseExistingServer: false
  }
});
