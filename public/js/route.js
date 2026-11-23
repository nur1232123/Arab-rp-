// GPS-маршрут: граф дорог (улицы городов + трассы) и поиск кратчайшего пути.
import { STREETS, HIGHWAYS, BLOCK } from '../shared/world.js';

const nodes = [];            // [x, z]
const adj = [];              // [[j, len], ...]
const index = new Map();
const key = (x, z) => Math.round(x) + ',' + Math.round(z);
function node(x, z) {
  const k = key(x, z); let i = index.get(k);
  if (i === undefined) { i = nodes.length; index.set(k, i); nodes.push([x, z]); adj.push([]); }
  return i;
}
function edge(a, b) {
  if (a === b) return;
  const l = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]);
  adj[a].push([b, l]); adj[b].push([a, l]);
}
for (const s of STREETS) {
  const [[ax, az], [bx, bz]] = s.pts, n = Math.round(Math.hypot(bx - ax, bz - az) / BLOCK);
  let prev = node(ax, az);
  for (let k = 1; k <= n; k++) { const cur = node(ax + (bx - ax) * k / n, az + (bz - az) * k / n); edge(prev, cur); prev = cur; }
}
for (const h of HIGHWAYS) {
  let prev = node(...h.pts[0]);
  for (let k = 1; k < h.pts.length; k++) { const cur = node(...h.pts[k]); edge(prev, cur); prev = cur; }
}

function nearest(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < nodes.length; i++) { const d = (nodes[i][0] - x) ** 2 + (nodes[i][1] - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}

// маленькая двоичная куча для Дейкстры
function dijkstra(src, dst) {
  const dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1);
  const heap = [[0, src]]; dist[src] = 0;
  const push = it => { heap.push(it); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = pop(); if (d > dist[u]) continue; if (u === dst) break;
    for (const [v, l] of adj[u]) { const nd = d + l; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push([nd, v]); } }
  }
  if (dist[dst] === Infinity) return null;
  const path = []; for (let u = dst; u !== -1; u = prev[u]) path.push(nodes[u]);
  return path.reverse();
}

// маршрут от (x,z) до (tx,tz): список точек [x, z]
export function findRoute(x, z, tx, tz) {
  const p = dijkstra(nearest(x, z), nearest(tx, tz));
  if (!p) return [[x, z], [tx, tz]];
  return [[x, z], ...p, [tx, tz]];
}

// расстояние от точки до ломаной (чтобы понять, что игрок съехал с маршрута)
export function distToRoute(route, x, z) {
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const [ax, az] = route[i], [bx, bz] = route[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = l2 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}
