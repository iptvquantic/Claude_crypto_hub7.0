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

## Robô de dados
- `scripts/atualizar-dados.mjs` publica `news.json`, `calendar.json`, `markets.json`, `status.json` no ramo órfão `data` (force-push). O site lê por `raw.githubusercontent.com`; se o arquivo estiver velho, busca direto. Também mantém o banco ativo (ping) — falha no ping nunca derruba a execução.
- Teste sem internet: `node dev/test-robot.mjs`.

## Antes de publicar
`node dev/build.mjs --beta && node dev/test-app.mjs && node dev/test-robot.mjs`, conferir `/beta/` no navegador real, então `node dev/build.mjs` (raiz).
