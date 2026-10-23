// Turns data-raw/ into the compact files the browser loads from public/data/:
//   terrain.bin  Int16 heights (m) on the TERRAIN_STEP grid, then a Uint8 mask on a 2× finer grid (bit0 city, bit1 water)
//   geo.json     grid metadata + simplified boundary, water, roads, schools, YouBike stations, airport (local units)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { EXTENT, TERRAIN_STEP, TERRAIN_ZOOM, tileRange, lon2tile, lat2tile, project, LAT0, LON0, KX, KZ } from "../src/scene/geo.js";

const raw = (f) => fileURLToPath(new URL(`../data-raw/${f}`, import.meta.url));
const out = (f) => fileURLToPath(new URL(`../public/data/${f}`, import.meta.url));
const json = async (f) => JSON.parse(await readFile(raw(f), "utf8"));
const r2 = (v) => Math.round(v * 100) / 100;

// ---------- geometry helpers ----------
const eq = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
const closed = (r) => r.length > 3 && eq(r[0], r[r.length - 1]);
const toLocal = (geom) => geom.map((g) => project(g.lat, g.lon));

function assembleRings(chains) {
  const pool = chains.map((c) => c.slice());
  const rings = [];
  while (pool.length) {
    let cur = pool.pop();
    let grew = true;
    while (!closed(cur) && grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i];
        if (eq(cur.at(-1), w[0])) cur = cur.concat(w.slice(1));
        else if (eq(cur.at(-1), w.at(-1))) cur = cur.concat(w.slice(0, -1).reverse());
        else if (eq(cur[0], w.at(-1))) cur = w.concat(cur.slice(1));
        else if (eq(cur[0], w[0])) cur = w.slice().reverse().concat(cur.slice(1));
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (closed(cur)) rings.push(cur);
  }
  return rings;
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  if (closed(pts)) {
    // a closed ring has no baseline: split it at the vertex farthest from the start
    let m = 1;
    for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]) > Math.hypot(pts[m][0] - pts[0][0], pts[m][1] - pts[0][1])) m = i;
    return simplify(pts.slice(0, m + 1), tol).concat(simplify(pts.slice(m), tol).slice(1));
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a],
      [bx, bz] = pts[b];
    const dx = bx - ax,
      dz = bz - az,
      len = Math.hypot(dx, dz) || 1e-9;
    let best = -1,
      bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / len;
      if (d > best) (best = d), (bi = i);
    }
    if (best > tol) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const area = (r) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return s / 2;
};
function inside(p, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if (r[i][1] > p[1] !== r[j][1] > p[1] && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
}
const flat = (r) => r.flatMap(([x, z]) => [r2(x), r2(z)]);

// even-odd scanline fill of a set of rings into a mask grid
function fillRings(mask, w, h, cell, rings, bit) {
  const edges = [];
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) edges.push([r[j], r[i]]);
  for (let gy = 0; gy < h; gy++) {
    const z = EXTENT.minZ + gy * cell;
    const xs = [];
    for (const [a, b] of edges) if (a[1] > z !== b[1] > z) xs.push(a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const g0 = Math.max(0, Math.ceil((xs[k] - EXTENT.minX) / cell)),
        g1 = Math.min(w - 1, Math.floor((xs[k + 1] - EXTENT.minX) / cell));
      for (let gx = g0; gx <= g1; gx++) mask[gy * w + gx] |= bit;
    }
  }
}

// ---------- terrain ----------
const { x0, x1, y0, y1 } = tileRange(TERRAIN_ZOOM);
const tiles = new Map();
for (let x = x0; x <= x1; x++)
  for (let y = y0; y <= y1; y++) tiles.set(`${x - x0},${y - y0}`, PNG.sync.read(await readFile(raw(`terrain/${TERRAIN_ZOOM}-${x}-${y}.png`))));
const tw = (x1 - x0 + 1) * 256,
  th = (y1 - y0 + 1) * 256;
function px(gx, gy) {
  gx = Math.min(tw - 1, Math.max(0, gx));
  gy = Math.min(th - 1, Math.max(0, gy));
  const t = tiles.get(`${Math.floor(gx / 256)},${Math.floor(gy / 256)}`);
  const i = ((gy % 256) * 256 + (gx % 256)) * 4;
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
}
function elevation(x, z) {
  const lon = LON0 + x / KX,
    lat = LAT0 - z / KZ;
  const fx = (lon2tile(lon, TERRAIN_ZOOM) - x0) * 256 - 0.5,
    fy = (lat2tile(lat, TERRAIN_ZOOM) - y0) * 256 - 0.5;
  const ix = Math.floor(fx),
    iy = Math.floor(fy),
    u = fx - ix,
    v = fy - iy;
  return (px(ix, iy) * (1 - u) + px(ix + 1, iy) * u) * (1 - v) + (px(ix, iy + 1) * (1 - u) + px(ix + 1, iy + 1) * u) * v;
}
const nx = Math.floor((EXTENT.maxX - EXTENT.minX) / TERRAIN_STEP) + 1,
  nz = Math.floor((EXTENT.maxZ - EXTENT.minZ) / TERRAIN_STEP) + 1;
const heights = new Int16Array(nx * nz);
for (let j = 0; j < nz; j++)
  for (let i = 0; i < nx; i++) heights[j * nx + i] = Math.round(elevation(EXTENT.minX + i * TERRAIN_STEP, EXTENT.minZ + j * TERRAIN_STEP));

// ---------- city boundary ----------
const bRel = (await json("boundary.json")).elements.find((e) => e.type === "relation" && e.tags.admin_level === "4");
const bChains = bRel.members.filter((m) => m.type === "way" && m.role === "outer" && m.geometry).map((m) => toLocal(m.geometry));
const boundary = assembleRings(bChains).map((r) => simplify(r, 0.12));
console.log("boundary rings", boundary.length, boundary.map((r) => r.length));

// ---------- water ----------
const KEEP_WATER = new Set(["river", "lake", "reservoir", "canal", "oxbow", "lagoon", undefined]);
const water = [];
for (const e of (await json("water.json")).elements) {
  if (!KEEP_WATER.has(e.tags.water)) continue;
  let outers = [],
    inners = [];
  if (e.type === "way" && e.geometry) outers = [toLocal(e.geometry)].filter(closed);
  else if (e.type === "relation") {
    const ms = e.members.filter((m) => m.type === "way" && m.geometry);
    outers = assembleRings(ms.filter((m) => m.role !== "inner").map((m) => toLocal(m.geometry)));
    inners = assembleRings(ms.filter((m) => m.role === "inner").map((m) => toLocal(m.geometry)));
  }
  for (const o of outers) {
    if (Math.abs(area(o)) < 0.4) continue; // < 4,000 m²
    const holes = inners.filter((h) => inside(h[0], o) && Math.abs(area(h)) > 0.2).map((h) => simplify(h, 0.06));
    water.push({ o: simplify(o, 0.06), h: holes, name: e.tags.name || "" });
  }
}
console.log("water polygons", water.length);

// ---------- masks (2× finer than the height grid) ----------
const cell = TERRAIN_STEP / 2,
  mw = nx * 2 - 1,
  mh = nz * 2 - 1;
const mask = new Uint8Array(mw * mh);
fillRings(mask, mw, mh, cell, boundary, 1);
for (const p of water) fillRings(mask, mw, mh, cell, [p.o, ...p.h], 2);

// ---------- roads ----------
const CLS = { motorway: 0, trunk: 1, primary: 2, secondary: 3 };
const inExtent = ([x, z]) => x > EXTENT.minX && x < EXTENT.maxX && z > EXTENT.minZ && z < EXTENT.maxZ;
const roads = [];
for (const e of (await json("roads.json")).elements) {
  if (!e.geometry) continue;
  const pts = simplify(toLocal(e.geometry), 0.05).filter(inExtent);
  if (pts.length > 1) roads.push([CLS[e.tags.highway], ...flat(pts)]);
}
console.log("roads", roads.length);

// ---------- points ----------
const schoolSeen = new Set();
const schools = [];
for (const e of (await json("schools.json")).elements) {
  const n = e.tags.name || "";
  if (/高中|高級|大學|學院|幼兒|補習|附設/.test(n) && !/國民中學|國民小學|國中|國小/.test(n)) continue;
  const type = /國民小學|國小|小學/.test(n) ? 0 : /國民中學|國中/.test(n) ? 1 : -1;
  if (type < 0 || schoolSeen.has(n)) continue;
  schoolSeen.add(n);
  const c = e.center || e;
  const [x, z] = project(c.lat, c.lon);
  schools.push([r2(x), r2(z), type, n]);
}
console.log("schools", schools.length, "elementary", schools.filter((s) => s[2] === 0).length);

const youbike = (await json("youbike.json")).map((s) => project(+s.latitude, +s.longitude)).map(([x, z]) => [r2(x), r2(z)]);
console.log("youbike", youbike.length);

const airport = { runway: [], taxiways: [], aprons: [] };
for (const e of (await json("airport.json")).elements) {
  const pts = toLocal(e.geometry);
  if (e.tags.aeroway === "runway") airport.runway = flat(pts);
  else if (e.tags.aeroway === "taxiway") airport.taxiways.push(flat(simplify(pts, 0.03)));
  else if (e.tags.aeroway === "apron" && closed(pts)) airport.aprons.push(flat(simplify(pts, 0.03)));
}

await mkdir(out(""), { recursive: true });
const bin = Buffer.alloc(heights.byteLength + mask.byteLength);
Buffer.from(heights.buffer).copy(bin, 0);
Buffer.from(mask.buffer).copy(bin, heights.byteLength);
await writeFile(out("terrain.bin"), bin);
await writeFile(
  out("geo.json"),
  JSON.stringify({
    grid: { minX: EXTENT.minX, minZ: EXTENT.minZ, nx, nz, step: TERRAIN_STEP, mw, mh, cell },
    boundary: boundary.map(flat),
    water: water.map((p) => ({ o: flat(p.o), h: p.h.map(flat) })),
    roads,
    schools,
    youbike,
    airport,
    attribution: "Terrain: AWS Terrain Tiles (Mapzen, SRTM et al.) · Map data © OpenStreetMap contributors (ODbL) · YouBike: 臺北市資料大平台",
  }),
);
console.log("written", nx, "x", nz, "heights;", mw, "x", mh, "mask");
