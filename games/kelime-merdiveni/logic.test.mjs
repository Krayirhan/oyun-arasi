import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUZZLES } from './puzzles.js';
import { BLOCKED_WORDS, isBlocked } from '../harfane/engellenen.mjs';
import { applyDailyStreak, buildPuzzleSet, createGame, dailyPuzzle, differsByOne, finalStars, giveHint, isValidGame, orderForSeries, prepareDictionary, revealSolution, scoreStars, shortestPath, streakForDisplay, submitWord, validatePuzzle } from './logic.js';

const source = readFileSync(new URL('../harfane/kelimeler.js', import.meta.url), 'utf8');
const sections = [...source.matchAll(/window\.HARFANE_(ANSWERS|WORDS)\s*=\s*\[([\s\S]*?)\];/g)];
const lists = Object.fromEntries(sections.map(([, name, body]) => [name, [...body.matchAll(/"([^"\r\n]+)"/g)].map(([, word]) => word)]));
const dictionary = prepareDictionary(lists.WORDS);
const words = new Set(dictionary);
const puzzleMap = new Map(PUZZLES.map(puzzle => [puzzle.id, puzzle]));

test('sözlük Türkçe biçimde tekilleşir; yalnızca beş harfli kelimeler kalır', () => {
  assert.deepEqual(prepareDictionary([' kalem ', 'KALEM', 'çanta', 'iki', 'araba']), ['araba', 'çanta', 'kalem']);
  assert.equal(dictionary.length, 5051, 'engellenen kelimeler çıkarıldıktan sonraki sözlük');
});

test('tek hamle tam olarak bir harfi değiştirir ve Türkçe harfleri korur', () => {
  assert.equal(differsByOne('kalem', 'kalan'), false);
  assert.equal(differsByOne('kalem', 'kalam'), true);
  assert.equal(differsByOne('sınır', 'sanır'), true);
  assert.equal(differsByOne('kedi', 'kedi'), false);
});

test('BFS başlangıç ve hedef arasındaki en kısa Türkçe kelime zincirini bulur', () => {
  assert.deepEqual(shortestPath('tavan', 'tarak', words), ['tavan', 'taban', 'tabak', 'tarak']);
  assert.equal(shortestPath('tavan', 'bilinmeyen', words), null);
});

test('120 yayımlanmış bulmacanın her adımı geçerli ve gerçekten en kısadır', () => {
  assert.equal(PUZZLES.length, 120);
  const endpoints = new Set();
  for (const puzzle of PUZZLES) {
    assert.equal(validatePuzzle(puzzle, words).valid, true, `${puzzle.path.join(' → ')}`);
    assert.ok(puzzle.steps >= 3 && puzzle.steps <= 7);
    const key = `${puzzle.path[0]}:${puzzle.path.at(-1)}`;
    assert.equal(endpoints.has(key), false, `tekrar eden merdiven: ${key}`);
    endpoints.add(key);
  }
});

test('bulmaca üretimi seed sözlüğüyle kararlı ve Harfle cevaplarını öne alır', () => {
  const first = buildPuzzleSet(lists.WORDS, 24, lists.ANSWERS);
  const second = buildPuzzleSet(lists.WORDS, 24, lists.ANSWERS);
  assert.deepEqual(first, second);
  assert.equal(first.length, 24);
  assert.ok(first.every(puzzle => puzzle.path.filter(word => lists.ANSWERS.includes(word)).length >= 2));
});

test('tarihe göre günlük bulmaca kararlıdır ve arşiv tarihi farklı bulmaca seçer', () => {
  assert.equal(dailyPuzzle(PUZZLES, '2026-09-28').id, dailyPuzzle(PUZZLES, '2026-09-28').id);
  assert.notEqual(dailyPuzzle(PUZZLES, '2026-09-28').id, dailyPuzzle(PUZZLES, '2026-09-29').id);
  assert.equal(dailyPuzzle(PUZZLES, '2026-09-28').id, dailyPuzzle(PUZZLES, '2026-09-28').id);
});

test('hamle uzunluğuna göre üç, iki ve bir yıldız verilir', () => {
  assert.deepEqual([3, 4, 5, 6, 7].map(steps => scoreStars(steps, 3)), [3, 2, 2, 1, 1]);
  assert.equal(scoreStars(2, 3), 0);
});

test('giriş yalnız geçerli, sözlükte olan ve tek harf farklı yeni kelimeyi kabul eder', () => {
  const puzzle = { id: 1, path: ['tavan', 'taban', 'tabak', 'tarak'], steps: 3 };
  let game = createGame(puzzle);
  assert.equal(submitWord(game, 'xxxxx', words).error, 'unknown');
  assert.equal(submitWord(game, 'tavan', words).error, 'repeat');
  assert.equal(submitWord(game, 'taviz', words).error, 'one-letter');
  game = submitWord(game, 'taban', words).game;
  game = submitWord(game, 'tabak', words).game;
  game = submitWord(game, 'tarak', words).game;
  assert.equal(game.status, 'won');
  assert.equal(game.stars, 3);
});

test('ipucu çözümün sıradaki basamağındaki değişen harfi işaret eder', () => {
  const game = createGame({ id: 1, path: ['tavan', 'taban', 'tabak', 'tarak'], steps: 3 });
  assert.equal(giveHint(game).hint, 'taban');
});

test('ipucu oyuncu çözüm yolundan ayrılınca da bulunduğu kelimeden tek harfle gidilen kelimeyi verir', () => {
  for (const puzzle of PUZZLES.slice(0, 30)) {
    let game = createGame(puzzle);
    const alt = [...words].find(word => differsByOne(game.start, word) && word !== game.solution[1]);
    if (!alt) continue;
    game = submitWord(game, alt, words).game;
    if (game.status !== 'playing') continue;
    const hint = giveHint(game, words).hint;
    assert.equal(differsByOne(game.path.at(-1), hint), true, `${game.path.join('>')} → ${hint}`);
  }
});

test('kayıtlı oyun yalnız kendi bulmacasına ait geçerli bir yol tutarsa kabul edilir', () => {
  const puzzle = PUZZLES[0];
  const game = createGame(puzzle, 'daily', '2026-09-28');
  assert.equal(isValidGame(game, puzzleMap, words), true);
  assert.equal(isValidGame({ ...game, path: [game.start, 'xxxxx'] }, puzzleMap, words), false);
  assert.equal(isValidGame({ ...game, target: 'başka' }, puzzleMap, words), false);
});

test('her ipucu bir yıldız düşürür, kazanan en az 1 yıldız alır', () => {
  assert.equal(finalStars(3, 3, 0), 3);
  assert.equal(finalStars(3, 3, 1), 2);
  assert.equal(finalStars(3, 3, 2), 1);
  assert.equal(finalStars(3, 3, 9), 1);
  assert.equal(finalStars(5, 3, 1), 1);
  assert.equal(finalStars(2, 3, 0), 0, 'en kısadan az adım olamaz');
  const puzzle = { id: 1, path: ['tavan', 'taban', 'tabak', 'tarak'], steps: 3 };
  let game = giveHint(giveHint(createGame(puzzle), words), words);
  for (const word of ['taban', 'tabak', 'tarak']) game = submitWord(game, word, words).game;
  assert.equal(game.status, 'won');
  assert.equal(game.hints, 2);
  assert.equal(game.stars, 1);
});

test('çözümü göster: kalan en kısa yolu yazar, oyun yıldızsız biter ve geçerli kalır', () => {
  for (const puzzle of PUZZLES.slice(0, 40)) {
    let game = createGame(puzzle, 'daily', '2026-09-28');
    const alt = [...words].find(word => differsByOne(game.start, word) && word !== game.solution[1]);
    if (alt) game = submitWord(game, alt, words).game;
    const done = revealSolution(game, words);
    assert.equal(done.status, 'revealed');
    assert.equal(done.stars, 0);
    assert.equal(done.revealed.at(-1), game.target);
    assert.equal(isValidGame(done, puzzleMap, words), true, puzzle.path.join('>'));
    assert.equal(submitWord(done, 'kalem', words).error, 'finished', 'bitmiş oyuna kelime girilmez');
    assert.equal(revealSolution(done, words), done, 'ikinci kez gösterilmez');
  }
  const game = createGame(PUZZLES[0], 'daily', '2026-09-28');
  const broken = { ...revealSolution(game, words), revealed: ['xxxxx'] };
  assert.equal(isValidGame(broken, puzzleMap, words), false);
});

test('Sefer sırası kolaydan zora: adım sayısı azalmaz, tüm bulmacalar bir kez yer alır', () => {
  const order = orderForSeries(PUZZLES);
  assert.equal(order.length, PUZZLES.length);
  assert.equal(new Set(order.map(puzzle => puzzle.id)).size, PUZZLES.length);
  const steps = order.map(puzzle => puzzle.path.length - 1);
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b));
  assert.equal(steps[0], 3);
  assert.equal(steps.at(-1), 7);
  assert.deepEqual(orderForSeries(PUZZLES), order, 'her seferinde aynı sıra');
});

test('günlük seri: yalnız bugünün bulmacası sayılır; ardışık artar, atlayınca 1, aynı gün ikinci kez sayılmaz', () => {
  let record = { streak: 0, lastDate: '' };
  record = applyDailyStreak(record, '2026-09-10', '2026-09-10');
  assert.deepEqual(record, { streak: 1, lastDate: '2026-09-10' });
  assert.deepEqual(applyDailyStreak(record, '2026-09-10', '2026-09-10'), record, 'aynı gün');
  assert.deepEqual(applyDailyStreak(record, '2026-09-01', '2026-09-11'), record, 'arşiv sayılmaz');
  record = applyDailyStreak(record, '2026-09-11', '2026-09-11');
  assert.equal(record.streak, 2);
  record = applyDailyStreak(record, '2026-09-14', '2026-09-14');
  assert.deepEqual(record, { streak: 1, lastDate: '2026-09-14' });
  assert.equal(applyDailyStreak({ streak: 4, lastDate: '2026-02-28' }, '2026-03-01', '2026-03-01').streak, 5, 'ay sınırı');
  assert.equal(applyDailyStreak({ streak: 4, lastDate: '2025-12-31' }, '2026-01-01', '2026-01-01').streak, 5, 'yıl sınırı');
});

test('seri gösterimi: bir gün atlanınca eski değer görünmez', () => {
  const record = { streak: 6, lastDate: '2026-09-10' };
  assert.equal(streakForDisplay(record, '2026-09-10'), 6);
  assert.equal(streakForDisplay(record, '2026-09-11'), 6);
  assert.equal(streakForDisplay(record, '2026-09-12'), 0);
  assert.equal(streakForDisplay({}, '2026-09-12'), 0);
});

test('sözlükte ve bulmacalarda engellenen (küfür, müstehcen, hakaret) kelime bulunmaz', () => {
  assert.ok(BLOCKED_WORDS.length >= 90);
  assert.deepEqual(dictionary.filter(isBlocked), [], 'sözlük');
  assert.deepEqual(lists.ANSWERS.filter(isBlocked), [], 'Harfle cevapları');
  assert.deepEqual(PUZZLES.flatMap(puzzle => puzzle.path).filter(isBlocked), [], 'bulmaca yolları');
  for (const word of ['yarak', 'penis', 'salak', 'zenci']) assert.equal(words.has(word), false, `${word} kabul edilmemeli`);
});
