// Модели машин из простых фигур (лёгкие для телефона). Вперёд = +Z.
import * as THREE from 'three';

const M = {
  glass: new THREE.MeshLambertMaterial({ color: 0x1b2430 }),
  tire: new THREE.MeshLambertMaterial({ color: 0x151515 }),
  rim: new THREE.MeshLambertMaterial({ color: 0xc8c8c8 }),
  light: new THREE.MeshBasicMaterial({ color: 0xfff4d6 }),
  tail: new THREE.MeshBasicMaterial({ color: 0xd11a1a }),
  black: new THREE.MeshLambertMaterial({ color: 0x222222 }),
  chrome: new THREE.MeshLambertMaterial({ color: 0xdddddd }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
};
const box = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2);
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function part(g, mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(g, mat); m.scale.set(w, h, d); m.position.set(x, y, z); return m;
}

// L — длина, W — ширина, bodyH/bodyY — кузов, cab — кабина, wr — радиус колеса
const SHAPES = {
  ghazal: { L: 4.7, W: 1.82, bodyH: 0.62, bodyY: 0.62, cab: { l: 2.4, h: 0.58, z: -0.15 }, wr: 0.34, wb: 1.42 },
  dhib:   { L: 5.3, W: 1.86, bodyH: 0.78, bodyY: 0.85, cab: { l: 2.0, h: 0.72, z: 0.65 }, wr: 0.4, wb: 1.7, bed: true },
  saqr:   { L: 5.0, W: 2.0,  bodyH: 0.9,  bodyY: 0.9,  cab: { l: 3.5, h: 0.82, z: -0.3 }, wr: 0.44, wb: 1.6, rack: true },
  barq:   { L: 4.5, W: 1.98, bodyH: 0.5,  bodyY: 0.52, cab: { l: 1.9, h: 0.44, z: -0.35 }, wr: 0.36, wb: 1.5, spoiler: true },
};

export function makeCar(type = 'ghazal', color = '#f4f4f2') {
  const S = SHAPES[type] || SHAPES.ghazal;
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const bodyTop = S.bodyY + S.bodyH / 2;

  g.add(part(shadowGeo, M.shadow, S.W + 0.5, 1, S.L + 0.6, 0, 0.04, 0));
  g.add(part(box, paint, S.W, S.bodyH, S.L, 0, S.bodyY, 0));
  // кабина: окна + крыша
  g.add(part(box, M.glass, S.W - 0.12, S.cab.h, S.cab.l, 0, bodyTop + S.cab.h / 2, S.cab.z));
  g.add(part(box, paint, S.W - 0.08, 0.08, S.cab.l - 0.2, 0, bodyTop + S.cab.h, S.cab.z));
  // стойки
  for (const sx of [-1, 1]) g.add(part(box, paint, 0.08, S.cab.h, 0.12, sx * (S.W / 2 - 0.08), bodyTop + S.cab.h / 2, S.cab.z + S.cab.l / 2 - 0.1));
  // фары и стопы
  for (const sx of [-1, 1]) {
    g.add(part(box, M.light, 0.42, 0.14, 0.05, sx * (S.W / 2 - 0.32), S.bodyY + S.bodyH * 0.2, S.L / 2 + 0.01));
    g.add(part(box, M.tail, 0.38, 0.14, 0.05, sx * (S.W / 2 - 0.3), S.bodyY + S.bodyH * 0.2, -S.L / 2 - 0.01));
  }
  g.add(part(box, M.chrome, S.W * 0.45, 0.22, 0.05, 0, S.bodyY, S.L / 2 + 0.02)); // решётка
  g.add(part(box, M.black, S.W + 0.04, 0.16, 0.25, 0, S.bodyY - S.bodyH / 2 + 0.1, S.L / 2 - 0.05));
  g.add(part(box, M.black, S.W + 0.04, 0.16, 0.25, 0, S.bodyY - S.bodyH / 2 + 0.1, -S.L / 2 + 0.05));

  if (S.bed) { // кузов пикапа
    const z0 = S.cab.z - S.cab.l / 2, len = S.L / 2 + z0;
    for (const sx of [-1, 1]) g.add(part(box, paint, 0.08, 0.4, len, sx * (S.W / 2 - 0.04), bodyTop + 0.2, -S.L / 2 + len / 2));
    g.add(part(box, paint, S.W, 0.4, 0.08, 0, bodyTop + 0.2, -S.L / 2 + 0.04));
    g.add(part(box, M.black, S.W - 0.2, 0.02, len - 0.1, 0, bodyTop + 0.01, -S.L / 2 + len / 2));
  }
  if (S.rack) { // багажник на крыше и запаска
    g.add(part(box, M.black, S.W - 0.3, 0.06, S.cab.l - 0.6, 0, bodyTop + S.cab.h + 0.12, S.cab.z));
    const sp = new THREE.Mesh(wheelGeo, M.tire); sp.scale.set(0.25, 0.4, 0.4); sp.rotation.y = Math.PI / 2; sp.position.set(0, S.bodyY + 0.1, -S.L / 2 - 0.15); g.add(sp);
  }
  if (S.spoiler) {
    g.add(part(box, paint, S.W - 0.2, 0.06, 0.35, 0, bodyTop + 0.32, -S.L / 2 + 0.25));
    for (const sx of [-0.6, 0.6]) g.add(part(box, M.black, 0.06, 0.3, 0.06, sx, bodyTop + 0.15, -S.L / 2 + 0.25));
  }

  const wheels = [];
  for (const sz of [1, -1]) for (const sx of [-1, 1]) {
    const w = new THREE.Group();
    w.add(part(wheelGeo, M.tire, 0.28, S.wr, S.wr, 0, 0, 0));
    w.add(part(wheelGeo, M.rim, 0.29, S.wr * 0.55, S.wr * 0.55, 0, 0, 0));
    w.position.set(sx * (S.W / 2 - 0.08), S.wr, sz * S.wb);
    w.userData.front = sz > 0;
    g.add(w); wheels.push(w);
  }
  g.userData = { wheels, wr: S.wr, paint, type, len: S.L };
  return g;
}

export function animateWheels(car, speed, steer, dt) {
  for (const w of car.userData.wheels) {
    w.children[0].rotation.x += speed * dt / car.userData.wr;
    w.children[1].rotation.x = w.children[0].rotation.x;
    if (w.userData.front) w.rotation.y = steer;
  }
}
