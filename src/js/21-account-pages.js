// =====================================================================
// PLANOS (PagBank + "Já paguei"), CONFIGURAÇÕES (conta, aparência, IA,
// saúde dos dados, armazenamento) e PAINEL DO ADMINISTRADOR.
// =====================================================================
const PLAN_NAMES = () => ({ mensal: L('Mensal', 'Monthly'), trimestral: L('Trimestral', 'Quarterly'), anual: L('Anual', 'Yearly') });
const PLAN_MONTHS = { mensal: 1, trimestral: 3, anual: 12 };
function plansHtml() {
  const i = planInfo();
  const pp = NX.planPrices, base = pp.mensal;
  const card = (k, feat) => {
    const per = pp[k] / PLAN_MONTHS[k], save = (1 - per / base) * 100;
    return `<div class="panel plan ${feat ? 'feat' : ''}">${feat ? `<span class="badge pro" style="align-self:flex-start">${esc(L('Melhor custo', 'Best value'))}</span>` : ''}
      <h2 class="panel-t">${esc(PLAN_NAMES()[k])}</h2>
      <div class="price">${esc(brl(pp[k], [2, 2]))}<small> / ${esc(PLAN_MONTHS[k] === 1 ? L('mês', 'month') : PLAN_MONTHS[k] === 3 ? L('trimestre', 'quarter') : L('ano', 'year'))}</small></div>
      <div class="small muted">${PLAN_MONTHS[k] > 1 ? `${esc(L('equivale a', 'equals'))} <b>${esc(brl(per, [2, 2]))}</b>${esc(L('/mês', '/mo'))} · <span class="up b">${esc(L('economia de', 'save'))} ${esc(fmtPct(save, 0, false))}</span>` : esc(L('cancele quando quiser', 'cancel any time'))}</div>
      <a class="btn ${feat ? 'pri' : ''} block" href="${esc(safeUrl(NX.checkout[k]))}" target="_blank" rel="noopener noreferrer" data-act="planPay" data-allow-nav="1" data-k="${k}">${ico('credit-card', 17)}${esc(L('Assinar pelo PagBank', 'Subscribe via PagBank'))}</a>
    </div>`;
  };
  const feats = [
    ['flask-conical', L('Bitcoin Lab', 'Bitcoin Lab'), L('Gráfico de ciclo com preço realizado, médias de longo prazo, Mayer, Pi Cycle, CVDD e posição no ciclo.', 'Cycle chart with realized price, long-term MAs, Mayer, Pi Cycle, CVDD and cycle position.')],
    ['package', L('Tokenomics', 'Tokenomics'), L('Oferta, diluição, distância do topo, receita, recompras, segurança e notícias de qualquer moeda.', 'Supply, dilution, distance from top, revenue, buybacks, security and news for any coin.')],
    ['wallet', 'Portfolio Vault', L('Sua carteira com preço médio, resultado, evolução e mapa de acumulação, salva na sua conta (PC e celular).', 'Your portfolio with average cost, P/L, history and allocation, saved to your account (PC and phone).')],
  ];
  return `${pageHead(PAGES.plans, '')}
  ${i.k === 'master' ? `<div class="callout ok" style="margin-bottom:16px">${ico('crown', 18)}<span>${esc(L('Você é administrador: acesso PRO vitalício. Os pedidos de ativação dos clientes aparecem no Painel do administrador.', 'You are an admin: lifetime PRO access. Customer activation requests appear in the Admin panel.'))} <a href="#/admin" class="b">${esc(L('Abrir painel', 'Open panel'))}</a></span></div>` : ''}
  ${ACCOUNT.user ? `<div class="callout ${i.pro ? 'info' : 'warn'}" style="margin-bottom:16px">${ico('user', 18)}<span>${esc(L('Sua situação:', 'Your status:'))} ${planBadge()}</span></div>` : `<div class="callout info" style="margin-bottom:16px">${ico('gift', 18)}<span>${esc(L('Comece com 15 dias grátis: crie sua conta e use tudo do PRO, sem cartão.', 'Start with 15 free days: create your account and use all PRO features, no card.'))} <button class="link-btn" data-act="signup">${esc(L('Criar conta grátis', 'Create free account'))}</button></span></div>`}
  <div class="plan-cards">${card('mensal')}${card('trimestral')}${card('anual', true)}</div>
  <div class="grid g-2 mt">
    <section class="panel">${panelHead('crown', L('O que o PRO inclui', 'What PRO includes'))}<div class="list">${feats.map(([ic, t, d]) => `<div class="li" style="align-items:flex-start">${ico(ic, 20)}<span class="grow"><span class="t" style="display:block">${esc(t)}</span><span class="m" style="font-size:13px;line-height:1.5">${esc(d)}</span></span></div>`).join('')}</div>${note(L('Todo o resto do NEXUS HUB (dashboard, gráficos, Top 100, índices, on-chain, ETFs, macro, agenda, Polymarket e notícias) é gratuito.', 'Everything else (dashboard, charts, Top 100, indices, on-chain, ETFs, macro, calendar, Polymarket and news) is free.'))}</section>
    <section class="panel" id="pl-claim"></section>
  </div>
  <section class="panel mt">${panelHead('circle-help', L('Perguntas frequentes', 'FAQ'))}<div class="list">${[
    [L('Como o PRO é ativado depois do pagamento?', 'How is PRO activated after payment?'), L('Pague pelo PagBank e clique em "Já paguei". O administrador confere o pagamento e ativa o seu plano — normalmente no mesmo dia útil. Você vê a situação aqui e no menu da conta.', 'Pay via PagBank and click "I paid". The admin verifies and activates your plan — usually the same business day.')],
    [L('Os preços e números do site são reais?', 'Are prices and numbers real?'), L('Sim. Cada painel mostra a fonte e a hora da leitura. Quando uma fonte cai, mostramos o último valor válido com o horário — nunca um número inventado.', 'Yes. Each panel shows source and read time. If a source is down, we show the last valid value with its time — never an invented number.')],
    [L('Meus aportes ficam seguros?', 'Are my entries safe?'), L('Ficam na sua conta, protegidos por regras de acesso no servidor: só você lê e altera os seus dados. Você pode baixar tudo ou excluir a conta quando quiser.', 'They live in your account, protected by server-side access rules: only you can read and change them. Download everything or delete your account any time.')],
    [L('Posso cancelar?', 'Can I cancel?'), L('Sim. O plano vale até o fim do período pago e não renova sozinho por aqui. Seus dados continuam salvos e visíveis.', 'Yes. The plan lasts until the end of the paid period. Your data stays saved and visible.')],
  ].map(([q, a]) => `<details class="li" style="display:block"><summary class="t" style="cursor:pointer">${esc(q)}</summary><p class="small muted mt" style="margin-top:8px;line-height:1.6">${esc(a)}</p></details>`).join('')}</div></section>`;
}
async function drawClaims() {
  const box = $('#pl-claim'); if (!box) return;
  const head = panelHead('check', L('Já pagou? Avise aqui', 'Paid? Let us know'), { sub: esc(L('Assim o administrador confere e ativa o seu PRO.', 'So the admin can verify and activate your PRO.')) });
  if (!ACCOUNT.user) { box.innerHTML = head + `<p class="small muted">${esc(L('Entre na sua conta (ou crie uma) antes de pagar, para o plano ficar ligado a você.', 'Sign in (or create an account) before paying, so the plan is linked to you.'))}</p><div class="row wrap mt" style="gap:8px"><button class="btn pri" data-act="signup">${esc(L('Criar conta', 'Create account'))}</button><button class="btn" data-act="login">${esc(L('Entrar', 'Sign in'))}</button></div>`; return; }
  if (planInfo().k === 'master') { box.innerHTML = head + `<p class="small muted">${esc(L('Contas de administrador não precisam de plano.', 'Admin accounts need no plan.'))}</p>`; return; }
  box.innerHTML = head + skel(3, 16);
  let claims = [];
  try { const sb = await sbClient(); const { data, error } = await sb.from('payment_claims').select('id,plan,note,status,created_at,resolved_at').order('created_at', { ascending: false }).limit(10); if (error) throw error; claims = data || []; }
  catch (e) { box.innerHTML = head + `<div class="callout bad">${ico('triangle-alert', 18)}<span>${esc(String(e.message || e))}</span></div>`; return; }
  const st = { pending: ['warn', L('aguardando conferência', 'awaiting review')], approved: ['live', L('aprovado', 'approved')], rejected: ['bad', L('não confirmado', 'not confirmed')] };
  const pend = claims.filter((c) => c.status === 'pending').length;
  box.innerHTML = head + `<form id="cl-f" class="stack" style="gap:10px" novalidate>
    <div class="fld"><label for="cl-plan">${esc(L('Plano pago', 'Plan paid'))}</label><select class="sel inp" id="cl-plan">${Object.entries(PLAN_NAMES()).map(([k, v]) => `<option value="${k}">${esc(v)} — ${esc(brl(NX.planPrices[k], [2, 2]))}</option>`).join('')}</select></div>
    <div class="fld"><label for="cl-note">${esc(L('Nome de quem pagou ou código da transação', 'Payer name or transaction code'))}</label><input class="inp" id="cl-note" maxlength="300" placeholder="${esc(L('Ex.: Maria Silva, pago em 15/10 às 14h', 'E.g.: Maria Silva, paid Oct 15, 2pm'))}"></div>
    <div class="form-msg" id="cl-msg" role="alert"></div>
    <button class="btn pri" type="submit" ${pend >= 3 ? 'disabled' : ''}>${ico('send', 16)}${esc(L('Já paguei — pedir ativação', 'I paid — request activation'))}</button>
  </form>${claims.length ? `<div class="list mt">${claims.map((c) => `<div class="li"><span class="grow"><span class="t" style="display:block">${esc(PLAN_NAMES()[c.plan] || c.plan)} · ${esc(fmtDateTime(c.created_at))}</span>${c.note ? `<span class="m">${esc(c.note)}</span>` : ''}</span><span class="badge ${st[c.status][0]}">${esc(st[c.status][1])}</span></div>`).join('')}</div>` : ''}`;
  $('#cl-f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#cl-msg'), btn = e.target.querySelector('button[type=submit]'); msg.className = 'form-msg err';
    const note = $('#cl-note').value.trim();
    if (note.length < 3) { msg.textContent = L('Escreva o nome de quem pagou ou o código, para conferirmos.', 'Enter the payer name or code so we can verify.'); return; }
    btn.classList.add('busy');
    try { const sb = await sbClient(); const { error } = await sb.from('payment_claims').insert({ plan: $('#cl-plan').value, note }); if (error) throw error; toast(L('Pedido enviado. Assim que o pagamento for conferido, o PRO é ativado.', 'Request sent. PRO is activated once payment is verified.'), { type: 'ok', ms: 7000 }); drawClaims(); }
    catch (err) { msg.textContent = /3|limit|pending/i.test(String(err.message)) ? L('Você já tem pedidos aguardando conferência.', 'You already have pending requests.') : String(err.message || err); btn.classList.remove('busy'); }
  });
}
ACT.planPay = (el, e) => { if (!ACCOUNT.user) { e.preventDefault(); toast(L('Crie sua conta (ou entre) antes de pagar, para o plano ficar no seu nome.', 'Create an account (or sign in) before paying, so the plan is yours.'), { type: 'warn' }); authModal('signup'); } };
page({
  id: 'plans', group: 'conta', icon: 'crown', pt: 'Planos', en: 'Plans', acct: true,
  sub: 'Use o NEXUS HUB grátis. Desbloqueie o Lab, o Tokenomics e o Portfolio Vault com o PRO.',
  subEn: 'Use NEXUS HUB for free. Unlock the Lab, Tokenomics and Portfolio Vault with PRO.',
  init(el) { el.innerHTML = plansHtml(); drawClaims(); },
  show() { drawClaims(); },
});

// ---------- CONFIGURAÇÕES ----------
function settingsHtml() {
  return `${pageHead(PAGES.settings, '')}
  <div class="grid g-2"><section class="panel" id="st-acct"></section><section class="panel" id="st-look"></section></div>
  <section class="panel mt" id="st-ai"></section>
  <section class="panel flush mt" id="st-health"></section>
  <div class="grid g-2 mt"><section class="panel" id="st-store"></section><section class="panel" id="st-about"></section></div>`;
}
function drawStAcct() {
  const box = $('#st-acct'); if (!box) return;
  if (!ACCOUNT.user) { box.innerHTML = panelHead('user', L('Sua conta', 'Your account')) + `<p class="small muted">${esc(L('Crie uma conta grátis para salvar sua carteira e usar o PRO por 15 dias.', 'Create a free account to save your portfolio and try PRO for 15 days.'))}</p><div class="row wrap mt" style="gap:8px"><button class="btn pri" data-act="signup">${esc(L('Criar conta grátis', 'Create free account'))}</button><button class="btn" data-act="login">${esc(L('Entrar', 'Sign in'))}</button></div>`; return; }
  const p = ACCOUNT.profile || {};
  box.innerHTML = panelHead('user', L('Sua conta', 'Your account'), { right: planBadge() }) + `<div class="stack" style="gap:12px">
    <div class="fld"><label for="st-name">${esc(L('Nome', 'Name'))}</label><div class="inp-group"><input class="inp" id="st-name" maxlength="80" value="${esc(p.name || '')}" autocomplete="name"><button class="btn" data-act="saveName">${esc(L('Salvar', 'Save'))}</button></div></div>
    <div class="small muted">E-mail: <b>${esc(ACCOUNT.user.email)}</b>${p.created_at ? ` · ${esc(L('conta criada em', 'created on'))} ${esc(fmtDate(p.created_at))}` : ''}</div>
    <div class="row wrap" style="gap:8px"><button class="btn sm" data-act="changePass">${ico('key-round', 15)}${esc(L('Trocar senha', 'Change password'))}</button><button class="btn sm" data-act="exportMyData">${ico('download', 15)}${esc(L('Baixar meus dados', 'Download my data'))}</button><button class="btn sm" data-act="logout">${ico('log-out', 15)}${esc(L('Sair', 'Sign out'))}</button></div>
    ${planInfo().k !== 'master' ? `<div class="divider"></div><div class="row between wrap" style="gap:8px"><span class="small muted">${esc(L('Excluir a conta apaga todos os seus dados do servidor.', 'Deleting the account erases all your data from the server.'))}</span><button class="btn sm danger" data-act="closeAccount">${ico('trash-2', 15)}${esc(L('Excluir conta', 'Delete account'))}</button></div>` : ''}
  </div>`;
}
function drawStLook() {
  setHTML('#st-look', panelHead('sun', L('Aparência', 'Appearance')) + `<div class="stack" style="gap:14px">
    <div><div class="lbl-t" style="margin-bottom:8px">${esc(L('Tema', 'Theme'))}</div><div class="row wrap" style="gap:8px">${THEMES.map(([v, pt, en, i]) => `<button class="btn sm ${S.themeChoice === v ? 'pri' : ''}" data-act="stTheme" data-v="${v}">${ico(i, 15)}${esc(L(pt, en))}</button>`).join('')}</div></div>
    <div><div class="lbl-t" style="margin-bottom:8px">${esc(L('Idioma', 'Language'))}</div><div class="row wrap" style="gap:8px"><button class="btn sm ${S.lang === 'pt' ? 'pri' : ''}" data-act="setLang" data-v="pt">Português</button><button class="btn sm ${S.lang === 'en' ? 'pri' : ''}" data-act="setLang" data-v="en">English</button></div></div>
    <label class="row between" style="gap:12px;cursor:pointer"><span><b class="small">${esc(L('Menu lateral compacto', 'Compact side menu'))}</b><div class="tiny faint">${esc(L('Mostra só os ícones (no computador).', 'Icons only (desktop).'))}</div></span><span class="sw"><input type="checkbox" data-chg="stMini" ${document.body.classList.contains('sb-mini') ? 'checked' : ''}><span></span></span></label>
    <label class="row between" style="gap:12px;cursor:pointer"><span><b class="small">${esc(L('Faixa de preços no topo', 'Price ticker on top'))}</b><div class="tiny faint">${esc(L('A faixa para quando você passa o mouse.', 'The strip pauses on hover.'))}</div></span><span class="sw"><input type="checkbox" data-chg="stTicker" ${LS.get('ticker', true) ? 'checked' : ''}><span></span></span></label>
    <label class="row between" style="gap:12px;cursor:pointer"><span><b class="small">${esc(L('Faixa rolando', 'Scrolling ticker'))}</b><div class="tiny faint">${esc(L('Desligue para deixar a faixa parada.', 'Turn off to keep the strip still.'))}</div></span><span class="sw"><input type="checkbox" data-chg="stTickerMotion" ${LS.get('tickerMotion', 'roll') !== 'still' ? 'checked' : ''}><span></span></span></label>
  </div>`);
}
ACT.stTheme = (el) => { applyTheme(el.dataset.v); drawStLook(); };
ACT.stMini = (el) => setSbMini(el.checked);
ACT.stTicker = (el) => { LS.set('ticker', el.checked); document.body.classList.toggle('no-ticker', !el.checked); };
ACT.stTickerMotion = (el) => { LS.set('tickerMotion', el.checked ? 'roll' : 'still'); applyTickerMotion(); };
function drawStAi() {
  const k = aiKey();
  setHTML('#st-ai', panelHead('sparkles', L('Assistente de IA (opcional)', 'AI assistant (optional)'), { sub: esc(L('Para tradução de notícias, resumos e pesquisas. Usa a sua própria chave da Anthropic: ela fica só neste navegador e o uso é cobrado na sua conta da Anthropic.', 'For news translation, summaries and research. Uses your own Anthropic key: it stays in this browser and usage is billed to your Anthropic account.')) }) +
    `<div class="fld"><label for="st-key">${esc(L('Chave da API Anthropic', 'Anthropic API key'))}</label><div class="inp-group"><input class="inp" id="st-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-..." value="${k ? '••••••••••••' + esc(k.slice(-4)) : ''}"><button class="btn" data-act="stKeySave">${esc(L('Salvar', 'Save'))}</button>${k ? `<button class="btn" data-act="stKeyTest">${esc(L('Testar', 'Test'))}</button><button class="btn ghost" data-act="stKeyDel">${esc(L('Remover', 'Remove'))}</button>` : ''}</div><span class="hint">${L('Crie em <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>. Nunca compartilhe sua chave.', 'Create one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>. Never share it.')}</span></div><div class="form-msg" id="st-key-m"></div>`);
}
ACT.stKeySave = () => {
  const v = $('#st-key').value.trim(); const m = $('#st-key-m');
  if (/^•+/.test(v)) { m.className = 'form-msg ok'; m.textContent = L('Chave já salva.', 'Key already saved.'); return; }
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v)) { m.className = 'form-msg err'; m.textContent = L('Isso não parece uma chave da Anthropic (começa com sk-ant-).', 'That does not look like an Anthropic key (starts with sk-ant-).'); return; }
  LS.set('ai-key', v); drawStAi(); toast(L('Chave salva neste navegador.', 'Key saved in this browser.'), { type: 'ok' });
};
ACT.stKeyDel = () => { LS.del('ai-key'); drawStAi(); toast(L('Chave removida.', 'Key removed.'), { type: 'ok' }); };
ACT.stKeyTest = async (el) => { el.classList.add('busy'); const m = $('#st-key-m'); try { const r = await aiCall([{ role: 'user', content: 'Responda apenas: OK' }], { model: NX.aiModelFast, max: 10 }); m.className = 'form-msg ok'; m.textContent = L('Funcionando: ', 'Working: ') + r; } catch (e) { m.className = 'form-msg err'; m.textContent = e.message; } el.classList.remove('busy'); };
function drawStHealth() {
  const box = $('#st-health'); if (!box) return;
  const rows = Object.values(HEALTH).sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const audit = window.__nxAudit;
  const st = (h) => { const s = stampState(h.id); const map = { live: ['live', L('em dia', 'OK')], stale: ['warn', L('atrasado', 'late')], err: ['bad', L('falhou', 'failed')], ref: ['ref', L('referência', 'reference')], off: ['', SRC[h.id] && !SRC[h.id].need() ? L('só quando a página abre', 'on demand') : L('aguardando', 'waiting')] }; const [c, t] = map[s.cls] || ['', s.txt]; return `<span class="badge ${c}">${esc(t)}</span>`; };
  box.innerHTML = `<div class="panel-h" style="padding:16px 18px 10px;margin:0"><div class="tt"><h2 class="panel-t">${ico('activity', 18)}${esc(L('Saúde dos dados', 'Data health'))}</h2><p class="panel-s">${esc(L('Cada fonte, quando foi lida pela última vez e se está em dia. Fontes de páginas fechadas só atualizam quando você abre a página.', 'Each source, when it was last read and whether it is current. Sources for closed pages update when you open them.'))}</p></div><button class="btn sm" data-act="refreshAll">${ico('refresh-cw', 15)}${esc(L('Atualizar tudo', 'Refresh all'))}</button></div>
  ${audit ? `<div style="padding:0 18px 10px">${audit.issues.length ? `<div class="callout warn">${ico('triangle-alert', 18)}<span>${esc(L('A verificação automática encontrou:', 'The automatic check found:'))} ${audit.issues.slice(0, 5).map((i) => esc(i.text)).join(' · ')}</span></div>` : `<div class="callout ok">${ico('circle-check', 18)}<span>${esc(L(`Verificação automática da tela às ${fmtTime(audit.ts)}: nenhum número quebrado e nenhuma fonte atrasada.`, `Automatic screen check at ${fmtTime(audit.ts)}: no broken number and no late source.`))}</span></div>`}</div>` : ''}
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(L('Fonte', 'Source'))}</th><th>${esc(L('Provedor', 'Provider'))}</th><th>${esc(L('Situação', 'Status'))}</th><th>${esc(L('Última leitura', 'Last read'))}</th><th>${esc(L('Atualiza a cada', 'Refreshes every'))}</th><th>${esc(L('Último erro', 'Last error'))}</th></tr></thead><tbody>${rows.map((h) => `<tr><td class="b">${esc(h.label)}</td><td class="muted">${esc((SRC[h.id] && SRC[h.id].provider) || h.provider || '')}</td><td>${st(h)}</td><td>${h.ts ? esc(fmtDateTime(h.ts)) + ` <span class="faint tiny">(${esc(ago(h.ts))})</span>` : '—'}</td><td class="muted">${SRC[h.id] ? esc(humanEvery(SRC[h.id].every)) : ''}</td><td class="tiny" style="white-space:normal;max-width:260px;color:var(--down)">${esc(h.err || '')}</td></tr>`).join('')}</tbody></table></div>`;
}
function drawStStore() {
  let bytes = 0, n = 0; LS.keys().forEach((k) => { try { bytes += (localStorage.getItem(k) || '').length * 2; n++; } catch { /* */ } });
  setHTML('#st-store', panelHead('database', L('Dados neste navegador', 'Data in this browser')) + `<p class="small muted" style="line-height:1.6">${esc(L(`O NEXUS guarda ${n} itens (${fmtNum(bytes / 1024, 0, 1)} KB) neste navegador: preferências, cards do painel, a lista de endereços do Wallet Watch e cópias recentes dos dados para abrir rápido. Seus aportes do Vault ficam na sua conta, não aqui.`, `NEXUS stores ${n} items (${fmtNum(bytes / 1024, 0, 1)} KB) in this browser: preferences, dashboard cards and recent data copies for fast loading. Your entries live in your account, not here.`))}</p>
    <div class="row wrap mt" style="gap:8px"><button class="btn sm" data-act="stClearCache">${ico('refresh-cw', 15)}${esc(L('Limpar cópias de dados', 'Clear data copies'))}</button><button class="btn sm ghost" data-act="stReset">${ico('undo-2', 15)}${esc(L('Restaurar preferências', 'Reset preferences'))}</button></div>`);
}
ACT.stClearCache = () => { LS.keys().filter((k) => k.startsWith(LS.pre + 'c:')).forEach((k) => { try { localStorage.removeItem(k); } catch { /* */ } }); Object.keys(CACHE.mem).forEach((k) => delete CACHE.mem[k]); refreshAll(); drawStStore(); toast(L('Cópias apagadas. Lendo tudo de novo nas fontes…', 'Copies cleared. Reading everything again…'), { type: 'ok' }); };
ACT.stReset = async () => {
  if (!(await confirmBox(L('Voltar tema, idioma, cards do painel e filtros ao padrão? Sua conta, seus aportes e suas carteiras do Wallet Watch não são afetados.', 'Reset theme, language, dashboard cards and filters? Your account, entries and Wallet Watch wallets are not affected.'), { ok: L('Restaurar', 'Reset') }))) return;
  const keep = new Set(['ai-key', 'ww', 'ww-read', 'ww-ev', 'ww-hist'].map((k) => LS.pre + k));
  LS.keys().forEach((k) => { if (!keep.has(k)) { try { localStorage.removeItem(k); } catch { /* */ } } });
  location.reload();
};
function drawStAbout() {
  setHTML('#st-about', panelHead('info', L('Sobre', 'About')) + `<div class="stack small muted" style="gap:8px;line-height:1.6">
    <div>NEXUS HUB <b>${esc(NX.version)}</b> · ${esc(L('versão', 'build'))} ${esc(NX.build)}</div>
    <div>${esc(L('Atalhos:', 'Shortcuts:'))} <span class="kbd">Ctrl</span> + <span class="kbd">K</span> ${esc(L('busca rápida', 'quick search'))} · <span class="kbd">Esc</span> ${esc(L('fecha janelas', 'closes dialogs'))}</div>
    <div>${esc(L('Nada aqui é recomendação de investimento. Confira sempre as fontes citadas.', 'Nothing here is investment advice. Always check the cited sources.'))}</div>
    <div class="row wrap" style="gap:14px"><a href="termos.html" target="_blank" rel="noopener">${esc(L('Termos de uso', 'Terms'))}</a><a href="privacidade.html" target="_blank" rel="noopener">${esc(L('Privacidade', 'Privacy'))}</a><a href="landing.html" target="_blank" rel="noopener">${esc(L('Página de apresentação', 'Landing page'))}</a>${NX.support ? `<a href="${esc(safeUrl(NX.supportUrl))}" target="_blank" rel="noopener noreferrer">${esc(L('Suporte no WhatsApp', 'WhatsApp support'))}: ${esc(NX.support)}</a>` : ''}</div></div>`);
}
function settingsDraw() { drawStAcct(); drawStLook(); drawStAi(); drawStHealth(); drawStStore(); drawStAbout(); }
let _stT = 0;
onPrice(() => { if (S.page === 'settings' && Date.now() - _stT > 5000) { _stT = Date.now(); drawStHealth(); } });
page({
  id: 'settings', group: 'conta', icon: 'settings', pt: 'Configurações', en: 'Settings', acct: true,
  sub: 'Conta, aparência, assistente de IA e a saúde de cada fonte de dados.', subEn: 'Account, appearance, AI assistant and the health of every data source.',
  init(el) { el.innerHTML = settingsHtml(); settingsDraw(); },
  show() { settingsDraw(); },
});

// ---------- PAINEL DO ADMINISTRADOR ----------
const ADM = { q: '', users: [], claims: [], ov: null, err: '', pipe: null, robot: null, robotMissing: false, robotErr: '' };
async function admLoad() {
  ADM.err = '';
  try {
    const sb = await sbClient();
    const [ov, cl, us] = await Promise.all([sb.rpc('admin_overview'), sb.rpc('admin_list_claims', { p_status: 'pending' }), sb.rpc('admin_list_users', { p_search: ADM.q || null, p_limit: 100 })]);
    for (const r of [ov, cl, us]) if (r.error) throw r.error;
    ADM.ov = ov.data; ADM.claims = cl.data || []; ADM.users = us.data || [];
  } catch (e) { ADM.err = String(e.message || e); }
  // agendador do robô (migração 03): sem a função no banco, a tela explica como instalar
  try {
    const sb = await sbClient(); const { data, error } = await sb.rpc('admin_robot_status'); if (error) throw error;
    ADM.robot = data && typeof data === 'object' ? data : {}; ADM.robotMissing = false; ADM.robotErr = '';
  } catch (e) {
    const t = `${(e && e.code) || ''} ${(e && e.message) || e}`;
    ADM.robot = null; ADM.robotMissing = /PGRST202|Could not find the function|schema cache|\b404\b/i.test(t); ADM.robotErr = ADM.robotMissing ? '' : String((e && e.message) || e);
  }
  try { ADM.pipe = await getPipeline('status', 30 * 86400e3); } catch { ADM.pipe = null; }
  admDraw();
}
// resposta do GitHub ao último pedido do agendador, em português
function admGhMsg(last) {
  if (!last) return null;
  const s = num(last.status);
  if (s >= 200 && s < 300) return ['live', L('GitHub aceitou: robô disparado', 'GitHub accepted: bot started')];
  if (s === 401) return ['bad', L('token recusado (vencido, apagado ou copiado errado): crie outro', 'token rejected (expired, deleted or mistyped): create a new one')];
  if (s === 403) return ['bad', L('token sem permissão: precisa de "Actions: Read and write"', 'token lacks permission: needs "Actions: Read and write"')];
  if (s === 404) return ['bad', L('o token não tem acesso ao repositório Claude_crypto_hub7.0', 'the token has no access to the Claude_crypto_hub7.0 repository')];
  if (s === 422) return ['bad', L('o GitHub recusou o pedido (o robô ou o ramo main mudou)', 'GitHub refused the request (bot or main branch changed)')];
  if (s) return ['bad', 'HTTP ' + s];
  if (last.error) return ['bad', String(last.error).slice(0, 120)];
  return ['warn', L('aguardando a resposta do GitHub', 'waiting for GitHub’s answer')];
}
function admRobotHtml() {
  const ref = NX.supabaseUrl.split('//')[1].split('.')[0];
  const head = `<h3 class="adm-h">${ico('clock', 17)}${esc(L('Agendador do robô (a cada 20 min)', 'Bot scheduler (every 20 min)'))}</h3>`;
  if (ADM.robotMissing) {
    return `${head}<div class="callout info">${ico('info', 18)}<span>${esc(L('Ainda não instalado no banco. Sem ele, o robô roda só quando o GitHub dispara o agendamento (hoje, de 6 a 8 vezes por dia), e cotas de ETFs, bolsas e notícias podem ficar horas paradas.', 'Not installed in the database yet. Without it the bot runs only when GitHub fires its schedule (6–8 times a day today).'))}</span></div>
      <ol class="adm-steps"><li>${esc(L('Abra o arquivo de instalação e copie o texto todo (botão "Copy raw file", no alto do arquivo):', 'Open the install file and copy all of it ("Copy raw file" button):'))} ${extLink(NX.repoUrl + '/blob/main/dev/supabase/migrations/03_agendador_robo.sql', '03_agendador_robo.sql')}</li>
      <li>${esc(L('Abra o SQL Editor do Supabase, cole e clique em Run:', 'Open the Supabase SQL Editor, paste and click Run:'))} ${extLink(`https://supabase.com/dashboard/project/${ref}/sql/new`, L('SQL Editor', 'SQL Editor'))}</li>
      <li>${esc(L('Volte aqui e clique em Atualizar: aparece o campo para colar o token do GitHub.', 'Come back and click Refresh: the GitHub token field appears.'))}</li></ol>`;
  }
  if (!ADM.robot) return ADM.robotErr ? `${head}<div class="callout warn">${ico('triangle-alert', 18)}<span>${esc(ADM.robotErr)}</span></div>` : '';
  const r = ADM.robot, tokSet = !!(r.token && r.token.set), job = r.job, gh = admGhMsg(r.last);
  const chip = (cls, t) => `<span class="badge ${cls}">${esc(t)}</span>`;
  const rows = [
    [L('Token do GitHub', 'GitHub token'), tokSet ? chip('live', L('salvo', 'saved')) + ` <span class="small faint">${esc(L('em', 'on'))} ${esc(fmtDateTime(r.token.updated_at))}</span>` : chip('warn', L('não configurado', 'not set'))],
    [L('Agendamento', 'Schedule'), job ? (job.active ? chip('live', L('ligado: minutos 2, 22 e 42 de cada hora', 'on: minutes 2, 22 and 42')) : chip('bad', L('desligado', 'off'))) : chip('warn', r.job_err ? L('sem o pg_cron', 'pg_cron missing') : L('não encontrado', 'not found'))],
    [L('Último pedido ao GitHub', 'Last request to GitHub'), r.last ? `<span class="small">${esc(fmtDateTime(r.last.at))} (${esc(ago(Date.parse(r.last.at)))}) · ${esc(r.last.origem === 'manual' ? L('teste', 'test') : L('agendador', 'scheduler'))}</span> ${gh ? chip(gh[0], gh[1]) : ''}` : `<span class="small faint">${esc(tokSet ? L('ainda nenhum (o próximo sai em até 20 min)', 'none yet (next within 20 min)') : L('nenhum (falta o token)', 'none (token missing)'))}</span>`],
    [L('Pedidos', 'Requests'), `<span class="small">${esc(L(`${num(r.n24h) || 0} nas últimas 24 h · aceitos nas últimas 6 h: ${num(r.ok6h) || 0}${num(r.bad6h) ? ` · com erro: ${num(r.bad6h)}` : ''}`, `${num(r.n24h) || 0} in 24 h · accepted in 6 h: ${num(r.ok6h) || 0}`))}</span>`],
  ];
  return `${head}<div class="list">${rows.map(([k, v]) => `<div class="li" style="flex-wrap:wrap"><span class="grow t" style="min-width:170px">${esc(k)}</span><span>${v}</span></div>`).join('')}</div>
    <div class="adm-tok mt"><label class="small b" for="adm-tok">${esc(tokSet ? L('Trocar o token', 'Replace the token') : L('Colar o token do GitHub', 'Paste the GitHub token'))}</label>
      <div class="inp-group"><input class="inp mono" type="password" id="adm-tok" autocomplete="off" spellcheck="false" placeholder="github_pat_…"><button class="btn pri" data-act="admTokSave">${ico('lock', 16)}${esc(L('Salvar token', 'Save token'))}</button></div>
      <div class="row wrap" style="gap:8px;margin-top:8px"><button class="btn sm" data-act="admDispatch" ${tokSet ? '' : 'disabled'}>${ico('send', 15)}${esc(L('Testar agora', 'Test now'))}</button>${tokSet ? `<button class="btn sm ghost" data-act="admTokDel">${esc(L('Remover token', 'Remove token'))}</button>` : ''}</div>
      <p class="tiny faint" style="margin-top:8px;line-height:1.5">${esc(L('O token fica criptografado no Supabase (Vault), não aparece de novo nesta tela e não vai para o código do site. Nunca mande o token por chat ou e-mail. Se ele vazar, apague no GitHub e crie outro.', 'The token is encrypted in Supabase (Vault), never shown again here and never in the site code. Never send it by chat or e-mail.'))}</p></div>
    <details class="li adm-how" ${tokSet ? '' : 'open'} style="display:block"><summary class="t" style="cursor:pointer">${esc(L('Como criar o token no GitHub (2 minutos)', 'How to create the GitHub token (2 minutes)'))}</summary>
      <ol class="adm-steps"><li>${esc(L('Entre no GitHub com a conta iptvquantic e abra:', 'Sign in to GitHub as iptvquantic and open:'))} ${extLink('https://github.com/settings/personal-access-tokens/new', L('criar token (fine-grained)', 'create token (fine-grained)'))}</li>
      <li>${esc(L('Token name: "NEXUS HUB robô". Expiration: "No expiration" (sem validade) — ou a maior data que aparecer.', 'Token name: "NEXUS HUB bot". Expiration: "No expiration" — or the longest available.'))}</li>
      <li>${esc(L('Repository access: "Only select repositories" e escolha Claude_crypto_hub7.0.', 'Repository access: "Only select repositories" → Claude_crypto_hub7.0.'))}</li>
      <li>${esc(L('Permissions: adicione "Actions" com acesso "Read and write". Mais nada.', 'Permissions: add "Actions" with "Read and write". Nothing else.'))}</li>
      <li>${esc(L('Clique em "Generate token" e copie o código (começa com github_pat_).', 'Click "Generate token" and copy it (starts with github_pat_).'))}</li>
      <li>${esc(L('Cole no campo acima, clique em Salvar token e depois em Testar agora. Em alguns segundos deve aparecer "GitHub aceitou".', 'Paste above, Save, then Test now. "GitHub accepted" should show in a few seconds.'))}</li></ol></details>`;
}
function admHtml() { return `${pageHead(PAGES.admin, `<button class="btn sm" data-act="admReload">${ico('refresh-cw', 15)}${esc(L('Atualizar', 'Refresh'))}</button>`)}<div id="adm-body">${skel(6, 20)}</div>`; }
function admDraw() {
  const box = $('#adm-body'); if (!box) return;
  if (ADM.err) { box.innerHTML = `<div class="panel">${emptyBox('triangle-alert', L('Não foi possível abrir o painel', 'Could not open the panel'), esc(ADM.err))}</div>`; return; }
  const o = ADM.ov || {};
  const pipe = ADM.pipe;
  box.innerHTML = `<div class="panel flush"><div class="strip">${[[L('Usuários', 'Users'), o.users], [L('PRO ativos', 'Active PRO'), o.pro_active], [L('Em teste', 'On trial'), o.trial_active], [L('Vencidos', 'Expired'), o.expired], [L('Novos em 7 dias', 'New in 7 days'), o.new_7d], [L('Pedidos pendentes', 'Pending requests'), o.claims_pending], [L('Aportes salvos', 'Saved entries'), o.entries]].map(([k, v]) => `<div><div class="k">${esc(k)}</div><div class="v">${isNum(num(v)) ? esc(fmtNum(num(v), 0, 0)) : '—'}</div></div>`).join('')}</div></div>
  <section class="panel mt">${panelHead('credit-card', L('Pedidos de ativação (já paguei)', 'Activation requests'), { sub: esc(L('Confira o pagamento no PagBank antes de aprovar. Aprovar dá o PRO pelos dias do plano.', 'Check the payment in PagBank before approving. Approving grants PRO for the plan’s days.')) })}
    ${ADM.claims.length ? `<div class="list">${ADM.claims.map((c) => `<div class="li" style="flex-wrap:wrap"><span class="grow" style="min-width:220px"><span class="t" style="display:block">${esc(c.email)} · ${esc(PLAN_NAMES()[c.plan] || c.plan)} (${esc(brl(NX.planPrices[c.plan], [2, 2]))})</span><span class="m">${esc(fmtDateTime(c.created_at))} · ${esc(c.note || '')}</span></span><button class="btn sm pri" data-act="admApprove" data-u="${esc(c.user_id)}" data-p="${esc(c.plan)}">${ico('check', 15)}${esc(L(`Aprovar (+${NX.planDays[c.plan]} dias)`, `Approve (+${NX.planDays[c.plan]} days)`))}</button><button class="btn sm ghost" data-act="admReject" data-c="${esc(c.id)}">${esc(L('Recusar', 'Reject'))}</button></div>`).join('')}</div>` : `<p class="small muted">${esc(L('Nenhum pedido pendente.', 'No pending requests.'))}</p>`}</section>
  <section class="panel flush mt"><div class="panel-h" style="padding:16px 18px 10px;margin:0"><div class="tt"><h2 class="panel-t">${ico('user', 18)}${esc(L('Usuários', 'Users'))}</h2></div><div class="inp-search" style="min-width:min(280px,100%)">${ico('search', 17)}<input class="inp" type="search" id="adm-q" placeholder="${esc(L('Buscar e-mail ou nome', 'Search e-mail or name'))}" value="${esc(ADM.q)}" data-inp="admQ" autocomplete="off" style="height:36px"></div></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(L('Usuário', 'User'))}</th><th>${esc(L('Plano', 'Plan'))}</th><th>${esc(L('Validade', 'Expiry'))}</th><th class="r">${esc(L('Aportes', 'Entries'))}</th><th>${esc(L('Visto por último', 'Last seen'))}</th><th class="r">${esc(L('Ações', 'Actions'))}</th></tr></thead><tbody>${ADM.users.map((u) => {
    const adm = u.plan === 'admin' || u.plan === 'master'; const exp = Date.parse(u.plan_expiry); const valid = exp > Date.now();
    return `<tr style="${u.active ? '' : 'opacity:.55'}"><td><b>${esc(u.email)}</b><div class="tiny faint">${esc(u.name || '')} · ${esc(L('desde', 'since'))} ${esc(fmtDate(u.created_at))}${u.pending_claims ? ` · <span class="up">${esc(L('pedido pendente', 'pending request'))}</span>` : ''}</div></td><td><span class="badge ${adm ? 'pro' : u.plan === 'pro' && valid ? 'pro' : u.plan === 'trial' && valid ? 'live' : 'warn'}">${esc(adm ? L('admin', 'admin') : u.plan)}</span>${u.active ? '' : ` <span class="badge bad">${esc(L('desativado', 'disabled'))}</span>`}</td><td class="${valid || adm ? '' : 'down'}">${adm ? '∞' : esc(fmtDate(exp))}</td><td class="r">${esc(fmtNum(num(u.entries), 0, 0))}</td><td class="muted">${u.last_seen_at ? esc(ago(Date.parse(u.last_seen_at))) : '—'}</td><td class="r nowrap">${adm ? '' : `<div class="rel" style="display:inline-block"><button class="btn xs" data-act="menu" aria-haspopup="menu" aria-expanded="false">${esc(L('Gerenciar', 'Manage'))}${ico('chevron-down', 14)}</button><div class="menu" role="menu">
      ${Object.entries(NX.planDays).map(([k, d]) => `<button class="menu-i" data-act="admPlan" data-u="${esc(u.id)}" data-p="pro" data-d="${d}">${ico('crown', 16)}PRO +${d} ${esc(L('dias', 'days'))} (${esc(PLAN_NAMES()[k])})</button>`).join('')}
      <button class="menu-i" data-act="admPlan" data-u="${esc(u.id)}" data-p="trial" data-d="7">${ico('clock', 16)}${esc(L('Estender teste +7 dias', 'Extend trial +7 days'))}</button>
      <button class="menu-i" data-act="admPlan" data-u="${esc(u.id)}" data-p="free" data-d="">${ico('user', 16)}${esc(L('Mudar para gratuito', 'Set to free'))}</button>
      <div class="menu-sep"></div>
      <button class="menu-i" data-act="admActive" data-u="${esc(u.id)}" data-v="${u.active ? '0' : '1'}">${ico(u.active ? 'lock' : 'check', 16)}${esc(u.active ? L('Desativar conta', 'Disable account') : L('Reativar conta', 'Enable account'))}</button>
      <button class="menu-i" data-act="admReset" data-u="${esc(u.id)}" data-e="${esc(u.email)}">${ico('key-round', 16)}${esc(L('Gerar senha temporária', 'Generate temporary password'))}</button></div></div>`}</td></tr>`;
  }).join('')}</tbody></table></div></section>
  <section class="panel mt">${panelHead('server', L('Robô de dados (GitHub Actions)', 'Data bot (GitHub Actions)'), { sub: esc(L('Traz o que o navegador não consegue (notícias, agenda global, bolsas e índices) e mantém o banco de dados ativo.', 'Fetches what the browser cannot (news, global calendar, indices) and keeps the database awake.')) })}
    ${pipe ? `<div class="small muted">${esc(L('Última execução:', 'Last run:'))} <b>${esc(fmtDateTime(Date.parse(pipe.generatedAt)))}</b> (${esc(ago(Date.parse(pipe.generatedAt)))})${pipe.event ? ` · ${esc(pipeEvent(pipe.event))}` : ''}</div>${pipe.sources && pipe.sources.db && !pipe.sources.db.ok ? `<div class="callout warn mt">${ico('triangle-alert', 18)}<span>${esc(L('Na última execução o robô não conseguiu falar com o banco de dados. Se o Supabase pausou o projeto por falta de uso, abra o painel e clique em "Resume project".', 'On its last run the bot could not reach the database. If Supabase paused the project for inactivity, open the dashboard and click "Resume project".'))} ${extLink('https://supabase.com/dashboard/project/' + NX.supabaseUrl.split('//')[1].split('.')[0], L('Painel do Supabase', 'Supabase dashboard'))}</span></div>` : ''}<div class="list mt">${Object.entries(pipe.sources || {}).map(([k, v]) => `<div class="li"><span class="grow t">${esc(pipeName(k))}</span><span class="small faint">${esc(v.n != null ? v.n + ' ' + L('itens', 'items') : '')}${v.cached || v.kept ? ' · ' + esc(L('lido há pouco, reaproveitado', 'read recently, reused')) : ''}</span><span class="badge ${v.ok ? 'live' : 'bad'}">${esc(v.ok ? 'ok' : (v.err || L('falhou', 'failed')).slice(0, 60))}</span></div>`).join('')}</div>` : `<div class="callout warn">${ico('triangle-alert', 18)}<span>${esc(L('O robô ainda não publicou o arquivo de status. Confira a aba Actions do repositório.', 'The bot has not published its status file yet. Check the repository Actions tab.'))} ${extLink(NX.repoUrl + '/actions', 'GitHub Actions')}</span></div>`}
    <div class="adm-robot mt">${admRobotHtml()}</div></section>`;
}
// nomes das tarefas do robô (status.json) para o painel
function pipeName(k) {
  const n = { news: L('Notícias', 'News'), calendar: L('Agenda econômica', 'Economic calendar'), markets: L('Arquivo de mercados', 'Markets file'), quotes: L('Bolsas e índices', 'Stock indices'), etfs: L('Cotas de ETFs', 'ETF quotes'), etfAum: L('Patrimônio dos ETFs', 'ETF assets'), miners: L('Mineradoras listadas', 'Listed miners'), world: L('Maiores ativos do mundo', 'Largest assets'), lab: L('Histórico on-chain (Bitcoin Lab)', 'On-chain history (Bitcoin Lab)'), buybacks: L('Recompra e queima', 'Buybacks and burns'), whales: L('Baleias (maiores endereços)', 'Whales (largest addresses)'), tokens: L('Tokens reconhecidos (Wallet Watch)', 'Recognized tokens (Wallet Watch)'), db: L('Banco de dados ativo (contas e Vault)', 'Database awake (accounts and Vault)') }[k];
  return n || k;
}
const pipeEvent = (e) => ({ schedule: L('agendamento do GitHub', 'GitHub schedule'), workflow_dispatch: L('pedido (agendador do banco ou botão Run workflow)', 'requested (scheduler or Run workflow)'), push: L('publicação', 'push') }[e] || e);
ACT.admReload = () => admLoad();
// agendador do robô: o token vai direto do navegador do dono para o Vault do Supabase (nunca volta para a tela)
const GH_TOKEN_RE = /^(github_pat_[A-Za-z0-9_]{20,255}|ghp_[A-Za-z0-9]{30,255})$/;
ACT.admTokSave = async (el) => {
  const i = $('#adm-tok'); const v = String((i && i.value) || '').trim();
  if (!GH_TOKEN_RE.test(v)) { toast(L('Isso não parece um token do GitHub (ele começa com github_pat_).', 'That does not look like a GitHub token (starts with github_pat_).'), { type: 'warn', ms: 6000 }); return; }
  el.classList.add('busy');
  try {
    const sb = await sbClient(); const { data, error } = await sb.rpc('admin_robot_set_token', { p_token: v }); if (error) throw error;
    if (!data || !data.ok) throw new Error(data && data.error === 'formato' ? L('formato de token inválido', 'invalid token format') : L('não foi possível salvar', 'could not save'));
    if (i) i.value = '';
    toast(L('Token salvo (criptografado no Supabase). Agora clique em "Testar agora".', 'Token saved (encrypted in Supabase). Now click "Test now".'), { type: 'ok', ms: 6000 });
    admLoad();
  } catch (e) { toast(String(e.message || e), { type: 'err', ms: 7000 }); }
  el.classList.remove('busy');
};
ACT.admTokDel = async () => {
  if (!(await confirmBox(L('Remover o token? O robô volta a rodar só pelo agendamento do GitHub.', 'Remove the token? The bot goes back to GitHub’s schedule only.'), { ok: L('Remover', 'Remove'), danger: true }))) return;
  admRpc('admin_robot_set_token', { p_token: '' }, L('Token removido.', 'Token removed.'));
};
ACT.admDispatch = async (el) => {
  el.classList.add('busy');
  try {
    const sb = await sbClient(); const { data, error } = await sb.rpc('admin_robot_dispatch_now'); if (error) throw error;
    if (!data || !data.ok) throw new Error(data && data.error === 'aguarde' ? L('Aguarde 1 minuto entre um teste e outro.', 'Wait 1 minute between tests.') : data && data.error === 'sem_token' ? L('Salve o token primeiro.', 'Save the token first.') : L('não foi possível disparar', 'could not start'));
    toast(L('Pedido enviado ao GitHub. Conferindo a resposta…', 'Request sent to GitHub. Checking the answer…'), { type: 'ok' });
    setTimeout(() => { if (S.page === 'admin') admLoad(); }, 6000);
  } catch (e) { toast(String(e.message || e), { type: 'err', ms: 7000 }); }
  el.classList.remove('busy');
};
ACT.admQ = debounce((el) => { ADM.q = el.value.trim(); admLoad(); }, 400);
async function admRpc(fn, args, okMsg) {
  try { const sb = await sbClient(); const { error } = await sb.rpc(fn, args); if (error) throw error; toast(okMsg, { type: 'ok' }); admLoad(); }
  catch (e) { toast(String(e.message || e), { type: 'err', ms: 7000 }); }
}
ACT.admApprove = async (el) => { if (await confirmBox(L(`Aprovar e dar PRO por ${NX.planDays[el.dataset.p]} dias?`, `Approve and grant PRO for ${NX.planDays[el.dataset.p]} days?`), { ok: L('Aprovar', 'Approve') })) admRpc('admin_set_plan', { p_user: el.dataset.u, p_plan: 'pro', p_days: NX.planDays[el.dataset.p] }, L('PRO ativado.', 'PRO activated.')); };
ACT.admReject = async (el) => { if (await confirmBox(L('Recusar este pedido (pagamento não encontrado)?', 'Reject this request (payment not found)?'), { ok: L('Recusar', 'Reject'), danger: true })) admRpc('admin_resolve_claim', { p_claim: el.dataset.c, p_status: 'rejected' }, L('Pedido recusado.', 'Request rejected.')); };
ACT.admPlan = (el) => { closeMenus(); const d = el.dataset.d ? +el.dataset.d : null; admRpc('admin_set_plan', { p_user: el.dataset.u, p_plan: el.dataset.p, p_days: d }, L('Plano atualizado.', 'Plan updated.')); };
ACT.admActive = (el) => { closeMenus(); admRpc('admin_set_active', { p_user: el.dataset.u, p_active: el.dataset.v === '1' }, el.dataset.v === '1' ? L('Conta reativada.', 'Account enabled.') : L('Conta desativada.', 'Account disabled.')); };
ACT.admReset = async (el) => {
  closeMenus();
  if (!(await confirmBox(L(`Gerar uma senha temporária para ${el.dataset.e}? A senha atual deixa de funcionar.`, `Generate a temporary password for ${el.dataset.e}? The current one stops working.`), { ok: L('Gerar', 'Generate'), danger: true }))) return;
  try {
    const j = await accountFn({ action: 'admin_reset', user_id: el.dataset.u });
    openModal({ title: L('Senha temporária', 'Temporary password'), body: `<p class="small muted">${esc(L(`Envie para ${j.email} por um canal seguro. Peça para trocar em Configurações › Trocar senha logo após entrar.`, `Send it to ${j.email} securely. Ask them to change it right after signing in.`))}</p><div class="inp-group mt"><input class="inp" id="tmp-pw" readonly value="${esc(j.temp_password)}" style="font-weight:700;letter-spacing:.04em"><button class="btn" id="tmp-cp">${ico('copy', 16)}${esc(L('Copiar', 'Copy'))}</button></div>`, onOpen: (m) => { m.querySelector('#tmp-cp').onclick = async () => { try { await navigator.clipboard.writeText(j.temp_password); toast(L('Copiada.', 'Copied.'), { type: 'ok' }); } catch { m.querySelector('#tmp-pw').select(); } }; } });
  } catch (e) { toast(String(e.message || e), { type: 'err' }); }
};
page({
  id: 'admin', group: 'conta', icon: 'shield-check', pt: 'Administrador', en: 'Admin', admin: true,
  sub: 'Clientes, pedidos de ativação e o robô de dados.', subEn: 'Customers, activation requests and the data bot.',
  init(el) { el.innerHTML = admHtml(); admLoad(); },
  show() { admLoad(); },
});
