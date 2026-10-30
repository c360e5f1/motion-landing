import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildVersion, renderServiceWorker, VERSION_PLACEHOLDER } from '../lib/version.js';

test('buildVersion formats UTC time as YYYYMMDDHHMMSS', () => {
  assert.equal(buildVersion(new Date('2026-10-30T08:46:01.789Z')), '20261030084601');
  assert.equal(buildVersion(new Date('2026-01-02T03:04:05Z')), '20260102030405');
  assert.match(buildVersion(), /^\d{14}$/);
});

test('renderServiceWorker replaces every placeholder', () => {
  const source = `a ${VERSION_PLACEHOLDER} b ${VERSION_PLACEHOLDER}`;
  assert.equal(renderServiceWorker(source, '20261030084601'), 'a 20261030084601 b 20261030084601');
});

test('the shipped service worker uses the placeholder for its cache name', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.ok(source.includes(`'motion-landing-${VERSION_PLACEHOLDER}'`));
  const rendered = renderServiceWorker(source, '20261030084601');
  assert.ok(rendered.includes("const CACHE_NAME = 'motion-landing-20261030084601';"));
  assert.ok(!rendered.includes(VERSION_PLACEHOLDER));
});
