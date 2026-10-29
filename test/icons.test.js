import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { listIcons, selectIcons, MAX_ICONS } from '../lib/icons.js';

test('selectIcons returns at most 64 distinct icons', () => {
  const names = Array.from({ length: 200 }, (_, i) => `icon-${i}.svg`);
  const selected = selectIcons(names);
  assert.equal(MAX_ICONS, 64);
  assert.equal(selected.length, 64);
  assert.equal(new Set(selected).size, 64);
  for (const name of selected) assert.ok(names.includes(name));
});

test('selectIcons returns every icon when fewer than the maximum exist', () => {
  const names = ['a.svg', 'b.png', 'c.svg'];
  const selected = selectIcons(names);
  assert.deepEqual([...selected].sort(), names);
});

test('selectIcons handles exactly 64 and zero icons', () => {
  const names = Array.from({ length: 64 }, (_, i) => `${i}.png`);
  assert.equal(selectIcons(names).length, 64);
  assert.deepEqual(selectIcons([]), []);
});

test('selectIcons does not mutate its input', () => {
  const names = ['a.svg', 'b.svg', 'c.svg'];
  selectIcons(names, 2);
  assert.deepEqual(names, ['a.svg', 'b.svg', 'c.svg']);
});

test('selectIcons picks varied subsets', () => {
  const names = Array.from({ length: 100 }, (_, i) => `${i}.svg`);
  const seen = new Set();
  for (let i = 0; i < 20; i++) seen.add(selectIcons(names).sort().join(','));
  assert.ok(seen.size > 1);
});

test('listIcons keeps only regular .svg/.png files', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ml-icons-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'one.svg'), '<svg/>');
  await writeFile(path.join(dir, 'TWO.PNG'), 'png');
  await writeFile(path.join(dir, 'notes.txt'), 'x');
  await writeFile(path.join(dir, '.hidden.svg'), '<svg/>');
  await mkdir(path.join(dir, 'folder.svg'));
  try {
    await symlink(path.join(dir, 'one.svg'), path.join(dir, 'link.svg'));
  } catch {
    /* symlinks may be unavailable on this filesystem */
  }
  assert.deepEqual(await listIcons(dir), ['TWO.PNG', 'one.svg']);
});

test('listIcons returns an empty list for a missing directory', async () => {
  assert.deepEqual(await listIcons(path.join(os.tmpdir(), 'ml-does-not-exist-' + Date.now())), []);
});
