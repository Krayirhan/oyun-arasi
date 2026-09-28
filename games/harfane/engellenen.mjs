// Kelime oyunlarında (Harfle, Kelime Merdiveni) kabul edilmeyen, bulmacalara girmeyen kelimeler.
// Sözlük 5.381 kelimenin tamamı okunarak gözden geçirildi; küfür ve müstehcen kelimeler, hakaretler, ırkçı ifadeler,
// uyuşturucu, tuvalet ve intim vücut kelimeleri buraya alındı. Liste yalnızca sözlükte GERÇEKTEN olan kelimeleri
// içerir; yeni bir kelime eklenirse testler (games/harfane/logic.test.mjs) sözlükte kalıp kalmadığını denetler.

export const BLOCKED_WORDS = Object.freeze([
  // müstehcen, küfür, cinsellik
  'yarak', 'taşak', 'penis', 'penes', 'porno', 'seksi', 'vulva', 'sperm', 'dölek', 'dölüt', 'godoş', 'cicik', 'emcik',
  'himen', 'malak', 'kaşar', 'haspa', 'avrat', 'herif', 'nonoş', 'zenne', 'yosma', 'sekiş', 'fuhuş', 'kavat', 'iğdiş',
  'iğfal', 'zifaf', 'taciz', 'oynaş', 'sürre', 'sıçma', 'sıçan', 'sikke', 'fetiş', 'hayız', 'hitan',
  // intim vücut, tuvalet, hastalık kokan
  'makat', 'basur', 'bikir', 'bakir', 'hadım', 'hadim', 'kenef', 'işeme', 'sidik', 'ishal', 'kabız', 'kokuş', 'çişik',
  // hakaret, aşağılama
  'aptal', 'salak', 'ahmak', 'angut', 'enayi', 'denyo', 'debil', 'ebleh', 'hödük', 'hıyar', 'keriz', 'lavuk', 'gebeş',
  'alçak', 'arsız', 'pinti', 'şişko', 'yobaz', 'yalak', 'sefil', 'rezil', 'kaçık', 'sapık', 'azgın', 'ayyaş', 'abdal',
  'nadan', 'züppe', 'zıpır',
  // ırkçı ve aşağılayıcı ifadeler
  'çıfıt', 'kıpti', 'zenci', 'çigan', 'ırkçı',
  // küfür ve lanet
  'sövme', 'sövgü', 'sövüş', 'söven', 'küfür', 'lanet',
  // uyuşturucu, alkol, şiddet
  'eroin', 'esrar', 'haşiş', 'votka', 'viski', 'katil', 'terör',
  // ikinci tur ("en temiz" ölçütü): ölüm, şiddet, silah, savaş
  'ölmek', 'ölmez', 'ölmüş', 'ölgün', 'ceset', 'mezar', 'tabut', 'kefen', 'kabir', 'defin', 'silah', 'mermi', 'tüfek',
  'bomba', 'bombe', 'süngü', 'kılıç', 'mayın', 'savaş', 'kırım', 'kıyım', 'zulüm', 'gazap', 'yağma', 'çapul', 'kavga',
  'dayak', 'hücum', 'kurban', 'kısas', 'işgal', 'isyan', 'darbe', 'rehin', 'esire', 'zehir', 'afyon',
  // suç ve ceza
  'hapis', 'haciz', 'cürüm', 'cünha', 'cinai', 'suçlu', 'sanık', 'zanlı', 'mafya',
  // içki, kumar, tütün
  'alkol', 'şarap', 'likör', 'kumar', 'poker', 'bahis', 'rulet', 'tütün', 'sigar',
  // hastalık, kusur, vücut atıkları
  'ülser', 'siroz', 'verem', 'lepra', 'tifüs', 'tenya', 'tümör', 'kuduz', 'sıtma', 'kolik', 'kolit', 'fıtık', 'siğil',
  'çıban', 'bunak', 'topal', 'çolak', 'sakat', 'aksak', 'sağır', 'kusma', 'sümük', 'salya', 'idrar', 'ifraz', 'dışkı',
  // intim vücut, romantik-cinsel, üreme
  'göğüs', 'kalça', 'kasık', 'külot', 'uyluk', 'seviş', 'fetüs', 'ilkah', 'rahim', 'öpmek',
  // din ve mezhep, kutsal kelimeler
  'allah', 'iblis', 'ifrit', 'günah', 'haram', 'islam', 'hindu', 'alevi', 'sünni', 'dürzi', 'yezit', 'haçlı', 'cihat',
  'şehit', 'fetva', 'hutbe', 'haham', 'papaz', 'rahip', 'secde', 'namaz', 'ezani',
  // olumsuz sıfat ve karakter
  'cimri', 'hasis', 'zorba', 'zalim', 'fesat', 'fitne', 'ayyar', 'ukala', 'sinsi', 'gıcık', 'aylak', 'kelle', 'hayta',
  // üçüncü tur (tüm sözlük ikinci kez, en sıkı ölçütle okundu): müstehcen ve çağrışımı kötü olanlar
  'büzük', 'düdük', 'saçık', 'nipel', 'kuple', 'koket', 'korse', 'flört', 'harem', 'maşuk', 'masöz', 'masaj', 'geyşa', 'emcek',
  'emmek', 'emmeç', 'cıvık', 'cıbıl', 'kıllı', 'kazık', 'çükür', 'çopur', 'bücür', 'güdük', 'ödlek', 'rüküş', 'velet', 'ucube',
  'sefih', 'süfli', 'fasık', 'fahiş', 'hülle', 'namus', 'zorla', 'semen', 'oosit', 'domuz', 'esrik', 'işret', 'kinci', 'kinli',
  // ölüm, şiddet, hastalık çağrışımı
  'memat', 'mevta', 'vefat', 'helak', 'lahit', 'mumya', 'kanlı', 'gülle', 'harbe', 'harbi', 'dövüş', 'dövme', 'kötek', 'sille',
  'tokat', 'tiran', 'vahşi', 'zelil', 'muzır', 'meşum', 'melun', 'mapus', 'cunta', 'jilet', 'boğma', 'bitli', 'astım', 'anüri',
  'lipom', 'virüs', 'otist', 'köçek', 'havsa', 'ilenç', 'gasıp', 'kabza', 'faset',
  // din, mezhep, kutsal ve gizemcilik
  'cünüp', 'cünun', 'cizye', 'cinci', 'cinli', 'dinci', 'gasil', 'gusül', 'mesih', 'mehdi', 'mabut', 'mabet', 'müftü', 'mümin',
  'molla', 'tanrı', 'vahiy', 'yasin', 'zebur', 'sihir', 'vebal', 'boduç',
  // bulmaca kelimelerinin son taraması
  'cahil', 'hakir', 'tavaf', 'hatim', 'kopuk', 'kopek', 'hamil'
]);

export const isBlocked = word => BLOCKED_WORDS.includes(String(word || '').toLocaleLowerCase('tr-TR'));
