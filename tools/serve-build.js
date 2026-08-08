// Serves build/ so you can click around the minified site before deploying it.
//
//   npm run serve:build
//
// Reuses the test server's routing (pretty extensionless URLs, the same MIME
// map) rather than reimplementing it, so what you browse here behaves like the
// real host.
const path = require('path');
const fs = require('fs');

const BUILD = path.resolve(__dirname, '..', 'build');
if (!fs.existsSync(path.join(BUILD, 'index.html'))) {
  console.error('build/ is empty or missing — run `npm run build` first.');
  process.exit(1);
}

process.env.SERVE_ROOT = BUILD;
process.env.PORT = process.env.PORT || 8415;
require(path.join(__dirname, '..', 'tests', 'serve.js'));
