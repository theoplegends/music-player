'use strict';

// Static file server for the browser build of Music Player.
// Intentionally dependency-free: the container image needs no `npm install`.

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const PORT = Number.parseInt(process.env.PORT, 10) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/vnd.microsoft.icon'
};

/**
 * Resolves a URL path to a file inside ROOT, or null if it escapes.
 * @param {string} urlPath
 * @returns {string|null}
 */
function resolveInsideRoot(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const resolved = path.resolve(ROOT, '.' + path.posix.normalize(decoded));
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  return resolved;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Length': Buffer.byteLength(body), ...headers });
  res.end(body);
}

async function serveFile(req, res, filePath) {
  let stats;
  try {
    stats = await fsp.stat(filePath);
  } catch {
    send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }
  if (!stats.isFile()) {
    send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  const headers = {
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stats.size,
    // The page is the app shell and changes on every deploy; assets are stable.
    'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff'
  };

  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    return;
  }

  res.writeHead(200, headers);
  const stream = fs.createReadStream(filePath);
  stream.on('error', error => {
    console.error(`Error streaming ${filePath}:`, error);
    res.destroy();
  });
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    return;
  }

  const urlPath = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;

  if (urlPath === '/healthz') {
    send(res, 200, JSON.stringify({ status: 'ok' }), { 'Content-Type': 'application/json; charset=utf-8' });
    return;
  }

  if (urlPath === '/' || urlPath === '/index.html') {
    serveFile(req, res, path.join(ROOT, 'index.html'));
    return;
  }

  // Everything else the app is allowed to request lives under /assets.
  if (urlPath.startsWith('/assets/')) {
    const filePath = resolveInsideRoot(urlPath);
    if (!filePath) {
      send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }
    serveFile(req, res, filePath);
    return;
  }

  send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
});

server.on('error', error => {
  console.error('Server error:', error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Music Player listening on http://${HOST}:${PORT}`);
});

// Containers stop with SIGTERM; close the listener so in-flight responses finish.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
