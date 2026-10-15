// =====================================================================
// BAIXAR O APP — o NEXUS HUB instala como aplicativo (PWA), igual ao Meu Caixa:
// Android e computador pelo pedido de instalação do navegador; iPhone pelo
// "Adicionar à Tela de Início". Abre em tela cheia, com ícone, e atualiza sozinho.
// =====================================================================
let INSTALL_EVT = null;
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /android/i.test(navigator.userAgent);
const isMobileUA = () => isIOS() || isAndroid();
const canInstall = () => !isStandalone() && (!!INSTALL_EVT || isMobileUA());
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); INSTALL_EVT = e; renderInstallUI(); });
window.addEventListener('appinstalled', () => {
  INSTALL_EVT = null; LS.set('installed', Date.now()); renderInstallUI();
  toast(L('NEXUS HUB instalado! O ícone está na sua tela inicial.', 'NEXUS HUB installed! The icon is on your home screen.'), { type: 'ok', ms: 7000 });
});
async function doInstall() {
  if (INSTALL_EVT) {
    const ev = INSTALL_EVT; INSTALL_EVT = null;
    ev.prompt();
    const r = await ev.userChoice.catch(() => null);
    if (!r || r.outcome !== 'accepted') INSTALL_EVT = null;
    renderInstallUI();
    return;
  }
  go('app');
}
ACT.install = () => doInstall();
ACT.installLater = () => { LS.set('install-later', Date.now()); renderInstallUI(); };
function renderInstallUI() {
  const b = $('#inst-btn');
  if (b) { const show = !isStandalone() && (!!INSTALL_EVT || isMobileUA()); b.hidden = !show; b.title = L('Baixar o app', 'Get the app'); b.setAttribute('aria-label', b.title); }
  const h = $('#d-install'); if (h) setHTML(h, installHint());
  if (S.page === 'app') drawAppPage();
}
// aviso no Dashboard (só no celular, some por 14 dias ao tocar em "Agora não")
function installHint() {
  if (!canInstall() || !isMobileUA()) return '';
  const t = LS.get('install-later', 0); if (t && Date.now() - t < 14 * 86400e3) return '';
  return `<div class="callout info" style="margin-bottom:14px">${ico('download', 18)}<span class="grow">${esc(L('Instale o app do NEXUS HUB: abre direto da tela inicial, em tela cheia, sem precisar entrar no site.', 'Install the NEXUS HUB app: opens from your home screen, full screen, no need to visit the site.'))}</span><span class="row" style="gap:6px;flex-shrink:0"><button class="btn sm pri" data-act="install">${esc(L('Instalar', 'Install'))}</button><button class="btn sm ghost" data-act="installLater">${esc(L('Agora não', 'Not now'))}</button></span></div>`;
}
function drawAppPage() {
  const box = $('#app-body'); if (!box) return;
  if (isStandalone()) {
    box.innerHTML = `<div class="panel hero">${emptyBox('circle-check', L('Você já está usando o app', 'You are already using the app'), esc(L('O NEXUS HUB está instalado neste aparelho. Ele se atualiza sozinho sempre que houver versão nova.', 'NEXUS HUB is installed on this device. It updates itself whenever there is a new version.')))}</div>`;
    return;
  }
  const plat = isIOS() ? 'ios' : isAndroid() ? 'android' : 'pc';
  const cards = {
    android: [ico('download', 20), 'Android', [
      L('Abra este site no <b>Google Chrome</b>.', 'Open this site in <b>Google Chrome</b>.'),
      L('Toque em <b>Instalar o app</b> aqui em cima ou, no menu <b>⋮</b> do Chrome, em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).', 'Tap <b>Install app</b> above or, in Chrome’s <b>⋮</b> menu, <b>Install app</b> (or <b>Add to Home screen</b>).'),
      L('Confirme em <b>Instalar</b>. O ícone do NEXUS HUB aparece na tela inicial e na lista de apps.', 'Confirm with <b>Install</b>. The NEXUS HUB icon appears on your home screen and app list.')]],
    ios: [ico('download', 20), 'iPhone e iPad', [
      L('Abra este site no <b>Safari</b>.', 'Open this site in <b>Safari</b>.'),
      L('Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).', 'Tap <b>Share</b> (the square with an up arrow).'),
      L('Escolha <b>Adicionar à Tela de Início</b> e toque em <b>Adicionar</b>.', 'Choose <b>Add to Home Screen</b> and tap <b>Add</b>.')]],
    pc: [ico('monitor', 20), L('Computador', 'Computer'), [
      L('Use o <b>Chrome</b> ou o <b>Edge</b>.', 'Use <b>Chrome</b> or <b>Edge</b>.'),
      L('Clique em <b>Instalar o app</b> aqui em cima ou no ícone de instalar na barra de endereço.', 'Click <b>Install app</b> above or the install icon in the address bar.'),
      L('O NEXUS HUB abre na própria janela, como um programa, e pode ficar fixo na barra de tarefas.', 'NEXUS HUB opens in its own window, like a program, and can be pinned to the taskbar.')]],
  };
  const order = [plat, ...['android', 'ios', 'pc'].filter((x) => x !== plat)];
  const card = (k, first) => { const [icn, title, steps] = cards[k]; return `<div class="panel" style="${first ? 'border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset' : 'background:var(--panel-2);border-color:transparent'}"><div class="row" style="gap:10px;margin-bottom:10px">${icn}<b style="font-size:16px">${esc(title)}</b>${first ? `<span class="badge pro">${esc(L('seu aparelho', 'your device'))}</span>` : ''}</div><ol style="padding-left:20px;display:flex;flex-direction:column;gap:8px" class="small muted">${steps.map((st) => `<li style="line-height:1.55">${st}</li>`).join('')}</ol></div>`; };
  box.innerHTML = `<section class="panel hero"><div class="row wrap between" style="gap:20px;align-items:center">
      <div style="max-width:620px"><h2 style="font-size:24px;font-weight:800;line-height:1.2">${esc(L('Leve o NEXUS HUB no bolso', 'Take NEXUS HUB with you'))}</h2>
      <p class="muted mt" style="line-height:1.6">${esc(L('Instale o app e abra direto da tela inicial, em tela cheia, sem digitar o endereço do site. É o mesmo NEXUS HUB: mesma conta, mesma carteira e os mesmos números ao vivo.', 'Install the app and open it from your home screen, full screen, without typing the address. It is the same NEXUS HUB: same account, same portfolio, same live numbers.'))}</p></div>
      <div class="stack" style="gap:8px;align-items:flex-start">${INSTALL_EVT ? `<button class="btn pri" data-act="install" style="height:48px;padding:0 22px;font-size:16px">${ico('download', 19)}${esc(L('Instalar o app agora', 'Install the app now'))}</button>` : `<span class="small muted">${esc(plat === 'ios' ? L('No iPhone, a instalação é feita pelo Safari (veja os passos abaixo).', 'On iPhone, install from Safari (see the steps below).') : L('Se o botão de instalar não aparecer, siga os passos do seu aparelho abaixo.', 'If no install button shows up, follow the steps for your device below.'))}</span>`}
      <span class="tiny faint">${esc(L('Grátis · sem Play Store · ocupa menos de 2 MB', 'Free · no app store · under 2 MB'))}</span></div></div></section>
    <div class="grid g-3 mt">${order.map((k, i) => card(k, i === 0)).join('')}</div>
    <section class="panel mt">${panelHead('info', L('Por que é seguro', 'Why it is safe'))}<div class="list">${[
      [L('Sem permissões extras', 'No extra permissions'), L('O app não acessa contatos, fotos, câmera nem localização.', 'The app does not access contacts, photos, camera or location.')],
      [L('Sempre atualizado', 'Always up to date'), L('Não precisa baixar atualização: ao abrir com internet, ele já está na versão mais nova.', 'No updates to download: when opened online, it is already on the latest version.')],
      [L('Mesmos dados do site', 'Same data as the site'), L('Entre com a mesma conta e veja sua carteira no celular e no computador.', 'Sign in with the same account and see your portfolio on phone and computer.')],
      [L('Para remover', 'To remove'), L('Desinstale como qualquer app: segure o ícone e escolha Remover / Desinstalar.', 'Uninstall like any app: long-press the icon and choose Remove / Uninstall.')],
    ].map(([t, d]) => `<div class="li" style="align-items:flex-start">${ico('check', 18)}<span class="grow"><span class="t" style="display:block">${esc(t)}</span><span class="m" style="font-size:13px">${esc(d)}</span></span></div>`).join('')}</div></section>`;
}
page({
  id: 'app', group: 'conta', icon: 'download', pt: 'Baixar o app', en: 'Get the app', hidden: isStandalone(),
  sub: 'Instale o NEXUS HUB no celular ou no computador e abra como um aplicativo.', subEn: 'Install NEXUS HUB on your phone or computer and open it like an app.',
  init(el) { el.innerHTML = `${pageHead(PAGES.app, '')}<div id="app-body"></div>`; drawAppPage(); },
  show() { drawAppPage(); },
});
// no menu, "Baixar o app" fica antes de Configurações
PAGE_ORDER.splice(PAGE_ORDER.indexOf('settings'), 0, PAGE_ORDER.pop());
