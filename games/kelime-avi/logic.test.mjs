import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, THEMES, generatePuzzle, createGame, lineCells, snapLine, submitSelection, giveHint, elapsedMilliseconds, pauseGame, resumeGame, isValidGame, mergeRecords } from './logic.js';

function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

function direction(size, cells) {
  const [a, b] = cells;
  return [Math.floor(b / size) - Math.floor(a / size), (b % size) - (a % size)];
}

test('theme words are upper-case Turkish and at least three letters', () => {
  for (const theme of THEMES) {
    assert.ok(theme.words.length >= 12, `${theme.name} has enough words`);
    for (const word of theme.words) {
      assert.equal(word, word.toLocaleUpperCase('tr-TR'));
      assert.ok([...word].length >= 3, word);
    }
  }
  assert.ok(THEMES.find(theme => theme.name === 'Şehirler').words.includes('İSTANBUL'), 'dotted capital İ');
});

test('every level hides its word count along allowed directions', () => {
  for (const [level, config] of Object.entries(LEVELS)) {
    for (let seed = 1; seed <= 20; seed += 1) {
      const puzzle = generatePuzzle(level, seeded(seed * 31 + level.length));
      assert.equal(puzzle.size, config.size);
      assert.equal(puzzle.grid.length, config.size ** 2);
      assert.ok(puzzle.grid.every(letter => [...letter].length === 1), 'every cell has one letter');
      assert.equal(puzzle.words.length, config.words, `${level} seed ${seed} places ${config.words} words`);
      for (const entry of puzzle.words) {
        assert.equal(entry.cells.map(cell => puzzle.grid[cell]).join(''), entry.word, 'word reads along its cells');
        const [dr, dc] = direction(config.size, entry.cells);
        assert.ok(config.directions.some(([r, c]) => r === dr && c === dc), `${level} direction ${dr},${dc} is allowed`);
      }
    }
  }
});

test('lines must be straight: horizontal, vertical or exact diagonal', () => {
  assert.deepEqual(lineCells(8, 0, 3), [0, 1, 2, 3]);
  assert.deepEqual(lineCells(8, 0, 24), [0, 8, 16, 24]);
  assert.deepEqual(lineCells(8, 0, 27), [0, 9, 18, 27]);
  assert.deepEqual(lineCells(8, 3, 0), [3, 2, 1, 0]);
  assert.equal(lineCells(8, 0, 10), null, 'a knight-like jump is not a line');
});

test('snapLine turns a slightly wobbly drag into the nearest straight line', () => {
  assert.deepEqual(snapLine(8, 0, 11), [0, 1, 2, 3], 'mostly horizontal snaps to the row');
  assert.deepEqual(snapLine(8, 0, 25), [0, 8, 16, 24], 'mostly vertical snaps to the column');
  assert.deepEqual(snapLine(8, 0, 19), [0, 9, 18, 27], 'close to diagonal snaps to the diagonal');
});

test('selecting a hidden word forwards or backwards finds it once', () => {
  const game = createGame('medium', seeded(4), 0);
  const [entry] = game.words;
  let result = submitSelection(game, entry.cells, 0);
  assert.equal(result.word.word, entry.word);
  assert.ok(result.game.words[0].found);
  assert.equal(submitSelection(result.game, entry.cells, 0), null, 'already found');
  const other = game.words[1];
  result = submitSelection(result.game, [...other.cells].reverse(), 0);
  assert.equal(result.word.word, other.word, 'reverse selection also counts');
  assert.equal(submitSelection(game, [entry.cells[0]], 0), null, 'a single letter is not a word');
});

test('finding every word wins and freezes the timer', () => {
  let game = createGame('easy', seeded(8), 1000);
  game.words.slice(0, -1).forEach(entry => { game = submitSelection(game, entry.cells, 1000).game; });
  assert.equal(game.status, 'playing');
  game = submitSelection(game, game.words.at(-1).cells, 46000).game;
  assert.equal(game.status, 'won');
  assert.equal(game.elapsedMs, 45000);
  assert.equal(elapsedMilliseconds(game, 999999), 45000);
});

test('hints reveal the first letter of an unfound word and count', () => {
  let game = createGame('easy', seeded(9), 0);
  const result = giveHint(game, seeded(1));
  assert.equal(result.game.hints, 1);
  assert.equal(result.game.hinted.length, 1);
  assert.equal(result.game.hinted[0], result.word.cells[0]);
  game = submitSelection(result.game, result.word.cells, 0).game;
  assert.equal(game.hinted.length, 0, 'the hint clears once the word is found');
});

test('pause and resume keep elapsed time', () => {
  let game = createGame('easy', seeded(10), 0);
  game = pauseGame(game, 4000);
  game = resumeGame(game, 90000);
  assert.equal(elapsedMilliseconds(game, 93000), 7000);
});

test('isValidGame accepts saved games and rejects broken ones', () => {
  const game = createGame('hard', seeded(11), 0);
  assert.ok(isValidGame(JSON.parse(JSON.stringify(game))));
  assert.ok(!isValidGame({ ...game, level: 'expert' }));
  assert.ok(!isValidGame({ ...game, grid: game.grid.slice(1) }));
  const tampered = [...game.grid]; tampered[game.words[0].cells[0]] = tampered[game.words[0].cells[0]] === 'A' ? 'B' : 'A';
  assert.ok(!isValidGame({ ...game, grid: tampered }), 'words must still read along their cells');
  assert.ok(!isValidGame(null));
});

test('her seviyede 300 bulmaca: kelimeler bulunur, ters de kabul edilir, aynı kelime ikinci kez sayılmaz', () => {
  for (const level of Object.keys(LEVELS)) {
    for (let seed = 1; seed <= 300; seed += 1) {
      let game = createGame(level, seeded(seed * 7919 + level.length), 0);
      assert.equal(game.words.length, LEVELS[level].words, `${level} #${seed}`);
      assert.equal(isValidGame(game), true);
      const [first, ...rest] = game.words;
      const reversed = submitSelection(game, [...first.cells].reverse(), 0);
      assert.ok(reversed, `${level} #${seed} ters seçim`);
      assert.equal(submitSelection(reversed.game, first.cells, 0), null, 'bulunan kelime tekrar sayılmaz');
      game = reversed.game;
      for (const entry of rest) game = submitSelection(game, entry.cells, 1000).game;
      assert.equal(game.status, 'won', `${level} #${seed} bütün kelimeler bulunca biter`);
    }
  }
});

test('dolgu harfi kelimenin ikinci kopyasını üretse bile hangi kopya seçilirse seçilsin bulunur', () => {
  let checked = 0;
  for (let seed = 1; seed <= 400 && checked < 5; seed += 1) {
    const game = createGame('hard', seeded(seed), 0);
    for (const entry of game.words) {
      const L = [...entry.word].length;
      for (let start = 0; start < game.grid.length; start += 1) for (const [dr, dc] of LEVELS.hard.directions) {
        const r1 = Math.floor(start / game.size) + dr * (L - 1); const c1 = (start % game.size) + dc * (L - 1);
        if (r1 < 0 || r1 >= game.size || c1 < 0 || c1 >= game.size) continue;
        const cells = Array.from({ length: L }, (_, k) => (Math.floor(start / game.size) + dr * k) * game.size + (start % game.size) + dc * k);
        if (cells.map(cell => game.grid[cell]).join('') !== entry.word || cells.join() === entry.cells.join()) continue;
        const result = submitSelection(game, cells, 0);
        assert.ok(result, `${entry.word} ikinci kopya`);
        assert.equal(result.word.word, entry.word);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 0, 'örnek ikinci kopya bulundu');
});

test('rekor birleştirme her seviyede en kısa süreyi tutar ve boş rekoru ezmez', () => {
  assert.deepEqual(mergeRecords({ easy: 50000, medium: null, hard: 90000 }, { easy: 40000, medium: 70000, hard: null }), { easy: 40000, medium: 70000, hard: 90000 });
  assert.deepEqual(mergeRecords(null, undefined), { easy: null, medium: null, hard: null });
  assert.deepEqual(mergeRecords({ easy: 'x' }, { easy: 12 }), { easy: 12, medium: null, hard: null });
});

test('temalardaki hiçbir kelime engellenen listede değildir', async () => {
  const { isBlocked } = await import('../harfane/engellenen.mjs');
  for (const theme of THEMES) assert.deepEqual(theme.words.filter(word => isBlocked(word.toLocaleLowerCase('tr-TR'))), [], theme.name);
});
