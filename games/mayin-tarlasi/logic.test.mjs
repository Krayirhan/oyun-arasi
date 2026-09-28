import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, revealCell, toggleFlag, elapsedMilliseconds, DIFFICULTIES, pauseGame, resumeGame, isValidGame } from './logic.js';

test('all presets have the planned dimensions and mine counts', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(DIFFICULTIES).map(([key, value]) => [key, [value.width, value.height, value.mines]])), {
    easy: [9, 9, 10], medium: [16, 16, 40], hard: [30, 16, 99]
  });
});

test('first reveal excludes its full neighborhood and numbers match adjacent mines', () => {
  let game = createGame('test', () => 0.4, { width: 8, height: 8, mines: 10 });
  game = revealCell(game, 27, 1000, () => 0.4);
  assert.equal(game.status, 'playing');
  assert.equal(game.cells[27].mine, false);
  for (let y = 2; y <= 4; y += 1) for (let x = 2; x <= 4; x += 1) assert.equal(game.cells[y * 8 + x].mine, false);
  for (let index = 0; index < game.cells.length; index += 1) {
    const x = index % game.width, y = Math.floor(index / game.width);
    const count = game.cells.reduce((sum, cell, neighbor) => {
      const nx = neighbor % game.width, ny = Math.floor(neighbor / game.width);
      return sum + (cell.mine && Math.max(Math.abs(x - nx), Math.abs(y - ny)) <= 1 && neighbor !== index ? 1 : 0);
    }, 0);
    if (!game.cells[index].mine) assert.equal(game.cells[index].adjacent, count);
  }
});

test('zero cells expand, flags toggle, and opening a mine ends the game', () => {
  let game = createGame('test', () => 0, { width: 8, height: 8, mines: 10 });
  game = revealCell(game, 27, 1000, () => 0);
  assert.ok(game.cells.filter(cell => cell.revealed).length > 1);
  let flagged = toggleFlag(game, 0);
  assert.equal(flagged.flags, 1);
  flagged = toggleFlag(flagged, 0);
  assert.equal(flagged.flags, 0);
  const mine = game.cells.findIndex(cell => cell.mine);
  game = revealCell(game, mine, 2000);
  assert.equal(game.status, 'lost');
  assert.equal(game.explodedIndex, mine);
  assert.equal(elapsedMilliseconds(game, 9000), 1000);
});

test('opening every safe cell wins and freezes the clock', () => {
  let game = createGame('test', () => 0.73, { width: 8, height: 8, mines: 10 });
  game = revealCell(game, 27, 1000, () => 0.73);
  for (let index = 0; index < game.cells.length && game.status === 'playing'; index += 1) {
    if (!game.cells[index].mine && !game.cells[index].revealed) game = revealCell(game, index, 1000 + index * 10);
  }
  assert.equal(game.status, 'won');
  assert.equal(elapsedMilliseconds(game, 10000), game.elapsedMs);
});

test('ilk açıştan önce konan bayraklar korunur ve oyun geçerli kalır', () => {
  let game = createGame('easy');
  game = toggleFlag(game, 5);
  game = toggleFlag(game, 6);
  const after = revealCell(game, 40, 1000, () => 0.3);
  assert.equal(after.flags, 2);
  assert.equal(after.cells.filter(cell => cell.flagged).length, 2);
  assert.equal(isValidGame(after), true);
});

test('süre parçalı birikir: duraklatılan süre işlemez, devam edince sürer, kazanma/kaybetme toplamı yazar', () => {
  let game = revealCell(createGame('easy'), 40, 1000, () => 0.3);
  assert.equal(elapsedMilliseconds(game, 4000), 3000);
  const paused = pauseGame(game, 4000);
  assert.equal(paused.startedAt, null);
  assert.equal(elapsedMilliseconds(paused, 900000), 3000, 'kapalıyken geçen süre eklenmez');
  assert.equal(pauseGame(paused, 999999), paused);
  const mine = paused.cells.findIndex(cell => cell.mine);
  const lost = revealCell(resumeGame(paused, 100000), mine, 102000);
  assert.equal(lost.status, 'lost');
  assert.equal(lost.elapsedMs, 5000, '3 sn + 2 sn');
  // duraklatılmış oyunda ilk hamle süreyi sürdürür
  const safe = paused.cells.findIndex(cell => !cell.mine && !cell.revealed);
  const moved = revealCell(paused, safe, 200000);
  assert.equal(moved.startedAt, 200000);
});

test('rastgele oyunlarda ilk açış güvenli, komşu sayıları doğru, güvenli karelerin hepsi açılınca oyun kazanılır', () => {
  const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const level of Object.keys(DIFFICULTIES)) {
    for (let seed = 1; seed <= 15; seed += 1) {
      const random = seeded(seed * 53 + level.length);
      let game = createGame(level);
      const first = Math.floor(random() * game.cells.length);
      game = revealCell(game, first, 0, random);
      assert.equal(game.status === 'lost', false, `${level} #${seed}: ilk açış güvenli`);
      assert.equal(game.cells.filter(cell => cell.mine).length, DIFFICULTIES[level].mines);
      game.cells.forEach((cell, index) => {
        if (cell.mine) return;
        const x = index % game.width; const y = Math.floor(index / game.width);
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx; const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < game.width && ny < game.height && game.cells[ny * game.width + nx].mine) count += 1;
        }
        assert.equal(cell.adjacent, count, `${level} #${seed}: kare ${index} komşu sayısı`);
      });
      assert.equal(isValidGame(game), true);
      game.cells.forEach((cell, index) => { if (!cell.mine) game = revealCell(game, index, 1000, random); });
      assert.equal(game.status, 'won', `${level} #${seed}: güvenli kareler bitince kazanılır`);
    }
  }
});
