import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, drawCards, moveCards, bestTarget, undo, canAutoComplete, autoStep, pickCards, suitOf, rankOf, isRed, cardName, elapsedMilliseconds, pauseGame, resumeGame, isValidGame } from './logic.js';
import { createDeck, shuffleDeck } from '../cards.js';

// Deterministic random numbers so every run deals the same cards.
function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

const card = (rank, suit) => suit * 13 + rank - 1;   // suit: 0 ♠, 1 ♥, 2 ♦, 3 ♣

// A hand-made position: every card sits in the stock unless placed elsewhere.
function position(parts) {
  const game = createGame(parts.draw ?? 1, seeded(1), 0);
  const tableau = parts.tableau ?? [[], [], [], [], [], [], []];
  const foundations = parts.foundations ?? [[], [], [], []];
  const waste = parts.waste ?? [];
  const used = new Set([...tableau.flat(), ...foundations.flat(), ...waste]);
  const stock = parts.stock ?? Array.from({ length: 52 }, (_, c) => c).filter(c => !used.has(c));
  return { ...game, tableau, foundations, waste, stock, down: parts.down ?? tableau.map(() => 0) };
}

test('cards know their suit, rank and color', () => {
  assert.deepEqual(createDeck(), Array.from({ length: 52 }, (_, index) => index));
  assert.equal(cardName(card(1, 0)), 'A♠');
  assert.equal(cardName(card(13, 1)), 'K♥');
  assert.equal(suitOf(card(10, 2)), 2);
  assert.equal(rankOf(card(10, 2)), 10);
  assert.ok(isRed(card(5, 1)) && isRed(card(5, 2)) && !isRed(card(5, 3)));
});

test('the deal builds seven columns with one face-up card each', () => {
  const game = createGame(1, seeded(3), 0);
  assert.deepEqual(game.tableau.map(column => column.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(game.down, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(game.stock.length, 24);
  assert.ok(isValidGame(game));
  assert.deepEqual(game.stock, shuffleDeck(seeded(3)).slice(28));
});

test('drawing one or three cards and recycling the waste', () => {
  let game = createGame(1, seeded(5), 0);
  const top = game.stock.at(-1);
  game = drawCards(game);
  assert.deepEqual(game.waste, [top]);
  for (let i = 0; i < 23; i++) game = drawCards(game);
  assert.equal(game.stock.length, 0);
  const recycled = drawCards(game);
  assert.equal(recycled.stock.length, 24);
  assert.equal(recycled.stock.at(-1), top, 'the first card drawn comes up first again');
  let three = createGame(3, seeded(5), 0);
  three = drawCards(three);
  assert.equal(three.waste.length, 3);
});

test('building down in alternating colors and flipping the uncovered card', () => {
  const game = position({ tableau: [[card(3, 0), card(9, 1)], [card(10, 3)], [], [], [], [], []], down: [1, 0, 0, 0, 0, 0, 0] });
  const moved = moveCards(game, { type: 'tableau', index: 0, card: 1 }, { type: 'tableau', index: 1 });
  assert.deepEqual(moved.tableau[1], [card(10, 3), card(9, 1)]);
  assert.equal(moved.down[0], 0, 'the 3♠ is turned face up');
  assert.equal(moved.moves, 1);
  // Same color or wrong rank is refused.
  const refused = position({ tableau: [[card(9, 0)], [card(10, 3)], [card(8, 1)], [], [], [], []] });
  assert.equal(moveCards(refused, { type: 'tableau', index: 0, card: 0 }, { type: 'tableau', index: 1 }), null);
  assert.equal(moveCards(refused, { type: 'tableau', index: 2, card: 0 }, { type: 'tableau', index: 1 }), null);
});

test('only kings go to empty columns and face-down cards cannot be picked up', () => {
  const game = position({ tableau: [[card(13, 2)], [card(5, 0), card(12, 0)], [], [], [], [], []], down: [0, 1, 0, 0, 0, 0, 0] });
  assert.ok(moveCards(game, { type: 'tableau', index: 0, card: 0 }, { type: 'tableau', index: 2 }));
  assert.equal(moveCards(game, { type: 'tableau', index: 1, card: 1 }, { type: 'tableau', index: 2 }), null);
  assert.deepEqual(pickCards(game, { type: 'tableau', index: 1, card: 0 }), []);
});

test('moving a run of cards together', () => {
  const run = [card(8, 3), card(7, 2), card(6, 0)];
  const game = position({ tableau: [run, [card(9, 1)], [], [], [], [], []] });
  const moved = moveCards(game, { type: 'tableau', index: 0, card: 0 }, { type: 'tableau', index: 1 });
  assert.deepEqual(moved.tableau[1], [card(9, 1), ...run]);
  assert.deepEqual(moved.tableau[0], []);
});

test('foundations build up by suit from the ace, one card at a time', () => {
  let game = position({ waste: [card(1, 1)], tableau: [[card(2, 1)], [card(3, 1)], [], [], [], [], []] });
  game = moveCards(game, { type: 'waste' }, { type: 'foundation' });
  assert.deepEqual(game.foundations[1], [card(1, 1)]);
  assert.equal(moveCards(game, { type: 'tableau', index: 1, card: 0 }, { type: 'foundation' }), null, '3 before 2 is refused');
  game = moveCards(game, { type: 'tableau', index: 0, card: 0 }, { type: 'foundation', index: 1 });
  assert.equal(game.foundations[1].length, 2);
  assert.equal(moveCards(game, { type: 'tableau', index: 1, card: 0 }, { type: 'foundation', index: 0 }), null, 'wrong suit pile');
  // A card can come back down from a foundation onto a column.
  const back = position({ foundations: [[], [card(1, 1), card(2, 1)], [], []], tableau: [[card(3, 0)], [], [], [], [], [], []] });
  assert.ok(moveCards(back, { type: 'foundation', index: 1 }, { type: 'tableau', index: 0 }));
});

test('tapping picks the foundation first, then a column', () => {
  const game = position({ waste: [card(1, 3)], tableau: [[card(7, 1)], [card(8, 0)], [card(13, 2)], [], [], [], []] });
  assert.deepEqual(bestTarget(game, { type: 'waste' }), { type: 'foundation', index: 3 });
  assert.deepEqual(bestTarget(game, { type: 'tableau', index: 0, card: 0 }), { type: 'tableau', index: 1 });
  assert.equal(bestTarget(game, { type: 'tableau', index: 2, card: 0 }), null, 'a king at the bottom stays put');
  assert.equal(bestTarget(game, { type: 'tableau', index: 1, card: 0 }), null);
});

test('undo restores the previous position', () => {
  const game = createGame(1, seeded(9), 0);
  const drawn = drawCards(game);
  const back = undo(drawn);
  assert.deepEqual(back.stock, game.stock);
  assert.deepEqual(back.waste, []);
  assert.equal(back.history.length, 0);
  assert.equal(undo(back), null);
});

test('auto-complete finishes the game and stops the clock', () => {
  // Every card is face up in the tableau: each column holds one suit from king down to ace.
  const tableau = [0, 1, 2, 3].map(suit => Array.from({ length: 13 }, (_, i) => card(13 - i, suit)));
  let game = position({ tableau: [...tableau, [], [], []], stock: [] });
  assert.ok(canAutoComplete(game));
  let steps = 0;
  while (game.status === 'playing') { game = autoStep(game, 60_000); steps++; }
  assert.equal(steps, 52);
  assert.equal(game.status, 'won');
  assert.equal(game.elapsedMs, 60_000);
  assert.equal(elapsedMilliseconds(game, 999_999), 60_000);
  assert.equal(drawCards(game), null);
});

test('pause freezes the clock and saves stay valid', () => {
  const game = createGame(3, seeded(11), 1000);
  const paused = pauseGame(game, 6000);
  assert.equal(paused.elapsedMs, 5000);
  assert.equal(elapsedMilliseconds(resumeGame(paused, 50_000), 51_000), 6000);
  const restored = JSON.parse(JSON.stringify(drawCards(paused)));
  assert.ok(isValidGame(restored));
  assert.ok(!isValidGame({ ...restored, stock: [...restored.stock, 0] }), 'duplicate card');
  assert.ok(!isValidGame({ ...restored, draw: 2 }));
  assert.ok(!isValidGame(null));
});

test('rastgele oynanan 25 elde kartlar korunur, açık diziler geçerli kalır, geri alma birebir ve otomatik bitirme tamamlanır', () => {
  const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const runIsValid = (game, index) => {
    const column = game.tableau[index];
    for (let at = game.down[index]; at < column.length - 1; at += 1) {
      if (isRed(column[at]) === isRed(column[at + 1]) || rankOf(column[at]) !== rankOf(column[at + 1]) + 1) return false;
    }
    return true;
  };
  for (let seed = 1; seed <= 25; seed += 1) {
    const random = seeded(seed * 97);
    let game = createGame(seed % 2 ? 1 : 3, random, 0);
    for (let step = 0; step < 400 && game.status === 'playing'; step += 1) {
      const sources = [{ type: 'waste' }, ...[0, 1, 2, 3].map(index => ({ type: 'foundation', index }))];
      game.tableau.forEach((column, index) => { for (let card = game.down[index]; card < column.length; card += 1) sources.push({ type: 'tableau', index, card }); });
      let next = null;
      for (const source of sources.sort(() => random() - 0.5)) {
        const target = bestTarget(game, source);
        if (target) { next = moveCards(game, source, target, 0); if (next) break; }
      }
      if (!next || random() < 0.15) next = drawCards(game) || next;
      if (!next) break;
      const before = game;
      game = next;
      assert.equal(isValidGame(game), true, `seed ${seed} adım ${step}`);
      for (let index = 0; index < 7; index += 1) assert.equal(runIsValid(game, index), true, `seed ${seed} sütun ${index}`);
      if (random() < 0.05 && game.history.length) {
        const back = undo(game);
        const position = state => JSON.stringify([state.stock, state.waste, state.foundations, state.tableau, state.down]);
        assert.equal(position(back), position(before), `seed ${seed} geri alma`);
      }
      if (canAutoComplete(game)) {
        let auto = game;
        for (let n = 0; n < 60 && auto.status === 'playing'; n += 1) auto = autoStep(auto, 0) || auto;
        assert.equal(auto.status, 'won', `seed ${seed} otomatik bitirme`);
        break;
      }
    }
  }
});
