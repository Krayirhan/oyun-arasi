// Tavla (Türk kuralları) — saf oyun mantığı, DOM yok.
// Tahta 24 haneli bir dizi: pozitif sayı oyuncu 0'ın (beyaz), negatif sayı oyuncu 1'in (kırmızı) pulları.
// Oyuncu 0 23 → 0 yönünde ilerler, evi 0–5; oyuncu 1 0 → 23 yönünde ilerler, evi 18–23.
// Hamle: { from: hane | 'bar', to: hane | 'off', die, hit? }.
// Kurallar: kırık pul bara gider ve önce o girer; oynanabilen en çok zar oynanmak zorunda, tek zar
// oynanabiliyorsa büyüğü; toplama yalnız tüm pullar evdeyken. Katlama zarı yok; oyun 1, mars 2 puan.

export const CHECKERS = 15;
export const MATCH_TARGETS = [3, 5, 7];

const startPoints = () => {
  const points = Array(24).fill(0);
  points[23] = 2; points[12] = 5; points[7] = 3; points[5] = 5;
  points[0] = -2; points[11] = -5; points[16] = -3; points[18] = -5;
  return points;
};

const own = (value, player) => (player === 0 ? value > 0 : value < 0);
const count = (value, player) => (own(value, player) ? Math.abs(value) : 0);
const opponentCount = (value, player) => count(value, 1 - player);
const unit = player => (player === 0 ? 1 : -1);
const step = player => (player === 0 ? -1 : 1);
const entryPoint = (player, die) => (player === 0 ? 24 - die : die - 1);
// Hanenin toplama alanına uzaklığı (oyuncu 0 için 1–24).
const distance = (player, index) => (player === 0 ? index + 1 : 24 - index);

export function createGame(target = 5) {
  return {
    v: 1, points: startPoints(), bar: [0, 0], off: [0, 0],
    turn: 0, phase: 'opening', opening: [0, 0], dice: [], left: [], moves: [], turnMax: 0,
    winner: null, gamePoints: 0,
    match: { target: MATCH_TARGETS.includes(target) ? target : 5, score: [0, 0], games: 0, winner: null }
  };
}

const clone = state => ({ ...state, points: [...state.points], bar: [...state.bar], off: [...state.off], dice: [...state.dice], left: [...state.left], moves: [...state.moves], match: { ...state.match, score: [...state.match.score] } });

export function allHome(state, player) {
  if (state.bar[player]) return false;
  for (let index = 0; index < 24; index += 1) {
    if (own(state.points[index], player) && distance(player, index) > 6) return false;
  }
  return true;
}

const blocked = (state, player, index) => opponentCount(state.points[index], player) >= 2;

// Tek bir zar için geçerli hamleler (en çok zar kuralı dikkate alınmadan).
export function singleMoves(state, player, die) {
  if (state.bar[player]) {
    const to = entryPoint(player, die);
    return blocked(state, player, to) ? [] : [{ from: 'bar', to, die }];
  }
  const moves = [];
  const home = allHome(state, player);
  for (let from = 0; from < 24; from += 1) {
    if (!own(state.points[from], player)) continue;
    const to = from + step(player) * die;
    if (to >= 0 && to < 24) {
      if (!blocked(state, player, to)) moves.push({ from, to, die });
    } else if (home) {
      const need = distance(player, from);
      if (die === need || (die > need && !hasFurther(state, player, from))) moves.push({ from, to: 'off', die });
    }
  }
  return moves;
}

// Evde bu haneden daha geride (toplamaya daha uzak) pul var mı?
function hasFurther(state, player, from) {
  const need = distance(player, from);
  for (let index = 0; index < 24; index += 1) {
    if (own(state.points[index], player) && distance(player, index) > need) return true;
  }
  return false;
}

// Hamleyi uygular; yeni durum döner. Kalan zarlardan kullanılanı düşer, kırılan pul bara gider.
export function applyMove(state, move) {
  const next = clone(state);
  const player = next.turn;
  if (move.from === 'bar') next.bar[player] -= 1;
  else next.points[move.from] -= unit(player);
  let hit = false;
  if (move.to === 'off') next.off[player] += 1;
  else {
    if (opponentCount(next.points[move.to], player) === 1) {
      next.points[move.to] = 0;
      next.bar[1 - player] += 1;
      hit = true;
    }
    next.points[move.to] += unit(player);
  }
  const used = next.left.indexOf(move.die);
  if (used >= 0) next.left.splice(used, 1);
  next.moves.push({ ...move, hit });
  if (next.off[player] === CHECKERS) finishGame(next, player);
  return next;
}

function finishGame(state, player) {
  state.phase = 'over';
  state.winner = player;
  state.gamePoints = state.off[1 - player] === 0 ? 2 : 1;
  state.match.score[player] += state.gamePoints;
  state.match.games += 1;
  if (state.match.score[player] >= state.match.target) state.match.winner = player;
}

export function undoMove(state) {
  if (state.phase !== 'move' || !state.moves.length) return state;
  const next = clone(state);
  const move = next.moves.pop();
  const player = next.turn;
  if (move.to === 'off') next.off[player] -= 1;
  else {
    next.points[move.to] -= unit(player);
    if (move.hit) { next.points[move.to] = -unit(player); next.bar[1 - player] -= 1; }
  }
  if (move.from === 'bar') next.bar[player] += 1;
  else next.points[move.from] += unit(player);
  next.left.push(move.die);
  next.left.sort((a, b) => b - a);
  return next;
}

const positionKey = state => `${state.points.join(',')}|${state.bar[0]},${state.bar[1]}|${state.off[0]},${state.off[1]}|${state.left.join('')}`;

// Kalan zarlarla en fazla kaç hamle yapılabilir? (Aynı konuma farklı sırayla varılırsa bir kez hesaplanır.)
export function maxPlayable(state, dice = state.left, memo = new Map()) {
  if (!dice.length || state.phase === 'over') return 0;
  const key = positionKey(state);
  if (memo.has(key)) return memo.get(key);
  let best = 0;
  search: for (const die of new Set(dice)) {
    for (const move of singleMoves(state, state.turn, die)) {
      const after = applyMove(state, move);
      const depth = 1 + (after.phase === 'over' ? 0 : maxPlayable(after, after.left, memo));
      if (depth > best) best = depth;
      if (best === dice.length) break search;
    }
  }
  memo.set(key, best);
  return best;
}

// Şu an yapılabilecek hamleler: en çok zar ve büyük zar kuralına uyanlar.
export function legalMoves(state) {
  if (state.phase !== 'move') return [];
  const needed = state.turnMax - state.moves.length;
  if (needed <= 0) return [];
  const moves = [];
  const memo = new Map();
  for (const die of new Set(state.left)) {
    for (const move of singleMoves(state, state.turn, die)) {
      const after = applyMove(state, move);
      if (needed === 1 || after.phase === 'over' || maxPlayable(after, after.left, memo) >= needed - 1) moves.push(move);
    }
  }
  const [a, b] = state.dice;
  if (state.turnMax === 1 && a !== b && !state.moves.length) {
    const high = Math.max(a, b);
    if (moves.some(move => move.die === high)) return moves.filter(move => move.die === high);
  }
  return moves;
}

export const turnDone = state => state.phase === 'move' && legalMoves(state).length === 0;

// Açılış: iki oyuncu birer zar atar; büyük atan başlar ve kendi zarlarını yeniden atar.
export function openingRoll(state, first, second) {
  if (state.phase !== 'opening') return state;
  const next = clone(state);
  next.opening = [first, second];
  if (first === second) return next;
  next.turn = first > second ? 0 : 1;
  next.phase = 'roll';
  return next;
}

export function roll(state, first, second) {
  if (state.phase !== 'roll') return state;
  const next = clone(state);
  next.dice = [first, second];
  next.left = first === second ? [first, first, first, first] : [first, second].sort((a, b) => b - a);
  next.moves = [];
  next.phase = 'move';
  next.turnMax = maxPlayable(next, next.left);
  return next;
}

export function endTurn(state) {
  if (!turnDone(state)) return state;
  const next = clone(state);
  next.turn = 1 - next.turn;
  next.phase = 'roll';
  next.dice = [];
  next.left = [];
  next.moves = [];
  next.turnMax = 0;
  return next;
}

// Maçın sıradaki oyunu: tahta sıfırlanır, skor korunur; yeniden açılış zarı atılır.
export function nextGame(state) {
  if (state.phase !== 'over' || state.match.winner !== null) return state;
  const fresh = createGame(state.match.target);
  return { ...fresh, match: { ...state.match, score: [...state.match.score] } };
}

export function pipCount(state, player) {
  let total = state.bar[player] * 25;
  for (let index = 0; index < 24; index += 1) total += count(state.points[index], player) * distance(player, index);
  return total;
}

export function checkersAt(state, index) { return Math.abs(state.points[index]); }
export function ownerAt(state, index) { return state.points[index] > 0 ? 0 : state.points[index] < 0 ? 1 : null; }

export function isValidGame(state) {
  if (!state || state.v !== 1 || !Array.isArray(state.points) || state.points.length !== 24) return false;
  if (!Array.isArray(state.bar) || !Array.isArray(state.off) || !state.match || !Array.isArray(state.match.score)) return false;
  if (!['opening', 'roll', 'move', 'over'].includes(state.phase) || ![0, 1].includes(state.turn)) return false;
  for (const player of [0, 1]) {
    const onBoard = state.points.reduce((sum, value) => sum + count(value, player), 0);
    if (onBoard + state.bar[player] + state.off[player] !== CHECKERS) return false;
  }
  return Array.isArray(state.dice) && Array.isArray(state.left) && Array.isArray(state.moves);
}

// ---- Bot ------------------------------------------------------------------------------------

// Tüm tur dizileri (en çok zar ve büyük zar kuralıyla); aynı sonuca varan diziler tekilleştirilir.
export function turnSequences(state) {
  const results = new Map();
  const visited = new Set();
  let longest = 0;
  const walk = (current, path) => {
    const seen = positionKey(current);
    if (visited.has(seen)) return;
    visited.add(seen);
    let extended = false;
    if (current.phase !== 'over') {
      for (const die of new Set(current.left)) {
        for (const move of singleMoves(current, current.turn, die)) {
          extended = true;
          walk(applyMove(current, move), [...path, move]);
        }
      }
    }
    if (!extended) {
      if (path.length < longest) return;
      if (path.length > longest) { longest = path.length; results.clear(); }
      const key = `${current.points.join(',')}|${current.bar.join(',')}|${current.off.join(',')}`;
      if (!results.has(key)) results.set(key, { moves: path, state: current });
    }
  };
  walk(state, []);
  let sequences = [...results.values()];
  const [a, b] = state.dice;
  if (longest === 1 && a !== b) {
    const high = sequences.filter(sequence => sequence.moves[0].die === Math.max(a, b));
    if (high.length) sequences = high;
  }
  return sequences;
}

const ALL_ROLLS = (() => {
  const rolls = [];
  for (let a = 1; a <= 6; a += 1) for (let b = a; b <= 6; b += 1) rolls.push({ dice: [a, b], weight: a === b ? 1 : 2 });
  return rolls;
})();

function hasContact(state) {
  let furthest0 = -1;
  let furthest1 = 24;
  for (let index = 0; index < 24; index += 1) {
    if (state.points[index] > 0) furthest0 = Math.max(furthest0, index);
    if (state.points[index] < 0) furthest1 = Math.min(furthest1, index);
  }
  return state.bar[0] > 0 || state.bar[1] > 0 || furthest1 < furthest0;
}

// Açık pulun vurulma olasılığı (36 zar üzerinden, bloklar hesaba katılmadan yaklaşık).
function shotChance(state, player, index) {
  const opponent = 1 - player;
  const distances = new Set();
  for (let from = 0; from < 24; from += 1) {
    if (!own(state.points[from], opponent)) continue;
    const gap = (index - from) * step(opponent);
    if (gap > 0 && gap <= 24) distances.add(gap);
  }
  if (state.bar[opponent]) {
    const gap = opponent === 0 ? 24 - index : index + 1;
    distances.add(gap);
  }
  if (!distances.size) return 0;
  let hits = 0;
  for (let a = 1; a <= 6; a += 1) {
    for (let b = 1; b <= 6; b += 1) {
      const reach = a === b ? [a, 2 * a, 3 * a, 4 * a] : [a, b, a + b];
      if (reach.some(value => distances.has(value))) hits += 1;
    }
  }
  return hits / 36;
}

export function evaluate(state, player) {
  const opponent = 1 - player;
  if (state.off[player] === CHECKERS) return 1000 + (state.off[opponent] === 0 ? 500 : 0);
  if (state.off[opponent] === CHECKERS) return -1000 - (state.off[player] === 0 ? 500 : 0);
  let score = (pipCount(state, opponent) - pipCount(state, player)) + (state.off[player] - state.off[opponent]) * 3;
  if (!hasContact(state)) return score;
  let run = 0;
  let bestRun = 0;
  let homeMade = 0;
  for (let offset = 0; offset < 24; offset += 1) {
    // Hane, oyuncunun kendi bakışından (0 = toplamaya en yakın) sırayla gezilir.
    const index = player === 0 ? offset : 23 - offset;
    const mine = count(state.points[index], player);
    if (mine >= 2) {
      score += offset < 6 ? 4 : offset < 8 ? 3 : 1.5;
      if (offset < 6) homeMade += 1;
      run += 1;
      bestRun = Math.max(bestRun, run);
    } else {
      run = 0;
      if (mine === 1) score -= shotChance(state, player, index) * (6 + (24 - offset) / 3);
    }
  }
  score += bestRun >= 3 ? bestRun * bestRun * 0.8 : 0;
  score += state.bar[opponent] * (4 + homeMade * 1.5);
  score -= state.bar[player] * 6;
  return score;
}

// Botun hamlesi. level: easy (rastgele), medium (sezgisel), hard (rakibin zarlarına karşı 1 adım ileri bakış).
export function chooseSequence(state, level = 'medium', random = Math.random) {
  const sequences = turnSequences(state);
  if (!sequences.length || !sequences[0].moves.length) return [];
  const player = state.turn;
  const scored = sequences.map(sequence => ({ sequence, value: evaluate(sequence.state, player) }))
    .sort((a, b) => b.value - a.value);
  // Kolay çoğunlukla rastgele, orta arada ikinci/üçüncü en iyi hamleyi seçer; zor her zaman düşünür.
  if (level === 'easy') return (random() < 0.35 ? scored[0] : scored[Math.floor(random() * scored.length)]).sequence.moves;
  if (level === 'medium') {
    const slip = random() < 0.3 ? Math.min(scored.length - 1, 1 + Math.floor(random() * 2)) : 0;
    return scored[slip].sequence.moves;
  }
  if (scored.length === 1) return scored[0].sequence.moves;
  let best = scored[0];
  let bestValue = -Infinity;
  for (const candidate of scored.slice(0, 5)) {
    if (candidate.sequence.state.phase === 'over') return candidate.sequence.moves;
    let total = 0;
    for (const { dice, weight } of ALL_ROLLS) {
      const reply = roll({ ...candidate.sequence.state, turn: 1 - player, phase: 'roll', moves: [] }, dice[0], dice[1]);
      const answers = turnSequences(reply);
      let worst = evaluate(reply, player);
      if (answers.length && answers[0].moves.length) {
        worst = Infinity;
        let opponentBest = -Infinity;
        for (const answer of answers) {
          const theirs = evaluate(answer.state, 1 - player);
          if (theirs > opponentBest) { opponentBest = theirs; worst = evaluate(answer.state, player); }
        }
      }
      total += worst * weight;
    }
    const value = total / 36;
    if (value > bestValue) { bestValue = value; best = candidate; }
  }
  return best.sequence.moves;
}
