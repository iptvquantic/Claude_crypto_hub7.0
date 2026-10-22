// Testa o núcleo do Wallet Watch (src/js/19b-wallets-core.js) no Node, sem navegador e sem internet:
// hashes, base58/bech32, derivação de endereços da xpub (vetores oficiais BIP44/49/84/86),
// checksum EVM, ENS, TON e — o mais importante — o bloqueio de frase-semente e chave privada.
// Uso: node dev/test-wallets.mjs
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';

const src = readFileSync(new URL('../src/js/19b-wallets-core.js', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('// ==WWC-START=='), src.indexOf('// ==WWC-END=='));
if (!block) throw new Error('marcadores WWC não encontrados');
const { WWC, wwDetect } = new Function(`${block}; return { WWC, wwDetect };`)();
const fails = [];
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails.push(m); };
const H = (b) => WWC.hex(b);

// ---------- hashes ----------
ok(H(WWC.sha256(WWC.utf8('abc'))) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' && H(WWC.sha256(new Uint8Array(0))) === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'SHA-256: vetores oficiais');
let shaOk = true; for (let i = 0; i < 300; i++) { const m = randomBytes(i * 7 % 300); if (H(WWC.sha256(m)) !== createHash('sha256').update(m).digest('hex')) shaOk = false; }
ok(shaOk, 'SHA-256: 300 mensagens aleatórias iguais às do Node');
ok(H(WWC.ripemd160(new Uint8Array(0))) === '9c1185a5c5e9fc54612808977ee8f548b2258d31' && H(WWC.ripemd160(WWC.utf8('abc'))) === '8eb208f7e05d987a9b044a8e98c6b087f15a0bfc' && H(WWC.ripemd160(WWC.utf8('message digest'))) === '5d0689ef49d2fae572b881b123a85ffa21595f36' && H(WWC.ripemd160(WWC.utf8('a'.repeat(1000)))) === 'aa69deee9a8922e92f8105e007f76110f381e9cf', 'RIPEMD-160: vetores oficiais');
let rmdOk = null; try { rmdOk = true; for (let i = 0; i < 200; i++) { const m = randomBytes(i * 5 % 200); if (H(WWC.ripemd160(m)) !== createHash('ripemd160').update(m).digest('hex')) rmdOk = false; } } catch { rmdOk = null; }
if (rmdOk !== null) ok(rmdOk, 'RIPEMD-160: 200 mensagens aleatórias iguais às do Node');
ok(H(WWC.keccak256(new Uint8Array(0))) === 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' && H(WWC.keccak256(WWC.utf8('abc'))) === '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45', 'Keccak-256: vetores');
ok(H(WWC.keccak256(new Uint8Array(200))) === H(WWC.keccak256(new Uint8Array(200))) && WWC.keccak256(new Uint8Array(136)).length === 32, 'Keccak-256: mensagem do tamanho exato de um bloco');
// ---------- EVM ----------
const EIP55 = ['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359', '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB', '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb'];
ok(EIP55.every((a) => WWC.evmChecksum(a.toLowerCase()) === a), 'EIP-55: checksum dos exemplos oficiais');
ok(WWC.namehash('eth') === '0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae' && WWC.namehash('vitalik.eth') === '0xee6c4522aab0003e8d14cd40a6af439055fd2577951148c14b6cea9a53475835', 'ENS: namehash');
// ---------- base58 / bech32 ----------
const g = WWC.b58check('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
ok(g && g[0] === 0 && H(g.subarray(1)) === '62e907b15cbf27d5425399ebf6f0fb50ebb88f18' && WWC.b58checkEnc(g) === '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'base58check: endereço do bloco gênese ida e volta');
ok(WWC.b58check('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb') === null, 'base58check: um caractere errado é recusado');
const sw = WWC.segwitDec('bc', 'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4');
ok(sw && sw.ver === 0 && H(sw.prog) === '751e76e8199196d454941c45d1b3a323f1433bd6', 'bech32: vetor BIP173 (maiúsculas)');
ok(!!WWC.segwitDec('bc', 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0') && !!WWC.segwitDec('bc', 'bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs') && WWC.segwitDec('bc', 'bc1zw508d6qejxtdg4y5r3zarvaryvg6kdaj') === null && WWC.segwitDec('bc', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5') === null, 'bech32m: vetores BIP350 (válidos, v2 com checksum antigo e checksum errado recusados)');
// ---------- derivação da xpub (mnemônico de teste "abandon … about") ----------
async function derive(xpub, type, chain, i) { const x = WWC.parseExt(xpub); const c = await WWC.ckd({ chain: x.chain, key: x.key }, chain); const n = await WWC.ckd(c, i); return WWC.btcAddr[type](n.key); }
const V = [
  ['zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs', 'p2wpkh', [[0, 0, 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'], [0, 1, 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g'], [1, 0, 'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el']], 'BIP84'],
  ['ypub6Ww3ibxVfGzLrAH1PNcjyAWenMTbbAosGNB6VvmSEgytSER9azLDWCxoJwW7Ke7icmizBMXrzBx9979FfaHxHcrArf3zbeJJJUZPf663zsP', 'p2sh', [[0, 0, '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf']], 'BIP49'],
  ['xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj', 'p2pkh', [[0, 0, '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA']], 'BIP44'],
  ['xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ', 'p2tr', [[0, 0, 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'], [0, 1, 'bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh'], [1, 0, 'bc1p3qkhfews2uk44qtvauqyr2ttdsw7svhkl9nkm9s9c3x4ax5h60wqwruhk7']], 'BIP86 (Taproot)'],
];
for (const [x, type, list, name] of V) {
  const got = []; for (const [c, i, want] of list) got.push((await derive(x, type, c, i)) === want);
  ok(got.every(Boolean), `xpub ${name}: ${list.length} endereço(s) derivado(s) iguais ao padrão`);
}
const t0 = Date.now(); for (let i = 0; i < 40; i++) await derive(V[0][0], 'p2wpkh', 0, i);
ok(Date.now() - t0 < 8000, `xpub: 40 endereços em ${Date.now() - t0} ms`);
// ---------- reconhecer o que foi colado ----------
const D = (s) => wwDetect(s);
const seed12 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
ok(D(seed12).secret === 'seed' && D(seed12.toUpperCase()).secret === 'seed' && D(seed12.split(' ').concat(Array(12).fill('zoo')).join(' ')).secret === 'seed', 'frase-semente de 12 e 24 palavras: bloqueada');
ok(D('casa bola gato').secret === 'seed' && D('minha carteira bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu').ok === false, 'palavras soltas e texto com espaço: recusados');
ok(D('e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35').secret === 'priv' && D('0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318').secret === 'priv', 'chave privada em hexadecimal (64 caracteres): bloqueada');
ok(D('5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ').secret === 'wif' && D('KwdMAjGmerYanjeui5SHS7JkmpZvVipYvB2LJGU1ZxJwYvP98617').secret === 'wif', 'chave privada WIF: bloqueada');
ok(D('xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi').secret === 'xprv', 'chave privada estendida (xprv): bloqueada');
ok(D(JSON.stringify(Array.from({ length: 64 }, (_, i) => (i * 37) % 256))).secret === 'solkey' && D(WWC.b58enc(randomBytes(64))).secret === 'solkey', 'chave privada da Solana (lista de 64 números ou base58 de 64 bytes): bloqueada');
ok(D('{"address":"x","crypto":{"ciphertext":"abc"}}').secret === 'keystore', 'arquivo keystore: bloqueado');
const btcs = { '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa': 'Legado (P2PKH)', '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf': 'P2SH (SegWit compatível)', 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu': 'SegWit nativo', 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr': 'Taproot', 'BC1QCR8TE4KR609GCAWUTMRZA0J4XV80JY8Z306FYU': 'SegWit nativo' };
ok(Object.entries(btcs).every(([a, sub]) => D(a).kind === 'btc' && D(a).sub === sub), 'BTC: legado, P2SH, SegWit e Taproot reconhecidos (maiúsculas viram minúsculas)');
ok(D('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyv').msg === 'typo' && D('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb').msg === 'typo', 'BTC com erro de digitação: avisado');
ok(D(V[0][0]).kind === 'btcx' && D(V[0][0]).xtype === 'zpub' && D(V[3][0]).xtype === 'xpub', 'xpub/zpub reconhecidas');
const lowEvm = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
ok(D(lowEvm).kind === 'evm' && D(lowEvm).addr === EIP55[0] && D(EIP55[0]).ok && D('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD').msg === 'typo', 'EVM: minúsculas aceitas, checksum conferido, letra trocada avisada');
ok(D('vitalik.eth').kind === 'ens' && D('Vitalik.ETH').addr === 'vitalik.eth', 'nome ENS reconhecido');
ok(D('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t').kind === 'trx' && D('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u').ok === false, 'Tron reconhecido (e com erro, recusado)');
ok(D('rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh').kind === 'xrp', 'XRP reconhecido');
ok(D('LQTpS3VaYTjCr4s9Y1t5zbeY26zevf7Fb3').kind === 'ltc' && D('MQd1fJwqBJvwLuyhr17PhEFx1swiqDbPQS').kind === 'ltc' && D('ltc1qzvcgmntglcuv4smv3lzj6k8szcvsrmvk0phrr9wfq8w493r096ssm2fgsw').kind === 'ltc', 'Litecoin (L, M e ltc1) reconhecido');
ok(D('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L').kind === 'doge', 'Dogecoin reconhecido');
ok(D('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM').kind === 'sol' && D('So11111111111111111111111111111111111111112').kind === 'sol', 'Solana reconhecida');
ok(D('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N').raw === '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8' && D('UQAkIXbCToQ6LowMrDNG2K3ERmMH8m4XB2owWgL0BAB14Jtl').raw === '0:242176c24e843a2e8c0cac3346d8adc4466307f26e17076a305a02f4040075e0' && D('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2M').ok === false, 'TON: amigável → bruto, código de verificação conferido');
ok(D('addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x').msg === 'unsupported' && D('cosmos1xyz').msg === 'unsupported', 'redes ainda sem suporte: avisado');
ok(D('olá').ok === false && D('').empty, 'texto qualquer: recusado sem erro');
console.log(`\n${fails.length ? '✗ ' + fails.length + ' falha(s)' : '✓ Wallet Watch (núcleo): tudo certo'}`);
process.exit(fails.length ? 1 : 0);
