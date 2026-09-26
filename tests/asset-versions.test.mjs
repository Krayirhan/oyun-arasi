// Her yerel JS/CSS referansı aynı ?v= sürümünü taşımalı. Eksik ya da farklı sürüm, yayından sonra
// tarayıcının eski ve yeni dosyaları karıştırmasına yol açar (örn. Harfle'de SyntaxError).
// Düzeltmek için: npm run bump
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refsIn, siteFiles } from '../scripts/asset-refs.mjs';

const refs = siteFiles().flatMap(refsIn);

test('sitede taranacak referanslar bulunuyor', () => {
  assert.ok(refs.length > 50, `yalnızca ${refs.length} referans bulundu`);
  assert.ok(refs.some(ref => ref.target.endsWith('cloud-sync.js')));
  assert.ok(refs.some(ref => ref.target.endsWith('firebase-client.js')));
});

test('her yerel JS/CSS referansının sürüm eki var', () => {
  const missing = refs.filter(ref => !ref.version).map(ref => `${ref.file} → ${ref.target}`);
  assert.deepEqual(missing, [], 'sürüm eki olmayan referanslar (npm run bump)');
});

test('tüm referanslar aynı sürümü kullanıyor', () => {
  const versions = [...new Set(refs.map(ref => ref.version))];
  assert.equal(versions.length, 1, `birden fazla sürüm var: ${versions.join(', ')} (npm run bump)`);
});
