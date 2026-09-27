// Firestore kurallarının testleri. Emülatöre karşı çalışır:
//   npm test
// (firebase emulators:exec içinde FIRESTORE_EMULATOR_HOST tanımlıdır.)
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, setLogLevel, updateDoc
} from 'firebase/firestore';

setLogLevel('silent'); // Beklenen izin reddi hatalarını günlüğe basmasın.

const PLATFORM_GAMES = ['2048', 'xox', 'hafiza', 'mayin-tarlasi', 'sudoku', 'sekil', 'kelime-avi', 'kelime-merdiveni', 'balon-patlat', 'tetris', 'soliter', 'mahjong', 'araba', 'platform-macera', 'tavla', 'okey', 'pisti', 'dort-tas'];
const STAT_KEYS = ['2048', 'harfane', 'xox', 'hafiza', 'mayin-tarlasi', 'sudoku', 'sekil', 'kelime-avi', 'kelime-merdiveni', 'balon-patlat', 'tetris', 'soliter', 'mahjong', 'araba', 'platform-macera', 'tavla', 'okey', 'pisti', 'dort-tas'];

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-oyun-arasi',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') }
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const as = uid => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

function profile(overrides = {}) {
  return {
    schemaVersion: 2,
    email: 'oyuncu@example.com',
    displayName: 'Oyuncu',
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    gameStats: Object.fromEntries(STAT_KEYS.map(key => [key, {}])),
    ...overrides
  };
}

function platformGame(gameId, overrides = {}) {
  return { gameId, schemaVersion: 1, state: { score: 10 }, stats: { bestScore: 10 }, updatedAt: serverTimestamp(), ...overrides };
}

async function seed(path, data) {
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), path), data));
}

describe('profil', () => {
  test('kendi profilini oluşturur, okur, günceller ve siler', async () => {
    const db = as('alice');
    const ref = doc(db, 'users/alice');
    await assertSucceeds(setDoc(ref, profile()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { 'gameStats.sudoku': { easy: { bestMs: 90000 } }, lastSeenAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(ref));
  });

  test('başkasının profilini okuyamaz, yazamaz, silemez', async () => {
    await seed('users/bob', profile());
    const db = as('alice');
    await assertFails(getDoc(doc(db, 'users/bob')));
    await assertFails(setDoc(doc(db, 'users/bob'), profile()));
    await assertFails(deleteDoc(doc(db, 'users/bob')));
  });

  test('girişsiz kullanıcı hiçbir şeye erişemez', async () => {
    await seed('users/bob', profile());
    await assertFails(getDoc(doc(anon(), 'users/bob')));
    await assertFails(setDoc(doc(anon(), 'users/bob'), profile()));
  });

  test('geçersiz profil şemasını reddeder', async () => {
    const ref = doc(as('alice'), 'users/alice');
    await assertFails(setDoc(ref, profile({ schemaVersion: 1 })));
    await assertFails(setDoc(ref, profile({ admin: true })));
    await assertFails(setDoc(ref, profile({ displayName: 'x'.repeat(81) })));
    await assertFails(setDoc(ref, profile({ gameStats: { bilinmeyen: {} } })));
  });

  test('bilinmeyen oyunun istatistiğini alan yoluyla yazamaz', async () => {
    await seed('users/alice', profile());
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { 'gameStats.poker': { wins: 1 } }));
  });
});

describe('favoriler ve son oynananlar', () => {
  const library = { favorites: ['sudoku', 'xox'], favoritesUpdatedAt: 1790000000000, recent: [{ id: 'xox', at: 1790000000000 }] };

  test('kendi profilinde library alanını yazar', async () => {
    await seed('users/alice', profile());
    await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { library, lastSeenAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as('bob'), 'users/bob'), profile({ library })));
  });

  test('12 öğeden fazlasını ve yanlış tipleri reddeder', async () => {
    await seed('users/alice', profile());
    const ref = doc(as('alice'), 'users/alice');
    const many = Array.from({ length: 13 }, (_, index) => `oyun-${index}`);
    await assertFails(updateDoc(ref, { library: { ...library, favorites: many } }));
    await assertFails(updateDoc(ref, { library: { ...library, recent: many.map(id => ({ id, at: 1 })) } }));
    await assertFails(updateDoc(ref, { library: { ...library, favoritesUpdatedAt: 'dün' } }));
    await assertFails(updateDoc(ref, { library: { ...library, hile: true } }));
    await assertFails(updateDoc(ref, { library: 'favoriler' }));
  });

  test('başkasının library alanını yazamaz', async () => {
    await seed('users/bob', profile());
    await assertFails(updateDoc(doc(as('alice'), 'users/bob'), { library }));
  });
});

describe('platform oyunları', () => {
  for (const gameId of PLATFORM_GAMES) {
    test(`${gameId}: kendi belgesini yazar ve okur`, async () => {
      const ref = doc(as('alice'), `users/alice/games/${gameId}`);
      await assertSucceeds(setDoc(ref, platformGame(gameId)));
      await assertSucceeds(getDoc(ref));
    });
  }

  test('cihaz sayaçları ve istemci zamanı kabul edilir', async () => {
    const ref = doc(as('alice'), 'users/alice/games/xox');
    await assertSucceeds(setDoc(ref, platformGame('xox', {
      clientUpdatedAt: Date.now(),
      deviceCounters: { 'cihaz-a': { rounds: 3 }, 'cihaz-b': { rounds: 2 } }
    })));
  });

  test('bilinmeyen oyun kimliğini reddeder', async () => {
    await assertFails(setDoc(doc(as('alice'), 'users/alice/games/poker'), platformGame('poker')));
  });

  test('geçersiz oyun belgesini reddeder', async () => {
    const ref = doc(as('alice'), 'users/alice/games/2048');
    await assertFails(setDoc(ref, platformGame('xox')));
    await assertFails(setDoc(ref, platformGame('2048', { schemaVersion: 2 })));
    await assertFails(setDoc(ref, platformGame('2048', { hile: true })));
    await assertFails(setDoc(ref, platformGame('2048', { clientUpdatedAt: 'dün' })));
    const bigState = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`k${index}`, index]));
    await assertFails(setDoc(ref, platformGame('2048', { state: bigState })));
    const manyDevices = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`d${index}`, {}]));
    await assertFails(setDoc(ref, platformGame('2048', { deviceCounters: manyDevices })));
  });

  test('başkasının oyun belgesine erişemez', async () => {
    await seed('users/bob/games/2048', platformGame('2048'));
    const db = as('alice');
    await assertFails(getDoc(doc(db, 'users/bob/games/2048')));
    await assertFails(setDoc(doc(db, 'users/bob/games/2048'), platformGame('2048')));
    await assertFails(deleteDoc(doc(db, 'users/bob/games/2048')));
    await assertFails(getDocs(collection(db, 'users/bob/games')));
  });

  test('kendi oyun belgelerini listeler ve siler', async () => {
    await seed('users/alice/games/2048', platformGame('2048'));
    await seed('users/alice/games/daily-2026-09-26', { date: '2026-09-26', mode: 'daily', guesses: [] });
    const db = as('alice');
    const snapshot = await assertSucceeds(getDocs(collection(db, 'users/alice/games')));
    for (const entry of snapshot.docs) await assertSucceeds(deleteDoc(entry.ref));
  });
});

describe('Dört Taş online odaları', () => {
  const openRoom = { gameId: 'dort-tas', code: 'AB2345', hostUid: 'alice', guestUid: '', status: 'waiting', state: null,
    turn: 0, version: 0, createdAt: new Date(), updatedAt: new Date() };
  const onlineState = () => ({ board: Array(42).fill(null), current: 0, starter: 0, winner: null, winningLine: [], scores: [0, 0], draws: 0,
    status: 'playing', mode: 'online', level: 'medium', moveCount: 0 });

  test('oda sahibi kodlu bekleme odası kurar; yalnız giriş yapanlar bekleme odasını okuyabilir', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'rooms/AB2345'), openRoom));
    await assertSucceeds(getDoc(doc(as('bob'), 'rooms/AB2345')));
    await assertFails(getDoc(doc(anon(), 'rooms/AB2345')));
    await assertFails(setDoc(doc(anon(), 'rooms/XY6789'), { ...openRoom, code: 'XY6789' }));
    await assertFails(setDoc(doc(as('alice'), 'rooms/AB2345'), { ...openRoom, code: 'ZZ9999' }));
  });

  test('ikinci oyuncu açık odaya oturur; oda dolduktan sonra yeni üye alamaz', async () => {
    await seed('rooms/AB2345', openRoom);
    const ref = doc(as('bob'), 'rooms/AB2345');
    await assertSucceeds(updateDoc(ref, { guestUid: 'bob', status: 'playing', state: onlineState(), turn: 0, version: 1, updatedAt: new Date() }));
    await assertFails(updateDoc(doc(as('carol'), 'rooms/AB2345'), { guestUid: 'carol', status: 'playing', state: onlineState(), turn: 0, version: 2, updatedAt: new Date() }));
  });

  test('hamle yalnız sıradaki oda üyesince bir sürüm artırılarak eşitlenebilir', async () => {
    const state = onlineState();
    await seed('rooms/AB2345', { ...openRoom, guestUid: 'bob', status: 'playing', state, turn: 0, version: 1 });
    const after = { ...state, board: [...state.board], current: 1, moveCount: 1 };
    after.board[35] = 0;
    await assertSucceeds(updateDoc(doc(as('alice'), 'rooms/AB2345'), { state: after, turn: 1, status: 'playing', version: 2, updatedAt: new Date() }));
    await assertFails(updateDoc(doc(as('bob'), 'rooms/AB2345'), { state: { ...after, moveCount: 2 }, turn: 0, status: 'playing', version: 3, updatedAt: new Date() }));
    await assertFails(updateDoc(doc(as('bob'), 'rooms/AB2345'), { state: { ...after, moveCount: 2 }, turn: 0, status: 'playing', version: 8, updatedAt: new Date() }));
    await assertFails(getDoc(doc(as('carol'), 'rooms/AB2345')));
  });
});

describe('Harfle', () => {
  const order = Array.from({ length: 70 }, (_, index) => index);

  test('günlük bulmaca belgesi', async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(doc(db, 'users/alice/games/daily-2026-09-26'), {
      date: '2026-09-26', mode: 'daily', guesses: ['kalem'], current: '', gameOver: false, won: false, attempts: 1
    }));
    await assertFails(setDoc(doc(db, 'users/alice/games/daily-2026-09-26'), {
      date: '2026-09-25', mode: 'daily', guesses: []
    }));
    await assertFails(setDoc(doc(db, 'users/alice/games/daily-2026-09-26'), {
      date: '2026-09-26', mode: 'daily', guesses: ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    }));
  });

  test('Sefer belgesi', async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(doc(db, 'users/alice/games/series'), {
      mode: 'series', order, level: 1, guesses: [], completed: false, completedRuns: 0
    }));
    await assertFails(setDoc(doc(db, 'users/alice/games/series'), {
      mode: 'series', order: order.slice(1), level: 1, guesses: []
    }));
    await assertFails(setDoc(doc(db, 'users/alice/games/series'), {
      mode: 'series', order, level: 72, guesses: []
    }));
  });
});
