import { LEVELS, positionsFor, freeTiles, facesMatch, createGame, availablePairs, removePair, undo, giveHint, shuffleTiles, remainingTiles, elapsedMilliseconds, pauseGame, resumeGame, isValidGame } from './logic.js?v=202609270005';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609270005';

const KEY = 'oyunarasi-mahjong-v1';
const boardElement = document.querySelector('#board');
const frameElement = document.querySelector('.board-frame');
const statusElement = document.querySelector('#status');
const saveElement = document.querySelector('#save-state');
const difficultyPicker = document.querySelector('#difficulty');
const timerElement = document.querySelector('#timer');
const undoButton = document.querySelector('#undo-button');
const hintButton = document.querySelector('#hint-button');
const shuffleButton = document.querySelector('#shuffle-button');
const overlay = document.querySelector('#game-overlay');
const overlayShuffle = document.querySelector('#overlay-shuffle');
const scrollElement = document.querySelector('#tile-scroll');
const zoomRow = document.querySelector('#zoom-row');
const zoomLevelElement = document.querySelector('#zoom-level');
const ZOOM_KEY = 'oyunarasi-mahjong-zoom';
const ZOOMS = [1, 1.5, 2];
const ZOOM_BELOW = 16;       // tiles narrower than this (in half-tile px) get zoom buttons

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WINDS = [['東', 'Doğu'], ['南', 'Güney'], ['西', 'Batı'], ['北', 'Kuzey']];
const DRAGONS = [['中', 'Kırmızı', 'red'], ['發', 'Yeşil', 'green'], ['', 'Beyaz', 'white']];
const FLOWERS = [['梅', 'Erik'], ['蘭', 'Orkide'], ['菊', 'Kasımpatı'], ['竹', 'Bambu']];
const SEASONS = [['春', 'İlkbahar'], ['夏', 'Yaz'], ['秋', 'Sonbahar'], ['冬', 'Kış']];

let records = { easy: null, medium: null, hard: null };
let game = loadGame();
let selected = -1;
let hinted = [];
let busy = false;
let tileElements = [];
let zoom = loadZoom();

// What each face shows: big glyph, small suit mark, CSS classes and a spoken name.
function faceView(face) {
  if (face < 9) return { big: face + 1, small: '●', cls: 'num dot', name: `${face + 1} Daire` };
  if (face < 18) return { big: face - 8, small: '索', cls: 'num bam', name: `${face - 8} Bambu` };
  if (face < 27) return { big: NUMERALS[face - 18], small: '萬', cls: 'chr', name: `${face - 17} Karakter` };
  if (face < 31) { const [glyph, name] = WINDS[face - 27]; return { big: glyph, small: '', cls: 'wind', name: `${name} rüzgârı` }; }
  if (face < 34) { const [glyph, name, cls] = DRAGONS[face - 31]; return { big: glyph, small: '', cls, name: `${name} ejderha` }; }
  if (face < 38) { const [glyph, name] = FLOWERS[face - 34]; return { big: glyph, small: '花', cls: 'flower', name: `${name} çiçeği` }; }
  const [glyph, name] = SEASONS[face - 38];
  return { big: glyph, small: '季', cls: 'season', name: `${name} mevsimi` };
}

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.records) records = mergeRecords(records, saved.records);
    if (isValidGame(saved?.game)) return resumeGame(saved.game);
  } catch {}
  return createGame('easy');
}

function saveGame() {
  const stored = { game: pauseGame(game), records };
  try { localStorage.setItem(KEY, JSON.stringify(stored)); saveElement.textContent = 'Oyun bu cihazda saklanıyor.'; }
  catch { saveElement.textContent = 'Kayıt kullanılamıyor; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save(stored);
}

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function loadZoom() {
  try { const saved = Number(localStorage.getItem(ZOOM_KEY)); return ZOOMS.includes(saved) ? saved : 1; }
  catch { return 1; }
}

// Tile size follows the free width (and, on wide screens, the window height). When the tiles come out
// too small to tap comfortably (the 144-tile board on a phone), zoom buttons enlarge them and the
// board scrolls sideways inside its frame.
function layoutBoard() {
  const positions = positionsFor(game.level);
  const spanX = Math.max(...positions.map(p => p.x)) + 2;
  const spanY = Math.max(...positions.map(p => p.y)) + 2;
  const layers = Math.max(...positions.map(p => p.z));
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const width = frameElement.clientWidth - (mobile ? 24 : 28) - 8;
  const height = mobile ? Infinity : Math.max(320, window.innerHeight - 330);
  const depth = 0.22;
  const fit = Math.max(9, Math.min(34, width / (spanX + layers * depth), height / (spanY * 1.3 + layers * depth)));
  const zoomable = fit < ZOOM_BELOW;
  zoomRow.hidden = !zoomable;
  const factor = zoomable ? zoom : 1;
  zoomLevelElement.textContent = `%${Math.round(factor * 100)}`;
  document.querySelector('#zoom-out').disabled = factor <= ZOOMS[0];
  document.querySelector('#zoom-in').disabled = factor >= ZOOMS[ZOOMS.length - 1];
  const u = Math.min(34, fit * factor);
  const v = u * 1.3;
  boardElement.style.setProperty('--u', `${u}px`);
  boardElement.style.setProperty('--v', `${v}px`);
  boardElement.style.width = `${spanX * u + layers * u * depth + 4}px`;
  boardElement.style.height = `${spanY * v + layers * u * depth + 4}px`;
  positions.forEach((position, index) => {
    const tile = tileElements[index];
    if (!tile) return;
    const lift = (layers - position.z) * u * depth;
    tile.style.left = `${position.x * u + lift}px`;
    tile.style.top = `${position.y * v + lift}px`;
  });
}

function buildBoard() {
  const positions = positionsFor(game.level);
  tileElements = positions.map((position, index) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.dataset.index = index;
    tile.style.zIndex = position.z * 10000 + position.x * 100 + position.y;
    return tile;
  });
  boardElement.replaceChildren(...tileElements);
  layoutBoard();
}

function render() {
  const positions = positionsFor(game.level);
  const free = new Set(freeTiles(positions, game.faces));
  tileElements.forEach((tile, index) => {
    const face = game.faces[index];
    if (face < 0) { tile.hidden = true; return; }
    tile.hidden = false;
    const view = faceView(face);
    const isFree = free.has(index);
    tile.className = `tile ${view.cls}${isFree ? '' : ' blocked'}${index === selected ? ' selected' : ''}${hinted.includes(index) ? ' hint' : ''}`;
    if (tile.dataset.face !== String(face)) {
      tile.innerHTML = `<b>${view.big}</b>${view.small ? `<small>${view.small}</small>` : ''}`;
      tile.dataset.face = face;
    }
    tile.tabIndex = isFree ? 0 : -1;
    tile.setAttribute('aria-label', `${view.name}${isFree ? '' : ', kapalı'}${index === selected ? ', seçili' : ''}`);
    tile.setAttribute('aria-pressed', index === selected ? 'true' : 'false');
  });
  document.querySelector('#remaining').textContent = remainingTiles(game);
  timerElement.textContent = formatTime(elapsedMilliseconds(game));
  difficultyPicker.value = game.level;
  const playing = game.status === 'playing';
  undoButton.disabled = !playing || !game.history.length || busy;
  hintButton.disabled = !playing || busy;
  shuffleButton.disabled = !playing || busy;
  document.querySelector('#best').textContent = `${LEVELS[game.level].label} rekoru: ${records[game.level] == null ? '—' : formatTime(records[game.level])}`;

  const stuck = playing && !availablePairs(game).length;
  overlay.classList.toggle('hidden', !stuck && game.status !== 'won');
  overlayShuffle.classList.toggle('hidden', !stuck);
  if (game.status === 'won') {
    document.querySelector('#overlay-kicker').textContent = 'KAZANDIN';
    document.querySelector('#overlay-title').textContent = 'Tebrikler!';
    const aided = game.hints || game.shuffles;
    document.querySelector('#overlay-copy').textContent = `Bütün taşları ${formatTime(game.elapsedMs)} sürede topladın.${aided ? ' İpucu ya da karıştırma kullanıldığı için rekora sayılmadı.' : records[game.level] === game.elapsedMs ? ' Yeni rekor!' : ''}`;
  } else if (stuck) {
    document.querySelector('#overlay-kicker').textContent = 'HAMLE KALMADI';
    document.querySelector('#overlay-title').textContent = 'Eş taş kalmadı';
    document.querySelector('#overlay-copy').textContent = 'Taşları karıştırabilir, geri alabilir ya da yeni oyuna başlayabilirsin.';
  }
}

function afterChange(message) {
  if (game.status === 'won') {
    const best = records[game.level];
    if (!game.hints && !game.shuffles && (best == null || game.elapsedMs < best)) records = { ...records, [game.level]: game.elapsedMs };
    statusElement.textContent = `Tebrikler! Tahtayı ${formatTime(game.elapsedMs)} sürede temizledin.`;
  } else if (message) {
    statusElement.textContent = message;
  }
  saveGame();
  render();
}

function selectTile(index) {
  if (busy || game.status !== 'playing' || game.faces[index] < 0) return;
  const positions = positionsFor(game.level);
  if (!freeTiles(positions, game.faces).includes(index)) {
    const tile = tileElements[index];
    tile.classList.remove('shake');
    void tile.offsetWidth;
    tile.classList.add('shake');
    statusElement.textContent = 'Bu taş kapalı: üstünde taş var ya da iki yanı da dolu.';
    return;
  }
  hinted = [];
  if (selected === index) { selected = -1; render(); return; }
  if (selected < 0 || !facesMatch(game.faces[selected], game.faces[index])) {
    if (selected >= 0) statusElement.textContent = `${faceView(game.faces[index]).name} seçildi. Eşini bul.`;
    selected = index;
    render();
    return;
  }
  const next = removePair(game, selected, index);
  if (!next) return;
  const pair = [selected, index];
  const name = faceView(game.faces[index]).name;
  selected = -1;
  busy = true;
  pair.forEach(tile => tileElements[tile].classList.add('removing'));
  setTimeout(() => {
    busy = false;
    game = next;
    const left = availablePairs(game).length;
    afterChange(game.status === 'playing' ? `${name} eşleşti. ${left ? `${left} olası eş var.` : ''}` : null);
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
}

boardElement.addEventListener('click', event => {
  const tile = event.target.closest('.tile');
  if (tile) selectTile(Number(tile.dataset.index));
});

function showHint() {
  if (busy) return;
  const result = giveHint(game);
  if (!result) { statusElement.textContent = 'Serbest eş kalmadı. Karıştırmayı dene.'; return; }
  game = result.game;
  hinted = result.pair;
  selected = -1;
  afterChange('Parlayan iki taş eşleşiyor. İpucu kullanılan oyunlar rekora sayılmaz.');
}

function shuffle() {
  if (busy || game.status !== 'playing') return;
  const next = shuffleTiles(game);
  if (!next) { statusElement.textContent = 'Taşlar karıştırılamadı, yeni oyuna başlayabilirsin.'; return; }
  game = next;
  selected = -1;
  hinted = [];
  afterChange('Taşlar karıştırıldı. Karıştırılan oyunlar rekora sayılmaz.');
}

function undoMove() {
  if (busy) return;
  const next = undo(game);
  if (!next) return;
  game = next;
  selected = -1;
  hinted = [];
  afterChange('Son eş geri kondu.');
}

function startNew(level) {
  const inProgress = game.status === 'playing' && remainingTiles(game) < game.faces.length;
  if (inProgress && !window.confirm('Devam eden oyun silinsin ve yeni oyun başlasın mı?')) { difficultyPicker.value = game.level; return; }
  game = createGame(level);
  selected = -1;
  hinted = [];
  buildBoard();
  statusElement.textContent = `Yeni oyun: ${LEVELS[level].label}. Serbest duran eş taşları bul.`;
  saveGame();
  render();
}

document.querySelector('#new-game').addEventListener('click', () => startNew(difficultyPicker.value));
document.querySelector('#overlay-new-button').addEventListener('click', () => startNew(difficultyPicker.value));
difficultyPicker.addEventListener('change', () => startNew(difficultyPicker.value));
undoButton.addEventListener('click', undoMove);
hintButton.addEventListener('click', showHint);
shuffleButton.addEventListener('click', shuffle);
overlayShuffle.addEventListener('click', shuffle);

document.addEventListener('keydown', event => {
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLocaleLowerCase('tr-TR');
  if (key === 'z') { event.preventDefault(); undoMove(); }
  else if (key === 'h') { event.preventDefault(); showHint(); }
  else if (key === 'k') { event.preventDefault(); shuffle(); }
  else if (key === 'escape') { selected = -1; hinted = []; render(); }
  else if (key === '+' || key === '=') { event.preventDefault(); stepZoom(1); }
  else if (key === '-') { event.preventDefault(); stepZoom(-1); }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveGame();
  else { game = resumeGame(pauseGame(game)); render(); }
});
window.addEventListener('pagehide', saveGame);
setInterval(() => { if (game.status === 'playing') timerElement.textContent = formatTime(elapsedMilliseconds(game)); }, 500);
let lastWidth = 0;
new ResizeObserver(() => {
  const width = frameElement.clientWidth;
  if (width !== lastWidth) { lastWidth = width; layoutBoard(); }
}).observe(frameElement);
window.addEventListener('resize', layoutBoard);

// Zooming keeps the middle of what you were looking at in view.
function setZoom(next) {
  if (!ZOOMS.includes(next) || next === zoom) return;
  const centerX = (scrollElement.scrollLeft + scrollElement.clientWidth / 2) / Math.max(1, scrollElement.scrollWidth);
  zoom = next;
  try { localStorage.setItem(ZOOM_KEY, String(zoom)); } catch {}
  layoutBoard();
  scrollElement.scrollLeft = centerX * scrollElement.scrollWidth - scrollElement.clientWidth / 2;
  if (zoom > 1) statusElement.textContent = 'Tahtada gezinmek için parmağınla sağa sola kaydır.';
}

function stepZoom(direction) {
  if (zoomRow.hidden) return;
  const index = ZOOMS.indexOf(zoom);
  setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, index + direction))]);
}

document.querySelector('#zoom-in').addEventListener('click', () => stepZoom(1));
document.querySelector('#zoom-out').addEventListener('click', () => stepZoom(-1));

const cloudSync = syncGameOnAccountChange('mahjong', {
  read: () => ({ game: pauseGame(game), records }),
  write: incoming => { game = resumeGame(incoming.game); records = mergeRecords(records, incoming.records); selected = -1; hinted = []; buildBoard(); render(); },
  isValid: incoming => Boolean(incoming && isValidGame(incoming.game) && incoming.records && typeof incoming.records === 'object'),
  merge: (local, remote) => ({ game: remote.game, records: mergeRecords(local.records, remote.records) }),
  getStats: current => ({ easy: { bestMs: current.records.easy }, medium: { bestMs: current.records.medium }, hard: { bestMs: current.records.hard } }),
  onStatus: message => { saveElement.textContent = message; }
});

function mergeRecords(local, remote) {
  const merged = {};
  for (const level of Object.keys(LEVELS)) {
    const left = Number.isFinite(local?.[level]) ? local[level] : null;
    const right = Number.isFinite(remote?.[level]) ? remote[level] : null;
    merged[level] = left == null ? right : right == null ? left : Math.min(left, right);
  }
  return merged;
}

buildBoard();
render();
if (game.status === 'playing') statusElement.textContent = remainingTiles(game) < game.faces.length ? 'Kaldığın yerden devam et.' : 'Serbest duran eş taşları bul. Parlak taşlar serbesttir.';
