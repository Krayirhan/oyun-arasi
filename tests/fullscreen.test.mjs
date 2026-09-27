// Ortak tam ekran sistemi (game-shell.js + play-page.css) için statik kontroller: oyun ayarları geçerli,
// her oyunda sığdırılacak öğe var, her oyunun tahtası tam ekranda çerçeve genişliğinden boyutlanıyor ve
// eski, oyuna özel tam ekran kodu geri gelmiyor.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const shell = read('game-shell.js');
const window = {};
vm.runInNewContext(read('catalog.js'), { window });
const catalogIds = new Set(window.OYUN_ARASI_GAMES.map(game => game.id));
const gameDirs = readdirSync(new URL('../games/', import.meta.url), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
const options = vm.runInNewContext(`(${shell.match(/const FULLSCREEN_OPTIONS = (\{[\s\S]*?\n\});/)[1]})`);

test('tam ekran ayarları yalnızca var olan oyunlar için ve geçerli değerlerle tanımlı', () => {
  for (const [id, config] of Object.entries(options)) {
    assert.ok(catalogIds.has(id), `${id} katalogda yok`);
    assert.ok(gameDirs.includes(id), `${id} klasörü yok`);
    for (const key of Object.keys(config)) assert.ok(['fit', 'key', 'orientation'].includes(key), `${id}: bilinmeyen ayar ${key}`);
    if ('orientation' in config) assert.ok(['landscape', 'portrait'].includes(config.orientation), `${id}: geçersiz yön`);
    if ('key' in config) assert.equal(typeof config.key, 'boolean');
  }
});

test('her oyunda sığdırılacak öğe var ve tahta tam ekranda genişlikten boyutlanıyor', () => {
  for (const id of gameDirs) {
    const html = read(`games/${id}/index.html`);
    const selector = options[id]?.fit || '.board-frame';
    const className = selector.replace(/^\./, '');
    assert.match(html, new RegExp(`class="[^"]*\\b${className}\\b`), `${id}: ${selector} bulunamadı`);
    assert.match(html, /class="[^"]*\b(play-panel|game-play)\b/, `${id}: oyun paneli yok`);
    const css = read(`games/${id}/styles.css`);
    const script = read(`games/${id}/script.js`);
    assert.ok(css.includes('is-fullscreen') || script.includes('is-fullscreen'), `${id}: tam ekran kuralı yok`);
  }
});

test('tam ekran tek yerden yönetiliyor; oyuna özel eski tam ekran kodu yok', () => {
  const css = read('play-page.css');
  assert.ok(css.includes('.play-panel.is-fullscreen'), 'ortak tam ekran stilleri eksik');
  assert.ok(!/:fullscreen\b/.test(css), 'play-page.css tarayıcının :fullscreen seçicisine bağlı olmamalı');
  for (const id of gameDirs) {
    for (const file of ['styles.css', 'script.js']) {
      const text = read(`games/${id}/${file}`);
      assert.ok(!text.includes('mobile-immersive') && !/:fullscreen\b/.test(text), `${id}/${file}: eski tam ekran kodu`);
      assert.ok(!/requestFullscreen\(/.test(text), `${id}/${file}: tam ekranı kendisi istememeli`);
    }
  }
  for (const needle of ["'game:fullscreenchange'", "'game:fullscreenfit'", 'history.pushState', "'popstate'", 'wakeLock', 'screen.orientation']) {
    assert.ok(shell.includes(needle), `game-shell.js: ${needle} eksik`);
  }
});
