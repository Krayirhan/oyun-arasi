import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609262300';

(() => {
  'use strict';

  const STORAGE_KEY = 'oyunarasi-2048-v1';
  const SIZE = 4;
  const TARGET = 2048;
  const boardElement = document.querySelector('#board');
  const scoreElement = document.querySelector('#score');
  const bestElement = document.querySelector('#best-score');
  const largestElement = document.querySelector('#largest-tile');
  const statusElement = document.querySelector('#status');
  const undoButton = document.querySelector('#undo-button');
  const newGameButton = document.querySelector('#new-game-button');
  const overlay = document.querySelector('#game-overlay');
  const overlayKicker = document.querySelector('#overlay-kicker');
  const overlayTitle = document.querySelector('#overlay-title');
  const overlayCopy = document.querySelector('#overlay-copy');
  const continueButton = document.querySelector('#continue-button');
  const overlayNewButton = document.querySelector('#overlay-new-button');
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

  function isBoard(value) {
    return Array.isArray(value) && value.length === SIZE
      && value.every(row => Array.isArray(row) && row.length === SIZE
        && row.every(cell => Number.isInteger(cell) && (cell === 0 || (cell >= 2 && (cell & (cell - 1)) === 0))));
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
      next.over = !next.continued && !canMove(next.board);
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

  function equalBoards(left, right) {
    return left.every((row, rowIndex) => row.every((cell, colIndex) => cell === right[rowIndex][colIndex]));
  }

  function slideLine(line) {
    const values = line.filter(Boolean);
    const result = [];
    const mergedIndexes = [];
    let gained = 0;
    for (let index = 0; index < values.length; index += 1) {
      if (values[index] === values[index + 1]) {
        const merged = values[index] * 2;
        mergedIndexes.push(result.length);
        result.push(merged);
        gained += merged;
        index += 1;
      } else {
        result.push(values[index]);
      }
    }
    while (result.length < SIZE) result.push(0);
    return { line: result, gained, mergedIndexes };
  }

  function shiftedBoard(direction) {
    const next = emptyBoard();
    const mergedLocations = [];
    let gained = 0;
    for (let index = 0; index < SIZE; index += 1) {
      const line = direction === 'left' || direction === 'right'
        ? [...state.board[index]]
        : state.board.map(row => row[index]);
      if (direction === 'right' || direction === 'down') line.reverse();
      const slid = slideLine(line);
      if (direction === 'right' || direction === 'down') slid.line.reverse();
      gained += slid.gained;
      for (const mergedIndex of slid.mergedIndexes) {
        const offset = direction === 'right' || direction === 'down' ? SIZE - 1 - mergedIndex : mergedIndex;
        mergedLocations.push(direction === 'left' || direction === 'right' ? `${index}-${offset}` : `${offset}-${index}`);
      }
      for (let offset = 0; offset < SIZE; offset += 1) {
        if (direction === 'left' || direction === 'right') next[index][offset] = slid.line[offset];
        else next[offset][index] = slid.line[offset];
      }
    }
    return { board: next, gained, mergedLocations };
  }

  function canMove(board) {
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        if (board[row][col] === 0) return true;
        if (col + 1 < SIZE && board[row][col] === board[row][col + 1]) return true;
        if (row + 1 < SIZE && board[row][col] === board[row + 1][col]) return true;
      }
    }
    return false;
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
    if (showWon) {
      overlay.classList.remove('hidden');
      overlayKicker.textContent = 'HEDEFE ULAŞTIN';
      overlayTitle.textContent = '2048! Harika iş.';
      overlayCopy.textContent = 'İstersen burada bırakabilir veya daha büyük taşlar için devam edebilirsin.';
      continueButton.classList.remove('hidden');
      return;
    }
    if (state.over) {
      overlay.classList.remove('hidden');
      overlayKicker.textContent = 'OYUN BİTTİ';
      overlayTitle.textContent = 'Güzel denemeydi!';
      overlayCopy.textContent = `Skorun ${state.score}. Yeni bir tahtada tekrar deneyebilirsin.`;
      continueButton.classList.add('hidden');
      return;
    }
    overlay.classList.add('hidden');
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
    const shifted = shiftedBoard(direction);
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
    state.over = !state.continued && !firstWin && !canMove(state.board);
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

  function newGame(force = false) {
    if (!force && !state.over && !window.confirm('Mevcut oyunun sıfırlansın mı? En iyi skorun korunacak.')) return;
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
  overlayNewButton.addEventListener('click', () => newGame(true));
  continueButton.addEventListener('click', continueGame);
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
