import { DIFFICULTIES, createGame, revealCell, toggleFlag, elapsedMilliseconds, isValidGame } from './logic.js?v=202609270036';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609270036';

const KEY = 'oyunarasi-mayin-tarlasi-v1';
const boardElement = document.querySelector('#board');
const statusElement = document.querySelector('#status');
const difficultyPicker = document.querySelector('#difficulty');
const saveElement = document.querySelector('#save-state');
let records = { easy: null, medium: null, hard: null };
let game = loadGame();
let focusIndex = 0;
let flagMode = false;

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.records && typeof saved.records === 'object') {
      for (const level of Object.keys(records)) if (Number.isFinite(saved.records[level]) && saved.records[level] >= 0) records[level] = saved.records[level];
    }
    if (isValidGame(saved?.game)) return saved.game;
  } catch {}
  return createGame('easy');
}

function saveGame() {
  try { localStorage.setItem(KEY, JSON.stringify({ game, records })); saveElement.textContent = 'Oyun bu cihazda saklanıyor.'; }
  catch { saveElement.textContent = 'Kayıt kullanılamıyor; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save({ game, records });
}

function formatTime(milliseconds) { return String(Math.floor(milliseconds / 1000)).padStart(3, '0'); }

function announce() {
  if (game.status === 'won') statusElement.textContent = `Kazandın! ${formatTime(game.elapsedMs)} saniyede tüm güvenli kareleri açtın.`;
  else if (game.status === 'lost') statusElement.textContent = 'Mayına bastın. Yeni oyunda tekrar deneyebilirsin.';
  else if (game.status === 'ready') statusElement.textContent = 'Bir kare aç. İlk açtığın alan güvenli.';
  else statusElement.textContent = 'Güvenli kareleri açmaya devam et.';
}

function render() {
  const config = DIFFICULTIES[game.difficulty];
  boardElement.style.setProperty('--columns', game.width);
  boardElement.setAttribute('aria-label', `${config.label} Mayın Tarlası, ${game.height} satır ${game.width} sütun`);
  boardElement.replaceChildren();
  game.cells.forEach((cell, index) => {
    const row = Math.floor(index / game.width) + 1;
    const col = index % game.width + 1;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cell';
    if (cell.revealed) button.classList.add('revealed');
    if (cell.flagged) button.classList.add('flagged');
    if (cell.mine && cell.revealed) button.classList.add('mine');
    if (index === game.explodedIndex) button.classList.add('exploded');
    if (cell.revealed && cell.adjacent) button.classList.add(`number-${cell.adjacent}`);
    if (cell.flagged && game.status === 'lost' && !cell.mine) button.classList.add('wrong-flag');
    if (cell.flagged) button.textContent = '⚑';
    else if (cell.revealed && cell.mine) button.textContent = '✹';
    else if (cell.revealed && cell.adjacent) button.textContent = cell.adjacent;
    button.setAttribute('aria-label', `Satır ${row}, sütun ${col}: ${cell.flagged ? (game.status === 'lost' && !cell.mine ? 'yanlış işaretlenmiş bayrak' : 'bayraklı') : cell.revealed ? (cell.mine ? (index === game.explodedIndex ? 'mayın, patladı' : 'mayın') : cell.adjacent ? `${cell.adjacent} komşu mayın` : 'boş, güvenli') : 'kapalı'}`);
    button.tabIndex = index === focusIndex ? 0 : -1;
    button.disabled = ['won', 'lost'].includes(game.status) || cell.revealed;
    button.addEventListener('click', () => activate(index));
    button.addEventListener('contextmenu', event => { event.preventDefault(); flag(index); });
    button.addEventListener('keydown', event => navigate(event, index));
    boardElement.append(button);
  });
  difficultyPicker.value = game.difficulty;
  document.querySelector('#mine-counter').textContent = String(game.mineCount - game.flags).padStart(2, '0');
  document.querySelector('#timer').textContent = formatTime(elapsedMilliseconds(game));
  document.querySelector('#best').textContent = `${config.label} rekoru: ${records[game.difficulty] === null ? '—' : `${formatTime(records[game.difficulty])} sn`}`;
  document.querySelector('#flag-mode').setAttribute('aria-pressed', String(flagMode));
  document.querySelector('#flag-mode').textContent = `Bayrak modu: ${flagMode ? 'açık' : 'kapalı'}`;
  announce();
  saveGame();
}

function progressExists() { return game.status !== 'ready' || game.flags > 0; }

function activate(index) {
  focusIndex = index;
  if (flagMode) flag(index);
  else open(index);
}

function open(index) {
  const next = revealCell(game, index);
  if (next === game) return;
  game = next;
  if (game.status === 'won') {
    const previous = records[game.difficulty];
    records[game.difficulty] = previous === null ? game.elapsedMs : Math.min(previous, game.elapsedMs);
  }
  render();
  boardElement.children[focusIndex]?.focus();
}

function flag(index) {
  const next = toggleFlag(game, index);
  if (next === game) return;
  game = next;
  render();
  boardElement.children[focusIndex]?.focus();
}

function navigate(event, index) {
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -game.width, ArrowDown: game.width };
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); flag(index); return; }
  if (!(event.key in offsets)) return;
  event.preventDefault();
  const next = index + offsets[event.key];
  if (next < 0 || next >= game.cells.length || (event.key === 'ArrowLeft' && index % game.width === 0) || (event.key === 'ArrowRight' && index % game.width === game.width - 1)) return;
  focusIndex = next;
  boardElement.children.forEach(cell => { cell.tabIndex = -1; });
  const target = boardElement.children[next];
  target.tabIndex = 0;
  target.focus();
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function startNewGame(difficulty = game.difficulty) {
  if (progressExists() && !window.confirm('Devam eden oyun silinsin ve yeni oyun başlasın mı?')) {
    difficultyPicker.value = game.difficulty;
    return;
  }
  game = createGame(difficulty);
  focusIndex = 0;
  flagMode = false;
  render();
}

document.querySelector('#new-game').addEventListener('click', () => startNewGame());
difficultyPicker.addEventListener('change', () => startNewGame(difficultyPicker.value));
document.querySelector('#flag-mode').addEventListener('click', () => { flagMode = !flagMode; render(); });
document.querySelector('#board-scroll').addEventListener('keydown', event => {
  if ((event.key === ' ' || event.key === 'Enter') && document.activeElement === event.currentTarget) {
    event.preventDefault();
    open(focusIndex);
  }
});
window.setInterval(() => {
  document.querySelector('#timer').textContent = formatTime(elapsedMilliseconds(game));
  if (game.status === 'playing') saveGame();
}, 1000);

const cloudSync = syncGameOnAccountChange('mayin-tarlasi', {
  read: () => ({ game, records }),
  write: incoming => { game = incoming.game; records = mergeRecords(records, incoming.records); focusIndex = 0; flagMode = false; render(); },
  isValid: incoming => Boolean(incoming && isValidGame(incoming.game) && incoming.records && typeof incoming.records === 'object'),
  merge: (local, remote) => ({ game: remote.game, records: mergeRecords(local.records, remote.records) }),
  getStats: current => ({ easy: { bestMs: current.records.easy }, medium: { bestMs: current.records.medium }, hard: { bestMs: current.records.hard } }),
  onStatus: message => { saveElement.textContent = message; }
});

function mergeRecords(local, remote) {
  const merged = {};
  for (const level of Object.keys(records)) {
    const values = [local?.[level], remote?.[level]].filter(Number.isFinite);
    merged[level] = values.length ? Math.min(...values) : null;
  }
  return merged;
}

render();
