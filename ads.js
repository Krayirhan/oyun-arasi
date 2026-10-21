import { adsConfig } from './ads-config.js?v=202610212038';
import { resolveMode, permitsAds, safeDistance, onceAsync } from './ads-policy.js?v=202610212038';

export function initAds() {
  if (document.documentElement.dataset.adsInitialized) return;
  document.documentElement.dataset.adsInitialized = 'true';
  const root = new URL('.', import.meta.url);
  const footer = document.createElement('nav');
  footer.className = 'privacy-links';
  footer.setAttribute('aria-label', 'Gizlilik bağlantıları');
  for (const [path, text] of [['gizlilik/', 'Gizlilik'], ['cerezler/', 'Çerezler']]) {
    const link = document.createElement('a');
    link.href = new URL(path, root).href;
    link.textContent = text;
    footer.append(link);
  }
  const preferences = document.createElement('button');
  preferences.type = 'button';
  preferences.textContent = 'Gizlilik tercihleri';
  const notice = document.createElement('span');
  notice.setAttribute('role', 'status');
  preferences.addEventListener('click', () => {
    const fc = window.googlefc;
    if (typeof fc?.showRevocationMessage === 'function') {
      fc.callbackQueue.push({ CONSENT_API_READY: () => fc.showRevocationMessage() });
    } else notice.textContent = 'Reklam tercih sistemi şu anda etkin değil. Bilgi için Çerezler sayfasını ziyaret edebilirsin.';
  });
  footer.append(preferences, notice);
  document.body.append(footer);

  const mode = resolveMode(adsConfig, window.location);
  if (mode === 'off') return;
  // Preferences also work on informational pages and pages without ad slots.
  const fc = window.googlefc ||= {};
  fc.callbackQueue ||= [];
  const cmp = document.createElement('script');
  if (mode === 'live') {
    cmp.async = true;
    cmp.src = adsConfig.cmpScriptUrl;
    document.head.append(cmp);
  }
  const key = document.body.matches('.game-page') ? 'game' : document.querySelector('#tum-oyunlar') ? 'home' : null;
  if (!key) return;
  const anchor = key === 'home' ? document.querySelector('#tum-oyunlar') : document.querySelector('.game-details');
  if (!anchor) return;
  const placements = [];
  for (const name of [key, key + 'Left', key + 'Right']) {
    const slot = adsConfig.slots[name];
    if (!slot?.enabled || (mode === 'live' && !/^\d{10}$/.test(slot.id))) continue;
    const side = name.endsWith('Left') ? 'left' : name.endsWith('Right') ? 'right' : null;
    const area = document.createElement('aside');
    area.className = side ? 'ad-area ad-rail ad-rail-' + side : 'ad-area ad-area-' + key;
    area.dataset.slot = name;
    area.setAttribute('aria-label', side ? (side === 'left' ? 'Sol reklam' : 'Sağ reklam') : 'Reklam');
    area.innerHTML = '<span class="ad-label">Reklam</span><div class="ad-content"></div>';
    if (side) { document.body.append(area); document.body.classList.add('has-ad-rails'); }
    else if (key === 'home') anchor.before(area); else anchor.after(area);
    placements.push({ area, slot, side });
  }
  const syncFullscreen = () => {
    const active = !!document.fullscreenElement || !!document.querySelector('.play-panel.is-fullscreen');
    document.documentElement.classList.toggle('ads-fullscreen', active);
  };
  window.addEventListener('game:fullscreenchange', syncFullscreen);
  document.addEventListener('fullscreenchange', syncFullscreen);
  syncFullscreen();
  if (mode === 'preview') {
    for (const {area} of placements) {
    const content = area.querySelector('.ad-content');
    area.dataset.state = 'preview';
    content.textContent = 'Örnek reklam alanı · Gerçek reklam isteği gönderilmez';
    }
    return;
  }

  const loadAds = onceAsync(() => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsConfig.publisherId}`;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  }));
  for (const {area, slot, side} of placements) {
  const content = area.querySelector('.ad-content');
  let allowed = false;
  let near = false;
  let requested = false;
  const eligible = () => allowed && near && area.getBoundingClientRect().width > 0 && getComputedStyle(area).display !== 'none' && !document.hidden && !document.documentElement.classList.contains('ads-fullscreen') &&
    (key !== 'game' || [...document.querySelectorAll('.play-panel, .game-play, .board-frame')].every(game => safeDistance(area.getBoundingClientRect(), game.getBoundingClientRect())));
  const request = async () => {
    if (requested || !eligible()) return;
    requested = true;
    try {
      await loadAds();
      if (!eligible()) { requested = false; return; }
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.dataset.adClient = adsConfig.publisherId;
      ins.dataset.adSlot = slot.id;
      if (side) { ins.style.width = '160px'; ins.style.height = '600px'; }
      else { ins.dataset.adFormat = 'horizontal'; ins.dataset.fullWidthResponsive = 'true'; }
      content.append(ins);
      (window.adsbygoogle ||= []).push({});
      area.dataset.state = 'requested';
    } catch { area.dataset.state = 'unavailable'; }
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      near = entries.some(entry => entry.isIntersecting);
      void request();
    }, { rootMargin: '300px 0px' });
    observer.observe(area);
  }
  window.addEventListener('resize', () => void request());
  window.addEventListener('game:fullscreenchange', () => void request());
  document.addEventListener('visibilitychange', () => void request());
  fc.callbackQueue.push({ CONSENT_MODE_DATA_READY: () => {
    try { allowed = permitsAds(fc.getGoogleConsentModeValues()); } catch { allowed = false; }
    if (!allowed) content.replaceChildren();
    void request();
  } });
  // A later TCF decision (including revocation) must update eligibility too.
  fc.callbackQueue.push({ CONSENT_API_READY: () => {
    if (typeof window.__tcfapi !== 'function') return;
    window.__tcfapi('addEventListener', 2, (data, success) => {
      if (!success || !data || !['tcloaded', 'useractioncomplete'].includes(data.eventStatus)) { allowed = false; return; }
      try { allowed = permitsAds(fc.getGoogleConsentModeValues()); } catch { allowed = false; }
      if (!allowed) content.replaceChildren();
      void request();
    });
  } });
  cmp.addEventListener('error', () => { allowed = false; area.dataset.state = 'unavailable'; });
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAds, { once: true });
  else initAds();
}
