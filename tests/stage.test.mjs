// Tek oyun sahnesi şablonu (game-stage.js): her oyun başlangıç, mola, sonuç ve menü ekranlarını ortak modülle,
// tahtanın üstünde açılan katman olarak gösterir. Oyuna özel kaplama (.game-overlay/.overlay-card) kalmamalı;
// böylece hiçbir ekran geçişinde oyun çerçevesi büyüyüp küçülmez. Tarayıcıdaki ölçüm için: tools/stage-audit.html.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const games = readdirSync(new URL('../games/', import.meta.url), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);

// Şablona henüz taşınmamış oyunlar (taşındıkça listeden çıkar; hedef: boş liste).
const PENDING = new Set(['2048', 'araba', 'balon-patlat', 'mahjong', 'platform-macera', 'sekil', 'soliter', 'tetris', 'hafiza', 'kelime-avi', 'mayin-tarlasi', 'sudoku', 'xox', 'kelime-merdiveni', 'harfane']);

test('her oyun ortak sahne modülünü kullanıyor', () => {
  for (const id of games.filter(id => !PENDING.has(id))) {
    const script = read(`games/${id}/script.js`);
    const usesModule = /from ['"]\.\.\/\.\.\/game-(?:stage|flow)\.js/.test(script);
    const usesGlobal = /window\.OyunStage|OyunStage\./.test(script) && /game-stage\.js/.test(read(`games/${id}/index.html`));
    assert.ok(usesModule || usesGlobal, `${id}: game-stage.js kullanılmıyor`);
  }
});

test('oyunlarda oyuna özel kaplama kartı kalmadı', () => {
  for (const id of games.filter(id => !PENDING.has(id))) {
    const html = read(`games/${id}/index.html`);
    const css = read(`games/${id}/styles.css`);
    assert.ok(!/class="[^"]*\b(?:game-overlay|overlay-card)\b/.test(html), `${id}: index.html'de eski kaplama var`);
    assert.ok(!/\.(?:game-overlay|overlay-card|overlay-kicker|overlay-actions)\b/.test(css), `${id}: styles.css'te eski kaplama kuralı var`);
    assert.match(html, /class="[^"]*\bboard-frame\b/, `${id}: .board-frame yok`);
  }
});

test('ortak sahne kuralları tek yerde', () => {
  const css = read('play-page.css');
  assert.ok(css.includes("[data-stage-mode='flow']") && css.includes("[data-flow='overlay']"), 'play-page.css sahne kuralları eksik');
  assert.ok(/position: absolute !important; inset: 0/.test(css), 'katmanlar mutlak konumlu olmalı (çerçeveyi uzatmamalı)');
  const stage = read('game-stage.js');
  for (const name of ['createStage', 'createFlow', 'showDemo']) assert.ok(stage.includes(name), `game-stage.js: ${name} eksik`);
  if (!PENDING.size) assert.ok(!/\.game-overlay\b/.test(css), 'play-page.css: eski .game-overlay kuralı kaldırılmalı');
});
