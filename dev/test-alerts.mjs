// Testes dos alertas sem internet: criptografia Web Push conferida com uma biblioteca independente
// (http_ece, a mesma usada pelo pacote web-push), assinatura VAPID conferida pelo crypto do Node e as
// regras de disparo/rearme e os textos das notificações.  Uso: node dev/test-alerts.mjs
import crypto from 'node:crypto';
import ece from 'http_ece';
import { b64uEnc, b64uDec, generateVapidKeys, vapidHeader, encryptPayload, decryptPayload, pushHostOk, sendWebPush } from './supabase/functions/alerts/webpush.js';
import { judge, quoteFor, priceMsg, eventMsg, testMsg, renewMsg, money, fmtNum } from './supabase/functions/alerts/core.js';

let n = 0;
const ok = (c, m) => { if (!c) { console.error('✗ ' + m); process.exit(1); } n++; };
const eq = (a, b, m) => ok(a === b, `${m}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);

// ---------- 1. criptografia (RFC 8291) ----------
function fakeBrowser() {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/teste123', p256dh: b64uEnc(ecdh.getPublicKey()), auth: b64uEnc(auth) }, auth };
}
for (const msg of ['olá', JSON.stringify({ title: 'BTC acima de US$ 110.000', body: 'Agora US$ 110.240 (+2,1% em 24 h) · Binance, 14:32', url: '#/chart?s=BTCUSDT' }), 'x'.repeat(3000)]) {
  const b = fakeBrowser();
  const body = await encryptPayload(b.sub.p256dh, b.sub.auth, msg);
  ok(body.length === 16 + 4 + 1 + 65 + Buffer.byteLength(msg) + 1 + 16, 'tamanho do corpo cifrado');
  eq(new DataView(body.buffer).getUint32(16), 4096, 'tamanho do registro');
  const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: b.ecdh, authSecret: b.auth });
  eq(plain.toString('utf8'), msg, 'o navegador decifra a mensagem');
}
{ // chave errada não decifra
  const b = fakeBrowser(), other = fakeBrowser();
  const body = await encryptPayload(b.sub.p256dh, b.sub.auth, 'segredo');
  let failed = false;
  try { ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: other.ecdh, authSecret: other.auth }); } catch { failed = true; }
  ok(failed, 'outro aparelho não decifra');
}
let tooBig = false;
try { const b = fakeBrowser(); await encryptPayload(b.sub.p256dh, b.sub.auth, 'x'.repeat(4000)); } catch { tooBig = true; }
ok(tooBig, 'mensagem grande demais é recusada');

// ---------- 2. VAPID (RFC 8292) ----------
const vapid = await generateVapidKeys();
eq(b64uDec(vapid.publicKey).length, 65, 'chave pública VAPID');
eq(b64uDec(vapid.privateKey).length, 32, 'chave privada VAPID');
ok(/^[A-Za-z0-9_-]{87}$/.test(vapid.publicKey) && /^[A-Za-z0-9_-]{43}$/.test(vapid.privateKey), 'formato aceito pelo banco');
const hdr = await vapidHeader('https://fcm.googleapis.com/fcm/send/abc', vapid, 'https://iptvquantic.github.io/Claude_crypto_hub7.0/');
const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(hdr);
ok(m, 'cabeçalho vapid t=…, k=…');
eq(m[4], vapid.publicKey, 'k = chave pública');
const head = JSON.parse(Buffer.from(b64uDec(m[1])).toString()), claims = JSON.parse(Buffer.from(b64uDec(m[2])).toString());
eq(head.alg, 'ES256', 'algoritmo');
eq(claims.aud, 'https://fcm.googleapis.com', 'aud = origem do serviço de push');
ok(claims.exp > Date.now() / 1000 + 3600 && claims.exp <= Date.now() / 1000 + 24 * 3600, 'validade entre 1 h e 24 h');
ok(/^https:\/\//.test(claims.sub), 'sub com contato https (sem e-mail)');
const raw = b64uDec(vapid.publicKey);
const pubKey = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64uEnc(raw.slice(1, 33)), y: b64uEnc(raw.slice(33)) }, format: 'jwk' });
ok(crypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: pubKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(b64uDec(m[3]))), 'assinatura ES256 confere');

// envio: cabeçalhos e respostas do serviço de push
{
  const b = fakeBrowser(); const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return { status: calls.length === 1 ? 201 : calls.length === 2 ? 410 : 500, text: async () => 'erro' }; };
  const r1 = await sendWebPush(b.sub, '{"title":"t"}', vapid, 'https://x.y/', { ttl: 600, topic: 'abc', fetchFn: fakeFetch });
  ok(r1.ok && !r1.gone, '201 = entregue');
  const h = calls[0].init.headers;
  eq(h['Content-Encoding'], 'aes128gcm', 'Content-Encoding'); eq(h.TTL, '600', 'TTL'); eq(h.Topic, 'abc', 'Topic'); ok(/^vapid t=/.test(h.Authorization), 'Authorization');
  const r2 = await sendWebPush(b.sub, 'x', vapid, 'https://x.y/', { fetchFn: fakeFetch });
  ok(!r2.ok && r2.gone, '410 = aparelho saiu (apagar)');
  const r3 = await sendWebPush(b.sub, 'x', vapid, 'https://x.y/', { fetchFn: fakeFetch });
  ok(!r3.ok && !r3.gone && r3.status === 500, '500 = falha temporária');
  const r4 = await sendWebPush({ ...b.sub, p256dh: 'curto' }, 'x', vapid, 'https://x.y/', { fetchFn: fakeFetch });
  ok(!r4.ok && /crypto/.test(r4.err), 'assinatura inválida não quebra o envio');
  // só serviços de notificação conhecidos: o servidor nunca manda pedido para outro endereço
  const n0 = calls.length;
  for (const u of ['https://evil.example/x', 'http://fcm.googleapis.com/fcm/send/x', 'https://fcm.googleapis.com.evil.example/x', 'https://evil.example/?h=fcm.googleapis.com', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://127.0.0.1/x', 'nada']) {
    const r = await sendWebPush({ ...b.sub, endpoint: u }, 'x', vapid, 'https://x.y/', { fetchFn: fakeFetch });
    ok(!r.ok && r.gone && r.err === 'host' && !pushHostOk(u), 'endereço fora dos serviços de push é recusado: ' + u);
  }
  eq(calls.length, n0, 'nenhum pedido saiu para endereço recusado');
  for (const u of ['https://fcm.googleapis.com/fcm/send/a', 'https://jmt17.google.com/fcm/send/a', 'https://updates.push.services.mozilla.com/wpush/v2/a', 'https://web.push.apple.com/a', 'https://wns2-by3p.notify.windows.com/w/?token=a%2b']) ok(pushHostOk(u), 'serviço de push aceito: ' + u);
}
// ida e volta com o decifrador do auto-teste (o mesmo que confere o envio real no servidor)
{
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)), auth = crypto.randomBytes(16);
  const msg = JSON.stringify({ title: 'ação', body: 'R$ 1.234,56 · é' });
  eq(await decryptPayload(kp.privateKey, pub, new Uint8Array(auth), await encryptPayload(b64uEnc(pub), b64uEnc(auth), msg)), msg, 'decifrador do auto-teste abre a mensagem');
}

// ---------- 3. regras ----------
const Q = { bn: { BTCUSDT: { px: 110240, chg: 2.13, t: Date.UTC(2026, 10, 6, 17, 32) }, ETHUSDT: { px: 1980, chg: -6.4, t: Date.now() }, USDTBRL: { px: 5.5, t: Date.now() } },
  cg: { pepe: { usd: 0.00001234, brl: 0.0000679, chg: 18.2, brlChg: 18.5, t: Date.now() } } };
const A = (o) => ({ armed: true, repeat: false, ccy: 'usd', ...o });
eq(judge(A({ bn: 'BTCUSDT', cond: 'above', value: 110000 }), quoteFor(A({ bn: 'BTCUSDT' }), Q)), 'fire', 'acima: dispara');
eq(judge(A({ bn: 'BTCUSDT', cond: 'above', value: 115000 }), quoteFor(A({ bn: 'BTCUSDT' }), Q)), null, 'acima: ainda não');
eq(judge(A({ bn: 'ETHUSDT', cond: 'below', value: 2000 }), quoteFor(A({ bn: 'ETHUSDT' }), Q)), 'fire', 'abaixo: dispara');
eq(judge(A({ bn: 'ETHUSDT', cond: 'down24', value: 5 }), quoteFor(A({ bn: 'ETHUSDT' }), Q)), 'fire', 'queda de 5% em 24 h');
eq(judge(A({ bn: 'ETHUSDT', cond: 'up24', value: 5 }), quoteFor(A({ bn: 'ETHUSDT' }), Q)), null, 'alta não dispara na queda');
eq(judge(A({ cg: 'pepe', cond: 'up24', value: 15 }), quoteFor(A({ cg: 'pepe' }), Q)), 'fire', 'moeda fora da Binance (CoinGecko)');
// em reais pela Binance: 110.240 × 5,5 = 606.320
const qb = quoteFor(A({ bn: 'BTCUSDT', ccy: 'brl' }), Q);
ok(Math.abs(qb.px - 606320) < 0.01 && qb.via === 'USDT/BRL', 'conversão para reais pelo USDT/BRL');
eq(judge(A({ bn: 'BTCUSDT', ccy: 'brl', cond: 'above', value: 600000 }), qb), 'fire', 'acima de R$ 600 mil');
eq(quoteFor(A({ bn: 'BTCUSDT', ccy: 'brl' }), { bn: { BTCUSDT: Q.bn.BTCUSDT }, cg: {} }), null, 'sem USDT/BRL não inventa conversão');
eq(quoteFor(A({ bn: 'XYZUSDT', cg: 'pepe' }), Q).src, 'CoinGecko', 'par fora da Binance cai para o CoinGecko');
eq(quoteFor(A({ bn: 'XYZUSDT' }), Q), null, 'sem cotação: não dispara');
// repetir: depois de disparar, só rearma quando volta além de 0,3%
const rep = A({ bn: 'BTCUSDT', cond: 'above', value: 110000, repeat: true, armed: false });
eq(judge(rep, { px: 110100, chg: 0 }), null, 'ainda acima: não rearma');
eq(judge(rep, { px: 109800, chg: 0 }), null, 'voltou só 0,18%: não rearma');
eq(judge(rep, { px: 109600, chg: 0 }), 'rearm', 'voltou 0,36%: rearma');
eq(judge({ ...rep, repeat: false }, { px: 100000, chg: 0 }), null, 'uma vez só: não rearma');
eq(judge(A({ bn: 'X', cond: 'up24', value: 10, armed: false, repeat: true }), { px: 1, chg: 4 }), 'rearm', 'alta de 24 h rearma abaixo da metade');
eq(judge(A({ bn: 'X', cond: 'up24', value: 10 }), { px: 1, chg: NaN }), null, 'sem variação: não dispara');

// ---------- 4. textos ----------
const pm = priceMsg(A({ sym: 'btc', bn: 'BTCUSDT', cond: 'above', value: 110000, note: 'realizar lucro' }), Q.bn.BTCUSDT.px ? quoteFor(A({ bn: 'BTCUSDT' }), Q) : null, 'pt', 'America/Sao_Paulo');
eq(pm.title, 'BTC acima de US$ 110.000', 'título em português');
eq(pm.body, 'Agora US$ 110.240 (+2,1% em 24 h) · Binance, 14:32 · realizar lucro', 'texto com valor, fonte e hora de Brasília');
const pe = priceMsg(A({ sym: 'ETH', bn: 'ETHUSDT', cond: 'down24', value: 5 }), quoteFor(A({ bn: 'ETHUSDT' }), Q), 'en');
ok(pe.title === 'ETH down 6.4% in 24h', 'título em inglês: ' + pe.title);
eq(money(0.00001234, 'usd'), 'US$ 0,00001234', 'centavos de memecoin');
eq(money(2345.67, 'brl'), 'R$ 2.346', 'milhares sem centavos');
eq(fmtNum(12.5), '12,50', 'dezenas com 2 casas');
const now = Date.UTC(2026, 10, 10, 13, 0);
const em = eventMsg({ title: 'Inflação dos EUA (CPI) de out/2026', detail: 'BLS', at: new Date(Date.UTC(2026, 10, 10, 13, 30)).toISOString() }, 'pt', 'America/Sao_Paulo', now);
eq(em.title, 'Em 30 min: Inflação dos EUA (CPI) de out/2026', 'aviso de evento');
ok(/10\/11.*10:30.*BLS/.test(em.body), 'dia e hora de Brasília no aviso: ' + em.body);
eq(eventMsg({ title: 'Fed', at: now + 86400e3 }, 'pt', undefined, now).title, 'Em 24 h: Fed', 'um dia antes');
eq(eventMsg({ title: 'Fed', at: now + 3 * 86400e3 }, 'pt', undefined, now).title, 'Em 3 dias: Fed', 'dias antes');
eq(eventMsg({ title: 'Fed', at: now }, 'pt', undefined, now).title, 'Agora: Fed', 'na hora');
ok(testMsg('pt').title.includes('ligados') && testMsg('en').title.includes('on'), 'teste nos dois idiomas');
ok(/até 2\d\/11/.test(renewMsg(Date.UTC(2026, 10, 25, 12), 'pt').body), 'lembrete de renovação com a data');
const all = JSON.stringify([pm, pe, em]);
ok(Buffer.byteLength(all) < 3000, 'notificações cabem no limite do push');

console.log(`✅ alertas: ${n} verificações (criptografia, VAPID, regras e textos)`);
