// RP-системы сервера: оружие и урон, семьи, захваты вышек/фермы/завода.
// Всё решает сервер: деньги, патроны, урон, состав семей и владельцев объектов.
import crypto from 'crypto';
import {
  WEAPONS, AMMO_MAX, FAMILY_PRICE, FAMILY_COLORS, cleanFamName, CITIES, cityPoints,
  CAPTURES, CAPTURE_R, CAPTURE_MS, CAPTURE_GOAL, CAPTURE_COOLDOWN, INCOME_EVERY,
} from './public/shared/world.js';

export function initRP(ctx) {
  const { players, profiles, touch, send, broadcast, pub, vit, kill } = ctx;
  // семьи и захваты хранятся рядом с профилями под служебными ключами
  const families = profiles._families ||= {};
  const caps = profiles._captures ||= {};
  for (const c of CAPTURES) caps[c.id] ||= { owner: null, lastEnd: 0 };
  const active = new Map(); // id объекта -> { attacker, defender, start, progress }
  const saveFam = () => touch('_families');
  const saveCaps = () => touch('_captures');

  const famOf = q => (q.prof.fam && families[q.prof.fam]) || null;
  const rankOf = q => famOf(q)?.members[q.token]?.rank || 0;
  const famTag = q => { const f = famOf(q); return f ? { name: f.name, color: f.color } : null; };
  const online = f => [...players.values()].filter(p => p.prof.fam === f.id);
  const nearP = (q, p, r) => Math.hypot(q.x - p.x, q.z - p.z) < r;

  function famView(q) {
    const f = famOf(q); if (!f) return null;
    const on = new Set(online(f).map(p => p.token));
    return {
      id: f.id, name: f.name, color: f.color, bank: f.bank, myRank: f.members[q.token]?.rank || 0,
      members: Object.entries(f.members).map(([tok, m]) => ({ key: tok.slice(0, 8), name: m.name, rank: m.rank, online: on.has(tok) })).sort((a, b) => b.rank - a.rank),
      caps: CAPTURES.filter(c => caps[c.id].owner === f.id).map(c => c.id),
    };
  }
  const sendFam = q => send(q.ws, { t: 'fam', fam: famView(q) });
  const sendFamAll = f => { for (const p of online(f)) sendFam(p); };
  const lookChanged = q => broadcast({ t: 'tag', id: q.id, fam: famTag(q) });
  const capState = id => { const a = active.get(id), c = caps[id]; return { id, owner: c.owner && families[c.owner] ? { name: families[c.owner].name, color: families[c.owner].color } : null, lastEnd: c.lastEnd, active: a ? { attacker: families[a.attacker]?.name, color: families[a.attacker]?.color, progress: a.progress, endsAt: a.start + CAPTURE_MS } : null }; };
  const allCaps = () => CAPTURES.map(c => capState(c.id));
  const tokenByKey = (f, key) => Object.keys(f.members).find(t => t.slice(0, 8) === key);

  function removeFamily(f) {
    for (const c of CAPTURES) if (caps[c.id].owner === f.id) caps[c.id].owner = null;
    for (const [id, a] of active) if (a.attacker === f.id || a.defender === f.id) active.delete(id);
    for (const tok of Object.keys(f.members)) if (profiles[tok]) { delete profiles[tok].fam; touch(tok); }
    delete families[f.id]; saveFam(); saveCaps();
    broadcast({ t: 'caps', caps: allCaps() });
  }
  function leave(q) {
    const f = famOf(q); if (!f) return;
    const wasLeader = f.leader === q.token;
    delete f.members[q.token]; delete q.prof.fam; touch(q.token);
    if (!Object.keys(f.members).length) { removeFamily(f); }
    else if (wasLeader) { // лидером становится старший по рангу
      const [tok] = Object.entries(f.members).sort((a, b) => b[1].rank - a[1].rank)[0];
      f.leader = tok; f.members[tok].rank = 3; saveFam(); sendFamAll(f);
    } else { saveFam(); sendFamAll(f); }
    sendFam(q); lookChanged(q);
  }

  // ---------- сообщения ----------
  function handle(q, m) {
    const ws = q.ws, P = q.prof;
    switch (m.t) {
      // ----- оружие -----
      case 'gun_buy': {
        const w = WEAPONS[m.w]; if (!w || !w.price) return true;
        if (!CITIES.some(c => nearP(q, cityPoints(c).guns, 15))) { send(ws, { t: 'err', code: 'far' }); return true; }
        const owned = P.guns[m.w] !== undefined;
        const price = owned ? w.ammo : w.price;
        if (owned && P.guns[m.w] >= AMMO_MAX) { send(ws, { t: 'err', code: 'full' }); return true; }
        if (P.money < price) { send(ws, { t: 'err', code: 'money' }); return true; }
        P.money -= price; P.guns[m.w] = Math.min(AMMO_MAX, (P.guns[m.w] || 0) + w.mag); touch(q.token);
        send(ws, { t: 'paid', what: 'gun', cost: price, profile: pub(P) });
        return true;
      }
      case 'equip': {
        const w = m.w === 'fist' || P.guns[m.w] !== undefined ? m.w : 'fist';
        q.w = w; broadcast({ t: 'wpn', id: q.id, w });
        return true;
      }
      case 'shoot': {
        const W = WEAPONS[q.w], now = Date.now();
        if (!W || m.w !== q.w || q.mode !== 0 || q.dead) return true;
        if (now - (q.lastShot || 0) < W.rate * 1000 * 0.8) return true; // не чаще, чем позволяет оружие
        q.lastShot = now;
        if (!W.melee) { if (!(P.guns[q.w] > 0)) return true; P.guns[q.w]--; touch(q.token); }
        const d = Array.isArray(m.dir) ? m.dir.map(Number) : [0, 0, 1], dl = Math.hypot(...d) || 1;
        const dir = d.map(v => v / dl), o = [q.x, q.y + 1.45, q.z];
        broadcast({ t: 'shot', id: q.id, w: q.w, o, d: dir, hit: m.hit || null }, q);
        const t = m.hit != null ? players.get(+m.hit) : null;
        if (!t || t === q || t.dead || now < t.tpUntil) return true;
        const tx = t.mode ? t.cx : t.x, tz = t.mode ? t.cz : t.z, ty = (t.mode ? t.cy : t.y) + 1.0;
        const v = [tx - o[0], ty - o[1], tz - o[2]], dist = Math.hypot(...v);
        if (dist > W.range + 2) return true;
        if (!W.melee) { // направление выстрела должно смотреть на цель
          const cos = (v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]) / dist;
          if (cos < Math.cos(Math.max(0.14, (W.spread || 0) * 3 + 1.2 / dist))) return true;
        }
        const dmg = W.dmg * (t.mode ? 0.5 : 1);
        t.prof.hp = Math.max(0, t.prof.hp - dmg); touch(t.token); vit(t);
        send(t.ws, { t: 'hurt', from: q.id, dmg });
        send(ws, { t: 'hitok', id: t.id });
        if (t.prof.hp <= 0) { broadcast({ t: 'kill', killer: P.name, victim: t.prof.name, w: q.w }); kill(t); }
        return true;
      }
      // ----- семьи -----
      case 'fam_get': sendFam(q); send(ws, { t: 'caps', caps: allCaps() }); return true;
      case 'fam_create': {
        if (famOf(q)) return true;
        const name = cleanFamName(m.name);
        if (name.length < 3) { send(ws, { t: 'err', code: 'famname' }); return true; }
        if (Object.values(families).some(f => f.name.toLowerCase() === name.toLowerCase())) { send(ws, { t: 'err', code: 'famtaken' }); return true; }
        if (P.money < FAMILY_PRICE) { send(ws, { t: 'err', code: 'money' }); return true; }
        const color = FAMILY_COLORS.includes(m.color) ? m.color : FAMILY_COLORS[Object.keys(families).length % FAMILY_COLORS.length];
        const id = 'f' + crypto.randomBytes(5).toString('hex');
        families[id] = { id, name, color, leader: q.token, members: { [q.token]: { name: P.name, rank: 3 } }, bank: 0, created: Date.now() };
        P.money -= FAMILY_PRICE; P.fam = id; touch(q.token); saveFam();
        send(ws, { t: 'profile', profile: pub(P) }); sendFam(q); lookChanged(q);
        return true;
      }
      case 'fam_invite': {
        const f = famOf(q), t = players.get(+m.id);
        if (!f || rankOf(q) < 2 || !t || t === q) return true;
        if (t.prof.fam) { send(ws, { t: 'err', code: 'infam' }); return true; }
        if (!nearP(q, t, 8)) { send(ws, { t: 'err', code: 'far' }); return true; }
        t.invite = { fam: f.id, until: Date.now() + 60000 };
        send(t.ws, { t: 'fam_invite', name: f.name, color: f.color, from: P.name });
        send(ws, { t: 'fam_sent', to: t.prof.name });
        return true;
      }
      case 'fam_accept': {
        const inv = q.invite, f = inv && families[inv.fam];
        if (!f || Date.now() > inv.until || famOf(q)) return true;
        q.invite = null; f.members[q.token] = { name: P.name, rank: 1 }; P.fam = f.id; touch(q.token); saveFam();
        sendFamAll(f); lookChanged(q);
        return true;
      }
      case 'fam_leave': leave(q); return true;
      case 'fam_kick': {
        const f = famOf(q); if (!f) return true;
        const tok = tokenByKey(f, m.key); if (!tok || tok === q.token) return true;
        if (f.members[tok].rank >= rankOf(q)) return true;
        delete f.members[tok]; if (profiles[tok]) { delete profiles[tok].fam; touch(tok); } saveFam();
        const t = [...players.values()].find(p => p.token === tok); if (t) { sendFam(t); lookChanged(t); }
        sendFamAll(f);
        return true;
      }
      case 'fam_rank': {
        const f = famOf(q); if (!f || f.leader !== q.token) return true;
        const tok = tokenByKey(f, m.key); if (!tok || tok === q.token) return true;
        f.members[tok].rank = Math.max(1, Math.min(2, Math.round(+m.rank) || 1)); saveFam(); sendFamAll(f);
        return true;
      }
      case 'fam_chat': {
        const f = famOf(q); if (!f) return true;
        const text = String(m.m || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140); if (!text) return true;
        for (const p of online(f)) send(p.ws, { t: 'fam_msg', name: P.name, m: text, color: f.color });
        return true;
      }
      case 'fam_deposit': case 'fam_withdraw': {
        const f = famOf(q); if (!f) return true;
        const a = Math.floor(+m.amount); if (!(a > 0)) return true;
        if (m.t === 'fam_deposit') { if (P.money < a) { send(ws, { t: 'err', code: 'money' }); return true; } P.money -= a; f.bank += a; }
        else { if (rankOf(q) < 3) return true; if (f.bank < a) { send(ws, { t: 'err', code: 'money' }); return true; } f.bank -= a; P.money += a; }
        touch(q.token); saveFam(); send(ws, { t: 'profile', profile: pub(P) }); sendFamAll(f);
        return true;
      }
      // ----- захваты -----
      case 'cap_start': {
        const c = CAPTURES.find(x => x.id === m.id), f = famOf(q);
        if (!c || !f) { send(ws, { t: 'err', code: 'nofam' }); return true; }
        if (rankOf(q) < 2) { send(ws, { t: 'err', code: 'rank' }); return true; }
        if (!nearP(q, c, CAPTURE_R)) { send(ws, { t: 'err', code: 'far' }); return true; }
        const st = caps[c.id];
        if (active.has(c.id)) { send(ws, { t: 'err', code: 'capbusy' }); return true; }
        if (st.owner === f.id) { send(ws, { t: 'err', code: 'capown' }); return true; }
        if (Date.now() - st.lastEnd < CAPTURE_COOLDOWN) { send(ws, { t: 'err', code: 'capcool', wait: Math.ceil((CAPTURE_COOLDOWN - (Date.now() - st.lastEnd)) / 60000) }); return true; }
        active.set(c.id, { attacker: f.id, defender: st.owner, start: Date.now(), progress: 0 });
        broadcast({ t: 'cap_begin', id: c.id, attacker: f.name, color: f.color, defender: st.owner ? families[st.owner]?.name : null });
        broadcast({ t: 'caps', caps: allCaps() });
        return true;
      }
    }
    return false;
  }

  // каждую секунду: кто стоит в зоне захвата
  setInterval(() => {
    if (!active.size) return;
    const now = Date.now();
    for (const [id, a] of active) {
      const c = CAPTURES.find(x => x.id === id);
      let att = 0, def = 0;
      for (const p of players.values()) {
        if (p.dead || p.mode !== 0 || !nearP(p, c, CAPTURE_R)) continue;
        if (p.prof.fam === a.attacker) att++; else if (a.defender && p.prof.fam === a.defender) def++;
      }
      if (att > def) a.progress++; else if (def > att) a.progress = Math.max(0, a.progress - 1);
      let done = null;
      if (a.progress >= CAPTURE_GOAL) done = a.attacker;
      else if (now - a.start >= CAPTURE_MS) done = a.defender || null;
      if (done !== null || now - a.start >= CAPTURE_MS) {
        active.delete(id);
        const won = a.progress >= CAPTURE_GOAL;
        if (won) caps[id].owner = a.attacker;
        caps[id].lastEnd = now; saveCaps();
        broadcast({ t: 'cap_end', id, winner: won ? families[a.attacker]?.name : (a.defender ? families[a.defender]?.name : null), won });
      }
    }
    broadcast({ t: 'caps', caps: allCaps() });
  }, 1000);

  // доход семьям за объекты
  setInterval(() => {
    for (const c of CAPTURES) {
      const f = families[caps[c.id].owner]; if (!f) continue;
      f.bank += c.income;
      for (const p of online(f)) send(p.ws, { t: 'fam_income', obj: c.id, amount: c.income });
      sendFamAll(f);
    }
    saveFam();
  }, INCOME_EVERY);

  return {
    handle, famTag,
    onJoin: q => { send(q.ws, { t: 'caps', caps: allCaps() }); if (famOf(q)) sendFam(q); },
    weaponOf: q => q.w || 'fist',
  };
}
