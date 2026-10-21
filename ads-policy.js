export function resolveMode(config, location) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (local && (config.mode === 'preview' || new URLSearchParams(location.search).get('ads') === 'preview')) return 'preview';
  if (config.mode !== 'live' || location.hostname !== 'oyunarasi.site' || config.liveHost !== location.hostname || location.protocol !== 'https:') return 'off';
  if (!/^ca-pub-\d{16}$/.test(config.publisherId)) return 'off';
  try {
    const url = new URL(config.cmpScriptUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'fundingchoicesmessages.google.com' || !url.pathname.startsWith('/i/')) return 'off';
  } catch { return 'off'; }
  return 'live';
}

// Conservative initial release: denied, unknown and unconfigured purposes block ads.
export function permitsAds(status) {
  return !!status && ['adStoragePurposeConsentStatus', 'adUserDataPurposeConsentStatus', 'adPersonalizationPurposeConsentStatus']
    .every(key => [1, 3].includes(status[key]));
}

export function safeDistance(ad, game) {
  const dx = Math.max(game.left - ad.right, ad.left - game.right, 0);
  const dy = Math.max(game.top - ad.bottom, ad.top - game.bottom, 0);
  return Math.hypot(dx, dy) >= 150;
}

export function onceAsync(action) {
  let pending;
  return () => pending ??= Promise.resolve().then(action);
}
