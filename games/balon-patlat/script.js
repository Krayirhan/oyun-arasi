import { WIDTH, HEIGHT, ROUND_SECONDS, MAX_ESCAPES, LAUNCH_X, LAUNCH_Y, createGame, startGame, pauseGame, aimAt, fireDart, advance, isValidGame } from './logic.js?v=202609280150';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609280150';

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
  { main: '#ff6685', edge: '#d9345b', shine: '#ffd5dc' },
  { main: '#ffca45', edge: '#de8b18', shine: '#fff0b8' },
  { main: '#39c8e8', edge: '#1783b9', shine: '#c6f7ff' },
  { main: '#70d66a', edge: '#31984c', shine: '#d6ffd0' },
  { main: '#b685f5', edge: '#7745c2', shine: '#eadbff' }
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

function drawBackground(now) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, '#147f91');
  sky.addColorStop(.55, '#1a9aa1');
  sky.addColorStop(1, '#55c5a2');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = 'rgb(255 255 255 / .055)';
  for (let i = 0; i < 7; i += 1) {
    const x = ((i * 127 + 45) % WIDTH);
    ctx.beginPath();
    ctx.arc(x, 170 + Math.sin(now / 1700 + i) * 18, 38 + (i % 3) * 13, 0, Math.PI * 2);
    ctx.fill();
  }
  const ground = ctx.createLinearGradient(0, HEIGHT - 90, 0, HEIGHT);
  ground.addColorStop(0, 'rgb(9 70 86 / 0)');
  ground.addColorStop(1, 'rgb(9 56 77 / .76)');
  ctx.fillStyle = ground;
  ctx.fillRect(0, HEIGHT - 110, WIDTH, 110);
  ctx.strokeStyle = 'rgb(255 255 255 / .32)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 12]);
  ctx.beginPath(); ctx.moveTo(20, 52); ctx.lineTo(WIDTH - 20, 52); ctx.stroke(); ctx.setLineDash([]);
}

function drawBalloon(balloon) {
  const wobbleX = Math.sin(balloon.wobble) * 4;
  const x = balloon.x + wobbleX;
  const y = balloon.y;
  const r = balloon.radius;
  const color = COLORS[balloon.color % COLORS.length];
  ctx.save();
  ctx.strokeStyle = 'rgb(255 255 255 / .62)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + r * .92);
  ctx.bezierCurveTo(x - 11, y + r + 15, x + 11, y + r + 20, x, y + r + 34);
  ctx.stroke();
  ctx.shadowColor = 'rgb(9 35 52 / .28)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 7;
  const fill = ctx.createRadialGradient(x - r * .34, y - r * .42, r * .08, x, y, r * 1.12);
  fill.addColorStop(0, color.shine);
  fill.addColorStop(.25, color.main);
  fill.addColorStop(1, color.edge);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, r * .91, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgb(255 255 255 / .55)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = color.shine;
  ctx.globalAlpha = .62;
  ctx.beginPath(); ctx.ellipse(x - r * .38, y - r * .52, r * .14, r * .07, -.7, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color.edge;
  ctx.beginPath(); ctx.moveTo(x - 8, y + r * .91); ctx.lineTo(x + 8, y + r * .91); ctx.lineTo(x, y + r * 1.08); ctx.closePath(); ctx.fill();
  const equation = `${balloon.a} + ${balloon.b}`;
  ctx.fillStyle = '#143252';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${equation.length >= 7 ? 23 : equation.length >= 6 ? 27 : 31}px Fredoka, sans-serif`;
  ctx.strokeStyle = 'rgb(255 255 255 / .8)';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeText(equation, x, y + 2, r * 1.62);
  ctx.fillText(equation, x, y + 2, r * 1.62);
  ctx.restore();
}

function drawDart(dart) {
  const angle = Math.atan2(dart.vy, dart.vx);
  ctx.save();
  ctx.translate(dart.x, dart.y);
  ctx.rotate(angle);
  ctx.fillStyle = '#fdf7e9';
  ctx.strokeStyle = '#173356';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-12, -5); ctx.lineTo(-7, 0); ctx.lineTo(-12, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ff596f';
  ctx.fillRect(-15, -4, 7, 8);
  ctx.restore();
}

function drawLauncher() {
  const { x, y } = game.aim;
  const angle = Math.atan2(y - LAUNCH_Y, x - LAUNCH_X);
  ctx.save();
  ctx.setLineDash([8, 10]);
  ctx.strokeStyle = 'rgb(255 255 255 / .52)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(LAUNCH_X, LAUNCH_Y - 12); ctx.lineTo(x, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.translate(LAUNCH_X, LAUNCH_Y);
  ctx.rotate(angle);
  ctx.fillStyle = '#f7f0dd';
  ctx.strokeStyle = '#173356';
  ctx.lineWidth = 5;
  roundedRect(-9, -18, 58, 24, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fb6b66';
  roundedRect(7, -15, 28, 18, 7); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#173356';
  ctx.beginPath(); ctx.arc(LAUNCH_X, LAUNCH_Y, 29, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#ffcf55';
  ctx.beginPath(); ctx.arc(LAUNCH_X, LAUNCH_Y, 20, Math.PI, 0); ctx.fill();
}

function draw(now) {
  if (!view.width || !view.height) return;
  ctx.setTransform(view.ratio * view.width / WIDTH, 0, 0, view.ratio * view.height / HEIGHT, 0, 0);
  drawBackground(now);
  for (const balloon of game.balloons) drawBalloon(balloon);
  for (const dart of game.darts) drawDart(dart);
  drawLauncher();
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
  const copy = overlayCopy();
  overlay.classList.toggle('hidden', !copy || game.status === 'over' && !runRecorded);
  if (!copy) return;
  $('#overlay-kicker').textContent = copy[0];
  $('#overlay-title').textContent = copy[1];
  $('#overlay-copy').textContent = copy[2];
  overlayButton.textContent = copy[3];
  $('#pause-button').textContent = game.status === 'playing' ? 'Duraklat' : game.status === 'paused' ? 'Devam et' : 'Başla';
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
    if (game.correctHits > previous.correctHits) { tone('correct'); status.textContent = `Doğru! Yeni hedef ${game.target}.`; }
    else if (game.wrongHits > previous.wrongHits) { tone('wrong'); status.textContent = 'Bu işlem hedefe eşit değil. Hedef aynı kaldı; tekrar dene.'; }
    if (game.escapes > previous.escapes) tone('escape');
    updateHud();
    if (game.status === 'over') finishRun();
  }
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
  soundButton.textContent = soundOn ? 'Ses açık' : 'Ses kapalı';
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
