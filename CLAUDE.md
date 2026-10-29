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
- Migrações novas: aplicar e registrar em `dev/supabase/` e rodar `bash dev/supabase/test-db.sh`. `migrations/02_permissoes.sql` tem REVOKE: o dono aplica pelo SQL Editor.
- Agendador do robô: `migrations/03_agendador_robo.sql` (pg_cron nos minutos 2/22/42 → `private.robo_disparar()` → workflow_dispatch no GitHub com o segredo `github_dispatch_token` do Vault). O dono cola o token no Painel do administrador (RPCs `admin_robot_status/_set_token/_dispatch_now`); o token nunca volta para a tela. Em 22/10 a aplicação pelo conector foi cancelada duas vezes: o painel mostra como instalar pelo SQL Editor.

## Robô de dados
- `scripts/atualizar-dados.mjs` publica `news.json`, `calendar.json`, `markets.json`, `status.json` no ramo órfão `data` (force-push). O site lê por `raw.githubusercontent.com`; se o arquivo estiver velho, busca direto. Também mantém ativos o banco do NEXUS (`rpc/ping`) e o do Meu Caixa (projeto `meu-caixa-br`, pela função `whatsapp?health=1`, sem chave; status `dbMc`) e acorda as APIs do LicitaFácil e do CREDIX no Render no máximo a cada ~5 h (`appLicitafacil`/`appCredix`, para os bancos delas não pausarem sem gastar as 750 h grátis do Render) — falha nunca derruba a execução.
- Teste sem internet: `node dev/test-robot.mjs` (3 execuções: normal, banco pausado e "20 min depois", com os arquivos anteriores).
- O que muda devagar não é lido a cada execução (`freshAt`): companiesmarketcap no máximo a cada 1–2 h, recompras 3 h, baleias 6 h, tokens 20 h. Cotações sempre.
- CoinGecko grátis (tokens): 7 s entre as páginas; no 429 espera 65 s e tenta de novo (até 4 vezes, teto de 4 min — o job tem 12 min). BitInfoCharts (baleias) responde 403 ao robô desde 19/10/2026: o site mostra a última leitura com a data e, depois de 21 dias, o link da fonte.

## Wallet Watch (grátis)
- `19b-wallets-core.js`: bloco puro entre `==WWC-START==`/`==WWC-END==` (hashes, base58/bech32, secp256k1 só público, BIP32 xpub, EIP-55, ENS, TON e `wwDetect`, que BLOQUEIA frase-semente/chave privada) testado no Node por `dev/test-wallets.mjs`; depois dele, os leitores de cada rede (`WW_READERS`) e os preços.
- `19c-wallets.js`: estado (`nx3:ww`, `ww-read`, `ww-ev`, `ww-hist` — só no navegador, nunca no servidor), tela e fontes `ww-tok`/`ww-bal`/`ww-px` (só com a página aberta).
- Tokens EVM/Solana/Tron/TON só entram se estiverem no `tokens.json` do robô (ou verificados pela Jupiter/TonAPI): nada de token desconhecido (spam) na tela.
- Fontes simuladas para teste em `dev/wallet-fixtures.mjs` (endereços de teste em `WT`).

## Antes de publicar
`node dev/build.mjs --beta && node dev/test-app.mjs && node dev/test-robot.mjs && node dev/test-wallets.mjs`, conferir `/beta/` no navegador real, então `node dev/build.mjs` (raiz).
Mexeu em CSS do menu ou em cores? `node dev/check-menu.mjs` (menu cabe sem rolar em 5 tamanhos de tela) e `node dev/shot-theme.mjs light` (capturas em `dev/out/`). Contraste mínimo: 4,5:1 em todos os temas.

## Documentos do projeto
`PROJETO_CONTEXTO.md` e `RELATORIO_FASES_1-3.md` ficam no Conhecimento do Projeto no claude.ai (e numa cópia na pasta Crypto Hub do dono), não neste repositório. Atualize-os ao fim de cada entrega.
Desta sessão na nuvem o push de tags é recusado; as versões ficam no `CHANGELOG.md` e no histórico.
