// Shared 52-card deck and face helpers used by card games.
export const SUITS = Object.freeze(['♠', '♥', '♦', '♣']);
export const RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);

// Stable ids: suit * 13 + rank - 1 (spades, hearts, diamonds, clubs).
export const suitOf = card => Math.floor(card / 13);
export const rankOf = card => card % 13 + 1;
export const isRed = card => suitOf(card) === 1 || suitOf(card) === 2;
export const cardName = card => `${RANKS[rankOf(card) - 1]}${SUITS[suitOf(card)]}`;
export const createDeck = () => Array.from({ length: 52 }, (_, id) => id);

export function shuffleDeck(random = Math.random) {
  const deck = createDeck();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
