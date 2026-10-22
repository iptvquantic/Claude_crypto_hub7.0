'use strict';
// =====================================================================
// NEXUS HUB 3 — configuração
// Regra nº 1: todo número exibido é AO VIVO (com fonte e hora), REFERÊNCIA (rotulada,
// com fonte e data de conferência) ou AUSENTE ("—"). Nada de constante disfarçada de dado.
// =====================================================================
const NX = {
  version: '3.3.0',
  build: '__BUILD__',
  // Supabase (login e Portfolio Vault). Só a chave PUBLICÁVEL fica no código; a de serviço vive no servidor.
  supabaseUrl: 'https://ccgpmnqlqsuetqindwkb.supabase.co',
  supabaseKey: 'sb_publishable_O-IF8C1MFkpPJXRja5m2rA_Ny_XDDMW',
  // Dados gerados pelo robô (GitHub Actions) no ramo "data" do repositório
  dataBase: 'https://raw.githubusercontent.com/iptvquantic/Claude_crypto_hub7.0/data/',
  repoUrl: 'https://github.com/iptvquantic/Claude_crypto_hub7.0',
  aiModel: 'claude-sonnet-5-5',
  aiModelFast: 'claude-haiku-5-5',
  checkout: {
    mensal: 'https://pagamento.pagbank.com.br/pagamento?code=7ba02f5b-0a34-404e-9c6c-3318616aed7f&t=6b32d181-7db3-4872-8afc-74f98d565312',
    trimestral: 'https://pagamento.pagbank.com.br/pagamento?code=93aa7511-3a7c-4aed-b74e-dd90d92a24ae&t=17f88256-5be6-42c3-831a-68a9269bc916',
    anual: 'https://pagamento.pagbank.com.br/pagamento?code=d0900f17-002a-469a-a025-69aca77eb3fe&t=91d4ceb1-6059-496a-907e-41a4ff0e15a7',
  },
  planPrices: { mensal: 14.90, trimestral: 39.90, anual: 149.90 },
  planDays: { mensal: 31, trimestral: 92, anual: 366 },
  trialDays: 15,
  support: '(22) 99105-3813',                 // WhatsApp de suporte (o mesmo do Meu Caixa)
  supportUrl: 'https://wa.me/5522991053813',
};
// Bibliotecas externas: versão fixa + integridade (SRI). Se o 1º endereço falhar, tenta o 2º.
const LIBS = {
  sb: {
    global: 'supabase',
    sri: 'sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok',
    urls: ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js',
      'https://unpkg.com/@supabase/supabase-js@2.117.2/dist/umd/supabase.js'],
  },
  lwc: {
    global: 'LightweightCharts',
    sri: 'sha384-stKllnUqA9AD0gsKCuUtf5XlqAW7PwIgDagoNsTWkjkBmJ/GZ/uHTgEBxdLV2VSK',
    urls: ['https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js',
      'https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js'],
  },
};

// Universo de moedas com preço AO VIVO da Binance (pares conferidos como TRADING em 15/10/2026).
// O app confere de novo a cada 24 h (exchangeInfo) e esconde sozinho par suspenso — nunca mostra preço parado.
// cg = id no CoinGecko (logo, supply, tokenomics). c = cor de apoio.
const UNIVERSE = [
  ['BTCUSDT', 'BTC', 'Bitcoin', 'bitcoin', '#f7931a'],
  ['ETHUSDT', 'ETH', 'Ethereum', 'ethereum', '#627eea'],
  ['SOLUSDT', 'SOL', 'Solana', 'solana', '#9945ff'],
  ['BNBUSDT', 'BNB', 'BNB', 'binancecoin', '#f3ba2f'],
  ['XRPUSDT', 'XRP', 'XRP', 'ripple', '#3d7fd9'],
  ['DOGEUSDT', 'DOGE', 'Dogecoin', 'dogecoin', '#c2a633'],
  ['ADAUSDT', 'ADA', 'Cardano', 'cardano', '#2a71d0'],
  ['TRXUSDT', 'TRX', 'TRON', 'tron', '#e5383b'],
  ['HYPEUSDT', 'HYPE', 'Hyperliquid', 'hyperliquid', '#3ee0b0'],
  ['LINKUSDT', 'LINK', 'Chainlink', 'chainlink', '#375bd2'],
  ['AVAXUSDT', 'AVAX', 'Avalanche', 'avalanche-2', '#e84142'],
  ['SUIUSDT', 'SUI', 'Sui', 'sui', '#4da2ff'],
  ['XLMUSDT', 'XLM', 'Stellar', 'stellar', '#7d8ca3'],
  ['HBARUSDT', 'HBAR', 'Hedera', 'hedera-hashgraph', '#8a96a8'],
  ['BCHUSDT', 'BCH', 'Bitcoin Cash', 'bitcoin-cash', '#8dc351'],
  ['LTCUSDT', 'LTC', 'Litecoin', 'litecoin', '#345d9d'],
  ['DOTUSDT', 'DOT', 'Polkadot', 'polkadot', '#e6007a'],
  ['UNIUSDT', 'UNI', 'Uniswap', 'uniswap', '#ff007a'],
  ['AAVEUSDT', 'AAVE', 'Aave', 'aave', '#b6509e'],
  ['ONDOUSDT', 'ONDO', 'Ondo', 'ondo-finance', '#3b6cff'],
  ['ENAUSDT', 'ENA', 'Ethena', 'ethena', '#8f8cff'],
  ['PENDLEUSDT', 'PENDLE', 'Pendle', 'pendle', '#18b7a0'],
  ['NEARUSDT', 'NEAR', 'NEAR Protocol', 'near', '#00c08b'],
  ['APTUSDT', 'APT', 'Aptos', 'aptos', '#2dd8a7'],
  ['ICPUSDT', 'ICP', 'Internet Computer', 'internet-computer', '#8b5cf6'],
  ['TAOUSDT', 'TAO', 'Bittensor', 'bittensor', '#9aa3b5'],
  ['ETCUSDT', 'ETC', 'Ethereum Classic', 'ethereum-classic', '#33b54a'],
  ['ATOMUSDT', 'ATOM', 'Cosmos', 'cosmos', '#6f7cba'],
  ['FILUSDT', 'FIL', 'Filecoin', 'filecoin', '#0090ff'],
  ['ARBUSDT', 'ARB', 'Arbitrum', 'arbitrum', '#28a0f0'],
  ['OPUSDT', 'OP', 'Optimism', 'optimism', '#ff0420'],
  ['POLUSDT', 'POL', 'Polygon', 'polygon-ecosystem-token', '#8247e5'],
  ['RENDERUSDT', 'RENDER', 'Render', 'render-token', '#e0453a'],
  ['FETUSDT', 'FET', 'Artificial Superintelligence Alliance', 'fetch-ai', '#5c67ff'],
  ['WLDUSDT', 'WLD', 'Worldcoin', 'worldcoin-wld', '#9aa3b5'],
  ['INJUSDT', 'INJ', 'Injective', 'injective-protocol', '#00a3ff'],
  ['SEIUSDT', 'SEI', 'Sei', 'sei-network', '#c4312e'],
  ['TIAUSDT', 'TIA', 'Celestia', 'celestia', '#7b2bf9'],
  ['JUPUSDT', 'JUP', 'Jupiter', 'jupiter-exchange-solana', '#29c48c'],
  ['ALGOUSDT', 'ALGO', 'Algorand', 'algorand', '#8a96a8'],
  ['VETUSDT', 'VET', 'VeChain', 'vechain', '#15bdff'],
  ['LDOUSDT', 'LDO', 'Lido DAO', 'lido-dao', '#00a3ff'],
  ['CRVUSDT', 'CRV', 'Curve DAO', 'curve-dao-token', '#e3c94a'],
  ['SKYUSDT', 'SKY', 'Sky', 'sky', '#1aab9b'],
  ['SHIBUSDT', 'SHIB', 'Shiba Inu', 'shiba-inu', '#ffa409'],
  ['PEPEUSDT', 'PEPE', 'Pepe', 'pepe', '#3a8c3f'],
].map(([s, b, n, cg, c]) => ({ s, b, n, cg, c }));
// pares extras acompanhados pelo WebSocket, mas que não são "moedas" na lista (câmbio e ouro tokenizado)
const AUX_PAIRS = ['USDTBRL', 'PAXGUSDT'];
const DASH_DEFAULT = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ONDOUSDT', 'AAVEUSDT'];
// moedas que não têm par na lista (stablecoins), mas entram na dominância de mercado
const CG_EXTRA_IDS = ['tether', 'usd-coin'];
const BY_SYM = Object.fromEntries(UNIVERSE.map((c) => [c.s, c]));
const BY_CG = Object.fromEntries(UNIVERSE.map((c) => [c.cg, c]));
const BY_BASE = Object.fromEntries(UNIVERSE.map((c) => [c.b, c]));

// Agenda oficial (conferida em 15/10/2026). "at" em UTC.
// FOMC: decisão às 14h de Nova York (18:00Z no horário de verão dos EUA, 19:00Z no inverno).
// Fonte: federalreserve.gov/monetarypolicy/fomccalendars.htm — datas "tentativas até confirmadas na reunião anterior".
const FOMC = [
  '2026-01-28T19:00:00Z', '2026-03-18T18:00:00Z', '2026-04-29T18:00:00Z', '2026-06-17T18:00:00Z',
  '2026-07-29T18:00:00Z', '2026-09-16T18:00:00Z', '2026-10-28T18:00:00Z', '2026-12-09T19:00:00Z',
  '2027-01-27T19:00:00Z', '2027-03-17T18:00:00Z', '2027-04-28T18:00:00Z', '2027-06-09T18:00:00Z',
  '2027-07-28T18:00:00Z', '2027-09-15T18:00:00Z', '2027-10-27T18:00:00Z', '2027-12-08T19:00:00Z',
];
const FOMC_SEP = ['2026-03-18', '2026-06-17', '2026-09-16', '2026-12-09', '2027-03-17', '2027-06-09', '2027-09-15', '2027-12-08'];
// Copom: decisão divulgada após as 18h de Brasília no 2º dia (usamos 21:30Z como horário estimado).
// Fonte: Banco Central (calendários de 2026 e 2027 publicados em jun/2025 e jun/2026).
const COPOM = [
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-08-05', '2026-09-16', '2026-11-04', '2026-12-09',
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-16', '2027-08-04', '2027-09-22', '2027-10-27', '2027-12-08',
].map((d) => d + 'T21:30:00Z');
// EUA — BLS (bls.gov/schedule): CPI e relatório de emprego (Payroll), 08:30 de Nova York.
const US_CPI = [
  ['2026-11-10T13:30:00Z', 'out/2026'], ['2026-12-10T13:30:00Z', 'nov/2026'], ['2027-01-13T13:30:00Z', 'dez/2026'],
  ['2027-02-11T13:30:00Z', 'jan/2027'], ['2027-03-10T13:30:00Z', 'fev/2027'], ['2027-04-13T12:30:00Z', 'mar/2027'],
  ['2027-05-12T12:30:00Z', 'abr/2027'], ['2027-06-10T12:30:00Z', 'mai/2027'], ['2027-07-14T12:30:00Z', 'jun/2027'],
  ['2027-08-11T12:30:00Z', 'jul/2027'], ['2027-09-14T12:30:00Z', 'ago/2027'], ['2027-10-14T12:30:00Z', 'set/2027'],
];
const US_NFP = [
  ['2026-10-02T12:30:00Z', 'set/2026'], ['2026-11-06T13:30:00Z', 'out/2026'], ['2026-12-04T13:30:00Z', 'nov/2026'],
];
const FED_FACTS = {
  chair: 'Kevin Warsh', chairSince: '2026-05-22',
  chairSource: 'https://www.atlantafed.org/news-and-events/2026/05/22/warsh-sworn-in-as-new-fed-chairman',
  checkedAt: '2026-10-15',
  calendarUrl: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
};
