#!/usr/bin/env node
/**
 * Motion Landing - a small static HTTP server.
 *
 * On startup the icons directory is scanned, up to 64 icons are picked at
 * random, and the landing page is generated once and held in memory. The
 * server is meant to sit behind a TLS-terminating reverse proxy, so it binds
 * to loopback by default.
 *
 * Environment variables:
 *   HOST       Interface to bind (default 127.0.0.1)
 *   PORT       Port to listen on (default 8080)
 *   ICONS_DIR  Directory containing .svg/.png icons (default ./icons)
 *   TITLE      Default page title (default "Motion Landing")
 *   SUBTITLE   Default page subtitle
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listIcons, selectIcons, MAX_ICONS } from './lib/icons.js';
import { renderPage } from './lib/render.js';
import { createHandler } from './lib/server.js';
import { buildVersion, renderServiceWorker } from './lib/version.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

const config = {
  host: process.env.HOST || '127.0.0.1',
  port: parsePort(process.env.PORT ?? '8080'),
  iconsDir: path.resolve(process.env.ICONS_DIR || path.join(ROOT, 'icons')),
  publicDir: path.join(ROOT, 'public'),
  templatePath: path.join(ROOT, 'templates', 'index.html'),
  title: process.env.TITLE || 'Motion Landing',
  subtitle: process.env.SUBTITLE ?? 'Icons in fluid motion',
};

const available = await listIcons(config.iconsDir);
const icons = selectIcons(available, MAX_ICONS);
const template = await readFile(config.templatePath, 'utf8');
const html = renderPage(template, { title: config.title, subtitle: config.subtitle, icons });

// A new version on every start makes clients install a fresh service worker
// and drop the previous caches.
const version = buildVersion();
const workerSource = await readFile(path.join(config.publicDir, 'sw.js'), 'utf8');
const serviceWorker = renderServiceWorker(workerSource, version);

console.log(`Found ${available.length} icon(s) in ${config.iconsDir}; displaying ${icons.length}.`);
console.log(`Version ${version}`);

const server = http.createServer(
  createHandler({ html, serviceWorker, publicDir: config.publicDir, iconsDir: config.iconsDir, icons }),
);

server.listen(config.port, config.host, () => {
  const { address, port } = server.address();
  const host = address.includes(':') ? `[${address}]` : address;
  console.log(`Motion Landing listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
