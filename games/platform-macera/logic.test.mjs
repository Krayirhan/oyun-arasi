import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, WORLDS } from './levels.js';
import { campaignStats, createCampaign, createRun, finishCampaign, isValidCampaign, isValidResume, mergeCampaigns, platformRect, resumeRun, tick } from './logic.js';

describe('Zıp Zıp level set', () => {
  test('30 hand-authored levels are split into three ten-level worlds', () => {
    assert.equal(LEVELS.length, 30);
    assert.equal(WORLDS.length, 3);
    assert.deepEqual(WORLDS.map(world => LEVELS.filter(level => level.world === world.id).length), [10, 10, 10]);
    for (const [index, level] of LEVELS.entries()) {
      assert.equal(level.number, index + 1);
      assert.equal(level.crystals.length, 3, `level ${level.number} should have 3 crystals`);
      assert.ok(level.checkpoint || level.checkpoints?.length, `level ${level.number} should have a checkpoint`);
      assert.ok(level.exit.x > level.spawn.x, `level ${level.number} should have an exit after its spawn`);
      assert.ok(level.starScore > 0 && level.targetSeconds > 0);
      assert.ok(level.platforms.some(platform => platform.kind === 'ground'));
      if (level.key) assert.ok(level.door, `level ${level.number} key needs a door`);
      for (const platform of level.platforms) assert.ok(platform.w > 0 && platform.h > 0);
    }
  });
});

describe('Zıp Zıp campaign and movement logic', () => {
  test('campaign merges furthest progress, completion, stars and scores monotonically', () => {
    const a = { furthestLevel: 5, completed: [1, 2, 3, 4], stars: { 1: 2, 2: 1 }, bestScores: { 1: 900, 2: 400 } };
    const b = { furthestLevel: 8, completed: [2, 5, 7], stars: { 1: 1, 5: 3 }, bestScores: { 1: 1000, 5: 700 } };
    const merged = mergeCampaigns(a, b);
    assert.equal(merged.furthestLevel, 8);
    assert.deepEqual(merged.completed, [1, 2, 3, 4, 5, 7]);
    assert.equal(merged.stars[1], 2);
    assert.equal(merged.stars[5], 3);
    assert.equal(merged.bestScores[1], 1000);
    assert.deepEqual(campaignStats(merged), { furthestLevel: 8, completedLevels: 6, totalStars: 6, bestScore: 1000 });
  });

  test('finishing a level opens the next one and never lowers existing records', () => {
    const run = { level: 1, stars: 3, score: 1200 };
    const next = finishCampaign(createCampaign(), run);
    assert.equal(next.furthestLevel, 2);
    assert.deepEqual(next.completed, [1]);
    assert.equal(next.stars[1], 3);
    assert.equal(finishCampaign(next, { ...run, stars: 1, score: 600 }).stars[1], 3);
  });

  test('jump buffering lands, jumps and supports Mavi double-jump with shared energy', () => {
    let run = createRun(1, 0);
    for (let i = 0; i < 30 && !run.grounded; i += 1) run = tick(run, {}, 0.04);
    assert.equal(run.grounded, true);
    run = tick(run, { jumpPressed: true }, 0.016);
    assert.ok(run.vy < 0);
    run = tick(run, { jumpPressed: true }, 0.016);
    assert.equal(run.airJumps, 1);
    assert.equal(run.energy, 65);
  });

  test('Rüzgâr dash and Filiz glide spend energy only while airborne', () => {
    let dash = { ...createRun(1, 1), y: 250, grounded: false };
    dash = tick(dash, { character: 1, abilityPressed: true, right: true }, 0.016);
    assert.ok(dash.dashTime > 0);
    assert.equal(dash.energy, 60);
    let glide = { ...createRun(1, 2), y: 250, grounded: false };
    glide = tick(glide, { character: 2, abilityHeld: true }, 0.04);
    assert.equal(glide.glide, true);
    assert.ok(glide.energy < 100);
  });

  test('character switching preserves current position, lives and energy', () => {
    const before = { ...createRun(1, 0), x: 250, y: 260, lives: 2, energy: 51 };
    const after = tick(before, { character: 2 }, 0.016);
    assert.equal(after.character, 2);
    assert.equal(after.x, before.x);
    assert.equal(after.lives, 2);
    assert.equal(after.energy, 51);
  });

  test('a character standing on a moving platform is carried with it', () => {
    const level = LEVELS[3];
    const platformIndex = level.platforms.findIndex(platform => platform.kind === 'moving');
    const platform = level.platforms[platformIndex];
    const atStart = platformRect(platform, 0);
    let run = { ...createRun(4), x: atStart.x + 20, y: atStart.y - 40, grounded: true, ridingPlatform: platformIndex };
    const oldX = run.x;
    run = tick(run, {}, 0.05);
    assert.notEqual(run.x, oldX);
    assert.equal(run.ridingPlatform, platformIndex);
  });

  test('collecting a key opens its level route and saves checkpoint state', () => {
    const level = LEVELS[6];
    let run = { ...createRun(7), x: level.key.x - 14, y: level.key.y - 14 };
    run = tick(run, {}, 0);
    assert.equal(run.hasKey, true);
    const point = level.checkpoint;
    run = tick({ ...run, x: point.x, y: point.y - 30 }, {}, 0.01);
    assert.equal(run.checkpointIndex, 0);
    assert.equal(run.checkpointState.hasKey, true);
  });

  test('damage consumes a life and returns to a checkpoint; exhausted run can be resumed safely', () => {
    let run = { ...createRun(2), x: 370, y: 438, grounded: true };
    run = tick(run, {}, 0.01);
    assert.equal(run.lives, 2);
    assert.equal(run.x, LEVELS[1].spawn.x);
    const saved = { level: run.level, lives: run.lives, character: run.character, checkpointState: run.checkpointState };
    assert.equal(isValidResume(saved), true);
    assert.equal(resumeRun(saved).status, 'playing');
  });

  test('campaign and resume validators reject malformed data', () => {
    assert.equal(isValidCampaign(createCampaign()), true);
    assert.equal(isValidCampaign({ furthestLevel: 40, completed: [], stars: {}, bestScores: {} }), false);
    assert.equal(isValidResume({ level: 1, lives: 4, checkpointState: { x: 0, y: 0 } }), false);
  });
});
