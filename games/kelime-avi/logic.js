// Kelime Avı kuralları: temalı kelimeler harf tablosuna gizlenir, oyuncu baştan sona çizerek bulur.
// Tablo satır satır düz bir harf dizisidir; kelimeler Türkçe büyük harflerle tutulur.

export const LEVELS = {
  easy: { label: 'Kolay', size: 8, words: 6, directions: [[0, 1], [1, 0]] },
  medium: { label: 'Orta', size: 10, words: 8, directions: [[0, 1], [1, 0], [1, 1], [-1, 1]] },
  hard: { label: 'Zor', size: 12, words: 10, directions: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]] }
};

const upper = word => word.toLocaleUpperCase('tr-TR');

export const THEMES = [
  ['Meyveler', 'elma armut kiraz çilek muz üzüm karpuz kavun şeftali erik incir nar ayva mandalina portakal limon vişne kayısı'],
  ['Hayvanlar', 'kedi köpek aslan kaplan zürafa fil tavşan kartal balık inek koyun keçi ayı tilki kurt sincap yunus penguen baykuş'],
  ['Renkler', 'kırmızı mavi sarı yeşil mor turuncu pembe beyaz siyah gri lacivert kahve bej altın gümüş turkuaz'],
  ['Şehirler', 'istanbul ankara izmir bursa antalya konya adana trabzon samsun mardin erzurum van rize sinop edirne kars bolu muğla'],
  ['Meslekler', 'doktor öğretmen aşçı pilot polis hemşire avukat mimar terzi çiftçi berber fırıncı yazar ressam garson şoför dişçi hakem'],
  ['Mutfak', 'tabak çatal kaşık bıçak tencere tava bardak fincan çaydanlık ocak fırın kepçe rende süzgeç sürahi tepsi'],
  ['Doğa', 'dağ deniz orman nehir göl çiçek ağaç bulut yağmur rüzgar güneş yıldız kar şelale vadi ada toprak'],
  ['Spor', 'futbol basketbol voleybol tenis yüzme koşu güreş boks kayak okçuluk golf hentbol bisiklet satranç judo'],
  ['Evimiz', 'masa sandalye koltuk yatak dolap halı perde lamba ayna kapı pencere yastık raf kilim vazo saat'],
  ['Duygular', 'sevgi mutluluk huzur umut özlem neşe korku öfke heyecan merak gurur şefkat sabır hayret'],
  ['Ulaşım', 'araba otobüs tren uçak gemi bisiklet metro tramvay vapur taksi kamyon motor kayık helikopter minibüs'],
  ['Okul', 'kalem silgi defter kitap çanta tahta sıra cetvel pergel boya makas harita zil teneffüs sınav']
].map(([name, words]) => ({ name, words: words.split(' ').map(upper) }));

// Boş kareler Türkçedeki harf sıklığına yakın rastgele harflerle dolar.
const FILL = 'AAAAAAAAEEEEEEEEİİİİİİNNNNNNRRRRRRLLLLLIIIIIKKKKKDDDDMMMMUUUUYYYTTTSSSBBBOOOÜÜŞŞZZGGÇÇHHĞVCÖPF';

const chars = word => [...word];

function shuffled(values, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function tryPlace(grid, size, word, directions, random) {
  const letters = chars(word);
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const [dr, dc] = directions[Math.floor(random() * directions.length)];
    const row = Math.floor(random() * size);
    const col = Math.floor(random() * size);
    const endRow = row + dr * (letters.length - 1);
    const endCol = col + dc * (letters.length - 1);
    if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;
    const cells = letters.map((_, step) => (row + dr * step) * size + col + dc * step);
    if (!cells.every((cell, step) => !grid[cell] || grid[cell] === letters[step])) continue;
    cells.forEach((cell, step) => { grid[cell] = letters[step]; });
    return cells;
  }
  return null;
}

export function generatePuzzle(level = 'easy', random = Math.random, themeIndex = Math.floor(random() * THEMES.length)) {
  const config = LEVELS[level] || LEVELS.easy;
  const theme = THEMES[themeIndex % THEMES.length];
  const grid = Array(config.size * config.size).fill('');
  const words = [];
  const candidates = shuffled(theme.words.filter(word => chars(word).length >= 3 && chars(word).length <= config.size), random)
    .slice(0, config.words + 4)
    .sort((a, b) => chars(b).length - chars(a).length);
  for (const word of candidates) {
    if (words.length >= config.words) break;
    const cells = tryPlace(grid, config.size, word, config.directions, random);
    if (cells) words.push({ word, cells, found: false });
  }
  for (let index = 0; index < grid.length; index += 1) if (!grid[index]) grid[index] = FILL[Math.floor(random() * FILL.length)];
  words.sort((a, b) => a.word.localeCompare(b.word, 'tr'));
  words.forEach((entry, index) => { entry.color = index % 8; });
  return { theme: themeIndex % THEMES.length, size: config.size, grid, words };
}

export function createGame(level = 'easy', random = Math.random, now = Date.now()) {
  const puzzle = generatePuzzle(level, random);
  return { level: LEVELS[level] ? level : 'easy', ...puzzle, hinted: [], hints: 0, startedAt: now, elapsedMs: 0, status: 'playing' };
}

// Başlangıçtan bitişe düz bir çizgi (yatay, dikey ya da tam çapraz) ise hücreleri döner.
export function lineCells(size, from, to) {
  const r1 = Math.floor(from / size); const c1 = from % size;
  const r2 = Math.floor(to / size); const c2 = to % size;
  const dr = Math.sign(r2 - r1); const dc = Math.sign(c2 - c1);
  const length = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1));
  if (r1 !== r2 && c1 !== c2 && Math.abs(r2 - r1) !== Math.abs(c2 - c1)) return null;
  return Array.from({ length: length + 1 }, (_, step) => (r1 + dr * step) * size + c1 + dc * step);
}

// Serbest çizimi en yakın sekiz yönden birine oturtur (parmakla çizerken küçük sapmalar için).
export function snapLine(size, from, to) {
  const r1 = Math.floor(from / size); const c1 = from % size;
  let dr = Math.floor(to / size) - r1; let dc = (to % size) - c1;
  const adr = Math.abs(dr); const adc = Math.abs(dc);
  if (adr && adc && adr !== adc) {
    if (adr > adc * 2) dc = 0;
    else if (adc > adr * 2) dr = 0;
    else { const length = Math.max(adr, adc); dr = Math.sign(dr) * length; dc = Math.sign(dc) * length; }
  }
  const r2 = Math.max(0, Math.min(size - 1, r1 + dr));
  const c2 = Math.max(0, Math.min(size - 1, c1 + dc));
  const cells = lineCells(size, from, r2 * size + c2);
  return cells && cells.every(cell => cell >= 0 && cell < size * size) ? cells : [from];
}

// Seçilen hücreler bulunmamış bir kelimeyi (düz ya da tersten) okuyorsa onu işaretler.
export function submitSelection(game, cells, now = Date.now()) {
  if (game.status !== 'playing' || !cells || cells.length < 2) return null;
  const text = cells.map(cell => game.grid[cell]).join('');
  const reversed = [...text].reverse().join('');
  const index = game.words.findIndex(entry => !entry.found && (entry.word === text || entry.word === reversed));
  if (index < 0) return null;
  const words = game.words.map((entry, position) => (position === index ? { ...entry, found: true, cells: [...cells] } : entry));
  const next = { ...game, words, hinted: game.hinted.filter(cell => !words[index].cells.includes(cell)) };
  if (words.every(entry => entry.found)) {
    next.status = 'won';
    next.elapsedMs = elapsedMilliseconds(game, now);
    next.hinted = [];
  }
  return { game: next, word: words[index] };
}

// İpucu: bulunmamış bir kelimenin ilk harfini gösterir.
export function giveHint(game, random = Math.random) {
  if (game.status !== 'playing') return null;
  const open = game.words.filter(entry => !entry.found && !game.hinted.includes(entry.cells[0]));
  if (!open.length) return null;
  const entry = open[Math.floor(random() * open.length)];
  return { game: { ...game, hinted: [...game.hinted, entry.cells[0]], hints: game.hints + 1 }, word: entry };
}

export function elapsedMilliseconds(game, now = Date.now()) {
  return game.status === 'playing' ? game.elapsedMs + Math.max(0, now - game.startedAt) : game.elapsedMs;
}

export function pauseGame(game, now = Date.now()) {
  return game.status === 'playing' ? { ...game, elapsedMs: elapsedMilliseconds(game, now), startedAt: now } : game;
}

export function resumeGame(game, now = Date.now()) {
  return game.status === 'playing' ? { ...game, startedAt: now } : game;
}

export function isValidGame(game) {
  const config = LEVELS[game?.level];
  if (!config || game.size !== config.size || !Array.isArray(game.grid) || game.grid.length !== config.size ** 2) return false;
  if (!game.grid.every(letter => typeof letter === 'string' && [...letter].length === 1)) return false;
  if (!Array.isArray(game.words) || !game.words.length) return false;
  const wordsOk = game.words.every(entry => entry && typeof entry.word === 'string' && typeof entry.found === 'boolean'
    && Array.isArray(entry.cells) && entry.cells.length === [...entry.word].length
    && entry.cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < game.grid.length)
    && [entry.word, [...entry.word].reverse().join('')].includes(entry.cells.map(cell => game.grid[cell]).join('')));
  return wordsOk
    && Number.isInteger(game.theme) && game.theme >= 0 && game.theme < THEMES.length
    && Array.isArray(game.hinted) && game.hinted.every(Number.isInteger)
    && Number.isInteger(game.hints) && game.hints >= 0
    && ['playing', 'won'].includes(game.status)
    && Number.isFinite(game.startedAt) && Number.isFinite(game.elapsedMs) && game.elapsedMs >= 0;
}

// Bulut eşitlemesi için rekorlar: her seviyede en kısa süre kalır (null = henüz rekor yok).
export function mergeRecords(first, second) {
  const merged = {};
  for (const level of Object.keys(LEVELS)) {
    const left = Number.isFinite(first?.[level]) ? first[level] : null;
    const right = Number.isFinite(second?.[level]) ? second[level] : null;
    merged[level] = left == null ? right : right == null ? left : Math.min(left, right);
  }
  return merged;
}
