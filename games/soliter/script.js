import { SUITS, RANKS, DRAW_MODES, createGame, drawCards, moveCards, bestTarget, undo, canAutoComplete, autoStep, pickCards, suitOf, rankOf, isRed, cardName, elapsedMilliseconds, pauseGame, resumeGame, isValidGame } from './logic.js?v=202609270005';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609270005';

const KEY = 'oyunarasi-soliter-v1';
const tableElement = document.querySelector('#board');
const frameElement = document.querySelector('.board-frame');
const statusElement = document.querySelector('#status');
const saveElement = document.querySelector('#save-state');
const drawPicker = document.querySelector('#draw-mode');
const timerElement = document.querySelector('#timer');
const undoButton = document.querySelector('#undo-button');
const autoButton = document.querySelector('#auto-button');
const overlay = document.querySelector('#game-overlay');

const emptyRecord = () => ({ bestMs: null, bestMoves: null });
let records = { 1: emptyRecord(), 3: emptyRecord(), wins: 0 };
let game = loadGame();
let size = { w: 76, h: 106, gap: 10 };
let drag = null;            // { source, elements, pointerId, startX, startY, offsetX, offsetY, moved, ghost }
let autoTimer = null;
let stockElement, wasteElement, foundationElements, columnElements;

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.records) records = mergeRecords(records, saved.records);
    if (isValidGame(saved?.game)) return resumeGame(saved.game);
  } catch {}
  return createGame(1);
}

function saveGame() {
  const stored = { game: pauseGame(game), records };
  try { localStorage.setItem(KEY, JSON.stringify(stored)); saveElement.textContent = 'Oyun bu cihazda saklanıyor.'; }
  catch { saveElement.textContent = 'Kayıt kullanılamıyor; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save(cloudState());
}

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function buildTable() {
  stockElement = Object.assign(document.createElement('button'), { type: 'button', className: 'pile stock' });
  stockElement.setAttribute('aria-label', 'Deste');
  wasteElement = Object.assign(document.createElement('div'), { className: 'pile waste' });
  const spacer = document.createElement('div');
  foundationElements = SUITS.map((suit, index) => {
    const pile = Object.assign(document.createElement('div'), { className: 'pile foundation' });
    pile.dataset.suit = suit;
    pile.dataset.index = index;
    return pile;
  });
  columnElements = Array.from({ length: 7 }, (_, index) => {
    const column = Object.assign(document.createElement('div'), { className: 'column' });
    column.dataset.index = index;
    return column;
  });
  tableElement.replaceChildren(stockElement, wasteElement, spacer, ...foundationElements, ...columnElements);
}

// Card size follows the available width; tall columns squeeze their spacing to stay on screen.
function measure() {
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const gap = mobile ? 5 : 10;
  const width = frameElement.clientWidth - (mobile ? 24 : 28);
  const w = Math.max(38, Math.min(96, Math.floor((width - gap * 6) / 7)));
  size = { w, h: Math.round(w * 1.4), gap, mobile };
  tableElement.style.setProperty('--card-w', `${w}px`);
  tableElement.style.setProperty('--card-h', `${size.h}px`);
  tableElement.style.setProperty('--gap', `${gap}px`);
}

function columnOffsets(index) {
  const column = game.tableau[index];
  const down = game.down[index];
  let downStep = size.h * 0.1;
  let upStep = size.h * (size.mobile ? 0.3 : 0.26);
  const limit = Math.max(size.h * 3.4, window.innerHeight * 0.62 - size.h * 1.6);
  const needed = downStep * down + upStep * Math.max(0, column.length - down - 1);
  if (needed > limit) {
    const scale = limit / needed;
    downStep *= Math.max(scale, 0.6);
    upStep = Math.max((limit - downStep * down) / Math.max(1, column.length - down - 1), size.h * 0.17);
  }
  let top = 0;
  return column.map((_, position) => {
    const at = top;
    top += position < down ? downStep : upStep;
    return at;
  });
}

function cardElement(card, faceUp, place) {
  // Face-down cards are plain boxes (the stock is itself a button); face-up cards are buttons.
  const element = document.createElement(faceUp ? 'button' : 'div');
  if (!faceUp) {
    element.className = 'card back';
    element.setAttribute('aria-hidden', 'true');
  } else {
    element.type = 'button';
    const rank = RANKS[rankOf(card) - 1];
    const suit = SUITS[suitOf(card)];
    element.className = `card${isRed(card) ? ' red' : ''}`;
    element.innerHTML = `<span class="corner">${rank}<small>${suit}</small></span><span class="pip">${suit}</span><span class="corner end">${rank}<small>${suit}</small></span>`;
    element.setAttribute('aria-label', cardName(card));
  }
  Object.assign(element.dataset, place);
  return element;
}

function render() {
  // Stock: one face-down card stands for the whole pile.
  stockElement.replaceChildren(...(game.stock.length ? [cardElement(game.stock.at(-1), false, {})] : []));
  stockElement.classList.toggle('empty', !game.stock.length);
  stockElement.disabled = game.status !== 'playing' || (!game.stock.length && !game.waste.length);
  stockElement.setAttribute('aria-label', game.stock.length ? `Deste, ${game.stock.length} kart. Kart çek.` : 'Deste boş. Açık kartları geri çevir.');

  const shown = game.waste.slice(game.draw === 3 ? -3 : -1);
  wasteElement.replaceChildren(...shown.map((card, position) => {
    const element = cardElement(card, true, { from: 'waste' });
    element.style.left = `${position * size.w * 0.24}px`;
    if (position < shown.length - 1) element.tabIndex = -1;
    return element;
  }));

  foundationElements.forEach((pile, index) => {
    const cards = game.foundations[index];
    pile.replaceChildren(...cards.slice(-2).map(card => cardElement(card, true, { from: 'foundation', index })));
    pile.setAttribute('aria-label', `${SUITS[index]} yeri, ${cards.length} kart`);
  });

  let tallest = 0;
  columnElements.forEach((columnElement, index) => {
    const offsets = columnOffsets(index);
    const column = game.tableau[index];
    columnElement.replaceChildren(...column.map((card, position) => {
      const element = cardElement(card, position >= game.down[index], { from: 'tableau', index, card: position });
      element.style.top = `${offsets[position]}px`;
      return element;
    }));
    const height = (offsets.at(-1) ?? 0) + size.h;
    columnElement.style.height = `${height}px`;
    tallest = Math.max(tallest, height);
  });
  tableElement.style.minHeight = `${size.h + 18 + Math.max(tallest, size.h * 3.4)}px`;

  document.querySelector('#moves').textContent = game.moves;
  timerElement.textContent = formatTime(elapsedMilliseconds(game));
  drawPicker.value = String(game.draw);
  undoButton.disabled = game.status !== 'playing' || !game.history.length;
  autoButton.hidden = !canAutoComplete(game) || Boolean(autoTimer);
  const record = records[game.draw];
  document.querySelector('#best').textContent = `${DRAW_MODES[game.draw].label} rekoru: ${record.bestMs == null ? '—' : `${formatTime(record.bestMs)} · ${record.bestMoves} hamle`}`;
  overlay.classList.toggle('hidden', game.status !== 'won');
  if (game.status === 'won') {
    document.querySelector('#overlay-copy').textContent = `${formatTime(game.elapsedMs)} sürede, ${game.moves} hamlede bitirdin.${record.bestMs === game.elapsedMs ? ' Yeni rekor!' : ''}`;
  }
}

function apply(next, message) {
  if (!next) return false;
  const wasPlaying = game.status === 'playing';
  game = next;
  if (wasPlaying && game.status === 'won') {
    stopAuto();
    const record = records[game.draw];
    records = {
      ...records,
      wins: records.wins + 1,
      [game.draw]: {
        bestMs: record.bestMs == null ? game.elapsedMs : Math.min(record.bestMs, game.elapsedMs),
        bestMoves: record.bestMoves == null ? game.moves : Math.min(record.bestMoves, game.moves)
      }
    };
    statusElement.textContent = `Tebrikler! ${formatTime(game.elapsedMs)} sürede, ${game.moves} hamlede bitirdin.`;
  } else if (message) {
    statusElement.textContent = message;
  } else if (canAutoComplete(game) && !autoTimer) {
    statusElement.textContent = 'Bütün kartlar açık! “Otomatik bitir” ile oyunu tamamlayabilirsin.';
  }
  saveGame();
  render();
  return true;
}

function sourceFrom(element) {
  const { from, index, card } = element.dataset;
  if (from === 'waste') return element === wasteElement.lastElementChild ? { type: 'waste' } : null;
  if (from === 'foundation') return element === foundationElements[index].lastElementChild ? { type: 'foundation', index: Number(index) } : null;
  if (from === 'tableau') return { type: 'tableau', index: Number(index), card: Number(card) };
  return null;
}

function describe(target) {
  return target.type === 'foundation' ? 'yerine dizildi' : `${target.index + 1}. sütuna taşındı`;
}

function tapCard(source) {
  if (game.status !== 'playing' || autoTimer) return;
  const target = bestTarget(game, source);
  const cards = pickCards(game, source);
  if (!target) {
    statusElement.textContent = cards.length ? `${cardName(cards[0])} için uygun yer yok.` : 'Kapalı kartlar oynanamaz.';
    return;
  }
  apply(moveCards(game, source, target), `${cardName(cards[0])} ${describe(target)}.`);
}

function draw() {
  if (game.status !== 'playing' || autoTimer) return;
  const recycling = !game.stock.length;
  apply(drawCards(game), recycling ? 'Açık kartlar desteye geri çevrildi.' : null);
}

// Dragging: the pressed card and every card on top of it travel together.
function dropTarget(x, y) {
  const cardX = x - drag.offsetX + size.w / 2;
  const cardY = y - drag.offsetY + size.h / 3;
  const cards = pickCards(game, drag.source);
  if (cards.length === 1) {
    const pile = foundationElements.find(element => {
      const rect = element.getBoundingClientRect();
      return cardX >= rect.left - size.gap && cardX <= rect.right + size.gap && cardY >= rect.top - size.h / 2 && cardY <= rect.bottom + size.h / 3;
    });
    if (pile) return { type: 'foundation', index: Number(pile.dataset.index) };
  }
  const column = columnElements.find(element => {
    const rect = element.getBoundingClientRect();
    return cardX >= rect.left - size.gap / 2 && cardX <= rect.right + size.gap / 2 && cardY >= rect.top - size.h / 3;
  });
  return column ? { type: 'tableau', index: Number(column.dataset.index) } : null;
}

function liftedElements(source, pressed) {
  if (source.type !== 'tableau') return [pressed];
  return [...columnElements[source.index].children].slice(source.card);
}

function positionGhost(event) {
  drag.ghost.style.transform = `translate(${event.clientX - drag.offsetX}px, ${event.clientY - drag.offsetY}px)`;
}

function highlight(target) {
  document.querySelectorAll('.drop-ok').forEach(element => element.classList.remove('drop-ok'));
  if (!target) return;
  const probe = moveCards(game, drag.source, target);
  if (probe) (target.type === 'foundation' ? foundationElements[target.index] : columnElements[target.index]).classList.add('drop-ok');
}

tableElement.addEventListener('pointerdown', event => {
  if (event.button > 0 || drag || autoTimer || game.status !== 'playing') return;
  const pressed = event.target.closest('.card');
  if (!pressed || pressed.classList.contains('back') || pressed.closest('.stock')) return;
  const source = sourceFrom(pressed);
  if (!source) return;
  event.preventDefault();
  const rect = pressed.getBoundingClientRect();
  drag = { source, pressed, elements: liftedElements(source, pressed), pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, moved: false, ghost: null };
  tableElement.setPointerCapture(event.pointerId);
});

tableElement.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.moved) {
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    drag.moved = true;
    const ghost = document.createElement('div');
    ghost.className = 'drag-stack';
    ghost.style.setProperty('--card-w', `${size.w}px`);
    ghost.style.setProperty('--card-h', `${size.h}px`);
    const baseTop = parseFloat(drag.elements[0].style.top) || 0;
    drag.elements.forEach(element => {
      const copy = element.cloneNode(true);
      copy.style.top = `${(parseFloat(element.style.top) || 0) - baseTop}px`;
      copy.style.left = '0px';
      ghost.append(copy);
      element.classList.add('lifted');
    });
    document.body.append(ghost);
    drag.ghost = ghost;
  }
  positionGhost(event);
  highlight(dropTarget(event.clientX, event.clientY));
});

function endDrag(event, cancelled = false) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const current = drag;
  drag = null;
  document.querySelectorAll('.drop-ok').forEach(element => element.classList.remove('drop-ok'));
  current.ghost?.remove();
  current.elements.forEach(element => element.classList.remove('lifted'));
  if (cancelled) return;
  if (!current.moved) { tapCard(current.source); return; }
  drag = current;
  const target = dropTarget(event.clientX, event.clientY);
  drag = null;
  const cards = pickCards(game, current.source);
  const moved = target && apply(moveCards(game, current.source, target), `${cardName(cards[0])} ${describe(target)}.`);
  if (!moved) statusElement.textContent = 'Kart oraya konamaz. Büyükten küçüğe, renkleri değiştirerek diz.';
}

tableElement.addEventListener('pointerup', event => endDrag(event));
tableElement.addEventListener('pointercancel', event => endDrag(event, true));
tableElement.addEventListener('click', event => {
  // Keyboard users press Enter or Space on a card (pointer taps are handled on pointerup).
  if (event.detail !== 0) return;
  const pressed = event.target.closest('.card');
  if (pressed && !pressed.closest('.stock') && !pressed.classList.contains('back')) {
    const source = sourceFrom(pressed);
    if (source) tapCard(source);
  }
});
tableElement.addEventListener('contextmenu', event => event.preventDefault());

function stopAuto() {
  clearInterval(autoTimer);
  autoTimer = null;
}

function autoComplete() {
  if (!canAutoComplete(game) || autoTimer) return;
  statusElement.textContent = 'Kartlar yerine diziliyor…';
  autoTimer = setInterval(() => {
    const next = autoStep(game);
    if (!next) { stopAuto(); render(); return; }
    apply(next, 'Kartlar yerine diziliyor…');
  }, 90);
  render();
}

function startNew(draw) {
  const inProgress = game.status === 'playing' && game.moves > 0;
  if (inProgress && !window.confirm('Devam eden oyun silinsin ve yeni oyun başlasın mı?')) { drawPicker.value = String(game.draw); return; }
  stopAuto();
  game = createGame(Number(draw));
  statusElement.textContent = `Yeni oyun: ${DRAW_MODES[game.draw].label} çekiş. Kartları sürükle ya da dokun.`;
  saveGame();
  render();
}

buildTable();
stockElement.addEventListener('click', draw);
document.querySelector('#new-game').addEventListener('click', () => startNew(drawPicker.value));
document.querySelector('#overlay-new-button').addEventListener('click', () => startNew(drawPicker.value));
drawPicker.addEventListener('change', () => startNew(drawPicker.value));
undoButton.addEventListener('click', () => { if (!autoTimer) apply(undo(game), 'Son hamle geri alındı.'); });
autoButton.addEventListener('click', autoComplete);

document.addEventListener('keydown', event => {
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLocaleLowerCase('tr-TR');
  if (key === 'z') { event.preventDefault(); undoButton.click(); }
  else if (key === 'd') { event.preventDefault(); draw(); }
  else if (key === 'a') { event.preventDefault(); autoComplete(); }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveGame();
  else { game = resumeGame(pauseGame(game)); render(); }
});
window.addEventListener('pagehide', saveGame);
setInterval(() => { if (game.status === 'playing') timerElement.textContent = formatTime(elapsedMilliseconds(game)); }, 500);
new ResizeObserver(() => { const before = size.w; measure(); if (size.w !== before || !tableElement.children.length) render(); }).observe(frameElement);

// Firestore cannot store arrays inside arrays (the columns), so the cloud copy keeps the game as JSON text.
function cloudState() {
  return { gameJson: JSON.stringify(pauseGame(game)), records };
}

function parseCloudGame(incoming) {
  try { const parsed = JSON.parse(incoming?.gameJson); return isValidGame(parsed) ? parsed : null; }
  catch { return null; }
}

const cloudSync = syncGameOnAccountChange('soliter', {
  read: cloudState,
  write: incoming => { stopAuto(); game = resumeGame(parseCloudGame(incoming)); records = mergeRecords(records, incoming.records); render(); },
  isValid: incoming => Boolean(incoming && typeof incoming.gameJson === 'string' && parseCloudGame(incoming) && incoming.records && typeof incoming.records === 'object'),
  merge: (local, remote) => ({ gameJson: remote.gameJson, records: mergeRecords(local.records, remote.records) }),
  getStats: current => ({ draw1: current.records[1], draw3: current.records[3] }),
  counters: current => ({ wins: Number(current.records?.wins) || 0 }),
  onStatus: message => { saveElement.textContent = message; }
});

function mergeRecords(local, remote) {
  const least = (a, b) => (Number.isFinite(a) ? (Number.isFinite(b) ? Math.min(a, b) : a) : Number.isFinite(b) ? b : null);
  const merged = { wins: Math.max(Number(local?.wins) || 0, Number(remote?.wins) || 0) };
  for (const draw of [1, 3]) {
    merged[draw] = { bestMs: least(local?.[draw]?.bestMs, remote?.[draw]?.bestMs), bestMoves: least(local?.[draw]?.bestMoves, remote?.[draw]?.bestMoves) };
  }
  return merged;
}

measure();
render();
if (game.status === 'playing') statusElement.textContent = game.moves ? 'Kaldığın yerden devam et.' : 'Kartları sürükle ya da dokun. Desteye dokunarak kart çek.';
