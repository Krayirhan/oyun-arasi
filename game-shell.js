// Oyun sayfalarının ortak davranışları: "Nasıl oynanır?" kartı ve "Başka oyun dene" önerileri.

// "Nasıl oynanır?" masaüstü ve tablette hep açık, telefonda kapalı başlar.
const howCard = document.querySelector('#how-card');
if (howCard) {
  const wide = matchMedia('(min-width: 761px)');
  const sync = () => { howCard.open = wide.matches; };
  sync();
  wide.addEventListener('change', sync);
  howCard.querySelector('summary').addEventListener('click', event => { if (wide.matches) event.preventDefault(); });
}

// Öneriler catalog.js listesinden gelir; yalnızca oynanabilen oyunlar önerilir.
const moreGames = document.querySelector('[data-more-games]');

function coverArt(cover) {
  const art = document.createElement('span');
  art.className = 'more-cover';
  art.style.setProperty('--c', cover.color || '#e4dfd3');
  if (cover.text) art.style.setProperty('--t', cover.text);
  const cells = cover.cells || [];
  art.style.setProperty('--cols', cover.cols || (cells.length === 4 ? 2 : 3));
  art.append(...cells.map((text, index) => {
    const cell = Object.assign(document.createElement('i'), { textContent: text });
    if (cover.tones?.[index]) cell.dataset.tone = cover.tones[index];
    return cell;
  }));
  return art;
}

if (moreGames) {
  const base = moreGames.dataset.base || '../../';
  const limit = Number(moreGames.dataset.limit) || 6;
  const current = document.body.dataset.game;
  // A different random pick on every visit, so every game gets its turn here.
  const games = (window.OYUN_ARASI_GAMES || [])
    .filter(game => game.id !== current && !game.soon)
    .map(game => ({ game, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ game }) => game)
    .slice(0, limit);

  moreGames.append(...games.map(game => {
    const tile = document.createElement(game.soon ? 'div' : 'a');
    tile.className = ['more-tile', game.soon && 'soon', game.size === 'wide' && 'wide'].filter(Boolean).join(' ');
    if (!game.soon) tile.href = base + game.href;

    const art = document.createElement('span');
    art.className = 'more-art';
    if (game.image) {
      const img = document.createElement('img');
      img.src = base + game.image;
      img.alt = '';
      img.loading = 'lazy';
      art.append(img);
    } else if (game.cover) {
      art.append(coverArt(game.cover));
    }

    const text = document.createElement('span');
    text.className = 'more-text';
    const title = document.createElement('strong');
    title.textContent = game.title;
    text.append(title);
    if (game.tagline || game.soon) {
      const tagline = document.createElement('small');
      tagline.textContent = game.soon ? 'Yakında' : game.tagline;
      text.append(tagline);
    }

    tile.append(art, text);
    return tile;
  }));
}

// Son oynananlar ve favori düğmesi (library.js).
const library = window.OyunArasiLibrary;
const gameId = document.body.dataset.game;
const crumbs = document.querySelector('.crumbs');
if (library && gameId) {
  library.recordPlay(gameId);
  if (crumbs) {
    const favorite = document.createElement('button');
    favorite.type = 'button';
    favorite.className = 'favorite-toggle';
    const paint = () => {
      const on = library.isFavorite(gameId);
      favorite.setAttribute('aria-pressed', String(on));
      favorite.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8.5-5.2-8.5-11.2C3.5 6.6 5.8 4.5 8.4 4.5c1.6 0 2.8.8 3.6 2 .8-1.2 2-2 3.6-2 2.6 0 4.9 2.1 4.9 5.3C20.5 15.8 12 21 12 21z" /></svg><span>${on ? 'Favorilerde' : 'Favorilere ekle'}</span>`;
    };
    favorite.addEventListener('click', () => { library.toggleFavorite(gameId); paint(); });
    window.addEventListener('oyunarasi-library-changed', paint);
    paint();
    crumbs.append(favorite);
  }
}

// Shared game-page chrome. Keep each game's board and its controls intact;
// the common title bar, category, fullscreen action and details tabs wrap them.
const gameInfo = (window.OYUN_ARASI_GAMES || []).find(game => game.id === gameId);
const gameTitle = gameInfo?.title || document.title.replace(/\s*\|\s*Oyun Arası\s*$/, '');
const categoryNames = { word: 'Kelime', logic: 'Mantık', classic: 'Klasikler', number: 'Sayı' };
const category = gameInfo?.category?.split(/\s+/)[0];
const titleArt = document.querySelector('.title-art');
if (titleArt && gameTitle.length > 11) titleArt.classList.add('is-long');
const intro = document.querySelector('.play-intro, .game-intro');
if (intro && category && !intro.querySelector('.game-category')) {
  const pill = document.createElement('span');
  pill.className = 'game-category';
  pill.textContent = categoryNames[category] || 'Oyun';
  const titleArt = intro.querySelector('.title-art');
  if (titleArt) {
    const headingRow = document.createElement('div');
    headingRow.className = 'intro-heading-row';
    titleArt.before(headingRow);
    headingRow.append(titleArt, pill);
  } else (intro.querySelector('.intro-copy') || intro).after(pill);
}
const howCardForControls = document.querySelector('#how-card');
const shortcutCard = document.querySelector('.shortcuts');
if (howCardForControls && shortcutCard) {
  howCardForControls.querySelector('.how-steps')?.after(shortcutCard);
} else if (howCardForControls && gameId === 'harfane') {
  const sample = document.createElement('section');
  sample.className = 'shortcuts harfle-shortcuts';
  sample.setAttribute('aria-label', 'Kontrol örneği');
  sample.innerHTML = '<h2>Kontrol örneği</h2><div class="shortcut-keys"><div class="key-note"><kbd>A–Z</kbd><span>Harf yaz</span></div><div class="key-note"><kbd class="k-wide">Enter</kbd><span>Tahmini gönder</span></div><div class="key-note"><kbd>⌫</kbd><span>Harf sil</span></div></div>';
  howCardForControls.append(sample);
}

// ---------------------------------------------------------------- Tam ekran
// Görünüm her zaman bizim sabit konumlu yerleşimimizle yapılır (panel.is-fullscreen). Tarayıcı tam ekranı
// destekleniyorsa ek olarak <html> üzerinde istenir; böylece adres çubuğu gizlenir ama panel dışındaki pencereler
// (sonuç penceresi, bildirim) de görünmeye devam eder. Desteklenmiyorsa (iPhone) aynı yerleşim yedek mod olarak
// açılır ve geri tuşu tam ekrandan çıkar. Tahta, oyunların tam ekran kurallarıyla çerçeve genişliğinden
// boyutlanır; burada çerçeve genişliği tüm içerik ekrana sığacak şekilde hesaplanır.
const FULLSCREEN_OPTIONS = {
  tavla: { orientation: 'landscape' },
  okey: { orientation: 'landscape' },
  pisti: { orientation: 'landscape' },
  'dort-tas': { orientation: 'landscape' },
  harfane: { key: false },
  'mayin-tarlasi': { key: false },
  'platform-macera': { orientation: 'landscape' },
  tetris: { orientation: 'portrait' },
  araba: { orientation: 'portrait' }
};
const FULLSCREEN_ICONS = {
  enter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><path d="M8 8 3 3m13 5 5-5M8 16l-5 5m13-5 5 5"/></svg>',
  exit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5"/><path d="M3 3l5 5m13-5-5 5M3 21l5-5m13 5-5-5"/></svg>'
};
const FULLSCREEN_MAX_WIDTH = 1600;
const FULLSCREEN_MIN_WIDTH = 120;

function setupFullscreen(panel, button, options = {}) {
  const settings = { fit: '.board-frame', key: true, orientation: null, ...options };
  const root = document.documentElement;
  const coarse = matchMedia('(pointer: coarse)');
  const portrait = matchMedia('(orientation: portrait)');
  let active = false;
  let native = false;
  let historyEntry = false;
  let wakeLock = null;
  let fitFrame = 0;
  let stableKey = '';
  let fitWidth = 0;
  let savedScroll = 0;
  let restoreUntil = 0;
  let previousRestoration = null;
  let hint = null;
  let hintDismissed = false;

  const nativeElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const target = () => panel.querySelector(settings.fit);
  const typing = element => element instanceof HTMLElement && (element.isContentEditable || element.matches('input:not([type="button"], [type="checkbox"], [type="radio"], [type="range"]), textarea, select'));
  const innerSize = () => {
    const style = getComputedStyle(panel);
    return {
      width: panel.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      height: panel.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
      gap: parseFloat(style.rowGap) || 0
    };
  };

  function updateButton() {
    button.innerHTML = active ? FULLSCREEN_ICONS.exit : FULLSCREEN_ICONS.enter;
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Tam ekrandan çık' : 'Tam ekran');
    button.title = active ? 'Tam ekrandan çık (Esc)' : settings.key ? 'Tam ekran (F)' : 'Tam ekran';
  }

  function notify() {
    window.dispatchEvent(new CustomEvent('game:fullscreenchange', { detail: { active } }));
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  // Sığdırılan öğenin genişliğini, başlık + tahta + alt çubuk panelin iç yüksekliğini tam dolduracak şekilde ayarla.
  // Tahta yüksekliği genişlikle (yaklaşık) doğrusal değişir: iki ölçüm varsa eğimle (sekant), yoksa oranla yaklaşılır.
  // Tahta bir üst ya da alt sınıra takılırsa birkaç adım denenir; sonunda sığan en geniş değer seçilir.
  function fit() {
    fitFrame = 0;
    const element = target();
    if (!active || !element) return;
    const { width: availableWidth, height: availableHeight, gap } = innerSize();
    const maxWidth = Math.max(FULLSCREEN_MIN_WIDTH, Math.min(availableWidth, FULLSCREEN_MAX_WIDTH));
    const clampWidth = value => Math.min(maxWidth, Math.max(FULLSCREEN_MIN_WIDTH, value));
    const flowChildren = [...panel.children].filter(child => {
      const position = getComputedStyle(child).position;
      return child.getClientRects().length && position !== 'absolute' && position !== 'fixed';
    });
    // Sütun düzeninde yükseklikler toplanır; bir oyun tam ekranı ızgaraya çevirdiyse (yan yana düzen) kapladığı alan ölçülür.
    const grid = getComputedStyle(panel).display === 'grid';
    const contentHeight = () => {
      if (grid) {
        const rects = flowChildren.map(child => child.getBoundingClientRect());
        return Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top));
      }
      return flowChildren.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0) + gap * Math.max(0, flowChildren.length - 1);
    };
    // Tahtasını JS ile ölçen oyunlar (Mahjong, Soliter, Araba) bu olayı dinleyip hemen yeniden ölçer; böylece
    // her deneme aynı karede doğru yüksekliği verir.
    const apply = value => {
      panel.style.setProperty('--fs-fit-w', `${Math.floor(value)}px`);
      window.dispatchEvent(new CustomEvent('game:fullscreenfit', { detail: { width: Math.floor(value) } }));
    };
    const measure = () => ({ height: element.getBoundingClientRect().height, excess: contentHeight() - availableHeight });
    let last = null;
    const slopeAt = (w, h) => (last && Math.abs(last.width - w) > 0.5 && Math.abs(last.height - h) >= 0.5 ? (h - last.height) / (w - last.width) : 0);

    let width = clampWidth(fitWidth || maxWidth);
    apply(width);
    let { height, excess } = measure();
    let bestFit = excess <= 1 ? { width, excess } : null;
    let probe = null;
    for (let i = 0; i < 14; i += 1) {
      if (Math.abs(excess) <= 1 || height <= 0) break;
      if (excess < 0 && width >= maxWidth) break;
      const slope = slopeAt(width, height);
      let next;
      if (probe) next = width * 0.75;
      else if (slope > 0) next = width - excess / slope;
      else next = width * Math.max(0.3, (height - excess) / height);
      next = clampWidth(next);
      if (excess > 0 && next > width - 1) next = Math.max(FULLSCREEN_MIN_WIDTH, width - 1);
      if (Math.abs(next - width) < 0.5) break;
      const before = { width, height, excess };
      last = { width, height };
      width = next;
      apply(width);
      ({ height, excess } = measure());
      if (Math.abs(height - before.height) >= 0.5) {
        if (excess <= 1 && (!bestFit || width > bestFit.width)) bestFit = { width, excess };
        probe = null;
        continue;
      }
      // Tepki yok: tahta bir sınıra takıldı. Boşluk varsa daha genişte kalmanın anlamı yok, geri dön.
      if (before.excess < 0) {
        width = before.width;
        apply(width);
        ({ height, excess } = measure());
        break;
      }
      // Taşma varsa sınırın altına inmek için birkaç adım daha daralt; hiç tepki yoksa son tepki veren genişliğe dön.
      probe ||= { width: before.width, steps: 0 };
      probe.steps += 1;
      if (probe.steps > 5 || width <= FULLSCREEN_MIN_WIDTH) {
        width = probe.width;
        apply(width);
        ({ height, excess } = measure());
        break;
      }
    }
    // Döngü taşarak bittiyse doğrulanmış (taze) ve sığan en geniş değere dön.
    if (excess > 1 && bestFit) { width = bestFit.width; excess = bestFit.excess; apply(width); }
    fitWidth = width;
    // Son çare: hiçbir genişlik sığdıramıyorsa içerik kesilmesin, panel kaydırılabilir olsun.
    panel.classList.toggle('fs-overflow', excess > 1);
    stableKey = `${availableWidth}x${availableHeight}:${Math.round(element.getBoundingClientRect().height)}`;
  }

  function scheduleFit() {
    if (!fitFrame) fitFrame = requestAnimationFrame(fit);
  }

  // Kendi genişlik değişikliğimizin tetiklediği gözlemleri yok say; yalnızca ekran ya da içerik değişince yeniden sığdır.
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    const element = target();
    if (!active || !element) return;
    // Oyun tam ekrandayken paneli gizlerse (örneğin ana menüye dönüş) tam ekrandan çık.
    if (!panel.getClientRects().length) { exit(); return; }
    const { width, height } = innerSize();
    if (`${width}x${height}:${Math.round(element.getBoundingClientRect().height)}` !== stableKey) scheduleFit();
  }) : null;

  function updateHint() {
    const wrong = active && settings.orientation && coarse.matches && (settings.orientation === 'landscape') === portrait.matches;
    if (!wrong || hintDismissed) {
      if (hint) { hint.remove(); hint = null; }
      return;
    }
    if (hint) return;
    hint = document.createElement('div');
    hint.className = 'fs-rotate-hint';
    hint.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = settings.orientation === 'landscape' ? '↻ Daha rahat oynamak için telefonu yan çevir' : '↻ Daha rahat oynamak için telefonu dik tut';
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'İpucunu kapat');
    close.textContent = '✕';
    close.addEventListener('click', () => { hintDismissed = true; updateHint(); });
    hint.append(text, close);
    panel.append(hint);
    // İçeriği itmeyen, kendiliğinden kaybolan bir bildirim: 6 saniye sonra ya da ✕ ile kapanır.
    setTimeout(() => { if (hint) { hintDismissed = true; updateHint(); } }, 6000);
  }

  async function lockOrientation() {
    if (settings.orientation && native && coarse.matches) {
      try { await screen.orientation?.lock?.(settings.orientation); } catch { /* Kilit desteklenmiyorsa ipucu gösterilir. */ }
    }
    updateHint();
  }

  async function requestWakeLock() {
    if (!active || !navigator.wakeLock || (wakeLock && !wakeLock.released)) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch { wakeLock = null; }
  }

  async function enter() {
    if (active) return;
    active = true;
    savedScroll = window.scrollY;
    // Tarayıcı tam ekranı kullanıcı tıklamasının içinde, ilk await'ten önce istenmeli.
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    let pending = null;
    if (request && !nativeElement()) {
      try { pending = request.call(root, { navigationUI: 'hide' }); } catch { pending = null; }
    }
    root.classList.add('game-fs-open');
    panel.classList.add('is-fullscreen');
    panel.setAttribute('tabindex', '-1');
    target()?.setAttribute('data-fs-fit', '');
    updateButton();
    fit();
    observer?.observe(panel);
    if (target()) observer?.observe(target());
    if (!panel.contains(document.activeElement) || document.activeElement === button) panel.focus({ preventScroll: true });
    notify();
    try { await pending; } catch { /* Yedek mod kullanılır. */ }
    if (!active) return;
    native = Boolean(nativeElement());
    if (!native) {
      // Geri tuşu tam ekrandan çıksın; tarayıcı çıkışta eski kaydırma konumunu kendi başına geri yüklemesin.
      if ('scrollRestoration' in history) { previousRestoration = history.scrollRestoration; history.scrollRestoration = 'manual'; }
      history.pushState({ ...(history.state || {}), gameFullscreen: true }, '');
      historyEntry = true;
    }
    lockOrientation();
    requestWakeLock();
  }

  function exit({ fromHistory = false } = {}) {
    if (!active) return;
    active = false;
    cancelAnimationFrame(fitFrame);
    fitFrame = 0;
    observer?.disconnect();
    root.classList.remove('game-fs-open');
    panel.classList.remove('is-fullscreen', 'fs-overflow');
    panel.removeAttribute('tabindex');
    panel.style.removeProperty('--fs-fit-w');
    fitWidth = 0;
    panel.querySelector('[data-fs-fit]')?.removeAttribute('data-fs-fit');
    hint?.remove();
    hint = null;
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
    try { screen.orientation?.unlock?.(); } catch { /* Kilit yoksa yapılacak bir şey yok. */ }
    if (nativeElement()) {
      const leave = document.exitFullscreen || document.webkitExitFullscreen;
      try { leave?.call(document)?.catch?.(() => {}); } catch { /* Zaten çıkılmış olabilir. */ }
    }
    native = false;
    if (historyEntry) {
      historyEntry = false;
      if (!fromHistory && history.state?.gameFullscreen) history.back();
    }
    // Tarayıcı tam ekrandan çıkış ve geçmişe dönüş kaydırmayı eşzamansız değiştirebilir; kısa süre konumu koru.
    restoreUntil = performance.now() + 600;
    restoreScroll();
    updateButton();
    button.focus({ preventScroll: true });
    notify();
  }

  function restoreScroll() {
    if (active || performance.now() > restoreUntil) return;
    window.scrollTo({ top: savedScroll, behavior: 'instant' });
    if (previousRestoration && !historyEntry) {
      requestAnimationFrame(() => { if (previousRestoration && !active) { history.scrollRestoration = previousRestoration; previousRestoration = null; } });
    }
  }

  button.addEventListener('click', event => {
    event.preventDefault();
    if (active) exit(); else enter();
  });
  const onNativeChange = () => {
    if (nativeElement()) { native = true; return; }
    if (active && native) exit();
    else restoreScroll();
  };
  document.addEventListener('fullscreenchange', onNativeChange);
  document.addEventListener('webkitfullscreenchange', onNativeChange);
  window.addEventListener('popstate', () => {
    if (active && historyEntry && !history.state?.gameFullscreen) { historyEntry = false; exit({ fromHistory: true }); }
    else { restoreScroll(); requestAnimationFrame(restoreScroll); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active && !native) {
      event.preventDefault();
      event.stopImmediatePropagation();
      exit();
      return;
    }
    if (!settings.key || (event.key !== 'f' && event.key !== 'F') || event.repeat || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (active) exit(); else enter();
  }, true);
  portrait.addEventListener?.('change', () => { updateHint(); scheduleFit(); });
  // Oyun ekranı köklü değişince (ör. menüden oyuna geçiş) sığdırma baştan hesaplansın.
  window.addEventListener('game:layoutchange', () => {
    if (!active) return;
    fitWidth = 0;
    stableKey = '';
    cancelAnimationFrame(fitFrame);
    fit();
  });
  coarse.addEventListener?.('change', updateHint);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') requestWakeLock(); });
  updateButton();
}

const panel = document.querySelector('.play-panel, .game-play');
if (panel) {
  panel.classList.add('play-panel');
  const panelHead = document.createElement('div');
  panelHead.className = 'play-panel-head';
  const identity = document.createElement('div');
  identity.className = 'play-panel-identity';
  identity.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 8.2h9.6a4 4 0 0 1 3.8 3l1 4.2a2.4 2.4 0 0 1-3.8 2.4l-2.1-1.6H8.3l-2.1 1.6a2.4 2.4 0 0 1-3.8-2.4l1-4.2a4 4 0 0 1 3.8-3z"/><path d="M8 10.5v4m-2-2h4m6-1h.1m2 2h.1"/></svg>';
  const labels = document.createElement('span');
  labels.className = 'play-panel-labels';
  const name = document.createElement('strong');
  name.textContent = gameTitle.toLocaleUpperCase('tr-TR');
  const live = document.createElement('span');
  live.className = 'play-live';
  live.textContent = 'OYUNDA';
  labels.append(name, live);
  identity.append(labels);

  const fullscreen = document.createElement('button');
  fullscreen.type = 'button';
  fullscreen.className = 'fullscreen-button';
  const toolbar = panel.querySelector('.play-bar');
  const actions = toolbar?.querySelector('.actions');
  const restart = actions?.querySelector('.play-new');
  if (restart) {
    [...restart.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).forEach(node => { node.textContent = 'Yeniden başlat'; });
  }
  panelHead.append(identity);
  if (actions) panelHead.append(actions);
  panelHead.append(fullscreen);
  panel.prepend(panelHead);

  const scoreCards = toolbar?.querySelector('.scores');
  const status = panel.querySelector(':scope > .status');
  toolbar?.remove();
  if (scoreCards || status) {
    const footer = document.createElement('div');
    footer.className = 'play-panel-footer';
    if (scoreCards) footer.append(scoreCards);
    if (status) footer.append(status);
    panel.append(footer);
  }
  setupFullscreen(panel, fullscreen, FULLSCREEN_OPTIONS[gameId]);
}

const goalTitle = document.querySelector('#goal-title');
if (goalTitle) goalTitle.textContent = 'Hedef / Oyun bilgisi';
const goalCopy = document.querySelector('.goal-card > p');
if (goalCopy) {
  const note = document.createElement('p');
  note.className = 'goal-note';
  note.textContent = 'Kontrolleri ve oyuna özel ipuçlarını sol bölümde bulabilirsin.';
  goalCopy.after(note);
}
const moreTitle = document.querySelector('#more-games-title');
if (moreTitle) moreTitle.textContent = 'Bunları da dene';
document.querySelectorAll('.shortcuts h2').forEach(title => { title.textContent = 'Kontrol örneği'; });

// A compact, keyboard-accessible about/controls/related-games strip like the
// reference layout. Content is derived from existing page metadata and links.
const detailsAnchor = document.querySelector('.play-layout, .play-extras') || document.querySelector('.game-screen');
if (detailsAnchor && gameId) {
  const details = document.createElement('section');
  details.className = 'game-details';
  details.setAttribute('aria-label', `${gameTitle} hakkında ve kontroller`);
  const tabs = document.createElement('div');
  tabs.className = 'game-detail-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Oyun bilgisi');
  const content = document.createElement('div');
  content.className = 'game-detail-content';
  const panels = [
    ['about', 'Oyun hakkında'],
    ['controls', 'Kontroller'],
    ['related', 'Benzer oyunlar']
  ];
  const metaDescription = document.querySelector('meta[name="description"]')?.content || `${gameTitle} oyununu Oyun Arası’nda oyna.`;
  const controlSource = document.querySelector('.shortcuts') || document.querySelector('.keyboard');
  const controlsText = controlSource?.innerText?.replace(/\s+/g, ' ').trim() || 'Klavye ve dokunmatik kontroller oyun alanında kullanılabilir.';
  const related = [...document.querySelectorAll('[data-more-games] .more-tile')];
  panels.forEach(([id, label], index) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'game-detail-tab';
    tab.id = `game-tab-${id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `game-panel-${id}`);
    tab.dataset.icon = id;
    tab.setAttribute('aria-selected', String(index === 0));
    tab.tabIndex = index === 0 ? 0 : -1;
    tab.textContent = label;
    const section = document.createElement('div');
    section.className = 'game-detail-panel';
    section.id = `game-panel-${id}`;
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', tab.id);
    section.hidden = index !== 0;
    if (id === 'about') {
      const paragraph = document.createElement('p');
      paragraph.textContent = metaDescription;
      section.append(paragraph);
    } else if (id === 'controls') {
      const paragraph = document.createElement('p');
      paragraph.textContent = controlsText;
      section.append(paragraph);
    } else {
      const list = document.createElement('div');
      list.className = 'related-game-links';
      related.forEach(tile => {
        const link = document.createElement('a');
        link.href = tile.href;
        link.textContent = tile.querySelector('.more-text strong')?.textContent || tile.textContent.trim();
        list.append(link);
      });
      if (!related.length) {
        const paragraph = document.createElement('p');
        paragraph.textContent = 'Yeni oyun önerileri yakında burada.';
        section.append(paragraph);
      } else section.append(list);
    }
    tab.addEventListener('click', () => {
      tabs.querySelectorAll('[role="tab"]').forEach(other => {
        const selected = other === tab;
        other.setAttribute('aria-selected', String(selected));
        other.tabIndex = selected ? 0 : -1;
      });
      content.querySelectorAll('[role="tabpanel"]').forEach(other => { other.hidden = other !== section; });
    });
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const allTabs = [...tabs.querySelectorAll('[role="tab"]')];
      const current = allTabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? allTabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + allTabs.length) % allTabs.length;
      allTabs[next].focus();
      allTabs[next].click();
    });
    tabs.append(tab);
    content.append(section);
  });
  const promo = document.createElement('aside');
  promo.className = 'game-details-promo';
  promo.innerHTML = '<span aria-hidden="true">🎮</span><p>Farklı türde oyunlar, her an yeni bir deneyim.</p><strong>OYUNARASI</strong>';
  details.append(tabs, content, promo);
  detailsAnchor.after(details);
}
