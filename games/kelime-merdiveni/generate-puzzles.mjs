// Harfle'nin kabul sözlüğünden, yalnızca herkesin tanıdığı kelimelerle kurulan 120 çözümlü bulmaca üretir.
// Basamaklar yaygin.mjs'teki kelimelerden kurulur; en kısa yol ise TAM sözlüğe göre doğrulanır (oyuncu her sözlük
// kelimesini yazabilir, bu yüzden "en kısa" iddiası sözlüğün tamamına karşı doğru olmalı).
import { readFile, writeFile } from 'node:fs/promises';
import { buildPuzzleSet, prepareDictionary, validatePuzzle } from './logic.js';
import { isBlocked } from '../harfane/engellenen.mjs';
import { COMMON_WORDS, WELL_KNOWN_WORDS } from './yaygin.mjs';

const source = await readFile(new URL('../harfane/kelimeler.js', import.meta.url), 'utf8');
const sections = [...source.matchAll(/window\.HARFANE_(ANSWERS|WORDS)\s*=\s*\[([\s\S]*?)\];/g)];
const lists = Object.fromEntries(sections.map(([, name, body]) => [name, [...body.matchAll(/"([^"\r\n]+)"/g)].map(([, word]) => word)]));
if (!lists.WORDS || !lists.ANSWERS) throw new Error('Harfle kelime listeleri okunamadı.');
const full = new Set(prepareDictionary(lists.WORDS.filter(word => !isBlocked(word))));
const allowed = [...new Set([...COMMON_WORDS, ...WELL_KNOWN_WORDS, ...lists.ANSWERS])].filter(word => full.has(word));
const common = new Set([...COMMON_WORDS, ...lists.ANSWERS]);

const candidates = buildPuzzleSet(allowed, 4000, [...common]).filter(puzzle => validatePuzzle(puzzle, full).valid);
// Her adım sayısında yaygın kelime oranı yüksek olanlar önce gelir; hedef dağılım kolaydan zora.
const share = puzzle => puzzle.path.filter(word => common.has(word)).length / puzzle.path.length;
const QUOTA = { 3: 20, 4: 24, 5: 30, 6: 28, 7: 18 };
const puzzles = [];
// Çeşitlilik: bir kelime en çok MAX_USE bulmacada geçer; böylece aynı küçük kelime kümesi tekrar tekrar dönmez.
const MAX_USE = 9;
const used = new Map();
for (const [steps, count] of Object.entries(QUOTA)) {
  const pool = candidates.filter(puzzle => puzzle.path.length - 1 === Number(steps)).sort((a, b) => share(b) - share(a) || a.id - b.id);
  const picked = [];
  for (const puzzle of pool) {
    if (picked.length === count) break;
    if (puzzle.path.some(word => (used.get(word) || 0) >= MAX_USE)) continue;
    picked.push(puzzle);
    puzzle.path.forEach(word => used.set(word, (used.get(word) || 0) + 1));
  }
  // Sınır yüzünden eksik kalırsa (uzun bulmacalar azdır) kalanlardan en iyileri sınırsız tamamlanır.
  for (const puzzle of pool) {
    if (picked.length === count) break;
    if (picked.includes(puzzle)) continue;
    picked.push(puzzle);
    puzzle.path.forEach(word => used.set(word, (used.get(word) || 0) + 1));
  }
  if (picked.length < count) throw new Error(`${steps} adımlı yeterli bulmaca yok (${picked.length}/${count}).`);
  puzzles.push(...picked);
}
if (puzzles.length !== 120) throw new Error(`120 yerine ${puzzles.length} bulmaca üretildi.`);
// Günlük sıra: zor ve kolay karışık, her seferinde aynı (id'ye göre karma).
puzzles.sort((a, b) => ((a.id * 2654435761) >>> 0) - ((b.id * 2654435761) >>> 0));
const output = `// Yaygın kelimelerle kurulmuş, en kısa yolları tam sözlükte doğrulanmış günlük merdivenler.\nexport const PUZZLES = ${JSON.stringify(puzzles)};\n`;
await writeFile(new URL('./puzzles.js', import.meta.url), output);
const mean = puzzles.reduce((sum, puzzle) => sum + share(puzzle), 0) / puzzles.length;
console.log(`${puzzles.length} bulmaca doğrulandı; ortalama yaygın kelime oranı ${(mean * 100).toFixed(0)}%.`);
