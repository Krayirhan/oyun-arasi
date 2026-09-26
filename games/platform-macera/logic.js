import { LEVELS } from './levels.js?v=202609270130';

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 540;
export const PLAYER_WIDTH = 28;
export const PLAYER_HEIGHT = 40;
export const MAX_ENERGY = 100;
export const CHARACTERS = ['mavi', 'ruzgar', 'filiz'];
const GRAVITY = 1450;
const RUN_ACCEL = 1750;
const MAX_SPEED = 285;
const FRICTION = 1900;
const JUMP_SPEED = 570;
const COYOTE_SECONDS = 0.11;
const JUMP_BUFFER_SECONDS = 0.13;
const INVULNERABLE_SECONDS = 1.05;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const playerRect = run => ({ x: run.x, y: run.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT });

export function createCampaign() {
  return { furthestLevel: 1, completed: [], stars: {}, bestScores: {} };
}

export function createRun(levelNumber = 1, character = 0) {
  const level = LEVELS[levelNumber - 1];
  const run = {
    level: levelNumber, status: 'playing', x: level.spawn.x, y: level.spawn.y,
    vx: 0, vy: 0, grounded: false, ridingPlatform: null, jumpBuffer: 0, coyote: 0, airJumps: 0,
    character: clamp(character, 0, 2), energy: MAX_ENERGY, dashTime: 0, glide: false,
    lives: 3, score: 0, elapsed: 0, invulnerable: 0,
    crystals: [], defeated: [], hasKey: false, shield: false, gotPowerups: [],
    powerTimers: { speed: 0, extraJump: 0 }, checkpointIndex: -1,
    checkpointState: null, message: ''
  };
  run.checkpointState = snapshotRun(run);
  return run;
}

function snapshotRun(run) {
  return {
    x: run.x, y: run.y, score: run.score, elapsed: run.elapsed,
    crystals: [...run.crystals], hasKey: run.hasKey, shield: run.shield, gotPowerups: [...run.gotPowerups],
    energy: run.energy, character: run.character, powerTimers: { ...run.powerTimers }, checkpointIndex: run.checkpointIndex
  };
}

export function resumeRun(saved) {
  if (!isValidResume(saved)) return null;
  const level = LEVELS[saved.level - 1];
  const base = createRun(saved.level, saved.character);
  const source = saved.checkpointState || {};
  Object.assign(base, {
    x: source.x ?? level.spawn.x, y: source.y ?? level.spawn.y,
    score: source.score || 0, elapsed: source.elapsed || 0,
    crystals: [...(source.crystals || [])], hasKey: Boolean(source.hasKey), shield: Boolean(source.shield), gotPowerups: [...(source.gotPowerups || [])],
    energy: clamp(source.energy ?? MAX_ENERGY, 0, MAX_ENERGY), character: clamp(source.character ?? saved.character, 0, 2),
    powerTimers: { speed: 0, extraJump: 0, ...source.powerTimers },
    checkpointIndex: source.checkpointIndex ?? -1,
    lives: clamp(saved.lives ?? 3, 1, 3), status: 'playing'
  });
  base.checkpointState = snapshotRun(base);
  return base;
}

export function isValidResume(value) {
  return Boolean(value && Number.isInteger(value.level) && value.level >= 1 && value.level <= LEVELS.length
    && Number.isInteger(value.lives) && value.lives >= 1 && value.lives <= 3
    && value.checkpointState && Number.isFinite(value.checkpointState.x) && Number.isFinite(value.checkpointState.y));
}

export function isValidCampaign(value) {
  return Boolean(value && Number.isInteger(value.furthestLevel) && value.furthestLevel >= 1 && value.furthestLevel <= 30
    && Array.isArray(value.completed) && value.completed.every(n => Number.isInteger(n) && n >= 1 && n <= 30)
    && value.stars && typeof value.stars === 'object' && !Array.isArray(value.stars)
    && value.bestScores && typeof value.bestScores === 'object' && !Array.isArray(value.bestScores));
}

export function mergeCampaigns(a, b) {
  const left = isValidCampaign(a) ? a : createCampaign();
  const right = isValidCampaign(b) ? b : createCampaign();
  const completed = [...new Set([...left.completed, ...right.completed])].sort((x, y) => x - y);
  const stars = {};
  const bestScores = {};
  for (let n = 1; n <= 30; n += 1) {
    stars[n] = Math.max(left.stars[n] || 0, right.stars[n] || 0);
    bestScores[n] = Math.max(left.bestScores[n] || 0, right.bestScores[n] || 0);
  }
  return { furthestLevel: Math.max(left.furthestLevel, right.furthestLevel), completed, stars, bestScores };
}

export function campaignStats(campaign) {
  const safe = isValidCampaign(campaign) ? campaign : createCampaign();
  return {
    furthestLevel: safe.furthestLevel,
    completedLevels: safe.completed.length,
    totalStars: Object.values(safe.stars).reduce((sum, value) => sum + clamp(value, 0, 3), 0),
    bestScore: Math.max(0, ...Object.values(safe.bestScores).filter(Number.isFinite))
  };
}

export function platformRect(platform, elapsed) {
  if (platform.kind !== 'moving') return platform;
  const phase = elapsed * platform.speed + platform.phase;
  const swing = Math.sin(phase * Math.PI * 2);
  return { ...platform, x: platform.x + platform.dx * swing, y: platform.y + platform.dy * swing };
}

function respawn(run) {
  const lives = run.lives - 1;
  if (lives <= 0) return { ...createRun(run.level, run.character), status: 'failed', lives: 0, score: run.score, message: 'Canların bitti. Bölümü yeniden deneyebilirsin.' };
  const next = { ...run, ...run.checkpointState, score: Math.max(0, run.checkpointState.score - 100), elapsed: run.elapsed, gotPowerups: [...(run.checkpointState.gotPowerups || [])], powerTimers: { ...run.checkpointState.powerTimers }, lives, vx: 0, vy: 0, grounded: false, ridingPlatform: null, jumpBuffer: 0, coyote: 0, airJumps: 0, dashTime: 0, glide: false, invulnerable: INVULNERABLE_SECONDS, status: 'playing', message: 'Kontrol noktasında yeniden başladın.' };
  next.checkpointState = snapshotRun(next);
  return next;
}

function hit(run) {
  if (run.invulnerable > 0) return run;
  if (run.shield) return { ...run, shield: false, invulnerable: INVULNERABLE_SECONDS * 0.5, message: 'Kalkan darbeyi engelledi.' };
  return respawn({ ...run, lives: run.lives, score: Math.max(0, run.score - 100) });
}

function currentHazardActive(hazard, elapsed) {
  if (hazard.kind !== 'geyser') return true;
  return ((elapsed + (hazard.phase || 0)) % hazard.period) < hazard.active;
}

function collect(run, level) {
  let next = run;
  const rect = playerRect(run);
  level.crystals.forEach((crystal, index) => {
    if (!next.crystals.includes(index) && overlap(rect, { x: crystal.x - 13, y: crystal.y - 13, w: 26, h: 26 })) {
      next = { ...next, crystals: [...next.crystals, index], score: next.score + 100, message: 'Kristal toplandı! +100' };
    }
  });
  if (level.key && !next.hasKey && overlap(rect, { x: level.key.x - 14, y: level.key.y - 14, w: 28, h: 28 })) next = { ...next, hasKey: true, score: next.score + 25, message: 'Anahtar sende. Kapı açılabilir.' };
  (level.powerups || []).forEach(power => {
    if (next.gotPowerups.includes(power.kind)) return;
    if (overlap(rect, { x: power.x - 14, y: power.y - 14, w: 28, h: 28 })) {
      next = { ...next, gotPowerups: [...next.gotPowerups, power.kind], shield: power.kind === 'shield' ? true : next.shield,
        powerTimers: { ...next.powerTimers, ...(power.kind === 'speed' ? { speed: 7 } : power.kind === 'extraJump' ? { extraJump: 9 } : {}) }, message: `${power.kind === 'shield' ? 'Kalkan' : power.kind === 'speed' ? 'Hız' : 'Ek zıplama'} güçlendirmesi alındı.` };
    }
  });
  return next;
}

function completeLevel(run, level) {
  const timeBonus = Math.max(0, Math.floor((level.targetSeconds - run.elapsed) * 10));
  const score = run.score + 300 + timeBonus;
  const allCrystals = run.crystals.length === level.crystals.length;
  const stars = 1 + Number(allCrystals) + Number(score >= level.starScore);
  return { ...run, score, status: 'complete', stars, message: `Bölüm tamamlandı! ${stars} yıldız kazandın.` };
}

export function finishCampaign(campaign, run) {
  const level = run.level;
  const completed = [...new Set([...campaign.completed, level])].sort((a, b) => a - b);
  const stars = { ...campaign.stars, [level]: Math.max(campaign.stars[level] || 0, run.stars || 1) };
  const bestScores = { ...campaign.bestScores, [level]: Math.max(campaign.bestScores[level] || 0, run.score) };
  return mergeCampaigns(campaign, { furthestLevel: Math.min(30, Math.max(campaign.furthestLevel, level + 1)), completed, stars, bestScores });
}

function updateEnemies(run, level, dt) {
  let next = run;
  level.enemies.forEach((enemy, index) => {
    if (next.defeated.includes(index)) return;
    const rect = enemy.kind === 'flyer'
      ? { x: enemy.x, y: enemy.y + Math.sin((run.elapsed * enemy.speed / 35) + index) * (enemy.maxY - enemy.y), w: 34, h: 28 }
      : { x: enemy.minX + Math.abs(Math.sin(run.elapsed * enemy.speed / Math.max(30, enemy.maxX - enemy.minX))) * (enemy.maxX - enemy.minX), y: enemy.y, w: 34, h: 30 };
    if (!overlap(playerRect(next), rect)) return;
    const fallingOnto = next.vy > 80 && next.y + PLAYER_HEIGHT - next.vy * dt <= rect.y + 10;
    if (fallingOnto) next = { ...next, defeated: [...next.defeated, index], vy: -300, grounded: false, score: next.score + 50, message: 'Düşman yenildi! +50' };
    else next = hit(next);
  });
  return next;
}

function solidCollision(run, level, axis, delta, previous) {
  const candidate = { ...run, [axis]: run[axis] + delta };
  const rect = playerRect(candidate);
  let result = candidate;
  const solids = level.door && !run.hasKey ? [...level.platforms, { ...level.door, kind: 'door' }] : level.platforms;
  for (const source of solids) {
    const platform = platformRect(source, run.elapsed);
    if (!overlap(rect, platform)) continue;
    if (axis === 'x') {
      result.x = delta > 0 ? platform.x - PLAYER_WIDTH : platform.x + platform.w;
      result.vx = 0; result.ridingPlatform = null;
    } else if (delta > 0 && previous.y + PLAYER_HEIGHT <= platform.y + 8) {
      result.y = platform.y - PLAYER_HEIGHT;
      result.vy = 0; result.grounded = true; result.airJumps = 0;
      result.ridingPlatform = source.kind === 'moving' ? level.platforms.indexOf(source) : null;
    } else if (delta < 0 && previous.y >= platform.y + platform.h - 8) {
      result.y = platform.y + platform.h; result.vy = 0; result.ridingPlatform = null;
    }
    rect.x = result.x; rect.y = result.y;
  }
  return result;
}

export function tick(source, input, deltaSeconds) {
  if (!source || source.status !== 'playing') return source;
  let run = { ...source, powerTimers: { ...source.powerTimers }, elapsed: source.elapsed + clamp(deltaSeconds, 0, 0.05) };
  const dt = clamp(deltaSeconds, 0, 0.05);
  const level = LEVELS[run.level - 1];
  if (run.grounded && Number.isInteger(run.ridingPlatform)) {
    const platform = level.platforms[run.ridingPlatform];
    if (platform?.kind === 'moving') {
      const before = platformRect(platform, source.elapsed);
      const after = platformRect(platform, run.elapsed);
      run.x += after.x - before.x; run.y += after.y - before.y;
    }
  }
  run.invulnerable = Math.max(0, run.invulnerable - dt);
  run.powerTimers.speed = Math.max(0, run.powerTimers.speed - dt);
  run.powerTimers.extraJump = Math.max(0, run.powerTimers.extraJump - dt);
  run.energy = Math.min(MAX_ENERGY, run.energy + (run.grounded ? 20 * dt : 0));
  run.character = input.character == null ? run.character : clamp(input.character, 0, 2);
  run.jumpBuffer = input.jumpPressed ? JUMP_BUFFER_SECONDS : Math.max(0, run.jumpBuffer - dt);
  run.coyote = run.grounded ? COYOTE_SECONDS : Math.max(0, run.coyote - dt);
  run.glide = false;

  const direction = Number(Boolean(input.right)) - Number(Boolean(input.left));
  const maxSpeed = run.powerTimers.speed > 0 ? MAX_SPEED * 1.28 : MAX_SPEED;
  if (direction) run.vx = clamp(run.vx + direction * RUN_ACCEL * dt, -maxSpeed, maxSpeed);
  else run.vx = Math.abs(run.vx) <= FRICTION * dt ? 0 : run.vx - Math.sign(run.vx) * FRICTION * dt;

  if (input.abilityPressed && run.character === 1 && run.energy >= 40 && !run.grounded) {
    run.energy -= 40; run.dashTime = 0.2; run.vx = (direction || Math.sign(run.vx) || 1) * 540;
  }
  if (run.character === 2 && input.abilityHeld && !run.grounded && run.energy > 0) {
    run.glide = true; run.energy = Math.max(0, run.energy - 25 * dt);
  }
  if (run.dashTime > 0) run.dashTime = Math.max(0, run.dashTime - dt);
  else if (run.vy < 760) run.vy += (run.glide ? GRAVITY * 0.22 : GRAVITY) * dt;

  if (run.jumpBuffer > 0) {
    if (run.grounded || run.coyote > 0) {
      run.vy = -JUMP_SPEED; run.grounded = false; run.coyote = 0; run.jumpBuffer = 0; run.airJumps = 0;
    } else if ((run.character === 0 || run.powerTimers.extraJump > 0) && run.airJumps < 1 && run.energy >= 35) {
      run.vy = -JUMP_SPEED * 0.9; run.energy -= 35; run.airJumps += 1; run.jumpBuffer = 0;
    }
  }

  const previous = { x: run.x, y: run.y };
  run.grounded = false; run.ridingPlatform = null;
  run = solidCollision(run, level, 'x', run.vx * dt, previous);
  const beforeVertical = { x: run.x, y: run.y };
  run = solidCollision(run, level, 'y', run.vy * dt, beforeVertical);
  run.x = clamp(run.x, 0, level.width - PLAYER_WIDTH);

  run = updateEnemies(run, level, dt);
  if (run.status !== 'playing') return run;
  run = collect(run, level);
  const body = playerRect(run);
  if (level.hazards.some(hazard => currentHazardActive(hazard, run.elapsed) && overlap(body, hazard))) run = hit(run);
  if (run.status !== 'playing') return run;

  const checkpoints = level.checkpoints || [level.checkpoint];
  const checkpointAt = checkpoints.findIndex((point, index) => index > run.checkpointIndex && overlap(body, { x: point.x, y: point.y, w: 28, h: 48 }));
  if (checkpointAt >= 0) {
    run = { ...run, checkpointIndex: checkpointAt, message: 'Kontrol noktası kaydedildi.' };
    run.checkpointState = snapshotRun(run);
  }

  if (run.y > WORLD_HEIGHT + 100) run = hit(run);
  if (run.status !== 'playing') return run;
  const exitBlocked = level.door && !run.hasKey && overlap(body, level.door);
  if (overlap(body, level.exit) && !exitBlocked) run = completeLevel(run, level);
  return run;
}

export function activateCharacterAbility(run, direction = 1) {
  if (!run || run.status !== 'playing' || run.grounded || run.energy < 1) return run;
  if (run.character === 0 && run.airJumps < 1 && run.energy >= 35) return { ...run, vy: -JUMP_SPEED * 0.9, energy: run.energy - 35, airJumps: run.airJumps + 1 };
  if (run.character === 1 && run.energy >= 40) return { ...run, vx: (Math.sign(direction) || 1) * 540, energy: run.energy - 40, dashTime: 0.2 };
  return run;
}

export function levelProgress(run, campaign) {
  return finishCampaign(campaign, run);
}
