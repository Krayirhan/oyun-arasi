import {
  MAX_TRIES, WORD_LENGTH, answerForDay, applyDailyResult, attemptsForMode as attemptsFor, dayKey, defaultStats, normalizePool as cleanPool,
  normalizeSeries as cleanSeries, normalizeStats, previousDayKey, puzzleNumberFor, readJson, scoreGuess as scoreWord, shuffled, streakForDisplay, writeJson
} from './logic.js?v=mantik3';

const ANSWERS = window.HARFANE_ANSWERS;
const VALID_WORDS = new Set(window.HARFANE_WORDS);

function createLegacySeriesLevels() {
  const levels = [...ANSWERS];
  let seed = 20260923;
  for (let index = levels.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const target = seed % (index + 1);
    [levels[index], levels[target]] = [levels[target], levels[index]];
  }
  return levels;
}

const LEGACY_SERIES_LEVELS = createLegacySeriesLevels();
const SERIES_TOTAL = ANSWERS.length;

const KEY_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
  ['enter', 'z', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç', 'backspace']
];
const STORAGE_KEY = 'harfane-state-v1';
const LEGACY_STATS_STORAGE_KEY = 'harfane-stats-v1';
const STORAGE_V2 = 'harfane-state-v2';
const STATS_STORAGE_KEY = `${STORAGE_V2}-statistics`;
const SERIES_STORAGE_KEY = `${STORAGE_V2}-series-progress`;
const PRACTICE_POOL_STORAGE_KEY = `${STORAGE_V2}-practice-pool`;

const state = {
  mode: 'home', answer: '', guesses: [], current: '', gameOver: false, won: false,
  series: { level: 1, wins: 0, best: 0, completed: false, completedRuns: 0, order: [] },
  levelCounted: false,
  legacyStats: { played: 0, wins: 0, streak: 0, best: 0, distribution: [0, 0, 0, 0, 0, 0] },
  practicePool: [],
  tryLimit: MAX_TRIES,
  keyStates: {}, user: null,
  stats: { played: 0, wins: 0, streak: 0, best: 0, distribution: [0, 0, 0, 0, 0, 0] }
};

const board = document.querySelector('#board');
const keyboard = document.querySelector('#keyboard');
const message = document.querySelector('#message');
const toast = document.querySelector('#toast');
const authButton = document.querySelector('#auth-button');
const homeAuthButton = document.querySelector('#home-auth-button');
const homeAccountLabel = document.querySelector('#home-account-label');
const homeScreen = document.querySelector('#home-screen');
const gameScreen = document.querySelector('#game-screen');
const modeLabel = document.querySelector('#mode-label');
const seriesCardAction = document.querySelector('#series-card-action');
const dailyCardAction = document.querySelector('#daily-card-action');
const menuButton = document.querySelector('#menu-button');
const statusElement = document.querySelector('#status');
const scoreA = { label: document.querySelector('#score-a-label'), value: document.querySelector('#score-a') };
const scoreB = { label: document.querySelector('#score-b-label'), value: document.querySelector('#score-b') };
let firebaseBridge = null;
let authMode = 'signin';
let cloudSaveQueue = Promise.resolve();
let authRevision = 0;
let modeLoadRevision = 0;

const todayKey = () => dayKey();
const yesterdayKey = () => previousDayKey();
const puzzleNumber = () => puzzleNumberFor();

function progressDocumentId(mode) {
  return mode === 'daily' ? `daily-${todayKey()}` : mode;
}

function answerForMode(mode) {
  if (mode === 'daily') return answerForDay(ANSWERS, puzzleNumber());
  if (mode === 'series') return state.series.order[state.series.level - 1] || '';
  return '';
}

function seriesLabel() {
  return `SEVİYE ${String(state.series.level).padStart(2, '0')} / ${SERIES_TOTAL}`;
}

function shuffleAnswers() {
  return shuffled(ANSWERS);
}

function attemptsForMode(mode = state.mode, level = state.series.level) {
  return attemptsFor(mode, level);
}

function newSeriesProgress() {
  return { level: 1, wins: 0, best: state.series.best, completed: false,
    completedRuns: state.series.completedRuns, order: shuffleAnswers() };
}

function loadState() {
  const savedStats = readJson(localStorage, STATS_STORAGE_KEY);
  state.stats = normalizeStats(savedStats?.daily || defaultStats());
  state.legacyStats = defaultStats();
  const savedSeries = readJson(localStorage, SERIES_STORAGE_KEY);
  const oldProgress = readJson(localStorage, `${STORAGE_KEY}-series-progress`);
  if (savedSeries) state.series = normalizeSeries(savedSeries);
  else if (oldProgress) {
    const oldWins = Number(oldProgress.wins) || 0;
    const oldLevel = Number(oldProgress.level) || oldWins + 1;
    state.series = normalizeSeries({
      level: Math.min(oldLevel, SERIES_TOTAL), wins: Math.min(oldWins, SERIES_TOTAL),
      best: Math.min(Number(oldProgress.best) || oldWins, SERIES_TOTAL),
      completed: oldLevel > SERIES_TOTAL || oldWins >= SERIES_TOTAL,
      completedRuns: oldWins >= SERIES_TOTAL ? 1 : 0,
      order: LEGACY_SERIES_LEVELS
    });
  } else state.series = { ...state.series, order: shuffleAnswers() };
  state.practicePool = normalizePool(readJson(localStorage, PRACTICE_POOL_STORAGE_KEY));
}

// Depolama yazılamıyorsa (kota dolu, özel sekme) oyun sürer; oyuncuya bir kez haber verilir.
let storageWarned = false;
function saveState() {
  const results = [
    writeJson(localStorage, STATS_STORAGE_KEY, { daily: state.stats, legacy: state.legacyStats }),
    writeJson(localStorage, SERIES_STORAGE_KEY, state.series),
    writeJson(localStorage, PRACTICE_POOL_STORAGE_KEY, state.practicePool)
  ];
  if (state.mode !== 'home') results.push(writeJson(localStorage, `${STORAGE_V2}-${state.mode}`, {
    date: state.mode === 'daily' && state.dailyDate ? state.dailyDate : todayKey(), answer: state.answer, guesses: state.guesses, current: state.current,
    gameOver: state.gameOver, won: state.won, keyStates: state.keyStates, level: state.series.level,
    levelCounted: Boolean(state.levelCounted)
  }));
  if (results.includes(false) && !storageWarned) { storageWarned = true; showToast('Bu cihazda kayıt yapılamıyor; oyun bu oturumda devam eder.'); }
}

function normalizeSeries(progress = {}) {
  return cleanSeries(progress, ANSWERS);
}

function normalizePool(pool) {
  return cleanPool(pool, ANSWERS);
}

function drawPracticeAnswer() {
  if (!state.practicePool.length) state.practicePool = shuffleAnswers();
  return state.practicePool.shift();
}

function showSavedResult() {
  message.textContent = '';
  message.classList.remove('error', 'message-pulse');
  if (!state.gameOver) return;
  if (state.mode === 'series' && state.series.completed) showMessage('Sefer tamamlandı. Yeni bir sefer başlatabilirsin.');
  else if (state.won) showMessage(state.mode === 'series' ? `Seviye ${state.series.level} tamamlandı.` : `${state.guesses.length} denemede buldun. Harika!`);
  else showMessage(`Cevap: ${state.answer.toLocaleUpperCase('tr-TR')}`);
}

function creditSeriesWin() {
  if (state.mode !== 'series' || !state.gameOver || !state.won || state.levelCounted || state.series.completed) return;
  state.series.wins += 1;
  state.series.best = Math.max(state.series.best, state.series.wins);
  state.levelCounted = true;
  if (state.series.level === SERIES_TOTAL) {
    state.series.completed = true;
    state.series.completedRuns += 1;
  }
}

function restoreCloudData(data, mode = state.mode) {
  const profile = data.profile || {};
  const harfaneStats = profile.gameStats?.harfane || {};
  if (harfaneStats.daily) state.stats = normalizeStats(harfaneStats.daily);
  if (harfaneStats.sefer) {
    state.series.level = Math.max(1, Math.min(SERIES_TOTAL, Number(harfaneStats.sefer.level) || state.series.level));
    state.series.wins = Math.max(0, Math.min(SERIES_TOTAL, Number(harfaneStats.sefer.wins) || 0));
    state.series.completed = Boolean(harfaneStats.sefer.completed);
    state.series.best = Math.max(state.series.best, Number(harfaneStats.sefer.best) || 0);
    state.series.completedRuns = Math.max(state.series.completedRuns, Number(harfaneStats.sefer.completedRuns) || 0);
  }
  if (mode === 'series' && data.game?.order) {
    state.series = normalizeSeries({
      level: data.game.level, wins: data.game.seriesWins, best: Math.max(state.series.best, Number(data.game.seriesBest) || 0),
      completed: data.game.completed, completedRuns: Math.max(state.series.completedRuns, Number(data.game.completedRuns) || 0),
      order: data.game.order
    });
  } else if (mode === 'series' && data.game?.level) {
    const cloudLevel = Number(data.game.level) || state.series.level;
    state.series.order = [...LEGACY_SERIES_LEVELS];
    state.series.level = Math.min(cloudLevel, SERIES_TOTAL);
    state.series.wins = Math.min(Number(data.game.seriesWins) || 0, SERIES_TOTAL);
    state.series.best = Math.max(state.series.best, Number(data.game.seriesBest) || 0, state.series.wins);
    state.series.completed = cloudLevel > SERIES_TOTAL || state.series.wins >= SERIES_TOTAL;
    if (state.series.completed && !state.series.completedRuns) state.series.completedRuns = 1;
  }
  if (data.game && (mode !== 'daily' || data.game.date === todayKey())) {
    if (mode === 'series') state.answer = answerForMode('series');
    state.guesses = Array.isArray(data.game.guesses) ? data.game.guesses : [];
    state.gameOver = Boolean(data.game.gameOver ?? (data.game.won != null));
    state.won = Boolean(data.game.won);
    state.current = data.game.current || '';
    state.levelCounted = Boolean(data.game.levelCounted || (mode === 'series' && data.game.won && data.game.order));
    state.keyStates = {};
    state.guesses.forEach(guess => [...guess].forEach((letter, index) => updateKeyState(letter, scoreGuess(guess)[index])));
    if (mode === 'series' && !data.game.order) creditSeriesWin();
  }
  if (mode === 'series' && state.series.completed && !data.game?.order) {
    state.answer = state.series.order[SERIES_TOTAL - 1];
    state.guesses = []; state.current = ''; state.gameOver = true; state.won = true; state.keyStates = {};
    state.levelCounted = true;
  }
  buildBoard(); renderKeyboard(); showSavedResult(); refreshModeChrome(); saveState();
}

function syncCloudGame(mode = state.mode) {
  if (!firebaseBridge || !state.user || !['daily', 'series'].includes(mode)) return;
  const user = state.user;
  if (mode !== state.mode || state.cloudReadyMode !== mode) return;
  const documentId = progressDocumentId(mode);
  const game = {
    mode, level: state.series.level, seriesWins: state.series.wins, seriesBest: state.series.best,
    completed: state.series.completed, completedRuns: state.series.completedRuns,
    ...(mode === 'series' ? { order: [...state.series.order] } : {}),
    puzzleNumber: puzzleNumber(), guesses: [...state.guesses], current: state.current, levelCounted: state.levelCounted,
    gameOver: state.gameOver, won: state.won, date: todayKey()
  };
  const profileData = { daily: { ...state.stats, distribution: [...state.stats.distribution] }, sefer: {
    level: state.series.level, wins: state.series.wins, best: state.series.best,
    completed: state.series.completed, completedRuns: state.series.completedRuns
  } };
  cloudSaveQueue = cloudSaveQueue.catch(() => {}).then(() => firebaseBridge.saveGame(user, documentId, game, profileData))
    .then(savedGame => {
      if (mode === 'daily' && savedGame && state.user?.uid === user.uid && state.mode === mode
        && (savedGame.guesses.length > state.guesses.length || (savedGame.gameOver && !state.gameOver))) {
        restoreCloudData({ game: savedGame }, mode);
      }
    })
    .catch(() => showToast('Bulut kaydı yapılamadı.'));
}

async function loadCloudMode(mode) {
  if (!firebaseBridge || !state.user) return;
  const user = state.user;
  const revision = ++modeLoadRevision;
  state.cloudReadyMode = '';
  try {
    const data = await firebaseBridge.loadUserData(user, progressDocumentId(mode));
    if (revision !== modeLoadRevision || state.user?.uid !== user.uid || state.mode !== mode) return;
    restoreCloudData(data, mode);
    state.cloudReadyMode = mode;
    if ((!data.game && ['daily', 'series'].includes(mode)) || (mode === 'series' && data.game && !data.game.order)) syncCloudGame(mode);
  } catch (error) {
    if (revision === modeLoadRevision && state.user?.uid === user.uid && state.mode === mode) {
      console.error('Harfane Firestore progress read failed:', error);
      showToast(`Bulut ilerlemesi okunamadı (${error?.code || 'unknown'}).`);
    }
  }
}

function buildBoard() {
  board.innerHTML = '';
  state.tryLimit = attemptsForMode();
  for (let row = 0; row < state.tryLimit; row += 1) {
    for (let col = 0; col < WORD_LENGTH; col += 1) {
      const tile = document.createElement('div');
      tile.className = 'tile'; tile.dataset.row = row; tile.dataset.col = col;
      tile.setAttribute('aria-label', `${row + 1}. satır ${col + 1}. harf`);
      board.appendChild(tile);
    }
  }
  renderBoard();
}

function countdownText() {
  const now = new Date(); const tomorrow = new Date(now); tomorrow.setHours(24, 0, 0, 0);
  const seconds = Math.max(0, Math.floor((tomorrow - now) / 1000));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}

function setScores(labelA, valueA, labelB, valueB) {
  scoreA.label.textContent = labelA; scoreA.value.textContent = valueA;
  scoreB.label.textContent = labelB; scoreB.value.textContent = valueB;
}

function displayedStreak() {
  return streakForDisplay(state.stats, todayKey(), yesterdayKey());
}

function seriesProgressText() {
  return state.series.completed ? `${SERIES_TOTAL} / ${SERIES_TOTAL} ✓` : `${state.series.level} / ${SERIES_TOTAL}`;
}

// Panelin tüm üst/alt bilgileri ve sonuç kartı moda göre buradan güncellenir.
function refreshModeChrome() {
  const home = state.mode === 'home';
  const remaining = Math.max(0, state.tryLimit - state.guesses.length);
  menuButton.hidden = home;
  if (home) {
    setScores('GÜNLÜK SERİ', `${displayedStreak()}`, 'SEFER', seriesProgressText());
    statusElement.textContent = 'Bir oyun modu seç.';
  } else if (state.mode === 'daily') {
    setScores('GÜNLÜK SERİ', `${state.stats.streak}`, 'YENİ BULMACA', countdownText());
    modeLabel.textContent = `GÜNLÜK BULMACA · #${String(puzzleNumber()).padStart(3, '0')}`;
    statusElement.textContent = `Günlük bulmaca · ${state.tryLimit} tahmin hakkı · Herkes aynı kelimeyi arıyor.`;
  } else if (state.mode === 'series') {
    setScores('SEVİYE', seriesProgressText(), 'KALAN HAK', `${remaining}`);
    modeLabel.textContent = state.series.completed ? 'SEFER · TAMAMLANDI' : `SEFER · ${seriesLabel()}`;
    statusElement.textContent = `Sefer · ${attemptsForMode()} tahmin hakkı · Zorluk seviyelerle artar.`;
  } else {
    setScores('MOD', 'Antrenman', 'KALAN HAK', `${remaining}`);
    modeLabel.textContent = 'ANTRENMAN · SINIRSIZ';
    statusElement.textContent = 'Antrenman · İstediğin kadar oyna; sonuçlar istatistiklere eklenmez.';
  }
  renderResult();
  updateHomeMetadata();
}

// Oyun sonu kartı ortak sahne şablonundan gelir (game-stage.js, klasik betik için window.OyunStage). Klavye yerinde
// kalır, kart tahtanın üstünde açılır; modül bu betikten sonra yüklendiği için kart 'oyun-stage-ready' ile kurulur.
let resultStage = null;
let resultKey = '';
function renderResult() {
  if (!resultStage && window.OyunStage) resultStage = window.OyunStage.createStage({ frame: gameScreen.parentElement });
  if (!resultStage) return;
  const over = state.mode !== 'home' && state.gameOver;
  if (!over) { resultKey = ''; resultStage.hide(); return; }
  message.textContent = '';
  const tries = state.guesses.length;
  const answer = state.answer.toLocaleUpperCase('tr-TR');
  let kicker; let title; let copy; let next = '';
  if (state.mode === 'series' && state.series.completed) {
    kicker = 'SEFER TAMAMLANDI'; title = 'Tüm seviyeler bitti!';
    copy = `${SERIES_TOTAL} seviyenin hepsini geçtin. Yeni bir sefere başlayabilirsin.`; next = 'Yeni sefer başlat';
  } else if (state.won) {
    title = tries <= 2 ? 'Muhteşem!' : tries <= 4 ? 'Harika!' : 'Buldun!';
    if (state.mode === 'daily') { kicker = `GÜNLÜK BULMACA · #${String(puzzleNumber()).padStart(3, '0')}`; copy = `${tries} denemede buldun. Yeni bulmacaya ${countdownText()} var.`; }
    else if (state.mode === 'series') { kicker = `SEVİYE ${state.series.level} / ${SERIES_TOTAL}`; title = `Seviye ${state.series.level} tamam!`; copy = `${tries} denemede buldun.`; next = 'Sonraki seviye'; }
    else { kicker = 'ANTRENMAN'; copy = `${tries} denemede buldun.`; next = 'Yeni kelime'; }
  } else {
    title = 'Bu sefer olmadı';
    if (state.mode === 'daily') { kicker = `GÜNLÜK BULMACA · #${String(puzzleNumber()).padStart(3, '0')}`; copy = `Cevap: ${answer}. Yeni bulmacaya ${countdownText()} var.`; }
    else if (state.mode === 'series') { kicker = `SEVİYE ${state.series.level} / ${SERIES_TOTAL}`; copy = 'Tahmin hakların bitti. Aynı kelimeyi yeniden dene; seviyeyi geçince yenisi açılır.'; next = 'Tekrar dene'; }
    else { kicker = 'ANTRENMAN'; copy = `Cevap: ${answer}.`; next = 'Yeni kelime'; }
  }
  const spec = {
    kind: 'result', kicker, title, copy,
    stats: [['Deneme', `${state.won ? tries : 'X'}/${state.tryLimit}`], ...(state.mode === 'daily' ? [['Seri', state.stats.streak], ['En iyi seri', state.stats.best]] : [])],
    actions: [
      ...(next ? [{ label: next, primary: true, onClick: advanceMode }] : []),
      ...(state.mode === 'daily' ? [{ label: 'Sonucunu paylaş', primary: !next, onClick: shareResult }] : []),
      { label: 'Menü', onClick: returnHome }
    ],
    dismissible: true
  };
  // Geri sayım her saniye metni tazeler; "Tahtaya bak" ile kapatılmış kart kendiliğinden yeniden açılmaz.
  const key = `${state.mode}-${state.answer}-${tries}-${state.won}-${state.series.level}`;
  if (key !== resultKey) { resultKey = key; resultStage.show(spec); }
  else if (resultStage.visible) resultStage.show(spec);
}
window.addEventListener('oyun-stage-ready', renderResult);

function updateHomeMetadata() {
  seriesCardAction.textContent = state.series.completed
    ? 'Tamamlandı · yeni sefer ↗' : `${state.series.level} / ${SERIES_TOTAL} seviyeye başla ↗`;
  let dailyDone = false;
  try {
    const saved = readJson(localStorage, `${STORAGE_V2}-daily`);
    dailyDone = Boolean(saved && saved.date === todayKey() && saved.gameOver);
  } catch { dailyDone = false; }
  dailyCardAction.textContent = dailyDone ? 'Bugün çözüldü ✓ · sonucu gör ↗' : `#${String(puzzleNumber()).padStart(3, '0')} · başla ↗`;
}

function renderBoard() {
  [...board.children].forEach(tile => {
    const row = Number(tile.dataset.row); const col = Number(tile.dataset.col);
    const guess = state.guesses[row];
    let letter = guess?.[col] || (row === state.guesses.length ? state.current[col] || '' : '');
    tile.textContent = letter.toLocaleUpperCase('tr-TR');
    tile.className = `tile${letter ? ' filled' : ''}`;
    if (!guess && row === state.guesses.length && state.invalidGuess) tile.classList.add('invalid');
    if (guess) tile.classList.add(scoreGuess(guess)[col]);
  });
}

const scoreGuess = guess => scoreWord(guess, state.answer);

function renderKeyboard() {
  keyboard.innerHTML = '';
  KEY_ROWS.forEach(row => {
    const keyRow = document.createElement('div');
    keyRow.className = 'key-row';
    row.forEach(key => {
      const button = document.createElement('button');
      button.className = `key${key.length > 1 ? ' wide' : ''}${state.keyStates[key] ? ` ${state.keyStates[key]}` : ''}`;
      button.dataset.key = key;
      button.textContent = key === 'backspace' ? '⌫' : key === 'enter' ? 'GÖNDER' : key;
      button.setAttribute('aria-label', key === 'backspace' ? 'Sil' : key === 'enter' ? 'Tahmini gönder' : key);
      button.addEventListener('click', () => handleKey(key));
      keyRow.appendChild(button);
    });
    keyboard.appendChild(keyRow);
  });
}

function startMode(mode) {
  modeLoadRevision += 1;
  state.cloudReadyMode = '';
  state.mode = mode;
  state.invalidGuess = false;
  const savedV2 = readJson(localStorage, `${STORAGE_V2}-${mode}`);
  const saved = savedV2 || readJson(localStorage, `${STORAGE_KEY}-${mode}`);
  const legacyGame = !savedV2 && Boolean(saved);
  state.dailyDate = mode === 'daily' ? todayKey() : '';
  if (mode === 'daily') state.answer = answerForMode(mode);
  else if (mode === 'series') state.answer = answerForMode(mode);
  else if (saved && !saved.gameOver && saved.answer && ANSWERS.includes(saved.answer)) state.answer = saved.answer;
  else state.answer = drawPracticeAnswer();
  const validSavedGame = saved && (mode !== 'daily' || saved.date === todayKey())
    && (mode === 'practice' ? !saved.gameOver && saved.answer === state.answer : saved.answer === state.answer);
  state.guesses = validSavedGame ? saved.guesses || [] : [];
  state.current = validSavedGame ? saved.current || '' : '';
  state.gameOver = validSavedGame ? Boolean(saved.gameOver) : false;
  state.won = validSavedGame ? Boolean(saved.won) : false;
  state.levelCounted = validSavedGame ? Boolean(saved.levelCounted) : false;
  state.keyStates = validSavedGame ? saved.keyStates || {} : {};
  if (mode === 'practice' && saved && !saved.gameOver && saved.answer === state.answer && !state.practicePool.length) {
    state.practicePool = shuffleAnswers().filter(word => word !== state.answer);
  }
  if (mode === 'series' && state.series.completed && (!validSavedGame || Number(saved.level) !== SERIES_TOTAL)) {
    state.answer = state.series.order[SERIES_TOTAL - 1];
    state.guesses = []; state.current = ''; state.gameOver = true; state.won = true; state.keyStates = {};
    state.levelCounted = true;
  }
  if (mode === 'series' && legacyGame && validSavedGame) creditSeriesWin();
  showScreen('game');
  buildBoard(); renderKeyboard(); showSavedResult(); refreshModeChrome(); saveState();
  window.dispatchEvent(new Event('game:layoutchange'));
  loadCloudMode(mode);
}

// Ortak sahne standardı (play-page.css, [data-flow]): oyun tahtası hep yerinde durur, mod menüsü onun üstünde
// perdeli bir katman olarak açılır; böylece menü ile oyun arasında geçerken çerçevenin boyu değişmez.
function showScreen(name) {
  homeScreen.parentElement.dataset.stageMode = 'flow';
  homeScreen.dataset.flow = 'overlay';
  gameScreen.dataset.flow = 'stage';
  homeScreen.classList.remove('hidden');
  gameScreen.classList.remove('hidden');
  homeScreen.classList.toggle('is-offstage', name !== 'home');
  homeScreen.inert = name !== 'home';
  gameScreen.inert = name === 'home';
}

function returnHome() {
  modeLoadRevision += 1;
  state.cloudReadyMode = '';
  state.mode = 'home';
  showScreen('home');
  refreshModeChrome();
  saveState();
  window.dispatchEvent(new Event('game:layoutchange'));
  homeScreen.querySelector('.mode-card')?.focus({ preventScroll: true });
}

function advanceMode() {
  if (!state.gameOver || !['series', 'practice'].includes(state.mode)) return;
  state.invalidGuess = false;
  if (state.mode === 'series') {
    if (state.series.completed) {
      state.series = newSeriesProgress();
      state.answer = answerForMode('series');
      state.guesses = []; state.current = ''; state.gameOver = false; state.won = false; state.keyStates = {};
      state.levelCounted = false;
    } else if (!state.won) {
      state.guesses = []; state.current = ''; state.gameOver = false; state.keyStates = {};
    } else {
      if (state.series.level < SERIES_TOTAL) state.series.level += 1;
      state.answer = answerForMode('series');
      state.guesses = []; state.current = ''; state.gameOver = false; state.won = false; state.keyStates = {};
      state.levelCounted = false;
    }
  } else {
    state.answer = drawPracticeAnswer();
    state.guesses = []; state.current = ''; state.gameOver = false; state.won = false; state.keyStates = {};
  }
  buildBoard(); renderKeyboard(); showSavedResult(); refreshModeChrome(); saveState(); syncCloudGame();
}

function handleKey(key) {
  if (state.mode === 'home' || state.gameOver) return;
  state.invalidGuess = false;
  message.classList.remove('error');
  if (key === 'backspace') state.current = [...state.current].slice(0, -1).join('');
  else if (key === 'enter') submitGuess();
  else if ([...state.current].length < WORD_LENGTH) state.current += key;
  renderBoard(); renderKeyboard(); saveState();
}

function submitGuess() {
  const guess = state.current.toLocaleLowerCase('tr-TR');
  if ([...guess].length !== WORD_LENGTH) return showMessage('Beş harfli bir kelime yazmalısın.', 'error');
  if (!VALID_WORDS.has(guess)) {
    state.invalidGuess = true;
    showMessage('Böyle bir kelime yok.', 'error');
    return;
  }
  state.guesses.push(guess); state.current = '';
  const result = scoreGuess(guess);
  [...guess].forEach((letter, index) => updateKeyState(letter, result[index]));
  if (guess === state.answer) finishGame(true); else if (state.guesses.length === state.tryLimit) finishGame(false);
  renderBoard(); renderKeyboard(); refreshModeChrome(); saveState();
  if (state.mode === 'daily' || state.mode === 'series') syncCloudGame();
}

const priority = { absent: 0, present: 1, correct: 2 };
function updateKeyState(letter, status) {
  if (!state.keyStates[letter] || priority[status] > priority[state.keyStates[letter]]) state.keyStates[letter] = status;
}

function finishGame(won) {
  state.gameOver = true; state.won = won;
  creditSeriesWin();
  if (state.mode === 'daily') {
    const day = state.dailyDate || todayKey();
    const before = new Date(`${day}T12:00:00`);
    state.stats = applyDailyResult(state.stats, { won, attempts: state.guesses.length, today: day, yesterday: previousDayKey(before) });
  }
  if (won) {
    const attempts = state.guesses.length;
    showMessage(state.mode === 'series'
      ? state.series.level === SERIES_TOTAL ? 'Son seviye tamamlandı. Sefer bitti!' : `Seviye ${state.series.level} tamamlandı.`
      : `${attempts} denemede buldun. Harika!`);
  } else {
    showMessage(`Cevap: ${state.answer.toLocaleUpperCase('tr-TR')}`);
  }
  refreshModeChrome(); saveState(); syncCloudGame();
}

function showMessage(text, variant = '') {
  message.textContent = text;
  message.classList.toggle('error', variant === 'error');
  message.classList.remove('message-pulse'); void message.offsetWidth; message.classList.add('message-pulse');
}

function showToast(text) {
  toast.textContent = text; toast.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function closeModal() {
  document.querySelector('#modal-backdrop').classList.add('hidden');
}

function authErrorMessage(error) {
  const messages = {
    'auth/email-already-in-use': 'Bu e-posta zaten kayıtlı.',
    'auth/invalid-credential': 'E-posta veya şifre hatalı.',
    'auth/invalid-email': 'Geçerli bir e-posta yaz.',
    'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
    'auth/network-request-failed': 'İnternet bağlantını kontrol et.',
    'auth/too-many-requests': 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.'
  };
  return messages[error?.code] || 'İşlem tamamlanamadı. Lütfen tekrar dene.';
}

function openAuthModal(mode = authMode) {
  authMode = mode;
  openModal('auth');
}

function openModal(type) {
  const content = document.querySelector('#modal-content');
  if (type === 'help') {
    content.innerHTML = `<h2 id="modal-title">Üç farklı oyun yolu</h2><p><strong>Günlük:</strong> Her gün herkes için aynı kelimeyi altı tahminde bul.</p><p><strong>Sefer:</strong> 70 seviyeyi tamamla. İlk 20 seviyede altı, sonraki 25 seviyede beş, son 25 seviyede dört tahmin hakkın var. Yanlış sonuçta aynı seviyeyi yeniden denersin.</p><p><strong>Antrenman:</strong> Baskı olmadan sınırsız oyna. 70 kelime bitene kadar tekrar gelmez.</p><ul class="rules"><li><span class="rule-tile green">A</span> Yeşil harf doğru yerde.</li><li><span class="rule-tile yellow">R</span> Sarı harf kelimede var, yeri yanlış.</li><li><span class="rule-tile gray">T</span> Gri harf kelimede yok.</li></ul>`;
  } else if (type === 'auth') {
    const isSignUp = authMode === 'signup';
    content.innerHTML = `<h2 id="modal-title">${isSignUp ? 'Hesap oluştur' : 'Tekrar hoş geldin'}</h2><p>${isSignUp ? 'Serini ve oyun geçmişini cihazlar arasında sakla.' : 'Hesabına giriş yap, kaldığın yerden devam et.'}</p><form class="auth-form" id="auth-form">${isSignUp ? '<label>Kullanıcı adı<input id="auth-name" type="text" maxlength="30" autocomplete="name" required /></label>' : ''}<label>E-posta<input id="auth-email" type="email" autocomplete="email" required /></label><label>Şifre<input id="auth-password" type="password" minlength="6" autocomplete="current-password" required /></label><button class="auth-submit" type="submit">${isSignUp ? 'Kayıt ol' : 'Giriş yap'}</button></form><p class="auth-error" id="auth-error" role="status"></p>${isSignUp ? '' : '<button class="auth-switch" id="auth-forgot" type="button">Şifremi unuttum</button>'}<button class="auth-switch" id="auth-switch" type="button">${isSignUp ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Kayıt ol'}</button>`;
    document.querySelector('#auth-form').addEventListener('submit', async event => {
      event.preventDefault();
      const errorElement = document.querySelector('#auth-error');
      if (!firebaseBridge) { errorElement.textContent = 'Firebase hazırlanıyor, birazdan tekrar dene.'; return; }
      const email = document.querySelector('#auth-email').value.trim();
      const password = document.querySelector('#auth-password').value;
      const name = document.querySelector('#auth-name')?.value.trim() || '';
      const submit = document.querySelector('.auth-submit');
      submit.disabled = true; errorElement.textContent = '';
      try {
        if (isSignUp) await firebaseBridge.signUp(email, password, name);
        else await firebaseBridge.signIn(email, password);
        closeModal(); showToast(isSignUp ? 'Hesabın oluşturuldu. Doğrulama bağlantısı e-postana gönderildi.' : 'Giriş yapıldı.');
      } catch (error) {
        errorElement.textContent = authErrorMessage(error); submit.disabled = false;
      }
    });
    document.querySelector('#auth-forgot')?.addEventListener('click', async () => {
      const errorElement = document.querySelector('#auth-error');
      const email = document.querySelector('#auth-email').value.trim();
      if (!email) { errorElement.textContent = 'Önce e-posta adresini yaz.'; return; }
      if (!firebaseBridge) { errorElement.textContent = 'Firebase hazırlanıyor, birazdan tekrar dene.'; return; }
      try {
        await firebaseBridge.sendPasswordReset(email);
        errorElement.textContent = 'Bu adrese kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderdik.';
      } catch (error) {
        errorElement.textContent = authErrorMessage(error);
      }
    });
    document.querySelector('#auth-switch').addEventListener('click', () => openAuthModal(isSignUp ? 'signin' : 'signup'));
  } else {
    const dailyWinRate = state.stats.played ? Math.round((state.stats.wins / state.stats.played) * 100) : 0;
    const max = Math.max(1, ...state.stats.distribution);
    const rows = state.stats.distribution.map((count, i) => `<div class="distribution-row"><b>${i + 1}</b><span class="distribution-bar" style="width:${Math.max(9, (count / max) * 100)}%">${count}</span></div>`).join('');
    const seferPosition = state.series.completed ? SERIES_TOTAL : Math.max(0, state.series.level - 1);
    content.innerHTML = `<h2 id="modal-title">İstatistikler</h2>
      <h3>Günlük</h3><div class="stats-grid"><div class="stat"><strong>${state.stats.played}</strong><span>Oynanan</span></div><div class="stat"><strong>${dailyWinRate}%</strong><span>Kazanma</span></div><div class="stat"><strong>${displayedStreak()}</strong><span>Günlük seri</span></div></div>
      <p>En iyi günlük seri: <strong>${state.stats.best}</strong> gün</p><h3>Günlük tahmin dağılımı</h3><div class="distribution">${rows}</div>
      <h3>Sefer</h3><div class="stats-grid"><div class="stat"><strong>${state.series.completed ? '✓' : `${state.series.level}/${SERIES_TOTAL}`}</strong><span>İlerleme</span></div><div class="stat"><strong>${state.series.best}</strong><span>Rekor seviye</span></div><div class="stat"><strong>${state.series.completedRuns}</strong><span>Tamamlanan</span></div></div>
      <p>${state.series.completed ? 'Son Sefer tamamlandı.' : `${seferPosition} / ${SERIES_TOTAL} seviye geçildi.`}</p>
      <p>Antrenman sonuçları istatistiklere eklenmez.</p>`;
  }
  document.querySelector('#modal-backdrop').classList.remove('hidden');
}

function shareResult() {
  const score = state.guesses.map(guess => scoreGuess(guess).map(status => ({ correct: '🟩', present: '🟨', absent: '⬜' }[status])).join('')).join('\n');
  const result = `Harfle #${puzzleNumber()} ${state.won ? state.guesses.length : 'X'}/${MAX_TRIES}\n\n${score}`;
  if (navigator.clipboard) navigator.clipboard.writeText(result).then(() => showToast('Sonuç panoya kopyalandı.'));
  else showToast(result);
}

function updateCountdown() {
  if (state.mode !== 'daily') return;
  // Sayfa gece yarısını aştıysa açık oyun dünün bulmacasıdır; yeni günün bulmacası menüden açılır.
  if (state.dailyDate && state.dailyDate !== todayKey()) {
    returnHome();
    showToast('Yeni günlük bulmaca hazır!');
    return;
  }
  scoreB.value.textContent = countdownText();
  if (state.gameOver) renderResult();
}

document.addEventListener('keydown', event => {
  if (typeof event.key !== 'string' || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"], .modal-backdrop:not(.hidden)')) return;
  if (!document.querySelector('#modal-backdrop').classList.contains('hidden')) return;
  if (event.key === 'Enter') handleKey('enter');
  else if (event.key === 'Backspace') handleKey('backspace');
  else {
    const key = event.key.toLocaleLowerCase('tr-TR');
    if (KEY_ROWS.flat().includes(key)) handleKey(key);
  }
});

document.querySelector('#help-button').addEventListener('click', () => openModal('help'));
document.querySelector('#stats-button').addEventListener('click', () => openModal('stats'));
document.querySelector('#modal-close').addEventListener('click', closeModal);
document.querySelector('#modal-backdrop').addEventListener('click', event => { if (event.target.id === 'modal-backdrop') closeModal(); });
document.querySelectorAll('.mode-card').forEach(card => card.addEventListener('click', () => startMode(card.dataset.mode)));
menuButton.addEventListener('click', returnHome);
authButton.addEventListener('click', () => {
  if (state.user && firebaseBridge) firebaseBridge.signOut().catch(() => showToast('Çıkış yapılamadı.'));
  else openAuthModal();
});
homeAuthButton.addEventListener('click', () => {
  if (state.user && firebaseBridge) firebaseBridge.signOut().catch(() => showToast('Çıkış yapılamadı.'));
  else openAuthModal();
});

function connectFirebase(bridge) {
  firebaseBridge = bridge;
  bridge.onAuthStateChanged(async user => {
    const revision = ++authRevision;
    modeLoadRevision += 1;
    state.cloudReadyMode = '';
    state.user = user;
    authButton.textContent = user ? 'Çıkış yap' : 'Giriş yap';
    authButton.title = user ? (user.email || 'Hesap') : 'Hesabına giriş yap';
    homeAuthButton.textContent = user ? 'Çıkış yap' : 'Giriş yap / kayıt ol';
    homeAccountLabel.textContent = user ? `${user.displayName || user.email} olarak giriş yapıldı.` : 'İlerlemeni kaydetmek için giriş yap.';
    if (!user) return;
    try {
      const data = await bridge.loadUserData(user, null);
      if (revision !== authRevision || state.user?.uid !== user.uid) return;
      const harfaneStats = data.profile?.gameStats?.harfane || {};
      if (harfaneStats.daily) state.stats = normalizeStats(harfaneStats.daily);
      if (harfaneStats.sefer) {
        state.series.level = Math.max(1, Math.min(SERIES_TOTAL, Number(harfaneStats.sefer.level) || state.series.level));
        state.series.wins = Math.max(0, Math.min(SERIES_TOTAL, Number(harfaneStats.sefer.wins) || 0));
        state.series.completed = Boolean(harfaneStats.sefer.completed);
        state.series.best = Math.max(state.series.best, Number(harfaneStats.sefer.best) || 0);
        state.series.completedRuns = Math.max(state.series.completedRuns, Number(harfaneStats.sefer.completedRuns) || 0);
      }
      if (state.mode !== 'home') loadCloudMode(state.mode);
      else {
        const seriesData = await bridge.loadUserData(user, 'series');
        if (revision !== authRevision || state.user?.uid !== user.uid || state.mode !== 'home') return;
        if (seriesData.game?.order) state.series = normalizeSeries({
          level: seriesData.game.level, wins: seriesData.game.seriesWins,
          best: Math.max(state.series.best, Number(seriesData.game.seriesBest) || 0),
          completed: seriesData.game.completed,
          completedRuns: Math.max(state.series.completedRuns, Number(seriesData.game.completedRuns) || 0),
          order: seriesData.game.order
        });
        else if (seriesData.game?.level) {
          const cloudLevel = Number(seriesData.game.level) || 1;
          state.series.order = [...LEGACY_SERIES_LEVELS];
          state.series.level = Math.min(cloudLevel, SERIES_TOTAL);
          state.series.wins = Math.min(Number(seriesData.game.seriesWins) || 0, SERIES_TOTAL);
          state.series.best = Math.max(state.series.best, Number(seriesData.game.seriesBest) || 0, state.series.wins);
          state.series.completed = cloudLevel > SERIES_TOTAL || state.series.wins >= SERIES_TOTAL;
          if (state.series.completed && !state.series.completedRuns) state.series.completedRuns = 1;
        }
      }
      updateHomeMetadata(); saveState();
    } catch (error) {
      console.error('Harfane Firestore profile read failed:', error);
      showToast(`Bulut hesabı okunamadı (${error?.code || 'unknown'}).`);
    }
  });
}

window.addEventListener('firebase-ready', event => connectFirebase(event.detail));
if (window.firebaseBridge) connectFirebase(window.firebaseBridge);

loadState();
showScreen('home');
buildBoard(); renderKeyboard(); refreshModeChrome();
setInterval(updateCountdown, 1000);
