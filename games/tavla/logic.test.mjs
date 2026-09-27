import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, openingRoll, roll, legalMoves, applyMove, undoMove, endTurn, turnDone, nextGame,
  pipCount, isValidGame, turnSequences, chooseSequence, maxPlayable
} from './logic.js';

const empty = (turn = 0) => ({ ...createGame(), points: Array(24).fill(0), bar: [0, 0], off: [0, 0], turn, phase: 'roll' });
const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('başlangıç dizilimi 15er pul ve 167 pip', () => {
  const game = createGame();
  assert.equal(isValidGame(game), true);
  assert.equal(pipCount(game, 0), 167);
  assert.equal(pipCount(game, 1), 167);
});

test('açılışta büyük zar atan başlar, eşitlikte tekrar atılır', () => {
  let game = createGame();
  game = openingRoll(game, 3, 3);
  assert.equal(game.phase, 'opening');
  game = openingRoll(game, 2, 5);
  assert.equal(game.phase, 'roll');
  assert.equal(game.turn, 1);
});

test('bardaki pul girmeden başka pul oynanamaz; kapalı haneye girilemez', () => {
  const state = empty();
  state.points[5] = 5; state.points[12] = 9; state.bar[0] = 1;
  state.points[18] = -2; // oyuncu 0 için 6 ile giriş hanesi (24-6=18) kapalı
  state.points[0] = -13;
  const game = roll(state, 6, 3);
  const moves = legalMoves(game);
  assert.ok(moves.length > 0);
  assert.ok(moves.every(move => move.from === 'bar' && move.die === 3 && move.to === 21));
});

test('kırılan pul bara gider, geri alınca geri gelir', () => {
  const state = empty();
  state.points[10] = 1; state.points[7] = -1; state.points[0] = -14; state.points[5] = 14;
  let game = roll(state, 3, 1);
  const hit = legalMoves(game).find(move => move.from === 10 && move.to === 7);
  game = applyMove(game, hit);
  assert.equal(game.bar[1], 1);
  assert.equal(game.points[7], 1);
  game = undoMove(game);
  assert.equal(game.bar[1], 0);
  assert.equal(game.points[7], -1);
  assert.equal(game.points[10], 1);
  assert.deepEqual(game.left, [3, 1]);
});

test('her geçerli hamleden sonra kalan zarlar da oynanabilir (en çok zar kuralı)', () => {
  const random = seeded(4242);
  const die = () => 1 + Math.floor(random() * 6);
  let game = createGame();
  while (game.phase === 'opening') game = openingRoll(game, die(), die());
  for (let turn = 0; turn < 300 && game.phase !== 'over'; turn += 1) {
    game = roll(game, die(), die());
    while (!turnDone(game) && game.phase === 'move') {
      const moves = legalMoves(game);
      const needed = game.turnMax - game.moves.length;
      for (const move of moves) {
        const after = applyMove(game, move);
        if (after.phase !== 'over') assert.equal(maxPlayable(after), needed - 1);
      }
      game = applyMove(game, moves[Math.floor(random() * moves.length)]);
    }
    if (game.phase === 'over') break;
    game = endTurn(game);
  }
});

test('yalnızca bir zar oynanabiliyorsa büyük olan oynanır', () => {
  const state = empty();
  // Tek pul 10'da: 6 ile 4'e, 2 ile 8'e gidebilir; ama ikisi birden oynanamaz (2. hane kapalı).
  state.points[10] = 1; state.off[0] = 14;
  state.points[2] = -2; state.points[23] = -13;
  const game = roll(state, 6, 2);
  const moves = legalMoves(game);
  assert.equal(game.turnMax, 1);
  assert.ok(moves.length > 0);
  assert.ok(moves.every(move => move.die === 6));
});

test('çift zarda dört hamle', () => {
  let game = createGame();
  game = openingRoll(game, 4, 1);
  game = roll(game, 2, 2);
  assert.deepEqual(game.left, [2, 2, 2, 2]);
  assert.equal(game.turnMax, 4);
  for (let index = 0; index < 4; index += 1) game = applyMove(game, legalMoves(game)[0]);
  assert.equal(turnDone(game), true);
  game = endTurn(game);
  assert.equal(game.turn, 1);
  assert.equal(game.phase, 'roll');
});

test('toplama: tüm pullar evde değilken yapılamaz; büyük zar geride pul yoksa kullanılır', () => {
  const state = empty();
  state.points[2] = 3; state.points[8] = 1; state.points[4] = 11; state.points[20] = -15;
  let game = roll(state, 6, 5);
  assert.ok(legalMoves(game).every(move => move.to !== 'off' || move.from !== 2));
  const home = empty();
  home.points[2] = 3; home.points[1] = 12; home.points[20] = -15;
  game = roll(home, 6, 5);
  const moves = legalMoves(game);
  assert.ok(moves.some(move => move.from === 2 && move.to === 'off' && move.die === 6));
  assert.ok(!moves.some(move => move.from === 1 && move.to === 'off' && move.die === 6));
});

test('son pulu toplayan kazanır; rakip hiç toplamadıysa mars (2 puan)', () => {
  const state = empty();
  state.points[0] = 1; state.off[0] = 14; state.points[12] = -15;
  let game = roll(state, 1, 2);
  game = applyMove(game, legalMoves(game).find(move => move.to === 'off'));
  assert.equal(game.phase, 'over');
  assert.equal(game.winner, 0);
  assert.equal(game.gamePoints, 2);
  assert.deepEqual(game.match.score, [2, 0]);
  const single = empty();
  single.points[0] = 1; single.off[0] = 14; single.points[20] = -14; single.off[1] = 1;
  game = applyMove(roll(single, 1, 2), { from: 0, to: 'off', die: 1 });
  assert.equal(game.gamePoints, 1);
});

test('maç hedefe ulaşınca biter, değilse yeni oyun skorla başlar', () => {
  const state = empty();
  state.points[0] = 1; state.off[0] = 14; state.points[12] = -15;
  state.match = { target: 3, score: [2, 1], games: 3, winner: null };
  let game = applyMove(roll(state, 1, 1), { from: 0, to: 'off', die: 1 });
  assert.equal(game.match.winner, 0);
  assert.equal(nextGame(game), game);
  const early = empty();
  early.points[0] = 1; early.off[0] = 14; early.points[20] = -14; early.off[1] = 1;
  game = applyMove(roll(early, 1, 1), { from: 0, to: 'off', die: 1 });
  const next = nextGame(game);
  assert.equal(next.phase, 'opening');
  assert.deepEqual(next.match.score, [1, 0]);
  assert.equal(pipCount(next, 0), 167);
});

test('tur dizileri en çok zarı kullanır ve aynı sonuçları tekler', () => {
  let game = roll(openingRoll(createGame(), 6, 1), 3, 1);
  const sequences = turnSequences(game);
  assert.ok(sequences.length > 0);
  assert.ok(sequences.every(sequence => sequence.moves.length === 2));
  const keys = new Set(sequences.map(sequence => sequence.state.points.join(',')));
  assert.equal(keys.size, sequences.length);
});

test('bot her seviyede yalnız geçerli hamle yapar (rastgele oyunlar)', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const random = seeded(level.length * 97);
    const die = () => 1 + Math.floor(random() * 6);
    let game = createGame(3);
    while (game.phase === 'opening') game = openingRoll(game, die(), die());
    const limit = level === 'hard' ? 24 : 400;
    for (let turn = 0; turn < limit && game.phase !== 'over'; turn += 1) {
      game = roll(game, die(), die());
      const expected = maxPlayable(game);
      const sequence = chooseSequence(game, level, random);
      assert.equal(sequence.length, expected);
      for (const move of sequence) {
        const legal = legalMoves(game);
        assert.ok(legal.some(option => option.from === move.from && option.to === move.to && option.die === move.die), `${level}: geçersiz hamle ${JSON.stringify(move)}`);
        game = applyMove(game, move);
        if (game.phase === 'over') break;
      }
      if (game.phase === 'over') break;
      game = endTurn(game);
      assert.equal(isValidGame(game), true);
    }
  }
});
