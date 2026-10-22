// =====================================================================
// WALLET WATCH (grátis) — acompanhe qualquer carteira só pelo endereço público.
// Vários portfólios, total em R$/US$, variação de 24 h, alocação, ativos, carteiras,
// movimentos e evolução. A lista de endereços fica SÓ neste navegador; o saldo é lido
// direto nas fontes públicas de cada rede. Frase-semente e chave privada são bloqueadas.
// =====================================================================
const WW_MAX = 100;
function wwLoad() {
  const d = LS.get('ww');
  if (d && Array.isArray(d.w) && Array.isArray(d.pf) && d.pf.length) return d;
  return { v: 1, pf: [{ id: 'p' + uid().slice(0, 7), n: L('Principal', 'Main') }], w: [], upd: 0 };
}
const WW = {
  d: wwLoad(),
  r: LS.get('ww-read', {}) || {},
  ev: LS.get('ww-ev', []) || [],
  hist: LS.get('ww-hist', {}) || {},
  v: { pf: LS.get('ww-pf', 'all'), cur: LS.get('ww-cur', 'BRL'), hide: !!LS.get('ww-hide', false), small: LS.get('ww-small', true) !== false, addOpen: false, det: null, ens: null },
  busy: new Set(), t: 0, lastAll: 0,
};
function wwSave() { WW.d.upd = Date.now(); LS.set('ww', WW.d); }
function wwSaveRead() {
  // guarda a última leitura de cada carteira para abrir rápido (com o horário dela); se ficar grande, enxuga
  if (!WW.d.w.length) { LS.del('ww-read'); return; }
  const slim = {};
  for (const [id, r] of Object.entries(WW.r)) {
    if (!WW.d.w.some((w) => w.id === id)) continue;
    slim[id] = { ...r, a: (r.a || []).slice(0, 80), txs: (r.txs || []).slice(0, 8), x: { ...(r.x || {}), addrs: (r.x && r.x.addrs || []).slice(0, 20) } };
  }
  let s = JSON.stringify(slim);
  if (s.length > 150000) { for (const r of Object.values(slim)) { r.txs = []; r.x.addrs = []; } s = JSON.stringify(slim); }
  if (s.length <= 150000) LS.set('ww-read', slim);
}
const wwPfName = (id) => { const p = WW.d.pf.find((x) => x.id === id); return p ? p.n : '—'; };
const wwWallets = (pf = WW.v.pf) => WW.d.w.filter((w) => pf === 'all' || w.pf === pf);
const wwShort = (a) => (a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
const wwM = (s) => (WW.v.hide ? '•••••' : s);
function wwRate() { const r = brlRate(); return WW.v.cur === 'BRL' && r ? r.v : null; }
function wwPriceTxt(p) { if (!isNum(p)) return '—'; const r = wwRate(); return r ? brl(p * r) : usd(p); }
function wwMoney(usdv, d = [2, 2]) {
  if (!isNum(usdv)) return '—';
  const r = wwRate();
  return wwM(r ? brl(usdv * r, d) : usd(usdv, d));
}
const wwCurLabel = () => (wwRate() ? 'R$' : 'US$');

// ---------- agregação ----------
function wwAssets(ws) {
  const by = new Map();
  for (const w of ws) {
    const r = WW.r[w.id]; if (!r) continue;
    for (const a of r.a || []) {
      let g = by.get(a.k);
      if (!g) { g = { k: a.k, s: a.s, n: a.n, cg: a.cg || null, logo: a.logo || '', px: a.px || null, q: 0, parts: [], nets: new Set(), perp: a.x === 'perp' }; by.set(a.k, g); }
      g.q += a.q; g.parts.push({ w, net: a.net, q: a.q, x: a.x || '', ca: a.ca || '', st: a.st || 0 }); g.nets.add(a.net);
      if (!g.px && a.px) g.px = a.px;
    }
  }
  const out = [...by.values()].map((g) => {
    const pr = wwPrice(g); const p = pr ? pr.p : null;
    return { ...g, pr, p, chg: pr ? num(pr.chg) : null, v: isNum(p) ? g.q * p : null };
  });
  out.sort((a, b) => (b.v ?? -1) - (a.v ?? -1) || a.s.localeCompare(b.s));
  return out;
}
function wwTotals(ws) {
  const A = wwAssets(ws);
  let v = 0, v24 = 0, nopx = 0, has = false;
  for (const a of A) {
    if (!isNum(a.v)) { if (a.q > 0) nopx++; continue; }
    has = true; v += a.v;
    v24 += isNum(a.chg) && a.chg > -100 ? a.v / (1 + a.chg / 100) : a.v;
  }
  const n = ws.length, read = ws.filter((w) => WW.r[w.id] && WW.r[w.id].t).length;
  return { A, usd: has || read === n ? v : null, d24: has ? v - v24 : null, p24: has && v24 > 0 ? (v / v24 - 1) * 100 : null, nopx, n, read };
}
function wwWalletValue(w) { const T = wwTotals([w]); return T.usd; }

// ---------- leitura ----------
function wwCompact(a) { const o = { k: a.k, q: a.q, net: a.net, s: a.s, n: a.n }; for (const f of ['cg', 'x', 'px', 'logo', 'ca', 'st']) if (a[f]) o[f] = a[f]; return o; }
async function wwReadOne(w, { full = false, quiet = false } = {}) {
  if (WW.busy.has(w.id)) return;
  WW.busy.add(w.id); wwDrawWallets();
  const prev = WW.r[w.id];
  try {
    const fn = WW_READERS[w.kind]; if (!fn) throw new Error(L('rede não suportada', 'unsupported network'));
    const isFull = full || !prev || !prev.x || !prev.x.full || Date.now() - (prev.x.full || 0) > 6 * 3600e3;
    const res = await fn(w, prev, isFull);
    // rede EVM que falhou nesta leitura: fica o último saldo lido dela (marcado com o horário)
    if (w.kind === 'evm' && res.part && prev && prev.a) {
      const failed = WW_EVM.filter((c) => res.part.includes(c.n + ':')).map((c) => c.k).concat(res.part.includes('Hyperliquid:') ? ['hl'] : []);
      for (const a of prev.a) if (failed.includes(a.net)) res.a.push({ ...a, st: a.st || prev.t });
    }
    const rd = { t: Date.now(), ok: true, src: res.src, a: res.a.map(wwCompact), hid: res.hid || 0, part: res.part || '', x: res.x || {}, txs: res.txs || [], err: '' };
    if (!WW.d.w.some((x) => x.id === w.id)) { WW.busy.delete(w.id); return; } // removida durante a leitura
    wwDetectChanges(w, prev, rd);
    WW.r[w.id] = rd;
  } catch (e) {
    const msg = String((e && e.message) || e).slice(0, 140);
    if (WW.d.w.some((x) => x.id === w.id)) WW.r[w.id] = prev && prev.t ? { ...prev, err: msg, errT: Date.now() } : { t: 0, ok: false, a: [], err: msg, errT: Date.now(), x: {} };
  }
  WW.busy.delete(w.id);
  wwSaveRead();
  if (!quiet) await wwPricesFor([w]);
  wwRedraw(!quiet);
}
async function wwRefreshAll({ full = false } = {}) {
  const ws = WW.d.w.slice();
  if (!ws.length) return { n: 0 };
  await wwPool(ws, 3, (w) => wwReadOne(w, { full, quiet: true }));
  await wwPricesFor(ws);
  WW.lastAll = Date.now();
  wwSnapshot(); wwRedraw(true);
  const bad = ws.filter((w) => WW.r[w.id] && WW.r[w.id].err).length;
  if (bad === ws.length) throw new Error(L('nenhuma carteira pôde ser lida agora', 'no wallet could be read now'));
  return { n: ws.length, bad };
}
const _wwPxAt = {};
async function wwPricesFor(ws, force) {
  const ids = new Set();
  for (const w of ws) for (const a of (WW.r[w.id] && WW.r[w.id].a) || []) if (a.cg) ids.add(a.cg);
  const due = [...ids].filter((id) => force || !(_wwPxAt[id] && Date.now() - _wwPxAt[id] < 150e3));
  if (!due.length) return;
  due.forEach((id) => { _wwPxAt[id] = Date.now(); });
  await wwFetchPrices(due).catch(() => 0);
}
// mudanças de saldo entre duas leituras completas (vale para todas as redes)
function wwDetectChanges(w, prev, cur) {
  if (!prev || !prev.ok || !prev.t || prev.err || prev.part || cur.part) return;
  const sumBy = (rd) => { const m = {}; for (const a of rd.a) { if (a.x === 'perp' || a.st) continue; const k = `${a.k}|${a.net}|${a.x || ''}`; m[k] = m[k] || { q: 0, a }; m[k].q += a.q; } return m; };
  const p = sumBy(prev), c = sumBy(cur);
  for (const k of new Set([...Object.keys(p), ...Object.keys(c)])) {
    const q0 = p[k] ? p[k].q : 0, q1 = c[k] ? c[k].q : 0, d = q1 - q0;
    if (Math.abs(d) <= Math.max(Math.abs(q0), Math.abs(q1)) * 1e-6 || Math.abs(d) < 1e-9) continue;
    const a = (c[k] || p[k]).a;
    WW.ev.unshift({ t: cur.t, p0: prev.t, w: w.id, k: a.k, s: a.s, n: a.n, net: a.net, cg: a.cg || null, d, x: a.x || '' });
  }
  WW.ev = WW.ev.slice(0, 80); LS.set('ww-ev', WW.ev);
}
// registro diário do total (por portfólio e geral), só quando todas as carteiras estão em dia
function wwSnapshot() {
  const day = todayISO(); const r = brlRate(); let changed = false;
  for (const pf of ['all', ...WW.d.pf.map((p) => p.id)]) {
    const ws = wwWallets(pf); if (!ws.length) continue;
    if (ws.some((w) => { const x = WW.r[w.id]; return !x || !x.ok || x.err || Date.now() - x.t > 30 * 60e3; })) continue;
    const T = wwTotals(ws); if (!isNum(T.usd)) continue;
    const arr = WW.hist[pf] || (WW.hist[pf] = []);
    const row = [day, Math.round(T.usd * 100) / 100, r ? Math.round(T.usd * r.v * 100) / 100 : null];
    if (arr.length && arr[arr.length - 1][0] === day) arr[arr.length - 1] = row; else arr.push(row);
    if (arr.length > 400) arr.splice(0, arr.length - 400);
    changed = true;
  }
  if (changed) LS.set('ww-hist', WW.hist);
}

// ---------- fontes (agendador do site: só roda com a página aberta e a aba visível) ----------
function registerWalletSources() {
  source({
    id: 'ww-tok', label: L('Wallet Watch: lista de tokens', 'Wallet Watch: token list'), provider: 'Robô (CoinGecko + DefiLlama)', every: 6 * 3600e3, kind: 'daily', persist: false,
    need: () => S.page === 'wallets' && WW.d.w.length > 0,
    run: async () => getPipeline('tokens', 40 * 86400e3),
    validate: (j) => j && j.chains && j.coins && Object.keys(j.chains).length >= 3,
    onData: (j) => { wwTokIndex(j); WWT.tried = true; HEALTH['ww-tok'].dataTs = Date.parse(j.generatedAt); },
    onError: () => { WWT.tried = true; },
  });
  source({
    id: 'ww-bal', label: L('Wallet Watch: saldos', 'Wallet Watch: balances'), provider: L('exploradores públicos', 'public explorers'), every: 5 * 60e3, persist: false,
    need: () => S.page === 'wallets' && WW.d.w.length > 0 && (!!WWT.list || !!WWT.tried),
    run: () => wwRefreshAll(),
  });
  source({
    id: 'ww-px', label: L('Wallet Watch: preços', 'Wallet Watch: prices'), provider: 'DefiLlama', every: 3 * 60e3, persist: false,
    need: () => S.page === 'wallets' && WW.d.w.length > 0,
    run: async () => { await wwPricesFor(WW.d.w, true); return { ok: true }; },
    onData: () => wwRedraw(true),
  });
}

// ---------- página ----------
function wwTools() {
  return `<div class="row wrap ww-tools" style="gap:8px">${seg('wwcur', [['BRL', 'R$'], ['USD', 'US$']], WW.v.cur)}
    <button class="btn sm ghost" data-act="wwHide" aria-pressed="${WW.v.hide}" title="${esc(L('Esconder valores (modo privado)', 'Hide values (private mode)'))}">${ico(WW.v.hide ? 'eye-off' : 'eye', 16)}<span class="hide-sm">${esc(WW.v.hide ? L('Mostrar valores', 'Show values') : L('Esconder valores', 'Hide values'))}</span></button>
    <button class="btn sm" data-act="wwRefresh" id="ww-ref">${ico('refresh-cw', 16)}${esc(L('Atualizar', 'Refresh'))}</button>
    <div class="rel"><button class="btn sm" data-act="menu" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(L('Mais opções', 'More options'))}">${ico('ellipsis-vertical', 16)}</button><div class="menu" role="menu">
      <button class="menu-i" role="menuitem" data-act="wwExport">${ico('download', 17)}${esc(L('Baixar minha lista de endereços', 'Download my address list'))}</button>
      <button class="menu-i" role="menuitem" data-act="wwImport">${ico('upload', 17)}${esc(L('Importar lista de endereços', 'Import address list'))}</button>
      <div class="menu-sep"></div>
      <button class="menu-i" role="menuitem" data-act="wwWipe">${ico('trash-2', 17)}${esc(L('Apagar tudo do Wallet Watch', 'Erase all Wallet Watch data'))}</button></div></div></div>`;
}
function wwHtml() {
  return `${pageHead(PAGES.wallets, wwTools())}<div id="ww-body"></div>`;
}
function wwDraw() {
  const box = $('#ww-body'); if (!box) return;
  if (!WW.d.pf.some((p) => p.id === WW.v.pf) && WW.v.pf !== 'all') WW.v.pf = 'all';
  if (!WW.d.w.length) { box.innerHTML = wwEmptyHtml(); wwDetUpdate(); return; }
  box.innerHTML = `<div class="ww-pfbar" id="ww-pfbar"></div>
    <div class="ww-hero"><section class="panel hero" id="ww-total"></section><section class="panel" id="ww-alloc"></section></div>
    <section class="panel mt ww-add ${WW.v.addOpen ? 'open' : ''}" id="ww-add">${wwAddHtml(false)}</section>
    <section class="panel flush mt" id="ww-assets"></section>
    <section class="panel mt" id="ww-wallets"></section>
    <div class="grid g-2 mt ww-g2"><section class="panel" id="ww-hist"></section><section class="panel" id="ww-act"></section></div>
    <section class="panel mt" id="ww-how">${wwHowHtml()}</section>`;
  wwRedraw(true); wwDetUpdate();
}
function wwRedraw(force) {
  if (S.page !== 'wallets' || !$('#ww-body')) return;
  if (!WW.d.w.length) { if (!$('#ww-det')) wwDraw(); return; }
  if (!$('#ww-total')) { wwDraw(); return; }
  if (!force && Date.now() - WW.t < 800) { clearTimeout(WW.tm); WW.tm = setTimeout(() => wwRedraw(true), 850); return; }
  WW.t = Date.now();
  wwDrawPf(); wwDrawTotal(); wwDrawAssets(); wwDrawWallets(); wwDrawAct();
  if (force || !WW.histDrawn || Date.now() - WW.histDrawn > 60e3) wwDrawHist();
  const rb = $('#ww-ref'); if (rb) rb.classList.toggle('busy', WW.busy.size > 0);
}
// ---------- estado vazio ----------
function wwEmptyHtml() {
  return `<section class="panel hero ww-empty"><div class="ww-empty-g">
    <div><div class="ww-kicker">${ico('scan-eye', 16)}${esc(L('Grátis · só endereço público', 'Free · public address only'))}</div>
      <h2 class="ww-h2">${esc(L('Acompanhe suas carteiras sem entregar nenhuma chave', 'Track your wallets without handing over any key'))}</h2>
      <p class="muted" style="line-height:1.6;margin-top:8px">${esc(L('Cole o endereço público de uma carteira — Bitcoin (inclusive a xpub da Ledger ou da Trezor), Ethereum e redes compatíveis, Solana, Tron, Litecoin, Dogecoin, XRP ou TON. O Wallet Watch reconhece a rede, lê o saldo nas fontes públicas e soma tudo em reais e em dólar. Crie quantos portfólios quiser.', 'Paste a wallet’s public address — Bitcoin (including your Ledger/Trezor xpub), Ethereum and compatible networks, Solana, Tron, Litecoin, Dogecoin, XRP or TON. Wallet Watch detects the network, reads the balance from public sources and totals everything in BRL and USD. Create as many portfolios as you want.'))}</p>
      <ul class="ww-checks">${[L('Ninguém consegue mover fundos com o endereço: ele só serve para ver o saldo.', 'Nobody can move funds with an address: it only shows the balance.'), L('Frase-semente ou chave privada? O campo bloqueia, apaga e não guarda nada.', 'Seed phrase or private key? The field blocks it, clears it and saves nothing.'), L('A lista fica só neste aparelho. Nada passa pelo servidor do NEXUS HUB.', 'Your list stays on this device. Nothing goes through NEXUS HUB servers.')].map((t) => `<li>${ico('shield-check', 17)}<span>${esc(t)}</span></li>`).join('')}</ul></div>
    <div class="ww-add-card">${wwAddHtml(true)}</div></div></section>
    <section class="panel mt" id="ww-how">${wwHowHtml()}</section>`;
}
// ---------- adicionar carteira ----------
function wwAddHtml(standalone) {
  const pfOpts = WW.d.pf.map((p) => `<option value="${esc(p.id)}" ${p.id === (WW.v.pf !== 'all' ? WW.v.pf : WW.d.pf[0].id) ? 'selected' : ''}>${esc(p.n)}</option>`).join('') + `<option value="__new">${esc(L('+ Novo portfólio…', '+ New portfolio…'))}</option>`;
  const head = standalone ? `<h3 class="ww-h3">${ico('plus', 17)}${esc(L('Adicionar carteira', 'Add wallet'))}</h3>` : `<button class="ww-add-tg" data-act="wwAddToggle" aria-expanded="${WW.v.addOpen}">${ico('plus', 17)}<span>${esc(L('Adicionar carteira', 'Add wallet'))}</span>${ico('chevron-down', 17, 'chev')}</button>`;
  return `${head}<div class="ww-add-b">
    <div class="fld"><label for="ww-addr">${esc(L('Endereço público', 'Public address'))}</label>
      <div class="inp-group"><input class="inp mono" id="ww-addr" data-inp="wwAddrInp" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${esc(L('bc1…, 0x…, xpub…, T…, nome.eth', 'bc1…, 0x…, xpub…, T…, name.eth'))}" aria-describedby="ww-det">
      <button class="btn" data-act="wwPaste" title="${esc(L('Colar da área de transferência', 'Paste from clipboard'))}">${ico('clipboard-paste', 17)}<span class="hide-sm">${esc(L('Colar', 'Paste'))}</span></button></div>
      <div id="ww-det" class="ww-det" aria-live="polite"></div></div>
    <div class="ww-add-row"><div class="fld"><label for="ww-label">${esc(L('Nome (opcional)', 'Name (optional)'))}</label><input class="inp" id="ww-label" maxlength="40" placeholder="${esc(L('Ex.: Ledger, MetaMask, Phantom', 'E.g. Ledger, MetaMask, Phantom'))}"></div>
      <div class="fld"><label for="ww-pfsel">${esc(L('Portfólio', 'Portfolio'))}</label><select class="sel inp" id="ww-pfsel">${pfOpts}</select></div></div>
    <button class="btn pri block" data-act="wwAdd" id="ww-add-btn">${ico('binoculars', 17)}${esc(L('Acompanhar esta carteira', 'Track this wallet'))}</button>
    <p class="ww-safe">${ico('lock', 15)}<span>${esc(L('Só o endereço público. O NEXUS HUB nunca pede frase-semente (12 ou 24 palavras) nem chave privada — se alguém pedir, é golpe.', 'Public address only. NEXUS HUB never asks for a seed phrase (12 or 24 words) or a private key — anyone who asks is a scammer.'))}</span></p></div>`;
}
const WW_SECRET = {
  seed: [L('Isso é uma frase-semente (palavras de recuperação).', 'That is a seed phrase (recovery words).')],
  priv: [L('Isso parece uma chave privada (ou um código de transação), não um endereço.', 'That looks like a private key (or a transaction hash), not an address.')],
  xprv: [L('Isso é uma chave privada estendida (xprv).', 'That is an extended private key (xprv).')],
  wif: [L('Isso é uma chave privada de Bitcoin (formato WIF).', 'That is a Bitcoin private key (WIF format).')],
  solkey: [L('Isso é uma chave privada da Solana.', 'That is a Solana private key.')],
  keystore: [L('Isso é um arquivo de chave (keystore).', 'That is a key file (keystore).')],
};
function wwSecretAlert(kind) {
  const t = (WW_SECRET[kind] || WW_SECRET.priv)[0];
  return `<div class="callout bad ww-secret" role="alert">${ico('ban', 20)}<span><b>${esc(t)}</b> ${esc(L('Quem tem isso controla seus fundos. O campo foi apagado e nada foi salvo nem enviado. Nunca digite isso em site nenhum — se você já digitou em algum lugar, transfira os fundos para uma carteira nova.', 'Whoever has it controls your funds. The field was cleared and nothing was saved or sent. Never type this on any website — if you already did somewhere, move your funds to a new wallet.'))}</span></div>`;
}
function wwDetUpdate() {
  const box = $('#ww-det'); if (!box) return;
  const d = WW.v.det;
  if (WW.v.secret) { box.innerHTML = wwSecretAlert(WW.v.secret); return; }
  if (!d || d.empty) { box.innerHTML = `<span class="faint tiny">${esc(L('A rede é reconhecida sozinha pelo formato do endereço.', 'The network is detected from the address format.'))}</span>`; return; }
  if (d.ok) {
    const n = WW_NETS[d.kind === 'ens' ? 'evm' : d.kind];
    box.innerHTML = `<span class="ww-ok">${ico('circle-check', 16)}<b>${esc(n ? n[0] : '')}</b>${d.sub ? ` · ${esc(d.sub)}` : ''}</span>${d.kind === 'btcx' ? `<span class="faint tiny ww-det-n">${esc(L('A xpub mostra o saldo de todos os endereços da conta (recebimento e troco). Ela não permite gastar, mas revela o histórico da conta: guarde só aqui.', 'An xpub shows the balance of every address in the account. It cannot spend, but reveals the account history: keep it private.'))}</span>` : ''}`;
    return;
  }
  const M = {
    typo: L('O código de verificação do endereço não confere: falta ou sobra um caractere, ou há letra trocada. Copie de novo da sua carteira.', 'The address checksum does not match: a character is missing, extra or swapped. Copy it again from your wallet.'),
    unsupported: L(`Formato reconhecido${d.what ? ` (${d.what})` : ''}, mas essa rede ainda não é suportada. Hoje: BTC (e xpub/ypub/zpub), Ethereum e redes EVM, Solana, Tron, Litecoin, Dogecoin, XRP e TON.`, `Recognized format${d.what ? ` (${d.what})` : ''}, but this network is not supported yet. Today: BTC (and xpub/ypub/zpub), Ethereum & EVM networks, Solana, Tron, Litecoin, Dogecoin, XRP and TON.`),
    xdepth: L('Esta xpub não é de uma conta (nível 3, como m/84’/0’/0’). Exporte a xpub da conta na sua carteira.', 'This xpub is not an account-level key (depth 3, e.g. m/84’/0’/0’). Export the account xpub from your wallet.'),
    testnet: L('Endereço de rede de teste: não tem valor real.', 'Testnet address: no real value.'),
    unknown: L('Não parece um endereço público. Confira se copiou o endereço inteiro, sem espaços.', 'This does not look like a public address. Check that you copied the whole address, with no spaces.'),
  };
  box.innerHTML = `<span class="ww-bad">${ico('triangle-alert', 16)}<span>${esc(d.words ? L('Cole só o endereço (sem espaços nem outras palavras).', 'Paste only the address (no spaces or other words).') : M[d.msg] || M.unknown)}</span></span>`;
}
function wwInspect(el, raw) {
  const d = wwDetect(raw);
  if (d.secret) {
    // segredo: apaga na hora, não guarda, não envia, não mostra
    el.value = ''; WW.v.det = null;
    if (WW.v.secret !== d.secret) toast(L('Bloqueado: isso não é um endereço público. Nada foi salvo.', 'Blocked: that is not a public address. Nothing was saved.'), { type: 'err', ms: 6000 });
    WW.v.secret = d.secret;
  } else {
    WW.v.det = raw.trim() ? d : null;
    if (d.ok) WW.v.secret = null; // o aviso de segredo só sai quando aparece um endereço válido
  }
  wwDetUpdate();
  const b = $('#ww-add-btn'); if (b) b.disabled = !(WW.v.det && WW.v.det.ok);
}
ACT.wwAddrInp = (el) => wwInspect(el, el.value); // na hora: segredo colado some antes de qualquer outra coisa
ACT.wwPaste = async () => {
  const el = $('#ww-addr'); if (!el) return;
  try { const t = await navigator.clipboard.readText(); el.value = String(t || '').trim(); wwInspect(el, el.value); if (WW.v.det && WW.v.det.ok) $('#ww-label')?.focus(); }
  catch { toast(L('O navegador não liberou a área de transferência. Cole com Ctrl+V (ou segure e toque em Colar).', 'The browser blocked clipboard access. Paste with Ctrl+V (or long-press → Paste).'), { type: 'warn' }); el.focus(); }
};
ACT.wwAddToggle = () => { WW.v.addOpen = !WW.v.addOpen; const s = $('#ww-add'); if (s) { s.classList.toggle('open', WW.v.addOpen); const b = s.querySelector('.ww-add-tg'); if (b) b.setAttribute('aria-expanded', String(WW.v.addOpen)); if (WW.v.addOpen) setTimeout(() => $('#ww-addr')?.focus(), 60); } };
async function wwNewPf(name) {
  const n = String(name || '').trim().slice(0, 30); if (!n) return null;
  if (WW.d.pf.length >= 20) { toast(L('Limite de 20 portfólios.', 'Limit of 20 portfolios.'), { type: 'warn' }); return null; }
  const p = { id: 'p' + uid().slice(0, 7), n }; WW.d.pf.push(p); wwSave(); return p;
}
function wwAskName(title, value = '', label = L('Nome', 'Name')) {
  return new Promise((res) => {
    let done = false; const fin = (v) => { if (done) return; done = true; res(v); closeModal(); };
    openModal({
      title, body: `<div class="fld"><label for="ww-nm">${esc(label)}</label><input class="inp" id="ww-nm" maxlength="40" value="${esc(value)}" autofocus></div>`,
      foot: `<button class="btn ghost" data-k="no">${esc(L('Cancelar', 'Cancel'))}</button><button class="btn pri" data-k="yes">${esc(L('Salvar', 'Save'))}</button>`,
      onOpen: (m) => { const i = m.querySelector('#ww-nm'); m.querySelector('[data-k=no]').onclick = () => fin(null); m.querySelector('[data-k=yes]').onclick = () => fin(i.value.trim()); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fin(i.value.trim()); } }); setTimeout(() => { i.focus(); i.select(); }, 40); },
      onClose: () => { if (!done) { done = true; res(null); } },
    });
  });
}
ACT.wwAdd = async (el) => {
  const inp = $('#ww-addr'); if (!inp) return;
  const d = wwDetect(inp.value);
  if (d.secret) { wwInspect(inp, inp.value); return; }
  if (!d.ok) { WW.v.det = d; wwDetUpdate(); inp.focus(); return; }
  if (WW.d.w.length >= WW_MAX) { toast(L(`Limite de ${WW_MAX} carteiras.`, `Limit of ${WW_MAX} wallets.`), { type: 'warn' }); return; }
  let pf = $('#ww-pfsel') ? $('#ww-pfsel').value : WW.d.pf[0].id;
  if (pf === '__new') { const p = await wwNewPf(await wwAskName(L('Novo portfólio', 'New portfolio'), '', L('Nome do portfólio', 'Portfolio name'))); if (!p) return; pf = p.id; }
  let addr = d.addr, kind = d.kind, ens = '';
  if (kind === 'ens') {
    el.classList.add('busy');
    try { const a = await wwResolveEns(d.addr); if (!a) throw new Error(L('nome não encontrado', 'name not found')); ens = d.addr; addr = a; kind = 'evm'; }
    catch (e) { el.classList.remove('busy'); toast(L(`Não foi possível converter ${d.addr}: `, `Could not resolve ${d.addr}: `) + (e.message || e), { type: 'err', ms: 7000 }); return; }
    el.classList.remove('busy');
  }
  const dup = WW.d.w.find((w) => w.addr.toLowerCase() === addr.toLowerCase());
  if (dup) { toast(L(`Esse endereço já está no portfólio "${wwPfName(dup.pf)}".`, `That address is already in "${wwPfName(dup.pf)}".`), { type: 'warn' }); return; }
  const net = kind === 'evm' ? 'evm' : kind;
  const nOfNet = WW.d.w.filter((w) => w.kind === kind).length + 1;
  const label = ($('#ww-label') ? $('#ww-label').value : '').trim().slice(0, 40) || ens || `${WW_NETS[net] ? WW_NETS[net][1] : ''} ${nOfNet}`.trim();
  const w = { id: 'w' + uid().slice(0, 9), kind, addr, label, pf, at: Date.now(), ...(ens ? { ens } : {}) };
  WW.d.w.push(w); wwSave();
  WW.v.det = null; WW.v.secret = null; WW.v.addOpen = false;
  if (WW.v.pf !== 'all' && WW.v.pf !== pf) WW.v.pf = pf;
  toast(L(`"${label}" adicionada. Lendo o saldo…`, `"${label}" added. Reading balance…`), { type: 'ok' });
  wwDraw();
  if (!WWT.list) await runSource('ww-tok', { force: true });
  await wwReadOne(w, { full: true });
  wwSnapshot();
};
// ---------- portfólios ----------
function wwDrawPf() {
  const box = $('#ww-pfbar'); if (!box) return;
  const chip = (id, name, n) => { const v = wwTotals(wwWallets(id)).usd; return `<button class="ww-pf ${WW.v.pf === id ? 'on' : ''}" data-act="wwPf" data-id="${esc(id)}" aria-pressed="${WW.v.pf === id}"><span class="nm">${esc(name)}</span><span class="vl">${isNum(v) ? esc(wwMoney(v, [0, 0])) : '—'}</span><span class="ct">${n}</span></button>`; };
  setHTML(box, `<div class="ww-pfs" role="group" aria-label="${esc(L('Portfólios', 'Portfolios'))}">${chip('all', L('Todos', 'All'), WW.d.w.length)}${WW.d.pf.map((p) => chip(p.id, p.n, WW.d.w.filter((w) => w.pf === p.id).length)).join('')}
    <button class="ww-pf add" data-act="wwPfNew">${ico('folder-plus', 16)}<span class="nm">${esc(L('Novo portfólio', 'New portfolio'))}</span></button></div>
    ${WW.v.pf !== 'all' ? `<button class="btn xs ghost" data-act="wwPfEdit" data-id="${esc(WW.v.pf)}">${ico('pencil', 14)}${esc(L('Renomear ou excluir', 'Rename or delete'))}</button>` : ''}`);
}
ACT.wwPf = (el) => { WW.v.pf = el.dataset.id; LS.set('ww-pf', WW.v.pf); wwRedraw(true); };
ACT.wwPfNew = async () => { const p = await wwNewPf(await wwAskName(L('Novo portfólio', 'New portfolio'), '', L('Nome do portfólio', 'Portfolio name'))); if (!p) return; WW.v.pf = p.id; LS.set('ww-pf', p.id); WW.v.addOpen = true; wwDraw(); setTimeout(() => $('#ww-addr')?.focus(), 80); };
ACT.wwPfEdit = (el) => {
  const p = WW.d.pf.find((x) => x.id === el.dataset.id); if (!p) return;
  const n = WW.d.w.filter((w) => w.pf === p.id).length; const others = WW.d.pf.filter((x) => x.id !== p.id);
  openModal({
    title: L(`Portfólio "${p.n}"`, `Portfolio "${p.n}"`),
    body: `<div class="fld"><label for="ww-pfn">${esc(L('Nome', 'Name'))}</label><input class="inp" id="ww-pfn" maxlength="30" value="${esc(p.n)}"></div>
      ${others.length ? `<p class="small muted mt" style="line-height:1.55">${esc(L(`Ao excluir, as ${n} carteira(s) deste portfólio vão para "${others[0].n}". Nada é apagado das redes: só sai desta lista.`, `When deleted, its ${n} wallet(s) move to "${others[0].n}".`))}</p>` : `<p class="small muted mt">${esc(L('Este é o único portfólio: ele pode ser renomeado, mas não excluído.', 'This is the only portfolio: it can be renamed, not deleted.'))}</p>`}`,
    foot: `${others.length ? `<button class="btn danger" data-k="del">${ico('trash-2', 16)}${esc(L('Excluir portfólio', 'Delete portfolio'))}</button>` : ''}<span class="grow"></span><button class="btn pri" data-k="save">${esc(L('Salvar nome', 'Save name'))}</button>`,
    onOpen: (m) => {
      m.querySelector('[data-k=save]').onclick = () => { const v = m.querySelector('#ww-pfn').value.trim().slice(0, 30); if (v) { p.n = v; wwSave(); } closeModal(); wwDraw(); };
      const del = m.querySelector('[data-k=del]'); if (del) del.onclick = () => { WW.d.w.forEach((w) => { if (w.pf === p.id) w.pf = others[0].id; }); WW.d.pf = others; delete WW.hist[p.id]; LS.set('ww-hist', WW.hist); WW.v.pf = 'all'; LS.set('ww-pf', 'all'); wwSave(); closeModal(); wwDraw(); toast(L('Portfólio excluído.', 'Portfolio deleted.'), { type: 'ok' }); };
    },
  });
};
// ---------- total e alocação ----------
const WW_BTC_IDS = new Set(['bitcoin', 'wrapped-bitcoin', 'coinbase-wrapped-btc', 'binance-bitcoin', 'tbtc', 'kraken-wrapped-btc', 'solv-btc', 'lombard-staked-btc']);
const WW_ETH_IDS = new Set(['ethereum', 'weth', 'staked-ether', 'wrapped-steth', 'rocket-pool-eth', 'coinbase-wrapped-staked-eth', 'wrapped-eeth', 'binance-peg-weth', 'ether-fi-staked-eth', 'mantle-staked-ether', 'renzo-restaked-eth', 'kelp-dao-restaked-eth']);
const WW_USD_IDS = new Set(['tether', 'usd-coin', 'dai', 'usds', 'ethena-usde', 'first-digital-usd', 'paypal-usd', 'true-usd', 'frax', 'usdd', 'usd1-wlfi', 'ripple-usd', 'global-dollar', 'usdtb', 'falcon-finance', 'binance-bridged-usdt-bnb-smart-chain', 'binance-bridged-usdc-bnb-smart-chain', 'bridged-usdc-polygon-pos-bridge', 'usd-coin-ethereum-bridged', 'bridged-usdt', 'xdai', 'gho', 'crvusd', 'resolv-usr', 'agora-dollar', 'susds', 'ethena-staked-usde', 'gemini-dollar', 'binance-usd', 'ondo-us-dollar-yield', 'blackrock-usd-institutional-digital-liquidity-fund', 'pyusd']);
function wwMixHtml(T) {
  const g = { btc: 0, eth: 0, usd: 0, alt: 0 };
  for (const a of T.A) { if (!isNum(a.v) || a.v <= 0) continue; const k = a.perp ? 'usd' : WW_BTC_IDS.has(a.cg) ? 'btc' : WW_ETH_IDS.has(a.cg) ? 'eth' : WW_USD_IDS.has(a.cg) ? 'usd' : 'alt'; g[k] += a.v; }
  const tot = g.btc + g.eth + g.usd + g.alt; if (!(tot > 0)) return '';
  const P = [['btc', 'Bitcoin', '#f7931a'], ['eth', 'Ethereum', '#627eea'], ['usd', L('Dólar digital (stablecoins)', 'Stablecoins'), '#31d67f'], ['alt', L('Outras', 'Others'), '#c084fc']].filter(([k]) => g[k] > 0);
  return `<div class="ww-mix" title="${esc(L('Bitcoin inclui versões "embrulhadas" (WBTC, cbBTC…); Ethereum inclui stETH, WETH e afins; dólar digital inclui USDT, USDC e a conta de perpétuos da Hyperliquid.', 'Bitcoin includes wrapped versions; Ethereum includes stETH/WETH; stablecoins include USDT, USDC and Hyperliquid perps account.'))}"><div class="ww-mix-b">${P.map(([k, , c]) => `<i style="width:${(g[k] / tot * 100).toFixed(2)}%;background:${c}"></i>`).join('')}</div>
    <div class="ww-mix-l">${P.map(([k, n, c]) => `<span><i style="background:${c}"></i>${esc(n)} <b>${esc(fmtPct(g[k] / tot * 100, 1, false))}</b> <em>${esc(wwMoney(g[k], [0, 0]))}</em></span>`).join('')}</div></div>`;
}
function wwDrawTotal() {
  const box = $('#ww-total'); if (!box) return;
  const ws = wwWallets(); const T = wwTotals(ws);
  const errs = ws.filter((w) => WW.r[w.id] && WW.r[w.id].err).length, reading = ws.filter((w) => WW.busy.has(w.id)).length;
  const lastT = Math.min(...ws.map((w) => (WW.r[w.id] && WW.r[w.id].t) || 0));
  const name = WW.v.pf === 'all' ? L('Todos os portfólios', 'All portfolios') : wwPfName(WW.v.pf);
  const live = T.A.some((a) => a.pr && a.pr.live);
  setHTML(box, `${panelHead('wallet', name, { right: stamp('ww-bal', L('saldos', 'balances')) })}
    <div class="ww-big">${T.usd === null ? (reading ? skel(1, 38) : '—') : esc(wwMoney(T.usd))}</div>
    <div class="row wrap ww-d24">${isNum(T.d24) ? `<span class="chip ${tone(T.d24) || 'flat'}">${T.d24 >= 0 ? '▲' : '▼'} ${esc(wwMoney(Math.abs(T.d24)))}</span><span class="b ${tone(T.p24)}">${esc(fmtPct(T.p24))}</span><span class="small faint">${esc(L('em 24 h (preços de agora × 24 h atrás, com os saldos de hoje)', 'in 24h (prices now vs 24h ago, with today’s balances)'))}</span>` : `<span class="small faint">${esc(L('Variação de 24 h aparece quando os preços chegarem.', '24h change shows once prices arrive.'))}</span>`}</div>
    <div class="ww-kp">${kpiBox(L('Carteiras', 'Wallets'), String(ws.length), reading ? esc(L(`${reading} lendo agora…`, `${reading} reading now…`)) : errs ? `<span class="warn-t">${esc(L(`${errs} com falha na última leitura`, `${errs} failed last read`))}</span>` : esc(L('todas lidas', 'all read')))}${kpiBox(L('Ativos', 'Assets'), String(T.A.filter((a) => a.q > 0).length), T.nopx ? esc(L(`${T.nopx} sem preço (fora do total)`, `${T.nopx} without price (not in total)`)) : esc(L('com preço', 'priced')))}${kpiBox(L('Última leitura', 'Last read'), lastT > 0 && isFinite(lastT) ? esc(fmtTime(lastT)) : '—', esc(L('atualiza sozinho a cada 5 min', 'auto-refresh every 5 min')))}</div>
    ${wwMixHtml(T)}
    <p class="panel-note">${esc(L('Preços:', 'Prices:'))} ${live ? esc(L('Binance ao vivo nas principais moedas; ', 'Binance live for major coins; ')) : ''}${esc(L('DefiLlama/CoinGecko nos tokens; Jupiter, TonAPI e Hyperliquid nos tokens dessas redes.', 'DefiLlama/CoinGecko for tokens; Jupiter, TonAPI and Hyperliquid for tokens on those networks.'))}${!wwRate() && WW.v.cur === 'BRL' ? ' ' + esc(L('Câmbio indisponível agora: valores em US$.', 'FX unavailable now: values in USD.')) : ''}</p>`);
  // alocação
  const al = $('#ww-alloc'); if (!al) return;
  const priced = T.A.filter((a) => isNum(a.v) && a.v > 0);
  const tot = sum(priced.map((a) => a.v));
  const PAL = ['#8e98ff', '#f7931a', '#31d67f', '#ff6170', '#62b4ff', '#c084fc', '#f4b43f', '#2dd4bf', '#fb923c', '#a3acc2'];
  const top = priced.slice(0, 7).map((a, i) => ({ v: a.v, c: (a.cg && BY_CG[a.cg] && BY_CG[a.cg].c) || PAL[i % PAL.length], t: a.s }));
  const rest = sum(priced.slice(7).map((a) => a.v)); if (rest > 0) top.push({ v: rest, c: '#5d6884', t: L('Outros', 'Others') });
  // por rede
  const byNet = {}; for (const a of priced) for (const p of a.parts) { const v = isNum(a.p) ? p.q * a.p : 0; byNet[p.net] = (byNet[p.net] || 0) + v; }
  const nets = Object.entries(byNet).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const mx = nets.length ? nets[0][1] : 1;
  setHTML(al, `${panelHead('chart-pie', L('Onde está o dinheiro', 'Where the money is'))}
    ${priced.length ? `<div class="donut-wrap ww-donut">${donutSVG(top, { label: L('Distribuição por ativo', 'Allocation by asset') })}<div class="legend">${top.map((p) => `<div><i style="background:${esc(p.c)}"></i><span>${esc(p.t)}</span><span class="lv">${tot > 0 ? esc(fmtPct(p.v / tot * 100, 1, false)) : '—'}</span></div>`).join('')}</div></div>
    <h3 class="lab-h3">${esc(L('Por rede', 'By network'))}</h3><div class="ww-nets">${nets.slice(0, 8).map(([k, v]) => `<div class="ww-net"><span class="l"><i style="background:${esc(wwNetColor(k))}"></i>${esc(wwNetName(k))}</span><span class="b"><i style="width:${(v / mx * 100).toFixed(1)}%;background:${esc(wwNetColor(k))}"></i></span><span class="v">${tot > 0 ? esc(fmtPct(v / tot * 100, 1, false)) : '—'}</span></div>`).join('')}</div>`
      : emptyBox('chart-pie', L('Sem saldo com preço ainda', 'No priced balance yet'), esc(L('Assim que a leitura terminar, a divisão aparece aqui.', 'Once reading finishes, the split shows here.')))}`);
}
// ---------- ativos ----------
function wwNetChips(nets, max = 3) {
  const arr = [...nets]; const more = arr.length - max;
  return `<span class="ww-nchips">${arr.slice(0, max).map((k) => `<span class="ww-nc" style="--c:${esc(wwNetColor(k))}" title="${esc(wwNetName(k))}">${esc(wwNetName(k))}</span>`).join('')}${more > 0 ? `<span class="ww-nc more">+${more}</span>` : ''}</span>`;
}
function wwLogo(a, size = 30) {
  const color = (a.cg && BY_CG[a.cg] && BY_CG[a.cg].c) || hashColor(a.s);
  return coinLogo({ b: a.s, logo: a.logo || (a.cg ? wwCoinLogo(a.cg) : ''), c: color, cg: a.cg }, size);
}
function wwDrawAssets() {
  const box = $('#ww-assets'); if (!box) return;
  const ws = wwWallets(); const T = wwTotals(ws);
  const tot = sum(T.A.filter((a) => isNum(a.v)).map((a) => a.v));
  const vis = T.A.filter((a) => a.q > 0 && (!WW.v.small || !isNum(a.v) || a.v >= 1));
  const smallN = T.A.filter((a) => a.q > 0 && isNum(a.v) && a.v < 1).length;
  const hid = ws.reduce((s, w) => s + ((WW.r[w.id] && WW.r[w.id].hid) || 0), 0);
  const row = (a) => {
    const pts = a.perp;
    return `<tr class="click" data-act="wwAsset" data-k="${esc(a.k)}" tabindex="0" aria-label="${esc(a.s + ' ' + a.n)}"><td><div class="coin">${wwLogo(a, 30)}<div class="mn"><div class="nm no-audit">${esc(a.s)} <span class="sy">${esc(a.n)}</span></div>${wwNetChips(a.nets)}</div></div></td>
      <td class="r">${pts ? '<span class="faint">—</span>' : isNum(a.p) ? `${esc(wwPriceTxt(a.p))}<div class="tiny">${chg(a.chg, 2, 'sm')}</div>` : `<span class="faint" title="${esc(L('Sem preço em nenhuma fonte agora: fica fora do total.', 'No price from any source now: not in total.'))}">${esc(L('sem preço', 'no price'))}</span>`}</td>
      <td class="r num">${pts ? '—' : esc(wwM(fmtQty(a.q)))}</td>
      <td class="r num">${isNum(a.v) ? esc(wwMoney(a.v)) : '—'}</td>
      <td class="r">${tot > 0 && isNum(a.v) ? `<div class="ww-w"><span>${esc(fmtPct(a.v / tot * 100, 1, false))}</span><span class="bar"><i style="width:${Math.min(100, a.v / tot * 100).toFixed(1)}%"></i></span></div>` : '—'}</td></tr>`;
  };
  setHTML(box, `<div class="panel-h"><div class="tt"><h2 class="panel-t">${ico('layers', 18)}${esc(L('Ativos', 'Assets'))}</h2><p class="panel-s">${esc(L('Somados de todas as carteiras e redes do portfólio. Toque num ativo para ver onde ele está.', 'Summed across the portfolio’s wallets and networks. Tap an asset to see where it is.'))}</p></div>
    <label class="check ww-small"><input type="checkbox" data-chg="wwSmall" ${WW.v.small ? 'checked' : ''}><span>${esc(L('Esconder saldos abaixo de US$ 1', 'Hide balances under US$1'))}</span></label></div>
    ${vis.length ? `<div class="tbl-wrap"><table class="tbl ww-t"><thead><tr><th>${esc(L('Ativo', 'Asset'))}</th><th class="r">${esc(L('Preço · 24h', 'Price · 24h'))}</th><th class="r">${esc(L('Quantidade', 'Quantity'))}</th><th class="r">${esc(L('Valor', 'Value'))}</th><th class="r">${esc(L('Peso', 'Weight'))}</th></tr></thead><tbody>${vis.map(row).join('')}</tbody></table></div>`
      : `<div style="padding:0 18px 18px">${emptyBox('coins', ws.some((w) => WW.busy.has(w.id)) ? L('Lendo os saldos…', 'Reading balances…') : L('Nenhum saldo encontrado', 'No balance found'), esc(L('Endereço vazio ou só com saldos muito pequenos. Se acabou de receber, aguarde a confirmação na rede.', 'Empty address or only dust. If you just received funds, wait for network confirmation.')))}</div>`}
    <div class="ww-foot">${smallN && WW.v.small ? `<span>${esc(L(`${smallN} saldo(s) abaixo de US$ 1 escondido(s).`, `${smallN} balance(s) under US$1 hidden.`))}</span>` : ''}${hid ? `<span title="${esc(L('Tokens que não estão na lista das maiores moedas nem são verificados (Jupiter/TonAPI). Golpistas mandam tokens assim com links: não interaja com eles.', 'Tokens not in the top-coins list nor verified. Scammers airdrop such tokens with links: do not interact.'))}">${ico('shield-alert', 15)}${esc(L(`${hid} token(s) desconhecido(s) ignorado(s) — possível spam; não interaja.`, `${hid} unknown token(s) ignored — possible spam; do not interact.`))}</span>` : ''}</div>`);
}
ACT.wwSmall = (el) => { WW.v.small = el.checked; LS.set('ww-small', WW.v.small); wwDrawAssets(); };
ACT.wwAsset = (el) => {
  const ws = wwWallets(); const a = wwAssets(ws).find((x) => x.k === el.dataset.k); if (!a) return;
  const c = a.cg && BY_CG[a.cg];
  const parts = a.parts.slice().sort((p, q) => q.q - p.q);
  const xl = { stake: L('em stake', 'staked'), perp: L('perpétuos', 'perps') };
  openModal({
    title: `${a.s} · ${a.n}`, wide: true, label: a.s,
    body: `<div class="row wrap" style="gap:18px;margin-bottom:12px"><div class="coin">${wwLogo(a, 40)}<div><div class="nm" style="font-size:18px">${a.perp ? esc(wwMoney(a.v)) : esc(wwM(fmtQty(a.q)))} ${a.perp ? '' : esc(a.s)}</div><div class="sy">${isNum(a.v) && !a.perp ? esc(wwMoney(a.v)) : ''}</div></div></div>
      ${a.pr ? `<div class="small muted">${esc(L('Preço', 'Price'))}: <b>${esc(wwPriceTxt(a.p))}</b> ${chg(a.chg, 2, 'sm')}<br><span class="tiny faint">${esc(a.pr.src || '')}${a.pr.ts ? ' · ' + esc(fmtDateTime(a.pr.ts)) : ''}</span></div>` : `<div class="small faint">${esc(L('Sem preço agora (não entra no total).', 'No price now (not in total).'))}</div>`}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(L('Carteira', 'Wallet'))}</th><th>${esc(L('Rede', 'Network'))}</th><th class="r">${esc(L('Quantidade', 'Quantity'))}</th><th class="r">${esc(L('Valor', 'Value'))}</th></tr></thead><tbody>${parts.map((p) => `<tr><td><b>${esc(p.w.label)}</b><div class="tiny faint mono">${esc(wwShort(p.w.addr))}</div></td><td><span class="ww-nc" style="--c:${esc(wwNetColor(p.net))}">${esc(wwNetName(p.net))}</span>${p.x ? ` <span class="badge">${esc(xl[p.x] || p.x)}</span>` : ''}${p.st ? ` <span class="badge warn" title="${esc(L('A rede não respondeu na última leitura: este é o saldo lido antes.', 'Network did not respond: showing the previous reading.'))}">${esc(L('leitura de ', 'read at ') + fmtTime(p.st))}</span>` : ''}</td><td class="r num">${a.perp ? '—' : esc(wwM(fmtQty(p.q)))}</td><td class="r">${isNum(a.p) ? esc(wwMoney(p.q * a.p)) : '—'}</td></tr>`).join('')}</tbody></table></div>
      ${parts.some((p) => p.ca) ? `<p class="panel-note">${esc(L('Contrato(s):', 'Contract(s):'))} ${[...new Set(parts.filter((p) => p.ca).map((p) => `${wwNetName(p.net)} ${p.ca}`))].map((t) => `<span class="mono tiny">${esc(t)}</span>`).join(' · ')}</p>` : ''}`,
    foot: `${c ? `<button class="btn" data-act="go" data-to="chart" data-params='${esc(JSON.stringify({ s: c.s }))}'>${ico('chart-candlestick', 16)}${esc(L('Ver gráfico', 'See chart'))}</button>` : ''}${a.cg ? `<button class="btn" data-act="go" data-to="tokenomics" data-params='${esc(JSON.stringify({ id: a.cg }))}'>${ico('package', 16)}Tokenomics</button>` : ''}<button class="btn pri" data-act="closeModal">${esc(L('Fechar', 'Close'))}</button>`,
  });
};
// ---------- carteiras ----------
function wwExplorer(w) { if (w.kind === 'evm') return WW_EVM_BY.eth.ex + w.addr; if (w.kind === 'btcx') return ''; const n = WW_NET[w.kind]; return n ? n.ex + encodeURIComponent(w.addr) : ''; }
function wwWalletCard(w) {
  const r = WW.r[w.id]; const busy = WW.busy.has(w.id);
  const v = r ? wwWalletValue(w) : null;
  const net = w.kind === 'btcx' ? 'btc' : w.kind === 'evm' ? 'eth' : w.kind;
  const nn = WW_NETS[w.kind]; const ex = wwExplorer(w);
  const A = r ? wwAssets([w]) : [];
  const nets = w.kind === 'evm' && r && r.x && r.x.nets ? r.x.nets.concat(A.some((a) => a.nets.has('hl')) ? ['hl'] : []) : [];
  let status;
  if (busy) status = `<span class="ww-st"><span class="spinner sm"></span>${esc(L('lendo…', 'reading…'))}</span>`;
  else if (!r || !r.t) status = r && r.err ? `<span class="ww-st bad">${ico('triangle-alert', 14)}${esc(L('não foi possível ler: ', 'could not read: ') + r.err)}</span>` : `<span class="ww-st">${esc(L('aguardando leitura', 'waiting'))}</span>`;
  else if (r.err) status = `<span class="ww-st warn" title="${esc(r.err)}">${ico('triangle-alert', 14)}${esc(L(`fonte falhou às ${fmtTime(r.errT)}; mostrando a leitura de ${fmtTime(r.t)}`, `source failed at ${fmtTime(r.errT)}; showing reading from ${fmtTime(r.t)}`))}</span>`;
  else status = `<span class="ww-st ok" title="${esc(fmtDateTime(r.t))}"><i class="dot"></i>${esc(r.src || '')} · ${esc(ago(r.t))}</span>`;
  const extra = [];
  if (r && r.x) {
    if (w.kind === 'btcx' && isNum(r.x.used)) extra.push(L(`${r.x.used} endereço(s) usado(s)${r.x.types && r.x.types.length ? ' · ' + r.x.types.join(', ') : ''}`, `${r.x.used} used address(es)`));
    if (isNum(r.x.pend) && Math.abs(r.x.pend) > 0) extra.push(L(`${fmtQty(r.x.pend)} pendente(s) na mempool`, `${fmtQty(r.x.pend)} pending in mempool`));
    if (r.x.note) extra.push(r.x.note);
    if (w.kind === 'evm' && r.x.tokOk === false) extra.push(L('lista de tokens indisponível: só moedas nativas', 'token list unavailable: native coins only'));
  }
  if (r && r.part) extra.push(L('leitura parcial: ', 'partial read: ') + r.part);
  return `<article class="ww-card" data-id="${esc(w.id)}" style="--c:${esc(wwNetColor(net))}">
    <div class="ww-c-h"><span class="ww-ic">${esc(nn ? nn[1] : '?')}</span><div class="grow mn"><div class="ww-c-t"><b>${esc(w.label)}</b>${WW.v.pf === 'all' ? `<span class="badge">${esc(wwPfName(w.pf))}</span>` : ''}</div>
      <div class="ww-c-a"><span class="mono" title="${esc(w.addr)}">${esc(w.ens ? w.ens + ' · ' + wwShort(w.addr) : wwShort(w.addr))}</span><button class="icon-btn xs" data-act="wwCopy" data-id="${esc(w.id)}" title="${esc(L('Copiar endereço', 'Copy address'))}" aria-label="${esc(L('Copiar endereço', 'Copy address'))}">${ico('copy', 14)}</button>${ex ? `<a class="icon-btn xs" href="${esc(safeUrl(ex))}" target="_blank" rel="noopener noreferrer" title="${esc(L('Abrir no explorador', 'Open in explorer'))}" aria-label="${esc(L('Abrir no explorador', 'Open in explorer'))}">${ico('external-link', 14)}</a>` : ''}</div></div>
      <div class="ww-c-v"><b>${isNum(v) ? esc(wwMoney(v)) : '—'}</b><span>${esc(nn ? nn[0] : '')}</span></div></div>
    ${nets.length ? wwNetChips(nets, 6) : ''}
    ${A.length ? `<div class="ww-c-as">${A.filter((a) => a.q > 0).slice(0, 5).map((a) => `<span>${esc(a.perp ? L('Perps', 'Perps') : a.s)} <b>${a.perp ? esc(wwMoney(a.v)) : esc(wwM(fmtQty(a.q)))}</b></span>`).join('')}${A.length > 5 ? `<span class="faint">+${A.length - 5}</span>` : ''}</div>` : ''}
    ${extra.length ? `<div class="ww-c-x">${extra.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="ww-c-f">${status}<span class="grow"></span><button class="btn xs ghost" data-act="wwOne" data-id="${esc(w.id)}" ${busy ? 'disabled' : ''}>${ico('refresh-cw', 14)}<span class="hide-sm">${esc(L('Atualizar', 'Refresh'))}</span></button><button class="btn xs ghost" data-act="wwWallet" data-id="${esc(w.id)}">${ico('ellipsis-vertical', 14)}<span class="hide-sm">${esc(L('Detalhes', 'Details'))}</span></button></div></article>`;
}
function wwDrawWallets() {
  const box = $('#ww-wallets'); if (!box) return;
  const ws = wwWallets().slice().sort((a, b) => (wwWalletValue(b) || 0) - (wwWalletValue(a) || 0));
  setHTML(box, `${panelHead('wallet-cards', L('Carteiras', 'Wallets'), { sub: esc(L('Cada endereço com a fonte e a hora da leitura. Se uma fonte falha, fica o último saldo lido, com o horário.', 'Each address with source and read time. If a source fails, the last reading stays, with its time.')), right: `<button class="btn sm pri" data-act="wwAddToggle">${ico('plus', 16)}${esc(L('Adicionar', 'Add'))}</button>` })}
    ${ws.length ? `<div class="ww-cards">${ws.map(wwWalletCard).join('')}</div>` : emptyBox('wallet', L('Nenhuma carteira neste portfólio', 'No wallet in this portfolio'), '', `<button class="btn sm pri" data-act="wwAddToggle">${ico('plus', 16)}${esc(L('Adicionar carteira', 'Add wallet'))}</button>`)}`);
}
ACT.wwCopy = async (el) => { const w = WW.d.w.find((x) => x.id === el.dataset.id); if (!w) return; try { await navigator.clipboard.writeText(w.addr); toast(L('Endereço copiado.', 'Address copied.'), { type: 'ok', ms: 2000 }); } catch { toast(w.addr, { ms: 8000 }); } };
ACT.wwOne = (el) => { const w = WW.d.w.find((x) => x.id === el.dataset.id); if (w) wwReadOne(w, { full: true }).then(() => wwSnapshot()); };
ACT.wwRefresh = async (el) => {
  if (!WW.d.w.length) return;
  el.classList.add('busy');
  try { if (!WWT.list) await runSource('ww-tok', { force: true }); await wwRefreshAll({ full: true }); HEALTH['ww-bal'] && Object.assign(HEALTH['ww-bal'], { ts: Date.now(), ok: true, err: '' }); stampsRefresh(); toast(L('Saldos atualizados.', 'Balances refreshed.'), { type: 'ok', ms: 2200 }); }
  catch (e) { toast(String(e.message || e), { type: 'err' }); }
  el.classList.remove('busy');
};
ACT.wwWallet = (el) => {
  const w = WW.d.w.find((x) => x.id === el.dataset.id); if (!w) return;
  const r = WW.r[w.id] || {}; const A = wwAssets([w]); const nn = WW_NETS[w.kind]; const ex = wwExplorer(w);
  const txs = (r.txs || []).slice(0, 8); const nt = w.kind === 'btcx' ? WW_NET.btc : WW_NET[w.kind];
  const pfOpts = WW.d.pf.map((p) => `<option value="${esc(p.id)}" ${p.id === w.pf ? 'selected' : ''}>${esc(p.n)}</option>`).join('');
  openModal({
    title: w.label, wide: true,
    body: `<div class="ww-md-h"><span class="badge">${esc(nn ? nn[0] : '')}</span><span class="mono small ww-addr-full">${esc(w.addr)}</span>${w.ens ? `<span class="badge">${esc(w.ens)}</span>` : ''}</div>
      <div class="ww-md-g"><div class="fld"><label for="ww-wn">${esc(L('Nome', 'Name'))}</label><input class="inp" id="ww-wn" maxlength="40" value="${esc(w.label)}"></div><div class="fld"><label for="ww-wp">${esc(L('Portfólio', 'Portfolio'))}</label><select class="sel inp" id="ww-wp">${pfOpts}</select></div></div>
      <h3 class="lab-h3">${esc(L('Saldos', 'Balances'))}</h3>${A.length ? `<div class="list">${A.map((a) => `<div class="li">${wwLogo(a, 26)}<span class="grow"><span class="t" style="display:block">${esc(a.s)} <span class="faint tiny">${esc([...a.nets].map(wwNetName).join(', '))}</span></span></span><span class="r"><b>${a.perp ? esc(wwMoney(a.v)) : esc(wwM(fmtQty(a.q)))}</b><div class="tiny faint">${isNum(a.v) && !a.perp ? esc(wwMoney(a.v)) : ''}</div></span></div>`).join('')}</div>` : `<p class="small faint">${esc(r.t ? L('Sem saldo neste endereço.', 'No balance at this address.') : L('Ainda não lido.', 'Not read yet.'))}</p>`}
      ${txs.length ? `<h3 class="lab-h3">${esc(L('Últimos movimentos', 'Latest movements'))}</h3><div class="list">${txs.map(([t, d, h, conf]) => `<div class="li">${ico(d >= 0 ? 'arrow-down-left' : 'arrow-up-right', 17, d >= 0 ? 'up' : 'down')}<span class="grow"><span class="t" style="display:block">${d >= 0 ? '+' : '−'}${esc(wwM(fmtQty(Math.abs(d))))} ${esc(nt ? nt.s : '')}</span><span class="m">${esc(fmtDateTime(t))}${conf ? '' : ' · ' + esc(L('pendente', 'pending'))}</span></span>${nt && nt.tx && h ? `<a class="link-btn" href="${esc(safeUrl(nt.tx + h))}" target="_blank" rel="noopener noreferrer">${esc(L('ver', 'view'))}${ico('external-link', 13)}</a>` : ''}</div>`).join('')}</div>` : ''}
      ${w.kind === 'btcx' && r.x && r.x.addrs && r.x.addrs.length ? `<h3 class="lab-h3">${esc(L('Endereços com saldo', 'Addresses with balance'))}</h3><div class="list">${r.x.addrs.map(([a, b, c]) => `<div class="li"><span class="grow mono tiny">${esc(a)} <span class="faint">${esc(c ? L('troco', 'change') : L('recebimento', 'receive'))}</span></span><b class="small">${esc(wwM(fmtQty(b)))} BTC</b><a class="icon-btn xs" href="${esc(safeUrl(WW_NET.btc.ex + a))}" target="_blank" rel="noopener noreferrer" aria-label="mempool.space">${ico('external-link', 13)}</a></div>`).join('')}</div>` : ''}
      <p class="panel-note">${r.t ? esc(L(`Lido em ${fmtDateTime(r.t)} · fonte: ${r.src || '—'}.`, `Read at ${fmtDateTime(r.t)} · source: ${r.src || '—'}.`)) : ''} ${r.err ? `<span class="warn-t">${esc(L('Último erro: ', 'Last error: ') + r.err)}</span>` : ''}</p>
      <div class="row wrap" style="gap:8px 16px">${ex ? extLink(ex, L('Abrir no explorador', 'Open in explorer')) : ''}${w.kind === 'evm' ? extLink('https://debank.com/profile/' + w.addr, L('Posições em DeFi (DeBank)', 'DeFi positions (DeBank)')) + extLink(WW_NET.hl.ex + w.addr, 'Hyperliquid') : ''}</div>`,
    foot: `<button class="btn danger" data-k="del">${ico('trash-2', 16)}${esc(L('Remover', 'Remove'))}</button><span class="grow"></span><button class="btn ghost" data-act="closeModal">${esc(L('Fechar', 'Close'))}</button><button class="btn pri" data-k="save">${esc(L('Salvar', 'Save'))}</button>`,
    onOpen: (m) => {
      m.querySelector('[data-k=save]').onclick = () => { const n = m.querySelector('#ww-wn').value.trim().slice(0, 40); if (n) w.label = n; w.pf = m.querySelector('#ww-wp').value; wwSave(); closeModal(); wwRedraw(true); };
      m.querySelector('[data-k=del]').onclick = async () => {
        closeModal();
        if (!(await confirmBox(L(`Parar de acompanhar "${w.label}"? Só sai desta lista: nada muda na carteira.`, `Stop tracking "${w.label}"? It only leaves this list.`), { ok: L('Remover', 'Remove'), danger: true }))) return;
        WW.d.w = WW.d.w.filter((x) => x.id !== w.id); delete WW.r[w.id]; delete WW_XC[w.id]; WW.ev = WW.ev.filter((e) => e.w !== w.id);
        wwSave(); wwSaveRead(); LS.set('ww-ev', WW.ev); wwDraw(); toast(L('Carteira removida.', 'Wallet removed.'), { type: 'ok' });
      };
    },
  });
};
// ---------- evolução (registrada por este navegador) ----------
async function wwDrawHist() {
  const box = $('#ww-hist'); if (!box) return; WW.histDrawn = Date.now();
  const arr = WW.hist[WW.v.pf] || []; const brlOn = !!wwRate();
  const pts = arr.map(([d, u, b]) => ({ t: Date.parse(d + 'T12:00:00Z'), v: brlOn ? b : u })).filter((p) => isNum(p.v));
  const head = panelHead('chart-line', L('Evolução', 'History'), { sub: esc(L('O total registrado por este navegador em cada dia em que o Wallet Watch foi aberto (não é o histórico da blockchain).', 'The total recorded by this browser on each day Wallet Watch was opened (not blockchain history).')) });
  if (pts.length < 2 || WW.v.hide) { box.innerHTML = head + emptyBox('chart-line', WW.v.hide ? L('Valores escondidos', 'Values hidden') : L('O gráfico começa a se formar', 'The chart is starting'), esc(WW.v.hide ? L('Desative o modo privado para ver o gráfico.', 'Turn off private mode to see the chart.') : L(`Já temos ${pts.length} dia(s) registrado(s). Abra o Wallet Watch em outros dias e a linha aparece aqui.`, `${pts.length} day(s) recorded so far. Open Wallet Watch on other days and the line appears here.`))); return; }
  box.innerHTML = head + `<div id="ww-hist-ch" style="height:240px"></div><p class="panel-note">${esc(L('Adicionar ou remover carteiras muda a linha a partir daquele dia.', 'Adding or removing wallets changes the line from that day on.'))}</p>`;
  try {
    const { ch, c } = await makeChart($('#ww-hist-ch'), { onTheme: () => wwDrawHist(), priceFmt: (p) => fmtCompact(p, brlOn ? 'BRL' : 'USD') });
    const s = ch.addAreaSeries({ lineColor: c.accent, topColor: c.accent + '40', bottomColor: c.accent + '00', lineWidth: 2, priceLineVisible: false });
    s.setData(pts.map((p) => ({ time: ctime(p.t, false), value: p.v })));
    ch.timeScale().fitContent();
  } catch (e) { box.innerHTML = head + emptyBox('wifi-off', L('Gráfico indisponível', 'Chart unavailable'), esc(String(e.message || e))); }
}
// ---------- movimentos ----------
function wwDrawAct() {
  const box = $('#ww-act'); if (!box) return;
  const ws = wwWallets(); const ids = new Set(ws.map((w) => w.id));
  const items = [];
  for (const w of ws) { const r = WW.r[w.id]; const nt = w.kind === 'btcx' ? WW_NET.btc : WW_NET[w.kind]; for (const [t, d, h, conf] of (r && r.txs) || []) items.push({ t, d, s: nt ? nt.s : '', cg: nt ? nt.cg : null, w, h, conf, tx: nt && nt.tx ? nt.tx + h : '' }); }
  for (const e of WW.ev) { if (!ids.has(e.w)) continue; const w = WW.d.w.find((x) => x.id === e.w); if (!w || (['btc', 'btcx', 'ltc', 'doge'].includes(w.kind) && !e.x)) continue; items.push({ t: e.t, d: e.d, s: e.s, cg: e.cg, w, ev: e }); }
  items.sort((a, b) => b.t - a.t);
  const pr = (cg) => (cg ? wwPrice({ cg }) : null);
  setHTML(box, panelHead('activity', L('Movimentos', 'Activity'), { sub: esc(L('Entradas e saídas das redes com histórico público (BTC, LTC, DOGE) e mudanças de saldo detectadas entre leituras nas demais.', 'Ins and outs on networks with public history (BTC, LTC, DOGE) and balance changes detected between reads on the others.')) }) +
    (items.length ? `<div class="list ww-act">${items.slice(0, 14).map((it) => {
      const p = pr(it.cg); const val = p && isNum(p.p) ? Math.abs(it.d) * p.p : null;
      const when = it.ev ? L(`entre ${fmtDateTime(it.ev.p0)} e ${fmtDateTime(it.t)}`, `between ${fmtDateTime(it.ev.p0)} and ${fmtDateTime(it.t)}`) : fmtDateTime(it.t) + (it.conf === false ? ' · ' + L('pendente', 'pending') : '');
      return `<div class="li">${ico(it.d >= 0 ? 'arrow-down-left' : 'arrow-up-right', 18, it.d >= 0 ? 'up' : 'down')}<span class="grow"><span class="t" style="display:block"><span class="${it.d >= 0 ? 'up' : 'down'}">${it.d >= 0 ? '+' : '−'}${esc(wwM(fmtQty(Math.abs(it.d))))} ${esc(it.s)}</span> · ${esc(it.w.label)}${it.ev ? ` <span class="badge" title="${esc(L('Detectado pelo Wallet Watch comparando duas leituras do saldo.', 'Detected by comparing two balance readings.'))}">${esc(L('mudança detectada', 'change detected'))}</span>` : ''}</span><span class="m">${esc(when)}</span></span>${isNum(val) ? `<span class="small faint">≈ ${esc(wwMoney(val))}</span>` : ''}${it.tx ? `<a class="icon-btn xs" href="${esc(safeUrl(it.tx))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(L('Ver transação', 'View transaction'))}">${ico('external-link', 13)}</a>` : ''}</div>`;
    }).join('')}</div><p class="panel-note">${esc(L('"≈" usa o preço de agora, não o do dia do movimento.', '"≈" uses today’s price, not the price on that day.'))}</p>` : emptyBox('activity', L('Nenhum movimento ainda', 'No activity yet'), esc(L('Quando entrar ou sair algo das carteiras, aparece aqui.', 'When funds move in or out, it shows here.')))));
}
// ---------- como funciona ----------
function wwHowHtml() {
  const card = (icn, t, d) => `<div class="ww-how-c">${ico(icn, 20)}<b>${esc(t)}</b><p>${esc(d)}</p></div>`;
  const src = [['Bitcoin', 'mempool.space · blockchain.info'], [L('Bitcoin por xpub', 'Bitcoin by xpub'), L('endereços derivados aqui no navegador (padrão BIP32) · blockchain.info', 'addresses derived in the browser (BIP32) · blockchain.info')], [L('Ethereum e redes EVM', 'Ethereum & EVM'), 'PublicNode, drpc, RPC das redes (Multicall3)'], ['Hyperliquid', 'API pública da Hyperliquid'], ['Solana', 'Jupiter · PublicNode'], ['Tron', 'TronGrid'], ['Litecoin', 'litecoinspace.org · BlockCypher'], ['Dogecoin', 'BlockCypher · Blockchair'], ['XRP', 'xrplcluster.com · xrpl.ws'], ['TON', 'TonAPI · Toncenter'], [L('Preços', 'Prices'), 'Binance · DefiLlama · CoinGecko · Jupiter · TonAPI · Hyperliquid']];
  const apps = [['MetaMask / Rabby', L('Clique no nome da conta, no alto: o endereço (0x…) é copiado.', 'Click the account name at the top: the 0x… address is copied.')], ['Trust Wallet', L('Receber → escolha a moeda → Copiar.', 'Receive → pick the coin → Copy.')], ['Phantom', L('Toque no nome da conta → copie o endereço de cada rede.', 'Tap the account name → copy each network’s address.')], ['Ledger Live', L('Abra a conta → ícone de chave inglesa (Editar conta) → Avançado → copie a xpub.', 'Open the account → wrench icon → Advanced → copy the xpub.')], ['Trezor Suite', L('Conta → Detalhes → Mostrar chave pública (xpub/zpub).', 'Account → Details → Show public key (xpub/zpub).')], ['Electrum / Sparrow / BlueWallet', L('Informações da carteira → chave pública mestra (xpub/zpub). Ou copie um endereço de recebimento.', 'Wallet info → master public key (xpub/zpub), or copy a receiving address.')]];
  return `${panelHead('shield-check', L('Como funciona e por que é seguro', 'How it works and why it is safe'))}
    <div class="ww-how">${card('eye', L('Só leitura', 'Read-only'), L('O endereço público é como o número da sua conta para receber: serve para ver o saldo, nunca para movimentar. Não há conexão de carteira nem assinatura.', 'A public address is like an account number for receiving: it shows the balance, never moves funds. No wallet connection, no signing.'))}
    ${card('ban', L('Segredos bloqueados', 'Secrets blocked'), L('Se alguém colar 12/24 palavras ou uma chave privada, o campo bloqueia, apaga e não guarda nada. O NEXUS HUB nunca pede isso.', 'If someone pastes 12/24 words or a private key, the field blocks it, clears it and stores nothing. NEXUS HUB never asks for it.'))}
    ${card('lock', L('Fica no seu aparelho', 'Stays on your device'), L('A lista de endereços fica só neste navegador. Para ler o saldo, o navegador consulta direto as fontes públicas de cada rede (que veem o endereço consultado, como em qualquer explorador).', 'The address list stays in this browser. To read balances, your browser queries public sources directly (which see the queried address, like any explorer).'))}
    ${card('shield-alert', L('Sem token falso', 'No fake tokens'), L('Golpistas mandam tokens de "airdrop" com links. Só entram moedas da lista das ~1.500 maiores e tokens verificados (Jupiter, TonAPI); os outros são ignorados.', 'Scammers airdrop tokens with links. Only coins from the top ~1,500 list and verified tokens count; others are ignored.'))}</div>
    <div class="grid g-2 mt ww-how2"><div><h3 class="lab-h3">${esc(L('Onde achar o endereço', 'Where to find your address'))}</h3><div class="ww-kv">${apps.map(([a, t]) => `<b>${esc(a)}</b><span>${esc(t)}</span>`).join('')}</div>
      <p class="panel-note">${esc(L('Endereço de depósito de corretora (Binance, Mercado Bitcoin…) mostra só o que passou por aquele endereço, não o saldo da sua conta na corretora.', 'An exchange deposit address shows only that address, not your exchange account balance.'))}</p></div>
      <div><h3 class="lab-h3">${esc(L('Fontes de cada rede', 'Sources per network'))}</h3><div class="ww-kv">${src.map(([a, t]) => `<b>${esc(a)}</b><span>${esc(t)}</span>`).join('')}</div>
      <p class="panel-note">${esc(L('Não entram: posições em protocolos DeFi (staking em contratos, liquidez, empréstimos), NFTs e saldos dentro de corretoras. Atualiza sozinho a cada 5 min com a página aberta; os preços das principais moedas, em tempo real.', 'Not included: DeFi positions (contract staking, liquidity, loans), NFTs and exchange balances. Auto-refreshes every 5 min while open; major coin prices in real time.'))}</p></div></div>`;
}
// ---------- ferramentas ----------
ACT.seg_wwcur = (v) => { WW.v.cur = v; LS.set('ww-cur', v); wwRedraw(true); };
ACT.wwHide = () => { WW.v.hide = !WW.v.hide; LS.set('ww-hide', WW.v.hide); const pg = $('#pg-wallets'); if (pg) { const t = pg.querySelector('.pg-tools'); if (t) t.innerHTML = wwTools(); } wwRedraw(true); };
ACT.wwExport = () => {
  closeMenus();
  const out = { app: 'NEXUS HUB · Wallet Watch', v: 1, exportedAt: new Date().toISOString(), aviso: 'Somente endereços públicos (sem chaves).', portfolios: WW.d.pf.map((p) => ({ id: p.id, nome: p.n })), carteiras: WW.d.w.map((w) => ({ endereco: w.addr, nome: w.label, portfolio: w.pf, rede: w.kind, ...(w.ens ? { ens: w.ens } : {}) })) };
  downloadFile(`nexus-wallet-watch-${todayISO()}.json`, JSON.stringify(out, null, 2));
  toast(L('Lista baixada. Use "Importar" para levar a outro aparelho.', 'List downloaded. Use "Import" on another device.'), { type: 'ok' });
};
ACT.wwImport = () => {
  closeMenus();
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    if (f.size > 500000) { toast(L('Arquivo grande demais.', 'File too large.'), { type: 'err' }); return; }
    try {
      const j = JSON.parse(await f.text());
      const pfs = Array.isArray(j.portfolios) ? j.portfolios : []; const list = Array.isArray(j.carteiras) ? j.carteiras : Array.isArray(j.wallets) ? j.wallets : [];
      // segurança: se houver qualquer segredo no arquivo, nada é importado
      if (list.some((x) => wwDetect(String((x && (x.endereco || x.address)) || '')).secret)) { toast(L('O arquivo tem chave privada ou frase-semente. Por segurança, nada foi importado.', 'The file contains a private key or seed. Nothing was imported.'), { type: 'err', ms: 9000 }); return; }
      const map = {}; let added = 0, skipped = 0;
      for (const p of pfs) { const ex = WW.d.pf.find((x) => x.n === String(p.nome || p.name || '').slice(0, 30)); if (ex) map[p.id] = ex.id; else { const np = await wwNewPf(p.nome || p.name); if (np) map[p.id] = np.id; } }
      for (const x of list) {
        const d = wwDetect(String(x.endereco || x.address || ''));
        if (!d.ok || d.kind === 'ens' || WW.d.w.length >= WW_MAX || WW.d.w.some((w) => w.addr.toLowerCase() === d.addr.toLowerCase())) { skipped++; continue; }
        WW.d.w.push({ id: 'w' + uid().slice(0, 9), kind: d.kind, addr: d.addr, label: String(x.nome || x.label || d.addr.slice(0, 10)).slice(0, 40), pf: map[x.portfolio] || WW.d.pf[0].id, at: Date.now(), ...(x.ens ? { ens: String(x.ens).slice(0, 80) } : {}) });
        added++;
      }
      wwSave(); wwDraw();
      toast(L(`${added} carteira(s) importada(s)${skipped ? `, ${skipped} ignorada(s) (repetidas ou inválidas)` : ''}.`, `${added} imported${skipped ? `, ${skipped} skipped` : ''}.`), { type: added ? 'ok' : 'warn', ms: 6000 });
      if (added) { if (!WWT.list) await runSource('ww-tok', { force: true }); wwRefreshAll({ full: true }).catch(() => {}); }
    } catch (e) { toast(L('Não foi possível ler o arquivo: ', 'Could not read the file: ') + (e.message || e), { type: 'err' }); }
  };
  inp.click();
};
ACT.wwWipe = async () => {
  closeMenus();
  if (!(await confirmBox(L('Apagar todas as carteiras, portfólios, leituras e o histórico do Wallet Watch deste navegador? Nada muda nas carteiras em si.', 'Erase all Wallet Watch wallets, portfolios, readings and history from this browser?'), { ok: L('Apagar tudo', 'Erase all'), danger: true }))) return;
  ['ww', 'ww-read', 'ww-ev', 'ww-hist', 'ww-pf'].forEach((k) => LS.del(k));
  WW.d = wwLoad(); WW.r = {}; WW.ev = []; WW.hist = {}; WW.v.pf = 'all'; Object.keys(WW_XC).forEach((k) => delete WW_XC[k]);
  wwDraw(); toast(L('Wallet Watch zerado neste navegador.', 'Wallet Watch cleared in this browser.'), { type: 'ok' });
};
// atualização ao vivo dos valores (preço da Binance muda a cada segundo): troca só os números
function wwTick() {
  if (S.page !== 'wallets' || !$('#ww-total')) return;
  const ws = wwWallets(); const T = wwTotals(ws);
  const big = $('#ww-total .ww-big'); if (big && isNum(T.usd)) { const t = wwMoney(T.usd); if (big.textContent !== t) big.textContent = t; }
  const d24 = $('#ww-total .ww-d24');
  if (d24 && isNum(T.d24)) setHTML(d24, `<span class="chip ${tone(T.d24) || 'flat'}">${T.d24 >= 0 ? '▲' : '▼'} ${esc(wwMoney(Math.abs(T.d24)))}</span><span class="b ${tone(T.p24)}">${esc(fmtPct(T.p24))}</span><span class="small faint">${esc(L('em 24 h (preços de agora × 24 h atrás, com os saldos de hoje)', 'in 24h (prices now vs 24h ago, with today’s balances)'))}</span>`);
  const tot = sum(T.A.filter((a) => isNum(a.v)).map((a) => a.v)); const byK = new Map(T.A.map((a) => [a.k, a]));
  $$('#ww-assets tr[data-k]').forEach((tr) => {
    const a = byK.get(tr.dataset.k); if (!a || a.perp) return; const td = tr.children;
    if (td[1] && isNum(a.p)) setHTML(td[1], `${esc(wwPriceTxt(a.p))}<div class="tiny">${chg(a.chg, 2, 'sm')}</div>`);
    if (td[3] && isNum(a.v)) { const t = wwMoney(a.v); if (td[3].textContent !== t) td[3].textContent = t; }
    const wv = td[4] && td[4].querySelector('.ww-w span'); if (wv && tot > 0 && isNum(a.v)) wv.textContent = fmtPct(a.v / tot * 100, 1, false);
  });
  $$('#ww-wallets .ww-card[data-id]').forEach((c) => { const w = WW.d.w.find((x) => x.id === c.dataset.id); const el = c.querySelector('.ww-c-v b'); if (w && el) { const v = wwWalletValue(w); const t = isNum(v) ? wwMoney(v) : '—'; if (el.textContent !== t) el.textContent = t; } });
  $$('#ww-pfbar .ww-pf[data-id]').forEach((b) => { const el = b.querySelector('.vl'); if (!el) return; const v = wwTotals(wwWallets(b.dataset.id)).usd; const t = isNum(v) ? wwMoney(v, [0, 0]) : '—'; if (el.textContent !== t) el.textContent = t; });
}
onPrice((set) => {
  if (S.page !== 'wallets' || !WW.d.w.length || document.hidden) return;
  if (!(set.has('FX') || set.has('CGM') || set.has('XP') || [...set].some((x) => BY_SYM[x]))) return;
  if (Date.now() - (WW.tk || 0) < 1500) return; WW.tk = Date.now(); wwTick();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-act="wwAsset"]')) { e.preventDefault(); e.target.click(); } });
page({
  id: 'wallets', group: 'conta', icon: 'scan-eye', pt: 'Wallet Watch', en: 'Wallet Watch',
  sub: 'Acompanhe qualquer carteira só pelo endereço público — Bitcoin (e xpub), Ethereum e redes EVM, Solana, Tron e mais. Sem chave, sem risco: a lista fica no seu aparelho.',
  subEn: 'Track any wallet by its public address — Bitcoin (and xpub), Ethereum & EVM networks, Solana, Tron and more. No keys, no risk: the list stays on your device.',
  init(el) { el.innerHTML = wwHtml(); wwDraw(); },
  show() {
    wwDraw();
    if (WW.d.w.length) {
      if (!WWT.list) runSource('ww-tok', { force: true }).then(() => { if (!WW.lastAll || Date.now() - WW.lastAll > 4 * 60e3) runSource('ww-bal', { force: true }); });
      else if (!WW.lastAll || Date.now() - WW.lastAll > 4 * 60e3) runSource('ww-bal', { force: true });
    }
  },
});
