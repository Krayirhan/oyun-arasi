import { WIDTH, HEIGHT, ROUND_SECONDS, MAX_ESCAPES, LAUNCH_X, LAUNCH_Y, HAND_Y, createGame, startGame, pauseGame, aimAt, fireDart, advance, stageFor, isValidGame } from './logic.js?v=balon6';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=balon6';

const KEY = 'oyunarasi-balon-patlat-v1';
const $ = selector => document.querySelector(selector);
const canvas = $('#board');
const ctx = canvas.getContext('2d');
const frame = $('.board-frame');
const overlay = $('#game-overlay');
const overlayButton = $('#overlay-button');
const status = $('#status');
const saveState = $('#save-state');
const scoreText = $('#score');
const bestText = $('#best-score');
const targetText = $('#target-number');
const timerText = $('#timer');
const timerCard = $('#timer').parentElement;
const missesText = $('#misses');
const comboText = $('#combo');
const correctText = $('#correct-count');
const soundButton = $('#sound-button');

const COLORS = [
  { main: '#ff4f7b', edge: '#c9224f', shine: '#ffc2d1', ink: '#fff', stroke: '#9e1840' },
  { main: '#ffd23f', edge: '#e0a000', shine: '#fff4c2', ink: '#4a3200', stroke: '#fff4c2' },
  { main: '#2f8cff', edge: '#1559c2', shine: '#bfe0ff', ink: '#fff', stroke: '#0f418f' },
  { main: '#2fbf71', edge: '#178a4c', shine: '#c3f5d8', ink: '#fff', stroke: '#0f6436' },
  { main: '#9b5cf6', edge: '#6a2fc4', shine: '#e2d2ff', ink: '#fff', stroke: '#4c1d95' },
  { main: '#ff9f1c', edge: '#d46b00', shine: '#ffe0b3', ink: '#fff', stroke: '#9a4a00' }
];
let game = createGame();
let records = { bestScore: 0, bestCorrect: 0, bestCombo: 0, bestAccuracy: 0, runs: 0 };
let soundOn = false;
let audioContext = null;
let view = { width: 1, height: 1, ratio: 1 };
let lastFrame = performance.now();
let runRecorded = true;
let lastUiSecond = -1;

function mergeRecords(a = {}, b = {}) {
  const max = key => Math.max(Number(a[key]) || 0, Number(b[key]) || 0);
  return { bestScore: max('bestScore'), bestCorrect: max('bestCorrect'), bestCombo: max('bestCombo'), bestAccuracy: max('bestAccuracy'), runs: max('runs') };
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data?.records) records = mergeRecords(records, data.records);
  } catch {}
}

function saveRecords() {
  try { localStorage.setItem(KEY, JSON.stringify({ records })); saveState.textContent = 'Rekorların bu cihazda saklanıyor.'; }
  catch { saveState.textContent = 'Kayıt kullanılamıyor; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save({ records });
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  view = { width: rect.width, height: rect.height, ratio };
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  draw(performance.now());
}

function roundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

// ---- Sahne: gökyüzü, bulutlar, tepeler ------------------------------------------------------

const CLOUDS = [
  { x: 40, y: 190, s: 1, v: 9 }, { x: 330, y: 250, s: .8, v: 6 }, { x: 520, y: 150, s: .65, v: 11 }, { x: 180, y: 360, s: .55, v: 7 }
];

function cloud(x, y, s) {
  ctx.beginPath();
  for (const [dx, dy, r] of [[0, 0, 26], [28, -14, 30], [60, -4, 26], [84, 6, 20], [-22, 8, 18]]) {
    ctx.moveTo(x + (dx + r) * s, y + dy * s);
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
  }
  ctx.rect(x - 22 * s, y, 106 * s, 20 * s);
  ctx.fill();
}

function drawBackground(now) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, '#4fa8ec');
  sky.addColorStop(.55, '#9ad6fb');
  sky.addColorStop(.86, '#ffe7c4');
  sky.addColorStop(1, '#ffd9a8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const sun = ctx.createRadialGradient(505, 205, 10, 505, 205, 120);
  sun.addColorStop(0, 'rgb(255 250 214 / .95)');
  sun.addColorStop(.35, 'rgb(255 236 160 / .55)');
  sun.addColorStop(1, 'rgb(255 236 160 / 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(360, 60, 300, 300);
  const t = now / 1000;
  for (const item of CLOUDS) {
    const x = ((item.x + t * item.v) % (WIDTH + 220)) - 110;
    ctx.fillStyle = 'rgb(122 170 214 / .22)';
    cloud(x + 4, item.y + 7, item.s);
    ctx.fillStyle = 'rgb(255 255 255 / .92)';
    cloud(x, item.y, item.s);
  }
  // Tepeler
  ctx.fillStyle = '#8fd97a';
  ctx.beginPath(); ctx.moveTo(0, HEIGHT - 120);
  ctx.bezierCurveTo(140, HEIGHT - 190, 260, HEIGHT - 110, 380, HEIGHT - 140);
  ctx.bezierCurveTo(470, HEIGHT - 165, 540, HEIGHT - 150, WIDTH, HEIGHT - 175);
  ctx.lineTo(WIDTH, HEIGHT); ctx.lineTo(0, HEIGHT); ctx.fill();
  ctx.fillStyle = '#5fbf5a';
  ctx.beginPath(); ctx.moveTo(0, HEIGHT - 70);
  ctx.bezierCurveTo(170, HEIGHT - 120, 390, HEIGHT - 55, WIDTH, HEIGHT - 100);
  ctx.lineTo(WIDTH, HEIGHT); ctx.lineTo(0, HEIGHT); ctx.fill();
}

// ---- Balon ----------------------------------------------------------------------------------

function balloonPath(x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 1.08);
  ctx.bezierCurveTo(x - r * 1.28, y + r * .5, x - r * 1.02, y - r * 1.04, x, y - r);
  ctx.bezierCurveTo(x + r * 1.02, y - r * 1.04, x + r * 1.28, y + r * .5, x, y + r * 1.08);
  ctx.closePath();
}

function drawBalloon(balloon, now) {
  const sway = Math.sin(balloon.wobble) * 4;
  const x = balloon.x + sway;
  const y = balloon.y;
  const r = balloon.radius;
  const color = COLORS[balloon.color % COLORS.length];
  ctx.save();
  // İp
  ctx.strokeStyle = 'rgb(70 80 110 / .55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 1.14);
  const swing = Math.sin(now / 420 + balloon.id) * 6;
  ctx.bezierCurveTo(x - 10 + swing, y + r + 26, x + 10 - swing, y + r + 44, x + swing * .5, y + r + 66);
  ctx.stroke();
  // Gövde
  ctx.shadowColor = 'rgb(20 50 90 / .25)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 8;
  const fill = ctx.createRadialGradient(x - r * .35, y - r * .45, r * .1, x, y, r * 1.2);
  fill.addColorStop(0, color.shine);
  fill.addColorStop(.3, color.main);
  fill.addColorStop(1, color.edge);
  ctx.fillStyle = fill;
  balloonPath(x, y, r);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // Düğüm
  ctx.fillStyle = color.edge;
  ctx.beginPath(); ctx.moveTo(x - 7, y + r * 1.2); ctx.lineTo(x + 7, y + r * 1.2); ctx.lineTo(x, y + r * 1.04); ctx.closePath(); ctx.fill();
  // Parlama
  ctx.fillStyle = 'rgb(255 255 255 / .55)';
  ctx.beginPath(); ctx.ellipse(x - r * .42, y - r * .5, r * .16, r * .3, .5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgb(255 255 255 / .35)';
  ctx.beginPath(); ctx.arc(x - r * .18, y - r * .78, r * .07, 0, Math.PI * 2); ctx.fill();
  // İşlem
  const label = `${balloon.a} + ${balloon.b}`;
  ctx.font = `700 ${label.length >= 7 ? 27 : 32}px Fredoka, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = color.stroke;
  ctx.strokeText(label, x, y + 2, r * 1.7);
  ctx.fillStyle = color.ink;
  ctx.fillText(label, x, y + 2, r * 1.7);
  ctx.restore();
}

// ---- Dart ve atış noktası -----------------------------------------------------------------------

function dartShape(length = 1) {
  ctx.fillStyle = '#c9d2de';
  ctx.beginPath(); ctx.moveTo(26 * length, 0); ctx.lineTo(12, -3); ctx.lineTo(12, 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2b3550';
  ctx.fillRect(-10, -3.5, 24, 7);
  ctx.fillStyle = '#ff4f7b';
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-24, -11); ctx.lineTo(-20, 0); ctx.lineTo(-24, 11); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-22, -6); ctx.lineTo(-19, 0); ctx.lineTo(-22, 6); ctx.closePath(); ctx.fill();
}

// Uçan dart: elden (ekranın altı) hedef noktaya yay çizerek gider, uzaklaştıkça küçülür.
function dartPosition(dart, t) {
  const p = 1 - (1 - t) * (1 - t);
  return {
    x: dart.sx + (dart.tx - dart.sx) * p,
    y: dart.sy + (dart.ty - dart.sy) * p - Math.sin(Math.PI * t) * 70,
    scale: 1.9 - 1.15 * p
  };
}

function drawDart(dart) {
  const now = dartPosition(dart, dart.t);
  const before = dartPosition(dart, Math.max(0, dart.t - .06));
  const angle = Math.atan2(now.y - before.y, now.x - before.x) || -Math.PI / 2;
  ctx.save();
  ctx.strokeStyle = 'rgb(255 255 255 / .5)';
  ctx.lineWidth = 4 * now.scale;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(before.x, before.y); ctx.lineTo(now.x, now.y); ctx.stroke();
  ctx.translate(now.x, now.y);
  ctx.rotate(angle);
  ctx.scale(now.scale, now.scale);
  dartShape();
  ctx.restore();
}

let readyAt = 0;

// Elde tutulan dart ve nişangâh. Dart havadayken el boştur; dart varınca yenisi aşağıdan kayarak gelir.
function drawLauncher(now) {
  const { x, y } = game.aim;
  const playing = game.status === 'playing';
  const flying = game.darts.length > 0;
  if (flying) readyAt = now;
  ctx.save();
  if (playing) {
    // Atışın izleyeceği yay (silik)
    const guide = { sx: LAUNCH_X, sy: HAND_Y, tx: x, ty: y };
    for (let t = .12; t < .96; t += .08) {
      const point = dartPosition(guide, t);
      ctx.fillStyle = `rgb(255 255 255 / ${.5 - t * .35})`;
      ctx.beginPath(); ctx.arc(point.x, point.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgb(20 40 80 / .55)';
    ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * 8, y + dy * 8); ctx.lineTo(x + dx * 22, y + dy * 22); }
    ctx.stroke();
    ctx.fillStyle = '#ff4f7b';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent';
  }
  if (!flying) {
    // Elde bekleyen dart: nişana doğru bakar, hafifçe sallanır
    const slide = Math.min(1, (now - readyAt) / 180);
    const handX = LAUNCH_X;
    const handY = HEIGHT - 70 + (1 - slide) * 90 + Math.sin(now / 320) * 3;
    const angle = Math.atan2(y - handY, x - handX);
    ctx.fillStyle = 'rgb(30 70 40 / .22)';
    ctx.beginPath(); ctx.ellipse(handX, HEIGHT - 22, 46, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(handX, handY);
    ctx.rotate(angle);
    ctx.scale(2.1, 2.1);
    dartShape();
  }
  ctx.restore();
}

// ---- Tahta içi gösterge: hedef tabelası, süre halkası, canlar ---------------------------------

let targetShownAt = 0;
let shownTarget = null;

function drawHud(now) {
  if (game.target !== shownTarget) { shownTarget = game.target; targetShownAt = now; }
  const pop = Math.max(0, 1 - (now - targetShownAt) / 380);
  const scale = 1 + Math.sin(pop * Math.PI) * .14;
  ctx.save();
  // Hedef tabelası
  ctx.translate(WIDTH / 2, 64);
  ctx.scale(scale, scale);
  ctx.shadowColor = 'rgb(20 40 80 / .3)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath(); ctx.roundRect(-92, -48, 184, 96, 22); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#ff4f7b';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#ff4f7b';
  ctx.beginPath(); ctx.roundRect(-52, -60, 104, 26, 13); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '700 15px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HEDEF', 0, -46);
  ctx.fillStyle = '#23305a';
  ctx.font = '700 56px Fredoka, sans-serif';
  ctx.fillText(String(game.target), 0, 10);
  ctx.restore();

  // Süre halkası
  const left = Math.max(0, ROUND_SECONDS - game.elapsed);
  const urgent = left <= 10 && game.status === 'playing';
  const cx = 62;
  const cy = 64;
  ctx.save();
  ctx.fillStyle = 'rgb(255 255 255 / .9)';
  ctx.beginPath(); ctx.arc(cx, cy, 38, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgb(35 48 90 / .12)';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = urgent ? '#ff4f5e' : '#2f8cff';
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left / ROUND_SECONDS); ctx.stroke();
  const beat = urgent ? 1 + Math.max(0, Math.sin(now / 160)) * .08 : 1;
  ctx.translate(cx, cy); ctx.scale(beat, beat);
  ctx.fillStyle = urgent ? '#e0303f' : '#23305a';
  ctx.font = '700 26px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.ceil(left)), 0, 2);
  ctx.restore();

  // Canlar: kaçan her balon bir can götürür
  for (let i = 0; i < MAX_ESCAPES; i += 1) {
    const lost = i >= MAX_ESCAPES - game.escapes;
    const hx = WIDTH - 112 + i * 40;
    ctx.save();
    ctx.globalAlpha = lost ? .35 : 1;
    const g = ctx.createRadialGradient(hx - 5, 52, 2, hx, 60, 20);
    g.addColorStop(0, lost ? '#dfe3ea' : '#ffc0cf');
    g.addColorStop(1, lost ? '#9aa3b2' : '#ef3d6b');
    ctx.fillStyle = g;
    balloonPath(hx, 60, 15);
    ctx.fill();
    ctx.strokeStyle = 'rgb(255 255 255 / .9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgb(35 48 90 / .5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hx, 77); ctx.quadraticCurveTo(hx - 5, 86, hx, 96); ctx.stroke();
    if (lost) {
      ctx.globalAlpha = .9;
      ctx.strokeStyle = '#e0303f';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hx - 9, 51); ctx.lineTo(hx + 9, 69); ctx.moveTo(hx + 9, 51); ctx.lineTo(hx - 9, 69); ctx.stroke();
    }
    ctx.restore();
  }

  // Kombo rozeti
  const multiplier = Math.min(5, 1 + Math.floor(game.combo / 3));
  if (game.combo >= 2) {
    ctx.save();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.roundRect(WIDTH / 2 - 66, 124, 132, 30, 15); ctx.fill();
    ctx.fillStyle = '#5a3a00';
    ctx.font = '700 16px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Kombo ${game.combo}${multiplier > 1 ? ` · ×${multiplier}` : ''}`, WIDTH / 2, 140);
    ctx.restore();
  }
}

// ---- Efektler: patlama parçaları, puan yazıları, kaçış uyarısı, seviye afişi -----------------

let effects = [];
let escapeFlash = 0;
let banner = null;

function burst(balloon, correct) {
  const color = COLORS[balloon.color % COLORS.length];
  const x = balloon.x;
  const y = balloon.y;
  effects.push({ type: 'ring', x, y, life: .35, age: 0, color: correct ? '#fff' : '#ffd0d6' });
  for (let i = 0; i < 16; i += 1) {
    const angle = Math.PI * 2 * i / 16 + Math.random() * .3;
    const speed = 160 + Math.random() * 220;
    effects.push({ type: 'shard', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 60, spin: Math.random() * 10 - 5, rot: Math.random() * 6, life: .75, age: 0, color: i % 3 ? color.main : color.shine, size: 6 + Math.random() * 7 });
  }
  const multiplier = Math.min(5, 1 + Math.floor(game.combo / 3));
  effects.push(correct
    ? { type: 'text', x, y: y - 20, text: `+${100 * multiplier}`, color: '#1f9d55', life: 1, age: 0 }
    : { type: 'text', x, y: y - 20, text: `✗ ${balloon.a}+${balloon.b}=${balloon.result}`, color: '#e0303f', life: 1.2, age: 0 });
}

function updateEffects(dt) {
  escapeFlash = Math.max(0, escapeFlash - dt);
  if (banner) { banner.age += dt; if (banner.age > banner.life) banner = null; }
  effects = effects.filter(effect => {
    effect.age += dt;
    if (effect.type === 'shard') { effect.x += effect.vx * dt; effect.y += effect.vy * dt; effect.vy += 620 * dt; effect.rot += effect.spin * dt; }
    if (effect.type === 'text') effect.y -= 46 * dt;
    if (effect.type === 'fall') { effect.x += effect.vx * dt; effect.y += effect.vy * dt; effect.vy += 900 * dt; effect.rot += effect.spin * dt; }
    return effect.age < effect.life;
  });
}

function drawEffects() {
  for (const effect of effects) {
    const k = effect.age / effect.life;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    if (effect.type === 'ring') {
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, 30 + k * 60, 0, Math.PI * 2); ctx.stroke();
    } else if (effect.type === 'fall') {
      ctx.globalAlpha = 1 - k * k;
      ctx.translate(effect.x, effect.y);
      ctx.rotate(effect.rot);
      ctx.scale(.8, .8);
      dartShape();
    } else if (effect.type === 'shard') {
      ctx.translate(effect.x, effect.y);
      ctx.rotate(effect.rot);
      ctx.fillStyle = effect.color;
      ctx.beginPath(); ctx.moveTo(0, -effect.size / 2); ctx.lineTo(effect.size / 2, effect.size / 2); ctx.lineTo(-effect.size / 2, effect.size / 3); ctx.closePath(); ctx.fill();
    } else {
      ctx.font = '700 34px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(effect.text, effect.x, effect.y);
      ctx.fillStyle = effect.color;
      ctx.fillText(effect.text, effect.x, effect.y);
    }
    ctx.restore();
  }
  if (escapeFlash > 0) {
    const flash = ctx.createLinearGradient(0, 0, 0, 170);
    flash.addColorStop(0, `rgb(255 60 80 / ${escapeFlash})`);
    flash.addColorStop(1, 'rgb(255 60 80 / 0)');
    ctx.fillStyle = flash;
    ctx.fillRect(0, 0, WIDTH, 170);
  }
  if (banner) {
    const k = banner.age / banner.life;
    const alpha = Math.min(1, banner.age * 5, (1 - k) * 4);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#23305a';
    ctx.beginPath(); ctx.roundRect(70, HEIGHT / 2 - 50, WIDTH - 140, 100, 24); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.font = '700 36px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(banner.title, WIDTH / 2, HEIGHT / 2 - 14);
    ctx.fillStyle = '#fff';
    ctx.font = '600 19px Fredoka, sans-serif';
    ctx.fillText(banner.copy, WIDTH / 2, HEIGHT / 2 + 24);
    ctx.restore();
  }
}

// Mantığın bu karede ürettiği olaylar: patlayan balon, ıskalanan dart, kaçan balon, seviye atlama.
function handleEvents(previous, current) {
  for (const event of current.events || []) {
    if (event.type === 'pop') burst(event, event.correct);
    else if (event.type === 'miss') {
      effects.push({ type: 'fall', x: event.x, y: event.y, vx: (event.x - LAUNCH_X) * .4, vy: -80, rot: -Math.PI / 2, spin: 7, life: .9, age: 0 });
      effects.push({ type: 'text', x: event.x, y: event.y - 24, text: 'Iska!', color: '#5b6785', life: .8, age: 0 });
    }
  }
  if (current.escapes > previous.escapes) escapeFlash = .55;
  const stage = stageFor(current.correctHits);
  if (stage > stageFor(previous.correctHits)) {
    banner = { title: `Seviye ${stage}!`, copy: stage === 2 ? 'Sayılar 20’ye kadar büyüyor' : 'Sayılar 50’ye kadar, balonlar hızlı!', life: 1.8, age: 0 };
  }
}

function draw(now) {
  if (!view.width || !view.height) return;
  ctx.setTransform(view.ratio * view.width / WIDTH, 0, 0, view.ratio * view.height / HEIGHT, 0, 0);
  drawBackground(now);
  for (const balloon of game.balloons) drawBalloon(balloon, now);
  for (const dart of game.darts) drawDart(dart);
  drawLauncher(now);
  drawEffects();
  drawHud(now);
}

function updateHud() {
  targetText.textContent = String(game.target);
  scoreText.textContent = game.score.toLocaleString('tr-TR');
  bestText.textContent = Math.max(records.bestScore, game.score).toLocaleString('tr-TR');
  missesText.textContent = `${game.escapes} / ${MAX_ESCAPES}`;
  missesText.parentElement.classList.toggle('is-danger', game.escapes >= 2);
  comboText.textContent = `Kombo ${game.combo} · ×${Math.min(5, 1 + Math.floor(game.combo / 3))}`;
  correctText.textContent = `Doğru ${game.correctHits}`;
  const seconds = Math.max(0, Math.ceil(ROUND_SECONDS - game.elapsed));
  if (seconds !== lastUiSecond) {
    lastUiSecond = seconds;
    timerText.textContent = String(seconds);
    timerCard.classList.toggle('is-urgent', seconds <= 10);
  }
}

function overlayCopy() {
  if (game.status === 'ready') return ['BALON PATLAT', 'Hazır mısın?', `Hedef ${game.target}. ${game.balloons.find(balloon => balloon.result === game.target)?.a} + ${game.balloons.find(balloon => balloon.result === game.target)?.b} balonunu dartla vur.`, 'Başla'];
  if (game.status === 'paused') return ['MOLA', 'Oyun duraklatıldı', 'Kaldığın yerden devam edebilirsin.', 'Devam et'];
  if (game.status === 'over') return [game.endReason === 'escapes' ? 'BALONLAR KAÇTI' : 'SÜRE BİTTİ', 'Güzel atıştı!', `${game.correctHits} doğru · ${game.score.toLocaleString('tr-TR')} puan · en uzun kombo ${game.bestCombo}.${game.score >= records.bestScore && game.score > 0 ? ' Yeni rekor!' : ''}`, 'Tekrar oyna'];
  return null;
}

function renderOverlay() {
  const pauseButton = $('#pause-button');
  pauseButton.dataset.state = game.status === 'playing' ? 'playing' : 'ready';
  pauseButton.setAttribute('aria-label', game.status === 'playing' ? 'Duraklat' : game.status === 'paused' ? 'Devam et' : 'Başla');
  const copy = overlayCopy();
  overlay.classList.toggle('hidden', !copy || game.status === 'over' && !runRecorded);
  if (!copy) return;
  $('#overlay-kicker').textContent = copy[0];
  $('#overlay-title').textContent = copy[1];
  $('#overlay-copy').textContent = copy[2];
  overlayButton.textContent = copy[3];
}

function tone(kind) {
  if (!soundOn) return;
  try {
    audioContext ||= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = kind === 'correct' ? 740 : kind === 'wrong' ? 190 : 320;
    gain.gain.setValueAtTime(.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.09, audioContext.currentTime + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .12);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + .13);
  } catch {}
}

function finishRun() {
  if (runRecorded) return;
  runRecorded = true;
  const accuracy = game.dartsFired ? Math.round(game.correctHits * 100 / game.dartsFired) : 0;
  records = {
    bestScore: Math.max(records.bestScore, game.score),
    bestCorrect: Math.max(records.bestCorrect, game.correctHits),
    bestCombo: Math.max(records.bestCombo, game.bestCombo),
    bestAccuracy: Math.max(records.bestAccuracy, accuracy),
    runs: records.runs + 1
  };
  saveRecords();
  status.textContent = `${game.endReason === 'escapes' ? 'Üç balon kaçtı' : '60 saniye doldu'} · ${game.correctHits} doğru · ${game.score} puan.`;
  tone('over');
  renderOverlay();
}

function play() {
  if (game.status === 'over') { newGame(); return; }
  game = startGame(game);
  runRecorded = false;
  status.textContent = 'Nişan al, hedef toplamı veren işlemi vur!';
  renderOverlay();
}

function pause() {
  if (game.status !== 'playing') return;
  game = pauseGame(game);
  status.textContent = 'Oyun duraklatıldı.';
  renderOverlay();
}

function newGame() {
  game = startGame(createGame());
  runRecorded = false;
  lastUiSecond = -1;
  status.textContent = 'Yeni tur başladı. Hedef işlemi bul!';
  updateHud();
  renderOverlay();
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * WIDTH, y: (event.clientY - rect.top) / rect.height * HEIGHT };
}

function frameLoop(now) {
  const dt = Math.max(0, Math.min(.05, (now - lastFrame) / 1000));
  lastFrame = now;
  if (game.status === 'playing') {
    const previous = game;
    game = advance(game, dt);
    handleEvents(previous, game);
    if (game.correctHits > previous.correctHits) { tone('correct'); status.textContent = `Doğru! Yeni hedef ${game.target}.`; }
    else if (game.wrongHits > previous.wrongHits) { tone('wrong'); status.textContent = 'Bu işlem hedefe eşit değil. Hedef aynı kaldı; tekrar dene.'; }
    if (game.escapes > previous.escapes) tone('escape');
    if (game.misses > previous.misses) tone('miss');
    updateHud();
    if (game.status === 'over') finishRun();
  }
  updateEffects(game.status === 'playing' ? dt : 0);
  draw(now);
  requestAnimationFrame(frameLoop);
}

canvas.addEventListener('pointermove', event => {
  if (game.status !== 'playing') return;
  const point = pointFromEvent(event);
  game = aimAt(game, point.x, point.y);
});
canvas.addEventListener('pointerdown', event => {
  event.preventDefault();
  if (game.status !== 'playing') return;
  const point = pointFromEvent(event);
  game = fireDart(aimAt(game, point.x, point.y));
});

function typing(target) { return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)); }
document.addEventListener('keydown', event => {
  if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === ' ' && !event.repeat) {
    event.preventDefault();
    if (game.status === 'playing') game = fireDart(game);
    else play();
  } else if (game.status === 'playing' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const dx = event.key === 'ArrowLeft' ? -36 : event.key === 'ArrowRight' ? 36 : 0;
    const dy = event.key === 'ArrowUp' ? -36 : event.key === 'ArrowDown' ? 36 : 0;
    game = aimAt(game, game.aim.x + dx, game.aim.y + dy);
  } else if (event.key.toLowerCase() === 'p') {
    if (game.status === 'playing') pause(); else if (game.status === 'paused') play();
  }
});

overlayButton.addEventListener('click', play);
$('#pause-button').addEventListener('click', () => game.status === 'playing' ? pause() : play());
$('#new-game').addEventListener('click', newGame);
soundButton.addEventListener('click', () => {
  soundOn = !soundOn;
  soundButton.setAttribute('aria-pressed', String(soundOn));
  soundButton.setAttribute('aria-label', soundOn ? 'Sesi kapat' : 'Sesi aç');
  if (soundOn) tone('correct');
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('blur', pause);
new ResizeObserver(resize).observe(frame);
window.addEventListener('resize', resize);
window.addEventListener('game:fullscreenfit', resize);

const cloudSync = syncGameOnAccountChange('balon-patlat', {
  read: () => ({ records }),
  write: incoming => { records = mergeRecords(records, incoming.records); updateHud(); },
  isValid: incoming => Boolean(incoming?.records && typeof incoming.records === 'object'),
  merge: (local, remote) => ({ records: mergeRecords(local.records, remote.records) }),
  getStats: current => ({ bestScore: current.records.bestScore, bestCorrect: current.records.bestCorrect, bestCombo: current.records.bestCombo, bestAccuracy: current.records.bestAccuracy }),
  onStatus: message => { saveState.textContent = message; }
});

loadRecords();
updateHud();
renderOverlay();
resize();
requestAnimationFrame(frameLoop);
