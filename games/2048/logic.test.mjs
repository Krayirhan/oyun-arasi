import assert from 'node:assert/strict';
import test from 'node:test';
import { SIZE, canMove, equalBoards, isBoard, shiftBoard, slideLine } from './logic.js';

const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const sum = board => board.flat().reduce((total, value) => total + value, 0);

test('satır kayar: sıfırlar atılır, eşit ikililer soldan birleşir, her taş en çok bir kez birleşir', () => {
  assert.deepEqual(slideLine([2, 0, 2, 0]).line, [4, 0, 0, 0]);
  assert.deepEqual(slideLine([2, 2, 2, 2]).line, [4, 4, 0, 0]);
  assert.deepEqual(slideLine([2, 2, 2, 0]).line, [4, 2, 0, 0]);
  assert.deepEqual(slideLine([4, 2, 2, 0]).line, [4, 4, 0, 0]);
  assert.deepEqual(slideLine([2, 2, 4, 4]).line, [4, 8, 0, 0]);
  assert.deepEqual(slideLine([2, 4, 2, 4]).line, [2, 4, 2, 4]);
  assert.equal(slideLine([2, 2, 4, 4]).gained, 12);
  assert.equal(slideLine([8, 8, 0, 0]).gained, 16);
});

test('dört yönde kaydırma: doğru yöne yığılır ve girdiyi değiştirmez', () => {
  const board = [[2, 0, 0, 2], [0, 4, 0, 0], [0, 0, 2, 0], [2, 0, 0, 2]];
  const copy = board.map(row => [...row]);
  assert.deepEqual(shiftBoard(board, 'left').board, [[4, 0, 0, 0], [4, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0]]);
  assert.deepEqual(shiftBoard(board, 'right').board, [[0, 0, 0, 4], [0, 0, 0, 4], [0, 0, 0, 2], [0, 0, 0, 4]]);
  assert.deepEqual(shiftBoard(board, 'up').board, [[4, 4, 2, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.deepEqual(shiftBoard(board, 'down').board, [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [4, 4, 2, 4]]);
  assert.deepEqual(board, copy);
});

test('kaydırma toplamı korur, puan çift ve negatif değildir, hamle var/yok tutarlıdır', () => {
  const random = seeded(7);
  const values = [0, 0, 0, 2, 2, 4, 4, 8, 16, 32];
  for (let n = 0; n < 500; n += 1) {
    const board = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => values[Math.floor(random() * values.length)]));
    for (const direction of ['left', 'right', 'up', 'down']) {
      const shifted = shiftBoard(board, direction);
      assert.equal(sum(shifted.board), sum(board), `${direction}: taş toplamı korunur`);
      assert.ok(shifted.gained >= 0 && shifted.gained % 2 === 0);
      assert.equal(isBoard(shifted.board), true);
      // hamle yoksa hiçbir yön tahtayı değiştirmez; hamle varsa en az bir yön değiştirir
      const changes = ['left', 'right', 'up', 'down'].some(dir => !equalBoards(shiftBoard(board, dir).board, board));
      assert.equal(canMove(board), changes);
    }
  }
});

test('sol ve sağ kaydırma birbirinin aynadır, yukarı ve aşağı da', () => {
  const random = seeded(11);
  const flip = board => board.map(row => [...row].reverse());
  const values = [0, 2, 2, 4, 4, 8];
  for (let n = 0; n < 200; n += 1) {
    const board = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => values[Math.floor(random() * values.length)]));
    assert.deepEqual(shiftBoard(board, 'right').board, flip(shiftBoard(flip(board), 'left').board));
    assert.equal(shiftBoard(board, 'right').gained, shiftBoard(flip(board), 'left').gained);
    const transposed = board.map((row, r) => row.map((_, c) => board[c][r]));
    assert.deepEqual(shiftBoard(board, 'up').board, shiftBoard(transposed, 'left').board.map((row, r) => row.map((_, c) => shiftBoard(transposed, 'left').board[c][r])));
  }
});

test('tıkanmış tahta: dolu ve komşuları eşit değilse hamle yoktur; bir eşit komşu ya da boş hücre hamle sağlar', () => {
  const stuck = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];
  assert.equal(canMove(stuck), false);
  assert.equal(canMove([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 4]]), true);
  assert.equal(canMove([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0]]), true);
  assert.equal(isBoard(stuck), true);
  assert.equal(isBoard([[3, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), false, '3 iki kuvveti değil');
  assert.equal(isBoard([[2, 0, 0], [0, 0, 0], [0, 0, 0]]), false);
});
