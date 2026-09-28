import { createRound, nextRound, drawFromWall, drawDiscard, discardTile, botTurn, canFinish, sortHand, bestArrangement, isValidRound } from './logic.js?v=mantik9';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=mantik9';
import { createFlow, botDelay, bindChoices } from '../../game-flow.js?v=mantik9';

const KEY = 'oyunarasi-okey-v1';
const LEVEL_NAMES = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };
const COLORS = ['red', 'blue', 'yellow', 'black'];
const COLOR_NAMES = ['kırmızı', 'mavi', 'sarı', 'siyah'];
// Istaka gerçek okeydeki gibi iki katlı ve yuvalıdır: taşlar istenen yuvaya konur, aralarında boşluk kalabilir.
const SLOTS = 30;
const $ = selector => document.querySelector(selector);
const flow = createFlow({ menu: $('#menu-screen'), game: $('#game-screen'), result: $('#result-screen') });
const rack = $('#rack');

function blankSave() { return { game: null, level: 'medium', layout: {}, records: { matchWins: 0, roundWins: 0, hardWins: 0 } }; }
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    return { ...blankSave(), ...(data || {}), game: isValidRound(data?.game) ? data.game : null,
      layout: data?.layout && typeof data.layout === 'object' ? data.layout : {},
      records: { ...blankSave().records, ...(data?.records || {}) } };
  } catch { return blankSave(); }
}

let saved = load();
let game = saved.game;
let selectedTile = null;
let newTileId = null;
let cancelBot = () => {};
const setStatus = message => { $('#status').textContent = message; };

function persist() {
  saved.game = game;
  try { localStorage.setItem(KEY, JSON.stringify(saved)); }
  catch { $('#save-state').textContent = 'Kayıt yapılamadı; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save(saved);
}

const inPlay = () => Boolean(game) && !['round-over', 'match-over'].includes(game.phase);
const canDraw = () => inPlay() && game.phase === 'draw' && game.turn === 0;
const canDiscard = () => inPlay() && game.phase === 'discard' && game.turn === 0;
const isWild = tile => !tile.fake && tile.color === game.joker.color && tile.number === game.joker.number;
const faceOf = tile => (tile.fake ? game.joker : tile);

// ---- Taş görünümü ---------------------------------------------------------------------------

// Istakadaki taşlar tıklanabilir <button>; atık, gösterge gibi bilgi taşları <div> (düğme içine de konabilir).
function tileView(tile, { selected = false, fresh = false, onClick } = {}) {
  const node = document.createElement(onClick ? 'button' : 'div');
  if (onClick) node.type = 'button';
  const face = faceOf(tile);
  const wild = isWild(tile);
  node.className = `tile ${COLORS[face.color]}${tile.fake ? ' fake' : ''}${wild ? ' joker' : ''}${selected ? ' is-selected' : ''}${fresh ? ' is-new' : ''}`;
  node.dataset.tileId = tile.id;
  node.setAttribute('aria-label', tile.fake ? `Sahte okey (${face.number} ${COLOR_NAMES[face.color]} yerine)` : `${face.number} ${COLOR_NAMES[face.color]}${wild ? ', okey' : ''}`);
  node.innerHTML = tile.fake
    ? '<span class="num fake-mark">✿</span><i class="pip"></i>'
    : `<span class="num">${face.number}</span><i class="pip"></i>`;
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

// ---- Istaka yerleşimi -----------------------------------------------------------------------

const rackCols = () => Number.parseInt(getComputedStyle(rack).getPropertyValue('--cols'), 10) || 15;
const usedSlots = () => new Set(game.hands[0].map(tile => saved.layout[tile.id]).filter(Number.isInteger));

// Eldeki her taşın geçerli ve tekil bir yuvası olsun; yuvası olmayanlar ilk boş yuvaya.
function ensureLayout() {
  const layout = {};
  const used = new Set();
  for (const tile of game.hands[0]) {
    const slot = saved.layout?.[tile.id];
    if (Number.isInteger(slot) && slot >= 0 && slot < SLOTS && !used.has(slot)) { layout[tile.id] = slot; used.add(slot); }
  }
  let next = 0;
  for (const tile of game.hands[0]) {
    if (tile.id in layout) continue;
    while (used.has(next)) next += 1;
    layout[tile.id] = next;
    used.add(next);
  }
  saved.layout = layout;
}

// İstenen yuvaya en yakın boş yuva; istek yoksa ıstakanın sonundaki ilk boş yuva (çekilen taş sağa gelir).
function freeSlot(preferred) {
  const used = usedSlots();
  if (Number.isInteger(preferred)) {
    for (let distance = 0; distance < SLOTS; distance += 1) {
      for (const slot of [preferred + distance, preferred - distance]) if (slot >= 0 && slot < SLOTS && !used.has(slot)) return slot;
    }
  }
  for (let slot = SLOTS - 1; slot >= 0; slot -= 1) if (!used.has(slot)) return slot;
  return 0;
}

function moveTileToSlot(tileId, slot) {
  if (!game || !Number.isInteger(slot) || slot < 0 || slot >= SLOTS) return;
  const from = saved.layout[tileId];
  if (from === slot) return;
  const occupant = game.hands[0].find(tile => saved.layout[tile.id] === slot);
  if (occupant) saved.layout[occupant.id] = from;
  saved.layout[tileId] = slot;
  persist();
  render();
}

// Perler (ve çiftler) blok blok dizilir, aralarına bir boşluk bırakılır; blok satır sonuna sığmazsa alt kata geçer.
function placeBlocks(blocks) {
  const cols = rackCols();
  const layout = {};
  let position = 0;
  for (const block of blocks.filter(item => item.length)) {
    const column = position % cols;
    if (column !== 0 && column + block.length > cols && block.length <= cols) position += cols - column;
    for (const tile of block) layout[tile.id] = position++;
    if (position % cols !== 0) position += 1;
  }
  if (Object.values(layout).some(slot => slot >= SLOTS)) {
    blocks.flat().forEach((tile, index) => { layout[tile.id] = index; });
  }
  saved.layout = layout;
}

function orderGroup(group) {
  if (group.type === 'set') return [...group.tiles].sort((a, b) => isWild(a) - isWild(b) || faceOf(a).color - faceOf(b).color);
  const wilds = group.tiles.filter(isWild);
  let naturals = group.tiles.filter(tile => !isWild(tile)).sort((a, b) => faceOf(a).number - faceOf(b).number);
  if (naturals.some(tile => faceOf(tile).number === 1) && naturals.some(tile => faceOf(tile).number >= 12)) {
    naturals = [...naturals.filter(tile => faceOf(tile).number !== 1), ...naturals.filter(tile => faceOf(tile).number === 1)];
  }
  const ordered = [];
  naturals.forEach((tile, index) => {
    ordered.push(tile);
    const next = naturals[index + 1];
    if (!next) return;
    let gap = ((faceOf(next).number - faceOf(tile).number + 13) % 13) - 1;
    while (gap > 0 && wilds.length) { ordered.push(wilds.shift()); gap -= 1; }
  });
  return [...ordered, ...wilds];
}

// Aynı anahtara sahip ardışık taşları bloklara böler.
function chunkBy(tiles, key) {
  const blocks = [];
  for (const tile of tiles) {
    const last = blocks.at(-1);
    if (last && key(last[0]) === key(tile)) last.push(tile); else blocks.push([tile]);
  }
  return blocks;
}

function arrange(mode) {
  if (!game) return;
  const hand = game.hands[0];
  let blocks;
  if (mode === 'series') {
    const { groups } = bestArrangement(hand, game.indicator);
    const grouped = new Set(groups.flatMap(group => group.tiles.map(tile => tile.id)));
    const rest = sortHand(hand.filter(tile => !grouped.has(tile.id)), game.indicator, 'series');
    blocks = [...groups.map(orderGroup), ...chunkBy(rest, tile => (isWild(tile) ? 'okey' : faceOf(tile).color))];
  } else {
    const sorted = sortHand(hand, game.indicator, 'pairs');
    const same = chunkBy(sorted, tile => (isWild(tile) ? 'okey' : `${faceOf(tile).color}:${faceOf(tile).number}`));
    const pairs = [];
    const singles = [];
    for (const block of same) {
      while (block.length >= 2) pairs.push(block.splice(0, 2));
      singles.push(...block);
    }
    blocks = [...pairs, singles];
  }
  placeBlocks(blocks);
  selectedTile = null;
  persist();
  render();
}

// ---- Çizim ----------------------------------------------------------------------------------

const SEAT_NAMES = { 0: 'Sen', 1: 'Bot 1', 2: 'Bot 2', 3: 'Bot 3' };
const cornerOf = seat => ({ 0: $('#discard-target'), 1: $('#corner-1'), 2: $('#corner-2'), 3: $('#draw-discard') })[seat];

function renderSeats() {
  for (const seat of [0, 1, 2, 3]) {
    const element = $(`#seat-${seat}`);
    element.classList.toggle('is-turn', inPlay() && game.turn === seat);
    const detail = seat === 0 ? `${game.wins[0]} el` : `${LEVEL_NAMES[saved.level]} · ${game.wins[seat]} el`;
    element.innerHTML = `<span class="avatar">${seat === 0 ? 'SEN' : `B${seat}`}</span><span class="seat-name"><strong>${SEAT_NAMES[seat]}</strong><small>${detail}</small></span>`;
  }
}

function renderCorners() {
  for (const seat of [0, 1, 2, 3]) {
    const corner = cornerOf(seat);
    const pile = game.discards[seat];
    const top = pile.at(-1);
    corner.replaceChildren();
    corner.dataset.label = seat === 0 ? 'Senin attığın' : `${SEAT_NAMES[seat]} attı`;
    corner.dataset.depth = String(Math.min(pile.length, 3));
    corner.classList.toggle('is-empty', !top);
    corner.classList.toggle('just-discarded', Boolean(top) && game.lastAction?.type === 'discard' && game.lastAction.player === seat);
    if (top) {
      const tile = tileView(top);
      tile.style.setProperty('--tilt', `${((top.id * 37) % 11) - 5}deg`);
      corner.append(tile);
    }
  }
  const take = $('#draw-discard');
  take.classList.toggle('can-act', canDraw() && game.discards[3].length > 0);
  if (take.classList.contains('can-act')) take.dataset.label = 'Al';
  const target = $('#discard-target');
  target.classList.toggle('can-act', canDiscard());
  target.classList.toggle('is-armed', canDiscard() && selectedTile !== null);
  if (canDiscard()) target.dataset.label = selectedTile !== null ? 'Buraya at' : 'Atacağın taş';
}

function renderRack() {
  ensureLayout();
  const bySlot = new Map(game.hands[0].map(tile => [saved.layout[tile.id], tile]));
  const slots = [];
  for (let index = 0; index < SLOTS; index += 1) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset.slot = index;
    const tile = bySlot.get(index);
    if (tile) {
      slot.append(tileView(tile, {
        selected: tile.id === selectedTile,
        fresh: tile.id === newTileId,
        onClick: event => { if (!suppressClick) toggleSelect(tile.id, event); }
      }));
    }
    slots.push(slot);
  }
  rack.replaceChildren(...slots);
  rack.classList.toggle('is-turn', inPlay() && game.turn === 0);
}

function render() {
  if (!game) return;
  renderSeats();
  renderCorners();
  renderRack();
  const deck = $('#draw-wall');
  deck.classList.toggle('can-act', canDraw() && game.wall.length > 0);
  deck.disabled = !inPlay();
  $('#wall-count').textContent = game.wall.length;
  $('#indicator-tile').replaceChildren(tileView(game.indicator));

  const finishing = canDiscard() && selectedTile !== null && canFinish(game.hands[0].filter(tile => tile.id !== selectedTile), game.indicator);
  $('#discard-button').disabled = !canDiscard() || selectedTile === null;
  $('#finish-button').hidden = !finishing;
  $('#tools-hint').textContent = canDiscard() ? (selectedTile === null ? 'Atacağın taşı seç' : finishing ? 'Bu taşı atarsan el biter!' : '') : canDraw() ? 'Ortadan çek ya da soldakinin taşını al' : '';

  $('#score-human').textContent = game.wins[0];
  $('#score-bots').textContent = game.wins.slice(1).reduce((sum, value) => sum + value, 0);
  $('#menu-button').hidden = false;
  if (game.phase === 'draw') setStatus(game.turn === 0 ? 'Sıra sende: ortadaki desteden çek ya da Bot 3\'ün attığı taşı al.' : `${SEAT_NAMES[game.turn]} oynuyor…`);
  else if (game.phase === 'discard') setStatus(game.turn === 0 ? 'Bir taş seç ve sağ alttaki alana at (sürükleyebilirsin de).' : `${SEAT_NAMES[game.turn]} taş atıyor…`);
  $('#continue-card').hidden = game.phase === 'match-over';
  $('#continue-copy').textContent = game.phase === 'round-over' ? 'Sonraki ele geç.' : `${game.wins[0]}–${game.wins.slice(1).reduce((a, b) => a + b, 0)} el galibiyeti`;
}

function refresh() { render(); }

// ---- Oyuncu hamleleri -----------------------------------------------------------------------

function toggleSelect(tileId) {
  if (!canDiscard()) return;
  selectedTile = selectedTile === tileId ? null : tileId;
  render();
  rack.querySelector(`[data-tile-id="${tileId}"]`)?.focus({ preventScroll: true });
}

function afterDraw(slot) {
  const tile = game.hands[0].at(-1);
  newTileId = tile.id;
  saved.layout[tile.id] = freeSlot(slot);
  selectedTile = null;
  persist();
  render();
}

function drawWall(slot) {
  if (!canDraw() || !game.wall.length) return;
  game = drawFromWall(game, 0);
  if (game.phase === 'discard') afterDraw(slot);
}

function takeDiscard(slot) {
  if (!canDraw() || !game.discards[3].length) return;
  game = drawDiscard(game, 0);
  if (game.phase === 'discard') afterDraw(slot);
}

function discardAction(tileId = selectedTile) {
  if (tileId === null || !canDiscard()) return;
  const before = game;
  game = discardTile(game, 0, tileId);
  if (game === before) return;
  selectedTile = null;
  newTileId = null;
  delete saved.layout[tileId];
  recordResults(before, game);
  persist();
  render();
  if (['round-over', 'match-over'].includes(game.phase)) showResult(); else advanceBots();
}

// ---- Sürükle-bırak (fare ve dokunma) --------------------------------------------------------

let drag = null;
let suppressClick = false;

function startDrag(event, kind, source, tileId = null) {
  if (event.button !== 0 || !game) return;
  drag = { kind, source, tileId, x: event.clientX, y: event.clientY, moved: false, ghost: null, target: null };
  source.setPointerCapture?.(event.pointerId);
}

function dropTargetAt(x, y) {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;
  const slot = element.closest('.okey-rack .slot');
  if (slot) return { type: 'slot', element: slot, slot: Number(slot.dataset.slot) };
  if (element.closest('.okey-rack')) return { type: 'rack', element: rack, slot: null };
  if (drag.kind === 'tile' && element.closest('#discard-target')) return { type: 'discard', element: $('#discard-target') };
  return null;
}

function markTarget(target) {
  drag.target?.element.classList.remove('is-drop');
  drag.target = target;
  const valid = target && (target.type !== 'discard' || canDiscard()) && (drag.kind === 'tile' || target.type !== 'discard');
  if (valid) target.element.classList.add('is-drop');
}

window.addEventListener('pointermove', event => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
  if (!drag.moved) {
    drag.moved = true;
    const rect = drag.source.getBoundingClientRect();
    const ghost = drag.kind === 'wall' ? Object.assign(document.createElement('div'), { className: 'tile tile-back' }) : drag.source.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.classList.remove('is-selected');
    ghost.style.setProperty('--tile-w', `${rect.width}px`);
    drag.offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (drag.kind === 'wall') drag.offset = { x: rect.width / 2, y: rect.height / 2 };
    document.body.append(ghost);
    drag.ghost = ghost;
    if (drag.kind === 'tile') drag.source.classList.add('is-lifted');
  }
  drag.ghost.style.transform = `translate(${event.clientX - drag.offset.x}px, ${event.clientY - drag.offset.y}px) rotate(3deg) scale(1.08)`;
  markTarget(dropTargetAt(event.clientX, event.clientY));
});

function endDrag(event) {
  if (!drag) return;
  const current = drag;
  drag = null;
  current.ghost?.remove();
  current.source.classList.remove('is-lifted');
  current.target?.element.classList.remove('is-drop');
  if (!current.moved) return;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  if (event.type === 'pointercancel') { render(); return; }
  const target = current.target;
  if (current.kind === 'tile') {
    if (target?.type === 'slot') moveTileToSlot(current.tileId, target.slot);
    else if (target?.type === 'discard') discardAction(current.tileId);
    else render();
  } else if (target && (target.type === 'slot' || target.type === 'rack')) {
    if (current.kind === 'wall') drawWall(target.slot); else takeDiscard(target.slot);
  }
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

rack.addEventListener('pointerdown', event => {
  const tile = event.target.closest('.tile[data-tile-id]');
  if (tile && inPlay()) startDrag(event, 'tile', tile, Number(tile.dataset.tileId));
});
$('#draw-wall').addEventListener('pointerdown', event => { if (canDraw()) startDrag(event, 'wall', event.currentTarget); });
$('#draw-discard').addEventListener('pointerdown', event => {
  const tile = event.currentTarget.querySelector('.tile');
  if (canDraw() && tile) startDrag(event, 'discard', tile);
});

// Klavye: ıstakadaki taş ← → ile yan yuvaya kayar.
rack.addEventListener('keydown', event => {
  const tile = event.target.closest('.tile[data-tile-id]');
  if (!tile || !['ArrowLeft', 'ArrowRight'].includes(event.key) || !inPlay()) return;
  event.preventDefault();
  const id = Number(tile.dataset.tileId);
  moveTileToSlot(id, saved.layout[id] + (event.key === 'ArrowLeft' ? -1 : 1));
  rack.querySelector(`[data-tile-id="${id}"]`)?.focus({ preventScroll: true });
});

// ---- Maç akışı ------------------------------------------------------------------------------

function recordResults(previous, current) {
  const ended = ['round-over', 'match-over'].includes(current.phase) && !['round-over', 'match-over'].includes(previous.phase);
  if (!ended) return;
  if (current.roundWinner === 0) saved.records.roundWins += 1;
  if (current.matchWinner === 0) {
    saved.records.matchWins += 1;
    if (saved.level === 'hard') saved.records.hardWins += 1;
  }
}

function showResult() {
  cancelBot(); selectedTile = null;
  const total = game.wins.join('–');
  $('#result-kicker').textContent = game.phase === 'match-over' ? 'MAÇ BİTTİ' : 'EL BİTTİ';
  $('#result-title').textContent = game.phase === 'match-over'
    ? game.matchWinner === 0 ? 'Maçı kazandın!' : `${SEAT_NAMES[game.matchWinner]} maçı kazandı.`
    : game.roundWinner === null ? 'Taşlar tükendi' : game.roundWinner === 0 ? 'Eli kazandın!' : `${SEAT_NAMES[game.roundWinner]} eli kazandı.`;
  $('#result-copy').textContent = game.phase === 'match-over'
    ? `${game.target} el galibiyetine ilk ulaşan maçı alır. Son durum (Sen–B1–B2–B3): ${total}.`
    : game.roundWinner === null ? 'Destedeki taşlar bitti; bu el galibiyet sayılmadı.' : `El galibiyetleri (Sen–B1–B2–B3): ${total}.`;
  $('#next-button').textContent = game.phase === 'match-over' ? 'Yeni maç ↗' : 'Sonraki el ↗';
  flow.show('result');
}

function advanceBots() {
  if (!game || !inPlay()) { if (game) showResult(); return; }
  if (game.turn === 0) { render(); return; }
  cancelBot = botDelay(() => {
    const before = game;
    game = botTurn(game, saved.level);
    recordResults(before, game);
    persist();
    if (!inPlay()) showResult();
    else { render(); advanceBots(); }
  }, 650);
}

function beginRound(round) {
  cancelBot(); selectedTile = null; newTileId = null;
  game = round;
  saved.layout = {};
  arrange('series');
  flow.show('game');
  persist(); render();
  advanceBots();
}

$('#start-button').addEventListener('click', () => beginRound(createRound()));
$('#continue-card').addEventListener('click', () => {
  if (!game) return beginRound(createRound());
  if (!inPlay()) return showResult();
  flow.show('game'); render(); advanceBots();
});
$('#menu-button').addEventListener('click', () => { cancelBot(); selectedTile = null; flow.show('menu'); });
$('#draw-wall').addEventListener('click', () => { if (!suppressClick) drawWall(); });
$('#draw-discard').addEventListener('click', () => { if (!suppressClick) takeDiscard(); });
$('#discard-target').addEventListener('click', () => { if (!suppressClick) discardAction(); });
$('#discard-button').addEventListener('click', () => discardAction());
$('#finish-button').addEventListener('click', () => discardAction());
$('#sort-series').addEventListener('click', () => arrange('series'));
$('#sort-pairs').addEventListener('click', () => arrange('pairs'));
$('#next-button').addEventListener('click', () => {
  if (game.phase === 'match-over') return beginRound(createRound());
  beginRound(nextRound(game));
});
$('#result-menu-button').addEventListener('click', () => flow.show('menu'));

bindChoices($('#menu-screen'), saved, (name, value) => { saved[name] = value; persist(); });

const mergeRecords = (a = {}, b = {}) => Object.fromEntries(Object.keys(blankSave().records).map(key => [key, Math.max(Number(a[key]) || 0, Number(b[key]) || 0)]));
const cloudSync = syncGameOnAccountChange('okey', {
  read: () => ({ ...saved, game }),
  write: incoming => {
    saved = { ...blankSave(), ...incoming, layout: incoming.layout || {}, records: mergeRecords(saved.records, incoming.records) };
    game = isValidRound(saved.game) ? saved.game : null;
    cancelBot(); flow.show('menu');
  },
  isValid: incoming => Boolean(incoming && typeof incoming === 'object' && (incoming.game === null || isValidRound(incoming.game)) && incoming.records),
  merge: (local, remote) => ({ ...remote, records: mergeRecords(local.records, remote.records) }),
  counters: current => ({ matchWins: current.records.matchWins, roundWins: current.records.roundWins, hardWins: current.records.hardWins }),
  onStatus: message => { $('#save-state').textContent = message; }
});

if (game) {
  $('#continue-card').hidden = false;
  $('#continue-copy').textContent = `${game.wins[0]}–${game.wins.slice(1).reduce((a, b) => a + b, 0)} el galibiyeti · ${LEVEL_NAMES[saved.level]}`;
}
// Oyun başlamadan da ıstaka yuvaları çizilir; sahne ilk açılışta tam boyuyla durur.
if (game) render(); else rack.replaceChildren(...Array.from({ length: SLOTS }, () => Object.assign(document.createElement('div'), { className: 'slot' })));
flow.show('menu');
