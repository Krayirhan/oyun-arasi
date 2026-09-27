import { createRound, nextRound, drawFromWall, drawDiscard, discardTile, botTurn, canFinish, sortHand, isValidRound } from './logic.js?v=202609272122';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609272122';
import { createFlow, botDelay, bindChoices } from '../../game-flow.js?v=202609272122';

const KEY = 'oyunarasi-okey-v1';
const LEVEL_NAMES = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };
const COLORS = ['red', 'blue', 'yellow', 'black'];
const $ = selector => document.querySelector(selector);
const flow = createFlow({ menu: $('#menu-screen'), game: $('#game-screen'), result: $('#result-screen') });

function blankSave() { return { game: null, level: 'medium', records: { matchWins: 0, roundWins: 0, hardWins: 0 } }; }
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    return { ...blankSave(), ...(data || {}), game: isValidRound(data?.game) ? data.game : null,
      records: { ...blankSave().records, ...(data?.records || {}) } };
  } catch { return blankSave(); }
}

let saved = load();
let game = saved.game;
let selectedTile = null;
let draggedTile = null;
let cancelBot = () => {};
const setStatus = message => { $('#status').textContent = message; };

function persist() {
  saved.game = game;
  try { localStorage.setItem(KEY, JSON.stringify(saved)); }
  catch { $('#save-state').textContent = 'Kayıt yapılamadı; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save(saved);
}

function tileView(tile, { hidden = false, selected = false, draggable = false, onClick } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  if (hidden) {
    button.className = 'tile tile-back';
    button.textContent = '◆';
    button.tabIndex = -1;
    button.setAttribute('aria-hidden', 'true');
    return button;
  }
  const face = tile.fake ? game.joker : tile;
  const wild = !tile.fake && tile.color === game.joker.color && tile.number === game.joker.number;
  button.className = `tile ${COLORS[face.color]}${tile.fake ? ' fake' : ''}${wild ? ' joker' : ''}${selected ? ' is-selected' : ''}`;
  button.dataset.tileId = tile.id;
  button.draggable = draggable;
  button.setAttribute('aria-label', tile.fake ? `Sahte okey, ${face.number} ${COLORS[face.color]}` : `${face.number} ${COLORS[face.color]}${wild ? ', okey' : ''}`);
  button.innerHTML = `<span>${tile.fake ? '✦' : face.number}</span><i class="tile-dot"></i>`;
  if (onClick) button.addEventListener('click', onClick);
  if (draggable) {
    button.addEventListener('dragstart', event => { draggedTile = tile.id; button.classList.add('dragging'); event.dataTransfer?.setData('text/plain', String(tile.id)); });
    button.addEventListener('dragend', () => { draggedTile = null; button.classList.remove('dragging'); });
    button.addEventListener('dragover', event => { event.preventDefault(); button.classList.add('drag-over'); });
    button.addEventListener('dragleave', () => button.classList.remove('drag-over'));
    button.addEventListener('drop', event => {
      event.preventDefault(); button.classList.remove('drag-over');
      const fromId = Number(event.dataTransfer?.getData('text/plain') || draggedTile);
      reorderRack(fromId, tile.id);
    });
  }
  return button;
}

function reorderRack(fromId, toId) {
  if (!game || fromId === toId || game.phase !== 'discard' || game.turn !== 0) return;
  const hand = game.hands[0];
  const from = hand.findIndex(tile => tile.id === fromId);
  const to = hand.findIndex(tile => tile.id === toId);
  if (from < 0 || to < 0) return;
  const nextHand = [...hand];
  const [tile] = nextHand.splice(from, 1);
  nextHand.splice(to, 0, tile);
  game = { ...game, hands: [nextHand, ...game.hands.slice(1)] };
  selectedTile = null;
  persist(); refresh();
}

function render() {
  const opponents = $('#opponents');
  opponents.replaceChildren();
  if (!game) return;
  for (const seat of [1, 2, 3]) {
    const hand = game.hands[seat];
    const card = document.createElement('div');
    card.className = `opponent${game.phase === 'draw' && game.turn === seat ? ' is-turn' : ''}`;
    card.innerHTML = `<strong>Bot ${seat} · ${LEVEL_NAMES[saved.level]}</strong><small>${hand.length} taş${game.wins[seat] ? ` · ${game.wins[seat]} el` : ''}</small>`;
    const backs = document.createElement('div'); backs.className = 'opponent-tiles';
    for (let i = 0; i < Math.min(hand.length, 15); i += 1) backs.append(tileView(null, { hidden: true }));
    card.append(backs); opponents.append(card);
  }

  const lastDiscard = game.discards[(game.turn + 3) % 4].at(-1);
  $('#discard-area').replaceChildren(...game.discards.map((pile, seat) => {
    const wrap = document.createElement('div'); wrap.className = 'discard-pile';
    if (pile.length) wrap.append(tileView(pile.at(-1)));
    wrap.title = `${seat === 0 ? 'Sen' : `Bot ${seat}`} tarafından atılan`;
    return wrap;
  }));
  $('#indicator-tile').replaceChildren(tileView(game.indicator));
  const humanTurn = game.turn === 0;
  $('#draw-wall').disabled = game.phase !== 'draw' || !humanTurn || !game.wall.length;
  $('#draw-discard').disabled = game.phase !== 'draw' || !humanTurn || !lastDiscard;
  $('#draw-discard').querySelector('span').textContent = lastDiscard ? `${lastDiscard.fake ? '✦' : lastDiscard.number}` : '—';
  $('#discard-button').disabled = game.phase !== 'discard' || !humanTurn || selectedTile === null;
  $('#finish-button').hidden = game.phase !== 'discard' || !humanTurn || selectedTile === null
    || !canFinish(game.hands[0].filter(tile => tile.id !== selectedTile), game.indicator);

  const rack = $('#rack');
  rack.replaceChildren(...game.hands[0].map(tile => tileView(tile, {
    selected: tile.id === selectedTile,
    draggable: game.phase === 'discard' && humanTurn,
    onClick: () => { if (game.phase !== 'discard' || !humanTurn) return; selectedTile = selectedTile === tile.id ? null : tile.id; render(); }
  })));
  $('#rack-count').textContent = `${game.hands[0].length} taş`;
  $('#score-human').textContent = game.wins[0];
  $('#score-bots').textContent = game.wins.slice(1).reduce((sum, value) => sum + value, 0);
  $('#menu-button').hidden = false;
  if (game.phase === 'draw') setStatus(humanTurn ? 'Taş çek: ortadaki desteyi veya senden önce atılan taşı seç.' : `Bot ${game.turn} düşünüyor…`);
  else if (game.phase === 'discard') setStatus(humanTurn ? 'Bir taş seçip at. Elin bittiyse Bitir düğmesine bas.' : `Bot ${game.turn} taşı seçiyor…`);
  $('#continue-card').hidden = game.phase === 'match-over';
  $('#continue-copy').textContent = game.phase === 'round-over' ? 'Sonraki ele geç.' : `${game.wins[0]}–${game.wins.slice(1).reduce((a, b) => a + b, 0)} el galibiyeti`;
}

function refresh() { render(); updateChrome(); }

function updateChrome() {
  const totals = saved.records;
  const record = document.querySelector('.play-record');
  if (record) record.textContent = `Maç galibiyeti: ${totals.matchWins || 0}`;
}

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
  $('#result-kicker').textContent = game.phase === 'match-over' ? 'MAÇ BİTTİ' : game.roundWinner === null ? 'EL BİTTİ' : 'EL BİTTİ';
  $('#result-title').textContent = game.phase === 'match-over'
    ? game.matchWinner === 0 ? 'Maçı kazandın!' : `Bot ${game.matchWinner} maçı kazandı.`
    : game.roundWinner === null ? 'Taşlar tükendi' : game.roundWinner === 0 ? 'Eli kazandın!' : `Bot ${game.roundWinner} eli kazandı.`;
  $('#result-copy').textContent = game.phase === 'match-over'
    ? `Beş el galibiyetine ulaştın. Skor: ${game.wins.join('–')}.`
    : game.roundWinner === null ? 'Destedeki taşlar bitti; bu el galibiyet sayılmadı.' : `El galibiyetleri: ${game.wins.join('–')}.`;
  $('#next-button').textContent = game.phase === 'match-over' ? 'Yeni maç ↗' : 'Sonraki el ↗';
  flow.show('result');
}

function advanceBots() {
  if (!game || game.phase === 'match-over' || game.phase === 'round-over') { if (game) showResult(); return; }
  if (game.turn === 0) { refresh(); return; }
  cancelBot = botDelay(() => {
    const before = game;
    game = botTurn(game, saved.level);
    recordResults(before, game);
    persist();
    if (['round-over', 'match-over'].includes(game.phase)) showResult();
    else { refresh(); advanceBots(); }
  }, 520);
}

function startMatch() {
  cancelBot(); selectedTile = null;
  game = createRound();
  saved.game = game;
  persist(); flow.show('game'); refresh();
  if (game.turn !== 0) advanceBots();
}

$('#start-button').addEventListener('click', startMatch);
$('#continue-card').addEventListener('click', () => {
  if (!game) return startMatch();
  if (game.phase === 'round-over' || game.phase === 'match-over') return showResult();
  flow.show('game'); refresh(); advanceBots();
});
$('#menu-button').addEventListener('click', () => { cancelBot(); selectedTile = null; flow.show('menu'); updateChrome(); });
$('#draw-wall').addEventListener('click', () => { game = drawFromWall(game, 0); if (game.phase === 'discard') { selectedTile = null; persist(); refresh(); } });
$('#draw-discard').addEventListener('click', () => { game = drawDiscard(game, 0); if (game.phase === 'discard') { selectedTile = null; persist(); refresh(); } });
$('#discard-button').addEventListener('click', () => {
  if (selectedTile === null) return;
  const before = game;
  game = discardTile(game, 0, selectedTile);
  selectedTile = null;
  recordResults(before, game); persist(); refresh();
  if (['round-over', 'match-over'].includes(game.phase)) showResult(); else advanceBots();
});
$('#finish-button').addEventListener('click', () => $('#discard-button').click());
$('#sort-series').addEventListener('click', () => { if (game?.phase !== 'discard' || game.turn !== 0) return; game = { ...game, hands: [sortHand(game.hands[0], game.indicator, 'series'), ...game.hands.slice(1)] }; selectedTile = null; persist(); refresh(); });
$('#sort-pairs').addEventListener('click', () => { if (game?.phase !== 'discard' || game.turn !== 0) return; game = { ...game, hands: [sortHand(game.hands[0], game.indicator, 'pairs'), ...game.hands.slice(1)] }; selectedTile = null; persist(); refresh(); });
$('#next-button').addEventListener('click', () => {
  if (game.phase === 'match-over') return startMatch();
  game = nextRound(game);
  selectedTile = null; persist(); flow.show('game'); refresh(); advanceBots();
});
$('#result-menu-button').addEventListener('click', () => { flow.show('menu'); updateChrome(); });

bindChoices($('#menu-screen'), saved, (name, value) => { saved[name] = value; persist(); updateChrome(); });

const mergeRecords = (a = {}, b = {}) => Object.fromEntries(Object.keys(blankSave().records).map(key => [key, Math.max(Number(a[key]) || 0, Number(b[key]) || 0)]));
const cloudSync = syncGameOnAccountChange('okey', {
  read: () => ({ ...saved, game }),
  write: incoming => { saved = { ...blankSave(), ...incoming, records: mergeRecords(saved.records, incoming.records) }; game = isValidRound(saved.game) ? saved.game : null; cancelBot(); flow.show('menu'); updateChrome(); },
  isValid: incoming => Boolean(incoming && typeof incoming === 'object' && (incoming.game === null || isValidRound(incoming.game)) && incoming.records),
  merge: (local, remote) => ({ ...remote, records: mergeRecords(local.records, remote.records) }),
  counters: current => ({ matchWins: current.records.matchWins, roundWins: current.records.roundWins, hardWins: current.records.hardWins }),
  onStatus: message => { $('#save-state').textContent = message; }
});

if (game) {
  const resumed = $('#continue-card');
  resumed.hidden = false;
  $('#continue-copy').textContent = `${game.wins[0]}–${game.wins.slice(1).reduce((a, b) => a + b, 0)} el galibiyeti · ${LEVEL_NAMES[saved.level]}`;
}
flow.show('menu'); updateChrome();
