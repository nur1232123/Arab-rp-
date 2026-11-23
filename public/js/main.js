// Arab RP — клиент: персонаж (ходьба/бег/прыжок), машины, камера как в GTA, сеть, интерфейс в стиле BR.
import * as THREE from 'three';
import {
  HALF, LIMIT, CITIES, CITY, CARS, COLORS, SKINS, OUTFITS, HEADS, CLOTH_COLORS, CLOTHES, PRESETS, owns, cleanLook, HIGHWAYS,
  CAR_TIER, SHOWROOMS, GAS_SPOTS, KIOSKS, FUEL_PRICE, REPAIR_PRICE, TUNE_PRICES, ITEMS, SHOP_ITEMS, KIOSK_ITEMS, tuned, STREETS, ROAD_GRID, DAY_MS, FOOD_PRICE, TP_PRICE, LOAD_PAY,
  height, groundY, cityMask, nearestCity, coastE, coastW, cityPoints, FOOD_SPOTS, blockAt,
} from '../shared/world.js';
import { buildWorld, makeTargetBeam, textSprite, U, loadWorldTextures } from './build.js';
import { makeCar, animateCar, setCarNight, loadCarModels } from './cars.js';
import { initSound, setSoundOn, updateSound, sfx } from './sound.js';
import { findRoute, distToRoute } from './route.js';
import { makeShowroom } from './showroom.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeChar, animateChar } from './char.js';
import { loadHuman, humanReady, makeHuman, animateHuman } from './human.js';
// настоящий персонаж, а пока он грузится — простой
const createChar = look => (humanReady() ? makeHuman(look) : makeChar(look));
const animChar = (ch, speed, air, dt, t, dead = false) => (ch.userData.human ? animateHuman(ch, speed, air, dt, dead) : animateChar(ch, speed, air, dt, t));

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
    tp: c => `تاكسي إلى ${c} · ${TP_PRICE}$`, tpDone: c => `وصلت إلى ${c} · −${TP_PRICE}$`, joined: n => `${n} دخل المدينة`, left: n => `${n} غادر`, km: 'كم', m: 'م',
    dead: 'نُقلت إلى المستشفى', deadSub: 'دفعت 100$ للعلاج', settings: 'الإعدادات', gfx: 'الرسومات', low: 'منخفضة', high: 'عالية', language: 'اللغة',
    keys: 'الكمبيوتر: WASD حركة · Shift ركض · Space قفز/فرامل · F ركوب/نزول · E تفاعل · H بوق · M خريطة · T دردشة · C كاميرا · اسحب بالفأرة للنظر',
    carCalled: 'سيارتك وصلت', tooFast: 'خفف السرعة أولاً', hungry: 'أنت جائع! كُل شيئاً', carNear: 'سيارتك قريبة منك',
    tiers: ['معرض السيارات الاقتصادية', 'معرض السيارات', 'معرض السيارات الفاخرة'], soldIn: t => ['تُباع في المعرض الاقتصادي', 'تُباع في المعرض المتوسط', 'تُباع في المعرض الفاخر'][t],
    openGas: 'محطة الوقود', openShop24: 'ادخل السوبرماركت', openTech: 'مركز الصيانة', openKiosk: 'الكشك',
    shop24: 'سوبرماركت 24/7', kiosk: 'كشك', gasT: 'محطة الوقود', techT: 'مركز الصيانة', inv: 'الحقيبة', invEmpty: 'الحقيبة فارغة',
    fillUp: (n, p) => `املأ الخزان · ${n}% · ${p}$`, fuelFull: 'الخزان ممتلئ', fuel: 'البنزين', carHp: 'حالة السيارة',
    repair: (n, p) => `إصلاح · ${n}% · ${p}$`, repaired: 'السيارة سليمة', engine: l => `المحرك · مستوى ${l}/3`, tuneUp: p => `تحسين المحرك · ${p}$`, tuneMax: 'أقصى مستوى',
    use: 'استخدم', have: n => `لديك: ${n}`, paid: p => `−${p}$`, noFuel: 'نفد البنزين! اذهب إلى محطة أو استخدم جالوناً', broken: 'السيارة معطلة! أصلحها في مركز الصيانة',
    err_full: 'لا حاجة لذلك', err_nocar: 'اقترب من سيارتك', eatNow: p => `شاورما الآن · ${p}$`, buyItem: p => `شراء · ${p}$`,
    it: { water: ['ماء', '+10 شبع'], snack: ['سندويش', '+30 شبع'], medkit: ['حقيبة إسعاف', '+40 صحة'], can: ['جالون بنزين', '+30% بنزين'], rkit: ['عدة إصلاح', '+35% حالة السيارة'] },
    sound: 'الصوت', on: 'تشغيل', off: 'إيقاف',
    handOver: 'سلّم الطلب', customer: 'زبون', jobHint: 'انزل من السيارة وسلّم الطلب للزبون',
    takeLoad: 'خذ صندوقاً', putLoad: 'ضع الصندوق في الشاحنة', loadT: 'عامل المستودع', loadInfo: p => `احمل الصندوق إلى الشاحنة · ${p}$`, loadOk: p => `+${p}$ · خذ الصندوق التالي`, loadCar: 'انزل من السيارة لتحمل الصناديق',
    speed: 'السرعة', accel: 'التسارع', test: 'تجربة القيادة', testLeft: s => `تجربة القيادة · ${s} ث`, testStop: 'إنهاء', testEnd: 'انتهت التجربة', owned: 'سيارتك',
    bought: 'مبروك! السيارة الجديدة لك', select: 'اختيار', kicked: 'دخلت إلى اللعبة من مكان آخر',
    clothesShop: 'محل الملابس', openClothes: 'ادخل محل الملابس', beard: 'لحية', glasses: 'نظارة شمسية', buyFor: p => `شراء · ${p}$`, wear: 'البس', wearing: 'تلبسها الآن',
    clothOk: 'تم الشراء! اضغط «البس»', err_notowned: 'اشترِ هذه الملابس أولاً', stamina: 'أنت متعب، توقف قليلاً',
    items: { thobe: 'ثوب', bisht: 'بشت', casual: 'كاجوال', sport: 'رياضي', suit: 'بدلة', shemagh: 'شماغ أحمر', ghutra: 'غترة بيضاء', black: 'شماغ أسود', taqiyah: 'طاقية', cap: 'كاب', none: 'بدون' },
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
    tp: c => `Такси: ${c} · ${TP_PRICE}$`, tpDone: c => `Ты в городе ${c} · −${TP_PRICE}$`, joined: n => `${n} зашёл в игру`, left: n => `${n} вышел`, km: 'км', m: 'м',
    dead: 'Тебя увезли в больницу', deadSub: 'Лечение стоило 100$', settings: 'Настройки', gfx: 'Графика', low: 'Низкая', high: 'Высокая', language: 'Язык',
    keys: 'ПК: WASD — движение · Shift — бег · Space — прыжок/тормоз · F — сесть/выйти · E — действие · H — гудок · M — карта · T — чат · C — камера · мышью тяни — обзор',
    carCalled: 'Машина подъехала', tooFast: 'Сначала сбавь скорость', hungry: 'Ты голоден! Поешь', carNear: 'Машина и так рядом',
    tiers: ['Автосалон эконом-класса', 'Автосалон среднего класса', 'Элитный автосалон'], soldIn: t => ['Продаётся в салоне эконом-класса', 'Продаётся в салоне среднего класса', 'Продаётся в элитном салоне'][t],
    openGas: 'Заправка', openShop24: 'Войти в магазин 24/7', openTech: 'Техцентр', openKiosk: 'Ларёк',
    shop24: 'Магазин 24/7', kiosk: 'Ларёк', gasT: 'Заправка', techT: 'Техцентр', inv: 'Сумка', invEmpty: 'Сумка пуста',
    fillUp: (n, p) => `Заправить до полного · ${n}% · ${p}$`, fuelFull: 'Бак полный', fuel: 'Бензин', carHp: 'Состояние машины',
    repair: (n, p) => `Починить · ${n}% · ${p}$`, repaired: 'Машина целая', engine: l => `Двигатель · уровень ${l}/3`, tuneUp: p => `Улучшить двигатель · ${p}$`, tuneMax: 'Максимум',
    use: 'Использовать', have: n => `Есть: ${n}`, paid: p => `−${p}$`, noFuel: 'Бензин кончился! Доедь до заправки или залей канистру', broken: 'Машина сломана! Почини в техцентре',
    err_full: 'Это не нужно', err_nocar: 'Подойди к своей машине', eatNow: p => `Шаурма сейчас · ${p}$`, buyItem: p => `Купить · ${p}$`,
    it: { water: ['Вода', '+10 сытости'], snack: ['Сэндвич', '+30 сытости'], medkit: ['Аптечка', '+40 здоровья'], can: ['Канистра', '+30% бензина'], rkit: ['Ремкомплект', '+35% машине'] },
    sound: 'Звук', on: 'Вкл', off: 'Выкл',
    handOver: 'Отдать заказ', customer: 'Клиент', jobHint: 'Выйди из машины и отдай заказ клиенту',
    takeLoad: 'Взять коробку', putLoad: 'Положить в грузовик', loadT: 'Грузчик на складе', loadInfo: p => `Отнеси коробку в грузовик · ${p}$`, loadOk: p => `+${p}$ · бери следующую`, loadCar: 'Выйди из машины, чтобы носить коробки',
    speed: 'Скорость', accel: 'Разгон', test: 'Тест-драйв', testLeft: s => `Тест-драйв · ${s} с`, testStop: 'Закончить', testEnd: 'Тест-драйв окончен', owned: 'Твоя',
    bought: 'Поздравляем! Машина твоя', select: 'Выбрать', kicked: 'Ты зашёл в игру с другого устройства',
    clothesShop: 'Магазин одежды', openClothes: 'Войти в магазин одежды', beard: 'Борода', glasses: 'Очки', buyFor: p => `Купить · ${p}$`, wear: 'Надеть', wearing: 'Уже надето',
    clothOk: 'Куплено! Нажми «Надеть»', err_notowned: 'Сначала купи эти вещи', stamina: 'Ты устал, передохни',
    items: { thobe: 'Тоб', bisht: 'Бишт', casual: 'Повседневная', sport: 'Спортивный', suit: 'Костюм', shemagh: 'Шемаг красный', ghutra: 'Гутра белая', black: 'Шемаг чёрный', taqiyah: 'Такия', cap: 'Кепка', none: 'Без убора' },
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
let outfit = PRESETS[store.get('outfit')] ? store.get('outfit') : 'thobe_red'; // стартовый набор на экране входа
// внешность выбирается один раз, при создании персонажа; потом — в магазине одежды
if (store.get('token')) document.querySelectorAll('.newOnly').forEach(e => e.classList.add('hide'));
const myLook = () => ({ ...me.profile.look, skin: me.profile.skin });
const sameLook = (a, b) => !!a && !!b && ['outfit', 'head', 'cloth', 'beard', 'glasses', 'skin'].every(k => a[k] === b[k]);
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
const me = { fuel: 100, chp: 100, id: 0, profile: null, mode: 'foot', x: 0, y: 0, z: 0, ry: Math.PI, vy: 0, spd: 0, onGround: true, char: null, job: null, load: null, test: null, hp: 100, hunger: 100, dead: false };
const car = { x: 0, y: 0, z: 0, ry: Math.PI, speed: 0, steer: 0, mesh: null, braking: false };
const cam = { yaw: Math.PI, pitch: 0.25, dragT: 0, mode: 0 };
const others = new Map();
const input = { jx: 0, jy: 0, gas: 0, brake: 0, sprint: false, jump: false, keys: {} };
let scene, camera, renderer, world, beam, ws, hemi, sun, showroom, started = false, online = 1, timeOff = 0, night = 0;
let quality = store.get('q') || (matchMedia('(pointer:coarse)').matches ? 'low' : 'high');
let soundOn = store.get('snd') !== '0';
const mobile = matchMedia('(pointer:coarse)').matches;
// какая машина сейчас под игроком: на тест-драйве — тестовая
const carType = () => me.test?.car || me.profile.car;
const carColor = () => me.test?.color || me.profile.color;
window.__ar = { me, car, cam }; // для автотестов
initSound(soundOn);

$('play').onclick = () => {
  const name = $('name').value.trim(); if (!name) { $('name').focus(); return; }
  store.set('name', name);
  // полноэкранный режим просим, но игру не ждём: на некоторых браузерах ответ не приходит
  try { document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {}); } catch {}
  $('login').classList.add('hide'); $('loading').classList.remove('hide'); $('loading').textContent = t('loading');
  setTimeout(async () => { await init(); connect(); }, 50);
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
const markSound = () => document.querySelectorAll('[data-snd]').forEach(b => b.classList.toggle('on', (b.dataset.snd === '1') === soundOn));
document.querySelectorAll('[data-snd]').forEach(b => b.onclick = () => { soundOn = b.dataset.snd === '1'; store.set('snd', soundOn ? '1' : '0'); setSoundOn(soundOn); markSound(); });
markSound();
async function init() {
  if (started) return; started = true;
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: !mobile, powerPreference: 'high-performance' });
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // киношная цветокоррекция: насыщеннее цвета, мягче пересветы
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  await loadWorldTextures(); // фото-текстуры стен, дорог и песка — до постройки города
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
  showroom = makeShowroom(scene.environment); window.__ar.showroom = showroom;
  buildWarehouses();
  loadHuman().then(() => { // заменяем простых человечков на настоящих
    if (me.char && me.profile) rebuildMe();
    for (const o of others.values()) rebuildOtherChar(o);
    if (customer.char) placeCustomer();
  }).catch(() => {});
  loadCarModels().then(() => { // когда 3D-модели загрузились — заменяем временные машины
    if (car.mesh && me.profile && car.mesh.userData.type !== carType()) { scene.remove(car.mesh); car.mesh = makeCar(carType(), carColor()); scene.add(car.mesh); }
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
  me.char = createChar(myLook()); scene.add(me.char); me.char.visible = me.mode === 'foot';
  if (car.mesh) scene.remove(car.mesh);
  car.mesh = makeCar(carType(), carColor()); scene.add(car.mesh);
}
function rebuildMyCar() { scene.remove(car.mesh); car.mesh = makeCar(carType(), carColor()); scene.add(car.mesh); }
function rebuildMe() { scene.remove(me.char); me.char = createChar(myLook()); scene.add(me.char); me.char.visible = me.mode === 'foot'; }
function rebuildOtherChar(o) { scene.remove(o.char); o.char = createChar(o.look); scene.add(o.char); }

// ---------- склад грузчиков: груда коробок и пикап ----------
const boxGeo = new THREE.BoxGeometry(0.5, 0.42, 0.5), boxMat = new THREE.MeshLambertMaterial({ color: '#b8834a' });
const tapeMat = new THREE.MeshLambertMaterial({ color: '#d9c08a' });
function makeBox() {
  const g = new THREE.Group(); g.add(new THREE.Mesh(boxGeo, boxMat));
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.43, 0.51), tapeMat); g.add(tape);
  return g;
}
function buildWarehouses() {
  for (const c of CITIES) {
    const P = cityPoints(c);
    const pile = new THREE.InstancedMesh(boxGeo, boxMat, 14), m = new THREE.Matrix4(); let k = 0;
    const gy = groundY(P.wh.x + 4, P.wh.z);
    for (let y = 0; y < 3; y++) for (let i = 0; i < 5 - y && k < 14; i++, k++) {
      m.makeRotationY((i * 7 + y) % 3 * 0.15); m.setPosition(P.wh.x + 3.6 + (i % 2) * 0.55, gy + 0.21 + y * 0.42, P.wh.z - 1 + i * 0.55 + y * 0.25);
      pile.setMatrixAt(k, m);
    }
    pile.count = k; scene.add(pile);
    const truck = makeCar('dhib', '#e8e6e0');
    const tx = P.whDrop.x + 3.4, tz = P.whDrop.z;
    placeCar(truck, tx, tz, Math.PI); scene.add(truck);
    const load = new THREE.Group();
    for (let i = 0; i < 3; i++) { const b = makeBox(); b.position.set(tx + (i - 1) * 0.55, truck.position.y + 1.45, tz + 1.6); load.add(b); }
    scene.add(load);
    // дальние склады не рисуем (как мелкие детали города)
    for (const o of [pile, truck, load]) world.lod.push({ m: o, x: P.wh.x, z: P.wh.z });
  }
}
const carried = makeBox(); carried.position.set(0, 1.08, 0.36); carried.visible = false;

// ---------- клиент, который ждёт заказ ----------
const customer = { char: null, label: null, x: 0, z: 0, ry: 0 };
function placeCustomer() {
  removeCustomer();
  const j = me.job; if (!j) return;
  // ставим клиента на тротуар рядом с точкой заказа
  let px = j.x, pz = j.z;
  for (const [dx, dz] of [[8.5, 0], [-8.5, 0], [0, 8.5], [0, -8.5]]) if (blockAt(j.x + dx, j.z + dz)) { px = j.x + dx; pz = j.z + dz; break; }
  customer.x = px; customer.z = pz; customer.ry = Math.atan2(j.x - px, j.z - pz);
  // у каждого клиента своя внешность (по номеру заказа)
  const h = k => j.id.charCodeAt(k) || 0;
  customer.char = createChar({ outfit: ['thobe', 'thobe', 'casual', 'sport', 'suit'][h(0) % 5], head: HEADS[h(1) % HEADS.length], cloth: CLOTH_COLORS[h(2) % CLOTH_COLORS.length], beard: h(3) % 3 > 0, glasses: h(4) % 4 === 0, skin: SKINS[h(5) % SKINS.length] });
  customer.char.position.set(px, groundY(px, pz), pz); customer.char.rotation.y = customer.ry;
  customer.label = textSprite(t('customer'), { color: '#36e27a', scale: 0.42 });
  customer.label.position.set(px, groundY(px, pz) + 2.3, pz);
  scene.add(customer.char, customer.label);
}
function removeCustomer() { if (customer.char) scene.remove(customer.char, customer.label); customer.char = customer.label = null; }

// ---------- GPS ----------
let route = null, routeT = 0;
function routeTarget() {
  if (me.job) return [customer.char ? customer.x : me.job.x, customer.char ? customer.z : me.job.z];
  if (me.load) { const P = cityPoints(CITY[me.load.city]); return [P.whDrop.x, P.whDrop.z]; }
  return null;
}
function updateRoute(x, z, now) {
  const tg = routeTarget(); if (!tg) { route = null; return; }
  if (route && route.tx === tg[0] && route.tz === tg[1] && (now - routeT < 1500 || distToRoute(route.pts, x, z) < 30)) {
    route.pts[0] = [x, z]; return;
  }
  routeT = now;
  route = { tx: tg[0], tz: tg[1], pts: Math.hypot(tg[0] - x, tg[1] - z) < 60 ? [[x, z], tg] : findRoute(x, z, tg[0], tg[1]) };
}

// ---------- сеть ----------
let sendT = 0, reconnectT = 0, kicked = false;
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: store.get('token'), name: store.get('name'), look: { ...PRESETS[outfit], beard: store.get('beard') !== '0' }, skin }));
  ws.onmessage = e => onMsg(JSON.parse(e.data));
  ws.onclose = () => {
    for (const id of [...others.keys()]) removeOther(id);
    if (kicked) return; // игрок открыл игру в другом месте — не воюем за подключение
    if (me.profile) toast(t('offline'), 3000);
    clearTimeout(reconnectT); reconnectT = setTimeout(connect, 2500);
  };
}
const net = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

function onMsg(m) {
  switch (m.t) {
    case 'welcome': {
      const first = !me.profile;
      me.id = m.id; me.profile = m.profile; store.set('token', m.token);
      me.test = null; me.dead = false; $('test').classList.add('hide'); $('dead').classList.add('hide'); clearJob(); clearLoad();
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
    case 'look': {
      const o = others.get(m.id); if (!o) break;
      if (o.look.car !== m.car || o.look.color !== m.color) { o.look.car = m.car; o.look.color = m.color; rebuildOtherCar(o); }
      if (m.look && !sameLook(o.look, m.look)) { Object.assign(o.look, m.look); rebuildOtherChar(o); }
      break;
    }
    case 'snap': {
      online = m.p.length;
      for (const [id, mode, x, y, z, ry, s, a, cx, cy, cz, cry] of m.p) {
        if (id === me.id) continue; const o = others.get(id); if (!o) continue;
        o.mode = mode; Object.assign(o.t, { x, y, z, ry, s, a, cx, cy, cz, cry });
      }
      updateHud(); break;
    }
    case 'chat': chatLine(m.name, m.m); break;
    case 'kicked': kicked = true; $('dead').classList.remove('hide'); $('dead').innerHTML = `<div>${t('kicked')}</div>`; break;
    case 'profile': setProfile(m.profile); break;
    case 'bought': setProfile(m.profile); sfx.coin(); toast(t('bought'), 2500, '#8ff0a4'); break;
    case 'cloth_ok': setProfile(m.profile); sfx.coin(); toast(t('clothOk'), 1800, '#8ff0a4'); break;
    case 'veh': me.fuel = m.fuel; me.chp = m.chp; updateCarStat(); renderStore(); break;
    case 'paid': setProfile(m.profile); sfx.coin(); toast(t('paid', m.cost), 1400, '#8ff0a4'); renderStore(); break;
    case 'used': setProfile(m.profile); me.hp = m.profile.hp; me.hunger = m.profile.hunger; sfx.eat(); renderInv(); updateHud(); break;
    case 'vit': {
      if (me.hunger > 15 && m.hunger <= 15) toast(t('hungry'), 2500, '#ffb347');
      me.hp = m.hp; me.hunger = m.hunger; updateHud(); break;
    }
    case 'dead': me.dead = true; me.hp = 0; car.speed = 0; sfx.dead(); clearJob(); clearLoad(); $('dead').classList.remove('hide'); updateHud(); break;
    case 'fix': if (me.mode === 'car') { car.x = m.x; car.z = m.z; car.speed = 0; } else { me.x = m.x; me.z = m.z; me.vx = me.vz = 0; } break;
    case 'tp': me.profile = m.profile; clearJob(); clearLoad(); teleport(m.x, m.z); updateHud(); toast(t('tpDone', cityName(nearestCity(m.x, m.z).city.id)), 2500, '#ffd36a'); break;
    case 'respawn': me.profile = m.profile; me.hp = m.profile.hp; me.hunger = m.profile.hunger; teleport(m.x, m.z); me.dead = false; $('dead').classList.add('hide'); clearJob(); updateHud(); break;
    case 'ate': me.profile = m.profile; me.hunger = m.profile.hunger; updateHud(); sfx.eat(); toast(t('ate'), 2000, '#ffb347'); break;
    case 'job': {
      clearLoad(); me.job = m.job; placeCustomer();
      beam.visible = true; beam.position.set(customer.x, groundY(customer.x, customer.z) + 0.05, customer.z);
      $('job').classList.remove('hide'); route = null; sfx.pick(); break;
    }
    case 'job_ok': clearJob(); me.profile = m.profile; updateHud(); sfx.coin(); toast(t('jobOk', m.pay), 2500, '#8ff0a4'); break;
    case 'load': clearJob(); me.load = { city: m.city }; sfx.pick(); showLoadBeam(); $('job').classList.remove('hide'); break;
    case 'load_ok': clearLoad(); me.profile = m.profile; updateHud(); sfx.coin(); toast(t('loadOk', m.pay), 1800, '#8ff0a4'); break;
    case 'test': startTest(m); break;
    case 'test_end': endTest(m); break;
    case 'err': if (m.code === 'cheat') { clearJob(); clearLoad(); } sfx.error(); toast(t('err_' + m.code), 2200, '#ff8a7a'); break;
  }
}
function setProfile(p) {
  const old = me.profile; me.profile = p; updateHud(); renderShop(); renderWardrobe(false);
  if (!me.test && (old.car !== p.car || old.color !== p.color)) rebuildMyCar();
  if (!sameLook({ ...old.look, skin: old.skin }, myLook())) rebuildMe();
}
function clearJob() { me.job = null; removeCustomer(); if (!me.load) { beam.visible = false; $('job').classList.add('hide'); } }
function clearLoad() { me.load = null; if (!me.job) { beam.visible = false; $('job').classList.add('hide'); } }
function showLoadBeam() { const P = cityPoints(CITY[me.load.city]); beam.visible = true; beam.position.set(P.whDrop.x, groundY(P.whDrop.x, P.whDrop.z) + 0.05, P.whDrop.z); }

// ---------- тест-драйв ----------
let testEndAt = 0;
function startTest(m) {
  closeModals();
  me.test ={ car: m.car, color: m.color }; testEndAt = performance.now() + m.ms;
  const sr = nearestCity(me.x, me.z).city, spot = cityPoints(sr)[SHOWROOMS[shopTier]];
  // машина появляется на улице у салона, игрок сразу за рулём
  car.x = spot.x; car.z = spot.z + 8; car.ry = 0; car.speed = 0; car.y = groundY(car.x, car.z);
  rebuildMyCar(); setMode('car'); cam.yaw = car.ry; sfx.door();
  $('test').classList.remove('hide');
}
function endTest(m) {
  if (!me.test) return;
  me.test = null; $('test').classList.add('hide');
  rebuildMyCar(); teleport(m.x, m.z);
  toast(t('testEnd'), 2000, '#ffd36a');
}
function teleport(x, z) {
  setMode('foot');
  me.x = x; me.z = z; me.y = groundY(x, z); me.vy = 0; me.vx = me.vz = 0; me.visY = null; me.ry = Math.PI; cam.yaw = Math.PI;
  car.x = x - 6; car.z = z - 3; car.ry = Math.PI; car.speed = 0; car.y = groundY(car.x, car.z);
}

function addOther(p) {
  if (others.has(p.id)) return;
  const st = { x: p.x, y: p.y, z: p.z, ry: p.ry, s: 0, a: 0, cx: p.cx ?? p.x, cy: p.cy ?? p.y, cz: p.cz ?? p.z, cry: p.cry ?? p.ry };
  const o = { id: p.id, name: p.name, mode: p.mode || 0, look: { car: p.car, color: p.color, ...p.look }, t: st, c: { ...st } };
  o.char = createChar(o.look); scene.add(o.char);
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
$('bHorn').onclick = () => sfx.horn();

// обзор пальцем/мышью по экрану
const gl = $('gl'); const drags = new Map();
gl.addEventListener('pointerdown', e => { drags.set(e.pointerId, { x: e.clientX, y: e.clientY }); gl.setPointerCapture(e.pointerId); });
gl.addEventListener('pointermove', e => {
  const d = drags.get(e.pointerId); if (!d) return;
  const k = e.pointerType === 'mouse' ? 0.006 : 0.008;
  if (shopOpen()) { showroom.drag(e.clientX - d.x); d.x = e.clientX; d.y = e.clientY; return; }
  cam.yaw -=(e.clientX - d.x) * k; cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k * 0.7, -0.35, 1.25);
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
  if (e.code === 'KeyH' && me.mode === 'car') sfx.horn();
  if (e.code === 'Escape') closeModals();
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
$('bInv').onclick = () => openInv();
$('bCar').onclick = () => summonCar();
$('jobX').onclick = () => { if (me.load) { net({ t: 'load_cancel' }); clearLoad(); } else { net({ t: 'job_cancel' }); clearJob(); } };
$('testX').onclick = () => net({ t: 'test_stop' });
// щелчок на любой кнопке интерфейса
addEventListener('pointerdown', e => { if (e.target.closest?.('button')) sfx.click(); }, { capture: true });
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeModals());
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
  $('carStat').classList.toggle('hide', m !== 'car' || !!me.test);
  $('footBtns').classList.toggle('hide', m !== 'foot');
  $('carBtns').classList.toggle('hide', m !== 'car');
  $('speedo').classList.toggle('hide', m !== 'car');
  if (me.char) me.char.visible = m === 'foot';
}
function toggleCar() {
  if (me.dead || !me.profile) return;
  if (me.mode === 'foot') {
    if (me.load) { toast(t('loadCar'), 2000); return; }
    if (Math.hypot(car.x - me.x, car.z - me.z) < 3.6) { setMode('car'); cam.yaw = car.ry; sfx.door(); }
  } else {
    if (Math.abs(car.speed) > 6) { toast(t('tooFast')); return; }
    const lx = Math.cos(car.ry), lz = -Math.sin(car.ry);
    for (const s of [1, -1]) {
      const x = car.x + lx * 1.8 * s, z = car.z + lz * 1.8 * s;
      if (!blockedAt(x, z, 0.4, groundY(x, z))) { me.x = x; me.z = z; break; }
      me.x = car.x + lx * 1.8; me.z = car.z + lz * 1.8;
    }
    me.y = groundY(me.x, me.z); me.vy = 0; me.vx = me.vz = 0; me.spd = 0; me.visY = null; me.ry = car.ry; car.speed = 0; cam.yaw = car.ry;
    setMode('foot'); sfx.door();
  }
}
function summonCar() {
  if (me.mode !== 'foot' || me.dead || me.test) return;
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
// Пешком — управление в духе классических GTA: персонаж бежит туда, куда смотрит,
// и быстро поворачивается за джойстиком; при развороте на бегу — короткий разворот на месте.
// Камера сама заходит за спину. Прыжок у невысокого препятствия — перелезть через него.
const FOOT = { walk: 1.7, jog: 5.2, run: 8.0, acc: 34, dec: 28, jump: 6.4, g: 22 };
Object.assign(me, { vx: 0, vz: 0, stam: 100, tired: false, coyote: 0, jumpBuf: 0, landSlow: 0, visY: null, lean: 0, roll: 0, vault: null, turnT: 0 });
function updateFoot(dt) {
  if (me.vault) return updateVault(dt);
  const k = input.keys;
  let ix = input.jx + ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0);
  let iy = -input.jy + ((k.KeyW || k.ArrowUp) ? 1 : 0) - ((k.KeyS || k.ArrowDown) ? 1 : 0);
  let mag = Math.hypot(ix, iy); if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
  let mx = fx * iy - fz * ix, mz = fz * iy + fx * ix;
  const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;

  // выносливость: на спринт её хватает надолго; выдохся — только бег трусцой, пока не отдохнёшь
  const wantRun = (input.sprint || k.ShiftLeft || k.ShiftRight) && !me.load && mag > 0.3; // с коробкой не побегаешь
  if (me.stam <= 0 && !me.tired) { me.tired = true; toast(t('stamina'), 1500, '#7fc8ff'); }
  if (me.tired && me.stam > 30) me.tired = false;
  const sprint = wantRun && !me.tired;
  me.stam = clamp(me.stam + dt * (sprint && me.spd > 5 ? -5 : mag < 0.08 ? 18 : 9), 0, 100);

  // склон: в гору медленнее
  let slopeK = 1;
  if (mag >= 0.08 && me.onGround) { const s = (groundY(me.x + mx * 1.5, me.z + mz * 1.5) - groundY(me.x, me.z)) / 1.5; if (Math.abs(s) < 0.6) slopeK = clamp(1 - s * 1.4, 0.6, 1.08); }
  me.landSlow = Math.max(0, me.landSlow - dt);
  let top = (mag < 0.08 ? 0 : sprint ? FOOT.run : mag > 0.6 ? FOOT.jog : FOOT.walk) * slopeK * (me.landSlow > 0 ? 0.35 : 1);

  // поворот: корпус догоняет джойстик быстро; если надо развернуться назад на бегу — разворот на месте
  const prevRy = me.ry;
  me.turnT = Math.max(0, me.turnT - dt);
  if (mag >= 0.08 && me.onGround) {
    const want = Math.atan2(mx, mz), diff = Math.atan2(Math.sin(want - me.ry), Math.cos(want - me.ry));
    if (Math.abs(diff) > 2.4 && me.spd > 4 && !me.turnT) { me.turnT = 0.18; me.spd *= 0.35; }
    const rate = me.turnT ? 20 : sprint ? 9 : 15;
    me.ry += clamp(diff, -rate * dt, rate * dt);
    if (Math.abs(diff) > 1.6) top *= 0.4; // сильно не туда — сначала повернись
  }
  // скорость набирается и гасится быстро, но не мгновенно (лёгкий «доскок» при остановке)
  if (me.onGround) me.spd += clamp(top - me.spd, -FOOT.dec * dt, FOOT.acc * dt);
  me.vx = Math.sin(me.ry) * me.spd; me.vz = Math.cos(me.ry) * me.spd; // в воздухе сохраняем разбег
  // лёгкий наклон в сторону поворота на бегу
  const turn = Math.atan2(Math.sin(me.ry - prevRy), Math.cos(me.ry - prevRy)) / Math.max(dt, 1e-3);
  me.lean += (clamp(me.spd * 0.008, 0, 0.07) - me.lean) * Math.min(1, dt * 8);
  me.roll += (clamp(-turn * me.spd * 0.006, -0.12, 0.12) - me.roll) * Math.min(1, dt * 10);

  // прыжок у невысокого препятствия — перелезаем через него
  if (input.jump && me.onGround && !me.load && tryVault()) { input.jump = false; return; }

  let nx = clamp(me.x + me.vx * dt, -LIMIT, LIMIT), nz = clamp(me.z + me.vz * dt, -LIMIT, LIMIT);
  [nx, nz] = pushCircle(nx, nz, 0.35, me.y);
  for (const c of carsAround()) { const p = pushFromCar(nx, nz, 0.35, ...c); if (p && me.y < groundY(c[0], c[1]) + 1.6) [nx, nz] = p; }
  // другие игроки пешком — твёрдые: расталкиваемся
  for (const o of others.values()) {
    if (o.mode) continue;
    const dx = nx - o.c.x, dz = nz - o.c.z, d = Math.hypot(dx, dz);
    if (d < 0.7 && d > 1e-4 && Math.abs(me.y - o.c.y) < 1.5) { nx = o.c.x + dx / d * 0.7; nz = o.c.z + dz / d * 0.7; }
  }
  const g = groundY(nx, nz);
  // ступенька выше колена или вода — стоп; стену «чувствуем» и гасим скорость вдоль неё
  if (g < -0.6 || (g - me.y > 0.65)) { nx = me.x; nz = me.z; me.spd *= 0.3; }
  const moved = Math.hypot(nx - me.x, nz - me.z);
  if (dt > 0 && me.onGround && moved < me.spd * dt * 0.5) me.spd = Math.max(moved / dt, me.spd * 0.85); // упёрлись — не копим скорость
  // шаги: звук на каждый шаг по пройденному пути
  if (me.onGround && moved > 0) { me.stepD = (me.stepD || 0) + moved; const len = me.spd > 6 ? 1.15 : 0.8; if (me.stepD > len) { me.stepD = 0; sfx.step(me.spd > 6, cityMask(nx, nz) < 0.5); } }
  me.x = nx; me.z = nz;

  // прыжок: можно нажать чуть раньше приземления и чуть позже схода с края
  me.coyote = me.onGround ? 0.12 : Math.max(0, me.coyote - dt);
  me.jumpBuf = input.jump ? 0.15 : Math.max(0, me.jumpBuf - dt);
  input.jump = false;
  if (me.jumpBuf > 0 && me.coyote > 0 && !me.load && me.stam > 5) { me.vy = FOOT.jump; me.onGround = false; me.coyote = 0; me.jumpBuf = 0; me.stam -= 6; }
  me.vy -= FOOT.g * dt; me.y += me.vy * dt;
  const g2 = groundY(me.x, me.z);
  if (me.y <= g2) {
    if (me.vy < -15) damage((-me.vy - 15) * 5);
    if (me.vy < -11) { me.landSlow = 0.45; me.spd *= 0.4; } // тяжёлое приземление
    if (!me.onGround && me.vy < -4) sfx.land();
    me.y = g2; me.vy = 0; me.onGround = true;
  }
  else if (me.onGround && me.vy <= 0 && me.y - g2 < 0.6) me.y = g2;
  else me.onGround = false;
  // на бордюр персонаж поднимается плавно, а не прыжком камеры
  if (me.visY === null || Math.abs(me.visY - me.y) > 1.5) me.visY = me.y;
  me.visY = me.y > me.visY ? me.visY + (me.y - me.visY) * Math.min(1, dt * 14) : me.y;
}

// перелезть через забор, машину, ограду: высота препятствия 0.5–2.5 м, толщина до ~3.5 м
function obstacleTop(x, z, y) {
  let top = -Infinity;
  for (const b of world.near(x, z, 1)) {
    if (y > b.y1 - 0.3) continue;
    const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
    if (Math.hypot(x - cx, z - cz) < 0.35) top = Math.max(top, b.y1);
  }
  for (const c of carsAround()) if (pushFromCar(x, z, 0.35, ...c)) top = Math.max(top, groundY(c[0], c[1]) + 1.5);
  return top;
}
function tryVault() {
  const sx = Math.sin(me.ry), sz = Math.cos(me.ry);
  let top = -Infinity;
  for (const d of [0.45, 0.8]) top = Math.max(top, obstacleTop(me.x + sx * d, me.z + sz * d, me.y));
  const h = top - me.y;
  if (!(h > 0.5 && h < 2.5)) return false;
  for (let d = 1.0; d <= 4.2; d += 0.2) {
    const x = me.x + sx * d, z = me.z + sz * d, g = groundY(x, z);
    if (g < -0.5 || Math.abs(g - me.y) > 1.2) continue;
    if (obstacleTop(x, z, g) > -Infinity) continue;
    me.vault = { t: 0, dur: 0.38 + d * 0.07, x0: me.x, z0: me.z, y0: me.y, x1: x, z1: z, y1: g, peak: top + 0.2 };
    me.onGround = false; me.vy = 0; me.stam = Math.max(0, me.stam - 4); sfx.step(false, false);
    return true;
  }
  return false;
}
function updateVault(dt) {
  const v = me.vault; v.t += dt;
  const u = Math.min(1, v.t / v.dur), base = v.y0 + (v.y1 - v.y0) * u;
  me.x = v.x0 + (v.x1 - v.x0) * u; me.z = v.z0 + (v.z1 - v.z0) * u;
  me.y = base + (v.peak - (v.y0 + v.y1) / 2) * Math.sin(Math.PI * u);
  me.visY = me.y; me.spd = Math.max(me.spd, 2.5);
  if (u >= 1) { me.vault = null; me.y = v.y1; me.onGround = true; me.vy = 0; sfx.land(); }
}

// ---------- физика машины ----------
function updateCar(dt, driving) {
  // тюнинг двигателя (на тест-драйве — заводская машина)
  const spec = tuned(carType(), me.test ? 0 : me.profile.tune?.[carType()] || 0), k = input.keys;
  let steerIn = 0, gas = 0, brake = 0;
  if (driving) {
    steerIn = clamp(input.jx + ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0), -1, 1);
    gas = Math.max(input.gas, (k.KeyW || k.ArrowUp) ? 1 : 0);
    brake = Math.max(input.brake, (k.KeyS || k.ArrowDown || k.Space) ? 1 : 0);
    // без бензина или со сломанным мотором — не поедет
    if (gas && !me.test && (me.fuel <= 0 || me.chp <= 0)) {
      if (performance.now() - (car.warnT || 0) > 3000) { car.warnT = performance.now(); toast(me.chp <= 0 ? t('broken') : t('noFuel'), 2500, '#ff8a7a'); sfx.error(); }
      gas = 0;
    }
  }
  const onRoad = ROAD_GRID.dist(car.x, car.z) < 1 || cityMask(car.x, car.z) > 0.6;
  const vmax = spec.max * (onRoad ? 1 : 0.55) * (!me.test && me.chp < 35 ? 0.7 : 1); // побитая машина едет хуже
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
    if (imp > 6 && driving && !me.test) { const n = Math.round((imp - 6) * 1.3); me.chp = Math.max(0, me.chp - n); net({ t: 'cdmg', n }); updateCarStat(); }
    if (imp > 3 && performance.now() - (car.hitT || 0) > 400) { car.hitT = performance.now(); sfx.crash(imp); }
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

// урон считает сервер; здесь показываем сразу, чтобы не ждать ответа
function damage(n) { if (me.dead || n <= 0) return; me.hp = Math.max(0, me.hp - n); updateHud(); net({ t: 'dmg', n: Math.round(n * 10) / 10 }); }

// ---------- окна ----------
function closeModals() { document.querySelectorAll('.modal').forEach(x => x.classList.add('hide')); $('hud').classList.toggle('hide', !me.profile); }
function toggleModal(id) {
  const m = $(id); const show = m.classList.contains('hide');
  closeModals();
  if (show) {
    m.classList.remove('hide');
    if (id === 'map') drawBigMap();
    if (id === 'shop') {
      shopSel.car = CAR_TIER[me.profile.car] === shopTier ? me.profile.car : Object.keys(CARS).find(k => CAR_TIER[k] === shopTier);
      shopSel.color = me.profile.color; renderShop(); $('hud').classList.add('hide');
    }
  }
}
let shopTier = 1; // класс открытого автосалона: 0 эконом, 1 средний, 2 элитный

// ---------- АЗС, техцентр, магазин 24/7, ларёк, сумка ----------
let storeKind = null;
function openStore(kind) { closeModals(); storeKind = kind; $('store').classList.remove('hide'); renderStore(); }
function renderStore() {
  if (!storeKind || $('store').classList.contains('hide') || !me.profile) return;
  const P = me.profile, car = P.car, rows = [];
  const row = (title, sub, btn, on, dis) => rows.push({ title, sub, btn, on, dis });
  if (storeKind === 'gas') {
    const need = Math.floor(100 - me.fuel), cost = Math.ceil(need * FUEL_PRICE);
    row(`${CARS[car].ar} · ${t('fuel')} ${Math.round(me.fuel)}%`, `${FUEL_PRICE}$ / 1%`, need < 1 ? t('fuelFull') : t('fillUp', need, cost), () => net({ t: 'refuel' }), need < 1 || P.money < FUEL_PRICE);
  } else if (storeKind === 'tech') {
    const need = Math.floor(100 - me.chp), cost = Math.ceil(need * REPAIR_PRICE), lvl = P.tune?.[car] || 0;
    row(`${CARS[car].ar} · ${t('carHp')} ${Math.round(me.chp)}%`, `${REPAIR_PRICE}$ / 1%`, need < 1 ? t('repaired') : t('repair', need, cost), () => net({ t: 'repair' }), need < 1 || P.money < REPAIR_PRICE);
    const s0 = CARS[car], s1 = tuned(car, Math.min(3, lvl + 1));
    row(t('engine', lvl), `${Math.round(tuned(car, lvl).max * 3.6)} → ${Math.round(s1.max * 3.6)} ${t('kmh')} · ${t('accel')} +${Math.round((s1.accel / s0.accel - 1) * 100)}%`,
      lvl >= 3 ? t('tuneMax') : t('tuneUp', TUNE_PRICES[lvl].toLocaleString('en-US')), () => net({ t: 'tune' }), lvl >= 3 || P.money < (TUNE_PRICES[lvl] || 0));
  } else {
    if (storeKind === 'kiosk') row(t('eat', FOOD_PRICE).split('·')[0], '+45', t('eatNow', FOOD_PRICE), () => net({ t: 'eat' }), P.money < FOOD_PRICE);
    for (const id of storeKind === 'kiosk' ? KIOSK_ITEMS : SHOP_ITEMS) {
      const n = P.inv?.[id] || 0;
      row(t('it')[id][0], t('it')[id][1] + ' · ' + t('have', n), t('buyItem', ITEMS[id].price), () => net({ t: 'shop_buy', item: id }), P.money < ITEMS[id].price || n >= 10);
    }
  }
  $('storeT').textContent = { gas: t('gasT'), tech: t('techT'), shop: t('shop24'), kiosk: t('kiosk') }[storeKind];
  $('storeList').innerHTML = rows.map((r, i) => `<div class="srow"><div><b>${r.title}</b><small>${r.sub}</small></div><button data-r="${i}" ${r.dis ? 'disabled' : ''}>${r.btn}</button></div>`).join('');
  $('storeList').querySelectorAll('[data-r]').forEach(b => b.onclick = () => rows[+b.dataset.r].on?.());
}
function openInv() { closeModals(); $('invM').classList.remove('hide'); renderInv(); }
function renderInv() {
  if ($('invM').classList.contains('hide') || !me.profile) return;
  const inv = me.profile.inv || {}, ids = Object.keys(ITEMS).filter(id => inv[id] > 0);
  $('invList').innerHTML = ids.length ? ids.map(id => `<div class="srow"><div><b>${t('it')[id][0]} × ${inv[id]}</b><small>${t('it')[id][1]}</small></div><button data-use="${id}">${t('use')}</button></div>`).join('') : `<div class="srow"><small>${t('invEmpty')}</small></div>`;
  $('invList').querySelectorAll('[data-use]').forEach(b => b.onclick = () => net({ t: 'use', item: b.dataset.use }));
}
// бензин и состояние машины — рядом со спидометром
function updateCarStat() {
  $('fuelF').style.width = clamp(me.fuel, 0, 100) + '%'; $('fuelF').classList.toggle('low', me.fuel < 15);
  $('chpF').style.width = clamp(me.chp, 0, 100) + '%'; $('chpF').classList.toggle('low', me.chp < 35);
}
const shopOpen = () => !$('shop').classList.contains('hide') || !$('wardrobe').classList.contains('hide');

// ---------- магазин одежды ----------
const wd = { look: null };
const ITEM_NAMES = () => T[lang].items;
function openWardrobe() {
  closeModals();
  wd.look = { ...me.profile.look };
  $('wardrobe').classList.remove('hide'); $('hud').classList.add('hide');
  renderWardrobe(true);
}
// вещи из примеряемого вида, которые ещё не куплены
const unpaid = l => [['outfit', l.outfit], ['head', l.head], ...(l.glasses ? [['extra', 'glasses']] : [])].filter(([k, id]) => !owns(me.profile.wardrobe, k, id));
function renderWardrobe(rebuild = true) {
  if (!wd.look || $('wardrobe').classList.contains('hide')) return;
  const L = wd.look, P = me.profile, N = ITEM_NAMES();
  const price = (k, id) => CLOTHES[k][id] ? (owns(P.wardrobe, k, id) ? '✓' : '$' + CLOTHES[k][id].toLocaleString('en-US')) : '';
  if (rebuild) showroom.setChar(createChar({ ...L, skin: P.skin }), (ch, dt) => animChar(ch, 0, false, dt, performance.now() / 1000));
  $('wdList').innerHTML = OUTFITS.map(id => `<button class="carc ${id === L.outfit ? 'cur' : ''}" data-of="${id}"><b>${N[id]}</b><small>${price('outfit', id) || '✓'}</small></button>`).join('');
  $('wdList').querySelectorAll('[data-of]').forEach(b => b.onclick = () => {
    L.outfit = b.dataset.of;
    // белый костюм или спортивка смотрятся странно — сразу предлагаем тёмный цвет
    if ((L.outfit === 'suit' || L.outfit === 'sport') && L.cloth === CLOTH_COLORS[0]) L.cloth = L.outfit === 'suit' ? '#2c3850' : '#8c1f24';
    renderWardrobe();
  });
  $('wdName').textContent = N[L.outfit];
  $('wdHeads').innerHTML = HEADS.map(id => `<button class="chip ${id === L.head ? 'on' : ''}" data-hd="${id}">${N[id]}<small>${price('head', id)}</small></button>`).join('');
  $('wdHeads').querySelectorAll('[data-hd]').forEach(b => b.onclick = () => { L.head = b.dataset.hd; renderWardrobe(); });
  $('wdColors').innerHTML = CLOTH_COLORS.map(c => `<button style="background:${c}" class="${L.cloth === c ? 'on' : ''}" data-cc="${c}" aria-label="${c}"></button>`).join('');
  $('wdColors').querySelectorAll('[data-cc]').forEach(b => b.onclick = () => { L.cloth = b.dataset.cc; renderWardrobe(); });
  $('wdBeard').textContent = t('beard'); $('wdBeard').classList.toggle('on', L.beard);
  $('wdBeard').onclick = () => { L.beard = !L.beard; renderWardrobe(); };
  $('wdGlasses').innerHTML = `${t('glasses')}<small>${price('extra', 'glasses')}</small>`; $('wdGlasses').classList.toggle('on', L.glasses);
  $('wdGlasses').onclick = () => { L.glasses = !L.glasses; renderWardrobe(); };
  const due = unpaid(L), total = due.reduce((s, [k, id]) => s + CLOTHES[k][id], 0), btn = $('wdBtn');
  $('wdPrice').textContent = total ? '$' + total.toLocaleString('en-US') : '';
  if (total) { btn.textContent = t('buyFor', total.toLocaleString('en-US')); btn.disabled = P.money < total; btn.onclick = () => due.forEach(([kind, id]) => net({ t: 'cloth_buy', kind, id })); }
  else { const same = sameLook({ ...L, skin: P.skin }, myLook()); btn.textContent = same ? t('wearing') : t('wear'); btn.disabled = same; btn.onclick = () => net({ t: 'wear', look: L }); }
}
// салон: машина и цвет, которые сейчас смотрит игрок (ещё не куплены)
const shopSel = { car: 'ghazal', color: COLORS[0] };
const MAXV = Math.max(...Object.values(CARS).map(c => c.max)), MAXA = Math.max(...Object.values(CARS).map(c => c.accel));
function renderShop() {
  if (!me.profile || !showroom) return;
  const P = me.profile, id = shopSel.car, c = CARS[id], own = P.cars.includes(id), cur = P.car === id && P.color === shopSel.color;
  const here = CAR_TIER[id] === shopTier; // эту машину продаёт именно этот салон
  showroom.setCar(id, shopSel.color);
  $('shop').querySelector('.shTop span').textContent = t('tiers')[shopTier];
  // в списке — машины этого класса и свои (чтобы пересесть или перекрасить)
  $('carList').innerHTML = Object.entries(CARS).filter(([k]) => CAR_TIER[k] === shopTier || P.cars.includes(k)).map(([k, v]) =>
    `<button class="carc ${k === id ? 'cur' : ''}" data-car="${k}"><b>${v.ar}</b><small>${P.cars.includes(k) ? '✓ ' + t('owned') : v.price ? '$' + v.price.toLocaleString('en-US') : '—'}</small></button>`).join('');
  $('carList').querySelectorAll('[data-car]').forEach(b => b.onclick = () => { shopSel.car = b.dataset.car; renderShop(); });
  $('shName').textContent = c.ar;
  $('shSub').textContent = lang === 'ru' ? c.ru : '';
  $('shPrice').textContent = own ? '✓ ' + t('owned') : c.price ? '$' + c.price.toLocaleString('en-US') : '—';
  $('shSpeed').style.width = (c.max / MAXV * 100) + '%'; $('shSpeedV').textContent = Math.round(c.max * 3.6) + ' ' + t('kmh');
  $('shAcc').style.width = (c.accel / MAXA * 100) + '%';
  $('swatches').innerHTML = COLORS.map(k => `<button style="background:${k}" class="${shopSel.color === k ? 'on' : ''}" data-col="${k}" aria-label="${k}"></button>`).join('');
  $('swatches').querySelectorAll('[data-col]').forEach(b => b.onclick = () => { shopSel.color = b.dataset.col; renderShop(); });
  const buy = $('shBuy');
  if (own) { buy.textContent = cur ? t('driving') : t('select'); buy.disabled = cur; buy.onclick = () => net({ t: 'select', car: id, color: shopSel.color }); }
  else if (!here) { buy.textContent = t('soldIn', CAR_TIER[id]); buy.disabled = true; }
  else { buy.textContent = t('buy'); buy.disabled = P.money < c.price; buy.onclick = () => net({ t: 'buy', car: id, color: shopSel.color }); }
  const tb = $('shTest'); tb.classList.toggle('hide', own || !here); tb.onclick = () => net({ t: 'test', car: id, color: shopSel.color });
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
  for (const c of CITIES) {
    const P = cityPoints(c);
    dot(P.office, '#ffcc33'); dot(P.showroomLow, '#7fd1ff'); dot(P.showroom, '#3fa9ff'); dot(P.showroomHigh, '#f0b429');
    dot(P.clothes, '#c77dff'); dot(P.wh, '#c48a4a'); dot(P.shop, '#34c759'); dot(P.tech, '#ff9f0a');
  }
  GAS_SPOTS.forEach(p => dot(p, '#ff3b30'));
  KIOSKS.forEach(p => dot(p, '#ffd60a'));
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
  drawRoute(g, 1, zoom);
  const tg = routeTarget();
  if (tg) { const [jx, jy] = toMap(...tg); g.fillStyle = '#36e27a'; g.strokeStyle = '#000'; g.lineWidth = 3 / zoom; g.beginPath(); g.arc(jx, jy, 10 / zoom, 0, 7); g.fill(); g.stroke(); }
  for (const o of others.values()) { const [ox, oy] = toMap(o.mode ? o.c.cx : o.c.x, o.mode ? o.c.cz : o.c.z); g.fillStyle = '#ff4d4d'; g.strokeStyle = '#000'; g.lineWidth = 2 / zoom; g.beginPath(); g.arc(ox, oy, 7 / zoom, 0, 7); g.fill(); g.stroke(); }
  if (me.mode === 'foot') { const [cx2, cy2] = toMap(car.x, car.z); g.fillStyle = '#7fd1ff'; g.fillRect(cx2 - 6 / zoom, cy2 - 4 / zoom, 12 / zoom, 8 / zoom); }
  g.restore();
  // север
  const na = rot; g.fillStyle = '#fff'; g.font = '900 26px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', R + Math.sin(na + Math.PI) * (R - 18), R - Math.cos(na + Math.PI) * (R - 18));
  if (tg) {
    const dx = tg[0] - x, dz = tg[1] - z;
    if (Math.hypot(dx, dz) > viewR) { const a = mapAngle(Math.atan2(dx, dz)) + rot; drawArrow(g, R + Math.sin(a) * (R - 16), R - Math.cos(a) * (R - 16), a, '#36e27a', 12); }
  }
  drawArrow(g, R, R, mapAngle(ry) + rot, '#fff', 15);
}
// линия GPS (k — масштаб холста, zoom — во сколько раз увеличен радар)
function drawRoute(g, k, zoom) {
  if (!route || route.pts.length < 2) return;
  g.save(); g.lineJoin = g.lineCap = 'round';
  for (const [w, col] of [[9, 'rgba(0,0,0,.55)'], [5.5, '#b04dff']]) {
    g.strokeStyle = col; g.lineWidth = w / zoom; g.beginPath();
    route.pts.forEach((p, i) => { const [px, py] = toMap(...p); i ? g.lineTo(px * k, py * k) : g.moveTo(px * k, py * k); });
    g.stroke();
  }
  g.restore();
}
function drawBigMap() {
  const c = $('bigmap'), g = c.getContext('2d'), W = c.width, k = W / MAPPX;
  g.drawImage(mapCanvas, 0, 0, W, W);
  drawRoute(g, k, 0.8);
  g.textAlign = 'center'; g.font = '900 30px Cairo, sans-serif'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.7)'; g.fillStyle = '#fff';
  for (const ct of CITIES) { const [x, y] = toMap(ct.x, ct.z), ty = y * k - ct.r / (HALF * 2) * W - 14; g.strokeText(cityName(ct.id), x * k, ty); g.fillText(cityName(ct.id), x * k, ty); }
  { const tg = routeTarget(); if (tg) { const [x, y] = toMap(...tg); g.fillStyle = '#36e27a'; g.beginPath(); g.arc(x * k, y * k, 10, 0, 7); g.fill(); } }
  for (const o of others.values()) { const [x, y] = toMap(o.mode ? o.c.cx : o.c.x, o.mode ? o.c.cz : o.c.z); g.fillStyle = '#ff4d4d'; g.beginPath(); g.arc(x * k, y * k, 6, 0, 7); g.fill(); }
  const [x, z, ry] = activePos(), [mx, my] = toMap(x, z); drawArrow(g, mx * k, my * k, mapAngle(ry), '#fff', 16);
  const here = nearestCity(me.x, me.z), poor = me.profile.money < TP_PRICE || !!me.test;
  $('tps').innerHTML = CITIES.map(ct => `<button data-tp="${ct.id}" ${poor || (here.inside && here.city.id === ct.id) ? 'disabled' : ''}>${t('tp', cityName(ct.id))}</button>`).join('');
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
const SKY = { dayT: new THREE.Color('#2f78cf'), dayH: new THREE.Color('#cfe0ea'), duskT: new THREE.Color('#34477e'), duskH: new THREE.Color('#f2a15b'), nightT: new THREE.Color('#040814'), nightH: new THREE.Color('#151d33') };
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
  const tx = inCar ? car.x : me.x, ty = inCar ? car.y + 1.6 : (me.visY ?? me.y) + 1.55, tz = inCar ? car.z : me.z;
  if (inCar && now - cam.dragT > 1300) {
    cam.yaw = lerpAng(cam.yaw, car.ry + (car.speed < -2 ? Math.PI : 0), Math.min(1, dt * 2.8));
    cam.pitch += (0.2 - cam.pitch) * Math.min(1, dt * 2);
  }
  // пешком на бегу камера сама плавно заходит за спину (если не бежишь прямо на неё)
  if (!inCar && me.spd > 1.5 && now - cam.dragT > 1200) {
    const diff = Math.atan2(Math.sin(me.ry - cam.yaw), Math.cos(me.ry - cam.yaw));
    if (Math.abs(diff) < 2.3) cam.yaw = lerpAng(cam.yaw, me.ry, Math.min(1, dt * (me.spd > 6 ? 1.6 : 0.9)));
    cam.pitch += (0.22 - cam.pitch) * Math.min(1, dt * 0.8);
  }
  const dist = inCar ? [8.5, 13, 5.5][cam.mode] : [4.2, 6.5, 2.6][cam.mode] + Math.max(0, me.spd - 5) * 0.25;
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
let last = performance.now(), frame = 0, nearMk = null, nearCustomer = false, lastCity = null;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; frame++;
  if (!me.profile || !car.mesh) { renderer.render(scene, camera); return; }
  if (shopOpen()) { updateSound(false, 0, 0, night, false); showroom.render(renderer, dt); return; } // город закрыт окном салона
  const inCar = me.mode === 'car';

  if (!me.dead) { if (inCar) updateCar(dt, true); else { updateFoot(dt); if (car.speed !== 0) updateCar(dt, false); } }
  placeCar(car.mesh, car.x, car.z, car.ry);
  animateCar(car.mesh, car.speed, -car.steer * 1.3, dt, car.braking, night);
  if (inCar) { me.x = car.x; me.z = car.z; me.y = car.y; }
  me.char.rotation.order = 'YXZ';
  if (inCar || me.dead) { me.char.position.set(me.x, me.y, me.z); me.char.rotation.set(0, me.ry, 0); }
  else { me.char.position.set(me.x, me.visY ?? me.y, me.z); me.char.rotation.set(me.lean, me.ry, me.roll); }
  animChar(me.char, me.spd, !me.onGround, dt, now / 1000, me.dead);
  // коробка в руках: у грузчика и у доставщика, пока идёт пешком
  const carry = !inCar && !me.dead && (!!me.load || !!me.job);
  if (carry && carried.parent !== me.char) me.char.add(carried);
  carried.visible = carry;
  if (customer.char) animChar(customer.char, 0, false, dt, now / 1000);

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
    if (!o.mode) { o.char.position.set(c.x, c.y, c.z); o.char.rotation.y = c.ry; animChar(o.char, Math.abs(tg.s), !!tg.a, dt, now / 1000); }
    const lx = o.mode ? c.cx : c.x, lz = o.mode ? c.cz : c.z;
    o.label.position.set(lx, (o.mode ? o.car.position.y + 2.6 : c.y + 2.25), lz);
    { const dl = Math.hypot(lx - camera.position.x, lz - camera.position.z); o.label.visible = dl < 120 && dl > 3; }
  }

  updateCam(dt, now);
  const [ax, az] = activePos();
  updateSky(ax, az);
  if (world.flag) world.flag.rotation.y = Math.sin(now / 900) * 0.12;

  // детали рядом (LOD)
  // на «низкой» графике мелочь видна ближе: телефон не тянет все детали большого города
  if (frame % 15 === 0) { const R = quality === 'high' ? 700 : 260; for (const l of world.lod) l.m.visible = Math.hypot(l.x - camera.position.x, l.z - camera.position.z) < (l.far ? R + 700 : R + 280); world.updateScatter(camera.position.x, camera.position.z, quality === 'high' ? 1800 : 700); }

  // маркеры, действия
  if (frame % 5 === 0) {
    nearMk = null;
    for (const mk of world.markers) if (Math.hypot(mk.x - ax, mk.z - az) < (inCar ? 7 : 4)) nearMk = mk;
    nearCustomer = !!customer.char && !inCar && Math.hypot(customer.x - me.x, customer.z - me.z) < 3.5;
    let nearDrop = false;
    if (me.load) { const P = cityPoints(CITY[me.load.city]); nearDrop = !inCar && Math.hypot(P.whDrop.x - me.x, P.whDrop.z - me.z) < 4.5; }
    const act = $('action'); let label = null;
    if (nearCustomer) label = t('handOver');
    else if (nearDrop) label = t('putLoad');
    else if (nearMk?.kind === 'office' && !me.job && !me.test) label = t('takeJob');
    else if (nearMk?.kind === 'wh' && !me.load && !inCar && !me.test) label = t('takeLoad');
    else if (SHOWROOMS.includes(nearMk?.kind) && !me.test) label = t('tiers')[SHOWROOMS.indexOf(nearMk.kind)];
    else if (nearMk?.kind === 'clothes' && !inCar && !me.test) label = t('openClothes');
    else if (nearMk?.kind === 'tech' && !me.test) label = t('openTech');
    else if (nearMk?.kind === 'shop' && !inCar) label = t('openShop24');
    else if ((nearMk?.kind === 'kiosk' || nearMk?.kind === 'food') && !inCar) label = t('openKiosk');
    else if (!me.test) { // колонки на заправке: можно подъехать прямо на машине
      if (GAS_SPOTS.some(g => Math.hypot(g.x - ax, g.z - az) < (inCar ? 10 : 6))) label = t('openGas');
    }
    if (!label && !inCar && !me.load && Math.hypot(car.x - me.x, car.z - me.z) < 3.6) label = t('enterCar');
    if (label) { if (act.textContent !== label) act.textContent = label; act.classList.remove('hide'); } else act.classList.add('hide');
  }
  // маркеры видно только вблизи (дальние показывает радар) — так меньше нагрузка на телефон
  { const mr = quality === 'high' ? 260 : 90; for (const mk of world.markers) { const v = Math.abs(mk.x - camera.position.x) < mr && Math.abs(mk.z - camera.position.z) < mr; mk.obj.visible = v; if (v) { const sp = mk.obj.children[0]; sp.rotation.y += dt * 1.6; sp.position.y = Math.sin(now / 420 + mk.x) * 0.12; } } }
  if (frame % 5 === 0) { const sb = $('stamBar'); sb.classList.toggle('hide', me.stam > 99 || inCar); $('stamF').style.width = me.stam + '%'; $('stamF').classList.toggle('tired', me.tired); }
  const tg = routeTarget();
  if (tg) {
    const d = Math.hypot(tg[0] - ax, tg[1] - az);
    const dist = d > 1000 ? (d / 1000).toFixed(1) + ' ' + t('km') : Math.round(d) + ' ' + t('m');
    if (me.job) {
      $('jobT').textContent = d < 40 && inCar ? t('jobHint') : t('job', cityName(me.job.city));
      $('jobS').textContent = t('jobInfo', me.job.pay, dist);
    } else { $('jobT').textContent = t('loadT'); $('jobS').textContent = t('loadInfo', LOAD_PAY); }
    beam.rotation.y += dt;
    if (frame % 10 === 0) updateRoute(ax, az, now);
  } else route = null;
  if (me.test) { const s = Math.max(0, Math.ceil((testEndAt - now) / 1000)); const txt = t('testLeft', s); if ($('testT').textContent !== txt) $('testT').textContent = txt; }
  updateSound(inCar && !me.dead, car.speed, inCar ? Math.max(input.gas, (input.keys.KeyW || input.keys.ArrowUp) ? 1 : 0) : 0, night > 0.5, cityMask(ax, az) < 0.3);
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
  if ($('action').classList.contains('hide')) { if (me.mode === 'foot') toggleCar(); return; }
  const label = $('action').textContent;
  if (label === t('handOver')) return net({ t: 'job_done' });
  if (label === t('putLoad')) return net({ t: 'load_put' });
  if (label === t('takeJob')) return net({ t: 'job_take', city: nearMk.city });
  if (label === t('takeLoad')) return net({ t: 'load_take', city: nearMk.city });
  if (t('tiers').includes(label)) { shopTier = t('tiers').indexOf(label); return toggleModal('shop'); }
  if (label === t('openTech')) return openStore('tech');
  if (label === t('openShop24')) return openStore('shop');
  if (label === t('openKiosk')) return openStore('kiosk');
  if (label === t('openGas')) return openStore('gas');
  if (label === t('openClothes')) return openWardrobe();
  if (label === t('eat', FOOD_PRICE)) return net({ t: 'eat' });
  if (me.mode === 'foot') toggleCar();
};
Object.assign(window.__ar, { shopSel, renderShop, routeInfo: () => route && { n: route.pts.length } });
