// Zıp Zıp: authored platform layouts in a shared 960 × 540 world grid.
// Platforms, hazards and pickups are plain data so the level set can be checked without a browser.
const floor = (x, w) => ({ x, y: 478, w, h: 62, kind: 'ground' });
const ledge = (x, y, w, h = 18, extra = {}) => ({ x, y, w, h, kind: 'platform', ...extra });
const mover = (x, y, w, dx, dy = 0, speed = 0.7) => ({ x, y, w, h: 18, kind: 'moving', dx, dy, speed, phase: (x % 120) / 120 });
const spikes = (x, w, y = 458) => ({ x, y, w, h: 20, kind: 'spikes' });
const saw = (x, y, r = 20) => ({ x, y, w: r * 2, h: r * 2, kind: 'saw', phase: x / 100 });
const gem = (x, y) => ({ x, y, kind: 'crystal' });
const walker = (x, y = 448, range = 90) => ({ x, y, kind: 'walker', minX: x - range, maxX: x + range, speed: 44 });
const flyer = (x, y, range = 54) => ({ x, y, kind: 'flyer', minY: y - range, maxY: y + range, speed: 34 });
const pickup = (x, y, kind) => ({ x, y, kind });
const checkpoint = (x, y = 430) => ({ x, y });
const key = (x, y = 430) => ({ x, y });
const door = (x, y = 398) => ({ x, y, w: 34, h: 80 });
const exit = (x, y = 398) => ({ x, y, w: 34, h: 80 });

function level(number, world, title, width, platforms, hazards, crystals, enemies, extras = {}) {
  const pits = [...(extras.pits || [])].sort((a, b) => a.x - b.x);
  const floors = [];
  let floorStart = 0;
  pits.forEach(pit => {
    if (pit.x > floorStart) floors.push(floor(floorStart, pit.x - floorStart));
    floorStart = Math.max(floorStart, pit.x + pit.w);
  });
  if (floorStart < width) floors.push(floor(floorStart, width - floorStart));
  return {
    number, world, title, width, height: 540,
    spawn: { x: 48, y: 420 },
    exit: exit(width - 74),
    platforms: [...floors, ...platforms],
    hazards, crystals, enemies,
    checkpoint: checkpoint(Math.round(width * 0.52)),
    targetSeconds: 38 + Math.ceil(width / 110),
    starScore: 560 + Math.ceil(width / 100) * 20,
    ...extras
  };
}

export const LEVELS = [
  level(1, 0, 'Orman yolu', 960, [ledge(250, 408, 150), ledge(520, 360, 130)], [], [gem(260, 370), gem(560, 322), gem(800, 430)], [], { targetSeconds: 28, starScore: 650 }),
  level(2, 0, 'İlk sıçrayış', 960, [ledge(270, 402, 140), ledge(520, 390, 150)], [spikes(370, 74)], [gem(300, 360), gem(555, 348), gem(770, 430)], [], { pits: [{ x: 352, w: 110 }], targetSeconds: 35 }),
  level(3, 0, 'Yukarı patika', 1120, [ledge(170, 416, 120), ledge(330, 360, 115), ledge(500, 310, 115), ledge(700, 360, 160)], [], [gem(195, 376), gem(365, 320), gem(740, 320)], [], { pits: [{ x: 435, w: 100 }], targetSeconds: 44 }),
  level(4, 0, 'Sallanan dal', 1120, [ledge(180, 400, 140), mover(390, 360, 128, 140, 0, 0.6), ledge(680, 340, 160)], [], [gem(210, 360), gem(440, 320), gem(720, 300)], [], { pits: [{ x: 340, w: 330 }], targetSeconds: 46 }),
  level(5, 0, 'Meraklı mantar', 1120, [ledge(280, 390, 120), ledge(650, 360, 140)], [], [gem(300, 350), gem(690, 320), gem(900, 430)], [walker(470, 448, 70)], { targetSeconds: 46 }),
  level(6, 0, 'Dikenli çalılık', 1200, [ledge(210, 388, 145), ledge(480, 350, 135), ledge(760, 390, 150)], [spikes(330, 100), spikes(610, 96)], [gem(245, 348), gem(520, 310), gem(810, 350)], [walker(900, 448, 50)], { targetSeconds: 50 }),
  level(7, 0, 'Kayıp anahtar', 1200, [ledge(230, 400, 150), ledge(500, 350, 150), ledge(820, 400, 160)], [spikes(385, 75)], [gem(270, 360), gem(540, 310), gem(860, 360)], [walker(700, 448, 54)], { key: key(570, 310), door: door(1080), targetSeconds: 52 }),
  level(8, 0, 'Koruyucu ışık', 1280, [ledge(210, 390, 150), ledge(510, 340, 150), mover(800, 370, 130, 110)], [spikes(365, 100)], [gem(240, 350), gem(560, 300), gem(850, 330)], [walker(660, 448, 56)], { powerups: [pickup(520, 300, 'shield')], targetSeconds: 54 }),
  level(9, 0, 'Rüzgârlı köprü', 1360, [ledge(220, 400, 130), mover(430, 355, 130, 120, -18), ledge(710, 330, 130), ledge(1010, 385, 160)], [spikes(350, 75), spikes(850, 90)], [gem(248, 360), gem(760, 290), gem(1050, 345)], [walker(620, 448, 55)], { pits: [{ x: 340, w: 180 }, { x: 820, w: 155 }], powerups: [pickup(740, 290, 'extraJump')], targetSeconds: 59 }),
  level(10, 0, 'Ormanın kapısı', 1520, [ledge(190, 405, 150), mover(420, 360, 130, 120), ledge(700, 340, 155), mover(980, 360, 130, 130), ledge(1230, 395, 150)], [spikes(345, 65), saw(800, 420, 19), spikes(1120, 80)], [gem(235, 365), gem(740, 300), gem(1270, 355)], [walker(600, 448, 65), flyer(1080, 330, 30)], { key: key(750, 300), door: door(1430), powerups: [pickup(1000, 320, 'shield')], targetSeconds: 72, starScore: 820 }),

  level(11, 1, 'Dişli bahçesi', 960, [ledge(220, 390, 150), ledge(560, 360, 150)], [saw(420, 438, 20)], [gem(250, 350), gem(600, 320), gem(820, 430)], [], { targetSeconds: 40 }),
  level(12, 1, 'Saatli geçit', 1120, [ledge(170, 400, 120), mover(360, 355, 130, 120), ledge(650, 350, 135), ledge(880, 390, 130)], [saw(545, 410, 18)], [gem(192, 360), gem(690, 310), gem(925, 350)], [], { pits: [{ x: 290, w: 360 }], targetSeconds: 48 }),
  level(13, 1, 'Uçan nöbetçi', 1120, [ledge(250, 390, 150), ledge(590, 340, 150), mover(850, 380, 120, 95)], [], [gem(280, 350), gem(630, 300), gem(890, 340)], [flyer(470, 350, 36)], { targetSeconds: 48 }),
  level(14, 1, 'Akrebin kolları', 1200, [mover(210, 410, 125, 0, -75), mover(440, 350, 125, 0, 70), mover(680, 400, 130, 0, -75), ledge(930, 350, 150)], [saw(570, 430, 18)], [gem(238, 365), gem(710, 350), gem(970, 310)], [], { targetSeconds: 54 }),
  level(15, 1, 'Kurmalı anahtar', 1280, [ledge(180, 400, 140), mover(430, 350, 125, 115), ledge(710, 330, 150), ledge(990, 390, 150)], [saw(620, 425, 18), spikes(850, 75)], [gem(205, 360), gem(750, 290), gem(1030, 350)], [flyer(560, 300, 35)], { key: key(740, 290), door: door(1190), targetSeconds: 58 }),
  level(16, 1, 'Zaman yarışı', 1200, [ledge(200, 395, 130), mover(425, 350, 120, 135), ledge(700, 365, 145), ledge(940, 390, 140)], [saw(575, 430, 18)], [gem(220, 355), gem(735, 325), gem(970, 350)], [walker(810, 448, 50)], { powerups: [pickup(720, 325, 'speed')], targetSeconds: 48 }),
  level(17, 1, 'Üç kollu saat', 1360, [ledge(180, 405, 145), mover(420, 360, 125, 110), ledge(690, 315, 140), mover(930, 365, 125, 105), ledge(1160, 390, 130)], [spikes(335, 70), saw(795, 420, 18)], [gem(205, 365), gem(720, 275), gem(1190, 350)], [walker(600, 448, 48), flyer(1050, 310, 30)], { key: key(720, 275), door: door(1290), targetSeconds: 65 }),
  level(18, 1, 'Dönen koridor', 1360, [ledge(170, 400, 145), ledge(420, 345, 145), mover(690, 375, 125, 100), ledge(940, 340, 150), ledge(1160, 390, 130)], [saw(350, 425, 18), saw(850, 420, 18), spikes(1080, 70)], [gem(200, 360), gem(720, 335), gem(970, 300)], [flyer(580, 290, 32)], { targetSeconds: 65 }),
  level(19, 1, 'Yüksek yıldız', 1440, [ledge(180, 405, 150), mover(420, 365, 130, 110), ledge(680, 335, 150), mover(920, 370, 125, 110), ledge(1170, 390, 150)], [saw(790, 430, 18)], [gem(210, 365), gem(720, 260), gem(1210, 350)], [walker(570, 448, 55), flyer(1050, 310, 30)], { powerups: [pickup(700, 285, 'extraJump')], targetSeconds: 68 }),
  level(20, 1, 'Büyük saat', 1600, [ledge(170, 405, 135), mover(400, 365, 120, 115), ledge(650, 340, 145), mover(900, 370, 125, 120), ledge(1150, 330, 150), ledge(1390, 395, 130)], [saw(560, 420, 18), saw(1050, 420, 18), spikes(1300, 80)], [gem(195, 365), gem(680, 300), gem(1420, 355)], [walker(780, 448, 55), flyer(1210, 285, 30)], { key: key(680, 300), door: door(1510), powerups: [pickup(1160, 290, 'shield')], targetSeconds: 78, starScore: 920 }),

  level(21, 2, 'Sıcak kıyı', 960, [ledge(190, 400, 135), ledge(420, 360, 130), ledge(660, 400, 140)], [{ x: 320, y: 470, w: 110, h: 70, kind: 'lava' }], [gem(220, 360), gem(465, 320), gem(710, 360)], [], { pits: [{ x: 310, w: 135 }], targetSeconds: 42 }),
  level(22, 2, 'Ateş püskürmesi', 1120, [ledge(170, 400, 135), ledge(420, 365, 130), ledge(680, 390, 135), ledge(930, 400, 130)], [{ x: 320, y: 460, w: 72, h: 80, kind: 'geyser', period: 3, active: 1.15, phase: 0.4 }, { x: 820, y: 460, w: 70, h: 80, kind: 'lava' }], [gem(200, 360), gem(460, 325), gem(965, 360)], [walker(720, 448, 45)], { targetSeconds: 48 }),
  level(23, 2, 'Kızıl yükseliş', 1200, [mover(190, 410, 130, 0, -65), mover(430, 350, 130, 0, 65), ledge(700, 370, 135), mover(930, 350, 130, 100)], [{ x: 670, y: 465, w: 180, h: 75, kind: 'lava' }], [gem(220, 365), gem(730, 330), gem(965, 310)], [flyer(560, 300, 30)], { targetSeconds: 56 }),
  level(24, 2, 'Lav anahtarı', 1280, [ledge(170, 400, 130), mover(400, 360, 125, 105), ledge(670, 340, 145), ledge(930, 385, 140), ledge(1110, 400, 120)], [{ x: 305, y: 465, w: 88, h: 75, kind: 'lava' }, { x: 820, y: 465, w: 90, h: 75, kind: 'geyser', period: 3.4, active: 1.2, phase: 1 }], [gem(195, 360), gem(700, 300), gem(1140, 360)], [walker(1010, 448, 48)], { key: key(700, 300), door: door(1200), targetSeconds: 58 }),
  level(25, 2, 'Kalkanlı geçiş', 1360, [ledge(180, 400, 140), mover(420, 355, 130, 110), ledge(690, 330, 145), mover(950, 370, 130, 110), ledge(1180, 395, 130)], [{ x: 340, y: 465, w: 70, h: 75, kind: 'lava' }, { x: 840, y: 465, w: 90, h: 75, kind: 'geyser', period: 3.1, active: 1.1, phase: 0.8 }], [gem(205, 360), gem(720, 290), gem(1210, 355)], [flyer(580, 300, 32)], { powerups: [pickup(720, 290, 'shield'), pickup(980, 330, 'speed')], targetSeconds: 62 }),
  level(26, 2, 'Üç yetenek', 1360, [ledge(180, 400, 150), mover(450, 360, 135, 115), ledge(735, 320, 150), mover(1000, 370, 135, 115), ledge(1220, 395, 120)], [{ x: 345, y: 465, w: 88, h: 75, kind: 'lava' }, { x: 850, y: 465, w: 88, h: 75, kind: 'lava' }], [gem(215, 360), gem(765, 280), gem(1250, 355)], [walker(650, 448, 45), flyer(1080, 300, 32)], { targetSeconds: 62 }),
  level(27, 2, 'Kapının nöbetçisi', 1440, [ledge(180, 405, 135), mover(410, 360, 125, 105), ledge(690, 330, 140), mover(940, 365, 125, 110), ledge(1180, 395, 150)], [{ x: 330, y: 465, w: 75, h: 75, kind: 'lava' }, { x: 850, y: 465, w: 75, h: 75, kind: 'geyser', period: 2.8, active: 1.1, phase: 0.3 }], [gem(205, 365), gem(720, 290), gem(1220, 355)], [walker(570, 448, 55), flyer(1040, 290, 34)], { key: key(720, 290), door: door(1360), targetSeconds: 68 }),
  level(28, 2, 'Kristal rotası', 1520, [ledge(170, 405, 150), mover(410, 365, 130, 110), ledge(690, 330, 150), mover(950, 370, 130, 110), ledge(1210, 340, 150), ledge(1380, 395, 100)], [{ x: 340, y: 465, w: 75, h: 75, kind: 'lava' }, { x: 800, y: 465, w: 100, h: 75, kind: 'lava' }, { x: 1120, y: 465, w: 70, h: 75, kind: 'geyser', period: 3, active: 1, phase: 1 }], [gem(200, 365), gem(760, 260), gem(1270, 295)], [flyer(580, 300, 32), walker(1020, 448, 50)], { powerups: [pickup(720, 290, 'extraJump')], targetSeconds: 74, starScore: 940 }),
  level(29, 2, 'Son tırmanış', 1680, [ledge(170, 405, 145), mover(410, 365, 125, 110), ledge(660, 330, 140), mover(900, 365, 125, 110), ledge(1140, 320, 140), mover(1380, 370, 125, 100)], [{ x: 330, y: 465, w: 80, h: 75, kind: 'lava' }, { x: 800, y: 465, w: 80, h: 75, kind: 'geyser', period: 2.7, active: 1, phase: 0.5 }, { x: 1260, y: 465, w: 80, h: 75, kind: 'lava' }], [gem(200, 365), gem(700, 290), gem(1190, 280)], [walker(570, 448, 50), flyer(1030, 285, 30), walker(1510, 448, 42)], { key: key(1190, 280), door: door(1620), checkpoints: [checkpoint(840), checkpoint(1280)], targetSeconds: 88, starScore: 1100 }),
  level(30, 2, 'Zıp Zıp finali', 1920, [ledge(170, 405, 145), mover(410, 365, 130, 110), ledge(680, 330, 145), mover(940, 365, 130, 110), ledge(1200, 320, 145), mover(1460, 365, 130, 105), ledge(1710, 395, 120)], [{ x: 330, y: 465, w: 80, h: 75, kind: 'lava' }, saw(820, 420, 20), { x: 1110, y: 465, w: 95, h: 75, kind: 'geyser', period: 2.6, active: 1, phase: 1 }, { x: 1580, y: 465, w: 75, h: 75, kind: 'lava' }], [gem(200, 365), gem(1235, 275), gem(1740, 355)], [walker(570, 448, 50), flyer(1040, 280, 32), walker(1510, 448, 45)], { key: key(1235, 275), door: door(1845), checkpoints: [checkpoint(760), checkpoint(1450)], powerups: [pickup(700, 290, 'shield'), pickup(1210, 280, 'speed')], targetSeconds: 100, starScore: 1250 })
];

export const WORLDS = [
  { id: 0, name: 'Orman', description: 'Yeşil patikalarda zıplamayı ve ilk engelleri öğren.', color: '#4ebc78' },
  { id: 1, name: 'Saat Mekanizmaları', description: 'Dönen dişlileri ve kurmalı platformları aş.', color: '#38b9cc' },
  { id: 2, name: 'Lav / Volkan', description: 'Ateş püskürmeleri arasında final yolunu bul.', color: '#ef6848' }
];
