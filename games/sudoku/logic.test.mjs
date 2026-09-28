import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, PEERS, generatePuzzle, countSolutions, solve, createGame, placeValue, clearCell, toggleNote, hasNote, undo, giveHint, conflicts, isSolved, elapsedMilliseconds, pauseGame, resumeGame, isValidGame } from './logic.js';

// Deterministic random numbers so every run builds the same puzzles.
function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

function validSolution(grid) {
  return grid.every((value, index) => value >= 1 && value <= 9 && PEERS[index].every(peer => grid[peer] !== value));
}

test('every cell has 20 peers', () => {
  assert.ok(PEERS.every(peers => peers.length === 20));
});

test('generated puzzles have one solution and the level\'s number of givens', () => {
  for (const [level, { givens }] of Object.entries(LEVELS)) {
    const { puzzle, solution } = generatePuzzle(level, seeded(level.length * 97));
    assert.ok(validSolution(solution), `${level} solution is a valid grid`);
    assert.equal(puzzle.filter(Boolean).length, givens, `${level} keeps ${givens} givens`);
    assert.ok(puzzle.every((value, index) => !value || value === solution[index]));
    assert.equal(countSolutions(puzzle, 2), 1, `${level} puzzle has a unique solution`);
    assert.deepEqual(solve(puzzle), solution);
  }
});

test('placing values, clearing, and counting mistakes', () => {
  let game = createGame('easy', seeded(7), 0);
  const empty = game.board.indexOf(0);
  const given = game.puzzle.findIndex(Boolean);
  assert.equal(placeValue(game, given, 1, 0), null, 'givens cannot change');
  const wrong = game.solution[empty] === 9 ? 8 : 9;
  game = placeValue(game, empty, wrong, 0);
  assert.equal(game.board[empty], wrong);
  assert.equal(game.mistakes, 1);
  game = placeValue(game, empty, wrong, 0);
  assert.equal(game.board[empty], 0, 'the same value again clears the cell');
  game = placeValue(game, empty, game.solution[empty], 0);
  assert.equal(game.mistakes, 1, 'a right value is not a mistake');
  game = clearCell(game, empty);
  assert.equal(game.board[empty], 0);
});

test('notes toggle and a placed value removes the same note from peers', () => {
  let game = createGame('medium', seeded(11), 0);
  const empty = game.board.indexOf(0);
  const peer = PEERS[empty].find(index => !game.board[index]);
  const value = game.solution[empty];
  game = toggleNote(game, peer, value);
  assert.ok(hasNote(game, peer, value));
  game = toggleNote(game, empty, 3);
  assert.ok(hasNote(game, empty, 3));
  game = placeValue(game, empty, value, 0);
  assert.equal(game.notes[empty], 0, 'the cell\'s own notes clear');
  assert.ok(!hasNote(game, peer, value), 'peer note for the same value clears');
  game = undo(game);
  assert.equal(game.board[empty], 0);
  assert.ok(hasNote(game, peer, value), 'undo restores the peer note');
  assert.ok(hasNote(game, empty, 3), 'undo restores the cell note');
});

test('hints fill the selected cell, or the first empty one, and count', () => {
  let game = createGame('hard', seeded(5), 0);
  const empty = game.board.indexOf(0);
  let result = giveHint(game, empty, 0);
  assert.equal(result.index, empty);
  assert.equal(result.game.board[empty], game.solution[empty]);
  assert.equal(result.game.hints, 1);
  result = giveHint(result.game, game.puzzle.findIndex(Boolean), 0);
  assert.equal(result.game.board[result.index], game.solution[result.index], 'falls back to another cell for a given');
});

test('conflicts mark repeated values in a row, column, or box', () => {
  const board = Array(81).fill(0);
  board[0] = 5; board[8] = 5; board[40] = 3;
  assert.deepEqual([...conflicts(board)].sort((a, b) => a - b), [0, 8]);
});

test('solving the board wins and freezes the timer', () => {
  let game = createGame('easy', seeded(3), 1000);
  const empties = game.board.map((value, index) => (value ? -1 : index)).filter(index => index >= 0);
  for (const index of empties.slice(0, -1)) game = placeValue(game, index, game.solution[index], 1000);
  assert.equal(game.status, 'playing');
  game = placeValue(game, empties.at(-1), game.solution[empties.at(-1)], 61000);
  assert.equal(game.status, 'won');
  assert.ok(isSolved(game));
  assert.equal(game.elapsedMs, 60000);
  assert.equal(elapsedMilliseconds(game, 999999), 60000);
  assert.equal(placeValue(game, empties[0], 1, 0), null, 'no moves after winning');
});

test('pause and resume keep elapsed time', () => {
  let game = createGame('easy', seeded(9), 0);
  game = pauseGame(game, 5000);
  assert.equal(game.elapsedMs, 5000);
  game = resumeGame(game, 100000);
  assert.equal(elapsedMilliseconds(game, 103000), 8000);
});

test('isValidGame accepts saved games and rejects broken ones', () => {
  const game = createGame('medium', seeded(21), 0);
  assert.ok(isValidGame(JSON.parse(JSON.stringify(game))));
  assert.ok(!isValidGame({ ...game, level: 'expert' }));
  assert.ok(!isValidGame({ ...game, board: game.board.slice(1) }));
  const given = game.puzzle.findIndex(Boolean);
  const tampered = [...game.board]; tampered[given] = game.puzzle[given] === 1 ? 2 : 1;
  assert.ok(!isValidGame({ ...game, board: tampered }), 'givens cannot be overwritten');
  assert.ok(!isValidGame(null));
});

test('rastgele işlemlerde (yaz, not, sil, ipucu) geri alma tahta ve notları birebir geri getirir, oyun geçerli kalır', () => {
  const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const key = state => JSON.stringify([state.board, state.notes]);
  for (let seed = 1; seed <= 12; seed += 1) {
    const random = seeded(seed * 71);
    let game = createGame(['easy', 'medium', 'hard'][seed % 3], random, 0);
    for (let step = 0; step < 120 && game.status === 'playing'; step += 1) {
      const empty = [...Array(81).keys()].filter(index => !game.puzzle[index]);
      const index = empty[Math.floor(random() * empty.length)];
      const value = 1 + Math.floor(random() * 9);
      const pick = random();
      const next = pick < 0.45 ? placeValue(game, index, value, 0) : pick < 0.75 ? toggleNote(game, index, value)
        : pick < 0.85 ? clearCell(game, index) : pick < 0.9 ? giveHint(game, index, 0)?.game : null;
      if (!next) continue;
      if (next.status === 'playing') assert.equal(key(undo(next)), key(game), `seed ${seed} adım ${step}: geri alma`);
      assert.equal(isValidGame(next), true, `seed ${seed} adım ${step}`);
      game = next;
    }
  }
});
