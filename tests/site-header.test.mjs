// Sitenin tek başlığı: her sayfada <body>'nin ilk öğesi olan <header class="site-header"> aynı işaretlemeyi taşır.
// Sayfaya göre değişen tek şey bağlantıların kök yoludur (./, ../, ../../). Harfle kendi giriş/yardım/istatistik
// düğmelerini hesap alanında (.topbar-actions) tutar; bunun dışında o da aynıdır.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pages = ['index.html', 'rekorlarim/index.html', ...readdirSync(new URL('../games/', import.meta.url), { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => `games/${entry.name}/index.html`)];

const headerOf = html => html.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0];
const normalize = header => header
  .replace(/\b(href|action)="(?:\.\/|(?:\.\.\/)+)/g, '$1="{kök}')
  .replace(/<div class="topbar-actions">[\s\S]*?<\/div>/, '<div class="account-slot" data-account-root></div>')
  .replace(/\s+/g, ' ');

test('her sayfada tek ve aynı başlık var', () => {
  const reference = normalize(headerOf(read('index.html')));
  for (const page of pages) {
    const html = read(page);
    const header = headerOf(html);
    assert.ok(header, `${page}: başlık yok`);
    assert.equal(html.match(/<header\b/g).length, 1, `${page}: birden fazla <header>`);
    assert.match(html, /<body[^>]*>\s*<header class="site-header">/, `${page}: başlık <body>'nin ilk öğesi olmalı`);
    assert.equal(normalize(header), reference, `${page}: başlık açılış sayfasındakinden farklı`);
    assert.match(html, /<link rel="stylesheet" href="[^"]*site-header\.css\?v=/, `${page}: site-header.css yüklenmiyor`);
  }
});

test('başlık logoda oyun kolunu, aramayı, iki menü bağlantısını ve hesap alanını içeriyor', () => {
  const header = headerOf(read('index.html'));
  assert.match(header, /class="brand-icon"/);
  assert.match(header, /<form class="site-search"[^>]*>[\s\S]*id="game-search"/);
  assert.match(header, />Hemen oyna</);
  assert.match(header, />Arkadaşlarınla oyna</);
  assert.match(header, /data-account-root/);
});

test('eski başlık stilleri geri gelmiyor', () => {
  for (const file of ['styles.css', 'game-shell.css', 'play-page.css']) {
    const css = read(file);
    assert.ok(!/\.(?:site-search|nav-link|all-games|topbar)(?![\w-])/.test(css), `${file}: başlık stili site-header.css dışında tanımlanmış`);
  }
});
