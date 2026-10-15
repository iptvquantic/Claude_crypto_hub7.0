// Captura o Dashboard e o Top 100 num tema (para revisar contraste). Uso: node dev/shot-theme.mjs light
import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { respond } from './fixtures.mjs';
const ROOT = new URL('..', import.meta.url).pathname;
const SITE = 'https://iptvquantic.github.io/Claude_crypto_hub7.0/';
const OUT = join(ROOT, 'dev/out'); mkdirSync(OUT, { recursive: true });
const theme = process.argv[2] || 'light';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=pt-BR'] });
const page = await browser.newPage();
await page.emulateTimezone('America/Sao_Paulo');
await page.setViewport({ width: 1280, height: 900 });
await page.setRequestInterception(true);
page.on('request', (r) => {
  const url = r.url();
  if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: CORS });
  if (url.startsWith(SITE)) { const rel = decodeURIComponent(url.slice(SITE.length).split(/[?#]/)[0]) || 'index.html'; const file = join(ROOT, rel); if (existsSync(file) && statSync(file).isFile()) return r.respond({ status: 200, contentType: TYPES[extname(file)] || 'application/octet-stream', body: readFileSync(file) }); return r.respond({ status: 404, body: '' }); }
  if (url.startsWith('data:')) return r.continue();
  const res = respond(url, r.method(), r.postData() || '', { pipeline: true, headers: r.headers() });
  if (res) return r.respond({ status: res.status, contentType: res.contentType, body: res.body, headers: res.headers || CORS });
  return r.abort('blockedbyclient');
});
await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('nx3:theme', JSON.stringify(t)); } catch {} }, theme);
for (const pg of ['dash', 'top100']) {
  await page.goto(SITE + 'beta/index.html#/' + pg, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 4500));
  await page.screenshot({ path: join(OUT, `theme-${theme}-${pg}.png`) });
  if (pg === 'dash') { const el = await page.$('#d-fng'); if (el) await el.screenshot({ path: join(OUT, `theme-${theme}-fng.png`) }); }
}
console.log('tema aplicado:', await page.evaluate(() => document.documentElement.dataset.theme));
await browser.close();
