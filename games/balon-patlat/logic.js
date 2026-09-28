export const WIDTH = 600;
export const HEIGHT = 800;
export const ROUND_SECONDS = 60;
export const MAX_ESCAPES = 3;
export const BALLOON_RADIUS = 50;
export const LAUNCH_X = WIDTH / 2;
export const LAUNCH_Y = HEIGHT - 54;
// Dart elden (ekranın altından) fırlar ve nişan alınan noktaya bu sürede ulaşır; balonlar yükseldiği için
// oyuncunun biraz önden nişan alması gerekir.
export const FLIGHT_TIME = 0.34;
export const HAND_Y = HEIGHT + 30;

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
    correctHits: 0, wrongHits: 0, dartsFired: 0, misses: 0, escapes: 0, events: [],
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

// Elde tek dart vardır: önceki dart hedefe varmadan yenisi atılamaz.
export function fireDart(game) {
  if (game.status !== 'playing' || game.darts.length || game.shotCooldown > 0) return game;
  return {
    ...game,
    dartsFired: game.dartsFired + 1,
    darts: [{ sx: LAUNCH_X, sy: HAND_Y, tx: game.aim.x, ty: game.aim.y, t: 0 }]
  };
}

// Dart vardığı noktada bir balonun içindeyse (yükseklik biraz daha geniş elips) o balon patlar.
function balloonAt(balloons, x, y) {
  let best = null;
  for (const balloon of balloons) {
    const dx = (x - balloon.x) / (balloon.radius * 1.02);
    const dy = (y - balloon.y) / (balloon.radius * 1.12);
    const distance = dx * dx + dy * dy;
    if (distance <= 1 && (!best || distance < best.distance)) best = { balloon, distance };
  }
  return best?.balloon || null;
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
    events: game.events,
    lastHit: game.lastHit && game.lastHit.time > 0 ? { ...game.lastHit, time: game.lastHit.time - dt } : null
  };

  const remainingDarts = [];
  for (const dart of game.darts) {
    const t = dart.t + dt / FLIGHT_TIME;
    if (t < 1) { remainingDarts.push({ ...dart, t }); continue; }
    const hit = balloonAt(next.balloons, dart.tx, dart.ty);
    if (hit) {
      next.balloons = next.balloons.filter(balloon => balloon.id !== hit.id);
      recordHit(next, hit);
      next.events.push({ type: 'pop', correct: hit.result === game.target, x: hit.x, y: hit.y, a: hit.a, b: hit.b, result: hit.result, color: hit.color });
    } else {
      next.misses += 1;
      next.events.push({ type: 'miss', x: dart.tx, y: dart.ty });
    }
    next.shotCooldown = 0.08;
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
  let current = { ...game, events: [] };
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
