'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { acceptOne, rejectOne, resolveDir } = require('./accept');
const { generateReport } = require('./report');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
};

/**
 * Serve the snapshot dir: static report + images, plus POST /api/accept and
 * POST /api/reject for one-click baseline management from the report page.
 */
function serve(dir, port = 4567) {
  dir = resolveDir(dir);
  generateReport(dir, { serveMode: true });

  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && (req.url === '/api/accept' || req.url === '/api/reject')) {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const { name } = JSON.parse(body || '{}');
          if (!name) throw new Error('missing name');
          const out = req.url === '/api/accept' ? acceptOne(dir, name) : rejectOne(dir, name);
          generateReport(dir, { serveMode: true }); // refresh embedded results
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(out));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, reason: err.message }));
        }
      });
      return;
    }

    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/report.html';
    if (urlPath === '/report.html') generateReport(dir, { serveMode: true }); // always fresh on load
    const filePath = path.normalize(path.join(dir, urlPath));
    if (!filePath.startsWith(dir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store', // local review tool: never serve stale images/report
    });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(port, () => {
    console.log(`[visual-review] serving ${dir}`);
    console.log(`[visual-review] open http://localhost:${port}/`);
  });
  return server;
}

module.exports = { serve };
