import { createGame, flipCard, settleMismatch, elapsedMilliseconds, isValidGame } from './logic.js?v=202609262217';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609262217';

const KEY = 'oyunarasi-hafiza-v1';
const FACES = ['🍋','🍒','🍉','🍇','🍊','🍍','🥝','🍓','🥑','🥕','🍄','🌽','🥥','🍑','🫐','🥨','🍪','🍰'];
const boardElement = document.querySelector('#board');
const statusElement = document.querySelector('#status');
const sizePicker = document.querySelector('#pair-count');
const saveElement = document.querySelector('#save-state');
let records = { 8: { bestMs: null, bestMoves: null }, 18: { bestMs: null, bestMoves: null } };
let game = loadGame();
let focusIndex = Math.max(0, game.revealed[0] ?? 0);
let nextPeriodicSave = 0;

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.records && typeof saved.records === 'object') {
      for (const size of [8, 18]) {
        const record = saved.records[size];
        if (record && (record.bestMs === null || Number.isFinite(record.bestMs)) && (record.bestMoves === null || Number.isInteger(record.bestMoves))) records[size] = record;
      }
    }
    if (isValidGame(saved?.game)) return settleMismatch(saved.game, Date.now());
  } catch {}
  return createGame(8);
}

function saveGame() {
  try { localStorage.setItem(KEY, JSON.stringify({ game, records })); saveElement.textContent = 'Oyun bu cihazda saklanıyor.'; }
  catch { saveElement.textContent = 'Kayıt kullanılamıyor; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save({ game, records });
}

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function render() {
  const now = Date.now();
  boardElement.style.setProperty('--columns', game.pairCount === 8 ? 4 : 6);
  boardElement.setAttribute('aria-label', `${game.pairCount === 8 ? 'Klasik' : 'Geniş'} hafıza tahtası`);
  boardElement.replaceChildren();
  game.deck.forEach((face, index) => {
    const visible = game.matched.includes(index) || game.revealed.includes(index);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `card${visible ? ' revealed' : ''}${game.matched.includes(index) ? ' matched' : ''}`;
    card.textContent = visible ? FACES[face] : '?';
    card.setAttribute('aria-label', `Kart ${index + 1}, ${visible ? FACES[face] : 'kapalı'}${game.matched.includes(index) ? ', eşleşti' : ''}`);
    card.setAttribute('aria-pressed', String(visible));
    card.tabIndex = index === focusIndex ? 0 : -1;
    card.addEventListener('click', () => flip(index));
    card.addEventListener('keydown', event => navigate(event, index));
    boardElement.append(card);
  });
  document.querySelector('#timer').textContent = formatTime(elapsedMilliseconds(game, now));
  document.querySelector('#moves').textContent = game.moves;
  document.querySelector('#matches').textContent = `${game.matched.length / 2} / ${game.pairCount}`;
  const record = records[game.pairCount];
  document.querySelector('#best').textContent = record.bestMs === null ? 'Rekor: —' : `En iyi süre: ${formatTime(record.bestMs)} · En az hamle: ${record.bestMoves}`;
  if (game.status === 'won') statusElement.textContent = `Tebrikler! ${formatTime(game.elapsedMs)} sürede, ${game.moves} hamlede tamamladın.`;
  else if (game.pendingMismatchAt !== null) statusElement.textContent = 'Eşleşmedi; kartlar kapanınca yeniden seçebilirsin.';
  else if (game.status === 'ready') statusElement.textContent = 'Bir kart açarak başla.';
  else statusElement.textContent = 'Bir kart daha seç.';
  saveGame();
}

function flip(index) {
  const before = game;
  game = flipCard(game, index, Date.now());
  if (game === before) return;
  focusIndex = index;
  if (game.status === 'won') updateRecord();
  render();
  boardElement.children[index]?.focus();
}

function updateRecord() {
  const record = records[game.pairCount];
  record.bestMs = record.bestMs === null ? game.elapsedMs : Math.min(record.bestMs, game.elapsedMs);
  record.bestMoves = record.bestMoves === null ? game.moves : Math.min(record.bestMoves, game.moves);
}

function navigate(event, index) {
  const columns = game.pairCount === 8 ? 4 : 6;
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
  if (!(event.key in offsets)) return;
  event.preventDefault();
  const target = index + offsets[event.key];
  if (target < 0 || target >= game.deck.length || (event.key === 'ArrowLeft' && index % columns === 0) || (event.key === 'ArrowRight' && index % columns === columns - 1)) return;
  focusIndex = target;
  boardElement.querySelectorAll('.card').forEach(card => { card.tabIndex = -1; });
  boardElement.children[target].tabIndex = 0;
  boardElement.children[target].focus();
}

function startNewGame(pairCount = game.pairCount) {
  if (game.status === 'playing' && (game.moves > 0 || game.revealed.length > 0)
    && !window.confirm('Devam eden oyun silinsin ve yeni oyun başlasın mı?')) {
    sizePicker.value = String(game.pairCount);
    return;
  }
  game = createGame(pairCount);
  focusIndex = 0;
  render();
}

document.querySelector('#new-game').addEventListener('click', () => startNewGame());
sizePicker.value = String(game.pairCount);
sizePicker.addEventListener('change', () => startNewGame(Number(sizePicker.value)));

window.setInterval(() => {
  if (game.pendingMismatchAt !== null) game = settleMismatch(game, Date.now());
  const now = Date.now();
  document.querySelector('#timer').textContent = formatTime(elapsedMilliseconds(game, now));
  if ((game.status === 'playing' || game.pendingMismatchAt !== null) && now >= nextPeriodicSave) {
    saveGame();
    nextPeriodicSave = now + 1000;
  }
  if (game.pendingMismatchAt === null) {
    boardElement.querySelectorAll('.card').forEach((card, index) => {
      const visible = game.matched.includes(index) || game.revealed.includes(index);
      card.classList.toggle('revealed', visible);
      card.classList.toggle('matched', game.matched.includes(index));
      card.textContent = visible ? FACES[game.deck[index]] : '?';
      card.setAttribute('aria-label', `Kart ${index + 1}, ${visible ? FACES[game.deck[index]] : 'kapalı'}${game.matched.includes(index) ? ', eşleşti' : ''}`);
      card.setAttribute('aria-pressed', String(visible));
    });
    if (game.status === 'won') statusElement.textContent = `Tebrikler! ${formatTime(game.elapsedMs)} sürede, ${game.moves} hamlede tamamladın.`;
    else if (game.status === 'playing') statusElement.textContent = 'Bir kart daha seç.';
  }
}, 250);

const cloudSync = syncGameOnAccountChange('hafiza', {
  read: () => ({ game, records }),
  write: incoming => { game = incoming.game; records = mergeRecords(records, incoming.records); focusIndex = Math.max(0, game.revealed[0] ?? 0); sizePicker.value = String(game.pairCount); render(); },
  isValid: incoming => Boolean(incoming && isValidGame(incoming.game) && incoming.records && typeof incoming.records === 'object'),
  merge: (local, remote) => ({ game: remote.game, records: mergeRecords(local.records, remote.records) }),
  getStats: current => ({ classic: current.records[8], expanded: current.records[18] }),
  onStatus: message => { saveElement.textContent = message; }
});

function mergeRecords(local, remote) {
  const merged = {};
  for (const size of [8, 18]) {
    const left = local?.[size] || { bestMs: null, bestMoves: null };
    const right = remote?.[size] || { bestMs: null, bestMoves: null };
    merged[size] = {
      bestMs: left.bestMs == null ? right.bestMs : right.bestMs == null ? left.bestMs : Math.min(left.bestMs, right.bestMs),
      bestMoves: left.bestMoves == null ? right.bestMoves : right.bestMoves == null ? left.bestMoves : Math.min(left.bestMoves, right.bestMoves)
    };
  }
  return merged;
}

render();
