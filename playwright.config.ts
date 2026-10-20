import { defineConfig } from '@playwright/test';

// e2e на headless Chromium с WebGL. В CI браузер ставит `npx playwright install chromium` и WebGL идёт через SwiftShader;
// на своей машине можно взять установленный Chrome: $env:CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
const ci = !!process.env.CI;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: ci ? 1 : 0,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
      args: ci ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] : ['--ignore-gpu-blocklist'],
    },
  },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: !ci, timeout: 60_000 },
});
