// Общее описание мира: используется и клиентом, и сервером.
// Всё детерминировано, поэтому карта у всех игроков одинаковая.

export const HALF = 4000;          // карта 8 x 8 км
export const LIMIT = 3950;
export const BLOCK = 72;           // шаг городской сетки
export const STREET_W = 12;        // ширина проезжей части
export const SIDEWALK = 3.5;       // тротуар внутри квартала
export const HWY_W = 18;
export const ROAD_Y = 0.3;         // дорога над землёй
export const CURB = 0.18;          // высота бордюра
export const DAY_MS = 24 * 60 * 1000; // игровые сутки = 24 минуты
export const FOOD_PRICE = 25;
export const TP_PRICE = 250;            // такси между городами (телепорт с карты)
export const LOAD_PAY = 20;             // грузчик: плата за одну коробку
export const TEST_MS = 60 * 1000;       // тест-драйв в автосалоне
export const SHOWROOM_R = 15;           // на каком расстоянии от салона можно покупать

export const CITIES = [
  { id: 'amman',  ar: 'عمّان',  ru: 'Амман',   en: 'AMMAN',  x: -2400, z: -2200, r: 560, style: 'amman'  },
  { id: 'riyadh', ar: 'الرياض', ru: 'Эр-Рияд', en: 'RIYADH', x: 0,     z: 300,   r: 640, style: 'riyadh' },
  { id: 'dubai',  ar: 'دبي',    ru: 'Дубай',   en: 'DUBAI',  x: 2780,  z: 650,   r: 580, style: 'dubai'  },
  { id: 'doha',   ar: 'الدوحة', ru: 'Доха',    en: 'DOHA',   x: 2250,  z: -2450, r: 500, style: 'doha'   },
  { id: 'jeddah', ar: 'جدة',    ru: 'Джидда',  en: 'JEDDAH', x: -2780, z: 2400,  r: 540, style: 'jeddah' },
];
export const CITY = Object.fromEntries(CITIES.map(c => [c.id, c]));

export const HIGHWAY_LINKS = [
  ['amman', 'riyadh'], ['amman', 'jeddah'], ['riyadh', 'jeddah'],
  ['riyadh', 'dubai'], ['riyadh', 'doha'], ['doha', 'dubai'],
];

// модели car_*.glb — бесплатные модели с 3D Warehouse (см. public/models/LICENSE-3dwarehouse.txt), марки в игре заменены
export const CARS = {
  ghazal: { ar: 'غزال',  ru: 'Газаль (седан)',         price: 0,      max: 44, accel: 9,  steer: 0.55, model: 'car_prius' },
  ujra:   { ar: 'أجرة',  ru: 'Уджра (такси)',          price: 4000,   max: 40, accel: 8,  steer: 0.55, model: 'car_mobilio' },
  dhib:   { ar: 'ذيب',   ru: 'Зиб (пикап)',            price: 6000,   max: 46, accel: 10, steer: 0.5 }, // пока простая модель: у скачанного пикапа нет обшивки дверей
  rimal:  { ar: 'رمال',  ru: 'Римал (бизнес-седан)',   price: 12000,  max: 54, accel: 12, steer: 0.52, model: 'car_azera' },
  jabal:  { ar: 'جبل',   ru: 'Джабаль (внедорожник)',  price: 14000,  max: 48, accel: 10, steer: 0.48, model: 'car_shogun' },
  saqr:   { ar: 'صقر',   ru: 'Сакр (внедорожник)',     price: 18000,  max: 52, accel: 11, steer: 0.48, model: 'car_4runner' },
  sahm:   { ar: 'سهم',   ru: 'Сахм (спорт-седан)',     price: 30000,  max: 70, accel: 14, steer: 0.5,  model: 'bmw' },
  barq:   { ar: 'برق',   ru: 'Барк (спорт-седан)',     price: 45000,  max: 78, accel: 17, steer: 0.5,  model: 'car_e63' },
  amir:   { ar: 'أمير',  ru: 'Амир (люкс-седан)',      price: 55000,  max: 70, accel: 14, steer: 0.48, model: 'car_ls500' },
  sultan: { ar: 'سلطان', ru: 'Султан (большой джип)',  price: 65000,  max: 62, accel: 12, steer: 0.45, model: 'car_qx80' },
  asifa:  { ar: 'عاصفة', ru: 'Асифа (суперкар)',       price: 120000, max: 92, accel: 21, steer: 0.48, model: 'pagani' },
};
// автосалоны трёх классов: в каждом городе свой салон эконом, средний и элитный
export const CAR_TIER = { ghazal: 0, ujra: 0, dhib: 0, rimal: 1, jabal: 1, saqr: 1, sahm: 1, barq: 2, amir: 2, sultan: 2, asifa: 2 };
export const SHOWROOMS = ['showroomLow', 'showroom', 'showroomHigh']; // точки города: эконом, средний, элитный
export const COLORS = ['#f4f4f2', '#16171a', '#b9bec4', '#c9a54a', '#9b1c1c', '#1f4e8c', '#2f5d3a', '#7a5a3a'];
export const SKINS = ['#e9c39b', '#c99a6e', '#a87449', '#7a4e2d'];
// ---------- одежда ----------
// одежда — тело, головной убор, цвет ткани, борода, очки. Цены: 0 — даётся сразу.
export const OUTFITS = ['thobe', 'bisht', 'casual', 'sport', 'suit'];
export const HEADS = ['shemagh', 'ghutra', 'black', 'taqiyah', 'cap', 'none'];
export const CLOTH_COLORS = ['#f6f6f2', '#e6dcc6', '#b8b3a8', '#5d6168', '#2c3850', '#6b4a32', '#1d1d1f', '#8c1f24', '#2f5d3a'];
export const CLOTHES = {
  outfit: { thobe: 0, casual: 0, sport: 900, suit: 3500, bisht: 6000 },
  head: { shemagh: 0, ghutra: 0, none: 0, taqiyah: 150, cap: 250, black: 400 },
  extra: { glasses: 500 },
};
export const DEFAULT_LOOK = { outfit: 'thobe', head: 'shemagh', cloth: CLOTH_COLORS[0], beard: true, glasses: false };

// ---------- машина: бензин, поломки, тюнинг ----------
export const FUEL_PRICE = 2;                 // $ за 1% бака
export const REPAIR_PRICE = 6;               // $ за 1% здоровья машины
export const TUNE_PRICES = [4000, 9000, 18000]; // двигатель: уровни 1, 2, 3
export const tuned = (type, lvl = 0) => { const s = CARS[type]; return { ...s, max: s.max * (1 + 0.07 * lvl), accel: s.accel * (1 + 0.12 * lvl) }; };
export const fuelUse = type => (CARS[type].max / 50) / 140; // % бака на метр: седан ~16 км на бак, суперкар ~8 км

// ---------- товары магазинов 24/7 и ларьков ----------
export const ITEMS = {
  water:  { price: 5,   food: 10 },
  snack:  { price: 15,  food: 30 },
  medkit: { price: 150, hp: 40 },
  can:    { price: 60,  fuel: 30 },
  rkit:   { price: 250, chp: 35 },
};
export const ITEM_MAX = 10;
export const SHOP_ITEMS = ['water', 'snack', 'medkit', 'can', 'rkit'];
export const KIOSK_ITEMS = ['water', 'snack'];

// ---------- оружие ----------
// dmg — урон за попадание, range — дальность (м), rate — пауза между выстрелами (с), mag — патронов в пачке (покупка),
// spread — разброс (рад), price — цена ствола, ammo — цена пачки патронов
export const WEAPONS = {
  fist:   { ar: 'قبضة', ru: 'Кулаки',   dmg: 6,  range: 1.9, rate: 0.5,  melee: true },
  pistol: { ar: 'مسدس', ru: 'Пистолет', dmg: 17, range: 45,  rate: 0.32, mag: 24, spread: 0.02,  price: 3000,  ammo: 120 },
  smg:    { ar: 'رشاش', ru: 'Пистолет-пулемёт', dmg: 10, range: 35, rate: 0.1, mag: 60, spread: 0.045, price: 7000, ammo: 250 },
  rifle:  { ar: 'بندقية', ru: 'Автомат', dmg: 22, range: 70, rate: 0.16, mag: 60, spread: 0.025, price: 14000, ammo: 400 },
};
export const WEAPON_ORDER = ['fist', 'pistol', 'smg', 'rifle'];
export const AMMO_MAX = 600;

// ---------- семьи ----------
export const FAMILY_PRICE = 25000;           // открыть свою семью
export const FAMILY_COLORS = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#4cc9f0', '#7b2cbf', '#ff70a6', '#80ed99', '#adb5bd', '#ff9f1c'];
export const FAMILY_RANKS = 3;                // 1 — участник, 2 — заместитель, 3 — лидер
export const cleanFamName = n => String(n || '').replace(/[\u0000-\u001f<>"'`]/g, '').trim().slice(0, 20);
// стартовые наборы на экране входа (старые профили хранили их в поле outfit)
export const PRESETS = {
  thobe_red: { outfit: 'thobe', head: 'shemagh' },
  thobe_white: { outfit: 'thobe', head: 'ghutra' },
  casual: { outfit: 'casual', head: 'none', cloth: '#2c3850' },
};
// приводит любой присланный вид к допустимому
export function cleanLook(l = {}) {
  const p = PRESETS[l.outfit] || {};
  const o = { ...DEFAULT_LOOK, ...p };
  if (OUTFITS.includes(l.outfit)) o.outfit = l.outfit;
  if (HEADS.includes(l.head)) o.head = l.head;
  if (CLOTH_COLORS.includes(l.cloth)) o.cloth = l.cloth;
  if (typeof l.beard === 'boolean') o.beard = l.beard;
  if (typeof l.glasses === 'boolean') o.glasses = l.glasses;
  return o;
}
export const owns = (wardrobe, kind, id) => !CLOTHES[kind]?.[id] || (wardrobe || []).includes(kind + ':' + id);

// ---------- математика ----------
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
export function noise2(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function ridged(x, z) {
  let s = 0, amp = 0.55, f = 1;
  for (let o = 0; o < 4; o++) { const n = 1 - Math.abs(noise2(x * f, z * f) * 2 - 1); s += n * n * amp; amp *= 0.5; f *= 2.03; }
  return s;
}

// ---------- побережья ----------
export const coastE = z => 3600 + 100 * Math.sin(z / 530) + 40 * Math.sin(z / 170);
export const coastW = z => -3600 - 100 * Math.sin(z / 610 + 1) - 40 * Math.sin(z / 190);

// ---------- дороги ----------
function buildHighways() {
  const R = rng(777);
  return HIGHWAY_LINKS.map(([a, b]) => {
    const A = CITY[a], B = CITY[b];
    const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
    const off = (R() - 0.5) * 0.25 * len;
    const cx = (A.x + B.x) / 2 - dz / len * off, cz = (A.z + B.z) / 2 + dx / len * off;
    const n = Math.ceil(len / 40), pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u * u * A.x + 2 * u * t * cx + t * t * B.x, u * u * A.z + 2 * u * t * cz + t * t * B.z]);
    }
    return { a, b, pts, w: HWY_W };
  });
}
function buildStreets() {
  const out = [];
  for (const c of CITIES) {
    const n = Math.floor(c.r / BLOCK);
    for (let i = -n; i <= n; i++) {
      const o = i * BLOCK, L = Math.sqrt(Math.max(0, c.r * c.r - o * o));
      if (L < BLOCK) continue;
      const Lq = Math.floor(L / BLOCK) * BLOCK;
      out.push({ city: c.id, dir: 'v', pts: [[c.x + o, c.z - Lq], [c.x + o, c.z + Lq]], w: STREET_W });
      out.push({ city: c.id, dir: 'h', pts: [[c.x - Lq, c.z + o], [c.x + Lq, c.z + o]], w: STREET_W });
    }
  }
  return out;
}
export const HIGHWAYS = buildHighways();
export const STREETS = buildStreets();

class SegGrid {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return i * 100003 + j; }
  add(ax, az, bx, bz, w) {
    const s = [ax, az, bx, bz, w / 2], c = this.cell, m = w + 10;
    const i0 = Math.floor((Math.min(ax, bx) - m) / c), i1 = Math.floor((Math.max(ax, bx) + m) / c);
    const j0 = Math.floor((Math.min(az, bz) - m) / c), j1 = Math.floor((Math.max(az, bz) + m) / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j); let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(s);
    }
  }
  dist(x, z) {
    const c = this.cell, ci = Math.floor(x / c), cj = Math.floor(z / c); let best = 1e9;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const a = this.map.get(this.key(i, j)); if (!a) continue;
      for (const s of a) {
        const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz;
        let t = l2 ? ((x - s[0]) * dx + (z - s[1]) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - s[0] - t * dx, z - s[1] - t * dz) - s[4];
        if (d < best) best = d;
      }
    }
    return best;
  }
}
export const HWY_GRID = new SegGrid(150);
for (const h of HIGHWAYS) for (let i = 0; i < h.pts.length - 1; i++) HWY_GRID.add(...h.pts[i], ...h.pts[i + 1], h.w);
export const ROAD_GRID = new SegGrid(150);
for (const h of HIGHWAYS) for (let i = 0; i < h.pts.length - 1; i++) ROAD_GRID.add(...h.pts[i], ...h.pts[i + 1], h.w);
for (const s of STREETS) ROAD_GRID.add(...s.pts[0], ...s.pts[1], s.w);

// ---------- остановки на трассах: заправка и деревня ----------
export const STOPS = HIGHWAYS.map((h, k) => {
  const i = Math.floor(h.pts.length * 0.5), p = h.pts[i], q = h.pts[i + 1];
  let dx = q[0] - p[0], dz = q[1] - p[1]; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
  const nx = -dz, nz = dx;
  return {
    hwy: k, ry: Math.atan2(dx, dz), dx, dz, nx, nz,
    gas: { x: p[0] + nx * 34, z: p[1] + nz * 34 },
    village: { x: p[0] - nx * 150, z: p[1] - nz * 150 },
  };
});

// горы (подальше от городов, трассы прорезают их ущельями)
const MOUNTAINS = [
  { x: -3250, z: -100, r: 1250 }, { x: 600, z: -2600, r: 900 },
  { x: -600, z: 2750, r: 900 },   { x: 1350, z: 2250, r: 700 },
];

// ---------- рельеф ----------
export function cityMask(x, z) {
  let m = 0;
  for (const c of CITIES) { const d = Math.hypot(x - c.x, z - c.z); m = Math.max(m, 1 - smooth(c.r - 20, c.r + 160, d)); }
  return m;
}
export function nearestCity(x, z) {
  let best = null, bd = 1e9;
  for (const c of CITIES) { const d = Math.hypot(x - c.x, z - c.z); if (d < bd) { bd = d; best = c; } }
  return { city: best, d: bd, inside: bd < best.r + 40 };
}
function stopMask(x, z) {
  let m = 1;
  for (const s of STOPS) {
    m = Math.min(m, smooth(60, 140, Math.hypot(x - s.gas.x, z - s.gas.z)), smooth(130, 230, Math.hypot(x - s.village.x, z - s.village.z)));
  }
  return m;
}
export const villageFlat = (x, z) => 1 - stopMask(x, z);

export function height(x, z) {
  const A = CITY.amman, da = Math.hypot(x - A.x, z - A.z);
  let h = 0;
  const hm = 1 - smooth(600, 1450, da);
  if (hm > 0) h += hm * (13 * Math.sin(x / 170 + 1.3) * Math.cos(z / 210) + 7 * Math.sin((x + z) / 125) + 21);
  const cm = cityMask(x, z);
  if (cm < 1) {
    const rd = HWY_GRID.dist(x, z);
    const free = (1 - cm) * stopMask(x, z);
    if (free > 0) {
      const mask = smooth(25, 230, rd) * free;
      if (mask > 0) {
        const s = Math.sin(x / 95 + Math.sin(z / 140) * 1.7) * 0.5 + 0.5;
        h += mask * (s * s * 9 + 2.5 * Math.sin(z / 61 + x / 210) + 2.5);
      }
      for (const M of MOUNTAINS) {
        const d = Math.hypot(x - M.x, z - M.z); if (d > M.r) continue;
        const mm = (1 - smooth(M.r * 0.35, M.r, d)) * smooth(45, 380, rd) * free;
        if (mm > 0) h += mm * (25 + 165 * ridged(x / 420 + M.x, z / 420 + M.z));
      }
    }
  }
  const e = Math.max(x - coastE(z), coastW(z) - x);
  if (e > -320) h = h * (1 - smooth(-320, -50, e)) - 7 * smooth(-50, 110, e);
  return h;
}
export function mountainAmount(x, z) {
  let m = 0;
  for (const M of MOUNTAINS) { const d = Math.hypot(x - M.x, z - M.z); m = Math.max(m, 1 - smooth(M.r * 0.35, M.r, d)); }
  return m;
}

// ---------- кварталы ----------
const blockCache = new Map();
export function blockValid(c, i, j) {
  const key = c.id + i + ',' + j;
  let v = blockCache.get(key);
  if (v === undefined) {
    const x = c.x + (i + 0.5) * BLOCK, z = c.z + (j + 0.5) * BLOCK;
    v = Math.hypot(x - c.x, z - c.z) < c.r - 45 && HWY_GRID.dist(x, z) > (BLOCK - STREET_W) * 0.72;
    blockCache.set(key, v);
  }
  return v;
}
// квартал (с тротуаром) под точкой, или null
export function blockAt(x, z) {
  for (const c of CITIES) {
    const lx = x - c.x, lz = z - c.z;
    if (Math.abs(lx) > c.r || Math.abs(lz) > c.r) continue;
    const i = Math.floor(lx / BLOCK), j = Math.floor(lz / BLOCK);
    const mx = lx - i * BLOCK, mz = lz - j * BLOCK, hw = STREET_W / 2;
    if (mx < hw || mx > BLOCK - hw || mz < hw || mz > BLOCK - hw) return null;
    if (!blockValid(c, i, j)) return null;
    return { c, i, j, cx: c.x + (i + 0.5) * BLOCK, cz: c.z + (j + 0.5) * BLOCK };
  }
  return null;
}
// высота поверхности, по которой ходят и ездят
export function groundY(x, z) {
  const h = height(x, z);
  if (blockAt(x, z)) return h + ROAD_Y + CURB;
  if (ROAD_GRID.dist(x, z) < 0.3) return h + ROAD_Y;
  return h;
}

// ---------- точки интереса ----------
// точки интереса стоят на улицах между двумя настоящими кварталами, подальше от трасс
const cpCache = {};
export function cityPoints(c) {
  if (cpCache[c.id]) return cpCache[c.id];
  const cands = [];
  for (let i = -3; i <= 3; i++) for (let j = -4; j <= 3; j++) {
    if (!blockValid(c, i - 1, j) || !blockValid(c, i, j)) continue;
    const x = c.x + i * BLOCK + 3, z = c.z + (j + 0.5) * BLOCK;
    if (HWY_GRID.dist(x, z) < 40) continue;
    cands.push({ x, z, d: Math.hypot(x - c.x, z - c.z) });
  }
  cands.sort((a, b) => a.d - b.d);
  const out = [];
  const N = 12;
  for (const p of cands) { if (out.every(q => Math.hypot(q.x - p.x, q.z - p.z) > 60)) out.push(p); if (out.length === N) break; }
  // в маленьком городе места меньше — добираем точки с меньшим отступом
  for (const p of cands) { if (out.length >= N) break; if (out.every(q => Math.hypot(q.x - p.x, q.z - p.z) > 36)) out.push(p); }
  while (out.length < N) out.push({ x: c.x + 3 + out.length * BLOCK, z: c.z + BLOCK * 0.5 });
  // склад грузчиков: груда коробок и грузовик дальше по той же улице
  const wh = out[4], whDrop = { x: wh.x, z: wh.z + 22 };
  return (cpCache[c.id] = {
    spawn: out[0], office: out[1], showroom: out[2], food: out[3], wh, whDrop, clothes: out[5],
    gas: out[6], shop: out[7], tech: out[8], showroomLow: out[9], showroomHigh: out[10], guns: out[11],
  });
}
export const FOOD_SPOTS = [...CITIES.map(c => cityPoints(c).food), ...STOPS.map(s => ({ x: s.gas.x + s.dx * 14, z: s.gas.z + s.dz * 14 }))];
// заправки: одна в каждом городе и на каждой трассе (колонки)
export const GAS_SPOTS = [...CITIES.map(c => cityPoints(c).gas), ...STOPS.map(s => ({ x: s.gas.x - s.nx * 3, z: s.gas.z - s.nz * 3 }))];
// ---------- объекты для захвата семьями: вышки связи, ферма, завод ----------
// место ищется подальше от трасс, городов и гор, на ровной земле (детерминированно — одинаково у всех)
function findSpot(cx, cz, dist, seed) {
  const R = rng(seed);
  for (let k = 0; k < 400; k++) {
    const a = R() * Math.PI * 2, d = dist * (0.8 + R() * 0.5), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (Math.abs(x) > LIMIT - 300 || Math.abs(z) > LIMIT - 300) continue;
    if (HWY_GRID.dist(x, z) < 90 || cityMask(x, z) > 0.02 || mountainAmount(x, z) > 0.15 || villageFlat(x, z) > 0.1) continue;
    if (x > coastE(z) - 400 || x < coastW(z) + 400) continue;
    const h = height(x, z), slope = Math.abs(height(x + 30, z) - h) + Math.abs(height(x, z + 30) - h);
    if (slope > 4) continue;
    return { x, z };
  }
  return { x: cx + dist, z: cz };
}
const hwMid = (k, t) => HIGHWAYS[k].pts[Math.floor(HIGHWAYS[k].pts.length * t)];
export const CAPTURES = [
  { id: 'tower1', kind: 'tower', ar: 'برج الاتصالات ١', ru: 'Вышка связи №1', income: 600, ...findSpot(...hwMid(0, 0.3), 160, 11) },
  { id: 'tower2', kind: 'tower', ar: 'برج الاتصالات ٢', ru: 'Вышка связи №2', income: 600, ...findSpot(...hwMid(3, 0.7), 160, 12) },
  { id: 'tower3', kind: 'tower', ar: 'برج الاتصالات ٣', ru: 'Вышка связи №3', income: 600, ...findSpot(...hwMid(5, 0.3), 160, 13) },
  { id: 'farm', kind: 'farm', ar: 'المزرعة', ru: 'Ферма', income: 1500, ...findSpot(CITY.amman.x, CITY.amman.z, CITY.amman.r + 320, 21) },
  { id: 'factory', kind: 'factory', ar: 'المصنع', ru: 'Завод', income: 3000, ...findSpot(CITY.riyadh.x, CITY.riyadh.z, CITY.riyadh.r + 340, 31) },
];
export const CAPTURE_R = 40;           // радиус зоны захвата
export const CAPTURE_MS = 4 * 60 * 1000; // захват длится 4 минуты
export const CAPTURE_GOAL = 120;       // столько секунд перевеса нужно, чтобы забрать объект
export const CAPTURE_COOLDOWN = 20 * 60 * 1000; // после захвата объект 20 минут нельзя атаковать
export const INCOME_EVERY = 10 * 60 * 1000;     // доход семье каждые 10 минут

// ларьки на тротуарах: по 4 в городе, рядом с перекрёстками
export const KIOSKS = [];
CITIES.forEach((c, ci) => {
  const R = rng(5000 + ci * 31), n = Math.floor(c.r / BLOCK), P = cityPoints(c), busy = Object.values(P);
  for (let tries = 0, k = 0; tries < 200 && k < 4; tries++) {
    const i = Math.floor((R() * 2 - 1) * (n - 1)), j = Math.floor((R() * 2 - 1) * (n - 1));
    if (!blockValid(c, i, j)) continue;
    const x = c.x + (i + 0.5) * BLOCK + 12, z = c.z + j * BLOCK + STREET_W / 2 + 1.9;
    if (busy.some(q => Math.hypot(q.x - x, q.z - z) < 25)) continue;
    KIOSKS.push({ x, z, city: c.id }); busy.push({ x, z }); k++;
  }
});

export function streetPoint(cityId, R = Math.random) {
  const list = STREETS.filter(s => s.city === cityId);
  for (let k = 0; k < 20; k++) {
    const s = list[Math.floor(R() * list.length)];
    const t = 0.1 + R() * 0.8;
    const x = s.pts[0][0] + (s.pts[1][0] - s.pts[0][0]) * t, z = s.pts[0][1] + (s.pts[1][1] - s.pts[0][1]) * t;
    const c = CITY[cityId];
    if (Math.hypot(x - c.x, z - c.z) > 120) return { x, z };
  }
  return { ...cityPoints(CITY[cityId]).spawn };
}
