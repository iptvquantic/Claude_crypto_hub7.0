# NEXUS HUB — notas para quem for mexer no código

Responda ao dono em português do Brasil, direto. Ele não programa: entregue pronto, testado e publicado.

## Regras inegociáveis
1. Nenhum dado inventado: AO VIVO (fonte + hora), REFERÊNCIA (rotulada, com fonte e data) ou AUSENTE ("—"). Nunca fallback numérico fixo.
2. Tudo se atualiza sozinho; eventos são guiados pela data de hoje (o próximo assume quando um passa).
3. Nunca quebrar o que funciona: publique primeiro em `beta/`, teste, depois promova para a raiz.

## Estrutura
- `src/js/NN-*.js` são concatenados em ordem por `dev/build.mjs` dentro de `src/index.template.html` (um `<script>` inline com hash na CSP). Não edite `index.html` nem `beta/index.html` à mão.
- Cada página chama `page({...})`; a ordem dos arquivos define a ordem do menu (o Dashboard é o primeiro).
- Fontes de dados: `source({ id, every, need, run, validate, onData })` em `04-data.js` (agendador único, pausa com aba oculta, último valor válido no `CACHE`, selo `stamp(id)`).
- Mudanças de dado avisam as telas por `_markDirty(chave)` → `onPrice(set => ...)`.
- Interação só por `data-act` / `data-chg` / `data-inp` (sem `onclick` inline: a CSP bloqueia).
- Texto externo sempre por `esc()`; links por `safeUrl()`.
- `localStorage` do domínio é compartilhado com o Meu Caixa: prefixo `nx3:` e nada grande (o `CACHE` só guarda < 40 KB).

## Backend (Supabase `ccgpmnqlqsuetqindwkb`, sa-east-1)
- Esquema em `dev/supabase/schema.sql` (RLS, gatilhos de proteção, RPCs de admin). No código do site só vai a chave publicável.
- Cadastro pela função `signup` (conta já confirmada; SMTP padrão do Supabase não envia para clientes). Exclusão de conta e senha temporária pela função `account`.
- Plano e validade só mudam no servidor (`admin_set_plan`). Admin = e-mail na tabela privada `app_admins`.
- Plano grátis: o Supabase pausa o projeto após ~7 dias sem consultas e não oferece download de backup. O robô chama `rpc/ping` a cada execução para manter o projeto ativo (status `db` no painel do admin).
- Migrações novas: aplicar e registrar em `dev/supabase/` e rodar `bash dev/supabase/test-db.sh`. REVOKE/GRANT (permissões) pelo conector pode ser bloqueado pela verificação de segurança da sessão (a 05 foi, em 13/11): separar esse trecho e entregar ao dono, logo no início da entrega, o bloco pronto para colar no SQL Editor.
- Agendador do robô: `migrations/03_agendador_robo.sql` (pg_cron nos minutos 2/22/42 → `private.robo_disparar()` → workflow_dispatch no GitHub com o segredo `github_dispatch_token` do Vault). O dono cola o token no Painel do administrador (RPCs `admin_robot_status/_set_token/_dispatch_now`); o token nunca volta para a tela. Em 22/10 a aplicação pelo conector foi cancelada duas vezes: o painel mostra como instalar pelo SQL Editor.

- Alertas no celular (Web Push), migração `migrations/04_alertas.sql` (aplicada em 06/11): tabelas `push_devices`, `price_alerts`, `event_alerts`, `alert_log`, `alerts_status` e `private.alerts_keys` (chave do agendador gerada no banco e par VAPID gerado pela própria função na primeira chamada — nenhuma chave passa pelo código ou pelo chat). O pg_cron (`nexus-alertas`, a cada minuto) chama a Edge Function `alerts` (`dev/supabase/functions/alerts/`: `webpush.js` = VAPID + aes128gcm só com WebCrypto; `core.js` = regras e textos), que lê Binance/CoinGecko, dispara e envia; isso também mantém o banco ativo. Limite: grátis 3 alertas de preço ativos, PRO 30 (gatilho `price_alerts_guard`). Testes: `node dev/test-alerts.mjs` (criptografia conferida com `http_ece`) e `dev/supabase/test/alerts.sql` (dentro do `test-db.sh`). Desligar: `select cron.unschedule('nexus-alertas');`.
- Alertas, reforço (`migrations/05_alertas_reforco.sql`, aplicada em 13/11; o bloco de permissões do fim o dono aplicou pelo SQL Editor em 14/11): `push_devices.endpoint` só aceita os serviços de push conhecidos (Google, Mozilla, Apple, WNS — a mesma lista em `pushHostOk` do `webpush.js`); `nexus-limpa-agendador` apaga todo dia o `cron.job_run_details` com mais de 2 dias. A função lê tudo paginado (`all()`), tenta de novo em falha passageira e ignora cotação com mais de 2 h. Teste da função inteira: `node --experimental-strip-types --no-warnings dev/test-alerts-fn.mjs`. Auto-teste de ponta a ponta em produção (Mozilla autopush, não toca em clientes): `select net.http_post(url := '<projeto>/functions/v1/alerts', body := '{"mode":"probe"}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select cron_key from private.alerts_keys where id = 1)), timeout_milliseconds := 40000);` e ler `net._http_response` (`"match":true` = aceito, entregue e aberto). Publicar a função: os 4 arquivos de `functions/alerts/` pelo conector (`verify_jwt` false) e conferir `?health=1` (`v`).

## Robô de dados
- `scripts/atualizar-dados.mjs` publica `news.json`, `calendar.json`, `markets.json`, `status.json` no ramo órfão `data` (force-push). O site lê por `raw.githubusercontent.com`; se o arquivo estiver velho, busca direto. Também mantém ativos o banco do NEXUS (`rpc/ping`) e o do Meu Caixa (projeto `meu-caixa-br`, pela função `whatsapp?health=1`, sem chave; status `dbMc`) e acorda as APIs do LicitaFácil e do CREDIX no Render no máximo a cada ~5 h (`appLicitafacil`/`appCredix`, para os bancos delas não pausarem sem gastar as 750 h grátis do Render) — falha nunca derruba a execução.
- Teste sem internet: `node dev/test-robot.mjs` (3 execuções: normal, banco pausado e "20 min depois", com os arquivos anteriores).
- O que muda devagar não é lido a cada execução (`freshAt`): companiesmarketcap no máximo a cada 1–2 h, recompras 3 h, baleias 6 h, tokens 20 h. Cotações sempre.
- BGeometrics (bitcoin-data.com, grátis: ~10 pedidos/h por IP): teto de 5 por execução (`BD_BUDGET`, Lab 3 + baleias 2). Lab guarda também lucro/prejuízo realizados (todos/LTH/STH, US$ milhões, prejuízo negativo). Baleias: `whales.json` tem `top`/`dist` (BitInfoCharts, data em `topAt`) e `bg` (faixas da BGeometrics, a cada 3 dias). `calhist.json`: histórico de 2 anos dos indicadores de alto impacto (TradingView, EUA e BR), renovado por semana.
- CoinGecko grátis (tokens): 7 s entre as páginas; no 429 espera 65 s e tenta de novo (até 4 vezes, teto de 4 min — o job tem 12 min). BitInfoCharts (baleias) responde 403 ao robô desde 19/10/2026: o site mostra a última leitura com a data e, depois de 21 dias, o link da fonte.

## Eventos do mercado (`17b-events.js`)
- Junta `allEvents()` (calendários oficiais + robô) com eventos cripto: vencimentos da Deribit (API pública, CORS liberado; só os acima de US$ 1 bi), ajuste de dificuldade e halving (mempool.space). Famílias (`EV_FAM`) ligam cada evento ao histórico do `calhist.json`; a reação do BTC usa velas de 5 min da Binance a partir do minuto da divulgação (guardada em `nx3:ev-react`, até 300 itens).
- Burn, Baby, Burn é PRO desde a 3.5.0 (fonte `buybacks` só roda para PRO).

## Wallet Watch (grátis)
- `19b-wallets-core.js`: bloco puro entre `==WWC-START==`/`==WWC-END==` (hashes, base58/bech32, secp256k1 só público, BIP32 xpub, EIP-55, ENS, TON e `wwDetect`, que BLOQUEIA frase-semente/chave privada) testado no Node por `dev/test-wallets.mjs`; depois dele, os leitores de cada rede (`WW_READERS`) e os preços.
- `19c-wallets.js`: estado (`nx3:ww`, `ww-read`, `ww-ev`, `ww-hist` — só no navegador, nunca no servidor), tela e fontes `ww-tok`/`ww-bal`/`ww-px` (só com a página aberta).
- Tokens EVM/Solana/Tron/TON só entram se estiverem no `tokens.json` do robô (ou verificados pela Jupiter/TonAPI): nada de token desconhecido (spam) na tela.
- Fontes simuladas para teste em `dev/wallet-fixtures.mjs` (endereços de teste em `WT`).

## Gráficos (`07-charts.js`)
- `makeChart(el, { grip, free, hover })`: datas sempre visíveis; alça de altura embaixo de cada gráfico (salva em `nx3:chh` pelo id do elemento — todo gráfico precisa de `id`); arrastar na vertical move o preço e mostra o botão "Auto" (`free: false` no menu Gráfico, que tem o seu próprio). Etiqueta do nome da linha, legendas e cruz sincronizada rodam uma vez por quadro (`onCross`, `quickHTML`) e somem durante o arraste (`CHART_DRAG`/`chartBusy`). Medir fluidez: `node dev/perf-chart.mjs lab|chart [--prof]`.

## Antes de publicar
`node dev/build.mjs --beta && node dev/test-app.mjs && node dev/test-robot.mjs && node dev/test-wallets.mjs`, conferir `/beta/` no navegador real, então `node dev/build.mjs` (raiz).
Mexeu em CSS do menu ou em cores? `node dev/check-menu.mjs` (menu cabe sem rolar em 5 tamanhos de tela) e `node dev/shot-theme.mjs light` (capturas em `dev/out/`). Contraste mínimo: 4,5:1 em todos os temas.

## Documentos do projeto
`PROJETO_CONTEXTO.md` e `RELATORIO_FASES_1-3.md` ficam no Conhecimento do Projeto no claude.ai (e numa cópia na pasta Crypto Hub do dono — desde 06/11 em `Desktop\Projetos novos\Crypto Hub`), não neste repositório. Atualize-os ao fim de cada entrega.
Desta sessão na nuvem o push de tags é recusado; as versões ficam no `CHANGELOG.md` e no histórico.
