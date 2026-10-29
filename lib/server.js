import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** Headers sent with every response. */
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

/** Strict policy for the landing page: only same-origin resources, no inline script or style. */
export const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Policy for user-provided icons. SVG files can carry script; if an icon is
 * opened directly (rather than through <img>) the sandbox keeps it inert.
 */
export const ICON_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

function send(req, res, status, headers, body = '') {
  const payload = Buffer.from(body);
  res.writeHead(status, {
    ...BASE_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': payload.length,
    ...headers,
  });
  res.end(req.method === 'HEAD' ? undefined : payload);
}

async function sendFile(req, res, filePath, headers = {}) {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    send(req, res, 404, {}, 'Not Found');
    return;
  }
  if (!info.isFile()) {
    send(req, res, 404, {}, 'Not Found');
    return;
  }

  const lastModified = new Date(Math.floor(info.mtimeMs / 1000) * 1000);
  const since = Date.parse(req.headers['if-modified-since'] ?? '');
  const common = {
    ...BASE_HEADERS,
    'Last-Modified': lastModified.toUTCString(),
    'Cache-Control': 'no-cache',
    ...headers,
  };
  if (!Number.isNaN(since) && lastModified.getTime() <= since) {
    res.writeHead(304, common);
    res.end();
    return;
  }

  res.writeHead(200, {
    ...common,
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/**
 * Creates the request handler for the static server.
 *
 * Routes:
 *   GET /            -> generated landing page (held in memory)
 *   GET /icons/NAME  -> one of the icons selected at startup (others are 404)
 *   GET /...         -> files from `publicDir` (dotfiles and traversal are rejected)
 *
 * @param {{ html: string, publicDir: string, iconsDir: string, icons: string[] }} options
 * @returns {import('node:http').RequestListener}
 */
export function createHandler({ html, publicDir, iconsDir, icons }) {
  const publicRoot = path.resolve(publicDir);
  const iconsRoot = path.resolve(iconsDir);
  const allowedIcons = new Set(icons);
  const page = Buffer.from(html);

  return async function handler(req, res) {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(req, res, 405, { Allow: 'GET, HEAD' }, 'Method Not Allowed');
        return;
      }

      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      } catch {
        send(req, res, 400, {}, 'Bad Request');
        return;
      }
      if (pathname.includes('\0') || pathname.includes('\\')) {
        send(req, res, 400, {}, 'Bad Request');
        return;
      }

      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, {
          ...BASE_HEADERS,
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': page.length,
          'Cache-Control': 'no-cache',
          'Content-Security-Policy': PAGE_CSP,
          'Permissions-Policy': 'screen-wake-lock=(self)',
        });
        res.end(req.method === 'HEAD' ? undefined : page);
        return;
      }

      if (pathname.startsWith('/icons/')) {
        // Only the icons chosen at startup are served; the name is matched
        // exactly against the allowlist, so no path manipulation is possible.
        const name = pathname.slice('/icons/'.length);
        if (!allowedIcons.has(name)) {
          send(req, res, 404, {}, 'Not Found');
          return;
        }
        await sendFile(req, res, path.join(iconsRoot, name), {
          'Content-Security-Policy': ICON_CSP,
          'Cache-Control': 'public, max-age=86400',
        });
        return;
      }

      const segments = pathname.split('/');
      if (segments.some((segment) => segment.startsWith('.'))) {
        send(req, res, 404, {}, 'Not Found');
        return;
      }
      const filePath = path.resolve(publicRoot, `.${pathname}`);
      if (!filePath.startsWith(publicRoot + path.sep)) {
        send(req, res, 404, {}, 'Not Found');
        return;
      }
      await sendFile(req, res, filePath);
    } catch {
      if (!res.headersSent) send(req, res, 500, {}, 'Internal Server Error');
      else res.destroy();
    }
  };
}
