// =====================================================================
// Conta (Supabase): entrar, criar conta, sair, plano/teste, troca de senha,
// exclusão de conta (LGPD). O plano e a validade são decididos SÓ no servidor;
// aqui é apenas exibição. A chave no código é a publicável (pode ser pública).
// =====================================================================
const ACCOUNT = { state: 'guest', user: null, profile: null, admin: false, pro: false, skew: 0, err: '' };
const AUTH_KEY = 'nx3-auth';
const _acctSubs = new Set();
function onAccount(fn) { _acctSubs.add(fn); return () => _acctSubs.delete(fn); }
function hasStoredSession() { try { return !!localStorage.getItem(AUTH_KEY); } catch { return false; } }
let _sbp = null;
function sbClient() {
  if (_sbp) return _sbp;
  _sbp = loadScript(LIBS.sb).then((lib) => {
    const c = lib.createClient(NX.supabaseUrl, NX.supabaseKey, {
      auth: { storageKey: AUTH_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    // não chamar o Supabase dentro do callback (trava a fila interna): agenda para depois
    c.auth.onAuthStateChange((ev, session) => { setTimeout(() => accountSync(session, ev), 0); });
    return c;
  }).catch((e) => { _sbp = null; throw e; });
  return _sbp;
}
let _syncSeq = 0;
async function accountSync(session, ev) {
  const seq = ++_syncSeq;
  const prevUid = ACCOUNT.user && ACCOUNT.user.id;
  if (!session || !session.user) {
    Object.assign(ACCOUNT, { state: 'guest', user: null, profile: null, admin: false, pro: false, err: '' });
    if (prevUid || ev === 'SIGNED_OUT') _accountChanged();
    else { renderAccountChip(); }
    return;
  }
  if (ev === 'TOKEN_REFRESHED' && prevUid === session.user.id && ACCOUNT.profile) { ACCOUNT.user = session.user; return; }
  ACCOUNT.user = session.user;
  if (ACCOUNT.state !== 'user') ACCOUNT.state = 'loading';
  renderAccountChip();
  await loadProfile(seq);
}
async function loadProfile(seq = ++_syncSeq) {
  try {
    const sb = await sbClient();
    const { data, error } = await sb.rpc('my_profile');
    if (seq !== _syncSeq) return;
    if (error) throw error;
    if (!data) throw new Error(L('perfil não encontrado', 'profile not found'));
    const st = Date.parse(data.server_time);
    Object.assign(ACCOUNT, { state: 'user', profile: data, admin: !!data.admin, pro: !!data.pro, skew: isNum(st) ? st - Date.now() : 0, err: '' });
    // "visto por último": no máximo 1 vez por dia
    const k = 'seen:' + data.id;
    if (LS.get(k) !== todayISO()) { LS.set(k, todayISO()); sb.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', data.id).then(() => {}, () => {}); }
  } catch (e) {
    if (seq !== _syncSeq) return;
    Object.assign(ACCOUNT, { state: 'user', profile: null, admin: false, pro: false, err: String((e && e.message) || e) });
  }
  _accountChanged();
}
function _accountChanged() {
  renderAccountChip();
  buildSidebar();
  // páginas que dependem da conta são refeitas
  for (const id of PAGE_ORDER) {
    const p = PAGES[id]; if (!p.pro && !p.acct && !p.admin) continue;
    const el = $('#pg-' + id); if (!el) continue;
    if (id === S.page) { el.dataset.ready = ''; el.innerHTML = ''; } else el.remove();
  }
  if (S.page && (PAGES[S.page].pro || PAGES[S.page].acct || PAGES[S.page].admin)) { const cur = S.page; S.page = null; showPage(cur, { ..._pageParams, keep: 1 }); }
  _acctSubs.forEach((fn) => { try { fn(ACCOUNT); } catch (e) { console.warn('[NX] onAccount', e); } });
}

// ---------- plano ----------
function planInfo() {
  if (!ACCOUNT.user) return { k: 'guest', pro: false, label: L('Visitante', 'Guest') };
  const p = ACCOUNT.profile;
  if (!p) return { k: 'loading', pro: false, label: ACCOUNT.err ? L('Não foi possível ler seu plano', 'Could not read your plan') : L('Carregando…', 'Loading…') };
  if (p.plan === 'admin' || p.plan === 'master') return { k: 'master', pro: true, label: L('Administrador · vitalício', 'Admin · lifetime') };
  if (!p.active) return { k: 'blocked', pro: false, label: L('Conta desativada', 'Account disabled') };
  const exp = Date.parse(p.plan_expiry), now = Date.now() + ACCOUNT.skew;
  const days = Math.max(0, Math.ceil((exp - now) / 86400e3));
  if (exp > now) {
    if (p.plan === 'pro') return { k: 'pro', pro: true, days, exp, label: L(`PRO até ${fmtDate(exp)}`, `PRO until ${fmtDate(exp)}`) };
    if (p.plan === 'trial') return { k: 'trial', pro: true, days, exp, label: L(`Teste grátis · ${days} ${days === 1 ? 'dia' : 'dias'}`, `Free trial · ${days} day${days === 1 ? '' : 's'}`) };
  }
  return { k: 'expired', pro: false, exp, label: p.plan === 'pro' ? L('PRO vencido', 'PRO expired') : p.plan === 'trial' ? L('Teste encerrado', 'Trial ended') : L('Plano gratuito', 'Free plan') };
}
const hasPro = () => planInfo().pro;
function planBadge() {
  const i = planInfo();
  const cls = { master: 'pro', pro: 'pro', trial: 'live', expired: 'warn', blocked: 'bad' }[i.k] || '';
  return `<span class="badge ${cls}">${esc(i.label)}</span>`;
}
// bloqueio das páginas PRO (só interface: os dados do Vault são protegidos no servidor)
function proGate(p) {
  const i = planInfo();
  const feat = L(p.proWhat || 'esta ferramenta', p.proWhatEn || 'this tool');
  let title, text, btns;
  if (i.k === 'guest') {
    title = L('Teste grátis por 15 dias', '15-day free trial');
    text = L(`Crie sua conta (leva 30 segundos) e use ${feat} e todo o PRO por 15 dias, sem cartão.`, `Create your account (30 seconds) and use ${feat} and all PRO features for 15 days, no card needed.`);
    btns = `<button class="btn pri" data-act="signup">${ico('user', 17)}${esc(L('Criar conta grátis', 'Create free account'))}</button><button class="btn" data-act="login">${ico('log-in', 17)}${esc(L('Já tenho conta', 'I have an account'))}</button>`;
  } else if (i.k === 'loading') {
    return `<div class="panel">${ACCOUNT.err ? emptyBox('wifi-off', L('Não foi possível confirmar seu plano', 'Could not confirm your plan'), esc(ACCOUNT.err), `<button class="btn sm" data-act="acctRetry">${ico('refresh-cw', 16)}${esc(L('Tentar de novo', 'Try again'))}</button>`) : skel(4, 18)}</div>`;
  } else if (i.k === 'blocked') {
    title = L('Conta desativada', 'Account disabled');
    text = L('Esta conta foi desativada. Fale com o suporte para reativar.', 'This account is disabled. Contact support to reactivate it.');
    btns = '';
  } else {
    title = i.label;
    text = L(`Para continuar usando ${feat}, escolha um plano PRO. Seus dados continuam salvos.`, `To keep using ${feat}, pick a PRO plan. Your data stays saved.`);
    btns = `<button class="btn pri" data-act="go" data-to="plans">${ico('crown', 17)}${esc(L('Ver planos', 'See plans'))}</button>`;
  }
  return `<div class="panel hero"><div class="empty">${ico('lock', 32)}<b>${esc(title)}</b><p>${esc(text)}</p><div class="row wrap" style="justify-content:center">${btns}</div></div></div>`;
}
ACT.acctRetry = () => loadProfile();

// ---------- cabeçalho: botão da conta ----------
function renderAccountChip() {
  const box = $('#acct'); if (!box) return;
  if (ACCOUNT.state === 'guest') {
    box.innerHTML = `<button class="acct-btn guest" data-act="login">${ico('log-in', 17)}<span class="nm">${esc(L('Entrar', 'Sign in'))}</span></button>`;
    return;
  }
  const name = (ACCOUNT.profile && ACCOUNT.profile.name) || (ACCOUNT.user && ACCOUNT.user.email) || '…';
  const ini = esc((name.trim()[0] || '?').toUpperCase());
  box.innerHTML = `<button class="acct-btn" data-act="menu" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(L('Sua conta', 'Your account'))}"><span class="av">${ACCOUNT.state === 'loading' ? '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span>' : ini}</span><span class="nm">${esc(name)}</span></button><div class="menu" data-build="account" role="menu"></div>`;
}
function accountMenuHtml() {
  const u = ACCOUNT.user; if (!u) return '';
  const i = planInfo();
  return `<div class="menu-h"><div class="b" style="color:var(--text);font-size:14px;overflow:hidden;text-overflow:ellipsis">${esc((ACCOUNT.profile && ACCOUNT.profile.name) || u.email)}</div><div class="tiny">${esc(u.email)}</div><div style="margin-top:6px">${planBadge()}</div></div>
    <div class="menu-sep"></div>
    <a class="menu-i" href="#/vault" role="menuitem">${ico('wallet', 17)}Portfolio Vault</a>
    ${i.k === 'master' ? '' : `<a class="menu-i" href="#/plans" role="menuitem">${ico('crown', 17)}${esc(L('Planos e pagamento', 'Plans & billing'))}</a>`}
    <a class="menu-i" href="#/settings" role="menuitem">${ico('settings', 17)}${esc(L('Configurações', 'Settings'))}</a>
    ${ACCOUNT.admin ? `<a class="menu-i" href="#/admin" role="menuitem">${ico('shield-check', 17)}${esc(L('Painel do administrador', 'Admin panel'))}</a>` : ''}
    <div class="menu-sep"></div>
    <button class="menu-i" data-act="logout" role="menuitem">${ico('log-out', 17)}${esc(L('Sair', 'Sign out'))}</button>`;
}
document.addEventListener('click', (e) => { if (e.target.closest('.menu a.menu-i')) closeMenus(); });

// ---------- entrar / criar conta ----------
const AUTH_ERR = {
  invalid: ['E-mail ou senha incorretos.', 'Wrong e-mail or password.'],
  exists: ['Este e-mail já tem conta. Use "Entrar".', 'This e-mail already has an account. Use "Sign in".'],
  password: ['A senha precisa ter de 8 a 72 caracteres, com letras e números.', 'Password must be 8–72 characters with letters and numbers.'],
  email: ['Confira o e-mail digitado.', 'Check the e-mail address.'],
  rate: ['Muitas tentativas a partir desta rede. Tente de novo em 1 hora.', 'Too many attempts from this network. Try again in 1 hour.'],
  busy: ['Cadastros limitados no momento. Tente mais tarde.', 'Sign-ups are limited right now. Try later.'],
  net: ['Sem conexão com o servidor de contas. Confira a internet e tente de novo.', 'Could not reach the account server. Check your connection and retry.'],
  terms: ['Para criar a conta, aceite os Termos e a Política de Privacidade.', 'To create an account, accept the Terms and Privacy Policy.'],
  name: ['Digite como quer ser chamado (até 80 letras).', 'Enter your name (up to 80 characters).'],
};
const authErr = (k) => L(...(AUTH_ERR[k] || [k, k]));
function authModal(mode = 'login') {
  const body = `<div class="stack" style="gap:14px">
    ${seg('auth', [['login', L('Entrar', 'Sign in')], ['signup', L('Criar conta', 'Create account')]], mode, 'lg')}
    <form id="auth-f" class="stack" style="gap:12px" novalidate autocomplete="on">
      <div class="fld" data-only="signup"><label for="au-name">${esc(L('Seu nome', 'Your name'))}</label><input class="inp" id="au-name" name="name" maxlength="80" autocomplete="name"></div>
      <div class="fld"><label for="au-email">E-mail</label><input class="inp" id="au-email" name="email" type="email" inputmode="email" autocomplete="email" required maxlength="254"></div>
      <div class="fld"><label for="au-pass">${esc(L('Senha', 'Password'))}</label><input class="inp" id="au-pass" name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="72"><span class="hint" data-only="signup">${esc(L('Mínimo de 8 caracteres, com letras e números.', 'At least 8 characters with letters and numbers.'))}</span></div>
      <input class="hp" id="au-web" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label class="check" data-only="signup"><input type="checkbox" id="au-terms"><span>${L('Li e aceito os <a href="termos.html" target="_blank" rel="noopener">Termos de uso</a> e a <a href="privacidade.html" target="_blank" rel="noopener">Política de privacidade</a>.', 'I accept the <a href="termos.html" target="_blank" rel="noopener">Terms</a> and <a href="privacidade.html" target="_blank" rel="noopener">Privacy Policy</a>.')}</span></label>
      <div class="form-msg" id="au-msg" role="alert"></div>
      <button class="btn pri block" type="submit" id="au-go"></button>
      <div class="row between small"><button type="button" class="link-btn" data-act="forgot" data-only="login">${esc(L('Esqueci a senha', 'Forgot password'))}</button><span class="faint" data-only="signup">${esc(L('15 dias de PRO grátis, sem cartão.', '15 days of PRO free, no card.'))}</span></div>
    </form></div>`;
  openModal({ title: 'NEXUS HUB', body, label: L('Entrar ou criar conta', 'Sign in or create account'), onOpen: (m) => {
    const f = m.querySelector('#auth-f');
    const setMode = (md) => {
      f.dataset.mode = md;
      $$('[data-only]', m).forEach((x) => { x.style.display = x.dataset.only === md ? '' : 'none'; });
      m.querySelector('#au-go').textContent = md === 'login' ? L('Entrar', 'Sign in') : L('Criar conta e começar o teste', 'Create account and start trial');
      m.querySelector('#au-pass').autocomplete = md === 'login' ? 'current-password' : 'new-password';
      m.querySelector('#au-msg').textContent = '';
      $$('.seg button', m).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === md)));
    };
    ACT.seg_auth = (v) => setMode(v);
    setMode(mode);
    f.addEventListener('submit', (e) => { e.preventDefault(); authSubmit(m); });
    setTimeout(() => m.querySelector(mode === 'signup' ? '#au-name' : '#au-email').focus(), 40);
  } });
}
async function authSubmit(m) {
  const f = m.querySelector('#auth-f'), md = f.dataset.mode;
  const msg = m.querySelector('#au-msg'), go = m.querySelector('#au-go');
  const email = m.querySelector('#au-email').value.trim().toLowerCase();
  const password = m.querySelector('#au-pass').value;
  const name = m.querySelector('#au-name').value.trim();
  const say = (k, ok) => { msg.className = 'form-msg ' + (ok ? 'ok' : 'err'); msg.textContent = k; };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say(authErr('email'));
  if (md === 'signup') {
    if (!name || name.length > 80) return say(authErr('name'));
    if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return say(authErr('password'));
    if (!m.querySelector('#au-terms').checked) return say(authErr('terms'));
  } else if (!password) return say(authErr('invalid'));
  go.classList.add('busy');
  try {
    const sb = await sbClient();
    if (md === 'signup') {
      let r;
      try {
        r = await fetch(`${NX.supabaseUrl}/functions/v1/signup`, {
          method: 'POST', headers: { 'content-type': 'application/json', apikey: NX.supabaseKey },
          body: JSON.stringify({ email, password, name, website: m.querySelector('#au-web').value }),
        });
      } catch { throw new Error('net'); }
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'net');
      LS.set('consent', { terms: true, at: new Date().toISOString(), v: 1 });
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(/invalid/i.test(error.message) ? 'invalid' : error.message);
    closeModal();
    toast(md === 'signup' ? L('Conta criada! Seu teste PRO de 15 dias começou.', 'Account created! Your 15-day PRO trial started.') : L('Você entrou na sua conta.', 'Signed in.'), { type: 'ok' });
  } catch (e) {
    const k = String(e.message || e);
    say(AUTH_ERR[k] ? authErr(k) : /fetch|network|load/i.test(k) ? authErr('net') : k);
  } finally { go.classList.remove('busy'); }
}
ACT.login = () => authModal('login');
ACT.signup = () => authModal('signup');
ACT.forgot = () => {
  openModal({ title: L('Esqueci a senha', 'Forgot password'), body: `<p class="muted" style="line-height:1.6">${esc(L('Por segurança, a redefinição é feita pelo administrador: ele gera uma senha temporária para você, e você troca por uma nova em Configurações › Conta.', 'For security, resets are done by the admin: they generate a temporary password, then you change it in Settings › Account.'))}</p>${NX.support ? `<div class="callout info mt">${ico('message-circle', 18)}<span>${esc(L('Suporte: ', 'Support: '))}<b>${esc(NX.support)}</b></span></div>` : ''}`, foot: `<button class="btn" data-act="login">${esc(L('Voltar', 'Back'))}</button>` });
};
ACT.logout = async () => {
  closeMenus();
  try { const sb = await sbClient(); await sb.auth.signOut(); } catch { /* sai localmente mesmo sem rede */ try { localStorage.removeItem(AUTH_KEY); } catch { /* */ } accountSync(null, 'SIGNED_OUT'); }
  toast(L('Você saiu da conta.', 'Signed out.'), { type: 'ok' });
};
async function authToken() { const sb = await sbClient(); const { data } = await sb.auth.getSession(); return data && data.session ? data.session.access_token : null; }
async function accountFn(payload) {
  const tok = await authToken(); if (!tok) throw new Error(L('Entre na sua conta de novo.', 'Please sign in again.'));
  const r = await fetch(`${NX.supabaseUrl}/functions/v1/account`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: NX.supabaseKey, authorization: 'Bearer ' + tok }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// ---------- configurações da conta ----------
ACT.changePass = () => {
  openModal({ title: L('Trocar senha', 'Change password'), body: `<form id="cp-f" class="stack" style="gap:12px" novalidate><div class="fld"><label for="cp-a">${esc(L('Nova senha', 'New password'))}</label><input class="inp" id="cp-a" type="password" autocomplete="new-password" minlength="8" maxlength="72"><span class="hint">${esc(L('Mínimo de 8 caracteres, com letras e números.', 'At least 8 characters with letters and numbers.'))}</span></div><div class="fld"><label for="cp-b">${esc(L('Repita a nova senha', 'Repeat new password'))}</label><input class="inp" id="cp-b" type="password" autocomplete="new-password" maxlength="72"></div><div class="form-msg" id="cp-m" role="alert"></div><button class="btn pri block" type="submit" id="cp-go">${esc(L('Salvar nova senha', 'Save new password'))}</button></form>`, onOpen: (m) => {
    m.querySelector('#cp-f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const a = m.querySelector('#cp-a').value, b = m.querySelector('#cp-b').value, msg = m.querySelector('#cp-m'), go = m.querySelector('#cp-go');
      msg.className = 'form-msg err';
      if (a.length < 8 || a.length > 72 || !/[A-Za-z]/.test(a) || !/\d/.test(a)) { msg.textContent = authErr('password'); return; }
      if (a !== b) { msg.textContent = L('As duas senhas não são iguais.', 'Passwords do not match.'); return; }
      go.classList.add('busy');
      try { const sb = await sbClient(); const { error } = await sb.auth.updateUser({ password: a }); if (error) throw error; closeModal(); toast(L('Senha trocada.', 'Password changed.'), { type: 'ok' }); }
      catch (err) { msg.textContent = String(err.message || err); } finally { go.classList.remove('busy'); }
    });
  } });
};
ACT.saveName = async (el) => {
  const inp = $('#st-name'); const name = inp.value.trim().slice(0, 80);
  if (!name) { toast(authErr('name'), { type: 'warn' }); return; }
  el.classList.add('busy');
  try { const sb = await sbClient(); const { error } = await sb.from('profiles').update({ name }).eq('id', ACCOUNT.user.id); if (error) throw error; ACCOUNT.profile.name = name; renderAccountChip(); toast(L('Nome salvo.', 'Name saved.'), { type: 'ok' }); }
  catch (e) { toast(String(e.message || e), { type: 'err' }); } finally { el.classList.remove('busy'); }
};
ACT.closeAccount = () => {
  openModal({ title: L('Excluir minha conta', 'Delete my account'), body: `<div class="callout bad">${ico('triangle-alert', 18)}<span>${esc(L('Isto apaga sua conta, todos os aportes do Portfolio Vault e os pedidos de pagamento. Não dá para desfazer. Se quiser guardar uma cópia, baixe seus dados antes.', 'This deletes your account, all Portfolio Vault entries and payment requests. It cannot be undone. Download your data first if you want a copy.'))}</span></div><div class="fld mt"><label for="ca-c">${esc(L('Para confirmar, digite EXCLUIR', 'To confirm, type EXCLUIR'))}</label><input class="inp" id="ca-c" autocomplete="off" spellcheck="false"></div><div class="form-msg err" id="ca-m" role="alert"></div>`, foot: `<button class="btn ghost" data-act="closeModal">${esc(L('Cancelar', 'Cancel'))}</button><button class="btn danger" id="ca-go">${ico('trash-2', 16)}${esc(L('Excluir para sempre', 'Delete forever'))}</button>`, onOpen: (m) => {
    m.querySelector('#ca-go').onclick = async (e) => {
      const b = e.currentTarget;
      if (m.querySelector('#ca-c').value.trim() !== 'EXCLUIR') { m.querySelector('#ca-m').textContent = L('Digite EXCLUIR (em maiúsculas) para confirmar.', 'Type EXCLUIR (uppercase) to confirm.'); return; }
      b.classList.add('busy');
      try {
        await accountFn({ action: 'close', confirm: 'EXCLUIR' });
        try { const sb = await sbClient(); await sb.auth.signOut({ scope: 'local' }); } catch { /* */ }
        try { localStorage.removeItem(AUTH_KEY); } catch { /* */ }
        closeModal(); accountSync(null, 'SIGNED_OUT');
        toast(L('Sua conta e seus dados foram excluídos.', 'Your account and data were deleted.'), { type: 'ok', ms: 7000 });
        go('dash');
      } catch (err) { m.querySelector('#ca-m').textContent = String(err.message || err); b.classList.remove('busy'); }
    };
  } });
};
function downloadFile(name, text, type = 'application/json') {
  const blob = new Blob([text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
ACT.exportMyData = async (el) => {
  el.classList.add('busy');
  try {
    const sb = await sbClient();
    const [{ data: entries, error: e1 }, { data: claims }] = await Promise.all([
      sb.from('vault_entries').select('*').order('date', { ascending: true }),
      sb.from('payment_claims').select('plan,note,status,created_at,resolved_at'),
    ]);
    if (e1) throw e1;
    const out = { app: 'NEXUS HUB', version: NX.version, exportedAt: new Date().toISOString(), profile: ACCOUNT.profile, vault_entries: entries || [], payment_claims: claims || [] };
    downloadFile(`nexus-hub-meus-dados-${todayISO()}.json`, JSON.stringify(out, null, 2));
    toast(L('Arquivo com seus dados baixado.', 'Your data file was downloaded.'), { type: 'ok' });
  } catch (e) { toast(String(e.message || e), { type: 'err' }); } finally { el.classList.remove('busy'); }
};

// ---------- início ----------
async function accountBoot() {
  renderAccountChip();
  if (!hasStoredSession()) return;
  ACCOUNT.state = 'loading'; renderAccountChip();
  try {
    const sb = await sbClient();
    const { data } = await sb.auth.getSession();
    if (!data || !data.session) accountSync(null);
    // com sessão, o onAuthStateChange (INITIAL_SESSION) já chama accountSync
  } catch (e) {
    Object.assign(ACCOUNT, { state: 'guest', err: String(e.message || e) });
    renderAccountChip();
    toast(L('Não foi possível conectar ao servidor de contas agora. O painel funciona normalmente.', 'Could not reach the account server. The dashboard still works.'), { type: 'warn' });
  }
}
