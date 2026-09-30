<div align="center">

# 🎮 Oyun Arası

### Kısa molalar için mini oyunlar — tarayıcıda, kurulum ve reklam olmadan.

[![Oyna](https://img.shields.io/badge/Oyna-krayirhan.github.io%2Foyun--arasi-2C6326?style=for-the-badge)](https://krayirhan.github.io/oyun-arasi/)

![Vanilla JS](https://img.shields.io/badge/Vanilla%20JS-ES%20Modules-F7DF1E?logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=black)
![GitHub Pages](https://img.shields.io/badge/Hosting-GitHub%20Pages-222?logo=github)

<img src="assets/landing/hero-v2.webp" alt="Oyun Arası ana sayfa" width="720" />

</div>

---

**Oyun Arası**, 19 mini oyunu tek bir yerde toplayan statik bir oyun platformudur. Framework ve derleme adımı yoktur; saf HTML/CSS/JavaScript ile yazılmıştır ve GitHub Pages üzerinden yayımlanır. Oyunlar cihazda kaydolur; isteğe bağlı hesapla giriş yapınca ilerleme ve rekorlar Firebase ile cihazlar arasında eşitlenir.

👉 **[krayirhan.github.io/oyun-arasi](https://krayirhan.github.io/oyun-arasi/)**

## 🕹️ Oyunlar

| Kategori | Oyunlar |
|---|---|
| **Bulmaca** | 2048 · Sudoku (3 seviye, tek çözümlü) · Şekil Birleştir · Kelime Avı · Kelime Merdiveni · Harfle · Mayın Tarlası · Hafıza Kartları · Blok Düşür |
| **Klasik & kart** | Okey (botlara karşı) · Pişti · Solitaire (Klondike) · Mahjong · Tavla · Dört Taş · XOX |
| **Aksiyon** | Araba Yarışı · Balon Patlat · Zıpkın: Volkana Yolculuk (24 bölümlük platform oyunu) |

## ✨ Öne çıkanlar

- **Kurulumsuz:** Tarayıcıda açılır, masaüstü ve telefonda çalışır; tam ekran desteği tüm oyunlarda ortaktır.
- **Kayıtlar korunur:** Skorlar ve oyun durumu cihazda tutulur; giriş yapılırsa `users/{uid}/games/{gameId}` altında eşitlenir. Firebase yüklenemese bile oyun açılır.
- **Rekorlarım sayfası:** Her oyunun en iyi sonucu tek ekranda.
- **Favoriler ve son oynananlar:** Ana sayfada kişisel karusel ve filtreler.
- **Ortak oyun kabuğu:** Başlık, panel, tam ekran, onay diyalogları ve öneri kartları her oyunda aynı şablonla gelir.
- **Test edilmiş mantık:** Oyun kuralları `logic.js` dosyalarında ayrıdır ve Node test koşucusuyla doğrulanır; Firestore güvenlik kuralları emülatörde test edilir.

## 🚀 Yerelde çalıştırma

Modül importları kullanıldığı için dosyayı doğrudan açmak yerine basit bir statik sunucu kullan:

```bash
git clone https://github.com/Krayirhan/oyun-arasi.git
cd oyun-arasi
npx serve .
```

### Testler

Node 22+ gerekir; Firestore kural testleri için ayrıca Java 21+ gerekir.

```bash
npm install
npm run test:logic   # yalnızca oyun mantığı testleri (emülatörsüz)
npm test             # Firestore kural testleri + tüm oyun testleri
```

## 📁 Yapı

```
index.html, home.js, catalog.js   Ana sayfa ve oyun kataloğu
games/<oyun>/                     Her oyunun kendi klasörü (arayüz, logic.js, testler)
game-shell.js / play-page.css     Oyun sayfalarının ortak kabuğu
firebase-client.js, account.js    Hesap ve bulut eşitleme
firestore.rules                   Erişim kuralları (main'e gelince Actions ile yayımlanır)
rekorlarim/                       Rekorlarım sayfası
```

Yeni oyun ekleme, önbellek sürümü (`npm run bump`), tam ekran ve dağıtım ayrıntıları için: **[Geliştirici Rehberi](docs/GELISTIRICI-REHBERI.md)** · Firebase kurulumu için: [FIREBASE_SETUP.md](FIREBASE_SETUP.md).
