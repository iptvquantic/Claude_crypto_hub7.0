// Teste de fumaça do NEXUS HUB num Chromium de verdade, com as APIs simuladas (dev/fixtures.mjs).
// Abre todas as páginas no computador e no celular, procura erro de JavaScript, violação de CSP,
// número quebrado (NaN/undefined), rolagem lateral e testa conta + Vault + admin.
// Uso: node dev/test-app.mjs [--root] [--shots]   (padrão: testa beta/index.html)
import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { respond, makeSupabase } from './fixtures.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const SITE = 'https://iptvquantic.github.io/Claude_crypto_hub7.0/';
const OUT = join(ROOT, 'dev/out'); mkdirSync(OUT, { recursive: true });
const BASE = process.argv.includes('--root') ? '' : 'beta/';
const SHOTS = process.argv.includes('--shots');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const PAGES = ['dash', 'chart', 'top100', 'markets', 'onchain', 'lab', 'tokenomics', 'etf', 'whales', 'macro', 'agenda', 'poly', 'news', 'geo', 'vault', 'plans', 'settings'];
const fails = [];
const ok = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ruído do ambiente de teste: WebSocket sem rede e service worker (o interceptador do teste não serve scripts de SW)
const NOISE = /WebSocket connection|Failed to load resource|net::ERR_|ERR_BLOCKED|favicon|fetching the script/i;

async function open({ width = 1280, height = 860, hash = '#/dash', pipeline = true, supa = null, storage = {}, mobile = false } = {}) {
  const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=pt-BR', '--disable-background-networking', '--disable-component-update', '--no-first-run'] });
  const page = await browser.newPage();
  await page.emulateTimezone('America/Sao_Paulo');
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const errors = [], unhandled = [];
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 300)));
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const url = r.url();
    if (r.isInterceptResolutionHandled()) return;
    if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: CORS });
    if (url.startsWith(SITE)) {
      const rel = decodeURIComponent(url.slice(SITE.length).split(/[?#]/)[0]) || 'index.html';
      let file = join(ROOT, rel.endsWith('/') ? rel + 'index.html' : rel);
      if (existsSync(file) && statSync(file).isFile()) return r.respond({ status: 200, contentType: TYPES[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
      return r.respond({ status: 404, contentType: 'text/plain', body: 'not found' });
    }
    if (url.startsWith('data:')) return r.continue();
    const res = respond(url, r.method(), r.postData() || '', { pipeline, supabase: supa, headers: r.headers() });
    if (res) return r.respond({ status: res.status, contentType: res.contentType, body: res.body, headers: res.headers || CORS });
    unhandled.push(r.method() + ' ' + url.slice(0, 140));
    return r.abort('blockedbyclient');
  });
  await page.evaluateOnNewDocument((st) => {
    try { if (!sessionStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); } } catch { /* */ }
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  }, storage);
  await page.goto(SITE + BASE + 'index.html' + hash, { waitUntil: 'domcontentloaded' });
  return { browser, page, errors, unhandled };
}
// procura texto quebrado na página visível + rolagem lateral + carregamentos eternos
async function inspect(page) {
  return page.evaluate(() => {
    const pg = document.querySelector('.pg.on');
    const txt = pg ? pg.innerText : '';
    const bad = (txt.match(/\b(NaN|undefined|Infinity|null)\b|\[object Object\]/g) || []);
    const where = []; if (bad.length && pg) { const w = document.createTreeWalker(pg, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (/\b(NaN|undefined|Infinity|null)\b|\[object Object\]/.test(n.nodeValue)) where.push((n.parentElement.closest('[id]') || {}).id + ':' + n.parentElement.className + ':' + n.nodeValue.trim().slice(0, 50)); }
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    const wide = []; if (overflow) document.querySelectorAll('.pg.on *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.right > window.innerWidth + 2 && !el.closest('.tbl-wrap,.seg-scroll,.hm,#ticker')) wide.push(el.className || el.tagName); });
    return { title: document.title, bad: bad.length ? bad.concat(where.slice(0, 4)) : bad, overflow, wide: [...new Set(wide)].slice(0, 6), skel: pg ? pg.querySelectorAll('.skel').length : -1, csp: window.__csp, audit: (typeof nxAudit === 'function' ? nxAudit() : []).map((i) => i.text) };
  });
}
// print da página inteira: libera a rolagem interna só durante o print
const shot = async (page, name, full = true) => {
  if (!SHOTS) return;
  if (!full) { await page.screenshot({ path: join(OUT, name + '.png') }); return; }
  await page.evaluate(() => { const s = document.createElement('style'); s.id = '__shot'; s.textContent = 'html,body{overflow:visible!important;height:auto!important}.app{display:block!important;height:auto!important}#sb{display:none!important}#ticker,#hdr{position:static!important}#main{overflow:visible!important;height:auto!important}'; document.head.appendChild(s); });
  const dims = await page.evaluate(() => [document.documentElement.scrollHeight, getComputedStyle(document.querySelector('.app')).display, getComputedStyle(document.body).overflow]);
  if (process.env.NX_DEBUG) console.log('    shot', name, dims);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await sleep(150);
  await page.screenshot({ path: join(OUT, name + '.png'), fullPage: true });
  await page.evaluate(() => document.getElementById('__shot')?.remove());
};
async function goPage(page, id, wait = 2200) { await page.evaluate((i) => { location.hash = '#/' + i; }, id); await sleep(wait); }

// ---------- 1. visitante, computador: todas as páginas ----------
console.log('\n[1] Visitante · computador · todas as páginas');
{
  const { browser, page, errors, unhandled } = await open({});
  await page.waitForFunction(() => document.querySelectorAll('#d-cards .pc-p').length >= 5 && [...document.querySelectorAll('#d-cards .pc-p')].every((e) => /US\$/.test(e.textContent)), { timeout: 15000 }).catch(() => {});
  await sleep(2500);
  const first = await inspect(page);
  ok(/US\$/.test(await page.$eval('#d-cards .pc-p', (e) => e.textContent).catch(() => '')), 'cards do dashboard mostram preço');
  ok((await page.$$eval('#sb .sb-i', (a) => a.map((x) => x.dataset.page)))[0] === 'dash', 'Dashboard é o 1º item do menu');
  ok(await page.$eval('#sb .sb-i[data-page=dash]', (a) => a.getAttribute('aria-current') === 'page'), 'item atual do menu marcado');
  ok(await page.$eval('#tk-track', (t) => t.children.length > 10).catch(() => false), 'faixa de cotações preenchida');
  ok(await page.evaluate(() => { const r = document.querySelector('#sb .sb-i').getBoundingClientRect(); const h = document.querySelector('#hdr').getBoundingClientRect(); return r.top >= h.bottom - 1; }), 'menu não fica escondido atrás do cabeçalho');
  ok(await page.evaluate(() => { const t = document.querySelector('.pg.on .pg-t').getBoundingClientRect(); const h = document.querySelector('#hdr').getBoundingClientRect(); return t.top >= h.bottom; }), 'título da página visível abaixo do cabeçalho');
  ok(!first.bad.length, `dashboard sem NaN/undefined ${first.bad.join(',')}`);
  await shot(page, 'd-dash');
  for (const id of PAGES.slice(1)) {
    await goPage(page, id, id === 'lab' || id === 'vault' ? 2600 : 2200);
    const r = await inspect(page);
    ok(!r.bad.length && !r.audit.filter((t) => !/fonte atrasada/.test(t)).length, `${id}: sem número quebrado ${r.bad.concat(r.audit).join(' | ')}`);
    if (r.skel > 2) console.log(`    · ${id}: ${r.skel} blocos ainda carregando`);
    await shot(page, 'd-' + id);
  }
  // troca de idioma e tema
  await page.evaluate(() => setLang('en')); await sleep(800);
  ok((await page.$eval('#sb .sb-i[data-page=markets] .lbl', (e) => e.textContent)) === 'Indices & FX', 'idioma EN troca o menu');
  await page.evaluate(() => { setLang('pt'); applyTheme('light'); location.hash = '#/dash'; }); await sleep(1500);
  await shot(page, 'd-dash-light');
  const csp = await page.evaluate(() => window.__csp);
  ok(!csp.length, `sem violação de CSP ${csp.join(' | ')}`);
  ok(!errors.length, `sem erro de JavaScript ${errors.slice(0, 5).join(' || ')}`);
  if (unhandled.length) console.log('    · pedidos sem simulação:', [...new Set(unhandled)].slice(0, 12).join('\n      '));
  await browser.close();
}
// ---------- 2. celular ----------
console.log('\n[2] Visitante · celular (390×844)');
{
  const { browser, page, errors } = await open({ width: 390, height: 844, mobile: true });
  await sleep(3500);
  for (const id of ['dash', 'top100', 'macro', 'agenda', 'news', 'vault', 'plans', 'onchain', 'markets', 'poly', 'chart']) {
    await goPage(page, id, 1800);
    const r = await inspect(page);
    ok(!r.overflow, `${id}: sem rolagem lateral ${r.wide.join(' ')}`);
    await shot(page, 'm-' + id);
  }
  await page.click('#sb-tog'); await sleep(500);
  ok(await page.evaluate(() => document.body.classList.contains('sb-open')), 'botão abre o menu no celular');
  await shot(page, 'm-menu', false);
  await page.click('#sb .sb-i[data-page=agenda]'); await sleep(900);
  ok(await page.evaluate(() => !document.body.classList.contains('sb-open') && location.hash === '#/agenda'), 'menu fecha ao escolher a página');
  ok(!errors.length, `sem erro de JavaScript ${errors.slice(0, 5).join(' || ')}`);
  await browser.close();
}
// ---------- 3. conta em teste: entrar, registrar, editar, excluir aporte ----------
console.log('\n[3] Conta (teste grátis) · Portfolio Vault');
{
  const supa = makeSupabase({ plan: 'trial' });
  const { browser, page, errors } = await open({ supa, hash: '#/vault' });
  await sleep(2500);
  await page.click('#acct .acct-btn'); await sleep(400);
  await page.type('#au-email', 'cliente@teste.com'); await page.type('#au-pass', 'senha1234');
  await page.click('#au-go'); await sleep(2500);
  ok(await page.evaluate(() => ACCOUNT.state === 'user' && ACCOUNT.pro), 'login funcionou e plano de teste é PRO');
  ok(await page.$eval('#acct .nm', (e) => /Cliente/.test(e.textContent)).catch(() => false), 'nome aparece no cabeçalho');
  await page.waitForSelector('[data-act=vaultAdd]', { timeout: 8000 }).catch(() => {});
  await page.click('[data-act=vaultAdd]'); await sleep(500);
  await page.click('#vf-coin'); await sleep(500);
  await page.click('#cp-list [data-k=b]'); await sleep(600);
  await page.type('#vf-qty', '0.01'); await page.type('#vf-amt', '4500');
  await sleep(300);
  ok(/Preço unitário/.test(await page.$eval('#vf-prev', (e) => e.textContent)), 'prévia do preço unitário aparece');
  await page.click('#vf-save'); await sleep(2500);
  ok(supa.db.entries.length === 1 && supa.db.entries[0].sym === 'BTC' && supa.db.entries[0].amount_brl === 4500, 'aporte gravado no servidor (simulado)');
  ok(await page.$eval('#v-val', (e) => /R\$/.test(e.textContent)).catch(() => false), 'patrimônio calculado em R$');
  // venda parcial
  await page.click('[data-act=vaultAdd]'); await sleep(500);
  await page.click('#vf .seg button[data-v=sell]');
  await page.click('#vf-coin'); await sleep(400); await page.click('#cp-list [data-k=b]'); await sleep(500);
  await page.type('#vf-qty', '0.004'); await page.type('#vf-amt', '2200'); await page.click('#vf-save'); await sleep(2500);
  ok(supa.db.entries.length === 2 && supa.db.entries[1].type === 'sell', 'venda registrada');
  const realized = await page.evaluate(() => totals(holdings()).real);
  ok(Math.abs(realized - (2200 - 4500 * 0.4)) < 1, `lucro realizado pelo custo médio (${realized})`);
  await shot(page, 'v-vault');
  // excluir e desfazer
  page.on('dialog', (d) => d.accept());
  await page.click('[data-act=vaultDel]'); await sleep(500);
  await page.click('#scrim [data-k=yes]'); await sleep(1500);
  ok(supa.db.entries.filter((e) => !e.removed_at).length === 1, 'lançamento excluído');
  await page.click('#toasts .act'); await sleep(1500);
  ok(supa.db.entries.filter((e) => !e.removed_at).length === 2, 'desfazer restaura o lançamento');
  // exportar CSV não quebra
  await page.evaluate(() => ACT.vaultCsv()); await sleep(300);
  ok(!errors.length, `sem erro de JavaScript ${errors.slice(0, 5).join(' || ')}`);
  await browser.close();
}
// ---------- 4. teste vencido: Vault só leitura, Lab bloqueado ----------
console.log('\n[4] Conta com teste vencido');
{
  const supa = makeSupabase({ plan: 'expired' });
  supa.db.entries.push({ id: 'x1', user_id: supa.uid, type: 'buy', asset_id: 'bitcoin', sym: 'BTC', name: 'Bitcoin', binance_sym: 'BTCUSDT', date: '2025-01-10', qty: '0.02', amount_usd: '1900', amount_brl: '11500', fx_brl: '6.05', currency: 'BRL', fee: '0', created_at: '2025-01-10T10:00:00Z', updated_at: '2025-01-10T10:00:00Z' });
  const { browser, page, errors } = await open({ supa, hash: '#/lab' });
  await sleep(2000);
  await page.click('#acct .acct-btn'); await sleep(300);
  await page.type('#au-email', 'cliente@teste.com'); await page.type('#au-pass', 'senha1234'); await page.click('#au-go'); await sleep(2500);
  ok(await page.$eval('#pg-lab', (e) => /Teste encerrado|Ver planos/.test(e.innerText)).catch(() => false), 'Lab mostra bloqueio com "ver planos"');
  await goPage(page, 'vault', 3000);
  ok(await page.$eval('#pg-vault', (e) => /continuam salvos/.test(e.innerText) && /BTC/.test(e.innerText)).catch(() => false), 'Vault mostra os dados em modo leitura');
  ok(await page.$eval('[data-act=vaultAdd]', (b) => b.disabled).catch(() => false), 'botão de novo aporte desativado');
  ok(!errors.length, `sem erro de JavaScript ${errors.slice(0, 5).join(' || ')}`);
  await browser.close();
}
// ---------- 5. administrador ----------
console.log('\n[5] Administrador');
{
  const supa = makeSupabase({ admin: true });
  const { browser, page, errors } = await open({ supa, hash: '#/dash' });
  await sleep(2000);
  await page.click('#acct .acct-btn'); await sleep(300);
  await page.type('#au-email', 'dono@teste.com'); await page.type('#au-pass', 'senha1234'); await page.click('#au-go'); await sleep(2500);
  ok(await page.$('#sb .sb-i[data-page=admin]') !== null, 'menu mostra o Painel do administrador');
  await goPage(page, 'admin', 2500);
  ok(await page.$eval('#pg-admin', (e) => /pagou@teste\.com/.test(e.innerText)).catch(() => false), 'pedidos e usuários aparecem');
  await shot(page, 'a-admin');
  ok(!errors.length, `sem erro de JavaScript ${errors.slice(0, 5).join(' || ')}`);
  await browser.close();
}
// ---------- 6. robô fora do ar: páginas usam as fontes diretas ----------
console.log('\n[6] Sem os arquivos do robô (fallback)');
{
  const { browser, page, errors } = await open({ pipeline: false, hash: '#/news' });
  await sleep(4000);
  ok(await page.$$eval('#news-list .nc', (a) => a.length > 5).catch(() => false), 'notícias carregam direto das fontes');
  await goPage(page, 'markets', 2500);
  ok(await page.$eval('#mk-quotes', (e) => /ainda não disponíveis|Carregando|robô/.test(e.innerText) || e.querySelector('.skel')).catch(() => false), 'bolsas mostram aviso honesto (sem número inventado)');
  ok(!errors.length, `sem erro de JavaScript ${errors.slice(0, 5).join(' || ')}`);
  await browser.close();
}
console.log(`\n${fails.length ? '✗ ' + fails.length + ' falha(s)' : '✓ tudo certo'}`);
process.exit(fails.length ? 1 : 0);
