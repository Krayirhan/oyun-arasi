import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  EmailAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { decodeState, encodeState } from './firestore-codec.js';

const existingApp = getApps().find(candidate => candidate.name === '[DEFAULT]');
export const app = existingApp || initializeApp(firebaseConfig);

// App Check: site anahtarı firebase-config.js'e girilince açılır. Anahtar boşsa atlanır.
if (!existingApp && firebaseConfig.appCheckSiteKey && !useEmulator()) {
  try {
    const { initializeAppCheck, ReCaptchaV3Provider } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-check.js');
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(firebaseConfig.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  } catch {
    // App Check yüklenemezse oyunlar yine çalışır; zorunlu kılındıysa bulut kaydı reddedilir.
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app);
auth.languageCode = 'tr';

// Yerel geliştirme: localhost'ta ?emulator=1 ile açılınca Auth ve Firestore emülatörlerine bağlanır.
if (!existingApp && useEmulator()) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

function useEmulator() {
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) return false;
  try {
    if (new URLSearchParams(location.search).has('emulator')) sessionStorage.setItem('oyunarasi-emulator', '1');
    return sessionStorage.getItem('oyunarasi-emulator') === '1';
  } catch {
    return false;
  }
}

const EMPTY_BY_LEVEL = { easy: { bestMs: null }, medium: { bestMs: null }, hard: { bestMs: null } };

export const EMPTY_GAME_STATS = Object.freeze({
  '2048': { bestScore: 0, wins: 0 },
  harfane: {
    daily: { played: 0, wins: 0, streak: 0, best: 0, distribution: [0, 0, 0, 0, 0, 0], lastPlayedDate: '' },
    sefer: { level: 1, wins: 0, best: 0, completed: false, completedRuns: 0 }
  },
  xox: { rounds: 0, xWins: 0, oWins: 0, draws: 0 },
  hafiza: {
    classic: { bestMs: null, bestMoves: null },
    expanded: { bestMs: null, bestMoves: null }
  },
  'mayin-tarlasi': { wins: 0, ...EMPTY_BY_LEVEL },
  sudoku: EMPTY_BY_LEVEL,
  sekil: { bestScore: 0 },
  'kelime-avi': EMPTY_BY_LEVEL,
  tetris: { bestScore: 0, bestLines: 0 },
  soliter: { wins: 0, draw1: null, draw3: null },
  mahjong: EMPTY_BY_LEVEL,
  araba: { bestScore: 0, bestDistance: 0 }
});

// Profil belgesine oturum başına bir kez dokunulur (1 okuma + 1 yazma). Eksik oyunların
// başlangıç istatistikleri o sırada tamamlanır.
const profileTouches = new Map();

export function saveProfile(user) {
  if (!user) return Promise.resolve();
  if (!profileTouches.has(user.uid)) {
    const touch = touchProfile(user).catch(error => {
      profileTouches.delete(user.uid);
      throw error;
    });
    profileTouches.set(user.uid, touch);
  }
  return profileTouches.get(user.uid);
}

async function touchProfile(user) {
  const profileRef = doc(db, 'users', user.uid);
  const existing = await getDoc(profileRef);
  const currentStats = existing.data()?.gameStats || {};
  const missingStats = Object.fromEntries(Object.entries(EMPTY_GAME_STATS).filter(([gameId]) => !(gameId in currentStats)));
  await setDoc(profileRef, {
    schemaVersion: 2,
    email: user.email || '',
    displayName: user.displayName || '',
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
    lastSeenAt: serverTimestamp(),
    ...(Object.keys(missingStats).length ? { gameStats: missingStats } : {})
  }, { merge: true });
}

export async function signUp(email, password, displayName) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(result.user, { displayName });
  await saveProfile(result.user);
  sendEmailVerification(result.user).catch(() => {});
  return result.user;
}

export async function signIn(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  await saveProfile(result.user);
  return result;
}

export async function signOutUser() {
  await flushAllSyncs();
  return signOut(auth);
}

// Hesabın var olup olmadığını belli etmemek için "kullanıcı yok" hatası başarı gibi sayılır.
export async function sendPasswordReset(email) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }
}

export function resendVerification() {
  if (!auth.currentUser) return Promise.resolve();
  return sendEmailVerification(auth.currentUser);
}

let deletingAccount = false;

// Hesap silme: şifreyle yeniden doğrulama, tüm oyun belgeleri, profil ve auth kullanıcısı.
export async function deleteAccount(password) {
  const user = auth.currentUser;
  if (!user) return;
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  deletingAccount = true;
  try {
    cancelAllSyncs();
    const games = await getDocs(collection(db, 'users', user.uid, 'games'));
    await Promise.all(games.docs.map(entry => deleteDoc(entry.ref)));
    await deleteDoc(doc(db, 'users', user.uid));
    clearSyncMeta(user.uid);
    profileTouches.delete(user.uid);
    await deleteUser(user);
  } finally {
    deletingAccount = false;
  }
}

export function listenToAuth(callback) {
  return onAuthStateChanged(auth, user => {
    if (user) saveProfile(user).catch(() => {});
    callback(user);
  });
}

export async function loadGame(user, gameId) {
  if (!user) return null;
  const snapshot = await getDoc(doc(db, 'users', user.uid, 'games', gameId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return { ...data, state: decodeState(data.state) };
}

// Oyun belgesi tek yazmayla kaydedilir; profil istatistiği yalnızca değiştiyse güncellenir.
export async function saveGame(user, gameId, state, stats = {}, extra = {}) {
  if (!user || deletingAccount) return;
  await saveProfile(user);
  await setDoc(doc(db, 'users', user.uid, 'games', gameId), {
    gameId, schemaVersion: 1, state: encodeState(state), stats: encodeState(stats), updatedAt: serverTimestamp(), ...extra
  });
}

export function saveProfileStats(user, gameId, stats) {
  if (!user || deletingAccount) return Promise.resolve();
  return updateDoc(doc(db, 'users', user.uid), { [`gameStats.${gameId}`]: stats, lastSeenAt: serverTimestamp() });
}

// ---- Cihaz ve senkron bilgisi ----------------------------------------------------------

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function deviceId() {
  let id = readJson('oyunarasi-device-id', null);
  if (typeof id !== 'string' || !id) {
    id = (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).slice(0, 36);
    writeJson('oyunarasi-device-id', id);
  }
  return id;
}

const syncMetaKey = (uid, gameId) => `oyunarasi-sync-${uid}-${gameId}`;

function clearSyncMeta(uid) {
  try {
    Object.keys(localStorage).filter(key => key.startsWith(`oyunarasi-sync-${uid}-`)).forEach(key => localStorage.removeItem(key));
  } catch {}
}

function hashState(value) {
  const text = JSON.stringify(value) ?? '';
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  return `${text.length}:${hash >>> 0}`;
}

function addCounters(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (Number.isFinite(value)) target[key] = (target[key] || 0) + value;
  }
  return target;
}

// ---- Oyun senkronu ---------------------------------------------------------------------

const SAVE_DELAY_MS = 5000;
const SAVE_MAX_WAIT_MS = 30000;
const activeSyncs = new Set();

function flushAllSyncs() { return Promise.all([...activeSyncs].map(sync => sync.flush())); }
function cancelAllSyncs() { activeSyncs.forEach(sync => sync.cancel()); }

window.addEventListener('pagehide', flushAllSyncs);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushAllSyncs(); });

/*
 * options:
 *   read(), write(state), isValid(state), merge(a, b) → b'nin aktif oyunu + birleşik rekorlar,
 *   getStats(state), counters(state) → { ad: sayı } (cihaz bazında toplanır),
 *   isCheckpoint(state) → true ise hemen kaydedilir, onStatus(mesaj)
 */
export function syncGameOnAccountChange(gameId, options) {
  const device = deviceId();
  let user = null;
  let meta = null;
  let otherDevices = {};
  let pendingState = null;
  let firstPendingAt = 0;
  let saveTimer = 0;
  let generation = 0;
  let lastStatsSerialized = '';
  let lastCountersSerialized = '';
  let active = true;

  const countersOf = state => {
    try { return options.counters?.(state) || {}; } catch { return {}; }
  };
  const persistMeta = () => { if (user && meta) writeJson(syncMetaKey(user.uid, gameId), meta); };

  function loadMeta(uid) {
    const stored = readJson(syncMetaKey(uid, gameId), null);
    if (stored && typeof stored === 'object') return stored;
    // İlk kez: cihazdaki mevcut durum "değişmemiş" sayılır, böylece hesapta kayıt varsa o yüklenir.
    return { localHash: hashState(options.read()), localUpdatedAt: 0, lastSyncedAt: null, deviceCounters: {}, baseline: countersOf(options.read()) };
  }

  // Oyun kendi hamlesiyle ilerlediğinde sayaç artışları bu cihazın sayacına eklenir.
  function trackLocalChange(state) {
    const hash = hashState(state);
    if (hash === meta.localHash) return false;
    meta.localHash = hash;
    meta.localUpdatedAt = Date.now();
    const current = countersOf(state);
    for (const [key, value] of Object.entries(current)) {
      const delta = value - (meta.baseline?.[key] ?? value);
      if (delta > 0) meta.deviceCounters[key] = (meta.deviceCounters[key] || 0) + delta;
    }
    meta.baseline = current;
    persistMeta();
    return true;
  }

  // Dışarıdan gelen (birleştirilmiş) durumu oyuna yazmadan önce çağrılır; böylece oyun bu
  // durumu kaydederken skor farkları bu cihazın sayacına eklenmez.
  function adoptState(state, updatedAt, syncedAt = meta.lastSyncedAt) {
    meta.localHash = hashState(state);
    meta.localUpdatedAt = updatedAt;
    meta.lastSyncedAt = syncedAt;
    meta.baseline = countersOf(state);
    persistMeta();
  }

  function statsFor(state) {
    return { ...(options.getStats?.(state) || {}), ...(options.counters ? counterTotals(state) : {}) };
  }

  function counterTotals(state) {
    const totals = Object.fromEntries(Object.keys(countersOf(state)).map(name => [name, 0]));
    Object.values(otherDevices).forEach(values => addCounters(totals, values));
    return addCounters(totals, meta.deviceCounters);
  }

  const unsubscribe = listenToAuth(async nextUser => {
    if (user && pendingState) await flush();
    user = nextUser;
    generation += 1;
    const current = generation;
    pendingState = null;
    otherDevices = {};
    lastStatsSerialized = '';
    lastCountersSerialized = '';
    if (!user) { meta = null; options.onStatus?.('Oyun bu cihazda saklanıyor.'); return; }
    meta = loadMeta(user.uid);
    options.onStatus?.('Hesap kayıtları kontrol ediliyor…');
    try {
      const remote = await loadGame(user, gameId);
      if (!active || current !== generation) return;
      const local = options.read();
      trackLocalChange(local);
      const remoteValid = remote && options.isValid(remote.state);
      otherDevices = Object.fromEntries(Object.entries(remote?.deviceCounters || {}).filter(([id]) => id !== device));
      // Cihaz sayaçlarından önceki kayıtlar: eski toplamlar bir kez "legacy" olarak korunur.
      if (options.counters && remote && !remote.deviceCounters) {
        const names = Object.keys(countersOf(local));
        const legacy = Object.fromEntries(names.filter(name => Number.isFinite(remote.stats?.[name])).map(name => [name, remote.stats[name]]));
        if (Object.keys(legacy).length) otherDevices.legacy = legacy;
      }
      if (remoteValid) {
        const remoteAt = Number.isFinite(remote.clientUpdatedAt) ? remote.clientUpdatedAt : 0;
        const remoteChanged = remoteAt !== meta.lastSyncedAt;
        const localChanged = meta.localUpdatedAt > (meta.lastSyncedAt ?? 0);
        const preferLocal = localChanged && (!remoteChanged || meta.localUpdatedAt > remoteAt);
        if (preferLocal) {
          const merged = options.merge ? options.merge(remote.state, local) : local;
          adoptState(merged, Date.now());
          if (hashState(merged) !== hashState(local)) options.write(merged);
          options.onStatus?.('Bu cihazdaki oyun hesabına kaydediliyor…');
          queueSave(options.read(), true);
        } else if (remoteChanged || localChanged) {
          const merged = options.merge ? options.merge(local, remote.state) : remote.state;
          const needsUpload = hashState(merged) !== hashState(remote.state);
          adoptState(merged, needsUpload ? Date.now() : remoteAt, remoteAt);
          options.write(merged);
          options.onStatus?.('Oyun hesabınla eşitlendi.');
          if (needsUpload) queueSave(options.read(), true);
        } else {
          options.onStatus?.('Oyun hesabınla eşitlendi.');
        }
      } else {
        options.onStatus?.('Oyun hesabına kaydediliyor…');
        if (!meta.localUpdatedAt) { meta.localUpdatedAt = Date.now(); persistMeta(); }
        queueSave(local, true);
      }
    } catch {
      if (active && current === generation) options.onStatus?.('Bulut okunamadı; cihaz kaydı kullanılmaya devam ediyor.');
    }
  });

  function queueSave(state, immediate = false) {
    if (!user || !meta) return;
    pendingState = state;
    if (!firstPendingAt) firstPendingAt = Date.now();
    window.clearTimeout(saveTimer);
    // Sayaç değiştiyse (tur ya da oyun kazanıldı) beklemeden kaydedilir. Rekorlar sık değişebildiği
    // için (2048'de her hamle) normal aralıkla ve sayfadan çıkarken kaydedilir.
    const checkpoint = (() => {
      try { return Boolean(options.isCheckpoint?.(state)) || (options.counters && JSON.stringify(meta.deviceCounters) !== lastCountersSerialized); } catch { return false; }
    })();
    if (immediate || checkpoint) { flush(); return; }
    const wait = Math.max(0, Math.min(SAVE_DELAY_MS, firstPendingAt + SAVE_MAX_WAIT_MS - Date.now()));
    saveTimer = window.setTimeout(flush, wait);
  }

  function scheduleSave(state = options.read()) {
    if (!user || !meta) return;
    if (!trackLocalChange(state) && !pendingState) return;
    queueSave(state);
  }

  async function flush() {
    window.clearTimeout(saveTimer);
    if (!user || !meta || !pendingState) return;
    const state = pendingState;
    const targetUser = user;
    const targetGeneration = generation;
    pendingState = null;
    firstPendingAt = 0;
    const clientUpdatedAt = meta.localUpdatedAt || Date.now();
    lastCountersSerialized = JSON.stringify(meta.deviceCounters);
    const deviceCounters = { ...otherDevices, [device]: { ...meta.deviceCounters } };
    const stats = statsFor(state);
    try {
      await saveGame(targetUser, gameId, state, stats, { clientUpdatedAt, ...(options.counters ? { deviceCounters } : {}) });
      const statsSerialized = JSON.stringify(stats);
      if (Object.keys(stats).length && statsSerialized !== lastStatsSerialized) {
        await saveProfileStats(targetUser, gameId, stats);
        lastStatsSerialized = statsSerialized;
      }
      if (active && targetGeneration === generation) {
        meta.lastSyncedAt = clientUpdatedAt;
        persistMeta();
        options.onStatus?.('Oyun hesabınla eşitlendi.');
      }
    } catch {
      if (active && targetGeneration === generation) {
        pendingState ||= state;
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(flush, SAVE_MAX_WAIT_MS);
        options.onStatus?.('Buluta kaydedilemedi; cihaz kaydı korunuyor.');
      }
    }
  }

  const sync = {
    flush,
    cancel() { window.clearTimeout(saveTimer); pendingState = null; firstPendingAt = 0; }
  };
  activeSyncs.add(sync);

  return {
    save: scheduleSave,
    flush,
    destroy() { active = false; activeSyncs.delete(sync); unsubscribe(); window.clearTimeout(saveTimer); }
  };
}

export const platformFirebase = {
  app, auth, db, saveProfile, signUp, signIn, signOut: signOutUser,
  sendPasswordReset, resendVerification, deleteAccount,
  onAuthStateChanged: listenToAuth, loadGame, saveGame
};

window.oyunArasiFirebase = platformFirebase;
