import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, WORLDS, TILE, T } from './levels.js';
import { FEEL, LEVEL_COUNT, PLAYER_H, PLAYER_W, STEP, campaignStats, createCampaign, createRun, finishCampaign, isValidCampaign, levelResult, mergeCampaigns, tick } from './logic.js';

const idle = () => ({ left: false, right: false, up: false, down: false, jump: false, jumpPressed: false, dashPressed: false });
const steps = (run, input, seconds) => { for (let t = 0; t < seconds; t += STEP) tick(run, input, STEP); return run; };
const settle = run => steps(run, idle(), 0.3);
const tileAt = (level, x, y) => level.grid[Math.floor(y / TILE) * level.cols + Math.floor(x / TILE)];

describe('Zıpkın bölümleri', () => {
  test('bölümler üç dünyaya dağılmış ve oynanabilir veri içeriyor', () => {
    assert.equal(WORLDS.length, 3);
    assert.equal(LEVELS.length, LEVEL_COUNT);
    for (const [index, level] of LEVELS.entries()) {
      const name = `bölüm ${level.number}`;
      assert.equal(level.number, index + 1);
      assert.ok(level.spawn && level.exit, `${name}: başlangıç ve çıkış olmalı`);
      assert.equal(level.gems.length, 3, `${name}: 3 kristal olmalı`);
      assert.ok(level.par > 0, `${name}: hedef süre olmalı`);
      assert.ok(level.title.length > 0);
      for (const point of [level.spawn, level.exit, ...level.checkpoints]) {
        assert.equal(tileAt(level, point.x, point.y - 4), T.EMPTY, `${name}: nokta (${point.x}, ${point.y}) boşlukta olmalı`);
        const below = tileAt(level, point.x, point.y + 4);
        assert.ok([T.SOLID, T.ONEWAY, T.CRUMBLE].includes(below), `${name}: nokta (${point.x}, ${point.y}) zemine basmalı`);
      }
      for (const gem of level.gems) assert.notEqual(tileAt(level, gem.x, gem.y), T.SOLID, `${name}: kristal duvarın içinde olmamalı`);
    }
  });

  test('karakter başlangıçta zemine oturur', () => {
    for (const level of LEVELS) {
      const run = settle(createRun(level.number));
      assert.equal(run.grounded, true, `bölüm ${level.number}`);
      assert.equal(run.status, 'playing');
    }
  });
});

describe('Zıpkın fiziği', () => {
  test('uzun basılı zıplama kısa zıplamadan belirgin şekilde yüksek', () => {
    const apex = hold => {
      const run = settle(createRun(1));
      const startY = run.y; let best = run.y;
      tick(run, { ...idle(), jump: true, jumpPressed: true }, STEP);
      for (let t = 0; t < 1; t += STEP) { tick(run, { ...idle(), jump: hold && t < 0.5 }, STEP); best = Math.min(best, run.y); }
      return startY - best;
    };
    const high = apex(true); const low = apex(false);
    assert.ok(high > 100, `yüksek zıplama ${high}`);
    assert.ok(low < high * 0.5, `kısa zıplama ${low} / ${high}`);
  });

  test('kenardan düştükten hemen sonra zıplama (coyote) ve erken basılan zıplama (buffer) çalışır', () => {
    const level = LEVELS[0];
    const run = settle(createRun(1));
    run.x = 16 * TILE - PLAYER_W - 2; run.vx = FEEL.runSpeed;
    for (let i = 0; i < 60 && run.grounded; i += 1) tick(run, { ...idle(), right: true }, STEP);
    assert.equal(run.grounded, false);
    tick(run, { ...idle(), right: true, jump: true, jumpPressed: true }, STEP);
    assert.ok(run.vy < -FEEL.jumpSpeed * 0.9, 'coyote zıplaması');

    const buffered = settle(createRun(1));
    buffered.y -= 12; buffered.vy = 200; buffered.grounded = false;
    tick(buffered, { ...idle(), jump: true, jumpPressed: true }, STEP);
    for (let i = 0; i < 20 && buffered.vy >= 0; i += 1) tick(buffered, { ...idle(), jump: true }, STEP);
    assert.ok(buffered.vy < 0, 'tampon zıplaması iniş anında tetiklenir');
    void level;
  });

  test('duvarda kayma hızı sınırlanır ve duvar zıplaması ters yöne iter', () => {
    const run = createRun(3);
    // 3. bölümdeki ilk bacanın sağ duvarı 15. sütunda.
    run.x = 15 * TILE - PLAYER_W; run.y = 8 * TILE; run.vy = 400; run.grounded = false;
    steps(run, { ...idle(), right: true }, 0.1);
    assert.equal(run.wallDir, 1);
    assert.ok(run.vy <= FEEL.wallSlide + 1, `kayma hızı ${run.vy}`);
    tick(run, { ...idle(), right: true, jump: true, jumpPressed: true }, STEP);
    assert.ok(run.vx < 0, 'duvar zıplaması sola iter');
    assert.ok(run.vy < -FEEL.wallJumpY * 0.9);
  });

  test('dash havada bir kez kullanılır, yere inince yenilenir', () => {
    const run = settle(createRun(1));
    run.x = 30 * TILE; run.y = 6 * TILE; run.grounded = false; run.vy = 0;
    tick(run, { ...idle(), right: true, dashPressed: true }, STEP);
    steps(run, { ...idle(), right: true }, FEEL.dashFreeze + 0.02);
    assert.equal(run.dashes, 0);
    assert.ok(run.vx >= FEEL.dashSpeed - 1, `dash hızı ${run.vx}`);
    steps(run, idle(), FEEL.dashTime);
    const vx = run.vx;
    tick(run, { ...idle(), dashPressed: true }, STEP);
    steps(run, idle(), 0.05);
    assert.ok(run.vx <= vx, 'ikinci dash yok');
    steps(run, idle(), 1.2);
    assert.equal(run.grounded, true);
    assert.equal(run.dashes, 1);
  });

  test('dikene değmek öldürür, kısa süre sonra kontrol noktasında doğulur', () => {
    const level = LEVELS[0];
    const run = settle(createRun(1));
    run.x = 32 * TILE + 6; run.y = 15 * TILE - PLAYER_H - 2; run.vy = 50;
    tick(run, idle(), STEP);
    assert.equal(run.status, 'dying');
    assert.equal(run.deaths, 1);
    steps(run, idle(), FEEL.respawnDelay + 0.05);
    assert.equal(run.status, 'playing');
    assert.equal(run.x + PLAYER_W / 2, level.spawn.x);

    const cp = level.checkpoints[0];
    run.x = cp.x - PLAYER_W / 2; run.y = cp.y - PLAYER_H;
    tick(run, idle(), STEP);
    assert.equal(run.checkpoint, 0);
    run.y = 30 * TILE;
    steps(run, idle(), FEEL.respawnDelay + 0.1);
    assert.equal(run.deaths, 2);
    assert.equal(run.x + PLAYER_W / 2, cp.x);
  });

  test('kristal toplanır, çıkışa ulaşınca bölüm biter ve yıldız hesaplanır', () => {
    const level = LEVELS[0];
    const run = settle(createRun(1));
    level.gems.forEach(gem => { run.x = gem.x - PLAYER_W / 2; run.y = gem.y - PLAYER_H / 2; tick(run, idle(), STEP); });
    assert.deepEqual(run.gems, [true, true, true]);
    run.x = level.exit.x - PLAYER_W / 2; run.y = level.exit.y - PLAYER_H;
    tick(run, idle(), STEP);
    assert.equal(run.status, 'complete');
    const result = levelResult(run);
    assert.equal(result.stars, 3);
    assert.ok(result.score > 1000);
    assert.ok(run.events.some(e => e.type === 'win'));
  });
});

describe('Zıpkın kampanyası', () => {
  test('bitirilen bölüm sonrakini açar, rekorlar düşmez', () => {
    const first = finishCampaign(createCampaign(), { level: 1, stars: 3, score: 1800, time: 20 });
    assert.equal(first.furthestLevel, 2);
    assert.deepEqual(first.completed, [1]);
    const worse = finishCampaign(first, { level: 1, stars: 1, score: 900, time: 40 });
    assert.equal(worse.stars[1], 3);
    assert.equal(worse.bestScores[1], 1800);
    assert.equal(worse.bestTimes[1], 20);
    assert.deepEqual(campaignStats(worse), { furthestLevel: 2, completedLevels: 1, totalStars: 3, bestScore: 1800 });
  });

  test('birleştirme monoton; eski v1 kayıtları reddedilir', () => {
    const a = { ...createCampaign(), furthestLevel: 4, completed: [1, 2, 3], stars: { 1: 2 }, bestScores: { 1: 1500 }, bestTimes: { 1: 30 } };
    const b = { ...createCampaign(), furthestLevel: 2, completed: [1], stars: { 1: 3 }, bestScores: { 1: 1200 }, bestTimes: { 1: 25 } };
    const merged = mergeCampaigns(a, b);
    assert.equal(merged.furthestLevel, 4);
    assert.equal(merged.stars[1], 3);
    assert.equal(merged.bestScores[1], 1500);
    assert.equal(merged.bestTimes[1], 25);
    assert.equal(isValidCampaign({ furthestLevel: 5, completed: [], stars: {}, bestScores: {} }), false);
    assert.equal(isValidCampaign({ ...createCampaign(), furthestLevel: LEVEL_COUNT + 1 }), false);
    assert.equal(mergeCampaigns({ furthestLevel: 9, completed: [1], stars: {}, bestScores: {} }, null).furthestLevel, 1);
  });
});
