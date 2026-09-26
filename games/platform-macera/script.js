import { LEVELS, WORLDS } from './levels.js?v=202609270130';
import { PLAYER_HEIGHT, PLAYER_WIDTH, campaignStats, createCampaign, createRun, finishCampaign, isValidCampaign, isValidResume, mergeCampaigns, resumeRun, tick } from './logic.js?v=202609270130';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609270130';

const SAVE_KEY = 'oyunarasi-platform-macera-v1';
const SETTINGS_KEY = 'oyunarasi-platform-macera-settings-v1';
const canvas = document.querySelector('#board');
const ctx = canvas.getContext('2d');
const stage = document.querySelector('#game-stage');
const mapPanel = document.querySelector('#level-map');
const mapGrid = document.querySelector('#level-grid');
const statusLine = document.querySelector('#status');
const overlay = document.querySelector('#game-overlay');
const overlayKicker = document.querySelector('#overlay-kicker');
const overlayTitle = document.querySelector('#overlay-title');
const overlayCopy = document.querySelector('#overlay-copy');
const overlayButton = document.querySelector('#overlay-button');
const mapButton = document.querySelector('#map-button');
const continueButton = document.querySelector('#continue-button');
const startButton = document.querySelector('#start-level');
const description = document.querySelector('#world-description');
const selectedCopy = document.querySelector('#selected-level-copy');
const saveLabel = document.querySelector('#save-state');

let campaign = createCampaign();
let run = null;
let selectedLevel = 1;
let selectedWorld = 0;
let selectedCharacter = 0;
let lastCheckpoint = '';
let lastSaveAt = 0;
let saveResume = null;
let cloudSync = null;
let raf = 0;
let lastFrame = performance.now();
let audioContext = null;
let settings = { sound: true, reducedMotion: false, help: true };
const keys = { left: false, right: false, abilityHeld: false, jumpPressed: false, abilityPressed: false };

function readSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (isValidCampaign(saved?.campaign)) campaign = saved.campaign;
    if (isValidResume(saved?.resume)) saveResume = saved.resume;
    const prefs = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (prefs && typeof prefs === 'object') settings = { ...settings, ...prefs };
  } catch { /* A blocked or invalid local save never prevents play. */ }
}

function cloudState() { return { campaign }; }

function persistLocal(syncCloud = true) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ campaign, resume: saveResume }));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    saveLabel.textContent = 'İlerlemen bu cihazda saklanıyor.';
  } catch { saveLabel.textContent = 'Kayıt kullanılamıyor; bu oturumda oynamaya devam edebilirsin.'; }
  if (syncCloud) cloudSync?.save(cloudState());
  renderMap();
}

function adoptCloudState(state) {
  if (isValidCampaign(state?.campaign)) campaign = mergeCampaigns(campaign, state.campaign);
  persistLocal(false);
}

readSave();
selectedLevel = saveResume?.level || campaign.furthestLevel;
selectedWorld = Math.floor((selectedLevel - 1) / 10);
selectedCharacter = saveResume?.character ?? 0;
cloudSync = syncGameOnAccountChange('platform-macera', {
  read: cloudState,
  write: adoptCloudState,
  isValid: state => isValidCampaign(state?.campaign),
  merge: (remote, local) => ({ campaign: mergeCampaigns(remote?.campaign, local?.campaign) }),
  getStats: state => campaignStats(state.campaign),
  isCheckpoint: () => false,
  onStatus: message => { if (!run) statusLine.textContent = message; }
});

function setWorld(world) {
  selectedWorld = world;
  const firstLevel = world * 10 + 1;
  selectedLevel = campaign.furthestLevel >= firstLevel ? Math.min(firstLevel + 9, campaign.furthestLevel) : firstLevel;
  document.querySelectorAll('.world-tabs [data-world]').forEach(button => button.setAttribute('aria-selected', String(Number(button.dataset.world) === world)));
  description.textContent = WORLDS[world].description;
  renderMap();
}

function selectLevel(number) {
  if (number > campaign.furthestLevel) return;
  selectedLevel = number;
  selectedWorld = Math.floor((number - 1) / 10);
  document.querySelectorAll('.world-tabs [data-world]').forEach(button => button.setAttribute('aria-selected', String(Number(button.dataset.world) === selectedWorld)));
  description.textContent = WORLDS[selectedWorld].description;
  renderMap();
}

function renderMap() {
  if (!mapGrid) return;
  mapGrid.replaceChildren(...LEVELS.filter(level => level.world === selectedWorld).map(level => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'level-choice';
    button.disabled = level.number > campaign.furthestLevel;
    button.setAttribute('aria-pressed', String(level.number === selectedLevel));
    button.setAttribute('aria-label', `Bölüm ${level.number}: ${level.title}${campaign.stars[level.number] ? `, ${campaign.stars[level.number]} yıldız` : ''}${button.disabled ? ', kilitli' : ''}`);
    button.textContent = button.disabled ? '🔒' : String(level.number);
    const stars = campaign.stars[level.number] || 0;
    if (stars) button.append(Object.assign(document.createElement('small'), { textContent: '★'.repeat(stars) }));
    if (!button.disabled) button.addEventListener('click', () => selectLevel(level.number));
    return button;
  }));
  const level = LEVELS[selectedLevel - 1];
  const stars = campaign.stars[selectedLevel] || 0;
  selectedCopy.textContent = `Bölüm ${selectedLevel}: ${level.title} · Hedef ${level.starScore} puan · ${stars ? `${stars}/3 yıldız` : 'Henüz tamamlanmadı'}`;
  startButton.disabled = selectedLevel > campaign.furthestLevel;
  continueButton.hidden = !saveResume;
  document.querySelector('#level-number').textContent = `${selectedLevel} / 30`;
}

function showMap() {
  run = null;
  stage.hidden = true;
  mapPanel.hidden = false;
  overlay.classList.add('hidden');
  document.querySelector('#pause-button').setAttribute('aria-pressed', 'false');
  document.querySelector('#pause-button').textContent = 'Duraklat';
  renderMap();
  cancelAnimationFrame(raf);
}

function startLevel(number, continueSaved = false) {
  selectedLevel = number;
  selectedWorld = Math.floor((number - 1) / 10);
  run = continueSaved && saveResume?.level === number ? resumeRun(saveResume) : createRun(number, selectedCharacter);
  if (!run) run = createRun(number, selectedCharacter);
  selectedCharacter = run.character;
  stage.hidden = false;
  mapPanel.hidden = true;
  overlay.classList.add('hidden');
  document.querySelector('#pause-button').setAttribute('aria-pressed', 'false');
  document.querySelector('#pause-button').textContent = 'Duraklat';
  lastFrame = performance.now();
  renderHeroSwitch();
  renderHud();
  draw();
  persistResume();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

function renderHeroSwitch() {
  document.querySelectorAll('#hero-switch [data-character]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.character) === selectedCharacter)));
}

function renderHud() {
  if (!run) return;
  document.querySelector('#level-number').textContent = `${run.level} / 30`;
  document.querySelector('#score').textContent = run.score.toLocaleString('tr-TR');
  document.querySelector('#lives').textContent = run.status === 'failed' ? '♡ ♡ ♡' : `${'♥ '.repeat(run.lives).trim()}${'♡ '.repeat(3 - run.lives).trim()}`;
  document.querySelector('#energy-value').textContent = String(Math.round(run.energy));
  document.querySelector('#energy-fill').style.width = `${run.energy}%`;
  const level = LEVELS[run.level - 1];
  const keyStatus = level.key ? (run.hasKey ? 'Anahtar sende' : 'Anahtarı ara') : 'Çıkışa ulaş';
  statusLine.textContent = run.message || `Kristal ${run.crystals.length}/3 · ${keyStatus} · ${Math.floor(run.elapsed)} sn`;
}

function persistResume() {
  if (!run || ['complete', 'failed'].includes(run.status)) return;
  const checkpointKey = `${run.level}:${run.checkpointIndex}:${run.checkpointState.x}:${run.checkpointState.y}:${run.lives}:${run.checkpointState.score}`;
  if (checkpointKey === lastCheckpoint && Date.now() - lastSaveAt < 4000) return;
  lastCheckpoint = checkpointKey;
  lastSaveAt = Date.now();
  saveResume = { level: run.level, lives: run.lives, character: run.character, checkpointState: run.checkpointState };
  persistLocal();
}

function completeCurrentLevel() {
  campaign = finishCampaign(campaign, run);
  saveResume = null;
  persistLocal();
  overlay.classList.remove('hidden');
  overlayKicker.textContent = run.level === 30 ? 'KAMPANYA TAMAMLANDI' : 'BÖLÜM TAMAMLANDI';
  overlayTitle.textContent = run.level === 30 ? '30 bölümün hepsi tamam!' : 'Harika iş çıkardın!';
  overlayCopy.textContent = `Bölüm ${run.level}: ${run.stars} yıldız · ${run.score.toLocaleString('tr-TR')} puan${run.level < 30 ? ` · Sıradaki bölüm ${run.level + 1} açıldı.` : ' · Tüm dünyalar keşfedildi.'}`;
  overlayButton.textContent = run.level < 30 ? 'Sonraki bölüm' : 'Haritaya dön';
  overlayButton.dataset.action = run.level < 30 ? 'next' : 'map';
  mapButton.hidden = false;
  sound('win');
}

function showOverlay(kind) {
  overlay.classList.remove('hidden');
  mapButton.hidden = false;
  if (kind === 'paused') {
    overlayKicker.textContent = 'OYUN DURAKLATILDI'; overlayTitle.textContent = 'Mola zamanı';
    overlayCopy.textContent = 'Hazır olunca kaldığın yerden devam et.';
    overlayButton.textContent = 'Devam et'; overlayButton.dataset.action = 'resume';
  } else if (kind === 'failed') {
    overlayKicker.textContent = 'CANLAR BİTTİ'; overlayTitle.textContent = 'Bir kez daha dene';
    overlayCopy.textContent = 'Bölüm baştan başlayacak. Yıldız ve bölüm ilerlemen korunuyor.';
    overlayButton.textContent = 'Bölümü yeniden başlat'; overlayButton.dataset.action = 'retry';
    saveResume = null; persistLocal();
  }
}

function frame(now) {
  if (!run) return;
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  const before = run.status;
  run = tick(run, { ...keys, character: selectedCharacter, jumpPressed: keys.jumpPressed || (keys.abilityPressed && selectedCharacter === 0) }, dt);
  keys.jumpPressed = false;
  keys.abilityPressed = false;
  if (run.status === 'playing') {
    if (before !== 'playing') { overlay.classList.add('hidden'); document.querySelector('#pause-button').setAttribute('aria-pressed', 'false'); }
    if (run.checkpointIndex !== (saveResume?.checkpointState?.checkpointIndex ?? -1)) persistResume();
    else if (now - lastSaveAt > 5000) persistResume();
  }
  renderHud();
  draw();
  if (run.status === 'complete' && before !== 'complete') completeCurrentLevel();
  if (run.status === 'failed' && before !== 'failed') showOverlay('failed');
  if (run.status === 'playing') raf = requestAnimationFrame(frame);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

function palette(world) {
  return [
    { sky: '#87d5ff', far: '#79be83', near: '#398459', ground: '#5aa650', edge: '#2c7745', platform: '#8bd164', accent: '#ffe164', hazard: '#ef5542' },
    { sky: '#9be4eb', far: '#5897aa', near: '#316779', ground: '#416a84', edge: '#244861', platform: '#79c8cf', accent: '#ffe164', hazard: '#ef5542' },
    { sky: '#ffb078', far: '#af5151', near: '#783c4b', ground: '#61415c', edge: '#3b2c50', platform: '#a85c59', accent: '#ffe164', hazard: '#ff543e' }
  ][world];
}

function drawBackground(world, camera, elapsed) {
  const colors = palette(world);
  const gradient = ctx.createLinearGradient(0, 0, 0, 540);
  gradient.addColorStop(0, colors.sky); gradient.addColorStop(1, '#edf5e4');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 960, 540);
  ctx.globalAlpha = 0.28;
  for (let i = 0; i < 8; i += 1) {
    const x = ((i * 210 - camera * 0.16) % 1200 + 1200) % 1200 - 100;
    ctx.fillStyle = colors.far;
    ctx.beginPath(); ctx.ellipse(x, 410 + Math.sin(i) * 20, 150, 115 + (i % 3) * 18, 0, Math.PI, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (world === 0) {
    for (let i = 0; i < 18; i += 1) {
      const x = ((i * 105 - camera * 0.38) % 1050 + 1050) % 1050 - 45;
      ctx.fillStyle = colors.near; ctx.fillRect(x + 24, 320, 10, 155);
      ctx.beginPath(); ctx.arc(x + 28, 315, 42 + (i % 3) * 5, 0, Math.PI * 2); ctx.fill();
    }
  } else if (world === 1) {
    ctx.strokeStyle = 'rgb(255 255 255 / .17)'; ctx.lineWidth = 5;
    for (let i = 0; i < 8; i += 1) { ctx.beginPath(); ctx.arc(((i * 180 - camera * .2) % 1100 + 1100) % 1100 - 30, 270, 52 + (i % 2) * 22, elapsed * .15 + i, elapsed * .15 + i + Math.PI * 1.6); ctx.stroke(); }
  } else {
    ctx.fillStyle = '#ffd071';
    for (let i = 0; i < 28; i += 1) { const x = ((i * 91 - camera * .3) % 1000 + 1000) % 1000; const y = 70 + (i * 67 % 330); ctx.globalAlpha = settings.reducedMotion ? .45 : .35 + Math.sin(elapsed * 2 + i) * .14; ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}

function drawPlatform(item, elapsed, colors) {
  const p = item.kind === 'moving' ? { ...item, x: item.x + item.dx * Math.sin((elapsed * item.speed + item.phase) * Math.PI * 2), y: item.y + item.dy * Math.sin((elapsed * item.speed + item.phase) * Math.PI * 2) } : item;
  ctx.fillStyle = 'rgb(13 27 76 / .18)'; roundRect(p.x, p.y + 5, p.w, p.h, 6); ctx.fill();
  ctx.fillStyle = item.kind === 'ground' ? colors.ground : item.kind === 'moving' ? '#ffe17a' : colors.platform;
  roundRect(p.x, p.y, p.w, p.h, 6); ctx.fill();
  ctx.fillStyle = colors.edge; ctx.fillRect(p.x + 4, p.y + p.h - 5, p.w - 8, 5);
  ctx.fillStyle = 'rgb(255 255 255 / .3)'; ctx.fillRect(p.x + 6, p.y + 3, p.w - 12, 3);
}

function enemyBox(enemy, index, elapsed) {
  return enemy.kind === 'flyer'
    ? { x: enemy.x, y: enemy.y + Math.sin(elapsed * enemy.speed / 35 + index) * (enemy.maxY - enemy.y), w: 34, h: 28 }
    : { x: enemy.minX + Math.abs(Math.sin(elapsed * enemy.speed / Math.max(30, enemy.maxX - enemy.minX))) * (enemy.maxX - enemy.minX), y: enemy.y, w: 34, h: 30 };
}

function draw() {
  if (!run) return;
  const level = LEVELS[run.level - 1];
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || 960;
  const height = canvas.clientHeight || width * 0.5625;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
  const scale = width / 960;
  ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
  const camera = Math.max(0, Math.min(level.width - 960, run.x - 390));
  const colors = palette(level.world);
  drawBackground(level.world, camera, settings.reducedMotion ? 0 : run.elapsed);
  ctx.save(); ctx.translate(-camera, 0);
  level.platforms.forEach(p => drawPlatform(p, run.elapsed, colors));
  level.hazards.forEach((h, index) => {
    if (h.kind === 'geyser' && ((run.elapsed + h.phase) % h.period) >= h.active) return;
    if (h.kind === 'spikes') {
      ctx.fillStyle = colors.hazard;
      const count = Math.max(1, Math.floor(h.w / 24));
      for (let i = 0; i < count; i += 1) { const x = h.x + i * h.w / count; ctx.beginPath(); ctx.moveTo(x, h.y + h.h); ctx.lineTo(x + h.w / count / 2, h.y); ctx.lineTo(x + h.w / count, h.y + h.h); ctx.fill(); }
    } else if (h.kind === 'saw') {
      ctx.fillStyle = '#9ca8b9'; ctx.beginPath(); ctx.arc(h.x + h.w / 2, h.y + h.h / 2, h.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#263750'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(h.x + h.w / 2, h.y + h.h / 2, h.w / 3, run.elapsed * (settings.reducedMotion ? 0 : 3) + index, run.elapsed * (settings.reducedMotion ? 0 : 3) + index + 4.8); ctx.stroke();
    } else {
      ctx.fillStyle = h.kind === 'lava' ? '#ff593f' : '#ff9d42'; roundRect(h.x, h.y, h.w, h.h, 12); ctx.fill();
      ctx.fillStyle = '#ffe070'; ctx.globalAlpha = h.kind === 'geyser' ? .8 : .5; ctx.fillRect(h.x + 5, h.y + 8, h.w - 10, 5); ctx.globalAlpha = 1;
    }
  });
  level.crystals.forEach((crystal, index) => {
    if (run.crystals.includes(index)) return;
    ctx.save(); ctx.translate(crystal.x, crystal.y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#64e8ff'; ctx.shadowColor = '#78f3ff'; ctx.shadowBlur = settings.reducedMotion ? 0 : 12;
    roundRect(-10, -10, 20, 20, 4); ctx.fill(); ctx.restore();
  });
  (level.powerups || []).forEach(power => {
    if (run.gotPowerups.includes(power.kind)) return;
    ctx.fillStyle = power.kind === 'shield' ? '#5bd4ff' : power.kind === 'speed' ? '#fecf40' : '#c18bff';
    ctx.beginPath(); ctx.arc(power.x, power.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10264b'; ctx.font = '700 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(power.kind === 'shield' ? '◈' : power.kind === 'speed' ? '»' : '↑', power.x, power.y + 5);
  });
  if (level.key && !run.hasKey) { ctx.fillStyle = '#ffd64d'; ctx.beginPath(); ctx.arc(level.key.x, level.key.y, 11, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(level.key.x + 7, level.key.y - 3, 18, 6); }
  if (level.door) {
    ctx.fillStyle = run.hasKey ? '#69dca4' : '#be5366'; roundRect(level.door.x, level.door.y, level.door.w, level.door.h, 8); ctx.fill();
    ctx.fillStyle = '#fff0b0'; ctx.beginPath(); ctx.arc(level.door.x + 24, level.door.y + 42, 3, 0, Math.PI * 2); ctx.fill();
  }
  level.enemies.forEach((enemy, index) => {
    if (run.defeated.includes(index)) return;
    const e = enemyBox(enemy, index, run.elapsed); ctx.fillStyle = enemy.kind === 'flyer' ? '#9d67db' : '#e85d55';
    roundRect(e.x, e.y, e.w, e.h, 12); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(e.x + 8, e.y + 8, 5, 6); ctx.fillRect(e.x + 22, e.y + 8, 5, 6);
    ctx.fillStyle = '#19284e'; ctx.fillRect(e.x + 10, e.y + 10, 2, 3); ctx.fillRect(e.x + 24, e.y + 10, 2, 3);
  });
  const points = level.checkpoints || [level.checkpoint];
  points.forEach((point, index) => {
    ctx.fillStyle = index <= run.checkpointIndex ? '#53e2ad' : '#fff'; ctx.fillRect(point.x, point.y, 4, 44);
    ctx.fillStyle = index <= run.checkpointIndex ? '#53e2ad' : '#fecf40'; ctx.beginPath(); ctx.moveTo(point.x + 4, point.y); ctx.lineTo(point.x + 28, point.y + 8); ctx.lineTo(point.x + 4, point.y + 17); ctx.fill();
  });
  ctx.fillStyle = '#fecf40'; roundRect(level.exit.x, level.exit.y, level.exit.w, level.exit.h, 9); ctx.fill();
  ctx.fillStyle = '#fff8dc'; ctx.fillRect(level.exit.x + 6, level.exit.y + 8, level.exit.w - 12, level.exit.h - 8);
  const colorsPlayer = ['#3673ef', '#42c3df', '#55be72'];
  ctx.save(); if (run.invulnerable > 0 && Math.floor(run.elapsed * 14) % 2) ctx.globalAlpha = .4;
  ctx.fillStyle = 'rgb(13 27 76 / .22)'; ctx.beginPath(); ctx.ellipse(run.x + PLAYER_WIDTH / 2, run.y + PLAYER_HEIGHT + 3, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colorsPlayer[run.character]; roundRect(run.x, run.y, PLAYER_WIDTH, PLAYER_HEIGHT, 11); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(run.x + 19, run.y + 13, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#17244d'; ctx.beginPath(); ctx.arc(run.x + 20, run.y + 13, 1.5, 0, Math.PI * 2); ctx.fill();
  if (run.shield) { ctx.strokeStyle = '#8be8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(run.x + 14, run.y + 20, 24, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore(); ctx.restore();
  ctx.fillStyle = 'rgb(13 27 76 / .72)'; roundRect(12, 12, 310, 40, 12); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 17px Fredoka, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${WORLDS[level.world].name}  ·  ${level.number}. ${level.title}`, 26, 38);
  ctx.fillStyle = 'rgb(13 27 76 / .72)'; roundRect(790, 12, 158, 40, 12); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 16px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`◆ ${run.crystals.length}/3   ${Math.floor(run.elapsed)} sn`, 869, 38);
}

function pause() {
  if (!run || run.status !== 'playing') return;
  run = { ...run, status: 'paused' }; document.querySelector('#pause-button').setAttribute('aria-pressed', 'true');
  document.querySelector('#pause-button').textContent = 'Devam et'; showOverlay('paused');
}

function resume() {
  if (!run || run.status !== 'paused') return;
  run = { ...run, status: 'playing' }; overlay.classList.add('hidden');
  document.querySelector('#pause-button').setAttribute('aria-pressed', 'false'); document.querySelector('#pause-button').textContent = 'Duraklat';
  lastFrame = performance.now(); raf = requestAnimationFrame(frame);
}

function sound(kind) {
  if (!settings.sound) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = kind === 'win' ? 660 : kind === 'jump' ? 420 : 300;
    gain.gain.setValueAtTime(.045, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .12);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + .12);
  } catch { /* Audio is optional on restricted devices. */ }
}

function activateAbility() {
  if (!run || run.status !== 'playing') return;
  if (selectedCharacter === 0) keys.jumpPressed = true;
  else if (selectedCharacter === 1) keys.abilityPressed = true;
  else keys.abilityHeld = true;
}

document.querySelectorAll('.world-tabs [data-world]').forEach(button => button.addEventListener('click', () => setWorld(Number(button.dataset.world))));
document.querySelectorAll('#hero-switch [data-character]').forEach(button => button.addEventListener('click', () => { selectedCharacter = Number(button.dataset.character); renderHeroSwitch(); }));
startButton.addEventListener('click', () => startLevel(selectedLevel));
continueButton.addEventListener('click', () => startLevel(saveResume.level, true));
document.querySelector('#restart-button').addEventListener('click', () => startLevel(run?.level || selectedLevel));
document.querySelector('#pause-button').addEventListener('click', () => run?.status === 'paused' ? resume() : pause());
overlayButton.addEventListener('click', () => {
  const action = overlayButton.dataset.action;
  if (action === 'resume') resume();
  else if (action === 'retry') startLevel(run.level);
  else if (action === 'next') startLevel(Math.min(30, run.level + 1));
  else showMap();
});
mapButton.addEventListener('click', showMap);

document.querySelectorAll('.touch-pad [data-action]').forEach(button => {
  const action = button.dataset.action;
  button.addEventListener('pointerdown', event => {
    event.preventDefault(); button.setPointerCapture(event.pointerId); button.classList.add('pressed');
    if (action === 'left') keys.left = true;
    if (action === 'right') keys.right = true;
    if (action === 'jump') { keys.jumpPressed = true; sound('jump'); }
    if (action === 'ability') { keys.abilityHeld = true; activateAbility(); }
  });
  const release = () => { button.classList.remove('pressed'); if (action === 'left') keys.left = false; if (action === 'right') keys.right = false; if (action === 'ability') keys.abilityHeld = false; };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
});

window.addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'w', 'a', 's', 'd', 'W', 'A', 'D'].includes(event.key)) event.preventDefault();
  if (!run) return;
  if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') { run.status === 'paused' ? resume() : pause(); return; }
  if (event.key === 'r' || event.key === 'R') { startLevel(run.level); return; }
  if (['1', '2', '3'].includes(event.key)) { selectedCharacter = Number(event.key) - 1; renderHeroSwitch(); return; }
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.left = true;
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.right = true;
  if (event.key === 'ArrowUp' || event.key === ' ' || event.key.toLowerCase() === 'w') { if (!event.repeat) { keys.jumpPressed = true; sound('jump'); } }
  if (event.key.toLowerCase() === 'e' && !event.repeat) activateAbility();
});
window.addEventListener('keyup', event => {
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.left = false;
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.right = false;
  if (event.key.toLowerCase() === 'e') keys.abilityHeld = false;
});
window.addEventListener('blur', () => { keys.left = false; keys.right = false; keys.abilityHeld = false; if (run?.status === 'playing') pause(); });
window.addEventListener('resize', draw);
document.addEventListener('visibilitychange', () => { if (document.hidden && run?.status === 'playing') pause(); });
window.addEventListener('pagehide', () => { persistResume(); cloudSync?.flush(); });

document.querySelector('#sound-toggle').addEventListener('click', event => {
  settings.sound = !settings.sound; event.currentTarget.setAttribute('aria-pressed', String(settings.sound)); event.currentTarget.textContent = settings.sound ? 'Ses açık' : 'Ses kapalı'; persistLocal(false);
});
document.querySelector('#reduced-motion-toggle').addEventListener('click', event => {
  settings.reducedMotion = !settings.reducedMotion; event.currentTarget.setAttribute('aria-pressed', String(settings.reducedMotion)); event.currentTarget.textContent = settings.reducedMotion ? 'Az hareket açık' : 'Az hareket'; persistLocal(false); draw();
});

document.querySelector('#sound-toggle').setAttribute('aria-pressed', String(settings.sound));
document.querySelector('#sound-toggle').textContent = settings.sound ? 'Ses açık' : 'Ses kapalı';
document.querySelector('#reduced-motion-toggle').setAttribute('aria-pressed', String(settings.reducedMotion));
document.querySelector('#reduced-motion-toggle').textContent = settings.reducedMotion ? 'Az hareket açık' : 'Az hareket';
setWorld(selectedWorld);
renderHeroSwitch();
showMap();
