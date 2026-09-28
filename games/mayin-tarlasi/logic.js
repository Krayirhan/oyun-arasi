export const DIFFICULTIES = {
  easy: { label: 'Kolay', width: 9, height: 9, mines: 10 },
  medium: { label: 'Orta', width: 16, height: 16, mines: 40 },
  hard: { label: 'Zor', width: 30, height: 16, mines: 99 }
};

const emptyCell = () => ({ mine: false, adjacent: 0, revealed: false, flagged: false });

export function createGame(difficulty = 'easy', random = Math.random, customConfig = null) {
  const config = customConfig ?? DIFFICULTIES[difficulty];
  if (!config || config.mines >= config.width * config.height - 9) throw new RangeError('Invalid Minesweeper configuration');
  return {
    difficulty, width: config.width, height: config.height, mineCount: config.mines,
    cells: Array.from({ length: config.width * config.height }, emptyCell),
    status: 'ready', firstIndex: -1, flags: 0, moves: 0, startedAt: null, elapsedMs: 0, explodedIndex: -1
  };
}

function neighbors(state, index) {
  const x = index % state.width;
  const y = Math.floor(index / state.width);
  const result = [];
  for (let row = Math.max(0, y - 1); row <= Math.min(state.height - 1, y + 1); row += 1) {
    for (let col = Math.max(0, x - 1); col <= Math.min(state.width - 1, x + 1); col += 1) {
      const neighbor = row * state.width + col;
      if (neighbor !== index) result.push(neighbor);
    }
  }
  return result;
}

function placeMines(state, firstIndex, random) {
  const safe = new Set([firstIndex, ...neighbors(state, firstIndex)]);
  const candidates = state.cells.map((_, index) => index).filter(index => !safe.has(index));
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.max(0, Math.min(0.999999999, random())) * (index + 1));
    [candidates[index], candidates[target]] = [candidates[target], candidates[index]];
  }
  // İlk açıştan önce konan bayraklar korunur (bayrak sayacı gerçek bayraklarla tutarlı kalır).
  const cells = state.cells.map(cell => ({ ...emptyCell(), flagged: cell.flagged }));
  for (const index of candidates.slice(0, state.mineCount)) cells[index].mine = true;
  const next = { ...state, cells, firstIndex };
  cells.forEach((cell, index) => {
    if (!cell.mine) cell.adjacent = neighbors(next, index).filter(neighbor => cells[neighbor].mine).length;
  });
  return next;
}

export function revealCell(state, index, now = Date.now(), random = Math.random) {
  if (!Number.isInteger(index) || index < 0 || index >= state.cells.length || ['won', 'lost'].includes(state.status)
    || state.cells[index].revealed || state.cells[index].flagged) return state;
  let next = state.status === 'ready' ? placeMines({ ...state, cells: state.cells.map(cell => ({ ...cell })) }, index, random)
    : { ...state, cells: state.cells.map(cell => ({ ...cell })) };
  if (next.status === 'ready') next = { ...next, status: 'playing', startedAt: now };
  else if (next.startedAt === null) next.startedAt = now; // duraklatılmış oyun ilk hamlede sürer
  next.moves += 1;
  if (next.cells[index].mine) {
    next.cells = next.cells.map(cell => cell.mine ? { ...cell, revealed: true } : cell);
    next.status = 'lost';
    next.explodedIndex = index;
    next.elapsedMs = Math.max(0, next.elapsedMs + now - next.startedAt);
    next.startedAt = null;
    return next;
  }
  const stack = [index];
  while (stack.length) {
    const current = stack.pop();
    const cell = next.cells[current];
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    if (cell.adjacent === 0) {
      for (const neighbor of neighbors(next, current)) {
        if (!next.cells[neighbor].revealed && !next.cells[neighbor].flagged && !next.cells[neighbor].mine) stack.push(neighbor);
      }
    }
  }
  if (next.cells.every(cell => cell.mine || cell.revealed)) {
    next.status = 'won';
    next.cells = next.cells.map(cell => cell.mine ? { ...cell, revealed: true } : cell);
    next.elapsedMs = Math.max(0, next.elapsedMs + now - next.startedAt);
    next.startedAt = null;
  }
  return next;
}

export function toggleFlag(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.cells.length || ['won', 'lost'].includes(state.status)
    || state.cells[index].revealed) return state;
  const cells = state.cells.map(cell => ({ ...cell }));
  cells[index].flagged = !cells[index].flagged;
  return { ...state, cells, flags: state.flags + (cells[index].flagged ? 1 : -1) };
}

export function elapsedMilliseconds(state, now = Date.now()) {
  if (state.status === 'ready') return 0;
  if (state.startedAt === null) return Math.max(0, state.elapsedMs);
  return Math.max(0, state.elapsedMs + now - state.startedAt);
}

// Süre parçalı birikir (startedAt çalışan parça, elapsedMs önceki parçalar). Kayıt ve gizli sekme oyunu duraklatır.
export function pauseGame(state, now = Date.now()) {
  if (state.status !== 'playing' || state.startedAt === null) return state;
  return { ...state, elapsedMs: state.elapsedMs + Math.max(0, now - state.startedAt), startedAt: null };
}

export function resumeGame(state, now = Date.now()) {
  return state.status === 'playing' && state.startedAt === null ? { ...state, startedAt: now } : state;
}

export function isValidGame(value) {
  if (!value || !DIFFICULTIES[value.difficulty] || !Array.isArray(value.cells)) return false;
  const config = DIFFICULTIES[value.difficulty];
  return value.width === config.width && value.height === config.height && value.mineCount === config.mines
    && value.cells.length === config.width * config.height && ['ready', 'playing', 'won', 'lost'].includes(value.status)
    && value.cells.every(cell => cell && typeof cell.mine === 'boolean' && Number.isInteger(cell.adjacent) && cell.adjacent >= 0 && cell.adjacent <= 8 && typeof cell.revealed === 'boolean' && typeof cell.flagged === 'boolean')
    && value.cells.filter(cell => cell.mine).length === (value.status === 'ready' ? 0 : value.mineCount)
    && Number.isInteger(value.flags) && value.flags === value.cells.filter(cell => cell.flagged).length
    && Number.isInteger(value.firstIndex) && value.firstIndex >= -1 && value.firstIndex < value.cells.length
    && Number.isInteger(value.moves) && value.moves >= 0
    && (value.startedAt === null || (Number.isFinite(value.startedAt) && value.startedAt >= 0))
    && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0
    && Number.isInteger(value.explodedIndex) && value.explodedIndex >= -1 && value.explodedIndex < value.cells.length
    && (value.status !== 'ready' || (value.firstIndex === -1 && value.startedAt === null));
}
