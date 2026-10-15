# Mudanças

## 3.0.1 — 15/10/2026
- **Banco de dados sempre ativo:** o plano grátis do Supabase pausa o projeto depois de ~7 dias sem uso (login e Vault parariam). O robô de dados agora faz uma consulta mínima a cada execução e, como reforço, cada navegador que abre o site faz no máximo uma por dia (anônima, sem dado pessoal; política de privacidade atualizada). O Painel do administrador mostra se o banco respondeu, com o caminho para reativar caso ele pause.
- **Painel do administrador:** status do robô com nomes claros (Notícias, Agenda econômica, Bolsas e índices…).
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
