import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { escapeHtml, renderPage } from '../lib/render.js';

const template = await readFile(new URL('../templates/index.html', import.meta.url), 'utf8');

test('escapeHtml escapes markup characters', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('renderPage fills every placeholder', () => {
  const html = renderPage(template, { title: 'Hello', subtitle: 'World', icons: ['a.svg'] });
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
  assert.match(html, /<h1 class="hero-title" id="title">Hello<\/h1>/);
  assert.match(html, /<p class="hero-subtitle" id="subtitle">World<\/p>/);
  assert.match(html, /<img class="motion-icon" src="\/icons\/a\.svg" alt=""/);
});

test('renderPage escapes text and icon names', () => {
  const html = renderPage(template, {
    title: '<script>alert(1)</script>',
    subtitle: '" onload="x',
    icons: ['we"ird <name>.svg'],
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /" onload="x/);
  assert.match(html, /src="\/icons\/we%22ird%20%3Cname%3E\.svg"/);
});

test('renderPage does not re-expand placeholders or $ patterns in values', () => {
  const html = renderPage(template, { title: '{{ICONS}} $& $1', subtitle: '', icons: ['a.svg'] });
  assert.match(html, /<h1 class="hero-title" id="title">\{\{ICONS\}\} \$&amp; \$1<\/h1>/);
});

test('page has one image per icon and no inline scripts or styles', () => {
  const icons = Array.from({ length: 64 }, (_, i) => `${i}.png`);
  const html = renderPage(template, { title: 't', subtitle: 's', icons });
  assert.equal(html.match(/class="motion-icon"/g).length, 64);
  assert.doesNotMatch(html, /<script>(?!<\/script>)/);
  assert.doesNotMatch(html, /\sstyle=/);
});

test('highlight markers are kept for the editor but stripped from displayed text', () => {
  const html = renderPage(template, { title: 'Hello *World*', subtitle: '', icons: [] });
  assert.match(html, /<title>Hello World<\/title>/);
  assert.match(html, /<h1 class="hero-title" id="title">Hello World<\/h1>/);
  assert.match(html, /data-default-title="Hello \*World\*"/);
});
