import { WIDTH, HEIGHT, ROUND_SECONDS, MAX_LIVES, CORRECT_BONUS_SECONDS, WRONG_PENALTY_SECONDS, createGame, startGame, pauseGame, aimAt, fireDart, advance, labelOf, levelOf } from './logic.js?v=sahne18';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=sahne18';
import { createStage } from '../../game-stage.js?v=sahne18';

const KEY = 'oyunarasi-balon-patlat-v1';
const SOUND_KEY = 'oyunarasi-balon-patlat-ses';
const $ = selector => document.querySelector(selector);
const canvas = $('#board');
const ctx = canvas.getContext('2d');
const frame = $('.board-frame');
// Başlangıç, mola ve tur sonu kartları ortak sahne şablonundan (game-stage.js) gelir.
const stage = createStage();
let lastRunRecord = false;
const status = $('#status');
const saveState = $('#save-state');
const soundButton = $('#sound-button');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const COLORS = [
  { main: '#ff4f7b', edge: '#c9224f', shine: '#ffc2d1', ink: '#fff', stroke: '#9e1840' },
  { main: '#ffd23f', edge: '#e0a000', shine: '#fff4c2', ink: '#4a3200', stroke: '#fff4c2' },
  { main: '#2f8cff', edge: '#1559c2', shine: '#bfe0ff', ink: '#fff', stroke: '#0f418f' },
  { main: '#2fbf71', edge: '#178a4c', shine: '#c3f5d8', ink: '#fff', stroke: '#0f6436' },
  { main: '#9b5cf6', edge: '#6a2fc4', shine: '#e2d2ff', ink: '#fff', stroke: '#4c1d95' },
  { main: '#ff9f1c', edge: '#d46b00', shine: '#ffe0b3', ink: '#fff', stroke: '#9a4a00' }
];

let game = createGame();
let records = { bestScore: 0, bestCorrect: 0, bestCombo: 0, bestAccuracy: 0, bestLevel: 0, runs: 0 };
let soundOn = readSoundPreference();
let view = { width: 1, height: 1, ratio: 1 };
let lastFrame = performance.now();
let runRecorded = true;
let countdown = 0;

// ---- Kayıt ------------------------------------------------------------------------------------

function mergeRecords(a = {}, b = {}) {
  const max = key => Math.max(Number(a[key]) || 0, Number(b[key]) || 0);
  return { bestScore: max('bestScore'), bestCorrect: max('bestCorrect'), bestCombo: max('bestCombo'), bestAccuracy: max('bestAccuracy'), bestLevel: max('bestLevel'), runs: max('runs') };
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

function readSoundPreference() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

// ---- Ses: gerçek patlama, dart vınlaması, doğru/yanlış ----------------------------------------

let audio = null;
let noiseBuffer = null;

function sfx(kind) {
  if (!soundOn) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const c = audio;
    const t = c.currentTime;
    const out = c.createGain();
    out.gain.value = .55;
    out.connect(c.destination);
    if (!noiseBuffer) {
      noiseBuffer = c.createBuffer(1, c.sampleRate * .5, c.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    const tone = (type, from, to, duration, peak, delay = 0) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t + delay);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t + delay + duration);
      gain.gain.setValueAtTime(.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(peak, t + delay + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, t + delay + duration);
      osc.connect(gain); gain.connect(out);
      osc.start(t + delay); osc.stop(t + delay + duration + .03);
    };
    const hiss = (duration, from, to, peak, q = 1) => {
      const source = c.createBufferSource();
      const filter = c.createBiquadFilter();
      const gain = c.createGain();
      source.buffer = noiseBuffer;
      filter.type = 'bandpass';
      filter.Q.value = q;
      filter.frequency.setValueAtTime(from, t);
      if (to) filter.frequency.exponentialRampToValueAtTime(to, t + duration);
      gain.gain.setValueAtTime(peak, t);
      gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
      source.connect(filter); filter.connect(gain); gain.connect(out);
      source.start(t); source.stop(t + duration + .03);
    };
    if (kind === 'throw') hiss(.22, 450, 2600, .22, .8);
    else if (kind === 'pop') { hiss(.13, 2200, 600, 1, .6); tone('sine', 170, 55, .12, .5); }
    else if (kind === 'correct') { tone('triangle', 660, 0, .12, .2, .05); tone('triangle', 990, 0, .2, .2, .13); }
    else if (kind === 'wrong') tone('square', 210, 110, .24, .07, .04);
    else if (kind === 'escape') tone('sine', 520, 170, .38, .14);
    else if (kind === 'tick') tone('sine', 720, 0, .09, .16);
    else if (kind === 'go') { tone('sine', 880, 0, .12, .18); tone('sine', 1320, 0, .22, .18, .1); }
    else if (kind === 'over') { tone('triangle', 523, 0, .2, .18); tone('triangle', 659, 0, .2, .18, .17); tone('triangle', 784, 0, .4, .18, .34); }
  } catch {}
}

// ---- Tuval -------------------------------------------------------------------------------------

function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  view = { width: rect.width, height: rect.height, ratio };
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  draw(performance.now());
}

// ---- Sahne: gökyüzü, bulutlar, lunapark, tepeler ----------------------------------------------

const CLOUDS = [
  { x: 40, y: 200, s: 1, v: 9 }, { x: 330, y: 262, s: .8, v: 6 }, { x: 520, y: 165, s: .65, v: 11 }, { x: 180, y: 372, s: .55, v: 7 }
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

function drawFair(now) {
  // Dönme dolap
  const cx = 104;
  const cy = HEIGHT - 212;
  const r = 66;
  ctx.save();
  ctx.strokeStyle = 'rgb(255 255 255 / .75)';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(cx - 34, HEIGHT - 120); ctx.lineTo(cx, cy); ctx.lineTo(cx + 34, HEIGHT - 120); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const turn = now / 9000;
  const cabins = ['#ff7a9c', '#ffd35c', '#6fb6ff', '#7fdc9c', '#b892ff', '#ffb35c', '#ff7a9c', '#6fb6ff'];
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 8; i += 1) {
    const a = turn + i * Math.PI / 4;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    ctx.strokeStyle = 'rgb(255 255 255 / .6)';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = cabins[i];
    ctx.beginPath(); ctx.roundRect(x - 8, y - 2, 16, 13, 4); ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  // Çadırlar
  for (const [x, w, h] of [[440, 58, 50], [505, 46, 40]]) {
    const base = HEIGHT - 150 - (x - 440) * .12;
    ctx.fillStyle = '#fff4ea';
    ctx.beginPath(); ctx.moveTo(x - w / 2, base); ctx.lineTo(x, base - h); ctx.lineTo(x + w / 2, base); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff6b8e';
    for (let i = 0; i < 3; i += 1) {
      const from = x - w / 2 + i * w / 3;
      ctx.beginPath(); ctx.moveTo(from, base); ctx.lineTo(x, base - h); ctx.lineTo(from + w / 6, base); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#ff6b8e';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, base - h); ctx.lineTo(x, base - h - 12); ctx.stroke();
    ctx.fillStyle = '#ffd35c';
    ctx.beginPath(); ctx.moveTo(x, base - h - 12); ctx.lineTo(x + 10, base - h - 8); ctx.lineTo(x, base - h - 4); ctx.fill();
  }
  ctx.restore();
}

function drawBackground(now) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, '#4fa8ec');
  sky.addColorStop(.55, '#9ad6fb');
  sky.addColorStop(.86, '#ffe7c4');
  sky.addColorStop(1, '#ffd9a8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const sun = ctx.createRadialGradient(505, 215, 10, 505, 215, 120);
  sun.addColorStop(0, 'rgb(255 250 214 / .95)');
  sun.addColorStop(.35, 'rgb(255 236 160 / .55)');
  sun.addColorStop(1, 'rgb(255 236 160 / 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(360, 70, 300, 300);
  const t = now / 1000;
  for (const item of CLOUDS) {
    const x = ((item.x + t * item.v) % (WIDTH + 220)) - 110;
    ctx.fillStyle = 'rgb(122 170 214 / .22)';
    cloud(x + 4, item.y + 7, item.s);
    ctx.fillStyle = 'rgb(255 255 255 / .92)';
    cloud(x, item.y, item.s);
  }
  ctx.fillStyle = '#9ddc86';
  ctx.beginPath(); ctx.moveTo(0, HEIGHT - 128);
  ctx.bezierCurveTo(140, HEIGHT - 196, 260, HEIGHT - 116, 380, HEIGHT - 146);
  ctx.bezierCurveTo(470, HEIGHT - 170, 540, HEIGHT - 156, WIDTH, HEIGHT - 180);
  ctx.lineTo(WIDTH, HEIGHT); ctx.lineTo(0, HEIGHT); ctx.fill();
  drawFair(now);
  ctx.fillStyle = '#62c15b';
  ctx.beginPath(); ctx.moveTo(0, HEIGHT - 72);
  ctx.bezierCurveTo(170, HEIGHT - 124, 390, HEIGHT - 58, WIDTH, HEIGHT - 104);
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
  const x = balloon.x + Math.sin(balloon.wobble) * 4;
  const y = balloon.y;
  const r = balloon.radius;
  const color = COLORS[balloon.color % COLORS.length];
  const near = (balloon.depth || 1);
  ctx.save();
  ctx.strokeStyle = 'rgb(70 80 110 / .55)';
  ctx.lineWidth = 2 * near;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 1.14);
  const swing = Math.sin(now / 420 + balloon.id) * 6;
  ctx.bezierCurveTo(x - 10 + swing, y + r + 26 * near, x + 10 - swing, y + r + 44 * near, x + swing * .5, y + r + 66 * near);
  ctx.stroke();
  ctx.shadowColor = 'rgb(20 50 90 / .25)';
  ctx.shadowBlur = 14 * near;
  ctx.shadowOffsetY = 8 * near;
  const fill = ctx.createRadialGradient(x - r * .35, y - r * .45, r * .1, x, y, r * 1.2);
  fill.addColorStop(0, color.shine);
  fill.addColorStop(.3, color.main);
  fill.addColorStop(1, color.edge);
  ctx.fillStyle = fill;
  balloonPath(x, y, r);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = color.edge;
  ctx.beginPath(); ctx.moveTo(x - 7 * near, y + r * 1.2); ctx.lineTo(x + 7 * near, y + r * 1.2); ctx.lineTo(x, y + r * 1.04); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgb(255 255 255 / .55)';
  ctx.beginPath(); ctx.ellipse(x - r * .42, y - r * .5, r * .16, r * .3, .5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgb(255 255 255 / .35)';
  ctx.beginPath(); ctx.arc(x - r * .18, y - r * .78, r * .07, 0, Math.PI * 2); ctx.fill();
  const label = labelOf(balloon);
  const size = (label.length >= 7 ? 27 : 32) * r / 50;
  ctx.font = `700 ${size}px Fredoka, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5 * r / 50;
  ctx.strokeStyle = color.stroke;
  ctx.strokeText(label, x, y + 2, r * 1.7);
  ctx.fillStyle = color.ink;
  ctx.fillText(label, x, y + 2, r * 1.7);
  ctx.restore();
}

// ---- Dart ve el ----------------------------------------------------------------------------------

// Arkadan görünen dart: tüyler sana dönük, uç sahnenin derinliğine bakar.
function rearDart(x, y, angle, s, length = 1) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const barrel = 30 * length;
  const tip = 46 * length + (length - 1) * 8;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1f2740';
  ctx.lineWidth = 7 * s;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * barrel * s, y + dy * barrel * s); ctx.stroke();
  ctx.strokeStyle = '#a3afc2';
  ctx.lineWidth = 5 * s;
  ctx.beginPath(); ctx.moveTo(x + dx * 14 * s, y + dy * 14 * s); ctx.lineTo(x + dx * barrel * s, y + dy * barrel * s); ctx.stroke();
  ctx.strokeStyle = '#7d889c';
  ctx.lineWidth = 2.4 * s;
  ctx.beginPath(); ctx.moveTo(x + dx * barrel * s, y + dy * barrel * s); ctx.lineTo(x + dx * tip * s, y + dy * tip * s); ctx.stroke();
  for (let i = 0; i < 4; i += 1) {
    const a = angle + Math.PI / 4 + i * Math.PI / 2;
    const ox = Math.cos(a);
    const oy = Math.sin(a);
    const back = -8 * s;
    ctx.fillStyle = i % 2 ? '#ffd23f' : '#ff4f7b';
    ctx.strokeStyle = 'rgb(20 25 45 / .55)';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(x + dx * 6 * s, y + dy * 6 * s);
    ctx.lineTo(x + ox * 20 * s + dx * back, y + oy * 20 * s + dy * back);
    ctx.lineTo(x + ox * 17 * s + dx * (back - 10 * s), y + oy * 17 * s + dy * (back - 10 * s));
    ctx.lineTo(x - dx * 4 * s, y - dy * 4 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#1f2740';
  ctx.beginPath(); ctx.arc(x, y, 3.2 * s, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

const HAND = { x: WIDTH * .7, y: HEIGHT - 70 };
const HAND_SCALE = 2.3;
const FAR_SCALE = .55;
function dartPosition(dart, t) {
  const p = 1 - (1 - t) ** 3;
  return {
    x: HAND.x + (dart.tx - HAND.x) * p,
    y: HAND.y + (dart.ty - HAND.y) * p - Math.sin(Math.PI * p) * 40,
    scale: HAND_SCALE + (FAR_SCALE - HAND_SCALE) * p
  };
}

function drawDart(dart) {
  const now = dartPosition(dart, dart.t);
  const angle = Math.atan2(dart.ty - HAND.y, dart.tx - HAND.x);
  const before = dartPosition(dart, Math.max(0, dart.t - .08));
  ctx.save();
  ctx.strokeStyle = 'rgb(255 255 255 / .35)';
  ctx.lineWidth = 10 * now.scale;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(before.x, before.y); ctx.lineTo(now.x, now.y); ctx.stroke();
  ctx.restore();
  rearDart(now.x, now.y, angle, now.scale);
}

let readyAt = 0;

function drawCrosshair() {
  if (game.status !== 'playing') return;
  const { x, y } = game.aim;
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgb(20 40 80 / .55)';
  ctx.shadowBlur = 4;
  ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * 8, y + dy * 8); ctx.lineTo(x + dx * 22, y + dy * 22); }
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#ff4f7b';
  ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Elde bekleyen dart: nişana döner; atılınca yenisi aşağıdan kayarak gelir.
function drawReadyDart(now) {
  if (game.darts.length) { readyAt = now; return; }
  const slide = Math.min(1, (now - readyAt) / 240);
  const ease = 1 - (1 - slide) ** 3;
  const x = HAND.x + (1 - ease) * 50;
  const y = HAND.y + (1 - ease) * 230 + Math.sin(now / 340) * 3;
  const aim = game.status === 'playing' ? game.aim : { x: WIDTH * .45, y: HEIGHT * .35 };
  rearDart(x, y, Math.atan2(aim.y - y, aim.x - x), HAND_SCALE, 1.45);
}

// ---- Tahta içi gösterge: hedef tabelası, süre halkası, canlar, puan -----------------------------

let targetShownAt = 0;
let shownTarget = null;
let shownScore = 0;

function drawHud(now, dt) {
  if (game.target !== shownTarget) { shownTarget = game.target; targetShownAt = now; }
  const pop = Math.max(0, 1 - (now - targetShownAt) / 380);
  const scale = 1 + Math.sin(pop * Math.PI) * .16;
  ctx.save();
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
  const left = Math.max(0, game.timeLeft);
  const urgent = left <= 10 && game.status === 'playing';
  ctx.save();
  ctx.fillStyle = 'rgb(255 255 255 / .92)';
  ctx.beginPath(); ctx.arc(62, 64, 38, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgb(35 48 90 / .12)';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(62, 64, 30, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = urgent ? '#ff4f5e' : '#2f8cff';
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(62, 64, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, left / ROUND_SECONDS)); ctx.stroke();
  const beat = urgent ? 1 + Math.max(0, Math.sin(now / 160)) * .08 : 1;
  ctx.translate(62, 64); ctx.scale(beat, beat);
  ctx.fillStyle = urgent ? '#e0303f' : '#23305a';
  ctx.font = '700 26px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.ceil(left)), 0, 2);
  ctx.restore();

  // Canlar: kaçan her balon bir can götürür
  for (let i = 0; i < MAX_LIVES; i += 1) {
    const lost = i >= game.lives;
    const hx = WIDTH - 112 + i * 40;
    ctx.save();
    ctx.globalAlpha = lost ? .35 : 1;
    const g = ctx.createRadialGradient(hx - 5, 44, 2, hx, 52, 20);
    g.addColorStop(0, lost ? '#dfe3ea' : '#ffc0cf');
    g.addColorStop(1, lost ? '#9aa3b2' : '#ef3d6b');
    ctx.fillStyle = g;
    balloonPath(hx, 50, 15);
    ctx.fill();
    ctx.strokeStyle = 'rgb(255 255 255 / .9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (lost) {
      ctx.globalAlpha = .9;
      ctx.strokeStyle = '#e0303f';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hx - 9, 41); ctx.lineTo(hx + 9, 59); ctx.moveTo(hx + 9, 41); ctx.lineTo(hx - 9, 59); ctx.stroke();
    }
    ctx.restore();
  }
  // Puan: artışlar sayaç gibi akar
  shownScore += (game.score - shownScore) * Math.min(1, dt * 10);
  if (Math.abs(game.score - shownScore) < 1) shownScore = game.score;
  ctx.save();
  ctx.fillStyle = 'rgb(35 48 90 / .78)';
  ctx.beginPath(); ctx.roundRect(WIDTH - 128, 80, 108, 32, 16); ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.font = '700 19px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(shownScore).toLocaleString('tr-TR'), WIDTH - 74, 97);
  ctx.restore();

  const multiplier = Math.min(5, 1 + Math.floor(game.combo / 3));
  if (game.combo >= 2) {
    ctx.save();
    ctx.fillStyle = multiplier > 1 ? '#ff7a1a' : '#ffd23f';
    ctx.beginPath(); ctx.roundRect(WIDTH / 2 - 70, 124, 140, 30, 15); ctx.fill();
    ctx.fillStyle = multiplier > 1 ? '#fff' : '#5a3a00';
    ctx.font = '700 16px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${multiplier > 1 ? '🔥 ' : ''}Kombo ${game.combo}${multiplier > 1 ? ` · ×${multiplier}` : ''}`, WIDTH / 2, 140);
    ctx.restore();
  }
}

// ---- Efektler ---------------------------------------------------------------------------------

let effects = [];
let escapeFlash = 0;
let shake = 0;
let banner = null;

function burst(event, outcome) {
  const correct = outcome === 'correct';
  const color = COLORS[event.color % COLORS.length];
  const { x, y } = event;
  const r = event.radius || 50;
  effects.push({ type: 'ring', x, y, life: .35, age: 0, color: correct ? '#fff' : '#ffd0d6', r });
  for (let i = 0; i < 16; i += 1) {
    const angle = Math.PI * 2 * i / 16 + Math.random() * .3;
    const speed = 160 + Math.random() * 220;
    effects.push({ type: 'shard', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 60, spin: Math.random() * 10 - 5, rot: Math.random() * 6, life: .75, age: 0, color: i % 3 ? color.main : color.shine, size: 6 + Math.random() * 7 });
  }
  // Yırtılan balon lastiği ve düşen ip
  for (let i = 0; i < 3; i += 1) {
    effects.push({ type: 'rubber', x: x + (i - 1) * r * .3, y: y + r * .2, vx: (i - 1) * 90 + Math.random() * 40 - 20, vy: -60 - Math.random() * 60, rot: Math.random() * 6, spin: Math.random() * 6 - 3, size: r * (.32 + Math.random() * .12), color: color.main, edge: color.edge, life: 1.1, age: 0 });
  }
  effects.push({ type: 'string', x, y: y + r * 1.14, vy: 40, life: 1, age: 0, length: 66 * (r / 50) });
  if (outcome === 'correct') {
    effects.push({ type: 'text', x, y: y - 20, text: `+${event.points}`, color: '#1f9d55', life: 1, age: 0 });
    effects.push({ type: 'text', x: 62, y: 118, text: `+${CORRECT_BONUS_SECONDS} sn`, color: '#1f9d55', life: .9, age: 0, small: true });
  } else if (outcome === 'wrong') {
    effects.push({ type: 'text', x, y: y - 20, text: `✗ ${labelOf(event)} = ${event.result}`, color: '#e0303f', life: 1.3, age: 0 });
    effects.push({ type: 'text', x: 62, y: 118, text: `−${WRONG_PENALTY_SECONDS} sn`, color: '#e0303f', life: .9, age: 0, small: true });
  }
  shake = Math.max(shake, correct ? 7 : outcome === 'wrong' ? 4 : 2);
}

function updateEffects(dt) {
  escapeFlash = Math.max(0, escapeFlash - dt);
  shake = Math.max(0, shake - dt * 40);
  if (banner) { banner.age += dt; if (banner.age > banner.life) banner = null; }
  effects = effects.filter(effect => {
    effect.age += dt;
    if (effect.type === 'shard' || effect.type === 'rubber') {
      effect.x += effect.vx * dt; effect.y += effect.vy * dt;
      effect.vy += (effect.type === 'rubber' ? 520 : 620) * dt; effect.rot += effect.spin * dt;
    }
    if (effect.type === 'string') { effect.y += effect.vy * dt; effect.vy += 380 * dt; }
    if (effect.type === 'text') effect.y -= 46 * dt;
    if (effect.type === 'away') effect.y -= 60 * dt;
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
      ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.r * .6 + k * effect.r * 1.2, 0, Math.PI * 2); ctx.stroke();
    } else if (effect.type === 'shard') {
      ctx.translate(effect.x, effect.y);
      ctx.rotate(effect.rot);
      ctx.fillStyle = effect.color;
      ctx.beginPath(); ctx.moveTo(0, -effect.size / 2); ctx.lineTo(effect.size / 2, effect.size / 2); ctx.lineTo(-effect.size / 2, effect.size / 3); ctx.closePath(); ctx.fill();
    } else if (effect.type === 'rubber') {
      ctx.globalAlpha = 1 - k * k;
      ctx.translate(effect.x, effect.y);
      ctx.rotate(effect.rot);
      const s = effect.size;
      ctx.fillStyle = effect.color;
      ctx.strokeStyle = effect.edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * .5, -s * .2);
      ctx.quadraticCurveTo(-s * .2, -s * .7, s * .3, -s * .4);
      ctx.lineTo(s * .15, -s * .1);
      ctx.quadraticCurveTo(s * .6, s * .1, s * .2, s * .45);
      ctx.lineTo(-s * .05, s * .15);
      ctx.quadraticCurveTo(-s * .45, s * .4, -s * .5, -s * .2);
      ctx.fill(); ctx.stroke();
    } else if (effect.type === 'string') {
      ctx.strokeStyle = 'rgb(70 80 110 / .6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      const w = Math.sin(effect.age * 14) * 8;
      ctx.bezierCurveTo(effect.x + w, effect.y + effect.length * .33, effect.x - w, effect.y + effect.length * .66, effect.x + w * .5, effect.y + effect.length);
      ctx.stroke();
    } else if (effect.type === 'away') {
      rearDart(effect.x, effect.y, -Math.PI / 2, FAR_SCALE * (1 - k * .8));
    } else {
      ctx.font = `700 ${effect.small ? 22 : 34}px Fredoka, sans-serif`;
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
}

function drawBanner() {
  if (!banner) return;
  const k = banner.age / banner.life;
  ctx.save();
  ctx.globalAlpha = Math.min(1, banner.age * 5, (1 - k) * 4);
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

// 3-2-1-At! geri sayımı
function drawCountdown() {
  if (countdown <= 0) return;
  const step = Math.ceil(countdown - .5);
  const within = (countdown - .5) % 1 || 1;
  const text = step > 0 ? String(step) : 'At!';
  const grow = step > 0 ? within : Math.min(1, countdown / .5);
  ctx.save();
  ctx.fillStyle = 'rgb(35 48 90 / .18)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.translate(WIDTH / 2, HEIGHT / 2);
  const scale = 1 + (1 - grow) * .5;
  ctx.scale(scale, scale);
  ctx.globalAlpha = Math.min(1, grow * 1.6);
  ctx.font = '700 130px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#fff';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = step > 0 ? '#ff4f7b' : '#1f9d55';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

const NEW_OPERATION = { '−': ['Çıkarma geldi!', 'Artık balonlarda − işlemleri de var'], '×': ['Çarpma geldi!', 'Çarpım tablosunu hatırla'], '÷': ['Bölme geldi!', 'Bölümü bul, dartını at'] };

// Mantığın bu karede ürettiği olaylar: patlayan balon, ıskalanan dart, kaçan cevap, yeni işlem.
function handleEvents(current) {
  for (const event of current.events || []) {
    if (event.type === 'pop') {
      burst(event, event.outcome);
      effects.push({ type: 'away', x: event.x, y: event.y, life: .35, age: 0 });
      sfx('pop');
      if (event.outcome === 'correct') { sfx('correct'); status.textContent = `Doğru! ${labelOf(event)} = ${event.result}. Yeni hedef ${current.target}.`; }
      else if (event.outcome === 'wrong') { sfx('wrong'); status.textContent = `${labelOf(event)} = ${event.result}; hedef ${current.target}. −${WRONG_PENALTY_SECONDS} sn.`; }
    } else if (event.type === 'miss') {
      effects.push({ type: 'away', x: event.x, y: event.y, life: .45, age: 0 });
      effects.push({ type: 'text', x: event.x, y: event.y - 24, text: 'Iska!', color: '#5b6785', life: .8, age: 0 });
    } else if (event.type === 'escape') {
      escapeFlash = .6;
      sfx('escape');
      effects.push({ type: 'text', x: WIDTH / 2, y: 190, text: `Kaçtı! ${labelOf(event)} = ${event.result}`, color: '#e0303f', life: 1.6, age: 0 });
      status.textContent = `Hedefi veren balon kaçtı (${labelOf(event)}). Bir can gitti; yeni hedef ${current.target}.`;
    } else if (event.type === 'retarget') {
      effects.push({ type: 'text', x: WIDTH / 2, y: 132, text: 'Yeni hedef', color: '#2f6fd6', life: .9, age: 0, small: true });
      status.textContent = `Hedefin balonu kaçtı ama yeni geldiği için sayılmadı. Yeni hedef ${current.target}.`;
    } else if (event.type === 'level' && NEW_OPERATION[event.op]) {
      const [title, copy] = NEW_OPERATION[event.op];
      banner = { title, copy, life: 1.6, age: 0 };
    }
  }
}

function draw(now, dt = 0) {
  if (!view.width || !view.height) return;
  ctx.setTransform(view.ratio * view.width / WIDTH, 0, 0, view.ratio * view.height / HEIGHT, 0, 0);
  if (shake > 0 && !reducedMotion.matches) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
  drawBackground(now);
  const balloons = [...game.balloons].sort((a, b) => a.radius - b.radius);
  for (const balloon of balloons) drawBalloon(balloon, now);
  drawEffects();
  for (const dart of game.darts) drawDart(dart);
  drawCrosshair();
  drawReadyDart(now);
  drawHud(now, dt);
  drawBanner();
  drawCountdown();
}

// ---- Göstergeler ve kartlar -----------------------------------------------------------------------

function updateHud() {
  $('#target-number').textContent = String(game.target);
  $('#score').textContent = game.score.toLocaleString('tr-TR');
  $('#best-score').textContent = Math.max(records.bestScore, game.score).toLocaleString('tr-TR');
  $('#misses').textContent = `${game.lives} / ${MAX_LIVES}`;
  $('#combo').textContent = `Kombo ${game.combo} · ×${Math.min(5, 1 + Math.floor(game.combo / 3))}`;
  $('#correct-count').textContent = `Doğru ${game.correctHits}`;
  $('#timer').textContent = String(Math.max(0, Math.ceil(game.timeLeft)));
}

function renderOverlay() {
  const pauseButton = $('#pause-button');
  pauseButton.dataset.state = game.status === 'playing' || countdown > 0 ? 'playing' : 'ready';
  pauseButton.setAttribute('aria-label', game.status === 'playing' ? 'Duraklat' : game.status === 'paused' ? 'Devam et' : 'Başla');
  if (countdown > 0) { stage.hide(); return; }
  if (game.status === 'ready') {
    stage.show({ kind: 'start', kicker: 'BALON PATLAT', title: 'Dartını hazırla!', copy: 'Üstteki hedef sayıyı veren balonu bul ve dartını fırlat! Vurunca hedef hemen değişir. Doğru +1 sn, yanlış −2 sn; hedefi veren balonu kaçırırsan can gider.', actions: [{ label: 'Başla', primary: true, onClick: play }] });
  } else if (game.status === 'paused') {
    stage.show({ kind: 'pause', kicker: 'MOLA', title: 'Oyun duraklatıldı', copy: 'Kaldığın yerden devam edebilirsin.', actions: [{ label: 'Devam et', primary: true, onClick: play }, { label: 'Yeni tur', onClick: newGame }] });
  } else if (game.status === 'over' && runRecorded) {
    const accuracy = game.dartsFired ? Math.round(game.correctHits * 100 / game.dartsFired) : 0;
    stage.show({
      kind: 'result', kicker: game.endReason === 'lives' ? 'CANLAR BİTTİ' : 'SÜRE BİTTİ', title: 'Güzel atıştı!', record: lastRunRecord,
      stats: [['Puan', game.score.toLocaleString('tr-TR')], ['Seviye', levelOf(game.correctHits)], ['Doğru', game.correctHits], ['En uzun kombo', game.bestCombo], ['İsabet', `%${accuracy}`], ['Yanlış', game.wrongHits]],
      actions: [{ label: 'Tekrar oyna', primary: true, onClick: play }]
    });
  } else stage.hide();
}

function finishRun() {
  if (runRecorded) return;
  const accuracy = game.dartsFired ? Math.round(game.correctHits * 100 / game.dartsFired) : 0;
  lastRunRecord = game.score > 0 && game.score > records.bestScore;
  runRecorded = true;
  records = {
    bestScore: Math.max(records.bestScore, game.score),
    bestCorrect: Math.max(records.bestCorrect, game.correctHits),
    bestCombo: Math.max(records.bestCombo, game.bestCombo),
    bestAccuracy: Math.max(records.bestAccuracy, accuracy),
    bestLevel: Math.max(records.bestLevel || 0, levelOf(game.correctHits)),
    runs: records.runs + 1
  };
  renderOverlay();
  saveRecords();
  status.textContent = `${game.endReason === 'lives' ? 'Canlar bitti' : 'Süre doldu'} · ${game.correctHits} doğru · ${game.score} puan.`;
  sfx('over');
  updateHud();
}

// ---- Akış -------------------------------------------------------------------------------------

function beginCountdown() {
  countdown = reducedMotion.matches ? .6 : 3.5;
  status.textContent = 'Hazırlan…';
  sfx('tick');
  renderOverlay();
}

function play() {
  if (game.status === 'over') { newGame(); return; }
  if (game.status === 'ready') { beginCountdown(); return; }
  game = startGame(game);
  status.textContent = 'Nişan al, hedef sayıyı veren işlemi vur!';
  renderOverlay();
}

function pause() {
  if (countdown > 0) return;
  if (game.status !== 'playing') return;
  game = pauseGame(game);
  status.textContent = 'Oyun duraklatıldı.';
  renderOverlay();
}

function newGame() {
  game = createGame();
  runRecorded = true;
  effects = [];
  banner = null;
  shownScore = 0;
  updateHud();
  beginCountdown();
}

function tickCountdown(dt) {
  if (countdown <= 0) return;
  const before = Math.ceil(countdown - .5);
  countdown -= dt;
  const after = Math.ceil(countdown - .5);
  if (after !== before) sfx(after > 0 ? 'tick' : 'go');
  if (countdown <= 0) {
    countdown = 0;
    game = startGame(game);
    runRecorded = false;
    status.textContent = 'Nişan al, hedef sayıyı veren işlemi vur!';
    renderOverlay();
  }
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * WIDTH, y: (event.clientY - rect.top) / rect.height * HEIGHT };
}

function throwAtAim() {
  const before = game;
  game = fireDart(game);
  if (game.dartsFired > before.dartsFired) {
    sfx('throw');
  }
}

function frameLoop(now) {
  // Yavaş cihazda oyun ağır çekime düşmesin: kare başına en çok 0,1 sn (mantık bunu küçük dilimlerle işler);
  // geri sayım gerçek zamanla akar.
  const raw = Math.max(0, (now - lastFrame) / 1000);
  const dt = Math.min(.1, raw);
  lastFrame = now;
  tickCountdown(Math.min(.5, raw));
  if (game.status === 'playing') {
    game = advance(game, dt);
    handleEvents(game);
    updateHud();
    if (game.status === 'over') finishRun();
  }
  updateEffects(game.status === 'playing' || countdown > 0 ? dt : 0);
  draw(now, dt);
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
  game = aimAt(game, point.x, point.y);
  throwAtAim();
});

function typing(target) { return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)); }
document.addEventListener('keydown', event => {
  if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === ' ' && !event.repeat) {
    event.preventDefault();
    if (game.status === 'playing') throwAtAim();
    else if (countdown <= 0) play();
  } else if (game.status === 'playing' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const dx = event.key === 'ArrowLeft' ? -36 : event.key === 'ArrowRight' ? 36 : 0;
    const dy = event.key === 'ArrowUp' ? -36 : event.key === 'ArrowDown' ? 36 : 0;
    game = aimAt(game, game.aim.x + dx, game.aim.y + dy);
  } else if (event.key.toLowerCase() === 'p') {
    if (game.status === 'playing') pause(); else if (game.status === 'paused') play();
  }
});

function syncSoundButton() {
  soundButton.setAttribute('aria-pressed', String(soundOn));
  soundButton.setAttribute('aria-label', soundOn ? 'Sesi kapat' : 'Sesi aç');
}

$('#pause-button').addEventListener('click', () => (game.status === 'playing' ? pause() : countdown > 0 ? null : play()));
$('#new-game').addEventListener('click', newGame);
soundButton.addEventListener('click', () => {
  soundOn = !soundOn;
  try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch {}
  syncSoundButton();
  if (soundOn) sfx('pop');
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
  getStats: current => ({ bestScore: current.records.bestScore, bestCorrect: current.records.bestCorrect, bestCombo: current.records.bestCombo, bestAccuracy: current.records.bestAccuracy, bestLevel: current.records.bestLevel || 0 }),
  onStatus: message => { saveState.textContent = message; }
});

loadRecords();
syncSoundButton();
updateHud();
renderOverlay();
resize();
requestAnimationFrame(frameLoop);
