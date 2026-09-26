// `firebase deploy` öncesi çalışır (firebase.json → firestore.predeploy).
// Kurallar normalde GitHub Actions ile yayımlanır. Elle deploy ancak yerel firestore.rules
// origin/main ile birebir aynıysa devam eder; eski bir kopyanın canlıya çıkması böyle engellenir.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const fail = message => {
  console.error(`\n✖ Firestore kuralları yayımlanmadı: ${message}\n  Kurallar main dalına gelince GitHub Actions ile otomatik yayımlanır (FIREBASE_SETUP.md).\n`);
  process.exit(1);
};

try {
  execFileSync('git', ['fetch', '--quiet', 'origin', 'main'], { stdio: 'inherit' });
} catch {
  fail('origin/main alınamadı; güncel kuralları doğrulamadan yayın yapılmaz.');
}

const remote = execFileSync('git', ['show', 'origin/main:firestore.rules'], { encoding: 'utf8' });
const local = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const normalize = text => text.replace(/\r\n/g, '\n').trimEnd();
if (normalize(remote) !== normalize(local)) fail('yerel firestore.rules, origin/main sürümünden farklı.');
console.log('✔ firestore.rules origin/main ile aynı.');
