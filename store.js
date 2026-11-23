// Хранилище профилей. Если заданы SUPABASE_URL и SUPABASE_SERVICE_KEY — профили лежат в Supabase
// (таблица arab_rp_profiles), иначе — в JSON-файле (для локальных тестов).
import fs from 'fs';
import path from 'path';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const TABLE = 'arab_rp_profiles';
export const usingDb = !!(URL_ && KEY);

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

export async function loadAll(file) {
  if (!usingDb) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  }
  const out = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${URL_}/rest/v1/${TABLE}?select=token,data&order=token`, { headers: { ...headers, Range: `${from}-${from + PAGE - 1}` } });
    if (!r.ok) throw new Error(`Supabase load ${r.status}: ${await r.text()}`);
    const rows = await r.json();
    for (const row of rows) out[row.token] = row.data;
    if (rows.length < PAGE) break;
  }
  return out;
}

// сохраняет только изменённые профили
export async function save(file, profiles, tokens) {
  if (!tokens.size) return;
  if (!usingDb) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(profiles));
    return;
  }
  const now = new Date().toISOString();
  const rows = [...tokens].filter(t => profiles[t]).map(t => ({ token: t, data: profiles[t], updated_at: now }));
  const r = await fetch(`${URL_}/rest/v1/${TABLE}`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
  if (!r.ok) throw new Error(`Supabase save ${r.status}: ${await r.text()}`);
}
