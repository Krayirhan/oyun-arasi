import { SIZE, SHAPES, shapeSize, canPlace, linesToClear, createGame, placePiece, isValidGame } from './logic.js?v=202609270036';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609270036';

const KEY = 'oyunarasi-sekil-v1';
const boardElement = document.querySelector('#board');
const trayElement = document.querySelector('#tray');
const statusElement = document.querySelector('#status');
const saveElement = document.querySelector('#save-state');
const scoreElement = document.querySelector('#score');
const bestElement = document.querySelector('#best-score');
const scoreGain = document.querySelector('#score-gain');
const overlay = document.querySelector('#game-overlay');

let game = loadGame();
let selected = -1;          // tray slot picked by tap or keyboard
let cursor = { row: 3, col: 3 };
let drag = null;            // { slot, piece, ghost, pointerId, startX, startY, moved, cellSize }
const cells = [];

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (isValidGame(saved?.game)) return saved.game;
    if (Number.isInteger(saved?.game?.best)) return createGame(Math.random, saved.game.best);
  } catch {}
  return createGame();
}

function saveGame() {
  try { localStorage.setItem(KEY, JSON.stringify({ game })); saveElement.textContent = 'Oyun bu cihazda saklanıyor.'; }
  catch { saveElement.textContent = 'Kayıt kullanılamıyor; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save({ game });
}

function pieceElement(piece, className) {
  const { rows, cols } = shapeSize(piece.shape);
  const element = document.createElement('span');
  element.className = className;
  element.style.setProperty('--rows', rows);
  element.style.setProperty('--cols', cols);
  for (const [row, col] of SHAPES[piece.shape]) {
    const block = document.createElement('i');
    block.className = `block color-${piece.color}`;
    block.style.gridRow = row + 1;
    block.style.gridColumn = col + 1;
    element.append(block);
  }
  return element;
}

function buildBoard() {
  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const cell = document.createElement('div');
    cell.className = 'block-cell';
    cell.dataset.index = index;
    cells.push(cell);
  }
  boardElement.replaceChildren(...cells);
}

function renderTray() {
  trayElement.replaceChildren(...game.tray.map((piece, index) => {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'tray-slot';
    slot.dataset.slot = index;
    if (!piece) {
      slot.disabled = true;
      slot.setAttribute('aria-label', 'Boş yuva');
      return slot;
    }
    const fits = game.status === 'playing' && canFitSomewhere(piece);
    slot.classList.toggle('selected', index === selected);
    slot.classList.toggle('blocked', !fits);
    slot.setAttribute('aria-pressed', String(index === selected));
    slot.setAttribute('aria-label', `${index + 1}. parça, ${SHAPES[piece.shape].length} kare${fits ? '' : ', şu an sığmıyor'}`);
    slot.append(pieceElement(piece, 'mini-piece'));
    slot.addEventListener('pointerdown', event => startDrag(event, index));
    slot.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); select(index); } });
    return slot;
  }));
}

function canFitSomewhere(piece) {
  for (let row = 0; row < SIZE; row += 1) for (let col = 0; col < SIZE; col += 1) if (canPlace(game.board, piece, row, col)) return true;
  return false;
}

function render() {
  game.board.forEach((color, index) => {
    cells[index].className = `block-cell${color ? ` filled color-${color}` : ''}`;
  });
  scoreElement.textContent = String(game.score);
  bestElement.textContent = String(game.best);
  renderTray();
  if (game.status === 'over') {
    overlay.classList.remove('hidden');
    document.querySelector('#overlay-copy').textContent = `Skorun ${game.score}${game.score >= game.best && game.score > 0 ? ' — yeni rekor!' : `. En iyi skorun ${game.best}.`}`;
  } else overlay.classList.add('hidden');
  showPreview();
}

// Önizleme: parçanın konacağı hücreler ve dolacak satır/sütunlar.
function clearPreview() {
  for (const cell of cells) cell.classList.remove('preview', 'invalid', 'will-clear');
  cells.forEach(cell => { delete cell.dataset.ghost; });
}

function showPreview(target = previewTarget()) {
  clearPreview();
  if (!target) return;
  const { piece, row, col } = target;
  const valid = canPlace(game.board, piece, row, col);
  for (const [dr, dc] of SHAPES[piece.shape]) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
    const cell = cells[r * SIZE + c];
    cell.classList.add(valid ? 'preview' : 'invalid');
    cell.dataset.ghost = piece.color;
  }
  if (!valid) return;
  const { rows, cols } = linesToClear(game.board, piece, row, col);
  for (const r of rows) for (let c = 0; c < SIZE; c += 1) cells[r * SIZE + c].classList.add('will-clear');
  for (const c of cols) for (let r = 0; r < SIZE; r += 1) cells[r * SIZE + c].classList.add('will-clear');
}

function previewTarget() {
  if (drag?.target) return drag.target;
  if (selected < 0 || !game.tray[selected]) return null;
  return { piece: game.tray[selected], row: cursor.row, col: cursor.col };
}

function select(index) {
  if (game.status !== 'playing' || !game.tray[index]) return;
  selected = selected === index ? -1 : index;
  if (selected >= 0) {
    const { rows, cols } = shapeSize(game.tray[selected].shape);
    cursor = { row: Math.min(cursor.row, SIZE - rows), col: Math.min(cursor.col, SIZE - cols) };
    statusElement.textContent = 'Tahtada bir kareye dokun ya da oklarla yerini seçip Enter’a bas.';
  }
  renderTray();
  showPreview();
}

function place(slot, row, col) {
  const result = placePiece(game, slot, row, col);
  if (!result) {
    statusElement.textContent = 'Parça buraya sığmıyor.';
    return false;
  }
  game = result.game;
  selected = -1;
  const count = result.rows.length + result.cols.length;
  if (count) {
    statusElement.textContent = count > 1 ? `Harika! ${count} çizgi birden temizlendi.` : game.streak > 1 ? `Seri ${game.streak}! Temizlemeye devam.` : 'Bir çizgi temizlendi!';
    for (const index of result.cleared) {
      cells[index].classList.add('clearing');
      setTimeout(() => cells[index].classList.remove('clearing'), 320);
    }
  } else statusElement.textContent = game.status === 'over' ? 'Yer kalmadı. Oyun bitti.' : 'Güzel yerleştirme.';
  scoreGain.textContent = `+${result.gained}`;
  scoreGain.classList.remove('pop');
  void scoreGain.offsetWidth;
  scoreGain.classList.add('pop');
  saveGame();
  render();
  return true;
}

// Sürükle bırak: parça parmağın biraz üstünde taşınır, en yakın tahta hücresine oturur.
function startDrag(event, slot) {
  if (game.status !== 'playing' || !game.tray[slot] || event.button > 0) return;
  event.preventDefault();
  const cellSize = cells[0].getBoundingClientRect().width;
  const piece = game.tray[slot];
  const ghost = pieceElement(piece, 'drag-piece');
  ghost.style.setProperty('--cell', `${cellSize}px`);
  ghost.hidden = true;
  document.body.append(ghost);
  drag = { slot, piece, ghost, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, cellSize, touch: event.pointerType !== 'mouse', target: null };
  positionGhost(event);
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.addEventListener('pointermove', moveDrag);
  event.currentTarget.addEventListener('pointerup', endDrag);
  event.currentTarget.addEventListener('pointercancel', cancelDrag);
}

// Kopyayı imlecin (dokunmatikte parmağın biraz üstüne) altına taşır ve oturacağı hücreyi hesaplar.
function positionGhost(event) {
  const { rows, cols } = shapeSize(drag.piece.shape);
  const gap = parseFloat(getComputedStyle(boardElement).gap) || 0;
  const pitch = drag.cellSize + gap;
  const width = cols * pitch - gap;
  const height = rows * pitch - gap;
  const left = event.clientX - width / 2;
  const top = drag.touch ? event.clientY - height - 36 : event.clientY - height / 2;
  drag.ghost.style.transform = `translate(${left}px, ${top}px)`;
  const board = cells[0].getBoundingClientRect();
  const col = Math.round((left - board.left) / pitch);
  const row = Math.round((top - board.top) / pitch);
  drag.target = row > -rows && row < SIZE && col > -cols && col < SIZE ? { piece: drag.piece, row, col } : null;
}

function moveDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
  drag.moved = true;
  positionGhost(event);
  drag.ghost.hidden = false;
  showPreview();
}

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const { moved, target, slot } = drag;
  cleanupDrag(event.currentTarget);
  if (!moved) { select(slot); return; }
  if (target && canPlace(game.board, target.piece, target.row, target.col)) place(slot, target.row, target.col);
  else { statusElement.textContent = 'Parçayı boş karelerin üstüne bırak.'; showPreview(); }
}

function cancelDrag(event) {
  if (!drag) return;
  cleanupDrag(event.currentTarget);
  showPreview();
}

function cleanupDrag(slotElement) {
  drag.ghost.remove();
  slotElement.removeEventListener('pointermove', moveDrag);
  slotElement.removeEventListener('pointerup', endDrag);
  slotElement.removeEventListener('pointercancel', cancelDrag);
  drag = null;
}

// Dokun-yerleştir: seçili parça dokunulan kareye ortalanır, tahtanın kenarında içeri kaydırılır.
function anchorFor(index) {
  const { rows, cols } = shapeSize(game.tray[selected].shape);
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  return {
    row: clamp(Math.floor(index / SIZE) - Math.floor((rows - 1) / 2), SIZE - rows),
    col: clamp((index % SIZE) - Math.floor((cols - 1) / 2), SIZE - cols)
  };
}

boardElement.addEventListener('pointermove', event => {
  if (drag || selected < 0 || event.pointerType !== 'mouse') return;
  const cell = event.target.closest('.block-cell');
  if (!cell) return;
  cursor = anchorFor(Number(cell.dataset.index));
  showPreview();
});
boardElement.addEventListener('click', event => {
  if (selected < 0) return;
  const cell = event.target.closest('.block-cell');
  if (!cell) return;
  const target = anchorFor(Number(cell.dataset.index));
  cursor = target;
  if (!place(selected, target.row, target.col)) showPreview();
});

document.addEventListener('keydown', event => {
  if (event.target.closest('select, input, textarea') || event.ctrlKey || event.metaKey || event.altKey || game.status !== 'playing') return;
  if (['1', '2', '3'].includes(event.key)) { event.preventDefault(); select(Number(event.key) - 1); return; }
  if (selected < 0) return;
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (moves[event.key]) {
    event.preventDefault();
    const { rows, cols } = shapeSize(game.tray[selected].shape);
    cursor = {
      row: Math.max(0, Math.min(SIZE - rows, cursor.row + moves[event.key][0])),
      col: Math.max(0, Math.min(SIZE - cols, cursor.col + moves[event.key][1]))
    };
    showPreview();
  } else if (event.key === 'Enter') { event.preventDefault(); place(selected, cursor.row, cursor.col); }
  else if (event.key === 'Escape') { selected = -1; renderTray(); showPreview(); }
});

function newGame() {
  if (game.status === 'playing' && game.score > 0 && !window.confirm('Devam eden oyun silinsin ve yeni oyun başlasın mı? En iyi skorun korunacak.')) return;
  game = createGame(Math.random, game.best);
  selected = -1;
  statusElement.textContent = 'Yeni oyun başladı. Parçaları tahtaya sürükle.';
  saveGame();
  render();
}
document.querySelector('#new-game').addEventListener('click', newGame);
document.querySelector('#overlay-new-button').addEventListener('click', () => { game = createGame(Math.random, game.best); selected = -1; statusElement.textContent = 'Yeni oyun başladı. Parçaları tahtaya sürükle.'; saveGame(); render(); });

const cloudSync = syncGameOnAccountChange('sekil', {
  read: () => ({ game }),
  write: incoming => { game = { ...incoming.game, best: Math.max(incoming.game.best, game.best) }; selected = -1; render(); },
  isValid: incoming => Boolean(incoming && isValidGame(incoming.game)),
  merge: (local, remote) => ({ game: { ...remote.game, best: Math.max(local.game.best, remote.game.best) } }),
  getStats: current => ({ bestScore: current.game.best }),
  onStatus: message => { saveElement.textContent = message; }
});

buildBoard();
render();
statusElement.textContent = game.status === 'over' ? 'Yer kalmadı. Yeni oyuna başla.' : 'Parçaları tahtaya sürükle ya da önce parçaya, sonra kareye dokun.';
