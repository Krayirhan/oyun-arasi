const library = document.querySelector('#library-grid');
const libraryCount = document.querySelector('#library-count');
const libraryEmpty = document.querySelector('#library-empty');

function renderTile(game) {
  const tile = document.createElement('a');
  tile.className = ['tile', game.size, game.soon && 'soon', !game.image && game.cover && `cover cover-${game.cover.name}`].filter(Boolean).join(' ');
  tile.href = game.href;
  tile.dataset.category = game.category;
  tile.dataset.search = `${game.title} ${game.search || ''}`;
  tile.dataset.title = game.title;
  tile.dataset.id = game.id;
  tile.setAttribute('aria-label', game.soon ? `${game.title} (yakında)` : game.title);

  if (game.image) {
    const img = document.createElement('img');
    img.src = game.image;
    img.alt = '';
    img.loading = 'lazy';
    tile.append(img);
  } else if (game.cover) {
    const label = document.createElement('b');
    label.innerHTML = game.cover.label;
    const cells = document.createElement('i');
    cells.setAttribute('aria-hidden', 'true');
    if (game.cover.cols) cells.style.setProperty('--cols', game.cover.cols);
    cells.append(...game.cover.cells.map((text, index) => {
      const span = Object.assign(document.createElement('span'), { textContent: text });
      if (game.cover.tones?.[index]) span.dataset.tone = game.cover.tones[index];
      return span;
    }));
    tile.append(label, cells);
  }

  const favoriteMark = document.createElement('span');
  favoriteMark.className = 'tile-fav';
  favoriteMark.setAttribute('aria-hidden', 'true');
  favoriteMark.textContent = '♥';
  tile.append(favoriteMark);

  const name = document.createElement('span');
  name.className = 'tile-name';
  name.textContent = game.title;
  tile.append(name);
  return tile;
}

library.append(...(window.OYUN_ARASI_GAMES || []).map(renderTile));

const shelfCards = [...document.querySelectorAll('.thumb')];
shelfCards.forEach(card => { card.dataset.id = card.getAttribute('href').match(/games\/([^/]+)\//)?.[1] || ''; });
const tiles = [...library.querySelectorAll('.tile')];
const games = window.OyunArasiLibrary;
const libraryTitle = document.querySelector('#library-title');
const libraryTitleText = libraryTitle.firstChild;
const shortcutLinks = [...document.querySelectorAll('[data-filter-link]')];
const SPECIAL = {
  fav: { title: 'Favorilerim', empty: 'Henüz favorin yok. Oyun sayfasındaki ♥ Favorilere ekle düğmesiyle ekleyebilirsin.' },
  recent: { title: 'Son Oynananlar', empty: 'Henüz bir oyun oynamadın. Bir oyun aç, burada görünsün.' }
};
const categoryButtons = [...document.querySelectorAll('.side-cat[data-filter]')];
const searchInput = document.querySelector('#game-search');
const emptyMessage = document.querySelector('#empty-search');
const track = document.querySelector('#game-shelf');
const toast = document.querySelector('#toast');

let selectedCategory = 'all';
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function libraryState() {
  const favorites = new Set(games?.favorites() || []);
  const recent = new Map((games?.recent() || []).map(entry => [entry.id, entry.at]));
  return { favorites, recent };
}

function filterCards(list, query, state, useSpecial = true) {
  let visibleCount = 0;
  const category = !useSpecial && SPECIAL[selectedCategory] ? 'all' : selectedCategory;
  for (const card of list) {
    const categories = card.dataset.category.split(' ');
    const matchesCategory = category === 'all'
      || (category === 'fav' ? state.favorites.has(card.dataset.id)
        : category === 'recent' ? state.recent.has(card.dataset.id)
          : categories.includes(category));
    const matchesSearch = !query || card.dataset.search.toLocaleLowerCase('tr-TR').includes(query);
    card.hidden = !matchesCategory || !matchesSearch;
    if (!card.hidden) visibleCount += 1;
  }
  return visibleCount;
}

// Karusel: önce son oynananlar (en yeni önce), sonra favoriler, sonra henüz oynanmamış oyunlar.
function personalizeShelf(state) {
  const rank = card => {
    const playedAt = state.recent.get(card.dataset.id);
    if (playedAt) return [0, -playedAt];
    if (state.favorites.has(card.dataset.id)) return [1, 0];
    return [2, 0];
  };
  const ordered = shelfCards
    .map((card, index) => ({ card, index, key: rank(card) }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.index - b.index);
  track.append(...ordered.map(({ card }) => card));
  for (const card of shelfCards) {
    let badge = card.querySelector('.thumb-badge');
    const played = state.recent.has(card.dataset.id);
    if (played && !badge) {
      badge = Object.assign(document.createElement('span'), { className: 'thumb-badge', textContent: 'Devam et' });
      card.append(badge);
    } else if (!played && badge) badge.remove();
  }
}

function updateCatalog() {
  const query = searchInput.value.trim().toLocaleLowerCase('tr-TR');
  const state = libraryState();
  personalizeShelf(state);

  const shelfCount = filterCards(shelfCards, query, state, false);
  emptyMessage.hidden = shelfCount > 0;
  track.hidden = shelfCount === 0;
  track.scrollLeft = 0;

  tiles.forEach(tile => tile.classList.toggle('is-fav', state.favorites.has(tile.dataset.id)));
  const ordered = selectedCategory === 'recent'
    ? [...tiles].sort((a, b) => (state.recent.get(b.dataset.id) || 0) - (state.recent.get(a.dataset.id) || 0))
    : tiles;
  library.append(...ordered);
  const special = SPECIAL[selectedCategory];
  libraryTitleText.textContent = special ? special.title : 'Tüm Oyunlar';
  libraryEmpty.textContent = special && !query ? special.empty : 'Bu aramayla eşleşen oyun bulamadık.';
  shortcutLinks.forEach(link => link.toggleAttribute('aria-current', link.dataset.filterLink === selectedCategory));

  const tileCount = filterCards(tiles, query, state);
  libraryEmpty.hidden = tileCount > 0;
  library.hidden = tileCount === 0;
  libraryCount.textContent = `${tileCount} oyun`;
}

function selectCategory(filter) {
  selectedCategory = filter;
  categoryButtons.forEach(button => {
    const active = button.dataset.filter === filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  updateCatalog();
}

categoryButtons.forEach(button => {
  button.setAttribute('aria-pressed', String(button.classList.contains('active')));
  button.addEventListener('click', () => {
    selectCategory(button.dataset.filter);
    document.querySelector('#oyunlar').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
});

document.querySelector('[data-show-all]').addEventListener('click', event => {
  event.preventDefault();
  searchInput.value = '';
  selectCategory('all');
  document.querySelector('#tum-oyunlar').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

searchInput.addEventListener('input', updateCatalog);

shortcutLinks.forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  const filter = link.dataset.filterLink;
  selectCategory(selectedCategory === filter ? 'all' : filter);
  document.querySelector('#tum-oyunlar').scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

// Hesaptan gelen favoriler ya da başka sekmede oynanan oyunlar ekrana yansısın.
window.addEventListener('oyunarasi-library-changed', updateCatalog);
window.addEventListener('storage', event => { if (event.key === 'oyunarasi-library-v1') updateCatalog(); });

document.querySelectorAll('[data-scroll]').forEach(button => {
  button.addEventListener('click', () => {
    track.scrollBy({ left: Number(button.dataset.scroll) * track.clientWidth * 0.6 });
  });
});

// Oyun sayfalarındaki arama kutusu ve konum bağlantıları buraya ?q=, ?ara ve ?kategori= ile gelir.
const params = new URLSearchParams(location.search);
const requestedCategory = params.get('kategori');
if (params.get('q')) searchInput.value = params.get('q');
if (requestedCategory && categoryButtons.some(button => button.dataset.filter === requestedCategory)) selectCategory(requestedCategory);
else updateCatalog();
if (params.get('q') || requestedCategory) {
  requestAnimationFrame(() => document.querySelector('#tum-oyunlar').scrollIntoView({ block: 'start' }));
}
if (params.has('ara')) window.addEventListener('load', () => searchInput.focus());

document.querySelector('[data-invite]').addEventListener('click', async event => {
  event.preventDefault();
  const data = { title: 'Oyun Arası', text: 'Gel birlikte oynayalım!', url: location.href.split('#')[0] };
  try {
    if (navigator.share) await navigator.share(data);
    else {
      await navigator.clipboard.writeText(data.url);
      showToast('Bağlantı kopyalandı, arkadaşına gönder!');
    }
  } catch {
    // Paylaşım penceresi kapatıldı.
  }
});
