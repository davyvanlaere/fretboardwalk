// Runs the full Playwright suite against build/ instead of the repo root, so a
// minified bundle has to pass exactly the same 136 tests the source does.
//
//   npm run test:build
//
// Uses its own port on purpose. The suite reuses an already-running server when
// it finds one, and a dev server on the usual port would quietly serve the
// unminified source — the build would then "pass" without being tested at all.
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const PORT = process.env.PORT || 8414;

if (!fs.existsSync(path.join(BUILD, 'index.html'))) {
  console.error('build/ is empty or missing — run `npm run build` first.');
  process.exit(1);
}

console.log(`running the suite against build/ on port ${PORT}\n`);
const child = spawn('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  cwd: path.join(ROOT, 'tests'),
  env: { ...process.env, SERVE_ROOT: BUILD, PORT: String(PORT) },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', code => process.exit(code ?? 1));
