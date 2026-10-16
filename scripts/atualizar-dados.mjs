#!/usr/bin/env node
// =====================================================================
// Robô de dados do NEXUS HUB (roda no GitHub Actions a cada ~20 min).
// Busca no servidor o que o navegador não consegue (bloqueio de CORS ou limites):
//   news.json      notícias em PT-BR (RSS direto + Google Notícias), por tema
//   calendar.json  calendário econômico global da semana (ForexFactory)
//   markets.json   bolsas, juros, dólar global, commodities e cotas de ETFs (Yahoo)
//                  + ranking dos maiores ativos do mundo (companiesmarketcap)
//   status.json    situação de cada fonte nesta execução
//   lab.json       histórico diário on-chain do BTC (Bitcoin Lab e On-chain)
//   buybacks.json  recompra, queima e repasse aos detentores por token
//   whales.json    100 maiores endereços de BTC e distribuição por faixa
//   (news.json também traz cats.geo: geopolítica por conflito, 7 dias)
// E mantém o banco (Supabase grátis) ativo: o plano grátis pausa o projeto após ~7 dias sem consultas.
// Regra de ouro: NUNCA quebrar o site. Se uma fonte falhar, o arquivo anterior é mantido
// com o horário antigo (o site percebe que está velho e busca direto na fonte).
// Uso: node scripts/atualizar-dados.mjs <pasta-de-saída>
// =====================================================================
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { geoNews, lab, buybacks, whales } from './robo/extras.mjs';

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
    if (as === 'json') return await r.json();
    // texto: respeita o charset (feeds em ISO-8859-1 como Folha e UOL viravam "ora��o")
    const buf = new Uint8Array(await r.arrayBuffer());
    const head = new TextDecoder('latin1').decode(buf.subarray(0, 300));
    const cs = ((r.headers.get('content-type') || '').match(/charset=([\w-]+)/i) || head.match(/encoding=["']([\w-]+)["']/i) || [])[1] || 'utf-8';
    try { return new TextDecoder(cs.toLowerCase()).decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
  } finally { clearTimeout(t); }
}
async function raw(url, { timeout = 20000, headers = {} } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': UA, accept: 'application/json', ...headers } }); return { status: r.status, ok: r.ok, text: await r.text() }; }
  finally { clearTimeout(t); }
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { err: String(e.message || e) }; } } })); return out; }
async function previous(name) { try { return await get(PREV + name + '.json?t=' + Date.now(), { as: 'json', timeout: 15000 }); } catch { return null; } }
const save = (name, obj) => writeFileSync(join(OUT, name + '.json'), JSON.stringify(obj));

// ---------- banco de dados (Supabase) ----------
// Sem consultas por ~7 dias o Supabase grátis pausa o projeto e o login/Vault param. Uma chamada mínima
// à função ping (não lê tabela nenhuma; liberada para visitante) a cada execução conta como uso.
// Endereço e chave PUBLICÁVEL vêm da configuração do site (uma fonte só).
function supabaseConfig() {
  let src = '';
  try { src = readFileSync(new URL('../src/js/00-config.js', import.meta.url), 'utf8'); } catch { /* sem o arquivo: usa as variáveis */ }
  const url = process.env.SUPABASE_URL || (src.match(/supabaseUrl:\s*'([^']+)'/) || [])[1];
  const key = process.env.SUPABASE_KEY || (src.match(/supabaseKey:\s*'([^']+)'/) || [])[1];
  return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
}
async function db() {
  const cfg = supabaseConfig(); if (!cfg) throw new Error('configuração do Supabase não encontrada');
  const t = Date.now(); const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(cfg.url + '/rest/v1/rpc/ping', { method: 'POST', signal: ctl.signal, headers: { apikey: cfg.key, 'content-type': 'application/json', accept: 'application/json', 'user-agent': UA }, body: '{}' });
    if (r.status === 540) throw new Error('projeto pausado no Supabase (reativar no painel)');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (!j || j.ok !== true) throw new Error('resposta inesperada do ping');
    return { ms: Date.now() - t };
  } finally { clearTimeout(to); }
}

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
const GNE = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
const NEWS = {
  cripto: { maxH: 72, feeds: [['https://livecoins.com.br/feed/', 'Livecoins', 'pt'], ['https://portaldobitcoin.uol.com.br/feed/', 'Portal do Bitcoin', 'pt'], ['https://www.criptofacil.com/feed/', 'CriptoFácil', 'pt'], [GN('bitcoin OR criptomoedas OR ethereum when:2d'), 'Google Notícias', 'pt'], ['https://cointelegraph.com/rss', 'Cointelegraph', 'en'], ['https://www.coindesk.com/arc/outboundfeeds/rss/', 'CoinDesk', 'en'], ['https://decrypt.co/feed', 'Decrypt', 'en']] },
  economia: { maxH: 48, feeds: [['https://www.infomoney.com.br/feed/', 'InfoMoney', 'pt'], ['https://www.moneytimes.com.br/feed/', 'Money Times', 'pt'], ['https://g1.globo.com/rss/g1/economia/', 'g1 Economia', 'pt'], ['https://www.poder360.com.br/feed/', 'Poder360', 'pt'], [GN('economia OR Ibovespa OR Selic OR dólar when:1d'), 'Google Notícias', 'pt']] },
  tech: { maxH: 72, feeds: [['https://rss.tecmundo.com.br/feed', 'TecMundo', 'pt'], ['https://canaltech.com.br/rss/', 'Canaltech', 'pt'], ['https://olhardigital.com.br/feed/', 'Olhar Digital', 'pt'], ['https://g1.globo.com/rss/g1/tecnologia/', 'g1 Tecnologia', 'pt'], [GN('inteligência artificial when:2d'), 'Google Notícias', 'pt']] },
  mundo: { maxH: 72, feeds: [['https://feeds.bbci.co.uk/portuguese/rss.xml', 'BBC News Brasil', 'pt'], ['https://g1.globo.com/rss/g1/mundo/', 'g1 Mundo', 'pt'], ['https://feeds.folha.uol.com.br/mundo/rss091.xml', 'Folha Mundo', 'pt'], [GN('guerra OR Ucrânia OR Israel OR Irã OR Taiwan OR tarifas when:1d'), 'Google Notícias', 'pt'], ['https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC World', 'en']] },
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
  // geopolítica: fontes próprias, 7 dias e cota por dia (mantém a do arquivo anterior se falhar)
  let geoInfo = '';
  try { const g = await geoNews(CTX); cats.geo = g.items; geoInfo = `${g.items.length} (${g.feeds}, ${g.days} dias)`; }
  catch (e) { const old = await previous('news'); if (old && old.cats && Array.isArray(old.cats.geo)) cats.geo = old.cats.geo; geoInfo = 'falhou: ' + String(e.message || e).slice(0, 80); console.warn('  geo', geoInfo); }
  save('news', { generatedAt: new Date().toISOString(), cats, geoAt: geoInfo.startsWith('falhou') ? undefined : new Date().toISOString() });
  return { n, feeds: `${okFeeds}/${all}`, geo: geoInfo };
}

// ---------- calendário econômico ----------
// 1º TradingView (traz o resultado "atual", 3 semanas, inclui Brasil); reserva: ForexFactory (semana atual).
const tvNum = (v, unit, scale) => (v === null || v === undefined || v === '' ? '' : `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 })}${scale || ''}${unit === '%' ? '%' : unit && unit.length <= 3 ? ' ' + unit : ''}`);
async function tvCalendar() {
  const from = new Date(Date.now() - 3 * 86400e3).toISOString(), to = new Date(Date.now() + 24 * 86400e3).toISOString();
  const j = await get(`https://economic-calendar.tradingview.com/events?from=${from}&to=${to}&countries=US,BR,EU,DE,GB,JP,CN,CA,AU`, { as: 'json', headers: { origin: 'https://www.tradingview.com', referer: 'https://www.tradingview.com/' } });
  const r = (j && j.result) || [];
  return r.filter((x) => x && x.title && x.date && x.country).map((x) => ({
    title: String(x.title).slice(0, 120), country: x.country, date: x.date,
    impact: x.importance === 1 ? 'High' : x.importance === 0 ? 'Medium' : 'Low',
    forecast: tvNum(x.forecast, x.unit, x.scale), previous: tvNum(x.previous, x.unit, x.scale), actual: tvNum(x.actual, x.unit, x.scale),
    period: x.period || '',
  }));
}
async function ffCalendar() {
  const urls = ['https://nfs.faireconomy.media/ff_calendar_thisweek.json', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'];
  const parts = await pool(urls, 2, (u) => get(u, { as: 'json' }));
  if (!Array.isArray(parts[0])) throw new Error('semana atual indisponível: ' + (parts[0] && parts[0].err));
  return parts.filter(Array.isArray).flat().filter((x) => x && x.title && x.date && x.country).map((x) => ({ title: String(x.title).slice(0, 120), country: x.country, date: x.date, impact: x.impact, forecast: x.forecast || '', previous: x.previous || '', actual: x.actual || '' }));
}
async function calendar() {
  let ev = [], src = 'TradingView', note = '';
  try { ev = await tvCalendar(); } catch (e) { note = 'TradingView: ' + String(e.message || e); }
  if (ev.length < 10) { src = 'ForexFactory'; ev = await ffCalendar(); }
  save('calendar', { generatedAt: new Date().toISOString(), src, events: ev });
  return { n: ev.length, src, ...(note ? { note } : {}) };
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
      const res = j.chart && j.chart.result && j.chart.result[0]; const m = res && res.meta;
      if (!m || !Number.isFinite(m.regularMarketPrice)) throw new Error('sem preço');
      // variação do DIA: fechamento anterior = penúltimo fechamento diário (chartPreviousClose é de antes dos 5 dias)
      const closes = ((res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || []).filter(Number.isFinite);
      const prev = closes.length >= 2 ? closes[closes.length - 2] : m.previousClose;
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
const CTX = { get, raw, pool, previous, save, parseRss, strip, GN, GNE };
const t0 = Date.now();
const prevMarkets = await previous('markets');
for (const [name, fn] of [['news', news], ['calendar', calendar], ['markets', () => markets(prevMarkets)], ['lab', () => lab(CTX)], ['buybacks', () => buybacks(CTX)], ['whales', () => whales(CTX)]]) {
  try { const r = await fn(); status[name] = { ok: true, ...r }; console.log('✓', name, JSON.stringify(r)); }
  catch (e) {
    status[name] = { ok: false, err: String(e.message || e).slice(0, 160) };
    console.warn('✗', name, status[name].err);
    // mantém o arquivo anterior intacto (com o horário antigo) para o site saber que não é novo
    const old = await previous(name); if (old) save(name, old);
  }
}
try { const r = await db(); status.db = { ok: true, ...r }; console.log('✓ db', JSON.stringify(r)); }
catch (e) { status.db = { ok: false, err: String(e.message || e).slice(0, 160) }; console.warn('✗ db', status.db.err); }
save('status', { generatedAt: new Date().toISOString(), ms: Date.now() - t0, sources: status });
writeFileSync(join(OUT, 'README.md'), '# Dados do NEXUS HUB\n\nRamo gerado automaticamente pelo robô (GitHub Actions). Não edite à mão.\n');
console.log(`pronto em ${Math.round((Date.now() - t0) / 1000)} s`);
