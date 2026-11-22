// Игровой сервер Arab RP: раздаёт клиент и держит мультиплеер (WebSocket).
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CITIES, CITY, CARS, COLORS, LIMIT, cityPoints, streetPoint } from './public/shared/world.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'profiles.json');
const START_MONEY = 1500;
const TICK_MS = 100;

const app = express();
app.use('/lib', express.static(path.join(__dirname, 'node_modules/three/build'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));
app.get('/health', (_req, res) => res.json({ ok: true, online: players.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

// ---------- профили (пока в JSON-файле; позже — база данных) ----------
let profiles = {};
try { profiles = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { profiles = {}; }
let dirty = false;
setInterval(() => {
  if (!dirty) return; dirty = false;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFile(DATA_FILE, JSON.stringify(profiles), () => {});
}, 15000);

const publicProfile = p => ({ name: p.name, money: p.money, cars: p.cars, car: p.car, color: p.color });

// ---------- игроки ----------
const players = new Map(); // id -> {ws, id, token, prof, x,y,z,ry,s, lastT, job, chatT}
let nextId = 1;

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (msg, except) => {
  const s = JSON.stringify(msg);
  for (const p of players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s);
};
const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18) || 'لاعب';

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
        dirty = true;
      }
      const prof = profiles[token];
      if (m.name) prof.name = cleanName(m.name);
      // один профиль = одно подключение
      for (const p of players.values()) if (p.token === token) p.ws.close();
      const sp = cityPoints(CITY[prof.city] || CITY.riyadh).spawn;
      me = { ws, id: nextId++, token, prof, x: sp.x, y: 0, z: sp.z, ry: 0, s: 0, lastT: Date.now(), job: null, chatT: 0, tpUntil: Date.now() + 3000 };
      players.set(me.id, me);
      send(ws, {
        t: 'welcome', id: me.id, token, profile: publicProfile(prof), spawn: sp,
        players: [...players.values()].filter(p => p !== me).map(p => ({ id: p.id, name: p.prof.name, car: p.prof.car, color: p.prof.color, x: p.x, y: p.y, z: p.z, ry: p.ry })),
      });
      broadcast({ t: 'join', id: me.id, name: prof.name, car: prof.car, color: prof.color }, me);
      return;
    }

    switch (m.t) {
      case 'st': { // состояние машины
        const x = +m.x, y = +m.y, z = +m.z, ry = +m.ry, s = +m.s;
        if (![x, y, z, ry, s].every(Number.isFinite)) return;
        const now = Date.now(), dt = Math.max(0.05, (now - me.lastT) / 1000);
        const dist = Math.hypot(x - me.x, z - me.z);
        const maxD = (CARS[me.prof.car].max * 1.5 + 8) * dt + 6;
        if (now > me.tpUntil && dist > maxD) { send(ws, { t: 'fix', x: me.x, z: me.z }); me.lastT = now; return; }
        me.x = Math.max(-LIMIT, Math.min(LIMIT, x)); me.y = y; me.z = Math.max(-LIMIT, Math.min(LIMIT, z));
        me.ry = ry; me.s = s; me.lastT = now;
        break;
      }
      case 'chat': {
        const now = Date.now(); if (now - me.chatT < 800) return; me.chatT = now;
        const text = String(m.m || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);
        if (text) broadcast({ t: 'chat', id: me.id, name: me.prof.name, m: text });
        break;
      }
      case 'tp': { // быстрое перемещение в город (тестовая функция)
        const c = CITY[m.city]; if (!c) return;
        const sp = cityPoints(c).spawn;
        me.x = sp.x; me.z = sp.z; me.tpUntil = Date.now() + 3000; me.prof.city = c.id; dirty = true;
        send(ws, { t: 'tp', x: sp.x, z: sp.z });
        break;
      }
      case 'job_take': {
        const c = CITY[m.city]; if (!c) return;
        const o = cityPoints(c).office;
        if (Math.hypot(me.x - o.x, me.z - o.z) > 40) return send(ws, { t: 'err', code: 'far' });
        // 60% — доставка по своему городу, 40% — в другой город (дороже)
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
        send(ws, { t: 'job_ok', pay: j.pay, profile: publicProfile(me.prof) });
        break;
      }
      case 'job_cancel': me.job = null; break;
      case 'buy': {
        const car = CARS[m.car]; if (!car || me.prof.cars.includes(m.car)) return;
        if (me.prof.money < car.price) return send(ws, { t: 'err', code: 'money' });
        me.prof.money -= car.price; me.prof.cars.push(m.car); dirty = true;
        send(ws, { t: 'profile', profile: publicProfile(me.prof) });
        break;
      }
      case 'select': {
        if (m.car && me.prof.cars.includes(m.car)) me.prof.car = m.car;
        if (m.color && COLORS.includes(m.color)) me.prof.color = m.color;
        dirty = true;
        send(ws, { t: 'profile', profile: publicProfile(me.prof) });
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

// Рассылка положения всех игроков 10 раз в секунду
setInterval(() => {
  if (players.size < 2) return;
  const p = [...players.values()].map(q => [q.id, Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10, Math.round(q.z * 10) / 10, Math.round(q.ry * 100) / 100, Math.round(q.s * 10) / 10]);
  broadcast({ t: 'snap', p });
}, TICK_MS);

// Отключаем «мёртвые» соединения
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
}, 20000);

server.listen(PORT, () => console.log(`Arab RP server on :${PORT}`));
