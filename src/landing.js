'use strict';
// Página de apresentação: cotações reais (Binance + AwesomeAPI) e a próxima decisão de juros pelo calendário oficial.
/*__AGENDA__*/
(() => {
  const $ = (s) => document.querySelector(s);
  const nf = (o) => new Intl.NumberFormat('pt-BR', o);
  const brl = (v, d = 2) => nf({ style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const usd = (v, d = 2) => nf({ style: 'currency', currency: 'USD', minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const pct = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v)) + '%';
  const st = { px: {}, usd: null, usdChg: null, at: 0 };
  const get = async (url) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 10000); try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); } };
  async function prices() {
    const syms = encodeURIComponent(JSON.stringify(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']));
    for (const base of ['https://api.binance.com', 'https://data-api.binance.vision']) {
      try {
        const a = await get(`${base}/api/v3/ticker/24hr?symbols=${syms}`);
        a.forEach((t) => { st.px[t.symbol] = { p: +t.lastPrice, c: +t.priceChangePercent }; });
        st.at = Date.now(); draw(); return;
      } catch { /* tenta o outro servidor */ }
    }
  }
  async function fx() {
    try { const j = await get('https://economia.awesomeapi.com.br/json/last/USD-BRL'); const b = +j.USDBRL.bid; if (b > 1 && b < 50) { st.usd = b; st.usdChg = +j.USDBRL.pctChange; draw(); } } catch { /* sem câmbio: R$ fica "—" */ }
  }
  const chip = (v) => `<span class="chip ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${pct(v).replace(/^[+−]/, '')}</span>`;
  function draw() {
    const b = st.px.BTCUSDT, e = st.px.ETHUSDT, s = st.px.SOLUSDT;
    if (b) { $('#btc-brl').textContent = st.usd ? brl(b.p * st.usd, 0) : usd(b.p, 0); $('#btc-usd').textContent = st.usd ? usd(b.p, 0) : ''; $('#btc-chg').innerHTML = chip(b.c) + ' <span style="color:var(--text-3);font-size:14px">24h</span>'; }
    if (e) { $('#eth').textContent = usd(e.p); $('#eth-c').innerHTML = `<span style="color:var(--${e.c >= 0 ? 'up' : 'down'})">${pct(e.c)}</span>`; }
    if (s) { $('#sol').textContent = usd(s.p); $('#sol-c').innerHTML = `<span style="color:var(--${s.c >= 0 ? 'up' : 'down'})">${pct(s.c)}</span>`; }
    if (st.usd) { $('#usd').textContent = brl(st.usd, 4); $('#usd-c').innerHTML = isFinite(st.usdChg) ? `<span style="color:var(--${st.usdChg >= 0 ? 'up' : 'down'})">${pct(st.usdChg)}</span>` : '&nbsp;'; }
    stamp();
  }
  function stamp() {
    const el = $('#st'); const s = Math.round((Date.now() - st.at) / 1000);
    el.classList.toggle('on', st.at && s < 60);
    $('#st-t').textContent = !st.at ? 'conectando…' : s < 10 ? 'agora' : s < 60 ? `há ${s} s` : `há ${Math.round(s / 60)} min`;
  }
  function nextEvent() {
    const now = Date.now();
    const evs = [...FOMC.map((iso) => ({ t: Date.parse(iso), n: 'Fed (EUA)' })), ...COPOM.map((iso) => ({ t: Date.parse(iso), n: 'Copom (Brasil)', approx: true }))].filter((x) => x.t > now).sort((a, b) => a.t - b.t);
    const x = evs[0]; const box = $('#ev'); if (!x) { box.remove(); return; }
    const s = Math.floor((x.t - now) / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    const when = new Date(x.t).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    box.innerHTML = `<div><b>Próxima decisão de juros</b><br><span>${x.n} · ${when}${x.approx ? ' (após o fechamento)' : ''}</span></div><div class="cd">${d > 0 ? d + ' d ' : ''}${h} h ${String(m).padStart(2, '0')} min</div>`;
  }
  prices(); fx(); nextEvent();
  setInterval(() => { if (!document.hidden) prices(); }, 15000);
  setInterval(() => { if (!document.hidden) fx(); }, 60000);
  setInterval(() => { stamp(); nextEvent(); }, 1000 * 20);
  setInterval(stamp, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { prices(); fx(); } });
})();
