// Zıpkın bölümlerini otomatik çözer: ışın araması (beam search) ile 0,05 sn'lik tuş adımlarını dener,
// çıkışa varan bir tuş dizisi bulursa games/platform-macera/solutions.json'a yazar. Kayıtlı çözümler
// games/platform-macera/logic.test.mjs içinde oynatılır: her bölümün gerçekten bitirilebildiğinin kanıtıdır.
//
// Kullanım:  node tools/zipkin-solver.mjs [bölüm ...]      (bölüm verilmezse hepsi)
//            ZIPKIN_BEAM=300 ZIPKIN_SECONDS=150 node tools/zipkin-solver.mjs 5
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { LEVELS, TILE, T } from '../games/platform-macera/levels.js';
import { createRun, tick, PLAYER_W, PLAYER_H } from '../games/platform-macera/logic.js';

const TICKS = 6;                     // bir tuş adımı = 6 tik = 0,05 sn
const BEAM = Number(process.env.ZIPKIN_BEAM || 400);
const PER_CELL = Number(process.env.ZIPKIN_PER_CELL || 3);
const MAX_SECONDS = Number(process.env.ZIPKIN_SECONDS || 120);
const WALL_MS = Number(process.env.ZIPKIN_WALL_MS || 240000);
const ONLY_GEM = process.env.ZIPKIN_ONLY_GEM === undefined ? -1 : Number(process.env.ZIPKIN_ONLY_GEM); // tek kristali kanıtla (kristaller ölünce kaybolmaz)
const GEMS = process.env.ZIPKIN_GEMS === '1' || ONLY_GEM >= 0; // 3 yıldız kanıtı: önce bütün kristaller toplanır, sonra çıkışa gidilir
const SOLUTIONS = new URL(GEMS ? '../games/platform-macera/solutions-gems.json' : '../games/platform-macera/solutions.json', import.meta.url);
const OUT = new URL('./zipkin-out/', import.meta.url); // bölüm başına ara çıktı (paralel çalıştırma için)

// Tuş adımı: { dir, vert, jump, dash }
const ACTIONS = [];
for (const dir of [1, -1, 0]) for (const jump of [false, true]) ACTIONS.push({ dir, vert: 0, jump, dash: false });
for (const dir of [1, -1, 0]) for (const vert of [-1, 0, 1]) ACTIONS.push({ dir, vert, jump: false, dash: true });

function cloneRun(run) {
  return {
    ...run, events: [], gems: [...run.gems],
    crumbles: run.crumbles.map(c => ({ ...c })), orbs: [...run.orbs],
    movers: run.movers.map(m => ({ ...m })), saws: run.saws.map(s => ({ ...s })),
    enemies: run.enemies.map(e => ({ ...e })), fireballs: run.fireballs.map(f => ({ ...f })),
    statueTimers: [...run.statueTimers]
  };
}

// Çıkıştan başlayarak, tehlikesiz ve katı olmayan karelerde uzaklık alanı (yalnızca yön göstermek içindir).
function distanceField(level, point = level.exit) {
  const { cols, rows, grid } = level;
  const passable = index => {
    const tile = grid[index];
    return tile === T.EMPTY || tile === T.ONEWAY || tile === T.CRUMBLE;
  };
  const dist = new Int32Array(cols * rows).fill(-1);
  const start = Math.floor((point === level.exit ? point.y - 30 : point.y) / TILE) * cols + Math.floor(point.x / TILE);
  const queue = [start]; dist[start] = 0;
  for (let head = 0; head < queue.length; head += 1) {
    const at = queue[head]; const x = at % cols; const y = Math.floor(at / cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const next = ny * cols + nx;
      if (dist[next] >= 0 || !passable(next)) continue;
      dist[next] = dist[at] + 1; queue.push(next);
    }
  }
  return dist;
}

function solveLevel(number) {
  const level = LEVELS[number - 1];
  const field = distanceField(level);
  const gemFields = GEMS ? level.gems.map(gem => distanceField(level, gem)) : [];
  const wantedGems = ONLY_GEM >= 0 ? [ONLY_GEM] : level.gems.map((_, i) => i);
  const lookup = (map, run) => {
    const tx = Math.floor((run.x + PLAYER_W / 2) / TILE); const ty = Math.floor((run.y + PLAYER_H / 2) / TILE);
    const d = tx < 0 || ty < 0 || tx >= level.cols || ty >= level.rows ? -1 : map[ty * level.cols + tx];
    return d < 0 ? 999 : d;
  };
  const heuristic = run => {
    if (!GEMS) return lookup(field, run);
    const remaining = wantedGems.filter(i => !run.gems[i]);
    if (!remaining.length) return lookup(field, run);
    return remaining.length * 400 + Math.min(...remaining.map(i => lookup(gemFields[i], run)));
  };
  const started = Date.now();
  let beam = [{ run: createRun(number), path: null, h: 0 }];
  beam[0].h = heuristic(beam[0].run);
  const maxSteps = Math.floor(MAX_SECONDS / (TICKS / 120));
  let best = beam[0].h; let bestNode = beam[0];
  for (let step = 0; step < maxSteps; step += 1) {
    if (Date.now() - started > WALL_MS) return { solved: false, reason: 'süre', best, step };
    const next = new Map();
    for (const node of beam) {
      const previousJump = node.path ? node.path.action.jump : false;
      for (const action of ACTIONS) {
        if (action.dash && (node.run.dashes < 1 || node.run.dashTime > 0)) continue;
        const run = cloneRun(node.run);
        for (let t = 0; t < TICKS && run.status === 'playing'; t += 1) {
          tick(run, {
            left: action.dir < 0, right: action.dir > 0, up: action.vert < 0, down: action.vert > 0, jump: action.jump,
            jumpPressed: action.jump && !previousJump && t === 0, dashPressed: action.dash && t === 0
          });
        }
        if (ONLY_GEM >= 0 && run.gems[ONLY_GEM]) return { solved: true, steps: step + 1, actions: unwind({ action, parent: node.path }) };
        if (run.status === 'complete' && GEMS && wantedGems.some(i => !run.gems[i])) continue; // kristal eksik bitiş sayılmaz
        if (run.status === 'complete') return { solved: true, steps: step + 1, actions: unwind({ action, parent: node.path }) };
        if (run.status !== 'playing') continue; // ölen durum elenir
        const key = `${Math.round(run.x / 6)},${Math.round(run.y / 6)},${Math.round(run.vx / 90)},${Math.round(run.vy / 150)},${run.grounded ? 1 : 0},${run.dashes},${run.dashTime > 0 ? 1 : 0},${run.gems.filter(Boolean).length}`;
        const h = heuristic(run);
        const score = h * TILE - Math.min(run.x, 99999) * 0 + (run.grounded ? 0 : 2);
        const existing = next.get(key);
        if (!existing || score < existing.score) next.set(key, { run, path: { action, parent: node.path }, h, score });
      }
    }
    if (!next.size) return { solved: false, reason: 'çıkmaz', best, step };
    const ranked = [...next.values()].sort((a, b) => a.score - b.score);
    // Çeşitlilik: konum kutusu (32 px) başına en çok PER_CELL durum tutulur; ışın tek bir yöne yığılıp hep aynı
    // tuzağa girmesin. Kutular en iyi durumun skoruna göre dolar, boş kalan yer kalan en iyilerle tamamlanır.
    const cells = new Map(); const chosen = []; const overflow = [];
    for (const node of ranked) {
      const cell = `${Math.floor(node.run.x / 32)},${Math.floor(node.run.y / 32)}`;
      const used = cells.get(cell) || 0;
      if (used < PER_CELL && chosen.length < BEAM) { cells.set(cell, used + 1); chosen.push(node); } else overflow.push(node);
    }
    beam = chosen.length < BEAM ? [...chosen, ...overflow.slice(0, BEAM - chosen.length)] : chosen;
    if (ranked[0].h < best) { best = ranked[0].h; bestNode = ranked[0]; }
  }
  return { solved: false, reason: 'adım sınırı', best, at: { x: Math.round(bestNode.run.x), y: Math.round(bestNode.run.y), gems: bestNode.run.gems.filter(Boolean).length } };
}

function unwind(path) {
  const out = [];
  for (let node = path; node; node = node.parent) out.push(node.action);
  return out.reverse();
}

// Sıkıştırılmış yazım: her adım "yön(-,0,+) + dikey + z (zıpla) / d (dash)" olarak bir kısa dize.
const encode = action => `${action.dir > 0 ? 'r' : action.dir < 0 ? 'l' : 'n'}${action.vert > 0 ? 'd' : action.vert < 0 ? 'u' : 'n'}${action.dash ? 'D' : action.jump ? 'J' : 'n'}`;

const args = process.argv.slice(2);
if (args.includes('--merge')) {
  let saved = {};
  try { saved = JSON.parse(await readFile(SOLUTIONS, 'utf8')); } catch { saved = {}; }
  for (const file of await readdir(OUT)) {
    const match = file.match(GEMS ? /^gems-(\d+)\.json$/ : /^level-(\d+)\.json$/); if (!match) continue;
    saved[Number(match[1])] = JSON.parse(await readFile(new URL(file, OUT), 'utf8'));
  }
  if (GEMS) {
    // Tek hayatta hepsi toplanamayan bölümler: kristaller ölünce kaybolmadığı için ayrı ayrı kanıtlanır.
    const separate = {};
    for (const file of await readdir(OUT)) {
      const match = file.match(/^gem-(\d+)-(\d+)\.json$/); if (!match) continue;
      (separate[Number(match[1])] ||= [])[Number(match[2])] = JSON.parse(await readFile(new URL(file, OUT), 'utf8'));
    }
    for (const [number, list] of Object.entries(separate)) if (!saved[number]) saved[number] = { separate: list };
  }
  const ordered = Object.fromEntries(Object.entries(saved).sort((a, b) => Number(a[0]) - Number(b[0])));
  await writeFile(SOLUTIONS, JSON.stringify(ordered));
  console.log(`birleştirildi: ${Object.keys(ordered).length} bölüm çözümlü`);
} else {
  const wanted = args.map(Number).filter(Boolean);
  const numbers = wanted.length ? wanted : LEVELS.map(level => level.number);
  await mkdir(OUT, { recursive: true });
  for (const number of numbers) {
    const t0 = Date.now();
    const result = solveLevel(number);
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    if (result.solved) {
      await writeFile(new URL(ONLY_GEM >= 0 ? `gem-${number}-${ONLY_GEM}.json` : GEMS ? `gems-${number}.json` : `level-${number}.json`, OUT), JSON.stringify({ ticks: TICKS, steps: result.actions.map(encode) }));
      console.log(`bölüm ${number}: ÇÖZÜLDÜ · ${result.steps} adım (${(result.steps * TICKS / 120).toFixed(1)} sn oyun) · ${seconds} sn`);
    } else console.log(`bölüm ${number}: çözülemedi (${result.reason}, en iyi uzaklık ${result.best} kare${result.at ? `, en iyi konum x=${result.at.x} y=${result.at.y}, kristal ${result.at.gems}` : ''}) · ${seconds} sn`);
  }
}
