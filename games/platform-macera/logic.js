// Zıpkın: Volkana Yolculuk — tile tabanlı, sabit adımlı platform fiziği. Çizim ve ses yok; olaylar `run.events` kuyruğuna yazılır.
// Performans için `tick` durumu yerinde değiştirir; testler bu dosyayı doğrudan Node'da çalıştırır.
import { LEVELS, TILE, T } from './levels.js?v=202609272122';

export const LEVEL_COUNT = LEVELS.length;
export const PLAYER_W = 20;
export const PLAYER_H = 26;
export const STEP = 1 / 120;

// Hissiyat sabitleri: px ve saniye.
export const FEEL = {
  runSpeed: 330, groundAccel: 3200, groundFriction: 3600, airAccel: 2400, airFriction: 1300, overSpeedDecel: 900,
  jumpSpeed: 620, gravityUp: 1700, gravityDown: 2600, apexThreshold: 70, apexGravityScale: 0.5, jumpCut: 0.45,
  maxFall: 900, fastFall: 1150, coyote: 0.09, jumpBuffer: 0.12, cornerNudge: 7,
  wallSlide: 140, wallJumpX: 360, wallJumpY: 600, wallJumpLock: 0.14, wallCoyote: 0.08,
  dashSpeed: 720, dashTime: 0.15, dashBuffer: 0.08, dashFreeze: 0.035, dashEndUpScale: 0.5,
  springSpeed: 900, stompBounce: 520, respawnDelay: 0.35, crumbleDelay: 0.42, crumbleReturn: 2.2, orbReturn: 2.4
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const approach = (value, target, amount) => value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
const overlap = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

// ---------------------------------------------------------------- kampanya
export function createCampaign() {
  return { v: 2, furthestLevel: 1, completed: [], stars: {}, bestScores: {}, bestTimes: {} };
}

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function isValidCampaign(value) {
  return Boolean(value && value.v === 2 && Number.isInteger(value.furthestLevel) && value.furthestLevel >= 1 && value.furthestLevel <= LEVEL_COUNT
    && Array.isArray(value.completed) && value.completed.every(n => Number.isInteger(n) && n >= 1 && n <= LEVEL_COUNT)
    && isRecord(value.stars) && isRecord(value.bestScores) && (value.bestTimes === undefined || isRecord(value.bestTimes)));
}

export function mergeCampaigns(a, b) {
  const left = isValidCampaign(a) ? a : createCampaign();
  const right = isValidCampaign(b) ? b : createCampaign();
  const merged = createCampaign();
  merged.furthestLevel = Math.max(left.furthestLevel, right.furthestLevel);
  merged.completed = [...new Set([...left.completed, ...right.completed])].sort((x, y) => x - y);
  for (let n = 1; n <= LEVEL_COUNT; n += 1) {
    const stars = Math.max(Number(left.stars[n]) || 0, Number(right.stars[n]) || 0);
    const score = Math.max(Number(left.bestScores[n]) || 0, Number(right.bestScores[n]) || 0);
    const times = [left.bestTimes?.[n], right.bestTimes?.[n]].filter(t => Number.isFinite(t) && t > 0);
    if (stars) merged.stars[n] = clamp(stars, 0, 3);
    if (score) merged.bestScores[n] = score;
    if (times.length) merged.bestTimes[n] = Math.min(...times);
  }
  return merged;
}

export function campaignStats(campaign) {
  const safe = isValidCampaign(campaign) ? campaign : createCampaign();
  return {
    furthestLevel: safe.furthestLevel,
    completedLevels: safe.completed.length,
    totalStars: Object.values(safe.stars).reduce((sum, value) => sum + clamp(Number(value) || 0, 0, 3), 0),
    bestScore: Math.max(0, ...Object.values(safe.bestScores).filter(Number.isFinite))
  };
}

export function finishCampaign(campaign, result) {
  const safe = isValidCampaign(campaign) ? campaign : createCampaign();
  const n = result.level;
  const next = {
    v: 2,
    furthestLevel: Math.min(LEVEL_COUNT, Math.max(safe.furthestLevel, n + 1)),
    completed: [...safe.completed, n],
    stars: { ...safe.stars, [n]: result.stars },
    bestScores: { ...safe.bestScores, [n]: result.score },
    bestTimes: { ...safe.bestTimes, [n]: result.time }
  };
  return mergeCampaigns(safe, next);
}

export function levelResult(run) {
  const level = LEVELS[run.level - 1];
  const gems = run.gems.filter(Boolean).length;
  const time = Math.round(run.time * 100) / 100;
  const underPar = run.time <= level.par;
  const stars = 1 + Number(gems === level.gems.length) + Number(underPar);
  const score = Math.max(100, Math.round(1000 + gems * 250 + Math.max(0, level.par - run.time) * 20 - run.deaths * 25));
  return { level: run.level, gems, time, deaths: run.deaths, stars, score, underPar, par: level.par };
}

// ---------------------------------------------------------------- tile yardımcıları
function tileAt(level, tx, ty) {
  if (tx < 0 || tx >= level.cols) return T.SOLID;
  if (ty < 0 || ty >= level.rows) return T.EMPTY;
  return level.grid[ty * level.cols + tx];
}

function isSolid(run, level, tx, ty) {
  const tile = tileAt(level, tx, ty);
  if (tile === T.SOLID || tile === T.STATUE) return true;
  if (tile === T.CRUMBLE) return run.crumbles[level.crumbleIndex[ty * level.cols + tx]].state !== 'gone';
  return false;
}

function rectHitsSolid(run, level, x, y, w, h) {
  const x0 = Math.floor(x / TILE); const x1 = Math.floor((x + w - 0.001) / TILE);
  const y0 = Math.floor(y / TILE); const y1 = Math.floor((y + h - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty += 1) for (let tx = x0; tx <= x1; tx += 1) if (isSolid(run, level, tx, ty)) return true;
  return false;
}

// ---------------------------------------------------------------- run
export function createRun(levelNumber = 1) {
  const level = LEVELS[clamp(levelNumber, 1, LEVEL_COUNT) - 1];
  const run = {
    level: level.number, status: 'playing', time: 0, deaths: 0, events: [],
    x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, facing: 1,
    grounded: false, wasGrounded: false, coyote: 0, jumpBuffer: 0, canCut: false,
    wallDir: 0, lastWallDir: 0, wallCoyote: 0, inputLock: 0,
    dashes: 1, dashTime: 0, dashBuffer: 0, dashDx: 0, dashDy: 0, freeze: 0,
    standing: -1, deathTimer: 0, sinceSpawn: 0,
    gems: level.gems.map(() => false), checkpoint: -1,
    crumbles: level.crumbles.map(() => ({ state: 'solid', timer: 0 })),
    orbs: level.orbs.map(() => 0),
    movers: level.movers.map(m => ({ x: m.x, y: m.y, dx: 0, dy: 0 })),
    saws: level.saws.map(s => ({ x: s.x, y: s.y })),
    enemies: level.enemies.map(e => ({ ...e, alive: true, vx: e.kind === 'walker' ? -60 : 0, baseY: e.y })),
    fireballs: [], statueTimers: level.statues.map((s, i) => 0.6 + i * 0.37),
    lavaY: level.rising ? level.rising.startY : Infinity
  };
  placeAt(run, level.spawn);
  updateMovers(run, level, 0, true);
  return run;
}

function placeAt(run, point) {
  run.x = point.x - PLAYER_W / 2; run.y = point.y - PLAYER_H;
  run.prevX = run.x; run.prevY = run.y; run.vx = 0; run.vy = 0;
}

function emit(run, type, extra = {}) {
  run.events.push({ type, x: run.x + PLAYER_W / 2, y: run.y + PLAYER_H / 2, ...extra });
}

function die(run) {
  if (run.status !== 'playing') return;
  run.status = 'dying'; run.deathTimer = FEEL.respawnDelay; run.deaths += 1; run.dashTime = 0;
  emit(run, 'die');
}

function respawn(run, level) {
  const point = run.checkpoint >= 0 ? level.checkpoints[run.checkpoint] : level.spawn;
  placeAt(run, point);
  Object.assign(run, { status: 'playing', dashes: 1, dashTime: 0, dashBuffer: 0, jumpBuffer: 0, coyote: 0, canCut: false,
    inputLock: 0, wallDir: 0, wallCoyote: 0, standing: -1, grounded: false, freeze: 0, sinceSpawn: 0 });
  run.crumbles.forEach(c => { c.state = 'solid'; c.timer = 0; });
  run.orbs.fill(0);
  run.fireballs.length = 0;
  if (level.rising) run.lavaY = Math.min(level.rising.startY, point.y + level.rising.gap);
  emit(run, 'respawn');
}

function updateMovers(run, level, time, snap = false) {
  level.movers.forEach((def, i) => {
    const phase = (time / def.period + def.offset) % 1;
    const t = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
    const nx = def.x + def.dx * t; const ny = def.y + def.dy * t;
    const m = run.movers[i];
    m.dx = snap ? 0 : nx - m.x; m.dy = snap ? 0 : ny - m.y; m.x = nx; m.y = ny;
  });
  level.saws.forEach((def, i) => {
    if (!def.period) return;
    const phase = (time / def.period + def.offset) % 1;
    const t = def.loop ? phase : 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
    if (def.loop) { run.saws[i].x = def.x + Math.cos(t * Math.PI * 2) * def.dx; run.saws[i].y = def.y + Math.sin(t * Math.PI * 2) * def.dy; }
    else { run.saws[i].x = def.x + def.dx * t; run.saws[i].y = def.y + def.dy * t; }
  });
}

export function geyserActive(g, time) {
  const phase = ((time + g.offset) % g.period + g.period) % g.period;
  return phase < g.active ? 'on' : phase > g.period - 0.45 ? 'warn' : 'off';
}

// ---------------------------------------------------------------- hareket
function moveX(run, level, dx) {
  if (!dx) return;
  run.x += dx;
  const y0 = Math.floor(run.y / TILE); const y1 = Math.floor((run.y + PLAYER_H - 0.001) / TILE);
  if (dx > 0) {
    const tx = Math.floor((run.x + PLAYER_W - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty += 1) if (isSolid(run, level, tx, ty)) { run.x = tx * TILE - PLAYER_W; if (run.dashTime <= 0) run.vx = Math.min(run.vx, 0); return; }
  } else {
    const tx = Math.floor(run.x / TILE);
    for (let ty = y0; ty <= y1; ty += 1) if (isSolid(run, level, tx, ty)) { run.x = (tx + 1) * TILE; if (run.dashTime <= 0) run.vx = Math.max(run.vx, 0); return; }
  }
}

function moveY(run, level, dy) {
  if (!dy) return;
  const prevBottom = run.y + PLAYER_H;
  run.y += dy;
  const x0 = Math.floor(run.x / TILE); const x1 = Math.floor((run.x + PLAYER_W - 0.001) / TILE);
  if (dy > 0) {
    const ty = Math.floor((run.y + PLAYER_H - 0.001) / TILE);
    const top = ty * TILE;
    for (let tx = x0; tx <= x1; tx += 1) {
      const tile = tileAt(level, tx, ty);
      if (isSolid(run, level, tx, ty) || (tile === T.ONEWAY && prevBottom <= top + 0.5)) { land(run, level, top, -1, tx, ty); return; }
    }
    for (let i = 0; i < run.movers.length; i += 1) {
      const m = run.movers[i]; const def = level.movers[i];
      if (prevBottom <= m.y + 0.5 && run.y + PLAYER_H >= m.y && run.x + PLAYER_W > m.x && run.x < m.x + def.w) { land(run, level, m.y, i); return; }
    }
  } else {
    const ty = Math.floor(run.y / TILE);
    let blocked = false;
    for (let tx = x0; tx <= x1; tx += 1) if (isSolid(run, level, tx, ty)) blocked = true;
    if (!blocked) return;
    // Köşe düzeltmesi: başın kenarı birkaç piksel takıldıysa yana kaydır.
    for (let nudge = 1; nudge <= FEEL.cornerNudge; nudge += 1) {
      for (const dir of [1, -1]) {
        if (!rectHitsSolid(run, level, run.x + nudge * dir, run.y, PLAYER_W, PLAYER_H)) { run.x += nudge * dir; return; }
      }
    }
    run.y = (ty + 1) * TILE;
    if (run.vy < 0) run.vy = 0;
    if (run.dashTime > 0 && run.dashDy < 0) run.dashTime = 0;
  }
}

function land(run, level, top, moverIndex, tx, ty) {
  run.y = top - PLAYER_H;
  if (run.dashTime > 0 && run.dashDy > 0) run.dashTime = 0;
  if (run.dashTime <= 0) run.vy = 0;
  run.grounded = true; run.standing = moverIndex;
  if (tx !== undefined && tileAt(level, tx, ty) === T.CRUMBLE) {
    const crumble = run.crumbles[level.crumbleIndex[ty * level.cols + tx]];
    if (crumble.state === 'solid') { crumble.state = 'shaking'; crumble.timer = FEEL.crumbleDelay; run.events.push({ type: 'crumble', x: tx * TILE + TILE / 2, y: ty * TILE }); }
  }
}

function updateWalls(run, level) {
  const y0 = Math.floor((run.y + 3) / TILE); const y1 = Math.floor((run.y + PLAYER_H - 4) / TILE);
  const left = Math.floor((run.x - 1) / TILE); const right = Math.floor((run.x + PLAYER_W + 1) / TILE);
  let dir = 0;
  for (let ty = y0; ty <= y1; ty += 1) {
    if (isSolid(run, level, right, ty)) dir = 1;
    else if (isSolid(run, level, left, ty)) dir = -1;
  }
  run.wallDir = run.grounded ? 0 : dir;
  if (run.wallDir) { run.lastWallDir = run.wallDir; run.wallCoyote = FEEL.wallCoyote; }
}

// ---------------------------------------------------------------- tick
export function tick(run, input, dt = STEP) {
  if (!run) return run;
  const level = LEVELS[run.level - 1];
  if (run.status === 'dying') {
    run.time += dt; run.deathTimer -= dt;
    updateWorld(run, level, dt);
    if (run.deathTimer <= 0) respawn(run, level);
    return run;
  }
  if (run.status !== 'playing') return run;
  if (input.jumpPressed) run.jumpBuffer = FEEL.jumpBuffer;
  if (input.dashPressed) run.dashBuffer = FEEL.dashBuffer;
  if (run.freeze > 0) { run.freeze -= dt; return run; }

  run.time += dt; run.sinceSpawn += dt;
  run.prevX = run.x; run.prevY = run.y;
  run.wasGrounded = run.grounded;
  run.jumpBuffer = Math.max(0, run.jumpBuffer - dt);
  run.dashBuffer = Math.max(0, run.dashBuffer - dt);
  run.coyote = run.grounded ? FEEL.coyote : Math.max(0, run.coyote - dt);
  run.wallCoyote = Math.max(0, run.wallCoyote - dt);
  run.inputLock = Math.max(0, run.inputLock - dt);

  updateWorld(run, level, dt);
  // Hareketli platform üstündeysek onunla birlikte taşın.
  if (run.grounded && run.standing >= 0) { const m = run.movers[run.standing]; moveX(run, level, m.dx); run.y += m.dy; }

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const vertical = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dir && run.dashTime <= 0 && run.inputLock <= 0) run.facing = dir;

  // Dash
  if (run.dashBuffer > 0 && run.dashes > 0 && run.dashTime <= 0) {
    let dx = dir; let dy = vertical;
    if (!dx && !dy) dx = run.facing;
    if (run.grounded && dy > 0) dy = 0;
    const len = Math.hypot(dx, dy);
    run.dashDx = dx / len; run.dashDy = dy / len;
    run.dashes -= 1; run.dashTime = FEEL.dashTime; run.dashBuffer = 0; run.jumpBuffer = 0; run.canCut = false; run.freeze = FEEL.dashFreeze;
    run.vx = run.dashDx * FEEL.dashSpeed; run.vy = run.dashDy * FEEL.dashSpeed;
    if (run.dashDx) run.facing = Math.sign(run.dashDx);
    emit(run, 'dash', { dx: run.dashDx, dy: run.dashDy });
    return run;
  }

  if (run.dashTime > 0) {
    run.dashTime -= dt;
    run.vx = run.dashDx * FEEL.dashSpeed; run.vy = run.dashDy * FEEL.dashSpeed;
    if (run.dashTime <= 0) { if (run.vy < 0) run.vy *= FEEL.dashEndUpScale; }
    // Dash sırasında zıplama: yerdeysek "süper zıplama" için yatay hız korunur.
    if (run.jumpBuffer > 0 && (run.grounded || run.coyote > 0)) { run.dashTime = 0; jump(run, level); run.vx = run.dashDx * FEEL.dashSpeed * 0.85; }
  } else {
    // Yatay hız
    if (run.inputLock <= 0) {
      const target = dir * FEEL.runSpeed;
      let accel;
      if (dir && Math.abs(run.vx) > FEEL.runSpeed && Math.sign(run.vx) === dir) accel = run.grounded ? FEEL.groundFriction : FEEL.overSpeedDecel;
      else if (run.grounded) accel = dir ? FEEL.groundAccel : FEEL.groundFriction;
      else accel = dir ? FEEL.airAccel : FEEL.airFriction;
      run.vx = approach(run.vx, target, accel * dt);
    }
    // Dikey hız
    if (run.canCut && !input.jump && run.vy < 0) { run.vy *= FEEL.jumpCut; run.canCut = false; }
    if (run.vy >= 0) run.canCut = false;
    let gravity = run.vy < 0 ? FEEL.gravityUp : FEEL.gravityDown;
    if (input.jump && Math.abs(run.vy) < FEEL.apexThreshold) gravity *= FEEL.apexGravityScale;
    const maxFall = input.down ? FEEL.fastFall : FEEL.maxFall;
    run.vy = Math.min(maxFall, run.vy + gravity * dt);
    if (run.wallDir && dir === run.wallDir && run.vy > FEEL.wallSlide) { run.vy = FEEL.wallSlide; if (Math.random() < 0.25) emit(run, 'slide', { dir: run.wallDir }); }

    if (run.jumpBuffer > 0) {
      if (run.grounded || run.coyote > 0) jump(run, level);
      else if (run.wallDir || run.wallCoyote > 0) wallJump(run, run.wallDir || run.lastWallDir);
    }
  }

  // Rüzgâr
  let windPush = 0;
  for (const wind of level.winds) {
    if (overlap(run.x, run.y, PLAYER_W, PLAYER_H, wind.x, wind.y, wind.w, wind.h)) windPush += wind.force;
  }

  run.grounded = false; run.standing = -1;
  moveX(run, level, (run.vx + windPush) * dt);
  moveY(run, level, run.vy * dt);
  if (run.grounded && run.dashTime <= 0) {
    run.coyote = FEEL.coyote;
    if (run.dashes < 1) { run.dashes = 1; emit(run, 'refill', { quiet: true }); }
  }
  if (run.grounded && !run.wasGrounded) emit(run, 'land', { impact: run.prevY < run.y ? (run.y - run.prevY) / dt : 0 });
  updateWalls(run, level);
  interact(run, level);
  return run;
}

function jump(run) {
  run.vy = -FEEL.jumpSpeed; run.grounded = false; run.coyote = 0; run.jumpBuffer = 0; run.canCut = true; run.standing = -1;
  emit(run, 'jump');
}

function wallJump(run, wallDir) {
  run.vx = -wallDir * FEEL.wallJumpX; run.vy = -FEEL.wallJumpY; run.facing = -wallDir;
  run.inputLock = FEEL.wallJumpLock; run.jumpBuffer = 0; run.wallCoyote = 0; run.canCut = true;
  emit(run, 'walljump', { dir: wallDir });
}

function updateWorld(run, level, dt) {
  updateMovers(run, level, run.time);
  run.crumbles.forEach((c, i) => {
    if (c.state === 'shaking') { c.timer -= dt; if (c.timer <= 0) { c.state = 'gone'; c.timer = FEEL.crumbleReturn; const d = level.crumbles[i]; run.events.push({ type: 'crumbled', x: d.x + TILE / 2, y: d.y + TILE / 2 }); } }
    else if (c.state === 'gone') {
      c.timer -= dt;
      const d = level.crumbles[i];
      if (c.timer <= 0 && !overlap(run.x, run.y, PLAYER_W, PLAYER_H, d.x, d.y, TILE, TILE)) c.state = 'solid';
    }
  });
  for (let i = 0; i < run.orbs.length; i += 1) if (run.orbs[i] > 0) run.orbs[i] = Math.max(0, run.orbs[i] - dt);
  run.enemies.forEach(enemy => {
    if (!enemy.alive) return;
    if (enemy.kind === 'walker') {
      const nx = enemy.x + enemy.vx * dt;
      const ahead = enemy.vx > 0 ? nx + enemy.w : nx;
      const tx = Math.floor(ahead / TILE); const footY = Math.floor((enemy.y + enemy.h + 2) / TILE); const bodyY = Math.floor((enemy.y + enemy.h / 2) / TILE);
      const wall = isSolid(run, level, tx, bodyY); const floor = isSolid(run, level, tx, footY) || tileAt(level, tx, footY) === T.ONEWAY;
      if (wall || !floor) enemy.vx *= -1; else enemy.x = nx;
    } else {
      enemy.y = enemy.baseY + Math.sin(run.time * Math.PI * 2 / enemy.period + enemy.phase) * enemy.range;
    }
  });
  level.statues.forEach((statue, i) => {
    run.statueTimers[i] -= dt;
    if (run.statueTimers[i] <= 0) {
      run.statueTimers[i] += statue.every;
      run.fireballs.push({ x: statue.x + (statue.dir > 0 ? TILE : -12), y: statue.y + 10, vx: statue.dir * 230, life: 6 });
      run.events.push({ type: 'fire', x: statue.x + TILE / 2, y: statue.y + TILE / 2, far: Math.abs(statue.x - run.x) > 700 });
    }
  });
  for (let i = run.fireballs.length - 1; i >= 0; i -= 1) {
    const ball = run.fireballs[i];
    ball.x += ball.vx * dt; ball.life -= dt;
    if (ball.life <= 0 || rectHitsSolid(run, level, ball.x, ball.y, 12, 12)) { run.fireballs.splice(i, 1); run.events.push({ type: 'puff', x: ball.x + 6, y: ball.y + 6 }); }
  }
  if (level.rising && run.status === 'playing' && run.sinceSpawn > level.rising.delay) run.lavaY -= level.rising.speed * dt;
}

function interact(run, level) {
  const px = run.x; const py = run.y;
  const cx = px + PLAYER_W / 2; const cy = py + PLAYER_H / 2;
  // Tile tehlikeleri (dikenler hitbox'ı küçültülmüş)
  const x0 = Math.floor(px / TILE); const x1 = Math.floor((px + PLAYER_W - 0.001) / TILE);
  const y0 = Math.floor(py / TILE); const y1 = Math.floor((py + PLAYER_H - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty += 1) for (let tx = x0; tx <= x1; tx += 1) {
    const tile = tileAt(level, tx, ty);
    const bx = tx * TILE; const by = ty * TILE;
    if (tile === T.SPIKE_UP && run.vy >= 0 && overlap(px, py, PLAYER_W, PLAYER_H, bx + 5, by + 18, TILE - 10, 14)) return die(run);
    if (tile === T.SPIKE_DOWN && run.vy <= 0 && overlap(px, py, PLAYER_W, PLAYER_H, bx + 5, by, TILE - 10, 14)) return die(run);
    if (tile === T.SPIKE_LEFT && overlap(px, py, PLAYER_W, PLAYER_H, bx + 18, by + 5, 14, TILE - 10)) return die(run);
    if (tile === T.SPIKE_RIGHT && overlap(px, py, PLAYER_W, PLAYER_H, bx, by + 5, 14, TILE - 10)) return die(run);
    if (tile === T.LAVA && overlap(px, py, PLAYER_W, PLAYER_H, bx, by + 8, TILE, TILE - 8)) return die(run);
  }
  if (py > level.rows * TILE + 40) return die(run);
  if (run.lavaY < Infinity && py + PLAYER_H > run.lavaY + 6) return die(run);

  for (let i = 0; i < level.saws.length; i += 1) {
    const s = run.saws[i]; const r = level.saws[i].r - 3;
    const nx = clamp(s.x, px, px + PLAYER_W); const ny = clamp(s.y, py, py + PLAYER_H);
    if ((nx - s.x) ** 2 + (ny - s.y) ** 2 < r * r) return die(run);
  }
  for (const g of level.geysers) {
    if (geyserActive(g, run.time) === 'on' && overlap(px, py, PLAYER_W, PLAYER_H, g.x + 6, g.y - g.height, TILE - 12, g.height + TILE)) return die(run);
  }
  for (const ball of run.fireballs) if (overlap(px + 2, py + 2, PLAYER_W - 4, PLAYER_H - 4, ball.x, ball.y, 12, 12)) return die(run);

  for (const enemy of run.enemies) {
    if (!enemy.alive || !overlap(px, py, PLAYER_W, PLAYER_H, enemy.x, enemy.y, enemy.w, enemy.h)) continue;
    const stomp = run.prevY + PLAYER_H <= enemy.y + 10 && (run.vy > 0 || run.dashTime > 0);
    if (stomp) {
      enemy.alive = false; run.vy = -FEEL.stompBounce; run.dashTime = 0; run.dashes = 1; run.canCut = true;
      run.events.push({ type: 'stomp', x: enemy.x + enemy.w / 2, y: enemy.y + enemy.h / 2 });
    } else return die(run);
  }

  for (let i = 0; i < level.springs.length; i += 1) {
    const s = level.springs[i];
    if (run.vy >= 0 && overlap(px, py, PLAYER_W, PLAYER_H, s.x + 4, s.y + 16, TILE - 8, 16)) {
      run.vy = -FEEL.springSpeed; run.dashTime = 0; run.dashes = 1; run.canCut = false; run.grounded = false; run.coyote = 0;
      run.events.push({ type: 'spring', index: i, x: s.x + TILE / 2, y: s.y + 20 });
    }
  }
  for (let i = 0; i < level.orbs.length; i += 1) {
    const o = level.orbs[i];
    if (run.orbs[i] <= 0 && run.dashes < 1 && (cx - o.x) ** 2 + (cy - o.y) ** 2 < 22 * 22) {
      run.dashes = 1; run.orbs[i] = FEEL.orbReturn; run.events.push({ type: 'orb', x: o.x, y: o.y });
    }
  }
  for (let i = 0; i < level.gems.length; i += 1) {
    const g = level.gems[i];
    if (!run.gems[i] && (cx - g.x) ** 2 + (cy - g.y) ** 2 < 24 * 24) {
      run.gems[i] = true; run.events.push({ type: 'gem', x: g.x, y: g.y, count: run.gems.filter(Boolean).length, total: level.gems.length });
    }
  }
  for (let i = run.checkpoint + 1; i < level.checkpoints.length; i += 1) {
    const c = level.checkpoints[i];
    if (overlap(px, py, PLAYER_W, PLAYER_H, c.x - 16, c.y - 64, 32, 64)) { run.checkpoint = i; run.events.push({ type: 'checkpoint', x: c.x, y: c.y - 40 }); }
  }
  const e = level.exit;
  if (overlap(px, py, PLAYER_W, PLAYER_H, e.x - 12, e.y - 60, 24, 60)) {
    run.status = 'complete'; run.vx = 0; run.vy = 0;
    run.events.push({ type: 'win', x: e.x, y: e.y - 30 });
  }
}
