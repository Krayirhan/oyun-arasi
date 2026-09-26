// Tüm yerel JS/CSS referanslarına yeni ve ortak bir ?v= sürümü yazar.
//   npm run bump            → tarih-saat sürümü (örn. 202609261930)
//   npm run bump -- abc123  → verilen sürüm
import { readFileSync, writeFileSync } from 'node:fs';
import { HTML_REF, JS_REF, siteFiles } from './asset-refs.mjs';

const now = new Date();
const pad = value => String(value).padStart(2, '0');
const version = process.argv[2] || `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
if (!/^[\w.-]+$/.test(version)) throw new Error(`Geçersiz sürüm: ${version}`);

let changedFiles = 0;
for (const path of siteFiles()) {
  const text = readFileSync(path, 'utf8');
  const next = path.endsWith('.html')
    ? text.replace(HTML_REF, (_, attr, quote, target) => `${attr}=${quote}${target}?v=${version}${quote}`)
    : text.replace(JS_REF, (_, prefix, quote, target) => `${prefix}${quote}${target}?v=${version}${quote}`);
  if (next !== text) {
    writeFileSync(path, next);
    changedFiles += 1;
  }
}
console.log(`Sürüm ${version} yazıldı (${changedFiles} dosya).`);
