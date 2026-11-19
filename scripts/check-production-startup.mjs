import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';

const host = 'http://127.0.0.1:4188';
const url = host + '/nuestro-hogar/';
const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4188', '--strictPort'], {stdio: ['ignore', 'pipe', 'pipe']});
let serverOutput = '';
child.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
child.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
let browser;
try {
  let ready = false;
  for (let n = 0; n < 40; n++) {
    try {
      const response = await fetch(url);
      if (response.ok) { ready = true; break; }
    } catch { /* preview is starting */ }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  if (!ready) throw Error('Production preview did not start: ' + serverOutput);
  browser = await chromium.launch({headless: true});
  const context = await browser.newContext({serviceWorkers: 'block'});
  const page = await context.newPage();
  const errors = [], failed = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failed.push(request.url() + ' ' + (request.failure()?.errorText || '')));
  const response = await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(7000);
  const body = await page.locator('body').innerText();
  console.log('Production startup status:', response.status());
  console.log('Production startup body:', body.slice(0, 500));
  console.log('JavaScript errors:', JSON.stringify(errors.slice(0, 12)));
  console.log('Failed requests:', JSON.stringify(failed.slice(0, 12)));
  if (!body.includes('Bienvenido a casa')) {
    throw Error('Production login did not render. ' + body.slice(0, 500) + '\nJS: ' + JSON.stringify(errors.slice(0, 8)));
  }
  console.log('Production startup smoke passed');
} finally {
  if (browser) await browser.close();
  child.kill('SIGTERM');
}
