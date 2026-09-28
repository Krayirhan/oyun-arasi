// Balon Patlat — saf oyun mantığı (DOM yok).
// Oyun dalgalar hâlinde akar: her dalgada bir hedef sayı vardır ve yükselen balonlardan YALNIZ BİRİ o sonucu
// verir; geri kalanlar hedefe yakın sonuçlu tuzaklardır. Cevap balonu vurulunca dalga biter, kalan balonlar
// uçup gider ve yeni hedefle yeni dalga başlar. Cevap balonu kaçarsa bir can gider.
// Oyun süre (60 sn; doğru +2, yanlış −2) ya da 3 can bitince sona erer.
// Dart elden fırlar ve nişan alınan noktaya FLIGHT_TIME sonra varır; o anda oradaki balon patlar.

export const WIDTH = 600;
export const HEIGHT = 800;
export const ROUND_SECONDS = 60;
export const MAX_LIVES = 3;
export const BALLOON_RADIUS = 50;
export const LAUNCH_X = WIDTH / 2;
export const LAUNCH_Y = HEIGHT - 54;
export const FLIGHT_TIME = 0.34;
export const CORRECT_BONUS_SECONDS = 2;
export const WRONG_PENALTY_SECONDS = 2;
export const WAVE_PAUSE = 0.7;

const LANES = [70, 185, 300, 415, 530];
export const OPS = ['+', '−', '×', '÷'];

// Dalgaya göre zorluk: açılan işlemler, hedef aralığı, balon sayısı, hız ve çıkış aralığı.
export function levelFor(wave) {
  const ops = wave >= 10 ? ['+', '−', '×', '÷'] : wave >= 7 ? ['+', '−', '×'] : wave >= 4 ? ['+', '−'] : ['+'];
  return {
    ops,
    minTarget: wave >= 7 ? 6 : 4,
    maxTarget: Math.min(60, 10 + wave * 3),
    maxOperand: Math.min(50, 9 + wave * 3),
    count: Math.min(10, 5 + Math.floor(wave / 2)),
    speed: Math.min(96, 46 + wave * 3.2),
    spawnEvery: Math.max(0.36, 0.6 - wave * 0.02)
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

function startWave(game, wave) {
  const level = levelFor(wave);
  game.wave = wave;
  game.target = integer(game, level.minTarget, level.maxTarget);
  const answerIndex = integer(game, 1, level.count - 2);
  const used = new Set([game.target]);
  game.plan = [];
  for (let index = 0; index < level.count; index += 1) {
    if (index === answerIndex) { game.plan.push({ result: game.target, answer: true }); continue; }
    const result = decoyResult(game, game.target, used);
    used.add(result);
    game.plan.push({ result, answer: false });
  }
  game.spawned = 0;
  game.spawnTimer = level.spawnEvery;
  game.answered = false;
  game.waveStartedAt = game.elapsed;
  game.pause = 0;
  game.events.push({ type: 'wave', wave, target: game.target });
}

function spawnNext(game) {
  const level = levelFor(game.wave);
  const item = game.plan[game.spawned];
  game.spawned += 1;
  const equation = makeEquation(game, item.result, level.ops, level.maxOperand);
  // Şerit: son iki balonun şeridinden kaçın, ekranın alt kısmında en boş şeridi seç.
  const busy = LANES.map((_, lane) => game.balloons.filter(balloon => balloon.lane === lane && balloon.y > HEIGHT - 260).length);
  const options = LANES.map((_, lane) => lane).filter(lane => !game.recentLanes.includes(lane));
  const least = Math.min(...options.map(lane => busy[lane]));
  const lane = pick(game, options.filter(lane => busy[lane] === least));
  game.recentLanes = [lane, ...game.recentLanes].slice(0, 2);
  const depth = Math.round((0.84 + random(game) * 0.28) * 100) / 100;
  const radius = Math.round(BALLOON_RADIUS * depth);
  game.balloons.push({
    id: game.nextBalloonId++, wave: game.wave, answer: item.answer, lane,
    x: LANES[lane] + integer(game, -14, 14), y: HEIGHT + radius * .4,
    ...equation, radius, depth,
    color: Math.floor(random(game) * 6), wobble: random(game) * Math.PI * 2
  });
}

export function createGame(seed = Math.floor(Math.random() * 4294967296)) {
  const game = {
    status: 'ready', elapsed: 0, timeLeft: ROUND_SECONDS, score: 0, lives: MAX_LIVES,
    wave: 0, target: 0, combo: 0, bestCombo: 0,
    correctHits: 0, wrongHits: 0, dartsFired: 0, misses: 0, escapes: 0,
    balloons: [], darts: [], aim: { x: LAUNCH_X, y: 300 }, shotCooldown: 0,
    plan: [], spawned: 0, spawnTimer: 0, answered: false, waveStartedAt: 0, pause: 0,
    nextBalloonId: 1, rng: seed >>> 0, recentLanes: [], events: [], endReason: null
  };
  startWave(game, 1);
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

function finishWave(game, success) {
  game.answered = true;
  game.pause = WAVE_PAUSE;
  if (!success) game.events.push({ type: 'waveFail', wave: game.wave });
}

function resolveHit(game, balloon) {
  const event = { type: 'pop', x: balloon.x, y: balloon.y, radius: balloon.radius, color: balloon.color, a: balloon.a, op: balloon.op, b: balloon.b, result: balloon.result };
  if (balloon.wave !== game.wave || game.answered) { game.events.push({ ...event, outcome: 'stale' }); return; }
  if (balloon.answer) {
    game.correctHits += 1;
    game.combo += 1;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    const speedBonus = Math.max(0, Math.round((6 - (game.elapsed - game.waveStartedAt)) * 10));
    const points = 100 * multiplierFor(game.combo) + speedBonus;
    game.score += points;
    game.timeLeft += CORRECT_BONUS_SECONDS;
    game.events.push({ ...event, outcome: 'correct', points });
    finishWave(game, true);
  } else {
    game.wrongHits += 1;
    game.combo = 0;
    game.timeLeft = Math.max(0, game.timeLeft - WRONG_PENALTY_SECONDS);
    game.events.push({ ...event, outcome: 'wrong' });
  }
}

function advanceSlice(game, dt) {
  const next = { ...game, balloons: [...game.balloons], darts: [], recentLanes: [...game.recentLanes] };
  next.elapsed += dt;
  next.timeLeft = Math.max(0, next.timeLeft - dt);
  next.shotCooldown = Math.max(0, next.shotCooldown - dt);

  // Dalga akışı: dalga bitince kısa ara, sonra yeni dalga; dalga sürerken balonlar sırayla çıkar.
  if (next.answered) {
    next.pause -= dt;
    if (next.pause <= 0) startWave(next, next.wave + 1);
  } else if (next.spawned < next.plan.length) {
    const { spawnEvery } = levelFor(next.wave);
    next.spawnTimer += dt;
    while (next.spawned < next.plan.length && next.spawnTimer >= spawnEvery) {
      next.spawnTimer -= spawnEvery;
      spawnNext(next);
    }
  }

  // Balonlar yükselir; biten dalganın balonları hızlanarak ekrandan çıkar.
  next.balloons = next.balloons.map(balloon => {
    const stale = balloon.wave !== next.wave || next.answered;
    const speed = levelFor(balloon.wave).speed * (balloon.depth || 1) * (stale ? 2.4 : 1);
    return { ...balloon, y: balloon.y - speed * dt, wobble: balloon.wobble + dt * 2 };
  });

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

  // Kaçan balonlar: bu dalganın cevabı kaçarsa can gider ve yeni dalgaya geçilir.
  const visible = [];
  for (const balloon of next.balloons) {
    if (balloon.y + balloon.radius * 1.2 >= 0) { visible.push(balloon); continue; }
    if (balloon.answer && balloon.wave === next.wave && !next.answered) {
      next.lives -= 1;
      next.escapes += 1;
      next.combo = 0;
      next.events.push({ type: 'escape', a: balloon.a, op: balloon.op, b: balloon.b, result: balloon.result });
      finishWave(next, false);
    }
  }
  next.balloons = visible;

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
    && Number.isInteger(game.wave) && game.wave >= 1
    && Array.isArray(game.balloons) && game.balloons.every(balloon => Number.isFinite(balloon.x) && Number.isFinite(balloon.y)
      && OPS.includes(balloon.op) && evaluate(balloon.a, balloon.op, balloon.b) === balloon.result)
    && Array.isArray(game.darts));
}
