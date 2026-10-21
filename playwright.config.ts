import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// e2e на headless Chromium с WebGL. В CI браузер ставит `npx playwright install chromium` и WebGL идёт через SwiftShader;
// на своей машине можно взять установленный Chrome: $env:CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
const ci = !!process.env.CI;
// PW_PORT — другой порт предпросмотра (несколько рабочих копий на одной машине)
const port = process.env.PW_PORT || '4173';
// Локально тесты идут на видеокарте: берём установленный Chrome ($CHROME или стандартные пути). Без него — встроенный Chromium с программным GL.
const CHROMES = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'];
const chrome = process.env.CHROME || (ci ? '' : CHROMES.find((p) => existsSync(p)) ?? '');
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: ci ? 1 : 0,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      ...(chrome ? { executablePath: chrome } : {}),
      args: ci ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] : ['--ignore-gpu-blocklist'],
    },
  },
  webServer: { command: port === '4173' ? 'npm run preview' : `npx vite preview --port ${port} --strictPort`, url: `http://localhost:${port}`, reuseExistingServer: !ci, timeout: 60_000 },
});
