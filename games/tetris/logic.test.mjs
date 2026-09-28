import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, TYPES, SHAPES, LOCK_DELAY_MS, createGame, startGame, pauseGame, move, rotate, softDrop, hardDrop, holdPiece, tick, ghostPiece, pieceCells, fits, gravityMs, levelForLines, isValidGame } from './logic.js';

const playing = (seed = 42) => startGame(createGame(seed));

// Puts a chosen piece in play at a known spot.
function withPiece(game, type, x = 3, y = 5, rot = 0) {
  return { ...game, piece: { type, rot, x, y }, lowestY: y };
}

function fillRows(board, rows, gapX = -1) {
  const next = [...board];
  for (const y of rows) for (let x = 0; x < COLS; x++) if (x !== gapX) next[y * COLS + x] = 'Z';
  return next;
}

test('every piece has four cells in every rotation', () => {
  for (const type of TYPES) for (const cells of SHAPES[type]) assert.equal(cells.length, 4);
});

test('the 7-bag deals each piece once per group of seven', () => {
  let game = playing(7);
  const dealt = [game.piece.type];
  // Empty the board each time so the stack never reaches the top.
  while (dealt.length < 14) { game = hardDrop({ ...game, board: Array(COLS * ROWS).fill('') }); dealt.push(game.piece.type); }
  assert.deepEqual([...dealt.slice(0, 7)].sort(), [...TYPES].sort());
  assert.deepEqual([...dealt.slice(7, 14)].sort(), [...TYPES].sort());
});

test('the same seed deals the same pieces', () => {
  assert.deepEqual(createGame(99).queue, createGame(99).queue);
});

test('a new game waits for start and ignores moves until then', () => {
  const game = createGame(1);
  assert.equal(game.status, 'ready');
  assert.equal(move(game, -1), game);
  assert.equal(startGame(game).status, 'playing');
});

test('pieces move sideways but not through walls', () => {
  let game = withPiece(playing(), 'O', 3, 5);
  for (let i = 0; i < 20; i++) game = move(game, -1);
  assert.equal(Math.min(...pieceCells(game.piece).map(cell => cell.x)), 0);
  for (let i = 0; i < 20; i++) game = move(game, 1);
  assert.equal(Math.max(...pieceCells(game.piece).map(cell => cell.x)), COLS - 1);
});

test('rotation cycles through four states and kicks off the wall', () => {
  let game = withPiece(playing(), 'T', 3, 5);
  for (let i = 0; i < 4; i++) game = rotate(game, 1);
  assert.equal(game.piece.rot, 0);
  // A vertical I against the left wall has to kick right to turn flat.
  game = withPiece(playing(), 'I', -2, 5, 1);
  assert.ok(fits(game.board, game.piece));
  const turned = rotate(game, 1);
  assert.equal(turned.piece.rot, 2);
  assert.ok(fits(turned.board, turned.piece));
});

test('O pieces do not rotate', () => {
  const game = withPiece(playing(), 'O');
  assert.equal(rotate(game, 1), game);
});

test('hard drop lands on the floor, scores 2 per row and brings the next piece', () => {
  const game = withPiece(playing(), 'O', 3, 5);
  const nextType = game.queue[0];
  const dropped = hardDrop(game);
  assert.equal(dropped.board[(ROWS - 1) * COLS + 4], 'O');
  assert.equal(dropped.board[(ROWS - 2) * COLS + 5], 'O');
  assert.equal(dropped.score, (ROWS - 2 - 5) * 2);
  assert.equal(dropped.piece.type, nextType);
  assert.equal(dropped.pieces, 1);
});

test('the ghost shows where the piece will land', () => {
  const game = withPiece(playing(), 'I', 3, 5);
  assert.equal(ghostPiece(game).y, ROWS - 2);
});

test('soft drop moves one row for one point', () => {
  const game = withPiece(playing(), 'T', 3, 5);
  const dropped = softDrop(game);
  assert.equal(dropped.piece.y, 6);
  assert.equal(dropped.score, 1);
});

test('clearing lines scores by count and level', () => {
  let game = playing();
  // Four full rows except column 9; a vertical I fills the gap for a Tetris.
  game = { ...game, board: fillRows(game.board, [18, 19, 20, 21], 9) };
  game = withPiece(game, 'I', 7, 5, 1);
  const cleared = hardDrop(game);
  assert.equal(cleared.lines, 4);
  assert.equal(cleared.tetrises, 1);
  assert.equal(cleared.score, 800 + (18 - 5) * 2);
  assert.deepEqual(cleared.lastClear.rows, [18, 19, 20, 21]);
  assert.ok(cleared.board.every(cell => cell === ''));
  // A single at level 3 is worth 300.
  let single = { ...playing(), level: 3, startLevel: 3, lines: 0 };
  single = { ...single, board: fillRows(single.board, [21], 0) };
  single = withPiece(single, 'I', -2, 5, 1);
  const result = hardDrop(single);
  assert.equal(result.lines, 1);
  assert.equal(result.score, 300 + (18 - 5) * 2);
});

test('rows above a cleared line fall down', () => {
  let game = playing();
  const board = fillRows(game.board, [21], 0);
  board[20 * COLS + 5] = 'S';
  game = withPiece({ ...game, board }, 'I', -2, 5, 1);
  const cleared = hardDrop(game);
  assert.equal(cleared.board[21 * COLS + 5], 'S');
});

test('levels go up every 10 lines and gravity gets faster', () => {
  assert.equal(levelForLines(0), 1);
  assert.equal(levelForLines(9), 1);
  assert.equal(levelForLines(10), 2);
  assert.equal(levelForLines(250), 20);
  assert.ok(gravityMs(1) > gravityMs(5) && gravityMs(5) > gravityMs(15));
  assert.equal(Math.round(gravityMs(1)), 1000);
});

test('gravity pulls the piece down and it locks after the lock delay', () => {
  let game = withPiece(playing(), 'O', 3, 5);
  game = tick(game, gravityMs(1));
  assert.equal(game.piece.y, 6);
  let landed = withPiece(game, 'O', 3, ROWS - 2);
  landed = tick(landed, LOCK_DELAY_MS - 10);
  assert.equal(landed.pieces, 0, 'still waiting');
  landed = tick(landed, 20);
  assert.equal(landed.pieces, 1, 'locked');
  assert.equal(landed.board[(ROWS - 1) * COLS + 4], 'O');
});

test('moving a resting piece restarts the lock timer', () => {
  let game = withPiece(playing(), 'O', 3, ROWS - 2);
  game = tick(game, LOCK_DELAY_MS - 50);
  game = move(game, 1);
  game = tick(game, LOCK_DELAY_MS - 50);
  assert.equal(game.pieces, 0);
});

test('soft-drop ticks fall fast and earn points', () => {
  const game = tick(withPiece(playing(), 'T', 3, 2), 200, { soft: true });
  assert.equal(game.piece.y, 7);
  assert.equal(game.score, 5);
});

test('hold swaps once per piece', () => {
  let game = withPiece(playing(), 'T');
  const nextType = game.queue[0];
  game = holdPiece(game);
  assert.equal(game.hold, 'T');
  assert.equal(game.piece.type, nextType);
  assert.equal(holdPiece(game), game, 'second hold is ignored');
  game = hardDrop(game);
  game = holdPiece(game);
  assert.equal(game.piece.type, 'T', 'held piece comes back');
});

test('the game ends when a new piece cannot appear', () => {
  let game = playing();
  const board = [...game.board];
  for (let y = 1; y < 4; y++) for (let x = 3; x < 7; x++) board[y * COLS + x] = 'Z';
  game = withPiece({ ...game, board }, 'I', 0, 15);
  const over = hardDrop(game);
  assert.equal(over.status, 'over');
  assert.equal(move(over, 1), over);
});

test('pause stops time and saves stay valid', () => {
  const game = playing(5);
  const paused = pauseGame(game);
  assert.equal(paused.status, 'paused');
  assert.equal(tick(paused, 5000), paused);
  const restored = JSON.parse(JSON.stringify(paused));
  assert.ok(isValidGame(restored));
  assert.ok(!isValidGame({ ...restored, board: [] }));
  assert.ok(!isValidGame({ ...restored, piece: { ...restored.piece, x: -5 } }));
  assert.ok(!isValidGame(null));
});

test('yerleştirme botuyla 12 oyunda: hücre sayısı 4×parça − 10×satır, seviye satırdan türer, durum geçerli kalır, satırlar silinir', () => {
  const plan = game => {
    let best = null;
    for (let rot = 0; rot < 4; rot += 1) for (let x = -3; x < COLS; x += 1) {
      const piece = { ...game.piece, rot, x };
      if (!fits(game.board, piece)) continue;
      const landed = { ...piece };
      while (fits(game.board, { ...landed, y: landed.y + 1 })) landed.y += 1;
      const board = [...game.board];
      pieceCells(landed).forEach(({ x: cx, y: cy }) => { board[cy * COLS + cx] = 'X'; });
      let holes = 0;
      for (let col = 0; col < COLS; col += 1) { let seen = false; for (let row = 0; row < ROWS; row += 1) { if (board[row * COLS + col]) seen = true; else if (seen) holes += 1; } }
      const full = [...Array(ROWS).keys()].filter(row => board.slice(row * COLS, row * COLS + COLS).every(Boolean)).length;
      const value = full * 50 - holes * 8 + landed.y;
      if (!best || value > best.value) best = { value, rot, x };
    }
    return best;
  };
  let lines = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    let game = startGame(createGame(seed * 7919));
    for (let n = 0; n < 200 && game.status === 'playing'; n += 1) {
      const target = plan(game);
      if (!target) break;
      for (let i = 0; i < target.rot; i += 1) game = rotate(game, 1);
      for (let guard = 0; guard < 12 && game.piece.x !== target.x; guard += 1) game = move(game, target.x > game.piece.x ? 1 : -1);
      if (n % 9 === 4) game = holdPiece(game);
      const before = game.pieces;
      game = hardDrop(game);
      assert.equal(game.pieces, before + 1, `seed ${seed}: sert düşürme parçayı kilitler`);
      assert.equal(game.board.filter(Boolean).length, 4 * game.pieces - 10 * game.lines, `seed ${seed}: hücre sayısı`);
      assert.equal(game.level, Math.min(game.startLevel + Math.floor(game.lines / 10), 20));
      if (game.status === 'playing') assert.equal(isValidGame(game), true, `seed ${seed}: durum geçerli`);
    }
    lines += game.lines;
  }
  assert.ok(lines >= 50, `bot satır siler (${lines})`);
});
