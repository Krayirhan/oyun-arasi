// Pişti rules, scoring and bot decisions. Cards use stable 0–51 ids from games/cards.js.
import { shuffleDeck, rankOf } from '../cards.js?v=mantik6';

export const TARGET_SCORE = 101;

export function createGame(random = Math.random, startingPlayer = 0) {
  const deck = shuffleDeck(random);
  const table = [deck.pop(), deck.pop(), deck.pop(), deck.pop()];
  const hands = [[], []];
  for (let n = 0; n < 4; n += 1) {
    hands[0].push(deck.pop());
    hands[1].push(deck.pop());
  }
  return {
    version: 1, status: 'playing', turn: startingPlayer, startingPlayer, deck, hands,
    table, hiddenCount: 3, captured: [[], []], scores: [0, 0], target: TARGET_SCORE,
    lastCapture: null, lastAction: null, rounds: 0
  };
}

export function cardPoints(card) {
  if (rankOf(card) === 1 || rankOf(card) === 11) return 1;
  if (card === 40) return 2; // 2♣
  if (card === 35) return 3; // 10♦
  return 0;
}

export function isMatch(card, top) {
  return rankOf(card) === rankOf(top) || rankOf(card) === 11;
}

export function isPisti(state, card) {
  return state.table.length === 1 && rankOf(card) === rankOf(state.table[0]);
}

export function scoreCards(cards) {
  return cards.reduce((score, card) => score + cardPoints(card), 0);
}

function clone(state) {
  return { ...state, deck: [...state.deck], hands: state.hands.map(hand => [...hand]), table: [...state.table],
    captured: state.captured.map(cards => [...cards]), scores: [...state.scores],
    lastAction: state.lastAction ? { ...state.lastAction } : null };
}

function finishDeal(state) {
  if (state.deck.length || state.hands.some(hand => hand.length)) return state;
  const next = clone(state);
  if (next.table.length && next.lastCapture !== null) {
    next.captured[next.lastCapture].push(...next.table);
    next.table = [];
    next.hiddenCount = 0;
  }
  next.scores = next.scores.map((score, player) => score + scoreCards(next.captured[player]));
  const cardCounts = next.captured.map(cards => cards.length);
  if (cardCounts[0] !== cardCounts[1]) {
    next.scores[cardCounts[0] > cardCounts[1] ? 0 : 1] += 3;
  }
  next.rounds += 1;
  next.status = next.scores.some(score => score >= next.target) ? 'match-over' : 'deal-over';
  next.lastAction = { type: 'deal-over' };
  return next;
}

export function playCard(state, player, card) {
  if (state.status !== 'playing' || player !== state.turn) return state;
  const handIndex = state.hands[player].indexOf(card);
  if (handIndex < 0) return state;
  const next = clone(state);
  next.hands[player].splice(handIndex, 1);
  const pisti = isPisti(state, card);
  const takes = state.table.length > 0 && isMatch(card, state.table.at(-1));
  if (takes) {
    next.captured[player].push(...next.table, card);
    next.table = [];
    next.hiddenCount = 0;
    next.lastCapture = player;
    next.scores[player] += pisti ? (rankOf(card) === 11 ? 20 : 10) : 0;
  } else {
    next.table.push(card);
    next.hiddenCount = 0;
  }
  next.lastAction = { type: 'play', player, card, takes, pisti: takes && pisti,
    points: takes ? (pisti ? (rankOf(card) === 11 ? 20 : 10) : 0) : 0 };
  next.turn = (player + 1) % 2;
  if (next.hands.every(hand => hand.length === 0) && next.deck.length) {
    for (let n = 0; n < 4 && next.deck.length >= 2; n += 1) {
      next.hands[0].push(next.deck.pop());
      next.hands[1].push(next.deck.pop());
    }
  }
  return finishDeal(next);
}

export function chooseBotCard(state, random = Math.random) {
  const hand = state.hands[1];
  if (!hand.length) return null;
  const takes = hand.filter(card => state.table.length && isMatch(card, state.table.at(-1)));
  if (takes.length) {
    return takes.find(card => isPisti(state, card)) ?? takes.sort((a, b) => cardPoints(b) - cardPoints(a))[0];
  }
  return hand[Math.floor(random() * hand.length)];
}

export function botTurn(state, random = Math.random) {
  if (state.status !== 'playing' || state.turn !== 1) return state;
  const card = chooseBotCard(state, random);
  return card === null ? state : playCard(state, 1, card);
}

export function startNextDeal(state, random = Math.random) {
  if (state.status !== 'deal-over') return state;
  const next = createGame(random, state.rounds % 2);
  next.scores = [...state.scores];
  next.rounds = state.rounds;
  return next;
}

export function isValidGame(state) {
  if (!state || state.version !== 1 || !['playing', 'deal-over', 'match-over'].includes(state.status)) return false;
  if (![0, 1].includes(state.turn) || ![0, 1].includes(state.startingPlayer)
    || !Array.isArray(state.scores) || state.scores.length !== 2
    || !state.scores.every(score => Number.isInteger(score) && score >= 0)) return false;
  if (!Array.isArray(state.deck) || !Array.isArray(state.table) || !Array.isArray(state.hands) || !Array.isArray(state.captured)
    || state.hands.length !== 2 || state.captured.length !== 2
    || ![state.deck, state.table, ...state.hands, ...state.captured].every(Array.isArray)) return false;
  const cards = [...state.deck, ...state.table, ...state.hands.flat(), ...state.captured.flat()];
  return cards.length === 52 && new Set(cards).size === 52 && cards.every(card => Number.isInteger(card) && card >= 0 && card < 52)
    && Number.isInteger(state.hiddenCount) && state.hiddenCount >= 0 && state.hiddenCount <= state.table.length
    && Number.isInteger(state.rounds) && state.rounds >= 0
    && (state.status !== 'playing' || state.hands.every(hand => hand.length <= 4));
}
