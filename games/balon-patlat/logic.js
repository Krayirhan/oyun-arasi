export const WIDTH = 600;
export const HEIGHT = 900;
export const ROUND_SECONDS = 60;
export const MAX_ESCAPES = 3;
export const BALLOON_RADIUS = 48;
export const LAUNCH_X = WIDTH / 2;
export const LAUNCH_Y = HEIGHT - 54;

const COLUMNS = [62, 181, 300, 419, 538];
const LEVELS = [
  { maxOperand: 9, speed: 28, spawnEvery: 1.9 },
  { maxOperand: 20, speed: 40, spawnEvery: 1.55 },
  { maxOperand: 50, speed: 54, spawnEvery: 1.25 }
];

export function stageFor(correctHits) {
  return correctHits < 8 ? 1 : correctHits < 20 ? 2 : 3;
}

function random(game) {
  game.rng = (Math.imul(game.rng, 1664525) + 1013904223) >>> 0;
  return game.rng / 4294967296;
}

function integer(game, min, max) {
  return min + Math.floor(random(game) * (max - min + 1));
}

function chooseTarget(game) {
  const { maxOperand } = LEVELS[stageFor(game.correctHits) - 1];
  let a;
  let b;
  let result;
  do {
    a = integer(game, 1, maxOperand);
    b = integer(game, 1, maxOperand);
    result = a + b;
  } while (result === game.target && maxOperand > 2);
  game.target = result;
  return { a, b, result };
}

function nextColumn(game) {
  const counts = COLUMNS.map((_, lane) => game.balloons.filter(balloon => balloon.lane === lane).length);
  const least = Math.min(...counts);
  const choices = counts.map((count, lane) => count === least ? lane : -1).filter(lane => lane >= 0);
  return choices[Math.floor(random(game) * choices.length)];
}

function addBalloon(game, { correct = false, y = correct ? HEIGHT - 120 : HEIGHT + BALLOON_RADIUS } = {}) {
  const { maxOperand } = LEVELS[stageFor(game.correctHits) - 1];
  let a;
  let b;
  let result;
  let tries = 0;
  do {
    a = integer(game, 1, maxOperand);
    b = integer(game, 1, maxOperand);
    result = a + b;
    tries += 1;
  } while ((correct ? result !== game.target : result === game.target) && tries < 500);
  if (correct && result !== game.target) {
    a = Math.max(1, Math.min(maxOperand, Math.floor(game.target / 2)));
    b = game.target - a;
    if (b < 1 || b > maxOperand) { a = 1; b = game.target - 1; }
    result = a + b;
  }
  const lane = nextColumn(game);
  game.balloons.push({ id: game.nextBalloonId++, lane, x: COLUMNS[lane], y, a, b, result, radius: BALLOON_RADIUS,
    color: Math.floor(random(game) * 5), wobble: random(game) * Math.PI * 2 });
}

function equation(game) {
  const { maxOperand } = LEVELS[stageFor(game.correctHits) - 1];
  let a = integer(game, 1, maxOperand);
  let b = integer(game, 1, maxOperand);
  let result = a + b;
  for (let i = 0; result === game.target && i < 100; i += 1) {
    a = integer(game, 1, maxOperand);
    b = integer(game, 1, maxOperand);
    result = a + b;
  }
  return { a, b, result };
}

export function createGame(seed = Math.floor(Math.random() * 4294967296)) {
  const game = {
    status: 'ready', elapsed: 0, score: 0, target: 0, combo: 0, bestCombo: 0,
    correctHits: 0, wrongHits: 0, dartsFired: 0, escapes: 0,
    balloons: [], darts: [], aim: { x: LAUNCH_X, y: 180 },
    spawnTimer: 0, shotCooldown: 0, nextBalloonId: 1,
    rng: seed >>> 0,
    lastHit: null,
    soundOn: false
  };
  const correct = chooseTarget(game);
  addBalloon(game, { correct: false, y: 550 });
  game.balloons[0] = { ...game.balloons[0], ...correct };
  game.balloons[0].result = correct.result;
  for (const y of [650, 750, 850, 950]) addBalloon(game, { y });
  return game;
}

export function startGame(game) {
  return game.status === 'ready' || game.status === 'paused' ? { ...game, status: 'playing' } : game;
}

export function pauseGame(game) {
  return game.status === 'playing' ? { ...game, status: 'paused' } : game;
}

export function aimAt(game, x, y) {
  if (game.status !== 'playing') return game;
  return { ...game, aim: { x: Math.max(0, Math.min(WIDTH, x)), y: Math.max(40, Math.min(LAUNCH_Y - 20, y)) } };
}

export function fireDart(game) {
  if (game.status !== 'playing' || game.shotCooldown > 0) return game;
  const dx = game.aim.x - LAUNCH_X;
  const dy = Math.min(game.aim.y, LAUNCH_Y - 20) - LAUNCH_Y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    ...game,
    dartsFired: game.dartsFired + 1,
    shotCooldown: 0.32,
    darts: [...game.darts, { x: LAUNCH_X, y: LAUNCH_Y, vx: dx / length * 1120, vy: dy / length * 1120, life: 1.4 }]
  };
}

function segmentHit(dart, end, balloon) {
  const dx = end.x - dart.x;
  const dy = end.y - dart.y;
  const length2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((balloon.x - dart.x) * dx + (balloon.y - dart.y) * dy) / length2));
  const x = dart.x + dx * t;
  const y = dart.y + dy * t;
  return (balloon.x - x) ** 2 + (balloon.y - y) ** 2 <= (balloon.radius + 5) ** 2 ? t : null;
}

function recordHit(game, balloon) {
  if (balloon.result === game.target) {
    game.correctHits += 1;
    game.combo += 1;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    const multiplier = Math.min(5, 1 + Math.floor(game.combo / 3));
    game.score += 100 * multiplier;
    const next = chooseTarget(game);
    addBalloon(game, { correct: true });
    game.lastHit = { kind: 'correct', text: `+${100 * multiplier}`, answer: next.result };
  } else {
    game.wrongHits += 1;
    game.combo = 0;
    game.lastHit = { kind: 'wrong', text: 'Tekrar dene', answer: balloon.result };
  }
}

function advanceSlice(game, dt) {
  const next = {
    ...game,
    elapsed: Math.min(ROUND_SECONDS, game.elapsed + dt),
    shotCooldown: Math.max(0, game.shotCooldown - dt),
    spawnTimer: game.spawnTimer + dt,
    balloons: game.balloons.map(balloon => ({ ...balloon, y: balloon.y - LEVELS[stageFor(game.correctHits) - 1].speed * dt, wobble: balloon.wobble + dt * 2 })),
    darts: [],
    lastHit: game.lastHit && game.lastHit.time > 0 ? { ...game.lastHit, time: game.lastHit.time - dt } : null
  };

  const remainingDarts = [];
  for (const dart of game.darts) {
    const end = { x: dart.x + dart.vx * dt, y: dart.y + dart.vy * dt };
    let hit = null;
    for (const balloon of next.balloons) {
      const t = segmentHit(dart, end, balloon);
      if (t !== null && (!hit || t < hit.t)) hit = { balloon, t };
    }
    if (hit) {
      next.balloons = next.balloons.filter(balloon => balloon.id !== hit.balloon.id);
      recordHit(next, hit.balloon);
      if (next.lastHit) next.lastHit.time = 0.8;
    } else if (dart.life - dt > 0 && end.y > -40 && end.x > -80 && end.x < WIDTH + 80) {
      remainingDarts.push({ ...dart, ...end, life: dart.life - dt });
    }
  }
  next.darts = remainingDarts;

  const visible = [];
  for (const balloon of next.balloons) {
    if (balloon.y + balloon.radius < 0) next.escapes += 1;
    else visible.push(balloon);
  }
  next.balloons = visible;
  if (next.escapes < MAX_ESCAPES && !next.balloons.some(balloon => balloon.result === next.target)) addBalloon(next, { correct: true });

  const { spawnEvery } = LEVELS[stageFor(next.correctHits) - 1];
  while (next.spawnTimer >= spawnEvery) {
    next.spawnTimer -= spawnEvery;
    if (next.balloons.length < 18) {
      const item = equation(next);
      addBalloon(next, { y: HEIGHT + BALLOON_RADIUS });
      Object.assign(next.balloons[next.balloons.length - 1], item);
    }
  }
  if (next.elapsed >= ROUND_SECONDS || next.escapes >= MAX_ESCAPES) next.status = 'over';
  if (next.escapes >= MAX_ESCAPES) next.endReason = 'escapes';
  else if (next.elapsed >= ROUND_SECONDS) next.endReason = 'time';
  return next;
}

export function advance(game, seconds) {
  let current = game;
  let remaining = Math.max(0, Math.min(seconds, 0.25));
  while (remaining > 0 && current.status === 'playing') {
    const dt = Math.min(remaining, 0.05);
    current = advanceSlice(current, dt);
    remaining -= dt;
  }
  return current;
}

export function isValidGame(game) {
  return Boolean(game && typeof game === 'object' && ['ready', 'playing', 'paused', 'over'].includes(game.status)
    && Number.isFinite(game.elapsed) && game.elapsed >= 0 && game.elapsed <= ROUND_SECONDS
    && Number.isInteger(game.target) && game.target >= 2 && game.target <= 100
    && Number.isInteger(game.score) && game.score >= 0
    && Number.isInteger(game.escapes) && game.escapes >= 0 && game.escapes <= MAX_ESCAPES
    && Number.isInteger(game.correctHits) && game.correctHits >= 0
    && Array.isArray(game.balloons) && game.balloons.every(balloon => Number.isFinite(balloon.x) && Number.isFinite(balloon.y)
      && Number.isInteger(balloon.a) && balloon.a > 0 && Number.isInteger(balloon.b) && balloon.b > 0 && balloon.a + balloon.b === balloon.result)
    && Array.isArray(game.darts));
}
