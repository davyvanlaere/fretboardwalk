// Produces build/ — a complete, deployable copy of the site with the CSS and JS
// minified.
//
//   npm run build
//
// The site itself stays a zero-build static bundle: every file in the repo root
// is still directly serveable, and nothing here is required to run or develop
// the site. This only exists to make a smaller copy of it.
//
// Two deliberate choices:
//
//   HTML is not minified. The pages are mostly inline SVG and prose, where the
//   safe wins are tiny and gzip already collapses the whitespace. Collapsing it
//   by hand risks changing rendered text nodes for a rounding error's worth of
//   bytes.
//
//   Cache-busting query strings are rewritten to a content hash. Minified
//   assets must not reuse the cache key of the unminified ones, and hashing
//   also removes the manual `?v=` bumping that is easy to forget.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'build');

// Everything in the repo root is deployed as-is, so the build copies all of it
// and names the exceptions rather than the inclusions — a new page or asset is
// then picked up automatically instead of being silently left behind.
const SKIP = new Set([
  'build', 'tools', 'tests', 'node_modules', '.git', '.claude',
  '.gitignore', 'package.json', 'package-lock.json',
  'index_old.html',      // superseded, not linked from anywhere
  'icon-preview.svg',    // working file for the favicon, not referenced
]);

const MINIFY = { '.css': 'css', '.js': 'js' };
const hash = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
const kb = n => (n / 1024).toFixed(1) + 'KB';

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const src = path.join(from, e.name), dst = path.join(to, e.name);
    if (e.isDirectory()) copyTree(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
fs.rmSync(OUT, { recursive: true, force: true });
copyTree(ROOT, OUT);

// 1. minify
const report = [];
const hashes = {};
for (const file of walk(OUT)) {
  const loader = MINIFY[path.extname(file)];
  if (!loader) continue;
  const before = fs.readFileSync(file);
  // No `target`: this is a minifier, not a transpiler. Setting one makes
  // esbuild try to downlevel syntax the source already relies on working
  // natively, which changes the shipped code rather than just shrinking it.
  const { code, warnings } = esbuild.transformSync(before.toString('utf8'), {
    loader, minify: true, legalComments: 'none',
  });
  for (const w of warnings) console.warn(`  warning ${path.relative(OUT, file)}: ${w.text}`);
  fs.writeFileSync(file, code);
  const after = Buffer.byteLength(code);
  hashes[path.relative(OUT, file).replace(/\\/g, '/')] = hash(code);
  report.push({ f: path.relative(OUT, file).replace(/\\/g, '/'), a: before.length, b: after });
}

// 2. point every ?v= at the content hash of the file it refers to
let rewrites = 0;
const missing = [];
for (const file of walk(OUT)) {
  if (path.extname(file) !== '.html') continue;
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/(?<=(?:href|src)=")([^"?]+\.(?:css|js))\?v=[^"]*/g, (m, asset) => {
    const key = asset.replace(/^\.?\//, '');
    if (!hashes[key]) { missing.push(`${path.basename(file)} -> ${asset}`); return m; }
    rewrites++;
    return `${asset}?v=${hashes[key]}`;
  });
  fs.writeFileSync(file, html);
}

// 3. refuse to ship a build whose pages point at files that are not in it
const broken = [];
for (const file of walk(OUT)) {
  if (path.extname(file) !== '.html') continue;
  const html = fs.readFileSync(file, 'utf8');
  for (const m of html.matchAll(/(?:href|src)="(\/[^":]*?)(?:\?[^"]*)?"/g)) {
    let rel = m[1];
    if (rel === '/') rel = '/index.html';
    else if (!path.extname(rel)) rel += '.html';
    if (!fs.existsSync(path.join(OUT, rel))) broken.push(`${path.basename(file)} -> ${m[1]}`);
  }
}

// ---------------------------------------------------------------------------
console.log('minified:');
let a = 0, b = 0;
for (const r of report.sort((x, y) => y.a - x.a)) {
  a += r.a; b += r.b;
  console.log(`  ${r.f.padEnd(14)} ${kb(r.a).padStart(8)} -> ${kb(r.b).padStart(8)}   -${(100 - r.b / r.a * 100).toFixed(0)}%`);
}
console.log(`  ${'total'.padEnd(14)} ${kb(a).padStart(8)} -> ${kb(b).padStart(8)}   -${(100 - b / a * 100).toFixed(0)}%`);
console.log(`\n${rewrites} cache keys rewritten to content hashes`);
console.log(`${walk(OUT).length} files in build/  (${kb(walk(OUT).reduce((s, f) => s + fs.statSync(f).size, 0))} total)`);

if (missing.length) { console.error('\nreferences with no matching built asset:'); missing.forEach(x => console.error('  ' + x)); }
if (broken.length) { console.error('\nBROKEN LINKS IN BUILD:'); broken.forEach(x => console.error('  ' + x)); }
if (missing.length || broken.length) process.exit(1);
console.log('\nbuild/ is ready — verify it with:  npm run test:build');
