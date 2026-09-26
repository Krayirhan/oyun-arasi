# Oyun Arası

Mini oyunları tek bir yerde toplayan, statik olarak GitHub Pages'te yayımlanan oyun kataloğu.

## Klasör yapısı

- `index.html`, `styles.css`, `home.js`: platformun ana sayfası, oyun kataloğu, arama ve kategori filtreleri.
- `catalog.js`: ana sayfadaki "Tüm Oyunlar" ızgarasını ve oyun sayfalarındaki "Diğer oyunlar" şeridini besleyen oyun listesi.
- `game-shell.css`, `game-shell.js`: oyun sayfalarının ortak üst alanını, logo ve hesap görünümünü, oyun başlığı/durum/tam ekran araçlarını, kategori ve öneri kartlarını, ayrıca alt bilgi sekmelerini üretir. Menüdeki arama ana sayfaya `?q=` ile, konum bağlantıları `?kategori=` ile gider.
- `assets/landing/`: ana sayfadaki hero, kart ve oyun kapağı görselleri.
- `play-page.css`: oyun sayfalarının ortak görsel şablonu. Masaüstünde üç sütun (oyun tanıtımı ve kontroller · oyun alanı · hedef ve öneriler), tablette uyarlanmış ızgara, telefonda oyun alanı önce gelecek şekilde tek sütun.
- `games/2048/`: 2048 oyununun arayüzü, kuralları ve cihaz/bulut kayıtları.
- `games/sudoku/`: Kolay, Orta ve Zor seviyeli, her seferinde tek çözümlü yeni bulmaca üreten Sudoku; not modu, geri alma, ipucu ve seviye rekorları.
- `games/sekil/`: Şekil Birleştir; 8×8 tahtaya üçer parça yerleştirilir, dolan satır ve sütunlar temizlenir.
- `games/kelime-avi/`: Kelime Avı; 12 temadan kelimeler 8×8, 10×10 ya da 12×12 harf tablosuna gizlenir, oyuncu çizerek bulur.
- `games/tetris/`: Blok Düşür (düşen blok oyunu; klasör ve kayıt kimliği `tetris` olarak kaldı); 7'li torba, döndürme ve duvar tekmeleri, gölge parça, tutma, sıradaki 3 parça ve her 10 satırda hızlanma.
- `games/soliter/`: Solitaire (Klondike; klasör ve kayıt kimliği `soliter`); 1 ya da 3 kart çekiş, sürükle-bırak ve dokununca otomatik taşıma, geri alma ve otomatik bitirme.
- `games/mahjong/`: Mahjong (eşleştirmeli solitaire); 46, 102 ve 144 taşlık üç dizilim, her zaman çözülebilir dağıtım, ipucu, karıştırma ve geri alma.
- `games/araba/`: Araba Yarışı; 4 şeritli sonsuz yol, hızlanan trafik (her dalgada geçilebilir bir şerit açık kalır), jetonlar ve skor rekoru.
- `games/harfane/`: Harfle oyununun arayüzü, oyun mantığı ve kelime listeleri.
- `games/xox/`: Aynı cihazda iki kişilik XOX ve skor kaydı.
- `games/hafiza/`: 4×4 ve 6×6 Hafıza Kartları, rekorlar ve oturum kaydı.
- `games/mayin-tarlasi/`: Üç zorluk seviyeli Mayın Tarlası ve oyun/rekor kaydı.
- `firebase-client.js`, `account.js`, `account.css`: ortak hesap, Firebase bağlantısı ve oyun ilerlemesi eşitlemesi.
- `library.js`: favoriler ve son oynanan oyunlar (cihazda; girişliyse profildeki `library` alanıyla eşitlenir). Oyun sayfalarında ♥ düğmesi ve son oynanan kaydı `game-shell.js`'te, ana sayfadaki Favorilerim / Son Oynananlar filtreleri ve kişisel karusel `home.js`'tedir.
- `rekorlarim/`: Rekorlarım sayfası; her oyunun cihazdaki ve (girişliyse) hesaptaki en iyi sonuçlarını birleştirerek gösterir.
- `firestore-codec.js`: Firestore'un saklayamadığı iç içe dizileri (ör. 2048 tahtası) kayıt sırasında metne çevirir.
- `cloud-sync.js`: oyunların Firebase'i sonradan yüklediği ara katman. Oyunlar `firebase-client.js` yerine bunu içe aktarır; Firebase yüklenemezse oyun yine açılır ve cihazda kaydolur.
- `firebase-config.js`, `firestore.rules`, `firebase.json`: Oyun Arası Firebase yapılandırması ve erişim kuralları. `firestore.rules` `main` dalına gelince `.github/workflows/deploy-firestore-rules.yml` ile otomatik yayımlanır (kurulum: `FIREBASE_SETUP.md`).

Yeni bir oyun, kendine ait `games/<oyun-adi>/` klasöründe tutulur. Sayfası için mevcut bir oyun sayfası (örneğin `games/sudoku/index.html`) kopyalanır; oyun henüz hazır değilse panel yerine `.soon-stage` "Yakında" bölümü konur ve `catalog.js` satırına `soon: true` eklenir. Oyun hazır olunca `.soon-stage` bölümü oyun paneliyle (`.play-bar`, `.play-options`, `.board-frame`, `.status`) değiştirilir, `styles.css` ve `script.js` eklenir ve `catalog.js` satırındaki `soon: true` kaldırılır. Yeni oyunlar masaüstü üç sütunlu `.play-layout` ortak ızgarasını ve `.play-intro`, `.how-card`, `.shortcuts`, `.play-panel`, `.goal-card`, `.more-card` bölgelerini kullanır; ortak betik kategori rozetini, panel araçlarını ve Oyun hakkında/Kontroller/Benzer oyunlar sekmelerini katalog ve sayfa metaverisinden hazırlar. Oyuna özgü tahta stilleri kendi `styles.css` dosyasında kalır. Oyun ve `catalog.js` listesine bir satır olarak eklenir. Oyun sayfası ortak `game-shell.css` ve `play-page.css` stillerini, `<body class="game-page" data-game="<oyun-adi>">` kimliğini ve `game-shell.js` davranışlarını kullanır; vurgu rengi `game-shell.css` içinde tanımlanır. "Tüm Oyunlar" ızgarası, arama ve kategori filtreleri katalogdan otomatik çalışır. Oyunlar cihazda kaydolur; giriş yapıldığında desteklenen oyun ilerlemesi `users/{uid}/games/{gameId}` altında eşitlenir. Yeni hesap profili bütün oyunlar için sıfır başlangıç istatistikleriyle açılır. Harfle Antrenman torbası cihazda kalır; Harfle’nin mod seçimi ve özel oyun ekranı da aynı ortak üst alanı, yönerge ve öneri kartlarını kullanır.

Yeni tahtalar kapsayıcılarının kullanılabilir genişlik ve yüksekliğine göre ölçeklenir; kare tahtalar kare oranını korur. Kısa ekranlarda oyun alanı önceliklidir, yan ve alt bilgiler sayfa kaydırmasıyla erişilebilir kalır. Yeni oyunlar 320×640, 390×844, 768×1024, 1024×768, 1366×768 ve 1920×1080 görünümlerinde yatay taşma ve erişilemeyen kontrol açısından doğrulanır.

Yeni oyunların bağımsız kuralları `logic.js` dosyalarında tutulur. Oyun klasörlerindeki küçük modül tanımları tarayıcı importlarını ve Node.js testlerini aynı biçimde çalıştırır.

Testler kökteki geliştirme bağımlılıklarıyla çalışır (Node 22+ ve Firestore emülatörü için Java 21+ gerekir):

```sh
npm install
npm test          # Firestore kural testleri (emülatörde) + tüm oyun mantığı testleri
npm run test:logic  # yalnızca oyun mantığı testleri, emülatörsüz
```

**Önbellek sürümü:** Cloudflare JS/CSS dosyalarını saatlerce önbellekte tutar. Bir JS ya da CSS dosyası değiştiğinde `npm run bump` çalıştırılır; tüm yerel referanslara yeni ve ortak bir `?v=` sürümü yazılır. `tests/asset-versions.test.mjs` eksik ya da farklı sürümde CI'ı kırmızıya çevirir.

`firestore.rules` yalnızca GitHub Actions ile yayımlanır: `main`'e gelen değişiklikte önce testler çalışır, geçerse kurallar yayına alınır. Elle `firebase deploy` yapılırsa `scripts/guard-rules-deploy.mjs` yerel kural dosyası `origin/main` ile aynı değilse yayını durdurur. Ayrıntılar: `FIREBASE_SETUP.md`.
