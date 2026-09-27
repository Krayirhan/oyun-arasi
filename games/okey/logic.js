// Klasik Okey — pure rules and bot decisions. Tile ids are stable physical pieces (0–105).
export const COLORS = Object.freeze(['kırmızı', 'mavi', 'sarı', 'siyah']);
export const MATCH_TARGET = 5;

export function createSet() {
  return [0, 1, 2, 3].flatMap(color => Array.from({ length: 13 }, (_, number) =>
    [0, 1].map(copy => ({ id: color * 26 + number * 2 + copy, color, number: number + 1, fake: false }))
  ).flat()).concat([
    { id: 104, color: null, number: null, fake: true },
    { id: 105, color: null, number: null, fake: true }
  ]);
}

export function nextFace(indicator) {
  return { color: indicator.color, number: indicator.number === 13 ? 1 : indicator.number + 1 };
}

const faceKey = tile => tile.fake ? 'fake' : `${tile.color}:${tile.number}`;
const effectiveFace = (tile, jokerFace) => tile.fake ? jokerFace : { color: tile.color, number: tile.number };
const isWild = (tile, jokerFace) => !tile.fake && tile.color === jokerFace.color && tile.number === jokerFace.number;

function validSet(tiles, wilds) {
  if (tiles.length < 3 || tiles.length > 4) return false;
  const natural = tiles.filter(tile => !wilds(tile));
  if (!natural.length) return tiles.length <= 4;
  if (natural.some(tile => tile.number !== natural[0].number)) return false;
  const colors = natural.map(tile => tile.color);
  return new Set(colors).size === colors.length && colors.length + (tiles.length - natural.length) <= 4;
}

function validRun(tiles, wilds) {
  if (tiles.length < 3 || tiles.length > 13) return false;
  const natural = tiles.filter(tile => !wilds(tile));
  if (!natural.length) return true;
  if (natural.some(tile => tile.color !== natural[0].color)) return false;
  const numbers = natural.map(tile => tile.number);
  if (new Set(numbers).size !== numbers.length) return false;
  const starts = [];
  for (let start = 1; start + tiles.length - 1 <= 13; start += 1) starts.push(start);
  if (tiles.length === 3) starts.push(12); // Türk Okey'inde 12–13–1 de geçerlidir.
  return starts.some(start => {
    const sequence = Array.from({ length: tiles.length }, (_, i) => ((start - 1 + i) % 13) + 1);
    return numbers.every(number => sequence.includes(number));
  });
}

function groupType(tiles, jokerFace) {
  const normalized = tiles.map(tile => ({ ...effectiveFace(tile, jokerFace), id: tile.id, wild: isWild(tile, jokerFace) }));
  const wilds = tile => tile.wild;
  if (validSet(normalized, wilds)) return 'set';
  if (validRun(normalized, wilds)) return 'run';
  return null;
}

function maskGroups(hand, jokerFace, minSize = 3) {
  const candidates = Array.from({ length: hand.length }, () => []);
  const limit = 1 << hand.length;
  for (let mask = 1; mask < limit; mask += 1) {
    const size = popcount(mask);
    if (size < minSize || size > 13) continue;
    const tiles = [];
    for (let i = 0; i < hand.length; i += 1) if (mask & (1 << i)) tiles.push(hand[i]);
    const type = groupType(tiles, jokerFace);
    if (type) for (let i = 0; i < hand.length; i += 1) if (mask & (1 << i)) candidates[i].push({ mask, type });
  }
  return candidates;
}

const popcount = value => { let n = value; n -= (n >>> 1) & 0x55555555; n = (n & 0x33333333) + ((n >>> 2) & 0x33333333); return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };

function solveMelds(hand, jokerFace) {
  if (!hand.length) return { count: 0, groups: [] };
  const groups = maskGroups(hand, jokerFace);
  const memo = new Map([[0, { count: 0, groups: [] }]]);
  const full = (1 << hand.length) - 1;
  const solve = mask => {
    if (memo.has(mask)) return memo.get(mask);
    const first = 1 << trailingIndex(mask);
    const skipped = solve(mask ^ first);
    let best = { count: skipped.count, groups: skipped.groups };
    for (const candidate of groups[trailingIndex(mask)]) {
      if ((candidate.mask & first) === 0 || (candidate.mask & mask) !== candidate.mask) continue;
      const tail = solve(mask ^ candidate.mask);
      const total = popcount(candidate.mask) + tail.count;
      if (total > best.count) {
        best = { count: total, groups: [{ type: candidate.type, tiles: indexes(candidate.mask, hand) }, ...tail.groups] };
      }
    }
    memo.set(mask, best);
    return best;
  };
  return solve(full);
}

function trailingIndex(mask) { let i = 0; while ((mask & (1 << i)) === 0) i += 1; return i; }
function indexes(mask, hand) { return hand.filter((_, i) => mask & (1 << i)); }

function pairFace(tile, jokerFace) { return tile.fake ? `${jokerFace.color}:${jokerFace.number}` : faceKey(tile); }

function isSevenPairs(hand, jokerFace) {
  if (hand.length !== 14) return false;
  const wilds = hand.filter(tile => isWild(tile, jokerFace)).length;
  const faces = new Map();
  for (const tile of hand) {
    if (isWild(tile, jokerFace)) continue;
    const key = pairFace(tile, jokerFace);
    faces.set(key, (faces.get(key) || 0) + 1);
  }
  let pairs = 0;
  let singles = 0;
  for (const count of faces.values()) { pairs += Math.floor(count / 2); singles += count % 2; }
  if (wilds < singles) return false;
  return pairs + singles + Math.floor((wilds - singles) / 2) >= 7;
}

export function bestArrangement(hand, indicator) {
  if (!Array.isArray(hand) || !indicator) return { covered: 0, groups: [], sevenPairs: false };
  const jokerFace = nextFace(indicator);
  const result = solveMelds(hand, jokerFace);
  return { covered: result.count, groups: result.groups, sevenPairs: isSevenPairs(hand, jokerFace) };
}

export function canFinish(hand, indicator) {
  if (!Array.isArray(hand) || hand.length !== 14 || !indicator) return false;
  const arrangement = bestArrangement(hand, indicator);
  return arrangement.covered === 14 || arrangement.sevenPairs;
}

export function sortHand(hand, indicator, mode = 'series') {
  const jokerFace = nextFace(indicator);
  const faceOrder = tile => {
    if (isWild(tile, jokerFace)) return 1000;
    const face = effectiveFace(tile, jokerFace);
    return mode === 'pairs' ? face.number * 5 + face.color : face.color * 20 + face.number;
  };
  return [...hand].sort((a, b) => mode === 'pairs'
    ? faceOrder(a) - faceOrder(b) || a.id - b.id
    : faceOrder(a) - faceOrder(b) || a.id - b.id);
}

function shuffledSet(random) {
  const tiles = createSet();
  for (let i = tiles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

export function createRound(random = Math.random, dealer = 0) {
  const wall = shuffledSet(random);
  const indicator = wall.pop();
  const hands = [[], [], [], []];
  // Dealer seat gets 15; each other seat gets 14. Dealer makes the first discard.
  for (let round = 0; round < 15; round += 1) {
    for (let offset = 0; offset < 4; offset += 1) {
      const seat = (dealer + offset) % 4;
      if (round < (offset === 0 ? 15 : 14)) hands[seat].push(wall.pop());
    }
  }
  return {
    v: 1, phase: 'discard', dealer, turn: dealer, indicator, joker: nextFace(indicator),
    wall, hands, discards: [[], [], [], []], wins: [0, 0, 0, 0], roundWinner: null,
    matchWinner: null, target: MATCH_TARGET, rounds: 0, lastAction: null
  };
}

function clone(state) {
  return { ...state, indicator: { ...state.indicator }, joker: { ...state.joker },
    wall: [...state.wall], hands: state.hands.map(hand => [...hand]), discards: state.discards.map(pile => [...pile]),
    wins: [...state.wins], lastAction: state.lastAction ? { ...state.lastAction } : null };
}

export function drawFromWall(state, player = state.turn) {
  if (state.phase !== 'draw' || player !== state.turn || state.wall.length === 0) return state;
  const next = clone(state);
  next.hands[player].push(next.wall.pop());
  next.phase = 'discard';
  next.lastAction = { type: 'draw-wall', player };
  return next;
}

export function drawDiscard(state, player = state.turn) {
  if (state.phase !== 'draw' || player !== state.turn) return state;
  const previous = (player + 3) % 4;
  if (!state.discards[previous].length) return state;
  const next = clone(state);
  next.hands[player].push(next.discards[previous].pop());
  next.phase = 'discard';
  next.lastAction = { type: 'draw-discard', player };
  return next;
}

export function discardTile(state, player, tileId) {
  if (state.phase !== 'discard' || player !== state.turn) return state;
  const index = state.hands[player].findIndex(tile => tile.id === tileId);
  if (index < 0 || state.hands[player].length !== 15) return state;
  const next = clone(state);
  const [tile] = next.hands[player].splice(index, 1);
  next.discards[player].push(tile);
  next.lastAction = { type: 'discard', player, tileId };
  if (canFinish(next.hands[player], next.indicator)) {
    next.phase = 'round-over';
    next.roundWinner = player;
    next.wins[player] += 1;
    next.rounds += 1;
    if (next.wins[player] >= next.target) { next.phase = 'match-over'; next.matchWinner = player; }
  } else if (!next.wall.length) {
    next.phase = 'round-over';
    next.rounds += 1;
  } else {
    next.phase = 'draw';
    next.turn = (player + 1) % 4;
  }
  return next;
}

export function nextRound(state, random = Math.random) {
  if (!['round-over', 'match-over'].includes(state.phase) || state.phase === 'match-over') return state;
  const next = createRound(random, (state.dealer + 1) % 4);
  next.wins = [...state.wins];
  next.rounds = state.rounds;
  next.target = state.target;
  return next;
}

function scoreDiscard(hand, indicator, removeIndex) {
  const remainder = hand.filter((_, i) => i !== removeIndex);
  const result = bestArrangement(remainder, indicator);
  return result.sevenPairs ? 14 : result.covered;
}

export function chooseBotDiscard(hand, indicator, level = 'medium', random = Math.random, seenDiscards = []) {
  if (!hand.length) return null;
  if (level === 'easy') return hand[Math.floor(random() * hand.length)].id;
  const seenFaces = new Map();
  for (const tile of seenDiscards) {
    const key = faceKey(tile);
    seenFaces.set(key, (seenFaces.get(key) || 0) + 1);
  }
  const scored = hand.map((tile, index) => ({
    id: tile.id,
    score: scoreDiscard(hand, indicator, index),
    knownCopies: level === 'hard' ? seenFaces.get(faceKey(tile)) || 0 : 0,
    noise: random()
  }));
  scored.sort((a, b) => b.score - a.score || b.knownCopies - a.knownCopies || a.noise - b.noise);
  if (level === 'medium' && random() < 0.2 && scored.length > 1) return scored[1].id;
  return scored[0].id;
}

export function botTurn(state, level = 'medium', random = Math.random) {
  if (state.turn === 0) return state;
  const player = state.turn;
  if (state.phase === 'discard') {
    return discardTile(state, player, chooseBotDiscard(state.hands[player], state.indicator, level, random, state.discards.flat()));
  }
  if (state.phase !== 'draw') return state;
  const top = state.discards[(player + 3) % 4].at(-1);
  let next = state;
  if (top && level !== 'easy') {
    const withDiscard = [...state.hands[player], top];
    const discardScore = bestArrangement(withDiscard, state.indicator).covered;
    const currentScore = bestArrangement(state.hands[player], state.indicator).covered;
    if (discardScore >= currentScore + 3) next = drawDiscard(state, player);
  }
  if (next === state) next = drawFromWall(state, player);
  if (next.phase !== 'discard') return { ...clone(state), phase: 'round-over', rounds: state.rounds + 1, lastAction: { type: 'wall-empty' } };
  return discardTile(next, player, chooseBotDiscard(next.hands[player], next.indicator, level, random, next.discards.flat()));
}

export function isValidRound(state) {
  if (!state || state.v !== 1 || !['draw', 'discard', 'round-over', 'match-over'].includes(state.phase)) return false;
  if (!Array.isArray(state.hands) || state.hands.length !== 4 || !Array.isArray(state.discards) || state.discards.length !== 4) return false;
  if (!Array.isArray(state.wall) || !Array.isArray(state.wins) || state.wins.length !== 4 || !Number.isInteger(state.turn) || state.turn < 0 || state.turn > 3) return false;
  const all = [state.indicator, ...state.wall, ...state.hands.flat(), ...state.discards.flat()];
  return all.length === 106 && new Set(all.map(tile => tile.id)).size === 106 && all.every(tile => Number.isInteger(tile.id) && tile.id >= 0 && tile.id <= 105)
    && (state.phase !== 'discard' || state.hands[state.turn].length === 15)
    && (state.phase !== 'draw' || state.hands[state.turn].length === 14);
}
