import { db, auth } from '../../firebase-client.js?v=balon14';
import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { createGame, playMove } from './logic.js?v=balon14';

const CODES = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const roomRef = code => doc(db, 'rooms', code);
const makeCode = () => Array.from({ length: 6 }, () => CODES[Math.floor(Math.random() * CODES.length)]).join('');

export async function createRoom() {
  const user = auth.currentUser;
  if (!user) throw new Error('Online oda için önce hesabına giriş yap.');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeCode(); const ref = roomRef(code);
    if ((await getDoc(ref)).exists()) continue;
    const data = { gameId: 'dort-tas', code, hostUid: user.uid, guestUid: '', status: 'waiting', state: null,
      turn: 0, version: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    try { await setDoc(ref, data); return { code, seat: 0 }; } catch (error) { if (error?.code !== 'permission-denied') throw error; }
  }
  throw new Error('Oda kodu oluşturulamadı. Birazdan tekrar dene.');
}

export async function joinRoom(codeValue) {
  const user = auth.currentUser;
  if (!user) throw new Error('Online odaya katılmak için önce hesabına giriş yap.');
  const code = String(codeValue || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Oda kodu 6 karakter olmalı.');
  await runTransaction(db, async transaction => {
    const ref = roomRef(code); const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Bu kodla açık oda bulunamadı.');
    const room = snapshot.data();
    if (room.status !== 'waiting' || room.guestUid) throw new Error('Bu oda dolu veya oyun başlamış.');
    if (room.hostUid === user.uid) throw new Error('Kendi odana başka bir hesapla katıl.');
    transaction.update(ref, { guestUid: user.uid, status: 'playing', state: createGame({ mode: 'online' }), turn: 0,
      version: room.version + 1, updatedAt: serverTimestamp() });
  });
  return { code, seat: 1 };
}

export function watchRoom(code, callback, onError) {
  return onSnapshot(roomRef(code), snapshot => {
    if (!snapshot.exists()) { onError?.(new Error('Oda artık bulunamıyor.')); return; }
    callback(snapshot.data());
  }, onError);
}

export async function playRoomMove(code, seat, column, expectedVersion) {
  const user = auth.currentUser;
  if (!user) throw new Error('Oyun bağlantısı kesildi. Tekrar giriş yap.');
  return runTransaction(db, async transaction => {
    const ref = roomRef(code); const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Oda artık bulunamıyor.');
    const room = snapshot.data();
    if (room.status !== 'playing' || room.version !== expectedVersion) throw new Error('Tahta güncellendi; son durumu açtım.');
    const actualSeat = room.hostUid === user.uid ? 0 : room.guestUid === user.uid ? 1 : -1;
    if (actualSeat !== seat || room.turn !== seat) throw new Error('Bu hamle rakibinin sırası.');
    const state = playMove(room.state, column, seat);
    if (!state) throw new Error('Bu sütuna taş bırakılamıyor.');
    transaction.update(ref, { state, turn: state.current, status: state.status === 'playing' ? 'playing' : 'complete',
      version: room.version + 1, updatedAt: serverTimestamp() });
    return state;
  });
}
