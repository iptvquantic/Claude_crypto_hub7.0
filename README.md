# NEXUS HUB

Painel em português de cripto e mercado, ao vivo: preços, on-chain, juros (Fed e Copom), agenda econômica, Polymarket, notícias e a carteira **Portfolio Vault** (PRO). Cada número mostra a fonte e a hora da leitura.

- Site: https://iptvquantic.github.io/Claude_crypto_hub7.0/
- Apresentação (vendas): https://iptvquantic.github.io/Claude_crypto_hub7.0/landing.html
- Versão de teste: https://iptvquantic.github.io/Claude_crypto_hub7.0/beta/

## Como funciona

| Parte | Onde fica | O que faz |
|---|---|---|
| Site (app) | `index.html` (gerado a partir de `src/`) | Tudo roda no navegador. Preços da Binance por WebSocket, demais dados direto das fontes públicas. |
| Contas e Vault | Supabase (projeto `nexus-hub`, São Paulo) | Login, plano/teste de 15 dias, aportes. Regras de acesso no servidor: cada conta só vê os próprios dados. |
| Robô de dados | `.github/workflows/atualizar-dados.yml` + `scripts/atualizar-dados.mjs` | A cada ~20 min busca notícias, agenda econômica global (com resultado), bolsas, ETFs e o ranking mundial, e publica no ramo `data`. Se falhar, o site busca direto nas fontes. |
| App no celular | `manifest.webmanifest` + `sw.js` | Instala como aplicativo (Android, iPhone e computador), sem Play Store. |

## Tarefas do dia a dia (dono)

- **Liberar um PRO pago:** entre com a sua conta → menu da conta → *Painel do administrador* → *Pedidos de ativação* → confira no PagBank → **Aprovar**.
- **Senha esquecida de cliente:** Painel do administrador → usuário → *Gerar senha temporária*; envie por um canal seguro.
- **Robô de dados:** aba *Actions* do GitHub → *Atualizar dados* → *Run workflow* para rodar na hora. O status aparece no Painel do administrador.

## Para desenvolver (Node 20+)

```bash
cd dev && npm install          # só para os testes
node dev/build.mjs --beta      # gera beta/ (teste)
node dev/test-app.mjs --shots  # teste em Chromium (computador, celular, conta, Vault, admin, app instalável)
node dev/test-robot.mjs        # teste do robô de dados sem internet
node dev/build.mjs             # gera o site principal (raiz)
bash dev/supabase/test-db.sh   # testes do banco (Postgres local)
```

Regras do projeto: nenhum número inventado (ao vivo com fonte e hora, referência rotulada ou "—"); tudo se atualiza sozinho; nunca quebrar o que funciona.
