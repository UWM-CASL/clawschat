const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const PORT = Number(process.env.PLAYWRIGHT_PORT || '4173');
const HOST = process.env.PLAYWRIGHT_HOST || '127.0.0.1';

function normalizeBasePath(value = '/') {
  const trimmed = String(value || '/').trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

const BASE_PATH = normalizeBasePath(process.env.PLAYWRIGHT_BASE_PATH || '/');
const BASE_PATH_WITHOUT_TRAILING_SLASH = BASE_PATH === '/' ? '/' : BASE_PATH.slice(0, -1);

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getContentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function toDistPath(requestPathname) {
  let pathname = requestPathname || '/';
  if (BASE_PATH !== '/') {
    if (pathname === BASE_PATH_WITHOUT_TRAILING_SLASH) {
      pathname = BASE_PATH;
    } else if (pathname.startsWith(BASE_PATH)) {
      pathname = `/${pathname.slice(BASE_PATH.length)}`;
    }
  }

  if (!pathname || pathname === '/') {
    return path.join(DIST_DIR, 'index.html');
  }

  const decodedPathname = decodeURIComponent(pathname);
  const normalizedRelativePath = decodedPathname.replace(/^\/+/, '');
  const resolvedPath = path.resolve(DIST_DIR, normalizedRelativePath);
  if (!resolvedPath.startsWith(`${DIST_DIR}${path.sep}`) && resolvedPath !== DIST_DIR) {
    return null;
  }
  return resolvedPath;
}

function sendNotFound(response) {
  response.statusCode = 404;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end('Not found');
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || HOST}`);
  let filePath = toDistPath(requestUrl.pathname);
  if (!filePath) {
    sendNotFound(response);
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendNotFound(response);
    return;
  }

  response.statusCode = 200;
  response.setHeader('Content-Type', getContentType(filePath));
  fs.createReadStream(filePath).pipe(response);
});

server.listen(PORT, HOST, () => {
  // Playwright waits on the configured URL, so a concise ready line is enough here.
  process.stdout.write(`Static dist server listening on http://${HOST}:${PORT}${BASE_PATH}\n`);
});

