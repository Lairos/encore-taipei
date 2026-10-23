// Real geometry around the policy landmarks → public/data/landmarks.json
//   buildings  OpenStreetMap footprints (with height / levels) in four zones: 信義, 公館, 北士科, 松山機場
//   outlines   臺北大巨蛋, 臺北101, 輝達 Constellation site (T17/T18), 金仁寶 T16
//   eastring   環狀線東環段 stations Y29–Y39 + Y1, placed where 捷運局 describes them (road crossings, parks)
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { project } from "../src/scene/geo.js";

const raw = (f) => fileURLToPath(new URL(`../data-raw/${f}`, import.meta.url));
const out = fileURLToPath(new URL("../public/data/landmarks.json", import.meta.url));
const json = async (f) => JSON.parse(await readFile(raw(f), "utf8"));
const r2 = (v) => Math.round(v * 100) / 100;
const M = 0.016 * 0.8; // metres → world units for buildings (same exaggeration as the procedural city)

// zones (lat, lon, radius m): procedural blocks are not placed inside these, real footprints are
const ZONES = {
  xinyi: [25.0385, 121.5615, 1300],
  gongguan: [25.0136, 121.5345, 600],
  beishike: [25.1005, 121.5115, 1000],
  airport: [25.0669, 121.552, 1400],
  zhongzheng: [25.039, 121.517, 1000],
  yuanshan: [25.0765, 121.526, 600],
};
// drawn by their own models, so not extruded
// iconic buildings with their own roofs (heights in metres; roof: "octagon" | "palace" | "hip" | "tower")
const ICONS = {
  1052759757: { name: "中正紀念堂", wall: 30, roof: 40, kind: "octagon", wallC: "#f4f2ec", roofC: "#2f5fb3" },
  1052759775: { name: "國家音樂廳", wall: 22, roof: 14, kind: "palace", wallC: "#b8402f", roofC: "#e2a62a" },
  1052759776: { name: "國家戲劇院", wall: 22, roof: 14, kind: "palace", wallC: "#b8402f", roofC: "#e2a62a" },
  23641610: { name: "臺北車站", wall: 24, roof: 10, kind: "hip", wallC: "#e6dccb", roofC: "#6e5a4c" },
  25202548: { name: "圓山大飯店", wall: 60, roof: 24, kind: "palace", wallC: "#c0392b", roofC: "#e0952b" }, // 主樓 (14F, ~87 m)
  206817: { name: "總統府", wall: 24, roof: 0, kind: "tower", wallC: "#b65a3f", roofC: "#8e3d2c", tower: 60 },
};
const SPECIAL = new Set([442195153, 1159328965, 1309916528, ...Object.keys(ICONS).map(Number)]);

const local = (geom) => geom.map((g) => project(g.lat, g.lon));
const area = (r) => r.reduce((s, p, i) => s + (r[(i + 1) % r.length][0] - p[0]) * (r[(i + 1) % r.length][1] + p[1]), 0) / 2;
const flat = (r) => r.flatMap(([x, z]) => [r2(x), r2(z)]);

function simplify(pts, tol) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a],
      [bx, bz] = pts[b];
    const len = Math.hypot(bx - ax, bz - az);
    let best = -1,
      bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = len < 1e-9 ? Math.hypot(pts[i][0] - ax, pts[i][1] - az) : Math.abs((pts[i][0] - ax) * (bz - az) - (pts[i][1] - az) * (bx - ax)) / len;
      if (d > best) (best = d), (bi = i);
    }
    if (best > tol) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// height in metres from OSM tags, with sensible defaults for Taipei by building type
function heightOf(t, a) {
  const h = parseFloat(t.height);
  if (h > 0) return h;
  const lv = parseFloat(t["building:levels"]);
  if (lv > 0) return lv * 3.3;
  const b = t.building;
  if (b === "house" || b === "hut" || b === "shed" || b === "kiosk" || b === "garage") return 6;
  if (b === "apartments") return a > 0.08 ? 40 : 30; // a in world units² (1 = 1 ha)
  if (b === "commercial" || b === "office" || b === "hotel") return 45;
  if (b === "school" || b === "university" || b === "public" || b === "hospital") return 18;
  if (b === "industrial" || b === "warehouse" || b === "hangar") return 12;
  return a > 0.05 ? 20 : 14;
}
const KIND = { apartments: 0, residential: 0, house: 0, dormitory: 0, commercial: 1, office: 1, retail: 1, hotel: 1, school: 2, university: 2, public: 2, hospital: 2, government: 2, civic: 2, industrial: 3, warehouse: 3, hangar: 3 };

// ---------- buildings ----------
const seen = new Set();
const buildings = [];
for (const name of Object.keys(ZONES)) {
  for (const e of (await json(`buildings-${name}.json`)).elements) {
    if (seen.has(e.id) || SPECIAL.has(e.id)) continue;
    seen.add(e.id);
    const t = e.tags || {};
    if (["roof", "construction", "greenhouse", "ruins", "carport"].includes(t.building) || t["building:part"]) continue;
    let ring = null;
    if (e.type === "way" && e.geometry) ring = local(e.geometry);
    else if (e.type === "relation" && e.members) {
      const outer = e.members.filter((m) => m.role === "outer" && m.geometry).sort((a, b) => b.geometry.length - a.geometry.length)[0];
      if (outer) ring = local(outer.geometry);
    }
    if (!ring || ring.length < 4) continue;
    if (ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
    const a = Math.abs(area(ring));
    if (a < 0.002) continue; // < 20 m²
    ring = simplify(ring.concat([ring[0]]), 0.01).slice(0, -1);
    if (ring.length < 3) continue;
    const special = t.name === "國父紀念館" ? 1 : t.name === "臺北市政府" ? 2 : 0;
    buildings.push([r2(heightOf(t, a) * M), KIND[t.building] ?? 4, special, ...flat(ring)]);
  }
}

// ---------- landmark outlines ----------
const ways = new Map((await json("landmark-ways.json")).elements.map((e) => [e.id, local(e.geometry)]));
// best-fit ellipse (principal axes) for the dome
function ellipse(ring) {
  const n = ring.length,
    cx = ring.reduce((s, p) => s + p[0], 0) / n,
    cz = ring.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0,
    szz = 0,
    sxz = 0;
  for (const [x, z] of ring) (sxx += (x - cx) ** 2), (szz += (z - cz) ** 2), (sxz += (x - cx) * (z - cz));
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  let a = 0,
    b = 0;
  for (const [x, z] of ring) {
    const u = (x - cx) * Math.cos(ang) + (z - cz) * Math.sin(ang),
      v = -(x - cx) * Math.sin(ang) + (z - cz) * Math.cos(ang);
    a = Math.max(a, Math.abs(u));
    b = Math.max(b, Math.abs(v));
  }
  return { center: [r2(cx), r2(cz)], a: r2(a), b: r2(b), angle: +ang.toFixed(4) };
}
const centroid = (ring) => [r2(ring.reduce((s, p) => s + p[0], 0) / ring.length), r2(ring.reduce((s, p) => s + p[1], 0) / ring.length)];

// ---------- 東環段 stations ----------
const er = (await json("eastring.json")).elements;
const roadPts = (re) => er.filter((e) => e.type === "way" && e.tags.highway && re.test(e.tags.name || "")).map((e) => local(e.geometry));
const parkCenter = (re) => {
  const p = er.find((e) => e.tags.leisure === "park" && re.test(e.tags.name || ""));
  return p ? centroid(local(p.geometry)) : null;
};
const station = (re) => {
  const s = er.find((e) => e.tags.railway === "station" && re.test(e.tags.name || ""));
  if (!s) return null;
  return s.type === "node" ? project(s.lat, s.lon) : centroid(local(s.geometry || [s.center]));
};
// closest approach between two named roads = their crossing
function crossing(reA, reB) {
  const A = roadPts(reA),
    B = roadPts(reB);
  let best = null,
    bd = Infinity;
  for (const a of A) for (const p of a) for (const b of B) for (const q of b) {
    const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    if (d < bd) (bd = d), (best = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
  }
  return best;
}
// point on a road nearest to a park
function roadNear(reRoad, pt) {
  let best = null,
    bd = Infinity;
  for (const a of roadPts(reRoad)) for (const p of a) {
    const d = (p[0] - pt[0]) ** 2 + (p[1] - pt[1]) ** 2;
    if (d < bd) (bd = d), (best = p);
  }
  return best;
}
const S = [
  ["Y29", "劍南路", station(/^劍南路$/)],
  ["Y30", "樂群二路", crossing(/^樂群二路$/, /^敬業四路$/)],
  ["Y31", "洲子二號公園", roadNear(/^瑞光路$/, parkCenter(/洲子二號/))],
  ["Y32", "大港墘公園", roadNear(/^瑞光路$/, parkCenter(/大港墘/))],
  ["Y33", "瑞光公園", crossing(/^瑞光路$/, /^陽光街321巷$/)],
  ["Y34", "舊宗路二段", crossing(/^舊宗路二段$/, /^民權東路六段$/)],
  ["Y35", "新湖一路", crossing(/^舊宗路一段$/, /^新湖一路$/)],
  ["Y36", "松山", crossing(/^松山路$/, /^松隆路$/)],
  ["Y37", "永春", crossing(/^松山路$/, /^忠孝東路五段$/)],
  ["Y38", "象山", crossing(/^松仁路$/, /^信義路五段$/)],
  ["Y39", "吳興街", crossing(/^松仁路$/, /^吳興街$/)],
  ["Y1", "動物園", station(/^動物園$/)],
].map(([id, name, p]) => {
  if (!p) throw Error(`station ${id} ${name}: no anchor found`);
  return { id, name, x: r2(p[0]), z: r2(p[1]) };
});
// via points the bureau names along the route (成美橋 between Y35 and Y36; 萬芳 vent shaft and the zoo work shaft between Y39 and Y1)
const via = {
  chengmei: (() => {
    const b = roadPts(/^成美橋$/)[0];
    return b ? centroid(b) : null;
  })(),
  wanfangShaft: project(24.9992, 121.5678), // 萬芳交流道北側通風豎井（位置示意）
  zooShaft: project(24.9985, 121.5803), // 新光路二段動物園大門前潛盾工作井
};
// works packages (捷運局工程資訊 / 開工新聞): segment between station ids, start date (null = 招標中)
const PACKAGES = [
  { id: "CF710", from: "Y29", to: "Y33", start: "2026-03-10" },
  { id: "CF720", from: "Y33", to: "Y35", start: "2026-04-17" },
  { id: "tender", from: "Y35", to: "Y37", start: null },
  { id: "CF760", from: "Y37", to: "Y39", start: "2025-10-20" },
  { id: "CF763", from: "Y39", to: "Y1", start: "2024-12-24" },
];

// ---------- iconic buildings ----------
const icons = [];
for (const e of (await json("icon-ways.json")).elements) {
  const spec = ICONS[e.id];
  if (!spec) continue;
  let ring;
  if (e.type === "way") ring = local(e.geometry);
  else ring = local(e.members.filter((m) => m.role === "outer" && m.geometry).sort((a, b) => b.geometry.length - a.geometry.length)[0].geometry);
  if (ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
  ring = simplify(ring.concat([ring[0]]), 0.02).slice(0, -1);
  icons.push({ ...spec, wall: r2(spec.wall * M), roof: r2(spec.roof * M), tower: spec.tower ? r2(spec.tower * M) : 0, outline: flat(ring) });
}

const lm = {
  icons,
  zones: Object.values(ZONES).map(([lat, lon, r]) => [...project(lat, lon).map(r2), r2((r - 60) / 100)]),
  buildings,
  dome: { ...ellipse(ways.get(442195153)), outline: flat(ways.get(442195153)) },
  t101: { center: centroid(ways.get(1159328965)) },
  nvidia: { site: flat(simplify(ways.get(1309916527), 0.02)), t16: flat(ways.get(1309916528)) },
  eastring: { stations: S, via: Object.fromEntries(Object.entries(via).map(([k, v]) => [k, v && v.map(r2)])), packages: PACKAGES },
};
await writeFile(out, JSON.stringify(lm));
console.log(`icons: ${icons.map((i) => `${i.name}(${i.outline.length / 2})`).join(" ")}`);
console.log(`landmarks: ${buildings.length} buildings, dome ${lm.dome.a}×${lm.dome.b} @${lm.dome.angle}, stations ${S.map((s) => s.id).join(" ")}`);
for (const s of S) console.log(`  ${s.id} ${s.name} ${s.x},${s.z}`);
