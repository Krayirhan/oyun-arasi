// library.js tarayıcı betiği; sahte window ve localStorage ile vm içinde çalıştırılır.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../library.js', import.meta.url), 'utf8');
let window;
let events;

beforeEach(() => {
  const store = new Map();
  events = [];
  window = {
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value))
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    dispatchEvent: event => events.push(event)
  };
  vm.runInNewContext(source, { window });
});

const lib = () => window.OyunArasiLibrary;

test('favori ekleme ve çıkarma', () => {
  assert.equal(lib().toggleFavorite('sudoku'), true);
  assert.equal(lib().toggleFavorite('2048'), true);
  assert.deepEqual([...lib().favorites()], ['2048', 'sudoku']);
  assert.equal(lib().toggleFavorite('sudoku'), false);
  assert.deepEqual([...lib().favorites()], ['2048']);
  assert.equal(events.at(-1).detail.source, 'local');
});

test('geçersiz kimlik yok sayılır', () => {
  assert.equal(lib().toggleFavorite('<script>'), false);
  lib().recordPlay('');
  assert.deepEqual([...lib().favorites()], []);
  assert.deepEqual([...lib().recent()], []);
});

test('son oynananlar en yeni önce, tekrar etmez, en fazla 12', () => {
  for (let index = 0; index < 15; index += 1) lib().recordPlay(`oyun-${index}`);
  lib().recordPlay('oyun-3');
  const ids = lib().recent().map(entry => entry.id);
  assert.equal(ids.length, 12);
  assert.equal(ids[0], 'oyun-3');
  assert.equal(new Set(ids).size, 12);
});

test('birleştirme: favorilerde daha yeni taraf kazanır, silme taşınır', () => {
  const local = { favorites: ['xox', 'sudoku'], favoritesUpdatedAt: 100, recent: [] };
  const remote = { favorites: ['xox'], favoritesUpdatedAt: 200, recent: [] };
  assert.deepEqual([...lib().merge(local, remote).favorites], ['xox']);
  assert.deepEqual([...lib().merge(remote, { ...local, favoritesUpdatedAt: 300 }).favorites], ['xox', 'sudoku']);
});

test('birleştirme: son oynananlar oyun başına en yeni zamanla birleşir', () => {
  const merged = lib().merge(
    { recent: [{ id: 'xox', at: 10 }, { id: 'sudoku', at: 50 }] },
    { recent: [{ id: 'xox', at: 90 }, { id: 'mahjong', at: 20 }] }
  );
  assert.deepEqual([...merged.recent.map(entry => `${entry.id}:${entry.at}`)], ['xox:90', 'sudoku:50', 'mahjong:20']);
});

test('buluttan gelen veri "cloud" kaynağıyla yazılır', () => {
  lib().replace({ favorites: ['tetris'], favoritesUpdatedAt: 5, recent: [] });
  assert.deepEqual([...lib().favorites()], ['tetris']);
  assert.equal(events.at(-1).detail.source, 'cloud');
});
