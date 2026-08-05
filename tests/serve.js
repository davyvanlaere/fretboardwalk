// Minimal static server for the test run. The real site is deployed as plain
// files with no build step, so this exists only to give Playwright an origin —
// localStorage, which nearly every test here manipulates, needs one.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8413;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml', '.txt': 'text/plain',
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  // The host serves extensionless pretty URLs (/help, /about); mirror that so
  // links exercised by tests resolve the same way they do in production.
  if (!path.extname(rel)) rel += '.html';

  const file = path.join(ROOT, rel);
  // Never serve outside the project, however the path was spelled.
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }

  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found: ' + rel); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}).listen(PORT, () => console.log('test server on http://localhost:' + PORT));
