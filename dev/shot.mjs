// Captura de tela de uma página com as APIs simuladas (para revisar o visual).
// Uso: node dev/shot.mjs <página> [--admin|--user] [--mobile] [--theme light] [--vault N] [--robot ok|notoken|missing] [--sel CSS] [--tall 8000] [--wait ms] [--root]
// Saída: dev/out/shot-<página>[-mobile][-tema].png
import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { respond, makeSupabase } from './fixtures.mjs';
const ROOT = new URL('..', import.meta.url).pathname;
const SITE = 'https://iptvquantic.github.io/Claude_crypto_hub7.0/';
const OUT = join(ROOT, 'dev/out'); mkdirSync(OUT, { recursive: true });
const A = process.argv.slice(2);
const arg = (k, d = null) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const pg = A[0] || 'dash', mobile = A.includes('--mobile'), theme = arg('--theme'), sel = arg('--sel');
const who = A.includes('--admin') ? 'admin' : A.includes('--user') || A.includes('--vault') ? 'user' : null;
const BASE = A.includes('--root') ? '' : 'beta/';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const supa = who ? makeSupabase({ admin: who === 'admin', plan: 'trial' }) : null;
if (supa && arg('--robot') === 'missing') supa.db.robotMissing = true;
if (supa && arg('--robot') === 'ok') { supa.db.robotTokenAt = new Date(Date.now() - 3 * 3600e3).toISOString(); supa.db.robotLast = { at: new Date(Date.now() - 4 * 60e3).toISOString(), origem: 'agendador', status: 204, error: null, body: '' }; }
if (supa && arg('--vault')) { const { seedVault } = await import('./vault-fixtures.mjs'); supa.db.entries.push(...seedVault(+arg('--vault'), supa.uid)); }
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=pt-BR'] });
const page = await browser.newPage();
await page.emulateTimezone('America/Sao_Paulo');
const tall = +(arg('--tall') || 0); // altura da janela (para capturar a página inteira de uma vez)
await page.setViewport(mobile ? { width: 390, height: tall || 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { width: 1280, height: tall || 900 });
await page.setRequestInterception(true);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  const url = r.url();
  if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: CORS });
  if (url.startsWith(SITE)) { const rel = decodeURIComponent(url.slice(SITE.length).split(/[?#]/)[0]) || 'index.html'; const file = join(ROOT, rel); if (existsSync(file) && statSync(file).isFile()) return r.respond({ status: 200, contentType: TYPES[extname(file)] || 'application/octet-stream', body: readFileSync(file) }); return r.respond({ status: 404, body: '' }); }
  if (url.startsWith('data:')) return r.continue();
  const res = respond(url, r.method(), r.postData() || '', { pipeline: true, supabase: supa, headers: r.headers() });
  if (res) return r.respond({ status: res.status, contentType: res.contentType, body: res.body, headers: res.headers || CORS });
  return r.abort('blockedbyclient');
});
if (theme) await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('nx3:theme', JSON.stringify(t)); } catch {} }, theme);
await page.goto(SITE + BASE + 'index.html#/dash', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
if (supa) {
  await page.click('#acct .acct-btn'); await new Promise((r) => setTimeout(r, 400));
  await page.type('#au-email', who === 'admin' ? 'dono@teste.com' : 'cliente@teste.com'); await page.type('#au-pass', 'senha1234'); await page.click('#au-go');
  await new Promise((r) => setTimeout(r, 2500));
}
await page.evaluate((p) => { location.hash = '#/' + p; }, pg);
await new Promise((r) => setTimeout(r, +(arg('--wait') || 6000)));
const name = `shot-${pg}${mobile ? '-mobile' : ''}${theme ? '-' + theme : ''}${sel ? '-' + sel.replace(/[^a-z0-9]+/gi, '') : ''}.png`;
if (sel) { const el = await page.$(sel); if (el) await el.screenshot({ path: join(OUT, name) }); else console.log('seletor não encontrado: ' + sel); }
else await page.screenshot({ path: join(OUT, name), fullPage: true });
console.log(join(OUT, name), errors.length ? 'ERROS: ' + errors.join(' | ') : '');
await browser.close();
