// Zıp Zıp v2 bölümleri. Her bölüm küçük bir kurucu (builder) ile tile koordinatlarında çizilir
// ve `parse` ile motorun kullandığı düz veriye dönüşür. 1 tile = 32 px, görünüm 30 × 17 tile.
export const TILE = 32;
export const T = { EMPTY: 0, SOLID: 1, ONEWAY: 2, SPIKE_UP: 3, SPIKE_DOWN: 4, SPIKE_LEFT: 5, SPIKE_RIGHT: 6, LAVA: 7, CRUMBLE: 8, STATUE: 9 };

// Harita karakterleri:
// #  zemin        =  tek yönlü platform   ^ v < >  dikenler (sivri ucun yönü)   ~  lav
// x  çöken blok   P  başlangıç   E  çıkış   o  kristal   C  kontrol noktası   s  yay
// *  dash küresi  w  yürüyen düşman   f  uçan düşman   S  sabit testere   g  gayzer
// L / R  sola / sağa ateş atan heykel
const CHAR_TILES = { '#': T.SOLID, '=': T.ONEWAY, '^': T.SPIKE_UP, v: T.SPIKE_DOWN, '<': T.SPIKE_LEFT, '>': T.SPIKE_RIGHT, '~': T.LAVA, x: T.CRUMBLE, L: T.STATUE, R: T.STATUE };

export const WORLDS = [
  { id: 0, name: 'Orman', icon: '🌿', description: 'Koş, zıpla, duvarlardan sek ve ilk dash\'ini at.' },
  { id: 1, name: 'Saat Kulesi', icon: '⚙️', description: 'Hareketli dişliler, çöken zeminler, testereler ve dash küreleri.' },
  { id: 2, name: 'Volkan', icon: '🌋', description: 'Gayzerler, sıcak rüzgârlar, ateş heykelleri ve yükselen lav.' }
];

function builder(cols, rows) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
  const extras = { signs: [], movers: [], saws: [], winds: [], rising: null, geyser: {}, statue: {}, flyer: {} };
  const inside = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  const b = {
    cols, rows, ground: rows - 2, extras,
    fill(x, y, w, h, ch = '#') { for (let r = y; r < y + h; r += 1) for (let c = x; c < x + w; c += 1) if (inside(c, r)) grid[r][c] = ch; return b; },
    row(x, y, w, ch = '#') { return b.fill(x, y, w, 1, ch); },
    col(x, y, h, ch = '#') { return b.fill(x, y, 1, h, ch); },
    put(x, y, ch) { if (inside(x, y)) grid[y][x] = ch; return b; },
    clear(x, y, w, h) { return b.fill(x, y, w, h, ' '); },
    // Zemin: alttan iki sıra; `pit` ile boşluk açılır.
    floor(x = 0, w = cols, depth = 2) { return b.fill(x, rows - depth, w, depth); },
    pit(x, w) { return b.clear(x, 0, w, rows); },
    lava(x, w, depth = 2) { return b.clear(x, 0, w, rows).fill(x, rows - depth, w, depth, '~'); },
    sign(x, y, text) { extras.signs.push({ x, y, text }); return b; },
    // Hareketli platform: (x, y) başlangıç, w genişlik, dx/dy tile cinsinden yol, period saniye.
    mover(x, y, w, dx, dy, period = 3, offset = 0) { extras.movers.push({ x, y, w, dx, dy, period, offset }); return b; },
    // Testere: sabitse sadece (x, y); hareketliyse dx/dy yol, loop=true ise elips yörünge.
    saw(x, y, { r = 15, dx = 0, dy = 0, period = 0, offset = 0, loop = false } = {}) { extras.saws.push({ x, y, r, dx, dy, period, offset, loop }); return b; },
    wind(x, y, w, h, force) { extras.winds.push({ x, y, w, h, force }); return b; },
    rising(speed, delay = 1.2, gap = 9) { extras.rising = { speed, delay, gap }; return b; },
    geyser(x, y, w = 1, { period = 2.6, active = 1, offset = 0, height = 4 } = {}) {
      for (let i = 0; i < w; i += 1) { b.put(x + i, y, 'g'); extras.geyser[`${x + i},${y}`] = { period, active, offset, height }; }
      return b;
    },
    statue(x, y, dir, every = 1.9, delay = 0) { b.put(x, y, dir < 0 ? 'L' : 'R'); extras.statue[`${x},${y}`] = { every, delay }; return b; },
    flyerPath(x, y, range, period = 2.2) { extras.flyer[`${x},${y}`] = { range, period }; return b; },
    lines() { return grid.map(r => r.join('')); }
  };
  return b;
}

function parse(number, world, title, par, b) {
  const { cols, rows, extras } = b;
  const lines = b.lines();
  const grid = new Uint8Array(cols * rows);
  const crumbleIndex = new Int16Array(cols * rows).fill(-1);
  const level = {
    number, world, title, par, cols, rows, grid, crumbleIndex,
    spawn: null, exit: null, gems: [], checkpoints: [], crumbles: [], orbs: [], springs: [], enemies: [], statues: [], geysers: [],
    movers: extras.movers.map(m => ({ x: m.x * TILE, y: m.y * TILE, w: m.w * TILE, dx: m.dx * TILE, dy: m.dy * TILE, period: m.period, offset: m.offset })),
    saws: extras.saws.map(s => ({ x: (s.x + 0.5) * TILE, y: (s.y + 0.5) * TILE, r: s.r, dx: s.dx * TILE, dy: s.dy * TILE, period: s.period, offset: s.offset, loop: s.loop })),
    signs: extras.signs.map(s => ({ x: (s.x + 0.5) * TILE, y: (s.y + 0.5) * TILE, text: s.text })),
    winds: extras.winds.map(w => ({ x: w.x * TILE, y: w.y * TILE, w: w.w * TILE, h: w.h * TILE, force: w.force })),
    rising: null
  };
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const ch = lines[y][x];
      const px = x * TILE; const py = y * TILE; const cx = px + TILE / 2; const cy = py + TILE / 2; const bottom = py + TILE;
      const i = y * cols + x;
      if (CHAR_TILES[ch] !== undefined) grid[i] = CHAR_TILES[ch];
      if (ch === 'x') { crumbleIndex[i] = level.crumbles.length; level.crumbles.push({ x: px, y: py }); }
      else if (ch === 'P') level.spawn = { x: cx, y: bottom };
      else if (ch === 'E') level.exit = { x: cx, y: bottom };
      else if (ch === 'o') level.gems.push({ x: cx, y: cy });
      else if (ch === 'C') level.checkpoints.push({ x: cx, y: bottom });
      else if (ch === '*') level.orbs.push({ x: cx, y: cy });
      else if (ch === 's') level.springs.push({ x: px, y: py });
      else if (ch === 'w') level.enemies.push({ kind: 'walker', x: px + 4, y: bottom - 22, w: 24, h: 22 });
      else if (ch === 'f') { const f = extras.flyer[`${x},${y}`] || { range: 40, period: 2.2 }; level.enemies.push({ kind: 'flyer', x: px + 3, y: py + 4, w: 26, h: 24, range: f.range, period: f.period, phase: x * 0.7 }); }
      else if (ch === 'S') level.saws.push({ x: cx, y: cy, r: 15, dx: 0, dy: 0, period: 0, offset: 0, loop: false });
      else if (ch === 'g') { const g = extras.geyser[`${x},${y}`] || { period: 2.6, active: 1, offset: x * 0.31, height: 4 }; level.geysers.push({ x: px, y: py, height: g.height * TILE, period: g.period, active: g.active, offset: g.offset }); grid[i] = T.SOLID; }
      else if (ch === 'L' || ch === 'R') { const s = extras.statue[`${x},${y}`] || { every: 1.9, delay: 0 }; level.statues.push({ x: px, y: py, dir: ch === 'L' ? -1 : 1, every: s.every, delay: s.delay }); }
    }
  }
  if (extras.rising) level.rising = { speed: extras.rising.speed, delay: extras.rising.delay, gap: extras.rising.gap * TILE, startY: rows * TILE + 8 };
  return level;
}

const levels = [];
function level(world, title, par, cols, rows, draw) {
  const b = builder(cols, rows);
  draw(b, b.ground);
  levels.push(parse(levels.length + 1, world, title, par, b));
}

// ================================================================ 1. Orman
level(0, 'İlk adımlar', 25, 92, 17, (b, G) => {
  b.floor();
  b.put(3, G - 1, 'P').sign(6, G - 4, '← →  koş');
  b.fill(11, G - 2, 2, 2);
  b.sign(17, G - 6, 'Boşluk: zıpla · basılı tut, daha yükseğe');
  b.pit(16, 3);
  b.row(22, G - 3, 6, '=').put(24, G - 5, 'o');
  b.row(32, G - 1, 3, '^').sign(33, G - 5, 'Dikenlere dokunma!');
  b.put(40, G - 1, 'C').sign(40, G - 5, 'Bayrak: kontrol noktası');
  b.fill(44, G - 2, 3, 2).fill(47, G - 4, 3, 4).fill(50, G - 6, 3, 6);
  b.pit(53, 6).put(56, G - 8, 'o');
  b.row(66, G - 1, 2, '^');
  b.row(70, G - 3, 3, '=').row(74, G - 6, 4, '=').put(75, G - 8, 'o');
  b.put(86, G - 1, 'E').sign(86, G - 5, 'Çıkış');
});

level(0, 'Dikenli patika', 26, 100, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P');
  b.row(8, G - 3, 4, '=').row(13, G - 6, 4, '=').put(14, G - 8, 'o');
  b.pit(18, 4);
  // Alçak tavan: tam zıplama tavandaki dikenlere değer, kısa zıplama geçer.
  b.fill(26, 0, 15, 11).row(26, 11, 15, 'v');
  b.row(30, G - 1, 3, '^').row(36, G - 1, 2, '^');
  b.sign(22, G - 6, 'Kısa bas: alçak zıpla');
  b.put(44, G - 1, 'C');
  b.row(48, G - 3, 3, '=').row(51, G - 6, 3, '=').row(54, G - 9, 3, '=').put(55, G - 11, 'o');
  b.pit(60, 20).fill(64, 12, 2, 5).fill(70, 10, 2, 7).fill(76, 12, 2, 5).put(73, 6, 'o');
  b.row(86, G - 1, 2, '^');
  b.put(95, G - 1, 'E');
});

level(0, 'Duvar tırmanışı', 28, 100, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P');
  // Baca 1: asılı sol duvar + dolu sağ blok
  b.fill(10, 2, 2, 10).fill(15, 2, 12, 13).put(13, 6, 'o');
  b.sign(6, 8, 'Duvara doğru bas + zıpla');
  b.put(21, 1, 'C');
  b.row(28, G - 1, 3, '^');
  // Baca 2: daha geniş ve yüksek
  b.fill(33, 3, 2, 10).fill(39, 3, 10, 12).put(36, 5, 'o');
  b.put(44, 2, 'C');
  b.pit(49, 5);
  // Baca 3: dikenli taban üzerinde, tek duvarlı tırmanış
  b.fill(58, 5, 2, 10).row(60, G - 1, 4, '^').fill(64, 2, 12, 13);
  b.put(61, 3, 'o');
  b.row(80, G - 1, 3, '^');
  b.put(94, G - 1, 'E');
});

level(0, 'Mantar zıplama', 27, 100, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P');
  b.put(10, G - 1, 's').fill(12, 8, 10, 7).put(17, 4, 'o');
  b.sign(8, 9, 'Mantara bas, yüksel!');
  b.pit(22, 8).fill(25, 13, 2, 4).put(25, 12, 's');
  b.fill(30, 6, 8, 11).put(33, 5, 'C');
  b.put(40, G - 1, 's').row(42, G - 1, 6, '^').put(44, 5, 'o');
  b.put(48, G - 1, 's').fill(50, 8, 3, 7);
  b.pit(56, 16).fill(60, 14, 2, 3).put(60, 13, 's').fill(66, 14, 2, 3).put(66, 13, 's').put(64, 3, 'o');
  b.row(80, G - 1, 3, '^').row(86, G - 1, 3, '^');
  b.put(95, G - 1, 'E');
});

level(0, 'İlk dash', 27, 106, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P').sign(6, G - 5, 'X / Shift: dash at!');
  b.pit(10, 8).put(14, 11, 'o');
  b.sign(21, G - 6, 'Yön + dash: 8 yöne atıl');
  b.fill(26, 9, 5, 6).put(28, 3, 'o');
  b.put(34, G - 1, 'C');
  // Tavanlı diken koridoru
  b.fill(40, 0, 20, 11).row(43, G - 1, 6, '^').row(50, G - 1, 5, '^');
  b.pit(62, 9).put(66, 8, 'o');
  b.fill(71, 11, 12, 6);
  b.put(100, G - 1, 'E');
});

level(0, 'Yukarı atılış', 26, 40, 34, (b, G) => {
  b.floor();
  b.put(3, G - 1, 'P');
  b.row(14, G - 1, 6, '^');
  b.fill(8, 29, 6, 1).fill(18, 26, 6, 1);
  b.fill(30, 22, 9, 1);
  // Baca: platformun üstünde iki duvar arası
  b.fill(30, 8, 2, 12).fill(36, 6, 2, 14).put(34, 12, 'o');
  b.fill(20, 8, 12, 1).put(24, 7, 'C');
  b.row(20, 9, 8, 'v');
  b.fill(7, 5, 9, 1).put(9, 4, 'E');
  b.put(20, 17, 'o').put(15, 1, 'o');
});

level(0, 'Orman devriyesi', 29, 110, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P').sign(8, G - 5, 'Düşmanın üstüne zıpla!');
  b.put(14, G - 1, 'w').put(22, G - 1, 'w');
  b.fill(26, 13, 3, 2).fill(29, 11, 7, 4).put(32, 10, 'w');
  b.pit(36, 10).put(39, 10, 'f').put(43, 9, 'f').put(41, 5, 'o');
  b.put(48, G - 1, 'C');
  b.row(56, G - 1, 20, '^');
  b.row(55, 12, 6, '=').put(57, 11, 'w').row(63, 10, 6, '=').put(65, 9, 'w').row(71, 12, 6, '=').put(73, 11, 'w').put(66, 6, 'o');
  b.pit(79, 10).put(81, 11, 'f').put(86, 11, 'f').put(84, 6, 'o');
  b.put(104, G - 1, 'E');
});

level(0, 'Ormanın kalbi', 39, 150, 22, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P');
  b.put(8, G - 1, 's').fill(11, 13, 10, 1).put(15, 10, 'o');
  b.fill(26, 11, 6, 11);
  b.pit(32, 8).put(35, 10, 'f').put(38, 8, 'f');
  b.fill(40, 12, 13, 10).put(44, 11, 'C');
  b.fill(48, 2, 2, 8).fill(53, 2, 3, 20).put(51, 5, 'o');
  b.row(56, G - 1, 40, '^');
  b.fill(58, 8, 10, 1).put(62, 7, 'w');
  b.fill(70, 10, 6, 1).put(74, 9, 's');
  b.fill(78, 3, 8, 1).put(82, 1, 'o');
  b.fill(80, 12, 6, 1).fill(90, 10, 6, 1);
  b.put(100, G - 1, 'C');
  b.pit(104, 8);
  b.fill(120, 13, 4, 7);
  b.pit(126, 8);
  b.put(145, G - 1, 'E');
});

// ================================================================ 2. Saat Kulesi
level(1, 'Dişli asansör', 26, 106, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P').sign(6, 10, 'Hareketli platformlara bin');
  b.pit(10, 14).mover(11, 12, 3, 8, 0, 4);
  b.pit(28, 6).mover(29, 13, 3, 0, -7, 3.5).put(30, 3, 'o');
  b.fill(34, 6, 8, 11).put(37, 5, 'C');
  b.pit(42, 22).mover(44, 8, 3, 6, 0, 3).mover(54, 10, 3, 0, -4, 2.5, 0.5).put(58, 3, 'o');
  b.pit(70, 16).fill(72, 0, 12, 6).row(72, 6, 12, 'v').mover(71, 11, 3, 11, 0, 4.5).put(78, 9, 'o');
  b.row(90, G - 1, 2, '^');
  b.put(100, G - 1, 'E');
});

level(1, 'Çürük kalas', 28, 108, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P').sign(6, 10, 'Sarı bloklar basınca çöker');
  b.pit(10, 12).row(12, 13, 8, 'x');
  b.row(24, G - 1, 13, '^').row(25, 12, 3, 'x').row(29, 9, 3, 'x').row(33, 6, 3, 'x').put(34, 3, 'o');
  b.fill(37, 6, 8, 11).put(41, 5, 'C');
  b.pit(45, 18).row(48, 8, 2, 'x').row(53, 9, 2, 'x').row(58, 8, 2, 'x').put(56, 5, 'o');
  b.row(66, 12, 2, 'x').fill(69, 9, 3, 6);
  b.pit(75, 10).row(79, 11, 2, 'x').put(80, 7, 'o');
  b.put(100, G - 1, 'E');
});

level(1, 'Testere koridoru', 30, 116, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P').sign(6, 10, 'Testerelerden uzak dur');
  b.put(12, G - 1, 'S').saw(18, G - 1, { dx: 6, period: 2.6 }).put(21, 10, 'o');
  b.fill(30, 0, 16, 8).saw(34, 9, { dy: 5, period: 1.8 }).saw(40, G - 1, { dy: -5, period: 1.8 });
  b.put(48, G - 1, 'C');
  b.pit(52, 14).mover(53, 11, 3, 9, 0, 4).saw(58, 7, { dx: 2.5, dy: 2.5, period: 2.2, loop: true }).put(58, 7, 'o');
  b.saw(72, 10, { dy: 4, period: 1.5 }).saw(76, 10, { dy: 4, period: 1.5, offset: 0.33 }).saw(80, 10, { dy: 4, period: 1.5, offset: 0.66 }).put(76, 8, 'o');
  b.row(86, G - 1, 2, '^').put(90, G - 1, 'C');
  b.pit(94, 8).saw(98, 11, { r: 18 });
  b.put(110, G - 1, 'E');
});

level(1, 'Enerji küresi', 31, 128, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P').sign(6, 10, 'Yeşil küre dash hakkını yeniler');
  b.pit(10, 16).put(15, 12, '*').put(20, 12, '*').put(18, 9, 'o');
  b.fill(34, 3, 12, 12).put(31, 10, '*').put(31, 6, '*').put(40, 2, 'C');
  b.pit(46, 30).put(51, 4, '*').put(56, 5, '*').put(61, 4, '*').put(66, 5, '*').put(71, 4, '*').put(61, 1, 'o');
  b.fill(76, 6, 10, 11);
  b.pit(95, 12).put(99, 11, '*').put(103, 9, '*').put(103, 6, 'o');
  b.put(120, G - 1, 'E');
});

level(1, 'Kule tırmanışı', 34, 36, 40, (b, G) => {
  b.floor();
  b.put(3, G - 1, 'P');
  b.mover(8, 35, 4, 0, -8, 3.2);
  b.fill(14, 27, 8, 1).put(18, 24, 'o').row(22, 27, 4, 'x');
  b.fill(28, 24, 8, 1).put(31, 23, 'C');
  b.fill(26, 10, 2, 12).fill(33, 8, 3, 14).put(30, 14, 'o');
  b.fill(14, 10, 14, 1).saw(15, 9, { dx: 8, period: 3 });
  b.mover(4, 10, 4, 0, -6, 3);
  b.fill(10, 4, 10, 1).put(16, 3, 'E').put(3, 2, 'o');
});

level(1, 'Yörüngeler', 31, 120, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P');
  b.saw(12, 11, { dx: 2.5, dy: 2.5, period: 2.4, loop: true });
  b.fill(20, 11, 4, 4);
  b.pit(24, 16).fill(28, 9, 2, 8).fill(35, 9, 2, 8);
  b.saw(28, 8, { dx: 2, dy: 2, period: 2, loop: true }).saw(35, 8, { dx: 2, dy: 2, period: 2, loop: true, offset: 0.5 }).put(32, 5, 'o');
  b.put(44, G - 1, 'C');
  b.pit(48, 20).mover(49, 10, 3, 7, 0, 3).mover(60, 12, 3, 0, -6, 3, 0.25).saw(56, 6, { dx: 3, dy: 3, period: 3, loop: true }).put(56, 6, 'o');
  b.fill(66, 6, 6, 11).put(69, 5, 'C');
  b.saw(80, 12, { dx: 3, dy: 3, period: 1.8, loop: true }).saw(90, 12, { dx: 3, dy: 3, period: 1.8, loop: true, offset: 0.5 }).put(85, 8, 'o');
  b.put(112, G - 1, 'E');
});

level(1, 'Zaman baskısı', 34, 124, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P');
  b.pit(8, 20).row(10, 12, 3, 'x').row(16, 11, 3, 'x').row(22, 12, 3, 'x').saw(19, 8, { dy: 2, period: 1.2 }).put(19, 5, 'o');
  b.put(30, G - 1, 'C');
  b.fill(34, 4, 3, 11).put(32, 11, '*').put(32, 7, '*');
  b.row(37, 4, 10, 'x').row(37, G - 1, 10, '^').put(42, 2, 'o');
  b.put(50, G - 1, 'C');
  b.pit(54, 24).put(58, 10, '*').put(64, 8, '*').put(70, 10, '*').saw(61, 12, { r: 16 }).saw(67, 5, { r: 16 }).row(74, 11, 3, 'x').put(73, 7, 'o');
  b.row(90, G - 1, 3, '^').row(98, G - 1, 3, '^');
  b.put(116, G - 1, 'E');
});

level(1, 'Büyük saat', 38, 150, 22, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P');
  b.pit(8, 12).mover(9, 17, 3, 7, 0, 3).saw(14, 14, { dy: 3, period: 1.6 });
  b.fill(24, 10, 2, 8).fill(29, 8, 3, 13).put(27, 12, 'o');
  b.pit(32, 30).fill(32, 8, 10, 1).put(36, 7, 'C').row(42, 8, 6, 'x');
  b.put(51, 7, '*').put(56, 6, '*').fill(60, 7, 8, 1).saw(64, 6, { dx: 3, period: 1.5 });
  b.fill(62, 8, 2, 14);
  b.put(66, G - 1, 'C');
  b.pit(72, 26).mover(73, 16, 3, 0, -7, 3).mover(79, 9, 3, 8, 0, 3.5).put(90, 6, '*').saw(86, 13, { dx: 2, dy: 2, period: 2, loop: true }).put(86, 13, 'o');
  b.fill(98, 10, 6, 12).put(101, 9, 'C');
  b.row(104, G - 1, 30, '^').row(106, 13, 3, 'x').row(112, 11, 3, 'x').row(118, 13, 3, 'x').put(124, 11, '*').row(128, 9, 3, 'x').put(115, 7, 'o');
  b.fill(134, 12, 16, 10);
  b.put(144, 11, 'E');
});

// ================================================================ 3. Volkan
level(2, 'Sıcak adımlar', 26, 104, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P').sign(6, 10, 'Lava dokunma!');
  b.lava(10, 4);
  b.lava(18, 6).row(20, 12, 2, '=').put(21, 9, 'o');
  b.lava(28, 10).fill(31, 12, 2, 5).fill(35, 11, 2, 6);
  b.put(41, G - 1, 'C');
  b.fill(44, 11, 6, 4);
  b.lava(50, 14).row(53, 10, 3, '=').row(58, 8, 3, '=').put(59, 5, 'o').row(62, 11, 2, '=');
  b.lava(70, 8).put(73, 9, 'o');
  b.row(84, G - 1, 2, '^');
  b.put(98, G - 1, 'E');
});

level(2, 'Gayzer vadisi', 35, 110, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P').sign(7, 9, 'Gayzer fışkırmadan geç');
  b.geyser(12, G, 2, { period: 2.4, active: 1 });
  b.geyser(19, G, 3, { period: 2.4, active: 1, offset: 1.2 }).put(20, 9, 'o');
  b.fill(26, 12, 4, 3).geyser(33, G, 2, { period: 2, active: 0.9, offset: 0.5, height: 5 });
  b.put(38, G - 1, 'C');
  b.lava(42, 16).fill(44, 11, 4, 1).geyser(45, 11, 2, { period: 2.6, active: 1.1, offset: 0 }).fill(51, 9, 4, 1).geyser(52, 9, 2, { period: 2.6, active: 1.1, offset: 1.3 }).put(49, 5, 'o');
  b.put(62, G - 1, 'C');
  b.fill(66, 0, 20, 8).geyser(69, G, 2, { period: 1.8, active: 0.8, height: 7 }).geyser(75, G, 2, { period: 1.8, active: 0.8, offset: 0.6, height: 7 }).geyser(81, G, 2, { period: 1.8, active: 0.8, offset: 1.2, height: 7 });
  b.put(78, 10, 'o');
  b.put(104, G - 1, 'E');
});

level(2, 'Kavurucu rüzgâr', 27, 112, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P').sign(6, 10, 'Rüzgâr seni iter');
  b.wind(10, 0, 20, 17, -150).lava(14, 4).lava(22, 5).put(24, 9, 'o');
  b.put(32, G - 1, 'C');
  b.wind(36, 0, 26, 17, 220).lava(40, 18).row(46, 12, 2, '=').row(52, 10, 2, '=').put(53, 6, 'o');
  b.put(64, G - 1, 'C');
  b.fill(68, 10, 28, 1).wind(68, 0, 28, 10, -230).put(84, 7, 'o');
  b.lava(72, 3).lava(80, 3).lava(88, 3);
  b.put(106, G - 1, 'E');
});

level(2, 'Ateş heykelleri', 28, 112, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P').sign(7, 10, 'Ateş toplarından zıpla');
  b.statue(24, G - 1, -1, 1.7);
  b.fill(30, 11, 8, 4).statue(37, 10, -1, 1.5, 0.7).put(33, 7, 'o');
  b.put(44, G - 1, 'C');
  b.lava(48, 14).fill(50, 12, 3, 1).fill(56, 10, 3, 1).fill(61, 12, 3, 1).statue(47, 9, 1, 1.3).put(57, 6, 'o');
  b.put(68, G - 1, 'C');
  b.fill(72, 0, 22, 9).statue(93, G - 1, -1, 1.1).statue(93, G - 3, -1, 1.1, 0.55).put(83, 11, 'o');
  b.put(106, G - 1, 'E');
});

level(2, 'Lav köprüsü', 29, 120, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P');
  b.lava(8, 20).row(10, 12, 3, 'x').row(15, 11, 3, 'x').row(20, 12, 3, 'x').put(16, 8, 'o');
  b.put(31, G - 1, 'C');
  b.lava(34, 26).put(38, 11, '*').put(44, 10, '*').row(48, 12, 2, 'x').put(53, 10, '*').put(49, 7, 'o');
  b.put(64, G - 1, 'C');
  b.lava(68, 30).row(71, 12, 4, 'x').geyser(76, 11, 1, { period: 2, active: 0.8 }).fill(76, 12, 1, 1).row(79, 10, 3, 'x').put(85, 9, '*').row(89, 11, 4, 'x').put(86, 5, 'o');
  b.put(114, G - 1, 'E');
});

level(2, 'Kül fırtınası', 37, 130, 17, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P');
  b.wind(8, 0, 30, 17, -130).geyser(14, G, 2, { period: 2.2, active: 0.9 }).statue(30, G - 1, -1, 1.8).lava(20, 5).put(22, 9, 'o');
  b.put(40, G - 1, 'C');
  b.lava(44, 24).wind(44, 0, 24, 17, 180).fill(48, 11, 3, 1).geyser(49, 11, 1, { period: 2.4, active: 0.8, offset: 0.4 }).fill(55, 9, 3, 1).fill(62, 11, 3, 1).put(56, 5, 'o');
  b.put(72, G - 1, 'C');
  b.fill(76, 4, 3, 11).put(74, 10, '*').statue(79, 4, 1, 1.6).fill(79, 5, 16, 1).lava(80, 14).fill(79, 5, 16, 1).put(88, 2, 'o');
  b.put(96, G - 1, 'C');
  b.geyser(100, G, 2, { period: 1.6, active: 0.7 }).geyser(106, G, 2, { period: 1.6, active: 0.7, offset: 0.8 }).wind(98, 0, 16, 17, -120);
  b.put(124, G - 1, 'E');
});

level(2, 'Yükselen lav', 34, 30, 56, (b, G) => {
  b.floor();
  b.put(15, G - 1, 'P').sign(15, G - 5, 'Lav yükseliyor, tırman!');
  b.rising(40, 2.5, 8);
  b.fill(3, 50, 7, 1).fill(12, 47, 6, 1).put(14, 44, 'o').fill(21, 44, 7, 1);
  b.fill(19, 28, 2, 13).fill(25, 26, 5, 15).put(22, 34, 'o');
  b.fill(8, 28, 13, 1).put(12, 27, 'C');
  b.mover(2, 27, 4, 0, -7, 3).put(4, 16, 'o');
  b.fill(8, 20, 8, 1).row(16, 20, 4, 'x').fill(22, 17, 8, 1).put(26, 16, 'C');
  b.put(26, 12, '*').put(21, 9, '*');
  b.fill(6, 7, 12, 1).put(10, 6, 'E');
});

level(2, 'Zıp Zıp finali', 51, 180, 22, (b, G) => {
  b.floor();
  b.put(2, G - 1, 'P');
  b.put(8, G - 1, 's').fill(11, 12, 8, 10).fill(13, 4, 2, 5).put(14, 2, 'o');
  b.lava(19, 12).put(22, 10, '*').put(27, 11, '*');
  b.fill(31, 10, 6, 12).put(34, 9, 'C');
  b.fill(37, 16, 20, 6).lava(37, 20).fill(40, 12, 3, 1).statue(56, 10, -1, 1.6).fill(47, 11, 10, 11);
  b.fill(60, 4, 2, 10).fill(65, 2, 3, 20).row(62, G - 1, 3, '^').put(63, 6, 'o');
  b.put(76, G - 1, 'C');
  b.pit(80, 22).mover(81, 15, 3, 7, 0, 3).saw(92, 13, { dx: 2, dy: 2, period: 1.8, loop: true }).mover(96, 14, 3, 0, -6, 2.8).row(101, 8, 3, 'x');
  b.put(110, G - 1, 'C');
  b.wind(112, 0, 24, 22, -140).geyser(116, G, 2, { period: 2, active: 0.8 }).geyser(122, G, 2, { period: 2, active: 0.8, offset: 1 }).statue(134, G - 1, -1, 1.5);
  b.put(140, G - 1, 'C');
  b.lava(144, 26).put(148, 12, '*').put(154, 10, '*').put(160, 12, '*').put(157, 6, 'o').row(165, 13, 3, 'x');
  b.put(175, G - 1, 'E');
});

export const LEVELS = levels;
