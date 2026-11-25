// Бой: оружие в руках, прицел с автонаводкой (как на телефонах в старых GTA), выстрелы, эффекты.
// Урон и патроны считает сервер: клиент шлёт только «выстрелил вот туда, попал вот в этого».
import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER } from '../shared/world.js';
import { glowTex } from './build.js';

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

// ---------- модели оружия (простые коробки, тёмный металл) ----------
const gunMat = new THREE.MeshStandardMaterial({ color: '#1b1c1f', metalness: 0.7, roughness: 0.35 });
const woodMat = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.7 });
function box(g, w, h, d, x, y, z, m = gunMat, rx = 0) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; g.add(b); return b; }
export function makeGun(type) {
  const g = new THREE.Group(); // ствол смотрит в +Z, рукоять — в начале координат
  if (type === 'pistol') { box(g, 0.035, 0.05, 0.2, 0, 0.03, 0.07); box(g, 0.03, 0.1, 0.045, 0, -0.03, 0, gunMat, -0.25); }
  else if (type === 'smg') { box(g, 0.045, 0.07, 0.32, 0, 0.03, 0.1); box(g, 0.03, 0.12, 0.04, 0, -0.06, 0.12); box(g, 0.03, 0.09, 0.04, 0, -0.03, -0.02, gunMat, -0.25); box(g, 0.02, 0.02, 0.12, 0, 0.04, 0.3); }
  else if (type === 'rifle') { box(g, 0.05, 0.08, 0.5, 0, 0.03, 0.18); box(g, 0.02, 0.02, 0.22, 0, 0.045, 0.53); box(g, 0.035, 0.14, 0.05, 0, -0.07, 0.16, gunMat, 0.35); box(g, 0.04, 0.09, 0.22, 0, 0.0, -0.17, woodMat); box(g, 0.03, 0.09, 0.04, 0, -0.04, 0.0, woodMat, -0.3); }
  g.userData.muzzle = type === 'rifle' ? 0.64 : type === 'smg' ? 0.36 : 0.18;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// поворот кости так, чтобы направление «кость → дочерняя кость» смотрело в dir (мировые координаты)
function aimBone(bone, child, dir, k = 1) {
  if (!bone || !child) return;
  bone.updateWorldMatrix(true, false); child.updateWorldMatrix(true, false);
  bone.getWorldPosition(tmpA); child.getWorldPosition(tmpB);
  const cur = tmpB.sub(tmpA).normalize();
  tmpQ.setFromUnitVectors(cur, dir);
  if (k < 1) tmpQ.slerp(new THREE.Quaternion(), 1 - k);
  const wq = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(tmpQ);
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(pq.multiply(wq));
  bone.updateWorldMatrix(false, true);
}
const bones = ch => ch.userData.bones || (ch.userData.bones = {
  ua: ch.getObjectByName('upperarm_r'), la: ch.getObjectByName('lowerarm_r'), hand: ch.getObjectByName('hand_r'),
  ual: ch.getObjectByName('upperarm_l'), lal: ch.getObjectByName('lowerarm_l'), handl: ch.getObjectByName('hand_l'),
});

// держит оружие персонажа ch: при прицеливании — рука к цели, иначе ствол опущен вдоль тела
export function poseWeapon(ch, gun, aimDir, aiming) {
  if (!gun) return;
  const b = bones(ch);
  if (ch.userData.human && b.hand) {
    if (aiming) {
      aimBone(b.ua, b.la, aimDir); aimBone(b.la, b.hand, aimDir);
      if (gun.userData.type === 'rifle' || gun.userData.type === 'smg') { // вторая рука поддерживает цевьё
        b.hand.getWorldPosition(tmpC).addScaledVector(aimDir, 0.28);
        b.ual.getWorldPosition(tmpA); const d2 = tmpC.sub(tmpA).normalize();
        aimBone(b.ual, b.lal, d2); aimBone(b.lal, b.handl, d2);
      }
    }
    b.hand.getWorldPosition(gun.position);
  } else { // простой персонаж: рука-коробка
    ch.updateWorldMatrix(true, true);
    gun.position.copy(ch.position).add(tmpA.set(-0.3, aiming ? 1.35 : 0.75, aiming ? 0.35 : 0.1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ch.rotation.y));
    if (ch.userData.arms) ch.userData.arms[0].sh.rotation.x = aiming ? -1.5 : ch.userData.arms[0].sh.rotation.x;
  }
  if (aiming) gun.quaternion.setFromUnitVectors(tmpB.set(0, 0, 1), aimDir);
  else { tmpB.set(Math.sin(ch.rotation.y), -0.85, Math.cos(ch.rotation.y)).normalize(); gun.quaternion.setFromUnitVectors(tmpA.set(0, 0, 1), tmpB); }
}

// ---------- эффекты ----------
export function makeFx(scene) {
  const flashMat = new THREE.SpriteMaterial({ map: glowTex(), color: '#ffd27a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  const puffMat = new THREE.SpriteMaterial({ map: glowTex(), color: '#cfc6b4', depthWrite: false, transparent: true, opacity: 0.7 });
  const lineMat = new THREE.LineBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.9, toneMapped: false });
  const live = [];
  const add = (obj, life) => { scene.add(obj); live.push({ obj, t: 0, life }); };
  return {
    flash(p) { const s = new THREE.Sprite(flashMat); s.position.copy(p); s.scale.setScalar(0.45); add(s, 0.06); },
    puff(p) { const s = new THREE.Sprite(puffMat.clone()); s.position.copy(p); s.scale.setScalar(0.3); add(s, 0.35); },
    tracer(a, b) { const g = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]); const l = new THREE.Line(g, lineMat.clone()); add(l, 0.07); },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const f = live[i]; f.t += dt; const k = f.t / f.life;
        if (f.obj.isSprite && f.obj.material !== flashMat) { f.obj.scale.setScalar(0.3 + k * 0.6); f.obj.material.opacity = 0.7 * (1 - k); }
        if (f.obj.isLine) f.obj.material.opacity = 0.9 * (1 - k);
        if (k >= 1) { scene.remove(f.obj); if (f.obj.isLine) f.obj.geometry.dispose(); live.splice(i, 1); }
      }
    },
  };
}

// ---------- прицеливание и попадание ----------
// цель для автонаводки: ближайший живой игрок в конусе перед камерой и в пределах дальности
export function pickTarget(from, fwd, others, range, cone = 0.55, blocked) {
  let best = null, bs = Infinity;
  for (const o of others.values()) {
    if (o.dead) continue;
    const p = tmpA.set(o.mode ? o.c.cx : o.c.x, (o.mode ? o.car.position.y : o.c.y) + 1.1, o.mode ? o.c.cz : o.c.z);
    const v = tmpB.copy(p).sub(from), d = v.length(); if (d > range || d < 0.3) continue;
    v.normalize(); const ang = Math.acos(Math.max(-1, Math.min(1, v.x * fwd.x + v.z * fwd.z) / Math.hypot(fwd.x, fwd.z)));
    if (ang > cone) continue;
    if (blocked && blocked(from, p)) continue;
    const s = ang * 10 + d * 0.05; if (s < bs) { bs = s; best = { o, p: p.clone(), d }; }
  }
  return best;
}
export { WEAPONS, WEAPON_ORDER };
