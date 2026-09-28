export const ROWS = 6;
export const COLS = 7;
export const CELL_COUNT = ROWS * COLS;
export const BOT_DEPTH = Object.freeze({ easy: 2, medium: 5, hard: 8 });
export const WIN_LINES = Object.freeze((() => {
  const lines = [];
  for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = Array.from({ length: 4 }, (_, i) => [r + dr * i, c + dc * i]);
      if (cells.every(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS)) lines.push(cells.map(([rr, cc]) => rr * COLS + cc));
    }
  }
  return lines;
})());

const centerOrder = [3, 2, 4, 1, 5, 0, 6];
const validMode = mode => ['bot', 'local', 'online'].includes(mode);
const validLevel = level => Object.hasOwn(BOT_DEPTH, level);

export function createGame({ mode = 'bot', level = 'medium', starter = 0 } = {}) {
  return { board: Array(CELL_COUNT).fill(null), current: starter, starter, winner: null, winningLine: [], scores: [0, 0], draws: 0,
    status: 'playing', mode: validMode(mode) ? mode : 'bot', level: validLevel(level) ? level : 'medium', moveCount: 0 };
}

export function landingRow(board, column) {
  if (!Number.isInteger(column) || column < 0 || column >= COLS) return -1;
  for (let row = ROWS - 1; row >= 0; row -= 1) if (board[row * COLS + column] === null) return row;
  return -1;
}

export function legalColumns(board) { return centerOrder.filter(column => landingRow(board, column) >= 0); }

export function winningLine(board, player) {
  return WIN_LINES.find(line => line.every(index => board[index] === player)) || [];
}

function connectsAt(board, index, player) {
  const row = Math.floor(index / COLS); const column = index % COLS;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let count = 1;
    for (const direction of [-1, 1]) {
      let r = row + dr * direction; let c = column + dc * direction;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === player) { count += 1; r += dr * direction; c += dc * direction; }
    }
    if (count >= 4) return true;
  }
  return false;
}

export function playMove(state, column, player = state?.current) {
  if (!state || state.status !== 'playing' || player !== state.current || ![0, 1].includes(player)) return null;
  const row = landingRow(state.board, column);
  if (row < 0) return null;
  const board = [...state.board];
  const index = row * COLS + column;
  board[index] = player;
  const line = winningLine(board, player);
  const next = { ...state, board, moveCount: state.moveCount + 1, winningLine: line };
  if (line.length) {
    next.status = 'won'; next.winner = player; next.scores = [...state.scores]; next.scores[player] += 1;
  } else if (board.every(cell => cell !== null)) {
    next.status = 'draw'; next.draws = state.draws + 1; next.winner = null;
  } else next.current = 1 - player;
  return next;
}

export function newRound(state) {
  return { ...createGame({ mode: state.mode, level: state.level, starter: 1 - state.starter }), scores: [...state.scores], draws: state.draws };
}

function hasGravity(board) {
  for (let column = 0; column < COLS; column += 1) {
    let foundToken = false;
    for (let row = 0; row < ROWS; row += 1) {
      const cell = board[row * COLS + column];
      if (cell !== null) foundToken = true;
      else if (foundToken) return false;
    }
  }
  return true;
}

export function isValidGame(value) {
  if (!(value && Array.isArray(value.board) && value.board.length === CELL_COUNT
    && value.board.every(cell => cell === null || cell === 0 || cell === 1) && hasGravity(value.board)
    && [0, 1].includes(value.current) && [0, 1].includes(value.starter)
    && (value.winner === null || [0, 1].includes(value.winner))
    && Array.isArray(value.winningLine) && value.winningLine.every(index => Number.isInteger(index) && index >= 0 && index < CELL_COUNT)
    && Array.isArray(value.scores) && value.scores.length === 2 && value.scores.every(score => Number.isInteger(score) && score >= 0)
    && Number.isInteger(value.draws) && value.draws >= 0 && Number.isInteger(value.moveCount) && value.moveCount >= 0 && value.moveCount <= CELL_COUNT
    && value.moveCount === value.board.filter(cell => cell !== null).length
    && ['playing', 'won', 'draw'].includes(value.status) && validMode(value.mode) && validLevel(value.level))) return false;
  const counts = [0, 1].map(player => value.board.filter(cell => cell === player).length);
  const expected = [0, 1].map(player => Math.floor(value.moveCount / 2) + (value.moveCount % 2 && player === value.starter ? 1 : 0));
  if (counts.some((amount, player) => amount !== expected[player])) return false;
  const wins = [winningLine(value.board, 0), winningLine(value.board, 1)];
  if (wins[0].length && wins[1].length) return false;
  if (value.status === 'playing') return value.winner === null && value.winningLine.length === 0 && !wins[0].length && !wins[1].length && value.moveCount < CELL_COUNT && value.current === (value.starter ^ (value.moveCount % 2));
  const lastPlayer = value.starter ^ ((value.moveCount - 1) % 2);
  if (value.current !== lastPlayer) return false;
  if (value.status === 'won') return value.winner === lastPlayer && wins[lastPlayer].length === 4 && value.winningLine.length === 4 && wins[lastPlayer].every(index => value.winningLine.includes(index));
  return value.winner === null && value.moveCount === CELL_COUNT && !wins[0].length && !wins[1].length && value.winningLine.length === 0;
}

function evaluate(board, player) {
  let score = 0;
  for (let row = 0; row < ROWS; row += 1) if (board[row * COLS + 3] === player) score += 5;
  for (const line of WIN_LINES) {
    let mine = 0; let theirs = 0;
    for (const index of line) { if (board[index] === player) mine += 1; else if (board[index] === 1 - player) theirs += 1; }
    if (theirs === 0) score += [0, 2, 12, 90, 100000][mine];
    else if (mine === 0) score -= [0, 2, 12, 90, 100000][theirs];
  }
  return score;
}

function immediateWins(board, player) {
  return legalColumns(board).filter(column => {
    const row = landingRow(board, column); const next = [...board]; next[row * COLS + column] = player;
    return winningLine(next, player).length > 0;
  });
}

export function chooseBotMove(state, random = Math.random) {
  const board = state.board;
  const columns = legalColumns(board);
  if (!columns.length) return -1;
  const wins = immediateWins(board, 1);
  if (wins.length) return wins[0];
  const blocks = immediateWins(board, 0);
  const safeColumns = blocks.length ? columns.filter(column => {
    const row = landingRow(board, column); const next = [...board]; next[row * COLS + column] = 1;
    return immediateWins(next, 0).length === 0;
  }) : columns;
  const candidates = safeColumns.length ? safeColumns : columns;
  if (state.level === 'easy' && candidates.length > 1 && random() < 0.22) return candidates[Math.floor(random() * candidates.length)];

  const targetDepth = BOT_DEPTH[state.level];
  const table = new Map();
  const search = (position, player, depth, alpha, beta, ply, lastIndex) => {
    if (lastIndex >= 0 && connectsAt(position, lastIndex, 1 - player)) return 1 - player === 1 ? 100000 - ply : -100000 + ply;
    const options = legalColumns(position);
    if (!options.length) return 0;
    if (depth === 0) return evaluate(position, 1);
    const key = `${position.map(cell => cell ?? '-').join('')}:${player}:${depth}`;
    if (table.has(key)) return table.get(key);
    const maximize = player === 1;
    const windowLow = alpha; const windowHigh = beta;
    let best = maximize ? -Infinity : Infinity;
    for (const column of options) {
      const row = landingRow(position, column); const next = [...position]; next[row * COLS + column] = player;
      const value = search(next, 1 - player, depth - 1, alpha, beta, ply + 1, row * COLS + column);
      best = maximize ? Math.max(best, value) : Math.min(best, value);
      if (maximize) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    // Yalnızca kesin değerler önbelleğe yazılır: pencerenin dışına çıkan değer alfa-beta kesmesinden gelen bir sınırdır.
    if (best > windowLow && best < windowHigh) table.set(key, best);
    return best;
  };
  let chosen = candidates[0]; let bestScore = -Infinity;
  for (const column of candidates) {
    const row = landingRow(board, column); const next = [...board]; next[row * COLS + column] = 1;
    const index = row * COLS + column;
    const score = connectsAt(next, index, 1) ? 100000 : search(next, 0, targetDepth - 1, -Infinity, Infinity, 1, index);
    if (score > bestScore) { bestScore = score; chosen = column; }
  }
  return chosen;
}

export function botMove(state, random = Math.random) {
  if (!state || state.mode !== 'bot' || state.status !== 'playing' || state.current !== 1) return null;
  return playMove(state, chooseBotMove(state, random), 1);
}
