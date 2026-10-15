// Mede se o menu lateral cabe sem rolar em alturas comuns de tela. Uso: node dev/check-menu.mjs [--root]
import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { respond } from './fixtures.mjs';
const ROOT = new URL('..', import.meta.url).pathname;
const SITE = 'https://iptvquantic.github.io/Claude_crypto_hub7.0/';
const BASE = process.argv.includes('--root') ? '' : 'beta/';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setRequestInterception(true);
page.on('request', (r) => {
  const url = r.url();
  if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: CORS });
  if (url.startsWith(SITE)) { const rel = decodeURIComponent(url.slice(SITE.length).split(/[?#]/)[0]) || 'index.html'; const f = join(ROOT, rel); if (existsSync(f) && statSync(f).isFile()) return r.respond({ status: 200, contentType: TYPES[extname(f)] || 'application/octet-stream', body: readFileSync(f) }); return r.respond({ status: 404, body: '' }); }
  if (url.startsWith('data:')) return r.continue();
  const res = respond(url, r.method(), r.postData() || '', { pipeline: true, headers: r.headers() });
  if (res) return r.respond({ status: res.status, contentType: res.contentType, body: res.body, headers: res.headers || CORS });
  return r.abort('blockedbyclient');
});
let worst = 0;
for (const [w, h] of [[1366, 657], [1440, 789], [1536, 730], [1280, 600], [1920, 950]]) {
  await page.setViewport({ width: w, height: h });
  await page.goto(SITE + BASE + 'index.html?w=' + w + 'x' + h + '#/dash', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1500));
  const m = await page.evaluate(() => { const sb = document.querySelector('#sb'); const last = [...sb.querySelectorAll('.sb-i')].pop().getBoundingClientRect(); return { sh: sb.scrollHeight, ch: sb.clientHeight, lastBottom: Math.round(last.bottom), vh: innerHeight, items: sb.querySelectorAll('.sb-i').length }; });
  if (w === 1366) await page.screenshot({ path: join(ROOT, 'dev/out/menu-1366x657.png') });
  const over = m.sh - m.ch; worst = Math.max(worst, over);
  // conta de admin tem 1 item a mais (Painel do administrador)
  const adm = await page.evaluate(() => { const sb = document.querySelector('#sb'); const it = [...sb.querySelectorAll('.sb-i')].pop(); it.after(it.cloneNode(true)); return sb.scrollHeight - sb.clientHeight; });
  worst = Math.max(worst, adm);
  console.log(`${w}×${h}: menu ${m.sh}px / espaço ${m.ch}px · ${m.items} itens · ${over > 0 ? 'ROLA ' + over + 'px' : 'cabe'} · com admin: ${adm > 0 ? 'ROLA ' + adm + 'px' : 'cabe'}`);
}
await browser.close();
process.exit(worst > 0 ? 1 : 0);
