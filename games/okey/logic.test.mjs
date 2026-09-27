import test from 'node:test';
import assert from 'node:assert/strict';
import { createSet, createRound, nextFace, bestArrangement, canFinish, drawFromWall, drawDiscard, discardTile, botTurn, chooseBotDiscard, isValidRound } from './logic.js';

const tiles = createSet();
const tile = (color, number, copy = 0) => tiles.find(item => !item.fake && item.color === color && item.number === number && item.id % 2 === copy);
const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('taş seti 104 renkli taş ve iki sahte okey içerir', () => {
  const set = createSet();
  assert.equal(set.length, 106);
  assert.equal(new Set(set.map(item => item.id)).size, 106);
  assert.equal(set.filter(item => item.fake).length, 2);
});

test('gösterge 13 ise okey aynı rengin 1 taşıdır', () => {
  assert.deepEqual(nextFace(tile(2, 13)), { color: 2, number: 1 });
});

test('klasik seri ve grup taşları 14 taşın tamamını kaplar', () => {
  const indicator = tile(3, 13);
  const hand = [tile(0, 1), tile(1, 1), tile(2, 1), tile(3, 1), tile(0, 3), tile(0, 4), tile(0, 5),
    tile(1, 6), tile(1, 7), tile(1, 8), tile(0, 11), tile(1, 11), tile(2, 11), tile(3, 11)];
  assert.equal(bestArrangement(hand, indicator).covered, 14);
  assert.equal(canFinish(hand, indicator), true);
});

test('12–13–1 serisi geçerlidir; araya sayı atlanan seri geçersizdir', () => {
  const indicator = tile(3, 10);
  const hand = [tile(0, 12), tile(0, 13), tile(0, 1), tile(1, 1), tile(1, 2), tile(1, 3),
    tile(0, 5), tile(1, 5), tile(2, 5), tile(3, 5), tile(0, 9), tile(1, 9), tile(2, 9), tile(3, 9)];
  assert.equal(canFinish(hand, indicator), true);
  const broken = [...hand];
  broken[1] = tile(0, 11);
  assert.equal(canFinish(broken, indicator), false);
});

test('okey eksik taşı joker olarak tamamlar, sahte okey gösterge değerinde kalır', () => {
  const indicator = tile(0, 7); // gerçek okey kırmızı 8
  const hand = [tile(0, 5), tile(0, 6), tile(0, 8), tile(1, 1), tile(1, 2), tile(1, 3),
    tile(1, 4), tile(2, 4), tile(3, 4), tile(0, 9), tile(1, 9), tile(2, 9), tile(3, 9), tiles[104]];
  assert.equal(canFinish(hand, indicator), true);
});

test('14 taşta yedi aynı renk/değer çiftiyle bitilir', () => {
  const indicator = tile(3, 13);
  const hand = Array.from({ length: 7 }, (_, i) => [tile(0, i + 1, 0), tile(0, i + 1, 1)]).flat();
  assert.equal(canFinish(hand, indicator), true);
  assert.equal(canFinish(hand.slice(1), indicator), false);
});

test('gerçek okey yedi çiftte tek taşı tamamlar', () => {
  const indicator = tile(0, 6); // real okey is red 7
  const hand = [tile(0, 1), tile(0, 1, 1), tile(0, 2), tile(0, 2, 1), tile(0, 3), tile(0, 3, 1),
    tile(0, 4), tile(0, 4, 1), tile(0, 5), tile(0, 5, 1), tile(0, 6), tile(0, 6, 1),
    tile(1, 9), tile(1, 9, 1)];
  // Six natural pairs plus a single and the real joker form seven pairs.
  hand[13] = tile(0, 7);
  assert.equal(canFinish(hand, indicator), true);
});

test('dağıtımda bir oyuncuda 15, diğerlerinde 14 taş olur ve 106 taş korunur', () => {
  const game = createRound(seeded(32));
  assert.equal(isValidRound(game), true);
  assert.equal(game.hands.filter(hand => hand.length === 15).length, 1);
  assert.deepEqual(game.hands.map(hand => hand.length).sort(), [14, 14, 14, 15]);
});

test('çekme, atma ve sıra geçişi taşları kaybetmeden işler', () => {
  const random = seeded(7);
  let game = createRound(random);
  const player = game.turn;
  game = discardTile(game, player, game.hands[player][0].id);
  assert.equal(game.phase, 'draw');
  const nextPlayer = game.turn;
  game = drawFromWall(game, nextPlayer);
  assert.equal(game.phase, 'discard');
  assert.equal(game.hands[nextPlayer].length, 15);
  game = discardTile(game, nextPlayer, game.hands[nextPlayer][0].id);
  assert.equal(game.phase, 'draw');
  assert.equal(isValidRound(game), true);
});

test('önceki oyuncunun attığı taş çekilebilir', () => {
  let game = createRound(seeded(15));
  game = discardTile(game, game.turn, game.hands[game.turn][0].id);
  const player = game.turn;
  const oldWall = game.wall.length;
  game = drawDiscard(game, player);
  assert.equal(game.hands[player].length, 15);
  assert.equal(game.wall.length, oldWall);
  assert.equal(game.phase, 'discard');
});

test('bot her seviyede sırası geldiğinde bir geçerli çekme ve atma yapar', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    let game = createRound(seeded(95));
    game = discardTile(game, game.turn, game.hands[game.turn][0].id);
    game = botTurn(game, level, seeded(4));
    assert.ok(['draw', 'round-over', 'match-over'].includes(game.phase));
    assert.equal(isValidRound(game), true);
  }
});

test('zor bot eşit değerdeki atık taş bilgisini son kararında kullanır', () => {
  const indicator = tile(3, 13);
  const hand = [tile(0, 1), tile(1, 1), tile(2, 1), tile(0, 4), tile(0, 5), tile(1, 7)];
  const random = () => 0.5;
  const withoutSeen = chooseBotDiscard(hand, indicator, 'hard', random, []);
  const withSeen = chooseBotDiscard(hand, indicator, 'hard', random, [tile(0, 7), tile(1, 7)]);
  assert.equal(withSeen, tile(1, 7).id);
  assert.notEqual(withSeen, withoutSeen);
});

test('beşinci el galibiyeti maçı bitirir', () => {
  const indicator = tile(3, 13);
  const winningHand = [tile(0, 1), tile(1, 1), tile(2, 1), tile(3, 1), tile(0, 2), tile(0, 3), tile(0, 4),
    tile(1, 5), tile(1, 6), tile(1, 7), tile(2, 8), tile(2, 9), tile(2, 10), tile(2, 11)];
  const base = createRound(seeded(111));
  const winningDiscard = tile(2, 12);
  const occupied = new Set([indicator.id, ...winningHand.map(item => item.id), winningDiscard.id]);
  const remaining = tiles.filter(item => !occupied.has(item.id));
  const state = { ...base, phase: 'discard', turn: 0, indicator, hands: [
    [...winningHand, winningDiscard], ...base.hands.slice(1)
  ], wins: [4, 0, 0, 0], wall: remaining.slice(0, 45), discards: [[], [], [], []] };
  const result = discardTile(state, 0, winningDiscard.id);
  assert.equal(result.phase, 'match-over');
  assert.equal(result.matchWinner, 0);
  assert.equal(result.wins[0], 5);
});
