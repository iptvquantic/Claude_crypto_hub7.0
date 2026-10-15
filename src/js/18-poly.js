// =====================================================================
// POLYMARKET — mercados de previsão reais (API pública), por tema,
// com probabilidade, volume e prazo. Atualiza sozinho a cada 5 min.
// =====================================================================
const PM = { tab: 'hot', q: '', tr: {} };
const PM_TABS = () => [['hot', L('Em alta', 'Trending'), 'flame'], ['crypto', 'Cripto', 'bitcoin'], ['economy', L('Economia', 'Economy'), 'landmark'], ['brazil', L('Brasil', 'Brazil'), 'house'], ['politics', L('Política', 'Politics'), 'building-2'], ['geopolitics', L('Geopolítica', 'Geopolitics'), 'earth'], ['ai', L('IA e tecnologia', 'AI & tech'), 'sparkles'], ['sports', L('Esportes', 'Sports'), 'trophy']];
function pmSource(tab) {
  const id = 'pm-' + tab;
  if (SRC[id]) return id;
  source({
    id, label: 'Polymarket · ' + tab, provider: 'Polymarket', every: 5 * 60e3, persist: false,
    need: () => S.page === 'poly' && PM.tab === tab,
    run: async () => getJSON(`https://gamma-api.polymarket.com/events?${tab === 'hot' ? '' : `tag_slug=${tab}&`}active=true&closed=false&order=volume24hr&ascending=false&limit=30`, { timeout: 14000 }),
    validate: (a) => Array.isArray(a),
    onData: () => _markDirty('PM'),
  });
  return id;
}
function pmOutcomes(ev) {
  const mk = (ev.markets || []).filter((m) => m.active && !m.closed);
  const price = (m) => { try { return JSON.parse(m.outcomePrices).map(num); } catch { return []; } };
  const names = (m) => { try { return JSON.parse(m.outcomes); } catch { return ['Sim', 'Não']; } };
  if (mk.length === 1) {
    const p = price(mk[0]), n = names(mk[0]);
    return n.map((x, i) => ({ n: /^yes$/i.test(x) ? L('Sim', 'Yes') : /^no$/i.test(x) ? L('Não', 'No') : x, p: p[i] })).filter((o) => isNum(o.p));
  }
  return mk.map((m) => ({ n: m.groupItemTitle || m.question, p: price(m)[0] })).filter((o) => isNum(o.p)).sort((a, b) => b.p - a.p).slice(0, 3);
}
function pmHtml() {
  return `${pageHead(PAGES.poly, `<button class="btn sm" data-act="pmTr">${ico('languages', 16)}${esc(L('Traduzir títulos', 'Translate titles'))}</button>`)}
  <div class="row wrap between" style="gap:10px;margin-bottom:14px"><div class="seg-scroll">${seg('pm', PM_TABS().map(([v, l, i]) => [v, l, i]), PM.tab)}</div>
  <div class="inp-search" style="min-width:min(300px,100%)">${ico('search', 18)}<input class="inp" type="search" placeholder="${esc(L('Filtrar mercados', 'Filter markets'))}" data-inp="pmQ" autocomplete="off" aria-label="${esc(L('Filtrar', 'Filter'))}"></div></div>
  <div id="pm-list"></div>`;
}
function drawPm() {
  const box = $('#pm-list'); if (!box) return;
  const id = pmSource(PM.tab); const c = CACHE.get(id);
  const top = `<div class="row wrap" style="gap:8px;margin-bottom:12px">${stamp(id)}<span class="tiny faint">${esc(L('Probabilidade = preço da aposta "Sim" (de 0 a 100%). Não é recomendação.', 'Probability = price of the "Yes" share (0–100%). Not advice.'))}</span></div>`;
  if (!c) { box.innerHTML = top + (HEALTH[id] && HEALTH[id].ok === false ? `<div class="panel">${emptyBox('wifi-off', L('Polymarket indisponível agora', 'Polymarket unavailable now'), esc(L('A API pública do Polymarket não respondeu. Tentando de novo automaticamente — nenhum número é mostrado sem vir da fonte.', 'Polymarket’s public API did not respond. Retrying automatically — no number is shown unless it comes from the source.')))}</div>` : `<div class="grid g-auto">${Array.from({ length: 6 }, () => `<div class="pm">${skel(4, 16)}</div>`).join('')}</div>`); return; }
  const q = PM.q.trim().toLowerCase();
  const evs = c.v.filter((e) => !q || (e.title + ' ' + (PM.tr[e.id] || '')).toLowerCase().includes(q));
  if (!evs.length) { box.innerHTML = top + `<div class="panel">${emptyBox('search', L('Nenhum mercado encontrado', 'No market found'))}</div>`; return; }
  box.innerHTML = top + `<div class="grid g-auto">${evs.map((e) => {
    const outs = pmOutcomes(e);
    const end = Date.parse(e.endDate);
    return `<a class="pm" href="https://polymarket.com/event/${esc(encodeURIComponent(e.slug))}" target="_blank" rel="noopener noreferrer">
      <div class="pm-h">${e.image ? `<img class="pm-img" src="${esc(safeUrl(e.image))}" alt="" loading="lazy" width="40" height="40">` : ''}<div class="pm-q">${esc(PM.tr[e.id] || e.title)}</div></div>
      <div class="stack" style="gap:8px">${outs.map((o, i) => `<div class="pm-o"><span class="nm">${esc(o.n)}</span><span class="pv" style="color:${i === 0 ? 'var(--accent)' : 'var(--text-2)'}">${esc(fmtPct(o.p * 100, o.p < 0.01 && o.p > 0 ? 1 : 0, false))}</span><div class="bar"><i style="width:${clamp(o.p * 100, 0.5, 100)}%;background:${i === 0 ? 'var(--accent)' : 'var(--text-3)'}"></i></div></div>`).join('') || `<span class="small faint">${esc(L('sem preço no momento', 'no price right now'))}</span>`}</div>
      <div class="pm-f"><span>${esc(L('Volume 24h', '24h volume'))} <b style="color:var(--text-2)">${esc(fmtCompact(e.volume24hr))}</b></span>${isNum(end) ? `<span>${end > Date.now() ? esc(L('encerra', 'ends')) + ' ' + esc(fmtDate(end, { day: '2-digit', month: 'short', year: 'numeric' })) : esc(L('aguardando resultado', 'awaiting result'))}</span>` : ''}</div></a>`;
  }).join('')}</div>`;
}
ACT.seg_pm = (v) => { PM.tab = v; drawPm(); runSource(pmSource(v)); };
ACT.pmQ = debounce((el) => { PM.q = el.value; drawPm(); }, 160);
ACT.pmTr = async (el) => {
  if (!aiKey()) { toast(L('A tradução usa IA com a sua chave da Anthropic. Cole a chave em Configurações.', 'Translation uses AI with your Anthropic key. Paste it in Settings.'), { type: 'warn', action: { label: L('Abrir', 'Open'), fn: () => go('settings') } }); return; }
  const c = CACHE.get(pmSource(PM.tab)); if (!c) return;
  const todo = c.v.filter((e) => !PM.tr[e.id]).slice(0, 30);
  if (!todo.length) return;
  el.classList.add('busy');
  try {
    const out = await aiCall([{ role: 'user', content: `Traduza para ${S.lang === 'en' ? 'English' : 'português do Brasil'} estes títulos de mercados de previsão. Responda SÓ com um JSON no formato {"id":"tradução"}, sem comentários.\n${JSON.stringify(Object.fromEntries(todo.map((e) => [e.id, e.title])))}` }], { model: NX.aiModelFast, max: 2500 });
    const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
    Object.entries(j).forEach(([k, v]) => { if (typeof v === 'string' && v.length < 300) PM.tr[k] = v; });
    drawPm();
  } catch (e) { toast(L('Não foi possível traduzir agora: ', 'Could not translate now: ') + e.message, { type: 'err' }); }
  el.classList.remove('busy');
};
onPrice((set) => { if (S.page === 'poly' && set.has('PM')) drawPm(); });
page({
  id: 'poly', group: 'macro', icon: 'target', pt: 'Polymarket', en: 'Polymarket',
  sub: 'O que as pessoas estão apostando, com dinheiro real, sobre economia, cripto, eleições e o mundo.',
  subEn: 'What people are betting, with real money, on economics, crypto, elections and the world.',
  init(el) { el.innerHTML = pmHtml(); drawPm(); runSource(pmSource(PM.tab)); },
  show() { drawPm(); },
});
