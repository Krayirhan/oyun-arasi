import { LEVELS, WORLDS } from './levels.js?v=balon14';
import { LEVEL_COUNT, STEP, campaignStats, createCampaign, createRun, finishCampaign, isValidCampaign, levelResult, mergeCampaigns, tick } from './logic.js?v=balon14';
import { createRenderer } from './render.js?v=balon14';
import { createAudio } from './audio.js?v=balon14';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=balon14';

const SAVE_KEY = 'oyunarasi-platform-macera-v2';
const OLD_SAVE_KEY = 'oyunarasi-platform-macera-v1';
const SETTINGS_KEY = 'oyunarasi-platform-macera-settings-v2';
const PER_WORLD = 8;

const $ = selector => document.querySelector(selector);
const canvas = $('#board');
const stage = $('#game-stage');
const mapPanel = $('#level-map');
const mapGrid = $('#level-grid');
const statusLine = $('#status');
const overlay = $('#game-overlay');
const overlayKicker = $('#overlay-kicker');
const overlayTitle = $('#overlay-title');
const overlayStars = $('#overlay-stars');
const overlayCopy = $('#overlay-copy');
const overlayButton = $('#overlay-button');
const overlayRetry = $('#overlay-retry');
const overlaySettings = $('#overlay-settings');
const mapButton = $('#map-button');
const pauseButton = $('#pause-button');
const startButton = $('#start-level');
const saveLabel = $('#save-state');

let campaign = createCampaign();
let run = null;
let selectedLevel = 1;
let selectedWorld = 0;
let cloudSync = null;
let raf = 0;
let lastFrame = 0;
let accumulator = 0;
let completeTimer = 0;
let lastResult = null;
const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let settings = { sound: true, reducedMotion: Boolean(prefersReduced) };

const renderer = createRenderer(canvas, () => settings);
const audio = createAudio(() => settings.sound);

// ------------------------------------------------------------ kayıt
function readSave() {
  try {
    localStorage.removeItem(OLD_SAVE_KEY);
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (isValidCampaign(saved?.campaign)) campaign = saved.campaign;
    const prefs = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (prefs && typeof prefs === 'object') settings = { ...settings, sound: prefs.sound !== false, reducedMotion: Boolean(prefs.reducedMotion) };
  } catch { /* Bozuk ya da engellenmiş kayıt oyunu durdurmaz. */ }
}

function persist(syncCloud = true) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ campaign }));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    saveLabel.textContent = 'İlerlemen bu cihazda saklanıyor.';
  } catch { saveLabel.textContent = 'Kayıt kullanılamıyor; bu oturumda oynamaya devam edebilirsin.'; }
  if (syncCloud) cloudSync?.save({ campaign });
  renderMap();
}

readSave();
selectedLevel = campaign.furthestLevel;
selectedWorld = Math.floor((selectedLevel - 1) / PER_WORLD);
cloudSync = syncGameOnAccountChange('platform-macera', {
  read: () => ({ campaign }),
  write: state => { if (isValidCampaign(state?.campaign)) campaign = mergeCampaigns(campaign, state.campaign); persist(false); },
  isValid: state => isValidCampaign(state?.campaign),
  merge: (remote, local) => ({ campaign: mergeCampaigns(remote?.campaign, local?.campaign) }),
  getStats: state => campaignStats(state.campaign),
  isCheckpoint: () => false,
  onStatus: message => { if (!run) statusLine.textContent = message; }
});

// ------------------------------------------------------------ harita
const levelCode = n => `${Math.floor((n - 1) / PER_WORLD) + 1}-${((n - 1) % PER_WORLD) + 1}`;

function renderMap() {
  const stats = campaignStats(campaign);
  $('#map-total').textContent = `★ ${stats.totalStars} / ${LEVEL_COUNT * 3}`;
  $('#stars-total').textContent = String(stats.totalStars);
  document.querySelectorAll('.world-tabs [data-world]').forEach(button => {
    const world = Number(button.dataset.world);
    button.setAttribute('aria-selected', String(world === selectedWorld));
    button.disabled = world * PER_WORLD + 1 > campaign.furthestLevel;
  });
  $('#world-description').textContent = WORLDS[selectedWorld].description;
  mapGrid.replaceChildren(...LEVELS.filter(level => level.world === selectedWorld).map(level => {
    const button = document.createElement('button');
    const locked = level.number > campaign.furthestLevel;
    const stars = campaign.stars[level.number] || 0;
    button.type = 'button';
    button.className = 'level-choice';
    button.disabled = locked;
    button.setAttribute('aria-pressed', String(level.number === selectedLevel));
    button.setAttribute('aria-label', `Bölüm ${levelCode(level.number)}: ${level.title}${stars ? `, ${stars} yıldız` : ''}${locked ? ', kilitli' : ''}`);
    const code = Object.assign(document.createElement('b'), { textContent: locked ? '🔒' : levelCode(level.number) });
    const starRow = document.createElement('small');
    if (!locked) starRow.append(...[0, 1, 2].map(i => Object.assign(document.createElement('i'), { textContent: '★', className: i < stars ? 'on' : '' })));
    button.append(code, starRow);
    if (!locked) {
      button.addEventListener('click', () => { selectedLevel = level.number; audio.play('click'); renderMap(); });
      button.addEventListener('dblclick', () => startLevel(level.number));
    }
    return button;
  }));
  const level = LEVELS[selectedLevel - 1];
  const best = campaign.bestTimes[selectedLevel];
  $('#selected-level-copy').textContent = `${levelCode(selectedLevel)} · ${level.title} · Hedef ${renderer.formatTime(level.par)}${best ? ` · En iyi ${renderer.formatTime(best)}` : ''}`;
  if (!run) $('#level-number').textContent = levelCode(selectedLevel);
}

function setWorld(world) {
  if (world * PER_WORLD + 1 > campaign.furthestLevel) return;
  selectedWorld = world;
  const first = world * PER_WORLD + 1;
  selectedLevel = Math.min(first + PER_WORLD - 1, Math.max(first, campaign.furthestLevel));
  renderMap();
}

function showMap() {
  run = null;
  cancelAnimationFrame(raf);
  stage.hidden = true; mapPanel.hidden = false;
  hideOverlay();
  pauseButton.setAttribute('aria-pressed', 'false'); pauseButton.textContent = 'Duraklat';
  statusLine.textContent = 'Bölüm haritasından bir bölüm seç.';
  selectedWorld = Math.floor((selectedLevel - 1) / PER_WORLD);
  renderMap();
  startButton.focus({ preventScroll: true });
}

// ------------------------------------------------------------ oyun döngüsü
function startLevel(number) {
  audio.unlock();
  selectedLevel = number;
  selectedWorld = Math.floor((number - 1) / PER_WORLD);
  run = createRun(number);
  lastResult = null; completeTimer = 0; accumulator = 0;
  stage.hidden = false; mapPanel.hidden = true;
  hideOverlay();
  pauseButton.setAttribute('aria-pressed', 'false'); pauseButton.textContent = 'Duraklat';
  $('#level-number').textContent = levelCode(number);
  $('#deaths').textContent = '0';
  statusLine.textContent = `${levelCode(number)} · ${LEVELS[number - 1].title}`;
  renderer.setLevel(LEVELS[number - 1], run);
  clearPressed();
  cancelAnimationFrame(raf);
  lastFrame = performance.now();
  raf = requestAnimationFrame(frame);
  canvas.focus?.({ preventScroll: true });
}

function frame(now) {
  if (!run) return;
  const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  pollGamepad();
  if (run.status === 'playing' || run.status === 'dying') {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 12) {
      tick(run, input, STEP);
      input.jumpPressed = false; input.dashPressed = false;
      accumulator -= STEP; steps += 1;
      if (run.events.length) flushEvents();
      if (run.status !== 'playing' && run.status !== 'dying') break;
    }
  } else if (run.status === 'complete') {
    completeTimer += dt;
    if (completeTimer > 0.75 && !lastResult) completeLevel();
  }
  const alpha = run.status === 'playing' ? accumulator / STEP : 1;
  renderer.render(run, Math.min(1, alpha), dt);
  if (run.status !== 'paused') raf = requestAnimationFrame(frame);
}

function flushEvents() {
  renderer.onEvents(run.events, run);
  audio.onEvents(run.events);
  for (const e of run.events) {
    if (e.type === 'die') $('#deaths').textContent = String(run.deaths);
    if (e.type === 'checkpoint') statusLine.textContent = 'Kontrol noktası kaydedildi.';
    if (e.type === 'gem') statusLine.textContent = `Kristal ${e.count}/${e.total}`;
  }
  run.events.length = 0;
}

function completeLevel() {
  lastResult = levelResult(run);
  const previousBest = campaign.bestTimes[run.level];
  const previousStars = campaign.stars[run.level] || 0;
  campaign = finishCampaign(campaign, lastResult);
  persist();
  audio.play('checkpoint');
  const last = run.level === LEVEL_COUNT;
  const newRecord = !previousBest || lastResult.time < previousBest;
  overlayKicker.textContent = last ? 'VOLKANA ULAŞTIN' : `${levelCode(run.level)} TAMAMLANDI`;
  overlayTitle.textContent = last ? 'Zirvedesin, Zıpkın!' : lastResult.stars === 3 ? 'Kusursuz!' : lastResult.stars === 2 ? 'Harika!' : 'Başardın!';
  overlayStars.hidden = false;
  overlayStars.replaceChildren(...[0, 1, 2].map(i => Object.assign(document.createElement('span'), { textContent: '★', className: i < lastResult.stars ? 'on' : '' })));
  const level = LEVELS[run.level - 1];
  overlayCopy.textContent = `Süre ${renderer.formatTime(lastResult.time)} (hedef ${renderer.formatTime(level.par)}) · Kristal ${lastResult.gems}/${level.gems.length} · Ölüm ${lastResult.deaths}${newRecord ? ' · Yeni rekor!' : ''}${lastResult.stars > previousStars && previousStars ? ' · Yeni yıldız!' : ''}`;
  overlayButton.textContent = last ? 'Haritaya dön' : 'Sonraki bölüm';
  overlayButton.dataset.action = last ? 'map' : 'next';
  overlayRetry.hidden = false;
  overlaySettings.hidden = true;
  showOverlay();
  statusLine.textContent = `${lastResult.stars} yıldız · ${lastResult.score.toLocaleString('tr-TR')} puan`;
}

function showOverlay() { overlay.classList.remove('hidden'); requestAnimationFrame(() => overlayButton.focus({ preventScroll: true })); }
function hideOverlay() { overlay.classList.add('hidden'); }

function pause() {
  if (!run || (run.status !== 'playing' && run.status !== 'dying')) return;
  run.pausedFrom = run.status; run.status = 'paused';
  pauseButton.setAttribute('aria-pressed', 'true'); pauseButton.textContent = 'Devam et';
  overlayKicker.textContent = 'OYUN DURAKLATILDI'; overlayTitle.textContent = 'Mola';
  overlayStars.hidden = true;
  overlayCopy.textContent = `${levelCode(run.level)} · ${LEVELS[run.level - 1].title} · ${renderer.formatTime(run.time)}`;
  overlayButton.textContent = 'Devam et'; overlayButton.dataset.action = 'resume';
  overlayRetry.hidden = false; overlaySettings.hidden = false;
  showOverlay();
  clearPressed();
}

function resume() {
  if (!run || run.status !== 'paused') return;
  run.status = run.pausedFrom || 'playing';
  hideOverlay();
  pauseButton.setAttribute('aria-pressed', 'false'); pauseButton.textContent = 'Duraklat';
  lastFrame = performance.now(); accumulator = 0;
  cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  canvas.focus?.({ preventScroll: true });
}

function nextLevel() { startLevel(Math.min(LEVEL_COUNT, run.level + 1)); }

// ------------------------------------------------------------ girdi
const input = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false, dashPressed: false };
const held = { kb: {}, touch: {}, pad: {} };
function syncHeld() {
  for (const key of ['left', 'right', 'up', 'down', 'jump']) input[key] = Boolean(held.kb[key] || held.touch[key] || held.pad[key]);
}
function clearPressed() {
  for (const source of Object.values(held)) for (const key of Object.keys(source)) source[key] = false;
  syncHeld(); input.jumpPressed = false; input.dashPressed = false;
}
function press(source, action, down) {
  if (action === 'jump' && down && !held[source].jump) input.jumpPressed = true;
  if (action === 'dash') { if (down && !held[source].dash) input.dashPressed = true; held[source].dash = down; return; }
  held[source][action] = down;
  syncHeld();
}

const KEYMAP = {
  ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
  ' ': 'jump', z: 'jump', Z: 'jump', c: 'jump', C: 'jump', j: 'jump', J: 'jump',
  x: 'dash', X: 'dash', Shift: 'dash', k: 'dash', K: 'dash'
};
// ↑ ve W hem yön hem zıplama tuşu olarak çalışır (yukarı dash için yön, tek başına basınca zıplama).
const ALSO_JUMP = new Set(['ArrowUp', 'w', 'W']);

function typingTarget(event) { return event.target instanceof HTMLElement && event.target.matches('input, textarea, select, [contenteditable="true"]'); }

window.addEventListener('keydown', event => {
  if (typingTarget(event)) return;
  const onOverlay = !overlay.classList.contains('hidden');
  if (!run) {
    if (event.key === 'Enter' && !mapPanel.hidden && document.activeElement === document.body) startLevel(selectedLevel);
    return;
  }
  const action = KEYMAP[event.key];
  if (action || ['PageUp', 'PageDown'].includes(event.key)) event.preventDefault();
  if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
    if (run.status === 'paused') resume(); else pause();
    return;
  }
  if ((event.key === 'r' || event.key === 'R') && !event.repeat) { startLevel(run.level); return; }
  if (onOverlay) {
    if (event.key === 'Enter' && run.status === 'complete' && lastResult) { event.preventDefault(); overlayButton.click(); }
    return;
  }
  if (event.repeat) return;
  if (action) press('kb', action, true);
  if (ALSO_JUMP.has(event.key)) press('kb', 'jump', true);
});
window.addEventListener('keyup', event => {
  const action = KEYMAP[event.key];
  if (action) press('kb', action, false);
  if (ALSO_JUMP.has(event.key)) press('kb', 'jump', false);
  if (event.key === 'Shift') press('kb', 'dash', false);
});

// Dokunmatik: solda sürüklenen yön çubuğu, sağda Zıpla ve Dash.
const stick = $('#touch-stick');
const knob = stick.querySelector('.stick-knob');
let stickPointer = null; let stickOrigin = null;
function setStick(dx, dy) {
  const len = Math.hypot(dx, dy); const max = 34;
  const k = len > max ? max / len : 1;
  knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  const dead = 14;
  held.touch.left = dx < -dead; held.touch.right = dx > dead;
  held.touch.up = dy < -dead * 1.6; held.touch.down = dy > dead * 1.6;
  syncHeld();
}
stick.addEventListener('pointerdown', event => {
  event.preventDefault(); audio.unlock();
  stickPointer = event.pointerId; stick.setPointerCapture(event.pointerId);
  const rect = stick.getBoundingClientRect();
  stickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  stick.classList.add('active');
  setStick(event.clientX - stickOrigin.x, event.clientY - stickOrigin.y);
});
stick.addEventListener('pointermove', event => { if (event.pointerId === stickPointer) setStick(event.clientX - stickOrigin.x, event.clientY - stickOrigin.y); });
const releaseStick = event => { if (event.pointerId !== stickPointer) return; stickPointer = null; stick.classList.remove('active'); knob.style.transform = ''; setStick(0, 0); };
stick.addEventListener('pointerup', releaseStick); stick.addEventListener('pointercancel', releaseStick); stick.addEventListener('lostpointercapture', releaseStick);
document.querySelectorAll('.touch-buttons [data-action]').forEach(button => {
  const action = button.dataset.action;
  button.addEventListener('pointerdown', event => { event.preventDefault(); audio.unlock(); button.setPointerCapture(event.pointerId); button.classList.add('pressed'); press('touch', action, true); });
  const release = () => { button.classList.remove('pressed'); press('touch', action, false); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', event => event.preventDefault());
});

// Gamepad: sol çubuk / d-pad yön, A zıpla, X ya da B dash, Start duraklat.
let padStart = false;
function pollGamepad() {
  const pads = navigator.getGamepads?.() || [];
  const pad = [...pads].find(Boolean);
  if (!pad) return;
  const ax = pad.axes[0] || 0; const ay = pad.axes[1] || 0; const b = i => Boolean(pad.buttons[i]?.pressed);
  held.pad.left = ax < -0.4 || b(14); held.pad.right = ax > 0.4 || b(15);
  held.pad.up = ay < -0.5 || b(12); held.pad.down = ay > 0.5 || b(13);
  const jump = b(0); if (jump && !held.pad.jump) input.jumpPressed = true; held.pad.jump = jump;
  const dash = b(2) || b(1) || b(7); if (dash && !held.pad.dash) input.dashPressed = true; held.pad.dash = dash;
  syncHeld();
  const start = b(9); if (start && !padStart) { if (run?.status === 'paused') resume(); else pause(); } padStart = start;
}

// ------------------------------------------------------------ düğmeler
document.querySelectorAll('.world-tabs [data-world]').forEach(button => button.addEventListener('click', () => setWorld(Number(button.dataset.world))));
startButton.addEventListener('click', () => startLevel(selectedLevel));
$('#restart-button').addEventListener('click', () => startLevel(run?.level || selectedLevel));
pauseButton.addEventListener('click', () => { if (!run) return; if (run.status === 'paused') resume(); else pause(); });
overlayButton.addEventListener('click', () => {
  const action = overlayButton.dataset.action;
  if (action === 'resume') resume();
  else if (action === 'next') nextLevel();
  else showMap();
});
overlayRetry.addEventListener('click', () => startLevel(run?.level || selectedLevel));
mapButton.addEventListener('click', showMap);

function renderSettings() {
  const sound = $('#sound-toggle'); const motion = $('#reduced-motion-toggle');
  sound.setAttribute('aria-pressed', String(settings.sound)); sound.textContent = settings.sound ? 'Ses açık' : 'Ses kapalı';
  motion.setAttribute('aria-pressed', String(settings.reducedMotion)); motion.textContent = settings.reducedMotion ? 'Az hareket açık' : 'Az hareket kapalı';
}
$('#sound-toggle').addEventListener('click', () => { settings.sound = !settings.sound; renderSettings(); persist(false); audio.play('click'); });
$('#reduced-motion-toggle').addEventListener('click', () => { settings.reducedMotion = !settings.reducedMotion; renderSettings(); persist(false); });

window.addEventListener('blur', () => { clearPressed(); if (run?.status === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && run?.status === 'playing') pause(); });
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('pagehide', () => cloudSync?.flush());

renderSettings();
showMap();
