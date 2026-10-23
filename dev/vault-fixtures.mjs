// Lançamentos simulados do Portfolio Vault (determinísticos) para testes e capturas de tela.
// seedVault(n, uid) → n lançamentos em ~4 anos: BTC, ETH, SOL (Binance) e KAS (só no CoinGecko),
// compras e vendas, em R$ e US$, com taxa e corretora. Os preços seguem o mesmo "mercado" simulado das
// velas (pricePath) e o dólar segue o PTAX simulado; nunca vende mais do que tem.
import { pricePath, livePrice, cgPrice } from './fixtures.mjs';
const DAY = 86400e3;
const COINS = [
  // valores de quem aporta pouco e sempre (2.500 lançamentos em 4 anos ≈ R$ 300 mil no total)
  { asset_id: 'bitcoin', sym: 'BTC', name: 'Bitcoin', binance_sym: 'BTCUSDT', usd: [8, 60] },
  { asset_id: 'ethereum', sym: 'ETH', name: 'Ethereum', binance_sym: 'ETHUSDT', usd: [6, 40] },
  { asset_id: 'solana', sym: 'SOL', name: 'Solana', binance_sym: 'SOLUSDT', usd: [4, 30] },
  { asset_id: 'kaspa', sym: 'KAS', name: 'Kaspa', binance_sym: null, usd: [2, 12] },
];
const EX = ['Binance', 'Mercado Bitcoin', 'Foxbit', 'Carteira própria', ''];
// mesmo dólar do Banco Central simulado em dev/fixtures.mjs (série 1)
export const fxAt = (t) => +(5.3 + Math.sin(Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate(), 12) / 5e9) * 0.3).toFixed(4);
export function seedVault(n = 2500, uid = '11111111-2222-3333-4444-555555555555') {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const now = Date.now(); const span = 4 * 365 * DAY; const t0 = Math.floor((now - span) / DAY) * DAY;
  const held = Object.fromEntries(COINS.map((c) => [c.asset_id, 0]));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = t0 + Math.floor((i / n) * (span - 2 * DAY) / DAY) * DAY; const date = new Date(t).toISOString().slice(0, 10);
    const c = COINS[Math.floor(rnd() * COINS.length)];
    const end = c.binance_sym ? livePrice(c.binance_sym) : cgPrice(c.asset_id);
    const unit = pricePath(c.binance_sym || c.asset_id, t + 12 * 3600e3, end) * (1 + (rnd() - 0.5) * 0.02);
    const sell = held[c.asset_id] > 0 && rnd() < 0.22;
    let usd = c.usd[0] + rnd() * (c.usd[1] - c.usd[0]);
    let qty = +(usd / unit).toFixed(8);
    if (sell) { qty = +Math.min(held[c.asset_id], qty).toFixed(8); usd = qty * unit; }
    if (!(qty > 0)) continue;
    held[c.asset_id] = +(held[c.asset_id] + (sell ? -qty : qty)).toFixed(8);
    const fx = fxAt(t);
    const cur = rnd() < 0.7 ? 'BRL' : 'USD';
    const amount_usd = +usd.toFixed(2), amount_brl = +(usd * fx).toFixed(2);
    out.push({ id: `seed-${String(i).padStart(5, '0')}`, user_id: uid, type: sell ? 'sell' : 'buy', asset_id: c.asset_id, sym: c.sym, name: c.name, binance_sym: c.binance_sym, logo: null, color: null,
      date, qty, amount_usd, amount_brl, fx_brl: fx, currency: cur, fee: rnd() < 0.5 ? +(rnd() * 3).toFixed(2) : 0, exchange: EX[Math.floor(rnd() * EX.length)] || null, notes: i % 97 === 0 ? 'aporte mensal' : null,
      legacy_id: null, removed_at: null, created_at: new Date(t + (i % 1000) * 1000).toISOString(), updated_at: new Date(t).toISOString() });
  }
  return out;
}
// Conta independente (para conferir o Vault): custo médio em reais, por moeda, na ordem contábil do site
// (por data; no mesmo dia, compras antes das vendas). Devolve quantidade, custo e realizado.
export function expectedBook(entries, until = '9999-12-31') {
  const rows = [...entries].filter((e) => e.date <= until).sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? 0 : a.type === 'buy' ? -1 : 1) || String(a.created_at).localeCompare(String(b.created_at)));
  const by = {}; let putB = 0, tookB = 0; const sales = [];
  for (const e of rows) {
    const fx = e.fx_brl || e.amount_brl / e.amount_usd; const feeB = e.currency === 'BRL' ? e.fee : e.fee * fx;
    const h = by[e.asset_id] || (by[e.asset_id] = { qty: 0, costB: 0, realB: 0, invB: 0 });
    if (e.type === 'buy') { h.qty += e.qty; h.costB += e.amount_brl + feeB; h.invB += e.amount_brl + feeB; putB += e.amount_brl + feeB; }
    else {
      const q = Math.min(e.qty, h.qty); const avg = h.qty > 0 ? h.costB / h.qty : 0; const gain = (e.amount_brl - feeB) * (e.qty > 0 ? q / e.qty : 0) - avg * q;
      h.realB += gain; h.costB -= avg * q; h.qty -= q; if (h.qty < 1e-12) { h.qty = 0; h.costB = 0; }
      tookB += e.amount_brl - feeB; sales.push({ date: e.date, gross: e.amount_brl, gain });
    }
  }
  return { by, putB, tookB, sales };
}
