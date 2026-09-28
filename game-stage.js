// Oyun Arası — tek oyun sahnesi şablonu. Her oyun yalnız tahtasını çizer; başlangıç, mola, oyun sonu ve menü
// ekranları bu modülden, aynı görünümle ve tahtanın ÜSTÜNDE perdeli bir katman olarak açılır.
// Kural: oyun çerçevesinin (.board-frame) boyunu yalnızca tahta belirler. Katmanlar mutlak konumludur, çerçeveyi
// asla uzatmaz; sığmazsa kendi içinde kayar. CSS: play-page.css, "Tek oyun sahnesi" bölümü.
//
//   createStage()  — kart katmanı (başlangıç / mola / sonuç). Çerçevenin kendi düzenine dokunmaz.
//   createFlow()   — menülü oyunlar: menü, oyun ve sonuç ekranları aynı hücrede; oyun ekranı hep sahnede.

const DEMO = {
  kind: 'result', kicker: 'DENETİM · EN KALABALIK KART', title: 'Yeni rekor! Çok iyi bir tur oldu', record: true, stars: 3,
  copy: 'Bu kart, sahneye sığıp sığmadığını ölçmek için en uzun metin, altı istatistik ve üç düğmeyle açılır.',
  stats: [['Puan', '12.480'], ['Süre', '03:42'], ['Hamle', '128'], ['Doğru', '42'], ['Kombo', '×5'], ['İsabet', '%97']],
  actions: [{ label: 'Tekrar oyna', primary: true }, { label: 'Menü' }, { label: 'Tahtaya bak' }]
};

let current = null;
const stages = new WeakMap();

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Kart katmanı. frame: oyun çerçevesi (varsayılan: sayfadaki oyun panelinin .board-frame'i).
export function createStage({ frame = document.querySelector('.play-panel .board-frame') } = {}) {
  if (!frame) throw new Error('createStage: oyun çerçevesi bulunamadı');
  if (stages.has(frame)) return stages.get(frame);
  if (!frame.dataset.stageMode) frame.dataset.stageMode = 'layer';

  const layer = el('section', 'stage-layer is-offstage');
  layer.dataset.flow = 'overlay';
  layer.setAttribute('aria-live', 'polite');
  layer.inert = true;
  const card = el('div', 'flow-card stage-card');
  layer.append(card);
  const reopen = el('button', 'stage-reopen', 'Sonucu göster');
  reopen.type = 'button';
  reopen.hidden = true;
  frame.append(layer, reopen);

  let spec = null;
  const stageChildren = () => [...frame.children].filter(child => child !== layer && child !== reopen && !child.matches('[data-flow="overlay"]'));
  const setStageInert = value => { if (frame.dataset.stageMode === 'layer') stageChildren().forEach(child => { child.inert = value; }); };

  function render(options) {
    card.replaceChildren();
    card.dataset.kind = options.kind || 'result';
    if (options.kicker) card.append(el('p', 'stage-kicker', options.kicker));
    const titleRow = el('div', 'stage-title-row');
    titleRow.append(el('h2', 'stage-title', options.title || ''));
    if (options.record) titleRow.append(el('span', 'stage-record', 'Yeni rekor!'));
    card.append(titleRow);
    if (Number.isInteger(options.stars)) {
      const stars = el('p', 'stage-stars');
      stars.setAttribute('aria-label', `${options.stars} yıldız`);
      for (let i = 0; i < 3; i += 1) stars.append(el('span', i < options.stars ? 'on' : '', '★'));
      card.append(stars);
    }
    if (options.copy) card.append(el('p', 'stage-copy', options.copy));
    if (options.stats?.length) {
      const list = el('dl', 'stage-stats');
      for (const [label, value] of options.stats.slice(0, 6)) {
        const item = el('div');
        item.append(el('dt', '', label), el('dd', '', String(value)));
        list.append(item);
      }
      card.append(list);
    }
    if (options.extra) card.append(options.extra);
    const actions = el('div', 'stage-actions');
    const buttons = [...(options.actions || [])];
    if (options.dismissible) buttons.push({ label: 'Tahtaya bak', dismiss: true });
    for (const action of buttons) {
      const button = el('button', `play-button ${action.primary ? 'play-new' : 'play-undo'}`, action.label);
      button.type = 'button';
      if (action.id) button.id = action.id;
      button.addEventListener('click', () => {
        if (action.dismiss) { api.dismiss(); return; }
        action.onClick?.();
      });
      actions.append(button);
    }
    if (buttons.length) card.append(actions);
  }

  const api = {
    frame, layer, card,
    get visible() { return !layer.classList.contains('is-offstage'); },
    get spec() { return spec; },
    // Kartı gösterir (aynı kart açıkken tekrar çağrılırsa içeriği günceller).
    show(options) {
      spec = options;
      render(options);
      reopen.hidden = true;
      const wasHidden = layer.classList.contains('is-offstage');
      layer.classList.remove('is-offstage');
      layer.inert = false;
      setStageInert(true);
      // Odak: kullanıcı başka bir yerde (ör. arama kutusunda) yazıyorsa kart odağı çalmaz.
      const focused = document.activeElement;
      const panel = frame.closest('.play-panel');
      if (wasHidden && options.focus !== false && (!focused || focused === document.body || panel?.contains(focused))) {
        card.querySelector('.play-new, .play-button')?.focus({ preventScroll: true });
      }
    },
    hide() {
      spec = null;
      reopen.hidden = true;
      if (layer.contains(document.activeElement)) document.activeElement.blur();
      layer.classList.add('is-offstage');
      layer.inert = true;
      setStageInert(false);
    },
    // "Tahtaya bak": kart kapanır, köşedeki düğmeyle geri açılır.
    dismiss() {
      const last = spec;
      api.hide();
      if (last) { spec = last; reopen.hidden = false; }
    },
    showDemo() { api.show(DEMO); }
  };
  reopen.addEventListener('click', () => { if (spec) api.show(spec); });
  layer.addEventListener('keydown', event => {
    if (event.key === 'Escape' && spec?.dismissible) { event.stopPropagation(); api.dismiss(); }
  });
  stages.set(frame, api);
  current = api;
  if (window.OyunStage) window.OyunStage.current = api;
  return api;
}

// Menülü oyunlar: menü, oyun ve sonuç ekranları. Oyun ekranı hep sahnededir; menü ve sonuç onun üstünde açılır.
export function createFlow(screens, { stage = 'game' } = {}) {
  let active = null;
  const frame = screens[stage]?.parentElement;
  if (frame) frame.dataset.stageMode = 'flow';
  for (const [key, element] of Object.entries(screens)) {
    if (!element) continue;
    element.classList.remove('hidden');
    element.dataset.flow = key === stage ? 'stage' : 'overlay';
    // Katmanın içeriği tek bir kutuda durur; katmanın kendisi sahneyi kaplayan perdedir.
    if (key !== stage && !element.querySelector(':scope > .flow-card')) {
      const card = el('div', 'flow-card');
      card.append(...element.childNodes);
      element.append(card);
    }
  }
  const flow = {
    screens,
    get current() { return active; },
    show(name) {
      active = name;
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
  if (window.OyunStage) window.OyunStage.flow = flow;
  return flow;
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

// Modül olmayan (klasik) betikler ve denetim sayfası için.
window.OyunStage = { createStage, createFlow, get current() { return current; }, set current(value) { current = value; }, flow: window.OyunStage?.flow ?? null };
window.dispatchEvent(new Event('oyun-stage-ready'));
