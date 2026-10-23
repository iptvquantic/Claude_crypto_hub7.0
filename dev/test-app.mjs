// Teste de fumaça do NEXUS HUB num Chromium de verdade, com as APIs simuladas (dev/fixtures.mjs).
// Abre todas as páginas no computador e no celular, procura erro de JavaScript, violação de CSP,
// número quebrado (NaN/undefined), rolagem lateral e testa conta + Vault + admin.
// Uso: node dev/test-app.mjs [--root] [--shots]   (padrão: testa beta/index.html)
import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { respond, makeSupabase, WT } from './fixtures.mjs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SITE = 'https://iptvquantic.github.io/Claude_crypto_hub7.0/';
const OUT = join(ROOT, 'dev/out'); mkdirSync(OUT, { recursive: true });
const BASE = process.argv.includes('--root') ? '' : 'beta/';
const SHOTS = process.argv.includes('--shots');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const PAGES = ['dash', 'chart', 'top100', 'markets', 'onchain', 'lab', 'tokenomics', 'buybacks', 'etf', 'whales', 'macro', 'agenda', 'poly', 'news', 'geo', 'wallets', 'vault', 'plans', 'settings'];
const fails = [];
const ok = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ruído do ambiente de teste: WebSocket sem rede e service worker (o interceptador do teste não serve scripts de SW)
const NOISE = /WebSocket connection|Failed to load resource|net::ERR_|ERR_BLOCKED|favicon|fetching the script/i;

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
async function open({ width = 1280, height = 860, hash = '#/dash', pipeline = true, supa = null, storage = {}, mobile = false } = {}) {
  const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=pt-BR', '--disable-background-networking', '--disable-component-update', '--no-first-run'] });
  const page = await browser.newPage();
  await page.emulateTimezone('America/Sao_Paulo');
  if (mobile) await page.setUserAgent(ANDROID_UA);
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

console.log('\n[1b] Gráfico: mira livre, arrastar na vertical, médias à escolha e RSI');
{
  const { browser, page, errors } = await open({ hash: '#/chart' });
  await page.waitForFunction(() => window.CH && CH.cs && document.querySelector('#ch-box canvas'), { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  ok(await page.evaluate(() => CH.ch.options().crosshair.mode === 0), 'mira livre: o preço segue o mouse (não gruda na vela)');
  ok(await page.$('#ch-rsi canvas') !== null, 'RSI 14 aparece em painel próprio');
  const r0 = await page.evaluate(() => { const ps = CH.ch.priceScale('right'); return CH.cs.coordinateToPrice(200); });
  const bx = await (await page.$('#ch-box')).boundingBox();
  await page.mouse.move(bx.x + bx.width / 2, bx.y + 200); await page.mouse.down(); await page.mouse.move(bx.x + bx.width / 2, bx.y + 260, { steps: 6 }); await page.mouse.move(bx.x + bx.width / 2, bx.y + 320, { steps: 6 }); await page.mouse.up(); await sleep(300);
  const r1 = await page.evaluate(() => CH.cs.coordinateToPrice(200));
  ok(Math.abs(r1 - r0) / r0 > 0.001 && await page.evaluate(() => CH.auto === false), `arrastar para baixo move o preço (${r0?.toFixed?.(0)} → ${r1?.toFixed?.(0)}) e desliga o Auto`);
  await page.click('#ch-auto'); await sleep(300);
  ok(await page.evaluate(() => CH.auto === true && CH.ch.priceScale('right').options().autoScale === true), 'botão Auto volta ao ajuste automático');
  await page.mouse.move(bx.x + bx.width / 2, bx.y + 200); await page.mouse.down(); await page.mouse.move(bx.x + bx.width / 2 - 120, bx.y + 202, { steps: 8 }); await page.mouse.up(); await sleep(300);
  ok(await page.evaluate(() => CH.auto === true), 'arrastar só para os lados mantém o Auto');
  const n0 = await page.$$eval('#ch-ind .ch-ma', (a) => a.length);
  await page.click('[data-act=chMaAdd]'); await sleep(600);
  ok(await page.$$eval('#ch-ind .ch-ma', (a) => a.length) === n0 + 1, 'botão + adiciona outra média');
  await page.evaluate(() => { const i = [...document.querySelectorAll('#ch-ind .ch-ma-n')].pop(); i.value = ''; i.focus(); });
  await page.keyboard.type('33'); await page.keyboard.press('Enter'); await sleep(700);
  ok(await page.evaluate(() => CH.mas.some((m) => m.n === 33)), 'digitar o período muda a média (33)');
  await page.mouse.move(bx.x + bx.width * 0.6, bx.y + 150); await sleep(400);
  ok(await page.$eval('#ch-legend', (e) => /MM 33/.test(e.innerText) && e.querySelector('.lg-h') && e.querySelector('.lg-l')), 'legenda mostra a média nova e Máx/Mín coloridos');
  await page.click('#ch-ind .ch-ma-t'); await sleep(600);
  ok(await page.evaluate(() => CH.mas[0].t === 'ema'), 'troca MM ↔ MME');
  await page.click('#ch-ind [data-act=chMaDel]'); await sleep(600);
  ok(await page.$$eval('#ch-ind .ch-ma', (a) => a.length) === n0, 'remover média');
  await page.click('[data-act=chTog][data-k=rsi]'); await sleep(600);
  ok(await page.$eval('#ch-rsi-wrap', (e) => e.style.display === 'none'), 'RSI liga/desliga');
  await page.click('[data-act=chTog][data-k=rsi]'); await sleep(600);
  const kn0 = await page.evaluate(() => CH.kl.length);
  await page.evaluate(() => { CH.kl[CH.kl.length - 1].ct = Date.now() - 5000; chartLive(); }); await sleep(2000);
  ok(await page.evaluate((n) => CH.kl.length >= n && !!CH.cs && !!document.querySelector('#ch-box canvas'), kn0), 'vela fechada: busca só as novas e mantém o histórico');
  await shot(page, 'd-chart-novo', false);
  const r = await inspect(page); ok(!r.bad.length && !r.overflow, `gráfico sem número quebrado nem rolagem lateral ${r.bad.join(',')}`);
  ok(!errors.length, `sem erro de JavaScript ${errors.slice(0, 5).join(' || ')}`);
  await browser.close();
}

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
  await page.waitForSelector('#d-rsi [data-act=rsiPick][data-i="1"]', { timeout: 8000 }).catch(() => {});
  await page.click('#d-rsi [data-act=rsiPick][data-i="1"]').catch(() => {}); await sleep(500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#cp-list [data-k=b]')].find((x) => /Solana/.test(x.textContent)); if (b) b.click(); }); await sleep(2500);
  ok(await page.$eval('#d-rsi', (e) => /SOL/.test(e.innerText) && !/ETH\b/.test(e.querySelector('.rsi-g:nth-of-type(2)') ? '' : '') && e.querySelectorAll('.rsi-g').length === 2 && /\d+,\d/.test(e.querySelectorAll('.rsi-g')[1].innerText)).catch(() => false), 'Dashboard: RSI troca de moeda (ETH → SOL) e mostra o valor');
  await page.evaluate(() => { localStorage.removeItem('nx3:rsi-coins'); });
  await shot(page, 'd-dash');
  for (const id of PAGES.slice(1)) {
    await goPage(page, id, id === 'lab' || id === 'vault' ? 2600 : 2200);
    const r = await inspect(page);
    ok(!r.bad.length && !r.audit.filter((t) => !/fonte atrasada/.test(t)).length, `${id}: sem número quebrado ${r.bad.concat(r.audit).join(' | ')}`);
    if (r.skel > 2) console.log(`    · ${id}: ${r.skel} blocos ainda carregando`);
    await shot(page, 'd-' + id);
  }
  // On-chain e Baleias: blocos, termômetro, escada de preços, mineração, faixas e top 100
  await goPage(page, 'onchain', 3500);
  ok(await page.$$eval('#oc-blocks .oc-cube', (a) => a.length >= 6).catch(() => false), 'On-chain: fila e blocos minerados');
  ok(await page.$$eval('#oc-thermo .oc-th', (a) => a.length >= 8).catch(() => false), 'On-chain: termômetro do ciclo com 8 indicadores');
  ok(await page.$$eval('#oc-ladder .oc-lr', (a) => a.length >= 6).catch(() => false), 'On-chain: custo médio de cada grupo');
  ok(await page.$('#oc-mchart canvas') !== null, 'On-chain: gráfico de mineração');
  await page.click('#oc-blocks .oc-cube[data-k=m]'); await sleep(300);
  ok(await page.$eval('#oc-bdet', (e) => /Minerado por/.test(e.innerText) && /Subsídio/.test(e.innerText) && e.querySelectorAll('.oc-fees > div').length === 7).catch(() => false), 'On-chain: clicar num bloco minerado mostra os detalhes e a faixa de taxas');
  await page.click('#oc-blocks .oc-cube[data-k=n]'); await sleep(300);
  ok(await page.$eval('#oc-bdet', (e) => /Para entrar neste bloco/.test(e.innerText)).catch(() => false), 'On-chain: clicar num bloco da fila mostra quanto pagar para entrar');
  ok(await page.$$eval('#oc-miners tbody tr', (a) => a.length >= 8 && /Gigante|Grande/.test(a.map((r) => r.innerText).join(' '))).catch(() => false), 'On-chain: mineradoras com cotação, valor de mercado e relevância');
  await goPage(page, 'markets', 2500);
  ok(await page.$$eval('#mk-metal .mk-brl', (a) => a.length >= 3 && a.every((e) => /R\$/.test(e.textContent))).catch(() => false), 'Índices: ouro, prata e PAXG convertidos em reais');
  ok(await page.$$eval('#mk-quotes .mk-brl', (a) => a.length >= 4).catch(() => false), 'Índices: bolsas dos EUA/Europa e commodities com valor em reais');
  ok(await page.$$eval('#mk-fx .mk-card', (a) => a.length >= 9).catch(() => false), 'Índices: mais moedas (iene, yuan, franco…)');
  ok(await page.$$eval('.pg.on .mk-card', (cards) => cards.every((c) => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll('.stamp')].every((st) => { const q = st.getBoundingClientRect(); return q.right <= r.right + 1 && q.left >= r.left - 1; }); })).catch(() => false), 'Índices: selo da fonte nunca sai do card');
  await goPage(page, 'etf', 2500);
  await page.click('#etf-list [data-act=etfAsset][data-k=sol]'); await sleep(400);
  ok(await page.$eval('#etf-list', (e) => /BSOL/.test(e.innerText) && e.querySelectorAll('.etf-stack i').length >= 2).catch(() => false), 'ETFs: escolher Solana mostra os fundos e o gráfico de fatias');
  await page.click('#etf-list [data-act=etfAsset][data-k=btc]'); await sleep(400);
  await page.evaluate(() => { const i = document.querySelector('#etf-date'); const d = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10); i.value = d; i.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(2500);
  ok(await page.$eval('#etf-list', (e) => /Cota em/.test(e.innerText) && /Desde então/.test(e.innerText) && /US\$\s?\d/.test(e.querySelector('tbody tr td:nth-child(7)').innerText)).catch(() => false), 'ETFs: escolher o dia mostra a cota daquele dia');
  await goPage(page, 'buybacks', 2500);
  ok(await page.$eval('#bb-burners', (e) => /Quem mais queima/.test(e.innerText) && e.querySelectorAll('.bb-bar').length >= 1).catch(() => false) && await page.$eval('#bb-buyers', (e) => /Quem mais recompra/.test(e.innerText)).catch(() => false), 'Burn: quem mais queima e quem mais recompra');
  await goPage(page, 'news', 2500);
  ok(await page.$eval('#news-list', (e) => !/&nbsp;|&amp;|&[a-z]+;/.test(e.innerText)).catch(() => false), 'Notícias sem &nbsp; nem códigos HTML no texto');
  await goPage(page, 'whales', 3000);
  ok(await page.$$eval('#wh-dist .wh-tier', (a) => a.length === 6).catch(() => false), 'Baleias: 6 faixas por tamanho de carteira');
  ok(await page.$$eval('#wh-top tbody tr', (a) => a.length >= 20).catch(() => false), 'Baleias: 100 maiores endereços');
  // Burn, Baby, Burn: tabela por token, filtros e detalhe
  await goPage(page, 'buybacks', 3000);
  ok(await page.$$eval('#bb-tb tbody tr.click', (a) => a.length >= 8).catch(() => false), 'Burn, Baby, Burn: tabela de recompra e queima por token');
  ok(await page.$eval('#sb .sb-i[data-page=buybacks] .lbl', (e) => e.textContent === 'Burn, Baby, Burn').catch(() => false), 'Burn, Baby, Burn: item no menu');
  await page.click('#bb-tbl .seg button[data-v="30d"]'); await sleep(400);
  ok(await page.$eval('#bb-sum', (e) => /em 30 dias/.test(e.innerText)).catch(() => false), 'Burn, Baby, Burn: troca de período');
  await page.click('#bb-tb tbody tr.click'); await sleep(1500);
  ok(await page.$('#bb-mchart canvas') !== null, 'Burn, Baby, Burn: detalhe com gráfico diário');
  await page.keyboard.press('Escape'); await sleep(300);
  // Geopolítica: frentes, linha do tempo de 7 dias com a força de cada notícia
  await goPage(page, 'geo', 2500);
  ok(await page.$$eval('#geo-fronts .geo-front', (a) => a.length === 5).catch(() => false), 'Geopolítica: 5 frentes (Oriente Médio, Rússia e Ucrânia, rotas, Ásia, comércio)');
  ok(await page.$$eval('#geo-tl .geo-day', (a) => a.length >= 4).catch(() => false), 'Geopolítica: linha do tempo com os dias anteriores (não só hoje)');
  ok(await page.$$eval('#geo-tl .geo-st', (a) => a.some((x) => x.classList.contains('ok')) && a.some((x) => x.classList.contains('att'))).catch(() => false), 'Geopolítica: selos "confirmada" e "versão de uma das partes"');
  await page.click('.geo-front[data-k="ucrania"]'); await sleep(500);
  ok(await page.$$eval('#geo-tl .geo-i', (a) => a.length > 0 && a.every((x) => /Rússia e Ucrânia/.test(x.innerText))).catch(() => false), 'Geopolítica: frente filtra a linha do tempo');
  // troca de idioma e tema
  await page.evaluate(() => setLang('en')); await sleep(800);
  ok((await page.$eval('#sb .sb-i[data-page=markets] .lbl', (e) => e.textContent)) === 'Indices & FX', 'idioma EN troca o menu');
  await page.evaluate(() => { setLang('pt'); applyTheme('light'); location.hash = '#/dash'; }); await sleep(1500);
  await shot(page, 'd-dash-light');
  const csp = await page.evaluate(() => window.__csp);
  ok(!csp.length, `sem violação de CSP ${csp.join(' | ')}`);
  ok(!errors.length, `sem erro de JavaScript ${errors.slice(0, 5).join(' || ')}`);
  ok(await page.evaluate(() => !!localStorage.getItem('nx3:dbPing')), 'sinal de vida do banco enviado (no máximo 1 vez por dia)');
  if (unhandled.length) console.log('    · pedidos sem simulação:', [...new Set(unhandled)].slice(0, 12).join('\n      '));
  await browser.close();
}
// ---------- 2. celular ----------
console.log('\n[2] Visitante · celular (390×844)');
{
  const { browser, page, errors } = await open({ width: 390, height: 844, mobile: true });
  await sleep(3500);
  for (const id of ['dash', 'top100', 'macro', 'agenda', 'news', 'geo', 'wallets', 'vault', 'plans', 'onchain', 'whales', 'buybacks', 'markets', 'poly', 'chart']) {
    await goPage(page, id, 1800);
    const r = await inspect(page);
    ok(!r.overflow, `${id}: sem rolagem lateral ${r.wide.join(' ')}`);
    await shot(page, 'm-' + id);
  }
  await goPage(page, 'dash', 1500);
  ok(await page.$('#d-install .callout') !== null, 'celular: aviso "Instale o app" no Dashboard');
  ok(await page.$eval('#inst-btn', (b) => !b.hidden).catch(() => false), 'celular: botão de baixar o app no topo');
  await page.click('#d-install [data-act=installLater]'); await sleep(300);
  ok(await page.$('#d-install .callout') === null, '"Agora não" esconde o aviso');
  await goPage(page, 'app', 1500);
  ok(await page.$eval('#app-body', (e) => /Android/.test(e.querySelector('.panel[style*=accent]')?.innerText || '')).catch(() => false), 'página Baixar o app mostra o passo a passo do Android primeiro');
  await shot(page, 'm-app');
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
  ok(/Preço por unidade/.test(await page.$eval('#vf-prev', (e) => e.textContent)), 'prévia do preço unitário aparece');
  ok(await page.$eval('#vf-unit', (e) => e.value !== ''), 'preço por unidade calculado a partir do total');
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
  // formulário à prova de erro: número brasileiro, roda do mouse, clique fora e Esc não apagam nada
  await page.click('[data-act=vaultAdd]'); await sleep(500);
  await page.click('#vf-coin'); await sleep(400); await page.click('#cp-list [data-k=b]'); await sleep(600);
  await page.type('#vf-qty', '1.234,5'); await page.type('#vf-unit', '2,5'); await sleep(200);
  ok(await page.$eval('#vf-amt', (e) => e.value === '3.086,25'), 'preço por unidade × quantidade preenche o total (formato brasileiro)');
  await page.click('#vf-unit', { clickCount: 3 }); await page.keyboard.press('Backspace'); await page.keyboard.type('3'); await sleep(200);
  ok(await page.$eval('#vf-unit', (e) => e.value === '3') && await page.$eval('#vf-amt', (e) => e.value === '3.703,5'), 'apagar e redigitar o preço por unidade não é sobrescrito');
  await page.focus('#vf-qty'); const qb = await page.$('#vf-qty'); const qbox = await qb.boundingBox(); await page.mouse.move(qbox.x + 10, qbox.y + 10); await page.mouse.wheel({ deltaY: 300 }); await sleep(200);
  ok(await page.$eval('#vf-qty', (e) => e.value === '1.234,5'), 'roda do mouse não muda a quantidade');
  await page.type('#vf-ex', 'Binance'); await page.keyboard.press('Enter'); await sleep(200);
  ok(await page.$('#vf') !== null && supa.db.entries.length === 2, 'Enter na corretora não salva nem fecha');
  await page.keyboard.press('Escape'); await sleep(300);
  ok(await page.$('#vf') !== null, 'Esc não fecha o formulário com dados');
  await page.mouse.click(5, 5); await sleep(300);
  ok(await page.$('#vf') !== null && await page.$eval('#vf-qty', (e) => e.value === '1.234,5'), 'clique fora não fecha nem apaga');
  await page.click('#vf-coin'); await sleep(400); await page.keyboard.press('Escape'); await sleep(500);
  ok(await page.$eval('#vf-qty', (e) => e.value === '1.234,5').catch(() => false), 'cancelar a troca de moeda volta ao formulário com tudo preenchido');
  await page.click('#scrim .modal-h [data-act=closeModal]'); await sleep(300);
  await page.click('[data-act=vaultAdd]'); await sleep(500);
  ok(await page.$eval('#vf-qty', (e) => e.value === '1.234,5').catch(() => false), 'rascunho volta ao reabrir');
  await page.click('#vf-cancel'); await sleep(300);
  // conferência: lançamento com casa decimal errada (como os gravados pela versão antiga)
  supa.db.entries.push({ id: 'v-bad', user_id: supa.uid, type: 'buy', asset_id: 'bitcoin', sym: 'BTC', name: 'Bitcoin', binance_sym: 'BTCUSDT', date: new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10), qty: 0.01487, currency: 'USD', amount_usd: 1.21, amount_brl: 6.5, fx_brl: 5.4, fee: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), removed_at: null });
  await page.evaluate(() => vaultLoad(true)); await sleep(3500);
  ok(await page.$eval('#v-check', (e) => /diferente do mercado no dia/.test(e.innerText) && /valor provável é perto de/.test(e.innerText)).catch(() => false), 'Vault aponta o lançamento com preço fora do mercado e sugere a correção');
  ok(await page.evaluate(() => { const c = document.querySelector('#v-check'), h = document.querySelector('.v-hero'); return !!(c && h && c.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'o aviso fica no topo, antes do patrimônio');
  await page.click('#v-check [data-act=vaultFix][data-id="v-bad"]'); await sleep(800);
  ok(await page.$eval('#vf-amt', (e) => e.value === '1.210').catch(() => false), 'Corrigir abre o lançamento com o valor sugerido');
  await page.click('#vf-cancel'); await sleep(300);
  // lançamento antigo gravado com o preço do MOMENTO do cadastro (bug da versão antiga): reconhecido e com estimativa pelo fechamento do dia
  {
    const { pricePath, livePrice } = await import('./fixtures.mjs');
    const live = livePrice('BTCUSDT'); let dd = null;
    for (let n = 300; n < 1200 && !dd; n += 7) { const t = Math.floor((Date.now() - n * 864e5) / 864e5) * 864e5; const hi = Math.max(pricePath('BTCUSDT', t, live), pricePath('BTCUSDT', t + 864e5, live)) * 1.006; if (live > hi * 1.25) dd = new Date(t).toISOString().slice(0, 10); }
    supa.db.entries.push({ id: 'v-now', user_id: supa.uid, type: 'buy', asset_id: 'bitcoin', sym: 'BTC', name: 'Bitcoin', binance_sym: 'BTCUSDT', date: dd, qty: 0.01, currency: 'BRL', amount_usd: +(0.01 * live).toFixed(2), amount_brl: +(0.01 * live * 5.4).toFixed(2), fx_brl: 5.4, fee: 0, created_at: new Date(Date.now() - 30 * 60e3).toISOString(), updated_at: new Date().toISOString(), removed_at: null });
    await page.evaluate(() => vaultLoad(true)); await page.waitForFunction(() => VAULT.hist && vaultSuspects().some((x) => x.kind === 'now'), { timeout: 20000 }).catch(() => {}); await sleep(600);
    ok(!!dd && await page.$eval('#v-check', (e) => /gravado com o preço do momento/.test(e.innerText) && /quando o lançamento foi cadastrado/.test(e.innerText)).catch(() => false), `lançamento gravado com o preço do momento do cadastro é reconhecido (${dd})`);
    await page.click('#v-check [data-act=vaultFixEst][data-id="v-now"]'); await sleep(900);
    const est = await page.evaluate(() => { const r = VAULT.rows.find((x) => x.id === 'v-now'); const close = VAULT.dayPrices.bitcoin[r.date]; const fxm = VAULT.hist.fxm; let fx = null; for (const d of Object.keys(fxm).sort()) { if (d <= r.date) fx = fxm[d]; else break; } return { want: r.qty * close * fx, got: parseDec(document.querySelector('#vf-amt').value), note: document.querySelector('#vf-note').value }; });
    ok(Math.abs(est.got - est.want) < 0.02 && /estimado pelo fechamento do dia/.test(est.note), `"Usar o fechamento do dia" preenche quantidade × fechamento × dólar do dia e anota a estimativa (${est.got} × ${est.want && est.want.toFixed(2)})`);
    await page.click('#vf-cancel'); await sleep(300);
    // o mesmo erro quando o preço do cadastro fica só um pouco acima da faixa do dia (dentro da folga de 12%)
    let d2 = null;
    for (let n = 30; n < 1200 && !d2; n += 3) { const t = Math.floor((Date.now() - n * 864e5) / 864e5) * 864e5; const hi = Math.max(pricePath('BTCUSDT', t, live), pricePath('BTCUSDT', t + 864e5, live)) * 1.006; if (live > hi * 1.03 && live < hi * 1.09) d2 = new Date(t).toISOString().slice(0, 10); }
    supa.db.entries.push({ id: 'v-now2', user_id: supa.uid, type: 'buy', asset_id: 'bitcoin', sym: 'BTC', name: 'Bitcoin', binance_sym: 'BTCUSDT', date: d2, qty: 0.002, currency: 'USD', amount_usd: +(0.002 * live).toFixed(2), amount_brl: +(0.002 * live * 5.4).toFixed(2), fx_brl: 5.4, fee: 0, created_at: new Date(Date.now() - 20 * 60e3).toISOString(), updated_at: new Date().toISOString(), removed_at: null });
    await page.evaluate(() => vaultLoad(true)); await page.waitForFunction(() => VAULT.hist && vaultSuspects().some((x) => x.r.id === 'v-now2'), { timeout: 20000 }).catch(() => {}); await sleep(400);
    ok(!!d2 && await page.evaluate(() => { const x = vaultSuspects().find((y) => y.r.id === 'v-now2'); return !!x && x.kind === 'now'; }), `preço do cadastro só um pouco acima da faixa do dia também é reconhecido (${d2})`);
  }
  supa.db.entries = supa.db.entries.filter((e) => !['v-bad', 'v-now', 'v-now2'].includes(e.id)); await page.evaluate(() => vaultLoad(true)); await sleep(1500);
  // excluir e desfazer
  page.on('dialog', (d) => d.accept());
  await page.click('[data-act=vaultDel]'); await sleep(500);
  await page.click('#scrim [data-k=yes]'); await sleep(1500);
  ok(supa.db.entries.filter((e) => !e.removed_at).length === 1, 'lançamento excluído');
  await page.click('#toasts .act'); await sleep(1500);
  ok(supa.db.entries.filter((e) => !e.removed_at).length === 2, 'desfazer restaura o lançamento');
  // exportar CSV não quebra
  await page.evaluate(() => ACT.vaultCsv()); await sleep(300);
  // Bitcoin Lab (PRO): sinais, gráfico, busca, painel novo e níveis de sinal
  await goPage(page, 'lab', 4000);
  ok(await page.$$eval('#lab-sig .lab-card', (a) => a.length >= 10).catch(() => false), 'Lab: painel com 10+ sinais de fundo');
  ok(await page.$eval('#lab-chart', (e) => !!e.querySelector('canvas')).catch(() => false), 'Lab: gráfico desenhado');
  ok(await page.$$eval('#lab-list .lab-row', (a) => a.length >= 30).catch(() => false), 'Lab: 30+ indicadores na lista ao lado do gráfico');
  await page.type('#lab-q', 'sopr'); await sleep(400);
  ok(await page.$$eval('#lab-list .lab-row', (a) => a.length >= 3 && a.every((r) => /SOPR/i.test(r.innerText))).catch(() => false), 'Lab: busca filtra pelo nome do indicador');
  await page.click('#lab-list input[data-k="sopr"]'); await sleep(1800);
  ok(await page.$('#lab-pc-sopr canvas') !== null, 'Lab: marcar um indicador abre o painel embaixo do gráfico');
  await page.click('.seg[data-seg="labt"] button[data-v="dist"]'); await sleep(500);
  ok(await page.$$eval('#lab-sig .lab-card.dist', (a) => a.length >= 8).catch(() => false), 'Lab: aba de sinais de topo');
  await page.click('.seg[data-seg="labm"] button[data-v="lv"]'); await sleep(1500);
  ok(await page.$$eval('#lab-lv .lab-lvr', (a) => a.length >= 4).catch(() => false), 'Lab: modo "níveis de sinal" lista os preços-gatilho');
  await page.click('#lab-fbtn'); await sleep(700);
  ok(await page.evaluate(() => { const w = document.querySelector('#lab-wrap'); const r = w.getBoundingClientRect(); return w.classList.contains('full') && r.width >= innerWidth - 2 && document.querySelector('#lab-chart').getBoundingClientRect().height > 300; }), 'Lab: tela cheia ocupa a tela');
  await shot(page, 'v-lab-full', false);
  await page.keyboard.press('Escape'); await sleep(400);
  ok(await page.evaluate(() => !document.querySelector('#lab-wrap').classList.contains('full')), 'Lab: Esc sai da tela cheia');
  const lr = await inspect(page); ok(!lr.bad.length && !lr.overflow, `Lab: sem número quebrado nem rolagem lateral ${lr.bad.join(',')} ${lr.wide.join(' ')}`);
  await shot(page, 'v-lab');
  ok(!errors.length, `sem erro de JavaScript ${errors.slice(0, 5).join(' || ')}`);
  await browser.close();
}
// ---------- 3b. Vault: 2.500 lançamentos (sem limite) e contas conferidas por fora ----------
console.log('\n[3b] Vault: 2.500 lançamentos, contas conferidas, comparação e IR');
{
  const { seedVault, expectedBook, fxAt } = await import('./vault-fixtures.mjs');
  const supa = makeSupabase({ plan: 'trial' });
  const seed = seedVault(2500, supa.uid); supa.db.entries.push(...seed);
  const { browser, page, errors } = await open({ supa, hash: '#/vault' });
  await sleep(2500);
  await page.click('#acct .acct-btn'); await sleep(400);
  await page.type('#au-email', 'cliente@teste.com'); await page.type('#au-pass', 'senha1234'); await page.click('#au-go');
  await page.waitForFunction(() => typeof VAULT !== 'undefined' && VAULT.loaded, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  ok(await page.evaluate((n) => VAULT.rows.length === n, seed.length) && supa.db.pages >= 3, `todos os ${seed.length} lançamentos carregados (de 1000 em 1000: ${supa.db.pages} pedidos)`);
  // conta independente (custo médio em reais) × o que o site calcula
  const exp = expectedBook(seed);
  const got = await page.evaluate(() => { const H = holdings(); const L2 = vaultLedger(); return { H: H.map((h) => ({ id: h.id, qty: h.qty, costBRL: h.costBRL, realBRL: h.realBRL, invBRL: h.invBRL })), sales: L2.sales.length }; });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const bad = got.H.filter((h) => { const e = exp.by[h.id]; return !e || !near(h.qty, e.qty, 1e-6 * Math.max(1, e.qty)) || !near(h.costBRL, e.costB, 0.05) || !near(h.realBRL, e.realB, 0.05); });
  ok(!bad.length && got.H.length === Object.keys(exp.by).length, `quantidade, custo e lucro realizado de cada moeda batem com a conta feita por fora ${bad.map((h) => h.id).join(',')}`);
  ok(near(got.H.reduce((s, h) => s + h.invBRL, 0), exp.putB, 0.05), 'total aportado (com taxas) bate');
  // evolução e comparação
  await page.waitForFunction(() => VCMP.data && VAULT.hist, { timeout: 30000 }).catch(() => {});
  const cmp = await page.evaluate(() => ({ put: VCMP.data.out.mine.put, took: VCMP.data.out.mine.took, end: VCMP.data.out.mine.end, res: VCMP.data.out.mine.res, T: totals(holdings()), cur: VAULT.cur, n: VCMP.data.days.length, bench: Object.fromEntries(['usd', 'btc', 'cdi', 'ibov', 'spx'].map((k) => [k, !VCMP.data.out[k].na])) }));
  ok(near(cmp.put, exp.putB, 0.05) && near(cmp.took, exp.tookB, 0.05), 'comparação: aplicado e resgatado batem com os lançamentos');
  ok(cmp.cur === 'BRL' && near(cmp.res, cmp.T.total, 1) && near(cmp.end, cmp.T.value, 1), `comparação: resultado da sua carteira = resultado total do Vault (${Math.round(cmp.res)} × ${Math.round(cmp.T.total)})`);
  ok(Object.values(cmp.bench).every(Boolean), `comparação com dólar, Bitcoin, CDI, Ibovespa e S&P 500 ${JSON.stringify(cmp.bench)}`);
  ok(await page.$$eval('#v-cmp .v-cmp-t tbody tr', (a) => a.length === 6).catch(() => false) && await page.$('#v-cmp-ch canvas') !== null, 'comparação: gráfico e tabela desenhados');
  // IR: vendas do ano passado e posição em 31/12
  const y = new Date().getUTCFullYear() - 1;
  const expY = expectedBook(seed, `${y}-12-31`);
  const salesY = expY.sales.filter((s) => s.date.startsWith(String(y)));
  const ir = await page.evaluate((yy) => { const D = vaultIrData(yy); return { gross: D.months.reduce((s, m) => s + m.gross, 0), gain: D.months.reduce((s, m) => s + m.gain, 0), n: D.sales.length, pos: D.pos.map((p) => ({ id: p.id, qty: p.qty, cost: p.costBRL })) }; }, y);
  ok(ir.n === salesY.length && near(ir.gross, salesY.reduce((s, x) => s + x.gross, 0), 0.05) && near(ir.gain, salesY.reduce((s, x) => s + x.gain, 0), 0.05), `IR ${y}: vendas, total vendido e lucro do ano batem (${ir.n} vendas)`);
  ok(ir.pos.length && ir.pos.every((p) => { const e = expY.by[p.id]; return e && near(p.qty, e.qty, 1e-6 * Math.max(1, e.qty)) && near(p.cost, e.costB, 0.05); }), `IR ${y}: posição e custo em 31/12 batem`);
  ok(await page.$eval('#v-ir', (e) => /Apoio para o Imposto de Renda/.test(e.innerText) && /31\/12\//.test(e.innerText)).catch(() => false), 'painel de apoio ao IR aparece');
  // filtros do histórico
  await page.select('#v-list select[data-k="type"]', 'sell'); await sleep(400);
  const nSell = seed.filter((e) => e.type === 'sell').length;
  ok(await page.$eval('#v-list .v-ftot', (e, n) => e.innerText.replace(/\D/g, '').startsWith(String(n)), nSell).catch(() => false) && await page.$$eval('#v-list tbody .badge', (a) => a.every((b) => /venda/.test(b.textContent))).catch(() => false), `filtro "só vendas" (${nSell}) e totais do filtrado`);
  await page.click('[data-act=vaultFClear]'); await sleep(300);
  // desenho: nada quebrado, sem rolagem lateral
  const vr = await inspect(page); ok(!vr.bad.length && !vr.overflow, `Vault com 2.500 lançamentos sem número quebrado nem rolagem lateral ${vr.bad.join(',')} ${vr.wide.join(' ')}`);
  await shot(page, 'v-vault-2500');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); await sleep(2000);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Vault com 2.500 lançamentos no celular sem rolagem lateral');
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 }); await sleep(800);
  // caso de resposta conhecida: contas na mão
  const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const base = { user_id: supa.uid, asset_id: 'bitcoin', sym: 'BTC', name: 'Bitcoin', binance_sym: 'BTCUSDT', currency: 'BRL', fee: 0, removed_at: null, updated_at: new Date().toISOString() };
  const d1 = d(400), fx1 = fxAt(Date.parse(d1 + 'T12:00:00Z'));
  supa.db.entries = [
    { ...base, id: 'k1', type: 'buy', date: d1, qty: 1, amount_brl: 100000, amount_usd: +(100000 / fx1).toFixed(2), fx_brl: fx1, created_at: d1 + 'T10:00:00Z' },
    { ...base, id: 'k2', type: 'buy', date: d(300), qty: 1, amount_brl: 200000, amount_usd: 40000, fx_brl: 5, created_at: d(300) + 'T10:00:00Z' },
    { ...base, id: 'k3', type: 'sell', date: d(200), qty: 1, amount_brl: 300000, amount_usd: 60000, fx_brl: 5, fee: 100, created_at: d(200) + 'T10:00:00Z' },
  ];
  await page.evaluate(() => vaultLoad(true)); await page.waitForFunction(() => VAULT.rows.length === 3 && VCMP.data && VCMP.data.out.mine.put === 300000, { timeout: 30000 }).catch(() => {});
  const k = await page.evaluate(() => { const h = holdings()[0]; const s = vaultLedger().sales[0]; return { qty: h.qty, cost: h.costBRL, real: h.realBRL, gain: s.gainBRL, put: VCMP.data.out.mine.put, took: VCMP.data.out.mine.took, cdi: VCMP.data.out.cdi, usd: VCMP.data.out.usd, days: VCMP.data.days.length }; });
  ok(k.qty === 1 && near(k.cost, 150000, 0.01) && near(k.real, 149900, 0.01) && near(k.gain, 149900, 0.01) && k.put === 300000 && k.took === 299900, `contas na mão: 2 compras (R$ 100 mil e R$ 200 mil) e 1 venda (R$ 300 mil, taxa R$ 100) → preço médio R$ 150 mil, lucro R$ 149.900 (${k.real})`);
  // CDI: 100% do CDI diário (0,050788% ao dia útil) nos mesmos fluxos, conferido aqui fora
  const busy = (from, to) => { let n = 0; for (let t = Date.parse(from + 'T00:00:00Z'); t < Date.parse(to + 'T00:00:00Z'); t += 864e5) { const w = new Date(t).getUTCDay(); if (w && w < 6) n++; } return n; };
  const today = new Date().toISOString().slice(0, 10), r = 1 + 0.050788 / 100;
  let units = 100000 / 1; let idx = Math.pow(r, busy(d1, d(300))); units += 200000 / idx; idx *= Math.pow(r, busy(d(300), d(200))); units -= 299900 / idx; idx *= Math.pow(r, busy(d(200), today));
  ok(!k.cdi.na && near(k.cdi.end, units * idx, 0.5) && near(k.cdi.took, 299900, 0.01), `CDI: valor de hoje conferido por fora (${k.cdi.end && k.cdi.end.toFixed(2)} × ${(units * idx).toFixed(2)})`);
  ok(!k.usd.na && k.usd.put === 300000, 'dólar: mesmos aportes');
  const xr = await page.evaluate(() => xirr([{ t: 0, v: -1000 }, { t: 365.25 * 864e5, v: 1100 }]));
  ok(near(xr, 0.10, 1e-6), `taxa anual (TIR) de 1000 → 1100 em 1 ano = 10% (${xr})`);
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
  ok(await page.$eval('#pg-admin', (e) => /Banco de dados ativo/.test(e.innerText) && /Resume project/.test(e.innerText) && /Agenda econômica/.test(e.innerText)).catch(() => false), 'status do robô com nomes claros e aviso de banco pausado');
  // agendador do robô: sem token → passo a passo; token salvo vai só para o banco e não volta para a tela
  ok(await page.$eval('#pg-admin .adm-robot', (e) => /não configurado/.test(e.innerText) && /Only select repositories/.test(e.innerText) && !!e.querySelector('a[href="https://github.com/settings/personal-access-tokens/new"]')).catch(() => false), 'agendador: sem token mostra o passo a passo do GitHub');
  const TOK = 'github_pat_11TESTE' + 'x'.repeat(70);
  await page.type('#adm-tok', 'minha senha'); await page.click('[data-act=admTokSave]'); await sleep(400);
  ok(!supa.db.robotTokenValue && /não parece um token/.test(await page.$eval('#toasts', (e) => e.innerText).catch(() => '')), 'agendador: texto que não é token é recusado antes de sair do navegador');
  await page.$eval('#adm-tok', (i) => { i.value = ''; }); await page.type('#adm-tok', TOK); await page.click('[data-act=admTokSave]'); await sleep(900);
  ok(supa.db.robotTokenValue === TOK && await page.$eval('#pg-admin', (e) => /salvo/.test(e.querySelector('.adm-robot').innerText)).catch(() => false), 'agendador: token salvo no banco');
  ok(await page.evaluate((t) => !document.documentElement.outerHTML.includes(t) && ![...document.querySelectorAll('input')].some((i) => i.value.includes(t)) && !JSON.stringify(localStorage).includes(t), TOK), 'agendador: o token não fica na tela, nos campos nem no navegador');
  await page.click('[data-act=admDispatch]'); await sleep(7000);
  ok(await page.$eval('#pg-admin .adm-robot', (e) => /GitHub aceitou/.test(e.innerText)).catch(() => false), 'agendador: "Testar agora" mostra a resposta do GitHub');
  supa.db.robotMissing = true; await page.click('[data-act=admReload]'); await sleep(1500);
  ok(await page.$eval('#pg-admin .adm-robot', (e) => /Ainda não instalado/.test(e.innerText) && /03_agendador_robo\.sql/.test(e.innerText) && /SQL Editor/.test(e.innerText)).catch(() => false), 'agendador: sem a função no banco, explica como instalar');
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
// ---------- 7. app instalável (PWA) num servidor local (localhost conta como seguro) ----------
console.log('\n[7] App instalável (PWA)');
{
  const http = await import('node:http');
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const rel = u.replace(/^\/Claude_crypto_hub7\.0\//, '');
    let f = join(ROOT, rel.endsWith('/') || rel === '' ? rel + 'index.html' : rel);
    if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
  }).listen(0);
  const port = srv.address().port;
  const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
  for (const file of ['index.html', 'landing.html']) {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/Claude_crypto_hub7.0/${BASE}${file}`, { waitUntil: 'domcontentloaded' });
    const sw = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then((r) => !!r.active), new Promise((r) => setTimeout(() => r(false), 8000))]));
    ok(sw, `${file}: service worker ativo`);
    await sleep(500);
    const cdp = await page.target().createCDPSession();
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    ok(!installabilityErrors.length, `${file}: pode ser instalado como app ${installabilityErrors.map((e) => e.errorId).join(',')}`);
    const m = await cdp.send('Page.getAppManifest');
    ok(m.errors.length === 0 && /NEXUS HUB/.test(m.data || ''), `${file}: manifesto válido`);
    await page.close();
  }
  await browser.close(); srv.close();
}
// ---------- 8. Wallet Watch: endereços públicos de todas as redes, segredos bloqueados ----------
console.log('\n[8] Wallet Watch (grátis, sem conta)');
{
  const { browser, page, errors, unhandled } = await open({ hash: '#/wallets' });
  await sleep(2500);
  ok(await page.$eval('#sb .sb-i[data-page=wallets] .lbl', (e) => e.textContent === 'Wallet Watch').catch(() => false) && await page.$('#sb .sb-i[data-page=wallets] .tag') === null, 'Wallet Watch no menu, sem selo PRO');
  ok(await page.$('#ww-addr') !== null && await page.$('.ww-empty') !== null, 'tela inicial com o campo de endereço');
  const paste = (v) => page.evaluate((x) => { const i = document.querySelector('#ww-addr'); i.value = x; i.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const SECRETS = { seed: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', priv: '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318', wif: 'KwdMAjGmerYanjeui5SHS7JkmpZvVipYvB2LJGU1ZxJwYvP98617', xprv: 'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi' };
  for (const [k, v] of Object.entries(SECRETS)) {
    await paste(v); await sleep(150);
    const r = await page.evaluate(() => ({ val: document.querySelector('#ww-addr').value, alert: !!document.querySelector('.ww-secret'), btn: document.querySelector('#ww-add-btn').disabled }));
    ok(r.val === '' && r.alert && r.btn, `segredo colado (${k}): campo apagado na hora, aviso e botão travado`);
  }
  ok(await page.evaluate((list) => { const all = JSON.stringify(localStorage) + JSON.stringify(sessionStorage); return !list.some((x) => all.includes(x.slice(0, 20))); }, Object.values(SECRETS)), 'nenhum segredo guardado no navegador');
  await page.type('#ww-addr', SECRETS.seed); await sleep(150);
  ok(await page.$eval('.ww-secret', () => true).catch(() => false), 'frase-semente digitada palavra por palavra também é bloqueada');
  const addW = async (addr, label) => {
    await page.evaluate(() => { const s = document.querySelector('#ww-add'); if (s && !s.classList.contains('open')) document.querySelector('[data-act="wwAddToggle"]').click(); });
    await sleep(120); await paste(addr);
    await page.evaluate((l) => { const i = document.querySelector('#ww-label'); i.value = l || ''; }, label);
    await page.evaluate(() => document.querySelector('#ww-add-btn').click());
    await page.waitForFunction(() => WW.busy.size === 0 && WW.d.w.length && WW.r[WW.d.w[WW.d.w.length - 1].id], { timeout: 15000 }).catch(() => {});
    await sleep(300);
  };
  await addW(WT.btc, 'Cold BTC');
  ok(await page.$eval('.ww-card', (c) => /Cold BTC/.test(c.innerText) && /mempool\.space/.test(c.innerText)).catch(() => false), 'BTC: carteira adicionada com a fonte da leitura');
  ok(await page.$eval('#ww-total .ww-big', (e) => /R\$/.test(e.textContent)).catch(() => false), 'total do portfólio em R$');
  await addW(WT.evm, 'MetaMask');
  const evm = await page.evaluate(() => { const A = wwAssets(WW.d.w.filter((w) => w.kind === 'evm')); const g = (k) => A.find((a) => a.k === k); return { usdt: g('cg:tether') && g('cg:tether').q, link: g('cg:chainlink') && g('cg:chainlink').q, eth: g('cg:ethereum') && [g('cg:ethereum').q, [...g('cg:ethereum').nets]], hype: g('cg:hyperliquid') && [g('cg:hyperliquid').q, g('cg:hyperliquid').parts.some((p) => p.x === 'stake')], perp: g('hl:perp') && g('hl:perp').v, purr: g('hl:PURR') && g('hl:PURR').v }; });
  ok(Math.abs(evm.usdt - 1234.56) < 1e-6 && evm.link === 10, `EVM: tokens reconhecidos lidos pelo Multicall (USDT ${evm.usdt}, LINK ${evm.link})`);
  ok(evm.eth && Math.abs(evm.eth[0] - 1.7) < 1e-9 && evm.eth[1].includes('eth') && evm.eth[1].includes('base'), 'EVM: ETH somado da Ethereum e da Base');
  ok(evm.hype && Math.abs(evm.hype[0] - 20) < 1e-9 && evm.hype[1] && Math.abs(evm.perp - 1000.25) < 1e-6 && Math.abs(evm.purr - 200) < 1e-6, 'Hyperliquid: HYPE (HyperEVM + à vista + stake), conta de perpétuos e token à vista com preço da Hyperliquid');
  await addW(WT.zpub, 'Ledger');
  await addW(WT.xpub86, 'Trezor');
  const btc = await page.evaluate(() => wwAssets(WW.d.w).find((a) => a.k === 'cg:bitcoin').q);
  ok(Math.abs(btc - 1.325) < 1e-9, `xpub/zpub: endereços derivados, limite de 20 sem uso e tipo descoberto sozinho (BTC total ${btc})`);
  ok(await page.evaluate(() => { const w = WW.d.w.find((x) => x.label === 'Trezor'); const r = WW.r[w.id]; return r.x.types.join() === 'Taproot' && r.x.used === 1; }), 'xpub "genérica" (Ledger/Trezor): só o tipo com uso é somado (Taproot)');
  for (const [a, l] of [[WT.sol, 'Phantom'], [WT.trx, 'Tron'], [WT.ton, 'TON'], [WT.ltc, 'LTC'], [WT.doge, 'DOGE'], [WT.xrp, 'XRP'], [WT.ens, '']]) await addW(a, l);
  const st = await page.evaluate(() => ({ n: WW.d.w.length, errs: WW.d.w.filter((w) => !WW.r[w.id] || WW.r[w.id].err || !WW.r[w.id].ok).map((w) => w.label + ':' + (WW.r[w.id] && WW.r[w.id].err)), hid: WW.d.w.reduce((s2, w) => s2 + (WW.r[w.id].hid || 0), 0), ens: WW.d.w.find((w) => w.ens), sol: wwAssets(WW.d.w.filter((w) => w.kind === 'sol')).map((a) => a.s).sort().join(','), trx: wwAssets(WW.d.w.filter((w) => w.kind === 'trx')).map((a) => `${a.s}:${a.q}`).sort().join(','), ton: wwAssets(WW.d.w.filter((w) => w.kind === 'ton')).map((a) => `${a.s}:${a.q}`).sort().join(',') }));
  ok(st.n === 11 && !st.errs.length, `11 carteiras de 9 redes lidas sem erro ${st.errs.join(' | ')}`);
  ok(st.hid === 3 && /Golpe|GOLPE/.test(await page.$eval('#pg-wallets', (e) => e.innerText).catch(() => 'GOLPE')) === false, 'tokens desconhecidos (spam) ignorados e sem o nome deles na tela');
  ok(st.sol === 'JUP,SOL,USDC' && st.trx === 'TRX:250,USDT:250' && st.ton === 'TON:5,USDT:75', `Solana (Jupiter verificado), Tron (TRX + stake + USDT) e TON (jetton verificado) ${st.sol} ${st.trx} ${st.ton}`);
  ok(st.ens && st.ens.ens === 'teste.eth' && st.ens.addr === WT.ensAddr, 'nome ENS convertido no endereço');
  ok(await page.$$eval('#ww-act .li', (a) => a.length >= 4).catch(() => false), 'movimentos de BTC, LTC e DOGE listados');
  const dup = await page.evaluate(() => WW.d.w.length); await addW(WT.btc.toLowerCase() === WT.btc ? WT.btc : WT.btc, 'Repetida');
  ok(await page.evaluate((n) => WW.d.w.length === n, dup), 'endereço repetido não entra duas vezes');
  // portfólios
  await page.evaluate(() => document.querySelector('[data-act="wwPfNew"]').click()); await sleep(300);
  await page.evaluate(() => { document.querySelector('#ww-nm').value = 'Ledger'; document.querySelector('#scrim [data-k=yes]').click(); }); await sleep(400);
  await page.evaluate(() => { const w = WW.d.w.find((x) => x.label === 'Ledger'); const p = WW.d.pf.find((x) => x.n === 'Ledger'); w.pf = p.id; wwSave(); wwDraw(); });
  await page.evaluate(() => { const p = WW.d.pf.find((x) => x.n === 'Ledger'); document.querySelector(`.ww-pf[data-id="${p.id}"]`).click(); }); await sleep(500);
  ok(await page.evaluate(() => wwWallets().length === 1 && /Ledger/.test(document.querySelector('#ww-total .panel-t').textContent)), 'novo portfólio com a carteira movida');
  await page.evaluate(() => document.querySelector('.ww-pf[data-id="all"]').click()); await sleep(400);
  // modo privado e dólar
  await page.evaluate(() => document.querySelector('[data-act="wwHide"]').click()); await sleep(400);
  ok(await page.$eval('#ww-total .ww-big', (e) => /•/.test(e.textContent)).catch(() => false) && await page.$$eval('#ww-assets tr[data-k] td:nth-child(4)', (a) => a.every((t) => /•|—/.test(t.textContent))).catch(() => false), 'esconder valores mascara total e valores');
  await page.evaluate(() => document.querySelector('[data-act="wwHide"]').click()); await sleep(300);
  await page.click('.seg[data-seg="wwcur"] button[data-v="USD"]'); await sleep(400);
  ok(await page.$eval('#ww-total .ww-big', (e) => /US\$/.test(e.textContent)).catch(() => false), 'total em US$');
  await page.click('.seg[data-seg="wwcur"] button[data-v="BRL"]'); await sleep(300);
  // detalhe do ativo
  await page.evaluate(() => document.querySelector('#ww-assets tr[data-k="cg:tether"]').click()); await sleep(400);
  ok(await page.$eval('#scrim', (e) => /Tron/.test(e.innerText) && /TON/.test(e.innerText) && /Ethereum/.test(e.innerText)).catch(() => false), 'detalhe do ativo mostra cada carteira e rede');
  await page.keyboard.press('Escape'); await sleep(200);
  const r1 = await inspect(page); ok(!r1.bad.length && !r1.overflow, `Wallet Watch sem número quebrado nem rolagem lateral ${r1.bad.join(',')} ${r1.wide.join(' ')}`);
  await shot(page, 'w-wallets');
  // exportar (sem saldos) e importar (recusa arquivo com segredo)
  const exp = await page.evaluate(() => { let out = ''; const orig = downloadFile; downloadFile = (n, t) => { out = t; }; ACT.wwExport(); downloadFile = orig; return out; });
  const ej = JSON.parse(exp || '{}');
  ok(ej.carteiras && ej.carteiras.length === 11 && !/saldo|balance|"q"|uiAmount/i.test(exp), 'exportar baixa só os endereços (sem saldos)');
  const bad = join(tmpdir(), 'ww-bad.json'); writeFileSync(bad, JSON.stringify({ carteiras: [{ endereco: SECRETS.priv }, { endereco: WT.btc }] }));
  const [fc] = await Promise.all([page.waitForFileChooser(), page.evaluate(() => ACT.wwImport())]); await fc.accept([bad]); await sleep(800);
  ok(await page.evaluate(() => WW.d.w.length === 11) && await page.$eval('#toasts', (e) => /segredo|chave privada|frase-semente/i.test(e.innerText)).catch(() => false), 'importar arquivo com chave privada: nada é importado');
  // recarregar: lista e últimas leituras continuam (com o horário)
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(2500);
  ok(await page.evaluate(() => WW.d.w.length === 11 && document.querySelectorAll('.ww-card').length === 11 && /R\$/.test(document.querySelector('#ww-total .ww-big').textContent)), 'depois de recarregar, carteiras e saldos continuam');
  ok(!errors.length, `sem erro de JavaScript ${errors.slice(0, 5).join(' || ')}`);
  const wwUnh = unhandled.filter((u) => /mempool|blockchain\.info|publicnode|hyperliquid|jup\.ag|trongrid|tonapi|toncenter|xrpl|litecoinspace|blockcypher|llama\.fi/.test(u));
  ok(!wwUnh.length, `todas as fontes do Wallet Watch simuladas ${wwUnh.slice(0, 4).join(' | ')}`);
  // celular
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await sleep(800);
  const rm = await inspect(page); ok(!rm.overflow, `Wallet Watch no celular sem rolagem lateral ${rm.wide.join(' ')}`);
  await shot(page, 'w-wallets-m');
  // apagar tudo
  await page.evaluate(() => { ACT.wwWipe(); }); await sleep(300); await page.evaluate(() => document.querySelector('#scrim [data-k=yes]').click()); await sleep(500);
  ok(await page.evaluate(() => !WW.d.w.length && !localStorage.getItem('nx3:ww-read') && !!document.querySelector('.ww-empty')), 'apagar tudo limpa a lista e as leituras');
  await browser.close();
}
console.log(`\n${fails.length ? '✗ ' + fails.length + ' falha(s)' : '✓ tudo certo'}`);
process.exit(fails.length ? 1 : 0);
