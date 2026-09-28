import { PUZZLES } from './puzzles.js?v=mantik27';
import { createGame, submitWord, giveHint, isValidGame, dailyPuzzle, dateKey, prepareDictionary, revealSolution, orderForSeries, applyDailyStreak, streakForDisplay } from './logic.js?v=mantik27';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=mantik27';
import { createFlow, createStage } from '../../game-stage.js?v=mantik27';
import { confirmDialog } from '../../game-dialog.js?v=mantik27';

const $ = selector => document.querySelector(selector);
// Ortak sahne şablonu (game-stage.js): menü, merdivenin üstünde açılan katmandır; sonuç da aynı kart katmanıdır.
// Merdiven hep sahnede durur, kelime listesi sabit yükseklikte kayar; çerçeve ekran değişince büyüyüp küçülmez.
const flow = createFlow({ menu: $('#menu-screen'), game: $('#game-screen') });
const stage = createStage({ frame: $('#game-screen').parentElement });
let stageKey = '';
const DICTIONARY = new Set(prepareDictionary(window.HARFANE_WORDS || []));
const PUZZLE_MAP = new Map(PUZZLES.map(puzzle => [puzzle.id, puzzle]));
// Sefer kolaydan zora sıralıdır (adım sayısı 3→7); günlük bulmaca ise tarihe bağlı ham sırayı kullanır.
const SERIES = orderForSeries(PUZZLES);
const STORAGE_KEY = 'oyunarasi-kelime-merdiveni-v1';
const TODAY = dateKey();
const INITIAL = { dailyGames: {}, lastDailyDate: '', seriesIndex: 0, seriesStars: 0, seriesGame: null, records: { dailyPlayed: 0, dailyWins: 0, dailyStreak: 0, bestStars: 0, seriesCompleted: 0, totalStars: 0 } };
let saved = load();
let mode = 'daily';
let selectedDate = TODAY;
let game = null;
let currentPuzzle = null;
let lastInputKey = '';

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

function loadDaily(date) {
  mode = 'daily'; selectedDate = date; currentPuzzle = puzzleForDay(date);
  const candidate = saved.dailyGames[date];
  game = isValidGame(candidate, PUZZLE_MAP, DICTIONARY) && candidate.date === date && candidate.mode === 'daily'
    ? candidate : createGame(currentPuzzle, 'daily', date);
}

function startDaily(date = TODAY) {
  if (date > TODAY || date < '2026-01-01') return setMessage('Arşivde 1 Ocak 2026 ile bugün arasındaki bulmacalar var.', 'error');
  loadDaily(date);
  $('#archive-date').value = date;
  showGame();
}

function startSeries(index = saved.seriesIndex) {
  mode = 'series';
  const boundedIndex = Math.max(0, Math.min(PUZZLES.length - 1, index));
  saved.seriesIndex = boundedIndex;
  currentPuzzle = SERIES[boundedIndex];
  const candidate = saved.seriesGame;
  game = isValidGame(candidate, PUZZLE_MAP, DICTIONARY) && candidate.mode === 'series' && candidate.puzzleId === currentPuzzle.id
    ? candidate : createGame(currentPuzzle, 'series', String(boundedIndex + 1));
  showGame();
}

function showGame() {
  $('#menu-button').hidden = false;
  $('#daily-options').classList.toggle('hidden', mode !== 'daily');
  $('#mode-caption').textContent = mode === 'daily' ? (selectedDate === TODAY ? 'GÜNLÜK BULMACA' : 'ARŞİV BULMACASI') : 'SEFER';
  $('#progress-label').textContent = mode === 'daily' ? `#${String(PUZZLES.findIndex(item => item.id === currentPuzzle.id) + 1).padStart(3, '0')}` : `${saved.seriesIndex + 1} / ${PUZZLES.length}`;
  $('#status').textContent = mode === 'daily' ? (selectedDate === TODAY ? 'Günlük merdiven başladı. Her adımda bir harfi değiştir.' : 'Arşiv merdiveni açık. Her adımda bir harfi değiştir.') : `Sefer · ${saved.seriesIndex + 1}. basamak`;
  flow.show('game');
  paintGame();
}

// Menü açıkken arkada bugünkü merdiven durur; sahne ilk açılışta da tam boyundadır.
function paintGame() {
  $('#start-word').textContent = currentPuzzle.path[0].toLocaleUpperCase('tr-TR');
  $('#target-word').textContent = currentPuzzle.path.at(-1).toLocaleUpperCase('tr-TR');
  renderGame();
}

function showMenu() {
  flow.show('menu');
  $('#menu-button').hidden = true;
  renderResult();
}

function renderResult() {
  const finished = flow.current === 'game' && ['won', 'revealed'].includes(game?.status);
  const key = finished ? `${mode}-${mode === 'daily' ? selectedDate : saved.seriesIndex}-${game.path.length}-${game.status}` : '';
  if (key === stageKey) return;
  stageKey = key;
  if (!finished) { stage.hide(); return; }
  const hasNext = mode === 'series' && saved.seriesIndex < SERIES.length - 1;
  const kicker = mode === 'series' ? `SEFER · ${saved.seriesIndex + 1}. BASAMAK` : selectedDate === TODAY ? 'GÜNLÜK BULMACA · TAMAM' : 'ARŞİV BULMACASI · TAMAM';
  const revealed = game.status === 'revealed';
  stage.show({
    kind: 'result', kicker: revealed ? `${kicker.split(' · ')[0]} · ÇÖZÜM GÖSTERİLDİ` : kicker,
    title: revealed ? 'Çözüm gösterildi' : game.stars === 3 ? 'En kısa yoldan ulaştın!' : 'Hedefe ulaştın!',
    ...(revealed ? { copy: 'Bu merdivenden yıldız kazanılmadı. Diğerinde görüşürüz!' } : { stars: game.stars }),
    stats: [['Hamle', game.path.length - 1], ['En kısa', game.shortestSteps], ['İpucu', game.hints]],
    actions: [
      ...(hasNext ? [{ label: 'Sonraki basamak', primary: true, onClick: nextLevel }] : []),
      { label: mode === 'daily' ? 'Menü ve arşiv' : 'Sefer menüsü', primary: !hasNext, onClick: showMenu }
    ],
    dismissible: true
  });
}

function renderChrome() {
  $('#star-total').textContent = `${saved.records.totalStars} ★`;
  const streak = streakForDisplay({ streak: saved.records.dailyStreak, lastDate: saved.lastDailyDate }, TODAY);
  $('#daily-note').textContent = streak > 0 ? `🔥 ${streak} günlük seri` : 'Herkes için aynı merdiven';
  $('#resume-button').hidden = !(saved.dailyGames[TODAY] || saved.seriesGame);
  $('#resume-button').textContent = mode === 'daily' ? 'Bugünkü merdivene dön' : `Sefer · ${saved.seriesIndex + 1}. basamağa dön`;
}

function renderGame() {
  $('#step-count').textContent = `${game.path.length - 1} hamle`;
  $('#shortest-label').textContent = `En kısa: ${game.shortestSteps} hamle`;
  $('#star-display').textContent = `${'★'.repeat(game.stars)}${'☆'.repeat(3 - game.stars)}`;
  const shown = game.status === 'revealed' ? [...game.path, ...game.revealed] : game.path;
  $('#word-ladder').replaceChildren(...shown.map((word, index) => {
    const row = document.createElement('li'); row.className = `ladder-step${index >= game.path.length ? ' is-revealed' : ''}`;
    const count = document.createElement('span'); count.className = 'ladder-step-number'; count.textContent = String(index);
    const tiles = document.createElement('span'); tiles.className = 'ladder-word';
    const before = [...(shown[index - 1] || '')]; const letters = [...word];
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
  const finished = game.status !== 'playing';
  // Yazılan kelime yalnızca bulmaca ya da hamle değişince temizlenir; ipucu düğmesi onu silmez.
  const inputKey = `${game.puzzleId}-${game.path.length}-${game.status}`;
  if (inputKey !== lastInputKey) { lastInputKey = inputKey; $('#word-input').value = ''; }
  $('#word-input').disabled = finished;
  $('#hint-button').disabled = finished;
  $('#reveal-button').hidden = finished || game.hints < 2;
  // Yeni kelime listenin alt ucunda kalırsa görünür olsun.
  const ladder = $('#word-ladder'); ladder.scrollTop = ladder.scrollHeight;
  if (game.hint) {
    const previous = [...game.path.at(-1)]; const next = [...game.hint]; const position = previous.findIndex((letter, index) => letter !== next[index]);
    setMessage(`İpucu: ${position + 1}. harfi “${next[position].toLocaleUpperCase('tr-TR')}” yap.`, 'hint');
  } else if (!finished) setMessage('Bir harfi değiştirerek sıradaki geçerli kelimeyi yaz.', '');
  renderResult();
}

function finishIfWon(previousGame, nextGame) {
  if (previousGame.status !== 'won' && nextGame.status === 'won') {
    if (mode === 'daily') {
      saved.records.dailyPlayed += 1; saved.records.dailyWins += 1;
      const streak = applyDailyStreak({ streak: saved.records.dailyStreak, lastDate: saved.lastDailyDate }, selectedDate, TODAY);
      saved.records.dailyStreak = streak.streak; saved.lastDailyDate = streak.lastDate;
    }
    else { saved.seriesStars += nextGame.stars; if (saved.seriesIndex === SERIES.length - 1) saved.records.seriesCompleted += 1; }
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
  game = giveHint(game, DICTIONARY); if (mode === 'daily') saved.dailyGames[selectedDate] = game; else saved.seriesGame = game;
  save(); renderGame();
});

$('#reveal-button').addEventListener('click', async () => {
  if (game?.status !== 'playing' || game.hints < 2) return;
  if (!(await confirmDialog({ title: 'Çözüm gösterilsin mi?', message: 'Bu merdiveni yıldız kazanmadan bitirirsin.', confirmLabel: 'Çözümü göster' }))) return;
  game = revealSolution(game, DICTIONARY); if (mode === 'daily') saved.dailyGames[selectedDate] = game; else saved.seriesGame = game;
  save(); renderGame(); setMessage('Çözüm gösterildi; yıldız kazanılmadı.', '');
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
$('#menu-button').addEventListener('click', showMenu);
function nextLevel() {
  if (!game || !['won', 'revealed'].includes(game.status) || mode !== 'series' || saved.seriesIndex >= SERIES.length - 1) return;
  saved.seriesIndex += 1; saved.seriesGame = null; save(); startSeries();
}

const cloud = syncGameOnAccountChange('kelime-merdiveni', {
  read: () => saved,
  write: incoming => {
    saved = mergeStates(saved, incoming); localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); renderChrome();
    if (flow.current !== 'game') { loadDaily(TODAY); paintGame(); }
    else if (game?.mode === 'daily') startDaily(selectedDate); else if (game?.mode === 'series') startSeries(saved.seriesIndex);
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
  const lastDailyDate = [local?.lastDailyDate, remote?.lastDailyDate].filter(value => typeof value === 'string').sort().at(-1) || '';
  return { ...INITIAL, ...remote, ...local, dailyGames, records, lastDailyDate, seriesIndex: Math.max(local?.seriesIndex || 0, remote?.seriesIndex || 0), seriesStars: Math.max(local?.seriesStars || 0, remote?.seriesStars || 0), seriesGame: chooseSeries?.seriesGame || local?.seriesGame || remote?.seriesGame || null };
}

function validState(incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming) || !incoming.records || !incoming.dailyGames || !Number.isInteger(incoming.seriesIndex) || incoming.seriesIndex < 0 || incoming.seriesIndex >= PUZZLES.length) return false;
  for (const [date, candidate] of Object.entries(incoming.dailyGames)) if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidGame(candidate, PUZZLE_MAP, DICTIONARY) || candidate.mode !== 'daily' || candidate.date !== date) return false;
  return incoming.seriesGame == null || isValidGame(incoming.seriesGame, PUZZLE_MAP, DICTIONARY) && incoming.seriesGame.mode === 'series';
}

loadDaily(TODAY);
paintGame();
showMenu();
renderChrome();
