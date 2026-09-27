// Zıpkın: Volkana Yolculuk çizim katmanı: kamera, tile önbelleği, paralaks arka plan, karakter animasyonu, parçacıklar ve HUD.
// Oyun mantığına dokunmaz; `run` durumunu ve `run.events` olaylarını okur.
import { TILE, T, WORLDS } from './levels.js?v=202609280150';
import { PLAYER_H, PLAYER_W, geyserActive } from './logic.js?v=202609280150';

export const VIEW_W = 960;
export const VIEW_H = 540;
const CHUNK = 16;

const PALETTES = [
  { sky: ['#0d1b3a', '#1c4466', '#3d8a88'], far: '#1a3a55', mid: '#15304a', near: '#10263b', body: '#3b2f52', body2: '#302645', top: '#62e38a', top2: '#35b56a', edge: '#1d1630', accent: '#62e38a', glow: '#b7ffcf', ambient: '#d9ff9a', plank: '#9a6b4a' },
  { sky: ['#160f33', '#35275f', '#7c5aa6'], far: '#2a2152', mid: '#231b47', near: '#1b153a', body: '#3a3d5e', body2: '#30334f', top: '#f4bd4f', top2: '#c98b2c', edge: '#1c1d33', accent: '#f4bd4f', glow: '#ffe3a1', ambient: '#ffd98a', plank: '#b98a3a' },
  { sky: ['#1a0a14', '#4b1426', '#c24a2e'], far: '#3a1224', mid: '#2c0e1c', near: '#1f0914', body: '#33232f', body2: '#291b26', top: '#ff7b3d', top2: '#d0492a', edge: '#150b12', accent: '#ff8a3d', glow: '#ffd08a', ambient: '#ffb35c', plank: '#6d4a3d' }
];
// Zıpkın paleti: dash hakkı varken kor turuncusu, bitince sönük; tepe camgöbeği, dash izi parlak camgöbeği.
const HERO = {
  ready: '#ff7a2f', readyLight: '#ffd27a', readyDark: '#c2410c',
  used: '#9c7b6b', usedLight: '#cdb7a8', usedDark: '#5d463b',
  crest: '#35d6e8', crestDark: '#0e7c8c', crestUsed: '#6f848c',
  outline: '#10183a', streak: '#5ff0ff'
};

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function createRenderer(canvas, getSettings) {
  const ctx = canvas.getContext('2d');
  let level = null;
  let pal = PALETTES[0];
  let chunks = [];
  let chunkRes = 0;
  let backgrounds = null;
  let lavaTiles = [];
  const cam = { x: 0, y: 0, shake: 0, flash: 0, flashColor: '#fff' };
  const particles = [];
  const texts = [];
  const trail = [];
  const hero = { sx: 1, sy: 1, blink: 2, pop: 0, flashWhite: 0, antenna: 0, antennaV: 0, trailTimer: 0, hidden: false };
  const springAnim = new Map();
  let banner = 0;
  let res = 1;
  let viewScale = 1;
  let clock = 0;

  const reduced = () => Boolean(getSettings().reducedMotion);

  // ------------------------------------------------------------ boyut
  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || VIEW_W;
    const height = canvas.clientHeight || width * (VIEW_H / VIEW_W);
    const w = Math.round(width * ratio); const h = Math.round(height * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    viewScale = width / VIEW_W;
    const nextRes = Math.min(2.5, Math.max(0.5, ratio * viewScale));
    if (level && Math.abs(nextRes - chunkRes) > 0.05) { res = nextRes; buildChunks(); }
    res = nextRes;
  }

  // ------------------------------------------------------------ bölüm kurulumu
  function setLevel(next, run) {
    level = next; pal = PALETTES[level.world];
    particles.length = 0; texts.length = 0; trail.length = 0; springAnim.clear();
    lavaTiles = [];
    for (let ty = 0; ty < level.rows; ty += 1) for (let tx = 0; tx < level.cols; tx += 1) if (level.grid[ty * level.cols + tx] === T.LAVA) lavaTiles.push({ tx, ty, top: ty === 0 || level.grid[(ty - 1) * level.cols + tx] !== T.LAVA });
    resize();
    buildChunks();
    backgrounds = buildBackgrounds(level.world);
    snapCamera(run);
    banner = 2.2; hero.pop = 1; hero.hidden = false;
  }

  function tileAt(tx, ty) {
    if (tx < 0 || tx >= level.cols) return T.SOLID;
    if (ty < 0 || ty >= level.rows) return T.EMPTY;
    return level.grid[ty * level.cols + tx];
  }
  const solidish = tile => tile === T.SOLID || tile === T.STATUE;

  function buildChunks() {
    chunkRes = res;
    chunks = [];
    const count = Math.ceil(level.cols / CHUNK);
    for (let i = 0; i < count; i += 1) {
      const c = document.createElement('canvas');
      const cols = Math.min(CHUNK, level.cols - i * CHUNK);
      c.width = Math.ceil(cols * TILE * res); c.height = Math.ceil(level.rows * TILE * res);
      const g = c.getContext('2d');
      g.setTransform(res, 0, 0, res, -i * CHUNK * TILE * res, 0);
      for (let ty = 0; ty < level.rows; ty += 1) for (let tx = i * CHUNK; tx < i * CHUNK + cols; tx += 1) drawStaticTile(g, tx, ty);
      chunks.push(c);
    }
  }

  function drawStaticTile(g, tx, ty) {
    const tile = tileAt(tx, ty);
    const x = tx * TILE; const y = ty * TILE;
    if (tile === T.SOLID) {
      const up = !solidish(tileAt(tx, ty - 1)); const down = !solidish(tileAt(tx, ty + 1));
      const left = !solidish(tileAt(tx - 1, ty)); const right = !solidish(tileAt(tx + 1, ty));
      const r = 9;
      g.fillStyle = (tx + ty) % 2 ? pal.body : pal.body2;
      g.beginPath(); g.roundRect(x, y, TILE, TILE, [up && left ? r : 0, up && right ? r : 0, down && right ? r : 0, down && left ? r : 0]); g.fill();
      const rand = seeded(tx * 7919 + ty * 104729);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let k = 0; k < 2; k += 1) { g.beginPath(); g.arc(x + 6 + rand() * 20, y + 10 + rand() * 18, 1.5 + rand() * 2.5, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = pal.edge;
      if (down) g.fillRect(x + (left ? r : 0), y + TILE - 3, TILE - (left ? r : 0) - (right ? r : 0), 3);
      if (left) g.fillRect(x, y + (up ? r : 0), 2, TILE - (up ? r : 0) - (down ? r : 0));
      if (right) g.fillRect(x + TILE - 2, y + (up ? r : 0), 2, TILE - (up ? r : 0) - (down ? r : 0));
      if (up) {
        g.fillStyle = pal.top2; g.beginPath(); g.roundRect(x, y, TILE, 10, [left ? r : 0, right ? r : 0, 2, 2]); g.fill();
        g.fillStyle = pal.top; g.beginPath(); g.roundRect(x, y, TILE, 7, [left ? r : 0, right ? r : 0, 0, 0]); g.fill();
        if (level.world === 0) {
          g.fillStyle = pal.top2;
          for (let k = 0; k < 3; k += 1) { const bx = x + 4 + rand() * 24; g.beginPath(); g.moveTo(bx, y + 9); g.lineTo(bx + 2, y + 14 + rand() * 4); g.lineTo(bx + 4, y + 9); g.fill(); }
          if (rand() < 0.18) { g.fillStyle = rand() < 0.5 ? '#ffd4f0' : '#fff3a8'; g.beginPath(); g.arc(x + 6 + rand() * 20, y - 1, 2.2, 0, Math.PI * 2); g.fill(); }
        } else if (level.world === 1) {
          g.fillStyle = 'rgba(40,24,6,0.35)'; g.fillRect(x + 5, y + 3, 3, 2); g.fillRect(x + 22, y + 3, 3, 2);
        } else {
          g.fillStyle = 'rgba(255,220,140,0.35)'; g.fillRect(x + 3 + rand() * 20, y + 2, 6, 2);
        }
      }
    } else if (tile === T.ONEWAY) {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 5, y + 10, 3, 14); g.fillRect(x + TILE - 8, y + 10, 3, 14);
      g.fillStyle = pal.plank; g.beginPath(); g.roundRect(x, y, TILE, 10, 3); g.fill();
      g.fillStyle = pal.top; g.fillRect(x, y, TILE, 3);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + TILE - 1, y + 3, 1, 7);
    } else if (tile >= T.SPIKE_UP && tile <= T.SPIKE_RIGHT) {
      g.save(); g.translate(x + TILE / 2, y + TILE / 2);
      g.rotate([0, Math.PI, -Math.PI / 2, Math.PI / 2][tile - T.SPIKE_UP]);
      g.translate(-TILE / 2, -TILE / 2);
      for (let k = 0; k < 2; k += 1) {
        const sx = k * 16;
        g.fillStyle = '#c9d4ea'; g.beginPath(); g.moveTo(sx + 1, TILE); g.lineTo(sx + 8, 12); g.lineTo(sx + 15, TILE); g.fill();
        g.fillStyle = '#8e9bb8'; g.beginPath(); g.moveTo(sx + 8, 12); g.lineTo(sx + 15, TILE); g.lineTo(sx + 8, TILE); g.fill();
        g.fillStyle = '#ff5a78'; g.beginPath(); g.moveTo(sx + 6, 17); g.lineTo(sx + 8, 12); g.lineTo(sx + 10, 17); g.fill();
      }
      g.restore();
    } else if (tile === T.STATUE) {
      g.fillStyle = '#4a3a44'; g.beginPath(); g.roundRect(x + 1, y + 1, TILE - 2, TILE - 1, 6); g.fill();
      g.fillStyle = '#5d4a55'; g.fillRect(x + 4, y + 4, TILE - 8, 6);
    }
  }

  function buildBackgrounds(world) {
    const make = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
    const rand = seeded(world * 999 + 17);
    const far = make(1280, 540, (g, w, h) => {
      g.fillStyle = pal.far;
      if (world === 0) {
        g.beginPath(); g.moveTo(0, h);
        for (let x = 0; x <= w; x += 40) g.lineTo(x, 300 + Math.sin(x / 160) * 50 + Math.sin(x / 57) * 18);
        g.lineTo(w, h); g.fill();
      } else if (world === 1) {
        for (let i = 0; i < 7; i += 1) {
          const cx = i * 190 + 60; const cy = 250 + (i % 3) * 60; const r = 70 + (i % 2) * 40;
          g.beginPath(); for (let k = 0; k < 24; k += 1) { const a = (k / 24) * Math.PI * 2; const rr = k % 2 ? r : r * 0.86; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.fill();
          g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(cx, cy, r * 0.35, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over';
        }
        g.fillRect(0, 420, w, 120);
      } else {
        g.beginPath(); g.moveTo(0, h); g.lineTo(0, 380); g.lineTo(360, 180); g.lineTo(440, 180); g.lineTo(820, 400); g.lineTo(1000, 330); g.lineTo(1280, 420); g.lineTo(w, h); g.fill();
        const glow = g.createRadialGradient(400, 180, 5, 400, 180, 120); glow.addColorStop(0, 'rgba(255,140,60,0.55)'); glow.addColorStop(1, 'rgba(255,140,60,0)');
        g.fillStyle = glow; g.fillRect(260, 60, 280, 240);
      }
    });
    const mid = make(1280, 540, (g, w, h) => {
      g.fillStyle = pal.mid;
      if (world === 0) {
        for (let i = 0; i < 18; i += 1) {
          const x = rand() * w; const top = 250 + rand() * 120; const tw = 40 + rand() * 40;
          g.fillRect(x - 5, top + 40, 10, h - top);
          g.beginPath(); g.moveTo(x, top); g.lineTo(x + tw / 2, top + 90); g.lineTo(x - tw / 2, top + 90); g.fill();
          g.beginPath(); g.moveTo(x, top + 40); g.lineTo(x + tw * 0.65, top + 150); g.lineTo(x - tw * 0.65, top + 150); g.fill();
        }
        g.fillRect(0, 440, w, 100);
      } else if (world === 1) {
        for (let i = 0; i < 9; i += 1) { const x = i * 150 + rand() * 60; const bh = 160 + rand() * 180; g.fillRect(x, h - bh, 70 + rand() * 40, bh); g.fillRect(x + 20, h - bh - 30, 12, 30); }
      } else {
        g.beginPath(); g.moveTo(0, h);
        for (let x = 0; x <= w; x += 32) g.lineTo(x, 400 + Math.sin(x / 90) * 30 + (rand() - 0.5) * 30);
        g.lineTo(w, h); g.fill();
      }
    });
    return { far, mid };
  }

  function snapCamera(run) {
    const t = cameraTarget(run);
    cam.x = t.x; cam.y = t.y; cam.shake = 0; cam.flash = 0;
  }

  function cameraTarget(run) {
    const px = run.x + PLAYER_W / 2; const py = run.y + PLAYER_H / 2;
    const lookX = run.facing * 60 + Math.max(-70, Math.min(70, run.vx * 0.14));
    let x = px - VIEW_W / 2 + lookX;
    let y = py - VIEW_H * 0.56;
    x = Math.max(0, Math.min(level.cols * TILE - VIEW_W, x));
    y = Math.max(0, Math.min(level.rows * TILE - VIEW_H, y));
    return { x, y };
  }

  // ------------------------------------------------------------ parçacıklar
  function burst(x, y, count, { color = '#fff', speed = 160, spread = Math.PI * 2, angle = 0, life = 0.5, size = 3, gravity = 300, drag = 2 } = {}) {
    const n = reduced() ? Math.ceil(count / 3) : count;
    for (let i = 0; i < n; i += 1) {
      const a = angle + (Math.random() - 0.5) * spread; const v = speed * (0.4 + Math.random() * 0.8);
      if (particles.length > 500) particles.shift();
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8), color, gravity, drag });
    }
  }
  function floatText(x, y, text, color) { texts.push({ x, y, text, color, life: 1 }); }
  function shake(amount) { if (!reduced()) cam.shake = Math.max(cam.shake, amount); }
  function flash(amount, color = '#fff') { if (!reduced()) { cam.flash = Math.max(cam.flash, amount); cam.flashColor = color; } }

  function onEvents(events, run) {
    const heroColor = run.dashes > 0 ? HERO.ready : HERO.used;
    for (const e of events) {
      const feetY = run.y + PLAYER_H;
      switch (e.type) {
        case 'jump': hero.sx = 0.72; hero.sy = 1.32; burst(e.x, feetY, 7, { color: '#e8f1ff', speed: 90, angle: -Math.PI / 2, spread: Math.PI, life: 0.35, gravity: 120 }); break;
        case 'walljump': hero.sx = 0.75; hero.sy = 1.28; burst(e.x + e.dir * 10, e.y, 8, { color: '#e8f1ff', speed: 110, angle: e.dir > 0 ? Math.PI : 0, spread: 1.4, life: 0.35, gravity: 100 }); break;
        case 'land': {
          const k = Math.min(1, (e.impact || 0) / 900);
          hero.sx = 1 + 0.35 * k + 0.1; hero.sy = 1 - 0.3 * k - 0.08;
          burst(e.x, feetY, 4 + Math.round(8 * k), { color: '#e8f1ff', speed: 70 + 80 * k, angle: -Math.PI / 2, spread: Math.PI * 1.1, life: 0.35, gravity: 150 });
          if (k > 0.85) shake(2.5);
          break;
        }
        case 'dash':
          shake(4); hero.sx = 1.25; hero.sy = 0.8;
          burst(e.x, e.y, 14, { color: HERO.streak, speed: 220, angle: Math.atan2(-e.dy, -e.dx), spread: 1.3, life: 0.4, gravity: 0 });
          burst(e.x, e.y, 6, { color: HERO.readyLight, speed: 140, angle: Math.atan2(-e.dy, -e.dx), spread: 1.8, life: 0.3, gravity: 0 });
          break;
        case 'refill': hero.flashWhite = 0.12; break;
        case 'slide': burst(e.x + e.dir * 10, e.y + 6, 1, { color: '#dfe8ff', speed: 30, angle: -Math.PI / 2, spread: 1, life: 0.3, size: 2.5, gravity: -40 }); break;
        case 'die':
          hero.hidden = true; shake(9); flash(0.35, '#ff4d6d');
          burst(e.x, e.y, 30, { color: heroColor, speed: 320, life: 0.7, size: 4.5, gravity: 200 });
          burst(e.x, e.y, 12, { color: '#ffffff', speed: 200, life: 0.4, size: 3, gravity: 0 });
          trail.length = 0;
          break;
        case 'respawn':
          hero.hidden = false; hero.pop = 1;
          for (let i = 0; i < 16; i += 1) { const a = (i / 16) * Math.PI * 2; particles.push({ x: e.x + Math.cos(a) * 44, y: e.y + Math.sin(a) * 44, vx: -Math.cos(a) * 160, vy: -Math.sin(a) * 160, life: 0.26, max: 0.26, size: 3, color: HERO.ready, gravity: 0, drag: 0 }); }
          break;
        case 'gem':
          burst(e.x, e.y, 18, { color: '#7ff6ff', speed: 200, life: 0.6, gravity: 80 });
          burst(e.x, e.y, 8, { color: '#fff6a8', speed: 120, life: 0.5, gravity: 40 });
          floatText(e.x, e.y - 18, `◆ ${e.count}/${e.total}`, '#8ff7ff'); flash(0.12, '#bff9ff');
          break;
        case 'checkpoint':
          burst(e.x + 8, e.y, 22, { color: pal.accent, speed: 220, angle: -Math.PI / 2, spread: 1.6, life: 0.8, gravity: 420 });
          burst(e.x + 8, e.y, 10, { color: '#ffffff', speed: 180, angle: -Math.PI / 2, spread: 1.6, life: 0.7, gravity: 420 });
          floatText(e.x, e.y - 30, 'Kontrol noktası', pal.glow);
          break;
        case 'spring': springAnim.set(e.index, 1); hero.sx = 0.65; hero.sy = 1.4; burst(e.x, e.y, 10, { color: pal.glow, speed: 140, angle: -Math.PI / 2, spread: 1.8, life: 0.4, gravity: 200 }); break;
        case 'orb': burst(e.x, e.y, 16, { color: '#7dffae', speed: 190, life: 0.5, gravity: 0 }); hero.flashWhite = 0.15; break;
        case 'stomp': shake(3); burst(e.x, e.y, 16, { color: '#ff7a9a', speed: 200, life: 0.5, gravity: 300 }); hero.sx = 0.75; hero.sy = 1.3; break;
        case 'crumble': burst(e.x, e.y, 4, { color: pal.body, speed: 60, angle: -Math.PI / 2, spread: 2, life: 0.4, gravity: 400 }); break;
        case 'crumbled': burst(e.x, e.y, 10, { color: pal.top2, speed: 120, life: 0.6, gravity: 700, size: 4 }); break;
        case 'puff': burst(e.x, e.y, 5, { color: '#ffb46b', speed: 80, life: 0.3, gravity: -60 }); break;
        case 'win':
          flash(0.25, '#ffffff'); shake(3);
          burst(e.x, e.y, 40, { color: '#ffd84a', speed: 300, life: 1.1, gravity: 360 });
          burst(e.x, e.y, 30, { color: '#7ff6ff', speed: 260, life: 1.1, gravity: 360 });
          burst(e.x, e.y, 20, { color: '#ff7ab8', speed: 240, life: 1.1, gravity: 360 });
          break;
        default: break;
      }
    }
  }

  // ------------------------------------------------------------ çizim
  function render(run, alpha, dt) {
    if (!level) return;
    clock += dt;
    resize();
    const rx = run.prevX + (run.x - run.prevX) * alpha;
    const ry = run.prevY + (run.y - run.prevY) * alpha;
    // Kamera
    const target = cameraTarget({ ...run, x: rx, y: ry });
    const kx = 1 - Math.exp(-dt * 7); const ky = 1 - Math.exp(-dt * 5);
    cam.x += (target.x - cam.x) * kx; cam.y += (target.y - cam.y) * ky;
    let sx = 0; let sy = 0;
    if (cam.shake > 0.05) { sx = (Math.random() - 0.5) * cam.shake * 2; sy = (Math.random() - 0.5) * cam.shake * 2; cam.shake *= Math.exp(-dt * 14); } else cam.shake = 0;
    const px = 1 / res;
    const camX = Math.round((cam.x + sx) / px) * px; const camY = Math.round((cam.y + sy) / px) * px;

    const base = Math.min(window.devicePixelRatio || 1, 2) * viewScale;
    ctx.setTransform(base, 0, 0, base, 0, 0);
    drawBackground(camX, camY);

    ctx.save(); ctx.translate(-camX, -camY);
    drawBehind(run);
    const firstChunk = Math.max(0, Math.floor(camX / (CHUNK * TILE)));
    const lastChunk = Math.min(chunks.length - 1, Math.floor((camX + VIEW_W) / (CHUNK * TILE)));
    for (let i = firstChunk; i <= lastChunk; i += 1) ctx.drawImage(chunks[i], i * CHUNK * TILE, 0, chunks[i].width / chunkRes, chunks[i].height / chunkRes);
    drawDynamic(run, camX, camY);
    drawHero(run, rx, ry, dt);
    drawParticles(dt);
    drawForeground(run, camX, camY);
    ctx.restore();

    drawHud(run, dt);
    if (cam.flash > 0.01) { ctx.globalAlpha = cam.flash; ctx.fillStyle = cam.flashColor; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1; cam.flash *= Math.exp(-dt * 10); }
  }

  function drawBackground(camX, camY) {
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, pal.sky[0]); sky.addColorStop(0.6, pal.sky[1]); sky.addColorStop(1, pal.sky[2]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // Yıldızlar / ambiyans ışıkları
    const rand = seeded(level.world * 31 + 5);
    for (let i = 0; i < 40; i += 1) {
      const x = ((rand() * 2000 - camX * 0.05) % 1000 + 1000) % 1000 - 20;
      const y = rand() * 300 - camY * 0.05;
      const tw = reduced() ? 0.5 : 0.35 + Math.sin(clock * 2 + i) * 0.25;
      ctx.globalAlpha = tw; ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
    const yOff = level.rows * TILE - VIEW_H > 0 ? (level.rows * TILE - VIEW_H - camY) * 0.15 : 0;
    const layer = (img, factor, yShift) => {
      const w = img.width; const off = -((camX * factor) % w);
      for (let x = off; x < VIEW_W; x += w) ctx.drawImage(img, x, yShift + yOff * factor * 4);
    };
    layer(backgrounds.far, 0.12, 0);
    layer(backgrounds.mid, 0.3, 20);
    // Ambiyans: ateş böcekleri / toz / kıvılcım
    for (let i = 0; i < 26; i += 1) {
      const r = seeded(i * 97 + level.world);
      const bx = r() * VIEW_W; const by = r() * VIEW_H;
      const t = reduced() ? 0 : clock;
      const x = ((bx + Math.sin(t * 0.6 + i) * 30 - camX * 0.5) % VIEW_W + VIEW_W) % VIEW_W;
      const y = level.world === 2 ? ((by - t * (20 + r() * 30)) % VIEW_H + VIEW_H) % VIEW_H : by + Math.cos(t * 0.8 + i * 2) * 14;
      ctx.globalAlpha = 0.25 + 0.3 * Math.abs(Math.sin(t * 1.5 + i));
      ctx.fillStyle = pal.ambient; ctx.beginPath(); ctx.arc(x, y, 1.6 + r() * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBehind(run) {
    // Tabelalar
    ctx.font = '600 13px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const sign of level.signs) {
      const d = Math.abs(sign.x - (run.x + PLAYER_W / 2));
      const a = Math.max(0.35, Math.min(1, 1.4 - d / 420));
      const w = ctx.measureText(sign.text).width + 22;
      ctx.globalAlpha = a * 0.85; ctx.fillStyle = 'rgba(8,14,30,0.72)';
      ctx.beginPath(); ctx.roundRect(sign.x - w / 2, sign.y - 13, w, 26, 13); ctx.fill();
      ctx.globalAlpha = a; ctx.fillStyle = '#f2f6ff'; ctx.fillText(sign.text, sign.x, sign.y + 1);
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
    // Hareketli platform rayları ve testere yolları
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
    for (const m of level.movers) { ctx.beginPath(); ctx.moveTo(m.x + m.w / 2, m.y + 5); ctx.lineTo(m.x + m.w / 2 + m.dx, m.y + 5 + m.dy); ctx.stroke(); }
    for (const s of level.saws) {
      if (!s.period) continue;
      ctx.beginPath();
      if (s.loop) ctx.ellipse(s.x, s.y, Math.abs(s.dx) || 1, Math.abs(s.dy) || 1, 0, 0, Math.PI * 2); else { ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.dx, s.y + s.dy); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Rüzgâr bölgeleri
    for (const w of level.winds) {
      ctx.fillStyle = 'rgba(255,220,180,0.05)'; ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = 'rgba(255,230,200,0.35)'; ctx.lineWidth = 2;
      const dir = Math.sign(w.force); const t = reduced() ? 0 : clock;
      for (let i = 0; i < Math.ceil(w.w * w.h / 9000); i += 1) {
        const r = seeded(i * 13 + w.x);
        const len = 18 + r() * 26; const lane = w.y + 8 + r() * (w.h - 16);
        const x = w.x + (((r() * w.w + t * Math.abs(w.force) * 1.6 * dir) % w.w) + w.w) % w.w;
        ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(x, lane); ctx.lineTo(Math.max(w.x, Math.min(w.x + w.w, x - len * dir)), lane); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // Kontrol noktaları
    level.checkpoints.forEach((c, i) => {
      const active = i <= run.checkpoint;
      ctx.fillStyle = '#d9e2f5'; ctx.fillRect(c.x - 2, c.y - 60, 4, 60);
      ctx.fillStyle = active ? pal.accent : '#8491ad';
      const wave = reduced() ? 0 : Math.sin(clock * 6 + i) * 3;
      ctx.beginPath(); ctx.moveTo(c.x + 2, c.y - 60); ctx.quadraticCurveTo(c.x + 16, c.y - 56 + wave, c.x + 28, c.y - 50 + wave); ctx.lineTo(c.x + 2, c.y - 40); ctx.fill();
      if (active) { ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(c.x, c.y - 50, 26, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    });
    // Çıkış portalı
    const e = level.exit; const t = clock;
    const cy = e.y - 34;
    const glow = ctx.createRadialGradient(e.x, cy, 4, e.x, cy, 60);
    glow.addColorStop(0, 'rgba(160,255,240,0.55)'); glow.addColorStop(1, 'rgba(160,255,240,0)');
    ctx.fillStyle = glow; ctx.fillRect(e.x - 60, cy - 60, 120, 120);
    ctx.save(); ctx.translate(e.x, cy);
    for (let k = 0; k < 3; k += 1) {
      ctx.strokeStyle = ['#7ff6ff', '#b58bff', '#ffffff'][k]; ctx.lineWidth = 3 - k * 0.6; ctx.globalAlpha = 0.9 - k * 0.2;
      ctx.beginPath(); ctx.ellipse(0, 0, 18 - k * 4, 30 - k * 6, 0, t * (1.5 + k) , t * (1.5 + k) + Math.PI * 1.5); ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawDynamic(run, camX, camY) {
    const visible = (x, y, pad = 64) => x > camX - pad && x < camX + VIEW_W + pad && y > camY - pad && y < camY + VIEW_H + pad;
    // Lav
    for (const l of lavaTiles) {
      const x = l.tx * TILE; const y = l.ty * TILE;
      if (!visible(x, y)) continue;
      const grad = ctx.createLinearGradient(0, y, 0, y + TILE);
      grad.addColorStop(0, '#ffcf5a'); grad.addColorStop(0.3, '#ff6a2c'); grad.addColorStop(1, '#b3243a');
      ctx.fillStyle = grad;
      if (l.top) {
        const w = reduced() ? 0 : Math.sin(clock * 3 + l.tx) * 2;
        ctx.beginPath(); ctx.moveTo(x, y + 8 + w); ctx.quadraticCurveTo(x + TILE / 2, y + 4 - w, x + TILE, y + 8 + Math.sin(clock * 3 + l.tx + 1) * 2); ctx.lineTo(x + TILE, y + TILE); ctx.lineTo(x, y + TILE); ctx.fill();
        if (!reduced() && Math.random() < 0.01) burst(x + Math.random() * TILE, y + 8, 2, { color: '#ffb347', speed: 90, angle: -Math.PI / 2, spread: 0.8, life: 0.6, gravity: 300 });
      } else ctx.fillRect(x, y, TILE, TILE);
    }
    // Çöken bloklar
    level.crumbles.forEach((d, i) => {
      const c = run.crumbles[i];
      if (c.state === 'gone') { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.setLineDash([3, 4]); ctx.strokeRect(d.x + 2, d.y + 2, TILE - 4, TILE - 4); ctx.setLineDash([]); return; }
      const jitter = c.state === 'shaking' && !reduced() ? (Math.random() - 0.5) * 3 : 0;
      ctx.fillStyle = pal.top2; ctx.beginPath(); ctx.roundRect(d.x + 1 + jitter, d.y + 1, TILE - 2, TILE - 2, 6); ctx.fill();
      ctx.fillStyle = pal.top; ctx.fillRect(d.x + 3 + jitter, d.y + 3, TILE - 6, 5);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(d.x + 8 + jitter, d.y + 10); ctx.lineTo(d.x + 15 + jitter, d.y + 18); ctx.lineTo(d.x + 12 + jitter, d.y + 27); ctx.moveTo(d.x + 15 + jitter, d.y + 18); ctx.lineTo(d.x + 24 + jitter, d.y + 16); ctx.stroke();
    });
    // Hareketli platformlar
    level.movers.forEach((def, i) => {
      const m = run.movers[i];
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.roundRect(m.x + 3, m.y + 6, def.w, 14, 6); ctx.fill();
      ctx.fillStyle = pal.plank; ctx.beginPath(); ctx.roundRect(m.x, m.y, def.w, 14, 6); ctx.fill();
      ctx.fillStyle = pal.top; ctx.beginPath(); ctx.roundRect(m.x, m.y, def.w, 5, [6, 6, 0, 0]); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let k = 12; k < def.w - 6; k += 24) { ctx.beginPath(); ctx.arc(m.x + k, m.y + 9, 2, 0, Math.PI * 2); ctx.fill(); }
    });
    // Yaylar
    level.springs.forEach((s, i) => {
      let k = springAnim.get(i) || 0;
      if (k > 0) { k = Math.max(0, k - 0.08); springAnim.set(i, k); }
      const squash = Math.sin(k * Math.PI) * 8;
      const x = s.x; const y = s.y;
      if (level.world === 0) {
        ctx.fillStyle = '#f3e3c8'; ctx.fillRect(x + 12, y + 20 - squash / 2, 8, 12 + squash / 2);
        ctx.fillStyle = '#ff5d7a'; ctx.beginPath(); ctx.ellipse(x + 16, y + 20 + squash / 2, 15 + squash / 3, 10 - squash / 3, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 10, y + 15 + squash / 2, 2.5, 0, Math.PI * 2); ctx.arc(x + 21, y + 13 + squash / 2, 2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = '#c9d4ea'; ctx.lineWidth = 3; ctx.beginPath();
        for (let z = 0; z < 4; z += 1) { ctx.lineTo(x + (z % 2 ? 24 : 8), y + 30 - z * (4 - squash / 5)); } ctx.stroke();
        ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.roundRect(x + 3, y + 14 + squash, TILE - 6, 6, 3); ctx.fill();
      }
    });
    // Dash küreleri
    level.orbs.forEach((o, i) => {
      const used = run.orbs[i] > 0; const bob = reduced() ? 0 : Math.sin(clock * 3 + i) * 3;
      if (used) { ctx.strokeStyle = 'rgba(125,255,174,0.35)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(o.x, o.y, 11, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); return; }
      const g = ctx.createRadialGradient(o.x, o.y + bob, 2, o.x, o.y + bob, 26); g.addColorStop(0, 'rgba(125,255,174,0.6)'); g.addColorStop(1, 'rgba(125,255,174,0)');
      ctx.fillStyle = g; ctx.fillRect(o.x - 26, o.y - 26 + bob, 52, 52);
      ctx.fillStyle = '#7dffae'; ctx.save(); ctx.translate(o.x, o.y + bob); ctx.rotate(Math.PI / 4 + (reduced() ? 0 : clock));
      ctx.fillRect(-7, -7, 14, 14); ctx.fillStyle = '#eaffef'; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    });
    // Kristaller
    level.gems.forEach((gem, i) => {
      if (run.gems[i]) return;
      const bob = reduced() ? 0 : Math.sin(clock * 2.5 + i * 1.7) * 4;
      const spin = reduced() ? 1 : Math.cos(clock * 2 + i);
      const x = gem.x; const y = gem.y + bob;
      const g = ctx.createRadialGradient(x, y, 2, x, y, 30); g.addColorStop(0, 'rgba(127,246,255,0.5)'); g.addColorStop(1, 'rgba(127,246,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 30, y - 30, 60, 60);
      const w = 11 * Math.max(0.25, Math.abs(spin));
      ctx.fillStyle = '#44c8ff'; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + w, y - 3); ctx.lineTo(x, y + 14); ctx.lineTo(x - w, y - 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b8fbff'; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + w * (spin > 0 ? 1 : -1), y - 3); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
      if (!reduced() && Math.sin(clock * 4 + i * 3) > 0.96) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 6, y - 12, 3, 3); }
    });
    // Gayzerler
    level.geysers.forEach(gy => {
      if (!visible(gy.x, gy.y, 200)) return;
      const state = geyserActive(gy, run.time);
      ctx.fillStyle = '#2a1a22'; ctx.beginPath(); ctx.roundRect(gy.x + 4, gy.y - 4, TILE - 8, 8, 3); ctx.fill();
      ctx.fillStyle = state === 'off' ? '#6a2d2d' : '#ffb347'; ctx.fillRect(gy.x + 9, gy.y - 3, TILE - 18, 3);
      if (state === 'warn' && !reduced() && Math.random() < 0.4) burst(gy.x + TILE / 2, gy.y - 4, 1, { color: '#ffb347', speed: 60, angle: -Math.PI / 2, spread: 0.6, life: 0.4, gravity: 0 });
      if (state === 'on') {
        const top = gy.y - gy.height;
        const flick = reduced() ? 0 : Math.sin(clock * 30) * 2;
        const g = ctx.createLinearGradient(0, top, 0, gy.y);
        g.addColorStop(0, 'rgba(255,220,120,0)'); g.addColorStop(0.15, '#ffd35a'); g.addColorStop(0.6, '#ff7a2c'); g.addColorStop(1, '#ff3d3d');
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(gy.x + 6 - flick, top, TILE - 12 + flick * 2, gy.height, 10); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,220,0.7)'; ctx.fillRect(gy.x + 13, top + 14, 6, gy.height - 18);
      }
    });
    // Heykeller: parlayan ağız
    level.statues.forEach((s, i) => {
      const heat = Math.max(0, 1 - run.statueTimers[i] / 0.6);
      ctx.fillStyle = `rgba(255,${120 + heat * 100},60,${0.4 + heat * 0.6})`;
      ctx.beginPath(); ctx.arc(s.x + (s.dir > 0 ? 26 : 6), s.y + 17, 4 + heat * 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffdca0'; ctx.fillRect(s.x + (s.dir > 0 ? 18 : 10), s.y + 9, 4, 3);
    });
    // Ateş topları
    for (const ball of run.fireballs) {
      const g = ctx.createRadialGradient(ball.x + 6, ball.y + 6, 1, ball.x + 6, ball.y + 6, 16); g.addColorStop(0, 'rgba(255,200,90,0.9)'); g.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = g; ctx.fillRect(ball.x - 10, ball.y - 10, 32, 32);
      ctx.fillStyle = '#fff1c2'; ctx.beginPath(); ctx.arc(ball.x + 6, ball.y + 6, 5, 0, Math.PI * 2); ctx.fill();
      if (!reduced() && Math.random() < 0.5) particles.push({ x: ball.x + 6, y: ball.y + 6, vx: -Math.sign(ball.vx) * 40, vy: (Math.random() - 0.5) * 30, life: 0.25, max: 0.25, size: 3, color: '#ff8a3d', gravity: -50, drag: 1 });
    }
    // Testereler
    level.saws.forEach((def, i) => {
      const s = run.saws[i];
      if (!visible(s.x, s.y)) return;
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(reduced() ? 0 : clock * 9);
      ctx.fillStyle = '#d7deee'; ctx.beginPath();
      const teeth = 12;
      for (let k = 0; k < teeth * 2; k += 1) { const a = (k / (teeth * 2)) * Math.PI * 2; const r = k % 2 ? def.r * 0.78 : def.r + 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5a78'; ctx.beginPath(); ctx.arc(0, 0, def.r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a3d5e'; ctx.beginPath(); ctx.arc(0, 0, def.r * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    // Düşmanlar
    run.enemies.forEach(e => {
      if (!e.alive) return;
      const cx = e.x + e.w / 2;
      if (e.kind === 'walker') {
        const bounce = reduced() ? 0 : Math.abs(Math.sin(clock * 10 + e.x * 0.05)) * 2;
        ctx.fillStyle = '#ff5d7a'; ctx.beginPath(); ctx.roundRect(e.x, e.y - bounce, e.w, e.h + bounce, [12, 12, 5, 5]); ctx.fill();
        ctx.fillStyle = '#ff9ab0'; ctx.beginPath(); ctx.roundRect(e.x + 3, e.y - bounce + 2, e.w - 6, 5, 3); ctx.fill();
        for (let k = 0; k < 3; k += 1) { ctx.fillStyle = '#fff4f6'; ctx.beginPath(); ctx.moveTo(e.x + 5 + k * 7, e.y - bounce); ctx.lineTo(e.x + 8 + k * 7, e.y - bounce - 6); ctx.lineTo(e.x + 11 + k * 7, e.y - bounce); ctx.fill(); }
        const look = Math.sign(e.vx) * 3;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - 5 + look, e.y + 9 - bounce, 4, 0, Math.PI * 2); ctx.arc(cx + 5 + look, e.y + 9 - bounce, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#231a33'; ctx.beginPath(); ctx.arc(cx - 4 + look * 1.3, e.y + 10 - bounce, 2, 0, Math.PI * 2); ctx.arc(cx + 6 + look * 1.3, e.y + 10 - bounce, 2, 0, Math.PI * 2); ctx.fill();
      } else {
        const flap = reduced() ? 0.5 : (Math.sin(clock * 18 + e.phase) + 1) / 2;
        ctx.fillStyle = '#9b7bff';
        ctx.beginPath(); ctx.moveTo(cx - 6, e.y + 10); ctx.lineTo(cx - 20, e.y + 2 + flap * 14); ctx.lineTo(cx - 8, e.y + 18); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 6, e.y + 10); ctx.lineTo(cx + 20, e.y + 2 + flap * 14); ctx.lineTo(cx + 8, e.y + 18); ctx.fill();
        ctx.fillStyle = '#c7b3ff'; ctx.beginPath(); ctx.arc(cx, e.y + 12, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - 4, e.y + 10, 3.5, 0, Math.PI * 2); ctx.arc(cx + 4, e.y + 10, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#231a33'; ctx.beginPath(); ctx.arc(cx - 4, e.y + 11, 1.8, 0, Math.PI * 2); ctx.arc(cx + 4, e.y + 11, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  function drawForeground(run, camX) {
    if (run.lavaY < Infinity) {
      const y = run.lavaY;
      const g = ctx.createLinearGradient(0, y - 40, 0, y + 80);
      g.addColorStop(0, 'rgba(255,120,40,0)'); g.addColorStop(0.33, 'rgba(255,120,40,0.35)'); g.addColorStop(0.36, '#ffcf5a'); g.addColorStop(0.5, '#ff6a2c'); g.addColorStop(1, '#8e1c32');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(camX - 10, y + 80 + 2000);
      for (let x = camX - 10; x <= camX + VIEW_W + 20; x += 20) ctx.lineTo(x, y + (reduced() ? 0 : Math.sin(clock * 2.5 + x * 0.03) * 5));
      ctx.lineTo(camX + VIEW_W + 20, y + 2000); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,90,40,0.6)'; ctx.fillRect(camX - 10, y + 40, VIEW_W + 30, 2000);
    }
  }

  // Zıpkın: turuncu gövdeli, başında camgöbeği yüzgeç-bıçak tepesi olan kahraman. Dash hakkı varken kor gibi parlar,
  // hak bitince söner; dash sırasında arkasında camgöbeği bir zıpkın izi bırakır. Çarpışma kutusu PLAYER_W × PLAYER_H.
  function drawHero(run, rx, ry, dt) {
    // Esneme/basılma yaylanması
    const k = 1 - Math.exp(-dt * 14);
    hero.sx += (1 - hero.sx) * k; hero.sy += (1 - hero.sy) * k;
    hero.pop = Math.max(0, hero.pop - dt * 4);
    hero.flashWhite = Math.max(0, hero.flashWhite - dt);
    hero.blink -= dt; if (hero.blink < -0.12) hero.blink = 2 + Math.random() * 3;
    // Tepe yay fiziği: hareketle sallanır
    hero.antennaV += (-hero.antenna * 180 - hero.antennaV * 10 - run.vx * 0.02 - run.vy * 0.01) * dt;
    hero.antenna = Math.max(-1.2, Math.min(1.2, hero.antenna + hero.antennaV * dt));

    const ready = run.dashes > 0;
    const dashing = run.dashTime > 0;
    const cx0 = rx + PLAYER_W / 2; const cy0 = ry + PLAYER_H / 2;
    if (dashing || (!reduced() && Math.hypot(run.vx, run.vy) > 600)) {
      hero.trailTimer -= dt;
      if (hero.trailTimer <= 0) { hero.trailTimer = 0.018; trail.push({ x: rx, y: ry, cx: cx0, cy: cy0, life: 0.28 }); }
    }
    for (let i = trail.length - 1; i >= 0; i -= 1) {
      trail[i].life -= dt;
      if (trail[i].life <= 0) trail.splice(i, 1);
    }
    // Zıpkın izi: arkaya doğru incelen camgöbeği çizgi + yarı saydam turuncu kopyalar
    if (trail.length) {
      ctx.lineCap = 'round';
      for (const tr of trail) {
        ctx.globalAlpha = tr.life * 0.9; ctx.fillStyle = HERO.ready;
        ctx.beginPath(); ctx.roundRect(tr.x, tr.y + 2, PLAYER_W, PLAYER_H - 2, 9); ctx.fill();
      }
      for (let i = 0; i < trail.length; i += 1) {
        const a = trail[i]; const b = trail[i + 1] || { cx: cx0, cy: cy0, life: 0.28 };
        const width = 2 + (i / trail.length) * 6;
        ctx.globalAlpha = Math.min(1, a.life * 3.5);
        ctx.strokeStyle = HERO.outline; ctx.lineWidth = width + 2.5;
        ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();
        ctx.strokeStyle = HERO.streak; ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = 1;
    if (hero.hidden || run.status === 'dying') return;
    let scaleIn = 1 - hero.pop * 0.6;
    if (run.status === 'complete') scaleIn = 0;
    const w = (PLAYER_W + 4) * hero.sx * scaleIn; const h = (PLAYER_H + 2) * hero.sy * scaleIn;
    if (w <= 0.5 || h <= 0.5) return;
    const cx = cx0; const bottom = ry + PLAYER_H; const top = bottom - h;
    const c = ready
      ? { light: HERO.readyLight, main: HERO.ready, dark: HERO.readyDark, crest: HERO.crest, crestDark: HERO.crestDark }
      : { light: HERO.usedLight, main: HERO.used, dark: HERO.usedDark, crest: HERO.crestUsed, crestDark: HERO.usedDark };
    // Gölge
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, bottom + 1, w * 0.45, 3, 0, 0, Math.PI * 2); ctx.fill();

    // Kollar: kapaktaki gibi küçük yuvarlak kollar; koşarken sallanır, havada hafifçe kalkar.
    const f = run.facing;
    const swing = run.grounded && Math.abs(run.vx) > 40 && !reduced() ? Math.sin(clock * 22) * 2.2 : 0;
    const lift = run.grounded ? 0 : -3;
    const arm = (x, y, tilt) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
      ctx.beginPath(); ctx.ellipse(0, 0, 4 * scaleIn, 3.2 * scaleIn, 0, 0, Math.PI * 2);
      ctx.fillStyle = c.main; ctx.fill(); ctx.strokeStyle = HERO.outline; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    };
    arm(cx - f * (w / 2 - 1), top + h * 0.58 + lift - swing, -f * 0.5);

    // Gövde: dış hat + kor gradyanı + açık tonlu karın
    const radii = [w * 0.5, w * 0.5, w * 0.4, w * 0.4];
    const body = ctx.createLinearGradient(cx - w / 2, top, cx + w / 2, bottom);
    body.addColorStop(0, c.light); body.addColorStop(0.3, c.main); body.addColorStop(1, c.dark);
    ctx.beginPath(); ctx.roundRect(cx - w / 2, top, w, h, radii);
    ctx.fillStyle = body; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = ready ? 'rgba(255,236,170,0.55)' : 'rgba(230,215,205,0.35)';
    ctx.beginPath(); ctx.ellipse(cx + run.facing * 2, bottom - h * 0.22, w * 0.32, h * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = HERO.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(cx - w / 2, top, w, h, radii); ctx.stroke();
    if (hero.flashWhite > 0) { ctx.globalAlpha = Math.min(1, hero.flashWhite * 6); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(cx - w / 2, top, w, h, radii); ctx.fill(); ctx.globalAlpha = 1; }
    // Zıpkın tepesi: başın üstüne oturan, arkaya doğru kıvrılan camgöbeği metal bir yüzgeç-bıçak (kapaktaki gibi).
    // Hareketle hafifçe sallanır, dash sırasında geriye yatar. Yerel koordinatlarda +x karakterin baktığı yön.
    {
      const lean = (dashing ? -0.35 : 0) + hero.antenna * 0.18 * f;
      ctx.save();
      ctx.translate(cx - f * 0.5, top + 5.5 * scaleIn);
      ctx.scale(f * hero.sx * scaleIn * 0.85, hero.sy * scaleIn * 0.85);
      ctx.rotate(lean);
      const blade = new Path2D('M9 1 C9.5 -5 4 -10 -4 -11.5 C-8 -12 -12 -12.5 -16 -14 C-13.5 -9 -12.5 -4 -11 2 Q-1 4.5 9 1 Z');
      const metal = ctx.createLinearGradient(8, 0, -14, -12);
      metal.addColorStop(0, ready ? '#9cf6ff' : '#b7c4c8'); metal.addColorStop(0.45, c.crest); metal.addColorStop(1, c.crestDark);
      ctx.fillStyle = metal; ctx.fill(blade);
      ctx.strokeStyle = HERO.outline; ctx.lineWidth = 1.8 / scaleIn; ctx.lineJoin = 'round'; ctx.stroke(blade);
      // Ön kenarda parlak keskin çizgi, ortada bıçak sırtı
      ctx.strokeStyle = 'rgba(235,255,255,0.85)'; ctx.lineWidth = 1.3 / scaleIn; ctx.lineCap = 'round';
      ctx.stroke(new Path2D('M7.5 -0.5 C7.8 -5 3 -9 -4 -10.2'));
      ctx.strokeStyle = 'rgba(8,40,60,0.35)'; ctx.lineWidth = 1 / scaleIn;
      ctx.stroke(new Path2D('M1 1 C-1 -4 -6 -8.5 -13 -12.5'));
      ctx.lineCap = 'butt';
      ctx.restore();
    }
    arm(cx + f * (w / 2 - 1), top + h * 0.6 + lift + swing, f * 0.5);
    // Kor parıltısı: dash hakkı varken gövdeden küçük kıvılcımlar
    if (ready && !reduced() && Math.random() < dt * 6) particles.push({ x: cx + (Math.random() - 0.5) * w * 0.6, y: top + h * 0.3, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 30, life: 0.4, max: 0.4, size: 2, color: '#ffd27a', gravity: -20, drag: 1 });
    // Ayaklar
    const step = run.grounded && Math.abs(run.vx) > 40 && !reduced() ? Math.sin(clock * 22) * 3 : 0;
    ctx.fillStyle = HERO.outline;
    ctx.beginPath(); ctx.roundRect(cx - w * 0.38 + step, bottom - 4, 8, 5, 2); ctx.roundRect(cx + w * 0.38 - 8 - step, bottom - 4, 8, 5, 2); ctx.fill();
    // Gözler: kararlı bakış
    const eyeY = top + h * 0.4 + Math.max(-2, Math.min(2, run.vy * 0.004));
    const look = run.facing * 3.2;
    const blink = hero.blink < 0 ? 0.15 : 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(cx - 4.5 + look, eyeY, 3.6, 4.6 * blink, 0, 0, Math.PI * 2); ctx.ellipse(cx + 4.5 + look, eyeY, 3.6, 4.6 * blink, 0, 0, Math.PI * 2); ctx.fill();
    if (blink === 1) {
      ctx.fillStyle = HERO.outline;
      ctx.beginPath(); ctx.arc(cx - 4.5 + look * 1.25, eyeY + 0.6, 2, 0, Math.PI * 2); ctx.arc(cx + 4.5 + look * 1.25, eyeY + 0.6, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(cx - 3.8 + look * 1.25, eyeY - 0.4, 0.8, 0, Math.PI * 2); ctx.arc(cx + 5.2 + look * 1.25, eyeY - 0.4, 0.8, 0, Math.PI * 2); ctx.fill();
    }
    // Kaşlar: hafif çatık, kararlı ifade
    ctx.strokeStyle = HERO.outline; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx - 8 + look, eyeY - 6.5); ctx.lineTo(cx - 2 + look, eyeY - 5.5); ctx.moveTo(cx + 2 + look, eyeY - 5.5); ctx.lineTo(cx + 8 + look, eyeY - 6.5); ctx.stroke();
    ctx.fillStyle = 'rgba(255,90,90,0.45)';
    ctx.beginPath(); ctx.arc(cx - 8 + look, eyeY + 6, 2.4, 0, Math.PI * 2); ctx.arc(cx + 8 + look, eyeY + 6, 2.4, 0, Math.PI * 2); ctx.fill();
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += p.gravity * dt; p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt * 0.5);
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      ctx.fillStyle = p.color;
      const s = p.size * (0.5 + 0.5 * p.life / p.max);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.font = '700 15px Fredoka, sans-serif'; ctx.textAlign = 'center';
    for (let i = texts.length - 1; i >= 0; i -= 1) {
      const t = texts[i]; t.life -= dt * 0.9; t.y -= dt * 30;
      if (t.life <= 0) { texts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(t.text, t.x + 1, t.y + 2);
      ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60); const s = seconds - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  }

  function drawHud(run, dt) {
    const world = level.world + 1; const inWorld = ((level.number - 1) % 8) + 1;
    ctx.textBaseline = 'middle';
    // Sol üst: bölüm etiketi
    const label = `${world}-${inWorld}  ${level.title}`;
    ctx.font = '700 15px Fredoka, sans-serif';
    const lw = ctx.measureText(label).width + 28;
    ctx.fillStyle = 'rgba(6,12,28,0.62)'; ctx.beginPath(); ctx.roundRect(14, 14, lw, 34, 17); ctx.fill();
    ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.arc(29, 31, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4f7ff'; ctx.textAlign = 'left'; ctx.fillText(label, 40, 32);
    // Sağ üst: kristaller, süre, ölüm
    const panelW = 250; const x0 = VIEW_W - 14 - panelW;
    ctx.fillStyle = 'rgba(6,12,28,0.62)'; ctx.beginPath(); ctx.roundRect(x0, 14, panelW, 34, 17); ctx.fill();
    level.gems.forEach((_, i) => {
      const gx = x0 + 22 + i * 20; const gy = 31;
      ctx.fillStyle = run.gems[i] ? '#6fe9ff' : 'rgba(255,255,255,0.2)';
      ctx.beginPath(); ctx.moveTo(gx, gy - 8); ctx.lineTo(gx + 6, gy - 1); ctx.lineTo(gx, gy + 8); ctx.lineTo(gx - 6, gy - 1); ctx.closePath(); ctx.fill();
    });
    ctx.font = '700 16px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = run.time <= level.par ? '#f4f7ff' : '#ffb3c0';
    ctx.fillText(formatTime(run.time), x0 + 138, 32);
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffb3c0'; ctx.fillText(`✖ ${run.deaths}`, x0 + panelW - 16, 32);
    ctx.textBaseline = 'alphabetic';
    // Bölüm başlığı bandı
    if (banner > 0) {
      banner -= dt;
      const a = Math.min(1, banner / 0.5) * Math.min(1, (2.2 - banner) / 0.25);
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = 'rgba(6,12,28,0.55)'; ctx.fillRect(0, VIEW_H * 0.36, VIEW_W, 84);
      ctx.textAlign = 'center'; ctx.fillStyle = pal.accent; ctx.font = '700 14px Fredoka, sans-serif';
      ctx.fillText(`${WORLDS[level.world].name.toLocaleUpperCase('tr-TR')} · ${world}-${inWorld}`, VIEW_W / 2, VIEW_H * 0.36 + 28);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 32px Fredoka, sans-serif';
      ctx.fillText(level.title, VIEW_W / 2, VIEW_H * 0.36 + 64);
      ctx.globalAlpha = 1;
    }
  }

  return { setLevel, render, onEvents, resize, snapCamera, formatTime };
}
