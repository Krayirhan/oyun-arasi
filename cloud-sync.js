// Oyunlar Firebase'i bu dosya üzerinden, sonradan yükler. Firebase CDN'i engellenirse
// (reklam engelleyici, kapalı ağ, bağlantı sorunu) oyun yine açılır ve cihazda kaydolur.
let firebaseClient;

export function loadFirebaseClient() {
  firebaseClient ||= import('./firebase-client.js?v=202609262300');
  return firebaseClient;
}

export function syncGameOnAccountChange(gameId, options) {
  let sync = null;
  let destroyed = false;

  loadFirebaseClient()
    .then(client => {
      if (destroyed) return;
      sync = client.syncGameOnAccountChange(gameId, options);
    })
    .catch(() => {
      if (!destroyed) options.onStatus?.('Oyun bu cihazda saklanıyor.');
    });

  return {
    save(state) { sync?.save(state); },
    flush() { return sync?.flush(); },
    destroy() { destroyed = true; sync?.destroy(); }
  };
}
