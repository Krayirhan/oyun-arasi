// Solitaire (Klondike) — pure game rules. Every function returns a new game object (or null for an
// illegal move); nothing here touches the DOM.
// Cards are numbers 0–51: suit = Math.floor(card / 13) (0 ♠, 1 ♥, 2 ♦, 3 ♣), rank = card % 13 + 1.

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const DRAW_MODES = { 1: { label: '1 kart' }, 3: { label: '3 kart' } };
const HISTORY_LIMIT = 200;

export const suitOf = card => Math.floor(card / 13);
export const rankOf = card => (card % 13) + 1;
export const isRed = card => suitOf(card) === 1 || suitOf(card) === 2;
export const cardName = card => `${RANKS[rankOf(card) - 1]}${SUITS[suitOf(card)]}`;

// Tableau columns keep their cards bottom to top; the first `down[i]` cards of column i are face down.
export function createGame(draw = 1, random = Math.random, now = Date.now()) {
  const deck = Array.from({ length: 52 }, (_, card) => card);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tableau = Array.from({ length: 7 }, (_, column) => deck.splice(0, column + 1));
  return {
    version: 1,
    draw: Number(draw) === 3 ? 3 : 1,
    stock: deck,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    down: tableau.map(column => column.length - 1),
    history: [],
    moves: 0,
    status: 'playing',
    elapsedMs: 0,
    startedAt: now,
    undone: 0
  };
}

function snapshot(game) {
  return { stock: game.stock, waste: game.waste, foundations: game.foundations, tableau: game.tableau, down: game.down, moves: game.moves };
}

// Records the current position for undo and returns a copy ready to change.
function nextState(game) {
  return {
    ...game,
    stock: [...game.stock],
    waste: [...game.waste],
    foundations: game.foundations.map(pile => [...pile]),
    tableau: game.tableau.map(column => [...column]),
    down: [...game.down],
    history: [...game.history, snapshot(game)].slice(-HISTORY_LIMIT),
    moves: game.moves + 1
  };
}

function finish(game, now) {
  if (game.foundations.every(pile => pile.length === 13)) {
    return { ...game, status: 'won', elapsedMs: elapsedMilliseconds(game, now), startedAt: now };
  }
  return game;
}

// Deals from the stock onto the waste; an empty stock takes the waste back face down.
export function drawCards(game) {
  if (game.status !== 'playing' || (!game.stock.length && !game.waste.length)) return null;
  const next = nextState(game);
  if (!next.stock.length) {
    next.stock = next.waste.reverse();
    next.waste = [];
  } else {
    const count = Math.min(next.draw, next.stock.length);
    for (let i = 0; i < count; i++) next.waste.push(next.stock.pop());
  }
  return next;
}

export function topCard(pile) {
  return pile.length ? pile[pile.length - 1] : null;
}

// The cards a source would pick up. Sources:
//   { type: 'waste' }, { type: 'foundation', index }, { type: 'tableau', index, card } (card = position in column)
export function pickCards(game, source) {
  if (source.type === 'waste') return game.waste.length ? [topCard(game.waste)] : [];
  if (source.type === 'foundation') { const pile = game.foundations[source.index]; return pile?.length ? [topCard(pile)] : []; }
  if (source.type === 'tableau') {
    const column = game.tableau[source.index];
    const from = source.card ?? column?.length - 1;
    if (!column || from < game.down[source.index] || from < 0 || from >= column.length) return [];
    return column.slice(from);
  }
  return [];
}

export function canPlaceOnFoundation(game, card, index = suitOf(card)) {
  return suitOf(card) === index && game.foundations[index].length === rankOf(card) - 1;
}

export function canPlaceOnTableau(game, card, index) {
  const column = game.tableau[index];
  if (!column.length) return rankOf(card) === 13;
  const target = topCard(column);
  return column.length > game.down[index] && isRed(target) !== isRed(card) && rankOf(target) === rankOf(card) + 1;
}

// Targets: { type: 'foundation', index? } or { type: 'tableau', index }.
export function moveCards(game, source, target, now = Date.now()) {
  if (game.status !== 'playing') return null;
  const cards = pickCards(game, source);
  if (!cards.length) return null;
  if (source.type === target.type && source.index === target.index) return null;
  if (target.type === 'foundation') {
    const index = target.index ?? suitOf(cards[0]);
    if (cards.length !== 1 || !canPlaceOnFoundation(game, cards[0], index)) return null;
  } else if (target.type === 'tableau') {
    if (!game.tableau[target.index] || !canPlaceOnTableau(game, cards[0], target.index)) return null;
  } else {
    return null;
  }
  const next = nextState(game);
  if (source.type === 'waste') next.waste.pop();
  else if (source.type === 'foundation') next.foundations[source.index].pop();
  else {
    const column = next.tableau[source.index];
    column.splice(column.length - cards.length);
    // Uncover the new top card of the column.
    if (column.length && next.down[source.index] >= column.length) next.down[source.index] = column.length - 1;
  }
  if (target.type === 'foundation') next.foundations[target.index ?? suitOf(cards[0])].push(cards[0]);
  else next.tableau[target.index].push(...cards);
  return finish(next, now);
}

// Where a tapped card should go: its foundation first, then a column that builds on it
// (a column with cards before an empty one, so kings are the only cards sent to empty columns).
export function bestTarget(game, source) {
  const cards = pickCards(game, source);
  if (!cards.length) return null;
  if (cards.length === 1 && source.type !== 'foundation' && canPlaceOnFoundation(game, cards[0])) return { type: 'foundation', index: suitOf(cards[0]) };
  const columns = game.tableau.map((_, index) => index).filter(index => !(source.type === 'tableau' && source.index === index));
  const filled = columns.find(index => game.tableau[index].length && canPlaceOnTableau(game, cards[0], index));
  if (filled !== undefined) return { type: 'tableau', index: filled };
  // A king already at the bottom of its column gains nothing from moving to another empty column.
  if (source.type === 'tableau' && source.card === 0) return null;
  const empty = columns.find(index => !game.tableau[index].length && canPlaceOnTableau(game, cards[0], index));
  return empty !== undefined ? { type: 'tableau', index: empty } : null;
}

export function undo(game) {
  if (game.status !== 'playing' || !game.history.length) return null;
  const previous = game.history[game.history.length - 1];
  return { ...game, ...previous, history: game.history.slice(0, -1), moves: game.moves + 1, undone: game.undone + 1 };
}

// Once every card is face up and the stock is empty the game can finish itself.
export function canAutoComplete(game) {
  return game.status === 'playing' && !game.stock.length && !game.waste.length && game.down.every(count => count === 0)
    && game.foundations.some(pile => pile.length < 13);
}

// One card to its foundation (the lowest one first), used to animate auto-complete.
export function autoStep(game, now = Date.now()) {
  const sources = [{ type: 'waste' }, ...game.tableau.map((_, index) => ({ type: 'tableau', index }))];
  let best = null;
  for (const source of sources) {
    const card = pickCards(game, source).at(-1);
    if (card === undefined || !canPlaceOnFoundation(game, card)) continue;
    if (!best || rankOf(card) < best.rank) best = { source, rank: rankOf(card) };
  }
  if (!best) return null;
  const source = best.source.type === 'tableau' ? { ...best.source, card: game.tableau[best.source.index].length - 1 } : best.source;
  return moveCards(game, source, { type: 'foundation' }, now);
}

export function elapsedMilliseconds(game, now = Date.now()) {
  return game.status === 'playing' ? game.elapsedMs + Math.max(0, now - game.startedAt) : game.elapsedMs;
}

// Sayfa kapanırken süreyi dondurur, açılınca kaldığı yerden sürdürür.
export function pauseGame(game, now = Date.now()) {
  if (game.status !== 'playing') return game;
  return { ...game, elapsedMs: elapsedMilliseconds(game, now), startedAt: now };
}

export function resumeGame(game, now = Date.now()) {
  return game.status === 'playing' ? { ...game, startedAt: now } : game;
}

const isCard = card => Number.isInteger(card) && card >= 0 && card < 52;

function validPosition(position) {
  if (!position || !Array.isArray(position.stock) || !Array.isArray(position.waste)) return false;
  if (!Array.isArray(position.foundations) || position.foundations.length !== 4 || !position.foundations.every(Array.isArray)) return false;
  if (!Array.isArray(position.tableau) || position.tableau.length !== 7 || !position.tableau.every(Array.isArray)) return false;
  if (!Array.isArray(position.down) || position.down.length !== 7) return false;
  const all = [...position.stock, ...position.waste, ...position.foundations.flat(), ...position.tableau.flat()];
  if (all.length !== 52 || !all.every(isCard) || new Set(all).size !== 52) return false;
  if (!position.foundations.every((pile, index) => pile.every((card, at) => suitOf(card) === index && rankOf(card) === at + 1))) return false;
  return position.down.every((count, index) => Number.isInteger(count) && count >= 0 && count <= Math.max(0, position.tableau[index].length - 1));
}

export function isValidGame(game) {
  if (!game || typeof game !== 'object' || game.version !== 1 || ![1, 3].includes(game.draw)) return false;
  if (!['playing', 'won'].includes(game.status)) return false;
  if (!['moves', 'elapsedMs', 'startedAt', 'undone'].every(key => Number.isFinite(game[key]) && game[key] >= 0)) return false;
  if (!validPosition(game) || !Array.isArray(game.history) || game.history.length > HISTORY_LIMIT) return false;
  return game.history.every(validPosition);
}
