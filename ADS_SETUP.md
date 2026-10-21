# Reklamları yönetme

## Yan reklamlar

Ana sayfa için `slots.homeLeft/homeRight`, oyunlar için `slots.gameLeft/gameRight` ayrı ayrı yönetilir. Her biri için ayrı bir 160×600 AdSense birimi kimliği girilir. Yerel önizlemede örnekleri görünür; canlı reklamlar varsayılan olarak kapalıdır. Yan alanlar yalnızca 1800 px ve üzerindeki ekranlarda gösterilir; dar ekranlarda alan ayırmaz ve reklam isteği göndermez. Sayfanın iki yanında ayrılmış şeritlerde bulunur, kaydırmayla hareket eder; sabit veya oyunun üzerine binen reklam değildir. Oyunla 150 px mesafe denetimi bunlara da uygulanır.

Varsayılan mod `off`: Google reklam/CMP betikleri yüklenmez, reklam alanı ayrılmaz. Yerelde `http://localhost:3000/?ads=preview` ve oyun URL'sine `?ads=preview` eklemek örnek alanları açar. Bu seçenek canlı alan adında çalışmaz.

## Tek ayar kaynağı

`ads-config.js` içindeki `mode`, `publisherId`, `cmpScriptUrl`, `liveHost` ve `slots.home/game` kullanılır. Kimlikler herkese açık yayıncı bilgileridir, gizli anahtar değildir. İki alanın AdSense kimlikleri boş bırakılmıştır. Mevcut yayıncı kimliği hesabın bilgi ekranından doğrulanmıştır; web AdSense başvurusu henüz tamamlanmamıştır.

Her alanda `enabled: false` yalnızca o alanı kapatır. `mode: 'off'` bütün reklamları kapatır. Ayar değişikliğinden sonra `npm run bump` ve `npm run test:static` çalıştırıp normal site yayını yapılır. Mevcut ziyaretçinin açık sayfası yeni ayarı sayfa yenilenince alır.

## İlk yayın ve AdSense

1. Gizlilik metnindeki işletmeci iletişim kanalını ve hesabın gerçek veri işleme uygulamalarını doğrulayarak tamamla. İşletmeci adı/e-posta uydurulmamıştır. Reklamları açmadan önce bu eksikliği gider.
2. AdSense başlangıç ekranında mevcut AdMob bağlantılı hesapla web AdSense başvurusunu tamamla. Sözleşme kabulünü hesap sahibi yapmalı. Site: `https://oyunarasi.site/`.
3. Kapalı moddaki altyapıyı normal GitHub Pages yayınıyla yayımla. Ana sayfadaki `google-adsense-account` meta etiketi ve `https://oyunarasi.site/ads.txt` gerçek yayıncı bilgilerini taşır. AdSense panelindeki doğrulama bilgileriyle eşleştir. Cloudflare'ın Google taramasını engellemediğini kontrol et. İnceleme iste.
4. Site 'Hazır' olunca iki manuel görüntülü reklam birimi oluştur. Otomatik reklamları kapat. Alanların sayısal kimliklerini `slots.home.id` ve `slots.game.id` içine yaz.
5. AdSense Gizlilik ve mesajlaşma bölümünde sertifikalı Google mesajını yayımla, reklam amaçları için consent mode desteğini etkinleştir. Google'ın verdiği bağımsız Privacy & messaging etiketinin `fundingchoicesmessages.google.com/i/` adresini `cmpScriptUrl` içine kopyala. Rastgele bir URL tahmin etme. Panel yalnızca AdSense etiketini öneriyorsa bağımsız etiket seçeneğini doğrulamadan canlıya geçme: izin için reklam betiğinin yüklenmesine dayanan döngü kurulmamalıdır.
6. Bu ilk sürüm ad_storage, ad_user_data ve ad_personalization amaçlarının tamamında izin veya uygulanamaz durumu bekler. Ret, belirsiz ve yapılandırılmamış durumlarda reklam göstermez; kişiselleştirilmemiş/sınırlı reklam alternatifi yoktur. Google tercihleriyle ayrıca reklam izni saklanmaz.
7. Önce `slots.game.enabled: false` ile `mode: 'live'` yap. Gerçek alan adında CMP kabul/ret/geri çekme davranışını ve bir reklam isteğini kontrol et. Reklama tıklama. Ardından oyun alanını etkinleştir.

## Kontrol ve sınırlar

Reklamlar görünmeye 300 px yaklaşınca yüklenir; mesafe ve tam ekran durumu istekten hemen önce tekrar kontrol edilir. Yenileme zamanlayıcısı ve otomatik hata tekrarı yoktur. Boş reklam yanıtında yer korunur. İzin geri çekilirse mevcut içerik kaldırılır; yeni reklam istenmez. Yeniden izin sonrası reklam için sayfa yenilenir.

320, 390, 768, 1366 ve 1920 px genişliklerde ana sayfa ve oyun önizlemesini kontrol et. Giriş, kayıtlar, dokunmatik kontroller, tam ekran, ağ hatası ve reklam engelleyici davranışını denetle. Gelir/gösterim takibi AdSense panelindedir; bu altyapı ek analitik toplamaz.

Başvuru, inceleme, mesaj yayımlama, gerçek reklam alanı kimlikleri ve üretim kabul/ret kontrolü tamamlanmadan canlı reklam açılmaz. Kod teslimi Google onayı veya site yayını anlamına gelmez.

Resmî kaynaklar: https://developers.google.com/funding-choices/fc-api-docs ve https://support.google.com/adsense/answer/6023158?hl=tr
