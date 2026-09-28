import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, SHAPES, shapeSize, canPlace, fitsAnywhere, createGame, linesToClear, lineBonus, placePiece, isValidGame } from './logic.js';

function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}
const piece = (shape, color = 1) => ({ shape, color });
const SINGLE = 0, H2 = 1, H5 = 7, V5 = 8, SQUARE3 = 10;

test('shapes start at the top-left corner and have no duplicate cells', () => {
  for (const cells of SHAPES) {
    assert.equal(Math.min(...cells.map(([r]) => r)), 0);
    assert.equal(Math.min(...cells.map(([, c]) => c)), 0);
    assert.equal(new Set(cells.map(cell => cell.join())).size, cells.length);
  }
  assert.deepEqual(shapeSize(SQUARE3), { rows: 3, cols: 3 });
});

test('placement stays on the board and off filled cells', () => {
  const board = Array(SIZE * SIZE).fill(0);
  assert.ok(canPlace(board, piece(H5), 0, 3));
  assert.ok(!canPlace(board, piece(H5), 0, 4), 'would leave the board');
  assert.ok(!canPlace(board, piece(V5), -1, 0));
  board[0] = 2;
  assert.ok(!canPlace(board, piece(SINGLE), 0, 0));
});

test('a new game has an empty board and a tray of three pieces', () => {
  const game = createGame(seeded(1), 50);
  assert.ok(game.board.every(cell => cell === 0));
  assert.equal(game.tray.length, 3);
  assert.equal(game.best, 50);
  assert.ok(isValidGame(game));
});

test('placing scores one point per cell and empties the tray slot', () => {
  let game = createGame(seeded(2));
  game = { ...game, tray: [piece(SQUARE3), piece(SINGLE), piece(H2)] };
  const result = placePiece(game, 0, 0, 0, seeded(3));
  assert.equal(result.gained, 9);
  assert.equal(result.game.tray[0], null);
  assert.equal(result.game.board.filter(Boolean).length, 9);
  assert.equal(placePiece(result.game, 0, 4, 4), null, 'an empty slot cannot be placed');
  assert.equal(placePiece(result.game, 1, 0, 0), null, 'filled cells block placement');
});

test('full rows and columns clear together and score a line bonus', () => {
  const board = Array(SIZE * SIZE).fill(0);
  for (let c = 1; c < SIZE; c += 1) board[c] = 3;           // row 0 missing column 0
  for (let r = 1; r < SIZE; r += 1) board[r * SIZE] = 4;     // column 0 missing row 0
  const preview = linesToClear(board, piece(SINGLE), 0, 0);
  assert.deepEqual(preview.rows, [0]);
  assert.deepEqual(preview.cols, [0]);
  let game = { ...createGame(seeded(4)), board, tray: [piece(SINGLE), piece(SINGLE), piece(SINGLE)] };
  const result = placePiece(game, 0, 0, 0, seeded(5));
  assert.ok(result.game.board.every(cell => cell === 0), 'row and column are gone');
  assert.equal(result.gained, 1 + lineBonus(2));
  assert.equal(result.game.lines, 2);
  assert.equal(result.game.streak, 1);
});

test('back-to-back clears add a streak bonus', () => {
  const board = Array(SIZE * SIZE).fill(0);
  for (let c = 1; c < SIZE; c += 1) { board[c] = 1; board[SIZE + c] = 1; }
  let game = { ...createGame(seeded(6)), board, tray: [piece(SINGLE), piece(SINGLE), piece(SINGLE)] };
  const first = placePiece(game, 0, 0, 0, seeded(7));
  const second = placePiece(first.game, 1, 1, 0, seeded(8));
  assert.equal(first.gained, 1 + lineBonus(1));
  assert.equal(second.gained, 1 + lineBonus(1) + 10);
  assert.equal(second.game.streak, 2);
});

test('the tray refills after the third piece', () => {
  let game = { ...createGame(seeded(9)), tray: [piece(SINGLE), piece(SINGLE), piece(SINGLE)] };
  game = placePiece(game, 0, 0, 0).game;
  game = placePiece(game, 1, 0, 2).game;
  game = placePiece(game, 2, 0, 4, seeded(10)).game;
  assert.ok(game.tray.every(Boolean));
});

test('the game ends when no tray piece fits and best score is kept', () => {
  const board = Array(SIZE * SIZE).fill(0).map((_, index) => ((Math.floor(index / SIZE) + index) % 2 ? 1 : 0));
  assert.ok(!fitsAnywhere(board, piece(H2)));
  let game = { ...createGame(seeded(11), 3), board, tray: [piece(SINGLE), piece(H2), piece(H5)] };
  const result = placePiece(game, 0, 0, 0);
  const emptyLeft = result.game.board.some(cell => !cell);
  assert.ok(emptyLeft);
  assert.equal(result.game.status, 'over', 'only two-cell and five-cell pieces are left and neither fits');
  assert.equal(result.game.best, Math.max(3, result.game.score));
  assert.equal(placePiece(result.game, 1, 0, 1), null, 'no moves after the game ends');
});

test('isValidGame rejects broken saves', () => {
  const game = createGame(seeded(12));
  assert.ok(isValidGame(JSON.parse(JSON.stringify(game))));
  assert.ok(!isValidGame({ ...game, board: game.board.slice(1) }));
  assert.ok(!isValidGame({ ...game, tray: [null, null, null] }));
  assert.ok(!isValidGame({ ...game, tray: [{ shape: 999, color: 1 }, null, null] }));
  assert.ok(!isValidGame({ ...game, score: 10, best: 5 }));
  assert.ok(!isValidGame(null));
});

test('rastgele oynanan 40 oyunda puan yerleştirme kazancının toplamıdır, oyun yalnız hiçbir parça sığmayınca biter', () => {
  const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let finished = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const random = seeded(seed * 89);
    let game = createGame(random);
    let expected = 0;
    for (let step = 0; step < 400 && game.status === 'playing'; step += 1) {
      const moves = [];
      game.tray.forEach((piece, index) => {
        if (!piece) return;
        for (let row = 0; row < SIZE; row += 1) for (let col = 0; col < SIZE; col += 1) if (canPlace(game.board, piece, row, col)) moves.push([index, row, col]);
      });
      assert.ok(moves.length > 0, `seed ${seed}: oyun sürüyorsa en az bir hamle vardır`);
      const [index, row, col] = moves[Math.floor(random() * moves.length)];
      const result = placePiece(game, index, row, col, random);
      assert.ok(result, `seed ${seed}: geçerli hamle kabul edilir`);
      expected += result.gained;
      game = result.game;
      assert.equal(game.score, expected, `seed ${seed}: puan = kazançların toplamı`);
      assert.equal(isValidGame(game), true, `seed ${seed}: durum geçerli`);
      assert.equal(game.board.filter(Boolean).length <= SIZE * SIZE, true);
      const anyFits = game.tray.some(piece => piece && fitsAnywhere(game.board, piece));
      assert.equal(game.status === 'over', !anyFits, `seed ${seed}: bitiş yalnız hiçbir parça sığmayınca`);
    }
    if (game.status === 'over') finished += 1;
  }
  assert.ok(finished >= 30, `rastgele oyunların çoğu biter (${finished}/40)`);
});
