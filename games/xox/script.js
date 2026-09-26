import { createGame, playMove, newRound, resetScores, isValidGame } from './logic.js?v=202609262228';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609262228';

const KEY = 'oyunarasi-xox-v1';
const boardElement = document.querySelector('#board');
const turnElement = document.querySelector('#turn');
const messageElement = document.querySelector('#message');
const saveElement = document.querySelector('#save-state');
let game = loadGame();

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (isValidGame(saved)) return saved;
  } catch {}
  return createGame();
}

function saveGame() {
  try { localStorage.setItem(KEY, JSON.stringify(game)); saveElement.textContent = 'Oyun bu cihazda saklanıyor.'; }
  catch { saveElement.textContent = 'Kayıt kullanılamıyor; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save(game);
}

function announce() {
  if (game.status === 'won') messageElement.textContent = `Oyuncu ${game.winner} bu turu kazandı!`;
  else if (game.status === 'draw') messageElement.textContent = 'Berabere! Yeni turda ilk başlayan değişecek.';
  else messageElement.textContent = `Sıra Oyuncu ${game.current}’da.`;
}

function render() {
  boardElement.replaceChildren();
  game.board.forEach((mark, index) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `cell${mark ? ` mark-${mark.toLowerCase()}` : ''}${game.winningLine.includes(index) ? ' winning' : ''}`;
    cell.setAttribute('aria-label', `Satır ${Math.floor(index / 3) + 1}, sütun ${index % 3 + 1}: ${mark || 'boş'}`);
    cell.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space');
    cell.tabIndex = index === firstEmptyCell() ? 0 : -1;
    cell.textContent = mark;
    cell.setAttribute('aria-disabled', String(Boolean(mark) || game.status !== 'playing'));
    cell.addEventListener('click', () => move(index));
    cell.addEventListener('keydown', event => navigate(event, index));
    boardElement.append(cell);
  });
  turnElement.textContent = game.status === 'playing' ? game.current : game.winner || '—';
  document.querySelector('#score-x').textContent = game.scores.X;
  document.querySelector('#score-o').textContent = game.scores.O;
  document.querySelector('#score-draws').textContent = game.scores.draws;
  announce();
  saveGame();
}

function firstEmptyCell() {
  const empty = game.board.findIndex((cell, index) => !cell && game.status === 'playing');
  return empty < 0 ? 0 : empty;
}

function move(index) {
  const next = playMove(game, index);
  if (!next) return;
  game = next;
  render();
  boardElement.querySelector(`[aria-label="Satır ${Math.floor(index / 3) + 1}, sütun ${index % 3 + 1}: ${game.board[index]}"]`)?.focus();
}

function navigate(event, index) {
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
  if (!(event.key in offsets)) return;
  event.preventDefault();
  let next = index + offsets[event.key];
  if (event.key === 'ArrowLeft' && index % 3 === 0) return;
  if (event.key === 'ArrowRight' && index % 3 === 2) return;
  if (next < 0 || next > 8) return;
  boardElement.querySelectorAll('.cell').forEach(cell => { cell.tabIndex = -1; });
  const target = boardElement.children[next];
  target.tabIndex = 0;
  target.focus();
}

document.querySelector('#round-button').addEventListener('click', () => {
  if (game.status === 'playing' && game.board.some(Boolean) && !window.confirm('Bu tur silinsin ve yeni tur başlasın mı?')) return;
  game = newRound(game);
  render();
  boardElement.querySelector('.cell[tabindex="0"]')?.focus();
});

document.querySelector('#scores-button').addEventListener('click', () => {
  if (!window.confirm('X, O ve beraberlik skorları sıfırlansın mı?')) return;
  game = resetScores(game);
  render();
});

const cloudSync = syncGameOnAccountChange('xox', {
  read: () => game,
  write: incoming => { game = incoming; render(); },
  isValid: isValidGame,
  merge: (local, remote) => ({ ...remote, scores: {
    X: Math.max(local.scores.X, remote.scores.X),
    O: Math.max(local.scores.O, remote.scores.O),
    draws: Math.max(local.scores.draws, remote.scores.draws)
  } }),
  getStats: () => ({}),
  counters: current => ({ rounds: current.scores.X + current.scores.O + current.scores.draws, xWins: current.scores.X, oWins: current.scores.O, draws: current.scores.draws }),
  onStatus: message => { saveElement.textContent = message; }
});
render();
