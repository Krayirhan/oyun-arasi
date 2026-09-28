import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CORRECT_BONUS_SECONDS, FLIGHT_TIME, MAX_LIVES, ROUND_SECONDS, WAVE_PAUSE, WRONG_PENALTY_SECONDS,
  advance, aimAt, createGame, evaluate, fireDart, isValidGame, levelFor, makeEquation, pauseGame, startGame
} from './logic.js';

// Dalganın tüm balonlarını çıkarır (balonlar yükselir ama ekrandan çıkacak kadar değil).
function spawnWave(game) {
  let current = game;
  for (let i = 0; i < 400 && current.spawned < current.plan.length; i += 1) current = advance(current, 0.05);
  return current;
}

function run(game, seconds) {
  let current = game;
  for (let left = seconds; left > 0; left -= .2) current = advance(current, Math.min(.2, left));
  return current;
}

// Verilen balonu ekranın ortasına taşıyıp tam üstüne dart atar ve dartın varmasını bekler.
function shoot(game, balloon) {
  const placed = { ...balloon, x: 300, y: 420 };
  let current = { ...game, shotCooldown: 0, balloons: game.balloons.map(item => (item.id === balloon.id ? placed : { ...item, x: 1000 })) };
  current = fireDart(aimAt(current, 300, 412));
  return advance(advance(current, FLIGHT_TIME * .7), FLIGHT_TIME * .5);
}

test('aynı seed aynı oyunu üretir; oyun 1. dalga, 3 can ve 60 saniyeyle başlar', () => {
  const game = createGame(81);
  assert.deepEqual(createGame(81), game);
  assert.equal(game.wave, 1);
  assert.equal(game.lives, MAX_LIVES);
  assert.equal(game.timeLeft, ROUND_SECONDS);
  assert.ok(isValidGame(game));
});

test('her dalgada tam bir cevap balonu vardır; ne ilk ne son çıkar, tuzaklar hedefe eşit değildir', () => {
  for (let seed = 1; seed < 60; seed += 1) {
    const game = spawnWave(startGame(createGame(seed)));
    const wave = game.balloons.filter(balloon => balloon.wave === 1);
    assert.equal(wave.length, levelFor(1).count);
    const answers = wave.filter(balloon => balloon.answer);
    assert.equal(answers.length, 1);
    assert.equal(answers[0].result, game.target);
    assert.ok(wave.filter(balloon => !balloon.answer).every(balloon => balloon.result !== game.target));
    assert.notEqual(wave[0].answer, true);
    assert.notEqual(wave.at(-1).answer, true);
    assert.ok(wave.every(balloon => evaluate(balloon.a, balloon.op, balloon.b) === balloon.result));
  }
});

test('cevap balonu çıkış sırası ve şeridi dalgadan dalgaya değişir (tahmin edilemez)', () => {
  const positions = new Set();
  for (let seed = 1; seed < 40; seed += 1) positions.add(createGame(seed).plan.findIndex(item => item.answer));
  assert.ok(positions.size >= 3);
});

test('doğru balon puan, kombo ve +2 sn verir; dalga biter ve kısa aradan sonra yeni hedefle yenisi başlar', () => {
  let game = spawnWave(startGame(createGame(5)));
  const before = game.timeLeft;
  const answer = game.balloons.find(balloon => balloon.answer);
  game = shoot(game, answer);
  assert.equal(game.correctHits, 1);
  assert.equal(game.combo, 1);
  assert.ok(game.score >= 100);
  assert.ok(game.timeLeft > before + CORRECT_BONUS_SECONDS - 1);
  assert.equal(game.answered, true);
  assert.ok(game.events.some(event => event.type === 'pop' && event.outcome === 'correct'));
  game = run(game, WAVE_PAUSE + .05);
  assert.equal(game.wave, 2);
  assert.equal(game.answered, false);
});

test('biten dalganın kalan balonları vurulursa ceza da puan da yoktur', () => {
  let game = spawnWave(startGame(createGame(9)));
  game = shoot(game, game.balloons.find(balloon => balloon.answer));
  const score = game.score;
  const leftover = game.balloons.find(balloon => balloon.wave === 1);
  game = shoot(game, leftover);
  assert.equal(game.score, score);
  assert.equal(game.wrongHits, 0);
  assert.ok(game.events.some(event => event.outcome === 'stale'));
});

test('yanlış balon komboyu sıfırlar, 2 sn düşer ve hedef değişmez', () => {
  let game = spawnWave(startGame(createGame(7)));
  game = { ...game, combo: 5 };
  const target = game.target;
  const before = game.timeLeft;
  game = shoot(game, game.balloons.find(balloon => !balloon.answer));
  assert.equal(game.wrongHits, 1);
  assert.equal(game.combo, 0);
  assert.equal(game.target, target);
  assert.ok(game.timeLeft < before - WRONG_PENALTY_SECONDS + .5);
});

test('kombo çarpanı her üç doğruda artar ve ×5 ile sınırlanır', () => {
  let game = spawnWave(startGame(createGame(99)));
  game = { ...game, combo: 11, waveStartedAt: -100 };
  game = shoot(game, game.balloons.find(balloon => balloon.answer));
  assert.equal(game.score, 500);
});

test('cevap balonu kaçarsa bir can gider ve yeni dalgaya geçilir; tuzak kaçarsa bir şey olmaz', () => {
  let game = spawnWave(startGame(createGame(11)));
  const answer = game.balloons.find(balloon => balloon.answer);
  const decoy = game.balloons.find(balloon => !balloon.answer);
  game = { ...game, balloons: game.balloons.map(balloon => (balloon.id === decoy.id ? { ...balloon, y: -200 } : balloon)) };
  game = advance(game, .05);
  assert.equal(game.lives, MAX_LIVES);
  game = { ...game, balloons: game.balloons.map(balloon => (balloon.id === answer.id ? { ...balloon, y: -200 } : balloon)) };
  game = advance(game, .05);
  assert.equal(game.lives, MAX_LIVES - 1);
  assert.equal(game.combo, 0);
  assert.ok(game.events.some(event => event.type === 'escape'));
  assert.equal(run(game, WAVE_PAUSE + .05).wave, 2);
});

test('üç can bitince ya da süre dolunca oyun biter', () => {
  let game = startGame(createGame(3));
  game = advance({ ...game, lives: 1, balloons: [{ ...spawnWave(game).balloons.find(balloon => balloon.answer), y: -200 }] }, .05);
  assert.equal(game.status, 'over');
  assert.equal(game.endReason, 'lives');
  let timed = startGame(createGame(4));
  timed = advance({ ...timed, timeLeft: .03 }, .05);
  assert.equal(timed.status, 'over');
  assert.equal(timed.endReason, 'time');
});

test('dart atıldığı noktaya uçuş süresi sonunda varır; havadayken ikinci dart atılamaz', () => {
  let game = spawnWave(startGame(createGame(12)));
  const answer = { ...game.balloons.find(balloon => balloon.answer), x: 150, y: 400 };
  game = aimAt({ ...game, balloons: [answer] }, 150, 392);
  game = fireDart(game);
  assert.equal(fireDart(game).dartsFired, 1);
  game = advance(game, FLIGHT_TIME * .6);
  assert.equal(game.correctHits, 0);
  game = advance(game, FLIGHT_TIME * .6);
  assert.equal(game.correctHits, 1);
});

test('boşluğa atılan dart ıskalar ve komboyu bozmaz', () => {
  let game = spawnWave(startGame(createGame(15)));
  game = { ...aimAt({ ...game, balloons: [{ ...game.balloons[0], x: 480, y: 400 }] }, 120, 300), combo: 4 };
  game = advance(advance(fireDart(game), .25), .2);
  assert.equal(game.misses, 1);
  assert.equal(game.combo, 4);
});

test('işlemler dalgaya göre açılır: toplama, çıkarma, çarpma, bölme', () => {
  assert.deepEqual(levelFor(1).ops, ['+']);
  assert.deepEqual(levelFor(4).ops, ['+', '−']);
  assert.deepEqual(levelFor(7).ops, ['+', '−', '×']);
  assert.deepEqual(levelFor(10).ops, ['+', '−', '×', '÷']);
  const game = createGame(21);
  const seen = new Set();
  for (let i = 0; i < 400; i += 1) {
    const result = 2 + (i % 11);
    const equation = makeEquation(game, result, ['+', '−', '×', '÷']);
    assert.equal(evaluate(equation.a, equation.op, equation.b), result);
    assert.ok(equation.a >= 1 && equation.b >= 1);
    seen.add(equation.op);
  }
  assert.equal(seen.size, 4);
});

test('duraklatılan oyun ilerlemez', () => {
  const paused = pauseGame(startGame(createGame(2)));
  assert.equal(advance(paused, 1).timeLeft, ROUND_SECONDS);
});
