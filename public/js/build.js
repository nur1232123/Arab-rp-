// Строит 3D-мир: рельеф, море, дороги, здания, пальмы, достопримечательности, маркеры.
import * as THREE from 'three';
import {
  HALF, CITIES, CITY, BLOCK, STREET_W, HIGHWAYS, STREETS, HWY_GRID,
  height, cityMask, coastE, coastW, rng, smooth, cityPoints,
} from '../shared/world.js';

export const ROAD_Y = 0.3; // дороги чуть выше земли, машина едет по ним

const STYLES = {
  amman:  { floors: [2, 6],  tower: 0.03, tFloors: [14, 28], pal: ['#ebe1cb', '#e0d4b8', '#d6c7a4', '#f1e9d8', '#cfc09e'], glass: ['#9fb3c0', '#8aa2b1'], cyl: 0,    trees: 0.12 },
  riyadh: { floors: [2, 8],  tower: 0.09, tFloors: [20, 50], pal: ['#dcc6a2', '#ccb58f', '#e2d6bf', '#bba88c'],             glass: ['#7f98a8', '#5d7a8c', '#a7b8c2'], cyl: 0.06, trees: 0.3 },
  dubai:  { floors: [4, 14], tower: 0.38, tFloors: [30, 90], pal: ['#ecebe6', '#d9dcde', '#c7ced4'],                       glass: ['#5b86a6', '#7aa4c2', '#9cc0d6', '#3f6f8f', '#b9cdd8', '#8c9aa6'], cyl: 0.22, trees: 0.55 },
  doha:   { floors: [3, 10], tower: 0.26, tFloors: [25, 62], pal: ['#e8dfcf', '#dbd0b9'],                                  glass: ['#6f9bb5', '#4d7f99', '#a6c4d4', '#c9b37a'], cyl: 0.45, trees: 0.4 },
  jeddah: { floors: [2, 7],  tower: 0.1,  tFloors: [18, 42], pal: ['#f3f0e9', '#e9e3d7', '#ddd4c3', '#cfa384'],             glass: ['#7da6bd', '#9cbccd'], cyl: 0.08, trees: 0.5 },
};

// ---------- материал зданий с окнами (рисуются шейдером по мировым координатам) ----------
function buildingMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wp4 = vec4(transformed, 1.0);
        vec3 wn3 = objectNormal;
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4; wn3 = mat3(instanceMatrix) * wn3;
        #endif
        vWP = (modelMatrix * wp4).xyz; vWN = normalize(mat3(modelMatrix) * wn3);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (abs(vWN.y) < 0.5) {
          float u = abs(vWN.x) > abs(vWN.z) ? vWP.z : vWP.x;
          float fy = fract(vWP.y / 3.4), fx = fract(u / 3.2);
          float win = step(0.32, fy) * step(fy, 0.86) * step(0.14, fx) * step(fx, 0.86);
          float lum = dot(diffuseColor.rgb, vec3(0.33));
          vec3 glass = mix(vec3(0.16, 0.22, 0.28), diffuseColor.rgb * 0.55, 0.35) + 0.08 * sin(floor(vWP.y / 3.4) * 1.7 + floor(u / 3.2) * 2.3);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * 0.85);
        } else {
          diffuseColor.rgb *= 0.86;
        }`);
  };
  return mat;
}

// ---------- текстуры дорог ----------
function roadTexture(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3b3c40'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  g.fillStyle = '#e8e8e0';
  g.fillRect(4, 0, 3, 128); g.fillRect(121, 0, 3, 128);
  if (kind === 'hwy') {
    g.fillStyle = '#e0b43a'; g.fillRect(61, 0, 2, 128); g.fillRect(65, 0, 2, 128);
    g.fillStyle = '#e8e8e0'; g.fillRect(33, 0, 2, 64); g.fillRect(93, 0, 2, 64);
  } else {
    g.fillStyle = '#e8e8e0'; g.fillRect(63, 0, 2, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// лента дороги по ломаной, повторяет рельеф
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

// ---------- текстовые таблички ----------
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

function jordanFlag() {
  const c = document.createElement('canvas'); c.width = 240; c.height = 120; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 240, 40); g.fillStyle = '#fff'; g.fillRect(0, 40, 240, 40); g.fillStyle = '#007a3d'; g.fillRect(0, 80, 240, 40);
  g.fillStyle = '#ce1126'; g.beginPath(); g.moveTo(0, 0); g.lineTo(120, 60); g.lineTo(0, 120); g.fill();
  g.fillStyle = '#fff'; g.beginPath();
  for (let i = 0; i < 14; i++) { const r = i % 2 ? 6 : 14, a = i / 14 * Math.PI * 2 - Math.PI / 2; g.lineTo(40 + Math.cos(a) * r, 60 + Math.sin(a) * r); }
  g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- главное ----------
export function buildWorld(scene) {
  const colliders = []; // AABB зданий
  const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();

  // Небо
  const skyGeo = new THREE.SphereGeometry(3400, 24, 12);
  const skyCol = [], top = new THREE.Color('#5d9fd6'), hor = new THREE.Color('#f1dfbd');
  const sp = skyGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) { const t = Math.max(0, sp.getY(i) / 3400); tmpC.copy(hor).lerp(top, Math.pow(t, 0.55)); skyCol.push(tmpC.r, tmpC.g, tmpC.b); }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyCol, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1; scene.add(sky);

  // Рельеф
  const SEG = 320;
  const tg = new THREE.PlaneGeometry(HALF * 2, HALF * 2, SEG, SEG).rotateX(-Math.PI / 2);
  const tp = tg.attributes.position, cols = [];
  const sand = new THREE.Color('#dcbb84'), sand2 = new THREE.Color('#c9a26b'), pave = new THREE.Color('#bdb3a3'),
        rock = new THREE.Color('#b9a17e'), beach = new THREE.Color('#efdfb5'), wet = new THREE.Color('#8e8a6e');
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), h = height(x, z);
    tp.setY(i, h);
    const n = Math.sin(x * 0.013 + Math.sin(z * 0.011)) * 0.5 + 0.5;
    tmpC.copy(sand).lerp(sand2, n * 0.6 + Math.max(0, Math.min(1, (h - 4) / 10)) * 0.2);
    const ad = Math.hypot(x - CITY.amman.x, z - CITY.amman.z);
    tmpC.lerp(rock, (1 - smooth(600, 1400, ad)) * 0.7);
    tmpC.lerp(pave, cityMask(x, z) * 0.9);
    const e = Math.max(x - coastE(z), coastW(z) - x);
    tmpC.lerp(beach, smooth(-260, -60, e) * (1 - smooth(-20, 40, e)));
    if (e > -10) tmpC.lerp(wet, smooth(-10, 60, e));
    cols.push(tmpC.r, tmpC.g, tmpC.b);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  tg.computeVertexNormals();
  scene.add(new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true })));

  // Море
  const water = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2.6, HALF * 2.6).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: '#2f95a8', transparent: true, opacity: 0.92 }));
  water.position.y = -1.4; scene.add(water);

  // Дороги
  const hwyMat = new THREE.MeshLambertMaterial({ map: roadTexture('hwy'), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const stMat = new THREE.MeshLambertMaterial({ map: roadTexture('st'), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  scene.add(new THREE.Mesh(ribbon(HIGHWAYS, ROAD_Y + 0.12, 8, 24), hwyMat));
  scene.add(new THREE.Mesh(ribbon(STREETS.filter(s => s.dir === 'h'), ROAD_Y, 8, 16), stMat));
  scene.add(new THREE.Mesh(ribbon(STREETS.filter(s => s.dir === 'v'), ROAD_Y + 0.06, 8, 16), stMat));

  // Места для достопримечательностей: квартал подальше от трасс
  const pickBlock = (c, cands) => {
    for (const [i, j] of cands) {
      const x = c.x + (i + 0.5) * BLOCK, z = c.z + (j + 0.5) * BLOCK;
      if (HWY_GRID.dist(x, z) > 50) return { x, z };
    }
    return { x: c.x + 2.5 * BLOCK, z: c.z + 2.5 * BLOCK };
  };
  const CANDS = [[1, -3], [-3, 1], [2, 2], [-3, -3], [0, -2], [2, -2], [-2, 2], [1, 3], [-4, 0], [3, 0], [0, 3], [-1, -4]];
  const dub = pickBlock(CITY.dubai, CANDS), ry = pickBlock(CITY.riyadh, CANDS), dh = pickBlock(CITY.doha, CANDS),
        fp = pickBlock(CITY.amman, CANDS);
  const reserved = [dub, ry, dh, fp];

  // Здания
  const boxes = [], cyls = [], palms = [];
  CITIES.forEach((c, ci) => {
    const S = STYLES[c.style], R = rng(1000 + ci * 97);
    const n = Math.floor(c.r / BLOCK);
    const pts = cityPoints(c);
    for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) {
      const bx = c.x + (i + 0.5) * BLOCK, bz = c.z + (j + 0.5) * BLOCK;
      const dc = Math.hypot(bx - c.x, bz - c.z);
      if (dc > c.r - 50) continue;
      if (reserved.some(p => Math.abs(p.x - bx) < 1 && Math.abs(p.z - bz) < 1)) continue;
      const usable = BLOCK - STREET_W - 8; // место внутри квартала
      if (HWY_GRID.dist(bx, bz) < usable * 0.75) { // квартал на трассе — делаем сквер с пальмами
        if (HWY_GRID.dist(bx, bz) > -2) for (let k = 0; k < 3; k++) palms.push([bx + (R() - 0.5) * usable, bz + (R() - 0.5) * usable, 0.8 + R() * 0.5]);
        continue;
      }
      const centr = 1 - dc / c.r;
      const towerP = S.tower * (0.4 + centr * 1.9);
      const lots = R() < towerP ? [[0, 0, usable * (0.55 + R() * 0.3), true]]
        : [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * usable / 4, sz * usable / 4, usable / 2 - 2 - R() * 5, false]);
      for (const [ox, oz, size, tower] of lots) {
        if (!tower && R() < 0.08) continue; // пустой участок
        const x = bx + ox, z = bz + oz;
        const w = size * (0.8 + R() * 0.2), d = size * (0.8 + R() * 0.2);
        const fl = tower ? S.tFloors[0] + R() * (S.tFloors[1] - S.tFloors[0]) * (0.5 + centr * 0.5)
                         : S.floors[0] + Math.floor(R() * (S.floors[1] - S.floors[0] + 1));
        const hs = [height(x - w / 2, z - d / 2), height(x + w / 2, z - d / 2), height(x - w / 2, z + d / 2), height(x + w / 2, z + d / 2)];
        const y0 = Math.min(...hs) - 1, extra = Math.max(...hs) - Math.min(...hs);
        const H = fl * 3.4 + extra + 1;
        const col = tower ? S.glass[Math.floor(R() * S.glass.length)] : S.pal[Math.floor(R() * S.pal.length)];
        const isCyl = tower && R() < S.cyl;
        (isCyl ? cyls : boxes).push({ x, z, w, d, y0, H, col });
        colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
        // «ступенчатые» высотки
        if (tower && !isCyl && R() < 0.5) boxes.push({ x, z, w: w * 0.65, d: d * 0.65, y0: y0 + H, H: H * (0.15 + R() * 0.3), col });
      }
      // пальмы по углам квартала
      if (R() < S.trees) for (const [sx, sz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) palms.push([bx + sx * (usable / 2 + 2), bz + sz * (usable / 2 + 2), 0.8 + R() * 0.5]);
    }
  });

  // Достопримечательности
  const LM = [];
    [[20, 130], [16.5, 110], [13, 95], [10, 80], [7, 65], [4.5, 50], [1.4, 120]].reduce((y, [r, h]) => { LM.push({ cyl: true, x: dub.x, z: dub.z, w: r * 2, d: r * 2, y0: y, H: h, col: '#c9d6df' }); return y + h; }, 0);
  colliders.push({ x0: dub.x - 22, x1: dub.x + 22, z0: dub.z - 22, z1: dub.z + 22 });
    LM.push({ x: ry.x, z: ry.z, w: 46, d: 30, y0: 0, H: 210, col: '#8fa6b4' });
  LM.push({ x: ry.x - 17, z: ry.z, w: 12, d: 30, y0: 210, H: 85, col: '#8fa6b4' }, { x: ry.x + 17, z: ry.z, w: 12, d: 30, y0: 210, H: 85, col: '#8fa6b4' });
  LM.push({ x: ry.x, z: ry.z, w: 46, d: 8, y0: 268, H: 6, col: '#c7d1d8' });
  colliders.push({ x0: ry.x - 24, x1: ry.x + 24, z0: ry.z - 16, z1: ry.z + 16 });
    LM.push({ cyl: true, x: dh.x, z: dh.z, w: 40, d: 40, y0: 0, H: 210, col: '#6f9bb5' });
  colliders.push({ x0: dh.x - 21, x1: dh.x + 21, z0: dh.z - 21, z1: dh.z + 21 });
  for (const L of LM) (L.cyl ? cyls : boxes).push(L);

  const bMat = buildingMaterial();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 18).translate(0, 0.5, 0);
  for (const [list, geo] of [[boxes, boxGeo], [cyls, cylGeo]]) {
    const im = new THREE.InstancedMesh(geo, bMat, list.length);
    list.forEach((b, k) => {
      tmpM.makeScale(b.w, b.H, b.d).setPosition(b.x, b.y0, b.z);
      im.setMatrixAt(k, tmpM); im.setColorAt(k, tmpC.set(b.col));
    });
    im.frustumCulled = false; scene.add(im);
  }
  // купол-крыша башни в Дохе
  const cone = new THREE.Mesh(new THREE.ConeGeometry(20, 45, 18), new THREE.MeshLambertMaterial({ color: '#6f9bb5' }));
  cone.position.set(dh.x, 210 + 22, dh.z); scene.add(cone);

  // Флагшток в Аммане
  const fy = height(fp.x, fp.z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 120, 10), new THREE.MeshLambertMaterial({ color: '#dddddd' }));
  pole.position.set(fp.x, fy + 60, fp.z); scene.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(40, 20, 10, 1), new THREE.MeshLambertMaterial({ map: jordanFlag(), side: THREE.DoubleSide }));
  flag.position.set(fp.x + 20.5, fy + 108, fp.z); scene.add(flag);
  colliders.push({ x0: fp.x - 2, x1: fp.x + 2, z0: fp.z - 2, z1: fp.z + 2 });

  // Фонтан в Джидде (в море)
  const J = CITY.jeddah, jx = coastW(J.z) - 120;
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(3, 1.5, 230, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, fog: true }));
  jet.position.set(jx, 114, J.z); scene.add(jet);
  const spray = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }));
  spray.position.set(jx, 230, J.z); scene.add(spray);

  // Пальмы
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 8, 6).translate(0, 4, 0);
  const leafGeo = new THREE.ConeGeometry(3.6, 2, 7, 1, true).translate(0, 7.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#8a6a45' }), palms.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: '#4f8a3a', side: THREE.DoubleSide }), palms.length);
  palms.forEach(([x, z, s], k) => {
    tmpM.makeRotationY(x * 13.1).scale(new THREE.Vector3(s, s, s)).setPosition(x, height(x, z), z);
    trunks.setMatrixAt(k, tmpM); leaves.setMatrixAt(k, tmpM);
  });
  trunks.frustumCulled = leaves.frustumCulled = false;
  scene.add(trunks, leaves);

  // Маркеры: офисы доставки и автосалоны
  const markers = [];
  const ringGeo = new THREE.TorusGeometry(5, 0.35, 8, 32).rotateX(Math.PI / 2);
  const colGeo = new THREE.CylinderGeometry(5, 5, 6, 24, 1, true).translate(0, 3, 0);
  for (const c of CITIES) {
    const P = cityPoints(c);
    for (const [kind, p, color, label] of [['office', P.office, '#ffcc33', 'توصيل'], ['showroom', P.showroom, '#3fa9ff', 'معرض السيارات']]) {
      const g = new THREE.Group(), y = height(p.x, p.z) + ROAD_Y;
      g.add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color })));
      g.add(new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })));
      const s = textSprite(label, { bg: color === '#ffcc33' ? 'rgba(120,80,0,0.75)' : 'rgba(0,60,120,0.75)', scale: 1.4 });
      s.position.y = 9; g.add(s);
      g.position.set(p.x, y + 0.1, p.z); scene.add(g);
      markers.push({ kind, city: c.id, x: p.x, z: p.z, obj: g });
    }
  }

  // Сетка коллизий
  const CG = 60, cgrid = new Map();
  for (const b of colliders) {
    for (let i = Math.floor(b.x0 / CG); i <= Math.floor(b.x1 / CG); i++)
      for (let j = Math.floor(b.z0 / CG); j <= Math.floor(b.z1 / CG); j++) {
        const k = i * 100003 + j; let a = cgrid.get(k); if (!a) cgrid.set(k, a = []); a.push(b);
      }
  }
  const nearColliders = (x, z) => cgrid.get(Math.floor(x / CG) * 100003 + Math.floor(z / CG)) || [];

  return { sky, water, markers, nearColliders, flag, stats: { buildings: boxes.length + cyls.length, palms: palms.length } };
}

// Зелёный луч цели доставки
export function makeTargetBeam() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 400, 16, 1, true).translate(0, 200, 0),
    new THREE.MeshBasicMaterial({ color: '#36e27a', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(6, 0.4, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#36e27a' })));
  g.visible = false;
  return g;
}
