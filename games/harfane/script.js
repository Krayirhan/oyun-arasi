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
const MAX_TRIES = 6;
const WORD_LENGTH = 5;
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
const shareButton = document.querySelector('#share-button');
const toast = document.querySelector('#toast');
const authButton = document.querySelector('#auth-button');
const homeAuthButton = document.querySelector('#home-auth-button');
const homeAccountLabel = document.querySelector('#home-account-label');
const homeScreen = document.querySelector('#home-screen');
const gameScreen = document.querySelector('#game-screen');
const modeLabel = document.querySelector('#mode-label');
const nextLevelButton = document.querySelector('#next-level-button');
const seriesCardAction = document.querySelector('#series-card-action');
let firebaseBridge = null;
let authMode = 'signin';
let cloudSaveQueue = Promise.resolve();
let authRevision = 0;
let modeLoadRevision = 0;

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function yesterdayKey() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
}

function puzzleNumber() {
  const start = new Date(2024, 0, 1);
  const today = new Date();
  start.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((today - start) / 86400000) + 1);
}

function progressDocumentId(mode) {
  return mode === 'daily' ? `daily-${todayKey()}` : mode;
}

function answerForMode(mode) {
  if (mode === 'daily') return ANSWERS[(puzzleNumber() - 1) % ANSWERS.length];
  if (mode === 'series') return state.series.order[state.series.level - 1] || '';
  return '';
}

function seriesLabel() {
  return `SEVİYE ${String(state.series.level).padStart(2, '0')} / ${SERIES_TOTAL}`;
}

function shuffleAnswers() {
  const shuffled = [...ANSWERS];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function attemptsForMode(mode = state.mode, level = state.series.level) {
  if (mode !== 'series') return MAX_TRIES;
  if (level <= 20) return 6;
  if (level <= 45) return 5;
  return 4;
}

function newSeriesProgress() {
  return { level: 1, wins: 0, best: state.series.best, completed: false,
    completedRuns: state.series.completedRuns, order: shuffleAnswers() };
}

function defaultStats() {
  return { played: 0, wins: 0, streak: 0, best: 0, distribution: [0, 0, 0, 0, 0, 0], lastPlayedDate: '' };
}

function loadState() {
  const savedStats = JSON.parse(localStorage.getItem(STATS_STORAGE_KEY) || 'null');
  state.stats = normalizeStats(savedStats?.daily || defaultStats());
  state.legacyStats = defaultStats();
  const savedSeries = JSON.parse(localStorage.getItem(SERIES_STORAGE_KEY) || 'null');
  const oldProgress = JSON.parse(localStorage.getItem(`${STORAGE_KEY}-series-progress`) || 'null');
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
  state.practicePool = normalizePool(JSON.parse(localStorage.getItem(PRACTICE_POOL_STORAGE_KEY) || 'null'));
}

function saveState() {
  localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify({ daily: state.stats, legacy: state.legacyStats }));
  localStorage.setItem(SERIES_STORAGE_KEY, JSON.stringify(state.series));
  localStorage.setItem(PRACTICE_POOL_STORAGE_KEY, JSON.stringify(state.practicePool));
  if (state.mode !== 'home') localStorage.setItem(`${STORAGE_V2}-${state.mode}`, JSON.stringify({
    date: todayKey(), answer: state.answer, guesses: state.guesses, current: state.current,
    gameOver: state.gameOver, won: state.won, keyStates: state.keyStates, level: state.series.level,
    levelCounted: Boolean(state.levelCounted)
  }));
}

function normalizeStats(stats = {}) {
  return {
    played: Number(stats.played) || 0,
    wins: Number(stats.wins) || 0,
    streak: Number(stats.streak) || 0,
    best: Number(stats.best) || 0,
    distribution: Array.isArray(stats.distribution) && stats.distribution.length === 6
      ? stats.distribution.map(value => Number(value) || 0)
      : [0, 0, 0, 0, 0, 0],
    lastPlayedDate: stats.lastPlayedDate || ''
  };
}

function normalizeSeries(progress = {}) {
  const order = Array.isArray(progress.order) && progress.order.length === SERIES_TOTAL
    && progress.order.every(word => ANSWERS.includes(word)) ? [...progress.order] : shuffleAnswers();
  return {
    level: Math.max(1, Math.min(SERIES_TOTAL, Number(progress.level) || 1)),
    wins: Math.max(0, Math.min(SERIES_TOTAL, Number(progress.wins) || 0)),
    best: Math.max(0, Math.min(SERIES_TOTAL, Number(progress.best) || 0)),
    completed: Boolean(progress.completed),
    completedRuns: Math.max(0, Number(progress.completedRuns) || 0), order
  };
}

function normalizePool(pool) {
  return Array.isArray(pool) ? [...new Set(pool.filter(word => ANSWERS.includes(word)))] : [];
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
  refreshModeChrome();
  buildBoard(); renderKeyboard(); showSavedResult(); saveState();
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

function refreshModeChrome() {
  const progressLabel = document.querySelector('#progress-label');
  const progressUnit = document.querySelector('#progress-unit');
  const progressNote = document.querySelector('#progress-note');
  const footerLabel = document.querySelector('#footer-label');
  const isDaily = state.mode === 'daily';
  shareButton.hidden = !isDaily;
  nextLevelButton.classList.toggle('hidden', !(state.gameOver && ['series', 'practice'].includes(state.mode)));
  document.querySelector('#streak-value').textContent = isDaily ? state.stats.streak : state.mode === 'series' ? state.series.wins : '∞';
  if (state.mode === 'series') {
    progressLabel.textContent = 'SEFER İLERLEMESİ'; progressUnit.textContent = '/ 70';
    progressNote.textContent = state.series.completed ? 'Sefer tamamlandı.' : `${attemptsForMode()} tahmin hakkı · ${state.series.wins} seviye tamamlandı.`;
    footerLabel.textContent = 'SEFER İLERLEMESİ';
    document.querySelector('#countdown').textContent = `${state.series.wins} / ${SERIES_TOTAL} seviye`;
    document.querySelector('#puzzle-number').textContent = state.series.completed ? 'TAMAMLANDI' : seriesLabel();
    if (state.gameOver) nextLevelButton.textContent = state.series.completed ? 'Yeni sefer başlat ↗' : state.won ? 'Sonraki seviye ↗' : 'Tekrar dene ↗';
  } else if (state.mode === 'practice') {
    progressLabel.textContent = 'SERBEST PRATİK'; progressUnit.textContent = 'kelime'; progressNote.textContent = 'Sonuçların istatistiklere eklenmez.';
    footerLabel.textContent = 'ANTRENMAN'; document.querySelector('#countdown').textContent = '∞';
    document.querySelector('#puzzle-number').textContent = 'SINIRSIZ';
    if (state.gameOver) nextLevelButton.textContent = 'Yeni kelime ↗';
  } else {
    progressLabel.textContent = 'GÜNLÜK SERİ'; progressUnit.textContent = 'gün';
    progressNote.textContent = 'Her gün yeni bir kelime.'; footerLabel.textContent = 'YENİ GÜNÜN BULMACASINA';
    document.querySelector('#puzzle-number').textContent = `#${String(puzzleNumber()).padStart(3, '0')}`;
    updateCountdown();
  }
  document.querySelector('#intro-copy').textContent = state.mode === 'series'
    ? `Beş harf · ${attemptsForMode()} tahmin hakkı · Zorluk seviyelerle artar.`
    : state.mode === 'practice' ? 'Beş harf · Altı tahmin · İstediğin kadar oyna.' : 'Beş harf · Altı tahmin · Renkli ipuçlarını takip et.';
  document.querySelector('.streak-card').setAttribute('aria-label',
    state.mode === 'daily' ? 'Günlük galibiyet serisi' : state.mode === 'series' ? 'Tamamlanan sefer seviyeleri' : 'Sınırsız antrenman');
  updateHomeMetadata();
  shareButton.disabled = !isDaily || !state.gameOver;
}

function updateHomeMetadata() {
  seriesCardAction.textContent = state.series.completed
    ? 'Tamamlandı · yeni sefer ↗' : `${state.series.level} / ${SERIES_TOTAL} seviyeye başla ↗`;
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

function scoreGuess(guess) {
  const result = Array(WORD_LENGTH).fill('absent');
  const remaining = {};
  [...state.answer].forEach(letter => { remaining[letter] = (remaining[letter] || 0) + 1; });
  [...guess].forEach((letter, index) => {
    if (letter === [...state.answer][index]) { result[index] = 'correct'; remaining[letter] -= 1; }
  });
  [...guess].forEach((letter, index) => {
    if (result[index] === 'correct') return;
    if (remaining[letter] > 0) { result[index] = 'present'; remaining[letter] -= 1; }
  });
  return result;
}

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
  const savedV2 = localStorage.getItem(`${STORAGE_V2}-${mode}`);
  const saved = JSON.parse(savedV2 || localStorage.getItem(`${STORAGE_KEY}-${mode}`) || 'null');
  const legacyGame = !savedV2 && Boolean(saved);
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
  homeScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  modeLabel.textContent = mode === 'daily' ? 'GÜNLÜK BULMACA' : mode === 'series' ? 'SEFER' : 'ANTRENMAN';
  refreshModeChrome(); buildBoard(); renderKeyboard(); showSavedResult(); saveState();
  loadCloudMode(mode);
}

function returnHome() {
  modeLoadRevision += 1;
  state.cloudReadyMode = '';
  state.mode = 'home';
  homeScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  updateHomeMetadata();
  saveState();
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
  refreshModeChrome(); buildBoard(); renderKeyboard(); showSavedResult(); saveState(); syncCloudGame();
}

function handleKey(key) {
  if (state.gameOver) return;
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
  renderBoard(); renderKeyboard(); saveState();
  if (state.mode === 'daily' || state.mode === 'series') syncCloudGame();
}

const priority = { absent: 0, present: 1, correct: 2 };
function updateKeyState(letter, status) {
  if (!state.keyStates[letter] || priority[status] > priority[state.keyStates[letter]]) state.keyStates[letter] = status;
}

function finishGame(won) {
  state.gameOver = true; state.won = won;
  creditSeriesWin();
  if (state.mode === 'daily' && state.stats.lastPlayedDate !== todayKey()) {
    const previousDate = state.stats.lastPlayedDate;
    state.stats.lastPlayedDate = todayKey(); state.stats.played += 1;
    if (won) {
      const attempts = state.guesses.length;
      state.stats.wins += 1;
      state.stats.streak = previousDate === yesterdayKey() ? state.stats.streak + 1 : 1;
      state.stats.best = Math.max(state.stats.best, state.stats.streak);
      state.stats.distribution[attempts - 1] += 1;
    } else state.stats.streak = 0;
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
      <h3>Günlük</h3><div class="stats-grid"><div class="stat"><strong>${state.stats.played}</strong><span>Oynanan</span></div><div class="stat"><strong>${dailyWinRate}%</strong><span>Kazanma</span></div><div class="stat"><strong>${state.stats.streak}</strong><span>Günlük seri</span></div></div>
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
  const now = new Date(); const tomorrow = new Date(now); tomorrow.setHours(24, 0, 0, 0);
  const seconds = Math.max(0, Math.floor((tomorrow - now) / 1000));
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  document.querySelector('#countdown').textContent = `${h}:${m}:${s}`;
}

document.addEventListener('keydown', event => {
  if (typeof event.key !== 'string') return;
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
document.querySelector('#back-home-button').addEventListener('click', returnHome);
nextLevelButton.addEventListener('click', advanceMode);
authButton.addEventListener('click', () => {
  if (state.user && firebaseBridge) firebaseBridge.signOut().catch(() => showToast('Çıkış yapılamadı.'));
  else openAuthModal();
});
homeAuthButton.addEventListener('click', () => {
  if (state.user && firebaseBridge) firebaseBridge.signOut().catch(() => showToast('Çıkış yapılamadı.'));
  else openAuthModal();
});
shareButton.addEventListener('click', shareResult);

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
document.querySelector('#streak-value').textContent = state.stats.streak;
updateHomeMetadata();
homeScreen.classList.remove('hidden');
gameScreen.classList.add('hidden');
buildBoard(); renderKeyboard(); updateCountdown();
setInterval(updateCountdown, 1000);
