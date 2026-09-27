// Kelime Merdiveni: her hamlede tek harf değiştir, gerçek Türkçe kelimelerden hedefe ulaş.
export const WORD_LENGTH = 5;
export const MIN_STEPS = 3;
export const MAX_STEPS = 7;
export const DAILY_EPOCH = '2026-01-01';

const normalize = word => String(word || '').trim().toLocaleLowerCase('tr-TR');
const chars = word => [...word];
const hash = value => {
  let result = 2166136261;
  for (const char of value) { result ^= char.codePointAt(0); result = Math.imul(result, 16777619); }
  return result >>> 0;
};

export function prepareDictionary(words) {
  return [...new Set(words.map(normalize).filter(word => [...word].length === WORD_LENGTH))].sort((a, b) => a.localeCompare(b, 'tr-TR'));
}

export function differsByOne(first, second) {
  const a = chars(normalize(first)); const b = chars(normalize(second));
  if (a.length !== WORD_LENGTH || b.length !== WORD_LENGTH) return false;
  let differences = 0;
  for (let index = 0; index < WORD_LENGTH; index += 1) if (a[index] !== b[index] && ++differences > 1) return false;
  return differences === 1;
}

export function shortestPath(start, target, dictionary) {
  start = normalize(start); target = normalize(target);
  const words = dictionary instanceof Set ? dictionary : new Set(prepareDictionary(dictionary));
  if (![start, target].every(word => words.has(word)) || start === target) return start === target && words.has(start) ? [start] : null;
  const alphabet = [...new Set([...words].flatMap(chars))];
  const previous = new Map([[start, null]]); const queue = [start]; let cursor = 0;
  while (cursor < queue.length) {
    const word = queue[cursor++];
    for (let index = 0; index < WORD_LENGTH; index += 1) {
      const original = chars(word);
      for (const letter of alphabet) {
        if (letter === original[index]) continue;
        const nextLetters = [...original]; nextLetters[index] = letter;
        const next = nextLetters.join('');
        if (!words.has(next) || previous.has(next)) continue;
        previous.set(next, word);
        if (next === target) {
          const path = [target]; let at = target;
          while (previous.get(at) !== null) { at = previous.get(at); path.push(at); }
          return path.reverse();
        }
        queue.push(next);
      }
    }
  }
  return null;
}

export function validatePuzzle(puzzle, dictionary) {
  if (!puzzle || !Array.isArray(puzzle.path) || !Number.isInteger(puzzle.id)) return { valid: false, reason: 'shape' };
  const words = dictionary instanceof Set ? dictionary : new Set(prepareDictionary(dictionary));
  const path = puzzle.path.map(normalize);
  if (path.length < MIN_STEPS + 1 || path.length > MAX_STEPS + 1 || path.some(word => !words.has(word))) return { valid: false, reason: 'length-or-word' };
  if (new Set(path).size !== path.length || path.some((word, index) => index > 0 && !differsByOne(path[index - 1], word))) return { valid: false, reason: 'step' };
  const solution = shortestPath(path[0], path.at(-1), words);
  if (!solution || solution.length !== path.length) return { valid: false, reason: 'not-shortest' };
  return { valid: true, shortestSteps: path.length - 1 };
}

export function buildPuzzleSet(words, count = 120, featuredWords = []) {
  const dictionary = prepareDictionary(words); const set = new Set(dictionary);
  const patterns = new Map();
  for (const word of dictionary) {
    const letters = chars(word);
    for (let index = 0; index < WORD_LENGTH; index += 1) {
      const key = `${index}:${letters.slice(0, index).join('')}*${letters.slice(index + 1).join('')}`;
      const group = patterns.get(key) || []; group.push(word); patterns.set(key, group);
    }
  }
  const neighbors = new Map(dictionary.map(word => [word, new Set()]));
  for (const group of patterns.values()) for (const word of group) for (const other of group) if (word !== other) neighbors.get(word).add(other);
  const buckets = new Map();
  const featured = new Set(prepareDictionary(featuredWords));
  const starts = featured.size ? [...featured].filter(word => set.has(word)) : dictionary;
  for (const start of starts) {
    const distance = new Map([[start, 0]]); const previous = new Map([[start, null]]); const queue = [start]; let cursor = 0;
    while (cursor < queue.length) {
      const word = queue[cursor++]; const depth = distance.get(word);
      if (depth >= MAX_STEPS) continue;
      for (const next of neighbors.get(word)) {
        if (distance.has(next)) continue;
        distance.set(next, depth + 1); previous.set(next, word); queue.push(next);
        const steps = depth + 1;
        if (steps < MIN_STEPS || steps > MAX_STEPS) continue;
        const path = [next]; let at = next;
        while (previous.get(at) !== null) { at = previous.get(at); path.push(at); }
        path.reverse(); const id = hash(`${path[0]}:${next}`);
        const bucket = buckets.get(steps) || [];
        const familiar = path.filter(entry => featured.has(entry)).length;
        bucket.push({ id, path, familiar }); buckets.set(steps, bucket);
      }
    }
  }
  for (const bucket of buckets.values()) bucket.sort((a, b) => b.familiar - a.familiar || a.id - b.id);
  const result = []; const used = new Set();
  for (let offset = 0; result.length < count; offset += 1) {
    let added = false;
    for (let steps = MIN_STEPS; steps <= MAX_STEPS && result.length < count; steps += 1) {
      const bucket = buckets.get(steps) || [];
      if (!bucket.length) continue;
      const candidate = bucket[(offset * 37 + steps * 101) % bucket.length];
      if (featured.size && candidate.familiar < 2) continue;
      const key = `${candidate.path[0]}:${candidate.path.at(-1)}`;
      if (used.has(key)) continue;
      used.add(key); result.push({ ...candidate, steps }); added = true;
    }
    if (!added && offset > Math.max(...[...buckets.values()].map(bucket => bucket.length))) break;
  }
  return result.sort((a, b) => b.familiar - a.familiar || a.id - b.id).slice(0, count);
}

export function dailyPuzzle(puzzles, date) {
  if (!puzzles.length) return null;
  const day = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`)) / 86400000);
  const index = ((day % puzzles.length) + puzzles.length) % puzzles.length;
  return puzzles[index];
}

export function scoreStars(stepsTaken, shortestSteps) {
  if (!Number.isInteger(stepsTaken) || !Number.isInteger(shortestSteps) || stepsTaken < shortestSteps) return 0;
  if (stepsTaken === shortestSteps) return 3;
  if (stepsTaken <= shortestSteps + 2) return 2;
  return 1;
}

export function createGame(puzzle, mode = 'daily', date = '') {
  return createPlayableGame(puzzle, mode, date);
}

export function submitWord(game, word, dictionary) {
  const candidate = normalize(word); const words = dictionary instanceof Set ? dictionary : new Set(prepareDictionary(dictionary));
  if (!game || game.status !== 'playing') return { game, error: 'finished' };
  if ([...candidate].length !== WORD_LENGTH) return { game, error: 'length' };
  if (!words.has(candidate)) return { game, error: 'unknown' };
  if (game.path.includes(candidate)) return { game, error: 'repeat' };
  if (!differsByOne(game.path.at(-1), candidate)) return { game, error: 'one-letter' };
  const path = [...game.path, candidate]; const won = candidate === game.target;
  const next = { ...game, path, hint: null, status: won ? 'won' : 'playing', stars: won ? scoreStars(path.length - 1, game.shortestSteps) : 0 };
  return { game: next, error: null };
}

export function giveHint(game) {
  if (!game || game.status !== 'playing') return game;
  const nextIndex = Math.min(game.path.length, game.solution.length - 1);
  return { ...game, hints: game.hints + 1, hint: game.solution[nextIndex] };
}

export function createPlayableGame(puzzle, mode = 'daily', date = '') {
  const solution = puzzle.path.map(normalize);
  return { version: 1, puzzleId: puzzle.id, mode, date, start: solution[0], target: solution.at(-1), shortestSteps: solution.length - 1, solution, path: [solution[0]], hints: 0, status: 'playing', stars: 0 };
}

export function isValidGame(game, puzzleById, dictionary) {
  if (!game || game.version !== 1 || !['daily', 'series'].includes(game.mode) || !Array.isArray(game.path) || !Number.isInteger(game.hints) || game.hints < 0) return false;
  const puzzle = puzzleById.get(game.puzzleId); if (!puzzle || !validatePuzzle(puzzle, dictionary).valid) return false;
  const expected = puzzle.path.map(normalize);
  if (game.start !== expected[0] || game.target !== expected.at(-1) || game.shortestSteps !== expected.length - 1) return false;
  const words = dictionary instanceof Set ? dictionary : new Set(prepareDictionary(dictionary));
  if (game.path[0] !== game.start || game.path.some((word, index) => !words.has(word) || index > 0 && (!differsByOne(game.path[index - 1], word) || game.path.slice(0, index).includes(word)))) return false;
  if (game.path.length > 200 || !['playing', 'won'].includes(game.status)) return false;
  return game.status !== 'won' || game.path.at(-1) === game.target;
}

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dailyPuzzleIndex(puzzles, date) { return dailyPuzzle(puzzles, date)?.id ?? null; }

export function seededSeries(puzzles, seed) {
  return [...puzzles].sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`));
}
