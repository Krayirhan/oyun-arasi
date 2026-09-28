import { SUITS, RANKS, suitOf, rankOf, isRed, cardName } from '../cards.js?v=mantik28';
import { createGame, playCard, botTurn, startNextDeal, isValidGame } from './logic.js?v=mantik28';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=mantik28';
import { createFlow, botDelay } from '../../game-flow.js?v=mantik28';

const KEY = 'oyunarasi-pisti-v1';
const $ = selector => document.querySelector(selector);
const flow = createFlow({ menu: $('#menu-screen'), game: $('#game-screen'), result: $('#result-screen') });
const blankSave = () => ({ game: null, records: { matchWins: 0, pistiCount: 0, bestScore: 0 } });
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    return { ...blankSave(), ...(data || {}), game: isValidGame(data?.game) ? data.game : null,
      records: { ...blankSave().records, ...(data?.records || {}) } };
  } catch { return blankSave(); }
}

let saved = load();
let game = saved.game;
let cancelBot = () => {};
let botTimer = null;

function persist() {
  saved.game = game;
  try { localStorage.setItem(KEY, JSON.stringify(saved)); }
  catch { $('#save-state').textContent = 'Kayıt yapılamadı; bu oturumda oynamaya devam edebilirsin.'; }
  cloudSync.save(saved);
}

function cardBack() {
  return '<svg class="back-art" viewBox="0 0 100 140" aria-hidden="true"><rect x="3" y="3" width="94" height="134" rx="10" fill="#14553f" stroke="#f4d884" stroke-width="3"/><rect x="10" y="10" width="80" height="120" rx="7" fill="url(#backPattern)" stroke="#fff2cb" stroke-width="2"/><defs><pattern id="backPattern" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="#167756"/><path d="M0 0h7v7H0zM7 7h7v7H7z" fill="#f3c65f" opacity=".72"/><circle cx="7" cy="7" r="2" fill="#fff4d2"/></pattern></defs><circle cx="50" cy="70" r="23" fill="#f7edcf" stroke="#e6ad42" stroke-width="3"/><text x="50" y="77" text-anchor="middle" font-size="21" font-weight="900" fill="#14553f">OA</text></svg>';
}

const COURT_PALETTE = { 11: ['#e64b3e', '#ffc84d', '#14553f'], 12: ['#bd4e9c', '#ffd56a', '#26336a'], 13: ['#2879d4', '#ffbd43', '#b64236'] };
function courtArt(rank) {
  const [coat, crown, trim] = COURT_PALETTE[rank];
  return `<svg class="court-art" x="5" y="32" width="90" height="76" viewBox="0 0 100 88" aria-hidden="true"><rect x="3" y="3" width="94" height="82" rx="12" fill="#fff2cc" stroke="#debd75" stroke-width="2"/><g transform="translate(0 0)"><path d="M19 83Q20 62 36 57L50 51l14 6q16 5 17 26" fill="${coat}" stroke="#182547" stroke-width="3"/><path d="m37 59 13 14 13-14-7-7H44z" fill="${crown}" stroke="#182547" stroke-width="2.5"/><path d="M36 41Q33 19 50 17q17 2 14 24l-4 11q-10 12-20 0z" fill="#ffd09f" stroke="#182547" stroke-width="2.5"/><path d="M34 34Q32 9 50 10q18-1 17 24l-8-7-8 4-9-5z" fill="${trim}" stroke="#182547" stroke-width="3"/><path d="M41 41h5m8 0h5" stroke="#182547" stroke-width="2.5" stroke-linecap="round"/><path d="M45 50q5 4 10 0" fill="none" stroke="#a44345" stroke-width="2" stroke-linecap="round"/><path d="M42 68h16m-19 8h22" stroke="${crown}" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="17" r="3" fill="#fff0b1" stroke="#182547" stroke-width="1.5"/></g><path d="M50 6v76" stroke="#c99c4c" stroke-width="1.2" stroke-dasharray="3 3" opacity=".8"/></svg>`;
}

const PIP_POSITIONS = {
  1: [[50, 70]], 2: [[50, 42], [50, 98]], 3: [[50, 38], [50, 70], [50, 102]],
  4: [[32, 42], [68, 42], [32, 98], [68, 98]], 5: [[32, 38], [68, 38], [50, 70], [32, 102], [68, 102]],
  6: [[32, 34], [68, 34], [32, 70], [68, 70], [32, 106], [68, 106]],
  7: [[32, 32], [68, 32], [32, 62], [50, 70], [68, 62], [32, 108], [68, 108]],
  8: [[32, 30], [68, 30], [32, 56], [68, 56], [32, 84], [68, 84], [32, 110], [68, 110]],
  9: [[32, 29], [68, 29], [32, 55], [68, 55], [50, 70], [32, 85], [68, 85], [32, 111], [68, 111]],
  10: [[32, 27], [68, 27], [50, 43], [32, 55], [68, 55], [32, 85], [68, 85], [50, 97], [32, 113], [68, 113]]
};

function cardFace(card) {
  const rank = rankOf(card); const suitIndex = suitOf(card); const suit = SUITS[suitIndex];
  const red = isRed(card) ? ' red' : '';
  const center = rank >= 11 ? courtArt(rank) : rank === 1
    ? `<text class="ace-pip" x="50" y="89" text-anchor="middle">${suit}</text>`
    : (PIP_POSITIONS[rank] || []).map(([x, y]) => `<text class="pip-mark" x="${x}" y="${y}" text-anchor="middle">${suit}</text>`).join('');
  const index = RANKS[rank - 1];
  return `<svg class="face-art${red}" viewBox="0 0 100 140" aria-hidden="true"><defs><linearGradient id="paper${card}" x2=".8" y2="1"><stop stop-color="#fffef7"/><stop offset="1" stop-color="#f2e5c7"/></linearGradient></defs><rect x="2" y="2" width="96" height="136" rx="11" fill="url(#paper${card})" stroke="#d6c39a" stroke-width="2"/><rect x="7" y="7" width="86" height="126" rx="8" fill="none" stroke="#dfd1b2" stroke-width="1"/><text class="corner-rank" x="13" y="26">${index}</text><text class="corner-suit" x="13" y="45">${suit}</text><text class="corner-rank corner-bottom" x="87" y="120">${index}</text><text class="corner-suit corner-bottom" x="87" y="101">${suit}</text>${rank >= 11 ? center : `<g>${center}</g>`}</svg>`;
}

function makeCard(card, { hidden = false, selectable = false, onClick = null } = {}) {
  const element = document.createElement(selectable ? 'button' : 'div');
  if (selectable) element.type = 'button';
  element.className = `playing-card${hidden ? ' card-back' : ''}${selectable ? ' hand-card' : ''}`;
  if (hidden) {
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = cardBack();
  } else {
    element.dataset.card = card;
    element.setAttribute('aria-label', cardName(card));
    element.innerHTML = cardFace(card);
    if (onClick) element.addEventListener('click', onClick);
  }
  return element;
}

function updateRecord(before, after) {
  if (after.lastAction?.type === 'play' && after.lastAction.player === 0 && after.lastAction.pisti) saved.records.pistiCount += 1;
  if (after.status === 'match-over' && before.status !== 'match-over' && after.scores[0] > after.scores[1]) saved.records.matchWins += 1;
  saved.records.bestScore = Math.max(saved.records.bestScore, after.scores[0]);
}

function updateContinueCard() {
  const card = $('#continue-card');
  if (!game || game.status === 'match-over') { card.hidden = true; return; }
  const dealOver = game.status === 'deal-over';
  card.hidden = false;
  card.querySelector('strong').textContent = dealOver ? 'Sonraki ele geç' : 'Maça dön';
  $('#continue-copy').textContent = `${game.scores[0]}–${game.scores[1]} · ${dealOver ? 'El tamamlandı' : 'Kaldığın yerden devam et'}`;
}

function render() {
  if (!game) return;
  $('#score-human').textContent = game.scores[0];
  $('#score-bot').textContent = game.scores[1];
  $('#deck-count').textContent = game.deck.length;
  $('#deck-button').disabled = true;
  const botHand = $('#bot-hand'); botHand.replaceChildren();
  for (let i = 0; i < game.hands[1].length; i += 1) botHand.append(makeCard(null, { hidden: true }));
  $('#bot-state').textContent = game.turn === 1 ? 'Hamlesini düşünüyor…' : `${game.hands[1].length} kart kaldı`;
  $('#human-state').textContent = game.turn === 0 ? 'Sıra sende' : 'Rakip oynuyor';
  $('#human-captured-count').textContent = `${game.captured[0].length} kart`;
  $('#capture-human').replaceChildren(...game.captured[0].slice(-5).map(card => makeCard(card)));
  $('#capture-bot').replaceChildren(...game.captured[1].slice(-5).map(card => makeCard(card)));
  const pile = $('#table-pile');
  pile.replaceChildren(...game.table.map((card, index) => makeCard(card, { hidden: index < game.hiddenCount })));
  pile.dataset.count = game.table.length;
  const hand = $('#human-hand'); hand.replaceChildren(...game.hands[0].map((card, index) => {
    const button = makeCard(card, { selectable: true, onClick: () => playHumanCard(card) });
    button.style.setProperty('--hand-index', index);
    button.disabled = game.turn !== 0 || game.status !== 'playing';
    return button;
  }));
  $('#menu-button').hidden = false;
  updateContinueCard();
  const isHumanTurn = game.turn === 0 && game.status === 'playing';
  $('#turn-prompt').classList.toggle('is-your-turn', isHumanTurn);
  $('#turn-title').textContent = isHumanTurn ? 'Sıra sende' : 'Rakip oynuyor';
  $('#turn-hint').textContent = isHumanTurn ? 'Elinden bir kart seçip masaya bırak.' : 'Rakip kartını seçiyor; birazdan sıra sende.';
  if (game.lastAction?.pisti) {
    $('#table-message').textContent = game.lastAction.card % 13 === 10 ? 'VALE PİŞTİ! +20' : 'PİŞTİ! +10';
    $('#table-message').classList.remove('is-pisti');
    requestAnimationFrame(() => $('#table-message').classList.add('is-pisti'));
  } else if (game.turn === 0) {
    $('#table-message').textContent = 'Bir kart seç';
  } else {
    $('#table-message').textContent = 'Rakibin hamlesi';
  }
  $('#status').textContent = game.turn === 0 ? 'Bir kart seç: eşleşen değer masayı alır, Vale her kartı toplar.' : 'Rakip hamle yapıyor; kartın oynanınca sıran gelecek.';
}

function showResult() {
  cancelBot();
  const matchOver = game.status === 'match-over';
  const winner = game.scores[0] > game.scores[1] ? 0 : 1;
  $('#result-kicker').textContent = matchOver ? 'MAÇ BİTTİ' : 'EL BİTTİ';
  $('#result-title').textContent = matchOver ? (winner === 0 ? 'Maçı kazandın!' : 'Bot maçı kazandı.') : 'Yeni el hazır!';
  const tied = !matchOver && game.scores[0] === game.scores[1] && game.scores[0] >= game.target;
  $('#result-copy').textContent = `Skor ${game.scores[0]} – ${game.scores[1]}. ${matchOver ? '101 puana ulaşan maçı aldı.' : tied ? 'Skorlar eşit; kazananı belirlemek için bir el daha oynanır.' : 'Sıradaki elde başlangıç oyuncusu değişecek.'}`;
  $('#next-button').hidden = matchOver;
  flow.show('result');
}

function runBot() {
  if (!game || game.status !== 'playing' || game.turn !== 1) return;
  cancelBot = botDelay(() => {
    const before = game;
    game = botTurn(game);
    updateRecord(before, game); persist();
    if (game.status !== 'playing') showResult(); else { render(); runBot(); }
  }, 640);
}

function begin(nextGame) {
  cancelBot(); game = nextGame; persist(); flow.show('game'); render(); runBot();
}

function playHumanCard(card) {
  if (!game || game.status !== 'playing' || game.turn !== 0) return;
  const before = game;
  game = playCard(game, 0, card);
  if (game === before) return;
  updateRecord(before, game); persist();
  if (game.status !== 'playing') showResult(); else { render(); runBot(); }
}

function updateChrome() {
  const record = document.querySelector('.play-record');
  if (record) record.textContent = `Maç galibiyeti: ${saved.records.matchWins}`;
}

$('#start-button').addEventListener('click', () => begin(createGame()));
$('#continue-card').addEventListener('click', () => {
  if (!game) return begin(createGame());
  if (game.status !== 'playing') return showResult();
  flow.show('game'); render(); runBot();
});
$('#menu-button').addEventListener('click', () => { cancelBot(); updateContinueCard(); $('#status').textContent = 'Maça dön veya yeni maç başlat.'; flow.show('menu'); updateChrome(); });
$('#next-button').addEventListener('click', () => begin(startNextDeal(game)));
$('#result-menu-button').addEventListener('click', () => { updateContinueCard(); $('#status').textContent = 'Sonraki ele geç veya yeni maç başlat.'; flow.show('menu'); updateChrome(); });

const mergeRecords = (a = {}, b = {}) => Object.fromEntries(Object.keys(blankSave().records).map(key => [key, Math.max(Number(a[key]) || 0, Number(b[key]) || 0)]));
const cloudSync = syncGameOnAccountChange('pisti', {
  read: () => ({ ...saved, game }),
  write: incoming => { saved = { ...blankSave(), ...incoming, records: mergeRecords(saved.records, incoming.records) }; game = isValidGame(saved.game) ? saved.game : null; cancelBot(); flow.show('menu'); updateChrome(); },
  isValid: incoming => Boolean(incoming && typeof incoming === 'object' && (incoming.game === null || isValidGame(incoming.game)) && incoming.records),
  merge: (local, remote) => ({ ...remote, records: mergeRecords(local.records, remote.records) }),
  counters: current => ({ matchWins: current.records.matchWins, pistiCount: current.records.pistiCount, bestScore: current.records.bestScore }),
  onStatus: message => { $('#save-state').textContent = message; }
});

updateContinueCard();
flow.show('menu'); updateChrome();

