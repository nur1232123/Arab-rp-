// Arab RP — клиент: персонаж (ходьба/бег/прыжок), машины, камера как в GTA, сеть, интерфейс в стиле BR.
import * as THREE from 'three';
import {
  HALF, LIMIT, CITIES, CITY, CARS, COLORS, SKINS, OUTFITS, HIGHWAYS, STREETS, ROAD_GRID, DAY_MS, FOOD_PRICE,
  height, groundY, cityMask, nearestCity, coastE, coastW, cityPoints, FOOD_SPOTS,
} from '../shared/world.js';
import { buildWorld, makeTargetBeam, textSprite, U } from './build.js';
import { makeCar, animateCar, setCarNight, loadCarModels } from './cars.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeChar, animateChar } from './char.js';

const $ = id => document.getElementById(id);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpAng = (a, b, t) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; };

// ---------- языки ----------
const T = {
  ar: {
    subtitle: 'عرب رول بلاي', nick: 'اسم الشخصية', namePh: 'Ahmed_Alsaadi', outfit: 'الملابس', o1: 'ثوب وشماغ', o2: 'ثوب وغترة', o3: 'كاجوال', skin: 'لون البشرة',
    play: 'دخول اللعبة', note: 'نسخة تجريبية · ٥ مدن: عمّان، الرياض، دبي، الدوحة، جدة',
    loading: 'جارٍ بناء المدن…', connecting: 'جارٍ الاتصال بالسيرفر…', offline: 'انقطع الاتصال، جارٍ إعادة المحاولة…',
    online: n => `👥 ${n}`, kmh: 'كم/س', gas: 'بنزين', brake: 'فرامل', cancel: 'إلغاء', send: 'إرسال', chatPh: 'اكتب رسالة…',
    showroom: 'معرض السيارات', close: 'إغلاق', color: 'اللون:', map: 'الخريطة', buy: 'شراء', drive: 'اختيار', driving: 'سيارتك الحالية',
    takeJob: 'خذ طلب توصيل', openShop: 'ادخل المعرض', enterCar: 'ركوب السيارة', eat: p => `شاورما · ${p}$`, ate: 'بالعافية! +45 شبع',
    job: c => `وصّل الطلب إلى ${c}`, jobInfo: (p, d) => `${p}$ · ${d}`, jobOk: p => `تم التوصيل! +${p}$`, welcome: c => `أهلاً بك في ${c}`, desert: 'الصحراء',
    err_money: 'المال لا يكفي', err_far: 'اقترب أكثر', err_notyet: 'لم تصل بعد', err_cheat: 'وصلت بسرعة مريبة… لم يُحتسب الطلب',
    tp: c => `انتقال إلى ${c}`, joined: n => `${n} دخل المدينة`, left: n => `${n} غادر`, km: 'كم', m: 'م',
    dead: 'نُقلت إلى المستشفى', deadSub: 'دفعت 100$ للعلاج', settings: 'الإعدادات', gfx: 'الرسومات', low: 'منخفضة', high: 'عالية', language: 'اللغة',
    keys: 'الكمبيوتر: WASD حركة · Shift ركض · Space قفز/فرامل · F ركوب/نزول · E تفاعل · M خريطة · T دردشة · C كاميرا · اسحب بالفأرة للنظر',
    carCalled: 'سيارتك وصلت', tooFast: 'خفف السرعة أولاً', hungry: 'أنت جائع! كُل شيئاً', carNear: 'سيارتك قريبة منك',
  },
  ru: {
    subtitle: 'Арабская ролевая игра', nick: 'Имя персонажа', namePh: 'Ahmed_Alsaadi', outfit: 'Одежда', o1: 'Тоб и шемаг', o2: 'Тоб и гутра', o3: 'Повседневная', skin: 'Цвет кожи',
    play: 'Войти в игру', note: 'Тестовая версия · 5 городов: Амман, Эр-Рияд, Дубай, Доха, Джидда',
    loading: 'Строим города…', connecting: 'Подключение к серверу…', offline: 'Связь потеряна, переподключаемся…',
    online: n => `👥 ${n}`, kmh: 'км/ч', gas: 'Газ', brake: 'Тормоз', cancel: 'Отмена', send: 'Отпр.', chatPh: 'Сообщение…',
    showroom: 'Автосалон', close: 'Закрыть', color: 'Цвет:', map: 'Карта', buy: 'Купить', drive: 'Выбрать', driving: 'Твоя машина',
    takeJob: 'Взять заказ доставки', openShop: 'Войти в автосалон', enterCar: 'Сесть в машину', eat: p => `Шаурма · ${p}$`, ate: 'Приятного! +45 сытости',
    job: c => `Доставь заказ: ${c}`, jobInfo: (p, d) => `${p}$ · ${d}`, jobOk: p => `Доставлено! +${p}$`, welcome: c => `Добро пожаловать: ${c}`, desert: 'Пустыня',
    err_money: 'Не хватает денег', err_far: 'Подойди ближе', err_notyet: 'Ты ещё не доехал', err_cheat: 'Слишком быстро… заказ не засчитан',
    tp: c => `Телепорт: ${c}`, joined: n => `${n} зашёл в игру`, left: n => `${n} вышел`, km: 'км', m: 'м',
    dead: 'Тебя увезли в больницу', deadSub: 'Лечение стоило 100$', settings: 'Настройки', gfx: 'Графика', low: 'Низкая', high: 'Высокая', language: 'Язык',
    keys: 'ПК: WASD — движение · Shift — бег · Space — прыжок/тормоз · F — сесть/выйти · E — действие · M — карта · T — чат · C — камера · мышью тяни — обзор',
    carCalled: 'Машина подъехала', tooFast: 'Сначала сбавь скорость', hungry: 'Ты голоден! Поешь', carNear: 'Машина и так рядом',
  },
};
let lang = store.get('lang') || 'ar';
const t = (k, ...a) => { const v = T[lang][k]; return typeof v === 'function' ? v(...a) : v; };
const cityName = id => (lang === 'ar' ? CITY[id].ar : CITY[id].ru);
function applyLang() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i]').forEach(e => { const v = T[lang][e.dataset.i]; if (typeof v === 'string') e.textContent = v; });
  document.querySelectorAll('[data-ph]').forEach(e => { e.placeholder = T[lang][e.dataset.ph]; });
  document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
  if (me.profile) { renderShop(); updateHud(); }
}
document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { lang = b.dataset.lang; store.set('lang', lang); applyLang(); });

// ---------- регистрация ----------
let outfit = OUTFITS.includes(store.get('outfit')) ? store.get('outfit') : 'thobe_red';
let skin = SKINS.includes(store.get('skin')) ? store.get('skin') : SKINS[1];
$('skins').innerHTML = SKINS.map(s => `<button data-s="${s}" style="background:${s}" aria-label="${s}"></button>`).join('');
const markReg = () => {
  document.querySelectorAll('[data-o]').forEach(b => b.classList.toggle('on', b.dataset.o === outfit));
  document.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === skin));
};
document.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { outfit = b.dataset.o; store.set('outfit', outfit); markReg(); });
document.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { skin = b.dataset.s; store.set('skin', skin); markReg(); });
markReg();
$('name').value = store.get('name') || '';

// ---------- состояние ----------
const me = { id: 0, profile: null, mode: 'foot', x: 0, y: 0, z: 0, ry: Math.PI, vy: 0, spd: 0, onGround: true, char: null, job: null, hp: 100, hunger: 100, dead: false };
const car = { x: 0, y: 0, z: 0, ry: Math.PI, speed: 0, steer: 0, mesh: null, braking: false };
const cam = { yaw: Math.PI, pitch: 0.25, dragT: 0, mode: 0 };
const others = new Map();
const input = { jx: 0, jy: 0, gas: 0, brake: 0, sprint: false, jump: false, keys: {} };
let scene, camera, renderer, world, beam, ws, hemi, sun, started = false, online = 1, timeOff = 0, night = 0;
let quality = store.get('q') || (matchMedia('(pointer:coarse)').matches ? 'low' : 'high');
const mobile = matchMedia('(pointer:coarse)').matches;
window.__ar = { me, car, cam }; // для автотестов

$('play').onclick = async () => {
  const name = $('name').value.trim(); if (!name) { $('name').focus(); return; }
  store.set('name', name);
  try { await document.documentElement.requestFullscreen?.(); await screen.orientation?.lock?.('landscape'); } catch {}
  $('login').classList.add('hide'); $('loading').classList.remove('hide'); $('loading').textContent = t('loading');
  setTimeout(() => { init(); connect(); }, 50);
};
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') $('play').click(); });
applyLang();

// ---------- графика ----------
function applyQuality() {
  const hi = quality === 'high';
  renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? (mobile ? 1.5 : 2) : (mobile ? 1 : 1.25)));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = hi; sun.castShadow = hi;
  scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
  camera.far = hi ? 3600 : 2400; scene.fog.far = hi ? 2600 : 1700; camera.updateProjectionMatrix();
  world.sky.scale.setScalar(camera.far * 0.9 / 3400);
  document.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('on', b.dataset.q === quality));
}
function init() {
  if (started) return; started = true;
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: !mobile, powerPreference: 'high-performance' });
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#efdcb6', 300, 2600);
  scene.background = scene.fog.color;
  camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.2, 3600);
  hemi = new THREE.HemisphereLight('#fff6e6', '#b08a5a', 1.5); scene.add(hemi);
  sun = new THREE.DirectionalLight('#fff1d6', 2);
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
  scene.add(sun, sun.target);
  world = buildWorld(scene);
  Object.assign(window.__ar, { r: renderer, testCar: (type, color) => { scene.remove(car.mesh); car.mesh = makeCar(type, color); scene.add(car.mesh); me.profile.car = type; return car.mesh.userData.type; }, setHour: h => { const d = DAY_MS; timeOff = Math.round(((h / 24 - 0.3 + 1) % 1) * d - (Date.now() % d)); } });
  beam = makeTargetBeam(); scene.add(beam);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  loadCarModels().then(() => { // когда 3D-модели загрузились — заменяем временные машины
    if (car.mesh && me.profile && car.mesh.userData.type !== me.profile.car) { scene.remove(car.mesh); car.mesh = makeCar(me.profile.car, me.profile.color); scene.add(car.mesh); }
    for (const o of others.values()) if (o.car && o.car.userData.type !== o.look.car) rebuildOtherCar(o);
  });
  drawMapCanvas();
  applyQuality();
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  $('loading').textContent = t('connecting');
  requestAnimationFrame(loop);
}
document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { quality = b.dataset.q; store.set('q', quality); if (renderer) applyQuality(); });

function buildMe() {
  const p = me.profile;
  if (me.char) scene.remove(me.char);
  me.char = makeChar({ outfit: p.outfit, skin: p.skin }); scene.add(me.char);
  if (car.mesh) scene.remove(car.mesh);
  car.mesh = makeCar(p.car, p.color); scene.add(car.mesh);
}

// ---------- сеть ----------
let sendT = 0, reconnectT = 0;
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: store.get('token'), name: store.get('name'), outfit, skin }));
  ws.onmessage = e => onMsg(JSON.parse(e.data));
  ws.onclose = () => {
    if (me.profile) toast(t('offline'), 3000);
    for (const id of [...others.keys()]) removeOther(id);
    clearTimeout(reconnectT); reconnectT = setTimeout(connect, 2500);
  };
}
const net = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

function onMsg(m) {
  switch (m.t) {
    case 'welcome': {
      const first = !me.profile;
      me.id = m.id; me.profile = m.profile; store.set('token', m.token);
      timeOff = m.now - Date.now();
      me.hp = m.profile.hp ?? 100; me.hunger = m.profile.hunger ?? 100;
      if (first) { teleport(m.spawn.x, m.spawn.z); }
      buildMe();
      for (const p of m.players) addOther(p);
      online = m.players.length + 1; updateHud(); setMode('foot');
      $('loading').classList.add('hide'); $('hud').classList.remove('hide');
      break;
    }
    case 'join': addOther(m); online++; updateHud(); chatLine(null, t('joined', m.name)); break;
    case 'leave': { const o = others.get(m.id); if (o) chatLine(null, t('left', o.name)); removeOther(m.id); online = Math.max(1, online - 1); updateHud(); break; }
    case 'look': { const o = others.get(m.id); if (o) { o.look.car = m.car; o.look.color = m.color; rebuildOtherCar(o); } break; }
    case 'snap': {
      online = m.p.length;
      for (const [id, mode, x, y, z, ry, s, a, cx, cy, cz, cry] of m.p) {
        if (id === me.id) continue; const o = others.get(id); if (!o) continue;
        o.mode = mode; Object.assign(o.t, { x, y, z, ry, s, a, cx, cy, cz, cry });
      }
      updateHud(); break;
    }
    case 'chat': chatLine(m.name, m.m); break;
    case 'profile': {
      const old = me.profile; me.profile = m.profile; updateHud(); renderShop();
      if (old.car !== m.profile.car || old.color !== m.profile.color) { scene.remove(car.mesh); car.mesh = makeCar(m.profile.car, m.profile.color); scene.add(car.mesh); }
      break;
    }
    case 'fix': if (me.mode === 'car') { car.x = m.x; car.z = m.z; car.speed = 0; } else { me.x = m.x; me.z = m.z; } break;
    case 'tp': teleport(m.x, m.z); break;
    case 'respawn': me.profile = m.profile; me.hp = 100; me.hunger = m.profile.hunger; teleport(m.x, m.z); me.dead = false; $('dead').classList.add('hide'); clearJob(); updateHud(); break;
    case 'ate': me.profile = m.profile; me.hunger = m.profile.hunger; updateHud(); toast(t('ate'), 2000, '#ffb347'); break;
    case 'job': me.job = m.job; beam.visible = true; beam.position.set(m.job.x, height(m.job.x, m.job.z) + 0.4, m.job.z); $('job').classList.remove('hide'); break;
    case 'job_ok': clearJob(); me.profile = m.profile; updateHud(); toast(t('jobOk', m.pay), 2500, '#8ff0a4'); break;
    case 'err': if (m.code === 'cheat') clearJob(); toast(t('err_' + m.code), 2200, '#ff8a7a'); break;
  }
}
function clearJob() { me.job = null; beam.visible = false; $('job').classList.add('hide'); }
function teleport(x, z) {
  setMode('foot');
  me.x = x; me.z = z; me.y = groundY(x, z); me.vy = 0; me.ry = Math.PI; cam.yaw = Math.PI;
  car.x = x - 6; car.z = z - 3; car.ry = Math.PI; car.speed = 0; car.y = groundY(car.x, car.z);
}

function addOther(p) {
  if (others.has(p.id)) return;
  const st = { x: p.x, y: p.y, z: p.z, ry: p.ry, s: 0, a: 0, cx: p.cx ?? p.x, cy: p.cy ?? p.y, cz: p.cz ?? p.z, cry: p.cry ?? p.ry };
  const o = { id: p.id, name: p.name, mode: p.mode || 0, look: { car: p.car, color: p.color, outfit: p.outfit, skin: p.skin }, t: st, c: { ...st } };
  o.char = makeChar({ outfit: p.outfit, skin: p.skin }); scene.add(o.char);
  o.label = textSprite(p.name, { scale: 0.42 }); scene.add(o.label);
  others.set(p.id, o); rebuildOtherCar(o);
}
function rebuildOtherCar(o) { if (o.car) scene.remove(o.car); o.car = makeCar(o.look.car, o.look.color); scene.add(o.car); }
function removeOther(id) { const o = others.get(id); if (!o) return; scene.remove(o.char, o.car, o.label); others.delete(id); }

// ---------- управление ----------
const joy = $('joy'), knob = $('knob'); let joyId = null;
function joyMove(e) {
  const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2 - 18;
  let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
  knob.style.transform = `translate(${dx}px,${dy}px)`; input.jx = dx / R; input.jy = dy / R;
}
joy.addEventListener('pointerdown', e => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
const joyEnd = e => { if (e.pointerId !== joyId) return; joyId = null; knob.style.transform = ''; input.jx = input.jy = 0; };
joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);

function hold(id, on, off) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.stopPropagation(); b.setPointerCapture(e.pointerId); b.classList.add('on'); on(); });
  const up = () => { b.classList.remove('on'); off && off(); };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
}
hold('gas', () => { input.gas = 1; }, () => { input.gas = 0; });
hold('brake', () => { input.brake = 1; }, () => { input.brake = 0; });
hold('bSprint', () => { input.sprint = true; }, () => { input.sprint = false; });
hold('bJump', () => { input.jump = true; });
$('bExit').onclick = () => toggleCar();

// обзор пальцем/мышью по экрану
const gl = $('gl'); const drags = new Map();
gl.addEventListener('pointerdown', e => { drags.set(e.pointerId, { x: e.clientX, y: e.clientY }); gl.setPointerCapture(e.pointerId); });
gl.addEventListener('pointermove', e => {
  const d = drags.get(e.pointerId); if (!d) return;
  const k = e.pointerType === 'mouse' ? 0.006 : 0.008;
  cam.yaw -= (e.clientX - d.x) * k; cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k * 0.7, -0.35, 1.25);
  d.x = e.clientX; d.y = e.clientY; cam.dragT = performance.now();
});
const dragEnd = e => drags.delete(e.pointerId);
gl.addEventListener('pointerup', dragEnd); gl.addEventListener('pointercancel', dragEnd);
gl.addEventListener('wheel', e => { cam.mode = clamp(cam.mode + (e.deltaY > 0 ? 1 : -1), 0, 2); }, { passive: true });

addEventListener('keydown', e => {
  if (document.activeElement?.tagName === 'INPUT') { if (e.key === 'Escape') closeChat(); return; }
  input.keys[e.code] = true;
  if (e.code === 'Space') { input.jump = true; e.preventDefault(); }
  if (e.code === 'KeyF') toggleCar();
  if (e.code === 'KeyE') $('action').click();
  if (e.code === 'KeyM') toggleModal('map');
  if (e.code === 'KeyC') cam.mode = (cam.mode + 1) % 3;
  if (e.code === 'KeyT' || e.code === 'Enter') { e.preventDefault(); openChat(); }
});
addEventListener('keyup', e => { input.keys[e.code] = false; });
addEventListener('blur', () => { input.keys = {}; });
addEventListener('contextmenu', e => e.preventDefault());

$('bCam').onclick = () => { cam.mode = (cam.mode + 1) % 3; };
$('bFull').onclick = async () => { try { document.fullscreenElement ? await document.exitFullscreen() : await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape'); } catch {} };
$('bMap').onclick = () => toggleModal('map');
$('bSet').onclick = () => toggleModal('settings');
$('bChat').onclick = () => openChat();
$('bCar').onclick = () => summonCar();
$('jobX').onclick = () => { net({ t: 'job_cancel' }); clearJob(); };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('.modal').classList.add('hide'));
document.querySelectorAll('.modal').forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m) m.classList.add('hide'); }));

function openChat() { $('chatbox').classList.remove('hide'); $('chatIn').focus(); }
function closeChat() { $('chatbox').classList.add('hide'); $('chatIn').blur(); }
function sendChat() { const v = $('chatIn').value.trim(); if (v) net({ t: 'chat', m: v }); $('chatIn').value = ''; closeChat(); }
$('chatSend').onclick = sendChat;
$('chatIn').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
function chatLine(name, text) {
  const d = document.createElement('div');
  if (name) { const b = document.createElement('b'); b.textContent = name + ': '; d.append(b); }
  d.append(document.createTextNode(text));
  if (!name) d.style.opacity = '.8';
  const log = $('chatlog'); log.append(d); while (log.children.length > 7) log.firstChild.remove();
  setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 1000); }, 15000);
}
let toastT = 0;
function toast(text, ms = 2000, color = '#fff') {
  const el = $('toast'); el.textContent = text; el.style.color = color; el.style.opacity = 1;
  clearTimeout(toastT); toastT = setTimeout(() => { el.style.opacity = 0; }, ms);
}
function updateHud() {
  if (!me.profile) return;
  $('money').textContent = '$' + me.profile.money.toLocaleString('en-US');
  $('online').textContent = t('online', online);
  $('hpF').style.width = clamp(me.hp, 0, 100) + '%';
  $('foodF').style.width = clamp(me.hunger, 0, 100) + '%';
}

// ---------- машина: сесть/выйти/вызвать ----------
function setMode(m) {
  me.mode = m;
  $('footBtns').classList.toggle('hide', m !== 'foot');
  $('carBtns').classList.toggle('hide', m !== 'car');
  $('speedo').classList.toggle('hide', m !== 'car');
  if (me.char) me.char.visible = m === 'foot';
}
function toggleCar() {
  if (me.dead || !me.profile) return;
  if (me.mode === 'foot') {
    if (Math.hypot(car.x - me.x, car.z - me.z) < 3.6) { setMode('car'); cam.yaw = car.ry; }
  } else {
    if (Math.abs(car.speed) > 6) { toast(t('tooFast')); return; }
    const lx = Math.cos(car.ry), lz = -Math.sin(car.ry);
    for (const s of [1, -1]) {
      const x = car.x + lx * 1.8 * s, z = car.z + lz * 1.8 * s;
      if (!blockedAt(x, z, 0.4, groundY(x, z))) { me.x = x; me.z = z; break; }
      me.x = car.x + lx * 1.8; me.z = car.z + lz * 1.8;
    }
    me.y = groundY(me.x, me.z); me.vy = 0; me.ry = car.ry; car.speed = 0; cam.yaw = car.ry;
    setMode('foot');
  }
}
function summonCar() {
  if (me.mode !== 'foot' || me.dead) return;
  if (Math.hypot(car.x - me.x, car.z - me.z) < 25) { toast(t('carNear')); return; }
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
  for (const [a, b] of [[-3.5, 3], [3.5, 3], [0, 6], [-3.5, -3], [3.5, -3]]) {
    const x = me.x + fz * a + fx * b, z = me.z - fx * a + fz * b;
    if (!blockedAt(x, z, 2.6, groundY(x, z)) && groundY(x, z) > -0.5) { car.x = x; car.z = z; car.ry = cam.yaw; car.speed = 0; car.y = groundY(x, z); toast(t('carCalled'), 1500); return; }
  }
}

// ---------- столкновения ----------
function blockedAt(x, z, r, y) {
  for (const b of world.near(x, z, r + 1)) {
    if (y > b.y1 - 0.3) continue;
    const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
    if (Math.hypot(x - cx, z - cz) < r) return true;
  }
  return false;
}
function pushCircle(x, z, r, y, small = true) { // выталкивает круг из зданий; возвращает [x, z, hit]
  let hit = false;
  for (const b of world.near(x, z, r + 1)) {
    if (y > b.y1 - 0.3 || (!small && b.small)) continue;
    const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
    let dx = x - cx, dz = z - cz; const d = Math.hypot(dx, dz);
    if (d < r) {
      hit = true;
      if (d < 1e-4) { // центр внутри — выталкиваем к ближайшей стороне
        const opts = [[b.x0 - r - x, 0], [b.x1 + r - x, 0], [0, b.z0 - r - z], [0, b.z1 + r - z]].sort((p, q) => Math.hypot(...p) - Math.hypot(...q))[0];
        x += opts[0]; z += opts[1];
      } else { x = cx + dx / d * r; z = cz + dz / d * r; }
    }
  }
  return [x, z, hit];
}
function pushFromCar(x, z, r, cx, cz, cry, W, L) { // круг против повёрнутого прямоугольника машины
  const c = Math.cos(cry), s = Math.sin(cry), dx = x - cx, dz = z - cz;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const qx = clamp(lx, -W / 2, W / 2), qz = clamp(lz, -L / 2, L / 2);
  let ex = lx - qx, ez = lz - qz; let d = Math.hypot(ex, ez);
  if (d >= r) return null;
  if (d < 1e-4) { if (W / 2 - Math.abs(lx) < L / 2 - Math.abs(lz)) { ex = Math.sign(lx) || 1; ez = 0; } else { ex = 0; ez = Math.sign(lz) || 1; } d = 0; const nlx = ex ? Math.sign(ex) * (W / 2 + r) : lx, nlz = ez ? Math.sign(ez) * (L / 2 + r) : lz; return [cx + nlx * c + nlz * s, cz - nlx * s + nlz * c]; }
  const nlx = qx + ex / d * r, nlz = qz + ez / d * r;
  return [cx + nlx * c + nlz * s, cz - nlx * s + nlz * c];
}
function carsAround() { // все машины, кроме той, в которой сидим
  const list = [];
  if (me.mode === 'foot' && car.mesh) list.push([car.x, car.z, car.ry, car.mesh.userData.W, car.mesh.userData.len]);
  for (const o of others.values()) if (o.car) list.push([o.c.cx, o.c.cz, o.c.cry, o.car.userData.W, o.car.userData.len]);
  return list;
}

// ---------- физика пешком ----------
function updateFoot(dt) {
  const k = input.keys;
  let ix = input.jx + ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0);
  let iy = -input.jy + ((k.KeyW || k.ArrowUp) ? 1 : 0) - ((k.KeyS || k.ArrowDown) ? 1 : 0);
  let mag = Math.hypot(ix, iy); if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
  const sprint = input.sprint || k.ShiftLeft || k.ShiftRight;
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
  let mx = fx * iy - fz * ix, mz = fz * iy + fx * ix;
  const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
  const target = mag < 0.08 ? 0 : sprint ? 7.6 : mag > 0.75 ? 5.0 : 1.8;
  me.spd += (target - me.spd) * Math.min(1, dt * (target > me.spd ? 6 : 10));
  if (mag >= 0.08) { me.ry = lerpAng(me.ry, Math.atan2(mx, mz), Math.min(1, dt * 12)); me.mx = mx; me.mz = mz; }
  const dx = (me.mx || 0) * me.spd * dt, dz = (me.mz || 0) * me.spd * dt;
  let nx = clamp(me.x + dx, -LIMIT, LIMIT), nz = clamp(me.z + dz, -LIMIT, LIMIT);
  [nx, nz] = pushCircle(nx, nz, 0.35, me.y);
  for (const c of carsAround()) { const p = pushFromCar(nx, nz, 0.35, ...c); if (p && me.y < groundY(c[0], c[1]) + 1.6) [nx, nz] = p; }
  const g = groundY(nx, nz);
  if (g < -0.6 || (g - me.y > 0.65)) { nx = me.x; nz = me.z; me.spd *= 0.5; }
  me.x = nx; me.z = nz;
  if (input.jump && me.onGround) { me.vy = 7.2; me.onGround = false; }
  input.jump = false;
  me.vy -= 22 * dt; me.y += me.vy * dt;
  const g2 = groundY(me.x, me.z);
  if (me.y <= g2) { if (me.vy < -15) damage((-me.vy - 15) * 5); me.y = g2; me.vy = 0; me.onGround = true; }
  else if (me.onGround && me.vy <= 0 && me.y - g2 < 0.6) me.y = g2;
  else me.onGround = false;
}

// ---------- физика машины ----------
function updateCar(dt, driving) {
  const spec = CARS[me.profile.car], k = input.keys;
  let steerIn = 0, gas = 0, brake = 0;
  if (driving) {
    steerIn = clamp(input.jx + ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0), -1, 1);
    gas = Math.max(input.gas, (k.KeyW || k.ArrowUp) ? 1 : 0);
    brake = Math.max(input.brake, (k.KeyS || k.ArrowDown || k.Space) ? 1 : 0);
  }
  const onRoad = ROAD_GRID.dist(car.x, car.z) < 1 || cityMask(car.x, car.z) > 0.6;
  const vmax = spec.max * (onRoad ? 1 : 0.55);
  let v = car.speed;
  if (gas) { if (v < -0.5) v += 25 * dt; else v += spec.accel * gas * dt * Math.max(0, 1 - v / vmax) * 1.5; }
  if (brake) { if (v > 0.5) v -= 24 * dt; else if (!gas) v = Math.max(-12, v - 7 * dt); }
  v -= v * (onRoad ? 0.06 : 0.5) * dt;
  if (!gas && !brake) { const f = (driving ? 2.2 : 8) * dt; v = Math.abs(v) < f ? 0 : v - Math.sign(v) * f; }
  if (v > vmax) v -= (v - vmax) * 2 * dt;
  car.braking = brake && v > 0.5;
  car.speed = v;
  const tgt = steerIn * spec.steer / (1 + Math.abs(v) * 0.045);
  car.steer += (tgt - car.steer) * Math.min(1, dt * 7);
  car.ry -= v * Math.tan(car.steer) / 2.7 * dt;
  let nx = clamp(car.x + Math.sin(car.ry) * v * dt, -LIMIT, LIMIT), nz = clamp(car.z + Math.cos(car.ry) * v * dt, -LIMIT, LIMIT);
  if (groundY(nx, nz) < -0.7) { car.speed *= -0.2; return; }
  // три круга вдоль кузова
  const L = car.mesh.userData.len, R = car.mesh.userData.W / 2 + 0.05, fx = Math.sin(car.ry), fz = Math.cos(car.ry);
  let hit = false;
  for (const o of [L / 2 - R, 0, -(L / 2 - R)]) {
    const [px, pz, h] = pushCircle(nx + fx * o, nz + fz * o, R, car.y + 0.5);
    if (h) { nx = px - fx * o; nz = pz - fz * o; hit = true; }
  }
  for (const c of carsAround()) for (const o of [L / 2 - R, 0, -(L / 2 - R)]) {
    const p = pushFromCar(nx + fx * o, nz + fz * o, R, ...c);
    if (p) { nx = p[0] - fx * o; nz = p[1] - fz * o; hit = true; }
  }
  if (hit) {
    const imp = Math.abs(car.speed);
    if (imp > 14) damage((imp - 14) * 1.6);
    car.speed *= imp > 4 ? -0.3 : 0.4;
  }
  car.x = nx; car.z = nz; car.y = groundY(car.x, car.z);
}

function placeCar(mesh, x, z, ry) {
  const len = mesh.userData.len, W = mesh.userData.W;
  const fx = Math.sin(ry), fz = Math.cos(ry), h = len * 0.42;
  const hf = groundY(x + fx * h, z + fz * h), hb = groundY(x - fx * h, z - fz * h);
  const lx = Math.cos(ry), lz = -Math.sin(ry);
  const hl = groundY(x + lx * W * 0.45, z + lz * W * 0.45), hr = groundY(x - lx * W * 0.45, z - lz * W * 0.45);
  mesh.position.set(x, Math.max((hf + hb) / 2, (hl + hr) / 2), z);
  mesh.rotation.set(-Math.atan2(hf - hb, h * 2), ry, Math.atan2(hl - hr, W * 0.9), 'YXZ');
}

function damage(n) { if (me.dead) return; me.hp = Math.max(0, me.hp - n); updateHud(); }

// ---------- окна ----------
function toggleModal(id) {
  const m = $(id); const show = m.classList.contains('hide');
  document.querySelectorAll('.modal').forEach(x => x.classList.add('hide'));
  if (show) { m.classList.remove('hide'); if (id === 'map') drawBigMap(); if (id === 'shop') renderShop(); }
}
function renderShop() {
  if (!me.profile) return;
  const P = me.profile;
  $('carList').innerHTML = Object.entries(CARS).map(([id, c]) => {
    const own = P.cars.includes(id), cur = P.car === id;
    const btn = cur ? `<button disabled>${t('driving')}</button>` : own ? `<button data-sel="${id}">${t('drive')}</button>`
      : `<button data-buy="${id}" ${P.money < c.price ? 'disabled' : ''}>${t('buy')}</button>`;
    return `<div class="carc ${cur ? 'cur' : ''}"><b>${c.ar}</b><small>${lang === 'ru' ? c.ru + ' · ' : ''}${Math.round(c.max * 3.6)} ${t('kmh')}</small><div class="pr">${c.price ? '$' + c.price.toLocaleString('en-US') : '—'}</div>${btn}</div>`;
  }).join('');
  $('carList').querySelectorAll('[data-buy]').forEach(b => b.onclick = () => net({ t: 'buy', car: b.dataset.buy }));
  $('carList').querySelectorAll('[data-sel]').forEach(b => b.onclick = () => net({ t: 'select', car: b.dataset.sel }));
  $('swatches').innerHTML = COLORS.map(c => `<button style="background:${c}" class="${P.color === c ? 'on' : ''}" data-col="${c}" aria-label="${c}"></button>`).join('');
  $('swatches').querySelectorAll('[data-col]').forEach(b => b.onclick = () => net({ t: 'select', color: b.dataset.col }));
}

// ---------- карта и радар ----------
const MAPPX = 2048, mapCanvas = document.createElement('canvas');
const toMap = (x, z) => [(x + HALF) / (HALF * 2) * MAPPX, (z + HALF) / (HALF * 2) * MAPPX];
function drawMapCanvas() {
  mapCanvas.width = mapCanvas.height = MAPPX;
  const g = mapCanvas.getContext('2d'), s = MAPPX / (HALF * 2);
  g.fillStyle = '#d6b37a'; g.fillRect(0, 0, MAPPX, MAPPX);
  // рельеф (горы) — по сетке высот
  const step = 32;
  for (let y = 0; y < MAPPX; y += step / 4) for (let x = 0; x < MAPPX; x += step / 4) {
    const wx = x / s - HALF, wz = y / s - HALF, h = height(wx, wz);
    if (h > 12) { g.fillStyle = `rgba(110,60,30,${Math.min(0.55, (h - 12) / 150)})`; g.fillRect(x, y, step / 4, step / 4); }
  }
  g.fillStyle = '#3c9db0';
  for (const side of [1, -1]) {
    g.beginPath();
    for (let z = -HALF; z <= HALF; z += 50) { const [px, py] = toMap(side > 0 ? coastE(z) : coastW(z), z); z === -HALF ? g.moveTo(px, py) : g.lineTo(px, py); }
    g.lineTo(side > 0 ? MAPPX : 0, MAPPX); g.lineTo(side > 0 ? MAPPX : 0, 0); g.fill();
  }
  g.fillStyle = '#c9bfae';
  for (const c of CITIES) { const [px, py] = toMap(c.x, c.z); g.beginPath(); g.arc(px, py, (c.r + 50) * s, 0, 7); g.fill(); }
  g.strokeStyle = '#ffffff'; g.lineCap = 'round';
  for (const st of STREETS) { g.lineWidth = st.w * s * 0.9; g.beginPath(); g.moveTo(...toMap(...st.pts[0])); g.lineTo(...toMap(...st.pts[1])); g.stroke(); }
  for (const [w, col] of [[32, '#6b5a3a'], [22, '#f7d070']]) {
    g.strokeStyle = col; g.lineWidth = w * s * 1.4;
    for (const h of HIGHWAYS) { g.beginPath(); h.pts.forEach((p, i) => i ? g.lineTo(...toMap(...p)) : g.moveTo(...toMap(...p))); g.stroke(); }
  }
  const dot = (p, col) => { const [px, py] = toMap(p.x, p.z); g.fillStyle = '#000'; g.beginPath(); g.arc(px, py, 10, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(px, py, 7.5, 0, 7); g.fill(); };
  for (const c of CITIES) { const P = cityPoints(c); dot(P.office, '#ffcc33'); dot(P.showroom, '#3fa9ff'); }
  FOOD_SPOTS.forEach(p => dot(p, '#ff7b39'));
}
function drawArrow(g, x, y, ang, col, size) {
  g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(0, -size); g.lineTo(size * 0.72, size * 0.8); g.lineTo(0, size * 0.38); g.lineTo(-size * 0.72, size * 0.8); g.closePath(); g.fill(); g.stroke(); g.restore();
}
const mapAngle = ry => Math.PI - ry; // направление (sin ry, cos ry) -> угол на карте
function activePos() { return me.mode === 'car' ? [car.x, car.z, car.ry, car.speed] : [me.x, me.z, me.ry, me.spd]; }
function drawMini() {
  const c = $('mini'), g = c.getContext('2d'), W = c.width, R = W / 2;
  const [x, z, ry, sp] = activePos();
  const viewR = 240 + Math.abs(sp) * 4, s = MAPPX / (HALF * 2), zoom = R / (viewR * s);
  const [px, py] = toMap(x, z), rot = -mapAngle(cam.yaw);
  g.save(); g.clearRect(0, 0, W, W); g.beginPath(); g.arc(R, R, R, 0, 7); g.clip();
  g.translate(R, R); g.rotate(rot); g.scale(zoom, zoom); g.translate(-px, -py);
  g.drawImage(mapCanvas, 0, 0);
  if (me.job) { const [jx, jy] = toMap(me.job.x, me.job.z); g.fillStyle = '#36e27a'; g.strokeStyle = '#000'; g.lineWidth = 3 / zoom; g.beginPath(); g.arc(jx, jy, 10 / zoom, 0, 7); g.fill(); g.stroke(); }
  for (const o of others.values()) { const [ox, oy] = toMap(o.mode ? o.c.cx : o.c.x, o.mode ? o.c.cz : o.c.z); g.fillStyle = '#ff4d4d'; g.strokeStyle = '#000'; g.lineWidth = 2 / zoom; g.beginPath(); g.arc(ox, oy, 7 / zoom, 0, 7); g.fill(); g.stroke(); }
  if (me.mode === 'foot') { const [cx2, cy2] = toMap(car.x, car.z); g.fillStyle = '#7fd1ff'; g.fillRect(cx2 - 6 / zoom, cy2 - 4 / zoom, 12 / zoom, 8 / zoom); }
  g.restore();
  // север
  const na = rot; g.fillStyle = '#fff'; g.font = '900 26px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', R + Math.sin(na + Math.PI) * (R - 18), R - Math.cos(na + Math.PI) * (R - 18));
  if (me.job) {
    const dx = me.job.x - x, dz = me.job.z - z;
    if (Math.hypot(dx, dz) > viewR) { const a = mapAngle(Math.atan2(dx, dz)) + rot; drawArrow(g, R + Math.sin(a) * (R - 16), R - Math.cos(a) * (R - 16), a, '#36e27a', 12); }
  }
  drawArrow(g, R, R, mapAngle(ry) + rot, '#fff', 15);
}
function drawBigMap() {
  const c = $('bigmap'), g = c.getContext('2d'), W = c.width, k = W / MAPPX;
  g.drawImage(mapCanvas, 0, 0, W, W);
  g.textAlign = 'center'; g.font = '900 30px Cairo, sans-serif'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.7)'; g.fillStyle = '#fff';
  for (const ct of CITIES) { const [x, y] = toMap(ct.x, ct.z), ty = y * k - ct.r / (HALF * 2) * W - 14; g.strokeText(cityName(ct.id), x * k, ty); g.fillText(cityName(ct.id), x * k, ty); }
  if (me.job) { const [x, y] = toMap(me.job.x, me.job.z); g.fillStyle = '#36e27a'; g.beginPath(); g.arc(x * k, y * k, 10, 0, 7); g.fill(); }
  for (const o of others.values()) { const [x, y] = toMap(o.mode ? o.c.cx : o.c.x, o.mode ? o.c.cz : o.c.z); g.fillStyle = '#ff4d4d'; g.beginPath(); g.arc(x * k, y * k, 6, 0, 7); g.fill(); }
  const [x, z, ry] = activePos(), [mx, my] = toMap(x, z); drawArrow(g, mx * k, my * k, mapAngle(ry), '#fff', 16);
  $('tps').innerHTML = CITIES.map(ct => `<button data-tp="${ct.id}">${t('tp', cityName(ct.id))}</button>`).join('');
  $('tps').querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { net({ t: 'tp', city: b.dataset.tp }); $('map').classList.add('hide'); });
}
function drawSpeedo(v) {
  const c = $('speedo'), g = c.getContext('2d'), W = c.width, H = c.height, cx = W / 2, cy = H * 0.82, R = W * 0.42;
  const kmh = Math.abs(v) * 3.6, max = 260, a0 = Math.PI * 0.85, a1 = Math.PI * 2.15, a = a0 + (a1 - a0) * Math.min(1, kmh / max);
  g.clearRect(0, 0, W, H);
  g.lineCap = 'round'; g.lineWidth = 16; g.strokeStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
  const grd = g.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, '#8ff0a4'); grd.addColorStop(0.6, '#ffd36a'); grd.addColorStop(1, '#ff4d4d');
  g.strokeStyle = grd; g.lineWidth = 12; g.beginPath(); g.arc(cx, cy, R, a0, a); g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.shadowColor = '#000'; g.shadowBlur = 6;
  g.font = '900 78px Rubik, sans-serif'; g.fillText(Math.round(kmh), cx, cy - 6);
  g.font = '700 26px Cairo, sans-serif'; g.fillText(t('kmh'), cx, cy + 30); g.shadowBlur = 0;
}

// ---------- день и ночь ----------
const SKY = { dayT: new THREE.Color('#3f86d0'), dayH: new THREE.Color('#eedcbc'), duskT: new THREE.Color('#34477e'), duskH: new THREE.Color('#f2a15b'), nightT: new THREE.Color('#040814'), nightH: new THREE.Color('#151d33') };
const _top = new THREE.Color(), _hor = new THREE.Color(), sunDir = new THREE.Vector3();
let lastTod = -1;
function updateSky(tx, tz) {
  const tod = (((Date.now() + timeOff) / DAY_MS) + 0.3) % 1;
  const th = (tod - 0.25) * Math.PI * 2;
  sunDir.set(Math.cos(th) * 0.8, Math.sin(th) * 0.9 + 0.22, 0.45).normalize();
  night = 1 - Math.min(1, Math.max(0, (sunDir.y + 0.12) / 0.2));
  const dusk = (1 - Math.min(1, Math.abs(sunDir.y) / 0.35)) * (1 - night);
  _top.copy(SKY.dayT).lerp(SKY.duskT, dusk).lerp(SKY.nightT, night);
  _hor.copy(SKY.dayH).lerp(SKY.duskH, dusk).lerp(SKY.nightH, night);
  const sm = world.sky.material.uniforms; sm.uTop.value.copy(_top); sm.uHor.value.copy(_hor); sm.uSun.value.copy(sunDir);
  scene.fog.color.copy(_hor);
  U.uNight.value = night;
  scene.environmentIntensity = 0.15 + 0.75 * (1 - night);
  world.glow.opacity = night * 0.85; world.glow.visible = night > 0.02;
  setCarNight(night);
  hemi.intensity = 0.35 + 1.25 * (1 - night);
  const up = sunDir.y > 0;
  sun.intensity = up ? 2.1 * Math.min(1, sunDir.y * 4) : 0.35 * night;
  sun.color.set(up ? (dusk > 0.4 ? '#ffc58a' : '#fff1d6') : '#9fb4ff');
  const ld = up ? sunDir : sunDir.clone().negate();
  sun.position.set(tx + ld.x * 150, Math.max(20, ld.y * 150), tz + ld.z * 150); sun.target.position.set(tx, 0, tz);
  if (Math.floor(tod * 1440) !== lastTod) { lastTod = Math.floor(tod * 1440); const hh = Math.floor(tod * 24), mm = Math.floor(tod * 1440) % 60; $('time').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
}

// ---------- камера ----------
function camBlocked(x, y, z) {
  if (y < height(x, z) + 0.2) return true;
  for (const b of world.near(x, z, 0.5)) if (!b.small && y < b.y1 && x > b.x0 - 0.2 && x < b.x1 + 0.2 && z > b.z0 - 0.2 && z < b.z1 + 0.2) return true;
  return false;
}
function updateCam(dt, now) {
  const inCar = me.mode === 'car';
  const tx = inCar ? car.x : me.x, ty = inCar ? car.y + 1.6 : me.y + 1.55, tz = inCar ? car.z : me.z;
  if (inCar && now - cam.dragT > 1300) {
    cam.yaw = lerpAng(cam.yaw, car.ry + (car.speed < -2 ? Math.PI : 0), Math.min(1, dt * 2.8));
    cam.pitch += (0.2 - cam.pitch) * Math.min(1, dt * 2);
  }
  const dist = inCar ? [8.5, 13, 5.5][cam.mode] : [4.2, 6.5, 2.6][cam.mode];
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const ox = -Math.sin(cam.yaw) * cp, oy = sp, oz = -Math.cos(cam.yaw) * cp;
  let d = dist;
  for (let i = 1; i <= 12; i++) { const f = dist * i / 12; if (camBlocked(tx + ox * f, ty + oy * f, tz + oz * f)) { d = Math.max(0.6, dist * (i - 1) / 12 - 0.2); break; } }
  camera.position.set(tx + ox * d, ty + oy * d, tz + oz * d);
  camera.lookAt(tx, ty + (inCar ? 0 : 0.1), tz);
  const fov = 65 + (inCar ? Math.min(16, Math.abs(car.speed) * 0.25) : 0);
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * 0.1; camera.updateProjectionMatrix(); }
  world.sky.position.copy(camera.position);
}

// ---------- игровой цикл ----------
let last = performance.now(), frame = 0, nearMk = null, lastCity = null, statT = 0, hungerT = 0, hpT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; frame++;
  if (!me.profile || !car.mesh) { renderer.render(scene, camera); return; }
  const inCar = me.mode === 'car';

  if (!me.dead) { if (inCar) updateCar(dt, true); else { updateFoot(dt); if (car.speed !== 0) updateCar(dt, false); } }
  placeCar(car.mesh, car.x, car.z, car.ry);
  animateCar(car.mesh, car.speed, -car.steer * 1.3, dt, car.braking, night);
  if (inCar) { me.x = car.x; me.z = car.z; me.y = car.y; }
  me.char.position.set(me.x, me.y, me.z); me.char.rotation.y = me.ry;
  animateChar(me.char, me.spd, !me.onGround, dt, now / 1000);

  // другие игроки
  const a = 1 - Math.exp(-dt * 10);
  for (const o of others.values()) {
    const c = o.c, tg = o.t;
    if (Math.hypot(tg.x - c.x, tg.z - c.z) > 60) { c.x = tg.x; c.y = tg.y; c.z = tg.z; }
    if (Math.hypot(tg.cx - c.cx, tg.cz - c.cz) > 60) { c.cx = tg.cx; c.cz = tg.cz; c.cry = tg.cry; }
    c.x += (tg.x - c.x) * a; c.y += (tg.y - c.y) * a; c.z += (tg.z - c.z) * a; c.ry = lerpAng(c.ry, tg.ry, a);
    c.cx += (tg.cx - c.cx) * a; c.cz += (tg.cz - c.cz) * a; c.cry = lerpAng(c.cry, tg.cry, a);
    placeCar(o.car, c.cx, c.cz, c.cry);
    animateCar(o.car, o.mode ? tg.s : 0, 0, dt, false, night);
    o.char.visible = !o.mode;
    if (!o.mode) { o.char.position.set(c.x, c.y, c.z); o.char.rotation.y = c.ry; animateChar(o.char, Math.abs(tg.s), !!tg.a, dt, now / 1000); }
    const lx = o.mode ? c.cx : c.x, lz = o.mode ? c.cz : c.z;
    o.label.position.set(lx, (o.mode ? o.car.position.y + 2.6 : c.y + 2.25), lz);
    o.label.visible = Math.hypot(lx - camera.position.x, lz - camera.position.z) < 120;
  }

  updateCam(dt, now);
  const [ax, az] = activePos();
  updateSky(ax, az);
  if (world.flag) world.flag.rotation.y = Math.sin(now / 900) * 0.12;

  // детали рядом (LOD)
  if (frame % 15 === 0) { const R = quality === 'high' ? 700 : 480; for (const l of world.lod) l.m.visible = Math.hypot(l.x - camera.position.x, l.z - camera.position.z) < (l.far ? R + 700 : R + 280); }

  // голод и здоровье
  if (!me.dead) {
    hungerT += dt; if (hungerT > 40) { hungerT = 0; me.hunger = Math.max(0, me.hunger - 1); if (me.hunger === 15) toast(t('hungry'), 2500, '#ffb347'); updateHud(); }
    hpT += dt; if (hpT > 4) { hpT = 0; if (me.hunger <= 0) damage(2); else if (me.hunger > 60 && me.hp < 100) { me.hp = Math.min(100, me.hp + 1); updateHud(); } }
    if (me.hp <= 0) { me.dead = true; car.speed = 0; $('dead').classList.remove('hide'); setTimeout(() => net({ t: 'died' }), 3000); }
  }
  statT += dt; if (statT > 15) { statT = 0; net({ t: 'stats', hp: Math.round(me.hp), hunger: Math.round(me.hunger) }); }

  // маркеры, действия
  if (frame % 5 === 0) {
    nearMk = null;
    for (const mk of world.markers) if (Math.hypot(mk.x - ax, mk.z - az) < (inCar ? 7 : 4)) nearMk = mk;
    const act = $('action'); let label = null;
    if (nearMk?.kind === 'office' && !me.job) label = t('takeJob');
    else if (nearMk?.kind === 'showroom') label = t('openShop');
    else if (nearMk?.kind === 'food' && !inCar) label = t('eat', FOOD_PRICE);
    else if (!inCar && Math.hypot(car.x - me.x, car.z - me.z) < 3.6) label = t('enterCar');
    if (label) { if (act.textContent !== label) act.textContent = label; act.classList.remove('hide'); } else act.classList.add('hide');
  }
  for (const mk of world.markers) mk.obj.children[0].rotation.y += dt;
  if (me.job) {
    const d = Math.hypot(me.job.x - ax, me.job.z - az);
    $('jobT').textContent = t('job', cityName(me.job.city));
    $('jobS').textContent = t('jobInfo', me.job.pay, d > 1000 ? (d / 1000).toFixed(1) + ' ' + t('km') : Math.round(d) + ' ' + t('m'));
    beam.rotation.y += dt;
    if (d < 10 && Math.abs(car.speed) < 9 && frame % 20 === 0) net({ t: 'job_done' });
  }
  const nc = nearestCity(ax, az), cid = nc.inside ? nc.city.id : null;
  if (cid !== lastCity) { if (cid) toast(t('welcome', cityName(cid)), 2500, '#ffd36a'); lastCity = cid; $('cityName').textContent = cid ? cityName(cid) : t('desert'); }
  if (inCar && frame % 3 === 0) drawSpeedo(car.speed);
  if (frame % 2 === 0) drawMini();

  if (now - sendT > 100) {
    sendT = now;
    const r = v => Math.round(v * 100) / 100;
    net({ t: 'st', m: inCar ? 1 : 0, x: r(ax), y: r(inCar ? car.y : me.y), z: r(az), ry: r(inCar ? car.ry : me.ry), s: r(inCar ? car.speed : me.spd), a: me.onGround ? 0 : 1, cx: r(car.x), cy: r(car.y), cz: r(car.z), cry: r(car.ry) });
  }
  renderer.render(scene, camera);
}

$('action').onclick = () => {
  if (me.dead) return;
  if (nearMk?.kind === 'office' && !me.job) return net({ t: 'job_take', city: nearMk.city });
  if (nearMk?.kind === 'showroom') return toggleModal('shop');
  if (nearMk?.kind === 'food' && me.mode === 'foot') return net({ t: 'eat' });
  if (me.mode === 'foot') toggleCar();
};
