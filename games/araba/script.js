import { LANES, VIEW, PLAYER_Y, CAR_LENGTH, CAR_WIDTH, createGame, startGame, pauseGame, steer, advance, score } from './logic.js?v=202609270005';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609270005';

const KEY = 'oyunarasi-araba-v1';
const canvas = document.querySelector('#board');
const context = canvas.getContext('2d');
const frameElement = document.querySelector('.board-frame');
const statusElement = document.querySelector('#status');
const saveElement = document.querySelector('#save-state');
const overlay = document.querySelector('#game-overlay');
const overlayButton = document.querySelector('#overlay-button');
const pauseButton = document.querySelector('#pause-button');
const scoreElement = document.querySelector('#score');
const bestElement = document.querySelector('#best-score');

const CAR_COLORS = [['#2f6fe0', '#1d4fb0'], ['#fecf40', '#d9a514'], ['#2fb36f', '#1f8350'], ['#8a5ae0', '#6339b3'], ['#f4f1ea', '#c9c3b5']];
let records = { bestScore: 0, bestDistance: 0, runs: 0 };
let game = createGame();
let view = { w: 360, h: 560, ratio: 1 };
let crashAt = 0;
let lastFrame = performance.now();
let lastShown = -1;

function loadRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.records) records = mergeRecords(records, saved.records);
  } catch {}
}

function saveRecords() {
  try { localStorage.setItem(KEY, JSON.stringify({ records })); saveElement.textContent = 'Rekorların bu cihazda saklanıyor.'; }
  catch { saveElement.textContent = 'Kayıt kullanılamıyor; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save({ records });
}

function formatDistance(metres) {
  return metres >= 1000 ? `${(metres / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} km` : `${Math.floor(metres)} m`;
}

// Canvas size: as tall as the window allows on wide screens, as wide as the panel on phones.
function resize() {
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const available = frameElement.clientWidth - (mobile ? 24 : 28);
  let h;
  let w;
  if (mobile) {
    w = Math.min(available, 440);
    h = Math.min(w * 1.45, window.innerHeight - 230);
    h = Math.max(h, 380);
  } else {
    h = Math.max(420, Math.min(640, window.innerHeight - 330));
    w = Math.min(available, h * 0.66);
  }
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  view = { w: Math.round(w), h: Math.round(h), ratio };
  canvas.style.width = `${view.w}px`;
  canvas.style.height = `${view.h}px`;
  canvas.width = Math.round(view.w * ratio);
  canvas.height = Math.round(view.h * ratio);
  draw(performance.now());
}

function roundRect(x, y, w, h, r) {
  context.beginPath();
  context.roundRect(x, y, w, h, r);
}

function drawCar(cx, cy, w, h, [body, edge], player = false) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  context.fillStyle = 'rgb(0 0 0 / .25)';
  roundRect(x + 3, y + 5, w, h, w * 0.28);
  context.fill();
  context.fillStyle = '#1b1d24';
  const wheelW = w * 0.16;
  const wheelH = h * 0.2;
  [[x - wheelW * 0.45, y + h * 0.14], [x + w - wheelW * 0.55, y + h * 0.14], [x - wheelW * 0.45, y + h * 0.66], [x + w - wheelW * 0.55, y + h * 0.66]]
    .forEach(([wx, wy]) => { roundRect(wx, wy, wheelW, wheelH, 3); context.fill(); });
  context.fillStyle = edge;
  roundRect(x, y, w, h, w * 0.28);
  context.fill();
  context.fillStyle = body;
  roundRect(x + w * 0.06, y + h * 0.03, w * 0.88, h * 0.9, w * 0.25);
  context.fill();
  context.fillStyle = '#28324a';
  roundRect(x + w * 0.16, y + h * 0.22, w * 0.68, h * 0.2, w * 0.12);
  context.fill();
  roundRect(x + w * 0.18, y + h * 0.66, w * 0.64, h * 0.13, w * 0.1);
  context.fill();
  context.fillStyle = 'rgb(255 255 255 / .22)';
  roundRect(x + w * 0.2, y + h * 0.44, w * 0.6, h * 0.2, w * 0.1);
  context.fill();
  context.fillStyle = player ? '#fff7c2' : '#fff3a8';
  [x + w * 0.12, x + w * 0.7].forEach(lx => { roundRect(lx, y + h * 0.02, w * 0.18, h * 0.06, 2); context.fill(); });
  context.fillStyle = '#ff5a4a';
  [x + w * 0.12, x + w * 0.7].forEach(lx => { roundRect(lx, y + h * 0.9, w * 0.18, h * 0.05, 2); context.fill(); });
  if (player) {
    context.fillStyle = '#fff';
    context.fillRect(cx - w * 0.06, y + h * 0.05, w * 0.12, h * 0.15);
  }
}

function draw(now) {
  const { w, h, ratio } = view;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const shake = game.status === 'over' && now - crashAt < 400 ? (Math.random() - 0.5) * 8 : 0;
  context.save();
  context.translate(shake, shake * 0.6);
  const verge = Math.max(18, w * 0.08);
  const roadW = w - verge * 2;
  const laneW = roadW / LANES;
  const scale = h / VIEW;
  const scroll = (game.distance * scale) % 60;

  // Grass with scrolling stripes, then the road.
  context.fillStyle = '#5fb04a';
  context.fillRect(-10, -10, w + 20, h + 20);
  context.fillStyle = '#56a342';
  for (let y = -60 + scroll; y < h; y += 60) { context.fillRect(-10, y, verge, 30); context.fillRect(w - verge, y, verge + 10, 30); }
  context.fillStyle = '#3d4250';
  context.fillRect(verge, -10, roadW, h + 20);
  context.fillStyle = '#f4f1ea';
  context.fillRect(verge + 3, -10, 3, h + 20);
  context.fillRect(w - verge - 6, -10, 3, h + 20);
  const dash = 26;
  for (let lane = 1; lane < LANES; lane++) {
    const x = verge + lane * laneW - 1.5;
    for (let y = -dash * 2 + (game.distance * scale) % (dash * 2); y < h; y += dash * 2) context.fillRect(x, y, 3, dash);
  }

  const laneX = lane => verge + (lane + 0.5) * laneW;
  const carW = laneW * CAR_WIDTH;
  const carH = CAR_LENGTH * scale;

  game.pickups.forEach(pickup => {
    const cx = laneX(pickup.lane);
    const cy = pickup.y * scale;
    const r = Math.min(laneW * 0.2, 14);
    context.fillStyle = '#d9a514';
    context.beginPath(); context.arc(cx, cy, r, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#fecf40';
    context.beginPath(); context.arc(cx, cy, r * 0.78, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#fff6c9';
    context.font = `700 ${Math.round(r)}px Fredoka, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('★', cx, cy + 1);
  });
  game.cars.forEach(car => drawCar(laneX(car.lane), car.y * scale, carW, carH, CAR_COLORS[car.color % CAR_COLORS.length]));
  drawCar(laneX(game.x), PLAYER_Y * scale, carW, carH, ['#d6362b', '#93221a'], true);

  if (game.status === 'over' && now - crashAt < 600) {
    context.fillStyle = `rgb(255 255 255 / ${0.6 * (1 - (now - crashAt) / 600)})`;
    context.fillRect(0, 0, w, h);
  }
  context.restore();

  // Speed and coins on the road.
  context.fillStyle = 'rgb(20 22 30 / .55)';
  roundRect(8, 8, 104, 30, 10); context.fill();
  roundRect(w - 76, 8, 68, 30, 10); context.fill();
  context.fillStyle = '#fff';
  context.font = '700 15px Fredoka, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(`${Math.round(game.speed * 3.6)} km/sa`, 18, 24);
  context.textAlign = 'right';
  context.fillStyle = '#fecf40';
  context.fillText(`★ ${game.coins}`, w - 18, 24);
}

function renderOverlay() {
  const points = score(game);
  const texts = {
    ready: ['ARABA YARIŞI', 'Hazır mısın?', 'Şerit değiştirerek arabalardan kaç, jetonları topla.', 'Başla'],
    paused: ['DURAKLATILDI', 'Mola!', `${formatDistance(game.distance)} yol, ${points.toLocaleString('tr-TR')} puan.`, 'Devam et'],
    over: ['KAZA!', 'Çarptın!', `${formatDistance(game.distance)} yol, ${game.coins} jeton: ${points.toLocaleString('tr-TR')} puan.${points > 0 && points >= records.bestScore ? ' Yeni rekor!' : ''}`, 'Tekrar oyna']
  }[game.status];
  overlay.classList.toggle('hidden', !texts || (game.status === 'over' && performance.now() - crashAt < 650));
  pauseButton.disabled = game.status === 'over';
  pauseButton.querySelector('span').textContent = { ready: 'Başla', paused: 'Devam et' }[game.status] || 'Duraklat';
  if (!texts) return;
  const [kicker, title, copy, button] = texts;
  document.querySelector('#overlay-kicker').textContent = kicker;
  document.querySelector('#overlay-title').textContent = title;
  document.querySelector('#overlay-copy').textContent = copy;
  overlayButton.textContent = button;
}

function showScore() {
  const points = score(game);
  if (points === lastShown) return;
  lastShown = points;
  scoreElement.textContent = points.toLocaleString('tr-TR');
  bestElement.textContent = Math.max(records.bestScore, points).toLocaleString('tr-TR');
}

function finishRun() {
  crashAt = performance.now();
  const points = score(game);
  const newRecord = points > records.bestScore;
  records = { bestScore: Math.max(records.bestScore, points), bestDistance: Math.max(records.bestDistance, Math.floor(game.distance)), runs: records.runs + 1 };
  saveRecords();
  statusElement.textContent = `Kaza! ${formatDistance(game.distance)} yol, ${points.toLocaleString('tr-TR')} puan.${newRecord ? ' Yeni rekor!' : ''}`;
  if (navigator.vibrate) navigator.vibrate(120);
  setTimeout(renderOverlay, 660);
}

function play() {
  if (game.status === 'over') { newGame(); return; }
  game = startGame(game);
  statusElement.textContent = 'Yoldasın! Arabalardan kaç, jetonları topla.';
  renderOverlay();
}

function pause() {
  if (game.status !== 'playing') return;
  game = pauseGame(game);
  statusElement.textContent = 'Oyun duraklatıldı.';
  renderOverlay();
}

function newGame() {
  game = startGame(createGame());
  lastShown = -1;
  statusElement.textContent = 'Yeni yarış başladı!';
  renderOverlay();
}

function turn(direction) {
  if (game.status === 'ready' || game.status === 'paused') { play(); return; }
  game = steer(game, direction);
}

function frame(now) {
  const elapsed = (now - lastFrame) / 1000;
  lastFrame = now;
  if (game.status === 'playing') {
    game = advance(game, elapsed);
    if (game.status === 'over') { finishRun(); renderOverlay(); }
  }
  showScore();
  draw(now);
  requestAnimationFrame(frame);
}

function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

document.addEventListener('keydown', event => {
  if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLocaleLowerCase('tr-TR');
  if (key === 'arrowleft' || key === 'a') { event.preventDefault(); if (!event.repeat) turn(-1); }
  else if (key === 'arrowright' || key === 'd') { event.preventDefault(); if (!event.repeat) turn(1); }
  else if (key === ' ' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); game.status === 'playing' ? pause() : play(); }
  else if (key === 'p' || key === 'escape') { if (game.status === 'playing') { event.preventDefault(); pause(); } else if (key === 'p' && game.status === 'paused') play(); }
});

// Touch or click on the road: the left half steers left, the right half steers right.
canvas.addEventListener('pointerdown', event => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  turn(event.clientX - rect.left < rect.width / 2 ? -1 : 1);
});
document.querySelectorAll('.steer-pad button').forEach(button => {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.classList.add('pressed');
    turn(Number(button.dataset.steer));
  });
  const release = () => button.classList.remove('pressed');
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
  button.addEventListener('contextmenu', event => event.preventDefault());
});

overlayButton.addEventListener('click', play);
pauseButton.addEventListener('click', () => (game.status === 'playing' ? pause() : play()));
document.querySelector('#new-game').addEventListener('click', () => { newGame(); document.activeElement?.blur(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('blur', pause);
new ResizeObserver(() => resize()).observe(frameElement);
window.addEventListener('resize', resize);

const cloudSync = syncGameOnAccountChange('araba', {
  read: () => ({ records }),
  write: incoming => { records = mergeRecords(records, incoming.records); lastShown = -1; showScore(); },
  isValid: incoming => Boolean(incoming?.records && typeof incoming.records === 'object'),
  merge: (local, remote) => ({ records: mergeRecords(local.records, remote.records) }),
  getStats: current => ({ bestScore: current.records.bestScore, bestDistance: current.records.bestDistance }),
  onStatus: message => { saveElement.textContent = message; }
});

function mergeRecords(local, remote) {
  const pick = key => Math.max(Number.isFinite(local?.[key]) ? local[key] : 0, Number.isFinite(remote?.[key]) ? remote[key] : 0);
  return { bestScore: pick('bestScore'), bestDistance: pick('bestDistance'), runs: pick('runs') };
}

loadRecords();
resize();
renderOverlay();
showScore();
requestAnimationFrame(frame);
