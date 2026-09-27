// Harfle'nin kabul sözlüğü ve yaygın cevaplarından 120 çözümlü bulmaca üretir.
import { readFile, writeFile } from 'node:fs/promises';
import { buildPuzzleSet, prepareDictionary, validatePuzzle } from './logic.js';

const source = await readFile(new URL('../harfane/kelimeler.js', import.meta.url), 'utf8');
const sections = [...source.matchAll(/window\.HARFANE_(ANSWERS|WORDS)\s*=\s*\[([\s\S]*?)\];/g)];
const lists = Object.fromEntries(sections.map(([, name, body]) => [name, [...body.matchAll(/"([^"\r\n]+)"/g)].map(([, word]) => word)]));
if (!lists.WORDS || !lists.ANSWERS) throw new Error('Harfle kelime listeleri okunamadı.');
const dictionary = prepareDictionary(lists.WORDS);
const puzzles = buildPuzzleSet(dictionary, 120, lists.ANSWERS);
if (puzzles.length !== 120) throw new Error(`120 yerine ${puzzles.length} bulmaca üretildi.`);
for (const puzzle of puzzles) if (!validatePuzzle(puzzle, dictionary).valid) throw new Error(`Geçersiz bulmaca: ${puzzle.id}`);
const output = `// Harfle'nin Türkçe sözlüğünden önceden üretilmiş, en kısa yolları doğrulanmış günlük merdivenler.\nexport const PUZZLES = ${JSON.stringify(puzzles)};\n`;
await writeFile(new URL('./puzzles.js', import.meta.url), output);
console.log(`${puzzles.length} bulmaca doğrulandı.`);
