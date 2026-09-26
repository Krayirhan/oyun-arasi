// Sitedeki yerel JS/CSS referanslarını bulur. Hem `npm run bump` hem de sürüm testi kullanır.
// Cloudflare JS/CSS dosyalarını saatlerce önbellekte tutar, HTML'i tutmaz. Her referansın aynı
// ?v= sürümünü taşıması, bir yayından sonra eski ve yeni dosyaların karışmasını engeller.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', 'tests', 'scripts', '.git', '.github', '.claude', '.codex-remote-attachments', '.firebase']);

// HTML: src="..js" / href="..css" (yerel adresler; http, // ve data: hariç)
export const HTML_REF = /\b(src|href)=(["'])((?!https?:|\/\/|data:|#)[^"'?#\s]+\.(?:js|css))(?:\?v=([^"'#]*))?\2/g;
// JS: import ... from './x.js' ve import('./x.js')
export const JS_REF = /(\bfrom\s+|\bimport\(\s*)(["'])(\.{1,2}\/[^"'?#\s]+\.js)(?:\?v=([^"'#]*))?\2/g;

export function siteFiles(dir = ROOT) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...siteFiles(path));
    else if (/\.(html|js)$/.test(entry.name)) files.push(path);
  }
  return files;
}

export function refsIn(path) {
  const text = readFileSync(path, 'utf8');
  const pattern = path.endsWith('.html') ? HTML_REF : JS_REF;
  return [...text.matchAll(pattern)].map(match => ({
    file: relative(ROOT, path).split(sep).join('/'),
    target: match[3],
    version: match[4] ?? null
  }));
}
