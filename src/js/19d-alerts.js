// =====================================================================
// ALERTAS NO CELULAR — preço e eventos (Web Push). Grátis com conta: até 3 alertas de preço ativos
// (PRO e teste: 30) e avisos de eventos. Quem confere os preços e envia é o servidor (função "alerts",
// chamada a cada minuto pelo banco). Aqui: o aparelho, os alertas, as preferências e o histórico.
// =====================================================================
const AL_FN = `${NX.supabaseUrl}/functions/v1/alerts`;
const alNew = () => ({ st: 'idle', err: '', uid: null, dev: [], pa: [], ea: [], log: [], settings: {}, prefs: null, sub: null, busy: '', seq: 0, at: 0, form: null, drawT: 0 });
let AL = alNew();
const AL_LIM = () => (hasPro() ? 30 : 3);
const AL_LEADS = () => [[15, L('15 min antes', '15 min before')], [30, L('30 min antes', '30 min before')], [60, L('1 h antes', '1 h before')], [1440, L('1 dia antes', '1 day before')]];
const AL_REG = () => [['US', L('EUA', 'US')], ['BR', L('Brasil', 'Brazil')], ['CR', L('Cripto', 'Crypto')]];
const alDefPrefs = () => ({ auto: false, reg: ['US', 'BR', 'CR'], imp: 3, lead: 30, skip: [] });
const AL_COND = () => [['above', L('Passar de', 'Rise above'), 'trending-up'], ['below', L('Cair abaixo de', 'Fall below'), 'trending-down'], ['up24', L('Subir % em 24 h', 'Up % in 24h'), 'arrow-up'], ['down24', L('Cair % em 24 h', 'Down % in 24h'), 'arrow-down']];
const alIsPct = (c) => c === 'up24' || c === 'down24';

// ---------- o aparelho ----------
const alStandalone = () => { try { return isStandalone(); } catch { return false; } };
function alEnv() {
  if (isIOS() && !alStandalone()) return 'ios';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'none';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}
async function alReg() {
  if (!('serviceWorker' in navigator)) return null;
  try { return (await navigator.serviceWorker.getRegistration()) || (await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 4000))])); } catch { return null; }
}
async function alCurSub() { const reg = await alReg(); if (!reg || !reg.pushManager) return null; try { return await reg.pushManager.getSubscription(); } catch { return null; } }
function alDevLabel() {
  const u = navigator.userAgent;
  const os = /Android/i.test(u) ? 'Android' : isIOS() ? (/iPad/.test(u) ? 'iPad' : 'iPhone') : /Windows/i.test(u) ? 'Windows' : /Mac OS X/i.test(u) ? 'Mac' : /Linux|CrOS/i.test(u) ? 'Linux' : L('Aparelho', 'Device');
  const br = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /SamsungBrowser/.test(u) ? 'Samsung' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : '';
  return `${os}${alStandalone() ? ' · app' : br ? ' · ' + br : ''}${/\/beta\//.test(location.pathname) ? ' (beta)' : ''}`.slice(0, 60);
}
const alB64 = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
// chave pública do servidor (VAPID): sempre a atual; a guardada só vale se o servidor não responder
const alKeyOk = (k) => typeof k === 'string' && /^[\w-]{80,100}$/.test(k);
async function alVapid() {
  try {
    const r = await fetch(AL_FN + '?vapid=1', { headers: { apikey: NX.supabaseKey } });
    const j = await r.json().catch(() => ({}));
    if (r.ok && alKeyOk(j.key)) { LS.set('al-vapid', j.key); return j.key; }
  } catch { /* sem rede: tenta a guardada */ }
  const c = LS.get('al-vapid'); if (alKeyOk(c)) return c;
  throw new Error(L('O servidor de alertas não respondeu. Tente de novo em instantes.', 'The alerts server did not answer. Try again shortly.'));
}
// a inscrição existente foi feita com esta chave? (se a chave mudou, o envio seria recusado)
function alSameKey(sub, key) {
  try { const k = sub.options && sub.options.applicationServerKey; if (!k) return true; const a = new Uint8Array(k), b = alB64(key); return a.length === b.length && a.every((x, i) => x === b[i]); } catch { return true; }
}
async function alFn(payload) {
  const tok = await authToken(); if (!tok) throw new Error(L('Entre na sua conta de novo.', 'Please sign in again.'));
  const r = await fetch(AL_FN, { method: 'POST', headers: { 'content-type': 'application/json', apikey: NX.supabaseKey, authorization: 'Bearer ' + tok }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}
async function alSaveSub(sub) {
  const j = sub.toJSON(); const sb = await sbClient();
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* */ }
  const { data, error } = await sb.rpc('push_device_save', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_label: alDevLabel(), p_lang: S.lang === 'en' ? 'en' : 'pt', p_tz: tz });
  if (error) throw new Error(error.message);
  if (data && data.ok === false) {
    throw new Error(data.error === 'endpoint'
      ? L('Este navegador usa um serviço de notificações que o NEXUS ainda não aceita. Use o Chrome, o Edge, o Firefox ou o Safari (no iPhone, o app instalado).', 'This browser uses a notification service NEXUS does not accept yet. Use Chrome, Edge, Firefox or Safari (on iPhone, the installed app).')
      : L('Limite de 10 aparelhos: remova um da lista antes.', 'Limit of 10 devices: remove one first.'));
  }
}
// este aparelho estava recebendo: guarda o fim do endereço da inscrição, para notar quando o navegador a troca
const alEpId = (sub) => String((sub && sub.endpoint) || '').slice(-40);
const alMark = (sub) => { if (sub && ACCOUNT.user) LS.set('al-ep', { u: ACCOUNT.user.id, e: alEpId(sub) }); else LS.del('al-ep'); };
// O navegador pode trocar ou perder a inscrição de tempos em tempos. Se este aparelho estava recebendo e a
// inscrição mudou, refaz sozinho (a permissão já foi dada), para os alertas não pararem em silêncio.
// Se foi a pessoa que tirou o aparelho da lista, a inscrição continua a mesma e nada é refeito.
async function alHeal() {
  try {
    const was = LS.get('al-ep');
    if (!ACCOUNT.user || !was || was.u !== ACCOUNT.user.id || alEnv() !== 'ok' || Notification.permission !== 'granted') return false;
    const reg = await alReg(); if (!reg || !reg.pushManager) return false;
    let sub = await reg.pushManager.getSubscription();
    if (sub && alEpId(sub) === was.e) return false;
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: alB64(await alVapid()) });
    await alSaveSub(sub); alMark(sub); AL.sub = sub;
    return true;
  } catch (e) { console.warn('[NX] alertas: refazer a inscrição', e); return false; }
}
// este aparelho está na lista da conta?
const alThisDev = () => (AL.sub ? AL.dev.find((d) => d.endpoint === AL.sub.endpoint) || null : null);

ACT.alOn = async () => {
  if (!ACCOUNT.user) return ACT.signup();
  if (alEnv() !== 'ok' || AL.busy) { alDrawDev(); return; }
  AL.busy = 'on'; alDrawDev();
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied' ? L('As notificações foram bloqueadas. Libere nas configurações do navegador (cadeado ao lado do endereço).', 'Notifications are blocked. Allow them in the browser settings (lock icon next to the address).') : L('Permissão não concedida.', 'Permission not granted.'));
    const key = await alVapid();
    const reg = await alReg(); if (!reg || !reg.pushManager) throw new Error(L('O app ainda está carregando. Tente de novo em instantes.', 'The app is still loading. Try again shortly.'));
    let sub = await reg.pushManager.getSubscription();
    if (sub && !alSameKey(sub, key)) {
      const old = sub.endpoint; try { await sub.unsubscribe(); } catch { /* */ } sub = null;
      try { const sb = await sbClient(); await sb.from('push_devices').delete().eq('endpoint', old); } catch { /* */ }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: alB64(key) });
    await alSaveSub(sub);
    AL.sub = sub; alMark(sub);
    await alLoad(true);
    await alTest(true);
  } catch (e) {
    toast(String((e && e.message) || e), { type: 'err', ms: 7000 });
  } finally { AL.busy = ''; alDraw(); }
};
async function alTest(quiet) {
  const j = await alFn({ action: 'test' });
  if (j.status === 429) { if (!quiet) toast(L('Espere alguns segundos para mandar outro teste.', 'Wait a few seconds before another test.'), { type: 'warn' }); return; }
  if (!j.ok) throw new Error(j.detail || j.error || 'HTTP ' + j.status);
  if (j.sent) toast(L(`Notificação de teste enviada para ${j.sent} aparelho${j.sent > 1 ? 's' : ''}. Confira a tela.`, `Test notification sent to ${j.sent} device${j.sent > 1 ? 's' : ''}. Check the screen.`), { type: 'ok', ms: 6000 });
  else {
    // o motivo que o serviço de notificações deu (ajuda o suporte a resolver de primeira)
    const why = Array.isArray(j.why) && j.why[0] ? ` (${String(j.why[0]).slice(0, 90)})` : '';
    toast(L(`Nenhum aparelho recebeu o teste${why}. Desative e ative de novo neste aparelho.`, `No device got the test${why}. Turn alerts off and on again on this device.`), { type: 'warn', ms: 9000 });
  }
  setTimeout(() => alLoad(true), 1500);
}
ACT.alTest = () => alTest(false).catch((e) => toast(String(e.message || e), { type: 'err' }));
ACT.alOff = async () => {
  const sub = AL.sub || (await alCurSub());
  if (sub) {
    const ep = sub.endpoint;
    try { await sub.unsubscribe(); } catch { /* */ }
    try { const sb = await sbClient(); await sb.from('push_devices').delete().eq('endpoint', ep); } catch { /* */ }
  }
  AL.sub = null; alMark(null); await alLoad(true);
  toast(L('Este aparelho não recebe mais os alertas.', 'This device no longer gets alerts.'), { type: 'ok' });
};
ACT.alDevDel = async (b) => {
  const d = AL.dev.find((x) => x.id === b.dataset.id); if (!d) return;
  if (!(await confirmBox(L(`Parar de enviar alertas para "${d.label || 'aparelho'}"?`, `Stop sending alerts to "${d.label || 'device'}"?`), { ok: L('Remover', 'Remove'), danger: true }))) return;
  try {
    if (AL.sub && AL.sub.endpoint === d.endpoint) { try { await AL.sub.unsubscribe(); } catch { /* */ } AL.sub = null; alMark(null); }
    const sb = await sbClient(); const { error } = await sb.from('push_devices').delete().eq('id', d.id); if (error) throw new Error(error.message);
  } catch (e) { toast(String(e.message || e), { type: 'err' }); }
  alLoad(true);
};
// sair da conta: este aparelho para de receber os alertas dela
async function alForgetDevice() {
  alMark(null);
  const sub = await alCurSub(); if (!sub) return;
  const ep = sub.endpoint;
  try { const sb = await sbClient(); await Promise.race([sb.from('push_devices').delete().eq('endpoint', ep), new Promise((r) => setTimeout(r, 2500))]); } catch { /* */ }
  try { await sub.unsubscribe(); } catch { /* */ }
}

// ---------- dados ----------
async function alLoad(force) {
  if (!ACCOUNT.user) { AL = alNew(); return; }
  if (AL.uid !== ACCOUNT.user.id) { AL = alNew(); AL.uid = ACCOUNT.user.id; }
  if (!force && AL.st === 'ok' && Date.now() - AL.at < 60e3) return;
  const seq = ++AL.seq; if (AL.st !== 'ok') { AL.st = 'loading'; alDraw(); }
  try {
    const sb = await sbClient();
    const since = new Date(Date.now() - 2 * 86400e3).toISOString();
    const [d, a, e, l, pr] = await Promise.all([
      sb.from('push_devices').select('id,endpoint,label,lang,created_at,last_ok_at,fails,last_err').order('created_at'),
      sb.from('price_alerts').select('*').order('created_at', { ascending: false }),
      sb.from('event_alerts').select('id,ev_key,title,detail,at,lead_min,auto,sent_at,missed').gte('at', since).order('at').limit(400),
      sb.from('alert_log').select('id,kind,title,body,url,at,sent,failed').order('at', { ascending: false }).limit(40),
      sb.from('profiles').select('settings').eq('id', ACCOUNT.user.id).maybeSingle(),
    ]);
    if (seq !== AL.seq) return;
    for (const r of [d, a, e, l]) if (r.error) throw new Error(r.error.message);
    AL.dev = d.data || []; AL.pa = a.data || []; AL.ea = e.data || []; AL.log = l.data || [];
    AL.settings = (pr && pr.data && pr.data.settings && typeof pr.data.settings === 'object') ? pr.data.settings : {};
    AL.prefs = { ...alDefPrefs(), ...(AL.settings.alerts || {}) };
    AL.st = 'ok'; AL.at = Date.now(); AL.err = '';
  } catch (err) {
    if (seq !== AL.seq) return;
    AL.st = AL.st === 'ok' ? 'ok' : 'err'; AL.err = String((err && err.message) || err);
  }
  AL.sub = await alCurSub();
  alDraw();
  if (S.page === 'events' && typeof evDrawList === 'function') { evDrawList(); evDrawHero(); }
}
async function alSavePrefs(p) {
  AL.prefs = { ...AL.prefs, ...p };
  const sb = await sbClient();
  const settings = { ...(AL.settings || {}), alerts: AL.prefs };
  const { error } = await sb.from('profiles').update({ settings }).eq('id', ACCOUNT.user.id);
  if (error) throw new Error(error.message);
  AL.settings = settings;
}

// ---------- alerta de preço ----------
function alCoinDefault(key) {
  const c = (key && (BY_SYM[key] || BY_BASE[String(key).toUpperCase()] || BY_CG[key])) || BY_BASE.BTC;
  if (c) return { kind: 'b', s: c.s, b: c.b, n: c.n, cg: c.cg, c: c.c, logo: (typeof LOGOS !== 'undefined' && LOGOS[c.cg]) || '' };
  return { kind: 'g', s: null, b: String(key || 'BTC').toUpperCase().slice(0, 12), n: key, cg: key, c: hashColor(key), logo: '' };
}
function alForm() { if (!AL.form) AL.form = { coin: alCoinDefault(), cond: 'above', val: '', ccy: 'usd', rep: false, note: '' }; return AL.form; }
// preço agora na moeda do alerta (em reais: pelo USDT/BRL, como o servidor faz)
function alPx(c, ccy) {
  const q = priceOf(c.s || c.cg); if (!q || !isNum(q.p)) return null;
  if (ccy !== 'brl') return { p: q.p, chg: q.chg, src: q.src };
  const r = PX.USDTBRL && isNum(PX.USDTBRL.p) ? PX.USDTBRL.p : (brlRate() || {}).v;
  return isNum(r) ? { p: q.p * r, chg: q.chg, src: q.src } : null;
}
const alMoney = (v, ccy) => (ccy === 'brl' ? brl(v) : usd(v));
function alCondTxt(a) {
  const v = +a.value;
  return a.cond === 'above' ? L(`passar de ${alMoney(v, a.ccy)}`, `rise above ${alMoney(v, a.ccy)}`)
    : a.cond === 'below' ? L(`cair abaixo de ${alMoney(v, a.ccy)}`, `fall below ${alMoney(v, a.ccy)}`)
      : a.cond === 'up24' ? L(`subir ${fmtNum(v, 0, 2)}% em 24 h`, `go up ${fmtNum(v, 0, 2)}% in 24h`)
        : L(`cair ${fmtNum(v, 0, 2)}% em 24 h`, `go down ${fmtNum(v, 0, 2)}% in 24h`);
}
// distância até o alvo: em % do preço (preço) ou em pontos da variação de 24 h
function alDist(a, q) {
  if (!q) return null;
  if (a.cond === 'above' || a.cond === 'below') return (+a.value / q.p - 1) * 100;
  if (!isNum(q.chg)) return null;
  // pontos que ainda faltam: positivo = ainda não chegou; zero ou negativo = já vale
  return a.cond === 'up24' ? +a.value - q.chg : q.chg + +a.value;
}
function alSummary() {
  const f = alForm(), c = f.coin, q = alPx(c, f.ccy), v = parseDec(f.val);
  const sym = esc(c.b || '');
  if (!isNum(v) || v <= 0) return `<span class="faint">${esc(L('Escolha o valor do alerta.', 'Pick the alert value.'))}</span>${q ? ` ${esc(L('Agora', 'Now'))}: <b>${esc(alMoney(q.p, f.ccy))}</b>` : ''}`;
  const a = { cond: f.cond, value: v, ccy: f.ccy };
  const d = alDist(a, q);
  let tail = '';
  if (q && isNum(d)) {
    if (alIsPct(f.cond)) tail = ` · ${esc(L('variação agora', 'change now'))} <b class="${q.chg >= 0 ? 'up' : 'down'}">${esc(fmtPct(q.chg, 2))}</b>`;
    else tail = ` · ${esc(L('agora', 'now'))} <b>${esc(alMoney(q.p, f.ccy))}</b> (${esc(L('falta', 'needs'))} <b class="${d >= 0 ? 'up' : 'down'}">${esc(fmtPct(d, 2))}</b>)`;
  }
  return `${ico('bell-ring', 15)} ${esc(L('Avisar quando o', 'Notify when'))} <b>${sym}</b> ${esc(alCondTxt(a))}${f.rep ? ` · <b>${esc(L('toda vez', 'every time'))}</b>` : ''}${tail}`;
}
ACT.alCoin = () => openCoinPicker({ title: L('Moeda do alerta', 'Alert coin'), onPick: (c) => { const f = alForm(); f.coin = c; if (!c.s && c.cg) trackExtra(c.cg); f.val = ''; alDrawForm(); } });
ACT.seg_alc = (v) => { const f = alForm(); if (alIsPct(v) !== alIsPct(f.cond)) f.val = ''; f.cond = v; alDrawForm(); };
ACT.seg_alccy = (v) => { const f = alForm(); f.ccy = v; f.val = ''; alDrawForm(); };
ACT.seg_alrep = (v) => { alForm().rep = v === '1'; alDrawForm(); };
ACT.alVal = (i) => { alForm().val = i.value; setHTML('#al-sum', alSummary()); };
ACT.alNote = (i) => { alForm().note = i.value.slice(0, 120); };
ACT.alQuick = (b) => {
  const f = alForm(), k = +b.dataset.k;
  if (alIsPct(f.cond)) { f.val = decOut(k); }
  else { const q = alPx(f.coin, f.ccy); if (!q) return; const v = q.p * (1 + k / 100); const [, mx] = priceDigits(v); f.val = decOut(+v.toFixed(Math.min(mx, 8))); if (k > 0) f.cond = 'above'; if (k < 0) f.cond = 'below'; }
  alDrawForm();
};
ACT.alSave = async (b) => {
  if (!ACCOUNT.user) return ACT.signup();
  const f = alForm(), c = f.coin, v = parseDec(f.val);
  if (!isNum(v) || v <= 0) { toast(L('Digite o valor do alerta.', 'Type the alert value.'), { type: 'warn' }); $('#al-val') && $('#al-val').focus(); return; }
  if (alIsPct(f.cond) && v > 1000) { toast(L('Use uma porcentagem até 1.000%.', 'Use a percentage up to 1,000%.'), { type: 'warn' }); return; }
  const act = AL.pa.filter((a) => a.active).length;
  if (act >= AL_LIM()) { alLimitMsg(); return; }
  const q = alPx(c, f.ccy), a = { cond: f.cond, value: v, ccy: f.ccy };
  const d = alDist(a, q);
  if (isNum(d) && ((f.cond === 'above' && d <= 0) || (f.cond === 'below' && d >= 0) || (alIsPct(f.cond) && d <= 0))) {
    const ok = await confirmBox(L(`A condição já vale agora (${c.b} ${alCondTxt(a)}): o aviso chega no próximo minuto. Criar assim mesmo?`, `The condition is already true (${c.b} ${alCondTxt(a)}): the alert fires within a minute. Create anyway?`), { ok: L('Criar', 'Create') });
    if (!ok) return;
  }
  b.disabled = true;
  try {
    const sb = await sbClient();
    const row = { sym: String(c.b || 'X').replace(/[^A-Za-z0-9.$_-]/g, '').slice(0, 15) || 'X', name: String(c.n || '').slice(0, 60) || null, bn: c.s && /^[A-Z0-9]{2,20}$/.test(c.s) ? c.s : null, cg: c.cg && /^[a-z0-9._-]{1,80}$/.test(c.cg) ? c.cg : null, cond: f.cond, value: v, ccy: f.ccy, repeat: !!f.rep, note: String(f.note || '').trim().slice(0, 120) || null };
    if (!row.bn && !row.cg) throw new Error(L('Essa moeda não tem cotação para alerta.', 'This coin has no quote for alerts.'));
    const { error } = await sb.from('price_alerts').insert(row);
    if (error) { if (/limite|alert_limit/i.test(error.message + (error.hint || ''))) { alLimitMsg(); return; } throw new Error(error.message); }
    f.val = ''; f.note = '';
    toast(L(`Alerta criado: ${row.sym} ${alCondTxt(row)}.`, `Alert created: ${row.sym} ${alCondTxt(row)}.`), { type: 'ok' });
    if (!AL.dev.length) toast(L('Agora ative as notificações neste aparelho (botão no topo da página).', 'Now turn on notifications on this device (button at the top).'), { type: 'warn', ms: 7000 });
    await alLoad(true);
  } catch (e) { toast(String(e.message || e), { type: 'err' }); } finally { b.disabled = false; }
};
function alLimitMsg() {
  toast(hasPro() ? L('Limite de 30 alertas de preço ativos. Pause ou apague um antes.', 'Limit of 30 active price alerts. Pause or delete one first.')
    : L('No plano grátis são 3 alertas de preço ativos (no PRO, 30). Pause ou apague um, ou veja os planos.', 'The free plan has 3 active price alerts (PRO: 30). Pause or delete one, or see the plans.'), { type: 'warn', ms: 7000 });
}
ACT.alToggle = async (b) => {
  const a = AL.pa.find((x) => x.id === b.dataset.id); if (!a) return;
  if (!a.active && AL.pa.filter((x) => x.active).length >= AL_LIM()) { alLimitMsg(); return; }
  try {
    const sb = await sbClient(); const { error } = await sb.from('price_alerts').update({ active: !a.active }).eq('id', a.id);
    if (error) { if (/limite|alert_limit/i.test(error.message + (error.hint || ''))) { alLimitMsg(); return; } throw new Error(error.message); }
  } catch (e) { toast(String(e.message || e), { type: 'err' }); }
  alLoad(true);
};
ACT.alDel = async (b) => {
  const a = AL.pa.find((x) => x.id === b.dataset.id); if (!a) return;
  if (!(await confirmBox(L(`Apagar o alerta "${a.sym} ${alCondTxt(a)}"?`, `Delete the alert "${a.sym} ${alCondTxt(a)}"?`), { ok: L('Apagar', 'Delete'), danger: true }))) return;
  try { const sb = await sbClient(); const { error } = await sb.from('price_alerts').delete().eq('id', a.id); if (error) throw new Error(error.message); } catch (e) { toast(String(e.message || e), { type: 'err' }); }
  alLoad(true);
};

// ---------- avisos de eventos ----------
const alEvTitle = (e) => String(e.t || e.tEn || e.id).slice(0, 160);
function alEvDetail(e) {
  const bits = [];
  if (e.fc) bits.push(L(`previsão ${e.fc}`, `forecast ${e.fc}`));
  if (e.prev) bits.push(L(`anterior ${e.prev}`, `previous ${e.prev}`));
  if (e.src) bits.push(e.src);
  if (e.approx) bits.push(L('horário estimado', 'estimated time'));
  return bits.join(' · ').slice(0, 200) || null;
}
const alEvKey = (e) => String(e.id).slice(0, 160);
const alEvRegion = (e) => (e.country === 'CR' ? 'CR' : e.country);
const alEvOn = (id) => AL.ea.some((x) => x.ev_key === String(id).slice(0, 160) && !x.sent_at);
function alEvWant(P) {
  const now = Date.now(), until = now + 60 * 86400e3;
  if (!P || !P.auto) return [];
  return evAll().filter((e) => isNum(e.at) && e.at > now + P.lead * 60e3 && e.at < until && (e.imp || 1) >= P.imp && P.reg.includes(alEvRegion(e)) && !(P.skip || []).includes(alEvKey(e))).slice(0, 200);
}
// programa (e reprograma) os avisos automáticos: o que mudou entra, o que saiu do filtro sai
async function alSyncEvents(force) {
  if (!ACCOUNT.user || !AL.prefs) return;
  const k = 'al-sync:' + ACCOUNT.user.id;
  if (!force && Date.now() - (num(LS.get(k)) || 0) < 30 * 60e3) return;
  const P = AL.prefs, want = alEvWant(P);
  // o que a pessoa marcou no sino fica como está (não vira automático nem sai com os filtros)
  const manual = new Set(AL.ea.filter((x) => !x.auto).map((x) => x.ev_key + '|' + x.lead_min));
  const rows = want.map((e) => ({ ev_key: alEvKey(e), title: alEvTitle(e), detail: alEvDetail(e), at: new Date(e.at).toISOString(), lead_min: P.lead, auto: true })).filter((r) => !manual.has(r.ev_key + '|' + r.lead_min));
  const sb = await sbClient();
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await sb.from('event_alerts').upsert(rows.slice(i, i + 100), { onConflict: 'user_id,ev_key,lead_min' });
    if (error) throw new Error(error.message);
  }
  // só apaga quando as fontes de eventos responderam (senão um evento sumiria por falta de leitura)
  const ready = !P.auto || ['ibge', 'ffcal', 'deribit', 'mp-diff'].every((id) => CACHE.get(id) || (HEALTH[id] && HEALTH[id].err));
  if (ready) {
    const keep = new Set(rows.map((r) => r.ev_key + '|' + r.lead_min)), now = Date.now();
    const del = AL.ea.filter((x) => x.auto && !x.sent_at && Date.parse(x.at) > now && !keep.has(x.ev_key + '|' + x.lead_min)).map((x) => x.id);
    for (let i = 0; i < del.length; i += 100) await sb.from('event_alerts').delete().in('id', del.slice(i, i + 100));
  }
  LS.set(k, Date.now());
}
async function alResync() { try { await alSyncEvents(true); } catch (e) { toast(String(e.message || e), { type: 'err' }); } await alLoad(true); }
ACT.alAuto = async () => {
  if (!AL.prefs) return;
  try { await alSavePrefs({ auto: !AL.prefs.auto }); } catch (e) { toast(String(e.message || e), { type: 'err' }); return; }
  if (AL.prefs.auto && !AL.dev.length) toast(L('Ative também as notificações neste aparelho (botão no topo).', 'Also turn on notifications on this device (button at the top).'), { type: 'warn', ms: 6000 });
  alResync();
};
ACT.alReg = async (b) => {
  const r = b.dataset.r, cur = new Set(AL.prefs.reg);
  if (cur.has(r)) { if (cur.size === 1) return; cur.delete(r); } else cur.add(r);
  try { await alSavePrefs({ reg: [...cur] }); } catch (e) { toast(String(e.message || e), { type: 'err' }); return; }
  alResync();
};
ACT.seg_alimp = async (v) => { try { await alSavePrefs({ imp: +v }); } catch (e) { toast(String(e.message || e), { type: 'err' }); return; } alResync(); };
ACT.seg_allead = async (v) => { try { await alSavePrefs({ lead: +v }); } catch (e) { toast(String(e.message || e), { type: 'err' }); return; } alResync(); };
ACT.alEvDel = async (b) => {
  const x = AL.ea.find((y) => y.id === b.dataset.id); if (!x) return;
  try {
    if (x.auto) { const skip = [...new Set([...(AL.prefs.skip || []), x.ev_key])].slice(-60); await alSavePrefs({ skip }); }
    const sb = await sbClient(); const { error } = await sb.from('event_alerts').delete().eq('id', x.id); if (error) throw new Error(error.message);
  } catch (e) { toast(String(e.message || e), { type: 'err' }); }
  alLoad(true);
};
// sino nos eventos (página Eventos do mercado): marca ou desmarca o aviso daquele evento
ACT.alEv = async (b) => {
  const e = typeof evById === 'function' ? evById(b.dataset.id) : null; if (!e) return;
  if (!ACCOUNT.user) { toast(L('Entre na sua conta (grátis) para receber avisos no celular.', 'Sign in (free) to get alerts on your phone.'), { type: 'warn' }); return ACT.login(); }
  b.disabled = true;
  try {
    if (AL.st !== 'ok') await alLoad(true);
    const sb = await sbClient();
    const mine = AL.ea.filter((x) => x.ev_key === alEvKey(e) && !x.sent_at);
    if (mine.length) {
      const { error } = await sb.from('event_alerts').delete().in('id', mine.map((x) => x.id)); if (error) throw new Error(error.message);
      if (mine.some((x) => x.auto)) { const skip = [...new Set([...(AL.prefs.skip || []), alEvKey(e)])].slice(-60); await alSavePrefs({ skip }); }
      toast(L('Aviso deste evento removido.', 'Alert for this event removed.'), { type: 'ok' });
    } else {
      const lead = (AL.prefs && AL.prefs.lead) || 30;
      if (e.at - lead * 60e3 <= Date.now()) { toast(L('Falta menos que o tempo do aviso para esse evento.', 'This event starts sooner than the alert time.'), { type: 'warn' }); return; }
      const { error } = await sb.from('event_alerts').upsert([{ ev_key: alEvKey(e), title: alEvTitle(e), detail: alEvDetail(e), at: new Date(e.at).toISOString(), lead_min: lead, auto: false }], { onConflict: 'user_id,ev_key,lead_min' });
      if (error) throw new Error(error.message);
      if (AL.prefs && (AL.prefs.skip || []).includes(alEvKey(e))) await alSavePrefs({ skip: AL.prefs.skip.filter((s) => s !== alEvKey(e)) });
      toast(L(`Aviso marcado para ${fmtDate(e.at - lead * 60e3, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} (${AL_LEADS().find((x) => x[0] === lead)[1]}).`, `Alert set for ${fmtDate(e.at - lead * 60e3, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`), { type: 'ok', ms: 5000 });
      if (!AL.dev.length) toast(L('Para chegar no celular, ative as notificações na página Alertas.', 'To reach your phone, turn on notifications on the Alerts page.'), { type: 'warn', ms: 7000 });
    }
    await alLoad(true);
    // botão da janela de detalhes (fora da lista): mostra o estado novo
    if (b.classList.contains('al-hbell') && document.contains(b)) {
      const on = alEvOn(e.id); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      b.innerHTML = `${ico(on ? 'bell-ring' : 'bell-plus', 16)}${esc(on ? L('Aviso marcado', 'Alert set') : L('Avisar no celular', 'Notify my phone'))}`;
    }
  } catch (err) { toast(String(err.message || err), { type: 'err' }); } finally { b.disabled = false; }
};
const alBell = (e, cls = '') => `<button class="al-bell ${cls}${ACCOUNT.user && alEvOn(e.id) ? ' on' : ''}" data-act="alEv" data-id="${esc(e.id)}" title="${esc(ACCOUNT.user && alEvOn(e.id) ? L('Aviso marcado: tocar para tirar', 'Alert set: tap to remove') : L('Avisar no celular antes deste evento', 'Notify my phone before this event'))}" aria-pressed="${ACCOUNT.user && alEvOn(e.id) ? 'true' : 'false'}">${ico(ACCOUNT.user && alEvOn(e.id) ? 'bell-ring' : 'bell-plus', 16)}</button>`;
ACT.alLogClear = async () => {
  if (!(await confirmBox(L('Apagar o histórico de notificações?', 'Clear the notification history?'), { ok: L('Apagar', 'Clear'), danger: true }))) return;
  try { const sb = await sbClient(); await sb.from('alert_log').delete().gte('at', '2000-01-01'); } catch { /* */ }
  alLoad(true);
};
ACT.alNew = (b) => { location.hash = '#/alerts' + (b.dataset.s ? '?s=' + encodeURIComponent(b.dataset.s) : ''); };

// ---------- tela ----------
function alHtml() {
  if (!ACCOUNT.user) {
    return `<div class="panel hero al-hero">${emptyBox('bell-ring', L('Alertas no celular', 'Alerts on your phone'), esc(L('Receba uma notificação quando uma moeda chegar no preço que você quer e antes dos eventos que mexem com o mercado (Fed, Copom, inflação, emprego, vencimento de opções). Grátis com a sua conta.', 'Get a notification when a coin hits your price and before the events that move markets (Fed, Copom, inflation, jobs, option expiries). Free with your account.')),
      `<div class="row wrap" style="justify-content:center"><button class="btn pri" data-act="signup">${ico('user', 17)}${esc(L('Criar conta grátis', 'Create free account'))}</button><button class="btn" data-act="login">${ico('log-in', 17)}${esc(L('Já tenho conta', 'I have an account'))}</button></div>`)}
      <ul class="al-feat"><li>${ico('trending-up', 16)}${esc(L('Preço acima ou abaixo de um valor, em US$ ou R$', 'Price above or below a value, in US$ or R$'))}</li><li>${ico('percent', 16)}${esc(L('Alta ou queda forte em 24 horas', 'Big rise or drop in 24 hours'))}</li><li>${ico('calendar-clock', 16)}${esc(L('Aviso antes dos eventos importantes, do jeito que você escolher', 'A heads-up before key events, your way'))}</li><li>${ico('smartphone', 16)}${esc(L('Chega no celular e no computador, mesmo com o site fechado', 'Arrives on phone and computer, even with the site closed'))}</li></ul></div>`;
  }
  return `<section class="panel al-dev" id="al-dev"></section>
    <div class="grid g-2 al-top">
      <section class="panel" id="al-new"></section>
      <section class="panel" id="al-ev"></section>
    </div>
    <section class="panel" id="al-list"></section>
    <section class="panel" id="al-log"></section>`;
}
function alDraw() {
  if (S.page !== 'alerts' || !ACCOUNT.user) return;
  alDrawDev(); alDrawForm(); alDrawList(); alDrawEv(); alDrawLog();
}
function alDrawDev() {
  const box = $('#al-dev'); if (!box) return;
  const env = alEnv(), me = alThisDev(), n = AL.dev.length;
  let st, txt, btns = '';
  if (AL.st === 'loading' && !AL.at) { box.innerHTML = panelHead('smartphone', L('Notificações neste aparelho', 'Notifications on this device')) + skel(2); return; }
  if (env === 'ios') {
    st = `<span class="badge warn">${esc(L('instale o app', 'install the app'))}</span>`;
    txt = L('No iPhone e no iPad, as notificações funcionam no app instalado: no Safari, toque em Compartilhar → "Adicionar à Tela de Início". Depois abra o NEXUS HUB pelo ícone e ative aqui.', 'On iPhone and iPad, notifications work in the installed app: in Safari tap Share → "Add to Home Screen". Then open NEXUS HUB from the icon and turn them on here.');
    btns = `<button class="btn pri" data-act="go" data-to="app">${ico('download', 16)}${esc(L('Como instalar', 'How to install'))}</button>`;
  } else if (env === 'none') {
    st = `<span class="badge">${esc(L('não disponível', 'not available'))}</span>`;
    txt = L('Este navegador não recebe notificações. Use o Chrome, o Edge ou o Firefox (Android e computador) ou o app instalado no iPhone.', 'This browser does not support notifications. Use Chrome, Edge or Firefox (Android and computer) or the installed app on iPhone.');
  } else if (env === 'denied') {
    st = `<span class="badge bad">${esc(L('bloqueadas', 'blocked'))}</span>`;
    txt = L('As notificações deste site estão bloqueadas. Toque no cadeado ao lado do endereço → Notificações → Permitir, e volte aqui.', 'Notifications are blocked for this site. Tap the lock next to the address → Notifications → Allow, then come back.');
  } else if (me) {
    st = `<span class="badge live">${esc(L('ativas', 'on'))}</span>`;
    txt = L('Este aparelho recebe seus alertas, mesmo com o site fechado.', 'This device gets your alerts, even with the site closed.');
    btns = `<button class="btn" data-act="alTest">${ico('send', 16)}${esc(L('Enviar teste', 'Send test'))}</button><button class="btn ghost" data-act="alOff">${ico('bell-off', 16)}${esc(L('Desativar neste aparelho', 'Turn off on this device'))}</button>`;
  } else {
    st = `<span class="badge">${esc(L('desligadas', 'off'))}</span>`;
    txt = L('Ative para receber os alertas de preço e os avisos de eventos neste aparelho. O navegador vai pedir sua permissão.', 'Turn on to get price alerts and event heads-ups on this device. The browser will ask for permission.');
    btns = `<button class="btn pri" data-act="alOn" ${AL.busy ? 'disabled' : ''}>${AL.busy ? '<span class="spinner"></span>' : ico('bell-ring', 17)}${esc(L('Ativar notificações neste aparelho', 'Turn on notifications on this device'))}</button>${n ? `<button class="btn" data-act="alTest">${ico('send', 16)}${esc(L('Testar nos outros', 'Test on the others'))}</button>` : ''}`;
  }
  const devs = n ? `<ul class="al-devs">${AL.dev.map((d) => `<li class="${AL.sub && d.endpoint === AL.sub.endpoint ? 'me' : ''}">${ico(/Android|iPhone|iPad/.test(d.label || '') ? 'smartphone' : 'laptop', 16)}<span class="nm">${esc(d.label || L('Aparelho', 'Device'))}${AL.sub && d.endpoint === AL.sub.endpoint ? ` <b class="small">${esc(L('· este', '· this one'))}</b>` : ''}</span><span class="small faint">${d.last_ok_at ? esc(L('último envio ', 'last sent ')) + esc(ago(Date.parse(d.last_ok_at))) : esc(L('ativado ', 'added ')) + esc(fmtDate(d.created_at, { day: '2-digit', month: '2-digit', year: '2-digit' }))}${d.fails ? ` · <span class="down">${esc(L(`${d.fails} falha(s)`, `${d.fails} failure(s)`))}</span>` : ''}</span><button class="icon-btn xs" data-act="alDevDel" data-id="${esc(d.id)}" title="${esc(L('Remover este aparelho', 'Remove this device'))}" aria-label="${esc(L('Remover', 'Remove'))}">${ico('trash-2', 15)}</button></li>`).join('')}</ul>` : '';
  box.innerHTML = `${panelHead('smartphone', L('Notificações neste aparelho', 'Notifications on this device'), { right: st })}
    <div class="al-dev-b"><p class="al-dev-t">${esc(txt)}</p><div class="row wrap al-dev-btns">${btns}</div></div>
    ${devs ? `<div class="al-devs-h small faint">${esc(L(`Aparelhos que recebem (${n})`, `Devices that receive (${n})`))}</div>${devs}` : ''}
    ${AL.st === 'err' ? `<p class="small down" style="padding:0 18px 12px">${esc(L('Não foi possível carregar seus alertas: ', 'Could not load your alerts: '))}${esc(AL.err)} <button class="link-btn" data-act="alRetry">${esc(L('tentar de novo', 'try again'))}</button></p>` : ''}`;
}
ACT.alRetry = () => alLoad(true);
function alDrawForm() {
  const box = $('#al-new'); if (!box) return;
  const f = alForm(), c = f.coin, q = alPx(c, f.ccy), pct = alIsPct(f.cond);
  const act = AL.pa.filter((a) => a.active).length, lim = AL_LIM();
  const chips = pct ? [3, 5, 10, 20].map((k) => `<button class="chip" data-act="alQuick" data-k="${k}">${k}%</button>`).join('')
    : [-10, -5, 5, 10].map((k) => `<button class="chip ${k > 0 ? 'up' : 'down'}" data-act="alQuick" data-k="${k}" ${q ? '' : 'disabled'}>${k > 0 ? '+' : '−'}${Math.abs(k)}%</button>`).join('');
  box.innerHTML = `${panelHead('bell-plus', L('Novo alerta de preço', 'New price alert'), { right: `<span class="badge ${act >= lim ? 'warn' : ''}" title="${esc(L('Alertas de preço ativos', 'Active price alerts'))}">${act}/${lim}</span>` })}
    <div class="al-form">
      <div class="fld"><label>${esc(L('Moeda', 'Coin'))}</label><button class="al-coin" data-act="alCoin" aria-label="${esc(L('Trocar a moeda', 'Change coin'))}">${coinLogo(c, 28)}<span class="nm"><b>${esc(c.n || c.b)}</b><span class="small faint">${esc(c.b)}${q ? ' · ' + esc(alMoney(q.p, f.ccy)) : ''}</span></span><span class="al-swap">${esc(L('trocar', 'change'))}${ico('chevron-down', 15)}</span></button></div>
      <div class="fld"><label>${esc(L('Avisar quando', 'Notify when'))}</label>${seg('alc', AL_COND().map(([v, t, i]) => [v, t, i]), f.cond, 'al-cond')}</div>
      <div class="fld"><label for="al-val">${esc(pct ? L('Variação em 24 h (%)', '24h change (%)') : L('Preço-alvo', 'Target price'))}</label>
        <div class="al-valrow"><input class="inp" id="al-val" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-inp="alVal" placeholder="${esc(pct ? L('ex.: 5', 'e.g. 5') : q ? decOut(+(q.p * 1.05).toPrecision(4)) : '')}" value="${esc(f.val)}">${pct ? '<span class="al-suf">%</span>' : seg('alccy', [['usd', 'US$'], ['brl', 'R$']], f.ccy, 'sm')}</div>
        <div class="al-chips">${chips}</div></div>
      <div class="fld"><label>${esc(L('Quantas vezes', 'How often'))}</label>${seg('alrep', [['0', L('Uma vez', 'Once')], ['1', L('Toda vez que cruzar', 'Every time it crosses')]], f.rep ? '1' : '0', 'sm')}</div>
      <div class="fld"><label for="al-note">${esc(L('Anotação (opcional)', 'Note (optional)'))}</label><input class="inp" id="al-note" maxlength="120" data-inp="alNote" placeholder="${esc(L('ex.: realizar parte do lucro', 'e.g. take some profit'))}" value="${esc(f.note)}"></div>
      <p class="al-sum" id="al-sum">${alSummary()}</p>
      <div class="row wrap"><button class="btn pri" data-act="alSave">${ico('bell-plus', 17)}${esc(L('Criar alerta', 'Create alert'))}</button><span class="small faint">${esc(hasPro() ? L(`Até ${lim} alertas de preço ativos.`, `Up to ${lim} active price alerts.`) : L('Plano grátis: 3 alertas ativos · PRO: 30.', 'Free plan: 3 active alerts · PRO: 30.'))}</span></div>
    </div>`;
}
function alDrawList() {
  const box = $('#al-list'); if (!box) return;
  const list = AL.pa;
  const head = panelHead('list-checks', L('Seus alertas de preço', 'Your price alerts'), { sub: esc(L('O servidor confere a cada minuto (Binance; moedas fora dela, CoinGecko) e avisa todos os seus aparelhos.', 'The server checks every minute (Binance; other coins, CoinGecko) and notifies all your devices.')) });
  if (AL.st !== 'ok' && !AL.at) { box.innerHTML = head + `<div style="padding:0 18px 16px">${skel(3)}</div>`; return; }
  if (!list.length) { box.innerHTML = head + emptyBox('bell-plus', L('Nenhum alerta de preço ainda', 'No price alerts yet'), esc(L('Crie o primeiro no quadro "Novo alerta de preço". Também dá para criar pelo menu Gráfico e pelos cartões do Dashboard.', 'Create the first one in "New price alert". You can also start from the Chart page or the Dashboard cards.'))); return; }
  const rows = list.map((a) => {
    const q = alPx({ s: a.bn, cg: a.cg }, a.ccy), d = alDist(a, q), pct = alIsPct(a.cond);
    const st = !a.active ? (a.fired_at ? `<span class="badge">${esc(L('disparou', 'fired'))} ${esc(fmtDate(a.fired_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</span>` : `<span class="badge">${esc(L('pausado', 'paused'))}</span>`)
      : !a.armed ? `<span class="badge warn" title="${esc(L('Disparou e espera o preço voltar para avisar de novo', 'Fired and waits for the price to come back before notifying again'))}">${esc(L('aguardando voltar', 'waiting to reset'))}</span>` : `<span class="badge live">${esc(L('ativo', 'active'))}</span>`;
    const now = q ? (pct ? `<span class="${q.chg >= 0 ? 'up' : 'down'}">${esc(fmtPct(q.chg, 2))}</span>` : esc(alMoney(q.p, a.ccy))) : '—';
    const dist = isNum(d) && a.active ? `<div class="al-dist ${pct ? (a.cond === 'up24' ? 'up' : 'down') : d >= 0 ? 'up' : 'down'}"><i style="width:${Math.min(100, Math.abs(d) * (pct ? 5 : 4)).toFixed(0)}%"></i><span>${esc(pct ? (d > 0 ? L(`faltam ${fmtNum(d, 1, 1)} p.p.`, `${fmtNum(d, 1, 1)} pts to go`) : L('já vale', 'reached')) : fmtPct(d, 2))}</span></div>` : '<span class="faint">—</span>';
    const coin = BY_SYM[a.bn] || BY_CG[a.cg] || { b: a.sym, cg: a.cg };
    return `<tr class="${a.active ? '' : 'off'}"><td><div class="al-cn">${coinLogo({ ...coin, b: a.sym }, 24)}<span><b>${esc(a.sym)}</b>${a.note ? `<span class="small faint">${esc(a.note)}</span>` : a.name ? `<span class="small faint">${esc(a.name)}</span>` : ''}</span></div></td>
      <td>${ico(AL_COND().find((x) => x[0] === a.cond)[2], 14)} ${esc(alCondTxt(a))}${a.repeat ? ` <span class="badge" title="${esc(L('Avisa toda vez que cruzar', 'Notifies every time it crosses'))}">${ico('repeat', 12)}</span>` : ''}</td>
      <td class="r">${now}</td><td>${dist}</td><td>${st}${a.fired_n > 0 && a.active ? `<span class="small faint"> · ${esc(L(`${a.fired_n}× disparado`, `fired ${a.fired_n}×`))}</span>` : ''}</td>
      <td class="r al-acts"><button class="icon-btn xs" data-act="alToggle" data-id="${esc(a.id)}" title="${esc(a.active ? L('Pausar', 'Pause') : L('Reativar', 'Resume'))}" aria-label="${esc(a.active ? L('Pausar', 'Pause') : L('Reativar', 'Resume'))}">${ico(a.active ? 'circle-pause' : 'circle-play', 17)}</button><button class="icon-btn xs" data-act="alDel" data-id="${esc(a.id)}" title="${esc(L('Apagar', 'Delete'))}" aria-label="${esc(L('Apagar', 'Delete'))}">${ico('trash-2', 16)}</button></td></tr>`;
  }).join('');
  box.innerHTML = head + `<div class="tbl-wrap"><table class="tbl al-tb"><thead><tr><th>${esc(L('Moeda', 'Coin'))}</th><th>${esc(L('Condição', 'Condition'))}</th><th class="r">${esc(L('Agora', 'Now'))}</th><th>${esc(L('Distância', 'Distance'))}</th><th>${esc(L('Situação', 'Status'))}</th><th class="r"></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function alDrawEv() {
  const box = $('#al-ev'); if (!box) return;
  const P = AL.prefs || alDefPrefs(), now = Date.now();
  const next = AL.ea.filter((x) => !x.sent_at && Date.parse(x.at) > now).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const lead = AL_LEADS().find((x) => x[0] === P.lead) || AL_LEADS()[1];
  const list = next.slice(0, 8).map((x) => {
    const at = Date.parse(x.at), when = at - x.lead_min * 60e3;
    return `<li><span class="al-evd"><b>${esc(fmtDate(at, { day: '2-digit', month: '2-digit' }))}</b><span class="small faint">${esc(fmtDate(at, { hour: '2-digit', minute: '2-digit' }))}</span></span><span class="al-evt">${esc(x.title)}<span class="small faint">${ico('bell', 12)} ${esc(fmtDate(when, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}${x.auto ? ' · ' + esc(L('automático', 'automatic')) : ''}</span></span><button class="icon-btn xs" data-act="alEvDel" data-id="${esc(x.id)}" title="${esc(x.auto ? L('Pular este evento', 'Skip this event') : L('Tirar o aviso', 'Remove alert'))}" aria-label="${esc(L('Tirar', 'Remove'))}">${ico('x', 15)}</button></li>`;
  }).join('');
  box.innerHTML = `${panelHead('calendar-clock', L('Avisos de eventos', 'Event alerts'), { right: `<button class="al-sw ${P.auto ? 'on' : ''}" data-act="alAuto" role="switch" aria-checked="${P.auto}" title="${esc(L('Avisar dos eventos importantes automaticamente', 'Alert me about key events automatically'))}"><i></i></button>` })}
    <div class="al-evb">
      <p class="small" style="margin:0 0 10px">${esc(P.auto ? L('Ligado: avisamos dos eventos que mexem com o mercado, do jeito abaixo.', 'On: we alert you about the market-moving events below.') : L('Desligado. Ligue para receber aviso dos eventos importantes (Fed, Copom, CPI, payroll, IPCA, opções…), ou toque no sino de um evento na página Eventos do mercado.', 'Off. Turn on to get alerts for key events (Fed, Copom, CPI, payroll, options…), or tap the bell on an event in Market events.'))}</p>
      <div class="al-evopts">
        <div class="row wrap" style="gap:6px">${AL_REG().map(([r, t]) => `<button class="chip ${P.reg.includes(r) ? 'on' : ''}" data-act="alReg" data-r="${r}" aria-pressed="${P.reg.includes(r)}">${esc(t)}</button>`).join('')}</div>
        ${seg('alimp', [['3', L('Só alto impacto', 'High impact only')], ['2', L('Médio e alto', 'Medium and high')]], String(P.imp), 'sm')}
        ${seg('allead', AL_LEADS().map(([v, t]) => [String(v), t]), String(P.lead), 'sm')}
      </div>
      <div class="al-evh small faint">${esc(next.length ? L(`Próximos avisos (${next.length})`, `Next alerts (${next.length})`) : L('Nenhum aviso programado.', 'No alerts scheduled.'))}${next.length ? '' : ` <a href="#/events" class="link-btn">${esc(L('Ver eventos', 'See events'))}</a>`}</div>
      ${list ? `<ul class="al-evl">${list}</ul>` : ''}
      ${note(esc(L(`Aviso ${lead[1]} de cada evento, no horário de Brasília do seu aparelho. Os avisos automáticos são programados para os próximos 60 dias sempre que você abre o NEXUS (e a gente lembra você quando estiverem acabando).`, `Alert ${lead[1]} each event. Automatic alerts are scheduled for the next 60 days whenever you open NEXUS (we remind you when they run out).`)))}
    </div>`;
}
function alDrawLog() {
  const box = $('#al-log'); if (!box) return;
  const icon = { price: 'trending-up', event: 'calendar-clock', test: 'send', info: 'info' };
  const right = AL.log.length ? `<button class="btn xs ghost" data-act="alLogClear">${ico('eraser', 14)}${esc(L('Limpar', 'Clear'))}</button>` : '';
  const rows = AL.log.map((x) => `<li class="k-${esc(x.kind)}">${ico(icon[x.kind] || 'bell', 16)}<div><b>${esc(x.title)}</b>${x.body ? `<span class="small">${esc(x.body)}</span>` : ''}<span class="small faint">${esc(fmtDate(x.at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))} · ${x.sent ? esc(L(`entregue em ${x.sent} aparelho${x.sent > 1 ? 's' : ''}`, `delivered to ${x.sent} device${x.sent > 1 ? 's' : ''}`)) : `<span class="down">${esc(L('não entregue (nenhum aparelho ativo)', 'not delivered (no active device)'))}</span>`}</span></div></li>`).join('');
  box.innerHTML = panelHead('history', L('Histórico de notificações', 'Notification history'), { right }) + (rows ? `<ul class="al-log">${rows}</ul>` : `<div style="padding:0 18px 16px" class="small faint">${esc(L('As notificações enviadas aparecem aqui.', 'Sent notifications show up here.'))}</div>`);
}

// preços ao vivo: atualiza "Agora" e a distância (no máximo a cada 4 s); eventos novos: reprograma os avisos
onPrice((set) => {
  if (S.page !== 'alerts' || !ACCOUNT.user) return;
  if (set && set.has && set.has('EVENTS') && AL.prefs && AL.prefs.auto) alSyncEvents().then(() => alLoad(true)).catch(() => {});
  if (Date.now() - AL.drawT < 4000) return;
  AL.drawT = Date.now(); alDrawList(); setHTML('#al-sum', alSummary());
});
// o service worker pede para abrir uma tela (toque na notificação com o app aberto)
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { const d = e.data || {}; if (d.type === 'nx-open' && typeof d.hash === 'string' && d.hash.startsWith('#/')) location.hash = d.hash; });
// conta trocou: estado novo; entrou com avisos automáticos ligados e faz tempo que não programa → reprograma
onAccount(() => {
  if (!ACCOUNT.user) { AL = alNew(); return; }
  if (AL.uid && AL.uid !== ACCOUNT.user.id) AL = alNew();
  if (LS.get('al-ep')) setTimeout(() => alHeal().then((ok) => { if (ok && S.page === 'alerts') alLoad(true); }), 6000);
  const k = 'al-sync:' + ACCOUNT.user.id;
  if (Date.now() - (num(LS.get(k)) || 0) < 2 * 86400e3) return;
  setTimeout(async () => {
    try {
      await alLoad(true);
      if (!AL.prefs || !AL.prefs.auto) { LS.set(k, Date.now()); return; }
      await Promise.all(['ibge', 'ffcal', 'deribit', 'mp-diff'].map((id) => (SRC[id] ? runSource(id, { force: true }).catch(() => {}) : null)));
      await alSyncEvents(true);
    } catch (e) { console.warn('[NX] alertas: programar eventos', e); }
  }, 8000);
});

page({
  id: 'alerts', group: 'conta', icon: 'bell-ring', pt: 'Alertas', en: 'Alerts', acct: true,
  sub: 'Notificação no celular quando uma moeda chega no preço que você quer e antes dos eventos que mexem com o mercado.',
  subEn: 'A phone notification when a coin hits your price and before market-moving events.',
  init(el) { el.innerHTML = alHtml(); },
  show(el, params) {
    if (!ACCOUNT.user) return;
    if (params && params.s) { const f = alForm(); f.coin = alCoinDefault(params.s); if (!f.coin.s && f.coin.cg) trackExtra(f.coin.cg); f.val = ''; }
    alDraw();
    alLoad().then(() => setTimeout(() => { alSyncEvents().then(() => alLoad(true)).catch((e) => console.warn('[NX] alertas', e)); }, 5000));
  },
});
