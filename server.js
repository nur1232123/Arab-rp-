// Игровой сервер Arab RP: раздаёт клиент и держит мультиплеер (WebSocket).
// Сервер — источник правды: деньги, машины, здоровье и сытость считает только он.
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  CITIES, CITY, CARS, COLORS, SKINS, LIMIT, FOOD_PRICE, FOOD_SPOTS, TP_PRICE, LOAD_PAY, TEST_MS, SHOWROOM_R, CLOTHES,
  CAR_TIER, SHOWROOMS, GAS_SPOTS, KIOSKS, FUEL_PRICE, REPAIR_PRICE, TUNE_PRICES, ITEMS, ITEM_MAX, SHOP_ITEMS, KIOSK_ITEMS,
  cityPoints, streetPoint, nearestCity, cleanLook, owns, tuned, fuelUse,
} from './public/shared/world.js';
import { loadAll, save, usingDb } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'profiles.json');
const START_MONEY = 1500;
const TICK_MS = 100;
const FOOT_MAX = 9;
const HUNGER_EVERY = 40;   // сытость −1 каждые 40 с
const HP_EVERY = 4;        // здоровье меняется каждые 4 с
const RESPAWN_MS = 3000;

const app = express();
app.use('/lib', express.static(path.join(__dirname, 'node_modules/three/build'), { maxAge: '7d' }));
app.use('/jsm', express.static(path.join(__dirname, 'node_modules/three/examples/jsm'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));
app.get('/health', (_req, res) => res.json({ ok: true, online: players.size, db: usingDb }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

// ---------- профили ----------
let profiles = {};
const dirty = new Set();
const touch = token => dirty.add(token);
let saving = null;
async function flush() {
  if (saving) await saving;
  if (!dirty.size) return;
  const batch = new Set(dirty); dirty.clear();
  saving = save(DATA_FILE, profiles, batch)
    .catch(e => { console.error('save failed:', e.message); for (const t of batch) dirty.add(t); })
    .finally(() => { saving = null; });
  await saving;
}
setInterval(flush, 10000);

const pub = p => ({ name: p.name, money: p.money, cars: p.cars, car: p.car, color: p.color, skin: p.skin, hp: p.hp, hunger: p.hunger, look: p.look, wardrobe: p.wardrobe, fuels: p.fuels, chp: p.chp, tune: p.tune, inv: p.inv });
// бензин и здоровье машины: если записи ещё нет — полный бак и целая машина
const fuelOf = (p, car = p.car) => p.fuels[car] ?? 100;
const chpOf = (p, car = p.car) => p.chp[car] ?? 100;
const veh = q => { const p = q.prof; q.vehSent = [Math.round(fuelOf(p)), Math.round(chpOf(p))]; send(q.ws, { t: 'veh', fuel: q.vehSent[0], chp: q.vehSent[1] }); };
const lookOf = q => ({ ...q.prof.look, skin: q.prof.skin });
const look = q => ({ id: q.id, name: q.prof.name, car: carOf(q), color: colorOf(q), look: lookOf(q), mode: q.mode, x: q.x, y: q.y, z: q.z, ry: q.ry, cx: q.cx, cy: q.cy, cz: q.cz, cry: q.cry });
const carOf = q => q.test?.car || q.prof.car;
const colorOf = q => q.test?.color || q.prof.color;

const players = new Map();
let nextId = 1;
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (msg, except) => { const s = JSON.stringify(msg); for (const p of players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s); };
const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) || 'لاعب';
const num = v => (Number.isFinite(+v) ? +v : 0);
const near = (q, p, r) => Math.hypot(q.x - p.x, q.z - p.z) < r;
// автосалон рядом: tier — какого класса (undefined — любой); возвращает { c, tier }
function nearShowroom(q, tier) {
  for (const c of CITIES) for (let k = 0; k < 3; k++) if ((tier === undefined || tier === k) && near(q, cityPoints(c)[SHOWROOMS[k]], SHOWROOM_R)) return { c, tier: k };
  return null;
}
const nearPoint = (q, key, r = SHOWROOM_R) => CITIES.find(c => near(q, cityPoints(c)[key], r));
const nearClothes = q => nearPoint(q, 'clothes');
const nearGas = q => GAS_SPOTS.some(g => near(q, g, 12));
const nearKiosk = q => KIOSKS.some(k => near(q, k, 6)) || FOOD_SPOTS.some(f => near(q, f, 10));
const carNearMe = q => q.mode === 1 || Math.hypot(q.cx - q.x, q.cz - q.z) < 7;
// вид можно надеть, только если все вещи куплены
const canWear = (p, l) => owns(p.wardrobe, 'outfit', l.outfit) && owns(p.wardrobe, 'head', l.head) && (!l.glasses || owns(p.wardrobe, 'extra', 'glasses'));
const vit = q => send(q.ws, { t: 'vit', hp: Math.round(q.prof.hp), hunger: Math.round(q.prof.hunger) });
const place = (q, x, z) => { q.x = x; q.z = z; q.cx = x - 6; q.cz = z - 3; q.mode = 0; q.tpUntil = Date.now() + 4000; };

function endTest(q, silent) {
  if (!q.test) return;
  const sr = cityPoints(CITY[q.test.city])[SHOWROOMS[q.test.tier]];
  q.test = null;
  place(q, sr.x, sr.z);
  if (!silent) {
    send(q.ws, { t: 'test_end', x: sr.x, z: sr.z });
    broadcast({ t: 'look', id: q.id, car: carOf(q), color: colorOf(q) }, q);
  }
}

function kill(q) {
  q.dead = true; q.job = null; q.load = null; endTest(q, false);
  send(q.ws, { t: 'dead' });
  setTimeout(() => {
    if (!players.has(q.id)) return;
    const nc = nearestCity(q.x, q.z).city, sp = cityPoints(nc).spawn;
    q.prof.money = Math.max(0, q.prof.money - 100); q.prof.hp = 100; q.prof.hunger = Math.max(q.prof.hunger, 40);
    q.dead = false; place(q, sp.x, sp.z); touch(q.token);
    send(q.ws, { t: 'respawn', x: sp.x, z: sp.z, profile: pub(q.prof) });
  }, RESPAWN_MS);
}

wss.on('connection', ws => {
  let me = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!me) {
      if (m.t !== 'hello') return;
      let token = typeof m.token === 'string' && profiles[m.token] ? m.token : null;
      if (!token) { // новый персонаж: внешность выбирается один раз, только из бесплатных вещей
        token = crypto.randomBytes(16).toString('hex');
        const l = cleanLook(m.look || { outfit: m.outfit });
        profiles[token] = { name: cleanName(m.name), money: START_MONEY, cars: ['ghazal'], car: 'ghazal', color: COLORS[0], city: 'riyadh', wardrobe: [], look: { ...l, glasses: false }, skin: SKINS.includes(m.skin) ? m.skin : SKINS[1] };
        if (!canWear(profiles[token], profiles[token].look)) profiles[token].look = cleanLook({});
      }
      const prof = profiles[token];
      if (m.name) prof.name = cleanName(m.name);
      // старые профили: поле outfit ('thobe_red' и т.п.) превращаем в новый вид
      if (!prof.look) { prof.look = cleanLook({ outfit: prof.outfit }); delete prof.outfit; }
      prof.wardrobe ||= []; prof.fuels ||= {}; prof.chp ||= {}; prof.tune ||= {}; prof.inv ||= {};
      prof.skin ||= SKINS[1]; prof.hp ??= 100; prof.hunger ??= 100;
      if (prof.hp <= 0) prof.hp = 100;
      touch(token);
      // тот же игрок зашёл с другого устройства — старое отключаем и просим не переподключаться
      for (const p of players.values()) if (p.token === token) { send(p.ws, { t: 'kicked' }); p.ws.close(); }
      const sp = cityPoints(CITY[prof.city] || CITY.riyadh).spawn;
      me = { ws, id: nextId++, token, prof, mode: 0, x: sp.x, y: 0, z: sp.z, ry: Math.PI, s: 0, a: 0, cx: sp.x - 6, cy: 0, cz: sp.z - 3, cry: Math.PI, lastT: Date.now(), job: null, load: null, test: null, dead: false, chatT: 0, tpUntil: Date.now() + 4000, hungerT: 0, hpT: 0 };
      players.set(me.id, me);
      send(ws, { t: 'welcome', id: me.id, token, now: Date.now(), profile: pub(prof), spawn: sp, players: [...players.values()].filter(p => p !== me).map(look) });
      broadcast({ t: 'join', ...look(me) }, me);
      veh(me);
      return;
    }
    if (me.dead && m.t !== 'chat') return;

    switch (m.t) {
      case 'st': {
        const mode = m.m === 1 ? 1 : 0;
        const x = num(m.x), y = num(m.y), z = num(m.z);
        const now = Date.now(), dt = Math.max(0.05, (now - me.lastT) / 1000);
        const vmax = mode ? tuned(carOf(me), me.test ? 0 : me.prof.tune[carOf(me)] || 0).max * 1.5 + 8 : FOOT_MAX * 1.5 + 4;
        // при пересадке в машину позиция прыгает к машине — разрешаем, если рядом с ней
        const switched = mode !== me.mode && Math.hypot(x - me.cx, z - me.cz) < 8;
        if (!process.env.NO_ANTICHEAT && now > me.tpUntil && !switched && Math.hypot(x - me.x, z - me.z) > vmax * dt + 6) { send(ws, { t: 'fix', x: me.x, z: me.z }); me.lastT = now; return; }
        // бензин считает сервер: по пройденному на своей машине пути
        if (mode === 1 && me.mode === 1 && !me.test) {
          const d = Math.min(Math.hypot(x - me.x, z - me.z), vmax * dt), car = me.prof.car;
          if (d > 0.01) {
            me.prof.fuels[car] = Math.max(0, fuelOf(me.prof) - d * fuelUse(car));
            if (!me.vehSent || Math.abs(me.vehSent[0] - me.prof.fuels[car]) >= 1) { touch(me.token); veh(me); }
          }
        }
        me.mode = mode; me.x = Math.max(-LIMIT, Math.min(LIMIT, x)); me.y = y; me.z = Math.max(-LIMIT, Math.min(LIMIT, z));
        me.ry = num(m.ry); me.s = num(m.s); me.a = m.a ? 1 : 0;
        me.cx = num(m.cx); me.cy = num(m.cy); me.cz = num(m.cz); me.cry = num(m.cry);
        me.lastT = now;
        break;
      }
      case 'dmg': { // урон от падения или аварии: клиент может только отнять здоровье, не прибавить
        const n = Math.max(0, Math.min(100, num(m.n)));
        if (!n) return;
        me.prof.hp = Math.max(0, me.prof.hp - n); touch(me.token); vit(me);
        if (me.prof.hp <= 0) kill(me);
        break;
      }
      case 'chat': {
        const now = Date.now(); if (now - me.chatT < 800) return; me.chatT = now;
        const text = String(m.m || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);
        if (text) broadcast({ t: 'chat', id: me.id, name: me.prof.name, m: text });
        break;
      }
      case 'tp': { // такси в другой город — платно, заказ отменяется
        const c = CITY[m.city]; if (!c || me.test) return;
        if (me.prof.money < TP_PRICE) return send(ws, { t: 'err', code: 'money' });
        me.prof.money -= TP_PRICE; me.job = null; me.load = null;
        const sp = cityPoints(c).spawn;
        place(me, sp.x, sp.z); me.prof.city = c.id; touch(me.token);
        send(ws, { t: 'tp', x: sp.x, z: sp.z, profile: pub(me.prof) });
        break;
      }
      // ----- машина: поломки, АЗС, техцентр -----
      case 'cdmg': { // удар машины: клиент может только сломать, не починить
        if (me.test) return;
        const n = Math.max(0, Math.min(100, num(m.n))); if (!n) return;
        const car = me.prof.car; me.prof.chp[car] = Math.max(0, chpOf(me.prof) - n); touch(me.token); veh(me);
        break;
      }
      case 'refuel': {
        if (!nearGas(me)) return send(ws, { t: 'err', code: 'far' });
        const car = me.prof.car, need = 100 - fuelOf(me.prof);
        const amount = Math.min(need, Math.floor(me.prof.money / FUEL_PRICE));
        if (need < 1) return send(ws, { t: 'err', code: 'full' });
        if (amount < 1) return send(ws, { t: 'err', code: 'money' });
        const cost = Math.ceil(amount * FUEL_PRICE);
        me.prof.money -= cost; me.prof.fuels[car] = fuelOf(me.prof) + amount; touch(me.token);
        send(ws, { t: 'paid', what: 'fuel', cost, profile: pub(me.prof) }); veh(me);
        break;
      }
      case 'repair': {
        if (!nearPoint(me, 'tech')) return send(ws, { t: 'err', code: 'far' });
        const car = me.prof.car, need = 100 - chpOf(me.prof);
        if (need < 1) return send(ws, { t: 'err', code: 'full' });
        const amount = Math.min(need, Math.floor(me.prof.money / REPAIR_PRICE));
        if (amount < 1) return send(ws, { t: 'err', code: 'money' });
        const cost = Math.ceil(amount * REPAIR_PRICE);
        me.prof.money -= cost; me.prof.chp[car] = chpOf(me.prof) + amount; touch(me.token);
        send(ws, { t: 'paid', what: 'repair', cost, profile: pub(me.prof) }); veh(me);
        break;
      }
      case 'tune': {
        if (!nearPoint(me, 'tech')) return send(ws, { t: 'err', code: 'far' });
        const car = me.prof.car, lvl = me.prof.tune[car] || 0;
        if (lvl >= TUNE_PRICES.length) return send(ws, { t: 'err', code: 'full' });
        if (me.prof.money < TUNE_PRICES[lvl]) return send(ws, { t: 'err', code: 'money' });
        me.prof.money -= TUNE_PRICES[lvl]; me.prof.tune[car] = lvl + 1; touch(me.token);
        send(ws, { t: 'paid', what: 'tune', cost: TUNE_PRICES[lvl], profile: pub(me.prof) });
        break;
      }
      // ----- магазин 24/7, ларьки, инвентарь -----
      case 'shop_buy': {
        const it = ITEMS[m.item]; if (!it) return;
        const inShop = nearPoint(me, 'shop'), inKiosk = nearKiosk(me);
        if (!(inShop && SHOP_ITEMS.includes(m.item)) && !(inKiosk && KIOSK_ITEMS.includes(m.item))) return send(ws, { t: 'err', code: 'far' });
        if ((me.prof.inv[m.item] || 0) >= ITEM_MAX) return send(ws, { t: 'err', code: 'full' });
        if (me.prof.money < it.price) return send(ws, { t: 'err', code: 'money' });
        me.prof.money -= it.price; me.prof.inv[m.item] = (me.prof.inv[m.item] || 0) + 1; touch(me.token);
        send(ws, { t: 'paid', what: 'item', cost: it.price, profile: pub(me.prof) });
        break;
      }
      case 'use': {
        const it = ITEMS[m.item], P = me.prof; if (!it || !(P.inv[m.item] > 0)) return;
        if ((it.fuel || it.chp) && (!carNearMe(me) || me.test)) return send(ws, { t: 'err', code: 'nocar' });
        if (it.food) P.hunger = Math.min(100, P.hunger + it.food);
        if (it.hp) P.hp = Math.min(100, P.hp + it.hp);
        if (it.fuel) P.fuels[P.car] = Math.min(100, fuelOf(P) + it.fuel);
        if (it.chp) P.chp[P.car] = Math.min(100, chpOf(P) + it.chp);
        P.inv[m.item]--; touch(me.token);
        send(ws, { t: 'used', item: m.item, profile: pub(P) }); vit(me); veh(me);
        break;
      }
      case 'eat': {
        if (!nearKiosk(me)) return send(ws, { t: 'err', code: 'far' });
        if (me.prof.money < FOOD_PRICE) return send(ws, { t: 'err', code: 'money' });
        me.prof.money -= FOOD_PRICE; me.prof.hunger = Math.min(100, me.prof.hunger + 45); touch(me.token);
        send(ws, { t: 'ate', profile: pub(me.prof) });
        break;
      }
      // ----- доставка -----
      case 'job_take': {
        const c = CITY[m.city]; if (!c || me.test) return;
        const o = cityPoints(c).office;
        if (!near(me, o, 15)) return send(ws, { t: 'err', code: 'far' });
        me.load = null;
        const target = Math.random() < 0.6 ? c : CITIES.filter(k => k !== c)[Math.floor(Math.random() * (CITIES.length - 1))];
        const to = streetPoint(target.id);
        const dist = Math.hypot(to.x - o.x, to.z - o.z);
        const pay = Math.round((120 + dist * 0.3) / 10) * 10;
        me.job = { id: crypto.randomBytes(4).toString('hex'), city: target.id, x: to.x, z: to.z, pay, start: Date.now(), minMs: dist / 75 * 1000 };
        send(ws, { t: 'job', job: { id: me.job.id, city: target.id, x: to.x, z: to.z, pay } });
        break;
      }
      case 'job_done': {
        const j = me.job; if (!j) return;
        if (!near(me, j, 30)) return send(ws, { t: 'err', code: 'notyet' });
        me.job = null;
        if (Date.now() - j.start < j.minMs) return send(ws, { t: 'err', code: 'cheat' });
        me.prof.money += j.pay; touch(me.token);
        send(ws, { t: 'job_ok', pay: j.pay, profile: pub(me.prof) });
        break;
      }
      case 'job_cancel': me.job = null; break;
      // ----- грузчик на складе -----
      case 'load_take': {
        const c = CITY[m.city]; if (!c || me.mode || me.test) return;
        const P = cityPoints(c);
        if (!near(me, P.wh, 6)) return send(ws, { t: 'err', code: 'far' });
        me.job = null;
        me.load = { city: c.id, t: Date.now() };
        send(ws, { t: 'load', city: c.id });
        break;
      }
      case 'load_put': {
        const L = me.load; if (!L || me.mode) return;
        const P = cityPoints(CITY[L.city]);
        if (!near(me, P.whDrop, 6)) return send(ws, { t: 'err', code: 'far' });
        me.load = null;
        if (Date.now() - L.t < 2000) return send(ws, { t: 'err', code: 'cheat' }); // 22 м быстрее 2 с не донести
        me.prof.money += LOAD_PAY; touch(me.token);
        send(ws, { t: 'load_ok', pay: LOAD_PAY, profile: pub(me.prof) });
        break;
      }
      case 'load_cancel': me.load = null; break;
      // ----- автосалон -----
      case 'buy': {
        const car = CARS[m.car]; if (!car || me.prof.cars.includes(m.car)) return;
        if (!nearShowroom(me, CAR_TIER[m.car])) return send(ws, { t: 'err', code: 'far' }); // машину продаёт салон своего класса
        if (me.prof.money < car.price) return send(ws, { t: 'err', code: 'money' });
        me.prof.money -= car.price; me.prof.cars.push(m.car); me.prof.car = m.car;
        if (m.color && COLORS.includes(m.color)) me.prof.color = m.color;
        touch(me.token);
        send(ws, { t: 'bought', car: m.car, profile: pub(me.prof) }); veh(me);
        broadcast({ t: 'look', id: me.id, car: carOf(me), color: colorOf(me) }, me);
        break;
      }
      case 'select': {
        if (!nearShowroom(me) || me.test) return send(ws, { t: 'err', code: 'far' });
        if (m.car && me.prof.cars.includes(m.car)) me.prof.car = m.car;
        if (m.color && COLORS.includes(m.color)) me.prof.color = m.color;
        touch(me.token);
        send(ws, { t: 'profile', profile: pub(me.prof) }); veh(me);
        broadcast({ t: 'look', id: me.id, car: carOf(me), color: colorOf(me) }, me);
        break;
      }
      case 'test': { // тест-драйв на минуту
        const car = CARS[m.car], s = car && nearShowroom(me, CAR_TIER[m.car]);
        if (!s || me.test) return send(ws, { t: 'err', code: 'far' });
        me.job = null; me.load = null;
        const color = COLORS.includes(m.color) ? m.color : me.prof.color;
        me.test = { car: m.car, color, city: s.c.id, tier: s.tier, until: Date.now() + TEST_MS };
        me.tpUntil = Date.now() + 4000;
        send(ws, { t: 'test', car: m.car, color, ms: TEST_MS });
        broadcast({ t: 'look', id: me.id, car: carOf(me), color: colorOf(me) }, me);
        break;
      }
      case 'test_stop': endTest(me, false); break;
      // ----- магазин одежды -----
      case 'cloth_buy': { // { kind: 'outfit'|'head'|'extra', id }
        const price = CLOTHES[m.kind]?.[m.id];
        if (!price || owns(me.prof.wardrobe, m.kind, m.id)) return;
        if (!nearClothes(me)) return send(ws, { t: 'err', code: 'far' });
        if (me.prof.money < price) return send(ws, { t: 'err', code: 'money' });
        me.prof.money -= price; me.prof.wardrobe.push(m.kind + ':' + m.id); touch(me.token);
        send(ws, { t: 'cloth_ok', profile: pub(me.prof) });
        break;
      }
      case 'wear': {
        if (!nearClothes(me)) return send(ws, { t: 'err', code: 'far' });
        const l = cleanLook(m.look);
        if (!canWear(me.prof, l)) return send(ws, { t: 'err', code: 'notowned' });
        me.prof.look = l; touch(me.token);
        send(ws, { t: 'profile', profile: pub(me.prof) });
        broadcast({ t: 'look', id: me.id, car: carOf(me), color: colorOf(me), look: lookOf(me) }, me);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!me) return;
    if (me.test) endTest(me, true);
    players.delete(me.id);
    touch(me.token);
    broadcast({ t: 'leave', id: me.id });
  });
});

// снимки позиций для всех
setInterval(() => {
  if (players.size < 2) return;
  const r = v => Math.round(v * 100) / 100;
  const p = [...players.values()].map(q => [q.id, q.mode, r(q.x), r(q.y), r(q.z), r(q.ry), r(q.s), q.a, r(q.cx), r(q.cy), r(q.cz), r(q.cry)]);
  broadcast({ t: 'snap', p });
}, TICK_MS);

// голод, здоровье, конец тест-драйва — раз в секунду
setInterval(() => {
  const now = Date.now();
  for (const q of players.values()) {
    if (q.dead) continue;
    if (q.test && now > q.test.until) endTest(q, false);
    const P = q.prof; let changed = false;
    if (++q.hungerT >= HUNGER_EVERY) { q.hungerT = 0; if (P.hunger > 0) { P.hunger--; changed = true; } }
    if (++q.hpT >= HP_EVERY) {
      q.hpT = 0;
      if (P.hunger <= 0) { P.hp = Math.max(0, P.hp - 2); changed = true; }
      else if (P.hunger > 60 && P.hp < 100) { P.hp = Math.min(100, P.hp + 1); changed = true; }
    }
    if (changed) { touch(q.token); vit(q); if (P.hp <= 0) kill(q); }
  }
}, 1000);

setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
}, 20000);

// Render при деплое шлёт SIGTERM — успеваем сохранить профили
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { await flush(); process.exit(0); });

profiles = await loadAll(DATA_FILE);
console.log(`profiles: ${Object.keys(profiles).length} (${usingDb ? 'Supabase' : 'file'})`);
server.listen(PORT, () => console.log(`Arab RP server on :${PORT}`));
