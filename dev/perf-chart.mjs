// Mede a fluidez de um gráfico ao arrastar (APIs simuladas, Chromium sem GPU: compare antes × depois).
// Uso: node dev/perf-chart.mjs [lab|chart|tokenomics|vault] [--root]
// Mostra: quadros durante o arraste, tempo médio e pior quadro, tarefas longas (> 50 ms) e o tempo de cada
// evento de mouse (do movimento até a tela estar pronta para o próximo).
import puppeteer from 'puppeteer-core';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { respond, makeSupabase } from './fixtures.mjs';
const ROOT = new URL('..', import.meta.url).pathname;
const SITE = 'https://iptvquantic.github.io/Claude_crypto_hub7.0/';
const A = process.argv.slice(2);
const pg = A[0] || 'lab', BASE = A.includes('--root') ? '' : 'beta/';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const supa = makeSupabase({ admin: false, plan: 'trial' });
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=pt-BR'] });
const page = await browser.newPage();
await page.emulateTimezone('America/Sao_Paulo');
await page.setViewport({ width: 1440, height: 1000 });
await page.setRequestInterception(true);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  const url = r.url();
  if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: CORS });
  if (url.startsWith(SITE)) {
    const rel = decodeURIComponent(url.slice(SITE.length).split(/[?#]/)[0]) || 'index.html'; const file = join(ROOT, rel);
    if (existsSync(file) && statSync(file).isFile()) return r.respond({ status: 200, contentType: TYPES[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
    return r.respond({ status: 404, body: '' });
  }
  if (url.startsWith('data:')) return r.continue();
  const res = respond(url, r.method(), r.postData() || '', { pipeline: true, supabase: supa, headers: r.headers() });
  if (res) return r.respond({ status: res.status, contentType: res.contentType, body: res.body, headers: res.headers || CORS });
  return r.abort('blockedbyclient');
});
// Lab: velas + dois painéis (MVRV Z-Score e MVRV), como na tela do dono
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem('nx3:lab3', JSON.stringify({ sel: ['sthRP', 'realized', 'sma200w', 'mvrvZ', 'mvrv'], kind: 'candle', range: '4y', log: true })); } catch { /* */ }
});
await page.goto(SITE + BASE + 'index.html#/dash', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
await page.click('#acct .acct-btn'); await new Promise((r) => setTimeout(r, 400));
await page.type('#au-email', 'cliente@teste.com'); await page.type('#au-pass', 'senha1234'); await page.click('#au-go');
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate((p) => { location.hash = '#/' + p; }, pg);
await new Promise((r) => setTimeout(r, 9000));
const SEL = { lab: '#lab-chart', chart: '#ch-box', tokenomics: '#tk-px', vault: '#v-asset' }[pg] || '#lab-chart';
const box = await page.$(SEL);
if (!box) { console.log('não achei ' + SEL, errors.join(' | ')); await browser.close(); process.exit(1); }
await box.scrollIntoView();
await new Promise((r) => setTimeout(r, 800));
const bb = await box.boundingBox();
const info = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return { charts: document.querySelectorAll('.tv-lightweight-charts').length, canvases: el ? el.querySelectorAll('canvas').length : 0 };
}, SEL);
await page.evaluate(() => {
  window.__pf = { frames: [], long: [], ev: [] };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__pf.long.push(e.duration); }).observe({ type: 'longtask', buffered: false }); } catch { /* */ }
  let last = performance.now();
  const loop = (t) => { window.__pf.frames.push(t - last); last = t; if (window.__pf.on) requestAnimationFrame(loop); };
  window.__pf.on = true; requestAnimationFrame(loop);
});
// arrasta para a direita e volta (60 passos de 8 px), depois passa o mouse por cima (hover)
const cx = bb.x + bb.width * 0.55, cy = bb.y + bb.height * 0.45;
const prof = A.includes('--prof') ? await page.target().createCDPSession() : null;
if (prof) { await prof.send('Profiler.enable'); await prof.send('Profiler.setSamplingInterval', { interval: 200 }); await prof.send('Profiler.start'); }
await page.mouse.move(cx, cy);
await page.mouse.down();
const t0 = Date.now();
for (let i = 1; i <= 60; i++) { const s = Date.now(); await page.mouse.move(cx + (i <= 30 ? i : 60 - i) * 8, cy + Math.sin(i / 6) * 20); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); }
await page.mouse.up();
for (let i = 1; i <= 40; i++) { await page.mouse.move(cx - 200 + i * 10, cy + Math.cos(i / 5) * 60); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); }
const ms = Date.now() - t0;
if (prof) {
  // --prof: as 25 funções que mais gastaram tempo (tempo próprio) durante o arraste
  const { profile } = await prof.send('Profiler.stop');
  const self = new Map(); const dt = profile.timeDeltas || []; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  (profile.samples || []).forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const k = `${f.functionName || '(anônima)'} ${f.url.split('/').pop().slice(0, 40)}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000); });
  console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`).join('\n'));
}
const pf = await page.evaluate(() => { window.__pf.on = false; return window.__pf; });
const fr = pf.frames.slice(2);
const avg = fr.reduce((a, b) => a + b, 0) / Math.max(1, fr.length);
const worst = Math.max(...fr);
const longSum = pf.long.reduce((a, b) => a + b, 0);
console.log(JSON.stringify({ page: pg, ...info, steps: 100, totalMs: ms, msPerStep: +(ms / 100).toFixed(1), frames: fr.length, avgFrame: +avg.toFixed(1), worstFrame: +worst.toFixed(1), longTasks: pf.long.length, longTaskMs: Math.round(longSum), errors }));
await browser.close();
