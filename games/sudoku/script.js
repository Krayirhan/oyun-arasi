import { LEVELS, createGame, placeValue, clearCell, toggleNote, undo, giveHint, conflicts, noteValues, rowOf, colOf, boxOf, elapsedMilliseconds, pauseGame, resumeGame, isValidGame } from './logic.js?v=202609262217';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609262217';

const KEY = 'oyunarasi-sudoku-v1';
const boardElement = document.querySelector('#board');
const numpad = document.querySelector('#numpad');
const statusElement = document.querySelector('#status');
const saveElement = document.querySelector('#save-state');
const difficultyPicker = document.querySelector('#difficulty');
const notesButton = document.querySelector('#notes-button');
const hintButton = document.querySelector('#hint-button');
const undoButton = document.querySelector('#undo-button');
const timerElement = document.querySelector('#timer');

let records = { easy: null, medium: null, hard: null };
let game = loadGame();
let selected = game.board.findIndex((value, index) => !game.puzzle[index] && !value);
let notesMode = false;
const cells = [];

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

function buildBoard() {
  for (let index = 0; index < 81; index += 1) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'sudoku-cell';
    cell.dataset.row = rowOf(index);
    cell.dataset.col = colOf(index);
    cell.setAttribute('role', 'gridcell');
    cell.addEventListener('click', () => { selected = index; render(); });
    cell.addEventListener('keydown', event => onKey(event));
    cells.push(cell);
  }
  boardElement.replaceChildren(...cells);
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(value => {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'numpad-key';
    key.dataset.value = value;
    key.innerHTML = `<b>${value}</b><small></small>`;
    key.addEventListener('click', () => enter(value));
    return key;
  });
  const erase = document.createElement('button');
  erase.type = 'button';
  erase.className = 'numpad-key numpad-erase';
  erase.setAttribute('aria-label', 'Hücreyi temizle');
  erase.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20H9L4 15a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 8M8 11l6 6" /></svg>';
  erase.addEventListener('click', erase_);
  numpad.replaceChildren(...keys, erase);
}

function render() {
  const bad = conflicts(game.board);
  const focusValue = selected >= 0 ? game.board[selected] : 0;
  const counts = Array(10).fill(0);
  game.board.forEach((value, index) => { if (value && value === game.solution[index]) counts[value] += 1; });

  cells.forEach((cell, index) => {
    const value = game.board[index];
    const given = Boolean(game.puzzle[index]);
    const related = selected >= 0 && index !== selected && (rowOf(index) === rowOf(selected) || colOf(index) === colOf(selected) || boxOf(index) === boxOf(selected));
    cell.classList.toggle('given', given);
    cell.classList.toggle('selected', index === selected);
    cell.classList.toggle('related', related);
    cell.classList.toggle('same', Boolean(focusValue) && value === focusValue && index !== selected);
    cell.classList.toggle('conflict', bad.has(index) && !given);
    cell.classList.toggle('clash', bad.has(index) && given);
    cell.tabIndex = index === (selected >= 0 ? selected : 0) ? 0 : -1;
    if (value) {
      cell.textContent = String(value);
    } else {
      const notes = noteValues(game, index);
      if (notes.length) {
        const grid = document.createElement('span');
        grid.className = 'notes';
        for (let note = 1; note <= 9; note += 1) {
          const mark = document.createElement('i');
          mark.textContent = notes.includes(note) ? String(note) : '';
          grid.append(mark);
        }
        cell.replaceChildren(grid);
      } else cell.textContent = '';
    }
    const state = given ? 'sabit' : value ? (bad.has(index) ? 'çakışıyor' : 'yazıldı') : 'boş';
    cell.setAttribute('aria-label', `Satır ${rowOf(index) + 1}, sütun ${colOf(index) + 1}: ${value || 'boş'}, ${state}`);
    cell.setAttribute('aria-selected', String(index === selected));
  });

  numpad.querySelectorAll('.numpad-key[data-value]').forEach(key => {
    const value = Number(key.dataset.value);
    const left = 9 - counts[value];
    key.classList.toggle('done', left === 0);
    key.querySelector('small').textContent = left > 0 ? String(left) : '';
    key.setAttribute('aria-label', `${value} yaz${left ? `, ${left} tane kaldı` : ', tamamlandı'}`);
    key.disabled = game.status !== 'playing';
  });
  numpad.querySelector('.numpad-erase').disabled = game.status !== 'playing';

  difficultyPicker.value = game.level;
  notesButton.setAttribute('aria-pressed', String(notesMode));
  notesButton.lastChild.textContent = notesMode ? ' Not: açık' : ' Not: kapalı';
  boardElement.classList.toggle('notes-mode', notesMode);
  hintButton.disabled = game.status !== 'playing';
  undoButton.disabled = game.status !== 'playing' || !game.history.length;
  document.querySelector('#mistakes').textContent = String(game.mistakes);
  document.querySelector('#best').textContent = `${LEVELS[game.level].label} rekoru: ${records[game.level] == null ? '—' : formatTime(records[game.level])}`;
  timerElement.textContent = formatTime(elapsedMilliseconds(game));
  if (game.status === 'won') {
    const hintText = game.hints ? `, ${game.hints} ipucuyla` : '';
    statusElement.textContent = `Tebrikler! Bulmacayı ${formatTime(game.elapsedMs)} sürede${hintText} çözdün.`;
  }
}

function focusSelected() {
  if (selected >= 0) cells[selected].focus({ preventScroll: true });
}

function apply(next, message) {
  if (!next) return false;
  const wasPlaying = game.status === 'playing';
  game = next;
  if (wasPlaying && game.status === 'won') {
    const best = records[game.level];
    if (!game.hints && (best == null || game.elapsedMs < best)) records = { ...records, [game.level]: game.elapsedMs };
  } else if (message) statusElement.textContent = message;
  saveGame();
  render();
  return true;
}

function enter(value) {
  if (selected < 0) { statusElement.textContent = 'Önce bir kare seç.'; return; }
  if (game.puzzle[selected]) { statusElement.textContent = 'Bu kare bulmacanın bir parçası; değiştirilemez.'; return; }
  if (notesMode) {
    apply(toggleNote(game, selected, value), 'Not güncellendi.');
    return;
  }
  const before = game.mistakes;
  const next = placeValue(game, selected, value);
  if (!next) return;
  const cleared = !next.board[selected];
  apply(next, cleared ? 'Kare temizlendi.' : next.mistakes > before ? 'Bu rakam buraya uymuyor.' : 'Güzel!');
}

function erase_() {
  if (selected < 0) return;
  apply(clearCell(game, selected), 'Kare temizlendi.');
}

function moveSelection(rowStep, colStep) {
  const from = selected >= 0 ? selected : 0;
  const row = (rowOf(from) + rowStep + 9) % 9;
  const col = (colOf(from) + colStep + 9) % 9;
  selected = row * 9 + col;
  render();
  focusSelected();
}

function onKey(event) {
  if (event.target.closest('select, input, textarea') || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (moves[key]) { event.preventDefault(); moveSelection(...moves[key]); return; }
  if (/^[1-9]$/.test(key)) { event.preventDefault(); enter(Number(key)); return; }
  if (key === 'Backspace' || key === 'Delete' || key === '0') { event.preventDefault(); erase_(); return; }
  if (key === 'n' || key === 'N') { event.preventDefault(); notesMode = !notesMode; render(); return; }
  if (key === 'z' || key === 'Z') { event.preventDefault(); apply(undo(game), 'Son hamle geri alındı.'); }
}

function startNew(level) {
  const inProgress = game.status === 'playing' && game.board.some((value, index) => value && !game.puzzle[index]);
  if (inProgress && !window.confirm('Devam eden bulmaca silinsin ve yeni bulmaca başlasın mı?')) { difficultyPicker.value = game.level; return; }
  game = createGame(level);
  selected = game.board.indexOf(0);
  notesMode = false;
  statusElement.textContent = `Yeni ${LEVELS[level].label.toLocaleLowerCase('tr-TR')} bulmaca hazır. Bir kare seç ve rakam yaz.`;
  saveGame();
  render();
}

document.addEventListener('keydown', event => { if (!boardElement.contains(event.target)) onKey(event); });
document.querySelector('#new-game').addEventListener('click', () => startNew(difficultyPicker.value));
difficultyPicker.addEventListener('change', () => startNew(difficultyPicker.value));
notesButton.addEventListener('click', () => { notesMode = !notesMode; render(); });
undoButton.addEventListener('click', () => apply(undo(game), 'Son hamle geri alındı.'));
hintButton.addEventListener('click', () => {
  const result = giveHint(game, selected);
  if (!result) return;
  selected = result.index;
  apply(result.game, 'İpucu kullandın. İpucuyla çözülen bulmacalar rekora sayılmaz.');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveGame();
  else { game = resumeGame(pauseGame(game)); render(); }
});
window.addEventListener('pagehide', saveGame);
setInterval(() => { if (game.status === 'playing') timerElement.textContent = formatTime(elapsedMilliseconds(game)); }, 500);

const cloudSync = syncGameOnAccountChange('sudoku', {
  read: () => ({ game: pauseGame(game), records }),
  write: incoming => { game = resumeGame(incoming.game); records = mergeRecords(records, incoming.records); selected = game.board.indexOf(0); render(); },
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

buildBoard();
render();
if (game.status === 'playing') statusElement.textContent = 'Bir kare seç ve rakam yaz.';
