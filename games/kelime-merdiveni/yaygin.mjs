// Kelime Merdiveni bulmacalarının basamaklarında kullanılabilecek, herkesin tanıdığı yaygın 5 harfli kelimeler.
// Sözlük (games/harfane/kelimeler.js) çok geniştir ve `kadem`, `yalım` gibi az bilinen kelimeler içerir; oyuncu bunları
// yazabilir (sözlükte geçerlidir) ama üretilen bulmacaların çözüm yolu yalnızca bu listeden kurulur.
// Liste elle derlenmiştir; sözlükte olmayan bir kelime eklenirse test (logic.test.mjs) yakalar.

export const COMMON_WORDS = Object.freeze(`
acele acemi adres ahlak ahşap ajans akrep akşam aktif aktör alarm albay albüm alkış altın ambar ampul anlam anket anten araba arazi arena armut aroma arşiv asker aslan astar atlas atlet avize ayran aşağı aşama aşure aşırı
baget bahar bahçe balık balon balta bamya banka banyo baraj barış basit baskı bavul bayan bayat bebek bedel beden belge belki benek beyaz beyin bilek bilet bilgi bilim biber bıçak bıyık biçim bitki bilye boğaz bohça borsa boyun börek bulut buhar burun butik büyük bütün
cadde canlı cazip ceket cesur cevap ceviz cihaz ciğer
çadır çakıl çalar çalış çanta çatal çekiç çevre çeşit çeşme çiçek çilek çizgi çocuk çorap çorba çubuk çukur çünkü
dağlı daire dalga damak damla değer değil demir demet deniz derin dergi deste detay devam devre diken dilek direk doğal doğru dokuz dolap dolar dosya döner dönem dudak duman duvar duygu düğme düğün dünya düzen
ekmek ekran eksik elbet elmas emlak emzik engel erkek erken esmer eşarp evrak eylül
fayda fidan fikir final firma fırça fırın fitil fizik flama forma fosil
gazoz gelin genel geniş gölge gönül görev güneş güzel
haber hafif hafta hamam hamur hangi hasta havlu havuç havuz hayal hayat hazır hedef hemen hesap heves hoşaf hücre
iklim incir insan iplik irade istek işlem izmir
jeton
kabak kaban kablo kabuk kadın kahve kalem kalın kalıp kanal kanat kanun kapak karar karga karın kaset katır kavun kayak kayık kazak kazan kebap kekik kemik kemer kenar kendi kepçe kırık kısım kışla kibar kilim kilit kimse kimya kiraz kirli kitap klima konak konuk konum koyun köfte köken köpek köprü köpük kredi kulak kulüp kumaş kurak kural kurum kuşak kutup kuzen kuzey küçük külah külçe kürek kürsü
lamba layık lazım lider liman limon liste litre lokma lokum lodos
maden makas maket manav manto marka marul masal maske masum matem melek merak mesaj metal metin metre meyve mısır minik mimar model modem motor motif müzik
nabız nehir nokta nohut nöbet nükte
oğlak olgun omlet opera orman ortak otlak ödeme öğlen öksüz ölçek önder örgüt örnek özgür özlem
paket palto pamuk panda panik parça pasta patik pazar pedal pelin pembe pençe perde peron peruk petek pilav piliç pilot pınar piyon pizza plaka polis pompa poşet posta prens proje pudra
radar radyo rakam raket rakip randa rapor resim reçel robot roket roman
sabah sabun sahil sahne saksı salça salon saman sanat saray sayfa saygı sebze sedef sedir sefer selam sepet serin sergi servi sevgi sıcak sıfat sıfır sınav sınıf sınır sızma sofra soğan soğuk sokak solak somun sonuç sorun sosis soyut sözcü stres sucuk sumak susam süper sürat süreç sürme sütun
şarkı şehir şeker şekil şifre şimdi şoför şöyle şubat
tabak taban tablo tahta takım tamam tarak taraf tarih tarla tatil tatlı tavan tavla tavuk tayfa tekne temel tenis teras terzi teyze tilki tohum topuz torba tören tufan tuğla tulum turna turşu tuzak tuzlu tümce tünel türkü
 unvan uygun uzman ücret ünlem üstün
vagon vakit valiz vapur vatan video vurgu
yakın yalan yalın yamaç yanak yapım yarım yarın yasak yatak yavru yayın yazar yazın yedek yelek yemek yemin yeşil yılan yoğun yokuş yolcu yonca yorum yosun yumru yüzük yüzme
zaman zarar zarif zayıf zebra zemin zurna zafer
`.split(/\s+/).filter(Boolean));

// İkinci katman: yaygın kadar sık geçmese de ortalama bir yetişkinin tanıdığı ("iyi bilinen") kelimeler.
// Bulmacaların basamakları COMMON_WORDS ve WELL_KNOWN_WORDS'ten kurulur; ilki tercih edilir.
export const WELL_KNOWN_WORDS = Object.freeze(`
acaba açlık açmak açmaz adana afgan ahenk akmak alaca alaka aleni alıcı almak amele ampir anlık anmak anons antik antre arama arıza arife arşın artık artış asmak asılı aşkın atama atmak avans avara aydın aygıt aylık ayrım ayrık azılı azlık azmak
bacak bağış bağlı bakan bakım bakır bakış bakla balet bambu barak baret basım basın başak başka başta batık batıl batış bayır bazen bekçi belli bence bende beşik beter beton beyan besin beste bilge bilir bitiş bitim bloke bodur boran bordo boylu bozuk böcek bölge bölme bölük bölüm böyle bravo bronz buçuk bugün bulgu buluş burma buruk buzlu
cebir cephe cilve cisim civar coşku cümle cüret
çabuk çağrı çalgı çamur çanak çarşı çatık çekim çekme çelik çetin çevik çeyiz çıkar çıkış çınar çırak çizim çizme çoban çoğul çorak çözüm çürük
dahil daima dalış damar damat damga davar davet davul defne delik delta demek denek deney denge derbi derya desen devir deyim diğer dikey dikiş dilim disko divan diyet dizin doğum dolay dolgu dolma dorse doruk doyum drama durak durum duyum dümen dünkü düşük düşün düzey
ejder eklem eksen elips elyaf emici enkaz enlem erdem ergen erzak esnaf esnek estet evlat evren evrim eylem ezber
fakat falan fazla felek fener fetih fiyat figür filiz finiş fişek fıkra forum frank fular
garaj garip gayet gazel geçen geçiş geçit gedik gelir geniz gerek gergi gerçi giriş giyim giysi gizem gizli gonca göbek göçük gövde görüş gözlü güçlü güney güreş güven gürcü
hacim hakem hakim halat halka hamal hamle hamsi hanım harap hasar hasat hasım hasır hatır hatta hayır hayli hazin hazne hekim hemen hepsi heyet hırka hısım hızlı hicap hilal hindi hisse hitap hokey horoz höyük hudut hukuk humor hurma huzur hüküm hülya hüzün
ıslak ıslık ısrar ıssız
ibret icmal idare iddia ideal ifade iflas ihale ihbar ihlal ihmal ihraç ikili ikmal ikram iksir ilave ileri ilkel ilkin imdat imece insaf iptal irmik ironi israf istem ister itaat iyice izlem
japon joker
kabin kabul kaçak kaçış kadeh kadro kafes kahır kaide kakao kalas kalay kalfa  kamış kamus kanca kanıt kanka kanon kapan kaput kargo karlı karma karne karşı kasap kasım kasır kasko kaşık katar katkı katlı kaval kayıp kayıt kayma kaygı kayın kazma keder kefal kefil kefir keman kenet kesik kesim kesin kesit keşif keşke keten keyif kıble kıdem kılıf kılık kırık kırma kısık kısım  kısıt kısmi kıssa kışın kıvam kıyak kıyas kıyma kızak kızıl kibir kiler kireç kirpi kitle klips kobay kobra kolay kolej kollu kolon kolye komik komşu kombi konak konut korku koşul koyak kozak köhne köklü kömür körpe köylü krema kubbe kucak kukla kumaş kumru kurgu kurma kuruş kusur kuşku kutlu kuyum küflü külek kümes künye kürdi kütle kütük küvet
lağım lakap lakin lavaş lazer legal leğen lehçe levha leziz libas lifli liken limit lirik lisan lokal lonca lügat lütuf lüzum
macar macun madde maddi magma mahal mahir majör makam makro makul malta mango mantı marka martı masif maske masum mayıs mecaz medya melez melon memur menşe merci mesai mesel mevki mevzu meyil mezun midye mikro milli mimik minör miras misal mizah mobil moral motel muhit mutlu müdür mühim mühür müjde
nadir nakış nakit nasıl nazar nazik nebat neden nefes nefis nemli nesil nesne neyse nezle nicel niçin nimet ninni nisan nişan nitel niyet nizam noter nüfus nüans
oğlan okuma olmak olmaz olmuş onlar orada organ ortam ödünç ölçme ölçüm öneri önlem önlük ördek örgün örtük öteki övmek özgün özlük
pabuç pafta  panel parti pasaj pasif paslı payda peşin peder pense pikap pişme pişti piyes plato polen polip pomat porto prova pürüz
rabıt radyo rahat rampa ratıp rayiç recep redif refah rejim rekor rende resif ritim rozet rugan rumuz rutin rütbe
sabit sahip sahra sahte sakal sakız saklı salgı salma sanal sanki sarma satın satır satış sauna sayım sayın sebep seçim seçme sehpa sekiz sekme selef seans senet serap serçe serum sesli sevap sevda sever sezon sıkıt sığır sırça sırık sırma sıska sicil silgi silik simge simit sinek sinir sinüs siper siren sirke sitem sivil sivri siyah skala slayt soluk sonda sonra sorgu sorma sorum soylu söğüt sökük sönük sözde sözel sözlü statü steno sunum surat suret susuz süslü sütlü süzgü
şafak şahin şahit şaman şapka şaşma şayet şeref şerit şifon şilte şirin şişme şölen şurup şükür şüphe
tabii tabla tadım tahıl tahin takas taksi tanık tanım tanıt tarif tartı tatar tavır tekel teker tekil tekin tekme telaş telif telli temas temiz tempo tenha tepki tepsi terim terli tesir tesis testi tetik teyit tıbbi tıpkı tıraş tipik tiraj titiz toplu torna tortu tozlu törpü tövbe trafo trans tuhaf tutku tutum tuval tuzla tüylü tüzük
uçmak uğraş umumi unsur usanç utanç uyarı uygar uymak uysal uyuma
üçgen ünite üreme ürkek üslup üstat ütmek üzere üzeri üzgün üzmek
vahim vakıf vakum varış varil vasıf vekil verim vezir viraj vişne vites vücut
yaban yağış yağlı yahni yakıt  yamuk yangı yanık yanıt yankı yanlı yapış yapıt yarar yargı yarış yasal yaşam yaşlı yatay yatık yatır yavan yaver yayan yayla yaygı yazgı yazık yazım yeğen yenge yerel yerli yeter yetim yetki yığın yıkık yiğit yirmi yoksa yorum yudum yufka yulaf yular yumak yüklü yünlü yürek yürük yüzde yüzer yüzey yüzlü
zabıt zaten zihin zikir zirve ziyan zorlu zümre
`.split(/\s+/).filter(Boolean));

