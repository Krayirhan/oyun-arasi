// Panel içi oyun akışı (menü → oyun → sonuç). Ekranlar aynı .board-frame içinde değişir; tam ekrandayken
// game-shell.js tahtayı yeni ekrana göre yeniden sığdırır.
export function createFlow(screens) {
  let current = null;
  return {
    get current() { return current; },
    show(name) {
      current = name;
      for (const [key, element] of Object.entries(screens)) element?.classList.toggle('hidden', key !== name);
      window.dispatchEvent(new Event('game:layoutchange'));
    }
  };
}

// Botun "düşünme" beklemesi: sekme gizliyken bekler, iptal edilebilir.
export function botDelay(task, delay = 600) {
  let cancelled = false;
  const run = () => {
    if (cancelled) return;
    if (document.hidden) { document.addEventListener('visibilitychange', run, { once: true }); return; }
    task();
  };
  const timer = setTimeout(run, delay);
  return () => { cancelled = true; clearTimeout(timer); document.removeEventListener('visibilitychange', run); };
}

// Menüdeki seçim çipleri (zorluk, maç uzunluğu): <div class="game-chips" data-choice="level"><button data-value="easy">
export function bindChoices(root, values, onChange) {
  root.querySelectorAll('.game-chips[data-choice]').forEach(group => {
    const name = group.dataset.choice;
    const sync = () => group.querySelectorAll('button[data-value]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.value === String(values[name])));
    });
    group.addEventListener('click', event => {
      const button = event.target.closest('button[data-value]');
      if (!button) return;
      values[name] = /^\d+$/.test(button.dataset.value) ? Number(button.dataset.value) : button.dataset.value;
      sync();
      onChange?.(name, values[name]);
    });
    sync();
  });
}
