// Regras dos alertas (sem rede): quando dispara, quando rearma e o texto de cada notificação.
// Usado pela função "alerts" (Deno) e pelos testes no Node (dev/test-alerts.mjs).
export const HYST = 0.003; // alerta que repete só rearma depois de voltar 0,3% além do alvo

// cotação de um alerta na moeda dele. Q = { bn: { BTCUSDT: {px, chg, t}, USDTBRL: {...} }, cg: { bitcoin: {usd, brl, chg, brlChg, t} } }
export function quoteFor(a, Q) {
  const b = a.bn && Q.bn && Q.bn[a.bn];
  if (b && b.px > 0) {
    if (a.ccy !== 'brl') return { px: b.px, chg: b.chg, t: b.t, src: 'Binance' };
    const r = Q.bn.USDTBRL;
    if (r && r.px > 0) return { px: b.px * r.px, chg: b.chg, t: Math.min(b.t, r.t), src: 'Binance', via: 'USDT/BRL' };
  }
  const g = a.cg && Q.cg && Q.cg[a.cg];
  if (g) {
    const px = a.ccy === 'brl' ? g.brl : g.usd;
    if (px > 0) return { px, chg: a.ccy === 'brl' && Number.isFinite(g.brlChg) ? g.brlChg : g.chg, t: g.t, src: 'CoinGecko' };
  }
  return null;
}

// 'fire' = disparar agora · 'rearm' = voltou (alerta que repete fica pronto de novo) · null = nada
export function judge(a, q) {
  if (!q || !(q.px > 0)) return null;
  const v = +a.value, chg = Number.isFinite(q.chg) ? q.chg : null;
  const hit = a.cond === 'above' ? q.px >= v
    : a.cond === 'below' ? q.px <= v
      : a.cond === 'up24' ? chg !== null && chg >= v
        : a.cond === 'down24' ? chg !== null && chg <= -v : false;
  if (a.armed && hit) return 'fire';
  if (!a.armed && a.repeat && !hit) {
    const back = a.cond === 'above' ? q.px < v * (1 - HYST)
      : a.cond === 'below' ? q.px > v * (1 + HYST)
        : a.cond === 'up24' ? chg !== null && chg < v / 2
          : a.cond === 'down24' ? chg !== null && chg > -v / 2 : false;
    if (back) return 'rearm';
  }
  return null;
}

const _nf = new Map();
function nf(lang, min, max) {
  const k = `${lang}|${min}|${max}`;
  if (!_nf.has(k)) _nf.set(k, new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max }));
  return _nf.get(k);
}
export function fmtNum(v, lang = 'pt') {
  const a = Math.abs(v);
  const [mi, ma] = a >= 1000 ? [0, 0] : a >= 1 ? [2, 2] : a >= 0.01 ? [4, 4] : [6, 8];
  return nf(lang, mi, ma).format(v);
}
export const money = (v, ccy, lang = 'pt') => `${ccy === 'brl' ? 'R$' : 'US$'} ${fmtNum(v, lang)}`;
export const pctAbs = (v, lang = 'pt') => `${nf(lang, 1, 1).format(Math.abs(v))}%`;
export const pctSigned = (v, lang = 'pt') => `${v >= 0 ? '+' : '−'}${pctAbs(v, lang)}`;
const TZ = 'America/Sao_Paulo';
export function hhmm(t, lang = 'pt', tz = TZ) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz || TZ }).format(new Date(t));
}
export function dayTime(t, lang = 'pt', tz = TZ) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: tz || TZ }).format(new Date(t));
}

export function priceMsg(a, q, lang = 'pt', tz = TZ) {
  const L = (pt, en) => (lang === 'en' ? en : pt);
  const sym = String(a.sym || '').toUpperCase(), v = +a.value, ccy = a.ccy === 'brl' ? 'brl' : 'usd';
  const title = a.cond === 'above' ? L(`${sym} acima de ${money(v, ccy, lang)}`, `${sym} above ${money(v, ccy, lang)}`)
    : a.cond === 'below' ? L(`${sym} abaixo de ${money(v, ccy, lang)}`, `${sym} below ${money(v, ccy, lang)}`)
      : a.cond === 'up24' ? L(`${sym} subiu ${pctAbs(q.chg, lang)} em 24 h`, `${sym} up ${pctAbs(q.chg, lang)} in 24h`)
        : L(`${sym} caiu ${pctAbs(q.chg, lang)} em 24 h`, `${sym} down ${pctAbs(q.chg, lang)} in 24h`);
  const chg = Number.isFinite(q.chg) ? L(` (${pctSigned(q.chg, lang)} em 24 h)`, ` (${pctSigned(q.chg, lang)} 24h)`) : '';
  const src = `${q.src}${q.via ? ' · ' + q.via : ''}, ${hhmm(q.t || Date.now(), lang, tz)}`;
  const body = `${L('Agora', 'Now')} ${money(q.px, ccy, lang)}${chg} · ${src}${a.note ? ' · ' + String(a.note).slice(0, 120) : ''}`;
  return { title, body };
}

export function eventMsg(e, lang = 'pt', tz = TZ, now = Date.now()) {
  const L = (pt, en) => (lang === 'en' ? en : pt);
  const at = typeof e.at === 'number' ? e.at : Date.parse(e.at);
  const mins = Math.round((at - now) / 60000);
  const when = mins <= 1 ? L('Agora', 'Now')
    : mins < 60 ? L(`Em ${mins} min`, `In ${mins} min`)
      : mins < 36 * 60 ? L(`Em ${Math.round(mins / 60)} h`, `In ${Math.round(mins / 60)} h`)
        : L(`Em ${Math.round(mins / 1440)} dias`, `In ${Math.round(mins / 1440)} days`);
  return { title: `${when}: ${e.title}`, body: `${dayTime(at, lang, tz)}${e.detail ? ' · ' + e.detail : ''}` };
}

export function testMsg(lang = 'pt', tz = TZ) {
  return lang === 'en'
    ? { title: 'NEXUS HUB alerts are on', body: `This is how your price and event alerts will arrive · ${hhmm(Date.now(), lang, tz)}` }
    : { title: 'Alertas do NEXUS HUB ligados', body: `É assim que seus alertas de preço e de eventos vão chegar · ${hhmm(Date.now(), lang, tz)}` };
}

export function renewMsg(lastAt, lang = 'pt', tz = TZ) {
  const d = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: '2-digit', timeZone: tz || TZ }).format(new Date(lastAt));
  return lang === 'en'
    ? { title: 'Keep your event alerts', body: `Your automatic event alerts are scheduled until ${d}. Open NEXUS HUB to schedule the next ones.` }
    : { title: 'Continue recebendo os avisos de eventos', body: `Seus avisos automáticos de eventos estão programados até ${d}. Abra o NEXUS HUB para programar os próximos.` };
}
