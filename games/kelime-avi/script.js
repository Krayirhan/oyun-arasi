import { LEVELS, THEMES, createGame, snapLine, lineCells, submitSelection, giveHint, elapsedMilliseconds, pauseGame, resumeGame, isValidGame } from './logic.js?v=202609270130';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609270130';

const KEY = 'oyunarasi-kelime-avi-v1';
const gridElement = document.querySelector('#board');
const listElement = document.querySelector('#word-list');
const statusElement = document.querySelector('#status');
const saveElement = document.querySelector('#save-state');
const difficultyPicker = document.querySelector('#difficulty');
const timerElement = document.querySelector('#timer');
const hintButton = document.querySelector('#hint-button');

let records = { easy: null, medium: null, hard: null };
let game = loadGame();
let anchor = -1;            // first letter picked by tap or keyboard
let cursor = 0;
let dragging = null;        // { from, pointerId, moved }
let selection = [];
let cells = [];

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.records) records = mergeRecords(records, saved.records);
    if (isValidGame(saved?.game)) return resumeGame(saved.game);
  } catch {}
  return createGame('easy');
}

function saveGame() {
  const stored = { game: pauseGame(game), records };
  try { localStorage.setItem(KEY, JSON.stringify(stored)); saveElement.textContent = 'Oyun bu cihazda saklanıyor.'; }
  catch { saveElement.textContent = 'Kayıt kullanılamıyor; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save(stored);
}

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function buildGrid() {
  gridElement.style.setProperty('--size', game.size);
  cells = game.grid.map((letter, index) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'letter-cell';
    cell.dataset.index = index;
    cell.textContent = letter;
    cell.tabIndex = index === cursor ? 0 : -1;
    return cell;
  });
  gridElement.replaceChildren(...cells);
}

function render() {
  const foundColor = new Map();
  game.words.forEach(entry => { if (entry.found) entry.cells.forEach(cell => { if (!foundColor.has(cell)) foundColor.set(cell, entry.color); }); });
  cells.forEach((cell, index) => {
    const color = foundColor.get(index);
    cell.className = `letter-cell${color !== undefined ? ` found tone-${color}` : ''}${selection.includes(index) ? ' selecting' : ''}${index === anchor ? ' anchor' : ''}${game.hinted.includes(index) ? ' hinted' : ''}`;
    cell.tabIndex = index === cursor ? 0 : -1;
    const row = Math.floor(index / game.size) + 1;
    const col = (index % game.size) + 1;
    cell.setAttribute('aria-label', `${game.grid[index]}, satır ${row}, sütun ${col}${color !== undefined ? ', bulunan kelimede' : ''}${index === anchor ? ', başlangıç' : ''}`);
  });
  listElement.replaceChildren(...game.words.map(entry => {
    const item = document.createElement('li');
    item.className = `word-chip${entry.found ? ` found tone-${entry.color}` : ''}`;
    item.textContent = entry.word;
    if (entry.found) item.setAttribute('aria-label', `${entry.word}, bulundu`);
    return item;
  }));
  const found = game.words.filter(entry => entry.found).length;
  document.querySelector('#found-count').textContent = `${found} / ${game.words.length}`;
  document.querySelector('#theme-name').textContent = THEMES[game.theme].name;
  document.querySelector('#best').textContent = `${LEVELS[game.level].label} rekoru: ${records[game.level] == null ? '—' : formatTime(records[game.level])}`;
  difficultyPicker.value = game.level;
  hintButton.disabled = game.status !== 'playing';
  timerElement.textContent = formatTime(elapsedMilliseconds(game));
  if (game.status === 'won') {
    statusElement.textContent = `Tebrikler! ${THEMES[game.theme].name} temasındaki bütün kelimeleri ${formatTime(game.elapsedMs)} sürede buldun${game.hints ? ` (${game.hints} ipucu)` : ''}.`;
  }
}

function trySubmit(cellsToCheck) {
  selection = [];
  const result = submitSelection(game, cellsToCheck);
  if (!result) {
    if (cellsToCheck.length > 1) statusElement.textContent = `"${cellsToCheck.map(cell => game.grid[cell]).join('')}" listede yok. Tekrar dene.`;
    render();
    return;
  }
  const wasPlaying = game.status === 'playing';
  game = result.game;
  if (wasPlaying && game.status === 'won') {
    const best = records[game.level];
    if (!game.hints && (best == null || game.elapsedMs < best)) records = { ...records, [game.level]: game.elapsedMs };
  } else {
    const left = game.words.filter(entry => !entry.found).length;
    statusElement.textContent = `${result.word.word} bulundu! ${left} kelime kaldı.`;
  }
  saveGame();
  render();
}

// Çizerek seçim: basılan harften parmağın altındaki harfe en yakın düz çizgi.
function cellFromPoint(x, y) {
  const element = document.elementFromPoint(x, y)?.closest('.letter-cell');
  return element && gridElement.contains(element) ? Number(element.dataset.index) : -1;
}

gridElement.addEventListener('pointerdown', event => {
  const cell = event.target.closest('.letter-cell');
  if (!cell || game.status !== 'playing' || event.button > 0) return;
  event.preventDefault();
  dragging = { from: Number(cell.dataset.index), pointerId: event.pointerId, moved: false };
  cursor = dragging.from;
  selection = [dragging.from];
  gridElement.setPointerCapture(event.pointerId);
  render();
});

gridElement.addEventListener('pointermove', event => {
  if (!dragging || event.pointerId !== dragging.pointerId) return;
  const over = cellFromPoint(event.clientX, event.clientY);
  if (over < 0) return;
  if (over !== dragging.from) dragging.moved = true;
  selection = snapLine(game.size, dragging.from, over);
  render();
});

gridElement.addEventListener('pointerup', event => {
  if (!dragging || event.pointerId !== dragging.pointerId) return;
  const { from, moved } = dragging;
  dragging = null;
  if (moved && selection.length > 1) { anchor = -1; trySubmit(selection); return; }
  selection = [];
  tapCell(from);
});

gridElement.addEventListener('pointercancel', () => { dragging = null; selection = []; render(); });

// İki dokunuşla seçim: önce ilk harf, sonra son harf.
function tapCell(index) {
  if (anchor < 0) {
    anchor = index;
    statusElement.textContent = 'Şimdi kelimenin son harfine dokun.';
    render();
    return;
  }
  if (anchor === index) { anchor = -1; statusElement.textContent = 'Seçim iptal edildi.'; render(); return; }
  const line = lineCells(game.size, anchor, index);
  anchor = -1;
  if (!line) { statusElement.textContent = 'Harfler düz bir çizgide olmalı: yatay, dikey ya da çapraz.'; render(); return; }
  trySubmit(line);
}

gridElement.addEventListener('keydown', event => {
  const moves = { ArrowUp: -game.size, ArrowDown: game.size, ArrowLeft: -1, ArrowRight: 1 };
  if (moves[event.key]) {
    event.preventDefault();
    const next = cursor + moves[event.key];
    const sameRow = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? Math.floor(next / game.size) === Math.floor(cursor / game.size) : true;
    if (next >= 0 && next < game.grid.length && sameRow) cursor = next;
    if (anchor >= 0) selection = lineCells(game.size, anchor, cursor) || [anchor];
    render();
    cells[cursor].focus();
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selection = [];
    if (game.status === 'playing') tapCell(cursor);
    cells[cursor]?.focus();
  } else if (event.key === 'Escape') {
    anchor = -1; selection = []; render();
  }
});

function startNew(level) {
  const inProgress = game.status === 'playing' && game.words.some(entry => entry.found);
  if (inProgress && !window.confirm('Devam eden bulmaca silinsin ve yeni bulmaca başlasın mı?')) { difficultyPicker.value = game.level; return; }
  game = createGame(level);
  anchor = -1; selection = []; cursor = 0;
  buildGrid();
  statusElement.textContent = `Yeni bulmaca: ${THEMES[game.theme].name}. Kelimeleri bul!`;
  saveGame();
  render();
}

document.querySelector('#new-game').addEventListener('click', () => startNew(difficultyPicker.value));
difficultyPicker.addEventListener('change', () => startNew(difficultyPicker.value));
hintButton.addEventListener('click', () => {
  const result = giveHint(game);
  if (!result) { statusElement.textContent = 'İpucu verilecek kelime kalmadı.'; return; }
  game = result.game;
  statusElement.textContent = 'Yanıp sönen harf, bulunmamış bir kelimenin ilk harfi. İpucuyla çözülen bulmacalar rekora sayılmaz.';
  saveGame();
  render();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveGame();
  else { game = resumeGame(pauseGame(game)); render(); }
});
window.addEventListener('pagehide', saveGame);
setInterval(() => { if (game.status === 'playing') timerElement.textContent = formatTime(elapsedMilliseconds(game)); }, 500);

const cloudSync = syncGameOnAccountChange('kelime-avi', {
  read: () => ({ game: pauseGame(game), records }),
  write: incoming => { game = resumeGame(incoming.game); records = mergeRecords(records, incoming.records); anchor = -1; selection = []; buildGrid(); render(); },
  isValid: incoming => Boolean(incoming && isValidGame(incoming.game) && incoming.records && typeof incoming.records === 'object'),
  merge: (local, remote) => ({ game: remote.game, records: mergeRecords(local.records, remote.records) }),
  getStats: current => ({ easy: { bestMs: current.records.easy }, medium: { bestMs: current.records.medium }, hard: { bestMs: current.records.hard } }),
  onStatus: message => { saveElement.textContent = message; }
});

function mergeRecords(local, remote) {
  const merged = {};
  for (const level of Object.keys(LEVELS)) {
    const left = Number.isFinite(local?.[level]) ? local[level] : null;
    const right = Number.isFinite(remote?.[level]) ? remote[level] : null;
    merged[level] = left == null ? right : right == null ? left : Math.min(left, right);
  }
  return merged;
}

buildGrid();
render();
if (game.status === 'playing') statusElement.textContent = `Tema: ${THEMES[game.theme].name}. Kelimeyi ilk harfinden son harfine çizerek bul.`;
