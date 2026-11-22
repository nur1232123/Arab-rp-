// Настоящий персонаж (Quaternius, CC0) со скелетом и анимациями.
// Одежда (тоб, шемаг, повседневная) генерируется поверх тела и привязывается к тем же костям.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { SKINS } from '../shared/world.js';

const DIR = '/models/human/';
let base = null, loading = null;
const variants = {}; // outfit -> готовый шаблон (сцена с одеждой)

export const humanReady = () => !!base;

export function loadHuman() {
  if (loading) return loading;
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const tl = new THREE.TextureLoader();
  const tex = n => tl.loadAsync(DIR + n).then(t => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t; });
  loading = Promise.all([
    loader.loadAsync(DIR + 'char_male.glb'), loader.loadAsync(DIR + 'anims.glb'),
    loader.loadAsync(DIR + 'hair_beard.glb'), loader.loadAsync(DIR + 'hair_buzzed.glb'),
    tex('skin_male_light.webp'), tex('skin_male_dark.webp'),
  ]).then(([ch, an, beard, buzz, light, dark]) => {
    const clips = {}; for (const c of an.animations) clips[c.name] = c;
    // высота ~1.8 м
    const box = new THREE.Box3().setFromObject(ch.scene); const h = box.max.y - box.min.y;
    base = { scene: ch.scene, clips, beard: beard.scene, buzz: buzz.scene, light, dark, scale: h > 0.5 && h < 4 ? 1.8 / h : 1 };
    return base;
  }).catch(e => { console.warn('human load failed', e); loading = null; throw e; });
  return loading;
}

// ---------- одежда ----------
const clothMat = (c, map) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0, map: map || null, side: THREE.DoubleSide });
let shemaghTex = null;
function shemagh() {
  if (shemaghTex) return shemaghTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#b8152a';
  for (let i = 0; i < 64; i += 8) { g.fillRect(i + 3, 0, 2, 64); g.fillRect(0, i + 3, 64, 2); }
  for (let i = 0; i < 64; i += 16) for (let j = 0; j < 64; j += 16) g.fillRect(i + 9, j + 9, 4, 4);
  shemaghTex = new THREE.CanvasTexture(c); shemaghTex.colorSpace = THREE.SRGBColorSpace; shemaghTex.wrapS = shemaghTex.wrapT = THREE.RepeatWrapping; shemaghTex.repeat.set(5, 5);
  return shemaghTex;
}

function findBody(root) { let b = null; root.traverse(o => { if (o.isSkinnedMesh && (!b || o.geometry.attributes.position.count > b.geometry.attributes.position.count)) b = o; }); return b; }

// копия части тела, «надутая» по нормалям (облегающая одежда)
function shell(body, pick, inflate, mat) {
  const g = body.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const bones = body.skeleton.bones.map(b => b.name);
  const sel = new Uint8Array(pos.count);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    p.fromBufferAttribute(pos, i);
    sel[i] = pick(bones[best], p) ? 1 : 0;
  }
  const idx = g.index ? g.index.array : [...Array(pos.count).keys()], out = [];
  for (let t = 0; t < idx.length; t += 3) if (sel[idx[t]] && sel[idx[t + 1]] && sel[idx[t + 2]]) out.push(idx[t], idx[t + 1], idx[t + 2]);
  const ng = g.clone(); ng.setIndex(out);
  // позиции в модели сжаты в int16 — переводим в float, иначе «надувание» переполняет диапазон
  const np = new THREE.Float32BufferAttribute(pos.count * 3, 3);
  for (let i = 0; i < pos.count; i++) np.setXYZ(i, pos.getX(i) + nor.getX(i) * inflate, pos.getY(i) + nor.getY(i) * inflate, pos.getZ(i) + nor.getZ(i) * inflate);
  ng.setAttribute('position', np);
  ng.morphAttributes = {};
  const m = new THREE.SkinnedMesh(ng, mat); m.bind(body.skeleton, body.bindMatrix); m.castShadow = true; m.frustumCulled = false;
  return m;
}

// юбка тоба от пояса до щиколоток, привязанная к тазу и ногам
function robe(body, mat) {
  const sk = body.skeleton, bi = n => sk.bones.findIndex(b => b.name === n);
  const g = body.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const legBones = new Set(['thigh_l', 'thigh_r', 'calf_l', 'calf_r'].map(bi));
  // границы ног по высоте
  const pts = [];
  for (let i = 0; i < pos.count; i++) {
    let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    if (legBones.has(best) || sk.bones[best].name === 'pelvis') pts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }
  const ys = pts.map(p => p[1]); const yTop = Math.max(...ys) - 0.02, yBot = Math.min(...ys) + 0.09;
  const RINGS = 10, SEG = 22, P = [], SI = [], SW = [], I = [];
  const tl = bi('thigh_l'), tr = bi('thigh_r'), cl = bi('calf_l'), cr = bi('calf_r'), pv = bi('pelvis');
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS, y = yTop + (yBot - yTop) * t;
    const near = pts.filter(p => Math.abs(p[1] - y) < 0.05);
    let x0 = -0.15, x1 = 0.15, z0 = -0.12, z1 = 0.12;
    if (near.length) { x0 = Math.min(...near.map(p => p[0])); x1 = Math.max(...near.map(p => p[0])); z0 = Math.min(...near.map(p => p[2])); z1 = Math.max(...near.map(p => p[2])); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, flare = 1 + t * 0.35;
    const rx = Math.max(0.17, (x1 - x0) / 2 + 0.05) * flare, rz = Math.max(0.13, (z1 - z0) / 2 + 0.06) * flare;
    for (let s = 0; s < SEG; s++) {
      const a = s / SEG * Math.PI * 2, x = cx + Math.cos(a) * rx, z = cz + Math.sin(a) * rz;
      P.push(x, y, z);
      const side = Math.min(1, Math.max(0, 0.5 + (x - cx) / (rx * 1.3))); // 1 — левая нога (+x)
      const hip = 1 - Math.min(1, t / 0.3), leg = 1 - hip, u = Math.min(1, Math.max(0, (t - 0.35) / 0.4));
      const w = [[pv, hip], [tl, leg * side * (1 - u)], [cl, leg * side * u], [tr, leg * (1 - side) * (1 - u)], [cr, leg * (1 - side) * u]]
        .sort((p, q) => q[1] - p[1]).slice(0, 4);
      const sum = w.reduce((s2, x2) => s2 + x2[1], 0) || 1;
      for (let k = 0; k < 4; k++) { SI.push(w[k] ? w[k][0] : 0); SW.push(w[k] ? w[k][1] / sum : 0); }
      if (r) { const a0 = (r - 1) * SEG + s, a1 = (r - 1) * SEG + (s + 1) % SEG, b0 = r * SEG + s, b1 = r * SEG + (s + 1) % SEG; I.push(a0, b0, a1, a1, b0, b1); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  geo.setIndex(I); geo.computeVertexNormals();
  const m = new THREE.SkinnedMesh(geo, mat); m.bind(sk, body.bindMatrix); m.castShadow = true; m.frustumCulled = false;
  return m;
}

// перенос волос/бороды на скелет персонажа (кости совпадают по именам)
function attachSkinned(srcScene, body) {
  const byName = Object.fromEntries(body.skeleton.bones.map(b => [b.name, b]));
  const out = [];
  srcScene.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const m = new THREE.SkinnedMesh(o.geometry, o.material);
    const bones = o.skeleton.bones.map(b => byName[b.name] || byName.Head);
    m.bind(new THREE.Skeleton(bones, o.skeleton.boneInverses), body.bindMatrix);
    m.castShadow = true; m.frustumCulled = false; out.push(m);
  });
  return out;
}

function buildVariant(outfit) {
  const root = SkeletonUtils.clone(base.scene);
  const body = findBody(root);
  body.castShadow = true; body.frustumCulled = false;
  const parent = body.parent;
  const head = body.skeleton.bones.find(b => b.name === 'Head');
  const isT = outfit.startsWith('thobe');
  const add = m => { m.userData.cloth = true; parent.add(m); };
  if (isT) {
    const white = clothMat('#f6f6f2');
    add(shell(body, n => /spine|clavicle|upperarm|lowerarm|pelvis/.test(n), 0.012, white));
    add(robe(body, white));
    add(shell(body, (n, p) => /neck/.test(n), 0.008, white));
    for (const m of attachSkinned(base.beard, body)) { m.material = m.material.clone(); m.material.color.set('#3a2a1e'); add(m); }
    // головной убор: шапка по голове + свисающая ткань + агаль
    const hm = outfit === 'thobe_red' ? clothMat('#ffffff', shemagh()) : clothMat('#fbfbf8');
    const hb = new THREE.Box3(); const bp = body.geometry.attributes.position, v = new THREE.Vector3();
    const headIdx = body.skeleton.bones.indexOf(head);
    const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
    for (let i = 0; i < bp.count; i++) { let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } } if (best === headIdx) hb.expandByPoint(v.fromBufferAttribute(bp, i)); }
    const hc = hb.getCenter(new THREE.Vector3()), hs = hb.getSize(new THREE.Vector3());
    const cap = shell(body, (n, p) => n === 'Head' && (p.y > hc.y + hs.y * 0.08 || p.z < hc.z - hs.z * 0.12), 0.022, hm);
    add(cap);
    // ткань, свисающая с головы: в пространстве привязки, затем к кости головы
    // из пространства геометрии тела (поза привязки) в пространство кости головы
    const inv = body.skeleton.boneInverses[headIdx].clone().multiply(body.bindMatrix);
    const drapeGeo = new THREE.CylinderGeometry(hs.x * 0.6, hs.x * 0.86, hs.y * 0.95, 18, 4, true, Math.PI * 0.24, Math.PI * 1.52);
    drapeGeo.translate(hc.x, hc.y - hs.y * 0.12, hc.z - hs.z * 0.06);
    const drape = new THREE.Mesh(drapeGeo, hm); drape.applyMatrix4(inv); drape.castShadow = true; head.add(drape);
    const agal = new THREE.Mesh(new THREE.TorusGeometry(hs.x * 0.52, hs.x * 0.07, 6, 20).rotateX(Math.PI / 2).translate(hc.x, hc.y + hs.y * 0.33, hc.z - hs.z * 0.03), clothMat('#141414'));
    agal.applyMatrix4(inv); head.add(agal);
    // глаза и брови оставляем; волосы скрыты под тканью
  } else {
    add(shell(body, n => /spine|clavicle|upperarm|neck/.test(n) || (/lowerarm/.test(n) && false), 0.01, clothMat('#2c5d8f')));
    add(shell(body, n => /pelvis|thigh|calf/.test(n), 0.01, clothMat('#2b3a55')));
    add(shell(body, n => /foot|ball/.test(n), 0.012, clothMat('#efefef')));
    for (const m of attachSkinned(base.buzz, body)) { m.material = m.material.clone(); m.material.color.set('#3a2a1e'); add(m); }
  }
  root.scale.setScalar(base.scale);
  return root;
}

export function makeHuman({ outfit = 'thobe_red', skin = SKINS[1] } = {}) {
  if (!variants[outfit]) variants[outfit] = buildVariant(outfit);
  const root = SkeletonUtils.clone(variants[outfit]);
  const body = findBody(root);
  // цвет кожи: две текстуры + оттенок
  const k = Math.max(0, SKINS.indexOf(skin));
  const mat = body.material.clone();
  mat.map = k < 2 ? base.light : base.dark; mat.color.set(['#ffffff', '#e9cdb0', '#ffffff', '#a98468'][k]);
  body.material = mat;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const holder = new THREE.Group(); holder.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const [n, c] of Object.entries(base.clips)) actions[n] = mixer.clipAction(c);
  for (const n of ['Jump_Start', 'Jump_Land', 'Death01', 'Interact', 'Punch_Jab']) if (actions[n]) { actions[n].setLoop(THREE.LoopOnce); actions[n].clampWhenFinished = true; }
  holder.userData = { mixer, actions, cur: null, human: true };
  play(holder, 'Idle_Loop', 0);
  return holder;
}

function play(h, name, fade = 0.2) {
  const u = h.userData, a = u.actions[name]; if (!a || u.cur === name) return a;
  const prev = u.actions[u.cur];
  a.reset().setEffectiveWeight(1).play();
  if (prev) prev.crossFadeTo(a, fade, false);
  u.cur = name; return a;
}

// speed — м/с по земле, air — в воздухе, dead — упал
export function animateHuman(h, speed, air, dt, dead = false) {
  const u = h.userData;
  let n = 'Idle_Loop', ts = 1;
  if (dead) n = 'Death01';
  else if (air) n = 'Jump_Loop';
  else if (speed > 6.2) { n = 'Sprint_Loop'; ts = speed / 7.5; }
  else if (speed > 2.6) { n = 'Jog_Fwd_Loop'; ts = speed / 5; }
  else if (speed > 0.25) { n = 'Walk_Loop'; ts = Math.max(0.6, speed / 1.8); }
  const a = play(h, n, n === 'Jump_Loop' ? 0.12 : 0.22);
  if (u.actions[u.cur]) u.actions[u.cur].timeScale = ts;
  u.mixer.update(dt);
}
export function emote(h, name) { const a = play(h, name, 0.2); return a; }
