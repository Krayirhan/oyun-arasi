import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeState, encodeState } from '../firestore-codec.js';

const hasNestedArray = value => Array.isArray(value)
  ? value.some(entry => Array.isArray(entry) || hasNestedArray(entry))
  : Boolean(value && typeof value === 'object' && Object.values(value).some(hasNestedArray));

test('2048 tahtası gibi iç içe diziler Firestore uyumlu hale gelir ve geri açılır', () => {
  const state = {
    board: [[2, 0, 0, 4], [0, 8, 0, 0], [0, 0, 0, 0], [16, 0, 0, 2]],
    score: 120, won: false,
    undo: { board: [[0, 0], [2, 2]], score: 100 }
  };
  const encoded = encodeState(state);
  assert.equal(hasNestedArray(encoded), false);
  assert.deepEqual(decodeState(encoded), state);
});

test('düz diziler, sayılar, null ve boş nesneler olduğu gibi kalır', () => {
  const state = { guesses: ['kalem', 'masa'], distribution: [0, 1, 2], best: null, meta: {}, list: [{ a: 1 }] };
  assert.deepEqual(encodeState(state), state);
  assert.deepEqual(decodeState(encodeState(state)), state);
});

test('bozuk kodlanmış değer null olur', () => {
  assert.equal(decodeState({ __json: '[[1,2' }), null);
});
