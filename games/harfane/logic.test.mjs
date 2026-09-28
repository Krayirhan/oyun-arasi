import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  answerForDay, applyDailyResult, attemptsForMode, dayKey, defaultStats, normalizePool, normalizeSeries, normalizeStats,
  normalizeWord, previousDayKey, puzzleNumberFor, readJson, scoreGuess, streakForDisplay, writeJson
} from './logic.js';

const data = { window: {} };
new Function('window', readFileSync(new URL('./kelimeler.js', import.meta.url), 'utf8'))(data.window);
const ANSWERS = data.window.HARFANE_ANSWERS;
const WORDS = new Set(data.window.HARFANE_WORDS);

test('puanlama: doğru yer yeşil, başka yer sarı, yok gri', () => {
  assert.deepEqual(scoreGuess('kalem', 'kalem'), ['correct', 'correct', 'correct', 'correct', 'correct']);
  assert.deepEqual(scoreGuess('kalem', 'melek'), ['present', 'absent', 'correct', 'correct', 'present']);
  assert.deepEqual(scoreGuess('abcde', 'fghij'), Array(5).fill('absent'));
});

test('puanlama: tekrar eden harf cevaptaki adedi kadar işaretlenir', () => {
  // cevap "kalem": tek 'a' var; tahmindeki ikinci 'a' gri olmalı
  assert.deepEqual(scoreGuess('aaaaa', 'kalem'), ['absent', 'correct', 'absent', 'absent', 'absent']);
  // sarıya önce yeşiller düşülür: 'e' yeşil olunca ikinci 'e' sarı sayılmaz
  assert.deepEqual(scoreGuess('eeeee', 'kalem'), ['absent', 'absent', 'absent', 'correct', 'absent']);
  // iki 'a'lı cevap: ikisi de yeri bozuk tahminde ikisi de sarı
  assert.deepEqual(scoreGuess('baaxy', 'kaara'), ['absent', 'correct', 'correct', 'absent', 'absent']);
  assert.deepEqual(scoreGuess('xyaab', 'kaara'), ['absent', 'absent', 'correct', 'present', 'absent']);
});

test('puanlama: her cevap kendi tahmininde beş yeşil verir ve toplam işaret sayısı cevap harflerini aşmaz', () => {
  for (const answer of ANSWERS) {
    assert.deepEqual(scoreGuess(answer, answer), Array(5).fill('correct'), answer);
    const other = ANSWERS[(ANSWERS.indexOf(answer) + 1) % ANSWERS.length];
    const marked = scoreGuess(other, answer).filter(status => status !== 'absent').length;
    assert.ok(marked <= 5);
  }
});

test('Türkçe I/İ: büyük harfle yazılan tahmin küçük harfe doğru döner', () => {
  assert.equal(normalizeWord('IŞIK'), 'ışık');
  assert.equal(normalizeWord('İZMİR'), 'izmir');
  assert.equal(normalizeWord(null), '');
});

test('cevap ve sözlük verisi: 5 harfli, tekrarsız, her cevap geçerli tahmindir', () => {
  assert.equal(new Set(ANSWERS).size, ANSWERS.length);
  for (const word of ANSWERS) {
    assert.equal([...word].length, 5, word);
    assert.ok(WORDS.has(word), `${word} sözlükte yok`);
    assert.equal(word, normalizeWord(word));
  }
});

test('deneme hakkı: Sefer 20/45/70 sınırlarında 6/5/4, diğer modlar 6', () => {
  assert.equal(attemptsForMode('daily'), 6);
  assert.equal(attemptsForMode('practice', 60), 6);
  assert.equal(attemptsForMode('series', 1), 6);
  assert.equal(attemptsForMode('series', 20), 6);
  assert.equal(attemptsForMode('series', 21), 5);
  assert.equal(attemptsForMode('series', 45), 5);
  assert.equal(attemptsForMode('series', 46), 4);
  assert.equal(attemptsForMode('series', 70), 4);
});

test('günlük bulmaca numarası yerel günle ilerler ve cevap listesinde döner', () => {
  assert.equal(puzzleNumberFor(new Date(2024, 0, 1, 0, 0, 1)), 1);
  assert.equal(puzzleNumberFor(new Date(2024, 0, 1, 23, 59, 59)), 1);
  assert.equal(puzzleNumberFor(new Date(2024, 0, 2, 0, 0, 0)), 2);
  assert.equal(puzzleNumberFor(new Date(2023, 5, 1)), 1);
  const list = ['a', 'b', 'c'];
  assert.deepEqual([1, 2, 3, 4, 5].map(n => answerForDay(list, n)), ['a', 'b', 'c', 'a', 'b']);
  assert.equal(answerForDay(ANSWERS, 1), answerForDay(ANSWERS, 1 + ANSWERS.length));
});

test('gün anahtarları: ay ve yıl sınırında dün doğru bulunur', () => {
  assert.equal(dayKey(new Date(2026, 8, 5)), '2026-09-05');
  assert.equal(previousDayKey(new Date(2026, 2, 1)), '2026-02-28');
  assert.equal(previousDayKey(new Date(2024, 2, 1)), '2024-02-29');
  assert.equal(previousDayKey(new Date(2026, 0, 1)), '2025-12-31');
});

test('günlük seri: ardışık günler artar, atlayınca 1, kayıpta 0, aynı gün ikinci kez sayılmaz', () => {
  let stats = defaultStats();
  stats = applyDailyResult(stats, { won: true, attempts: 3, today: '2026-09-01', yesterday: '2026-08-31' });
  assert.deepEqual([stats.played, stats.wins, stats.streak, stats.best, stats.distribution[2]], [1, 1, 1, 1, 1]);
  stats = applyDailyResult(stats, { won: true, attempts: 4, today: '2026-09-02', yesterday: '2026-09-01' });
  assert.equal(stats.streak, 2);
  assert.deepEqual(applyDailyResult(stats, { won: true, attempts: 1, today: '2026-09-02', yesterday: '2026-09-01' }), stats);
  stats = applyDailyResult(stats, { won: true, attempts: 2, today: '2026-09-05', yesterday: '2026-09-04' });
  assert.deepEqual([stats.streak, stats.best], [1, 2]);
  stats = applyDailyResult(stats, { won: false, attempts: 6, today: '2026-09-06', yesterday: '2026-09-05' });
  assert.deepEqual([stats.streak, stats.best, stats.played, stats.wins], [0, 2, 4, 3]);
});

test('seri gösterimi: bir gün atlanınca eski değer görünmez', () => {
  const stats = { ...defaultStats(), streak: 5, lastPlayedDate: '2026-09-01' };
  assert.equal(streakForDisplay(stats, '2026-09-01', '2026-08-31'), 5);
  assert.equal(streakForDisplay(stats, '2026-09-02', '2026-09-01'), 5);
  assert.equal(streakForDisplay(stats, '2026-09-03', '2026-09-02'), 0);
  assert.equal(streakForDisplay({ ...defaultStats(), streak: 4 }, '2026-09-03', '2026-09-02'), 4);
});

test('istatistik normalizasyonu bozuk girdiyi güvenli değere çevirir', () => {
  assert.deepEqual(normalizeStats(null), defaultStats());
  assert.deepEqual(normalizeStats('x'), defaultStats());
  const fixed = normalizeStats({ played: '7', wins: -3, streak: 'abc', distribution: [1, 2], lastPlayedDate: 5 });
  assert.deepEqual([fixed.played, fixed.wins, fixed.streak, fixed.lastPlayedDate], [7, 0, 0, '']);
  assert.deepEqual(fixed.distribution, [0, 0, 0, 0, 0, 0]);
});

test('sefer normalizasyonu: sınırlar ve geçersiz sıra düzeltilir, geçerli sıra korunur', () => {
  const fixed = normalizeSeries({ level: 999, wins: -1, order: ['yok'] }, ANSWERS, () => 0.5);
  assert.equal(fixed.level, ANSWERS.length);
  assert.equal(fixed.wins, 0);
  assert.equal(fixed.order.length, ANSWERS.length);
  assert.deepEqual([...fixed.order].sort(), [...ANSWERS].sort());
  const order = [...ANSWERS].reverse();
  assert.deepEqual(normalizeSeries({ level: 3, order }, ANSWERS).order, order);
  assert.equal(normalizeSeries({}, ANSWERS).level, 1);
});

test('antrenman havuzu yalnız bilinen cevapları, tekrarsız tutar', () => {
  assert.deepEqual(normalizePool([ANSWERS[0], ANSWERS[0], 'yokta'], ANSWERS), [ANSWERS[0]]);
  assert.deepEqual(normalizePool('x', ANSWERS), []);
});

test('depolama: bozuk kayıt yedek değere düşer, yazma hatası oyunu bozmaz', () => {
  const broken = { getItem: () => '{bozuk', setItem: () => { throw new Error('kota'); } };
  assert.deepEqual(readJson(broken, 'k', { ok: 1 }), { ok: 1 });
  assert.equal(writeJson(broken, 'k', { a: 1 }), false);
  const fine = new Map();
  const storage = { getItem: key => fine.get(key) ?? null, setItem: (key, value) => fine.set(key, value) };
  assert.equal(readJson(storage, 'yok', 'y'), 'y');
  assert.equal(writeJson(storage, 'k', { a: 1 }), true);
  assert.deepEqual(readJson(storage, 'k'), { a: 1 });
  const throwing = { getItem: () => { throw new Error('erişim yok'); } };
  assert.equal(readJson(throwing, 'k', 7), 7);
});
