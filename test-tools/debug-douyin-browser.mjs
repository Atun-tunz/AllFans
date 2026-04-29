import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/XuHaoYang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const extensionPath = path.resolve('dist/chrome');
const userDataDir = path.resolve('C:/tmp/allfans-douyin-debug-profile');

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chrome',
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`
  ]
});

const page = await context.newPage();
page.on('console', msg => console.log(`[page:${msg.type()}] ${msg.text()}`));
page.on('pageerror', error => console.log(`[pageerror] ${error.message}`));

await page.goto('https://creator.douyin.com/creator-micro/content/manage', {
  waitUntil: 'domcontentloaded'
});

console.log('Opened debug Chrome with AllFans loaded. Log in if needed, reproduce sync, and keep this terminal running.');
await new Promise(() => {});
