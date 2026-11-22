// Строит 3D-мир: рельеф, море, дороги, кварталы с тротуарами, дома с баками на крышах,
// магазины с арабскими вывесками, мечети, виллы, парковки, фонари, заправки, деревни, горы, верблюды.
// Всё статичное склеивается в большие куски (чанки) — так быстрее на телефоне.
import * as THREE from 'three';
import {
  HALF, CITIES, CITY, BLOCK, STREET_W, SIDEWALK, ROAD_Y, CURB, HIGHWAYS, STREETS, STOPS, HWY_GRID,
  height, cityMask, coastE, coastW, rng, smooth, cityPoints, blockValid, mountainAmount, villageFlat, FOOD_SPOTS,
} from '../shared/world.js';

export const U = { uNight: { value: 0 } }; // общая «ночь» для всех материалов

const STYLES = {
  amman:  { floors: [2, 5],  tower: 0.03, tFloors: [12, 26], pal: ['#ece2cc', '#e2d6bb', '#d8c9a7', '#f2eada', '#d2c3a0'], glass: ['#93a9b7', '#7f98a8'], cyl: 0,    shop: 0.45, villa: 0.35, park: 0.05 },
  riyadh: { floors: [2, 6],  tower: 0.09, tFloors: [18, 45], pal: ['#ddc7a3', '#cdb690', '#e3d7c0', '#bfab8d'],             glass: ['#7f98a8', '#5d7a8c', '#a7b8c2'], cyl: 0.06, shop: 0.4, villa: 0.4, park: 0.06 },
  dubai:  { floors: [4, 12], tower: 0.4,  tFloors: [28, 85], pal: ['#ecebe6', '#d9dcde', '#c7ced4'],                       glass: ['#5b86a6', '#7aa4c2', '#9cc0d6', '#3f6f8f', '#b9cdd8', '#8c9aa6'], cyl: 0.22, shop: 0.3, villa: 0.3, park: 0.08 },
  doha:   { floors: [3, 9],  tower: 0.26, tFloors: [22, 60], pal: ['#e8dfcf', '#dbd0b9', '#efe7d8'],                       glass: ['#6f9bb5', '#4d7f99', '#a6c4d4', '#c9b37a'], cyl: 0.45, shop: 0.35, villa: 0.35, park: 0.07 },
  jeddah: { floors: [2, 6],  tower: 0.1,  tFloors: [16, 40], pal: ['#f3f0e9', '#e9e3d7', '#ddd4c3', '#cfa384', '#e8d9c0'],  glass: ['#7da6bd', '#9cbccd'], cyl: 0.08, shop: 0.45, villa: 0.35, park: 0.07 },
};
const SHOPS = ['بقالة', 'مطعم', 'صيدلية', 'مخبز', 'حلاق', 'مقهى', 'ملابس', 'جوالات', 'شاورما', 'عطور', 'ذهب', 'سوبرماركت', 'فلافل', 'حلويات', 'بنك', 'محطة وقود'];
const SHOP_BG = ['#1f6f8b', '#b03a2e', '#1e8449', '#7d3c98', '#ca6f1e', '#154360', '#922b21', '#117864'];
const ADS = [['عرب RP', '#f0b429', '#1a1206'], ['مطعم الشام', '#b03a2e', '#fff'], ['أهلاً وسهلاً', '#1e8449', '#fff']];

// ---------- склейка геометрии ----------
function tpl(geo) {
  return { pos: geo.attributes.position.array, nor: geo.attributes.normal.array, uv: geo.attributes.uv ? geo.attributes.uv.array : null, idx: geo.index ? geo.index.array : null, count: geo.attributes.position.count };
}
const T = {
  box: tpl(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
  cyl: tpl(new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0)),
  hex: tpl(new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0)),
  tower: tpl(new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0)),
  dome: tpl(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
  cone: tpl(new THREE.ConeGeometry(0.5, 1, 10).translate(0, 0.5, 0)),
  plane: tpl(new THREE.PlaneGeometry(1, 1)),
};

class Batch {
  constructor() { this.n = 0; this.ni = 0; this.vc = 0; this.ic = 0; this.alloc(2048, 4096); }
  alloc(v, i) {
    const grow = (a, n) => { const b = new a.constructor(n); if (a) b.set(a.subarray(0, Math.min(a.length, n))); return b; };
    if (v > this.vc) { this.pos = grow(this.pos || new Float32Array(0), v * 3); this.nor = grow(this.nor || new Float32Array(0), v * 3); this.col = grow(this.col || new Float32Array(0), v * 3); this.uv = grow(this.uv || new Float32Array(0), v * 2); this.win = grow(this.win || new Float32Array(0), v); this.vc = v; }
    if (i > this.ic) { this.idx = grow(this.idx || new Uint32Array(0), i); this.ic = i; }
  }
  ensure(nv, ni) { if (this.n + nv > this.vc || this.ni + ni > this.ic) this.alloc(Math.max(this.vc * 2, this.n + nv), Math.max(this.ic * 2, this.ni + ni)); }
  add(t, m, col, win = 0, rect = null) {
    const nIdx = t.idx ? t.idx.length : t.count;
    this.ensure(t.count, nIdx);
    const e = m.elements; _nm.getNormalMatrix(m); const q = _nm.elements, b = this.n;
    for (let i = 0; i < t.count; i++) {
      const x = t.pos[i * 3], y = t.pos[i * 3 + 1], z = t.pos[i * 3 + 2], o = (b + i) * 3;
      this.pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      this.pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      this.pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = t.nor[i * 3], bb = t.nor[i * 3 + 1], c = t.nor[i * 3 + 2];
      const nx = q[0] * a + q[3] * bb + q[6] * c, ny = q[1] * a + q[4] * bb + q[7] * c, nz = q[2] * a + q[5] * bb + q[8] * c;
      const l = Math.hypot(nx, ny, nz) || 1; this.nor[o] = nx / l; this.nor[o + 1] = ny / l; this.nor[o + 2] = nz / l;
      this.col[o] = col.r; this.col[o + 1] = col.g; this.col[o + 2] = col.b;
      this.win[b + i] = win;
      if (rect && t.uv) { this.uv[(b + i) * 2] = rect[0] + t.uv[i * 2] * rect[2]; this.uv[(b + i) * 2 + 1] = rect[1] + t.uv[i * 2 + 1] * rect[3]; }
    }
    if (t.idx) for (let k = 0; k < t.idx.length; k++) this.idx[this.ni + k] = b + t.idx[k];
    else for (let k = 0; k < t.count; k++) this.idx[this.ni + k] = b + k;
    this.n += t.count; this.ni += nIdx;
  }
  raw(pos, idx, col) { // произвольная сетка, нормаль вверх
    const nv = pos.length / 3; this.ensure(nv, idx.length); const b = this.n;
    this.pos.set(pos, b * 3);
    for (let i = 0; i < nv; i++) { const o = (b + i) * 3; this.nor[o] = 0; this.nor[o + 1] = 1; this.nor[o + 2] = 0; this.col[o] = col.r; this.col[o + 1] = col.g; this.col[o + 2] = col.b; this.win[b + i] = 0; }
    for (let k = 0; k < idx.length; k++) this.idx[this.ni + k] = b + idx[k];
    this.n += nv; this.ni += idx.length;
  }
  geometry() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, this.n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, this.n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, this.n * 2), 2));
    g.setAttribute('aWin', new THREE.BufferAttribute(this.win.slice(0, this.n), 1));
    g.setIndex(new THREE.BufferAttribute(this.idx.slice(0, this.ni), 1));
    g.computeBoundingSphere();
    return g;
  }
}
const _nm = new THREE.Matrix3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const C = h => _c.set(h);

const CELL = 400;
const KINDS = ['bld', 'plain', 'emit', 'sign', 'det', 'detEmit', 'glow'];
let chunks;
function ch(x, z) {
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL), k = i * 1000 + j;
  let c = chunks.get(k);
  if (!c) { c = { x: (i + 0.5) * CELL, z: (j + 0.5) * CELL }; for (const n of KINDS) c[n] = new Batch(); chunks.set(k, c); }
  return c;
}
// положить фигуру: kind — слой, t — шаблон, x,y,z — низ фигуры, sx,sy,sz — размеры
function put(kind, t, x, y, z, sx, sy, sz, col, ry = 0, win = 0, rx = 0, rect = null) {
  _e.set(rx, ry, 0, 'YXZ'); _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  ch(x, z)[kind].add(t, _m, typeof col === 'string' ? C(col) : col, win, rect);
}

let colliders;
const collide = (x, z, w, d, y1 = 1e4, small = false) => colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y1, small });
const gyAt = (x, z) => height(x, z) + ROAD_Y + CURB;

// ---------- атлас вывесок ----------
const ATLAS = 1024;
function makeAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = ATLAS; const g = c.getContext('2d');
  SHOPS.forEach((name, k) => {
    const x = (k % 2) * 512, y = Math.floor(k / 2) * 96;
    g.fillStyle = SHOP_BG[k % SHOP_BG.length]; g.fillRect(x, y, 512, 96);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, y + 6, 512, 4); g.fillRect(x, y + 86, 512, 4);
    g.fillStyle = '#fff'; g.font = '900 60px Cairo, Tahoma, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.fillText(name, x + 256, y + 50);
  });
  g.fillStyle = '#3b3c40'; g.fillRect(0, 768, 256, 256); g.fillStyle = '#ecece4';
  for (let i = 0; i < 6; i++) g.fillRect(8 + i * 42, 768, 24, 256);
  ADS.forEach(([txt, bg, fg], k) => {
    const x = 256 + k * 256; g.fillStyle = bg; g.fillRect(x, 768, 256, 256);
    g.fillStyle = fg; g.font = '900 46px Cairo, Tahoma, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.fillText(txt, x + 128, 896);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const rect = (x, y, w, h) => [x / ATLAS, 1 - (y + h) / ATLAS, w / ATLAS, h / ATLAS];
const shopRect = k => rect((k % 2) * 512 + 4, Math.floor(k / 2) * 96 + 2, 504, 92);
const ZEBRA = rect(0, 768, 256, 256);
const adRect = k => rect(256 + k * 256, 832, 256, 128);

// ---------- материалы ----------
function hook(mat, frag) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNight = U.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWin; varying float vWin; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wp4 = vec4(transformed, 1.0); vec3 wn3 = objectNormal;
        vWP = (modelMatrix * wp4).xyz; vWN = normalize(mat3(modelMatrix) * wn3); vWin = aWin;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying float vWin; varying vec3 vWP; varying vec3 vWN;\n' + frag.head)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + frag.color)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + frag.emit);
  };
  return mat;
}
function materials(atlas) {
  const bld = hook(new THREE.MeshLambertMaterial({ vertexColors: true }), {
    head: 'float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    color: `float gWin = 0.0; float gLit = 0.0;
      if (vWin > 0.5) {
        if (abs(vWN.y) < 0.5) {
          float u = abs(vWN.x) > abs(vWN.z) ? vWP.z : vWP.x;
          float fy = fract(vWP.y / 3.3), fx = fract(u / 3.1);
          gWin = step(0.3, fy) * step(fy, 0.84) * step(0.16, fx) * step(fx, 0.84);
          float r = hash2(vec2(floor(u / 3.1) + floor(vWN.x * 3.0 + vWN.z * 7.0) * 17.0, floor(vWP.y / 3.3)) + floor(vWP.x * 0.02) + floor(vWP.z * 0.02) * 3.0);
          gLit = step(0.45, r);
          vec3 glass = mix(vec3(0.15, 0.2, 0.26), diffuseColor.rgb * 0.5, 0.3) + 0.06 * (r - 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, gWin * 0.88);
        } else diffuseColor.rgb *= 0.82;
      }`,
    emit: 'totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * gWin * gLit * uNight * 0.9;',
  });
  const plain = new THREE.MeshLambertMaterial({ vertexColors: true });
  const emit = hook(new THREE.MeshLambertMaterial({ vertexColors: true }), { head: '', color: '', emit: 'totalEmissiveRadiance += diffuseColor.rgb * uNight * 1.6;' });
  const sign = hook(new THREE.MeshLambertMaterial({ map: atlas, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), { head: '', color: '', emit: 'totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.75;' });
  const glow = new THREE.MeshBasicMaterial({ map: glowTex(), vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  return { bld, plain, emit, sign, det: plain, detEmit: emit, glow };
}

export function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const FULL = [0, 0, 1, 1];

// ---------- дороги ----------
function roadTexture(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3b3f'; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + Math.random() * 0.05})`; g.fillRect(Math.random() * 128, Math.random() * 256, 2, 2); }
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(20 + Math.random() * 90, Math.random() * 256, 6 + Math.random() * 10, 40 + Math.random() * 80); }
  g.fillStyle = '#e8e8e0';
  g.fillRect(3, 0, 3, 256); g.fillRect(122, 0, 3, 256);
  if (kind === 'hwy') {
    g.fillStyle = '#e0b43a'; g.fillRect(61, 0, 2, 256); g.fillRect(65, 0, 2, 256);
    g.fillStyle = '#e8e8e0'; g.fillRect(33, 0, 2, 110); g.fillRect(93, 0, 2, 110);
  } else { g.fillStyle = '#e8e8e0'; g.fillRect(63, 0, 2, 110); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function ribbon(lines, yOff, step, repeatLen) {
  const pos = [], uv = [], idx = [];
  for (const ln of lines) {
    const pts = [];
    for (let i = 0; i < ln.pts.length - 1; i++) {
      const [ax, az] = ln.pts[i], [bx, bz] = ln.pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
      for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
    }
    pts.push(ln.pts[ln.pts.length - 1]);
    const base = pos.length / 3, hw = ln.w / 2; let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (i > 0) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const lx = p[0] - dz * hw, lz = p[1] + dx * hw, rx = p[0] + dz * hw, rz = p[1] - dx * hw;
      pos.push(lx, height(lx, lz) + yOff, lz, rx, height(rx, rz) + yOff, rz);
      uv.push(0, acc / repeatLen, 1, acc / repeatLen);
      if (i > 0) { const j = base + (i - 1) * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ---------- тексты ----------
export function textSprite(text, { color = '#fff', bg = 'rgba(0,0,0,0.55)', size = 48, scale = 1 } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const font = `700 ${size}px Cairo, Tahoma, sans-serif`;
  g.font = font; const w = Math.ceil(g.measureText(text).width) + size;
  c.width = w; c.height = Math.ceil(size * 1.6);
  g.font = font; g.direction = 'rtl';
  if (bg) { g.fillStyle = bg; const r = c.height / 2; g.beginPath(); g.roundRect(0, 0, c.width, c.height, r); g.fill(); }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(c.width / c.height * 2.2 * scale, 2.2 * scale, 1);
  return s;
}
function roadSign(ar, en, km) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#0f6b3a'; g.fillRect(0, 0, 512, 256); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(12, 12, 488, 232);
  g.fillStyle = '#fff'; g.textBaseline = 'middle';
  g.textAlign = 'right'; g.direction = 'rtl'; g.font = '900 78px Cairo, Tahoma, sans-serif'; g.fillText(ar, 470, 92);
  g.textAlign = 'left'; g.direction = 'ltr'; g.font = '700 46px Arial, sans-serif'; g.fillText(en, 40, 180);
  g.textAlign = 'right'; g.font = '900 46px Arial, sans-serif'; g.fillText(km + ' km', 470, 180);
  g.beginPath(); g.moveTo(40, 92); g.lineTo(100, 60); g.lineTo(100, 124); g.fill(); g.fillRect(96, 80, 60, 24);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- постройки ----------
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };

function parkedCar(x, z, ry, y, R) {
  const cols = ['#f4f4f2', '#f4f4f2', '#16171a', '#b9bec4', '#c9a54a', '#9b1c1c', '#1f4e8c'];
  const col = cols[Math.floor(R() * cols.length)];
  const s = Math.sin(ry), c = Math.cos(ry);
  const big = R() < 0.4, L = big ? 4.9 : 4.6, W = big ? 1.95 : 1.8, bh = big ? 0.9 : 0.65;
  put('det', T.box, x, y + 0.35, z, W, bh, L, col, ry);
  put('det', T.box, x - s * 0.2, y + 0.35 + bh, z - c * 0.2, W - 0.15, big ? 0.75 : 0.55, L * (big ? 0.62 : 0.5), '#1b2430', ry);
  for (const [a, b] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const lx = a * (W / 2 - 0.1), lz = b * (L / 2 - 0.85);
    put('det', T.box, x + c * lx + s * lz, y, z - s * lx + c * lz, 0.25, 0.7, 0.7, '#141414', ry);
  }
  collide(x, z, Math.abs(c) * W + Math.abs(s) * L, Math.abs(s) * W + Math.abs(c) * L, y + 2, true);
}

function palm(list, x, z, s = 1) { list.push([x, z, s]); collide(x, z, 0.7, 0.7, 1e4, true); }

// жилой дом с баками, кондиционерами, балконами и, возможно, магазином внизу
function house(x, z, w, d, floors, col, faces, S, R, lift) {
  const hs = [height(x - w / 2, z - d / 2), height(x + w / 2, z - d / 2), height(x - w / 2, z + d / 2), height(x + w / 2, z + d / 2)];
  const lo = Math.min(...hs), hi = Math.max(...hs);
  const y0 = lo + lift - 0.6, H = floors * 3.3 + 0.6 + (hi - lo);
  put('bld', T.box, x, y0, z, w, H, d, col, 0, 1);
  collide(x, z, w, d, y0 + H);
  const top = y0 + H, pc = shade(col, 0.9), g0 = hi + lift; // g0 — уровень первого этажа со стороны улицы
  put('det', T.box, x, top, z - d / 2 + 0.15, w, 0.8, 0.3, pc); put('det', T.box, x, top, z + d / 2 - 0.15, w, 0.8, 0.3, pc);
  put('det', T.box, x - w / 2 + 0.15, top, z, 0.3, 0.8, d - 0.6, pc); put('det', T.box, x + w / 2 - 0.15, top, z, 0.3, 0.8, d - 0.6, pc);
  const nt = 1 + Math.floor(R() * 3);
  for (let k = 0; k < nt; k++) {
    const tx = x + (R() - 0.5) * (w - 3), tz = z + (R() - 0.5) * (d - 3);
    const tc = R() < 0.5 ? '#2a2a2a' : R() < 0.5 ? '#e6e6e6' : '#2f6fb0';
    put('det', T.box, tx, top, tz, 1.4, 0.5, 1.4, '#777');
    put('det', T.hex, tx, top + 0.5, tz, 1.2, 1.3, 1.2, tc);
  }
  if (R() < 0.6) put('det', T.dome, x + (R() - 0.5) * (w - 2), top + 0.9, z + (R() - 0.5) * (d - 2), 1.1, 0.35, 1.1, '#e8e8e8', R() * 6, 0, -1.1);
  faces.forEach(([nx, nz], fi) => {
    const fw = nx ? d : w, fx = x + nx * w / 2, fz = z + nz * d / 2, ry = Math.atan2(nx, nz);
    const tx = nz, tz = -nx;
    const na = Math.floor(R() * 3);
    for (let k = 0; k < na; k++) {
      const off = (R() - 0.5) * (fw - 3), fl = 1 + Math.floor(R() * floors);
      put('det', T.box, fx + nx * 0.3 + tx * off, g0 + fl * 3.3 - 1.6, fz + nz * 0.3 + tz * off, 0.9, 0.6, 0.6, '#d5d5d5', ry);
    }
    if (fi === 0 && floors > 1 && R() < 0.7) {
      const bw = Math.min(5, fw * 0.4), off = (R() - 0.5) * (fw - bw - 2);
      for (let fl = 1; fl < floors; fl++) {
        const by = g0 + fl * 3.3 - 0.4;
        put('det', T.box, fx + nx * 0.65 + tx * off, by, fz + nz * 0.65 + tz * off, nx ? 1.3 : bw, 0.2, nx ? bw : 1.3, pc);
        put('det', T.box, fx + nx * 1.27 + tx * off, by + 0.2, fz + nz * 1.27 + tz * off, nx ? 0.06 : bw, 0.95, nx ? bw : 0.06, '#5a5a5a');
      }
    }
    if (fi === 0 && R() < S.shop) {
      const aw = Math.min(fw - 2, 10), ac = SHOP_BG[Math.floor(R() * SHOP_BG.length)];
      put('det', T.box, fx + nx * 0.9, g0 + 2.6, fz + nz * 0.9, nx ? 1.8 : aw, 0.12, nx ? aw : 1.8, ac, 0, 0, 0);
      const k = Math.floor(R() * (SHOPS.length - 1));
      put('sign', T.plane, fx + nx * 0.08, g0 + 3.5, fz + nz * 0.08, aw * 0.8, aw * 0.8 * 92 / 504, 1, '#ffffff', ry, 0, 0, shopRect(k));
    }
  });
}

function tower(x, z, w, d, floors, col, S, R, gy, cyl) {
  const H = floors * 3.3;
  put('bld', cyl ? T.tower : T.box, x, gy - 0.5, z, w, H, d, col, 0, 1);
  collide(x, z, w + (cyl ? 0 : 6), d + (cyl ? 0 : 6), gy + H);
  const r = R();
  if (r < 0.35 && !cyl) put('bld', T.box, x, gy + H, z, w * 0.7, H * (0.12 + R() * 0.25), d * 0.7, col, 0, 1);
  else if (r < 0.55) put('det', T.box, x, gy + H, z, w * 0.85, 2.2, d * 0.85, shade(col, 0.7));
  if (R() < 0.5) put('det', T.cyl, x, gy + H, z, 0.4, 10 + R() * 25, 0.4, '#cccccc');
  if (!cyl) put('bld', T.box, x, gy - 0.5, z, w + 6, 5.5, d + 6, S.pal[0], 0, 1);
}

function villa(x, z, size, col, streetFaces, R, gy, palms) {
  const w = size * (0.5 + R() * 0.12), d = size * (0.42 + R() * 0.1), H = 2 * 3.3 + 0.5;
  put('bld', T.box, x, gy - 0.3, z, w, H, d, col, 0, 1);
  collide(x, z, w, d, gy + H);
  put('det', T.box, x, gy + H - 0.3, z, w + 0.6, 0.45, d + 0.6, shade(col, 0.85));
  const hs = size / 2 - 0.3, wc = shade(col, 0.88), wh = 2.3;
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const street = streetFaces.some(f => f[0] === nx && f[1] === nz);
    const cx = x + nx * hs, cz = z + nz * hs, long = size;
    if (!street) {
      put('det', T.box, cx, gy - 0.2, cz, nx ? 0.3 : long, wh, nx ? long : 0.3, wc);
      collide(cx, cz, nx ? 0.4 : long, nx ? long : 0.4, gy + wh, true);
    } else {
      const seg = (long - 5) / 2;
      for (const s of [-1, 1]) {
        const ox = nx ? 0 : s * (seg / 2 + 2.5), oz = nx ? s * (seg / 2 + 2.5) : 0;
        put('det', T.box, cx + ox, gy - 0.2, cz + oz, nx ? 0.3 : seg, wh, nx ? seg : 0.3, wc);
        collide(cx + ox, cz + oz, nx ? 0.4 : seg, nx ? seg : 0.4, gy + wh, true);
      }
      put('det', T.box, cx, gy, cz, nx ? 0.15 : 5, 2, nx ? 5 : 0.15, '#3d3328');
    }
  }
  palm(palms, x + (R() < 0.5 ? -1 : 1) * (size / 2 - 3), z + (R() < 0.5 ? -1 : 1) * (size / 2 - 3), 0.8 + R() * 0.3);
  if (R() < 0.6) { const f = streetFaces[0]; parkedCar(x + f[0] * (size / 2 - 4) + (f[0] ? 0 : 6), z + f[1] * (size / 2 - 4) + (f[1] ? 0 : 6), f[0] ? Math.PI / 2 : 0, gy, R); }
}

function mosque(x, z, s, R, gy) {
  const dc = ['#2e7d5b', '#c9a54a', '#ededed', '#2b6cb0'][Math.floor(R() * 4)];
  const w = 24 * s, d = 20 * s, h = 8 * s;
  put('plain', T.box, x, gy - 0.3, z, w, h, d, '#f1ece0');
  put('det', T.box, x, gy + h - 0.3, z, w + 0.6, 0.6, d + 0.6, '#e2d9c4');
  for (let k = -2; k <= 2; k++) put('det', T.box, x + k * 4.4 * s, gy, z + d / 2 + 0.02, 2.2 * s, 4.5 * s, 0.1, '#5b4a35');
  put('plain', T.cyl, x, gy + h, z, 13 * s, 2.2 * s, 13 * s, '#f1ece0');
  put('plain', T.dome, x, gy + h + 2.2 * s, z, 13 * s, 12 * s, 13 * s, dc);
  put('plain', T.cyl, x, gy + h + 8 * s, z, 0.25, 3 * s, 0.25, '#c9a54a');
  const mx = x + w / 2 - 2 * s, mz = z + d / 2 - 2 * s, mh = 30 * s;
  put('plain', T.cyl, mx, gy - 0.3, mz, 3 * s, mh, 3 * s, '#f6f1e6');
  put('plain', T.cyl, mx, gy + mh * 0.75, mz, 4.4 * s, 0.7 * s, 4.4 * s, '#e2d9c4');
  put('detEmit', T.cyl, mx, gy + mh * 0.75 + 0.7 * s, mz, 3.4 * s, 0.35, 3.4 * s, '#45d07a');
  put('plain', T.cyl, mx, gy + mh, mz, 2.2 * s, 4 * s, 2.2 * s, '#f6f1e6');
  put('plain', T.cone, mx, gy + mh + 4 * s, mz, 2.6 * s, 4 * s, 2.6 * s, dc);
  collide(x, z, w, d, gy + h + 14 * s); collide(mx, mz, 3.2 * s, 3.2 * s);
}

function lamp(x, z, nx, nz) {
  const gy = gyAt(x, z);
  put('det', T.hex, x, gy, z, 0.22, 7.5, 0.22, '#55585c');
  put('det', T.box, x + nx * 1.1, gy + 7.3, z + nz * 1.1, nx ? 2.2 : 0.15, 0.15, nx ? 0.15 : 2.2, '#55585c');
  put('detEmit', T.box, x + nx * 2.1, gy + 7.05, z + nz * 2.1, 0.7, 0.22, 0.7, '#ffe2a8');
  put('glow', T.plane, x + nx * 2.6, gy + 0.06, z + nz * 2.6, 11, 11, 1, '#ffb866', 0, 0, -Math.PI / 2, FULL);
  collide(x, z, 0.35, 0.35, 1e4, true);
}

// площадка по рельефу (тротуар, газон, парковка) с бортиком
function patch(kind, x0, z0, x1, z1, n, yOff, col, skirt = 0) {
  const pos = [], idx = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * j / n;
    pos.push(x, height(x, z) + yOff, z);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  ch((x0 + x1) / 2, (z0 + z1) / 2)[kind].raw(pos, idx, C(col));
  if (skirt) { // бортик по периметру, повторяет рельеф
    const cc = C(shade(col, 0.8)).clone();
    const edges = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
    const sp = [], si = [];
    for (const [ax, az, bx, bz] of edges) {
      const base = sp.length / 3;
      for (let k = 0; k <= n; k++) {
        const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n, h = height(x, z) + yOff;
        sp.push(x, h, z, x, h - skirt, z);
        if (k) { const q = base + (k - 1) * 2; si.push(q, q + 1, q + 2, q + 1, q + 3, q + 2, q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
    }
    ch((x0 + x1) / 2, (z0 + z1) / 2)[kind].raw(sp, si, cc);
  }
}

// ---------- главное ----------
export function buildWorld(scene) {
  chunks = new Map(); colliders = [];
  const palms = [];
  const MAT = materials(makeAtlas());

  // Небо
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uNight: U.uNight },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uTop, uHor, uSun; uniform float uNight; varying vec3 vD;
      void main(){
        float t = max(vD.y, 0.0);
        vec3 c = mix(uHor, uTop, pow(t, 0.5));
        float sd = max(dot(vD, uSun), 0.0);
        c += vec3(1.0, 0.85, 0.6) * (pow(sd, 900.0) * 3.0 + pow(sd, 12.0) * 0.25 * (1.0 - uNight));
        float md = max(dot(vD, -uSun), 0.0); c += vec3(0.9, 0.95, 1.0) * pow(md, 1500.0) * 2.0 * uNight;
        vec3 p = floor(vD * 260.0); float h = fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        c += step(0.9975, h) * uNight * smoothstep(0.0, 0.2, t) * 1.2;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);

  // Рельеф
  const SEG = 256;
  const tg = new THREE.PlaneGeometry(HALF * 2, HALF * 2, SEG, SEG).rotateX(-Math.PI / 2);
  const tp = tg.attributes.position, cols = [], tc = new THREE.Color();
  const sand = new THREE.Color('#dcbb84'), sand2 = new THREE.Color('#c99f68'), pave = new THREE.Color('#b5ab9b'),
        rock = new THREE.Color('#b59d7a'), red = new THREE.Color('#9a6a4a'), dark = new THREE.Color('#7a5a44'),
        beach = new THREE.Color('#efdfb5'), wet = new THREE.Color('#8e8a6e'), dirt = new THREE.Color('#c4a47c');
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), h = height(x, z);
    tp.setY(i, h);
    const n = Math.sin(x * 0.013 + Math.sin(z * 0.011)) * 0.5 + 0.5;
    tc.copy(sand).lerp(sand2, n * 0.6 + Math.max(0, Math.min(1, (h - 4) / 10)) * 0.2);
    const ad = Math.hypot(x - CITY.amman.x, z - CITY.amman.z);
    tc.lerp(rock, (1 - smooth(600, 1400, ad)) * 0.7);
    const ma = mountainAmount(x, z) * smooth(10, 60, h);
    if (ma > 0) { tc.lerp(red, ma * 0.85); tc.lerp(dark, ma * smooth(80, 170, h) * 0.6); }
    tc.lerp(dirt, villageFlat(x, z) * 0.6);
    tc.lerp(pave, cityMask(x, z) * 0.92);
    const e = Math.max(x - coastE(z), coastW(z) - x);
    tc.lerp(beach, smooth(-260, -60, e) * (1 - smooth(-20, 40, e)));
    if (e > -10) tc.lerp(wet, smooth(-10, 60, e));
    cols.push(tc.r, tc.g, tc.b);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = true; scene.add(terrain);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2.6, HALF * 2.6).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: '#2a8fa6', transparent: true, opacity: 0.9 }));
  water.position.y = -1.4; scene.add(water);

  // Дороги
  const hwyMat = new THREE.MeshLambertMaterial({ map: roadTexture('hwy'), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const stMat = new THREE.MeshLambertMaterial({ map: roadTexture('st'), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const m of [
    new THREE.Mesh(ribbon(HIGHWAYS, ROAD_Y + 0.1, 8, 24), hwyMat),
    new THREE.Mesh(ribbon(STREETS.filter(s => s.dir === 'h'), ROAD_Y, 8, 20), stMat),
    new THREE.Mesh(ribbon(STREETS.filter(s => s.dir === 'v'), ROAD_Y + 0.05, 8, 20), stMat),
  ]) { m.receiveShadow = true; scene.add(m); }

  // Кварталы под достопримечательности
  const pick = (c, cands) => { for (const [i, j] of cands) if (blockValid(c, i, j)) return { x: c.x + (i + 0.5) * BLOCK, z: c.z + (j + 0.5) * BLOCK, key: c.id + ':' + i + ':' + j }; return null; };
  const CANDS = [[1, -3], [-3, 1], [2, 2], [-3, -3], [0, -2], [2, -2], [-2, 2], [1, 3], [-4, 0], [3, 0]];
  const LMK = { dubai: pick(CITY.dubai, CANDS), riyadh: pick(CITY.riyadh, CANDS), doha: pick(CITY.doha, CANDS), amman: pick(CITY.amman, [[-3, -3], [-2, -4], [-4, -2], [2, 2]]) };
  const reserved = new Set(Object.values(LMK).filter(Boolean).map(p => p.key));

  // Города
  CITIES.forEach((c, ci) => {
    const S = STYLES[c.style], R = rng(1000 + ci * 97);
    const n = Math.floor(c.r / BLOCK), U2 = BLOCK - STREET_W, IN = U2 - SIDEWALK * 2;
    let mosqueDone = false;
    for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) {
      const bx = c.x + (i + 0.5) * BLOCK, bz = c.z + (j + 0.5) * BLOCK;
      const dc = Math.hypot(bx - c.x, bz - c.z), centr = 1 - dc / c.r;
      if (!blockValid(c, i, j)) {
        if (dc < c.r - 45 && HWY_GRID.dist(bx, bz) > 4) for (let k = 0; k < 3; k++) {
          const px = bx + (R() - 0.5) * IN, pz = bz + (R() - 0.5) * IN;
          if (HWY_GRID.dist(px, pz) > 3) palm(palms, px, pz, 0.8 + R() * 0.4);
        }
        continue;
      }
      const x0 = bx - U2 / 2, x1 = bx + U2 / 2, z0 = bz - U2 / 2, z1 = bz + U2 / 2;
      const gy = gyAt(bx, bz);
      patch('plain', x0, z0, x1, z1, 6, ROAD_Y + CURB, '#cbc4b6', ROAD_Y + CURB + 0.3);
      lamp(bx, z0 + 0.6, 0, -1); lamp(x0 + 0.6, bz, -1, 0);
      if (dc < c.r * 0.45) {
        const tx = x0 + 0.8, tz = z0 + 0.8;
        put('det', T.hex, tx, gy, tz, 0.2, 4.2, 0.2, '#2b2b2b');
        put('det', T.box, tx, gy + 4.2, tz, 0.45, 1.3, 0.45, '#1c1c1c');
        put('detEmit', T.box, tx - 0.24, gy + 4.95, tz, 0.05, 0.3, 0.3, '#ff3b30');
        put('detEmit', T.box, tx - 0.24, gy + 4.35, tz, 0.05, 0.3, 0.3, '#34c759');
        collide(tx, tz, 0.3, 0.3, 1e4, true);
        put('sign', T.plane, bx, height(bx, z0 - 6) + ROAD_Y + 0.07, z0 - 6, 10, 4, 1, '#ffffff', 0, 0, -Math.PI / 2, ZEBRA);
        put('sign', T.plane, x0 - 6, height(x0 - 6, bz) + ROAD_Y + 0.09, bz, 10, 4, 1, '#ffffff', Math.PI / 2, 0, -Math.PI / 2, ZEBRA);
      }
      if (reserved.has(c.id + ':' + i + ':' + j)) continue;

      const r = R();
      const lx0 = bx - IN / 2, lz0 = bz - IN / 2;
      if ((!mosqueDone && dc > 120 && dc < c.r * 0.5) || r < 0.025) {
        mosqueDone = true;
        patch('plain', lx0, lz0, lx0 + IN, lz0 + IN, 4, ROAD_Y + CURB + 0.02, '#e6dfcf');
        mosque(bx, bz, 1, R, gy);
        palm(palms, lx0 + 3, lz0 + 3); palm(palms, lx0 + IN - 3, lz0 + 3); palm(palms, lx0 + 3, lz0 + IN - 3);
      } else if (r < S.park + 0.025) {
        patch('plain', lx0, lz0, lx0 + IN, lz0 + IN, 4, ROAD_Y + CURB + 0.02, '#6f9440');
        for (let k = 0; k < 7; k++) palm(palms, lx0 + 4 + R() * (IN - 8), lz0 + 4 + R() * (IN - 8), 0.8 + R() * 0.5);
        put('plain', T.cyl, bx, gy, bz, 7, 0.8, 7, '#d8d0c0'); put('detEmit', T.cyl, bx, gy + 0.8, bz, 6, 0.05, 6, '#4fb6d9');
        put('det', T.cyl, bx, gy + 0.8, bz, 0.6, 2.2, 0.6, '#d8d0c0'); collide(bx, bz, 7, 7, gy + 1);
        for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put('det', T.box, bx + sx * 9, gy, bz + sz * 9, sz ? 2.5 : 0.7, 0.5, sz ? 0.7 : 2.5, '#7a5a3a');
      } else if (r < S.park + 0.07 && centr > 0.3) {
        patch('plain', lx0, lz0, lx0 + IN, lz0 + IN, 4, ROAD_Y + CURB + 0.02, '#47484c');
        for (let row = 0; row < 3; row++) for (let k = 0; k < 8; k++) {
          const px = lx0 + 4 + k * 6.2, pz = lz0 + 8 + row * 17;
          put('det', T.box, px - 3.1, gy + 0.03, pz - 2.5, 0.12, 0.02, 5, '#e8e8e0');
          if (R() < 0.55) parkedCar(px, pz, R() < 0.5 ? 0 : Math.PI, gy, R);
        }
      } else if (R() < S.tower * (0.3 + centr * 2)) {
        const sz = IN * (0.55 + R() * 0.25);
        const fl = S.tFloors[0] + R() * (S.tFloors[1] - S.tFloors[0]) * (0.45 + centr * 0.55);
        const isCyl = R() < S.cyl;
        tower(bx, bz, sz, sz * (isCyl ? 1 : 0.8 + R() * 0.2), Math.round(fl), S.glass[Math.floor(R() * S.glass.length)], S, R, gy, isCyl);
        palm(palms, lx0 + 1.5, lz0 + 1.5); palm(palms, lx0 + IN - 1.5, lz0 + IN - 1.5);
      } else {
        const villas = centr < 0.45 && R() < S.villa * 2;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const lx = bx + sx * IN / 4, lz = bz + sz * IN / 4;
          const faces = [[sx, 0], [0, sz]];
          if (R() < 0.06) { palm(palms, lx, lz); continue; }
          if (villas) villa(lx, lz, IN / 2, S.pal[Math.floor(R() * S.pal.length)], faces, R, gyAt(lx, lz), palms);
          else {
            const w = IN / 2 - 2 - R() * 4, d = IN / 2 - 2 - R() * 4;
            house(lx + sx * (IN / 4 - w / 2 - 0.5), lz + sz * (IN / 4 - d / 2 - 0.5), w, d,
              S.floors[0] + Math.floor(R() * (S.floors[1] - S.floors[0] + 1)), S.pal[Math.floor(R() * S.pal.length)], R() < 0.5 ? faces : [faces[1], faces[0]], S, R, ROAD_Y + CURB);
          }
        }
      }
    }
  });

  // Достопримечательности
  const dub = LMK.dubai;
  if (dub) { let y = 0; for (const [r, h] of [[19, 120], [16, 105], [12.5, 90], [9.5, 80], [6.5, 65], [4, 50], [1.3, 110]]) { put(r > 3 ? 'bld' : 'plain', T.tower, dub.x, y, dub.z, r * 2, h, r * 2, '#c9d6df', 0, r > 3 ? 1 : 0); y += h; } collide(dub.x, dub.z, 40, 40); }
  const ry = LMK.riyadh;
  if (ry) {
    put('bld', T.box, ry.x, 0, ry.z, 44, 205, 28, '#8fa6b4', 0, 1);
    put('bld', T.box, ry.x - 16.5, 205, ry.z, 11, 85, 28, '#8fa6b4', 0, 1); put('bld', T.box, ry.x + 16.5, 205, ry.z, 11, 85, 28, '#8fa6b4', 0, 1);
    put('plain', T.box, ry.x, 262, ry.z, 22, 5, 8, '#c7d1d8'); collide(ry.x, ry.z, 44, 28);
  }
  const dh = LMK.doha;
  if (dh) { put('bld', T.tower, dh.x, 0, dh.z, 38, 205, 38, '#6f9bb5', 0, 1); put('plain', T.cone, dh.x, 205, dh.z, 38, 45, 38, '#6f9bb5'); collide(dh.x, dh.z, 38, 38); }
  let flag = null;
  const fp = LMK.amman;
  if (fp) {
    const fy = gyAt(fp.x, fp.z);
    put('plain', T.cyl, fp.x, fy, fp.z, 1.6, 120, 1.6, '#dddddd'); collide(fp.x, fp.z, 2, 2);
    flag = new THREE.Mesh(new THREE.PlaneGeometry(40, 20, 12, 1), new THREE.MeshLambertMaterial({ map: jordanFlag(), side: THREE.DoubleSide }));
    flag.position.set(fp.x + 20.8, fy + 108, fp.z); scene.add(flag);
  }
  const J = CITY.jeddah, jx = coastW(J.z) - 140;
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 1.2, 240, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
  jet.position.set(jx, 118, J.z); scene.add(jet);
  const spray = new THREE.Mesh(new THREE.SphereGeometry(16, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45 }));
  spray.position.set(jx, 236, J.z); scene.add(spray);

  // Заправки и деревни
  const R2 = rng(4242);
  for (const st of STOPS) {
    const { gas: g, ry: a, dx, dz, nx, nz } = st;
    // lx — от трассы (вдоль n), lz — вдоль трассы
    const L = (lx, lz) => [g.x + nx * lx + dx * lz, g.z + nz * lx + dz * lz];
    const gy = height(g.x, g.z) + 0.12;
    const pp = [];
    for (const [lx, lz] of [[-16, -24], [16, -24], [16, 24], [-16, 24]]) { const [px, pz] = L(lx, lz); pp.push(px, height(px, pz) + 0.12, pz); }
    ch(g.x, g.z).plain.raw(pp, [0, 2, 1, 0, 3, 2], C('#8d8a85'));
    ch(g.x, g.z).plain.raw(pp, [0, 1, 2, 0, 2, 3], C('#8d8a85'));
    const [cx, cz] = L(-3, 0);
    put('plain', T.box, cx, gy + 5.2, cz, 14, 0.7, 18, '#f2f2f2', a);
    put('emit', T.box, cx, gy + 5.0, cz, 14.2, 0.3, 18.2, '#d62828', a);
    for (const [px, pz] of [[-8, -7], [2, -7], [-8, 7], [2, 7]]) { const [qx, qz] = L(px, pz); put('plain', T.box, qx, gy, qz, 0.5, 5.2, 0.5, '#e8e8e8', a); collide(qx, qz, 0.6, 0.6, 1e4, true); }
    for (const px of [-6, 0]) {
      const [qx, qz] = L(px, 0); put('plain', T.box, qx, gy, qz, 1.2, 0.3, 4, '#cfcfcf', a);
      for (const s of [-1, 1]) { const [rx, rz] = L(px, s); put('plain', T.box, rx, gy + 0.3, rz, 0.8, 1.6, 0.5, '#d62828', a); }
      collide(qx, qz, 2.5, 2.5, 1e4, true);
    }
    const [sx, sz] = L(10, 0);
    put('bld', T.box, sx, gy, sz, 7, 4.2, 12, '#f0ece2', a, 1); collide(sx, sz, 11, 11, gy + 4.5);
    const [sgx, sgz] = L(6.4, 0);
    put('sign', T.plane, sgx, gy + 3.3, sgz, 8, 8 * 92 / 504, 1, '#fff', Math.atan2(-nx, -nz), 0, 0, shopRect(15));
    const [px, pz] = L(14, -20);
    put('plain', T.box, px, gy, pz, 0.6, 9, 0.6, '#888'); put('emit', T.box, px, gy + 9, pz, 0.5, 4, 3, '#d62828', a);
    // деревня
    const v = st.village;
    mosque(v.x, v.z, 0.6, R2, height(v.x, v.z));
    for (let k = 0; k < 11; k++) {
      const ang = k / 11 * Math.PI * 2 + R2() * 0.3, rad = 34 + R2() * 50;
      const hx = v.x + Math.cos(ang) * rad, hz = v.z + Math.sin(ang) * rad;
      if (HWY_GRID.dist(hx, hz) < 20) continue;
      const w = 9 + R2() * 6, d = 8 + R2() * 6;
      house(hx, hz, w, d, 1 + Math.floor(R2() * 2), ['#c8a77a', '#d9c09a', '#b8956a', '#e3d2b2'][Math.floor(R2() * 4)], [[Math.sign(v.x - hx) || 1, 0]], { shop: 0.1 }, R2, 0.3);
      if (R2() < 0.5) palm(palms, hx + w / 2 + 2, hz + d / 2 + 2, 0.9);
      if (R2() < 0.3) parkedCar(hx - w / 2 - 3, hz, 0, height(hx - w / 2 - 3, hz), R2);
    }
    // рекламный щит
    const hw = HIGHWAYS[st.hwy], bp = hw.pts[Math.floor(hw.pts.length * 0.28)];
    const bxp = bp[0] + nx * 26, bzp = bp[1] + nz * 26, by = height(bxp, bzp);
    const face = Math.atan2(-nx, -nz);
    put('plain', T.box, bxp, by, bzp, 0.6, 8, 0.6, '#777'); put('plain', T.box, bxp, by + 8, bzp, 12.4, 6.4, 0.4, '#555', face);
    put('sign', T.plane, bxp - nx * 0.25, by + 11.2, bzp - nz * 0.25, 12, 6, 1, '#fff', face, 0, 0, adRect(st.hwy % 3));
    // фонари вдоль трассы
    for (let i = 2; i < hw.pts.length - 2; i += 2) {
      const p = hw.pts[i], q = hw.pts[i + 1]; let ex = q[0] - p[0], ez = q[1] - p[1]; const l = Math.hypot(ex, ez); ex /= l; ez /= l;
      const lx = p[0] - ez * 10.5, lz = p[1] + ex * 10.5;
      if (cityMask(lx, lz) > 0.3) continue;
      const ly = height(lx, lz);
      put('det', T.hex, lx, ly, lz, 0.25, 9, 0.25, '#7a7d80');
      put('detEmit', T.box, lx + ez * 1.4, ly + 8.8, lz - ex * 1.4, 0.8, 0.25, 0.8, '#ffe2a8');
      put('glow', T.plane, lx + ez * 2.5, height(lx + ez * 2.5, lz - ex * 2.5) + ROAD_Y + 0.2, lz - ex * 2.5, 13, 13, 1, '#ffb866', 0, 0, -Math.PI / 2, FULL);
      collide(lx, lz, 0.4, 0.4, 1e4, true);
    }
  }

  // Дорожные указатели
  for (const h of HIGHWAYS) {
    for (const [from, to, pts] of [[h.a, h.b, h.pts], [h.b, h.a, [...h.pts].reverse()]]) {
      const C0 = CITY[from], T0 = CITY[to];
      let k = 0; while (k < pts.length - 2 && Math.hypot(pts[k][0] - C0.x, pts[k][1] - C0.z) < C0.r + 150) k++;
      const p = pts[k], q = pts[k + 1]; let dx = q[0] - p[0], dz = q[1] - p[1]; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      let rest = 0; for (let i = k; i < pts.length - 1; i++) rest += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      const sx = p[0] + dz * 12.5, sz = p[1] - dx * 12.5, sy = height(sx, sz);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshLambertMaterial({ map: roadSign(T0.ar, T0.en, (rest / 1000).toFixed(1)), side: THREE.DoubleSide }));
      board.position.set(sx, sy + 7, sz); board.rotation.y = Math.atan2(-dx, -dz); scene.add(board);
      put('plain', T.box, sx, sy, sz, 0.35, 5.2, 0.35, '#777'); collide(sx, sz, 0.5, 0.5, 1e4, true);
    }
  }

  // Пустыня: кусты, камни, верблюды
  const R3 = rng(99);
  const desertOK = (x, z) => cityMask(x, z) < 0.05 && HWY_GRID.dist(x, z) > 15 && height(x, z) > 0.3 && villageFlat(x, z) < 0.5;
  const bushes = [], rocks = [], camels = [];
  for (let k = 0; k < 5000 && bushes.length < 2600; k++) { const x = (R3() - 0.5) * 7600, z = (R3() - 0.5) * 7600; if (desertOK(x, z) && mountainAmount(x, z) < 0.5) bushes.push([x, z, 0.5 + R3() * 1.1]); }
  for (let k = 0; k < 4000 && rocks.length < 1100; k++) { const x = (R3() - 0.5) * 7600, z = (R3() - 0.5) * 7600; if (desertOK(x, z) && (mountainAmount(x, z) > 0.2 || R3() < 0.2)) rocks.push([x, z, 0.8 + R3() * 3.5]); }
  for (let gk = 0; gk < 14; gk++) {
    let x, z, tries = 0; do { x = (R3() - 0.5) * 7000; z = (R3() - 0.5) * 7000; tries++; } while ((!desertOK(x, z) || mountainAmount(x, z) > 0.1 || HWY_GRID.dist(x, z) > 600) && tries < 200);
    const nC = 2 + Math.floor(R3() * 4); for (let k = 0; k < nC; k++) camels.push([x + (R3() - 0.5) * 30, z + (R3() - 0.5) * 30, R3() * 6.28]);
  }
  const inst = (geo, mat, list, f) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
    list.forEach((it, k) => { f(o, it); o.updateMatrix(); im.setMatrixAt(k, o.matrix); });
    im.frustumCulled = false; im.castShadow = true; scene.add(im); return im;
  };
  inst(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#8a8749', flatShading: true }), bushes, (o, [x, z, s]) => { o.position.set(x, height(x, z) + s * 0.3, z); o.scale.set(s, s * 0.6, s); o.rotation.set(0, x, 0); });
  inst(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#8f7660', flatShading: true }), rocks, (o, [x, z, s]) => { o.position.set(x, height(x, z) + s * 0.2, z); o.scale.set(s, s * 0.7, s * 1.2); o.rotation.set(x, z, 0); });
  const cb = new Batch();
  const cm = (x, y, z, w, h, d, rx = 0) => { _e.set(rx, 0, 0); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(w, h, d)); cb.add(T.box, _m, C('#c49a62')); };
  cm(0, 1.5, 0, 0.9, 0.8, 2.0); cm(0, 2.2, -0.15, 0.7, 0.55, 0.8); cm(0, 1.9, 1.05, 0.35, 1.1, 0.35, -0.5); cm(0, 2.75, 1.5, 0.35, 0.35, 0.75);
  for (const [lx, lz] of [[-0.3, 0.75], [0.3, 0.75], [-0.3, -0.75], [0.3, -0.75]]) cm(lx, 0, lz, 0.2, 1.55, 0.2);
  inst(cb.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), camels, (o, [x, z, a]) => { o.position.set(x, height(x, z), z); o.rotation.set(0, a, 0); });

  // Пальмы
  const crownB = new Batch(), tr = new THREE.Matrix4().makeTranslation(0, 0, 0.5);
  for (let k = 0; k < 7; k++) { _e.set(-0.5, k / 7 * Math.PI * 2, 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(0, 8.2, 0), _q, _s.set(0.9, 0.12, 4.2)).multiply(tr); crownB.add(T.box, _m, C('#4c8a36')); }
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.36, 8.4, 5, 1, true).translate(0, 4.2, 0);
  const palmF = (o, [x, z, s]) => { o.position.set(x, height(x, z) + (cityMask(x, z) > 0.5 ? ROAD_Y + CURB : 0), z); o.rotation.set(0, x * 13.1, 0); o.scale.setScalar(s); };
  const crownGeo = crownB.geometry(), trunkMat = new THREE.MeshLambertMaterial({ color: '#8a6a45' }), crownMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const palmCells = new Map();
  for (const p of palms) { const k = Math.floor(p[0] / 600) * 100 + Math.floor(p[1] / 600); if (!palmCells.has(k)) palmCells.set(k, []); palmCells.get(k).push(p); }
  const palmLod = [];
  for (const list of palmCells.values()) for (const [geo, m] of [[trunkGeo, trunkMat], [crownGeo, crownMat]]) {
    const im = inst(geo, m, list, palmF); im.frustumCulled = true; im.computeBoundingSphere();
    palmLod.push({ m: im, x: list[0][0], z: list[0][1] });
  }

  // Чанки в сцену
  const lod = [];
  for (const c of chunks.values()) {
    for (const k of KINDS) {
      const g = c[k].geometry(); if (!g) continue;
      const m = new THREE.Mesh(g, MAT[k]);
      m.castShadow = k === 'bld' || k === 'plain' || k === 'det'; m.receiveShadow = true;
      scene.add(m);
      if (k === 'det' || k === 'detEmit' || k === 'sign' || k === 'glow') lod.push({ m, x: c.x, z: c.z });
      if (k === 'glow') m.castShadow = m.receiveShadow = false;
    }
  }
  chunks = null;

  // Маркеры
  const markers = [];
  const ringGeo = new THREE.TorusGeometry(2.2, 0.15, 8, 32).rotateX(Math.PI / 2);
  const colGeo = new THREE.CylinderGeometry(2.2, 2.2, 3, 24, 1, true).translate(0, 1.5, 0);
  const addMarker = (kind, city, p, color, label) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color })));
    g.add(new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })));
    const s = textSprite(label, { bg: 'rgba(0,0,0,0.6)', color, scale: 0.9 }); s.position.y = 4.6; g.add(s);
    g.position.set(p.x, height(p.x, p.z) + ROAD_Y + 0.15, p.z); scene.add(g);
    markers.push({ kind, city, x: p.x, z: p.z, obj: g });
  };
  for (const c of CITIES) {
    const P = cityPoints(c);
    addMarker('office', c.id, P.office, '#ffcc33', 'توصيل');
    addMarker('showroom', c.id, P.showroom, '#3fa9ff', 'معرض السيارات');
  }
  FOOD_SPOTS.forEach(p => addMarker('food', null, p, '#ff7b39', 'شاورما'));

  // Сетка коллизий
  const CG = 40, cgrid = new Map();
  for (const b of colliders) {
    for (let i = Math.floor(b.x0 / CG); i <= Math.floor(b.x1 / CG); i++)
      for (let j = Math.floor(b.z0 / CG); j <= Math.floor(b.z1 / CG); j++) {
        const k = i * 100003 + j; let a = cgrid.get(k); if (!a) cgrid.set(k, a = []); a.push(b);
      }
  }
  const near = (x, z, r) => {
    const out = new Set();
    for (let i = Math.floor((x - r) / CG); i <= Math.floor((x + r) / CG); i++)
      for (let j = Math.floor((z - r) / CG); j <= Math.floor((z + r) / CG); j++) { const a = cgrid.get(i * 100003 + j); if (a) for (const b of a) out.add(b); }
    return out;
  };

  lod.push(...palmLod.map(p => ({ ...p, far: true })));
  return { sky, water, markers, near, flag, lod, glow: MAT.glow, stats: { colliders: colliders.length, palms: palms.length } };
}

function jordanFlag() {
  const c = document.createElement('canvas'); c.width = 240; c.height = 120; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 240, 40); g.fillStyle = '#fff'; g.fillRect(0, 40, 240, 40); g.fillStyle = '#007a3d'; g.fillRect(0, 80, 240, 40);
  g.fillStyle = '#ce1126'; g.beginPath(); g.moveTo(0, 0); g.lineTo(120, 60); g.lineTo(0, 120); g.fill();
  g.fillStyle = '#fff'; g.beginPath();
  for (let i = 0; i < 14; i++) { const r = i % 2 ? 6 : 14, a = i / 14 * Math.PI * 2 - Math.PI / 2; g.lineTo(40 + Math.cos(a) * r, 60 + Math.sin(a) * r); }
  g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function makeTargetBeam() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 300, 16, 1, true).translate(0, 150, 0),
    new THREE.MeshBasicMaterial({ color: '#36e27a', transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(4, 0.3, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#36e27a' })));
  g.visible = false;
  return g;
}
