import { createGame, playMove, botMove, newRound, isValidGame, landingRow, winningLine, COLS, ROWS } from './logic.js?v=mantik2';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=mantik2';
import { confirmDialog } from '../../game-dialog.js?v=mantik2';
import { createFlow, botDelay } from '../../game-flow.js?v=mantik2';

const $ = selector => document.querySelector(selector);
const KEY = 'oyunarasi-dort-tas-v1';
const flow = createFlow({ menu: $('#menu-screen'), game: $('#game-screen'), result: $('#result-screen') });
const blank = () => ({ game: null, mode: 'bot', level: 'medium', room: null, records: { wins: 0, draws: 0, botWins: 0, hardWins: 0, localWins: 0 } });
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    const defaults = blank();
    return { ...blank(), ...(data || {}), game: isValidGame(data?.game) ? data.game : null,
      mode: ['bot', 'local', 'online'].includes(data?.mode) ? data.mode : defaults.mode,
      level: ['easy', 'medium', 'hard'].includes(data?.level) ? data.level : defaults.level,
      records: Object.fromEntries(Object.keys(defaults.records).map(key => [key, Math.max(0, Math.floor(Number(data?.records?.[key]) || 0))])) };
  } catch { return blank(); }
}

let saved = load();
let game = saved.game;
let selectedMode = saved.mode;
let selectedLevel = saved.level;
let cancelBot = () => {};
let focusedColumn = 3;
let botRunning = false;
let roomStatus = 'waiting';
let roomVersion = -1;
let stopWatchingRoom = null;

function persist() {
  saved.game = game?.mode === 'online' ? null : game;
  try { localStorage.setItem(KEY, JSON.stringify(saved)); }
  catch { $('#save-state').textContent = 'Kayıt yapılamadı; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save({ ...saved, room: null });
}

function names() {
  if (game.mode === 'local') return ['Oyuncu 1', 'Oyuncu 2'];
  if (game.mode === 'online') return saved.room?.seat === 1 ? ['Rakip', 'Sen'] : ['Sen', 'Rakip'];
  return ['Sen', 'Bot'];
}

function updateLabels() {
  const [a, b] = game ? names() : (selectedMode === 'local' ? ['Oyuncu 1', 'Oyuncu 2'] : selectedMode === 'online' ? ['Sen', 'Rakip'] : ['Sen', 'Bot']);
  $('#score-a-label').textContent = a.toLocaleUpperCase('tr-TR');
  $('#score-b-label').textContent = b.toLocaleUpperCase('tr-TR');
  $('#legend-a').textContent = a;
  $('#legend-b').textContent = b;
}

function updateContinue() {
  const card = $('#continue-card');
  if (saved.room) {
    card.hidden = false; card.querySelector('strong').textContent = 'Online odaya dön';
    $('#continue-copy').textContent = `${saved.room.code} kodlu odaya yeniden bağlan`;
    return;
  }
  if (!game || game.status === 'won' || game.status === 'draw') { card.hidden = true; return; }
  card.hidden = false;
  const [a, b] = names();
  $('#continue-copy').textContent = `${a} ${game.scores[0]} – ${b} ${game.scores[1]} · Kaldığın yerden`;
}

function recordResult(before, after) {
  if (before.status !== 'playing' || !['won', 'draw'].includes(after.status)) return;
  if (after.status === 'draw') saved.records.draws += 1;
  else if (after.winner === (after.mode === 'online' ? saved.room?.seat : 0)) {
    saved.records.wins += 1;
    if (after.mode === 'local') saved.records.localWins += 1;
    if (after.mode === 'bot') {
      saved.records.botWins += 1;
      if (after.level === 'hard') saved.records.hardWins += 1;
    }
  }
}

function focusColumn(column) {
  focusedColumn = column;
  document.querySelectorAll('#board .is-column-focused, #column-controls .is-column-focused').forEach(node => node.classList.remove('is-column-focused'));
  document.querySelectorAll(`#board .connect-cell:nth-child(7n + ${column + 1}), #column-controls [data-column="${column}"]`).forEach(node => node.classList.add('is-column-focused'));
  document.querySelectorAll('#column-controls [data-column]').forEach(node => {
    const selected = Number(node.dataset.column) === column;
    node.tabIndex = selected ? 0 : -1;
    node.setAttribute('aria-pressed', String(selected));
  });
}

function render() {
  if (!game) return;
  updateLabels();
  $('#score-a').textContent = game.scores[0];
  $('#score-b').textContent = game.scores[1];
  $('#score-draws').textContent = game.draws;
  $('#menu-button').hidden = false;
  $('#round-button').hidden = !['won', 'draw'].includes(game.status);
  const opponentTurn = game.mode === 'online' ? game.current !== saved.room?.seat : game.mode === 'bot' && game.current === 1;
  $('#turn-chip').classList.toggle('is-opponent', opponentTurn);
  const [a, b] = names();
  const acting = game.current === 0 ? a : b;
  $('#turn-label').textContent = game.status === 'won' ? `${acting} kazandı!` : game.status === 'draw' ? 'Tur berabere' : `Sıra: ${acting}`;
  $('#turn-hint').textContent = game.status !== 'playing' ? 'Yeni turla yeniden oyna.' : game.mode === 'bot' && game.current === 1 ? 'Bot hamlesini düşünüyor…' : 'Üstten bir sütun seç; taşın aşağı düşsün.';
  if (game.mode === 'online' && roomStatus === 'waiting') $('#turn-hint').textContent = 'Davet kodunu arkadaşınla paylaş; katılınca oyun başlar.';
  $('#turn-disc').className = `turn-disc player-${game.current}`;
  $('#status').textContent = game.status === 'won' ? `${acting}, dört taşı aynı sıraya getirdi.` : game.status === 'draw' ? 'Tahta doldu; bu tur berabere bitti.' : game.mode === 'bot' && game.current === 1 ? 'Bot hamlesini seçiyor.' : 'Dört taşı yatay, dikey veya çapraz sırala.';
  const board = $('#board'); board.replaceChildren();
  const controls = $('#column-controls'); controls.replaceChildren();
  const landing = Array.from({ length: COLS }, (_, column) => landingRow(game.board, column));
  if (landing[focusedColumn] < 0) focusedColumn = landing.findIndex(row => row >= 0);
  const interactionLocked = game.status !== 'playing' || (game.mode === 'bot' && game.current === 1)
    || (game.mode === 'online' && (roomStatus !== 'playing' || game.current !== saved.room?.seat)) || botRunning;
  for (let column = 0; column < COLS; column += 1) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = `column-drop${column === focusedColumn ? ' is-column-focused' : ''}`;
    choice.dataset.column = column;
    choice.tabIndex = column === focusedColumn ? 0 : -1;
    choice.setAttribute('aria-label', `${column + 1}. sütuna taş bırak`);
    choice.setAttribute('aria-pressed', String(column === focusedColumn));
    choice.disabled = interactionLocked || landing[column] < 0;
    choice.innerHTML = `<strong>${column + 1}</strong><span aria-hidden="true">↓</span>`;
    choice.addEventListener('pointerenter', () => focusColumn(column));
    choice.addEventListener('focus', () => focusColumn(column));
    choice.addEventListener('click', () => playColumn(column));
    choice.addEventListener('keydown', event => onColumnKey(event, column));
    controls.append(choice);
  }
  for (let row = 0; row < ROWS; row += 1) for (let column = 0; column < COLS; column += 1) {
    const index = row * COLS + column;
    const cell = document.createElement('button');
    const mark = game.board[index];
    cell.type = 'button';
    cell.className = `connect-cell${mark === null ? '' : ` token-${mark}`}${game.winningLine.includes(index) ? ' is-winning' : ''}${landing[column] === row && game.status === 'playing' ? ' is-landing' : ''}${column === focusedColumn ? ' is-column-focused' : ''}`;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `Satır ${row + 1}, sütun ${column + 1}: ${mark === null ? 'boş' : mark === 0 ? a : b}${landing[column] === row ? ', taş buraya düşer' : ''}`);
    const locked = game.status !== 'playing' || landing[column] < 0 || (game.mode === 'bot' && game.current === 1)
      || (game.mode === 'online' && (roomStatus !== 'playing' || game.current !== saved.room?.seat)) || botRunning;
    cell.setAttribute('aria-disabled', String(locked));
    cell.disabled = locked;
    cell.tabIndex = landing[column] === row ? 0 : -1;
    cell.addEventListener('pointerenter', () => focusColumn(column));
    cell.addEventListener('focus', () => focusColumn(column));
    cell.addEventListener('click', () => playColumn(column));
    cell.addEventListener('keydown', event => onCellKey(event, column));
    board.append(cell);
  }
  updateContinue();
  persist();
}

// Oyun başlamadan da boş tahta çizilir; sahne ilk açılışta tam boyuyla durur, menü onun üstünde açılır.
function renderIdleBoard() {
  $('#column-controls').replaceChildren(...Array.from({ length: COLS }, (_, column) => Object.assign(document.createElement('button'), {
    type: 'button', className: 'column-drop', disabled: true, tabIndex: -1, innerHTML: `<strong>${column + 1}</strong><span aria-hidden="true">↓</span>`
  })));
  $('#board').replaceChildren(...Array.from({ length: ROWS * COLS }, () => Object.assign(document.createElement('button'), {
    type: 'button', className: 'connect-cell', disabled: true, tabIndex: -1
  })));
}

function announceResult(before) {
  if (game.status === 'playing') return;
  $('#round-button').hidden = true;
  $('#menu-button').hidden = true;
  const [a, b] = names();
  const winner = game.winner === 0 ? a : b;
  $('#result-kicker').textContent = game.status === 'draw' ? 'BERABERE' : 'TUR BİTTİ';
  $('#result-title').textContent = game.status === 'draw' ? 'Tahta doldu!' : `${winner} kazandı!`;
  $('#result-copy').textContent = game.status === 'draw' ? `Skor ${game.scores[0]} – ${game.scores[1]}. Yeni turda ilk başlayan değişecek.` : `Dört taşı aynı sıraya getirdin. Skor ${game.scores[0]} – ${game.scores[1]}.`;
  $('#next-button').textContent = 'Yeni tur ↗';
  flow.show('result');
}

function runBot() {
  if (!game || game.mode !== 'bot' || game.current !== 1 || game.status !== 'playing') return;
  botRunning = true; render();
  cancelBot = botDelay(() => {
    botRunning = false;
    const before = game;
    game = botMove(game);
    if (!game) return;
    recordResult(before, game);
    persist(); render(); announceResult(before);
  }, 430);
}

async function attachRoom(roomInfo) {
  stopWatchingRoom?.(); stopWatchingRoom = null;
  saved.room = roomInfo; roomStatus = 'waiting'; roomVersion = -1;
  game = createGame({ mode: 'online' });
  $('#room-info').classList.remove('hidden'); $('#room-code-label').textContent = roomInfo.code;
  $('#room-code').value = roomInfo.code;
  $('#room-feedback').textContent = roomInfo.seat === 0 ? `Oda ${roomInfo.code} hazır. Rakibin katılması bekleniyor.` : 'Odaya katıldın; tahta eşitleniyor.';
  flow.show('game'); render(); persist();
  const rooms = await import('./rooms.js?v=mantik2');
  stopWatchingRoom = rooms.watchRoom(roomInfo.code, room => {
    roomStatus = room.status; roomVersion = room.version;
    if (room.status === 'waiting') {
      $('#room-feedback').textContent = `Oda ${roomInfo.code} hazır. Rakibin katılması bekleniyor.`;
      $('#turn-label').textContent = 'Rakip bekleniyor';
      $('#turn-hint').textContent = 'Davet kodunu arkadaşınla paylaş; katılınca oyun başlar.';
      $('#status').textContent = `Oda ${roomInfo.code} açık. Rakibin katılınca ilk hamle başlayacak.`;
      return;
    }
    if (!room.state || roomVersion < 0) return;
    const before = game;
    game = room.state;
    if (game.status !== 'playing' && saved.room.resultVersion !== room.version) {
      recordResult(before, game); saved.room.resultVersion = room.version;
    }
    render();
    if (room.status === 'complete') announceResult(before);
  }, error => { $('#room-feedback').textContent = error.message || 'Oda bağlantısı kesildi.'; $('#status').textContent = 'Odaya tekrar bağlanmayı deneyebilirsin.'; });
}

async function withRoomAction(action) {
  $('#room-feedback').textContent = 'Bağlanıyor…';
  try { await action(); }
  catch (error) {
    $('#room-feedback').textContent = error?.message || 'Oda işlemi tamamlanamadı.';
    if (!/hesabına giriş|giriş yap/i.test(error?.message || '')) return;
    $('.account-button')?.focus();
  }
}

function playColumn(column) {
  if (!game || game.status !== 'playing' || (game.mode === 'bot' && game.current === 1) || botRunning) return;
  const before = game;
  if (game.mode === 'online') {
    const room = saved.room;
    if (!room || roomStatus !== 'playing' || game.current !== room.seat) return;
    import('./rooms.js?v=mantik2').then(({ playRoomMove }) => playRoomMove(room.code, room.seat, column, roomVersion))
      .catch(error => { $('#status').textContent = error?.message || 'Hamle eşitlenemedi.'; });
    return;
  }
  const next = playMove(game, column);
  if (!next) return;
  game = next; focusedColumn = column; recordResult(before, game); persist(); render(); announceResult(before);
  if (game.status === 'playing' && game.mode === 'bot') runBot();
  else if (game.status === 'playing') $('#board').querySelector(`[aria-label^="Satır ${landingRow(game.board, column) + 1}, sütun ${column + 1}"]`)?.focus();
}

function onCellKey(event, column) {
  if (!['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'Enter' || event.key === ' ') return playColumn(column);
  const direction = event.key === 'ArrowLeft' ? -1 : 1;
  for (let offset = 1; offset <= COLS; offset += 1) {
    const next = (column + direction * offset + COLS) % COLS;
    if (landingRow(game.board, next) < 0) continue;
    $('#board').querySelector(`.connect-cell.is-landing:nth-child(7n + ${next + 1})`)?.focus();
    return;
  }
}

function onColumnKey(event, column) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const direction = event.key === 'ArrowLeft' ? -1 : 1;
  for (let offset = 1; offset <= COLS; offset += 1) {
    const next = (column + direction * offset + COLS) % COLS;
    if (landingRow(game.board, next) < 0) continue;
    $('#column-controls').querySelector(`[data-column="${next}"]`)?.focus();
    return;
  }
}

function startGame(mode = selectedMode) {
  cancelBot(); stopWatchingRoom?.(); stopWatchingRoom = null; saved.room = null; $('#room-info').classList.add('hidden'); roomStatus = 'waiting'; botRunning = false;
  game = createGame({ mode, level: selectedLevel });
  saved.mode = mode; saved.level = selectedLevel;
  focusedColumn = 3; flow.show('game'); render();
}

function setMode(mode) {
  selectedMode = mode; saved.mode = mode;
  document.querySelectorAll('.mode-choice').forEach(button => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('is-selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  $('#difficulty-picker').classList.toggle('hidden', mode !== 'bot');
  $('#online-setup').classList.toggle('hidden', mode !== 'online');
  $('#start-button').classList.toggle('hidden', mode === 'online');
  updateLabels();
}

function setLevel(level) {
  selectedLevel = level; saved.level = level;
  document.querySelectorAll('[data-level]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.level === level)));
}

document.querySelectorAll('.mode-choice').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => setLevel(button.dataset.level)));
$('#start-button').addEventListener('click', async () => {
  if (game?.status === 'playing' && !await confirmDialog({ title: 'Yeni maç başlasın mı?', message: 'Devam eden maç kapatılır. Skor kayıtların korunur.', confirmLabel: 'Yeni maç' })) return;
  startGame();
});
$('#continue-card').addEventListener('click', () => {
  if (saved.room) return withRoomAction(() => attachRoom(saved.room));
  if (!game) return; flow.show('game'); render(); runBot();
});
$('#menu-button').addEventListener('click', () => { cancelBot(); if (game?.mode === 'online') stopWatchingRoom?.(); botRunning = false; $('#room-info').classList.add('hidden'); $('#status').textContent = 'Maça dön veya başka bir oyun modu seç.'; setMode(saved.mode); updateContinue(); flow.show('menu'); });
$('#round-button').addEventListener('click', async () => {
  if (game?.status === 'playing' && game.moveCount > 0 && !await confirmDialog({ title: 'Yeni tur başlasın mı?', message: 'Bu turdaki taşlar temizlenir; skor korunur.', confirmLabel: 'Yeni tur' })) return;
  game = newRound(game); flow.show('game'); render(); runBot();
});
$('#next-button').addEventListener('click', () => { game = newRound(game); flow.show('game'); render(); runBot(); });
$('#result-menu-button').addEventListener('click', () => { updateContinue(); flow.show('menu'); });

const mergeRecords = (a = {}, b = {}) => Object.fromEntries(Object.keys(blank().records).map(key => [key, Math.max(Number(a[key]) || 0, Number(b[key]) || 0)]));
const cloudSync = syncGameOnAccountChange('dort-tas', {
  read: () => saved,
  write: incoming => { const currentRoom = saved.room; const liveOnlineGame = currentRoom ? game : null; saved = { ...blank(), ...incoming, room: currentRoom, records: mergeRecords(saved.records, incoming.records) }; game = currentRoom ? liveOnlineGame : isValidGame(saved.game) ? saved.game : null; if (game && !currentRoom) flow.show('menu'); updateContinue(); },
  isValid: incoming => Boolean(incoming && typeof incoming === 'object' && (incoming.game === null || isValidGame(incoming.game)) && incoming.records),
  merge: (local, remote) => ({ ...remote, records: mergeRecords(local.records, remote.records) }),
  counters: current => ({ wins: current.records.wins, draws: current.records.draws, botWins: current.records.botWins, hardWins: current.records.hardWins, localWins: current.records.localWins }),
  onStatus: message => { $('#save-state').textContent = message; }
});

$('#create-room').addEventListener('click', () => withRoomAction(async () => { const { createRoom } = await import('./rooms.js?v=mantik2'); await attachRoom(await createRoom()); }));
$('#join-room').addEventListener('click', () => withRoomAction(async () => { const { joinRoom } = await import('./rooms.js?v=mantik2'); await attachRoom(await joinRoom($('#room-code').value)); }));
$('#room-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
$('#room-code').addEventListener('keydown', event => { if (event.key === 'Enter') $('#join-room').click(); });
$('#copy-room-link').addEventListener('click', async () => {
  if (!saved.room) return;
  const link = `${location.origin}${location.pathname}?oda=${saved.room.code}`;
  try { await navigator.clipboard.writeText(link); $('#copy-room-link').textContent = 'Bağlantı kopyalandı'; }
  catch { $('#room-feedback').textContent = `Davet bağlantısı: ${link}`; }
});
$('#leave-room').addEventListener('click', () => { stopWatchingRoom?.(); stopWatchingRoom = null; saved.room = null; game = null; roomStatus = 'waiting'; $('#room-info').classList.add('hidden'); persist(); updateContinue(); flow.show('menu'); });

const roomFromLink = new URLSearchParams(location.search).get('oda');
if (roomFromLink) { setMode('online'); $('#room-code').value = roomFromLink.toUpperCase(); }
setMode(selectedMode); setLevel(selectedLevel); updateContinue(); updateLabels(); renderIdleBoard(); flow.show('menu');
