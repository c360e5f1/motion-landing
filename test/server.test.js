import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createHandler, PAGE_CSP, ICON_CSP } from '../lib/server.js';

let root;
let server;
let port;

/** Raw request so that paths are sent exactly as written (no URL normalisation). */
function request(rawPath, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'ml-server-'));
  const publicDir = path.join(root, 'public');
  const iconsDir = path.join(root, 'icons');
  await mkdir(path.join(publicDir, 'sub'), { recursive: true });
  await mkdir(iconsDir);
  await writeFile(path.join(publicDir, 'styles.css'), 'body{}');
  await writeFile(path.join(publicDir, 'sub', 'a.js'), 'x');
  await writeFile(path.join(publicDir, '.env'), 'SECRET=1');
  await writeFile(path.join(iconsDir, 'shown.svg'), '<svg/>');
  await writeFile(path.join(iconsDir, 'with space.png'), 'png');
  await writeFile(path.join(iconsDir, 'not-selected.svg'), '<svg/>');
  await writeFile(path.join(root, 'secret.txt'), 'top secret');

  server = http.createServer(
    createHandler({ html: '<!doctype html><p>page</p>', publicDir, iconsDir, icons: ['shown.svg', 'with space.png'] }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
});

test('serves the generated page with security headers', async () => {
  for (const p of ['/', '/index.html', '/?utm=1']) {
    const res = await request(p);
    assert.equal(res.status, 200);
    assert.equal(res.body, '<!doctype html><p>page</p>');
    assert.match(res.headers['content-type'], /^text\/html/);
    assert.equal(res.headers['content-security-policy'], PAGE_CSP);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['permissions-policy'], 'screen-wake-lock=(self)');
  }
});

test('serves static files with the right content type', async () => {
  const res = await request('/styles.css');
  assert.equal(res.status, 200);
  assert.equal(res.body, 'body{}');
  assert.match(res.headers['content-type'], /^text\/css/);
  assert.equal((await request('/sub/a.js')).status, 200);
});

test('HEAD returns headers without a body', async () => {
  const res = await request('/styles.css', { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-length'], '6');
  assert.equal(res.body, '');
});

test('supports conditional requests', async () => {
  const first = await request('/styles.css');
  const res = await request('/styles.css', { headers: { 'If-Modified-Since': first.headers['last-modified'] } });
  assert.equal(res.status, 304);
});

test('serves only the selected icons, sandboxed', async () => {
  const shown = await request('/icons/shown.svg');
  assert.equal(shown.status, 200);
  assert.equal(shown.headers['content-type'], 'image/svg+xml');
  assert.equal(shown.headers['content-security-policy'], ICON_CSP);
  assert.equal((await request('/icons/with%20space.png')).status, 200);
  assert.equal((await request('/icons/not-selected.svg')).status, 404);
});

test('rejects path traversal and dotfiles', async () => {
  for (const p of [
    '/../secret.txt',
    '/%2e%2e/secret.txt',
    '/sub/..%2f..%2fsecret.txt',
    '/icons/..%2fsecret.txt',
    '/icons/../secret.txt',
    '/.env',
    '/sub/%2e%2e%2f.env',
  ]) {
    const res = await request(p);
    assert.ok([400, 404].includes(res.status), `${p} -> ${res.status}`);
    assert.doesNotMatch(res.body, /secret|SECRET/i, p);
  }
});

test('rejects malformed paths and backslashes', async () => {
  assert.equal((await request('/%E0%A4%A')).status, 400);
  assert.equal((await request('/%00')).status, 400);
  assert.equal((await request('/sub%5C..%5C..%5Csecret.txt')).status, 400);
});

test('returns 404 for missing files and directories', async () => {
  assert.equal((await request('/missing.css')).status, 404);
  assert.equal((await request('/sub/')).status, 404);
  assert.equal((await request('/sub')).status, 404);
});

test('only allows GET and HEAD', async () => {
  const res = await request('/', { method: 'POST' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.allow, 'GET, HEAD');
});

test('serves the versioned service worker from memory when provided', async () => {
  const publicDir = path.join(root, 'public');
  await writeFile(path.join(publicDir, 'sw.js'), 'on-disk');
  const workerServer = http.createServer(
    createHandler({
      html: '<p>page</p>',
      serviceWorker: "const CACHE_NAME = 'motion-landing-20261030084601';",
      publicDir,
      iconsDir: path.join(root, 'icons'),
      icons: [],
    }),
  );
  await new Promise((resolve) => workerServer.listen(0, '127.0.0.1', resolve));
  const savedPort = port;
  port = workerServer.address().port;
  try {
    const res = await request('/sw.js');
    assert.equal(res.status, 200);
    assert.equal(res.body, "const CACHE_NAME = 'motion-landing-20261030084601';");
    assert.match(res.headers['content-type'], /^text\/javascript/);
    assert.equal(res.headers['cache-control'], 'no-cache');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    const head = await request('/sw.js', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
  } finally {
    port = savedPort;
    await new Promise((resolve) => workerServer.close(resolve));
  }
  // Without a rendered worker, the file on disk is served as before.
  assert.equal((await request('/sw.js')).body, 'on-disk');
});
