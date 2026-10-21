// Общий выбор Chrome для инструментов с браузером: $CHROME, иначе установленный Chrome (рисует на видеокарте), иначе Chromium из Playwright.
import { existsSync } from 'node:fs';

const CHROMES = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'];
export const chromeExe = () => process.env.CHROME || CHROMES.find((p) => existsSync(p)) || undefined;