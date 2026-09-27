// Oyunlarda tarayıcının kendi pencereleri (confirm/alert/prompt) kullanılmaz; onaylar oyun içi kartla
// (game-dialog.js → confirmDialog) sorulur.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const scripts = [
  ...readdirSync(new URL('../', import.meta.url)).filter(name => name.endsWith('.js')),
  ...readdirSync(new URL('../games/', import.meta.url), { withFileTypes: true }).filter(entry => entry.isDirectory())
    .flatMap(entry => readdirSync(new URL(`../games/${entry.name}/`, import.meta.url)).filter(name => name.endsWith('.js')).map(name => `games/${entry.name}/${name}`)),
  'rekorlarim/records.js'
];

test('tarayıcının confirm/alert/prompt pencereleri kullanılmıyor', () => {
  for (const file of scripts) {
    assert.ok(!/\b(?:window\.)?(?:confirm|alert|prompt)\s*\(/.test(read(file).replace(/confirmDialog\s*\(/g, '')), `${file}: tarayıcı penceresi yerine confirmDialog kullan`);
  }
});

test('onay isteyen oyunlar ortak kartı içe aktarıyor', () => {
  for (const file of scripts.filter(name => name.startsWith('games/') && name.endsWith('/script.js'))) {
    const source = read(file);
    if (source.includes('confirmDialog(')) assert.match(source, /import \{ confirmDialog \} from '\.\.\/\.\.\/game-dialog\.js\?v=/, `${file}: game-dialog.js içe aktarılmamış`);
  }
});
