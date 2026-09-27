import {
  createGame, openingRoll, roll, legalMoves, applyMove, undoMove, endTurn, turnDone, nextGame,
  pipCount, isValidGame, chooseSequence
} from './logic.js?v=202609272031';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609272031';
import { confirmDialog } from '../../game-dialog.js?v=202609272031';
import { createFlow, botDelay, bindChoices } from '../../game-flow.js?v=202609272031';
import { rollDie } from '../../rng.js?v=202609272031';

const KEY = 'oyunarasi-tavla-v1';
const LEVEL_NAMES = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };
const SVG = 'http://www.w3.org/2000/svg';

// Tahta geometrisi (viewBox 1020 × 760): 12 sütun, ortada bar, sağda toplama kutusu.
const G = { border: 20, point: 70, bar: 60, height: 760, radius: 31, trayX: 940, trayW: 64 };
const HALF = G.point * 6;
const columnX = column => G.border + column * G.point + (column >= 6 ? G.bar : 0) + G.point / 2;
const BAR_X = G.border + HALF + G.bar / 2;
const pointColumn = index => (index < 12 ? 11 - index : index - 12);
const isTop = index => index >= 12;

const $ = selector => document.querySelector(selector);
const board = $('#board');
const table = $('#table');
const statusElement = $('#status');
const saveElement = $('#save-state');
const rollButton = $('#roll-button');
const confirmButton = $('#confirm-button');
const undoButton = $('#undo-button');
const menuButton = $('#menu-button');
const flow = createFlow({ menu: $('#menu-screen'), game: $('#game-screen'), result: $('#result-screen') });

let saved = load();
let game = saved.game;
let selected = null;
let rolling = false;
let lastMove = null;
let cancelBot = () => {};
let drag = null;

function blankSave() {
  return { game: null, mode: 'bot', level: 'medium', target: 5, records: { matchWins: 0, marsWins: 0, hardWins: 0, matches: 0 } };
}

function load() {
  const fallback = blankSave();
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (!data || typeof data !== 'object') return fallback;
    return {
      ...fallback, ...data,
      game: isValidGame(data.game) ? data.game : null,
      records: { ...fallback.records, ...(data.records || {}) }
    };
  } catch { return fallback; }
}

function persist() {
  saved.game = game;
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { saveElement.textContent = 'Kayıt kullanılamıyor; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save(saved);
}

const botMode = () => saved.mode === 'bot';
const humanTurn = () => game && (!botMode() || game.turn === 0);
const playerName = player => (botMode() ? (player === 0 ? 'Sen' : `Bot (${LEVEL_NAMES[saved.level]})`) : player === 0 ? 'Beyaz' : 'Siyah');

// ---- Çizim ---------------------------------------------------------------------------------

function el(name, attributes = {}, parent = board) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  parent?.append(node);
  return node;
}

function stackPosition(index, slot, total) {
  const spacing = total > 5 ? Math.min(62, (330 - 2 * G.radius) / (total - 1)) : 62;
  const x = columnX(pointColumn(index));
  const offset = G.border + G.radius + 2 + slot * spacing;
  return { x, y: isTop(index) ? offset : G.height - offset };
}

function barPosition(player, slot) {
  const y = G.height / 2 + (player === 0 ? -1 : 1) * (G.radius + 16 + slot * 50);
  return { x: BAR_X, y };
}

function positionOf(place, player, slot, total) {
  if (place === 'bar') return barPosition(player, slot);
  if (place === 'off') return { x: G.trayX + G.trayW / 2, y: player === 0 ? G.height - 60 : 60 };
  return stackPosition(place, slot, total);
}

function drawChecker(x, y, player, extra = '') {
  const group = el('g', { class: `checker p${player} ${extra}`.trim(), transform: `translate(${x} ${y})` });
  el('circle', { r: G.radius, class: 'checker-body' }, group);
  el('circle', { r: G.radius - 9, class: 'checker-ring' }, group);
  return group;
}

function drawDie(x, y, value, used, tone) {
  const group = el('g', { class: `die ${tone}${used ? ' used' : ''}${rolling ? ' rolling' : ''}`, transform: `translate(${x} ${y})` });
  el('rect', { x: -30, y: -30, width: 60, height: 60, rx: 12 }, group);
  const pips = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[value] || [];
  for (const [px, py] of pips) el('circle', { cx: px * 14, cy: py * 14, r: 6 }, group);
}

function render() {
  board.replaceChildren();
  if (!game) return;
  const moves = humanTurn() && !rolling ? legalMoves(game) : [];
  const sources = new Set(moves.map(move => move.from));
  const targets = new Set(moves.filter(move => move.from === selected).map(move => move.to));

  el('rect', { x: 0, y: 0, width: 1020, height: G.height, rx: 26, class: 'frame' });
  el('rect', { x: G.border, y: G.border, width: HALF, height: G.height - 2 * G.border, rx: 6, class: 'felt' });
  el('rect', { x: G.border + HALF + G.bar, y: G.border, width: HALF, height: G.height - 2 * G.border, rx: 6, class: 'felt' });
  el('rect', { x: G.border + HALF, y: G.border, width: G.bar, height: G.height - 2 * G.border, class: 'bar' });
  el('rect', { x: G.trayX, y: G.border, width: G.trayW, height: G.height / 2 - G.border - 8, rx: 8, class: `tray${targets.has('off') && game.turn === 1 ? ' target' : ''}` });
  el('rect', { x: G.trayX, y: G.height / 2 + 8, width: G.trayW, height: G.height / 2 - G.border - 8, rx: 8, class: `tray${targets.has('off') && game.turn === 0 ? ' target' : ''}` });

  for (let index = 0; index < 24; index += 1) {
    const x = columnX(pointColumn(index));
    const top = isTop(index);
    const tip = top ? G.border + 290 : G.height - G.border - 290;
    const base = top ? G.border : G.height - G.border;
    const tone = (pointColumn(index) + (top ? 0 : 1)) % 2 ? 'dark' : 'light';
    const classes = ['point', tone];
    if (selected === index) classes.push('selected');
    if (targets.has(index)) classes.push('target');
    el('path', { d: `M${x - G.point / 2 + 3} ${base} L${x} ${tip} L${x + G.point / 2 - 3} ${base} Z`, class: classes.join(' ') });
    el('text', { x, y: top ? 12 : G.height - 5, class: 'point-number' }).textContent = String(24 - index);
  }

  for (let index = 0; index < 24; index += 1) {
    const total = Math.abs(game.points[index]);
    const player = game.points[index] > 0 ? 0 : 1;
    for (let slot = 0; slot < total; slot += 1) {
      const { x, y } = stackPosition(index, slot, total);
      const topChecker = slot === total - 1;
      const extra = topChecker && sources.has(index) ? (selected === index ? 'selected' : 'movable') : '';
      const checker = drawChecker(x, y, player, extra);
      if (topChecker) {
        checker.dataset.place = String(index);
        if (total > 5) el('text', { class: 'stack-count', y: 7 }, checker).textContent = String(total);
      }
    }
    if (targets.has(index)) {
      const mine = game.points[index] !== 0 && (game.points[index] > 0 ? 0 : 1) === game.turn ? total : 0;
      const { x, y } = stackPosition(index, mine, Math.max(mine + 1, 1));
      el('circle', { cx: x, cy: y, r: G.radius - 4, class: 'ghost' });
    }
  }

  for (const player of [0, 1]) {
    for (let slot = 0; slot < game.bar[player]; slot += 1) {
      const { x, y } = barPosition(player, slot);
      const top = slot === game.bar[player] - 1;
      const checker = drawChecker(x, y, player, top && sources.has('bar') && game.turn === player ? (selected === 'bar' ? 'selected' : 'movable') : '');
      if (top) checker.dataset.place = 'bar';
    }
    for (let slot = 0; slot < game.off[player]; slot += 1) {
      const y = player === 0 ? G.height - G.border - 12 - slot * 21 : G.border + 12 + slot * 21;
      el('rect', { x: G.trayX + 6, y: y - 9, width: G.trayW - 12, height: 18, rx: 6, class: `slab p${player}` });
    }
  }

  drawDice();
  drawOpening();
  animateLastMove();
}

function drawDice() {
  if (!game.dice.length) return;
  const tone = `p${game.turn}`;
  const x = game.turn === 0 ? G.border + HALF + G.bar + HALF / 2 : G.border + HALF / 2;
  const used = [...game.left];
  const shown = game.dice[0] === game.dice[1] ? [game.dice[0], game.dice[0]] : game.dice;
  shown.forEach((value, index) => {
    const at = used.indexOf(value);
    const available = at >= 0;
    if (available) used.splice(at, 1);
    drawDie(x + (index ? 40 : -40), G.height / 2, value, !available && !rolling, tone);
  });
  if (game.dice[0] === game.dice[1] && !rolling) {
    el('text', { x, y: G.height / 2 + 62, class: 'dice-note' }).textContent = `× ${game.left.length} hamle`;
  }
}

function drawOpening() {
  if (game.phase !== 'opening' || !game.opening[0]) return;
  drawDie(G.border + HALF + G.bar + HALF / 2, G.height / 2, game.opening[0], false, 'p0');
  drawDie(G.border + HALF / 2, G.height / 2, game.opening[1], false, 'p1');
}

// Son hamlede taşınan pul eski yerinden yeni yerine kayarak gelir.
function animateLastMove() {
  if (!lastMove || matchMedia('(prefers-reduced-motion: reduce)').matches) { lastMove = null; return; }
  const { move, player } = lastMove;
  lastMove = null;
  const destination = move.to === 'off' ? null : board.querySelector(`.checker[data-place="${move.to}"]`);
  if (!destination) return;
  const fromTotal = move.from === 'bar' ? 0 : Math.abs(game.points[move.from]);
  const from = positionOf(move.from, player, move.from === 'bar' ? game.bar[player] : fromTotal, fromTotal + 1);
  const target = destination.getAttribute('transform');
  destination.setAttribute('transform', `translate(${from.x} ${from.y})`);
  destination.classList.add('sliding');
  requestAnimationFrame(() => requestAnimationFrame(() => destination.setAttribute('transform', target)));
}

// ---- Durum ve metinler ------------------------------------------------------------------------

function updateChrome() {
  const inGame = flow.current === 'game' || flow.current === 'result';
  menuButton.hidden = !inGame;
  const score = game?.match.score || [0, 0];
  $('#score-a-label').textContent = botMode() ? 'SEN' : 'BEYAZ';
  $('#score-b-label').textContent = botMode() ? 'BOT' : 'SİYAH';
  $('#score-a').textContent = score[0];
  $('#score-b').textContent = score[1];
  $('#score-target').textContent = `${game?.match.target || saved.target} puan`;

  const human = humanTurn();
  rollButton.hidden = !game || rolling || !human || !['opening', 'roll'].includes(game.phase);
  rollButton.textContent = game?.phase === 'opening' ? 'Kim başlıyor?' : 'Zar at';
  const done = game?.phase === 'move' && human && !rolling && turnDone(game);
  confirmButton.hidden = !done || game.turnMax === 0;
  undoButton.hidden = !(game?.phase === 'move' && human && !rolling && game.moves.length);
  $('#controls').classList.toggle('side-p1', Boolean(game) && game.turn === 1 && !botMode() && game.phase !== 'opening');
  if (flow.current === 'game') statusElement.textContent = statusText();
  $('#continue-card').hidden = !game || game.match.winner !== null;
  if (game) $('#continue-copy').textContent = `${saved.mode === 'bot' ? `Bota karşı (${LEVEL_NAMES[saved.level]})` : 'Aynı cihaz'} · ${score[0]}–${score[1]} · ${game.match.target} puanlık maç`;
}

function statusText() {
  if (!game) return 'Bir oyun modu seç.';
  const name = playerName(game.turn);
  if (game.phase === 'opening') {
    const [a, b] = game.opening;
    if (a && a === b) return `İkiniz de ${a} attınız; zarlar yeniden atılıyor.`;
    return botMode() ? 'Büyük zarı atan başlar. Zarını at!' : 'Büyük zarı atan başlar. Kim başlıyor?';
  }
  if (game.phase === 'roll') {
    const [a, b] = game.opening;
    const fresh = a && b && a !== b && pipCount(game, 0) === 167 && pipCount(game, 1) === 167;
    const opener = fresh ? `${playerName(a > b ? 0 : 1)} başlıyor (${a}–${b}). ` : '';
    if (!humanTurn()) return `${opener}${name} zar atıyor…`;
    return `${opener}${botMode() ? 'Sıra sende: zarı at.' : `Sıra ${name} oyuncuda: zarı at.`}`;
  }
  if (game.phase === 'move') {
    if (rolling) return `${name} zar atıyor…`;
    if (!humanTurn()) return `${name} düşünüyor…`;
    if (game.turnMax === 0) return `${game.dice.join('–')} attın ama oynanacak hamle yok; sıra geçiyor.`;
    if (turnDone(game)) return 'Hamlelerin tamam. Onayla ya da geri al.';
    if (game.bar[game.turn]) return 'Kırık pulun var: önce bardan gir.';
    const pip = `Pip: ${pipCount(game, game.turn)}`;
    return selected === null ? `Oynatmak istediğin pulu seç. ${pip}` : `Pulu parlayan haneye taşı. ${pip}`;
  }
  return '';
}

// ---- Akış -----------------------------------------------------------------------------------

function startMatch(mode) {
  cancelBot();
  saved.mode = mode;
  game = createGame(saved.target);
  selected = null;
  flow.show('game');
  persist();
  refresh();
  advance();
}

function refresh() {
  render();
  updateChrome();
}

// Sıradaki otomatik adım: bot hamlesi, açılış zarı, hamlesi olmayan oyuncunun pas geçmesi, oyun sonu.
function advance() {
  cancelBot();
  if (!game || flow.current !== 'game') return;
  if (game.phase === 'over') { cancelBot = botDelay(showResult, 900); return; }
  if (game.phase === 'move' && game.turnMax === 0 && !rolling) {
    cancelBot = botDelay(() => { game = endTurn(game); persist(); refresh(); advance(); }, 1500);
    return;
  }
  if (humanTurn()) return;
  if (game.phase === 'roll') cancelBot = botDelay(() => doRoll(), 700);
  else if (game.phase === 'move' && !rolling) cancelBot = botDelay(playBotTurn, 500);
}

function doRoll() {
  if (!game || rolling) return;
  if (!['opening', 'roll'].includes(game.phase)) return;
  rolling = true;
  selected = null;
  const opening = game.phase === 'opening';
  const first = rollDie();
  const second = rollDie();
  const spin = setInterval(() => {
    if (opening) game = { ...game, opening: [rollDie(), rollDie()] };
    else game = { ...game, dice: [rollDie(), rollDie()] };
    render();
  }, 70);
  refresh();
  setTimeout(() => {
    clearInterval(spin);
    rolling = false;
    if (opening) {
      game = openingRoll({ ...game, opening: [0, 0] }, first, second);
    } else {
      game = roll({ ...game, dice: [] }, first, second);
    }
    persist();
    refresh();
    advance();
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 520);
}

function playBotTurn() {
  const sequence = chooseSequence(game, saved.level);
  const stepMove = () => {
    const move = sequence.shift();
    if (!move || game.phase !== 'move') {
      if (game.phase === 'move') game = endTurn(game);
      persist();
      refresh();
      advance();
      return;
    }
    makeMove(move);
    cancelBot = botDelay(stepMove, 480);
  };
  stepMove();
}

function makeMove(move) {
  const player = game.turn;
  game = applyMove(game, move);
  lastMove = { move, player };
  selected = null;
  if (game.phase === 'over') recordResult();
  persist();
  refresh();
  if (game.phase === 'over') advance();
}

// Oyun biter bitmez (bir kez) rekorlara işlenir.
function recordResult() {
  const winner = game.winner;
  if (botMode() && winner === 0 && game.gamePoints === 2) saved.records.marsWins += 1;
  if (game.match.winner === null) return;
  saved.records.matches += 1;
  if (botMode() && winner === 0) {
    saved.records.matchWins += 1;
    if (saved.level === 'hard') saved.records.hardWins += 1;
  }
}

function humanMove(to) {
  const move = legalMoves(game).find(option => option.from === selected && option.to === to);
  if (!move) return false;
  makeMove(move);
  const next = legalMoves(game);
  const sources = new Set(next.map(option => option.from));
  if (sources.size === 1 && next.length) { selected = [...sources][0]; refresh(); }
  return true;
}

function select(place) {
  const moves = legalMoves(game);
  if (selected !== null && moves.some(move => move.from === selected && move.to === place)) { humanMove(place); return; }
  selected = moves.some(move => move.from === place) && selected !== place ? place : null;
  refresh();
}

function confirmTurn() {
  if (!game || !turnDone(game) || !humanTurn()) return;
  game = endTurn(game);
  selected = null;
  persist();
  refresh();
  advance();
}

function undo() {
  if (!game || game.phase !== 'move' || !game.moves.length || !humanTurn()) return;
  game = undoMove(game);
  selected = null;
  persist();
  refresh();
}

function showResult() {
  const winner = game.winner;
  const matchOver = game.match.winner !== null;
  const humanWon = !botMode() || winner === 0;
  const mars = game.gamePoints === 2 ? ' Mars! 2 puan.' : ' 1 puan.';
  $('#result-kicker').textContent = matchOver ? `${game.match.target} PUANLIK MAÇ BİTTİ` : `OYUN ${game.match.games} · SKOR ${game.match.score[0]}–${game.match.score[1]}`;
  $('#result-title').textContent = botMode()
    ? (matchOver ? (humanWon ? 'Maçı kazandın!' : 'Maçı bot aldı') : (humanWon ? 'Bu oyun senin!' : 'Bu oyunu bot aldı'))
    : `${playerName(winner)} ${matchOver ? 'maçı' : 'oyunu'} kazandı!`;
  $('#result-copy').textContent = matchOver
    ? `Son skor ${game.match.score[0]}–${game.match.score[1]}.${game.gamePoints === 2 ? ' Maç mars ile bitti!' : ''}`
    : `${playerName(winner)} tüm pulları topladı.${mars} Maç ${game.match.target} puana kadar sürüyor.`;
  $('#next-button').textContent = matchOver ? 'Yeni maç ↗' : 'Sonraki oyun ↗';
  flow.show('result');
  statusElement.textContent = matchOver ? 'Maç bitti.' : 'Sıradaki oyuna hazır mısın?';
  updateChrome();
}

function next() {
  if (!game) return;
  if (game.match.winner !== null) { startMatch(saved.mode); return; }
  game = nextGame(game);
  flow.show('game');
  persist();
  refresh();
  advance();
}

function openMenu() {
  cancelBot();
  rolling = false;
  selected = null;
  flow.show('menu');
  statusElement.textContent = game && game.match.winner === null ? 'Maçın kaydedildi; istediğinde devam edebilirsin.' : 'Bir oyun modu seç.';
  updateChrome();
}

function resume() {
  if (!game) return;
  flow.show(game.phase === 'over' ? 'result' : 'game');
  if (game.phase === 'over') showResult(); else { refresh(); advance(); }
}

// ---- Girdi ----------------------------------------------------------------------------------

function svgPoint(event) {
  const rect = board.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * (1020 / rect.width), y: (event.clientY - rect.top) * (G.height / rect.height) };
}

// Tahtadaki bir noktanın karşılık geldiği yer: hane, bar ya da toplama kutusu.
function placeAt({ x, y }) {
  if (x >= G.trayX - 6) return 'off';
  if (Math.abs(x - BAR_X) <= G.bar / 2) return 'bar';
  const left = x < G.border + HALF;
  const inner = left ? x - G.border : x - G.border - HALF - G.bar;
  const column = Math.max(0, Math.min(5, Math.floor(inner / G.point))) + (left ? 0 : 6);
  return y < G.height / 2 ? column + 12 : 11 - column;
}

board.addEventListener('pointerdown', event => {
  if (!humanTurn() || rolling || game.phase !== 'move') return;
  const place = placeAt(svgPoint(event));
  if (selected !== null && legalMoves(game).some(move => move.from === selected && move.to === place)) { humanMove(place); return; }
  if (!legalMoves(game).some(move => move.from === place)) { if (selected !== null) { selected = null; refresh(); } return; }
  const wasSelected = selected === place;
  selected = place;
  refresh();
  drag = { place, wasSelected, start: svgPoint(event), moved: false, ghost: null, id: event.pointerId };
  board.setPointerCapture?.(event.pointerId);
});

board.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  const at = svgPoint(event);
  if (!drag.moved && Math.hypot(at.x - drag.start.x, at.y - drag.start.y) < 14) return;
  drag.moved = true;
  if (!drag.ghost) {
    drag.ghost = drawChecker(at.x, at.y, game.turn, 'dragging');
    board.querySelector(`.checker[data-place="${drag.place}"]`)?.classList.add('lifted');
  }
  drag.ghost.setAttribute('transform', `translate(${at.x} ${at.y})`);
});

function endDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const current = drag;
  drag = null;
  if (current.moved) {
    const place = placeAt(svgPoint(event));
    if (!humanMove(place)) refresh();
  } else if (current.wasSelected) {
    selected = null;
    refresh();
  } else {
    // Tek hedefi olan pula dokunmak onu doğrudan oynatır.
    const targets = [...new Set(legalMoves(game).filter(move => move.from === current.place).map(move => move.to))];
    if (targets.length === 1 && event.type === 'pointerup' && matchMedia('(pointer: coarse)').matches) humanMove(targets[0]);
  }
}
board.addEventListener('pointerup', endDrag);
board.addEventListener('pointercancel', endDrag);

rollButton.addEventListener('click', doRoll);
confirmButton.addEventListener('click', confirmTurn);
undoButton.addEventListener('click', undo);
menuButton.addEventListener('click', openMenu);
$('#result-menu-button').addEventListener('click', openMenu);
$('#next-button').addEventListener('click', next);
$('#continue-card').addEventListener('click', resume);

document.querySelectorAll('.game-mode[data-mode]').forEach(card => card.addEventListener('click', async () => {
  const mode = card.dataset.mode;
  if (mode === 'online') return;
  if (game && game.match.winner === null && (game.match.games > 0 || game.moves.length || game.phase === 'move' || pipCount(game, 0) !== 167)) {
    const ok = await confirmDialog({ title: 'Yeni maç başlasın mı?', message: 'Yarım kalan maçın silinecek.', confirmLabel: 'Yeni maç' });
    if (!ok) return;
  }
  startMatch(mode);
}));

bindChoices($('#menu-screen'), saved, () => { persist(); updateChrome(); });

document.addEventListener('keydown', event => {
  if (flow.current !== 'game' || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, .game-confirm')) return;
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    if (!rollButton.hidden) doRoll();
    else if (!confirmButton.hidden) confirmTurn();
  } else if (event.key === 'Backspace' || event.key === 'u' || event.key === 'U') {
    event.preventDefault();
    undo();
  } else if (event.key === 'Escape' && selected !== null) {
    selected = null;
    refresh();
  }
});

// ---- Hesap senkronu ---------------------------------------------------------------------------

const mergeRecords = (a = {}, b = {}) => Object.fromEntries(
  Object.keys(blankSave().records).map(key => [key, Math.max(Number(a[key]) || 0, Number(b[key]) || 0)])
);

const cloudSync = syncGameOnAccountChange('tavla', {
  read: () => ({ ...saved, game }),
  write: incoming => {
    saved = { ...blankSave(), ...incoming, records: mergeRecords(saved.records, incoming.records) };
    game = isValidGame(saved.game) ? saved.game : null;
    cancelBot();
    if (flow.current !== 'menu') { if (game) resume(); else openMenu(); } else updateChrome();
  },
  isValid: incoming => Boolean(incoming && typeof incoming === 'object' && (incoming.game === null || isValidGame(incoming.game)) && incoming.records),
  merge: (local, remote) => ({ ...remote, records: mergeRecords(local.records, remote.records) }),
  counters: current => ({ matchWins: current.records.matchWins, marsWins: current.records.marsWins, hardWins: current.records.hardWins }),
  onStatus: message => { saveElement.textContent = message; }
});

flow.show('menu');
updateChrome();
