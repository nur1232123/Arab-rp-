// 3D-автосалон: отдельная маленькая сцена с подиумом. Пока окно салона открыто,
// главный цикл рисует её вместо города (город всё равно закрыт окном).
import * as THREE from 'three';
import { makeCar, animateCar } from './cars.js';

export function makeShowroom(envTex) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#141210');
  scene.fog = new THREE.Fog('#141210', 14, 30);
  scene.environment = envTex;
  scene.add(new THREE.HemisphereLight('#fff3e0', '#2a2018', 1.1));
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(4, 8, 5); scene.add(key);
  const rim = new THREE.DirectionalLight('#ffd08a', 1.4); rim.position.set(-6, 3, -5); scene.add(rim);

  // подиум: тёмный глянцевый круг с золотым кольцом и сеткой пола
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 48), new THREE.MeshStandardMaterial({ color: '#1d1a17', metalness: 0.2, roughness: 0.55 }));
  disc.position.y = -0.125; scene.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.05, 8, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f0b429' }));
  ring.position.y = 0.01; scene.add(ring);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#0f0d0b', roughness: 0.9 }));
  floor.position.y = -0.25; scene.add(floor);
  const grid = new THREE.GridHelper(60, 30, '#3a3128', '#2a241e'); grid.position.y = -0.24; scene.add(grid);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  let car = null, type = null, color = null, yaw = 0.8, dragT = 0, wheelT = 0;
  let person = null, animate = null; // персонаж в магазине одежды
  let closeUp = 0; // для автотестов: 0 — обычный вид, >0 — расстояние камеры

  function setCar(t, c) {
    if (person) { scene.remove(person); person = null; }
    if (t === type && c === color && car) return;
    if (car && t === type) { car.userData.paint.color.set(c); color = c; return; }
    if (car) scene.remove(car);
    type = t; color = c;
    car = makeCar(t, c);
    car.traverse(o => { if (o.isMesh && o.material?.blending === THREE.AdditiveBlending) o.visible = false; }); // без пятна фар
    scene.add(car);
  }
  // персонаж на подиуме; anim(ch, dt) — его анимация (стоит и дышит)
  function setChar(ch, anim) {
    if (car) { scene.remove(car); car = null; type = null; }
    if (person) scene.remove(person);
    person = ch; animate = anim; scene.add(ch);
  }
  function drag(dx) { yaw -= dx * 0.008; dragT = performance.now(); }

  function render(renderer, dt) {
    if (!car && !person) return;
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    if (performance.now() - dragT > 1500) yaw += dt * 0.35;
    wheelT += dt;
    let R, camY, lookY;
    if (car) {
      animateCar(car, 0, Math.sin(wheelT * 0.8) * 0.3, dt, false, 0.3);
      R = 5.6 + (car.userData.len || 4.6) * 0.95; camY = 2.3; lookY = 0.45;
    } else { animate?.(person, dt); R = closeUp || 4.8; camY = closeUp ? 1.6 : 1.5; lookY = closeUp ? 1.45 : 0.92; }
    camera.aspect = w / h;
    // модель сдвигаем влево: справа на широком экране панель с ценой
    if (w > h * 1.3) camera.setViewOffset(w, h, w * 0.17, 0, w, h); else camera.clearViewOffset();
    camera.position.set(Math.sin(yaw) * R, camY, Math.cos(yaw) * R);
    camera.lookAt(0, lookY, 0);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  // для автотестов: застыть под углом y и (по желанию) подойти ближе
  const view = (y, dist = 0) => { yaw = y; closeUp = dist; dragT = performance.now() + 1e9; };
  return { setCar, setChar, drag, render, view, get type() { return type; }, get color() { return color; } };
}
