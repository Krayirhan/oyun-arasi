import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_DEPTH, COLS, ROWS, CELL_COUNT, WIN_LINES, botMove, chooseBotMove, createGame, isValidGame, landingRow, legalColumns, newRound, playMove, winningLine } from './logic.js';

test('tahta 7×6 boyutunda başlar ve ilk taş sütunun altına düşer', () => {
  let game = createGame({ mode: 'local' });
  assert.equal(game.board.length, CELL_COUNT);
  assert.equal(COLS, 7); assert.equal(ROWS, 6);
  game = playMove(game, 2);
  assert.equal(game.board[5 * COLS + 2], 0);
  assert.equal(game.current, 1);
  assert.equal(game.moveCount, 1);
});

test('sütun seçimi ve sıra dışı hamleler reddedilir; sütun dolunca hamle kalmaz', () => {
  const game = createGame();
  assert.equal(landingRow(game.board, -1), -1);
  assert.equal(playMove(game, 7), null);
  assert.equal(playMove(game, 0, 1), null);
  const full = Array(CELL_COUNT).fill(0);
  assert.equal(landingRow(full, 0), -1);
  assert.equal(legalColumns(full).length, 0);
});

test('yatay, dikey ve iki çapraz dizilimde dört taşı bulur', () => {
  const lines = [
    Array.from({ length: 4 }, (_, c) => 5 * COLS + c),
    Array.from({ length: 4 }, (_, r) => r * COLS),
    Array.from({ length: 4 }, (_, i) => (5 - i) * COLS + i),
    Array.from({ length: 4 }, (_, i) => (2 + i) * COLS + i)
  ];
  assert.ok(WIN_LINES.length > 60);
  for (const line of lines) {
    const board = Array(CELL_COUNT).fill(null);
    line.forEach(index => { board[index] = 1; });
    assert.deepEqual([...winningLine(board, 1)].sort((a, b) => a - b), [...line].sort((a, b) => a - b));
  }
});

test('dördüncü yatay taş kazanır ve kazanan çizgi skorlanır', () => {
  let game = createGame({ mode: 'local' });
  for (const column of [0, 6, 1, 6, 2, 5]) game = playMove(game, column);
  game = playMove(game, 3);
  assert.equal(game.status, 'won');
  assert.equal(game.winner, 0);
  assert.deepEqual(game.winningLine, [35, 36, 37, 38]);
  assert.deepEqual(game.scores, [1, 0]);
  assert.equal(playMove(game, 4), null);
});

test('tahta dolunca beraberlik sayılır ve yeni tur başlayan taraf değişir', () => {
  const board = Array.from({ length: ROWS }, (_, row) => Array.from({ length: COLS }, (_, column) => (row + Math.floor(column / 2)) % 2)).flat();
  board[3] = null; // Row zero, column three is a player 1 cell; refill it as the final move.
  assert.equal(winningLine(board, 0).length + winningLine(board, 1).length, 0);
  let game = { ...createGame({ mode: 'local' }), board, current: 1, moveCount: CELL_COUNT - 1, scores: [1, 0] };
  assert.equal(isValidGame(game), true);
  game = playMove(game, 3);
  assert.equal(game.status, 'draw');
  assert.equal(game.draws, 1);
  const next = newRound(game);
  assert.equal(next.starter, 1);
  assert.deepEqual(next.scores, [1, 0]);
  assert.equal(next.draws, 1);
});

test('bot kesin kazanma hamlesini alır ve rakibin dörtlüsünü kapatır', () => {
  let game = createGame({ mode: 'bot', level: 'easy' });
  for (const column of [6, 0, 6, 1, 5, 2]) game = playMove(game, column);
  assert.equal(game.current, 0);
  // Bot fixture'ı: sırayı botta ve alt sırada üç bot taşı var.
  const winning = { ...game, current: 1, board: [...game.board] };
  winning.board[5 * COLS] = 1; winning.board[5 * COLS + 1] = 1; winning.board[5 * COLS + 2] = 1;
  assert.equal(chooseBotMove(winning), 3);
  const blocking = { ...game, current: 1, board: [...game.board] };
  blocking.board[5 * COLS] = 0; blocking.board[5 * COLS + 1] = 0; blocking.board[5 * COLS + 2] = 0;
  assert.equal(chooseBotMove(blocking), 3);
  assert.equal(botMove(winning).winner, 1);
});

test('bot seviyelerinin arama derinlikleri ve geçerli hamlesi tanımlıdır', () => {
  assert.deepEqual(BOT_DEPTH, { easy: 2, medium: 5, hard: 8 });
  for (const level of ['easy', 'medium', 'hard']) {
    const state = createGame({ level });
    const botTurn = playMove(state, 3);
    assert.equal(botTurn.current, 1);
    const next = botMove(botTurn);
    assert.ok(next);
    assert.equal(next.moveCount, 2);
    assert.equal(next.current, 0);
    assert.equal(isValidGame(next), true);
  }
});

test('kayıtlı tahta sütunda boşluk varsa veya sayım tutmuyorsa geçersizdir', () => {
  const game = createGame();
  const hole = { ...game, board: [...game.board], moveCount: 2 };
  hole.board[5 * COLS] = 0; hole.board[3 * COLS] = 1;
  assert.equal(isValidGame(hole), false);
  assert.equal(isValidGame({ ...game, moveCount: 1 }), false);
});
