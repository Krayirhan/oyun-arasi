export function createGame(pairCount, random = Math.random) {
  const deck = Array.from({ length: pairCount }, (_, id) => [id, id]).flat();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [deck[index], deck[target]] = [deck[target], deck[index]];
  }
  return { pairCount, deck, matched: [], revealed: [], moves: 0, status: 'ready', startedAt: null, elapsedMs: 0, pendingMismatchAt: null };
}

export function flipCard(state, index, now) {
  if (!Number.isInteger(index) || index < 0 || index >= state.deck.length || state.status === 'won'
    || state.pendingMismatchAt !== null || state.matched.includes(index) || state.revealed.includes(index)) return state;
  const next = { ...state, matched: [...state.matched], revealed: [...state.revealed], elapsedMs: state.elapsedMs };
  if (next.status === 'ready') { next.status = 'playing'; next.startedAt = now; }
  else if (next.status === 'playing' && next.startedAt === null) next.startedAt = now; // duraklatılmış oyun ilk hamlede sürer
  next.revealed.push(index);
  if (next.revealed.length === 2) {
    next.moves += 1;
    const [first, second] = next.revealed;
    if (next.deck[first] === next.deck[second]) {
      next.matched.push(first, second);
      next.revealed = [];
      if (next.matched.length === next.deck.length) {
        next.status = 'won';
        next.elapsedMs = Math.max(0, next.elapsedMs + now - next.startedAt);
        next.startedAt = null;
      }
    } else next.pendingMismatchAt = now + 700;
  }
  return next;
}

export function settleMismatch(state, now) {
  if (state.pendingMismatchAt === null || now < state.pendingMismatchAt) return state;
  return { ...state, revealed: [], pendingMismatchAt: null };
}

export function elapsedMilliseconds(state, now) {
  if (state.status === 'ready') return 0;
  if (state.status === 'won' || state.startedAt === null) return Math.max(0, state.elapsedMs);
  return Math.max(0, state.elapsedMs + now - state.startedAt);
}

// Süre parçalı birikir: startedAt çalışan parçanın başlangıcıdır, elapsedMs önceki parçaların toplamıdır.
// Kayıt ve gizli sekme oyunu duraklatır; böylece kapalıyken geçen zaman süreye eklenmez.
export function pauseGame(state, now) {
  if (state.status !== 'playing' || state.startedAt === null) return state;
  return { ...state, elapsedMs: state.elapsedMs + Math.max(0, now - state.startedAt), startedAt: null };
}

export function resumeGame(state, now) {
  return state.status === 'playing' && state.startedAt === null ? { ...state, startedAt: now } : state;
}

export function isValidGame(value) {
  if (!value || ![8, 18].includes(value.pairCount) || !Array.isArray(value.deck) || value.deck.length !== value.pairCount * 2) return false;
  const counts = Array(value.pairCount).fill(0);
  for (const card of value.deck) {
    if (!Number.isInteger(card) || card < 0 || card >= value.pairCount) return false;
    counts[card] += 1;
  }
  const validIndexes = indexes => Array.isArray(indexes) && new Set(indexes).size === indexes.length
    && indexes.every(index => Number.isInteger(index) && index >= 0 && index < value.deck.length);
  return counts.every(count => count === 2) && validIndexes(value.matched) && validIndexes(value.revealed)
    && value.matched.every(index => value.revealed.length < 2 || !value.revealed.includes(index))
    && value.revealed.length <= 2 && Number.isInteger(value.moves) && value.moves >= 0
    && ['ready', 'playing', 'won'].includes(value.status)
    && (value.startedAt === null || (Number.isFinite(value.startedAt) && value.startedAt >= 0))
    && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0
    && (value.pendingMismatchAt === null || (Number.isFinite(value.pendingMismatchAt) && value.revealed.length === 2))
    && (value.status !== 'won' || value.matched.length === value.deck.length);
}
