// Balon Patlat — saf oyun mantığı (DOM yok).
// Balonlar kesintisiz yükselir; üstte bir hedef sayı vardır. Hedefi veren balonu vurunca hedef hemen değişir:
// yeni cevap çoğu zaman ekranda zaten uçan balonlardan biridir ya da birkaç balon sonra rastgele bir sırada gelir,
// hiçbir zaman "hemen en alttan çıkan" balon değildir. Yeni çıkan balonlar hedefe yakın sonuçlu tuzaklardır.
// Oyun süre (60 sn; doğru +1, yanlış −2) ya da 3 can bitince sona erer; hedefi veren balon kaçarsa can gider.
// Dart elden fırlar ve nişan alınan noktaya FLIGHT_TIME sonra varır; o anda oradaki balon patlar.

export const WIDTH = 600;
export const HEIGHT = 800;
export const ROUND_SECONDS = 60;
export const MAX_LIVES = 3;
export const BALLOON_RADIUS = 50;
export const LAUNCH_X = WIDTH / 2;
export const LAUNCH_Y = HEIGHT - 54;
export const FLIGHT_TIME = 0.34;
export const CORRECT_BONUS_SECONDS = 1;
export const WRONG_PENALTY_SECONDS = 2;

const LANES = [70, 185, 300, 415, 530];
export const OPS = ['+', '−', '×', '÷'];

// Seviye doğru sayısıyla artar (her 2 doğruda bir): açılan işlemler, hedef aralığı, hız ve çıkış aralığı.
export const levelOf = correctHits => 1 + Math.floor(correctHits / 2);

export function levelFor(level) {
  const ops = level >= 10 ? ['+', '−', '×', '÷'] : level >= 7 ? ['+', '−', '×'] : level >= 4 ? ['+', '−'] : ['+'];
  return {
    ops,
    minTarget: level >= 7 ? 6 : 4,
    maxTarget: Math.min(60, 10 + level * 3),
    maxOperand: Math.min(50, 9 + level * 3),
    speed: Math.min(96, 46 + level * 3.2),
    spawnEvery: Math.max(0.42, 0.72 - level * 0.025)
  };
}

function random(game) {
  game.rng = (Math.imul(game.rng, 1664525) + 1013904223) >>> 0;
  return game.rng / 4294967296;
}
const integer = (game, min, max) => min + Math.floor(random(game) * (max - min + 1));
const pick = (game, list) => list[Math.floor(random(game) * list.length)];

export function evaluate(a, op, b) {
  if (op === '+') return a + b;
  if (op === '−') return a - b;
  if (op === '×') return a * b;
  return b !== 0 && a % b === 0 ? a / b : NaN;
}

// Sonucu `result` olan bir işlem üretir; açık işlemlerden rastgele biri seçilir, olmuyorsa sıradakine geçilir.
export function makeEquation(game, result, ops, maxOperand = 20) {
  const order = [...ops];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random(game) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const op of order) {
    if (op === '+' && result >= 2) {
      const a = integer(game, Math.max(1, result - maxOperand), Math.min(result - 1, maxOperand));
      if (a >= 1 && result - a >= 1) return { a, op, b: result - a, result };
    }
    if (op === '−') {
      const b = integer(game, 1, Math.max(1, Math.min(maxOperand, 20)));
      return { a: result + b, op, b, result };
    }
    if (op === '×') {
      const pairs = [];
      for (let a = 2; a <= 10; a += 1) if (result % a === 0 && result / a >= 2 && result / a <= 10) pairs.push([a, result / a]);
      if (pairs.length) { const [a, b] = pick(game, pairs); return { a, op, b, result }; }
    }
    if (op === '÷' && result >= 1 && result <= 12) {
      const b = integer(game, 2, 9);
      return { a: result * b, op, b, result };
    }
  }
  const a = Math.max(1, Math.floor(result / 2));
  return { a, op: '+', b: result - a, result };
}

function decoyResult(game, target, used) {
  const spread = target > 20 ? [1, 2, 3, 4, 5, 10] : [1, 2, 3, 4];
  for (let tries = 0; tries < 40; tries += 1) {
    const value = target + pick(game, spread) * (random(game) < .5 ? -1 : 1);
    if (value >= 1 && value !== target && !used.has(value)) return value;
  }
  let value = target + 1;
  while (used.has(value)) value += 1;
  return value;
}

const onScreen = (game, result) => game.balloons.some(balloon => balloon.result === result && balloon.y < HEIGHT - 40);

// Sıradaki çıkışlar: hedefe yakın tuzaklar; ekranda cevap yoksa 2.–4. sıraya bir cevap yerleştirilir.
function planQueue(game) {
  const used = new Set([game.target]);
  game.queue = Array.from({ length: 6 }, () => {
    const result = decoyResult(game, game.target, used);
    used.add(result);
    return result;
  });
  if (!onScreen(game, game.target)) game.queue[integer(game, 1, 3)] = game.target;
}

// Yeni hedef: çoğu zaman ekranın ortasında uçan balonlardan birinin sonucu; değilse yeni bir sayı.
function chooseTarget(game) {
  const level = levelFor(levelOf(game.correctHits));
  const previous = game.target;
  const visible = game.balloons.filter(balloon => balloon.y > 330 && balloon.y < HEIGHT - 200 && balloon.result !== previous);
  if (visible.length && random(game) < .65) game.target = pick(game, visible).result;
  else {
    let value = previous;
    for (let tries = 0; tries < 20 && value === previous; tries += 1) value = integer(game, level.minTarget, level.maxTarget);
    game.target = value;
  }
  game.targetSetAt = game.elapsed;
  planQueue(game);
}

function spawnNext(game) {
  const level = levelFor(levelOf(game.correctHits));
  if (!game.queue.length) planQueue(game);
  const result = game.queue.shift();
  // Ekranda ve sırada cevap kalmadıysa, hemen bir sonraki değil 1–3 balon sonrasına bir cevap koy.
  if (!game.queue.includes(game.target) && !onScreen(game, game.target) && result !== game.target) {
    game.queue.splice(integer(game, 1, Math.min(3, game.queue.length)), 0, game.target);
  }
  if (game.queue.length < 3) {
    const used = new Set([game.target, ...game.queue]);
    while (game.queue.length < 6) { const decoy = decoyResult(game, game.target, used); used.add(decoy); game.queue.push(decoy); }
  }
  const equation = makeEquation(game, result, level.ops, level.maxOperand);
  // Şerit: son iki balonun şeridinden kaçın, ekranın alt kısmında en boş şeridi seç.
  const busy = LANES.map((_, lane) => game.balloons.filter(balloon => balloon.lane === lane && balloon.y > HEIGHT - 260).length);
  const options = LANES.map((_, lane) => lane).filter(lane => !game.recentLanes.includes(lane));
  const least = Math.min(...options.map(lane => busy[lane]));
  const lane = pick(game, options.filter(lane => busy[lane] === least));
  game.recentLanes = [lane, ...game.recentLanes].slice(0, 2);
  const depth = Math.round((0.84 + random(game) * 0.28) * 100) / 100;
  const radius = Math.round(BALLOON_RADIUS * depth);
  game.balloons.push({
    id: game.nextBalloonId++, lane, x: LANES[lane] + integer(game, -14, 14), y: HEIGHT + radius * .4,
    ...equation, radius, depth, color: Math.floor(random(game) * 6), wobble: random(game) * Math.PI * 2
  });
}

export function createGame(seed = Math.floor(Math.random() * 4294967296)) {
  const game = {
    status: 'ready', elapsed: 0, timeLeft: ROUND_SECONDS, score: 0, lives: MAX_LIVES,
    target: 0, targetSetAt: 0, combo: 0, bestCombo: 0,
    correctHits: 0, wrongHits: 0, dartsFired: 0, misses: 0, escapes: 0,
    balloons: [], darts: [], aim: { x: LAUNCH_X, y: 300 }, shotCooldown: 0,
    queue: [], spawnTimer: 0, nextBalloonId: 1, rng: seed >>> 0, recentLanes: [], events: [], endReason: null
  };
  const level = levelFor(1);
  game.target = integer(game, level.minTarget, level.maxTarget);
  planQueue(game);
  game.spawnTimer = level.spawnEvery;
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
  return { ...game, dartsFired: game.dartsFired + 1, darts: [{ tx: game.aim.x, ty: game.aim.y, t: 0 }] };
}

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

export const multiplierFor = combo => Math.min(5, 1 + Math.floor(combo / 3));

function resolveHit(game, balloon) {
  const event = { type: 'pop', x: balloon.x, y: balloon.y, radius: balloon.radius, color: balloon.color, a: balloon.a, op: balloon.op, b: balloon.b, result: balloon.result };
  if (balloon.result === game.target) {
    const levelBefore = levelOf(game.correctHits);
    game.correctHits += 1;
    game.combo += 1;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    const speedBonus = Math.max(0, Math.round((6 - (game.elapsed - game.targetSetAt)) * 10));
    const points = 100 * multiplierFor(game.combo) + speedBonus;
    game.score += points;
    game.timeLeft += CORRECT_BONUS_SECONDS;
    game.events.push({ ...event, outcome: 'correct', points });
    chooseTarget(game);
    const level = levelOf(game.correctHits);
    if (level > levelBefore) {
      const opened = levelFor(level).ops.find(op => !levelFor(levelBefore).ops.includes(op));
      game.events.push({ type: 'level', level, op: opened || null });
    }
  } else {
    game.wrongHits += 1;
    game.combo = 0;
    game.timeLeft = Math.max(0, game.timeLeft - WRONG_PENALTY_SECONDS);
    game.events.push({ ...event, outcome: 'wrong' });
  }
}

function advanceSlice(game, dt) {
  const next = { ...game, balloons: [...game.balloons], darts: [], queue: [...game.queue], recentLanes: [...game.recentLanes] };
  next.elapsed += dt;
  next.timeLeft = Math.max(0, next.timeLeft - dt);
  next.shotCooldown = Math.max(0, next.shotCooldown - dt);
  const level = levelFor(levelOf(next.correctHits));

  // Kesintisiz çıkış
  next.spawnTimer += dt;
  while (next.spawnTimer >= level.spawnEvery) {
    next.spawnTimer -= level.spawnEvery;
    if (next.balloons.length < 10) spawnNext(next);
    else if (!onScreen(next, next.target) && next.queue.includes(next.target)) {
      // Ekran doluyken cevap sırada beklemesin: tuzakları atlayıp cevabı çıkar.
      next.queue = [next.target, ...next.queue.filter(result => result !== next.target)];
      spawnNext(next);
    }
  }

  next.balloons = next.balloons.map(balloon => ({ ...balloon, y: balloon.y - level.speed * (balloon.depth || 1) * dt, wobble: balloon.wobble + dt * 2 }));

  // Dart varışı: vardığı noktadaki balon patlar
  for (const dart of game.darts) {
    const t = dart.t + dt / FLIGHT_TIME;
    if (t < 1) { next.darts.push({ ...dart, t }); continue; }
    const hit = balloonAt(next.balloons, dart.tx, dart.ty);
    if (hit) {
      next.balloons = next.balloons.filter(balloon => balloon.id !== hit.id);
      resolveHit(next, hit);
    } else {
      next.misses += 1;
      next.events.push({ type: 'miss', x: dart.tx, y: dart.ty });
    }
    next.shotCooldown = 0.08;
  }

  // Kaçan balonlar: hedefi veren balon kaçarsa can gider ve hedef değişir.
  const visible = [];
  let lost = null;
  for (const balloon of next.balloons) {
    if (balloon.y + balloon.radius * 1.2 >= 0) visible.push(balloon);
    else if (balloon.result === next.target && !lost) lost = balloon;
  }
  next.balloons = visible;
  if (lost) {
    next.lives -= 1;
    next.escapes += 1;
    next.combo = 0;
    next.events.push({ type: 'escape', a: lost.a, op: lost.op, b: lost.b, result: lost.result });
    chooseTarget(next);
  }

  if (next.lives <= 0) { next.status = 'over'; next.endReason = 'lives'; }
  else if (next.timeLeft <= 0) { next.status = 'over'; next.endReason = 'time'; }
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

export const labelOf = balloon => `${balloon.a} ${balloon.op} ${balloon.b}`;

export function isValidGame(game) {
  return Boolean(game && typeof game === 'object' && ['ready', 'playing', 'paused', 'over'].includes(game.status)
    && Number.isFinite(game.timeLeft) && game.timeLeft >= 0
    && Number.isInteger(game.score) && game.score >= 0
    && Number.isInteger(game.lives) && game.lives >= 0 && game.lives <= MAX_LIVES
    && Array.isArray(game.balloons) && game.balloons.every(balloon => Number.isFinite(balloon.x) && Number.isFinite(balloon.y)
      && OPS.includes(balloon.op) && evaluate(balloon.a, balloon.op, balloon.b) === balloon.result)
    && Array.isArray(game.darts));
}
