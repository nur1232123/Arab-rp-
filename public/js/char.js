// Персонаж из сегментов с суставами: ходьба, бег, прыжок, ожидание.
// Одежда: тоб + красный шемаг, тоб + белая гутра, или повседневная.
import * as THREE from 'three';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const mats = {};
const mat = c => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));

let shemaghTex = null;
function shemagh() {
  if (shemaghTex) return shemaghTex;
  const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#c0182a';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2 === 0) g.fillRect(i, j, 1, 1);
  shemaghTex = new THREE.CanvasTexture(c); shemaghTex.colorSpace = THREE.SRGBColorSpace;
  shemaghTex.magFilter = THREE.NearestFilter; shemaghTex.minFilter = THREE.NearestFilter; shemaghTex.generateMipmaps = false;
  return shemaghTex;
}

function seg(parent, geo, material, x, y, z) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
function joint(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

export function makeChar({ outfit = 'thobe_red', skin = '#c99a6e', shirt = '#2c5d8f' } = {}) {
  const thobe = outfit.startsWith('thobe');
  const skinM = mat(skin), cloth = mat(thobe ? '#f5f5f1' : shirt), pants = mat(thobe ? '#f5f5f1' : '#2d3d5c');
  const shoe = mat(thobe ? '#5a3d24' : '#ececec'), hair = mat('#1b1612');
  const root = new THREE.Group();
  const hips = joint(root, 0, 0.95, 0);
  const torso = joint(hips, 0, 0, 0);
  seg(torso, box(0.44, 0.56, 0.25), cloth, 0, 0.28, 0);
  seg(torso, box(0.12, 0.08, 0.12), skinM, 0, 0.6, 0);
  const head = joint(torso, 0, 0.64, 0);
  seg(head, box(0.22, 0.26, 0.24), skinM, 0, 0.13, 0);
  seg(head, box(0.05, 0.03, 0.02), mat('#1a1a1a'), -0.05, 0.16, 0.121); seg(head, box(0.05, 0.03, 0.02), mat('#1a1a1a'), 0.05, 0.16, 0.121);
  seg(head, box(0.2, 0.09, 0.05), hair, 0, 0.03, 0.1); // борода
  if (thobe) {
    const sm = outfit === 'thobe_red' ? new THREE.MeshLambertMaterial({ map: shemagh() }) : mat('#fbfbf8');
    seg(head, box(0.27, 0.12, 0.29), sm, 0, 0.29, -0.005);
    seg(head, box(0.3, 0.42, 0.07), sm, 0, 0.08, -0.15);
    seg(head, box(0.04, 0.34, 0.2), sm, -0.135, 0.11, -0.03); seg(head, box(0.04, 0.34, 0.2), sm, 0.135, 0.11, -0.03);
    const agal = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.022, 6, 16).rotateX(Math.PI / 2), mat('#111'));
    agal.position.set(0, 0.34, -0.01); head.add(agal);
  } else {
    seg(head, box(0.24, 0.08, 0.26), hair, 0, 0.27, -0.01);
    seg(head, box(0.24, 0.16, 0.05), hair, 0, 0.2, -0.12);
  }
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const sh = joint(torso, s * 0.28, 0.52, 0);
    seg(sh, box(0.12, 0.32, 0.13), cloth, 0, -0.15, 0);
    const el = joint(sh, 0, -0.3, 0);
    seg(el, box(0.1, 0.28, 0.11), thobe ? cloth : skinM, 0, -0.14, 0);
    seg(el, box(0.09, 0.1, 0.1), skinM, 0, -0.32, 0);
    arms.push({ sh, el });
    const hip = joint(hips, s * 0.11, 0, 0);
    seg(hip, box(0.17, 0.46, 0.18), pants, 0, -0.23, 0);
    const kn = joint(hip, 0, -0.46, 0);
    seg(kn, box(0.15, 0.43, 0.16), pants, 0, -0.21, 0);
    seg(kn, box(0.15, 0.08, 0.27), shoe, 0, -0.45, 0.05);
    legs.push({ hip, kn });
  }
  let robe = null;
  if (thobe) {
    robe = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.33, 0.84, 12), cloth);
    robe.position.y = -0.4; robe.castShadow = true; hips.add(robe);
  }
  root.userData = { hips, torso, head, arms, legs, robe, phase: 0 };
  return root;
}

// speed — скорость по земле (м/с), air — в воздухе
export function animateChar(ch, speed, air, dt, t) {
  const u = ch.userData;
  const amp = Math.min(1, speed / 6.5), walk = Math.min(1, speed / 1.5);
  u.phase += dt * (speed < 0.2 ? 0 : 4 + speed * 1.15);
  const p = u.phase, s = Math.sin(p);
  const L = u.legs, A = u.arms;
  if (air) {
    L[0].hip.rotation.x = -0.7; L[0].kn.rotation.x = 1.0; L[1].hip.rotation.x = -0.2; L[1].kn.rotation.x = 0.5;
    A[0].sh.rotation.x = -0.9; A[1].sh.rotation.x = -0.9; A[0].sh.rotation.z = -0.3; A[1].sh.rotation.z = 0.3;
    u.torso.rotation.x = 0.1; u.hips.position.y = 0.95;
  } else {
    const legA = (0.5 + amp * 0.45) * walk, armA = (0.4 + amp * 0.5) * walk;
    L[0].hip.rotation.x = -s * legA; L[1].hip.rotation.x = s * legA;
    L[0].kn.rotation.x = Math.max(0, Math.sin(p + 1.4)) * (0.5 + amp * 0.9) * walk;
    L[1].kn.rotation.x = Math.max(0, Math.sin(p + 1.4 + Math.PI)) * (0.5 + amp * 0.9) * walk;
    A[0].sh.rotation.x = s * armA; A[1].sh.rotation.x = -s * armA;
    A[0].sh.rotation.z = -0.06; A[1].sh.rotation.z = 0.06;
    A[0].el.rotation.x = A[1].el.rotation.x = -0.15 - amp * 0.9;
    u.torso.rotation.x = amp * 0.2;
    const breathe = speed < 0.2 ? Math.sin(t * 2) * 0.006 : 0;
    u.hips.position.y = 0.95 + Math.abs(Math.cos(p)) * 0.05 * walk * (0.5 + amp) - amp * 0.04 + breathe;
  }
  if (u.robe) u.robe.rotation.x = -(L[0].hip.rotation.x + L[1].hip.rotation.x) * 0.25 + (air ? -0.15 : 0);
}
