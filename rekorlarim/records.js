// Rekorlarım: her oyunun en iyi sonuçları. Bu cihazdaki kayıtlar okunur; giriş yapılmışsa
// profildeki (tüm cihazlardan birleşik) istatistiklerle birleştirilir, en iyi değer gösterilir.
import { loadFirebaseClient } from '../cloud-sync.js?v=202609270036';

const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const byLevel = records => ({
  easy: { bestMs: records?.easy ?? null },
  medium: { bestMs: records?.medium ?? null },
  hard: { bestMs: records?.hard ?? null }
});

// Her oyunun yerel kaydı, profildeki gameStats ile aynı biçime çevrilir.
const LOCAL = {
  harfane: () => {
    const stats = read('harfane-state-v2-statistics')?.daily;
    const series = read('harfane-state-v2-series-progress');
    return { daily: stats || {}, sefer: series ? { level: series.level, best: series.best, completedRuns: series.completedRuns } : {} };
  },
  '2048': () => ({ bestScore: read('oyunarasi-2048-v1')?.best ?? 0 }),
  'mayin-tarlasi': () => byLevel(read('oyunarasi-mayin-tarlasi-v1')?.records),
  hafiza: () => {
    const records = read('oyunarasi-hafiza-v1')?.records || {};
    return { classic: records[8] || {}, expanded: records[18] || {} };
  },
  xox: () => {
    const scores = read('oyunarasi-xox-v1')?.scores || {};
    const x = scores.X || 0; const o = scores.O || 0; const draws = scores.draws || 0;
    return { rounds: x + o + draws, xWins: x, oWins: o, draws };
  },
  sudoku: () => byLevel(read('oyunarasi-sudoku-v1')?.records),
  sekil: () => ({ bestScore: read('oyunarasi-sekil-v1')?.game?.best ?? 0 }),
  'kelime-avi': () => byLevel(read('oyunarasi-kelime-avi-v1')?.records),
  tetris: () => read('oyunarasi-tetris-v1')?.records || {},
  soliter: () => {
    const records = read('oyunarasi-soliter-v1')?.records || {};
    return { wins: records.wins || 0, draw1: records[1] || {}, draw3: records[3] || {} };
  },
  mahjong: () => byLevel(read('oyunarasi-mahjong-v1')?.records),
  araba: () => read('oyunarasi-araba-v1')?.records || {}
};

const time = value => {
  const seconds = Math.floor(value / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const number = value => Number(value).toLocaleString('tr-TR');
const levelTimes = [['Kolay', 'easy.bestMs', time], ['Orta', 'medium.bestMs', time], ['Zor', 'hard.bestMs', time]];

// Gösterilecek alanlar: [etiket, yol, biçim]
const FIELDS = {
  harfane: [['Günlük oynanan', 'daily.played', number], ['Kazanma', 'daily.winRate', value => `%${value}`], ['Günlük seri', 'daily.streak', number], ['En iyi seri', 'daily.best', number], ['Sefer rekoru', 'sefer.best', value => `${value} / 70`]],
  '2048': [['En iyi skor', 'bestScore', number], ['Kazanılan oyun', 'wins', number]],
  'mayin-tarlasi': levelTimes,
  hafiza: [['Klasik süre', 'classic.bestMs', time], ['Klasik hamle', 'classic.bestMoves', number], ['Geniş süre', 'expanded.bestMs', time], ['Geniş hamle', 'expanded.bestMoves', number]],
  xox: [['Toplam tur', 'rounds', number], ['X galibiyeti', 'xWins', number], ['O galibiyeti', 'oWins', number], ['Beraberlik', 'draws', number]],
  sudoku: levelTimes,
  sekil: [['En iyi skor', 'bestScore', number]],
  'kelime-avi': levelTimes,
  tetris: [['En iyi skor', 'bestScore', number], ['En çok satır', 'bestLines', number]],
  soliter: [['Galibiyet', 'wins', number], ['1 kart süre', 'draw1.bestMs', time], ['3 kart süre', 'draw3.bestMs', time]],
  mahjong: levelTimes,
  araba: [['En iyi skor', 'bestScore', number], ['En uzun yol', 'bestDistance', value => `${number(value)} m`]]
};

// Süre ve hamlede küçük olan, diğer her şeyde büyük olan değer daha iyidir.
function best(a, b, key = '') {
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b && typeof b === 'object' ? b : {})]);
    return Object.fromEntries([...keys].map(name => [name, best(a[name], b?.[name], name)]));
  }
  if (b && typeof b === 'object' && !Array.isArray(b)) return best(b, a, key);
  const valid = [a, b].filter(value => Number.isFinite(value));
  if (!valid.length) return a ?? b ?? null;
  return /Ms$|Moves$/.test(key) ? Math.min(...valid) : Math.max(...valid);
}

const pick = (object, path) => path.split('.').reduce((value, part) => value?.[part], object);
const meaningful = value => Number.isFinite(value) && value > 0;

function statsFor(id, profileStats) {
  const merged = best(LOCAL[id]?.() || {}, profileStats?.[id] || {});
  if (id === 'harfane' && merged.daily) {
    const { played, wins } = merged.daily;
    merged.daily.winRate = played > 0 ? Math.round(((wins || 0) / played) * 100) : null;
  }
  return merged;
}

function render(profileStats, signedIn) {
  const list = document.querySelector('#records-list');
  const games = (window.OYUN_ARASI_GAMES || []).filter(game => !game.soon);
  let played = 0;
  list.replaceChildren(...games.map(game => {
    const stats = statsFor(game.id, profileStats);
    const rows = (FIELDS[game.id] || []).map(([label, path, format]) => ({ label, format, value: pick(stats, path) }));
    const hasAny = rows.some(row => meaningful(row.value));
    if (hasAny) played += 1;

    const item = document.createElement('li');
    item.className = `record-card${hasAny ? '' : ' is-empty'}`;
    const link = document.createElement('a');
    link.className = 'record-game';
    link.href = `../${game.href}`;
    if (game.image) link.append(Object.assign(document.createElement('img'), { src: `../${game.image}`, alt: '', loading: 'lazy' }));
    link.append(Object.assign(document.createElement('strong'), { textContent: game.title }));
    item.append(link);

    if (hasAny) {
      const values = document.createElement('dl');
      for (const row of rows) {
        const wrap = document.createElement('div');
        wrap.append(
          Object.assign(document.createElement('dt'), { textContent: row.label }),
          Object.assign(document.createElement('dd'), { textContent: meaningful(row.value) ? row.format(row.value) : '—' })
        );
        values.append(wrap);
      }
      item.append(values);
    } else {
      const empty = document.createElement('a');
      empty.className = 'record-empty';
      empty.href = `../${game.href}`;
      empty.textContent = 'Henüz oynamadın · Oyna →';
      item.append(empty);
    }
    return item;
  }));
  document.querySelector('#records-summary').textContent = signedIn
    ? `${played} oyunda rekorun var. Hesabındaki tüm cihazların en iyi sonuçları gösteriliyor.`
    : `${played} oyunda rekorun var. Giriş yaparsan diğer cihazlarındaki rekorlar da burada birleşir.`;
}

render(null, false);
loadFirebaseClient()
  .then(({ platformFirebase }) => platformFirebase.onAuthStateChanged(async user => {
    if (!user) { render(null, false); return; }
    try { render((await platformFirebase.loadProfile(user))?.gameStats || null, true); }
    catch { render(null, false); }
  }))
  .catch(() => {});
