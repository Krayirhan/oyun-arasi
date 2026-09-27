import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../cards.js';
import { TARGET_SCORE, createGame, cardPoints, isMatch, isPisti, scoreCards, playCard, botTurn, startNextDeal, isValidGame } from './logic.js';

const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test('52 kart tam olarak dağıtılır; üç kapalı ve bir açık masa kartı vardır', () => {
  const game = createGame(seeded(17));
  assert.equal(TARGET_SCORE, 101);
  assert.equal(game.deck.length, 40);
  assert.deepEqual(game.hands.map(hand => hand.length), [4, 4]);
  assert.equal(game.table.length, 4);
  assert.equal(game.hiddenCount, 3);
  assert.equal(isValidGame(game), true);
  const all = [...game.deck, ...game.hands.flat(), ...game.table];
  assert.deepEqual([...all].sort((a, b) => a - b), createDeck());
});

test('aynı rank toplar; Vale her masayı alır', () => {
  assert.equal(isMatch(0, 13), true); // same rank A
  assert.equal(isMatch(10, 11), true); // jack takes a queen
  assert.equal(isMatch(5, 13), false);
});

test('tek kartlık eşleşme Pişti; Vale ile eşleşme Vale Pişti sayılır', () => {
  const state = { table: [0] };
  assert.equal(isPisti(state, 13), true);
  assert.equal(isPisti({ table: [0, 1] }, 13), false);
  assert.equal(isPisti({ table: [10] }, 23), true);
});

test('özel kart puanları ve toplam kart puanı doğrudur', () => {
  assert.equal(cardPoints(0), 1); // A♠
  assert.equal(cardPoints(10), 1); // J♠
  assert.equal(cardPoints(40), 2); // 2♣
  assert.equal(cardPoints(35), 3); // 10♦
  assert.equal(cardPoints(12), 0);
  assert.equal(scoreCards([0, 10, 40, 35]), 7);
});

test('kart oynama geçersiz kartı ve sıra dışı hamleyi reddeder', () => {
  const game = createGame(seeded(5));
  assert.equal(playCard(game, 1, game.hands[1][0]), game);
  assert.equal(playCard(game, 0, 99), game);
});

test('eşleşen kart masayı alır; Pişti puanını ve el hareketini yazar', () => {
  const base = createGame(seeded(23));
  const table = [0];
  const hand = [13, 2, 3, 4];
  const playerTwo = [5, 6, 7, 8];
  const used = new Set([...table, ...hand, ...playerTwo]);
  const state = { ...base, table, hiddenCount: 0, hands: [hand, playerTwo], deck: createDeck().filter(card => !used.has(card)) };
  const next = playCard(state, 0, 13);
  assert.equal(next.lastAction.takes, true);
  assert.equal(next.captured[0].length, 2);
  assert.equal(next.scores[0], 10, 'Pişti is immediately credited');
  assert.equal(next.table.length, 0);
  assert.equal(next.turn, 1);
});

test('bot geçerli hamle yapar ve masadaki son kartı alabiliyorsa öncelik verir', () => {
  const game = createGame(seeded(31));
  const table = [0]; const hands = [[5, 6, 7, 8], [13, 2, 3, 4]];
  const used = new Set([...table, ...hands.flat()]);
  const forced = { ...game, turn: 1, table, hiddenCount: 0, hands, deck: createDeck().filter(card => !used.has(card)) };
  const next = botTurn(forced, seeded(3));
  assert.equal(next.lastAction.player, 1);
  assert.equal(next.lastAction.takes, true);
  assert.equal(isValidGame(next), true);
});

test('tam dağıtım botlarla biter, son masayı son alan oyuncu toplar ve yeni el skoru korur', () => {
  let game = createGame(seeded(49));
  const random = seeded(98);
  let guard = 0;
  while (game.status === 'playing' && guard++ < 300) {
    if (game.turn === 1) game = botTurn(game, random);
    else game = playCard(game, 0, game.hands[0][Math.floor(random() * game.hands[0].length)]);
    assert.equal(isValidGame(game), true);
  }
  assert.ok(guard < 300, 'deal terminates');
  assert.equal(game.status, 'deal-over');
  assert.equal(game.deck.length, 0);
  assert.deepEqual(game.hands.map(hand => hand.length), [0, 0]);
  assert.equal(game.captured.flat().length + game.table.length, 52);
  const next = startNextDeal(game, seeded(51));
  assert.equal(next.status, 'playing');
  assert.deepEqual(next.scores, game.scores);
  assert.equal(next.rounds, game.rounds);
  assert.equal(next.turn, game.rounds % 2);
});

test('101 puana ulaşılması dağıtım sonunda maçı bitirir', () => {
  const base = createGame(seeded(4));
  const game = { ...base, deck: [], hands: [[0], []], table: [], hiddenCount: 0,
    captured: [createDeck().filter(card => card !== 0), []], scores: [100, 0], lastCapture: 0 };
  const next = playCard(game, 0, 0); // last card is an ace; its deal point raises the match total to 101
  assert.equal(next.status, 'match-over');
  assert.ok(next.scores[0] >= 101);
});
