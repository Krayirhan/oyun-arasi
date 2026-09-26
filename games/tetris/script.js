import { COLS, ROWS, HIDDEN_ROWS, SHAPES, createGame, startGame, pauseGame, move, rotate, softDrop, hardDrop, holdPiece, tick, ghostPiece, pieceCells, isValidGame } from './logic.js?v=202609270130';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609270130';

const KEY = 'oyunarasi-tetris-v1';
const REPEAT_DELAY_MS = 170;
const REPEAT_RATE_MS = 50;
const wellElement = document.querySelector('#board');
const statusElement = document.querySelector('#status');
const saveElement = document.querySelector('#save-state');
const overlay = document.querySelector('#game-overlay');
const overlayButton = document.querySelector('#overlay-button');
const pauseButton = document.querySelector('#pause-button');
const popElement = document.querySelector('#clear-pop');
const gainElement = document.querySelector('#score-gain');

let records = { bestScore: 0, bestLines: 0 };
let game = loadGame();
let rendered = null;
let cells = [];
const held = new Map();     // action → { since, last } for keys and buttons held down
let lastFrame = performance.now();

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.records) records = mergeRecords(records, saved.records);
    if (isValidGame(saved?.game) && saved.game.status !== 'over') return pauseGame(saved.game);
  } catch {}
  return createGame();
}

function saveGame() {
  const stored = { game: pauseGame(game), records };
  try { localStorage.setItem(KEY, JSON.stringify(stored)); saveElement.textContent = 'Oyun bu cihazda saklanıyor.'; }
  catch { saveElement.textContent = 'Kayıt kullanılamıyor; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save(stored);
}

function buildWell() {
  cells = Array.from({ length: COLS * (ROWS - HIDDEN_ROWS) }, () => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    return cell;
  });
  wellElement.replaceChildren(...cells);
}

function miniPiece(type, used = false) {
  const box = document.createElement('div');
  box.className = `mini-piece${used ? ' used' : ''}`;
  if (!type) return box;
  const shape = SHAPES[type][0];
  const xs = shape.map(([x]) => x);
  const ys = shape.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  box.style.setProperty('--cols', Math.max(...xs) - left + 1);
  box.style.setProperty('--rows', Math.max(...ys) - top + 1);
  shape.forEach(([x, y]) => {
    const block = document.createElement('i');
    block.className = `filled t-${type}`;
    block.style.gridColumn = x - left + 1;
    block.style.gridRow = y - top + 1;
    box.append(block);
  });
  return box;
}

function render() {
  if (rendered === game) return;
  const previous = rendered;
  rendered = game;
  const view = [...game.board];
  const ghost = game.status === 'over' ? null : ghostPiece(game);
  const ghostCells = new Set(ghost ? pieceCells(ghost).map(({ x, y }) => y * COLS + x) : []);
  if (game.piece && game.status !== 'over') pieceCells(game.piece).forEach(({ x, y }) => { view[y * COLS + x] = game.piece.type; });
  cells.forEach((cell, index) => {
    const boardIndex = index + HIDDEN_ROWS * COLS;
    const type = view[boardIndex];
    const className = type ? `cell filled t-${type}` : ghostCells.has(boardIndex) ? `cell ghost t-${game.piece.type}` : 'cell';
    if (cell.className !== className) cell.className = className;
  });

  if (!previous || previous.hold !== game.hold || previous.canHold !== game.canHold) {
    document.querySelector('#hold').replaceWith(Object.assign(miniPiece(game.hold, !game.canHold), { id: 'hold' }));
  }
  if (!previous || previous.queue.slice(0, 3).join() !== game.queue.slice(0, 3).join()) {
    document.querySelector('#next').replaceChildren(...game.queue.slice(0, 3).map(type => miniPiece(type)));
  }
  document.querySelector('#score').textContent = game.score.toLocaleString('tr-TR');
  document.querySelector('#best-score').textContent = Math.max(records.bestScore, game.score).toLocaleString('tr-TR');
  document.querySelector('#level').textContent = game.level;
  document.querySelector('#lines').textContent = game.lines;
  renderOverlay();
}

function renderOverlay() {
  const texts = {
    ready: ['BLOK DÜŞÜR', 'Hazır mısın?', 'Başla’ya bas ya da bir ok tuşuna dokun.', 'Başla'],
    paused: ['DURAKLATILDI', 'Mola!', `Skor ${game.score.toLocaleString('tr-TR')} · ${game.lines} satır. Kaldığın yerden devam edebilirsin.`, 'Devam et'],
    over: ['OYUN BİTTİ', 'Bloklar tepeye ulaştı!', `Skor ${game.score.toLocaleString('tr-TR')} · ${game.lines} satır${game.score > 0 && game.score >= records.bestScore ? ' — yeni rekor!' : '.'}`, 'Yeni oyun']
  }[game.status];
  overlay.classList.toggle('hidden', !texts);
  pauseButton.disabled = game.status === 'over';
  pauseButton.querySelector('span').textContent = { playing: 'Duraklat', ready: 'Başla' }[game.status] || 'Devam et';
  if (!texts) return;
  const [kicker, title, copy, button] = texts;
  document.querySelector('#overlay-kicker').textContent = kicker;
  document.querySelector('#overlay-title').textContent = title;
  document.querySelector('#overlay-copy').textContent = copy;
  overlayButton.textContent = button;
}

const CLEAR_NAMES = ['', 'Tek satır', 'Çift satır', 'Üç satır', 'DÖRTLÜ!'];

// Compares the new state with the old one to save after each lock and celebrate cleared lines.
function update(next) {
  if (next === game) return;
  const before = game;
  game = next;
  if (game.score > before.score + 10) showGain(game.score - before.score);
  if (game.lastClear && game.lastClear.id !== before.lastClear?.id) {
    const count = game.lastClear.rows.length;
    popElement.textContent = `${CLEAR_NAMES[count]} +${game.lastClear.points}`;
    popElement.classList.remove('show');
    void popElement.offsetWidth;
    popElement.classList.add('show');
    statusElement.textContent = `${CLEAR_NAMES[count]} temizlendi, +${game.lastClear.points} puan.${game.level > before.level ? ` Seviye ${game.level}!` : ''}`;
  }
  if (game.pieces !== before.pieces) {
    wellElement.classList.remove('flash');
    void wellElement.offsetWidth;
    wellElement.classList.add('flash');
    records = mergeRecords(records, { bestScore: game.score, bestLines: game.lines });
    if (game.status === 'over') {
      held.clear();
      statusElement.textContent = `Oyun bitti. ${game.score.toLocaleString('tr-TR')} puan, ${game.lines} satır.`;
    }
    saveGame();
  }
  render();
}

function showGain(points) {
  gainElement.textContent = `+${points}`;
  gainElement.classList.remove('pop');
  void gainElement.offsetWidth;
  gainElement.classList.add('pop');
}

function play() {
  if (game.status === 'over') { newGame(); return; }
  update(startGame(game));
  statusElement.textContent = 'Oyun başladı. Satırları temizle!';
}

function pause() {
  if (game.status !== 'playing') return;
  held.clear();
  update(pauseGame(game));
  statusElement.textContent = 'Oyun duraklatıldı.';
  saveGame();
}

function newGame() {
  const inProgress = game.pieces > 0 && game.status !== 'over';
  if (inProgress && !window.confirm('Devam eden oyun silinsin ve yeni oyun başlasın mı?')) return;
  held.clear();
  game = startGame(createGame());
  rendered = null;
  statusElement.textContent = 'Yeni oyun başladı. Satırları temizle!';
  saveGame();
  render();
}

const ACTIONS = {
  left: current => move(current, -1),
  right: current => move(current, 1),
  down: current => softDrop(current),
  rotate: current => rotate(current, 1),
  rotateBack: current => rotate(current, -1),
  drop: current => hardDrop(current),
  hold: current => holdPiece(current)
};
const REPEATING = new Set(['left', 'right', 'down']);

function act(action) {
  if (game.status === 'ready' || game.status === 'paused') { play(); return; }
  if (game.status !== 'playing') return;
  update(ACTIONS[action](game));
}

function press(action) {
  if (held.has(action)) return;
  const now = performance.now();
  if (action === 'left') held.delete('right');
  if (action === 'right') held.delete('left');
  if (REPEATING.has(action)) held.set(action, { since: now, last: now });
  act(action);
}

function release(action) { held.delete(action); }

const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate', x: 'rotate', X: 'rotate',
  z: 'rotateBack', Z: 'rotateBack', ' ': 'drop', c: 'hold', C: 'hold', Shift: 'hold'
};

function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

document.addEventListener('keydown', event => {
  if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
    if (game.status === 'playing') { event.preventDefault(); pause(); }
    else if (game.status === 'paused' && (event.key === 'p' || event.key === 'P')) { event.preventDefault(); play(); }
    return;
  }
  const action = KEYS[event.key];
  if (!action) return;
  // Space and Enter on a focused button keep their usual meaning.
  if (event.key === ' ' && event.target instanceof HTMLButtonElement && game.status !== 'playing') return;
  event.preventDefault();
  if (event.repeat) return;
  press(action);
});
document.addEventListener('keyup', event => { const action = KEYS[event.key]; if (action) release(action); });
window.addEventListener('blur', () => held.clear());

// On-screen buttons: press and hold to repeat moves.
document.querySelectorAll('.touch-pad button').forEach(button => {
  const action = button.dataset.action;
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add('pressed');
    press(action);
  });
  const stop = () => { button.classList.remove('pressed'); release(action); };
  button.addEventListener('pointerup', stop);
  button.addEventListener('pointercancel', stop);
  button.addEventListener('lostpointercapture', stop);
  button.addEventListener('contextmenu', event => event.preventDefault());
});

// Gestures on the well: drag sideways to move, drag down to soft drop, flick down to drop, tap to rotate.
let gesture = null;
wellElement.addEventListener('pointerdown', event => {
  if (event.button > 0) return;
  event.preventDefault();
  wellElement.setPointerCapture(event.pointerId);
  const size = cells[0].getBoundingClientRect().width + 1;
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, startY: event.clientY, time: performance.now(), size, moved: false };
});
wellElement.addEventListener('pointermove', event => {
  if (!gesture || event.pointerId !== gesture.id || game.status !== 'playing') return;
  const dx = event.clientX - gesture.x;
  const dy = event.clientY - gesture.y;
  if (Math.abs(dx) >= gesture.size) {
    const steps = Math.trunc(dx / gesture.size);
    for (let i = 0; i < Math.abs(steps); i++) act(steps > 0 ? 'right' : 'left');
    gesture.x += steps * gesture.size;
    gesture.moved = true;
  }
  if (dy >= gesture.size * 1.2) {
    const steps = Math.trunc(dy / (gesture.size * 1.2));
    for (let i = 0; i < steps; i++) act('down');
    gesture.y += steps * gesture.size * 1.2;
    gesture.moved = true;
  }
});
wellElement.addEventListener('pointerup', event => {
  if (!gesture || event.pointerId !== gesture.id) return;
  const { startY, time, moved, size } = gesture;
  gesture = null;
  const elapsed = performance.now() - time;
  const fall = event.clientY - startY;
  if (fall > size * 3 && elapsed < 250) act('drop');
  else if (!moved && elapsed < 300) act('rotate');
});
wellElement.addEventListener('pointercancel', () => { gesture = null; });

function frame(now) {
  const elapsed = now - lastFrame;
  lastFrame = now;
  if (game.status === 'playing') {
    for (const [action, state] of held) {
      if (action === 'down') continue;
      if (now - state.since >= REPEAT_DELAY_MS && now - state.last >= REPEAT_RATE_MS) {
        state.last = now;
        act(action);
      }
    }
    update(tick(game, elapsed, { soft: held.has('down') }));
  }
  requestAnimationFrame(frame);
}

overlayButton.addEventListener('click', play);
pauseButton.addEventListener('click', () => (game.status === 'playing' ? pause() : play()));
document.querySelector('#new-game').addEventListener('click', () => { newGame(); document.activeElement?.blur(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); saveGame(); } });
window.addEventListener('pagehide', saveGame);

const cloudSync = syncGameOnAccountChange('tetris', {
  read: () => ({ game: pauseGame(game), records }),
  write: incoming => {
    held.clear();
    game = incoming.game.status === 'over' ? createGame() : pauseGame(incoming.game);
    records = mergeRecords(records, incoming.records);
    rendered = null;
    render();
  },
  isValid: incoming => Boolean(incoming && isValidGame(incoming.game) && incoming.records && typeof incoming.records === 'object'),
  merge: (local, remote) => ({ game: remote.game, records: mergeRecords(local.records, remote.records) }),
  getStats: current => ({ bestScore: current.records.bestScore, bestLines: current.records.bestLines }),
  onStatus: message => { saveElement.textContent = message; }
});

function mergeRecords(local, remote) {
  const pick = key => Math.max(Number.isFinite(local?.[key]) ? local[key] : 0, Number.isFinite(remote?.[key]) ? remote[key] : 0);
  return { bestScore: pick('bestScore'), bestLines: pick('bestLines') };
}

buildWell();
render();
if (game.status === 'paused') statusElement.textContent = 'Kayıtlı oyunun hazır. Devam et’e bas.';
requestAnimationFrame(frame);
