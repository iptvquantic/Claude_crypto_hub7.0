// Testa o robô de dados (scripts/atualizar-dados.mjs) sem internet: troca o fetch por respostas simuladas
// e confere os arquivos gerados. Uso: node dev/test-robot.mjs
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const now = Date.now();
const rfc = (ms) => new Date(ms).toUTCString();
const rss = (src, n = 8, extra = '') => `<?xml version="1.0"?><rss><channel><title>${src}</title>${Array.from({ length: n }, (_, i) => `<item><title><![CDATA[${src} manchete ${i} &amp; mercado${extra}]]></title><link>https://news.test/${encodeURIComponent(src)}/${i}</link><pubDate>${rfc(now - (i * 50 + 2) * 60e3)}</pubDate><description><![CDATA[<p>Resumo <b>${i}</b></p>]]></description><media:content url="https://img.test/${i}.jpg" medium="image"/></item>`).join('')}<item><title>velha</title><link>https://news.test/old</link><pubDate>${rfc(now - 9 * 86400e3)}</pubDate></item></channel></rss>`;
// ---- dados simulados das fontes novas ----
const DAY = 86400e3, T0 = Date.UTC(2010, 6, 18);
const nDays = Math.floor((Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - T0) / DAY) + 1;
const cmRows = () => Array.from({ length: nDays }, (_, i) => { const p = 0.08 * Math.exp(i / 520) * (1 + 0.2 * Math.sin(i / 90)); return { asset: 'btc', time: new Date(T0 + i * DAY).toISOString().replace('Z', '000000Z'), PriceUSD: String(p), CapMVRVCur: String(1.4 + 0.6 * Math.sin(i / 200)), CapMrktCurUSD: String(p * 1.9e7), IssTotUSD: String(900 * p), HashRate: String(1e3 * Math.exp(i / 400)), AdrActCnt: String(800000), SplyCur: String(Math.min(2.1e7, 3e6 + i * 3000)), SplyExNtv: i > 3000 ? String(2.4e6) : undefined, FlowInExNtv: i > 3000 ? '30000' : undefined, FlowOutExNtv: i > 3000 ? '31000' : undefined, FeeTotNtv: '12.5', TxCnt: '400000' }; });
const bdRows = (key) => Array.from({ length: 1500 }, (_, i) => ({ d: new Date(Date.now() - (1507 - i) * DAY).toISOString().slice(0, 10), unixTs: '1', [key]: key === 'cvdd' ? 14000 + i : 1 + i / 3000 }));
const GEO_T = ['Irã ameaça fechar o Estreito de Ormuz após ataque a petroleiro', 'Ucrânia diz ter destruído jatos em base militar russa', 'China faz exercícios militares perto de Taiwan', 'EUA anunciam novas tarifas contra a China', 'Israel bombardeia o sul do Líbano; Hezbollah responde com drones', 'Rússia lança ataque com mísseis contra Kiev', 'Houthis atacam navio no Mar Vermelho', 'Conselho de Segurança da ONU se reúne sobre Gaza'];
const geoRss = (src) => `<?xml version="1.0"?><rss><channel><title>${src}</title>${Array.from({ length: 24 }, (_, i) => `<item><title><![CDATA[${GEO_T[i % GEO_T.length]} (${src} ${i})]]></title><link>https://geo.test/${encodeURIComponent(src)}/${i}</link><pubDate>${new Date(now - (i * 7 + 1) * 3600e3).toUTCString()}</pubDate><description>Resumo ${i}</description></item>`).join('')}<item><title>Bumbum masculino atrai mulheres? O que é glutemaxxing</title><link>https://geo.test/off</link><pubDate>${new Date(now - 3600e3).toUTCString()}</pubDate></item><item><title>Guerra antiga demais</title><link>https://geo.test/velha</link><pubDate>${new Date(now - 9 * DAY).toUTCString()}</pubDate></item></channel></rss>`;
const GEO_HOSTS = /g1\.globo\.com\/rss\/g1\/mundo|folha\.uol|estadao|bbci|dw\.com|metropoles|aljazeera|theguardian|nytimes|kyivpost|gulfnews|gcaptain|maritime-executive|seatrade/;
const llamaOverview = { protocols: [
  { name: 'Hyperliquid Perps', displayName: 'Hyperliquid Perps', parentProtocol: 'parent#hyperliquid', defillamaId: '1', slug: 'hyperliquid-perps', category: 'Derivatives', chains: ['Hyperliquid L1'], total24h: 3e6, total7d: 2e7, total30d: 7e7, total60dto30d: 6e7, total1y: 6e8, totalAllTime: 9e8, methodology: { HoldersRevenue: 'Assistance Fund buybacks of HYPE' } },
  { name: 'Hyperliquid Spot', displayName: 'Hyperliquid Spot', parentProtocol: 'parent#hyperliquid', defillamaId: '2', slug: 'hyperliquid-spot', category: 'Dexs', chains: ['Hyperliquid L1'], total24h: 1e5, total7d: 6e5, total30d: 2e6, total60dto30d: 2e6, total1y: 2e7, totalAllTime: 3e7 },
  { name: 'Tron', displayName: 'Tron', defillamaId: '3', slug: 'tron', category: 'Chain', chains: ['Tron'], total24h: 9e5, total7d: 5e6, total30d: 2.2e7, total60dto30d: 2e7, total1y: 3.4e8, totalAllTime: 9e8, methodology: { HoldersRevenue: 'Burned TRX fees' } },
  { name: 'Papertrade', displayName: 'Papertrade', defillamaId: '4', slug: 'papertrade', category: 'Derivatives', chains: ['X'], total24h: 6e6, total7d: 4e7, total30d: 4.5e7, total1y: 4.5e7 },
  { name: 'Tiny Burn', displayName: 'Tiny Burn', defillamaId: '5', slug: 'tiny-burn', category: 'Dexs', chains: ['Base'], total24h: 2, total7d: 12, total30d: 50, total60dto30d: 40, total1y: 300, totalAllTime: 300, methodology: { HoldersRevenue: 'Fees used to buy back and burn TINY' } },
  { name: 'Parado', displayName: 'Parado', defillamaId: '6', slug: 'parado', category: 'Dexs', chains: ['Base'], total24h: 0, total7d: 0, total30d: 0, total60dto30d: 0, total1y: 900, totalAllTime: 900 },
  ...Array.from({ length: 12 }, (_, i) => ({ name: 'Proto ' + i, displayName: 'Proto ' + i, defillamaId: '9' + i, slug: 'proto-' + i, category: 'Dexs', chains: ['Ethereum'], total24h: 1e4 * (12 - i), total7d: 7e4 * (12 - i), total30d: 3e5 * (12 - i), total60dto30d: 2e5 * (12 - i), total1y: 3e6 * (12 - i), totalAllTime: 5e6, methodology: { HoldersRevenue: i % 2 ? 'Fees distributed to stakers' : 'Protocol buys back and burns the token' } })),
] };
const bitinfoHtml = `<html><table class="t"><caption>Bitcoin distribution</caption><thead><tr><th>Balance, BTC</th><th>Addresses</th><th>% Addresses (Total)</th><th>BTC</th><th>USD</th><th>% BTC (Total)</th></tr></thead><tbody>${['(0 - 0.00001)', '[0.00001 - 0.0001)', '[0.0001 - 0.001)', '[0.001 - 0.01)', '[0.01 - 0.1)', '[0.1 - 1)', '[1 - 10)', '[10 - 100)'].map((r, i) => `<tr><td>${r}</td><td data-val='${1000 * (i + 1)}'>${1000 * (i + 1)}</td><td data-val='1'>1.5% (100%)</td><td data-val='${50 * i}'>${50 * i} BTC</td><td data-val='${50 * i}'>$${(50 * i * 80000).toLocaleString('en-US')}</td><td data-val='0'>${i}.5% (99%)</td></tr>`).join('')}</tbody></table><table id="tblOne"><tbody>${Array.from({ length: 60 }, (_, i) => `<tr><td>${i + 1}</td><td><a href="https://bitinfocharts.com/bitcoin/address/bc1qaddr${String(i).padStart(30, '0')}">bc1qaddr${i}</a> <small>wallet: Exchange-${i}</small></td><td>${(250000 - i * 1000).toLocaleString('en-US')} BTC ($20,000,000,000)</td><td>1.${i}%</td><td>2018-10-18 12:59:18 UTC</td><td>2026-10-12 01:06:56 UTC</td><td>5557</td><td>2018-10-18 13:19:26 UTC</td><td>2023-01-07 06:15:34 UTC</td><td>451</td></tr>`).join('')}</tbody></table></html>`;
let calls = 0;
let pingFails = false; let pings = [];
const failing = new Set(['https://www.criptofacil.com/feed/', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json']);
globalThis.fetch = async (url, opts = {}) => {
  calls++;
  const u = String(url);
  const res = (body, ok = true, status = 200, ct = null) => { const txt = typeof body === 'string' ? body : JSON.stringify(body); return { ok, status, headers: { get: (h) => (h.toLowerCase() === 'content-type' ? ct : null) }, text: async () => txt, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), arrayBuffer: async () => (body instanceof Uint8Array ? body : new TextEncoder().encode(txt)).buffer }; };
  if (u.includes('feeds.folha.uol.com.br/mundo')) { const xml = `<?xml version="1.0" encoding="ISO-8859-1"?><rss><channel><title>Folha</title><item><title>Papa faz oração pela paz em Gaza e pede cessar-fogo</title><link>https://folha.test/1</link><pubDate>${new Date(now - 2 * 3600e3).toUTCString()}</pubDate></item></channel></rss>`; return res(Uint8Array.from(xml, (c) => c.charCodeAt(0)), true, 200, 'text/xml; charset=ISO-8859-1'); }
  if (u.includes('.supabase.co/rest/v1/rpc/ping')) { pings.push({ u, method: opts.method, key: (opts.headers || {}).apikey }); return pingFails ? res('paused', false, 540) : res({ ok: true, server_time: new Date().toISOString() }); }
  if (failing.has(u)) return res('erro', false, 503);
  if (u.includes('community-api.coinmetrics.io/v4/timeseries')) return res({ data: cmRows() });
  if (u.startsWith('https://bitcoin-data.com/v1/')) { const name = u.split('/v1/')[1]; if (name === 'reserve-risk') return res({ status: 404 }, false, 404); const key = { cvdd: 'cvdd', 'sth-realized-price': 'sthRealizedPrice', 'lth-realized-price': 'lthRealizedPrice', aviv: 'aviv' }[name] || 'x'; return res(bdRows(key)); }
  if (u.startsWith('https://api.alternative.me/fng/')) return res({ data: Array.from({ length: 900 }, (_, i) => ({ value: String(20 + (i % 60)), timestamp: String(Math.floor((now - i * DAY) / 1000)) })) });
  if (u.startsWith('https://api.llama.fi/overview/fees')) return res(llamaOverview);
  if (u.startsWith('https://api.llama.fi/summary/fees/')) { const slug = decodeURIComponent(u.split('/summary/fees/')[1].split('?')[0]); if (slug === 'papertrade') return res({ name: 'Papertrade', gecko_id: null }); const g = { hyperliquid: ['Hyperliquid', 'HYPE', 'hyperliquid'], tron: ['Tron', 'TRX', 'tron'] }[slug] || [slug, slug.toUpperCase().replace('-', ''), slug]; return res({ name: g[0], displayName: g[0], symbol: g[1], gecko_id: g[2], logo: 'https://icons.test/' + slug, category: 'Dexs', methodology: slug === 'tron' ? 'Burned TRX fees' : undefined, total24h: null, totalDataChart: Array.from({ length: 220 }, (_, i) => [Math.floor((now - (220 - i) * DAY) / 1000), 1000 + i]) }); }
  if (u.startsWith('https://api.coingecko.com/api/v3/coins/markets') && u.includes('ids=')) { const ids = decodeURIComponent(u.split('ids=')[1].split('&')[0]).split(','); return res(ids.map((id, i) => ({ id, symbol: id.slice(0, 4), market_cap: 1e9 * (i + 1), fully_diluted_valuation: 2e9 * (i + 1), current_price: 10 + i, price_change_percentage_24h: 1.5, image: 'https://img.test/' + id, market_cap_rank: i + 1 }))); }
  if (u.includes('bitinfocharts.com/top-100-richest-bitcoin-addresses')) return res(bitinfoHtml);
  if (GEO_HOSTS.test(u)) return res(geoRss(new URL(u).host));
  if (u.includes('news.google.com') && /Ormuz|Ir%C3%A3|Ucr%C3%A2nia|Taiwan|tarifas|reuters/.test(u)) return res(geoRss('Google').replace(/<\/title><link>/g, ' - Reuters</title><link>'));
  if (u.startsWith('https://raw.githubusercontent.com/')) return res('404', false, 404);
  if (u.includes('news.google.com')) return res(rss('Google', 6, ' - Folha de S.Paulo'));
  if (/feed|rss/.test(u)) return res(rss(new URL(u).host));
  if (u.includes('ff_calendar_thisweek')) return res([{ title: 'CPI y/y', country: 'USD', date: new Date(now + 86400e3).toISOString(), impact: 'High', forecast: '3.1%', previous: '3.0%' }, { title: 'Bank Holiday', country: 'JPY', date: new Date(now).toISOString(), impact: 'Holiday' }]);
  if (u.includes('finance.yahoo.com/v8/finance/chart/')) {
    const sym = decodeURIComponent(u.split('/chart/')[1].split('?')[0]);
    if (sym === 'NG=F') return res({ chart: { result: null, error: { code: 'Not Found' } } });
    const p = sym === '^TNX' ? 41.2 : sym.endsWith('.SA') ? 88.4 : 100 + sym.length;
    return res({ chart: { result: [{ meta: { regularMarketPrice: p, chartPreviousClose: p / 1.2, regularMarketVolume: 12345, regularMarketTime: Math.floor(now / 1000) - 600, currency: 'USD' }, indicators: { quote: [{ close: [p / 1.1, p / 1.05, null, p / 1.01, p] }] } }] } });
  }
  if (u.includes('companiesmarketcap.com/assets-by-market-cap')) return res('nope', false, 404);
  if (u.includes('companiesmarketcap.com')) return res('Rank,Name,Symbol,marketcap,price (USD),country\n' + Array.from({ length: 40 }, (_, i) => `${i + 1},"Empresa ${i + 1}, Inc.",E${i},${(40 - i) * 1e11},${100 + i},United States`).join('\n'));
  return res('?', false, 404);
};
const out = mkdtempSync(join(tmpdir(), 'nx-robot-'));
process.argv[2] = out;
await import(pathToFileURL(new URL('../scripts/atualizar-dados.mjs', import.meta.url).pathname).href);
const read = (n) => JSON.parse(readFileSync(join(out, n + '.json'), 'utf8'));
const fails = [];
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails.push(m); };
const news = read('news');
ok(['cripto', 'economia', 'tech', 'mundo'].every((k) => news.cats[k].length > 10), 'notícias nas 4 categorias');
ok(!JSON.stringify(news).includes('velha'), 'notícia com mais de 3 dias descartada');
const g = news.cats.cripto.find((n) => n.t.startsWith('Google'));
ok(g && g.src === 'Folha de S.Paulo' && !/ - Folha/.test(g.t), 'Google Notícias: veículo separado do título');
ok(news.cats.cripto.every((n) => !/<|&amp;/.test(n.t + n.x)), 'títulos sem HTML nem entidades');
ok(news.cats.cripto[0].img.startsWith('https://img.test/'), 'imagem da notícia lida');
const cal = read('calendar');
ok(cal.events.length === 2 && cal.events[0].forecast === '3.1%', 'calendário da semana (próxima semana pode faltar)');
const mk = read('markets');
ok(mk.quotes['^GSPC'] && mk.quotes['^GSPC'].n === 'S&P 500' && Math.abs(mk.quotes['^GSPC'].chg - 1) < 0.01, 'cotação e variação do S&P 500');
ok(mk.quotes['^TNX'].p === 4.12, 'juros de 10 anos convertidos para %');
ok(!mk.quotes['NG=F'], 'cotação que falhou fica de fora (sem número inventado)');
ok(mk.etfs['IBIT'] && mk.etfs['HASH11.SA'], 'cotas de ETFs dos EUA e da B3');
ok(mk.world.length === 40 && mk.world[0].n === 'Empresa 1, Inc.' && mk.world[0].mcap === 4e12, 'ranking mundial pela planilha (vírgula entre aspas)');
const st = read('status');
ok(st.sources.news.ok && st.sources.calendar.ok && st.sources.markets.ok, 'status registra as fontes');
ok(/6\/7/.test(st.sources.news.feeds) || /\d+\/\d+/.test(st.sources.news.feeds), `feeds com falha contados (${st.sources.news.feeds})`);
ok(existsSync(join(out, 'README.md')), 'README do ramo de dados');
const geo = news.cats.geo || [];
const days = new Set(geo.map((n) => new Date(n.d - 3 * 3600e3).toISOString().slice(0, 10)));
ok(geo.length > 30 && days.size >= 5, `geopolítica: ${geo.length} notícias em ${days.size} dias (dias anteriores não somem)`);
ok(!geo.some((n) => /glutemaxxing|antiga demais/i.test(n.t)), 'geopolítica: sem notícia fora do tema e sem notícia velha');
ok(geo.some((n) => n.tp.includes('oriente')) && geo.some((n) => n.tp.includes('ucrania')) && geo.some((n) => n.tp.includes('rotas')) && geo.some((n) => n.tp.includes('asia')) && geo.some((n) => n.tp.includes('comercial')), 'geopolítica: notícias marcadas por conflito');
ok(geo.some((n) => n.ns >= 2), 'geopolítica: mesma história em vários veículos é contada');
ok(geo.some((n) => n.att), 'geopolítica: alegação atribuída marcada ("diz")');
ok(geo.some((n) => /oração pela paz/.test(n.t)), 'feed em ISO-8859-1 com acentos corretos');
const labj = read('lab');
ok(labj.t0 === '2010-07-18' && labj.cm.price.length === labj.n && labj.cm.price.filter((v) => v !== null).length > 5000 && labj.cm.mvrv.length === labj.n, 'lab: histórico diário do Coin Metrics alinhado por dia');
ok(Object.keys(labj.bd).length === 3 && labj.bd.cvdd && labj.bdLast.cvdd, 'lab: rodízio do bitcoin-data.com (3 por execução)');
ok(labj.fng && labj.fng.filter((v) => v !== null).length > 800, 'lab: histórico do medo e ganância');
const bb = read('buybacks');
ok(bb.list.length >= 8 && bb.list[0].d30 >= bb.list[1].d30 && bb.list.every((x) => x.cg), 'recompra: ranking por 30 dias, só tokens com id no CoinGecko');
ok(!bb.list.some((x) => /papertrade/i.test(x.n)), 'recompra: protocolo sem token fica de fora');
const hype = bb.list.find((x) => x.sym === 'HYPE');
ok(hype && hype.type === 'buyback-burn' && hype.parts.length === 2 && hype.mcap > 0 && hype.cv.length === 200 && hype.cv.every((v) => Number.isFinite(v)) && hype.c0 % 86400e3 === 0, 'recompra: versões somadas por token, tipo (Assistance Fund = recompra e queima), valor de mercado e série diária compacta');
ok(bb.list.length === 15 && bb.list.some((x) => x.id === 'tiny-burn') && !bb.list.some((x) => x.id === 'parado'), `recompra: todos os protocolos com token e fluxo nos últimos 60 dias entram, até os pequenos (${bb.list.length})`);
ok(bb.list.find((x) => x.sym === 'TRX').type === 'burn', 'recompra: queima identificada pela metodologia');
const wh = read('whales');
ok(wh.top.length === 60 && wh.top[0].label === 'Exchange-0' && wh.top[0].bal === 250000 && wh.dist.length === 8 && wh.dist[1].addrPct === 1.5, 'baleias: maiores endereços e faixas de saldo');
ok(st.sources.lab.ok && st.sources.buybacks.ok && st.sources.whales.ok, 'status registra lab, recompra e baleias');
ok(st.sources.db && st.sources.db.ok && pings.length === 1 && pings[0].method === 'POST' && /^sb_publishable_/.test(pings[0].key), 'banco mantido ativo (ping com a chave publicável da configuração)');
// 2ª execução: banco pausado não derruba o robô
pingFails = true;
const out2 = mkdtempSync(join(tmpdir(), 'nx-robot-'));
process.argv[2] = out2;
await import(pathToFileURL(new URL('../scripts/atualizar-dados.mjs', import.meta.url).pathname).href + '?run=2');
const st2 = JSON.parse(readFileSync(join(out2, 'status.json'), 'utf8'));
ok(st2.sources.db && !st2.sources.db.ok && /pausado/.test(st2.sources.db.err) && st2.sources.news.ok && existsSync(join(out2, 'news.json')), 'banco pausado: avisa no status e o resto continua');
console.log(`\n${fails.length ? '✗ ' + fails.length + ' falha(s)' : '✓ robô: tudo certo'} (${calls} pedidos simulados)`);
process.exit(fails.length ? 1 : 0);
