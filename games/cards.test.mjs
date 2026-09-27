import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, shuffleDeck, suitOf, rankOf, isRed, cardName } from './cards.js';

const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

test('shared deck has 52 stable ids and four complete suits', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.deepEqual([...new Set(deck.map(suitOf))], [0, 1, 2, 3]);
  assert.deepEqual(deck.filter(card => rankOf(card) === 1).map(cardName), ['A♠', 'A♥', 'A♦', 'A♣']);
  assert.equal(new Set(deck).size, 52);
});

test('shared deck shuffle is seeded, complete and uses standard card colors', () => {
  const first = shuffleDeck(seeded(82));
  assert.deepEqual(shuffleDeck(seeded(82)), first);
  assert.notDeepEqual(shuffleDeck(seeded(83)), first);
  assert.deepEqual([...first].sort((a, b) => a - b), createDeck());
  assert.equal(isRed(13), true);
  assert.equal(isRed(26), true);
  assert.equal(isRed(39), false);
});
