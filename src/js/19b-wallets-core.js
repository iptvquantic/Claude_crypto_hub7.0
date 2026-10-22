// =====================================================================
// WALLET WATCH — núcleo (sem tela): validação de endereço de cada rede, detecção de
// frase-semente/chave privada (bloqueio), derivação de endereços a partir da xpub
// (BIP32/44/49/84/86) e leitura de saldo nas fontes públicas. Só endereço público:
// nada aqui assina, move fundos ou pede segredo. Os endereços ficam no navegador.
// =====================================================================
// ==WWC-START== (bloco puro: testado no Node por dev/test-wallets.mjs)
const WWC = (() => {
  // ---------- bytes ----------
  const enc = new TextEncoder();
  const utf8 = (s) => enc.encode(s);
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const unhex = (h) => { h = String(h).replace(/^0x/i, ''); if (h.length % 2) h = '0' + h; const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; };
  const cat = (...xs) => { const o = new Uint8Array(xs.reduce((s, x) => s + x.length, 0)); let k = 0; for (const x of xs) { o.set(x, k); k += x.length; } return o; };
  const toBig = (b) => (b.length ? BigInt('0x' + hex(b)) : 0n);
  const fromBig = (n, len = 32) => unhex(n.toString(16).padStart(len * 2, '0'));

  // ---------- SHA-256 ----------
  const K2 = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256(msg) {
    const l = msg.length, nb = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(nb); m.set(msg); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(nb - 4, (l * 8) >>> 0); dv.setUint32(nb - 8, Math.floor(l / 0x20000000));
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = W[i - 15], b = W[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K2[i] + W[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32); const ov = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]);
    return out;
  }
  const sha256d = (b) => sha256(sha256(b));

  // ---------- RIPEMD-160 ----------
  const RL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13];
  const RR = [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14, 12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11];
  const SL = [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6];
  const SR = [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11];
  const KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e], KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];
  const rol = (x, n) => (x << n) | (x >>> (32 - n));
  const fR = (j, x, y, z) => (j < 16 ? x ^ y ^ z : j < 32 ? (x & y) | (~x & z) : j < 48 ? (x | ~y) ^ z : j < 64 ? (x & z) | (y & ~z) : x ^ (y | ~z));
  function ripemd160(msg) {
    const l = msg.length, nb = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(nb); m.set(msg); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(nb - 8, (l * 8) >>> 0, true); dv.setUint32(nb - 4, Math.floor(l / 0x20000000), true);
    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    const X = new Int32Array(16);
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) X[i] = dv.getInt32(o + i * 4, true);
      let al = h0, bl = h1, cl = h2, dl = h3, el = h4, ar = h0, br = h1, cr = h2, dr = h3, er = h4;
      for (let j = 0; j < 80; j++) {
        const r = j >> 4;
        let t = (rol((al + fR(j, bl, cl, dl) + X[RL[j]] + KL[r]) | 0, SL[j]) + el) | 0;
        al = el; el = dl; dl = rol(cl, 10); cl = bl; bl = t;
        t = (rol((ar + fR(79 - j, br, cr, dr) + X[RR[j]] + KR[r]) | 0, SR[j]) + er) | 0;
        ar = er; er = dr; dr = rol(cr, 10); cr = br; br = t;
      }
      const t = (h1 + cl + dr) | 0; h1 = (h2 + dl + er) | 0; h2 = (h3 + el + ar) | 0; h3 = (h4 + al + br) | 0; h4 = (h0 + bl + cr) | 0; h0 = t;
    }
    const out = new Uint8Array(20); const ov = new DataView(out.buffer);
    [h0, h1, h2, h3, h4].forEach((v, i) => ov.setInt32(i * 4, v, true));
    return out;
  }
  const hash160 = (b) => ripemd160(sha256(b));

  // ---------- Keccak-256 (EIP-55 e ENS) ----------
  const RC = ['0000000000000001', '0000000000008082', '800000000000808a', '8000000080008000', '000000000000808b', '0000000080000001', '8000000080008081', '8000000000008009', '000000000000008a', '0000000000000088', '0000000080008009', '000000008000000a', '000000008000808b', '800000000000008b', '8000000000008089', '8000000000008003', '8000000000008002', '8000000000000080', '000000000000800a', '800000008000000a', '8000000080008081', '8000000000008080', '0000000080000001', '8000000080008008'].map((h) => BigInt('0x' + h));
  const ROTK = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14]; // índice x + 5y
  const M64 = (1n << 64n) - 1n;
  const rot64 = (x, n) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M64);
  function keccakF(A) {
    const C = new Array(5), B = new Array(25);
    for (let r = 0; r < 24; r++) {
      for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
      for (let x = 0; x < 5; x++) { const D = C[(x + 4) % 5] ^ rot64(C[(x + 1) % 5], 1); for (let y = 0; y < 25; y += 5) A[x + y] ^= D; }
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rot64(A[x + 5 * y], ROTK[x + 5 * y]);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x + 5 * y] = B[x + 5 * y] ^ (~B[((x + 1) % 5) + 5 * y] & M64 & B[((x + 2) % 5) + 5 * y]);
      A[0] ^= RC[r];
    }
  }
  function keccak256(msg) {
    const rate = 136; const A = new Array(25).fill(0n);
    const nb = Math.floor(msg.length / rate) * rate + rate;
    const m = new Uint8Array(nb); m.set(msg); m[msg.length] ^= 0x01; m[nb - 1] ^= 0x80;
    for (let o = 0; o < nb; o += rate) {
      for (let i = 0; i < rate / 8; i++) { let v = 0n; for (let k = 7; k >= 0; k--) v = (v << 8n) | BigInt(m[o + i * 8 + k]); A[i] ^= v; }
      keccakF(A);
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 4; i++) { let v = A[i]; for (let k = 0; k < 8; k++) { out[i * 8 + k] = Number(v & 0xffn); v >>= 8n; } }
    return out;
  }

  // ---------- base58 / base58check ----------
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const R58 = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'; // XRP
  function b58dec(s, al = B58) {
    if (!s || /[^1-9A-HJ-NP-Za-km-z]/.test(al === B58 ? s : '') ) return null;
    let n = 0n; for (const ch of s) { const v = al.indexOf(ch); if (v < 0) return null; n = n * 58n + BigInt(v); }
    let lead = 0; for (const ch of s) { if (ch === al[0]) lead++; else break; }
    const body = n === 0n ? new Uint8Array(0) : unhex(n.toString(16));
    return cat(new Uint8Array(lead), body);
  }
  function b58enc(b, al = B58) {
    let n = toBig(b), s = '';
    while (n > 0n) { s = al[Number(n % 58n)] + s; n /= 58n; }
    for (const x of b) { if (x === 0) s = al[0] + s; else break; }
    return s;
  }
  function b58check(s, al = B58) {
    const b = b58dec(s, al); if (!b || b.length < 5) return null;
    const p = b.subarray(0, b.length - 4), c = b.subarray(b.length - 4), h = sha256d(p);
    for (let i = 0; i < 4; i++) if (h[i] !== c[i]) return null;
    return p;
  }
  const b58checkEnc = (p) => b58enc(cat(p, sha256d(p).subarray(0, 4)));

  // ---------- bech32 / bech32m (BIP173 / BIP350) ----------
  const CS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  function polymod(v) { let c = 1; for (const x of v) { const b = c >>> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >>> i) & 1) c ^= GEN[i]; } return c >>> 0; }
  const hrpX = (h) => [...h].map((c) => c.charCodeAt(0) >> 5).concat([0], [...h].map((c) => c.charCodeAt(0) & 31));
  function bech32Dec(s, limit = 90) {
    if (!s || s.length > limit || (s !== s.toLowerCase() && s !== s.toUpperCase())) return null;
    s = s.toLowerCase(); const p = s.lastIndexOf('1'); if (p < 1 || p + 7 > s.length) return null;
    const hrp = s.slice(0, p), data = [];
    for (const ch of s.slice(p + 1)) { const v = CS.indexOf(ch); if (v < 0) return null; data.push(v); }
    const pm = polymod(hrpX(hrp).concat(data));
    const kind = pm === 1 ? 'bech32' : pm === 0x2bc830a3 ? 'bech32m' : null; if (!kind) return null;
    return { hrp, data: data.slice(0, -6), kind };
  }
  function convBits(data, from, to, pad) {
    let acc = 0, bits = 0; const out = [], maxv = (1 << to) - 1;
    for (const v of data) { if (v < 0 || v >> from) return null; acc = (acc << from) | v; bits += from; while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); } }
    if (pad) { if (bits) out.push((acc << (to - bits)) & maxv); } else if (bits >= from || ((acc << (to - bits)) & maxv)) return null;
    return out;
  }
  function segwitDec(hrp, addr) {
    const d = bech32Dec(addr); if (!d || d.hrp !== hrp || !d.data.length) return null;
    const ver = d.data[0]; if (ver > 16) return null;
    const prog = convBits(d.data.slice(1), 5, 8, false); if (!prog || prog.length < 2 || prog.length > 40) return null;
    if (ver === 0 && prog.length !== 20 && prog.length !== 32) return null;
    if ((ver === 0) !== (d.kind === 'bech32')) return null;
    return { ver, prog: Uint8Array.from(prog) };
  }
  function segwitEnc(hrp, ver, prog) {
    const data = [ver].concat(convBits(Array.from(prog), 8, 5, true));
    const v = hrpX(hrp).concat(data, [0, 0, 0, 0, 0, 0]);
    const mod = polymod(v) ^ (ver === 0 ? 1 : 0x2bc830a3);
    const chk = []; for (let i = 0; i < 6; i++) chk.push((mod >>> (5 * (5 - i))) & 31);
    return hrp + '1' + data.concat(chk).map((x) => CS[x]).join('');
  }

  // ---------- secp256k1 (só a parte pública: derivar endereços da xpub) ----------
  const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n, 1n];
  const md = (a, m = P) => { const r = a % m; return r >= 0n ? r : r + m; };
  function inv(a, m = P) { a = md(a, m); let lm = 1n, hm = 0n, lo = a, hi = m; while (lo > 1n) { const r = hi / lo; [lm, hm] = [hm - lm * r, lm]; [lo, hi] = [hi - lo * r, lo]; } return md(lm, m); }
  function powm(b, e, m = P) { let r = 1n; b = md(b, m); while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; }
  const INF = null;
  function jDouble(p) {
    if (!p || p[1] === 0n) return INF;
    const [X, Y, Z] = p; const A = X * X % P, B = Y * Y % P, C = B * B % P;
    const D = md(2n * (md((X + B) * (X + B) - A - C))), E = 3n * A % P, F = E * E % P;
    const X3 = md(F - 2n * D), Y3 = md(E * md(D - X3) - 8n * C), Z3 = 2n * Y * Z % P;
    return [X3, Y3, Z3];
  }
  function jAdd(p, q) {
    if (!p) return q; if (!q) return p;
    const Z1Z1 = p[2] * p[2] % P, Z2Z2 = q[2] * q[2] % P;
    const U1 = p[0] * Z2Z2 % P, U2 = q[0] * Z1Z1 % P, S1 = p[1] * q[2] % P * Z2Z2 % P, S2 = q[1] * p[2] % P * Z1Z1 % P;
    const H = md(U2 - U1), R = md(S2 - S1);
    if (H === 0n) return R === 0n ? jDouble(p) : INF;
    const H2 = H * H % P, H3 = H2 * H % P, U1H2 = U1 * H2 % P;
    const X3 = md(R * R - H3 - 2n * U1H2), Y3 = md(R * md(U1H2 - X3) - S1 * H3), Z3 = H * p[2] % P * q[2] % P;
    return [X3, Y3, Z3];
  }
  function affine(p) { if (!p) return null; const zi = inv(p[2]), z2 = zi * zi % P; return [p[0] * z2 % P, p[1] * z2 % P * zi % P]; }
  let GT = null; // tabela 2^i·G
  function mulG(k) {
    if (!GT) { GT = [G]; for (let i = 1; i < 256; i++) GT.push(jDouble(GT[i - 1])); }
    let acc = INF; k = md(k, N); let i = 0;
    while (k > 0n) { if (k & 1n) acc = jAdd(acc, GT[i]); k >>= 1n; i++; }
    return acc;
  }
  function lift(x, odd) {
    if (x >= P) return null;
    const y2 = md(x * x % P * x + 7n); let y = powm(y2, (P + 1n) / 4n);
    if (y * y % P !== y2) return null;
    if ((y & 1n) !== (odd ? 1n : 0n)) y = P - y;
    return [x, y, 1n];
  }
  const decompress = (b) => (b.length === 33 && (b[0] === 2 || b[0] === 3) ? lift(toBig(b.subarray(1)), b[0] === 3) : null);
  const compress = (a) => cat(Uint8Array.of(a[1] & 1n ? 3 : 2), fromBig(a[0]));
  const taggedHash = (tag, msg) => { const t = sha256(utf8(tag)); return sha256(cat(t, t, msg)); };

  // ---------- endereços BTC ----------
  const btcAddr = {
    p2pkh: (pub) => b58checkEnc(cat(Uint8Array.of(0), hash160(pub))),
    p2sh: (pub) => b58checkEnc(cat(Uint8Array.of(5), hash160(cat(Uint8Array.of(0, 20), hash160(pub))))),
    p2wpkh: (pub) => segwitEnc('bc', 0, hash160(pub)),
    p2tr: (pub) => { const x = pub.subarray(1); const t = toBig(taggedHash('TapTweak', x)); if (t >= N) return null; const Q = affine(jAdd(lift(toBig(x), false), mulG(t))); return Q ? segwitEnc('bc', 1, fromBig(Q[0])) : null; },
  };

  // ---------- BIP32 (xpub / ypub / zpub) ----------
  const XVER = { '0488b21e': 'xpub', '049d7cb2': 'ypub', '04b24746': 'zpub', '0295b43f': 'Ypub', '02aa7ed3': 'Zpub', '043587cf': 'tpub', '044a5262': 'upub', '045f1cf6': 'vpub', '019da462': 'Ltub', '01b26ef6': 'Mtub' };
  const XPRV = new Set(['0488ade4', '049d7878', '04b2430c', '0295b005', '02aa7a99', '04358394', '044a4e28', '045f18bc', '019d9cfe', '01b26792']);
  function parseExt(s) {
    const p = b58check(String(s).trim()); if (!p || p.length !== 78) return null;
    const v = hex(p.subarray(0, 4));
    if (XPRV.has(v)) return { priv: true };
    const type = XVER[v]; if (!type) return null;
    const key = p.slice(45, 78); if (!decompress(key)) return null;
    return { type, depth: p[4], chain: p.slice(13, 45), key };
  }
  async function hmac512(key, data) {
    const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
  }
  async function ckd(node, i) { // derivação pública (índice não reforçado)
    const I = await hmac512(node.chain, cat(node.key, Uint8Array.of((i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255)));
    const il = toBig(I.subarray(0, 32)); if (il >= N) return null;
    const K = affine(jAdd(mulG(il), decompress(node.key))); if (!K) return null;
    return { chain: I.slice(32), key: compress(K) };
  }

  // ---------- EVM: checksum (EIP-55) e ENS ----------
  function evmChecksum(a) {
    const low = a.replace(/^0x/i, '').toLowerCase(); const h = hex(keccak256(utf8(low)));
    let out = '0x'; for (let i = 0; i < 40; i++) out += parseInt(h[i], 16) >= 8 ? low[i].toUpperCase() : low[i];
    return out;
  }
  function namehash(name) {
    let node = new Uint8Array(32);
    if (name) { const labels = name.toLowerCase().split('.'); for (let i = labels.length - 1; i >= 0; i--) node = keccak256(cat(node, keccak256(utf8(labels[i])))); }
    return '0x' + hex(node);
  }

  // ---------- TON (endereço amigável ↔ bruto) ----------
  function crc16(b) { let c = 0; for (const x of b) { c ^= x << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c; }
  function tonParse(s) {
    s = String(s).trim();
    const raw = s.match(/^(-1|0):([0-9a-fA-F]{64})$/);
    if (raw) return { raw: `${raw[1]}:${raw[2].toLowerCase()}`, wc: +raw[1] };
    if (!/^[A-Za-z0-9_\-+/]{48}$/.test(s)) return null;
    let bin; try { bin = atob(s.replace(/-/g, '+').replace(/_/g, '/')); } catch { return null; }
    const b = Uint8Array.from(bin, (c) => c.charCodeAt(0)); if (b.length !== 36) return null;
    if (crc16(b.subarray(0, 34)) !== ((b[34] << 8) | b[35])) return null;
    const tag = b[0] & 0x7f; if (tag !== 0x11 && tag !== 0x51) return null;
    if (b[0] & 0x80) return { testnet: true };
    const wc = b[1] === 0xff ? -1 : b[1];
    return { raw: `${wc}:${hex(b.subarray(2, 34))}`, wc };
  }

  return { utf8, hex, unhex, sha256, sha256d, ripemd160, hash160, keccak256, b58dec, b58enc, b58check, b58checkEnc, B58, R58, bech32Dec, segwitDec, segwitEnc, btcAddr, parseExt, ckd, evmChecksum, namehash, tonParse, mulG, affine, decompress };
})();

// ---------- reconhecer o que foi colado ----------
// Resultado: { ok, kind, net, addr, sub } ou { ok:false, secret:'seed'|'priv'|'xprv'|'wif'|'solkey'|'keystore', msg } ou { ok:false, msg }
const WW_NETS = {
  btc: ['Bitcoin', 'BTC', '#f7931a'], btcx: ['Bitcoin (xpub)', 'BTC', '#f7931a'], evm: ['Ethereum e redes EVM', 'ETH', '#627eea'],
  sol: ['Solana', 'SOL', '#9945ff'], trx: ['Tron', 'TRX', '#e5383b'], ltc: ['Litecoin', 'LTC', '#345d9d'], doge: ['Dogecoin', 'DOGE', '#c2a633'],
  xrp: ['XRP Ledger', 'XRP', '#3d7fd9'], ton: ['TON', 'TON', '#0098ea'],
};
function wwDetect(input) {
  const s = String(input || '').trim();
  if (!s) return { ok: false, empty: true };
  // 1) segredos: nunca aceitar, nunca guardar
  const words = s.split(/\s+/);
  if (words.length >= 12 && words.length <= 25 && words.every((w) => /^[a-zà-ü]{2,12}$/i.test(w))) return { ok: false, secret: 'seed' };
  if (/"(crypto|Crypto)"\s*:/.test(s) && /ciphertext/i.test(s)) return { ok: false, secret: 'keystore' };
  if (/^\[\s*\d{1,3}(\s*,\s*\d{1,3}){63}\s*\]$/.test(s)) return { ok: false, secret: 'solkey' };
  if (words.length > 1) return { ok: false, words: true, secret: words.length >= 3 && words.every((w) => /^[a-zà-ü]{2,12}$/i.test(w)) ? 'seed' : null };
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) return { ok: false, secret: 'priv' };
  if (/^[xyztuvYZ]prv[1-9A-HJ-NP-Za-km-z]{100,112}$/.test(s) || /^(Ltpv|Mtpv)/.test(s)) return { ok: false, secret: 'xprv' };
  if (/^[1-9A-HJ-NP-Za-km-z]{50,53}$/.test(s)) { const p = WWC.b58check(s); if (p && (p.length === 33 || p.length === 34) && [0x80, 0xef, 0xb0, 0x9e, 0xf1, 0xcc].includes(p[0])) return { ok: false, secret: 'wif' }; }
  if (/^[1-9A-HJ-NP-Za-km-z]{85,90}$/.test(s) && !/^([xyztuvYZ]pub|Ltub|Mtub)/.test(s)) { const b = WWC.b58dec(s); if (b && b.length === 64) return { ok: false, secret: 'solkey' }; }
  // 2) endereços públicos
  if (/^(xpub|ypub|zpub|Ypub|Zpub|tpub|upub|vpub|Ltub|Mtub)[1-9A-HJ-NP-Za-km-z]{100,112}$/.test(s)) {
    const x = WWC.parseExt(s);
    if (!x) return { ok: false, msg: 'typo', net: 'btcx' };
    if (x.priv) return { ok: false, secret: 'xprv' };
    if (!['xpub', 'ypub', 'zpub'].includes(x.type)) return { ok: false, msg: 'unsupported', what: x.type };
    if (x.depth !== 3) return { ok: false, msg: 'xdepth', net: 'btcx' };
    return { ok: true, kind: 'btcx', net: 'btcx', addr: s, sub: { xpub: 'xpub', ypub: 'ypub (SegWit compatível)', zpub: 'zpub (SegWit nativo)' }[x.type], xtype: x.type };
  }
  const low = s.toLowerCase();
  if (/^bc1/.test(low)) { const d = WWC.segwitDec('bc', s); return d ? { ok: true, kind: 'btc', net: 'btc', addr: low, sub: d.ver === 1 ? 'Taproot' : d.ver > 1 ? 'SegWit v' + d.ver : d.prog.length === 32 ? 'SegWit (script)' : 'SegWit nativo' } : { ok: false, msg: 'typo', net: 'btc' }; }
  if (/^ltc1/.test(low)) { const d = WWC.segwitDec('ltc', s); return d ? { ok: true, kind: 'ltc', net: 'ltc', addr: low, sub: 'SegWit' } : { ok: false, msg: 'typo', net: 'ltc' }; }
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) {
    const lowAddr = s.toLowerCase(); const mixed = s !== lowAddr && s !== '0x' + s.slice(2).toUpperCase();
    if (mixed && WWC.evmChecksum(s) !== s) return { ok: false, msg: 'typo', net: 'evm' };
    return { ok: true, kind: 'evm', net: 'evm', addr: WWC.evmChecksum(s), sub: 'Ethereum, BNB Chain, Polygon, Arbitrum, Base, Optimism, Avalanche e outras + Hyperliquid' };
  }
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/i.test(s) && s.length <= 80) return { ok: true, kind: 'ens', net: 'evm', addr: low, sub: 'nome ENS (será convertido no endereço)' };
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(s)) { const p = WWC.b58check(s, WWC.R58); if (p && p.length === 21 && p[0] === 0) return { ok: true, kind: 'xrp', net: 'xrp', addr: s }; }
  const ton = WWC.tonParse(s);
  if (ton) return ton.testnet ? { ok: false, msg: 'testnet' } : { ok: true, kind: 'ton', net: 'ton', addr: s, raw: ton.raw };
  if (/^[1-9A-HJ-NP-Za-km-z]{25,44}$/.test(s)) {
    const p = WWC.b58check(s);
    if (p && p.length === 21) {
      const v = p[0];
      if (v === 0x00) return { ok: true, kind: 'btc', net: 'btc', addr: s, sub: 'Legado (P2PKH)' };
      if (v === 0x05) return { ok: true, kind: 'btc', net: 'btc', addr: s, sub: 'P2SH (SegWit compatível)' };
      if (v === 0x41) return { ok: true, kind: 'trx', net: 'trx', addr: s };
      if (v === 0x30 || v === 0x32) return { ok: true, kind: 'ltc', net: 'ltc', addr: s, sub: v === 0x30 ? 'Legado' : 'P2SH' };
      if (v === 0x1e || v === 0x16) return { ok: true, kind: 'doge', net: 'doge', addr: s };
      return { ok: false, msg: 'unsupported' };
    }
    const b = WWC.b58dec(s);
    if (b && b.length === 32 && s.length >= 32) return { ok: true, kind: 'sol', net: 'sol', addr: s };
    if (/^[13T]/.test(s) && b && b.length === 25) return { ok: false, msg: 'typo', net: s[0] === 'T' ? 'trx' : 'btc' };
  }
  if (/^(addr1|stake1|Ae2|DdzFF)/.test(s)) return { ok: false, msg: 'unsupported', what: 'Cardano' };
  if (/^(cosmos|osmo|celestia|inj|sei|dydx|noble|kava|terra|bnb|tb1|bcrt1|tltc1)1/.test(low)) return { ok: false, msg: 'unsupported' };
  if (/^0x[0-9a-fA-F]{63,64}$/.test(s)) return { ok: false, secret: 'priv' };
  return { ok: false, msg: 'unknown' };
}
// ==WWC-END==

// ---------- redes EVM (RPC público com CORS e Multicall3 conferidos em 16/10/2026) ----------
const WW_EVM = [
  { k: 'eth', n: 'Ethereum', sym: 'ETH', cg: 'ethereum', c: '#627eea', id: 1, rpc: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://1rpc.io/eth'], ex: 'https://etherscan.io/address/' },
  { k: 'bsc', n: 'BNB Chain', sym: 'BNB', cg: 'binancecoin', c: '#f3ba2f', id: 56, rpc: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org', 'https://bsc.drpc.org'], ex: 'https://bscscan.com/address/' },
  { k: 'base', n: 'Base', sym: 'ETH', cg: 'ethereum', c: '#3a72ff', id: 8453, rpc: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org'], ex: 'https://basescan.org/address/' },
  { k: 'arb', n: 'Arbitrum', sym: 'ETH', cg: 'ethereum', c: '#28a0f0', id: 42161, rpc: ['https://arbitrum-one-rpc.publicnode.com', 'https://arb1.arbitrum.io/rpc'], ex: 'https://arbiscan.io/address/' },
  { k: 'op', n: 'Optimism', sym: 'ETH', cg: 'ethereum', c: '#ff3b4e', id: 10, rpc: ['https://optimism-rpc.publicnode.com', 'https://mainnet.optimism.io'], ex: 'https://optimistic.etherscan.io/address/' },
  { k: 'pol', n: 'Polygon', sym: 'POL', cg: 'polygon-ecosystem-token', c: '#8247e5', id: 137, rpc: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'], ex: 'https://polygonscan.com/address/' },
  { k: 'avax', n: 'Avalanche', sym: 'AVAX', cg: 'avalanche-2', c: '#e84142', id: 43114, rpc: ['https://avalanche-c-chain-rpc.publicnode.com', 'https://api.avax.network/ext/bc/C/rpc'], ex: 'https://snowtrace.io/address/' },
  { k: 'hyper', n: 'HyperEVM', sym: 'HYPE', cg: 'hyperliquid', c: '#3ee0b0', id: 999, rpc: ['https://rpc.hyperliquid.xyz/evm'], ex: 'https://hyperevmscan.io/address/' },
  { k: 'linea', n: 'Linea', sym: 'ETH', cg: 'ethereum', c: '#61dfff', id: 59144, rpc: ['https://linea-rpc.publicnode.com', 'https://rpc.linea.build'], ex: 'https://lineascan.build/address/' },
  { k: 'zks', n: 'zkSync Era', sym: 'ETH', cg: 'ethereum', c: '#8c8dfc', id: 324, rpc: ['https://mainnet.era.zksync.io'], ex: 'https://era.zksync.network/address/', mc: '0xF9cda624FBC7e059355ce98a31693d299FACd963' },
  { k: 'scroll', n: 'Scroll', sym: 'ETH', cg: 'ethereum', c: '#e8b67e', id: 534352, rpc: ['https://scroll-rpc.publicnode.com', 'https://rpc.scroll.io'], ex: 'https://scrollscan.com/address/' },
  { k: 'uni', n: 'Unichain', sym: 'ETH', cg: 'ethereum', c: '#f50db4', id: 130, rpc: ['https://unichain-rpc.publicnode.com', 'https://mainnet.unichain.org'], ex: 'https://uniscan.xyz/address/' },
  { k: 'sonic', n: 'Sonic', sym: 'S', cg: 'sonic-3', c: '#fe9a4c', id: 146, rpc: ['https://sonic-rpc.publicnode.com', 'https://rpc.soniclabs.com'], ex: 'https://sonicscan.org/address/' },
  { k: 'bera', n: 'Berachain', sym: 'BERA', cg: 'berachain-bera', c: '#c58a4b', id: 80094, rpc: ['https://berachain-rpc.publicnode.com', 'https://rpc.berachain.com'], ex: 'https://berascan.com/address/' },
  { k: 'gno', n: 'Gnosis', sym: 'XDAI', cg: 'xdai', c: '#3e9e7c', id: 100, rpc: ['https://gnosis-rpc.publicnode.com', 'https://rpc.gnosischain.com'], ex: 'https://gnosisscan.io/address/' },
  { k: 'mantle', n: 'Mantle', sym: 'MNT', cg: 'mantle', c: '#65b3ae', id: 5000, rpc: ['https://mantle-rpc.publicnode.com'], ex: 'https://mantlescan.xyz/address/' },
  { k: 'celo', n: 'Celo', sym: 'CELO', cg: 'celo', c: '#35d07f', id: 42220, rpc: ['https://celo-rpc.publicnode.com'], ex: 'https://celoscan.io/address/' },
  { k: 'cronos', n: 'Cronos', sym: 'CRO', cg: 'crypto-com-chain', c: '#5a7bd6', id: 25, rpc: ['https://cronos-evm-rpc.publicnode.com'], ex: 'https://cronoscan.com/address/' },
  { k: 'blast', n: 'Blast', sym: 'ETH', cg: 'ethereum', c: '#d9d920', id: 81457, rpc: ['https://blast-rpc.publicnode.com'], ex: 'https://blastscan.io/address/' },
];
const WW_EVM_BY = Object.fromEntries(WW_EVM.map((c) => [c.k, c]));
const WW_NATIVE_NAME = { ethereum: 'Ethereum', binancecoin: 'BNB', 'polygon-ecosystem-token': 'Polygon', 'avalanche-2': 'Avalanche', hyperliquid: 'Hyperliquid', 'sonic-3': 'Sonic', 'berachain-bera': 'Berachain', xdai: 'xDAI', mantle: 'Mantle', celo: 'Celo', 'crypto-com-chain': 'Cronos' };
const WW_MC3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
// redes que não são EVM: moeda nativa, explorador e cor
const WW_NET = {
  btc: { n: 'Bitcoin', s: 'BTC', nm: 'Bitcoin', cg: 'bitcoin', c: '#f7931a', ex: 'https://mempool.space/address/', tx: 'https://mempool.space/tx/' },
  ltc: { n: 'Litecoin', s: 'LTC', nm: 'Litecoin', cg: 'litecoin', c: '#345d9d', ex: 'https://litecoinspace.org/address/', tx: 'https://litecoinspace.org/tx/' },
  doge: { n: 'Dogecoin', s: 'DOGE', nm: 'Dogecoin', cg: 'dogecoin', c: '#c2a633', ex: 'https://blockchair.com/dogecoin/address/', tx: 'https://blockchair.com/dogecoin/transaction/' },
  xrp: { n: 'XRP Ledger', s: 'XRP', nm: 'XRP', cg: 'ripple', c: '#3d7fd9', ex: 'https://xrpscan.com/account/' },
  sol: { n: 'Solana', s: 'SOL', nm: 'Solana', cg: 'solana', c: '#9945ff', ex: 'https://solscan.io/account/' },
  trx: { n: 'Tron', s: 'TRX', nm: 'TRON', cg: 'tron', c: '#e5383b', ex: 'https://tronscan.org/#/address/' },
  ton: { n: 'TON', s: 'TON', nm: 'Toncoin', cg: 'the-open-network', c: '#0098ea', ex: 'https://tonviewer.com/' },
  hl: { n: 'Hyperliquid', s: 'HYPE', nm: 'Hyperliquid', cg: 'hyperliquid', c: '#3ee0b0', ex: 'https://app.hyperliquid.xyz/explorer/address/' },
};
const wwNetName = (k) => (WW_EVM_BY[k] ? WW_EVM_BY[k].n : WW_NET[k] ? WW_NET[k].n : k);
const wwNetColor = (k) => (WW_EVM_BY[k] ? WW_EVM_BY[k].c : WW_NET[k] ? WW_NET[k].c : '#8e98ff');

// ---------- lista de tokens reconhecidos (robô: tokens.json) ----------
const WWT = { list: null, at: 0, err: '', by: {} }; // by[rede] = Map(contrato → [decimais, id])
function wwTokIndex(j) {
  WWT.list = j; WWT.at = Date.parse(j.generatedAt) || Date.now(); WWT.by = {};
  for (const [k, arr] of Object.entries(j.chains || {})) WWT.by[k] = new Map(arr.map(([a, d, id]) => [a, [d, id]]));
}
const wwCoin = (id) => (WWT.list && WWT.list.coins && WWT.list.coins[id]) || null; // [símbolo, nome, posição, logo]
function wwCoinLogo(id) { const c = wwCoin(id); if (LOGOS[id]) return LOGOS[id]; if (!c || !c[3]) return ''; return /^https:\/\//.test(c[3]) ? c[3] : (WWT.list.imgBase || 'https://coin-images.coingecko.com/coins/images/') + c[3]; }

// ---------- utilidades de rede ----------
const wwPost = (url, body, timeout = 15000) => getJSON(url, { timeout, init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } });
const _wwGate = {};
async function wwGate(host, ms) { const now = Date.now(); const at = Math.max(now, _wwGate[host] || 0); _wwGate[host] = at + ms; if (at > now) await sleep(at - now); }
async function wwPool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { err: e }; } } })); return out; }
async function wwRpc(c, method, params) {
  let last;
  for (const u of c.rpc) {
    try {
      const j = await wwPost(u, { jsonrpc: '2.0', id: 1, method, params }, 15000);
      if (j && j.error) throw new Error(String(j.error.message || 'erro RPC').slice(0, 80));
      if (!j || j.result === undefined || j.result === null) throw new Error(L('resposta vazia', 'empty response'));
      return j.result;
    } catch (e) { last = e; }
  }
  throw last || new Error('RPC');
}
const hex32 = (n) => BigInt(n).toString(16).padStart(64, '0');
function wwEncAgg(calls) {
  let offs = '', body = '', cur = 32 * calls.length;
  for (const c of calls) { offs += hex32(cur); const d = c.data.replace(/^0x/, ''); const pad = d + '0'.repeat((64 - (d.length % 64)) % 64); const t = hex32(c.target) + hex32(1) + hex32(0x60) + hex32(d.length / 2) + pad; body += t; cur += t.length / 2; }
  return '0x82ad56cb' + hex32(0x20) + hex32(calls.length) + offs + body;
}
function wwDecAgg(hs) {
  const h = String(hs).replace(/^0x/, ''); const at = (o) => Number(BigInt('0x' + (h.slice(o * 2, o * 2 + 64) || '0')));
  const ao = at(0), n = at(ao), base = ao + 32, out = [];
  for (let i = 0; i < n; i++) { const eo = base + at(base + 32 * i); const ok = at(eo) === 1; const bo = eo + at(eo + 32); const bl = at(bo); out.push({ ok, data: '0x' + h.slice((bo + 32) * 2, (bo + 32 + bl) * 2) }); }
  return out;
}
const wwUnits = (raw, dec) => { const b = typeof raw === 'bigint' ? raw : BigInt(raw); if (b <= 0n) return 0; const s = b.toString().padStart(dec + 1, '0'); return Number(s.slice(0, s.length - dec) + '.' + s.slice(s.length - dec)); };
const wwA = (o) => o; // ativo lido: { k, q, net, s, n, cg?, x?, px?, logo? }
const wwNative = (net, q, extra = {}) => { const m = WW_NET[net]; return wwA({ k: 'cg:' + m.cg, cg: m.cg, s: m.s, n: m.nm, net, q, ...extra }); };
const wwCgAsset = (id, net, q, extra = {}) => { const c = wwCoin(id); return wwA({ k: 'cg:' + id, cg: id, s: c ? c[0] : id.toUpperCase().slice(0, 8), n: c ? c[1] : id, net, q, ...extra }); };

// ---------- ENS ----------
async function wwResolveEns(name) {
  const node = WWC.namehash(name).slice(2); const eth = WW_EVM_BY.eth;
  const r = await wwRpc(eth, 'eth_call', [{ to: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e', data: '0x0178b8bf' + node }, 'latest']);
  const res = '0x' + String(r).slice(-40); if (/^0x0{40}$/.test(res)) return null;
  const a = await wwRpc(eth, 'eth_call', [{ to: res, data: '0x3b3b57de' + node }, 'latest']);
  const addr = '0x' + String(a).slice(-40); return /^0x0{40}$/.test(addr) || String(a).length < 42 ? null : WWC.evmChecksum(addr);
}

// ---------- leitores por rede: cada um devolve { src, a: [ativos], hid, part, x, txs } ----------
// EVM: saldo nativo + tokens reconhecidos (Multicall3) em cada rede; "full" varre todas as redes
async function wwReadEvm(w, prev, full) {
  const addr = w.addr.toLowerCase(); const pad = addr.slice(2).padStart(64, '0');
  const lastNets = (prev && prev.x && prev.x.nets) || [];
  const nets = full ? WW_EVM : WW_EVM.filter((c) => lastNets.includes(c.k));
  const a = [], errs = [], found = new Set();
  await wwPool(nets, 5, async (c) => {
    try {
      const wei = BigInt(await wwRpc(c, 'eth_getBalance', [w.addr, 'latest']));
      if (wei > 0n) { a.push(wwA({ k: 'cg:' + c.cg, cg: c.cg, s: c.sym, n: WW_NATIVE_NAME[c.cg] || c.sym, net: c.k, q: wwUnits(wei, 18) })); found.add(c.k); }
      const list = WWT.list ? [...(WWT.by[c.k] || new Map())].filter(([, [, id]]) => id !== c.cg) : [];
      for (let i = 0; i < list.length; i += 300) {
        const part = list.slice(i, i + 300);
        const r = await wwRpc(c, 'eth_call', [{ to: c.mc || WW_MC3, data: wwEncAgg(part.map(([t]) => ({ target: t, data: '0x70a08231' + pad }))) }, 'latest']);
        wwDecAgg(r).forEach((x, n) => {
          if (!x.ok || x.data.length < 66) return; const raw = BigInt(x.data.slice(0, 66)); if (raw <= 0n) return;
          const [ca, [dec, id]] = part[n]; const q = wwUnits(raw, dec); if (!(q > 0)) return;
          a.push(wwCgAsset(id, c.k, q, { ca })); found.add(c.k);
        });
      }
    } catch (e) { errs.push(`${c.n}: ${String(e.message || e).slice(0, 60)}`); }
  });
  if (errs.length === nets.length && nets.length) throw new Error(errs[0]);
  // Hyperliquid (L1): o mesmo endereço 0x pode ter saldo à vista, conta de perpétuos e HYPE em stake
  let hlErr = '';
  try { const h = await wwReadHL(w.addr); if (h.length) { a.push(...h); found.add('hl'); } } catch (e) { hlErr = 'Hyperliquid: ' + String(e.message || e).slice(0, 60); }
  const nList = full ? [...found] : [...new Set([...found, ...lastNets])];
  return { src: L('RPC públicos + Hyperliquid', 'public RPCs + Hyperliquid'), a, part: errs.length || hlErr ? [...errs, hlErr].filter(Boolean).join(' · ') : '', x: { nets: nList.filter((k) => k !== 'hl'), full: full ? Date.now() : (prev && prev.x && prev.x.full) || 0, scanned: nets.length, tokOk: !!WWT.list } };
}
// Hyperliquid: preços à vista (cache de 5 min)
const WW_HL = 'https://api.hyperliquid.xyz/info';
let _wwHlMeta = null;
async function wwHlMeta() {
  if (_wwHlMeta && Date.now() - _wwHlMeta.t < 5 * 60e3) return _wwHlMeta;
  const [meta, ctx] = await wwPost(WW_HL, { type: 'spotMetaAndAssetCtxs' }, 15000);
  const by = {};
  (meta.universe || []).forEach((u, i) => { const c = ctx[i]; if (!c || !u.tokens || u.tokens[1] !== 0) return; const px = num(c.midPx) || num(c.markPx); const prev = num(c.prevDayPx); if (px > 0) by[u.tokens[0]] = { px, chg: prev > 0 ? (px / prev - 1) * 100 : null }; });
  _wwHlMeta = { t: Date.now(), by };
  return _wwHlMeta;
}
async function wwReadHL(addr) {
  const [sp, pp, st] = await Promise.allSettled([wwPost(WW_HL, { type: 'spotClearinghouseState', user: addr }), wwPost(WW_HL, { type: 'clearinghouseState', user: addr }), wwPost(WW_HL, { type: 'delegatorSummary', user: addr })]);
  if (sp.status === 'rejected' && pp.status === 'rejected') throw sp.reason;
  const out = []; const ts = Date.now();
  const bals = sp.status === 'fulfilled' && sp.value && Array.isArray(sp.value.balances) ? sp.value.balances.filter((b) => num(b.total) > 0) : [];
  let meta = null; if (bals.some((b) => b.coin !== 'USDC' && b.coin !== 'HYPE')) meta = await wwHlMeta().catch(() => null);
  for (const b of bals) {
    const q = num(b.total);
    if (b.coin === 'USDC') out.push(wwCgAsset('usd-coin', 'hl', q));
    else if (b.coin === 'HYPE') out.push(wwCgAsset('hyperliquid', 'hl', q));
    else { const m = meta && meta.by[b.token]; out.push(wwA({ k: 'hl:' + b.coin, s: String(b.coin).slice(0, 12), n: `${b.coin} (Hyperliquid)`, net: 'hl', q, px: m ? { p: m.px, chg: m.chg, ts, src: 'Hyperliquid' } : null })); }
  }
  const av = pp.status === 'fulfilled' && pp.value && pp.value.marginSummary ? num(pp.value.marginSummary.accountValue) : null;
  if (av > 0.009) out.push(wwA({ k: 'hl:perp', s: 'Perps', n: L('Hyperliquid · conta de perpétuos (valor em US$)', 'Hyperliquid · perps account (USD value)'), net: 'hl', q: av, x: 'perp', px: { p: 1, chg: 0, ts, src: 'Hyperliquid' } }));
  if (st.status === 'fulfilled' && st.value) { const d = (num(st.value.delegated) || 0) + (num(st.value.undelegated) || 0) + (num(st.value.totalPendingWithdrawal) || 0); if (d > 0) out.push(wwCgAsset('hyperliquid', 'hl', d, { x: 'stake' })); }
  return out;
}
// BTC (endereço único): mempool.space; reserva: blockchain.info
function wwEsploraTxs(txs, addr, net) {
  return (Array.isArray(txs) ? txs : []).slice(0, 12).map((t) => {
    let d = 0; (t.vout || []).forEach((o) => { if (o.scriptpubkey_address === addr) d += o.value; }); (t.vin || []).forEach((i) => { if (i.prevout && i.prevout.scriptpubkey_address === addr) d -= i.prevout.value; });
    return [t.status && t.status.block_time ? t.status.block_time * 1000 : Date.now(), d / 1e8, t.txid, !!(t.status && t.status.confirmed)];
  });
}
async function wwReadEsplora(w, base, net, srcName) {
  const [a, txs] = await Promise.all([getJSON(`${base}/address/${w.addr}`, { timeout: 15000 }), getJSON(`${base}/address/${w.addr}/txs`, { timeout: 15000 }).catch(() => null)]);
  const cs = a.chain_stats || {}, ms = a.mempool_stats || {};
  const conf = ((cs.funded_txo_sum || 0) - (cs.spent_txo_sum || 0)) / 1e8, pend = ((ms.funded_txo_sum || 0) - (ms.spent_txo_sum || 0)) / 1e8;
  const q = conf + pend;
  return { src: srcName, a: q > 0 ? [wwNative(net, q)] : [], x: { tx: (cs.tx_count || 0) + (ms.tx_count || 0), pend }, txs: txs ? wwEsploraTxs(txs, w.addr, net) : [] };
}
async function wwBciMulti(addrs, n = 10) {
  const j = await getJSON(`https://blockchain.info/multiaddr?active=${addrs.join('|')}&n=${n}&cors=true`, { timeout: 20000 });
  return { bal: (j.wallet && num(j.wallet.final_balance)) || 0, ntx: (j.wallet && j.wallet.n_tx) || 0, by: Object.fromEntries((j.addresses || []).map((x) => [x.address, { b: x.final_balance, n: x.n_tx }])), txs: (j.txs || []).slice(0, 12).map((t) => [(t.time || 0) * 1000 || Date.now(), (t.result || 0) / 1e8, t.hash, !!t.block_height]) };
}
async function wwReadBtc(w) {
  try { return await wwReadEsplora(w, 'https://mempool.space/api', 'btc', 'mempool.space'); }
  catch (e) {
    const m = await wwBciMulti([w.addr]);
    return { src: 'blockchain.info', a: m.bal > 0 ? [wwNative('btc', m.bal / 1e8)] : [], x: { tx: m.ntx }, txs: m.txs };
  }
}
// BTC por xpub/ypub/zpub: deriva os endereços (recebimento e troco) e varre até 20 seguidos sem uso
const WW_XC = {};
async function wwXAddr(w, x, type, chain, i) {
  const c = WW_XC[w.id] || (WW_XC[w.id] = { nodes: {}, a: {} });
  if (!c.nodes[chain]) c.nodes[chain] = await WWC.ckd({ chain: x.chain, key: x.key }, chain);
  const arr = c.a[type + chain] || (c.a[type + chain] = []);
  while (arr.length <= i) { const n = await WWC.ckd(c.nodes[chain], arr.length); arr.push(n ? WWC.btcAddr[type](n.key) : null); }
  return arr[i];
}
async function wwBtcBalances(addrs) { // { endereço: { b (sat), n (transações) } }
  const out = {}; const list = addrs.filter(Boolean);
  try {
    for (let i = 0; i < list.length; i += 60) {
      const part = list.slice(i, i + 60);
      const j = await getJSON(`https://blockchain.info/balance?active=${part.join('|')}&cors=true`, { timeout: 20000 });
      for (const a of part) { const r = j[a]; if (!r) throw new Error('resposta incompleta'); out[a] = { b: r.final_balance || 0, n: r.n_tx || 0 }; }
    }
    return { by: out, src: 'blockchain.info' };
  } catch (e) {
    await wwPool(list.filter((a) => !out[a]), 4, async (a) => { const r = await getJSON(`https://mempool.space/api/address/${a}`, { timeout: 15000 }); const cs = r.chain_stats, ms = r.mempool_stats; out[a] = { b: cs.funded_txo_sum - cs.spent_txo_sum + ms.funded_txo_sum - ms.spent_txo_sum, n: cs.tx_count + ms.tx_count }; });
    if (list.some((a) => !out[a])) throw new Error(L('saldos dos endereços indisponíveis agora', 'address balances unavailable now'));
    return { by: out, src: 'mempool.space' };
  }
}
async function wwReadXpub(w) {
  const x = WWC.parseExt(w.addr); if (!x || x.priv) throw new Error('xpub inválida');
  const all = x.type === 'zpub' ? ['p2wpkh'] : x.type === 'ypub' ? ['p2sh'] : ['p2wpkh', 'p2pkh', 'p2sh', 'p2tr'];
  let types = all, src = '';
  if (all.length > 1) { // xpub serve para vários tipos (Ledger e Trezor exportam "xpub" para todos): descobre quais têm uso
    const probe = {}; for (const t of all) { probe[t] = []; for (let i = 0; i < 5; i++) probe[t].push(await wwXAddr(w, x, t, 0, i)); }
    const r = await wwBtcBalances(Object.values(probe).flat()); src = r.src;
    types = all.filter((t) => probe[t].some((a) => r.by[a] && r.by[a].n > 0));
  }
  const used = []; const GAP = 20;
  const open = types.flatMap((t) => [0, 1].map((c) => ({ t, c, i: 0, gap: 0 })));
  for (let round = 0; open.some((o) => o.gap < GAP) && round < 60; round++) {
    const batch = [];
    for (const o of open) if (o.gap < GAP) for (let k = 0; k < GAP; k++) batch.push({ o, a: await wwXAddr(w, x, o.t, o.c, o.i + k) });
    const r = await wwBtcBalances(batch.map((b) => b.a)); src = r.src;
    for (const o of open) if (o.gap < GAP) {
      for (const b of batch.filter((z) => z.o === o)) { const e = r.by[b.a]; if (e && e.n > 0) { o.gap = 0; used.push({ a: b.a, t: o.t, c: o.c, b: e.b, n: e.n }); } else o.gap++; }
      o.i += GAP;
    }
  }
  const sat = used.reduce((s, u) => s + u.b, 0);
  let txs = [];
  if (used.length) { try { const pick = [...used].sort((p, q) => q.b - p.b || q.n - p.n).slice(0, 60).map((u) => u.a); txs = (await wwBciMulti(pick)).txs; } catch { /* sem movimentos: fica só o saldo */ } }
  const T = { p2wpkh: 'SegWit nativo', p2pkh: 'Legado', p2sh: 'SegWit compatível', p2tr: 'Taproot' };
  return { src: src || 'blockchain.info', a: sat > 0 ? [wwNative('btc', sat / 1e8)] : [], x: { used: used.length, withBal: used.filter((u) => u.b > 0).length, types: types.map((t) => T[t]), addrs: used.filter((u) => u.b > 0).sort((p, q) => q.b - p.b).slice(0, 30).map((u) => [u.a, u.b / 1e8, u.c]) }, txs };
}
// Litecoin: litecoinspace.org (mesma API do mempool); reserva: BlockCypher
async function wwBcy(w, coin, net) {
  const j = await getJSON(`https://api.blockcypher.com/v1/${coin}/main/addrs/${w.addr}?limit=12`, { timeout: 15000 });
  const by = {}; (j.txrefs || []).concat(j.unconfirmed_txrefs || []).forEach((r) => { const o = by[r.tx_hash] || (by[r.tx_hash] = [Date.parse(r.confirmed || r.received) || Date.now(), 0, r.tx_hash, !!r.confirmed]); o[1] += (r.tx_input_n === -1 ? 1 : -1) * (r.value || 0) / 1e8; });
  const q = (num(j.final_balance) || 0) / 1e8;
  return { src: 'BlockCypher', a: q > 0 ? [wwNative(net, q)] : [], x: { tx: j.final_n_tx || j.n_tx || 0 }, txs: Object.values(by).sort((p, q2) => q2[0] - p[0]).slice(0, 12) };
}
async function wwReadLtc(w) { try { return await wwReadEsplora(w, 'https://litecoinspace.org/api', 'ltc', 'litecoinspace.org'); } catch { return wwBcy(w, 'ltc', 'ltc'); } }
async function wwReadDoge(w) {
  try { await wwGate('api.blockcypher.com', 400); return await wwBcy(w, 'doge', 'doge'); }
  catch (e) {
    const j = await getJSON(`https://api.blockchair.com/dogecoin/dashboards/address/${w.addr}?limit=0`, { timeout: 15000 });
    const d = j.data && j.data[w.addr] && j.data[w.addr].address; if (!d) throw e;
    const q = (num(d.balance) || 0) / 1e8;
    return { src: 'Blockchair', a: q > 0 ? [wwNative('doge', q)] : [], x: { tx: d.transaction_count || 0 }, txs: [] };
  }
}
// XRP: xrplcluster.com; reserva: xrpl.ws
async function wwReadXrp(w) {
  let j, src = 'xrplcluster.com';
  try { j = await wwPost('https://xrplcluster.com/', { method: 'account_info', params: [{ account: w.addr, ledger_index: 'validated' }] }); }
  catch { j = await wwPost('https://xrpl.ws/', { method: 'account_info', params: [{ account: w.addr, ledger_index: 'validated' }] }); src = 'xrpl.ws'; }
  const r = j && j.result; if (!r) throw new Error(L('resposta vazia', 'empty response'));
  if (r.error === 'actNotFound') return { src, a: [], x: { note: L('conta ainda não ativada na XRP Ledger', 'account not activated yet') } };
  if (r.error) throw new Error(r.error_message || r.error);
  const q = (num(r.account_data && r.account_data.Balance) || 0) / 1e6;
  return { src, a: q > 0 ? [wwNative('xrp', q)] : [], x: { owner: r.account_data.OwnerCount || 0 } };
}
// Tron: TronGrid (1 pedido por segundo sem chave); tokens TRC-20 só os reconhecidos
async function wwReadTrx(w) {
  await wwGate('api.trongrid.io', 1150);
  const j = await getJSON(`https://api.trongrid.io/v1/accounts/${w.addr}`, { timeout: 15000 });
  const d = j && Array.isArray(j.data) ? j.data[0] : null;
  if (!d) return { src: 'TronGrid', a: [], x: { note: L('conta ainda não ativada na Tron', 'account not activated yet') } };
  const a = []; let hid = 0;
  const trx = (num(d.balance) || 0) / 1e6; if (trx > 0) a.push(wwNative('trx', trx));
  const staked = (d.frozenV2 || []).reduce((s, f) => s + (num(f.amount) || 0), 0) / 1e6 + ((d.account_resource && d.account_resource.frozen_balance_for_energy && num(d.account_resource.frozen_balance_for_energy.frozen_balance)) || 0) / 1e6 + (d.frozen || []).reduce((s, f) => s + (num(f.frozen_balance) || 0), 0) / 1e6;
  if (staked > 0) a.push(wwNative('trx', staked, { x: 'stake' }));
  const map = WWT.by.trx || new Map();
  for (const o of d.trc20 || []) for (const [ca, raw] of Object.entries(o)) {
    const t = map.get(ca); if (!t) { if (String(raw) !== '0') hid++; continue; }
    const q = wwUnits(BigInt(raw), t[0]); if (q > 0) a.push(wwCgAsset(t[1], 'trx', q, { ca }));
  }
  return { src: 'TronGrid', a, hid, x: {} };
}
// Solana: saldos pela API pública da Jupiter; tokens fora da lista só entram se a Jupiter os verificar
async function wwReadSol(w) {
  let bal = null, part = '';
  try { bal = await getJSON(`https://lite-api.jup.ag/ultra/v1/balances/${w.addr}`, { timeout: 20000 }); }
  catch (e) {
    const r = await wwPost('https://solana-rpc.publicnode.com', { jsonrpc: '2.0', id: 1, method: 'getBalance', params: [w.addr] });
    const q = num(r && r.result && r.result.value) / 1e9; if (!isNum(q)) throw e;
    return { src: 'PublicNode', a: q > 0 ? [wwNative('sol', q)] : [], part: L('tokens SPL indisponíveis agora (só o SOL foi lido)', 'SPL tokens unavailable now (SOL only)'), x: {} };
  }
  const a = []; let hid = 0;
  const sol = num(bal.SOL && bal.SOL.uiAmount) || 0; if (sol > 0) a.push(wwNative('sol', sol));
  const map = WWT.by.sol || new Map(); const unknown = [];
  for (const [mint, v] of Object.entries(bal)) {
    if (mint === 'SOL') continue; const q = num(v && v.uiAmount); if (!(q > 0)) continue;
    const t = map.get(mint); if (t) a.push(wwCgAsset(t[1], 'sol', q, { ca: mint })); else unknown.push([mint, q]);
  }
  if (unknown.length) {
    try {
      const info = {};
      for (let i = 0; i < unknown.length && i < 300; i += 100) { const r = await getJSON(`https://lite-api.jup.ag/tokens/v2/search?query=${unknown.slice(i, i + 100).map((u) => u[0]).join(',')}`, { timeout: 15000 }); (Array.isArray(r) ? r : []).forEach((t) => { info[t.id] = t; }); }
      const ts = Date.now();
      for (const [mint, q] of unknown) {
        const t = info[mint];
        if (!t || !t.isVerified || !isNum(t.usdPrice)) { hid++; continue; }
        a.push(wwA({ k: 'sol:' + mint, s: String(t.symbol || '?').slice(0, 12), n: String(t.name || t.symbol || mint).slice(0, 40), net: 'sol', q, ca: mint, logo: /^https:\/\//.test(t.icon || '') ? t.icon : '', px: { p: t.usdPrice, chg: num(t.stats24h && t.stats24h.priceChange), ts, src: 'Jupiter' } }));
      }
    } catch { hid += unknown.length; part = L('alguns tokens ficaram sem nome e preço agora', 'some tokens without name/price now'); }
  }
  return { src: 'Jupiter', a, hid, part, x: {} };
}
// TON: TonAPI (moeda e jettons com preço); reserva: Toncenter (só TON)
const wwPctTxt = (s) => { const v = parseFloat(String(s || '').replace('−', '-').replace('%', '')); return isNum(v) ? v : null; };
async function wwReadTon(w) {
  try {
    await wwGate('tonapi.io', 1100);
    const acc = await getJSON(`https://tonapi.io/v2/accounts/${encodeURIComponent(w.addr)}`, { timeout: 15000 });
    await wwGate('tonapi.io', 1100);
    const jet = await getJSON(`https://tonapi.io/v2/accounts/${encodeURIComponent(w.addr)}/jettons?currencies=usd`, { timeout: 15000 }).catch(() => null);
    const a = []; let hid = 0; const ts = Date.now();
    const ton = (num(acc.balance) || 0) / 1e9; if (ton > 0) a.push(wwNative('ton', ton));
    const map = WWT.by.ton || new Map();
    for (const b of (jet && jet.balances) || []) {
      const j = b.jetton || {}; const raw = String(j.address || '').toLowerCase(); const dec = num(j.decimals); if (!isNum(dec)) continue;
      const q = wwUnits(BigInt(b.balance || '0'), dec); if (!(q > 0)) continue;
      const known = map.get(raw); const pr = b.price && b.price.prices ? num(b.price.prices.USD) : null;
      const px = isNum(pr) && pr > 0 ? { p: pr, chg: b.price.diff_24h ? wwPctTxt(b.price.diff_24h.USD) : null, ts, src: 'TonAPI' } : null;
      if (known) a.push(wwCgAsset(known[1], 'ton', q, { ca: raw, px }));
      else if (j.verification === 'whitelist' && px) a.push(wwA({ k: 'ton:' + raw, s: String(j.symbol || '?').slice(0, 12), n: String(j.name || j.symbol).slice(0, 40), net: 'ton', q, ca: raw, logo: /^https:\/\//.test(j.image || '') ? j.image : '', px }));
      else hid++;
    }
    return { src: 'TonAPI', a, hid, part: jet ? '' : L('jettons indisponíveis agora', 'jettons unavailable now'), x: { status: acc.status } };
  } catch (e) {
    const j = await getJSON(`https://toncenter.com/api/v3/walletInformation?address=${encodeURIComponent(w.addr)}&use_v2=false`, { timeout: 15000 });
    const q = (num(j.balance) || 0) / 1e9;
    return { src: 'Toncenter', a: q > 0 ? [wwNative('ton', q)] : [], part: L('jettons indisponíveis agora (só o TON foi lido)', 'jettons unavailable now (TON only)'), x: {} };
  }
}
const WW_READERS = { btc: wwReadBtc, btcx: wwReadXpub, evm: wwReadEvm, ltc: wwReadLtc, doge: wwReadDoge, xrp: wwReadXrp, trx: wwReadTrx, sol: wwReadSol, ton: wwReadTon };

// ---------- preços (Binance ao vivo > DefiLlama > CoinGecko > preço da própria fonte) ----------
const WWP = {}; // id CoinGecko → { p, chg, ts, src }
async function wwFetchPrices(ids) {
  const need = [...new Set(ids)].filter((id) => id && !(BY_CG[id] && PX[BY_CG[id].s]));
  if (!need.length) return 0;
  let got = 0;
  for (let i = 0; i < need.length; i += 80) {
    const part = need.slice(i, i + 80); const keys = part.map((id) => 'coingecko:' + id).join(',');
    try {
      const [p, c] = await Promise.all([getJSON(`https://coins.llama.fi/prices/current/${keys}?searchWidth=6h`, { timeout: 15000 }), getJSON(`https://coins.llama.fi/percentage/${keys}?period=24h`, { timeout: 15000 }).catch(() => null)]);
      for (const id of part) { const r = p && p.coins && p.coins['coingecko:' + id]; if (r && isNum(r.price) && r.price >= 0) { WWP[id] = { p: r.price, chg: c && c.coins && isNum(c.coins['coingecko:' + id]) ? c.coins['coingecko:' + id] : null, ts: (r.timestamp || 0) * 1000 || Date.now(), src: 'DefiLlama' }; got++; } }
    } catch (e) {
      try { // reserva: CoinGecko
        const j = await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${part.join(',')}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`, { timeout: 15000 });
        for (const id of part) { const r = j[id]; if (r && isNum(r.usd)) { WWP[id] = { p: r.usd, chg: num(r.usd_24h_change), ts: (r.last_updated_at || 0) * 1000 || Date.now(), src: 'CoinGecko' }; got++; } }
      } catch { /* fica o último preço lido, com o horário dele */ }
    }
  }
  return got;
}
function wwPrice(a) {
  if (a.cg) {
    const c = BY_CG[a.cg]; if (c && PX[c.s]) return { p: PX[c.s].p, chg: PX[c.s].chg, ts: PX[c.s].seen, src: 'Binance', live: true };
    if (WWP[a.cg]) return WWP[a.cg];
    const q = priceOf(a.cg); if (q) return q;
  }
  return a.px || null;
}
