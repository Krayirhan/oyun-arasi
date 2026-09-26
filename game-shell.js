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
  fullscreen.setAttribute('aria-label', 'Tam ekranı aç');
  fullscreen.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><path d="M8 8 3 3m13 5 5-5M8 16l-5 5m13-5 5 5"/></svg>';
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await panel.requestFullscreen();
    } catch { /* Fullscreen can be unavailable in embedded or restricted browsers. */ }
  });
  const updateFullscreen = () => {
    const active = document.fullscreenElement === panel;
    fullscreen.setAttribute('aria-label', active ? 'Tam ekrandan çık' : 'Tam ekranı aç');
    fullscreen.setAttribute('aria-pressed', String(active));
  };
  document.addEventListener('fullscreenchange', updateFullscreen);
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
