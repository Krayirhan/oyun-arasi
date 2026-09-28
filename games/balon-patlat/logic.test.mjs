import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CORRECT_BONUS_SECONDS, ESCAPE_GRACE, FLIGHT_TIME, MAX_LIVES, SAFE_Y, ROUND_SECONDS, WRONG_PENALTY_SECONDS, advance, aimAt, createGame, evaluate, fireDart, isValidGame, levelFor, levelOf, makeEquation, pauseGame, startGame, LAUNCH_Y, WIDTH, HEIGHT } from './logic.js';

function run(game, seconds) {
  let current = game;
  for (let left = seconds; left > 1e-9; left -= .05) current = advance(current, Math.min(.05, left));
  return current;
}

// Verilen balonu ekranın ortasına taşıyıp tam üstüne dart atar ve dartın varmasını bekler.
function shoot(game, balloon) {
  const placed = { ...balloon, x: 300, y: 420 };
  let current = { ...game, shotCooldown: 0, balloons: game.balloons.map(item => (item.id === balloon.id ? placed : { ...item, x: 1000 })) };
  current = fireDart(aimAt(current, 300, 412));
  return advance(advance(current, FLIGHT_TIME * .7), FLIGHT_TIME * .5);
}

const answersOf = game => game.balloons.filter(balloon => balloon.result === game.target);

test('aynı seed aynı oyunu üretir; oyun 3 can ve 60 saniyeyle başlar', () => {
  const game = createGame(81);
  assert.deepEqual(createGame(81), game);
  assert.equal(game.lives, MAX_LIVES);
  assert.equal(game.timeLeft, ROUND_SECONDS);
  assert.ok(isValidGame(game));
});

test('balonlar ara vermeden çıkar; ilk çıkan balon hiçbir zaman cevap olmaz ama cevap kısa sürede gelir', () => {
  for (let seed = 1; seed < 60; seed += 1) {
    let game = run(startGame(createGame(seed)), .05);
    assert.equal(game.balloons.length, 1);
    assert.notEqual(game.balloons[0].result, game.target);
    game = run(game, 3);
    assert.ok(game.balloons.length >= 4);
    assert.ok(answersOf(game).length >= 1, `seed ${seed}: cevap gelmedi`);
    assert.ok(game.balloons.every(balloon => evaluate(balloon.a, balloon.op, balloon.b) === balloon.result));
  }
});

test('tuzak balonlar hedefe yakın sonuçlar taşır', () => {
  const game = run(startGame(createGame(33)), 4);
  const decoys = game.balloons.filter(balloon => balloon.result !== game.target);
  assert.ok(decoys.length >= 3);
  assert.ok(decoys.every(balloon => Math.abs(balloon.result - game.target) <= 10));
});

test('doğru balon puan, kombo ve +2 sn verir; hedef bekleme olmadan değişir', () => {
  let game = run(startGame(createGame(5)), 3);
  const oldTarget = game.target;
  const before = game.timeLeft;
  game = shoot(game, answersOf(game)[0]);
  assert.equal(game.correctHits, 1);
  assert.equal(game.combo, 1);
  assert.ok(game.score >= 100);
  assert.ok(game.timeLeft > before + CORRECT_BONUS_SECONDS - 1);
  assert.notEqual(game.target, oldTarget);
  assert.ok(game.events.some(event => event.type === 'pop' && event.outcome === 'correct'));
});

test('yeni hedefin cevabı hemen bir sonraki çıkan balon değildir', () => {
  let immediate = 0;
  for (let seed = 1; seed < 80; seed += 1) {
    let game = run(startGame(createGame(seed)), 3);
    game = shoot(game, answersOf(game)[0]);
    const hadOnScreen = answersOf(game).length > 0;
    const ids = new Set(game.balloons.map(balloon => balloon.id));
    for (let i = 0; i < 60; i += 1) {
      game = advance(game, .05);
      const fresh = game.balloons.find(balloon => !ids.has(balloon.id));
      if (fresh) { if (!hadOnScreen && fresh.result === game.target) immediate += 1; break; }
    }
  }
  assert.equal(immediate, 0);
});

test('yanlış balon komboyu sıfırlar, 2 sn düşer ve hedef değişmez', () => {
  let game = run(startGame(createGame(7)), 3);
  game = { ...game, combo: 5 };
  const target = game.target;
  const before = game.timeLeft;
  game = shoot(game, game.balloons.find(balloon => balloon.result !== target));
  assert.equal(game.wrongHits, 1);
  assert.equal(game.combo, 0);
  assert.equal(game.target, target);
  assert.ok(game.timeLeft < before - WRONG_PENALTY_SECONDS + .5);
});

test('kombo çarpanı her üç doğruda artar ve ×5 ile sınırlanır', () => {
  let game = run(startGame(createGame(99)), 3);
  game = { ...game, combo: 11, targetSetAt: -100 };
  game = shoot(game, answersOf(game)[0]);
  assert.equal(game.score, 500);
});

test('hedefi veren balon kaçarsa can gider ve hedef değişir; tuzak kaçarsa bir şey olmaz', () => {
  let game = run(startGame(createGame(11)), 3);
  game = { ...game, targetSetAt: game.elapsed - ESCAPE_GRACE - 1 };
  const target = game.target;
  const answer = answersOf(game)[0];
  game = { ...game, balloons: game.balloons.filter(balloon => balloon.result !== target || balloon.id === answer.id) };
  const decoy = game.balloons.find(balloon => balloon.result !== target);
  game = advance({ ...game, balloons: game.balloons.map(balloon => (balloon.id === decoy.id ? { ...balloon, y: -200 } : balloon)) }, .05);
  assert.equal(game.lives, MAX_LIVES);
  game = advance({ ...game, balloons: game.balloons.map(balloon => (balloon.id === answer.id ? { ...balloon, y: -200 } : balloon)) }, .05);
  assert.equal(game.lives, MAX_LIVES - 1);
  assert.equal(game.combo, 0);
  assert.ok(game.events.some(event => event.type === 'escape'));
});

test('üç can bitince ya da süre dolunca oyun biter', () => {
  let game = run(startGame(createGame(3)), 3);
  const answer = answersOf(game)[0];
  game = advance({ ...game, lives: 1, targetSetAt: -10, balloons: [{ ...answer, y: -200 }] }, .05);
  assert.equal(game.status, 'over');
  assert.equal(game.endReason, 'lives');
  const timed = advance({ ...startGame(createGame(4)), timeLeft: .03 }, .05);
  assert.equal(timed.status, 'over');
  assert.equal(timed.endReason, 'time');
});

test('dart atıldığı noktaya uçuş süresi sonunda varır; havadayken ikinci dart atılamaz', () => {
  let game = run(startGame(createGame(12)), 3);
  const answer = { ...answersOf(game)[0], x: 150, y: 400 };
  game = aimAt({ ...game, balloons: [answer] }, 150, 392);
  game = fireDart(game);
  assert.equal(fireDart(game).dartsFired, 1);
  game = advance(game, FLIGHT_TIME * .6);
  assert.equal(game.correctHits, 0);
  game = advance(game, FLIGHT_TIME * .6);
  assert.equal(game.correctHits, 1);
});

test('boşluğa atılan dart ıskalar ve komboyu bozmaz', () => {
  let game = run(startGame(createGame(15)), 2);
  game = { ...aimAt({ ...game, balloons: [{ ...game.balloons[0], x: 480, y: 400 }] }, 120, 300), combo: 4 };
  game = advance(advance(fireDart(game), .25), .2);
  assert.equal(game.misses, 1);
  assert.equal(game.combo, 4);
});

test('seviye doğru sayısıyla artar ve işlemler sırayla açılır', () => {
  assert.deepEqual([0, 1, 2, 5, 6, 12, 18].map(levelOf), [1, 1, 2, 3, 4, 7, 10]);
  assert.deepEqual(levelFor(1).ops, ['+']);
  assert.deepEqual(levelFor(4).ops, ['+', '−']);
  assert.deepEqual(levelFor(7).ops, ['+', '−', '×']);
  assert.deepEqual(levelFor(10).ops, ['+', '−', '×', '÷']);
  let game = run(startGame(createGame(8)), 3);
  game = { ...game, correctHits: 5 };
  game = shoot(game, answersOf(game)[0]);
  assert.ok(game.events.some(event => event.type === 'level' && event.op === '−'));
});

test('dört işlemle üretilen her işlem doğru sonucu verir', () => {
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

test('yeni hedef, tepede kaçmak üzere olan bir balonun sonucu olamaz', () => {
  for (let seed = 1; seed < 120; seed += 1) {
    let game = run(startGame(createGame(seed)), 6);
    const answer = answersOf(game)[0];
    if (!answer) continue;
    game = shoot(game, answer);
    const top = game.balloons.filter(balloon => balloon.y <= SAFE_Y + 60 && balloon.x < 900);
    assert.ok(top.every(balloon => balloon.result !== game.target), `seed ${seed}: hedef ${game.target} tepede`);
  }
});

test('hedef yeni değiştiyse hemen kaçan cevap can götürmez; başka cevap ekrandaysa da ceza yok', () => {
  let game = run(startGame(createGame(17)), 3);
  const answer = answersOf(game)[0];
  const fresh = advance({ ...game, targetSetAt: game.elapsed, balloons: [{ ...answer, y: -200 }] }, .05);
  assert.equal(fresh.lives, MAX_LIVES);
  assert.ok(fresh.events.some(event => event.type === 'retarget'));
  const twin = { ...answer, id: 999, y: 500 };
  const covered = advance({ ...game, targetSetAt: -10, balloons: [{ ...answer, y: -200 }, twin] }, .05);
  assert.equal(covered.lives, MAX_LIVES);
  assert.equal(covered.target, game.target);
});

test('adalet: hedefi veren balonu hep vuran oyuncu 90 saniyede hiç can kaybetmez (kaçış yok, yanlış vuruş yok denecek kadar az)', () => {
  for (let seed = 1; seed <= 6; seed += 1) {
    let game = startGame(createGame(seed * 1009));
    let time = 0;
    while (game.status === 'playing' && time < 90) {
      const answers = game.balloons.filter(balloon => balloon.result === game.target && balloon.y > 60 && balloon.y < LAUNCH_Y - 60).sort((a, b) => a.y - b.y);
      if (answers.length && !game.darts.length && game.shotCooldown <= 0) game = fireDart(aimAt(game, answers[0].x, answers[0].y));
      game = advance(game, 1 / 60);
      time += 1 / 60;
    }
    assert.equal(game.lives, MAX_LIVES, `seed ${seed}: can kaybı olmamalı`);
    assert.equal(game.escapes, 0, `seed ${seed}: hedef balonu kaçmamalı`);
    assert.ok(game.correctHits >= 40, `seed ${seed}: 90 sn'de yeterince isabet (${game.correctHits})`);
  }
});

test('rastgele oynayan oyuncuda değerler sonlu, balon ve can sayıları sınırlı, kayıt geçerli kalır', () => {
  const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let seed = 1; seed <= 10; seed += 1) {
    const random = seeded(seed * 53);
    let game = startGame(createGame(seed * 911));
    for (let step = 0; step < 4000 && game.status === 'playing'; step += 1) {
      if (random() < 0.1) game = aimAt(game, random() * WIDTH, random() * HEIGHT);
      if (random() < 0.2) game = fireDart(game);
      game = advance(game, 1 / 60);
      assert.ok([game.timeLeft, game.score, game.elapsed].every(Number.isFinite), `seed ${seed} adım ${step}: sonlu`);
      assert.ok(game.balloons.length <= 12 && game.lives >= 0 && game.lives <= MAX_LIVES);
    }
    assert.equal(isValidGame(game), true, `seed ${seed}: son durum geçerli`);
  }
});
