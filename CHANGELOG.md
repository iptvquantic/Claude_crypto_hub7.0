# Mudanças

## 3.1.0 — 16/10/2026 (em andamento)
- **Faixa do topo rolando de novo**, agora com os destaques do dia: maiores altas e baixas das 100 maiores criptomoedas (sem stablecoins), além de BTC, ETH, SOL, BNB, XRP, dólar, ouro e prata. Ela parava no Windows com os "efeitos de animação" desligados; agora só para se você desligar em Configurações › Aparência.
- **Dashboard sem o mapa de calor**; maiores altas e baixas passam a usar o Top 100.
- **Menu com ícones coloridos** (cada página com a sua cor; a atual fica preenchida) e **letras maiores dentro dos quadros**.
- **Menu inteiro sem rolar em qualquer altura de tela de computador**: a altura dos itens é calculada pelo espaço disponível.
- **Robô de dados:** histórico on-chain do BTC, recompra e queima por token, 100 maiores endereços de BTC e geopolítica de 7 dias (acumula entre execuções, só veículos reconhecidos, acentos corrigidos); segunda grade de horários para cobrir quando o GitHub pula execuções.
- **Banco:** permissões extras aplicadas (visitante sem login só chama o sinal de vida).
- **Suporte pelo WhatsApp (22) 99105-3813** (o mesmo do Meu Caixa): em "Esqueci a senha" (com mensagem pronta), em Configurações › Sobre, nos Termos e na Política de privacidade.
- **Bitcoin Lab (PRO) refeito:**
  - **Sinais do ciclo:** 11 sinais de fundo (acumulação) e 10 de topo (distribuição) lidos agora — MVRV, STH/LTH MVRV, Mayer Multiple, 200W SMA, média de 2 anos, Puell, LTH-SOPR, AVIV, Hash Ribbons, Fear & Greed, MVRV Z-Score, Pi Cycle, Terminal Price — cada um com limiar, estado (ativo, extremo, perto, inativo), preço-gatilho, fonte e data. Resumo "X/11" com o território (baixo risco, acumulação, aquecido, risco alto) e a posição no ciclo.
  - **Gráfico novo:** lista de 40 indicadores ao lado do gráfico, com busca pelo nome e categorias (médias, valor on-chain, detentores, mineração, rede e corretoras, sentimento); cada indicador mostra o valor de hoje e a leitura. Os de preço viram linhas sobre o preço; os demais abrem painéis embaixo, sincronizados (até 4).
  - **Modo "Níveis de sinal":** linhas tracejadas nos preços que ativariam cada sinal de fundo ou de topo, com a tabela de distâncias.
  - **Controle do gráfico:** arrastar, roda do mouse/pinça para zoom, botões de aproximar/afastar/voltar, períodos 6M a "Tudo" (desde 2010), escala log, alça para mudar a altura e tela cheia (Esc sai).
  - **Janela de cada indicador:** o que é, como ler, fonte e data, sinais ligados e tabela de máximos e mínimos por ciclo de halving.
  - **Nomes como o mercado usa** (Realized Price, MVRV Z-Score, Mayer Multiple, 200W SMA, Pi Cycle Top, NUPL, SOPR, Puell Multiple, Hash Ribbons…), com a explicação em português.
  - Dados: histórico diário do robô (Coin Metrics desde 2010, BGeometrics e alternative.me); se o robô atrasar, a Coin Metrics é lida direto.
- **Robô:** endereços com saldo (Coin Metrics) e histórico da BGeometrics que cresce a cada dia (o plano grátis só entrega 4 anos).

## 3.0.1 — 15/10/2026
- **Banco de dados sempre ativo:** o plano grátis do Supabase pausa o projeto depois de ~7 dias sem uso (login e Vault parariam). O robô de dados agora faz uma consulta mínima a cada execução e, como reforço, cada navegador que abre o site faz no máximo uma por dia (anônima, sem dado pessoal; política de privacidade atualizada). O Painel do administrador mostra se o banco respondeu, com o caminho para reativar caso ele pause.
- **Painel do administrador:** status do robô com nomes claros (Notícias, Agenda econômica, Bolsas e índices…).
- **Menu inteiro sem rolar em notebooks:** em telas baixas (1366×768, 1920×1080 com zoom de 125%, 1280×720) o menu fica mais compacto e cabe por completo, inclusive com o Painel do administrador. Medido por `dev/check-menu.mjs`.
- **Medo e ganância:** no painel estreito, os 7 dias mostram data e número (o nome aparece ao passar o mouse), sem palavras cortadas.
- **Contraste:** cores de alta/queda, selos (ao vivo, referência, modelo, atrasado) e o índice de medo e ganância agora passam do mínimo de legibilidade (4,5:1) em todos os temas — antes o tema claro tinha selos fracos.
- **Permissões extras (migração 02, aplicada pelo dono):** visitante sem login só consegue chamar o sinal de vida do banco; resolve os avisos do Security Advisor do Supabase.

## 3.0.0 — 15/10/2026
Reconstrução completa do NEXUS HUB.

- **Dados reais em tudo:** cada painel mostra a fonte e a hora da leitura; sem número fixo disfarçado. Quando uma fonte cai, aparece o último valor válido com o horário, ou "—".
- **Menu:** Dashboard em primeiro, grupos Mercado, Análise, Macro e eventos, Notícias e Sua conta; o menu não fica mais escondido atrás do cabeçalho.
- **Dashboard:** cards editáveis de qualquer moeda (trocar, mover, remover, adicionar), mercado total, dominância com variação de 24 h, stablecoins, DeFi, medo e ganância com 7 dias, RSI do BTC e do ETH, mapa de calor próprio, maiores altas e baixas, em alta, próximos eventos e retornos mensais em UTC com o mês atual ao vivo.
- **Moedas paradas** (pares suspensos na Binance) saem sozinhas da lista; nenhum preço congelado.
- **On-chain:** rede ao vivo, halving e oferta pela altura do bloco, MVRV e preço realizado (Coin Metrics), Mayer, média de 200 semanas, Pi Cycle, CVDD e MVRV de curto prazo.
- **Bitcoin Lab (PRO):** gráfico de ciclo desde 2012 com indicadores reais e posição no ciclo (modelo explicado).
- **Tokenomics (PRO):** oferta, diluição, distância do topo, receita e repasse aos detentores (DefiLlama), incidentes de segurança e notícias da moeda.
- **Juros:** Fed e Copom ao vivo; resultado das últimas reuniões calculado pelos dados oficiais; contagem regressiva; apostas do Polymarket para o Fed.
- **Agenda econômica:** estilo investing.com (hora, país, impacto, atual, previsão, anterior), com calendários oficiais, IBGE ao vivo e o calendário global do robô; o que passou sai sozinho.
- **Notícias em português** (e as principais de cripto em inglês) atualizando a cada 5 min; linha do tempo de geopolítica por conflito.
- **Portfolio Vault na nuvem:** login real, sincroniza PC e celular, compra e venda com custo médio, resultado realizado e em aberto, evolução do patrimônio em R$ ou US$ (dólar PTAX do dia), gráfico com marcações, exportar CSV/JSON, importar, e importação da versão antiga.
- **Planos:** checkout PagBank + "Já paguei"; ativação pelo Painel do administrador.
- **Baixar o app:** instala no Android, iPhone e computador, igual ao Meu Caixa.
- **Segurança e privacidade:** senha do admin removida do código público, CSP com hash, bibliotecas com integridade (SRI), regras de acesso no banco, política de privacidade e termos (LGPD), exclusão de conta pelo próprio usuário.
- **Robô de dados** no GitHub Actions a cada ~20 min, com status no painel do administrador.
