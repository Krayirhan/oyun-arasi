// Oyun Arası oyun kataloğu — "Tüm Oyunlar" ızgarası bu listeden çizilir.
// Yeni oyun eklemek için listeye bir satır ekle:
//   id        benzersiz kısa ad
//   title     oyunun görünen adı
//   tagline   oyun sayfalarındaki "Başka oyun dene" kartında başlığın altındaki kısa açıklama
//   href      oyun sayfası; oyun henüz hazır değilse soon: true ver (sayfası "Yakında" gösterir)
//   image     kapak görseli, assets/covers/ altında webp (kare; wide kutular 2:1) (varsa cover yerine gösterilir)
//   cover     styles.css içindeki cover-<ad> kapağı ve içindeki kareler;
//             color/text kapağın zemin ve yazı rengi; cols sütun sayısı; tones hücre renkleri
//             (g yeşil, y sarı, x gri, r kırmızı, b mavi, c camgöbeği, p mor, o turuncu,
//             n boş yuva, w beyaz, h beyaz üstüne kırmızı, j beyaz üstüne yeşil)
//   category  sol menü filtreleri: word, logic, classic, number
//   search    aramada eşleşecek ek kelimeler
//   size      big (2×2) veya wide (2×1); boş bırakılırsa tek kare
window.OYUN_ARASI_GAMES = [
  { id: 'harfane', tagline: 'Günlük kelime bulmacası', title: 'Harfle', href: 'games/harfane/', image: 'assets/covers/harfle.webp', cover: { name: 'harfane', color: '#14553f', text: '#fff', label: 'HARFLE', cells: ['H', 'A', 'R', 'F', 'L', 'E'], tones: ['g', 'g', 'y', 'g', 'x', 'g'] }, category: 'word', search: 'harfle harfane kelime günlük wordle türkçe', size: 'big' },
  { id: '2048', tagline: 'Sayıları birleştir', title: '2048', href: 'games/2048/', image: 'assets/covers/2048.webp', cover: { name: '2048', color: '#ffcd3c', label: '2048', cells: ['2', '4', '8', '16'] }, category: 'logic number classic', search: 'sayı birleştir' },
  { id: 'mayin-tarlasi', tagline: 'Dikkat ve mantık', title: 'Mayın Tarlası', href: 'games/mayin-tarlasi/', image: 'assets/covers/mayin-tarlasi.webp', cover: { name: 'mines', color: '#8fd3f4', label: 'MAYIN<br>TARLASI', cells: ['1', '1', '', '1', '✹', '1', '', '1', '1'] }, category: 'logic classic', search: 'minesweeper dikkat' },
  { id: 'hafiza', tagline: 'Eş kartları bul', title: 'Hafıza Kartları', href: 'games/hafiza/', image: 'assets/covers/hafiza.webp', cover: { name: 'memory', color: '#c9a4f2', label: 'HAFIZA<br>KARTLARI', cells: ['?', '★', '?', '★', '?', '?'] }, category: 'logic', search: 'eş bul' },
  { id: 'xox', tagline: 'İki kişilik klasik', title: 'XOX', href: 'games/xox/', image: 'assets/covers/xox.webp', cover: { name: 'xox', color: '#0a2fb5', text: '#fff', label: 'XOX', cells: ['×', '○', '', '○', '×', '', '', '', '×'] }, category: 'classic', search: 'üç taş arkadaş iki kişi tic tac toe' },
  { id: 'sudoku', tagline: 'Sayı bulmacası', href: 'games/sudoku/', title: 'Sudoku', image: 'assets/covers/sudoku.webp', cover: { name: 'sudoku', color: '#f7802f', label: 'SUDOKU', cells: ['5', '3', '', '6', '', '9', '', '8', '1'], tones: ['', '', '', '', 'y', '', '', '', ''] }, category: 'logic number', search: 'sayı' },
  { id: 'sekil', tagline: 'Parçaları yerleştir', href: 'games/sekil/', title: 'Şekil Birleştir', image: 'assets/covers/sekil.webp', cover: { name: 'sekil', color: '#ff7fa8', label: 'ŞEKİL<br>BİRLEŞTİR', cells: ['', '', '', '', '', '', '', '', ''], tones: ['o', 'o', 'n', 'o', 'g', 'g', 'b', 'b', 'g'] }, category: 'logic', search: 'blok' },
  { id: 'kelime-avi', tagline: 'Harflerden kelime', href: 'games/kelime-avi/', title: 'Kelime Avı', image: 'assets/covers/kelime-avi.webp', cover: { name: 'kelime', color: '#c2185b', text: '#fff', label: 'KELİME<br>AVI', cols: 4, cells: ['K', 'E', 'D', 'İ', 'A', 'R', 'U', 'T'], tones: ['y', 'y', 'y', 'y', '', '', '', ''] }, category: 'word', search: 'harf bulmaca kelime avı' },
  { id: 'tetris', tagline: 'Blokları diz', href: 'games/tetris/', title: 'Blok Düşür', image: 'assets/covers/blok-dusur.webp', cover: { name: 'tetris', color: '#5b2bb5', text: '#fff', label: 'BLOK<br>DÜŞÜR', cols: 4, cells: ['', '', '', '', '', '', '', '', '', '', '', ''], tones: ['n', 'p', 'n', 'c', 'p', 'p', 'p', 'c', 'o', 'r', 'r', 'c'] }, category: 'classic logic', search: 'blok düşür satır tetris' },
  { id: 'soliter', tagline: 'Kartları sırala', href: 'games/soliter/', title: 'Solitaire', image: 'assets/covers/soliter.webp', cover: { name: 'soliter', color: '#0f7a55', text: '#fff', label: 'SOLITAIRE', cells: ['A♥', 'K♠', 'Q♦'], tones: ['h', 'w', 'h'] }, category: 'classic', search: 'solitaire soliter kart klondike iskambil', size: 'wide' },
  { id: 'mahjong', tagline: 'Eş taşları bul', href: 'games/mahjong/', title: 'Mahjong', image: 'assets/covers/mahjong.webp', cover: { name: 'mahjong', color: '#d94f3d', text: '#fff', label: 'MAHJONG', cells: ['中', '發', '東', '東', '中', '發'], tones: ['h', 'j', 'w', 'w', 'h', 'j'] }, category: 'classic logic', search: 'taş eşleştir mahjong solitaire' },
  { id: 'araba', tagline: 'Engellerden kaç', href: 'games/araba/', title: 'Araba Yarışı', image: 'assets/covers/araba.webp', cover: { name: 'araba', color: '#3d4250', text: '#fff', label: 'ARABA<br>YARIŞI', cells: ['', '', '', '', '', '', '', '', ''], tones: ['y', 'n', 'n', 'n', 'n', 'b', 'n', 'r', 'n'] }, category: 'classic', search: 'yarış araba trafik' },
  { id: 'platform-macera', tagline: '30 bölümlük zıplama macerası', href: 'games/platform-macera/', title: 'Zıp Zıp', cover: { name: 'platform-macera', color: '#77c5e4', text: '#0d1b4c', label: 'ZIP ZIP', cells: ['↗', '★', '◆', '↗', '★', '🚪'], tones: ['b', 'y', 'c', 'g', 'o', 'y'] }, category: 'classic', search: 'platform zıpla macera koş koşu platformer' }
];
