// Arab RP — клиент: графика, управление, физика машины, сеть, интерфейс.
import * as THREE from 'three';
import { HALF, LIMIT, CITIES, CITY, CARS, COLORS, HIGHWAYS, STREETS, ROAD_GRID, height, cityMask, nearestCity, coastE, coastW, cityPoints } from '../shared/world.js';
import { buildWorld, makeTargetBeam, textSprite, ROAD_Y } from './build.js';
import { makeCar, animateWheels } from './cars.js';

const $ = id => document.getElementById(id);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

// ---------- языки ----------
const T = {
  ar: {
    subtitle: 'عرب رول بلاي', namePh: 'اسمك في اللعبة', play: 'العب', note: 'نسخة تجريبية · ٥ مدن: عمّان، الرياض، دبي، الدوحة، جدة',
    loading: 'جارٍ تحميل المدن…', connecting: 'جارٍ الاتصال بالسيرفر…', offline: 'انقطع الاتصال، جارٍ إعادة المحاولة…',
    online: n => `متصلون: ${n}`, kmh: 'كم/س', gas: 'بنزين', brake: 'فرامل', cancel: 'إلغاء', send: 'إرسال', chatPh: 'اكتب رسالة…',
    showroom: 'معرض السيارات', close: 'إغلاق', color: 'اللون:', map: 'الخريطة', buy: 'شراء', drive: 'قيادة', driving: 'تقودها الآن',
    takeJob: 'خذ طلب توصيل', openShop: 'ادخل المعرض', job: c => `وصّل الطلب إلى ${c}`, jobInfo: (p, d) => `${p}$ · ${d}`,
    jobOk: p => `تم التوصيل! +${p}$`, welcome: c => `أهلاً بك في ${c}`, desert: 'الصحراء',
    err_money: 'المال لا يكفي', err_far: 'اقترب من المكتب', err_notyet: 'لم تصل بعد', err_cheat: 'وصلت بسرعة مريبة… لم يُحتسب الطلب',
    tp: c => `انتقال إلى ${c}`, joined: n => `${n} دخل المدينة`, left: n => `${n} غادر`, km: 'كم', m: 'م', you: 'أنت',
  },
  ru: {
    subtitle: 'Арабская ролевая игра', namePh: 'Ваш ник', play: 'Играть', note: 'Тестовая версия · 5 городов: Амман, Эр-Рияд, Дубай, Доха, Джидда',
    loading: 'Загрузка городов…', connecting: 'Подключение к серверу…', offline: 'Связь потеряна, переподключаемся…',
    online: n => `Онлайн: ${n}`, kmh: 'км/ч', gas: 'Газ', brake: 'Тормоз', cancel: 'Отмена', send: 'Отпр.', chatPh: 'Сообщение…',
    showroom: 'Автосалон', close: 'Закрыть', color: 'Цвет:', map: 'Карта', buy: 'Купить', drive: 'Выбрать', driving: 'Сейчас за рулём',
    takeJob: 'Взять заказ доставки', openShop: 'Войти в автосалон', job: c => `Доставь заказ: ${c}`, jobInfo: (p, d) => `${p}$ · ${d}`,
    jobOk: p => `Доставлено! +${p}$`, welcome: c => `Добро пожаловать: ${c}`, desert: 'Пустыня',
    err_money: 'Не хватает денег', err_far: 'Подъедь ближе к офису', err_notyet: 'Ты ещё не доехал', err_cheat: 'Слишком быстро… заказ не засчитан',
    tp: c => `Телепорт: ${c}`, joined: n => `${n} зашёл в игру`, left: n => `${n} вышел`, km: 'км', m: 'м', you: 'Вы',
  },
};
let lang = store.get('lang') || 'ar';
const t = (k, ...a) => { const v = T[lang][k]; return typeof v === 'function' ? v(...a) : v; };
const cityName = id => (lang === 'ar' ? CITY[id].ar : CITY[id].ru);
const carName = id => (lang === 'ar' ? CARS[id].ar : CARS[id].ru);
function applyLang() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i]').forEach(e => { const v = T[lang][e.dataset.i]; if (typeof v === 'string') e.textContent = v; });
  document.querySelectorAll('[data-ph]').forEach(e => { e.placeholder = T[lang][e.dataset.ph]; });
  document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
}
document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { lang = b.dataset.lang; store.set('lang', lang); applyLang(); });
applyLang();
$('name').value = store.get('name') || '';

// ---------- состояние ----------
const me = { id: 0, profile: null, x: 0, y: 0, z: 0, ry: 0, speed: 0, steer: 0, mesh: null, job: null };
const others = new Map();
let scene, camera, renderer, world, beam, ws, started = false, camMode = 0, lastCity = null, online = 1;
const input = { steer: 0, gas: 0, brake: 0, keys: {} };

// ---------- вход ----------
$('play').onclick = async () => {
  const name = $('name').value.trim(); if (!name) { $('name').focus(); return; }
  store.set('name', name);
  try { await document.documentElement.requestFullscreen?.(); await screen.orientation?.lock?.('landscape'); } catch {}
  $('login').classList.add('hide'); $('loading').classList.remove('hide'); $('loading').textContent = t('loading');
  setTimeout(() => { init(); connect(); }, 30);
};
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') $('play').click(); });

// ---------- графика ----------
function init() {
  if (started) return; started = true;
  const mobile = matchMedia('(pointer:coarse)').matches;
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#efdcb6', 350, 2600);
  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 3600);
  scene.add(new THREE.HemisphereLight('#fff6e6', '#b08a5a', 1.6));
  const sun = new THREE.DirectionalLight('#fff1d6', 1.9); sun.position.set(-0.5, 1, 0.35); scene.add(sun);
  world = buildWorld(scene);
  beam = makeTargetBeam(); scene.add(beam);
  drawMapCanvas();
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  $('loading').textContent = t('connecting');
  requestAnimationFrame(loop);
}

function setMyCar() {
  const p = me.profile;
  if (me.mesh) scene.remove(me.mesh);
  me.mesh = makeCar(p.car, p.color); scene.add(me.mesh);
}

// ---------- сеть ----------
let sendT = 0, reconnectT = 0;
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: store.get('token'), name: store.get('name') }));
  ws.onmessage = e => onMsg(JSON.parse(e.data));
  ws.onclose = () => {
    if (me.profile) toast(t('offline'), 3000);
    for (const o of others.values()) removeOther(o.id);
    clearTimeout(reconnectT); reconnectT = setTimeout(connect, 2500);
  };
}
const net = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

function onMsg(m) {
  switch (m.t) {
    case 'welcome': {
      const first = !me.profile;
      me.id = m.id; me.profile = m.profile; store.set('token', m.token);
      if (first) { me.x = m.spawn.x; me.z = m.spawn.z; me.ry = Math.PI; me.speed = 0; }
      setMyCar();
      for (const p of m.players) addOther(p);
      online = m.players.length + 1; updateHud();
      $('loading').classList.add('hide'); $('hud').classList.remove('hide');
      break;
    }
    case 'join': addOther(m); online++; updateHud(); chatLine(null, t('joined', m.name)); break;
    case 'leave': { const o = others.get(m.id); if (o) chatLine(null, t('left', o.name)); removeOther(m.id); online = Math.max(1, online - 1); updateHud(); break; }
    case 'look': { const o = others.get(m.id); if (o) { o.car = m.car; o.color = m.color; rebuildOther(o); } break; }
    case 'snap': {
      online = m.p.length;
      for (const [id, x, y, z, ry, s] of m.p) { if (id === me.id) continue; const o = others.get(id); if (o) Object.assign(o.target, { x, y, z, ry, s }); }
      updateHud(); break;
    }
    case 'chat': chatLine(m.name, m.m); break;
    case 'profile': me.profile = m.profile; updateHud(); renderShop(); if (me.mesh?.userData.type !== m.profile.car || me.mesh?.userData.paint.color.getHexString() !== m.profile.color.slice(1)) setMyCar(); break;
    case 'fix': me.x = m.x; me.z = m.z; me.speed = 0; break;
    case 'tp': me.x = m.x; me.z = m.z; me.speed = 0; me.ry = Math.PI; break;
    case 'job': me.job = m.job; beam.visible = true; beam.position.set(m.job.x, height(m.job.x, m.job.z) + ROAD_Y, m.job.z); $('job').classList.remove('hide'); break;
    case 'job_ok': me.job = null; beam.visible = false; $('job').classList.add('hide'); me.profile = m.profile; updateHud(); toast(t('jobOk', m.pay), 2500, '#7dff9a'); break;
    case 'err':
      if (m.code === 'cheat') { me.job = null; beam.visible = false; $('job').classList.add('hide'); }
      toast(t('err_' + m.code), 2200, '#ff8a7a'); break;
  }
}

function addOther(p) {
  if (others.has(p.id)) return;
  const o = { id: p.id, name: p.name, car: p.car, color: p.color, target: { x: p.x, y: p.y, z: p.z, ry: p.ry, s: 0 }, cur: { x: p.x, y: p.y, z: p.z, ry: p.ry, s: 0 } };
  others.set(p.id, o); rebuildOther(o);
}
function rebuildOther(o) {
  if (o.mesh) scene.remove(o.mesh);
  o.mesh = makeCar(o.car, o.color);
  const label = textSprite(o.name, { scale: 0.75 }); label.position.y = 3.6; o.mesh.add(label); o.label = label;
  scene.add(o.mesh);
}
function removeOther(id) { const o = others.get(id); if (!o) return; scene.remove(o.mesh); others.delete(id); }

// ---------- управление ----------
const joy = $('joy'), knob = $('knob'); let joyId = null;
function joyMove(e) {
  const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2 - 20;
  let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
  knob.style.transform = `translate(${dx}px,${dy}px)`; input.steer = dx / R;
}
joy.addEventListener('pointerdown', e => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
const joyEnd = e => { if (e.pointerId !== joyId) return; joyId = null; knob.style.transform = ''; input.steer = 0; };
joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);
for (const [id, key] of [['gas', 'gas'], ['brake', 'brake']]) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { b.setPointerCapture(e.pointerId); input[key] = 1; b.classList.add('on'); });
  const up = () => { input[key] = 0; b.classList.remove('on'); };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
}
addEventListener('keydown', e => {
  if (document.activeElement?.tagName === 'INPUT') { if (e.key === 'Escape') closeChat(); return; }
  input.keys[e.code] = true;
  if (e.code === 'KeyE') $('action').click();
  if (e.code === 'KeyM') toggleModal('map');
  if (e.code === 'KeyC') $('bCam').click();
  if (e.code === 'KeyT' || e.code === 'Enter') { e.preventDefault(); openChat(); }
});
addEventListener('keyup', e => { input.keys[e.code] = false; });
addEventListener('blur', () => { input.keys = {}; });
addEventListener('contextmenu', e => e.preventDefault());

$('bCam').onclick = () => { camMode = (camMode + 1) % 3; };
$('bFull').onclick = async () => { try { document.fullscreenElement ? await document.exitFullscreen() : await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape'); } catch {} };
$('bMap').onclick = () => toggleModal('map');
$('bChat').onclick = () => openChat();
$('jobX').onclick = () => { net({ t: 'job_cancel' }); me.job = null; beam.visible = false; $('job').classList.add('hide'); };
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
}

// ---------- модальные окна ----------
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
    return `<div class="carc ${cur ? 'cur' : ''}"><b>${c.ar}</b><small>${CARS[id].ru} · ${Math.round(c.max * 3.6)} ${t('kmh')}</small><div class="pr">${c.price ? '$' + c.price.toLocaleString('en-US') : '—'}</div>${btn}</div>`;
  }).join('');
  $('carList').querySelectorAll('[data-buy]').forEach(b => b.onclick = () => net({ t: 'buy', car: b.dataset.buy }));
  $('carList').querySelectorAll('[data-sel]').forEach(b => b.onclick = () => net({ t: 'select', car: b.dataset.sel }));
  $('swatches').innerHTML = COLORS.map(c => `<button style="background:${c}" class="${P.color === c ? 'on' : ''}" data-col="${c}" aria-label="${c}"></button>`).join('');
  $('swatches').querySelectorAll('[data-col]').forEach(b => b.onclick = () => net({ t: 'select', color: b.dataset.col }));
}

// ---------- карта ----------
const MAPPX = 2048, mapCanvas = document.createElement('canvas');
const toMap = (x, z) => [(x + HALF) / (HALF * 2) * MAPPX, (z + HALF) / (HALF * 2) * MAPPX];
function drawMapCanvas() {
  mapCanvas.width = mapCanvas.height = MAPPX;
  const g = mapCanvas.getContext('2d');
  g.fillStyle = '#d9b77f'; g.fillRect(0, 0, MAPPX, MAPPX);
  g.fillStyle = '#3c9db0';
  for (const side of [1, -1]) {
    g.beginPath();
    for (let z = -HALF; z <= HALF; z += 50) { const [px, py] = toMap(side > 0 ? coastE(z) : coastW(z), z); z === -HALF ? g.moveTo(px, py) : g.lineTo(px, py); }
    g.lineTo(side > 0 ? MAPPX : 0, MAPPX); g.lineTo(side > 0 ? MAPPX : 0, 0); g.fill();
  }
  const s = MAPPX / (HALF * 2);
  g.fillStyle = '#c4baa9';
  for (const c of CITIES) { const [px, py] = toMap(c.x, c.z); g.beginPath(); g.arc(px, py, (c.r + 60) * s, 0, 7); g.fill(); }
  g.strokeStyle = '#55565c'; g.lineCap = 'round';
  for (const st of STREETS) { g.lineWidth = st.w * s; g.beginPath(); g.moveTo(...toMap(...st.pts[0])); g.lineTo(...toMap(...st.pts[1])); g.stroke(); }
  for (const [w, col] of [[30, '#2b2b30'], [20, '#f2c14e']]) {
    g.strokeStyle = col; g.lineWidth = w * s * 1.6;
    for (const h of HIGHWAYS) { g.beginPath(); h.pts.forEach((p, i) => i ? g.lineTo(...toMap(...p)) : g.moveTo(...toMap(...p))); g.stroke(); }
  }
  for (const c of CITIES) {
    const P = cityPoints(c);
    for (const [p, col] of [[P.office, '#ffcc33'], [P.showroom, '#3fa9ff']]) { const [px, py] = toMap(p.x, p.z); g.fillStyle = '#000'; g.beginPath(); g.arc(px, py, 9, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(px, py, 7, 0, 7); g.fill(); }
  }
}
function drawArrow(g, x, y, ang, col, size) {
  g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -size); g.lineTo(size * 0.7, size * 0.8); g.lineTo(0, size * 0.4); g.lineTo(-size * 0.7, size * 0.8); g.closePath(); g.fill(); g.stroke(); g.restore();
}
// угол на карте: машина смотрит по (sin ry, cos ry) в координатах x,z
const mapAngle = ry => Math.atan2(Math.cos(ry), Math.sin(ry)) + Math.PI / 2;
function drawMini() {
  const c = $('mini'), g = c.getContext('2d'), W = c.width, R = W / 2;
  const viewR = 360 + Math.abs(me.speed) * 4, s = MAPPX / (HALF * 2), zoom = R / (viewR * s);
  const [px, py] = toMap(me.x, me.z), rot = -mapAngle(me.ry);
  g.save(); g.clearRect(0, 0, W, W); g.beginPath(); g.arc(R, R, R, 0, 7); g.clip();
  g.translate(R, R); g.rotate(rot); g.scale(zoom, zoom); g.translate(-px, -py);
  g.drawImage(mapCanvas, 0, 0);
  if (me.job) { const [jx, jy] = toMap(me.job.x, me.job.z); g.fillStyle = '#36e27a'; g.strokeStyle = '#000'; g.lineWidth = 3 / zoom; g.beginPath(); g.arc(jx, jy, 9 / zoom, 0, 7); g.fill(); g.stroke(); }
  for (const o of others.values()) { const [ox, oy] = toMap(o.cur.x, o.cur.z); g.fillStyle = '#ff5c5c'; g.beginPath(); g.arc(ox, oy, 6 / zoom, 0, 7); g.fill(); }
  g.restore();
  // стрелка к цели на краю, если она за пределами
  if (me.job) {
    const dx = me.job.x - me.x, dz = me.job.z - me.z, d = Math.hypot(dx, dz);
    if (d > viewR) { const a = mapAngle(Math.atan2(dx, dz)) + rot; drawArrow(g, R + Math.sin(a) * (R - 14), R - Math.cos(a) * (R - 14), a, '#36e27a', 10); }
  }
  drawArrow(g, R, R, 0, '#fff', 13);
}
function drawBigMap() {
  const c = $('bigmap'), g = c.getContext('2d'), W = c.width, k = W / MAPPX;
  g.drawImage(mapCanvas, 0, 0, W, W);
  g.textAlign = 'center'; g.font = '900 30px Cairo, sans-serif'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.7)'; g.fillStyle = '#fff';
  for (const ct of CITIES) { const [x, y] = toMap(ct.x, ct.z); g.strokeText(cityName(ct.id), x * k, y * k - ct.r / (HALF * 2) * W - 14); g.fillText(cityName(ct.id), x * k, y * k - ct.r / (HALF * 2) * W - 14); }
  if (me.job) { const [x, y] = toMap(me.job.x, me.job.z); g.fillStyle = '#36e27a'; g.beginPath(); g.arc(x * k, y * k, 10, 0, 7); g.fill(); }
  for (const o of others.values()) { const [x, y] = toMap(o.cur.x, o.cur.z); g.fillStyle = '#ff5c5c'; g.beginPath(); g.arc(x * k, y * k, 6, 0, 7); g.fill(); }
  const [x, y] = toMap(me.x, me.z); drawArrow(g, x * k, y * k, mapAngle(me.ry), '#fff', 16);
  $('tps').innerHTML = CITIES.map(ct => `<button data-tp="${ct.id}">${t('tp', cityName(ct.id))}</button>`).join('');
  $('tps').querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { net({ t: 'tp', city: b.dataset.tp }); $('map').classList.add('hide'); });
}

// ---------- физика ----------
const CAR_R = 2.3;
function physics(dt) {
  const spec = CARS[me.profile.car];
  const k = input.keys;
  const steerIn = Math.max(-1, Math.min(1, input.steer + ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0)));
  const gas = Math.max(input.gas, (k.KeyW || k.ArrowUp) ? 1 : 0);
  const brake = Math.max(input.brake, (k.KeyS || k.ArrowDown || k.Space) ? 1 : 0);

  const onRoad = ROAD_GRID.dist(me.x, me.z) < 1 || cityMask(me.x, me.z) > 0.6;
  const grip = onRoad ? 1 : 0.55;
  const vmax = spec.max * grip;
  let v = me.speed;
  if (gas) {
    if (v < -0.5) v += 25 * dt;
    else v += spec.accel * gas * dt * Math.max(0, 1 - v / vmax) * 1.5;
  }
  if (brake) {
    if (v > 0.5) v -= 24 * dt;
    else if (!gas) v = Math.max(-12, v - 7 * dt);
  }
  // сопротивление
  v -= v * (onRoad ? 0.06 : 0.5) * dt;
  if (!gas && !brake) { const f = 2.2 * dt; v = Math.abs(v) < f ? 0 : v - Math.sign(v) * f; }
  if (v > vmax) v -= (v - vmax) * 2 * dt;
  me.speed = v;

  const target = steerIn * spec.steer / (1 + Math.abs(v) * 0.045);
  me.steer += (target - me.steer) * Math.min(1, dt * 7);
  me.ry -= v * Math.tan(me.steer) / 2.7 * dt;

  let nx = me.x + Math.sin(me.ry) * v * dt, nz = me.z + Math.cos(me.ry) * v * dt;
  nx = Math.max(-LIMIT, Math.min(LIMIT, nx)); nz = Math.max(-LIMIT, Math.min(LIMIT, nz));
  if (height(nx, nz) < -0.7) { me.speed *= -0.2; return; } // море

  // столкновения со зданиями
  const seen = new Set();
  for (const [ox, oz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) for (const b of world.nearColliders(nx + ox, nz + oz)) {
    if (seen.has(b)) continue; seen.add(b);
    const cx = Math.max(b.x0, Math.min(nx, b.x1)), cz = Math.max(b.z0, Math.min(nz, b.z1));
    let dx = nx - cx, dz = nz - cz, d = Math.hypot(dx, dz);
    if (d < CAR_R) {
      if (d < 1e-4) { dx = Math.sin(me.ry); dz = Math.cos(me.ry); d = 1; nx = me.x; nz = me.z; continue; }
      nx = cx + dx / d * CAR_R; nz = cz + dz / d * CAR_R;
      if (Math.abs(me.speed) > 4) me.speed *= -0.25; else me.speed *= 0.5;
    }
  }
  me.x = nx; me.z = nz;
  me.y = height(me.x, me.z) + ROAD_Y;
}

function placeCar(mesh, x, z, ry, len) {
  const fx = Math.sin(ry), fz = Math.cos(ry), half = len / 2;
  const hf = height(x + fx * half, z + fz * half), hb = height(x - fx * half, z - fz * half);
  const lx = Math.cos(ry), lz = -Math.sin(ry);
  const hl = height(x + lx, z + lz), hr = height(x - lx, z - lz);
  mesh.position.set(x, (hf + hb) / 2 + ROAD_Y, z);
  mesh.rotation.set(-Math.atan2(hf - hb, len), ry, Math.atan2(hl - hr, 2), 'YXZ');
}

// ---------- игровой цикл ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const CAMS = [[9.5, 3.6], [15, 6], [6, 2.3]];
let last = performance.now(), camInit = false, nearMarker = null, frame = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; frame++;
  if (!me.profile || !me.mesh) { renderer.render(scene, camera); return; }

  physics(dt);
  placeCar(me.mesh, me.x, me.z, me.ry, me.mesh.userData.len);
  animateWheels(me.mesh, me.speed, -me.steer * 1.4, dt);

  // другие игроки — плавно догоняем последние данные с сервера
  const a = 1 - Math.exp(-dt * 10);
  for (const o of others.values()) {
    const c = o.cur, tg = o.target;
    if (Math.hypot(tg.x - c.x, tg.z - c.z) > 80) Object.assign(c, tg);
    c.x += (tg.x - c.x) * a; c.z += (tg.z - c.z) * a; c.s = tg.s;
    let d = tg.ry - c.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); c.ry += d * a;
    placeCar(o.mesh, c.x, c.z, c.ry, o.mesh.userData.len);
    animateWheels(o.mesh, c.s, 0, dt);
    o.label.visible = Math.hypot(c.x - me.x, c.z - me.z) < 220;
  }

  // камера
  const [dist, hgt] = CAMS[camMode];
  const fx = Math.sin(me.ry), fz = Math.cos(me.ry), back = me.speed < -1 ? -1 : 1;
  const want = new THREE.Vector3(me.x - fx * dist * back, me.y + hgt, me.z - fz * dist * back);
  const groundY = height(want.x, want.z) + 1.5; if (want.y < groundY) want.y = groundY;
  if (!camInit) { camPos.copy(want); camInit = true; }
  camPos.lerp(want, 1 - Math.exp(-dt * 6));
  camLook.set(me.x + fx * 4, me.y + 1.4, me.z + fz * 4);
  camera.position.copy(camPos); camera.lookAt(camLook);
  const fov = 62 + Math.min(18, Math.abs(me.speed) * 0.28);
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * 0.1; camera.updateProjectionMatrix(); }
  world.sky.position.copy(camera.position);

  // маркеры и работа
  nearMarker = null;
  for (const mk of world.markers) {
    const d = Math.hypot(mk.x - me.x, mk.z - me.z);
    mk.obj.children[0].rotation.y += dt;
    if (d < 9) nearMarker = mk;
  }
  const act = $('action');
  if (nearMarker && !(nearMarker.kind === 'office' && me.job)) {
    act.textContent = nearMarker.kind === 'office' ? t('takeJob') : t('openShop');
    act.classList.remove('hide');
  } else act.classList.add('hide');
  if (me.job) {
    const d = Math.hypot(me.job.x - me.x, me.job.z - me.z);
    $('jobT').textContent = t('job', cityName(me.job.city));
    $('jobS').textContent = t('jobInfo', me.job.pay, d > 1000 ? (d / 1000).toFixed(1) + ' ' + t('km') : Math.round(d) + ' ' + t('m'));
    beam.rotation.y += dt;
    if (d < 12 && Math.abs(me.speed) < 9 && frame % 20 === 0) net({ t: 'job_done' });
  }

  // город
  const nc = nearestCity(me.x, me.z), cid = nc.inside ? nc.city.id : null;
  if (cid !== lastCity) { if (cid) toast(t('welcome', cityName(cid)), 2500, '#ffd36a'); lastCity = cid; }
  $('cityName').textContent = cid ? cityName(cid) : t('desert');
  $('spd').textContent = Math.round(Math.abs(me.speed) * 3.6);

  // отправка состояния 10 раз/сек
  if (now - sendT > 100) { sendT = now; net({ t: 'st', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), ry: +me.ry.toFixed(3), s: +me.speed.toFixed(1) }); }
  if (frame % 2 === 0) drawMini();

  renderer.render(scene, camera);
}

$('action').onclick = () => {
  if (!nearMarker) return;
  if (nearMarker.kind === 'office') net({ t: 'job_take', city: nearMarker.city });
  else toggleModal('shop');
};
