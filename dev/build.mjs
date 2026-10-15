#!/usr/bin/env node
// Monta o site a partir de src/: index.html (CSS + JS num arquivo só, com o hash da CSP)
// e copia os arquivos estáticos. Uso: node dev/build.mjs [--beta]
//   sem opção → raiz do repositório (site principal)
//   --beta    → pasta beta/ (endereço de teste: .../Claude_crypto_hub7.0/beta/)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const beta = process.argv.includes('--beta');
const OUT = beta ? join(ROOT, 'beta') : ROOT;
const sh = (c) => { try { return execSync(c, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const build = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-') + (sh('git rev-parse --short HEAD') ? '-' + sh('git rev-parse --short HEAD') : '') + (beta ? '-beta' : '');

const css = readFileSync(join(ROOT, 'src/styles.css'), 'utf8');
const files = readdirSync(join(ROOT, 'src/js')).filter((f) => f.endsWith('.js')).sort();
let js = files.map((f) => `// ---- ${f} ----\n${readFileSync(join(ROOT, 'src/js', f), 'utf8')}`).join('\n');
if (!js.includes("build: '__BUILD__'")) throw new Error('marcador __BUILD__ não encontrado');
js = js.replace("build: '__BUILD__'", `build: '${build}'`);
// segurança: nada de manipulador inline (a CSP bloquearia) nem fechamento de <script>/<style> no meio
for (const [re, what] of [[/<\/script/i, '</script'], [/\son(click|error|load|change|input|submit)\s*=\s*["']/i, 'manipulador inline (on...=)']]) if (re.test(js)) throw new Error(`JS contém ${what}`);
if (/<\/style/i.test(css)) throw new Error('CSS contém </style');

// confere a sintaxe do JS antes de gravar
const tmp = join(tmpdir(), `nx-build-${process.pid}.js`);
writeFileSync(tmp, js);
try { execSync(`node --check ${tmp}`, { stdio: 'pipe' }); } catch (e) { console.error(String(e.stderr || e)); process.exit(1); }

const body = '\n' + js + '\n';
const hash = createHash('sha256').update(body, 'utf8').digest('base64');
const csp = [
  "default-src 'self'",
  `script-src 'self' 'sha256-${hash}' https://cdn.jsdelivr.net https://unpkg.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss://stream.binance.com:9443 wss://data-stream.binance.vision",
  "worker-src 'self'", "manifest-src 'self'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'self'",
].join('; ');
const tpl = readFileSync(join(ROOT, 'src/index.template.html'), 'utf8');
const MARK_JS = '<script>\n/*__JS__*/\n</script>';
if (!tpl.includes(MARK_JS) || !tpl.includes('/*__CSS__*/') || !tpl.includes('__CSP__')) throw new Error('marcadores do template ausentes');
const html = tpl.replace('__CSP__', csp).replace('/*__CSS__*/', () => css).replace(MARK_JS, () => `<script>${body}</script>`);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.html'), html);
// estáticos
const STATIC = join(ROOT, 'src/static');
const copied = [];
if (existsSync(STATIC)) for (const f of readdirSync(STATIC)) {
  if (statSync(join(STATIC, f)).isDirectory()) continue;
  if (beta && f === '.nojekyll') continue;
  copyFileSync(join(STATIC, f), join(OUT, f)); copied.push(f);
}
// ---------- página de apresentação (landing.html) ----------
{
  const cfg = readFileSync(join(ROOT, 'src/js/00-config.js'), 'utf8');
  const fomc = cfg.match(/const FOMC = \[[\s\S]*?\];/), copom = cfg.match(/const COPOM = \[[\s\S]*?\]\.map\([^;]*\);/);
  if (!fomc || !copom) throw new Error('datas do FOMC/Copom não encontradas em 00-config.js');
  const ljs = readFileSync(join(ROOT, 'src/landing.js'), 'utf8').replace('/*__AGENDA__*/', `${fomc[0]}\n${copom[0]}`);
  const ltmp = join(tmpdir(), `nx-landing-${process.pid}.js`); writeFileSync(ltmp, ljs);
  try { execSync(`node --check ${ltmp}`, { stdio: 'pipe' }); } catch (e) { console.error(String(e.stderr || e)); process.exit(1); }
  const lbody = '\n' + ljs + '\n';
  const lhash = createHash('sha256').update(lbody, 'utf8').digest('base64');
  const lcsp = ["default-src 'self'", `script-src 'sha256-${lhash}'`, "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com", "img-src 'self' data:", "connect-src https://api.binance.com https://data-api.binance.vision https://economia.awesomeapi.com.br", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');
  const lt = readFileSync(join(ROOT, 'src/landing.template.html'), 'utf8');
  if (!lt.includes(MARK_JS) || !lt.includes('__CSP__')) throw new Error('marcadores do landing ausentes');
  const lhtml = lt.replace('__CSP__', lcsp).replace(MARK_JS, () => `<script>${lbody}</script>`);
  writeFileSync(join(OUT, 'landing.html'), lhtml);
  console.log(`✓ ${beta ? 'beta/' : ''}landing.html  ${(Buffer.byteLength(lhtml) / 1024).toFixed(1)} KB`);
}
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`✓ ${beta ? 'beta/' : ''}index.html  ${kb(Buffer.byteLength(html))}  (JS ${kb(Buffer.byteLength(js))} em ${files.length} módulos, CSS ${kb(Buffer.byteLength(css))})`);
console.log(`  versão ${build} · CSP sha256-${hash.slice(0, 12)}…`);
if (copied.length) console.log(`  estáticos: ${copied.join(', ')}`);
