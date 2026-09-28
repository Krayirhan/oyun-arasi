import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLIGHT_TIME, HEIGHT, LAUNCH_X, LAUNCH_Y, MAX_ESCAPES, ROUND_SECONDS, advance, aimAt, createGame, fireDart, isValidGame, pauseGame, stageFor, startGame } from './logic.js';

function shootAt(game, balloon) {
  const target = { ...balloon, x: LAUNCH_X, y: 420 };
  const setup = { ...game, balloons: [target] };
  const aimed = aimAt(setup, target.x, target.y - 8);
  return advance(advance(fireDart(aimed), 0.25), 0.2);
}

test('seeded game starts with a target that appears on a valid rising equation balloon', () => {
  const first = createGame(81);
  assert.deepEqual(createGame(81), first);
  assert.ok(first.balloons.some(balloon => balloon.result === first.target));
  assert.ok(first.balloons.every(balloon => balloon.a + balloon.b === balloon.result));
  assert.equal(first.balloons.length, 5);
  assert.ok(isValidGame(first));
});

test('right dart pops the matching sum, awards points and creates the next target answer', () => {
  let game = startGame(createGame(4));
  const balloon = game.balloons.find(item => item.result === game.target);
  const oldTarget = game.target;
  game = shootAt(game, balloon);
  assert.equal(game.correctHits, 1);
  assert.equal(game.score, 100);
  assert.notEqual(game.target, oldTarget);
  assert.ok(game.balloons.some(item => item.result === game.target));
});

test('wrong dart pops its balloon, gives no points and resets the combo without changing target', () => {
  let game = startGame(createGame(7));
  game.combo = 5;
  const target = game.target;
  const balloon = game.balloons.find(item => item.result !== target);
  game = shootAt(game, balloon);
  assert.equal(game.wrongHits, 1);
  assert.equal(game.score, 0);
  assert.equal(game.combo, 0);
  assert.equal(game.target, target);
});

test('correct-shot multiplier increases every three hits and caps at five', () => {
  let game = startGame(createGame(99));
  game = { ...game, combo: 2 };
  let balloon = game.balloons.find(item => item.result === game.target);
  game = shootAt(game, balloon);
  assert.equal(game.score, 200);
  game = { ...game, combo: 11 };
  balloon = game.balloons.find(item => item.result === game.target);
  game = shootAt(game, balloon);
  assert.equal(game.score, 700);
});

test('difficulty advances after eight and twenty correct hits', () => {
  assert.deepEqual([0, 7, 8, 19, 20, 80].map(stageFor), [1, 1, 2, 2, 3, 3]);
});

test('a missed target bubble increments escapes and is replaced so the target stays solvable', () => {
  let game = startGame(createGame(15));
  const targetBubble = game.balloons.find(item => item.result === game.target);
  game = { ...game, balloons: [{ ...targetBubble, y: -targetBubble.radius - 1 }] };
  game = advance(game, 0.05);
  assert.equal(game.escapes, 1);
  assert.ok(game.balloons.some(item => item.result === game.target));
  assert.equal(game.status, 'playing');
});

test('third escaped balloon ends the run', () => {
  let game = startGame(createGame(16));
  const balloon = game.balloons[0];
  game = { ...game, escapes: MAX_ESCAPES - 1, balloons: [{ ...balloon, y: -balloon.radius - 1 }] };
  game = advance(game, 0.05);
  assert.equal(game.escapes, MAX_ESCAPES);
  assert.equal(game.status, 'over');
  assert.equal(game.endReason, 'escapes');
});

test('timer ends the run at sixty seconds and pause freezes the timer', () => {
  let game = startGame(createGame(20));
  game = pauseGame(game);
  const paused = advance(game, 0.25);
  assert.equal(paused.elapsed, 0);
  game = startGame({ ...game, balloons: [] });
  for (let i = 0; i < ROUND_SECONDS * 4 + 1; i += 1) {
    const answer = game.balloons.find(balloon => balloon.result === game.target);
    game = { ...game, balloons: answer ? [{ ...answer, x: LAUNCH_X, y: 500 }] : [] };
    game = advance(game, 0.25);
  }
  assert.equal(game.elapsed, ROUND_SECONDS);
  assert.equal(game.status, 'over');
  assert.equal(game.endReason, 'time');
});

test('aim and fire obey status, cooldown and board bounds', () => {
  let game = createGame(21);
  assert.equal(fireDart(game), game);
  game = startGame(game);
  game = aimAt(game, 999, HEIGHT);
  assert.equal(game.aim.x, 600);
  assert.ok(game.aim.y < LAUNCH_Y);
  const fired = fireDart(game);
  assert.equal(fired.dartsFired, 1);
  assert.equal(fireDart(fired).dartsFired, 1);
  assert.equal(LAUNCH_X, 300);
});

test('dart atıldığı noktaya uçuş süresi sonunda varır; o sırada elde yeni dart yoktur', () => {
  let game = startGame(createGame(12));
  const balloon = { ...game.balloons.find(item => item.result === game.target), x: 150, y: 400 };
  game = aimAt({ ...game, balloons: [balloon] }, 150, 392);
  game = fireDart(game);
  assert.equal(game.darts.length, 1);
  assert.equal(fireDart(game).dartsFired, 1, 'uçuştaki dart varken ikinci dart atılamaz');
  game = advance(game, FLIGHT_TIME * .6);
  assert.equal(game.correctHits, 0, 'dart henüz varmadı');
  game = advance(game, FLIGHT_TIME * .6);
  assert.equal(game.correctHits, 1);
  assert.deepEqual(game.events.map(event => event.type), ['pop']);
});

test('boşluğa atılan dart ıskalar, balon patlamaz ve kombo bozulmaz', () => {
  let game = startGame(createGame(15));
  const balloon = { ...game.balloons[0], x: 480, y: 400 };
  game = { ...aimAt({ ...game, balloons: [balloon] }, 120, 300), combo: 4 };
  game = advance(advance(fireDart(game), 0.25), 0.2);
  assert.equal(game.misses, 1);
  assert.equal(game.combo, 4);
  assert.ok(game.balloons.some(item => item.id === balloon.id));
});
