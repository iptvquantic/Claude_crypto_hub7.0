// Testa o robô de dados (scripts/atualizar-dados.mjs) sem internet: troca o fetch por respostas simuladas
// e confere os arquivos gerados. Uso: node dev/test-robot.mjs
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const now = Date.now();
const rfc = (ms) => new Date(ms).toUTCString();
const rss = (src, n = 8, extra = '') => `<?xml version="1.0"?><rss><channel><title>${src}</title>${Array.from({ length: n }, (_, i) => `<item><title><![CDATA[${src} manchete ${i} &amp; mercado${extra}]]></title><link>https://news.test/${encodeURIComponent(src)}/${i}</link><pubDate>${rfc(now - (i * 50 + 2) * 60e3)}</pubDate><description><![CDATA[<p>Resumo <b>${i}</b></p>]]></description><media:content url="https://img.test/${i}.jpg" medium="image"/></item>`).join('')}<item><title>velha</title><link>https://news.test/old</link><pubDate>${rfc(now - 9 * 86400e3)}</pubDate></item></channel></rss>`;
let calls = 0;
const failing = new Set(['https://www.criptofacil.com/feed/', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json']);
globalThis.fetch = async (url) => {
  calls++;
  const u = String(url);
  const res = (body, ok = true, status = 200) => ({ ok, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => (typeof body === 'string' ? JSON.parse(body) : body) });
  if (failing.has(u)) return res('erro', false, 503);
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
console.log(`\n${fails.length ? '✗ ' + fails.length + ' falha(s)' : '✓ robô: tudo certo'} (${calls} pedidos simulados)`);
process.exit(fails.length ? 1 : 0);
