// Harfle kuralları: puanlama, deneme hakkı, günlük seri ve kayıt normalizasyonu. DOM'a dokunmaz; script.js kullanır.

export const WORD_LENGTH = 5;
export const MAX_TRIES = 6;
export const DAILY_EPOCH = [2024, 0, 1];

const chars = word => [...word];

export function normalizeWord(word) {
  return String(word || '').toLocaleLowerCase('tr-TR');
}

// Yeşil (correct) yerinde, sarı (present) kelimede var ama yeri yanlış, gri (absent) yok. Tekrarlı harfler
// cevaptaki adedi kadar işaretlenir: önce yeşiller düşülür, kalan adet soldan sağa sarıya verilir.
export function scoreGuess(guess, answer) {
  const letters = chars(guess);
  const target = chars(answer);
  const result = Array(WORD_LENGTH).fill('absent');
  const remaining = {};
  target.forEach(letter => { remaining[letter] = (remaining[letter] || 0) + 1; });
  letters.forEach((letter, index) => {
    if (letter === target[index]) { result[index] = 'correct'; remaining[letter] -= 1; }
  });
  letters.forEach((letter, index) => {
    if (result[index] === 'correct') return;
    if (remaining[letter] > 0) { result[index] = 'present'; remaining[letter] -= 1; }
  });
  return result;
}

// Sefer: ilk 20 seviyede 6, sonraki 25'te 5, kalanında 4 hak. Diğer modlar 6 hak.
export function attemptsForMode(mode, level = 1) {
  if (mode !== 'series') return MAX_TRIES;
  if (level <= 20) return 6;
  if (level <= 45) return 5;
  return 4;
}

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function previousDayKey(date = new Date()) {
  const previous = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  return dayKey(previous);
}

// 1 Ocak 2024 = #1. Yerel gün sayılır (gece yarısı yerel saatte döner).
export function puzzleNumberFor(date = new Date()) {
  const start = new Date(DAILY_EPOCH[0], DAILY_EPOCH[1], DAILY_EPOCH[2]);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.round((today - start) / 86400000) + 1);
}

export function answerForDay(answers, puzzleNumber) {
  return answers[(puzzleNumber - 1) % answers.length];
}

export function defaultStats() {
  return { played: 0, wins: 0, streak: 0, best: 0, distribution: [0, 0, 0, 0, 0, 0], lastPlayedDate: '' };
}

export function normalizeStats(stats = {}) {
  const source = stats && typeof stats === 'object' ? stats : {};
  const count = value => Math.max(0, Math.floor(Number(value)) || 0);
  return {
    played: count(source.played),
    wins: count(source.wins),
    streak: count(source.streak),
    best: count(source.best),
    distribution: Array.isArray(source.distribution) && source.distribution.length === 6
      ? source.distribution.map(count)
      : [0, 0, 0, 0, 0, 0],
    lastPlayedDate: typeof source.lastPlayedDate === 'string' ? source.lastPlayedDate : ''
  };
}

// Günlük bulmaca bitince istatistikleri günceller. `today` oyunun BAŞLADIĞI gündür: sayfa gece yarısını geçse bile
// dünkü bulmaca bugünün serisine yazılmaz. Aynı gün ikinci kez sayılmaz.
export function applyDailyResult(stats, { won, attempts, today, yesterday }) {
  const current = normalizeStats(stats);
  if (current.lastPlayedDate === today) return current;
  const next = { ...current, distribution: [...current.distribution], lastPlayedDate: today, played: current.played + 1 };
  if (won) {
    next.wins += 1;
    next.streak = current.lastPlayedDate === yesterday ? current.streak + 1 : 1;
    next.best = Math.max(next.best, next.streak);
    if (attempts >= 1 && attempts <= 6) next.distribution[attempts - 1] += 1;
  } else next.streak = 0;
  return next;
}

// Bir gün oynanmadıysa seri bozulmuştur; sonraki kazanmaya kadar eski değer görünmesin.
export function streakForDisplay(stats, today, yesterday) {
  const current = normalizeStats(stats);
  if (current.lastPlayedDate && current.lastPlayedDate !== today && current.lastPlayedDate !== yesterday) return 0;
  return current.streak;
}

export function shuffled(values, random = Math.random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function normalizeSeries(progress = {}, answers, random = Math.random) {
  const source = progress && typeof progress === 'object' ? progress : {};
  const total = answers.length;
  const known = new Set(answers);
  const order = Array.isArray(source.order) && source.order.length === total && source.order.every(word => known.has(word))
    ? [...source.order] : shuffled(answers, random);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Math.floor(Number(value)) || min));
  return {
    level: clamp(source.level, 1, total),
    wins: clamp(source.wins, 0, total),
    best: clamp(source.best, 0, total),
    completed: Boolean(source.completed),
    completedRuns: Math.max(0, Math.floor(Number(source.completedRuns)) || 0),
    order
  };
}

export function normalizePool(pool, answers) {
  const known = new Set(answers);
  return Array.isArray(pool) ? [...new Set(pool.filter(word => known.has(word)))] : [];
}

// Bozuk ya da erişilemeyen depolama oyunu öldürmemeli: okuma hatasında yedek değer, yazma hatasında false döner.
export function readJson(storage, key, fallback = null) {
  try {
    const raw = storage.getItem(key);
    return raw === null || raw === undefined ? fallback : JSON.parse(raw) ?? fallback;
  } catch { return fallback; }
}

export function writeJson(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
