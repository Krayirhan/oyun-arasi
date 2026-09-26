# Oyun Arası Firebase düzeni

Site yeni `oyun-arasi` Firebase projesini kullanır. Firestore Frankfurt (`europe-west3`) konumundadır. E-posta/şifre girişi ve `krayirhan.github.io` yetkili alan adı kullanılmalıdır. Firebase Hosting gerekmez; site GitHub Pages'te yayımlanır.

## Hesap ve oyun verileri

Her hesap `users/{uid}` belgesinde açılır. Hesap oluşturulurken `gameStats` içindeki bütün oyunlar sıfır başlangıç değerleriyle hazırlanır:

- `2048`: en iyi skor ve hedefe ulaşma.
- `harfane`: Günlük istatistikleri ve Sefer ilerlemesi. Antrenman kaydı cihazda kalır.
- `xox`: tur, X/O galibiyetleri ve beraberlikler.
- `hafiza`: klasik/geniş tahta süre ve hamle rekorları.
- `mayin-tarlasi`: kolay/orta/zor süre rekorları.
- `sudoku`, `kelime-avi`, `mahjong`: kolay/orta/zor süre rekorları.
- `tetris`: en iyi skor ve satır; `araba`: en iyi skor ve mesafe; `sekil`: en iyi skor.
- `soliter`: toplam galibiyet ve tek/üç kart rekorları.

Profilde ayrıca `library` alanı tutulur: `favorites` (en fazla 12 oyun kimliği), `favoritesUpdatedAt` ve `recent` (`{id, at}`, en fazla 12). Girişte cihazdaki favoriler ve son oynananlarla birleştirilir; favorilerde en son değiştirilen taraf kazanır.

Profil bir oturumda bir kez güncellenir; eski hesaplarda eksik olan oyunların başlangıç istatistikleri o sırada eklenir.

## Eşitleme

- Oyunlar önce cihazda kaydolur. Girişliyken değişiklik 5 saniye sonra, sürekli oynanıyorsa en geç 30 saniyede bir, sayfadan çıkarken ve bir tur ya da oyun kazanıldığında hemen buluta yazılır. Oyun belgesi tek yazmayla güncellenir; profil istatistiği yalnızca değiştiğinde yazılır.
- Çakışmada aktif oyun için en son değişen taraf kazanır (`clientUpdatedAt`); rekorlar her oyunun kendi birleştirme kuralıyla birleşir.
- Tur ve galibiyet sayaçları (`xox`, `soliter`, `2048`) her cihaz için ayrı tutulur (`deviceCounters`) ve profilde toplanır; böylece iki cihazda oynanan turlar kaybolmaz. Cihaz kimliği tarayıcıda `oyunarasi-device-id` anahtarındadır.
- Firestore iç içe dizileri saklayamadığı için bu tür alanlar `firestore-codec.js` ile `{ "__json": "..." }` biçiminde yazılır.

## Hesap işlemleri

- **Şifre sıfırlama:** giriş penceresindeki "Şifremi unuttum". Firebase'in varsayılan e-posta işlem sayfası kullanılır. Hesabın var olup olmadığı belli edilmez.
- **E-posta doğrulama:** kayıt sonrası otomatik gönderilir; hesap penceresinden yeniden gönderilebilir. Oynamayı engellemez.
- **Hesap silme:** hesap penceresindeki "Hesabımı sil". Şifreyle yeniden doğrulama ister; `users/{uid}` altındaki tüm oyun belgelerini, profili ve Firebase Auth kullanıcısını siler. Cihazdaki oyun kayıtları kalır.

Aktif oyun ve ayrıntılı kayıtlar `users/{uid}/games/{gameId}` belgelerinde tutulur. Platform oyunlarının kimlikleri `2048`, `xox`, `hafiza`, `mayin-tarlasi`, `sudoku`, `sekil`, `kelime-avi`, `tetris`, `soliter`, `mahjong` ve `araba`; Harfle'nin (`harfane`) günlük bulmacaları `daily-YYYY-MM-DD`, Sefer kaydı `series` kimliğini kullanır. Oyun belgesi ilk oyun kaydedildiğinde oluşur. Harfle Antrenman torbası cihazda kalır. Hesap açmak oyunları veya Firebase hesabını herkese açık yapmaz.

Her kullanıcı yalnızca kendi profilini ve oyun belgelerini okuyup değiştirebilir. `firestore.rules` bu erişimi tanımlar; herkese açık skor tablosu yoktur. Önceki `kelimeoyunharf` Firebase projesindeki kullanıcılar ve kayıtlar bu yeni projeye aktarılmaz. Yeni projede hesap açılmalıdır.

## Yayın ayarları

Web uygulamasının proje kimliği `firebase-config.js` içinde bulunur. API key dosyada tutulmaz; GitHub deposundaki **Settings → Secrets and variables → Actions → `FIREBASE_API_KEY`** secret'ına yeni `Oyun Arasi Web` uygulamasının API key değerini sen ekle. Pages dağıtımı bu secret'ı yayın sırasında yapılandırmaya ekler.

Firestore kuralları Pages dağıtımından bağımsızdır ve `.github/workflows/deploy-firestore-rules.yml` iş akışıyla otomatik yayımlanır: `firestore.rules` değişip `main` dalına geldiğinde Firebase Rules API kuralları derler ve yayımlar. Hatalı kural dosyası yayımlanmaz, iş kırmızı olur. İş, **Actions → Deploy Firestore rules → Run workflow** ile elle de çalıştırılabilir.

Bu iş akışı bir kez kurulum ister:

1. Firebase Console → Proje ayarları (⚙️) → **Hizmet hesapları** → **Yeni özel anahtar oluştur** ile bir JSON anahtar dosyası indir.
2. GitHub deposunda **Settings → Secrets and variables → Actions → New repository secret** aç; adı `FIREBASE_SERVICE_ACCOUNT`, değeri JSON dosyasının tüm içeriği olsun. Dosyayı sonra bilgisayarından sil; depoya ekleme.
3. **Actions → Deploy Firestore rules → Run workflow** ile ilk yayını başlat. İş izin hatası verirse Google Cloud Console → IAM bölümünde bu hizmet hesabına **Firebase Rules Admin** rolünü ekleyip tekrar çalıştır.

İş akışı önce `npm test` ile kural testlerini (Firestore emülatörü) ve oyun mantığı testlerini çalıştırır; testler kırmızıysa kurallar yayımlanmaz. Pull request'lerde yalnızca testler çalışır.

Secret yoksa yayın adımı hata vermeden atlanır ve uyarı bırakır; o durumda `firestore.rules` içeriğini Firebase Console → Firestore Database → Rules bölümüne yapıştırıp **Publish** ile yayımlamak gerekir.

**Kuralları elle `firebase deploy` ile yayımlama.** Eski bir yerel kopyanın canlıya çıkmasını önlemek için `firebase.json` içindeki `predeploy` adımı (`scripts/guard-rules-deploy.mjs`) önce `origin/main`'i çeker; yerel `firestore.rules` onunla birebir aynı değilse yayını durdurur. Tek doğru yol kuralı `main`'e göndermektir.

## App Check

App Check açıktır ve **reCAPTCHA Enterprise** sağlayıcısını kullanır. Gizli anahtar gerekmez.

- **Anahtar:** reCAPTCHA yönetim panelinde "Oyun Arası" (skora dayalı v3, Google Cloud projesi *Oyun Arasi*). Alan adları: `oyunarasi.site` ve `oyun-arasi.pages.dev`. Site anahtarı `firebase-config.js` → `appCheckSiteKey` alanındadır (herkese açık değer). Ayda 10.000 doğrulama ücretsizdir.
- **Firebase kaydı:** Console → App Check → Apps → *Oyun Arasi Web* → reCAPTCHA Enterprise (token süresi 1 saat).
- **Yerel geliştirme:** Anahtar localhost'a tanımlı olmadığı için App Check localhost'ta ve emülatörde başlatılmaz.
- **Zorunlu kılma:** App Check → APIs → Cloud Firestore metriklerinde birkaç gün doğrulanmış istek oranı izlenir. İsteklerin neredeyse tamamı "Verified" ise **Enforce** açılır. Zorunlu kılındıktan sonra App Check token'ı olmayan istemciler (eski önbellekli sayfalar, reklam engelleyicinin reCAPTCHA'yı kestiği tarayıcılar) buluta yazamaz; oyunlar cihazda kaydolmaya devam eder.

## Plan ve kota uyarısı

Proje Firebase **Spark** (ücretsiz) planındadır; bağlı fatura hesabı yoktur, ücret çıkmaz. Günlük ücretsiz sınır dolarsa (Firestore: 20.000 yazma, 50.000 okuma) bulut kayıtları o gün reddedilir, oyunlar cihazda kaydolmaya devam eder.

Sınıra yaklaşıldığını önceden bildirmek için Google Cloud Monitoring'de bir uyarı vardır:

- **Politika:** *Oyun Arası - günlük Firestore yazma kotası* (Cloud Console → Monitoring → Alerting). Metrik `firestore.googleapis.com/document/write_count`, 24 saatlik toplam (tüm yazma türleri birlikte) 15.000'i geçince tetiklenir.
- **Bildirim kanalı:** *Oyun Arası uyarıları* → `studioskrayirhan@gmail.com` (Monitoring → Alerting → Edit notification channels).
- Uyarı şu an ücretsizdir; Google, Cloud Monitoring uyarı koşullarını Eylül 2027'den itibaren ücretlendirmeyi planlıyor. O tarihte tekrar gözden geçirilmelidir.
- Okumalar için de istenirse aynı yolla ikinci bir uyarı (`document/read_count`, eşik 40.000) eklenebilir.

## Yerel geliştirme

```sh
npx firebase emulators:start --only auth,firestore --project oyun-arasi
```

Ardından siteyi yerel bir sunucuda açıp adrese `?emulator=1` ekle (ör. `http://localhost:5500/?emulator=1`). Sekme boyunca Auth ve Firestore emülatörlerine bağlanılır; canlı veriye dokunulmaz. Emülatör kapandıktan sonra Windows'ta 8080 portunu tutan bir Java süreci kalırsa kapatılması gerekir.
