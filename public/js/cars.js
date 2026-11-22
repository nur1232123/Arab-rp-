// Модели машин: кузов выдавлен по боковому профилю, стёкла, стойки, фары, решётка, колёса.
// Вперёд = +Z. Детали одного цвета склеены, чтобы машина рисовалась за ~10 вызовов.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CARS } from '../shared/world.js';

// ---------- готовые 3D-модели (GLB) ----------
const MODELS = {};          // имя -> { scene, len, W, wr }
let modelsReady = null;
export function loadCarModels() {
  if (modelsReady) return modelsReady;
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const names = [...new Set(Object.values(CARS).map(c => c.model).filter(Boolean))];
  modelsReady = Promise.all(names.map(n => loader.loadAsync(`/models/${n}.glb`).then(g => {
    const root = g.scene;
    root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    const body = new THREE.Box3();
    root.traverse(o => { if (o.isMesh && !/wheel_/.test(o.parent?.name || '') && !/wheel_/.test(o.name)) body.expandByObject(o); });
    const size = body.getSize(new THREE.Vector3());
    let wr = 0.33; const fl = root.getObjectByName('wheel_FL');
    if (fl) { const b = new THREE.Box3().setFromObject(fl); wr = (b.max.y - b.min.y) / 2; }
    MODELS[n] = { scene: root, len: size.z, W: Math.min(size.x, 2.05), wr };
  }).catch(e => console.warn('model', n, e)))).then(() => MODELS);
  return modelsReady;
}
export const modelReady = type => !CARS[type]?.model || !!MODELS[CARS[type].model];

function makeModelCar(type, color) {
  const M0 = MODELS[CARS[type].model];
  const g = new THREE.Group(), root = M0.scene.clone(true);
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.28 });
  let light = new THREE.MeshStandardMaterial({ color: 0xfff6dc }), tail = new THREE.MeshStandardMaterial({ color: 0xb01010, transparent: true, opacity: 0.85 });
  root.traverse(o => {
    if (!o.isMesh) return;
    const n = o.material.name;
    if (n === 'paint') { if (o.material.map) paint.map = o.material.map; o.material = paint; }
    else if (n === 'headlight') { light = o.material = o.material.clone(); light.emissive = new THREE.Color(0); }
    else if (n === 'taillight') { tail = o.material = o.material.clone(); tail.emissive = new THREE.Color(0); }
  });
  g.add(root);
  const sh = new THREE.Mesh(shadowGeo, M.shadow); sh.scale.set(M0.W + 0.4, 1, M0.len + 0.5); sh.position.y = 0.04; g.add(sh);
  const wheels = [];
  for (const q of ['FL', 'FR', 'RL', 'RR']) {
    const w = root.getObjectByName('wheel_' + q); if (!w) continue;
    const pivot = new THREE.Group(); pivot.position.copy(w.position); w.parent.add(pivot);
    w.position.set(0, 0, 0); pivot.add(w); pivot.userData.front = q[0] === 'F'; wheels.push(pivot);
  }
  const hb = new THREE.Mesh(new THREE.PlaneGeometry(5, 11).rotateX(-Math.PI / 2), headBeam()); hb.position.set(0, 0.08, M0.len / 2 + 5.3); hb.rotation.y = Math.PI; g.add(hb);
  g.userData = { wheels, wr: M0.wr, paint, light, tail, type, len: M0.len, W: M0.W, model: true };
  return g;
}


// профили: lower — кузов до линии окон, gh — стеклянная часть [низ лобового, перед крыши, зад крыши, низ заднего]
const SHAPES = {
  ghazal: { W: 1.82, wr: 0.34, wb: 1.42, lower: [[-2.4, 0.32], [2.38, 0.32], [2.46, 0.55], [2.36, 0.82], [1.25, 0.98], [-1.35, 1.0], [-2.25, 0.96], [-2.46, 0.72]], gh: [[1.22, 0.98], [0.35, 1.42], [-0.85, 1.43], [-1.42, 1.0]], head: [2.4, 0.72], tail: [-2.42, 0.82] },
  dhib:   { W: 1.86, wr: 0.42, wb: 1.62, lower: [[-2.65, 0.45], [2.6, 0.45], [2.68, 0.75], [2.6, 1.05], [1.5, 1.2], [-2.6, 1.2], [-2.68, 0.9]], gh: [[1.45, 1.2], [0.78, 1.78], [-0.55, 1.8], [-0.68, 1.2]], head: [2.62, 0.95], tail: [-2.66, 1.0], bed: [-2.5, -0.8] },
  saqr:   { W: 2.0,  wr: 0.45, wb: 1.5,  lower: [[-2.5, 0.45], [2.45, 0.45], [2.53, 0.78], [2.45, 1.1], [1.55, 1.2], [-2.45, 1.22], [-2.53, 0.8]], gh: [[1.5, 1.2], [0.95, 1.86], [-2.28, 1.88], [-2.42, 1.22]], head: [2.48, 0.98], tail: [-2.5, 1.05], rack: true },
  barq:   { W: 1.98, wr: 0.36, wb: 1.45, lower: [[-2.25, 0.25], [2.25, 0.25], [2.3, 0.45], [2.1, 0.62], [0.9, 0.78], [-1.6, 0.82], [-2.2, 0.85], [-2.32, 0.55]], gh: [[0.85, 0.78], [0.0, 1.15], [-0.9, 1.16], [-1.7, 0.82]], head: [2.18, 0.56], tail: [-2.28, 0.7], spoiler: true },
};

function extrude(pts, depth, bevel = 0.05) {
  const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 1 });
  g.rotateY(-Math.PI / 2); g.translate(depth / 2 - bevel, 0, 0);
  return g.toNonIndexed();
}
const boxG = (w, h, d, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); return g.toNonIndexed(); };
function beam(a, b, x, w = 0.08, t = 0.06) { // стойка между двумя точками профиля
  const dz = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dz, dy);
  const g = new THREE.BoxGeometry(t, w, len); g.rotateX(-Math.atan2(dy, dz)); g.translate(x, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
  return g.toNonIndexed();
}

const cache = {};
function parts(type) {
  if (cache[type]) return cache[type];
  const S = SHAPES[type], W = S.W, Wg = W - 0.2, gh = S.gh;
  const paint = [extrude(S.lower, W, 0.06)];
  const glass = [extrude(gh, Wg, 0.03)];
  // крыша и стойки
  paint.push(boxG(Wg + 0.04, 0.06, gh[1][0] - gh[2][0] + 0.05, 0, gh[1][1] + 0.0, (gh[1][0] + gh[2][0]) / 2));
  for (const sx of [-1, 1]) {
    const x = sx * (Wg / 2 + 0.005);
    paint.push(beam(gh[0], gh[1], x), beam(gh[2], gh[3], x));
    const bz = (gh[1][0] + gh[2][0]) / 2 + (type === 'saqr' ? 0.5 : 0);
    paint.push(boxG(0.06, gh[1][1] - gh[0][1], 0.1, x, (gh[1][1] + gh[0][1]) / 2, bz));
    if (type === 'saqr') paint.push(boxG(0.06, gh[1][1] - gh[0][1], 0.1, x, (gh[1][1] + gh[0][1]) / 2, -1.3));
    paint.push(boxG(0.22, 0.12, 0.14, sx * (W / 2 + 0.06), gh[0][1] + 0.08, gh[0][0] - 0.25)); // зеркала
  }
  const dark = [boxG(W * 0.5, 0.2, 0.06, 0, S.head[1] - 0.05, S.head[0] + 0.02)]; // решётка
  dark.push(boxG(W - 0.1, 0.12, S.lower[1][0] - S.lower[0][0] - 0.1, 0, S.lower[0][1] - 0.02, (S.lower[0][0] + S.lower[1][0]) / 2)); // днище
  const chrome = [boxG(W * 0.52, 0.04, 0.07, 0, S.head[1] + 0.07, S.head[0] + 0.02), boxG(W * 0.52, 0.04, 0.07, 0, S.head[1] - 0.17, S.head[0] + 0.02)];
  chrome.push(boxG(0.5, 0.12, 0.03, 0, S.lower[0][1] + 0.18, S.lower[1][0] + 0.05), boxG(0.5, 0.12, 0.03, 0, S.tail[1] - 0.25, S.lower[0][0] - 0.05)); // номера
  const lights = [], tails = [];
  for (const sx of [-1, 1]) {
    lights.push(boxG(0.42, 0.13, 0.08, sx * (W / 2 - 0.3), S.head[1], S.head[0]));
    tails.push(boxG(0.4, 0.14, 0.06, sx * (W / 2 - 0.28), S.tail[1], S.tail[0]));
  }
  if (S.bed) dark.push(boxG(W - 0.24, 0.03, S.bed[1] - S.bed[0], 0, 1.215, (S.bed[0] + S.bed[1]) / 2));
  if (S.rack) {
    dark.push(boxG(Wg - 0.2, 0.05, 2.2, 0, gh[1][1] + 0.16, -0.6));
    for (const sx of [-1, 1]) dark.push(boxG(0.05, 0.12, 2.2, sx * (Wg / 2 - 0.12), gh[1][1] + 0.1, -0.6));
  }
  if (S.spoiler) {
    paint.push(boxG(W - 0.2, 0.05, 0.32, 0, 1.05, -2.0));
    for (const sx of [-0.6, 0.6]) dark.push(boxG(0.05, 0.2, 0.08, sx, 0.93, -2.0));
  }
  return (cache[type] = {
    paint: mergeGeometries(paint), glass: mergeGeometries(glass), dark: mergeGeometries(dark),
    chrome: mergeGeometries(chrome), light: mergeGeometries(lights), tail: mergeGeometries(tails),
  });
}

// колесо: шина + диск, цвета в вершинах
const wheelCache = {};
function wheelGeo(r) {
  if (wheelCache[r]) return wheelCache[r];
  const paintG = (g, hex) => { g = g.toNonIndexed(); const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const tire = paintG(new THREE.CylinderGeometry(r, r, 0.26, 18).rotateZ(Math.PI / 2), '#141414');
  const rim = paintG(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.27, 12).rotateZ(Math.PI / 2), '#c9ccd0');
  const hub = paintG(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.28, 6).rotateZ(Math.PI / 2), '#555');
  const spokes = [];
  for (let k = 0; k < 5; k++) spokes.push(paintG(new THREE.BoxGeometry(0.275, r * 1.1, 0.05).rotateX(k / 5 * Math.PI), '#9a9ea3'));
  return (wheelCache[r] = mergeGeometries([tire, rim, hub, ...spokes]));
}

const M = {
  glass: new THREE.MeshPhongMaterial({ color: 0x18222e, shininess: 90, specular: 0x667788 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x1c1c1c }),
  chrome: new THREE.MeshPhongMaterial({ color: 0xe0e0e0, shininess: 100, specular: 0xffffff }),
  wheel: new THREE.MeshLambertMaterial({ vertexColors: true }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
};
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
// пятно света фар на дороге (ночью)
let beamMat = null;
function headBeam() {
  if (!beamMat) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 20, 2, 32, 40, 80); r.addColorStop(0, 'rgba(255,245,220,.9)'); r.addColorStop(1, 'rgba(255,245,220,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 128);
    beamMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
  }
  return beamMat;
}
export function setCarNight(n) { const m = headBeam(); m.opacity = n * 0.75; m.visible = n > 0.05; }

export function makeCar(type = 'ghazal', color = '#f4f4f2') {
  if (CARS[type]?.model) { if (MODELS[CARS[type].model]) return makeModelCar(type, color); type = 'ghazal'; } // пока модель грузится — временная машина
  const S = SHAPES[type] || SHAPES.ghazal, P = parts(type in SHAPES ? type : 'ghazal');
  const g = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color, shininess: 70, specular: 0x444444 });
  const light = new THREE.MeshLambertMaterial({ color: 0xfff6dc, emissive: 0x000000 });
  const tail = new THREE.MeshLambertMaterial({ color: 0xb01010, emissive: 0x000000 });
  const len = S.lower[1][0] - S.lower[0][0];
  const sh = new THREE.Mesh(shadowGeo, M.shadow); sh.scale.set(S.W + 0.4, 1, len + 0.5); sh.position.y = 0.05; g.add(sh);
  for (const [geo, mat] of [[P.paint, paint], [P.glass, M.glass], [P.dark, M.dark], [P.chrome, M.chrome], [P.light, light], [P.tail, tail]]) {
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m);
  }
  const hb = new THREE.Mesh(new THREE.PlaneGeometry(5, 11).rotateX(-Math.PI / 2), headBeam()); hb.position.set(0, 0.08, len / 2 + 5.3); hb.rotation.y = Math.PI; g.add(hb);
  const wheels = [], wg = wheelGeo(S.wr);
  for (const sz of [1, -1]) for (const sx of [-1, 1]) {
    const pivot = new THREE.Group(), w = new THREE.Mesh(wg, M.wheel);
    pivot.add(w); pivot.position.set(sx * (S.W / 2 - 0.1), S.wr, sz * S.wb);
    pivot.userData.front = sz > 0; g.add(pivot); wheels.push(pivot);
  }
  g.userData = { wheels, wr: S.wr, paint, light, tail, type, len, W: S.W };
  return g;
}

export function animateCar(car, speed, steer, dt, braking, night) {
  for (const w of car.userData.wheels) {
    w.children[0].rotation.x += speed * dt / car.userData.wr;
    if (w.userData.front) w.rotation.y = steer;
  }
  car.userData.tail.emissive.setRGB(braking ? 0.9 : night * 0.5, 0, 0);
  car.userData.light.emissive.setRGB(night, night * 0.95, night * 0.8);
}
