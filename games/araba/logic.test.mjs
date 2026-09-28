import test from 'node:test';
import assert from 'node:assert/strict';
import { LANES, PLAYER_Y, CAR_LENGTH, START_SPEED, MAX_SPEED, COIN_POINTS, createGame, startGame, pauseGame, steer, steerToward, step, advance, score, speedFor, collides } from './logic.js';

const playing = (seed = 7) => startGame(createGame(seed));

// Drives for a while like a careful player: picks the nearest lane that is clear far ahead and whose
// way over is not blocked by a car alongside, then steers there one lane at a time.
function autopilot(game, seconds) {
  let current = game;
  let goal = current.lane;
  const lanes = Array.from({ length: LANES }, (_, lane) => lane);
  const ahead = lane => current.cars.some(car => car.lane === lane && car.y > PLAYER_Y - CAR_LENGTH * 3.5 && car.y < PLAYER_Y + CAR_LENGTH);
  const alongside = lane => current.cars.some(car => car.lane === lane && Math.abs(car.y - PLAYER_Y) < CAR_LENGTH * 1.3);
  const reachable = lane => {
    const [from, to] = [Math.min(lane, current.lane), Math.max(lane, current.lane)];
    return lanes.filter(l => l >= from && l <= to && l !== current.lane).every(l => !alongside(l));
  };
  for (let t = 0; t < seconds && current.status === 'playing'; t += 0.05) {
    if (ahead(goal) || !reachable(goal)) {
      const options = lanes.filter(lane => !ahead(lane) && reachable(lane)).sort((a, b) => Math.abs(a - current.lane) - Math.abs(b - current.lane));
      if (options.length) goal = options[0];
    }
    if (goal !== current.lane && current.x === current.lane) current = steer(current, goal - current.lane);
    current = step(current, 0.05);
  }
  return current;
}

test('a new game waits for start and ignores steering until then', () => {
  const game = createGame(1);
  assert.equal(game.status, 'ready');
  assert.equal(steer(game, 1), game);
  assert.equal(step(game, 1), game);
  assert.equal(startGame(game).status, 'playing');
});

test('steering changes lane within the road and the car slides over', () => {
  let game = playing();
  game = steer(game, -1);
  game = steer(game, -1);
  assert.equal(game.lane, 0, 'stops at the left edge');
  game = steer(game, 1);
  assert.equal(game.lane, 1);
  game = step(game, 0.05);
  assert.ok(game.x > 0 && game.x <= 1);
  game = advance(game, 0.2);
  assert.equal(game.x, 1);
  assert.equal(steerToward(game, 3.2).lane, 2, 'taps move one lane at a time');
});

test('distance and speed grow while driving', () => {
  const game = advance(playing(), 0.25);
  assert.ok(game.distance > 5);
  assert.equal(speedFor(0), START_SPEED);
  assert.equal(speedFor(1e6), MAX_SPEED);
});

test('every wave leaves at least one lane open', () => {
  let game = playing(3);
  game = { ...game, distance: 5000 };
  const seen = new Map();
  for (let i = 0; i < 4000 && game.waves < 60; i++) {
    const before = game.waves;
    game = step({ ...game, cars: [], status: 'playing' }, 0.05);
    if (game.waves > before) seen.set(game.waves, new Set(game.cars.map(car => car.lane)).size);
  }
  assert.ok(seen.size >= 50);
  assert.ok([...seen.values()].every(count => count >= 1 && count <= LANES - 1));
});

test('hitting a car ends the run', () => {
  let game = playing();
  game = { ...game, cars: [{ lane: 1, y: PLAYER_Y - CAR_LENGTH - 1, color: 0 }] };
  game = advance(game, 0.25);
  assert.equal(game.status, 'over');
  assert.equal(step(game, 1), game);
  assert.ok(collides({ x: 1 }, { lane: 1, y: PLAYER_Y }));
  assert.ok(!collides({ x: 2 }, { lane: 1, y: PLAYER_Y }));
});

test('coins are collected and add to the score', () => {
  let game = playing();
  game = { ...game, pickups: [{ lane: 1, y: PLAYER_Y - 2 }] };
  game = step(game, 0.05);
  assert.equal(game.coins, 1);
  assert.equal(game.pickups.length, 0);
  assert.equal(score(game), Math.floor(game.distance) + COIN_POINTS);
});

test('a careful driver can keep going through heavy traffic', () => {
  const game = autopilot(playing(11), 90);
  assert.equal(game.status, 'playing', `crashed after ${Math.round(game.distance)} m`);
  assert.ok(game.distance > 2500);
});

test('pause stops the world', () => {
  const paused = pauseGame(advance(playing(), 0.2));
  assert.equal(paused.status, 'paused');
  assert.equal(advance(paused, 1), paused);
  assert.equal(startGame(paused).status, 'playing');
});

test('adalet: ileriye 2,6 sn bakıp tam tarayan bir oyuncu, dalgalar hangi tohumla üretilirse üretilsin çarpmadan ilerleyebilir', () => {
  const STEP = 0.1;
  const HORIZON = 26;
  const escape = start => {
    const failed = new Set();
    const search = (game, depth) => {
      if (game.status !== 'playing') return null;
      if (depth === HORIZON) return [];
      const key = `${depth}:${game.lane}:${Math.round(game.x * 4)}`;
      if (failed.has(key)) return null;
      for (const lane of [game.lane, game.lane - 1, game.lane + 1].filter(value => value >= 0 && value < LANES)) {
        const moved = advance(lane === game.lane ? game : steer(game, lane - game.lane), STEP);
        if (moved.status !== 'playing') continue;
        const rest = search(moved, depth + 1);
        if (rest) return [lane, ...rest];
      }
      failed.add(key);
      return null;
    };
    return search(start, 0);
  };
  for (let seed = 1; seed <= 4; seed += 1) {
    let game = startGame(createGame(seed * 7919));
    while (game.status === 'playing' && game.distance < 3500) {
      const plan = escape(game);
      assert.ok(plan, `seed ${seed}: ${Math.round(game.distance)} m'de kaçış yolu yok (haksız dalga)`);
      game = advance(steer(game, plan[0] - game.lane), STEP);
    }
    assert.equal(game.status, 'playing');
  }
});
