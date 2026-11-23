// Строит 3D-мир: рельеф, море, дороги, кварталы с тротуарами, дома с баками на крышах,
// магазины с арабскими вывесками, мечети, виллы, парковки, фонари, заправки, деревни, горы, верблюды.
// Всё статичное склеивается в большие куски (чанки) — так быстрее на телефоне.
import * as THREE from 'three';
import {
  HALF, CITIES, CITY, BLOCK, STREET_W, SIDEWALK, ROAD_Y, CURB, HIGHWAYS, STREETS, STOPS, HWY_GRID,
  height, cityMask, coastE, coastW, rng, smooth, cityPoints, blockValid, mountainAmount, villageFlat, FOOD_SPOTS, KIOSKS,
} from '../shared/world.js';

export const U = { uNight: { value: 0 } }; // общая «ночь» для всех материалов

const STYLES = {
  amman:  { floors: [2, 5],  tower: 0.03, tFloors: [12, 26], pal: ['#ece2cc', '#e2d6bb', '#d8c9a7', '#f2eada', '#d2c3a0'], glass: ['#93a9b7', '#7f98a8'], cyl: 0,    shop: 0.45, villa: 0.35, park: 0.05 },
  riyadh: { floors: [2, 6],  tower: 0.09, tFloors: [18, 45], pal: ['#ddc7a3', '#cdb690', '#e3d7c0', '#bfab8d'],             glass: ['#7f98a8', '#5d7a8c', '#a7b8c2'], cyl: 0.06, shop: 0.4, villa: 0.4, park: 0.06 },
  dubai:  { floors: [4, 12], tower: 0.4,  tFloors: [28, 85], pal: ['#ecebe6', '#d9dcde', '#c7ced4'],                       glass: ['#5b86a6', '#7aa4c2', '#9cc0d6', '#3f6f8f', '#b9cdd8', '#8c9aa6'], cyl: 0.22, shop: 0.3, villa: 0.3, park: 0.08 },
  doha:   { floors: [3, 9],  tower: 0.26, tFloors: [22, 60], pal: ['#e8dfcf', '#dbd0b9', '#efe7d8'],                       glass: ['#6f9bb5', '#4d7f99', '#a6c4d4', '#c9b37a'], cyl: 0.45, shop: 0.35, villa: 0.35, park: 0.07 },
  jeddah: { floors: [2, 6],  tower: 0.1,  tFloors: [16, 40], pal: ['#f3f0e9', '#e9e3d7', '#ddd4c3', '#cfa384', '#e8d9c0'],  glass: ['#7da6bd', '#9cbccd'], cyl: 0.08, shop: 0.45, villa: 0.35, park: 0.07 },
};
// материал стен по городам (слои фото-текстур): Джидда — коралловый камень, Нажд — глина и штукатурка
const WALLS = { amman: [1, 3, 0], riyadh: [1, 0, 3], dubai: [0, 3], doha: [0, 3, 1], jeddah: [2, 2, 0] };
for (const k in STYLES) STYLES[k].wall = WALLS[k];
const wallCode = (code, S, R) => code + 10 * (S?.wall ? S.wall[Math.floor(R() * S.wall.length)] : 1);
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
    if (v > this.vc) { this.pos = grow(this.pos || new Float32Array(0), v * 3); this.nor = grow(this.nor || new Float32Array(0), v * 3); this.col = grow(this.col || new Float32Array(0), v * 3); this.uv = grow(this.uv || new Float32Array(0), v * 2); this.win = grow(this.win || new Float32Array(0), v); this.base = grow(this.base || new Float32Array(0), v); this.vc = v; }
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
      this.win[b + i] = win; this.base[b + i] = e[13]; // низ фигуры — для грязи у земли
      if (rect && t.uv) { this.uv[(b + i) * 2] = rect[0] + t.uv[i * 2] * rect[2]; this.uv[(b + i) * 2 + 1] = rect[1] + t.uv[i * 2 + 1] * rect[3]; }
    }
    if (t.idx) for (let k = 0; k < t.idx.length; k++) this.idx[this.ni + k] = b + t.idx[k];
    else for (let k = 0; k < t.count; k++) this.idx[this.ni + k] = b + k;
    this.n += t.count; this.ni += nIdx;
  }
  raw(pos, idx, col, win = 0) { // произвольная сетка, нормаль вверх
    const nv = pos.length / 3; this.ensure(nv, idx.length); const b = this.n;
    this.pos.set(pos, b * 3);
    for (let i = 0; i < nv; i++) { const o = (b + i) * 3; this.nor[o] = 0; this.nor[o + 1] = 1; this.nor[o + 2] = 0; this.col[o] = col.r; this.col[o + 1] = col.g; this.col[o + 2] = col.b; this.win[b + i] = win; this.base[b + i] = -1e4; }
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
    g.setAttribute('aBase', new THREE.BufferAttribute(this.base.slice(0, this.n), 1));
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
// 1024×2048: верх — вывески магазинов, зебра, реклама; низ — граффити, площадка, неон
const ATLAS = 1024, ATLAS_H = 2048;
const GRAFFITI = [['الرياض', '#ff4fa3', '#ffe14f'], ['حارتنا', '#4fd1ff', '#7cff6b'], ['عرب', '#ffb14f', '#ff4f4f'], ['ملوك الحي', '#b47cff', '#4fffd8']];
function drawGraffiti(g, x, y, [txt, c1, c2], k) {
  g.save(); g.beginPath(); g.rect(x, y, 512, 256); g.clip();
  // брызги краски вокруг
  for (let i = 0; i < 260; i++) { g.fillStyle = i % 2 ? c1 : c2; g.globalAlpha = 0.25 + Math.random() * 0.35; const r = Math.random() * 3.2; g.beginPath(); g.arc(x + 40 + Math.random() * 432, y + 30 + Math.random() * 196, r, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  const fs = txt.length > 5 ? 96 : 128;
  g.font = `900 ${fs}px Cairo, Tahoma, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  g.translate(x + 256, y + 124); g.rotate((k % 2 ? -1 : 1) * 0.09);
  g.lineJoin = 'round'; g.lineWidth = 30; g.strokeStyle = '#141414'; g.strokeText(txt, 0, 0);
  g.lineWidth = 14; g.strokeStyle = '#ffffff'; g.strokeText(txt, 0, 0);
  const gr = g.createLinearGradient(0, -fs / 2, 0, fs / 2); gr.addColorStop(0, c2); gr.addColorStop(1, c1);
  g.fillStyle = gr; g.fillText(txt, 0, 0);
  // подтёки
  g.fillStyle = c1; for (let i = 0; i < 7; i++) { const dx = -170 + Math.random() * 340; g.fillRect(dx, fs * 0.3, 5, 20 + Math.random() * 46); }
  g.restore();
}
function drawNeon(g, x, y, txt, col) {
  g.fillStyle = '#120a16'; g.fillRect(x, y, 512, 128);
  g.font = '900 78px Cairo, Tahoma, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  g.shadowColor = col; g.shadowBlur = 24; g.lineWidth = 6; g.strokeStyle = col; g.strokeText(txt, x + 256, y + 66);
  g.shadowBlur = 8; g.fillStyle = '#fff6fb'; g.fillText(txt, x + 256, y + 66); g.shadowBlur = 0;
  g.strokeStyle = col; g.lineWidth = 5; g.strokeRect(x + 10, y + 10, 492, 108);
}
function makeAtlas() {
  const c = document.createElement('canvas'); c.width = ATLAS; c.height = ATLAS_H; const g = c.getContext('2d');
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
  // граффити (прозрачный фон — стена видна сквозь)
  GRAFFITI.forEach((gf, k) => drawGraffiti(g, (k % 2) * 512, 1024 + Math.floor(k / 2) * 256, gf, k));
  // баскетбольная площадка: разметка на асфальте
  { const x = 0, y = 1536; g.fillStyle = '#3f5a46'; g.fillRect(x, y, 512, 256); g.fillStyle = '#b5523b'; g.fillRect(x + 16, y + 16, 480, 224);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 5; g.strokeRect(x + 16, y + 16, 480, 224); g.beginPath(); g.moveTo(x + 256, y + 16); g.lineTo(x + 256, y + 240); g.stroke();
    g.beginPath(); g.arc(x + 256, y + 128, 34, 0, 7); g.stroke();
    for (const s of [0, 1]) { const ex = s ? x + 496 : x + 16, d = s ? -1 : 1; g.strokeRect(Math.min(ex, ex + d * 92), y + 88, 92, 80); g.beginPath(); g.arc(ex, y + 128, 110, s ? Math.PI / 2 : -Math.PI / 2, s ? Math.PI * 1.5 : Math.PI / 2); g.stroke(); } }
  drawNeon(g, 512, 1536, 'مول النجوم', '#ff3fd2');
  drawNeon(g, 512, 1664, 'موتيل الصحراء', '#3fd8ff');
  drawNeon(g, 0, 1792, 'مطعم الطريق', '#ffb03f');
  drawNeon(g, 512, 1792, 'ميناء جدة', '#3fff8a');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const rect = (x, y, w, h) => [x / ATLAS, 1 - (y + h) / ATLAS_H, w / ATLAS, h / ATLAS_H];
const graffitiRect = k => rect((k % 2) * 512, 1024 + Math.floor(k / 2) * 256, 512, 256);
const COURT = rect(0, 1536, 512, 256);
const NEON = { mall: rect(512, 1536, 512, 128), motel: rect(512, 1664, 512, 128), diner: rect(0, 1792, 512, 128), port: rect(512, 1792, 512, 128) };
const shopRect = k => rect((k % 2) * 512 + 4, Math.floor(k / 2) * 96 + 2, 504, 92);
const ZEBRA = rect(0, 768, 256, 256);
const adRect = k => rect(256 + k * 256, 832, 256, 128);

// ---------- фото-текстуры (Poly Haven, CC0) ----------
// стены и металл лежат слоями в одной текстуре-массиве: слой выбирается кодом в aWin (код + 10 × слой)
const TEX_DIR = '/textures/';
const LAYERS = ['wall_plaster', 'wall_clay', 'wall_coral', 'wall_concrete', 'wall_old', 'metal_corrugated', 'metal_container', 'ground_pavers'];
export const LAYER = Object.fromEntries(LAYERS.map((n, i) => [n, i]));
const TEX = { walls: null, avg: [], sand: null, beach: null, asphaltImg: null, sandAvg: new THREE.Vector3(1, 1, 1), beachAvg: new THREE.Vector3(1, 1, 1) };
const loadImg = n => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = TEX_DIR + n + '.webp'; });
const pixels = (im, S = 512) => { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, S, S); return g.getImageData(0, 0, S, S).data; };
// средний цвет картинки: фото даёт только «рельеф», а цвет дома остаётся своим
// (в линейной шкале, как видеокарта читает sRGB-текстуру)
const lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const avgOf = px => { let r = 0, gg = 0, b = 0, n = 0; for (let i = 0; i < px.length; i += 16) { r += lin(px[i] / 255); gg += lin(px[i + 1] / 255); b += lin(px[i + 2] / 255); n++; } return new THREE.Vector3(r / n, gg / n, b / n); };
export async function loadWorldTextures() {
  try {
    const [layerImgs, sand, beach, asphalt] = await Promise.all([Promise.all(LAYERS.map(loadImg)), loadImg('ground_sand'), loadImg('ground_beach'), loadImg('ground_asphalt')]);
    const S = 512, data = new Uint8Array(S * S * 4 * LAYERS.length);
    layerImgs.forEach((im, k) => { const px = pixels(im, S); data.set(px, k * S * S * 4); TEX.avg[k] = avgOf(px); });
    const arr = new THREE.DataArrayTexture(data, S, S, LAYERS.length);
    arr.format = THREE.RGBAFormat; arr.colorSpace = THREE.SRGBColorSpace; arr.wrapS = arr.wrapT = THREE.RepeatWrapping;
    arr.generateMipmaps = true; arr.minFilter = THREE.LinearMipmapLinearFilter; arr.magFilter = THREE.LinearFilter; arr.anisotropy = 4; arr.needsUpdate = true;
    TEX.walls = arr;
    const tex2 = im => { const t = new THREE.Texture(im); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true; return t; };
    TEX.sand = tex2(sand); TEX.beach = tex2(beach); TEX.asphaltImg = asphalt;
    TEX.sandAvg = avgOf(pixels(sand, 128)); TEX.beachAvg = avgOf(pixels(beach, 128));
  } catch (e) { console.warn('textures', e); } // без текстур мир всё равно строится (как раньше)
}
const texU = () => ({ uWalls: { value: TEX.walls }, uAvg: { value: TEX.avg.length ? TEX.avg : LAYERS.map(() => new THREE.Vector3(1, 1, 1)) }, uHasTex: { value: TEX.walls ? 1 : 0 } });

// ---------- материалы ----------
let hookN = 0;
function hook(mat, frag, extra = {}) {
  // у каждого такого материала свой ключ: иначе three.js считает их одинаковыми и рисует чужим шейдером
  const key = 'hook' + (hookN++) + ':' + (frag.head + frag.color + frag.emit).length;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNight = U.uNight;
    Object.assign(sh.uniforms, extra);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWin; attribute float aBase; varying float vWin; varying float vBase; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wp4 = vec4(transformed, 1.0); vec3 wn3 = objectNormal;
        vWP = (modelMatrix * wp4).xyz; vWN = normalize(mat3(modelMatrix) * wn3); vWin = aWin; vBase = aBase;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nprecision mediump sampler2DArray;\nuniform float uNight; varying float vWin; varying float vBase; varying vec3 vWP; varying vec3 vWN;\n' + frag.head)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + frag.color)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + frag.emit);
  };
  return mat;
}
function materials(atlas) {
  // фасады рисуются шейдером: окна, рамы, подоконники, карнизы, ставни, стеклянные башни.
  // aWin: 1 — жилой дом, 2 — стеклянная башня, 3 — вилла. Ни одного лишнего треугольника.
  const bld = hook(new THREE.MeshLambertMaterial({ vertexColors: true }), {
    head: `float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float box2(vec2 p, vec2 a, vec2 b){ return step(a.x,p.x)*step(p.x,b.x)*step(a.y,p.y)*step(p.y,b.y); }
      uniform sampler2DArray uWalls; uniform vec3 uAvg[8]; uniform float uHasTex;`,
    color: `float gWin = 0.0; float gLit = 0.0;
      float wlay = floor(vWin / 10.0 + 0.01), wcode = vWin - wlay * 10.0;
      if (wcode > 0.5) {
        if (abs(vWN.y) < 0.5) {
          float u = abs(vWN.x) > abs(vWN.z) ? vWP.z : vWP.x;
          float side = floor(vWN.x * 3.0 + vWN.z * 7.0) * 17.0;
          float fl = floor(vWP.y / 3.3), fy = fract(vWP.y / 3.3);
          float bid = floor(vWP.x * 0.02) + floor(vWP.z * 0.02) * 3.0;          // «номер дома» для разнообразия
          float tone = hash2(vec2(bid, side)) * 0.08 - 0.04;
          // крупные пятна и подтёки: стены не идеально ровные
          float stain = hash2(floor(vec2(u * 0.25, vWP.y * 0.12)) + bid) * 0.05;
          diffuseColor.rgb *= 1.0 + tone - stain;
          // фото-текстура стены (штукатурка, глина, коралл, бетон): даёт рельеф, цвет дома сохраняется
          if (uHasTex > 0.5 && abs(wcode - 2.0) > 0.5) { // у стеклянных башен (код 2) — без штукатурки
            int li = int(wlay);
            vec3 tx = texture(uWalls, vec3(vec2(u, vWP.y) / 3.6, wlay)).rgb;
            vec3 det = tx / max(uAvg[li], vec3(0.05));
            diffuseColor.rgb *= mix(vec3(1.0), clamp(det, 0.4, 1.8), 0.9);
          }
          // грязь и пыль у земли: низ стены темнее и рыжее
          float hb = vWP.y - vBase;
          diffuseColor.rgb *= mix(vec3(0.66, 0.6, 0.52), vec3(1.0), smoothstep(0.1, 1.8, hb));
          if (wcode < 1.5) {
            // жилой дом: окна с рамой и подоконником, карниз на каждом этаже
            float cell = floor(u / 3.1), fx = fract(u / 3.1);
            float r = hash2(vec2(cell + side, fl) + bid);
            vec2 q = vec2(fx, fy);
            float frame = box2(q, vec2(0.13, 0.27), vec2(0.87, 0.87));
            gWin = box2(q, vec2(0.17, 0.31), vec2(0.83, 0.84));
            float sill = box2(q, vec2(0.1, 0.22), vec2(0.9, 0.27));
            float ledge = step(fy, 0.05);
            float shut = step(0.82, hash2(vec2(cell * 3.1 + side, fl + bid)));   // закрытые ставни
            gLit = step(0.45, r) * (1.0 - shut);
            vec3 glass = mix(vec3(0.13, 0.17, 0.22), vec3(0.42, 0.52, 0.6), fy * 0.6) + 0.07 * (r - 0.5);
            vec3 shutter = mix(diffuseColor.rgb * 0.62, vec3(0.32, 0.36, 0.3), 0.4) * (0.85 + 0.15 * step(0.5, fract(fy * 9.0)));
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.12, (frame - gWin) + sill);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(glass, shutter, shut), gWin);
            diffuseColor.rgb *= 1.0 - ledge * 0.22;
          } else if (wcode < 2.5) {
            // стеклянная башня: сплошное стекло, тонкие стойки, небо отражается сверху светлее
            float cell = floor(u / 1.6), fx = fract(u / 1.6);
            float r = hash2(vec2(cell + side, fl) + bid);
            float mull = max(step(fx, 0.06), step(fy, 0.07));
            gWin = 1.0 - mull;
            gLit = step(0.55, r);
            float refl = clamp(vWP.y / 220.0, 0.0, 1.0);
            vec3 glass = diffuseColor.rgb * (0.55 + 0.25 * refl) + vec3(0.05, 0.08, 0.12) * refl + 0.05 * (r - 0.5);
            diffuseColor.rgb = mix(diffuseColor.rgb * 0.75, glass, gWin);
          } else {
            // вилла: редкие высокие окна с арками и деревянной решёткой (машрабия)
            float cell = floor(u / 4.6), fx = fract(u / 4.6);
            float r = hash2(vec2(cell + side, fl) + bid);
            vec2 q = vec2(fx, fy);
            float arch = step(length((q - vec2(0.5, 0.72)) * vec2(1.0, 1.4)), 0.17);
            gWin = max(box2(q, vec2(0.33, 0.22), vec2(0.67, 0.72)), arch * step(0.72, fy));
            float grid = step(0.75, fract(fx * 22.0)) + step(0.75, fract(fy * 16.0));
            gLit = step(0.5, r);
            vec3 wood = vec3(0.36, 0.24, 0.14) * (0.85 + 0.15 * clamp(grid, 0.0, 1.0));
            float mash = step(0.55, r);
            vec3 glass = vec3(0.14, 0.18, 0.22);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(glass, wood, mash * clamp(grid, 0.0, 1.0)), gWin);
            diffuseColor.rgb *= 1.0 - step(fy, 0.04) * 0.18;
          }
        } else diffuseColor.rgb *= 0.82;
      }`,
    emit: 'totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * gWin * gLit * uNight * 0.9;',
  }, texU());
  // простые поверхности: плитка тротуаров (код 4), контейнеры (5), рифлёное железо (6) — с фото-текстурами
  const plain = hook(new THREE.MeshLambertMaterial({ vertexColors: true }), {
    head: `float th(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*15731.743);}
      uniform sampler2DArray uWalls; uniform vec3 uAvg[8]; uniform float uHasTex;
      vec3 photo(vec2 uv, float layer){ vec3 t = texture(uWalls, vec3(uv, layer)).rgb; return clamp(t / max(uAvg[int(layer)], vec3(0.05)), 0.35, 1.9); }`,
    color: `{
      float pc = vWin - floor(vWin / 10.0 + 0.01) * 10.0;
      if (pc > 3.5 && pc < 4.5 && vWN.y > 0.8) { // плитка
        if (uHasTex > 0.5) diffuseColor.rgb *= mix(vec3(1.0), photo(vWP.xz / 2.4, 7.0), 0.95);
        else { vec2 t = vWP.xz / 1.2, f = fract(t); float seam = max(step(f.x, 0.05), step(f.y, 0.05)); diffuseColor.rgb *= (0.94 + 0.08 * th(floor(t))) * (1.0 - seam * 0.18); }
      }
      if (pc > 4.5 && pc < 6.5) { // металл
        if (abs(vWN.y) < 0.5) {
          float u = abs(vWN.x) > abs(vWN.z) ? vWP.z : vWP.x;
          if (uHasTex > 0.5) diffuseColor.rgb *= photo(vec2(u, vWP.y) / (pc < 5.5 ? 2.6 : 2.0), pc < 5.5 ? 6.0 : 5.0);
          float rib = smoothstep(0.35, 0.5, abs(fract(u * 3.3) - 0.5));
          diffuseColor.rgb *= 0.88 + 0.14 * rib;
          diffuseColor.rgb *= 0.93 + 0.07 * th(floor(vec2(u * 0.4, vWP.y * 0.5)));  // ржавые пятна
        } else diffuseColor.rgb *= 0.9;
      }
      }`,
    emit: '',
  }, texU());
  const emit = hook(new THREE.MeshLambertMaterial({ vertexColors: true }), { head: '', color: '', emit: 'totalEmissiveRadiance += diffuseColor.rgb * uNight * 1.6;' });
  const sign = hook(new THREE.MeshLambertMaterial({ map: atlas, side: THREE.DoubleSide, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), { head: '', color: '', emit: 'totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.75;' });
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
  // холст 256×512: настоящий асфальт с трещинами (фото) + немного стёртая разметка
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (TEX.asphaltImg) {
    for (let y = 0; y < H; y += W) g.drawImage(TEX.asphaltImg, 0, y, W, W);
    g.fillStyle = 'rgba(30,30,34,.25)'; g.fillRect(0, 0, W, H); // чуть темнее, как городской асфальт
  } else { g.fillStyle = '#3a3b3f'; g.fillRect(0, 0, W, H); }
  for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(50 + Math.random() * 150, Math.random() * H, 10 + Math.random() * 18, 80 + Math.random() * 160); } // следы шин и масла
  const line = (x, w, col, len = H) => { g.fillStyle = col; g.globalAlpha = 0.85; g.fillRect(x, 0, w, len); g.globalAlpha = 1; };
  line(6, 6, '#e8e8e0'); line(244, 6, '#e8e8e0');
  if (kind === 'hwy') { line(122, 4, '#e0b43a'); line(130, 4, '#e0b43a'); line(66, 4, '#e8e8e0', 220); line(186, 4, '#e8e8e0', 220); }
  else line(126, 4, '#e8e8e0', 220);
  // стёртость разметки: выщербины поверх линий
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 500; i++) { g.fillStyle = 'rgba(60,60,60,.35)'; g.fillRect(Math.random() * W, Math.random() * H, 3, 3); }
  g.globalCompositeOperation = 'source-over';
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
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, toneMapped: false }));
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
  put('bld', T.box, x, y0, z, w, H, d, col, 0, wallCode(1, S, R));
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
  // будка выхода на крышу — как на домах Залива
  if (R() < 0.55) { const rx = x + (R() - 0.5) * (w - 5), rz = z + (R() - 0.5) * (d - 5); put('bld', T.box, rx, top - 0.1, rz, 3, 2.7, 3.2, shade(col, 0.95), 0, wallCode(3, S, R)); }
  // деревянный эркер-машрабия на втором этаже (Джидда и старые кварталы)
  if (floors > 1 && R() < (S.wall?.[0] === 2 ? 0.7 : 0.3)) {
    const [nx, nz] = faces[0], fw = nx ? d : w, off = (R() - 0.5) * (fw - 5), tx = nz, tz = -nx;
    const bx = x + nx * (w / 2 + 0.55) + tx * off, bz = z + nz * (d / 2 + 0.55) + tz * off;
    put('bld', T.box, bx, g0 + 3.4, bz, nx ? 1.1 : 2.6, 2.9, nx ? 2.6 : 1.1, '#7a5634', 0, 3);
    put('det', T.box, bx, g0 + 6.3, bz, nx ? 1.4 : 3.0, 0.25, nx ? 3.0 : 1.4, '#5a3d24');
  }
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
      // витрина под навесом: тёмное стекло, ночью светится тёплым светом
      put('detEmit', T.box, fx + nx * 0.06, g0 + 0.05, fz + nz * 0.06, nx ? 0.1 : aw - 0.6, 2.35, nx ? aw - 0.6 : 0.1, '#4a4436');
    } else if (fi === 0) {
      // входная дверь с козырьком
      const off = (R() - 0.5) * (fw - 4);
      put('det', T.box, fx + nx * 0.05 + tx * off, g0, fz + nz * 0.05 + tz * off, nx ? 0.1 : 1.3, 2.3, nx ? 1.3 : 0.1, R() < 0.5 ? '#5a3a22' : '#3b4a52');
      put('det', T.box, fx + nx * 0.45 + tx * off, g0 + 2.45, fz + nz * 0.45 + tz * off, nx ? 0.9 : 1.9, 0.1, nx ? 1.9 : 0.9, shade(col, 0.8));
    }
  });
}

function tower(x, z, w, d, floors, col, S, R, gy, cyl) {
  const H = floors * 3.3;
  put('bld', cyl ? T.tower : T.box, x, gy - 0.5, z, w, H, d, col, 0, 2);
  collide(x, z, w + (cyl ? 0 : 6), d + (cyl ? 0 : 6), gy + H);
  const r = R();
  if (r < 0.35 && !cyl) put('bld', T.box, x, gy + H, z, w * 0.7, H * (0.12 + R() * 0.25), d * 0.7, col, 0, 2);
  else if (r < 0.55) put('det', T.box, x, gy + H, z, w * 0.85, 2.2, d * 0.85, shade(col, 0.7));
  if (R() < 0.5) put('det', T.cyl, x, gy + H, z, 0.4, 10 + R() * 25, 0.4, '#cccccc');
  if (!cyl) put('bld', T.box, x, gy - 0.5, z, w + 6, 5.5, d + 6, S.pal[0], 0, 1 + 10 * 3); // бетонный цоколь
}

function villa(x, z, size, col, streetFaces, R, gy, palms) {
  const w = size * (0.5 + R() * 0.12), d = size * (0.42 + R() * 0.1), H = 2 * 3.3 + 0.5;
  put('bld', T.box, x, gy - 0.3, z, w, H, d, col, 0, 3 + 10 * (R() < 0.5 ? 0 : 1)); // вилла: гладкая или глиняная штукатурка
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
function patch(kind, x0, z0, x1, z1, n, yOff, col, skirt = 0, win = 0) {
  const pos = [], idx = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * j / n;
    pos.push(x, height(x, z) + yOff, z);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  ch((x0 + x1) / 2, (z0 + z1) / 2)[kind].raw(pos, idx, C(col), win);
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

const c2key = (c, i, j) => c.id + ':' + i + ':' + j;

// ---------- районы в духе классических GTA ----------
const HOOD_PAL = ['#8fae86', '#d8c27e', '#c99a92', '#93a9c4', '#d9d2c0', '#b9a07a', '#a7b98a'];
// квартал бедного района: 4 участка с низкими домами, заборами, граффити; иногда — баскетбольная площадка
function hoodBlock(bx, bz, IN, gy, R, palms) {
  if (R() < 0.22) { // площадка во весь квартал
    const cw = 30, cd = 16;
    put('sign', T.plane, bx, gy + 0.03, bz, cw, cd, 1, '#ffffff', 0, 0, -Math.PI / 2, COURT);
    for (const s of [-1, 1]) { // стойки с щитом и кольцом
      const hx = bx + s * (cw / 2 - 0.6);
      put('det', T.cyl, hx + s * 0.6, gy, bz, 0.18, 3.4, 0.18, '#3a3d42');
      put('det', T.box, hx, gy + 2.9, bz, 0.08, 1.1, 1.8, '#f2f2f2');
      put('det', T.box, hx - s * 0.32, gy + 3.0, bz, 0.5, 0.04, 0.5, '#e05a1e');
      collide(hx + s * 0.6, bz, 0.4, 0.4, 1e4, true);
    }
    // сетчатый забор: столбы и верхняя труба по периметру
    const fw = IN - 4;
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = bx + nx * fw / 2, cz = bz + nz * fw / 2;
      put('det', T.box, cx, gy + 2.4, cz, nx ? 0.06 : fw, 0.06, nx ? fw : 0.06, '#6b7078');
      put('det', T.box, cx, gy + 0.05, cz, nx ? 0.05 : fw, 2.4, nx ? fw : 0.05, '#4a4e55'); // сетка (тёмная полупрозрачная стенка не нужна — тонкая)
      for (let k = -2; k <= 2; k++) put('det', T.cyl, cx + (nx ? 0 : k * fw / 4), gy, cz + (nx ? k * fw / 4 : 0), 0.08, 2.5, 0.08, '#6b7078');
      if (nz !== 1) collide(cx, cz, nx ? 0.3 : fw, nx ? fw : 0.3, gy + 2.4, true);
    }
    for (let k = 0; k < 3; k++) palm(palms, bx - fw / 2 + 2 + k * (fw - 4) / 2, bz + fw / 2 - 1.5, 0.8);
    return;
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const lx = bx + sx * IN / 4, lz = bz + sz * IN / 4, q = IN / 2;
    const w = q - 7 - R() * 3, d = q - 8 - R() * 3, col = HOOD_PAL[Math.floor(R() * HOOD_PAL.length)];
    const hx = lx + sx * 1.5, hz = lz - sz * 1.5; // дом в глубине участка, впереди — двор
    house(hx, hz, w, d, 1 + (R() < 0.35 ? 1 : 0), col, [[0, sz], [sx, 0]], { shop: 0, wall: [4, 4, 3] }, R, ROAD_Y + CURB);
    // граффити на уличной стене (нижний этаж)
    if (R() < 0.7) {
      const k = Math.floor(R() * GRAFFITI.length), fz = hz + sz * (d / 2 + 0.05), gw = Math.min(w * 0.7, 6);
      put('sign', T.plane, hx + (R() - 0.5) * (w - gw) * 0.5, gy + 0.35 + gw / 4, fz, gw, gw / 2, 1, '#ffffff', sz > 0 ? 0 : Math.PI, 0, 0, graffitiRect(k));
    }
    if (R() < 0.5) {
      const k = Math.floor(R() * GRAFFITI.length), fx = hx + sx * (w / 2 + 0.05), gw = Math.min(d * 0.6, 5);
      put('sign', T.plane, fx, gy + 0.4 + gw / 4, hz + (R() - 0.5) * (d - gw) * 0.4, gw, gw / 2, 1, '#ffffff', sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0, graffitiRect(k));
    }
    // низкий бетонный забор вокруг двора с проходом
    const wc = shade(col, 0.82), half = q / 2 - 0.6, ex = lx + sx * half, ez = lz + sz * half;
    put('det', T.box, lx - sx * 2.5, gy - 0.1, ez, q - 6, 1.3, 0.25, wc); collide(lx - sx * 2.5, ez, q - 6, 0.35, gy + 1.2, true);
    put('det', T.box, ex, gy - 0.1, lz, 0.25, 1.3, q - 1.2, wc); collide(ex, lz, 0.35, q - 1.2, gy + 1.2, true);
    // во дворе: бочка, тарелка на крыше уже от дома, иногда старая машина или пальма
    put('det', T.cyl, lx + sx * (half - 1.2), gy, lz + sz * (half - 1.5), 0.6, 0.95, 0.6, R() < 0.5 ? '#2f5a8a' : '#6b3a26');
    if (R() < 0.35) parkedCar(lx - sx * 3, lz + sz * (half - 3), Math.PI / 2, gy, R);
    else if (R() < 0.5) palm(palms, lx + sx * (half - 2.5), lz + sz * (half - 4), 0.75);
  }
}

// порт Джидды: причал, штабели контейнеров, портальные краны, склады и грузовой корабль
function port(palms) {
  const J = CITY.jeddah, z0 = J.z - 260, z1 = J.z + 90, R = rng(2024);
  const shore = z => coastW(z) + 8;          // край причала — у самой воды
  const xi = z => shore(z) + 157;            // дальняя (сухопутная) граница
  for (let z = z0; z < z1; z += 50) patch('plain', shore(z), z, xi(z), z + 50, 6, 0.12, '#8f8b82');
  const CC = ['#b03a2e', '#1f5f9a', '#2e7d4f', '#d9822b', '#e8e6df', '#6b4a8a', '#c9a227'];
  // штабели контейнеров рядами
  for (let row = 0; row < 4; row++) for (let z = z0 + 30; z < z1 - 40; z += 7.2) {
    if (R() < 0.18) continue;
    const x = shore(z) + 60 + row * 15, h = 1 + Math.floor(R() * 3), gy = height(x, z) + 0.12;
    for (let k = 0; k < h; k++) put('plain', T.box, x, gy + k * 2.6, z, 12.2, 2.6, 2.45, CC[Math.floor(R() * CC.length)], 0, 5);
    collide(x, z, 12.2, 2.5, gy + h * 2.6);
  }
  // портальные краны у воды
  for (const cz of [z0 + 70, z0 + 170, z0 + 260]) {
    const cx = shore(cz) + 14, gy = height(cx, cz) + 0.12, Hc = 34, col = '#e0a020';
    for (const [ox, oz] of [[-7, -6], [7, -6], [-7, 6], [7, 6]]) { put('plain', T.box, cx + ox, gy, cz + oz, 1.2, Hc, 1.2, col); collide(cx + ox, cz + oz, 1.4, 1.4); }
    put('plain', T.box, cx, gy + Hc, cz - 6, 16, 1.6, 1.6, col); put('plain', T.box, cx, gy + Hc, cz + 6, 16, 1.6, 1.6, col);
    put('plain', T.box, cx - 22, gy + Hc + 1.6, cz, 60, 2, 3, col);              // стрела над водой
    put('plain', T.box, cx + 4, gy + Hc - 3, cz, 4, 3, 4, '#d0d4d8');           // кабина
    put('detEmit', T.box, cx - 50, gy + Hc + 3.6, cz, 0.6, 0.6, 0.6, '#ff3b30'); // огонь на конце
  }
  // склады-ангары
  for (const wz of [z0 + 20, z1 - 50]) {
    const wx = xi(wz) - 22, gy = height(wx, wz) + 0.12;
    put('plain', T.box, wx, gy, wz + 15, 34, 9, 30, '#9aa3a8', 0, 6); collide(wx, wz + 15, 34, 30, gy + 9);
    put('det', T.box, wx - 17.1, gy, wz + 15, 0.2, 5.5, 8, '#4b5258');
    put('sign', T.plane, wx - 17.15, gy + 7, wz + 15, 12, 3, 1, '#ffffff', -Math.PI / 2, 0, 0, NEON.port);
  }
  // грузовой корабль у причала
  const sz = z0 + 150, sx = coastW(sz) - 15, wy = -1.4;
  put('plain', T.box, sx, wy - 5, sz, 26, 9, 150, '#23344d');
  put('plain', T.box, sx, wy - 5.2, sz, 26.4, 3.2, 150.4, '#8c2a22');
  put('plain', T.box, sx, wy + 4, sz + 62, 22, 14, 16, '#f0f0ea'); put('plain', T.cyl, sx, wy + 18, sz + 66, 3, 8, 3, '#2a2a2a');
  for (let k = 0; k < 9; k++) for (let lvl = 0; lvl < 2; lvl++) put('plain', T.box, sx + (k % 2 ? 5 : -5), wy + 4 + lvl * 2.6, sz - 60 + k * 12, 9, 2.6, 11.5, CC[(k * 3 + lvl) % CC.length], 0, 5);
  for (let z = z0 + 10; z < z1; z += 25) palm(palms, xi(z) + 3, z, 0.9);
}

// неоновый молл: золотистое стекло, светящиеся полосы, большая вывеска и площадь с пальмами
function mall(p, IN, palms) {
  const gy = gyAt(p.x, p.z), w = IN - 8, H = 26;
  patch('plain', p.x - IN / 2, p.z - IN / 2, p.x + IN / 2, p.z + IN / 2, 4, ROAD_Y + CURB + 0.02, '#e8e2d4', 0, 4);
  put('bld', T.box, p.x, gy - 0.3, p.z + 3, w, H, w - 10, '#b89a5a', 0, 2); collide(p.x, p.z + 3, w, w - 10, gy + H);
  put('bld', T.box, p.x, gy + H, p.z + 3, w * 0.6, 10, (w - 10) * 0.6, '#b89a5a', 0, 2);
  for (const y of [4.2, 12.5, 20.8]) put('detEmit', T.box, p.x, gy + y, p.z + 3, w + 0.3, 0.35, w - 9.7, ['#ff3fd2', '#3fd8ff', '#ffd23f'][Math.round(y) % 3]);
  put('sign', T.plane, p.x, gy + H - 6, p.z + 3 - (w - 10) / 2 - 0.08, 22, 5.5, 1, '#ffffff', Math.PI, 0, 0, NEON.mall);
  put('detEmit', T.box, p.x, gy, p.z + 3 - (w - 10) / 2 - 0.1, 10, 4, 0.2, '#6a5a40');       // стеклянный вход
  for (let k = -2; k <= 2; k++) palm(palms, p.x + k * 8, p.z - IN / 2 + 3, 1);
}

// придорожный мотель и закусочная у заправки (L — локальные координаты стоянки)
function motel(L, a, gy) {
  const [mx, mz] = L(26, 26);
  put('bld', T.box, mx, gy, mz, 9, 3.8, 34, '#e9dcc3', a, 1); collide(mx, mz, 14, 34, gy + 4);
  put('det', T.box, mx, gy + 3.8, mz, 10, 0.25, 35, '#b5523b', a);
  for (let k = -3; k <= 3; k++) { const [dx, dz] = L(21.4, 26 + k * 4.6); put('det', T.box, dx, gy, dz, 0.15, 2.2, 1.1, '#5a3a22', a); }
  const [px, pz] = L(18, 6); put('plain', T.box, px, gy, pz, 0.4, 7, 0.4, '#666');
  put('sign', T.plane, px, gy + 7.2, pz, 7, 1.75, 1, '#ffffff', a + Math.PI / 2, 0, 0, NEON.motel);
  const [dx, dz] = L(26, -26); put('bld', T.box, dx, gy, dz, 10, 4, 14, '#d8e4e8', a, 1); collide(dx, dz, 14, 14, gy + 4);
  const [sx, sz] = L(20.8, -26); put('sign', T.plane, sx, gy + 4.4, sz, 6, 1.5, 1, '#ffffff', a + Math.PI / 2, 0, 0, NEON.diner);
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
  // песок: мелкая рябь от ветра и пятна, чтобы пустыня не была гладкой заливкой
  const terrainMat = hook(new THREE.MeshLambertMaterial({ vertexColors: true }), {
    head: 'uniform sampler2D uSand, uBeach; uniform vec3 uSandAvg, uBeachAvg; uniform float uHasTex;\nfloat tn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5),b=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5),c=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5),d=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5);return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}',
    color: `{
        float rip = sin(vWP.x * 1.7 + sin(vWP.z * 0.35) * 2.0 + tn(vWP.xz * 0.2) * 3.0) * 0.5 + 0.5;
        float big = tn(vWP.xz * 0.012) * 0.6 + tn(vWP.xz * 0.05) * 0.4;
        float slope = 1.0 - clamp(vWN.y, 0.0, 1.0);
        diffuseColor.rgb *= 0.9 + big * 0.16 + rip * 0.05 * (1.0 - slope * 3.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.7, 0.62), clamp(slope * 2.5, 0.0, 0.6));
        if (uHasTex > 0.5) {
          // фото песка в двух масштабах (чтобы не было видно повтора), на склонах — камешки
          vec3 s1 = texture2D(uSand, vWP.xz / 9.0).rgb / uSandAvg, s2 = texture2D(uSand, vWP.xz / 53.0).rgb / uSandAvg;
          vec3 pb = texture2D(uBeach, vWP.xz / 7.0).rgb / uBeachAvg;
          vec3 det = mix(s1 * 0.6 + s2 * 0.4, pb, clamp(slope * 3.0, 0.0, 1.0));
          diffuseColor.rgb *= mix(vec3(1.0), clamp(det, 0.5, 1.6), 0.85);
        }
      }`,
    emit: '',
  }, { uSand: { value: TEX.sand }, uBeach: { value: TEX.beach }, uSandAvg: { value: TEX.sandAvg }, uBeachAvg: { value: TEX.beachAvg }, uHasTex: { value: TEX.sand ? 1 : 0 } });
  const terrain = new THREE.Mesh(tg, terrainMat);
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
  // неоновый молл в Дубае — отдельный квартал недалеко от центра
  const MALL = pick(CITY.dubai, [[-2, 1], [1, 1], [-1, -2], [2, -1], [-2, -2]].filter(([i, j]) => c2key(CITY.dubai, i, j) !== LMK.dubai?.key));
  const reserved = new Set([...Object.values(LMK), MALL].filter(Boolean).map(p => p.key));

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
      patch('plain', x0, z0, x1, z1, 6, ROAD_Y + CURB, '#cbc4b6', ROAD_Y + CURB + 0.3, 4);
      lamp(bx, z0 + 0.6, 0, -1); lamp(x0 + 0.6, bz, -1, 0);
      // мелочи на тротуаре: мусорный бак, скамейка, провод между фонарями
      { const sd = R() < 0.5 ? 1 : -1, ox = bx + sd * (12 + R() * 12), oz = z0 + 1.4;
        put('det', T.box, ox, gy, oz, 0.9, 1.1, 0.75, R() < 0.5 ? '#2f5d3a' : '#3b4a5a'); put('det', T.box, ox, gy + 1.1, oz, 0.95, 0.08, 0.8, '#222'); collide(ox, oz, 0.9, 0.8, gy + 1.2, true);
        const bxx = x0 + 1.4, bzz = bz + sd * (10 + R() * 14);
        put('det', T.box, bxx, gy + 0.42, bzz, 0.45, 0.08, 1.8, '#7a5a3a'); put('det', T.box, bxx - 0.2, gy + 0.5, bzz, 0.06, 0.45, 1.8, '#7a5a3a');
        put('det', T.box, bxx, gy, bzz - 0.7, 0.4, 0.42, 0.08, '#444'); put('det', T.box, bxx, gy, bzz + 0.7, 0.4, 0.42, 0.08, '#444'); collide(bxx, bzz, 0.6, 1.9, gy + 0.9, true);
        put('det', T.box, bx - BLOCK / 2 + 0.6, gy + 7.15, z0 + 0.6, BLOCK - 1.2, 0.04, 0.04, '#1a1a1a'); } // провод
      if (dc < c.r * 0.45) { // светофор и зебры у перекрёстка
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
      // бедный район Эр-Рияда (юго-запад, подальше от центра): низкие дома, граффити, дворы, баскетбол
      if (c.id === 'riyadh' && i <= -4 && j >= 1 && dc > 260) { hoodBlock(bx, bz, IN, gy, R, palms); continue; }

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

  // Районы: неоновый молл в Дубае и порт Джидды
  if (MALL) mall(MALL, BLOCK - STREET_W - SIDEWALK * 2, palms);
  port(palms);

  // Достопримечательности
  const dub = LMK.dubai;
  if (dub) { let y = 0; for (const [r, h] of [[19, 120], [16, 105], [12.5, 90], [9.5, 80], [6.5, 65], [4, 50], [1.3, 110]]) { put(r > 3 ? 'bld' : 'plain', T.tower, dub.x, y, dub.z, r * 2, h, r * 2, '#c9d6df', 0, r > 3 ? 2 : 0); y += h; } collide(dub.x, dub.z, 40, 40); }
  const ry = LMK.riyadh;
  if (ry) {
    put('bld', T.box, ry.x, 0, ry.z, 44, 205, 28, '#8fa6b4', 0, 2);
    put('bld', T.box, ry.x - 16.5, 205, ry.z, 11, 85, 28, '#8fa6b4', 0, 2); put('bld', T.box, ry.x + 16.5, 205, ry.z, 11, 85, 28, '#8fa6b4', 0, 2);
    put('plain', T.box, ry.x, 262, ry.z, 22, 5, 8, '#c7d1d8'); collide(ry.x, ry.z, 44, 28);
  }
  const dh = LMK.doha;
  if (dh) { put('bld', T.tower, dh.x, 0, dh.z, 38, 205, 38, '#6f9bb5', 0, 2); put('plain', T.cone, dh.x, 205, dh.z, 38, 45, 38, '#6f9bb5'); collide(dh.x, dh.z, 38, 38); }
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
    motel(L, a, gy); // мотель и закусочная у трассы
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
  // кусты и камни: рисуем только ближние (список пересобирается, когда игрок отходит)
  const scatter = [];
  const near1 = (geo, mat, list, f) => {
    const im = inst(geo, mat, list, f), all = im.instanceMatrix.array.slice(), xs = list.map(p => p[0]), zs = list.map(p => p[1]);
    scatter.push({ im, all, xs, zs });
  };
  near1(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#8a8749', flatShading: true }), bushes, (o, [x, z, s]) => { o.position.set(x, height(x, z) + s * 0.3, z); o.scale.set(s, s * 0.6, s); o.rotation.set(0, x, 0); });
  near1(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#8f7660', flatShading: true }), rocks, (o, [x, z, s]) => { o.position.set(x, height(x, z) + s * 0.2, z); o.scale.set(s, s * 0.7, s * 1.2); o.rotation.set(x, z, 0); });
  let scX = 1e9, scZ = 1e9, scR = 0;
  const updateScatter = (x, z, R) => {
    if (Math.hypot(x - scX, z - scZ) < R * 0.25 && R === scR) return;
    scX = x; scZ = z; scR = R;
    for (const s of scatter) {
      const dst = s.im.instanceMatrix.array; let n = 0;
      for (let k = 0; k < s.xs.length; k++) if (Math.abs(s.xs[k] - x) < R && Math.abs(s.zs[k] - z) < R) { dst.set(s.all.subarray(k * 16, k * 16 + 16), n * 16); n++; }
      s.im.count = n; s.im.instanceMatrix.needsUpdate = true;
    }
  };
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

  // Заправки в городах: навес и две колонки на тротуаре
  for (const c of CITIES) {
    const P = cityPoints(c), gx = P.gas.x + 5.5, gz = P.gas.z, gy = gyAt(gx, gz);
    put('plain', T.box, gx, gy + 3.6, gz, 2.6, 0.4, 9, '#f2f2f2'); put('emit', T.box, gx, gy + 3.5, gz, 2.7, 0.15, 9.1, '#d62828');
    for (const s of [-1, 1]) { put('plain', T.box, gx, gy, gz + s * 3, 0.7, 1.6, 0.5, '#d62828'); put('plain', T.box, gx + 0.9, gy, gz + s * 4.2, 0.25, 3.6, 0.25, '#e8e8e8'); collide(gx, gz + s * 3, 0.9, 0.7, 1e4, true); }
  }
  // Ларьки: будка с навесом и тёплым окошком на тротуаре
  for (const k of KIOSKS) {
    const gy = gyAt(k.x, k.z), col = ['#1f6f8b', '#b03a2e', '#1e8449', '#ca6f1e'][Math.floor(Math.abs(k.x * 7 + k.z)) % 4];
    put('plain', T.box, k.x, gy, k.z + 0.5, 2.6, 2.3, 1.6, '#e9e4d8');
    put('det', T.box, k.x, gy + 2.3, k.z - 0.1, 3.0, 0.12, 1.4, col);
    put('detEmit', T.box, k.x, gy + 1.0, k.z - 0.31, 1.8, 0.9, 0.04, '#5a4a30');
    collide(k.x, k.z + 0.5, 2.6, 1.6, gy + 2.3, true);
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
  // Маркеры — «пикапы» как в старых GTA: над землёй крутится значок места (тележка, колонка, ключ…),
  // выше покачивается стрелка входа, на земле — мягкое светлое пятно. Материалы общие на каждый вид.
  const markers = [];
  const iconGeo = new THREE.CircleGeometry(0.85, 28);
  const arrowGeo = new THREE.ConeGeometry(0.42, 0.9, 4).rotateX(Math.PI).translate(0, 0, 0);
  const spotGeo = new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2);
  const spotTex = glowTex(), kindMats = {};
  const matsFor = (kind, color) => kindMats[kind] || (kindMats[kind] = {
    icon: new THREE.MeshBasicMaterial({ map: iconTex(kind, color), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    arrow: new THREE.MeshBasicMaterial({ color }),
    spot: new THREE.MeshBasicMaterial({ map: spotTex, color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  });
  const addMarker = (kind, city, p, color, label) => {
    const M = matsFor(kind, color), g = new THREE.Group(), spin = new THREE.Group();
    const icon = new THREE.Mesh(iconGeo, M.icon); icon.position.y = 1.35; spin.add(icon);
    const arrow = new THREE.Mesh(arrowGeo, M.arrow); arrow.position.y = 2.75; spin.add(arrow);
    g.add(spin);
    const spot = new THREE.Mesh(spotGeo, M.spot); spot.position.y = 0.04; g.add(spot);
    const s = textSprite(label, { bg: 'rgba(0,0,0,0.6)', color, scale: 0.75 }); s.position.y = 3.9; g.add(s);
    g.position.set(p.x, height(p.x, p.z) + ROAD_Y + CURB * 0.5, p.z); scene.add(g);
    markers.push({ kind, city, x: p.x, z: p.z, obj: g });
  };
  for (const c of CITIES) {
    const P = cityPoints(c);
    addMarker('office', c.id, P.office, '#ffcc33', 'توصيل');
    addMarker('showroomLow', c.id, P.showroomLow, '#7fd1ff', 'سيارات اقتصادية');
    addMarker('showroom', c.id, P.showroom, '#3fa9ff', 'معرض السيارات');
    addMarker('showroomHigh', c.id, P.showroomHigh, '#f0b429', 'سيارات فاخرة');
    addMarker('wh', c.id, P.wh, '#c48a4a', 'مستودع');
    addMarker('clothes', c.id, P.clothes, '#c77dff', 'ملابس');
    addMarker('gas', c.id, P.gas, '#ff3b30', 'محطة وقود');
    addMarker('shop', c.id, P.shop, '#34c759', 'سوبرماركت 24/7');
    addMarker('tech', c.id, P.tech, '#ff9f0a', 'مركز صيانة');
  }
  FOOD_SPOTS.forEach(p => addMarker('food', null, p, '#ff7b39', 'شاورما'));
  for (const k of KIOSKS) addMarker('kiosk', k.city, { x: k.x, z: k.z - 1.6 }, '#ffd60a', 'كشك');

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
  return { sky, water, markers, near, flag, lod, updateScatter, glow: MAT.glow, stats: { colliders: colliders.length, palms: palms.length } };
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

// значок места на круглом жетоне: рисуется на холсте простыми фигурами (без эмодзи — они разные на телефонах)
function iconTex(kind, color) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fillStyle = color; g.fill();
  g.lineWidth = 12; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = 14; g.lineCap = g.lineJoin = 'round';
  const R = (x, y, w, h) => g.fillRect(x, y, w, h), C = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  const L = pts => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); };
  switch (kind) {
    case 'shop': // тележка
      L([[52, 72], [80, 72], [100, 150], [180, 150], [196, 96], [88, 96]]); C(108, 178, 14); C(172, 178, 14); break;
    case 'gas': // колонка со шлангом
      R(72, 64, 72, 130); g.fillStyle = color; R(86, 80, 44, 34); g.fillStyle = '#fff'; R(60, 190, 96, 12);
      L([[144, 92], [176, 112], [176, 160], [190, 160], [190, 104]]); break;
    case 'tech': // гаечный ключ
      g.lineWidth = 26; L([[84, 172], [160, 96]]); g.lineWidth = 14;
      g.beginPath(); g.arc(170, 86, 30, 0.7, 5.6); g.stroke(); C(80, 176, 18); break;
    case 'clothes': // футболка
      g.beginPath(); g.moveTo(96, 64); g.lineTo(62, 92); g.lineTo(80, 122); g.lineTo(96, 112); g.lineTo(96, 192); g.lineTo(160, 192); g.lineTo(160, 112); g.lineTo(176, 122); g.lineTo(194, 92); g.lineTo(160, 64); g.quadraticCurveTo(128, 92, 96, 64); g.fill(); break;
    case 'wh': // коробка
      R(70, 92, 116, 92); g.fillStyle = color; R(122, 92, 12, 92); R(70, 128, 116, 8); break;
    case 'office': // посылка со стрелкой — доставка
      R(66, 100, 84, 76); L([[160, 88], [200, 88]]); L([[188, 72], [204, 88], [188, 104]]); g.fillStyle = color; R(102, 100, 12, 76); break;
    case 'food': case 'kiosk': // стакан и шаурма
      g.beginPath(); g.moveTo(74, 92); g.lineTo(130, 92); g.lineTo(122, 190); g.lineTo(82, 190); g.closePath(); g.fill();
      L([[112, 92], [124, 56]]); g.beginPath(); g.ellipse(170, 140, 22, 50, 0.3, 0, 7); g.fill(); break;
    default: { // машина — автосалоны
      g.beginPath(); g.moveTo(52, 156); g.lineTo(62, 118); g.lineTo(92, 112); g.lineTo(112, 84); g.lineTo(162, 84); g.lineTo(186, 112); g.lineTo(206, 120); g.lineTo(206, 156); g.closePath(); g.fill();
      g.fillStyle = color; R(118, 92, 18, 22); R(142, 92, 18, 22); C(92, 160, 20); C(170, 160, 20); g.fillStyle = '#fff'; C(92, 160, 10); C(170, 160, 10);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function makeTargetBeam() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 300, 16, 1, true).translate(0, 150, 0),
    new THREE.MeshBasicMaterial({ color: '#36e27a', transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(4, 0.3, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#36e27a' })));
  g.visible = false;
  return g;
}
