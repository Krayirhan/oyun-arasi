import { syncGameOnAccountChange } from '../../cloud-sync.js?v=mantik30';
import { confirmDialog } from '../../game-dialog.js?v=mantik30';
import { createStage } from '../../game-stage.js?v=mantik30';
import { SIZE, isBoard, equalBoards, shiftBoard, canMove } from './logic.js?v=mantik30';

(() => {
  'use strict';

  const STORAGE_KEY = 'oyunarasi-2048-v1';
  const TARGET = 2048;
  const boardElement = document.querySelector('#board');
  const scoreElement = document.querySelector('#score');
  const bestElement = document.querySelector('#best-score');
  const largestElement = document.querySelector('#largest-tile');
  const statusElement = document.querySelector('#status');
  const undoButton = document.querySelector('#undo-button');
  const newGameButton = document.querySelector('#new-game-button');
  // Kazanma ve oyun sonu kartı ortak sahne şablonundan (game-stage.js) gelir.
  const stage = createStage();
  let stageKey = '';
  const saveState = document.querySelector('#save-state');
  const scoreGain = document.querySelector('#score-gain');
  const tileProgress = document.querySelector('#tile-progress');
  const progressHint = document.querySelector('#progress-hint');

  let state;
  let canUndo = false;
  let pointerStart = null;
  let saveTimer = 0;
  let visualTiles = null;

  function emptyBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function defaultState() {
    const next = { board: emptyBoard(), score: 0, best: 0, won: false, continued: false, over: false, undo: null };
    addRandomTile(next.board);
    addRandomTile(next.board);
    return next;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const saved = JSON.parse(raw);
      if (!saved || !isBoard(saved.board) || !Number.isFinite(saved.score) || saved.score < 0) return defaultState();
      const best = Number.isFinite(saved.best) && saved.best >= 0 ? Math.floor(saved.best) : Math.floor(saved.score);
      const undo = saved.undo && isBoard(saved.undo.board) && Number.isFinite(saved.undo.score) && saved.undo.score >= 0
        ? { board: saved.undo.board, score: Math.floor(saved.undo.score) } : null;
      const next = {
        board: saved.board,
        score: Math.floor(saved.score),
        best: Math.max(best, Math.floor(saved.score)),
        won: Boolean(saved.won),
        continued: Boolean(saved.continued),
        over: Boolean(saved.over),
        undo
      };
      next.over = !canMove(next.board);
      return next;
    } catch {
      return defaultState();
    }
  }

  function saveStateToDevice() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        saveState.textContent = 'Bu cihazda kaydedildi';
      } catch {
        saveState.textContent = 'Bu oturumda kayıt tutuluyor';
      }
    }, 80);
  }

  function addRandomTile(board) {
    const empty = [];
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) if (board[row][col] === 0) empty.push([row, col]);
    }
    if (!empty.length) return false;
    const [row, col] = empty[Math.floor(Math.random() * empty.length)];
    board[row][col] = Math.random() < 0.9 ? 2 : 4;
    return [row, col];
  }

  function render() {
    const fragment = document.createDocumentFragment();
    let largest = 0;
    state.board.forEach((row, rowIndex) => {
      const rowElement = document.createElement('div');
      rowElement.className = 'board-row';
      rowElement.setAttribute('role', 'row');
      row.forEach((value, colIndex) => {
        const tile = document.createElement('div');
        const location = `${rowIndex}-${colIndex}`;
        const animation = value && visualTiles?.merged.has(location) ? ' merged'
          : value && visualTiles?.added === location ? ' new-tile' : '';
        tile.className = `tile${value ? '' : ' empty'}${value >= 8192 ? ' high' : ''}${animation}`;
        tile.setAttribute('role', 'gridcell');
        tile.setAttribute('aria-label', value ? `${value}` : 'Boş');
        if (value) tile.dataset.value = String(value);
        tile.textContent = value ? String(value) : '';
        tile.dataset.row = String(rowIndex + 1);
        tile.dataset.column = String(colIndex + 1);
        largest = Math.max(largest, value);
        rowElement.append(tile);
      });
      fragment.append(rowElement);
    });
    boardElement.replaceChildren(fragment);
    scoreElement.textContent = String(state.score);
    bestElement.textContent = String(state.best);
    largestElement.textContent = String(largest);
    const progressLevel = largest ? Math.min(11, Math.log2(largest)) : 0;
    tileProgress.value = progressLevel;
    if (largest >= TARGET) progressHint.textContent = largest === TARGET ? 'Hedefe ulaştın · devam et' : `${largest} taşını geçtin · devam et`;
    else if (largest) progressHint.textContent = `Sıradaki taş ${largest * 2}`;
    else progressHint.textContent = 'İlk taşı birleştir';
    undoButton.disabled = !canUndo || !state.undo;
    updateOverlay();
    visualTiles = null;
  }

  function updateOverlay() {
    const showWon = state.won && !state.continued;
    const key = showWon ? `won-${state.score}` : state.over ? `over-${state.score}` : '';
    if (key === stageKey) return;
    stageKey = key;
    const stats = [['Skor', state.score.toLocaleString('tr-TR')], ['En iyi', state.best.toLocaleString('tr-TR')], ['En büyük taş', largestElement.textContent]];
    if (showWon) {
      stage.show({
        kind: 'result', kicker: 'HEDEFE ULAŞTIN', title: '2048! Harika iş.', stats,
        copy: 'İstersen burada bırakabilir ya da daha büyük taşlar için devam edebilirsin.',
        actions: [{ label: 'Devam et', primary: true, onClick: continueGame }, { label: 'Yeni oyun', onClick: () => newGame(true) }]
      });
    } else if (state.over) {
      stage.show({
        kind: 'result', kicker: 'OYUN BİTTİ', title: 'Güzel denemeydi!', stats, dismissible: true,
        record: state.score > 0 && state.score >= state.best,
        copy: 'Hamle kalmadı. Yeni bir tahtada tekrar dene.',
        actions: [{ label: 'Yeni oyun', primary: true, onClick: () => newGame(true) }]
      });
    } else stage.hide();
  }

  function persistAndRender() {
    render();
    saveStateToDevice();
    cloudSync.save(state);
  }

  function announceScoreGain(gained) {
    if (!gained) return;
    scoreGain.textContent = `+${gained}`;
    scoreGain.classList.remove('pop');
    void scoreGain.offsetWidth;
    scoreGain.classList.add('pop');
  }

  function move(direction) {
    if (state.over || (state.won && !state.continued)) return;
    const shifted = shiftBoard(state.board, direction);
    if (equalBoards(shifted.board, state.board)) return;

    state.undo = { board: state.board.map(row => [...row]), score: state.score };
    canUndo = true;
    state.board = shifted.board;
    state.score += shifted.gained;
    state.best = Math.max(state.best, state.score);
    const added = addRandomTile(state.board);
    visualTiles = { merged: new Set(shifted.mergedLocations), added: added ? `${added[0]}-${added[1]}` : null };
    const firstWin = !state.won && state.board.some(row => row.includes(TARGET));
    if (firstWin) state.won = true;
    // "Devam et"ten sonra da tahta tıkanınca oyun biter; yalnızca 2048'i yapan hamlede önce kazanma kartı gelir.
    state.over = !firstWin && !canMove(state.board);
    if (firstWin) statusElement.textContent = '2048! Tebrikler. Devam etmek ister misin?';
    else if (state.over) statusElement.textContent = 'Artık hamle kalmadı. Yeni bir oyun başlatabilirsin.';
    else statusElement.textContent = shifted.gained ? `Güzel hamle! +${shifted.gained} puan.` : 'İyi gidiyorsun. Yeni bir taş belirdi.';
    announceScoreGain(shifted.gained);
    persistAndRender();
  }

  function undo() {
    if (!canUndo || !state.undo) return;
    state.board = state.undo.board.map(row => [...row]);
    state.score = state.undo.score;
    state.won = state.board.some(row => row.includes(TARGET));
    state.continued = state.won;
    state.over = false;
    state.undo = null;
    canUndo = false;
    statusElement.textContent = 'Son hamle geri alındı.';
    persistAndRender();
  }

  async function newGame(force = false) {
    if (!force && !state.over && !(await confirmDialog({ title: 'Yeniden başlansın mı?', message: 'Tahtadaki taşlar silinecek; en iyi skorun korunur.', confirmLabel: 'Yeniden başlat' }))) return;
    const best = state.best;
    state = defaultState();
    state.best = best;
    canUndo = false;
    statusElement.textContent = 'Yeni oyun başladı. İlk taşları birleştir!';
    persistAndRender();
  }

  function continueGame() {
    if (!state.won || state.continued) return;
    state.continued = true;
    state.over = !canMove(state.board);
    statusElement.textContent = 'Oyun devam ediyor. Daha büyük taşları hedefle!';
    persistAndRender();
    boardElement.focus({ preventScroll: true });
  }

  const keyDirections = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  window.addEventListener('keydown', event => {
    const direction = keyDirections[event.key];
    if (direction) {
      event.preventDefault();
      move(direction);
    } else if ((event.key === 'z' || event.key === 'Z') && !event.repeat) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      event.preventDefault();
      undo();
    }
  });

  boardElement.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    if (event.pointerType !== 'mouse') event.preventDefault();
  });
  boardElement.addEventListener('pointerup', event => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    const threshold = Math.max(24, boardElement.clientWidth * .07);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
    if (Math.abs(dx) > Math.abs(dy) * 1.25) move(dx > 0 ? 'right' : 'left');
    else if (Math.abs(dy) > Math.abs(dx) * 1.25) move(dy > 0 ? 'down' : 'up');
  });
  boardElement.addEventListener('pointercancel', () => { pointerStart = null; });
  boardElement.addEventListener('contextmenu', event => event.preventDefault());
  undoButton.addEventListener('click', undo);
  newGameButton.addEventListener('click', () => newGame());
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const incoming = JSON.parse(event.newValue);
      if (!incoming || !isBoard(incoming.board) || !Number.isFinite(incoming.score)) return;
      state = loadState();
      canUndo = Boolean(state.undo);
      statusElement.textContent = 'Oyun başka bir sekmede güncellendi.';
      render();
    } catch {
      // An invalid update in another tab does not interrupt the active game.
    }
  });

  state = loadState();
  canUndo = Boolean(state.undo);
  const cloudSync = syncGameOnAccountChange('2048', {
    read: () => state,
    write: incoming => { state = { ...incoming, best: Math.max(state.best, incoming.best || 0), undo: incoming.undo || null }; canUndo = Boolean(state.undo); statusElement.textContent = 'Hesap oyunun yüklendi.'; render(); saveStateToDevice(); },
    isValid: incoming => Boolean(incoming && isBoard(incoming.board) && Number.isFinite(incoming.score) && incoming.score >= 0),
    merge: (local, remote) => ({ ...remote, best: Math.max(local.best || 0, remote.best || 0) }),
    getStats: current => ({ bestScore: current.best || 0 }),
    counters: current => ({ wins: current.won ? 1 : 0 }),
    onStatus: message => { saveState.textContent = message; }
  });
  render();
  saveStateToDevice();
  if (state.won && !state.continued) statusElement.textContent = '2048! Tebrikler. Devam etmek ister misin?';
  else if (state.over) statusElement.textContent = 'Artık hamle kalmadı. Yeni bir oyun başlatabilirsin.';
})();
