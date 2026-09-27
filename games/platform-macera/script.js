import { LEVELS, WORLDS } from './levels.js?v=202609270203';
import { PLAYER_HEIGHT, PLAYER_WIDTH, campaignStats, createCampaign, createRun, finishCampaign, isValidCampaign, isValidResume, mergeCampaigns, resumeRun, tick } from './logic.js?v=202609270203';
import { syncGameOnAccountChange } from '../../cloud-sync.js?v=202609270203';

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
    { sky: '#071329', skyGlow: '#142e59', far: '#122346', near: '#19305a', ground: '#263f70', edge: '#101e3e', platform: '#314a7b', accent: '#35d8ff', accentSoft: '#86f3ff', hazard: '#ff647d' },
    { sky: '#0b1029', skyGlow: '#252c62', far: '#1c2450', near: '#293567', ground: '#354878', edge: '#161f46', platform: '#40558c', accent: '#aa88ff', accentSoft: '#d5c4ff', hazard: '#ff648e' },
    { sky: '#170f2b', skyGlow: '#52263f', far: '#351a3a', near: '#502746', ground: '#513b61', edge: '#291a3d', platform: '#694c70', accent: '#ffbc52', accentSoft: '#ffe29a', hazard: '#ff624b' }
  ][world];
}

function drawBackground(world, camera, elapsed) {
  const colors = palette(world);
  const gradient = ctx.createLinearGradient(0, 0, 0, 540);
  gradient.addColorStop(0, colors.sky); gradient.addColorStop(.58, colors.skyGlow); gradient.addColorStop(1, '#081329');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 960, 540);
  const glow = ctx.createRadialGradient(720 - camera * .09, 190, 15, 720 - camera * .09, 190, 430);
  glow.addColorStop(0, `${colors.accent}24`); glow.addColorStop(1, `${colors.accent}00`);
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 960, 540);
  for (let i = 0; i < 52; i += 1) {
    const x = ((i * 173 - camera * .12) % 1100 + 1100) % 1100 - 70;
    const y = 28 + (i * 83 % 340);
    const twinkle = settings.reducedMotion ? .42 : .3 + Math.sin(elapsed * 1.8 + i * 2) * .18;
    ctx.globalAlpha = twinkle; ctx.fillStyle = i % 7 === 0 ? colors.accentSoft : '#a9cbff';
    ctx.beginPath(); ctx.arc(x, y, i % 9 === 0 ? 2.2 : 1.15, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = `${colors.far}a8`;
  for (let i = 0; i < 7; i += 1) {
    const x = ((i * 215 - camera * .18) % 1250 + 1250) % 1250 - 125;
    ctx.beginPath(); ctx.ellipse(x, 430 + (i % 2) * 24, 170, 90 + (i % 3) * 16, 0, Math.PI, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = `${colors.near}9c`;
  for (let i = 0; i < 11; i += 1) {
    const x = ((i * 145 - camera * .34) % 1450 + 1450) % 1450 - 150;
    ctx.beginPath(); ctx.ellipse(x, 474, 98, 75 + (i % 3) * 13, 0, Math.PI, Math.PI * 2); ctx.fill();
    if (world === 1) {
      ctx.strokeStyle = `${colors.accent}28`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 35, 350, 38 + (i % 2) * 18, elapsed * .06 + i, elapsed * .06 + i + Math.PI * 1.35); ctx.stroke();
    }
  }
  if (world === 2) {
    for (let i = 0; i < 14; i += 1) {
      const x = ((i * 121 - camera * .3) % 1100 + 1100) % 1100 - 40;
      const lift = settings.reducedMotion ? 0 : Math.sin(elapsed * .9 + i * 1.7) * 7;
      ctx.globalAlpha = .38; ctx.fillStyle = colors.accent;
      ctx.beginPath(); ctx.arc(x, 385 - (i * 47 % 230) - lift, 2 + i % 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawPlatform(item, elapsed, colors) {
  const p = item.kind === 'moving' ? { ...item, x: item.x + item.dx * Math.sin((elapsed * item.speed + item.phase) * Math.PI * 2), y: item.y + item.dy * Math.sin((elapsed * item.speed + item.phase) * Math.PI * 2) } : item;
  const moving = item.kind === 'moving';
  ctx.save();
  if (moving && !settings.reducedMotion) { ctx.shadowColor = colors.accent; ctx.shadowBlur = 13; }
  ctx.fillStyle = 'rgb(1 6 24 / .48)'; roundRect(p.x, p.y + 7, p.w, p.h + 2, 8); ctx.fill();
  const material = ctx.createLinearGradient(0, p.y, 0, p.y + Math.max(p.h, 20));
  material.addColorStop(0, moving ? colors.accent : colors.platform);
  material.addColorStop(.16, moving ? `${colors.accent}df` : '#526da8');
  material.addColorStop(1, item.kind === 'ground' ? colors.ground : colors.edge);
  ctx.fillStyle = material; roundRect(p.x, p.y, p.w, p.h, 8); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = moving ? `${colors.accentSoft}bb` : 'rgb(181 211 255 / .25)'; ctx.lineWidth = 1.2;
  roundRect(p.x + .7, p.y + .7, p.w - 1.4, p.h - 1.4, 7); ctx.stroke();
  ctx.fillStyle = moving ? colors.accentSoft : 'rgb(218 234 255 / .38)';
  roundRect(p.x + 7, p.y + 3, Math.max(0, p.w - 14), 2, 2); ctx.fill();
  if (p.w > 90) {
    ctx.strokeStyle = 'rgb(7 18 45 / .24)'; ctx.lineWidth = 1;
    for (let seam = p.x + 54; seam < p.x + p.w - 20; seam += 58) { ctx.beginPath(); ctx.moveTo(seam, p.y + 6); ctx.lineTo(seam, p.y + p.h - 5); ctx.stroke(); }
  }
  ctx.restore();
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
      const spikeGlow = ctx.createLinearGradient(0, h.y, 0, h.y + h.h);
      spikeGlow.addColorStop(0, '#fff0f2'); spikeGlow.addColorStop(.14, colors.hazard); spikeGlow.addColorStop(1, '#9d345e');
      ctx.save(); ctx.shadowColor = colors.hazard; ctx.shadowBlur = settings.reducedMotion ? 0 : 11; ctx.fillStyle = spikeGlow;
      const count = Math.max(1, Math.floor(h.w / 24));
      for (let i = 0; i < count; i += 1) { const x = h.x + i * h.w / count; ctx.beginPath(); ctx.moveTo(x, h.y + h.h); ctx.lineTo(x + h.w / count / 2, h.y); ctx.lineTo(x + h.w / count, h.y + h.h); ctx.fill(); }
      ctx.restore();
    } else if (h.kind === 'saw') {
      const cx = h.x + h.w / 2; const cy = h.y + h.h / 2; const rotation = settings.reducedMotion ? 0 : run.elapsed * 2.4 + index;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotation); ctx.shadowColor = colors.hazard; ctx.shadowBlur = settings.reducedMotion ? 0 : 13;
      ctx.fillStyle = '#ff7080'; ctx.beginPath();
      for (let tooth = 0; tooth < 16; tooth += 1) { const angle = tooth * Math.PI / 8; const radius = tooth % 2 ? h.w * .39 : h.w * .5; ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius); }
      ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#d8e8ff'; ctx.beginPath(); ctx.arc(0, 0, h.w * .31, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#273a62'; ctx.beginPath(); ctx.arc(0, 0, h.w * .12, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else {
      const liquid = ctx.createLinearGradient(0, h.y, 0, h.y + h.h);
      liquid.addColorStop(0, '#ffe16e'); liquid.addColorStop(.12, '#ff784b'); liquid.addColorStop(1, '#bd315c');
      ctx.save(); ctx.shadowColor = '#ff604b'; ctx.shadowBlur = settings.reducedMotion ? 0 : 18; ctx.fillStyle = liquid; roundRect(h.x, h.y, h.w, h.h, 12); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = 'rgb(255 227 154 / .65)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let step = 0; step <= 8; step += 1) { const x = h.x + step * h.w / 8; const wave = settings.reducedMotion ? 0 : Math.sin(run.elapsed * 3 + step + index) * 3; if (!step) ctx.moveTo(x, h.y + 5 + wave); else ctx.lineTo(x, h.y + 5 + wave); }
      ctx.stroke(); ctx.restore();
    }
  });
  level.crystals.forEach((crystal, index) => {
    if (run.crystals.includes(index)) return;
    const bob = settings.reducedMotion ? 0 : Math.sin(run.elapsed * 2.3 + index * 2) * 4;
    ctx.save(); ctx.translate(crystal.x, crystal.y + bob); ctx.rotate(Math.PI / 4 + (settings.reducedMotion ? 0 : run.elapsed * .25));
    ctx.shadowColor = '#5eeaff'; ctx.shadowBlur = settings.reducedMotion ? 0 : 22;
    const gemFill = ctx.createLinearGradient(-10, -10, 10, 10); gemFill.addColorStop(0, '#e2ffff'); gemFill.addColorStop(.28, '#62efff'); gemFill.addColorStop(1, '#347bff');
    ctx.fillStyle = gemFill; roundRect(-10, -10, 20, 20, 4); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgb(255 255 255 / .75)'; ctx.lineWidth = 1.5; roundRect(-10, -10, 20, 20, 4); ctx.stroke(); ctx.restore();
  });
  (level.powerups || []).forEach(power => {
    if (run.gotPowerups.includes(power.kind)) return;
    const powerColor = power.kind === 'shield' ? '#62dfff' : power.kind === 'speed' ? '#ffd15b' : '#c18bff';
    const bob = settings.reducedMotion ? 0 : Math.sin(run.elapsed * 2 + power.x) * 3;
    ctx.save(); ctx.shadowColor = powerColor; ctx.shadowBlur = settings.reducedMotion ? 0 : 16; ctx.strokeStyle = powerColor; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(power.x, power.y + bob, 16, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = `${powerColor}3d`; ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = '700 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(power.kind === 'shield' ? '◈' : power.kind === 'speed' ? '»' : '↑', power.x, power.y + bob + 5); ctx.restore();
  });
  if (level.key && !run.hasKey) {
    const bob = settings.reducedMotion ? 0 : Math.sin(run.elapsed * 2.4) * 4;
    ctx.save(); ctx.translate(level.key.x, level.key.y + bob); ctx.rotate(-.35); ctx.shadowColor = '#ffd257'; ctx.shadowBlur = settings.reducedMotion ? 0 : 15; ctx.strokeStyle = '#ffe18a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(-4, 0, 8, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#ffd257'; roundRect(2, -3, 24, 6, 3); ctx.fill(); ctx.fillRect(17, 2, 4, 7); ctx.fillRect(23, 2, 4, 5); ctx.restore();
  }
  if (level.door) {
    const doorColor = run.hasKey ? '#63f0b2' : '#ff6c88';
    ctx.save(); ctx.shadowColor = doorColor; ctx.shadowBlur = settings.reducedMotion ? 0 : 18; ctx.strokeStyle = doorColor; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); roundRect(level.door.x - 7, level.door.y - 7, level.door.w + 14, level.door.h + 14, 12); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = `${doorColor}45`; roundRect(level.door.x, level.door.y, level.door.w, level.door.h, 8); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = `${doorColor}bb`; ctx.lineWidth = 2; roundRect(level.door.x, level.door.y, level.door.w, level.door.h, 8); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(level.door.x + 24, level.door.y + 42, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  level.enemies.forEach((enemy, index) => {
    if (run.defeated.includes(index)) return;
    const e = enemyBox(enemy, index, run.elapsed); ctx.save(); ctx.shadowColor = enemy.kind === 'flyer' ? '#b78bff' : '#ff7080'; ctx.shadowBlur = settings.reducedMotion ? 0 : 10;
    const enemyFill = ctx.createLinearGradient(0, e.y, 0, e.y + e.h); enemyFill.addColorStop(0, enemy.kind === 'flyer' ? '#dfcaff' : '#ffbbc4'); enemyFill.addColorStop(.35, enemy.kind === 'flyer' ? '#a780f6' : '#ff7183'); enemyFill.addColorStop(1, enemy.kind === 'flyer' ? '#6548c2' : '#bc4569');
    ctx.fillStyle = enemyFill; roundRect(e.x, e.y, e.w, e.h, 12); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#f8fbff'; ctx.fillRect(e.x + 8, e.y + 8, 5, 6); ctx.fillRect(e.x + 22, e.y + 8, 5, 6);
    ctx.fillStyle = '#19284e'; ctx.fillRect(e.x + 10, e.y + 10, 2, 3); ctx.fillRect(e.x + 24, e.y + 10, 2, 3);
    ctx.restore();
  });
  const points = level.checkpoints || [level.checkpoint];
  points.forEach((point, index) => {
    ctx.fillStyle = index <= run.checkpointIndex ? '#53e2ad' : '#fff'; ctx.fillRect(point.x, point.y, 4, 44);
    ctx.fillStyle = index <= run.checkpointIndex ? '#53e2ad' : '#fecf40'; ctx.beginPath(); ctx.moveTo(point.x + 4, point.y); ctx.lineTo(point.x + 28, point.y + 8); ctx.lineTo(point.x + 4, point.y + 17); ctx.fill();
  });
  const portal = ctx.createLinearGradient(level.exit.x, level.exit.y, level.exit.x + level.exit.w, level.exit.y + level.exit.h);
  portal.addColorStop(0, '#6ef4cb'); portal.addColorStop(1, '#36b9ff');
  ctx.save(); ctx.shadowColor = '#58e5ff'; ctx.shadowBlur = settings.reducedMotion ? 0 : 20; ctx.strokeStyle = portal; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); roundRect(level.exit.x - 7, level.exit.y - 7, level.exit.w + 14, level.exit.h + 14, 12); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = `${run.hasKey || !level.key ? '#52e8c0' : '#a1b5d9'}35`; roundRect(level.exit.x, level.exit.y, level.exit.w, level.exit.h, 9); ctx.fill();
  ctx.strokeStyle = portal; ctx.lineWidth = 2; roundRect(level.exit.x, level.exit.y, level.exit.w, level.exit.h, 9); ctx.stroke();
  ctx.fillStyle = '#eaffff'; ctx.beginPath(); ctx.ellipse(level.exit.x + level.exit.w / 2, level.exit.y + level.exit.h / 2, 8, 20, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const heroColors = [{ main: '#28c9ff', light: '#baf7ff', dark: '#1755c8' }, { main: '#ffc94e', light: '#fff1b4', dark: '#e4772f' }, { main: '#ff6c64', light: '#ffd0bd', dark: '#bb3986' }];
  const hero = heroColors[run.character];
  ctx.save(); if (run.invulnerable > 0 && Math.floor(run.elapsed * 14) % 2) ctx.globalAlpha = .4;
  ctx.fillStyle = 'rgb(1 7 22 / .58)'; ctx.beginPath(); ctx.ellipse(run.x + PLAYER_WIDTH / 2, run.y + PLAYER_HEIGHT + 4, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (Math.abs(run.vx) > 80 && !settings.reducedMotion) {
    const direction = -Math.sign(run.vx);
    for (let dot = 0; dot < 4; dot += 1) {
      ctx.globalAlpha = .46 - dot * .09; ctx.fillStyle = hero.main; ctx.beginPath(); ctx.arc(run.x + PLAYER_WIDTH / 2 + direction * (12 + dot * 10), run.y + 15 + dot * 3, 4 - dot * .6, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = run.invulnerable > 0 && Math.floor(run.elapsed * 14) % 2 ? .4 : 1;
  ctx.shadowColor = hero.main; ctx.shadowBlur = settings.reducedMotion ? 0 : 18;
  if (run.character === 0) {
    const fill = ctx.createLinearGradient(run.x, run.y, run.x + PLAYER_WIDTH, run.y + PLAYER_HEIGHT); fill.addColorStop(0, hero.light); fill.addColorStop(.25, hero.main); fill.addColorStop(1, hero.dark);
    ctx.fillStyle = fill; roundRect(run.x, run.y, PLAYER_WIDTH, PLAYER_HEIGHT, 9); ctx.fill();
  } else if (run.character === 1) {
    const bob = run.grounded ? Math.sin(run.elapsed * 8) * 1.5 : 0;
    const gradientHero = ctx.createLinearGradient(run.x, run.y, run.x + PLAYER_WIDTH, run.y + PLAYER_HEIGHT); gradientHero.addColorStop(0, hero.light); gradientHero.addColorStop(.3, hero.main); gradientHero.addColorStop(1, hero.dark);
    ctx.fillStyle = gradientHero; ctx.beginPath(); ctx.arc(run.x + PLAYER_WIDTH / 2, run.y + PLAYER_HEIGHT / 2 + bob, 17, 0, Math.PI * 2); ctx.fill();
  } else {
    const gradientHero = ctx.createLinearGradient(run.x, run.y, run.x + PLAYER_WIDTH, run.y + PLAYER_HEIGHT); gradientHero.addColorStop(0, hero.light); gradientHero.addColorStop(.3, hero.main); gradientHero.addColorStop(1, hero.dark);
    ctx.fillStyle = gradientHero; ctx.beginPath(); ctx.moveTo(run.x + PLAYER_WIDTH / 2, run.y); ctx.lineTo(run.x + PLAYER_WIDTH, run.y + PLAYER_HEIGHT); ctx.lineTo(run.x, run.y + PLAYER_HEIGHT); ctx.closePath(); ctx.fill();
  }
  const eyeX = run.x + (run.character === 2 ? 15 : 19);
  const eyeY = run.y + (run.character === 2 ? 25 : 15);
  ctx.shadowBlur = 0; ctx.fillStyle = '#f5fbff'; ctx.beginPath(); ctx.ellipse(eyeX, eyeY, 4, 4.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#14264c'; ctx.beginPath(); ctx.arc(eyeX + 1, eyeY, 1.8, 0, Math.PI * 2); ctx.fill();
  if (run.shield) { ctx.strokeStyle = '#8be8ff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(run.x + 14, run.y + 20, 25, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore(); ctx.restore();
  const glass = 'rgb(5 13 34 / .78)';
  ctx.fillStyle = glass; roundRect(14, 13, 390, 42, 13); ctx.fill(); ctx.strokeStyle = 'rgb(172 202 255 / .2)'; ctx.lineWidth = 1; roundRect(14, 13, 390, 42, 13); ctx.stroke();
  ctx.fillStyle = '#f5f8ff'; ctx.font = '700 17px Fredoka, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${WORLDS[level.world].name}  ·  ${level.number}. ${level.title}`, 29, 39);
  ctx.fillStyle = glass; roundRect(796, 13, 150, 42, 13); ctx.fill(); ctx.strokeStyle = 'rgb(172 202 255 / .2)'; roundRect(796, 13, 150, 42, 13); ctx.stroke();
  ctx.fillStyle = '#67eaff'; ctx.font = '700 15px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`◆ ${run.crystals.length}/3`, 871, 39);
  const playPanel = document.querySelector('.play-panel');
  const immersive = document.fullscreenElement === playPanel || playPanel?.classList.contains('mobile-immersive');
  if (!immersive) {
    ctx.fillStyle = 'rgb(4 12 30 / .84)'; roundRect(18, 478, 924, 48, 13); ctx.fill(); ctx.strokeStyle = 'rgb(172 202 255 / .17)'; roundRect(18, 478, 924, 48, 13); ctx.stroke();
    ctx.font = '700 13px Fredoka, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#9fb4d8'; ctx.fillText('★ SKOR', 38, 499); ctx.fillStyle = '#ffd25b'; ctx.font = '700 20px Fredoka, sans-serif'; ctx.fillText(String(run.score), 38, 519);
    ctx.fillStyle = '#a7caff'; ctx.font = '700 13px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BÖLÜM', 480, 499); ctx.fillStyle = '#f5f8ff'; ctx.font = '700 19px Fredoka, sans-serif'; ctx.fillText(`${level.number} / 30`, 480, 519);
    ctx.fillStyle = '#9fe7ff'; ctx.font = '700 13px Fredoka, sans-serif'; ctx.textAlign = 'right'; ctx.fillText('◷ SÜRE', 920, 499); ctx.fillStyle = '#f5f8ff'; ctx.font = '700 19px Fredoka, sans-serif'; ctx.fillText(`${Math.floor(run.elapsed)} sn`, 920, 519);
  }
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
document.addEventListener('click', async event => {
  const button = event.target.closest?.('.fullscreen-button');
  const panel = button?.closest('.play-panel');
  if (!button || !panel) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const setFallback = active => {
    panel.classList.toggle('mobile-immersive', active);
    document.body.classList.toggle('platform-immersive-open', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Tam ekrandan çık' : 'Tam ekranı aç');
    draw();
  };
  if (panel.classList.contains('mobile-immersive')) { setFallback(false); return; }
  if (document.fullscreenElement === panel) { await document.exitFullscreen().catch(() => {}); return; }
  try {
    if (typeof panel.requestFullscreen !== 'function') throw new Error('Fullscreen API unavailable');
    await panel.requestFullscreen();
  } catch { setFallback(true); }
}, true);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const panel = document.querySelector('.play-panel.mobile-immersive');
  const button = panel?.querySelector('.fullscreen-button');
  if (!panel || !button) return;
  event.preventDefault(); event.stopImmediatePropagation();
  panel.classList.remove('mobile-immersive'); document.body.classList.remove('platform-immersive-open');
  button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', 'Tam ekranı aç'); draw();
}, true);
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
document.addEventListener('fullscreenchange', draw);
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
