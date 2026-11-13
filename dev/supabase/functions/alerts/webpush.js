// Web Push sem bibliotecas: assinatura VAPID (RFC 8292) e criptografia aes128gcm (RFC 8291),
// só com WebCrypto. Roda igual no Deno (Edge Function "alerts") e no Node 20+ (dev/test-alerts.mjs).
const te = new TextEncoder();

export function b64uEnc(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64uDec(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// par de chaves do servidor (P-256): a pública vai para o navegador; a privada fica no banco
export async function generateVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: b64uEnc(pub), privateKey: jwk.d };
}

const _keys = new Map();
async function signingKey(pub, d) {
  const id = pub + '.' + d;
  if (_keys.has(id)) return _keys.get(id);
  const raw = b64uDec(pub);
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('vapid_public');
  const key = await crypto.subtle.importKey('jwk',
    { kty: 'EC', crv: 'P-256', x: b64uEnc(raw.slice(1, 33)), y: b64uEnc(raw.slice(33)), d, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  _keys.set(id, key);
  return key;
}

// cabeçalho Authorization: "vapid t=<JWT ES256>, k=<chave pública>"
export async function vapidHeader(endpoint, vapid, subject, ttlSec = 12 * 3600) {
  const head = b64uEnc(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEnc(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + ttlSec, sub: subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(vapid.publicKey, vapid.privateKey), te.encode(head + '.' + claims));
  return `vapid t=${head}.${claims}.${b64uEnc(sig)}, k=${vapid.publicKey}`;
}

// corpo cifrado para a assinatura do navegador (p256dh + auth)
export async function encryptPayload(p256dh, auth, payload) {
  const ua = b64uDec(p256dh), secret = b64uDec(auth);
  if (ua.length !== 65 || ua[0] !== 4 || secret.length < 16) throw new Error('subscription_keys');
  const data = typeof payload === 'string' ? te.encode(payload) : payload;
  if (data.length > 3800) throw new Error('payload_too_big');
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(secret, shared, concat(te.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(data, new Uint8Array([2]))));
  const head = new Uint8Array(21 + asPub.length);
  head.set(salt, 0);
  new DataView(head.buffer).setUint32(16, 4096);
  head[20] = asPub.length;
  head.set(asPub, 21);
  return concat(head, ct);
}

// (diagnóstico e testes) abre um corpo aes128gcm com a chave privada do aparelho
export async function decryptPayload(uaPrivateKey, uaPublicRaw, auth, body) {
  const b = body instanceof Uint8Array ? body : new Uint8Array(body);
  const salt = b.slice(0, 16), idlen = b[20], asPub = b.slice(21, 21 + idlen), ct = b.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPrivateKey, 256));
  const ikm = await hkdf(auth, shared, concat(te.encode('WebPush: info\0'), uaPublicRaw, asPub), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
  let end = pt.length;
  while (end > 0 && pt[end - 1] === 0) end--;
  if (!end || pt[end - 1] !== 2) throw new Error('padding');
  return new TextDecoder().decode(pt.slice(0, end - 1));
}

// só serviços de notificação conhecidos (Google/FCM: Chrome, Edge no Android, Samsung, Opera · Mozilla: Firefox ·
// Apple: Safari e app no iPhone · WNS: Edge no Windows). O servidor nunca manda pedidos para outro endereço.
const PUSH_HOSTS = /(^|\.)(googleapis\.com|google\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;
export function pushHostOk(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && (u.port === '' || u.port === '443') && !u.username && !u.password && PUSH_HOSTS.test(u.hostname);
  } catch { return false; }
}

// envia; 404/410 = assinatura cancelada (o aparelho sai da lista)
export async function sendWebPush(dev, payload, vapid, subject, { ttl = 3600, urgency = 'high', topic = '', timeoutMs = 10000, fetchFn = fetch } = {}) {
  if (!pushHostOk(dev.endpoint)) return { ok: false, status: 0, gone: true, err: 'host' };
  let body, authz;
  try {
    body = await encryptPayload(dev.p256dh, dev.auth, payload);
    authz = await vapidHeader(dev.endpoint, vapid, subject);
  } catch (e) { return { ok: false, status: 0, gone: false, err: 'crypto: ' + String((e && e.message) || e).slice(0, 120) }; }
  const headers = { TTL: String(Math.max(0, Math.round(ttl))), Urgency: urgency, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: authz };
  if (topic) headers.Topic = topic.slice(0, 32);
  try {
    const r = await fetchFn(dev.endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
    const ok = r.status >= 200 && r.status < 300;
    const err = ok ? '' : String(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
    return { ok, status: r.status, gone: r.status === 404 || r.status === 410, err };
  } catch (e) {
    return { ok: false, status: 0, gone: false, err: String((e && e.message) || e).slice(0, 160) };
  }
}
