// Общее описание мира: используется и клиентом, и сервером.
// Всё детерминировано (одинаковый seed), поэтому карта у всех игроков одна и та же.

export const HALF = 4000;           // карта 8 x 8 км (от -4000 до 4000 м)
export const LIMIT = 3950;          // граница, за которую нельзя выехать
export const BLOCK = 80;            // размер городского квартала, м
export const STREET_W = 14;         // ширина улицы
export const HWY_W = 20;            // ширина трассы

export const CITIES = [
  { id: 'amman',  ar: 'عمّان',   ru: 'Амман',   en: 'Amman',  x: -2400, z: -2200, r: 650, style: 'amman'  },
  { id: 'riyadh', ar: 'الرياض',  ru: 'Эр-Рияд', en: 'Riyadh', x: 0,     z: 300,   r: 760, style: 'riyadh' },
  { id: 'dubai',  ar: 'دبي',     ru: 'Дубай',   en: 'Dubai',  x: 2750,  z: 650,   r: 650, style: 'dubai'  },
  { id: 'doha',   ar: 'الدوحة',  ru: 'Доха',    en: 'Doha',   x: 2250,  z: -2450, r: 560, style: 'doha'   },
  { id: 'jeddah', ar: 'جدة',     ru: 'Джидда',  en: 'Jeddah', x: -2750, z: 2400,  r: 600, style: 'jeddah' },
];
export const CITY = Object.fromEntries(CITIES.map(c => [c.id, c]));

export const HIGHWAY_LINKS = [
  ['amman', 'riyadh'], ['amman', 'jeddah'], ['riyadh', 'jeddah'],
  ['riyadh', 'dubai'], ['riyadh', 'doha'], ['doha', 'dubai'],
];

// Машины (вымышленные модели в стиле машин, популярных у арабских игроков)
export const CARS = {
  ghazal: { ar: 'غزال',  ru: 'Газаль (седан)',     price: 0,     max: 42, accel: 9,  steer: 0.55 },
  dhib:   { ar: 'ذيب',   ru: 'Зиб (пикап)',        price: 6000,  max: 45, accel: 10, steer: 0.5  },
  saqr:   { ar: 'صقر',   ru: 'Сакр (внедорожник)', price: 18000, max: 52, accel: 11, steer: 0.48 },
  barq:   { ar: 'برق',   ru: 'Барк (спорткар)',    price: 45000, max: 68, accel: 16, steer: 0.5  },
};
export const COLORS = ['#f4f4f2', '#16171a', '#b9bec4', '#c9a54a', '#9b1c1c', '#1f4e8c', '#2f5d3a', '#7a5a3a'];

// ---------- случайные числа с seed ----------
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

// ---------- побережья ----------
export const coastE = z => 3600 + 100 * Math.sin(z / 530) + 40 * Math.sin(z / 170);   // Персидский залив
export const coastW = z => -3600 - 100 * Math.sin(z / 610 + 1) - 40 * Math.sin(z / 190); // Красное море

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

// Сетка отрезков для быстрого поиска «как далеко до дороги»
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
  // расстояние от точки до края ближайшей дороги (отрицательное = на дороге); ищем в радиусе одной клетки
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

export function height(x, z) {
  // холмы Аммана (дороги идут по ним)
  const A = CITY.amman, da = Math.hypot(x - A.x, z - A.z);
  let h = 0;
  const hm = 1 - smooth(650, 1500, da);
  if (hm > 0) h += hm * (13 * Math.sin(x / 170 + 1.3) * Math.cos(z / 210) + 7 * Math.sin((x + z) / 125) + 21);
  // барханы в пустыне, подальше от дорог и городов
  const cm = cityMask(x, z);
  if (cm < 1) {
    const rd = HWY_GRID.dist(x, z);
    const mask = smooth(25, 230, rd) * (1 - cm);
    if (mask > 0) {
      const s = Math.sin(x / 95 + Math.sin(z / 140) * 1.7) * 0.5 + 0.5;
      h += mask * (s * s * 9 + 2.5 * Math.sin(z / 61 + x / 210) + 2.5);
    }
  }
  // побережья
  const eE = x - coastE(z), eW = coastW(z) - x, e = Math.max(eE, eW);
  if (e > -320) h = h * (1 - smooth(-320, -50, e)) - 7 * smooth(-50, 110, e);
  return h;
}

// ---------- точки для работы, спавна и салонов ----------
export function cityPoints(c) {
  return {
    spawn:    { x: c.x,         z: c.z + BLOCK * 0.5 },
    office:   { x: c.x + BLOCK, z: c.z + BLOCK * 0.5 },
    showroom: { x: c.x - BLOCK, z: c.z - BLOCK * 0.5 },
  };
}

// случайная точка на улице города (место доставки)
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
