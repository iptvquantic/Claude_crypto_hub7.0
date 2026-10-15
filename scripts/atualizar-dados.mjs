#!/usr/bin/env node
// =====================================================================
// Robô de dados do NEXUS HUB (roda no GitHub Actions a cada ~20 min).
// Busca no servidor o que o navegador não consegue (bloqueio de CORS ou limites):
//   news.json      notícias em PT-BR (RSS direto + Google Notícias), por tema
//   calendar.json  calendário econômico global da semana (ForexFactory)
//   markets.json   bolsas, juros, dólar global, commodities e cotas de ETFs (Yahoo)
//                  + ranking dos maiores ativos do mundo (companiesmarketcap)
//   status.json    situação de cada fonte nesta execução
// Regra de ouro: NUNCA quebrar o site. Se uma fonte falhar, o arquivo anterior é mantido
// com o horário antigo (o site percebe que está velho e busca direto na fonte).
// Uso: node scripts/atualizar-dados.mjs <pasta-de-saída>
// =====================================================================
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || '_data';
const REPO = process.env.GITHUB_REPOSITORY || 'iptvquantic/Claude_crypto_hub7.0';
const PREV = `https://raw.githubusercontent.com/${REPO}/data/`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 NexusHubBot/1.0';
const status = {};
mkdirSync(OUT, { recursive: true });

async function get(url, { as = 'text', timeout = 20000, headers = {} } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': UA, accept: as === 'json' ? 'application/json' : '*/*', ...headers } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return as === 'json' ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { err: String(e.message || e) }; } } })); return out; }
async function previous(name) { try { return await get(PREV + name + '.json?t=' + Date.now(), { as: 'json', timeout: 15000 }); } catch { return null; } }
const save = (name, obj) => writeFileSync(join(OUT, name + '.json'), JSON.stringify(obj));

// ---------- RSS ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m));
const strip = (s) => decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1] : ''; };
function parseRss(xml, src, lang) {
  const items = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  return items.map((x) => {
    let t = strip(tag(x, 'title')); const u = decode(tag(x, 'link')).trim() || (x.match(/<link[^>]+href="([^"]+)"/i) || [])[1] || '';
    const d = Date.parse(decode(tag(x, 'pubDate')) || decode(tag(x, 'dc:date')));
    const img = (x.match(/<media:(?:content|thumbnail)[^>]+url="([^"]+)"/i) || x.match(/<enclosure[^>]+url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i) || [])[1] || '';
    let s = src;
    if (src === 'Google Notícias') { const k = t.lastIndexOf(' - '); if (k > 20) { s = t.slice(k + 3).trim(); t = t.slice(0, k).trim(); } }
    return { t: t.slice(0, 300), u, d, x: strip(tag(x, 'description')).slice(0, 260), img: /^https:\/\//.test(img) ? img : '', src: s.slice(0, 60), lang };
  }).filter((n) => n.t && /^https?:\/\//.test(n.u) && Number.isFinite(n.d));
}
const GN = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
const NEWS = {
  cripto: { maxH: 72, feeds: [['https://livecoins.com.br/feed/', 'Livecoins', 'pt'], ['https://portaldobitcoin.uol.com.br/feed/', 'Portal do Bitcoin', 'pt'], ['https://www.criptofacil.com/feed/', 'CriptoFácil', 'pt'], [GN('bitcoin OR criptomoedas OR ethereum when:2d'), 'Google Notícias', 'pt'], ['https://cointelegraph.com/rss', 'Cointelegraph', 'en'], ['https://www.coindesk.com/arc/outboundfeeds/rss/', 'CoinDesk', 'en'], ['https://decrypt.co/feed', 'Decrypt', 'en']] },
  economia: { maxH: 48, feeds: [['https://www.infomoney.com.br/feed/', 'InfoMoney', 'pt'], ['https://www.moneytimes.com.br/feed/', 'Money Times', 'pt'], ['https://g1.globo.com/rss/g1/economia/', 'g1 Economia', 'pt'], ['https://www.poder360.com.br/feed/', 'Poder360', 'pt'], [GN('economia OR Ibovespa OR Selic OR dólar when:1d'), 'Google Notícias', 'pt']] },
  tech: { maxH: 72, feeds: [['https://rss.tecmundo.com.br/feed', 'TecMundo', 'pt'], ['https://canaltech.com.br/rss/', 'Canaltech', 'pt'], ['https://olhardigital.com.br/feed/', 'Olhar Digital', 'pt'], ['https://g1.globo.com/rss/g1/tecnologia/', 'g1 Tecnologia', 'pt'], [GN('inteligência artificial when:2d'), 'Google Notícias', 'pt']] },
  mundo: { maxH: 48, feeds: [['https://feeds.bbci.co.uk/portuguese/rss.xml', 'BBC News Brasil', 'pt'], ['https://g1.globo.com/rss/g1/mundo/', 'g1 Mundo', 'pt'], ['https://www.cnnbrasil.com.br/internacional/feed/', 'CNN Brasil', 'pt'], [GN('guerra OR Ucrânia OR Israel OR Irã OR Taiwan OR tarifas when:1d'), 'Google Notícias', 'pt'], ['https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC World', 'en']] },
};
async function news() {
  const cats = {}; let okFeeds = 0, all = 0; const now = Date.now();
  for (const [cat, def] of Object.entries(NEWS)) {
    const res = await pool(def.feeds, 3, async ([u, src, lang]) => parseRss(await get(u), src, lang));
    const seen = new Set();
    const items = res.flatMap((r, i) => { all++; if (Array.isArray(r)) { okFeeds++; return r; } console.warn('  rss falhou:', def.feeds[i][1], r && r.err); return []; })
      .filter((n) => n.d <= now + 3600e3 && now - n.d <= def.maxH * 3600e3)
      .filter((n) => { const k = n.u.split('?')[0] + '|' + n.t.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => b.d - a.d).slice(0, 80);
    cats[cat] = items;
  }
  const n = Object.values(cats).reduce((s, a) => s + a.length, 0);
  if (n < 20) throw new Error(`poucas notícias (${n})`);
  save('news', { generatedAt: new Date().toISOString(), cats });
  return { n, feeds: `${okFeeds}/${all}` };
}

// ---------- calendário (ForexFactory) ----------
async function calendar() {
  const urls = ['https://nfs.faireconomy.media/ff_calendar_thisweek.json', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'];
  const parts = await pool(urls, 2, (u) => get(u, { as: 'json' }));
  const ev = parts.filter(Array.isArray).flat().filter((x) => x && x.title && x.date && x.country).map((x) => ({ title: String(x.title).slice(0, 120), country: x.country, date: x.date, impact: x.impact, forecast: x.forecast || '', previous: x.previous || '', actual: x.actual || '' }));
  if (!Array.isArray(parts[0])) throw new Error('semana atual indisponível: ' + (parts[0] && parts[0].err));
  save('calendar', { generatedAt: new Date().toISOString(), events: ev });
  return { n: ev.length };
}

// ---------- cotações (Yahoo) ----------
const QUOTES = [
  ['^BVSP', 'Ibovespa', 'br', 'pts'], ['^GSPC', 'S&P 500', 'us', 'pts'], ['^IXIC', 'Nasdaq', 'us', 'pts'], ['^DJI', 'Dow Jones', 'us', 'pts'], ['^VIX', 'VIX (índice do medo)', 'us', 'pts', 'VIX (fear index)'],
  ['^N225', 'Nikkei 225 (Japão)', 'world', 'pts', 'Nikkei 225 (Japan)'], ['^HSI', 'Hang Seng (Hong Kong)', 'world', 'pts'], ['^GDAXI', 'DAX (Alemanha)', 'world', 'pts', 'DAX (Germany)'], ['^FTSE', 'FTSE 100 (Reino Unido)', 'world', 'pts', 'FTSE 100 (UK)'], ['^STOXX50E', 'Euro Stoxx 50', 'world', 'pts'],
  ['DX-Y.NYB', 'Índice do dólar (DXY)', 'rates', 'pts', 'US dollar index (DXY)'], ['^TNX', 'Juros do título de 10 anos dos EUA', 'rates', 'pct', 'US 10-year yield'], ['^FVX', 'Juros do título de 5 anos dos EUA', 'rates', 'pct', 'US 5-year yield'],
  ['BZ=F', 'Petróleo Brent', 'cmd', 'usd', 'Brent crude'], ['CL=F', 'Petróleo WTI', 'cmd', 'usd', 'WTI crude'], ['NG=F', 'Gás natural', 'cmd', 'usd', 'Natural gas'], ['HG=F', 'Cobre', 'cmd', 'usd', 'Copper'],
];
const ETFS = ['IBIT', 'FBTC', 'GBTC', 'BTC', 'ARKB', 'BITB', 'HODL', 'BTCO', 'BTCW', 'EZBC', 'BRRR', 'ETHA', 'FETH', 'ETHE', 'ETH', 'ETHW', 'CETH', 'ETHV', 'QETH', 'EZET', 'HASH11.SA', 'BITH11.SA', 'ETHE11.SA', 'QBTC11.SA', 'QETH11.SA'];
async function yahoo(sym) {
  let lastErr;
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const j = await get(`https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, { as: 'json', timeout: 15000 });
      const m = j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
      if (!m || !Number.isFinite(m.regularMarketPrice)) throw new Error('sem preço');
      const prev = m.chartPreviousClose ?? m.previousClose;
      return { p: m.regularMarketPrice, prev, chg: Number.isFinite(prev) && prev ? (m.regularMarketPrice / prev - 1) * 100 : null, vol: m.regularMarketVolume ?? null, t: (m.regularMarketTime || 0) * 1000, cur: m.currency };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
async function markets(prev) {
  const quotes = {}; const etfs = {}; let okQ = 0, okE = 0;
  const qr = await pool(QUOTES, 4, ([s]) => yahoo(s));
  QUOTES.forEach(([s, n, g, fmt, nEn], i) => {
    const r = qr[i];
    if (r && !r.err) { okQ++; let p = r.p; if (s === '^TNX' || s === '^FVX') { if (p > 20) p /= 10; } quotes[s] = { n, nEn, g, fmt, p, chg: r.chg, t: r.t }; }
    else if (prev && prev.quotes && prev.quotes[s]) quotes[s] = prev.quotes[s]; // mantém o último válido, com o horário dele
  });
  const er = await pool(ETFS, 4, (s) => yahoo(s));
  ETFS.forEach((s, i) => { const r = er[i]; if (r && !r.err) { okE++; etfs[s] = { p: r.p, chg: r.chg, vol: r.vol, t: r.t }; } else if (prev && prev.etfs && prev.etfs[s]) etfs[s] = prev.etfs[s]; });
  status.quotes = { ok: okQ > 0, n: okQ, err: okQ ? undefined : String(qr.find((r) => r && r.err)?.err || '') };
  status.etfs = { ok: okE > 0, n: okE };
  // ranking mundial
  let world = prev && prev.world, worldAt = prev && prev.worldAt, worldSrc = (prev && prev.worldSrc) || 'companiesmarketcap.com';
  try { const w = await worldRanking(); if (w.length < 20) throw new Error(`só ${w.length} linhas`); world = w; worldAt = new Date().toISOString(); worldSrc = 'companiesmarketcap.com'; status.world = { ok: true, n: w.length, ...(worldDebug ? { debug: worldDebug } : {}) }; }
  catch (e) { status.world = { ok: false, err: String(e.message || e) }; }
  if (!okQ && !okE && !(status.world && status.world.ok)) throw new Error('nenhuma cotação nesta execução');
  save('markets', { generatedAt: new Date().toISOString(), quotes, etfs, world, worldAt, worldSrc });
  return { n: okQ + okE };
}
function csvRows(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const head = split(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v.trim()])));
}
// Página "assets by market cap" (ouro, prata, bitcoin e empresas). A tabela traz os números crus em data-sort.
function parseAssetsHtml(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]).filter((r) => /company-name/.test(r));
  return rows.map((r) => {
    const name = strip((r.match(/class="company-name"[^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
    const code = strip(((r.match(/class="company-code"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '').replace(/<span[^>]*rank[^>]*>[\s\S]*?<\/span>/i, ''));
    const sorts = [...r.matchAll(/data-sort="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
    const tds = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => strip(m[1]));
    const money = (t) => { const m = String(t).replace(/,/g, '').match(/\$\s?(-?[\d.]+)\s*([TBMK])?/i); if (!m) return null; const k = { T: 1e12, B: 1e9, M: 1e6, K: 1e3 }[(m[2] || '').toUpperCase()] || 1; return Number(m[1]) * k; };
    const capTxt = tds.find((t) => /\$[\d.,]+\s*[TBM]\b/.test(t)); const priceTxt = tds.find((t) => t !== capTxt && /^\$[\d.,]+$/.test(t));
    const pctTxt = tds.find((t) => /^-?[\d.]+%$/.test(t));
    const rank = sorts.length ? sorts[0] : null;
    const country = tds.length ? tds[tds.length - 1].replace(/[^\p{L}\s.]/gu, '').trim() : '';
    return { rank, n: name, s: code, mcap: money(capTxt), p: money(priceTxt), chg: pctTxt ? Number(pctTxt.replace('%', '')) : null, country };
  }).filter((x) => x.n && Number.isFinite(x.mcap) && x.mcap > 1e9);
}
async function worldRanking() {
  const KIND = { gold: 'metal', silver: 'metal', platinum: 'metal', palladium: 'metal', copper: 'metal', bitcoin: 'crypto', ethereum: 'crypto', xrp: 'crypto', tether: 'crypto', bnb: 'crypto', solana: 'crypto' };
  const kind = (n) => KIND[n.toLowerCase()] || (/\b(etf|trust|fund)\b/i.test(n) ? 'etf' : 'stock');
  let list = [], debug = '';
  try {
    const html = await get('https://companiesmarketcap.com/assets-by-market-cap/');
    list = parseAssetsHtml(html).map((x, i) => ({ ...x, rank: x.rank || i + 1, kind: kind(x.n) }));
    if (list.length < 20) { const k = html.indexOf('company-name'); debug = html.slice(Math.max(0, k - 900), k + 1100).replace(/\s+/g, ' '); }
  } catch (e) { debug = String(e.message || e); }
  if (list.length < 20) {
    // reserva: planilha das empresas (sem metais e cripto)
    const rows = csvRows(await get('https://companiesmarketcap.com/?download=csv'));
    if (!rows.length || !('marketcap' in rows[0])) throw new Error('formato da planilha mudou; ' + debug.slice(0, 300));
    list = rows.slice(0, 100).map((r, i) => ({ rank: Number(r.rank) || i + 1, n: r.name, s: r.symbol || '', kind: 'stock', mcap: Number(r.marketcap), p: Number(r['price (usd)']), chg: null, country: r.country || '' })).filter((x) => x.n && x.mcap > 0);
    worldDebug = debug.slice(0, 2000);
  }
  return list.slice(0, 100);
}
let worldDebug = '';

// ---------- execução ----------
const t0 = Date.now();
const prevMarkets = await previous('markets');
for (const [name, fn] of [['news', news], ['calendar', calendar], ['markets', () => markets(prevMarkets)]]) {
  try { const r = await fn(); status[name] = { ok: true, ...r }; console.log('✓', name, JSON.stringify(r)); }
  catch (e) {
    status[name] = { ok: false, err: String(e.message || e).slice(0, 160) };
    console.warn('✗', name, status[name].err);
    // mantém o arquivo anterior intacto (com o horário antigo) para o site saber que não é novo
    const old = await previous(name); if (old) save(name, old);
  }
}
save('status', { generatedAt: new Date().toISOString(), ms: Date.now() - t0, sources: status });
writeFileSync(join(OUT, 'README.md'), '# Dados do NEXUS HUB\n\nRamo gerado automaticamente pelo robô (GitHub Actions). Não edite à mão.\n');
console.log(`pronto em ${Math.round((Date.now() - t0) / 1000)} s`);
