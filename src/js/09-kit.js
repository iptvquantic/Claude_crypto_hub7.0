// =====================================================================
// Peças comuns das páginas: cabeçalho de painel, links externos, notas de
// fonte, "só atualiza com a página aberta" e fontes compartilhadas.
// =====================================================================
const onPage = (...ids) => () => ids.includes(S.page) && !document.hidden;
function panelHead(icon, title, { sub = '', right = '', id = '' } = {}) {
  return `<div class="panel-h"><div class="tt"><h2 class="panel-t"${id ? ` id="${id}"` : ''}>${icon ? ico(icon, 18) : ''}${esc(title)}</h2>${sub ? `<p class="panel-s">${sub}</p>` : ''}</div>${right}</div>`;
}
const extLink = (url, text, cls = 'link-btn') => `<a class="${cls}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(text)}${cls === 'link-btn' ? ico('external-link', 14) : ''}</a>`;
const note = (html) => `<p class="panel-note">${html}</p>`;
const kpiBox = (k, v, s = '', cls = '') => `<div class="kpi ${cls}"><span class="k">${k}</span><span class="v">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
// texto explicativo com cor: números em negrito, palavras de fundo/compra em verde e de topo/venda em vermelho
let _RICH = null;
try { _RICH = new RegExp('(^|[^\\p{L}\\d])(?:(\\d+(?:[.,]\\d+)*(?:\\s?[×%])?)|(fundos?|acumula\\p{L}*|barat\\p{L}*|compra\\p{L}*|capitula\\p{L}*|bottoms?|cheap\\p{L}*|buy\\p{L}*|undervalued|accumulat\\p{L}*)|(topos?|distribui\\p{L}*|car[oa]s?|vend[ae]\\p{L}*|euforia|euf[óo]ric\\p{L}*|bolhas?|tops?|expensive|sell\\p{L}*|overvalued|overheat\\p{L}*|euphori\\p{L}*|bubbles?))(?![\\p{L}\\d])', 'giu'); } catch { _RICH = null; }
function richText(t) {
  t = String(t || ''); if (!_RICH) return esc(t);
  let out = '', last = 0, m; _RICH.lastIndex = 0;
  while ((m = _RICH.exec(t))) {
    const st = m.index + (m[1] || '').length; const w = m[2] || m[3] || m[4];
    out += esc(t.slice(last, st)) + `<b class="${m[2] ? 'hl-n' : m[3] ? 'hl-up' : 'hl-dn'}">${esc(w)}</b>`;
    last = st + w.length;
    if (_RICH.lastIndex <= m.index) _RICH.lastIndex = m.index + 1;
  }
  return out + esc(t.slice(last));
}
const pp = (v, dec = 2) => (isNum(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), dec, dec)} p.p.` : '—');
function setHTML(sel, html, root = document) { const el = typeof sel === 'string' ? $(sel, root) : sel; if (el && el.innerHTML !== html) el.innerHTML = html; return el; }
// marca d'água de "modelo": para números que são cálculo nosso, não leitura de fonte
const modelBadge = (title) => `<span class="badge model" title="${esc(title || L('Cálculo do NEXUS HUB a partir de dados reais; não é leitura direta de uma fonte.', 'NEXUS HUB calculation from real data; not a direct source reading.'))}">${esc(L('modelo', 'model'))}</span>`;
const refBadge = (title) => `<span class="badge ref" title="${esc(title || '')}">${esc(L('referência', 'reference'))}</span>`;

// ---------- fontes compartilhadas por várias páginas ----------
function registerSharedSources() {
  source({
    id: 'fng', label: 'Fear & Greed', provider: 'alternative.me', every: 10 * 60e3, kind: 'daily',
    run: async () => (await getJSON('https://api.alternative.me/fng/?limit=31', { timeout: 10000 })).data,
    validate: (a) => Array.isArray(a) && a.length && isNum(num(a[0].value)),
    onData: (a) => { HEALTH.fng.dataTs = num(a[0].timestamp) * 1000; _markDirty('FNG'); },
  });
  source({
    id: 'global', label: L('Mercado cripto (total)', 'Crypto market (total)'), provider: 'CoinGecko', every: 5 * 60e3,
    run: async () => {
      try {
        const j = await getJSON('https://api.coingecko.com/api/v3/global', { timeout: 12000 });
        const d = j.data;
        return { mcap: d.total_market_cap.usd, vol: d.total_volume.usd, mcapChg: d.market_cap_change_percentage_24h_usd, dom: d.market_cap_percentage, coins: d.active_cryptocurrencies, at: (d.updated_at || 0) * 1000, src: 'CoinGecko' };
      } catch (e) {
        // reserva: CoinPaprika (sem dominância das demais moedas)
        const p = await getJSON('https://api.coinpaprika.com/v1/global', { timeout: 12000 });
        return { mcap: p.market_cap_usd, vol: p.volume_24h_usd, mcapChg: num(p.market_cap_change_24h), dom: { btc: p.bitcoin_dominance_percentage }, coins: p.cryptocurrencies_number, at: (p.last_updated || 0) * 1000, src: 'CoinPaprika' };
      }
    },
    validate: (d) => d.mcap > 1e11 && d.mcap < 1e14 && d.dom && d.dom.btc > 5 && d.dom.btc < 95,
    onData: (d) => { SRC.global.provider = d.src; _markDirty('GLOBAL'); },
  });
}
// dominância 24 h atrás, derivada das variações reais de 24 h (CoinGecko): dom_antes = dom × (1+Δtotal)/(1+Δmoeda)
function domChange24h(cgId, domNow) {
  const g = CACHE.get('global'); const m = CGM[cgId];
  if (!g || !g.v || !m || !isNum(domNow) || !isNum(g.v.mcapChg) || !isNum(m.market_cap_change_percentage_24h)) return null;
  const before = domNow * (1 + g.v.mcapChg / 100) / (1 + m.market_cap_change_percentage_24h / 100);
  return domNow - before;
}
const DOM_IDS = { btc: 'bitcoin', eth: 'ethereum', usdt: 'tether', usdc: 'usd-coin', xrp: 'ripple', bnb: 'binancecoin', sol: 'solana', doge: 'dogecoin', trx: 'tron', ada: 'cardano', steth: 'staked-ether', hype: 'hyperliquid', link: 'chainlink' };
