// Oyun içi onay kartı: tarayıcının onay penceresi (window.confirm) yerine oyun panelinin içinde, oyunun renkleriyle açılır.
// Tam ekranda da görünür. Esc ya da "vazgeç" iptal eder, Tab kart içinde döner; kart açıkken oyunun klavye
// kısayolları çalışmaz. Varsayılan odak güvenli seçenekte (vazgeç) durur.
//
//   const ok = await confirmDialog({ title: 'Yeni oyun başlasın mı?', message: '...', confirmLabel: 'Yeni oyun' });
let current = null;
let counter = 0;

export function confirmDialog({ title, message = '', confirmLabel = 'Evet', cancelLabel = 'Oyuna dön', kicker } = {}) {
  current?.close(false);
  const host = document.querySelector('.play-panel') || document.body;
  const id = `game-confirm-${counter += 1}`;
  const returnFocus = document.activeElement;

  const layer = document.createElement('div');
  layer.className = 'game-confirm';
  const card = document.createElement('div');
  card.className = 'game-confirm-card';
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', `${id}-title`);
  if (message) card.setAttribute('aria-describedby', `${id}-message`);
  const eyebrow = Object.assign(document.createElement('p'), { className: 'game-confirm-kicker', textContent: kicker || document.querySelector('.play-panel-labels strong')?.textContent || 'OYUN ARASI' });
  const heading = Object.assign(document.createElement('h2'), { id: `${id}-title`, textContent: title });
  const text = Object.assign(document.createElement('p'), { id: `${id}-message`, className: 'game-confirm-message', textContent: message });
  const actions = document.createElement('div');
  actions.className = 'game-confirm-actions';
  const cancel = Object.assign(document.createElement('button'), { type: 'button', className: 'play-button play-undo', textContent: cancelLabel });
  const confirm = Object.assign(document.createElement('button'), { type: 'button', className: 'play-button play-new', textContent: confirmLabel });
  actions.append(cancel, confirm);
  card.append(eyebrow, heading);
  if (message) card.append(text);
  card.append(actions);
  layer.append(card);

  return new Promise(resolve => {
    // Kart açıkken hiçbir tuş oyuna (ok tuşları, F, R, P...) ya da tam ekran kısayollarına ulaşmaz.
    // Butondaki Enter/Boşluk'un varsayılan tıklaması ise çalışır.
    const onKey = event => {
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(false); }
      else if (event.key === 'Tab') { event.preventDefault(); (document.activeElement === cancel ? confirm : cancel).focus(); }
      else if (!((event.key === 'Enter' || event.key === ' ') && card.contains(document.activeElement))) event.preventDefault();
    };
    function close(result) {
      if (current?.layer !== layer) return;
      current = null;
      window.removeEventListener('keydown', onKey, true);
      layer.classList.add('closing');
      setTimeout(() => layer.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140);
      if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
      resolve(result);
    }
    current = { layer, close };
    cancel.addEventListener('click', () => close(false));
    confirm.addEventListener('click', () => close(true));
    layer.addEventListener('pointerdown', event => { if (event.target === layer) close(false); });
    window.addEventListener('keydown', onKey, true);
    host.append(layer);
    cancel.focus({ preventScroll: true });
  });
}
