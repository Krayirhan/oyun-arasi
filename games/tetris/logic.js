// Blok Düşür — pure game rules. Every function returns a new game object; nothing here touches the DOM.
// Board: 10 columns × 22 rows (the top 2 rows are hidden spawn space), stored row by row as
// '' (empty) or a piece letter so the whole game can be saved as JSON.

export const COLS = 10;
export const ROWS = 22;
export const HIDDEN_ROWS = 2;
export const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
export const LINE_POINTS = [0, 100, 300, 500, 800];
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
const QUEUE_LENGTH = 5;
const SOFT_DROP_MS = 40;

// Spawn orientation of each piece inside its rotation box.
const BASE = {
  I: ['....', 'IIII', '....', '....'],
  O: ['.OO.', '.OO.', '....', '....'],
  T: ['.T.', 'TTT', '...'],
  S: ['.SS', 'SS.', '...'],
  Z: ['ZZ.', '.ZZ', '...'],
  J: ['J..', 'JJJ', '...'],
  L: ['..L', 'LLL', '...']
};

function rotateCells(cells, size) {
  return cells.map(([x, y]) => [size - 1 - y, x]);
}

// SHAPES[type][rotation] = list of [x, y] offsets inside the rotation box.
export const SHAPES = Object.fromEntries(TYPES.map(type => {
  const rows = BASE[type];
  const size = rows.length;
  const start = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') start.push([x, y]); }));
  const states = [start];
  for (let r = 1; r < 4; r++) states.push(type === 'O' ? start : rotateCells(states[r - 1], size));
  return [type, states];
}));

// Super Rotation System wall kicks, written with y pointing down (screen coordinates).
const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]
};
const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]
};

// Milliseconds per row at each level (the common falling-block guideline curve).
export function gravityMs(level) {
  const l = Math.min(Math.max(level, 1), 20);
  return Math.max(Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000, 16);
}

export function levelForLines(lines, startLevel = 1) {
  return Math.min(startLevel + Math.floor(lines / 10), 20);
}

// Small seeded random generator (LCG) whose state lives inside the game, so a saved game
// keeps producing the same sequence of pieces.
function nextRandom(game) {
  game.rng = (game.rng * 1664525 + 1013904223) % 4294967296;
  return game.rng / 4294967296;
}

// 7-bag: every group of seven pieces holds each piece exactly once.
function fillQueue(game) {
  while (game.queue.length < QUEUE_LENGTH + 1) {
    const bag = [...TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(nextRandom(game) * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    game.queue.push(...bag);
  }
}

export function pieceCells(piece) {
  return SHAPES[piece.type][piece.rot].map(([x, y]) => ({ x: piece.x + x, y: piece.y + y }));
}

export function fits(board, piece) {
  return pieceCells(piece).every(({ x, y }) => x >= 0 && x < COLS && y >= 0 && y < ROWS && !board[y * COLS + x]);
}

function spawnPiece(type) {
  return { type, rot: 0, x: 3, y: 1 };
}

function clone(game) {
  return { ...game, board: [...game.board], queue: [...game.queue], piece: game.piece && { ...game.piece } };
}

// Takes the next piece from the queue; the game ends if it cannot appear.
function spawnNext(game, type = null) {
  const next = type ?? game.queue.shift();
  fillQueue(game);
  game.piece = spawnPiece(next);
  game.fallMs = 0;
  game.lockMs = 0;
  game.lockResets = 0;
  game.lowestY = game.piece.y;
  if (!fits(game.board, game.piece)) {
    game.status = 'over';
  } else if (fits(game.board, { ...game.piece, y: game.piece.y + 1 })) {
    // Like the guideline, pieces drop one row right away so they show up inside the visible area.
    game.piece.y += 1;
    game.lowestY = game.piece.y;
  }
  return game;
}

export function createGame(seed = Math.floor(Math.random() * 4294967296), startLevel = 1) {
  const game = {
    version: 1,
    board: Array(COLS * ROWS).fill(''),
    queue: [],
    piece: null,
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    startLevel,
    level: startLevel,
    pieces: 0,
    tetrises: 0,
    lastClear: null,
    status: 'ready',
    rng: seed % 4294967296,
    fallMs: 0,
    lockMs: 0,
    lockResets: 0,
    lowestY: 0
  };
  fillQueue(game);
  return spawnNext(game);
}

export function isGrounded(game) {
  return Boolean(game.piece) && !fits(game.board, { ...game.piece, y: game.piece.y + 1 });
}

// A successful move or rotation while the piece rests on something restarts the lock timer,
// but only a limited number of times so a piece cannot be spun forever.
function afterShift(game) {
  if (game.piece.y > game.lowestY) { game.lowestY = game.piece.y; game.lockResets = 0; }
  if (game.lockMs > 0 && game.lockResets < MAX_LOCK_RESETS) { game.lockMs = 0; game.lockResets += 1; }
  return game;
}

function canPlay(game) {
  return game.status === 'playing' && game.piece;
}

export function move(game, dx) {
  if (!canPlay(game)) return game;
  const piece = { ...game.piece, x: game.piece.x + dx };
  if (!fits(game.board, piece)) return game;
  const next = clone(game);
  next.piece = piece;
  return afterShift(next);
}

export function rotate(game, direction = 1) {
  if (!canPlay(game) || game.piece.type === 'O') return game;
  const from = game.piece.rot;
  const to = (from + (direction > 0 ? 1 : 3)) % 4;
  const kicks = (game.piece.type === 'I' ? KICKS_I : KICKS_JLSTZ)[`${from}>${to}`];
  for (const [dx, dy] of kicks) {
    const piece = { ...game.piece, rot: to, x: game.piece.x + dx, y: game.piece.y + dy };
    if (fits(game.board, piece)) {
      const next = clone(game);
      next.piece = piece;
      return afterShift(next);
    }
  }
  return game;
}

export function ghostPiece(game) {
  if (!game.piece) return null;
  const ghost = { ...game.piece };
  while (fits(game.board, { ...ghost, y: ghost.y + 1 })) ghost.y += 1;
  return ghost;
}

function fullRows(board) {
  const rows = [];
  for (let y = 0; y < ROWS; y++) {
    if (board.slice(y * COLS, y * COLS + COLS).every(Boolean)) rows.push(y);
  }
  return rows;
}

// Writes the piece into the board, clears full rows, scores them and spawns the next piece.
function lockPiece(game) {
  const cells = pieceCells(game.piece);
  cells.forEach(({ x, y }) => { game.board[y * COLS + x] = game.piece.type; });
  const rows = fullRows(game.board);
  if (rows.length) {
    const kept = [];
    for (let y = 0; y < ROWS; y++) if (!rows.includes(y)) kept.push(...game.board.slice(y * COLS, y * COLS + COLS));
    game.board = [...Array(rows.length * COLS).fill(''), ...kept];
  }
  const points = LINE_POINTS[rows.length] * game.level;
  game.score += points;
  game.lines += rows.length;
  if (rows.length === 4) game.tetrises += 1;
  game.level = levelForLines(game.lines, game.startLevel);
  game.pieces += 1;
  game.lastClear = rows.length ? { rows, points, id: game.pieces } : null;
  game.canHold = true;
  // Lock out: a piece that locks completely inside the hidden rows ends the game.
  if (cells.every(({ y }) => y < HIDDEN_ROWS)) {
    game.status = 'over';
    game.piece = null;
    return game;
  }
  return spawnNext(game);
}

export function hardDrop(game) {
  if (!canPlay(game)) return game;
  const next = clone(game);
  const ghost = ghostPiece(next);
  next.score += (ghost.y - next.piece.y) * 2;
  next.piece = ghost;
  return lockPiece(next);
}

// One row down on request; worth 1 point. Returns the same game when the piece is resting.
export function softDrop(game) {
  if (!canPlay(game) || isGrounded(game)) return game;
  const next = clone(game);
  next.piece.y += 1;
  next.score += 1;
  next.fallMs = 0;
  return afterShift(next);
}

export function holdPiece(game) {
  if (!canPlay(game) || !game.canHold) return game;
  const next = clone(game);
  const current = next.piece.type;
  const swap = next.hold;
  next.hold = current;
  spawnNext(next, swap);
  next.canHold = false;
  return next;
}

// Advances time: gravity pulls the piece down and a resting piece locks after the lock delay.
// With soft set the piece falls at soft-drop speed and every row earns a point.
export function tick(game, ms, { soft = false } = {}) {
  if (!canPlay(game) || ms <= 0) return game;
  const next = clone(game);
  const interval = soft ? Math.min(SOFT_DROP_MS, gravityMs(next.level)) : gravityMs(next.level);
  next.fallMs += Math.min(ms, 1000);
  while (next.fallMs >= interval && next.status === 'playing') {
    if (isGrounded(next)) { next.fallMs = 0; break; }
    next.fallMs -= interval;
    next.piece.y += 1;
    if (soft) next.score += 1;
    afterShift(next);
  }
  if (next.status === 'playing' && isGrounded(next)) {
    next.lockMs += Math.min(ms, 1000);
    // Out of lock resets means the piece locks as soon as it touches down again.
    if (next.lockMs >= LOCK_DELAY_MS || next.lockResets >= MAX_LOCK_RESETS) return lockPiece(next);
  } else {
    next.lockMs = 0;
  }
  return next;
}

export function startGame(game) {
  if (game.status === 'over' || game.status === 'playing') return game;
  return { ...game, status: 'playing' };
}

export function pauseGame(game) {
  return game.status === 'playing' ? { ...game, status: 'paused' } : game;
}

export function isValidGame(game) {
  if (!game || typeof game !== 'object' || game.version !== 1) return false;
  if (!['ready', 'playing', 'paused', 'over'].includes(game.status)) return false;
  if (!Array.isArray(game.board) || game.board.length !== COLS * ROWS) return false;
  if (!game.board.every(cell => cell === '' || TYPES.includes(cell))) return false;
  if (!Array.isArray(game.queue) || game.queue.length < QUEUE_LENGTH || !game.queue.every(type => TYPES.includes(type))) return false;
  if (game.hold !== null && !TYPES.includes(game.hold)) return false;
  const numbers = ['score', 'lines', 'level', 'startLevel', 'pieces', 'rng', 'fallMs', 'lockMs', 'lockResets', 'lowestY'];
  if (!numbers.every(key => Number.isFinite(game[key]) && game[key] >= 0)) return false;
  if (game.status === 'over') return true;
  const piece = game.piece;
  if (!piece || !TYPES.includes(piece.type) || ![0, 1, 2, 3].includes(piece.rot) || !Number.isInteger(piece.x) || !Number.isInteger(piece.y)) return false;
  return fits(game.board, piece);
}
