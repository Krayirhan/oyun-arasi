// Favoriler ve son oynanan oyunlar. Cihazda tutulur; giriş yapılmışsa firebase-client.js
// (startLibrarySync) profildeki `library` alanıyla eşitler.
//   window.OyunArasiLibrary.favorites() / isFavorite(id) / toggleFavorite(id)
//   window.OyunArasiLibrary.recent() → [{ id, at }] (en yeni önce) / recordPlay(id)
// Her değişiklikte window'a 'oyunarasi-library-changed' olayı gönderilir
// (detail.source: 'local' bu cihazdaki işlem, 'cloud' hesaptan gelen birleştirme).
(function (global) {
  const KEY = 'oyunarasi-library-v1';
  const MAX_ITEMS = 12;
  const validId = id => typeof id === 'string' && /^[a-z0-9-]{1,24}$/.test(id);

  function normalize(data) {
    const source = data && typeof data === 'object' ? data : {};
    const favorites = [...new Set((Array.isArray(source.favorites) ? source.favorites : []).filter(validId))].slice(0, MAX_ITEMS);
    const seen = new Set();
    const recent = (Array.isArray(source.recent) ? source.recent : [])
      .filter(entry => entry && validId(entry.id) && Number.isFinite(entry.at))
      .sort((a, b) => b.at - a.at)
      .filter(entry => !seen.has(entry.id) && seen.add(entry.id))
      .slice(0, MAX_ITEMS)
      .map(entry => ({ id: entry.id, at: Math.round(entry.at) }));
    const favoritesUpdatedAt = Number.isFinite(source.favoritesUpdatedAt) ? Math.round(source.favoritesUpdatedAt) : 0;
    return { favorites, favoritesUpdatedAt, recent };
  }

  // Favoriler: daha yeni değiştirilen taraf kazanır (silmeler de taşınır).
  // Son oynananlar: oyun başına en yeni zaman, en fazla 12 oyun.
  function merge(local, remote) {
    const a = normalize(local);
    const b = normalize(remote);
    const favoritesFrom = b.favoritesUpdatedAt > a.favoritesUpdatedAt ? b : a;
    return normalize({
      favorites: favoritesFrom.favorites,
      favoritesUpdatedAt: favoritesFrom.favoritesUpdatedAt,
      recent: [...a.recent, ...b.recent]
    });
  }

  function read() {
    try { return normalize(JSON.parse(global.localStorage.getItem(KEY))); } catch { return normalize(null); }
  }

  function write(data, source) {
    const next = normalize(data);
    try { global.localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    try { global.dispatchEvent(new global.CustomEvent('oyunarasi-library-changed', { detail: { source, library: next } })); } catch {}
    return next;
  }

  const api = {
    favorites: () => read().favorites,
    isFavorite: id => read().favorites.includes(id),
    toggleFavorite(id) {
      if (!validId(id)) return false;
      const data = read();
      const on = !data.favorites.includes(id);
      data.favorites = on ? [id, ...data.favorites] : data.favorites.filter(item => item !== id);
      data.favoritesUpdatedAt = Date.now();
      write(data, 'local');
      return on;
    },
    recent: () => read().recent,
    recordPlay(id) {
      if (!validId(id)) return;
      const data = read();
      data.recent = [{ id, at: Date.now() }, ...data.recent.filter(entry => entry.id !== id)];
      write(data, 'local');
    },
    snapshot: read,
    // Hesaptan gelen birleşik veriyi yazar; 'cloud' kaynağı tekrar buluta gönderilmez.
    replace: data => write(data, 'cloud'),
    normalize,
    merge
  };

  global.OyunArasiLibrary = api;
})(window);
