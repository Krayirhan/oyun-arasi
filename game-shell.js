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
