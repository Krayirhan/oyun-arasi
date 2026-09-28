// Panel içi oyun akışı (menü → oyun → sonuç), tüm oyunlarda aynı sahne standardıyla:
// oyun ekranı (stage) hep yerinde durur; menü ve sonuç onun ÜSTÜNDE, perdeli birer katman olarak açılır.
// Çerçevenin boyunu yalnızca oyun sahnesi belirler; katmanlar sahnenin üstüne mutlak konumla oturur
// (play-page.css, [data-flow]). Böylece ekran değişince oyun çerçevesi büyüyüp küçülmez.
export function createFlow(screens, { stage = 'game' } = {}) {
  let current = null;
  for (const [key, element] of Object.entries(screens)) {
    if (!element) continue;
    element.classList.remove('hidden');
    element.dataset.flow = key === stage ? 'stage' : 'overlay';
    // Katmanın içeriği tek bir kutuda durur; katmanın kendisi sahneyi kaplayan perdedir.
    if (key !== stage && !element.querySelector(':scope > .flow-card')) {
      const card = document.createElement('div');
      card.className = 'flow-card';
      card.append(...element.childNodes);
      element.append(card);
    }
  }
  return {
    get current() { return current; },
    show(name) {
      current = name;
      for (const [key, element] of Object.entries(screens)) {
        if (!element) continue;
        const onStage = key === stage;
        element.classList.toggle('is-offstage', !onStage && key !== name);
        // Katman açıkken alttaki oyun ekranı klavyeyle de seçilemez.
        element.inert = onStage ? name !== stage : key !== name;
      }
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
