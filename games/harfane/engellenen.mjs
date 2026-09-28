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
  'eroin', 'esrar', 'haşiş', 'votka', 'viski', 'katil', 'terör'
]);

export const isBlocked = word => BLOCKED_WORDS.includes(String(word || '').toLocaleLowerCase('tr-TR'));
