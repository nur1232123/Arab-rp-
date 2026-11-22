// Игровой сервер Arab RP: раздаёт клиент и держит мультиплеер (WebSocket).
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CITIES, CITY, CARS, COLORS, OUTFITS, SKINS, LIMIT, FOOD_PRICE, FOOD_SPOTS, cityPoints, streetPoint, nearestCity } from './public/shared/world.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'profiles.json');
const START_MONEY = 1500;
const TICK_MS = 100;
const FOOT_MAX = 9;

const app = express();
app.use('/lib', express.static(path.join(__dirname, 'node_modules/three/build'), { maxAge: '7d' }));
app.use('/jsm', express.static(path.join(__dirname, 'node_modules/three/examples/jsm'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));
app.get('/health', (_req, res) => res.json({ ok: true, online: players.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

// ---------- профили (JSON-файл; позже — база данных) ----------
let profiles = {};
try { profiles = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { profiles = {}; }
let dirty = false;
setInterval(() => {
  if (!dirty) return; dirty = false;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFile(DATA_FILE, JSON.stringify(profiles), () => {});
}, 15000);

const pub = p => ({ name: p.name, money: p.money, cars: p.cars, car: p.car, color: p.color, outfit: p.outfit, skin: p.skin, hp: p.hp, hunger: p.hunger });
const look = q => ({ id: q.id, name: q.prof.name, car: q.prof.car, color: q.prof.color, outfit: q.prof.outfit, skin: q.prof.skin, mode: q.mode, x: q.x, y: q.y, z: q.z, ry: q.ry, cx: q.cx, cy: q.cy, cz: q.cz, cry: q.cry });

const players = new Map();
let nextId = 1;
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (msg, except) => { const s = JSON.stringify(msg); for (const p of players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s); };
const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) || 'لاعب';
const num = v => (Number.isFinite(+v) ? +v : 0);

wss.on('connection', ws => {
  let me = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!me) {
      if (m.t !== 'hello') return;
      let token = typeof m.token === 'string' && profiles[m.token] ? m.token : null;
      if (!token) {
        token = crypto.randomBytes(16).toString('hex');
        profiles[token] = { name: cleanName(m.name), money: START_MONEY, cars: ['ghazal'], car: 'ghazal', color: COLORS[0], city: 'riyadh' };
      }
      const prof = profiles[token];
      if (m.name) prof.name = cleanName(m.name);
      if (OUTFITS.includes(m.outfit)) prof.outfit = m.outfit;
      if (SKINS.includes(m.skin)) prof.skin = m.skin;
      prof.outfit ||= OUTFITS[0]; prof.skin ||= SKINS[1]; prof.hp ??= 100; prof.hunger ??= 100;
      dirty = true;
      for (const p of players.values()) if (p.token === token) p.ws.close();
      const sp = cityPoints(CITY[prof.city] || CITY.riyadh).spawn;
      me = { ws, id: nextId++, token, prof, mode: 0, x: sp.x, y: 0, z: sp.z, ry: Math.PI, s: 0, a: 0, cx: sp.x - 6, cy: 0, cz: sp.z - 3, cry: Math.PI, lastT: Date.now(), job: null, chatT: 0, tpUntil: Date.now() + 4000 };
      players.set(me.id, me);
      send(ws, { t: 'welcome', id: me.id, token, now: Date.now(), profile: pub(prof), spawn: sp, players: [...players.values()].filter(p => p !== me).map(look) });
      broadcast({ t: 'join', ...look(me) }, me);
      return;
    }

    switch (m.t) {
      case 'st': {
        const mode = m.m === 1 ? 1 : 0;
        const x = num(m.x), y = num(m.y), z = num(m.z);
        const now = Date.now(), dt = Math.max(0.05, (now - me.lastT) / 1000);
        const vmax = mode ? CARS[me.prof.car].max * 1.5 + 8 : FOOT_MAX * 1.5 + 4;
        // при пересадке в машину позиция прыгает к машине — разрешаем, если рядом с ней
        const switched = mode !== me.mode && Math.hypot(x - me.cx, z - me.cz) < 8;
        if (!process.env.NO_ANTICHEAT && now > me.tpUntil && !switched && Math.hypot(x - me.x, z - me.z) > vmax * dt + 6) { send(ws, { t: 'fix', x: me.x, z: me.z }); me.lastT = now; return; }
        me.mode = mode; me.x = Math.max(-LIMIT, Math.min(LIMIT, x)); me.y = y; me.z = Math.max(-LIMIT, Math.min(LIMIT, z));
        me.ry = num(m.ry); me.s = num(m.s); me.a = m.a ? 1 : 0;
        me.cx = num(m.cx); me.cy = num(m.cy); me.cz = num(m.cz); me.cry = num(m.cry);
        me.lastT = now;
        break;
      }
      case 'stats':
        me.prof.hp = Math.max(0, Math.min(100, num(m.hp))); me.prof.hunger = Math.max(0, Math.min(100, num(m.hunger))); dirty = true;
        break;
      case 'chat': {
        const now = Date.now(); if (now - me.chatT < 800) return; me.chatT = now;
        const text = String(m.m || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);
        if (text) broadcast({ t: 'chat', id: me.id, name: me.prof.name, m: text });
        break;
      }
      case 'tp': {
        const c = CITY[m.city]; if (!c) return;
        const sp = cityPoints(c).spawn;
        me.x = sp.x; me.z = sp.z; me.cx = sp.x - 6; me.cz = sp.z - 3; me.mode = 0; me.tpUntil = Date.now() + 4000; me.prof.city = c.id; dirty = true;
        send(ws, { t: 'tp', x: sp.x, z: sp.z });
        break;
      }
      case 'died': {
        const nc = nearestCity(me.x, me.z).city, sp = cityPoints(nc).spawn;
        me.prof.money = Math.max(0, me.prof.money - 100); me.prof.hp = 100; me.prof.hunger = Math.max(me.prof.hunger, 40); me.job = null;
        me.x = sp.x; me.z = sp.z; me.mode = 0; me.tpUntil = Date.now() + 4000; dirty = true;
        send(ws, { t: 'respawn', x: sp.x, z: sp.z, profile: pub(me.prof) });
        break;
      }
      case 'eat': {
        if (!FOOD_SPOTS.some(f => Math.hypot(f.x - me.x, f.z - me.z) < 10)) return send(ws, { t: 'err', code: 'far' });
        if (me.prof.money < FOOD_PRICE) return send(ws, { t: 'err', code: 'money' });
        me.prof.money -= FOOD_PRICE; me.prof.hunger = Math.min(100, me.prof.hunger + 45); dirty = true;
        send(ws, { t: 'ate', profile: pub(me.prof) });
        break;
      }
      case 'job_take': {
        const c = CITY[m.city]; if (!c) return;
        const o = cityPoints(c).office;
        if (Math.hypot(me.x - o.x, me.z - o.z) > 15) return send(ws, { t: 'err', code: 'far' });
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
        if (Math.hypot(me.x - j.x, me.z - j.z) > 30) return send(ws, { t: 'err', code: 'notyet' });
        me.job = null;
        if (Date.now() - j.start < j.minMs) return send(ws, { t: 'err', code: 'cheat' });
        me.prof.money += j.pay; dirty = true;
        send(ws, { t: 'job_ok', pay: j.pay, profile: pub(me.prof) });
        break;
      }
      case 'job_cancel': me.job = null; break;
      case 'buy': {
        const car = CARS[m.car]; if (!car || me.prof.cars.includes(m.car)) return;
        if (me.prof.money < car.price) return send(ws, { t: 'err', code: 'money' });
        me.prof.money -= car.price; me.prof.cars.push(m.car); dirty = true;
        send(ws, { t: 'profile', profile: pub(me.prof) });
        break;
      }
      case 'select': {
        if (m.car && me.prof.cars.includes(m.car)) me.prof.car = m.car;
        if (m.color && COLORS.includes(m.color)) me.prof.color = m.color;
        dirty = true;
        send(ws, { t: 'profile', profile: pub(me.prof) });
        broadcast({ t: 'look', id: me.id, car: me.prof.car, color: me.prof.color }, me);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!me) return;
    players.delete(me.id);
    broadcast({ t: 'leave', id: me.id });
  });
});

setInterval(() => {
  if (players.size < 2) return;
  const r = v => Math.round(v * 100) / 100;
  const p = [...players.values()].map(q => [q.id, q.mode, r(q.x), r(q.y), r(q.z), r(q.ry), r(q.s), q.a, r(q.cx), r(q.cy), r(q.cz), r(q.cry)]);
  broadcast({ t: 'snap', p });
}, TICK_MS);

setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
}, 20000);

server.listen(PORT, () => console.log(`Arab RP server on :${PORT}`));
