import { PUZZLES } from './puzzles.js?v=balon14';
import { createGame, submitWord, giveHint, isValidGame, dailyPuzzle, dateKey, scoreStars, prepareDictionary } from './logic.js?v=balon14';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=balon14';

const $ = selector => document.querySelector(selector);
const DICTIONARY = new Set(prepareDictionary(window.HARFANE_WORDS || []));
const PUZZLE_MAP = new Map(PUZZLES.map(puzzle => [puzzle.id, puzzle]));
const STORAGE_KEY = 'oyunarasi-kelime-merdiveni-v1';
const TODAY = dateKey();
const INITIAL = { dailyGames: {}, seriesIndex: 0, seriesStars: 0, seriesGame: null, records: { dailyPlayed: 0, dailyWins: 0, bestStars: 0, seriesCompleted: 0, totalStars: 0 } };
let saved = load();
let mode = 'daily';
let selectedDate = TODAY;
let game = null;
let currentPuzzle = null;

function load() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!value || typeof value !== 'object') return structuredClone(INITIAL);
    return { ...structuredClone(INITIAL), ...value, records: { ...INITIAL.records, ...value.records }, dailyGames: value.dailyGames || {} };
  } catch { return structuredClone(INITIAL); }
}

function setMessage(message, kind = '') {
  const element = $('#ladder-message'); element.textContent = message; element.dataset.kind = kind;
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); $('#save-state').textContent = 'İlerlemen bu cihazda saklanıyor.'; }
  catch { $('#save-state').textContent = 'Cihaz kaydı kullanılamıyor; bu oturumda devam edebilirsin.'; }
  cloud.save(saved);
  renderChrome();
}

function puzzleForDay(date) { return dailyPuzzle(PUZZLES, date); }

function startDaily(date = TODAY) {
  if (date > TODAY || date < '2026-01-01') return setMessage('Arşivde 1 Ocak 2026 ile bugün arasındaki bulmacalar var.', 'error');
  mode = 'daily'; selectedDate = date; currentPuzzle = puzzleForDay(date);
  const candidate = saved.dailyGames[date];
  game = isValidGame(candidate, PUZZLE_MAP, DICTIONARY) && candidate.date === date && candidate.mode === 'daily'
    ? candidate : createGame(currentPuzzle, 'daily', date);
  $('#archive-date').value = date;
  showGame();
}

function startSeries(index = saved.seriesIndex) {
  mode = 'series';
  const boundedIndex = Math.max(0, Math.min(PUZZLES.length - 1, index));
  saved.seriesIndex = boundedIndex;
  currentPuzzle = PUZZLES[boundedIndex];
  const candidate = saved.seriesGame;
  game = isValidGame(candidate, PUZZLE_MAP, DICTIONARY) && candidate.mode === 'series' && candidate.puzzleId === currentPuzzle.id
    ? candidate : createGame(currentPuzzle, 'series', String(boundedIndex + 1));
  showGame();
}

function showGame() {
  $('#menu-screen').classList.add('hidden'); $('#game-screen').classList.remove('hidden'); $('#menu-button').hidden = false;
  $('#daily-options').classList.toggle('hidden', mode !== 'daily');
  $('#mode-caption').textContent = mode === 'daily' ? (selectedDate === TODAY ? 'GÜNLÜK BULMACA' : 'ARŞİV BULMACASI') : 'SEFER';
  $('#progress-label').textContent = mode === 'daily' ? `#${String(PUZZLES.findIndex(item => item.id === currentPuzzle.id) + 1).padStart(3, '0')}` : `${saved.seriesIndex + 1} / ${PUZZLES.length}`;
  $('#status').textContent = mode === 'daily' ? (selectedDate === TODAY ? 'Günlük merdiven başladı. Her adımda bir harfi değiştir.' : 'Arşiv merdiveni açık. Her adımda bir harfi değiştir.') : `Sefer · ${saved.seriesIndex + 1}. basamak`;
  $('#start-word').textContent = currentPuzzle.path[0].toLocaleUpperCase('tr-TR');
  $('#target-word').textContent = currentPuzzle.path.at(-1).toLocaleUpperCase('tr-TR');
  renderGame();
  window.dispatchEvent(new Event('game:layoutchange'));
}

function renderChrome() {
  $('#star-total').textContent = `${saved.records.totalStars} ★`;
  $('#resume-button').hidden = !(saved.dailyGames[TODAY] || saved.seriesGame);
  $('#resume-button').textContent = mode === 'daily' ? 'Bugünkü merdivene dön' : `Sefer · ${saved.seriesIndex + 1}. basamağa dön`;
}

function renderGame() {
  $('#step-count').textContent = `${game.path.length - 1} hamle`;
  $('#shortest-label').textContent = `En kısa: ${game.shortestSteps} hamle`;
  $('#star-display').textContent = `${'★'.repeat(game.stars)}${'☆'.repeat(3 - game.stars)}`;
  $('#word-ladder').replaceChildren(...game.path.map((word, index) => {
    const row = document.createElement('li'); row.className = 'ladder-step';
    const count = document.createElement('span'); count.className = 'ladder-step-number'; count.textContent = String(index);
    const tiles = document.createElement('span'); tiles.className = 'ladder-word';
    const before = [...(game.path[index - 1] || '')]; const letters = [...word];
    tiles.setAttribute('aria-label', word.toLocaleUpperCase('tr-TR'));
    for (let position = 0; position < letters.length; position += 1) {
      const tile = document.createElement('b'); tile.textContent = letters[position].toLocaleUpperCase('tr-TR');
      if (index > 0 && letters[position] !== before[position]) tile.classList.add('changed');
      tiles.append(tile);
    }
    row.append(count, tiles);
    if (word === game.target) { const flag = document.createElement('span'); flag.className = 'ladder-arrived'; flag.textContent = 'HEDEF'; row.append(flag); }
    return row;
  }));
  const finished = game.status === 'won';
  $('#word-input').disabled = finished; $('#word-input').value = '';
  $('#hint-button').disabled = finished;
  $('#result-panel').classList.toggle('hidden', !finished);
  $('#result-title').textContent = game.stars === 3 ? 'En kısa yoldan ulaştın!' : 'Hedefe ulaştın!';
  const used = game.path.length - 1;
  $('#result-copy').textContent = `${used} hamlede ${game.stars} yıldız kazandın. En kısa çözüm ${game.shortestSteps} hamleydi.`;
  $('#next-button').hidden = mode !== 'series' || saved.seriesIndex >= PUZZLES.length - 1;
  $('#back-button').textContent = mode === 'daily' ? 'Arşive ve menüye dön' : 'Sefer menüsü';
  if (game.hint) {
    const previous = [...game.path.at(-1)]; const next = [...game.hint]; const position = previous.findIndex((letter, index) => letter !== next[index]);
    setMessage(`İpucu: ${position + 1}. harfi “${next[position].toLocaleUpperCase('tr-TR')}” yap.`, 'hint');
  } else if (!finished) setMessage('Bir harfi değiştirerek sıradaki geçerli kelimeyi yaz.', '');
}

function finishIfWon(previousGame, nextGame) {
  if (previousGame.status !== 'won' && nextGame.status === 'won') {
    if (mode === 'daily') { saved.records.dailyPlayed += 1; saved.records.dailyWins += 1; }
    else { saved.seriesStars += nextGame.stars; if (saved.seriesIndex === PUZZLES.length - 1) saved.records.seriesCompleted += 1; }
    saved.records.bestStars = Math.max(saved.records.bestStars, nextGame.stars);
    saved.records.totalStars += nextGame.stars;
  }
}

$('#word-form').addEventListener('submit', event => {
  event.preventDefault();
  const value = $('#word-input').value.toLocaleLowerCase('tr-TR').trim();
  const result = submitWord(game, value, DICTIONARY);
  const messages = {
    finished: 'Bu merdiven tamamlandı. Yıldızlarını gör!', length: 'Beş harfli bir kelime yaz.',
    unknown: 'Bu kelime sözlükte yok. Başka bir kelime dene.',
    'one-letter': 'Yalnızca bir harfi değiştirebilirsin.', repeat: 'Bu kelimeyi zaten kullandın.'
  };
  if (result.error) return setMessage(messages[result.error], 'error');
  const previous = game; game = result.game; finishIfWon(previous, game);
  if (mode === 'daily') saved.dailyGames[selectedDate] = game; else saved.seriesGame = game;
  save(); renderGame();
  if (game.status === 'won') setMessage(`Hedefte! ${game.stars} yıldız aldın.`, 'success');
});

$('#hint-button').addEventListener('click', () => {
  if (game?.status !== 'playing') return;
  game = giveHint(game); if (mode === 'daily') saved.dailyGames[selectedDate] = game; else saved.seriesGame = game;
  save(); renderGame();
});

$('#open-date').addEventListener('click', () => startDaily($('#archive-date').value || TODAY));
$('#today-button').addEventListener('click', () => startDaily(TODAY));
$('#start-button').addEventListener('click', () => mode === 'daily' ? startDaily(TODAY) : startSeries());
document.querySelectorAll('.ladder-mode').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  document.querySelectorAll('.ladder-mode').forEach(choice => choice.classList.toggle('is-selected', choice === button));
  $('#start-button').textContent = mode === 'daily' ? 'Günlük merdivene başla ↗' : 'Seferi sürdür ↗';
  renderChrome();
  $('#daily-options').classList.toggle('hidden', mode !== 'daily');
}));
$('#resume-button').addEventListener('click', () => {
  if (mode === 'daily') startDaily(TODAY); else startSeries();
});
$('#menu-button').addEventListener('click', () => { $('#game-screen').classList.add('hidden'); $('#menu-screen').classList.remove('hidden'); $('#menu-button').hidden = true; window.dispatchEvent(new Event('game:layoutchange')); });
$('#back-button').addEventListener('click', () => $('#menu-button').click());
$('#next-button').addEventListener('click', () => {
  if (!game || game.status !== 'won' || mode !== 'series' || saved.seriesIndex >= PUZZLES.length - 1) return;
  saved.seriesIndex += 1; saved.seriesGame = null; save(); startSeries();
});

const cloud = syncGameOnAccountChange('kelime-merdiveni', {
  read: () => saved,
  write: incoming => {
    saved = mergeStates(saved, incoming); localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); renderChrome();
    if (game?.mode === 'daily') startDaily(selectedDate); else if (game?.mode === 'series') startSeries(saved.seriesIndex);
  },
  isValid: incoming => validState(incoming),
  merge: (local, remote) => mergeStates(local, remote),
  counters: current => ({ dailyWins: current.records.dailyWins, totalStars: current.records.totalStars, seriesCompleted: current.records.seriesCompleted }),
  getStats: current => ({ dailyWins: current.records.dailyWins, totalStars: current.records.totalStars, bestStars: current.records.bestStars, seriesCompleted: current.records.seriesCompleted }),
  onStatus: message => { $('#save-state').textContent = message; }
});

function mergeStates(local, remote) {
  const dailyGames = { ...(remote?.dailyGames || {}), ...(local?.dailyGames || {}) };
  const records = Object.fromEntries(Object.keys(INITIAL.records).map(key => [key, Math.max(Number(local?.records?.[key]) || 0, Number(remote?.records?.[key]) || 0)]));
  const chooseSeries = (local?.seriesIndex || 0) >= (remote?.seriesIndex || 0) ? local : remote;
  return { ...INITIAL, ...remote, ...local, dailyGames, records, seriesIndex: Math.max(local?.seriesIndex || 0, remote?.seriesIndex || 0), seriesStars: Math.max(local?.seriesStars || 0, remote?.seriesStars || 0), seriesGame: chooseSeries?.seriesGame || local?.seriesGame || remote?.seriesGame || null };
}

function validState(incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming) || !incoming.records || !incoming.dailyGames || !Number.isInteger(incoming.seriesIndex) || incoming.seriesIndex < 0 || incoming.seriesIndex >= PUZZLES.length) return false;
  for (const [date, candidate] of Object.entries(incoming.dailyGames)) if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidGame(candidate, PUZZLE_MAP, DICTIONARY) || candidate.mode !== 'daily' || candidate.date !== date) return false;
  return incoming.seriesGame == null || isValidGame(incoming.seriesGame, PUZZLE_MAP, DICTIONARY) && incoming.seriesGame.mode === 'series';
}

renderChrome();
