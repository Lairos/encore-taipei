// Real geometry for the hand-made landmarks → public/data/landmarks.json
//   icons      representative buildings, a few per district, on their OpenStreetMap footprints (the scene gives each its roof)
//   parks      parks and open grounds: no city blocks there, lawns and trees in the game city
//   outlines   臺北大巨蛋, 臺北101, 輝達 Constellation site (T17/T18), 金仁寶 T16
//   eastring   環狀線東環段 stations Y29–Y39 + Y1, placed where 捷運局 describes them (road crossings, parks)
//   gondola    貓空纜車: towers (the way's vertices) and stations
// Everything else in the city is the procedural standard fabric.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { project } from "../src/scene/geo.js";

const raw = (f) => fileURLToPath(new URL(`../data-raw/${f}`, import.meta.url));
const out = fileURLToPath(new URL("../public/data/landmarks.json", import.meta.url));
const json = async (f) => JSON.parse(await readFile(raw(f), "utf8"));
const r2 = (v) => Math.round(v * 100) / 100;
const M = 0.016 * 0.8; // metres → world units for buildings (same exaggeration as the procedural city)

// Representative buildings by district, keyed by OpenStreetMap id. Heights in metres (wall to the eaves, roof above that).
// kind: flat | hip | palace (roof following the footprint) | hall (hip roof on the best-fit rectangle; eaves 1 or 2, temple ridge)
//       octagon (中正紀念堂) | tower (總統府) | drum (西門紅樓) | arena (curved roof) | wheel | arch | moon (bridges)
// Where a figure is not published (some roof heights, bridge rises) it is estimated from photos; the shapes are drawn, not surveyed.
const TEMPLE = { kind: "hall", temple: true, wallC: "#a8382a", roofC: "#d4802e", accent: "#2f9e93" };
const CONFUCIUS = { kind: "hall", wallC: "#a8402c", roofC: "#cf8a33", accent: "#8a4a22" };
const ICONS = {
  // 中正區
  1052759757: { name: "中正紀念堂", district: "中正區", wall: 30, roof: 40, kind: "octagon", wallC: "#f4f2ec", roofC: "#2f5fb3" },
  1052759775: { name: "國家音樂廳", district: "中正區", wall: 22, roof: 14, kind: "palace", wallC: "#b8402f", roofC: "#e2a62a" },
  1052759776: { name: "國家戲劇院", district: "中正區", wall: 22, roof: 14, kind: "palace", wallC: "#b8402f", roofC: "#e2a62a" },
  23641610: { name: "臺北車站", district: "中正區", wall: 24, roof: 10, kind: "hip", wallC: "#e6dccb", roofC: "#6e5a4c" },
  206817: { name: "總統府", district: "中正區", wall: 24, roof: 0, kind: "tower", wallC: "#b65a3f", roofC: "#8e3d2c", tower: 60 },
  // 中山區
  25202548: { name: "圓山大飯店", district: "中山區", wall: 60, roof: 24, kind: "palace", wallC: "#c0392b", roofC: "#e0952b" }, // 主樓 (14F, ~87 m)
  155816458: { name: "美麗華百樂園", district: "中山區", wall: 28, roof: 0, kind: "flat", wallC: "#efe3cf", roofC: "#b9b3a8", windows: true },
  5121602758: { name: "美麗華摩天輪", district: "中山區", kind: "wheel", height: 100, diameter: 70 },
  // 信義區 (臺北101 and 大巨蛋 are policy landmarks with their own models)
  142113976: { name: "臺北市政府", district: "信義區", wall: 48, roof: 0, kind: "flat", wallC: "#ece6d8", roofC: "#a9aaa6", windows: true },
  189788192: { name: "國父紀念館", district: "信義區", wall: 16, roof: 15, kind: "hall", eaves: 1, ridge: 0.4, wallC: "#f1e9d8", roofC: "#e9b52f", accent: "#c98f1c", grounds: [380, 330, "plaza"] }, // 30.4 m, golden roof; 中山公園 around it
  // 萬華區
  198401479: { name: "艋舺龍山寺", district: "萬華區", ...TEMPLE, wall: 8, roof: 10, eaves: 2 }, // 正殿
  198401472: { name: "艋舺龍山寺", district: "萬華區", ...TEMPLE, wall: 7, roof: 7, eaves: 1 }, // 前殿
  198401478: { name: "艋舺龍山寺", district: "萬華區", ...TEMPLE, wall: 7, roof: 6, eaves: 1 }, // 後殿與護龍
  222080307: { name: "西門紅樓", district: "萬華區", wall: 10, roof: 0, kind: "drum", drum: 15, wallC: "#b5533c", roofC: "#4b4440" },
  // 大同區
  281746874: { name: "臺北孔廟", district: "大同區", ...CONFUCIUS, wall: 8, roof: 9, eaves: 2 }, // 大成殿
  281746876: { name: "臺北孔廟", district: "大同區", ...CONFUCIUS, wall: 5, roof: 4, eaves: 1 }, // 東廡
  281746878: { name: "臺北孔廟", district: "大同區", ...CONFUCIUS, wall: 5, roof: 4, eaves: 1 }, // 西廡
  281746881: { name: "臺北孔廟", district: "大同區", ...CONFUCIUS, wall: 6, roof: 5, eaves: 1 }, // 儀門
  281746882: { name: "臺北孔廟", district: "大同區", ...CONFUCIUS, wall: 6, roof: 5, eaves: 1 }, // 櫺星門
  281746873: { name: "臺北孔廟", district: "大同區", ...CONFUCIUS, wall: 6, roof: 5, eaves: 1 }, // 崇聖祠
  281746880: { name: "臺北孔廟", district: "大同區", ...CONFUCIUS, wall: 5, roof: 4, eaves: 1 }, // 弘道祠
  461776386: { name: "臺北孔廟", district: "大同區", ...CONFUCIUS, wall: 5, roof: 4, eaves: 1 },
  461776387: { name: "臺北孔廟", district: "大同區", ...CONFUCIUS, wall: 5, roof: 4, eaves: 1 },
  461776388: { name: "臺北孔廟", district: "大同區", ...CONFUCIUS, wall: 5, roof: 4, eaves: 1 },
  281746884: { name: "臺北孔廟", district: "大同區", kind: "flat", wall: 5, roof: 0, wallC: "#a8402c", roofC: "#cf8a33" }, // 萬仞宮牆
  1463082589: { name: "大龍峒保安宮", district: "大同區", ...TEMPLE, wall: 8, roof: 9, eaves: 2 },
  1462829501: { name: "大龍峒保安宮", district: "大同區", ...TEMPLE, wall: 6, roof: 5, eaves: 1 },
  // 松山區 (松山機場 is a policy landmark)
  244001544: { name: "臺北小巨蛋", district: "松山區", wall: 20, roof: 14, kind: "arena", flatness: 6, wallC: "#7f97ab", roofC: "#dfe3e6" },
  1004055337: { name: "彩虹橋", district: "松山區", kind: "arch", deck: 8, rise: 20, span: 1, color: "#d6342b" }, // 167 m S-shaped arch, walkers and bikes
  // 士林區
  203799171: { name: "國立故宮博物院", district: "士林區", wall: 18, roof: 12, kind: "palace", wallC: "#efe7d3", roofC: "#6fae86" }, // 正館, light-green glazed tiles
  // 北投區
  256190307: { name: "北投溫泉博物館", district: "北投區", wall: 9, roof: 5, kind: "hip", wallC: "#a85a43", roofC: "#5f6670" },
  560811571: { name: "關渡大橋", district: "北投區", kind: "arch", deck: 16, rise: 42, span: 165, color: "#d33a2c" }, // half-through steel arch, main span 165 m
  // 內湖區
  62149553: { name: "錦帶橋", district: "內湖區", kind: "moon", rise: 9, color: "#f1ede4" }, // 大湖公園's round "moon bridge"
  // 南港區
  73567706: { name: "南港展覽館", district: "南港區", wall: 30, roof: 10, kind: "arena", flatness: 4, wallC: "#8fb3cc", roofC: "#e6e8ea" },
  558011740: { name: "南港展覽館", district: "南港區", wall: 30, roof: 7, kind: "arena", flatness: 4, wallC: "#e9edf0", roofC: "#c9d2da" },
};
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

// ---------- representative buildings ----------
const same = (a, b) => a.lat === b.lat && a.lon === b.lon;
// outer rings of a multipolygon, joining member ways end to end
function outerRings(members) {
  const open = members.filter((m) => m.role === "outer" && m.geometry).map((m) => m.geometry.slice());
  const rings = [];
  while (open.length) {
    let cur = open.pop();
    while (!same(cur[0], cur.at(-1))) {
      const i = open.findIndex((w) => same(w[0], cur.at(-1)) || same(w.at(-1), cur.at(-1)));
      if (i < 0) break;
      const w = open.splice(i, 1)[0];
      cur = cur.concat((same(w[0], cur.at(-1)) ? w : w.reverse()).slice(1));
    }
    if (same(cur[0], cur.at(-1))) rings.push(cur);
  }
  return rings;
}
const closedRing = (geom, tol) => {
  let ring = local(geom);
  if (ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
  return simplify(ring.concat([ring[0]]), tol).slice(0, -1);
};
// a bridge polygon → its centre line (vertices binned along the main axis) and mean width
function centreLine(ring, bins) {
  const c = centroid(ring);
  let sxx = 0, szz = 0, sxz = 0;
  for (const [x, z] of ring) (sxx += (x - c[0]) ** 2), (szz += (z - c[1]) ** 2), (sxz += (x - c[0]) * (z - c[1]));
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(ang), uz = Math.sin(ang);
  const t = ring.map(([x, z]) => (x - c[0]) * ux + (z - c[1]) * uz);
  const t0 = Math.min(...t), t1 = Math.max(...t);
  const line = [], widths = [];
  for (let b = 0; b < bins; b++) {
    const lo = t0 + ((t1 - t0) * b) / bins, hi = t0 + ((t1 - t0) * (b + 1)) / bins;
    const pts = ring.filter((_, i) => t[i] >= lo - 1e-9 && t[i] <= hi + 1e-9);
    if (!pts.length) continue;
    const m = centroid(pts);
    line.push(m);
    if (pts.length > 1) widths.push(Math.max(...pts.map(([x, z]) => Math.abs(-(x - m[0]) * uz + (z - m[1]) * ux))) * 2);
  }
  // stretch the ends out to the polygon's extremes
  const shift = (p, to) => {
    const tp = (p[0] - c[0]) * ux + (p[1] - c[1]) * uz;
    return [p[0] + ux * (to - tp), p[1] + uz * (to - tp)];
  };
  line[0] = shift(line[0], t0);
  line[line.length - 1] = shift(line.at(-1), t1);
  return { line, width: widths.length ? widths.sort((a, b) => a - b)[widths.length >> 1] : 0.05 };
}

const icons = [];
const parks = [];
for (const e of (await json("icons.json")).elements) {
  const spec = ICONS[e.id];
  if (!spec) continue;
  const { grounds, ...rest } = spec;
  const ic = { ...rest, osm: `${e.type}/${e.id}` };
  for (const k of ["wall", "roof", "tower", "drum", "height", "diameter", "deck", "rise"]) if (spec[k] !== undefined) ic[k] = r2(spec[k] * M);
  if (spec.span !== undefined) ic.span = spec.span > 1 ? r2(spec.span / 100) : 1; // metres → units, or 1 = the whole bridge
  if (e.type === "node") ic.at = project(e.lat, e.lon).map(r2);
  else if (spec.kind === "moon") {
    ic.line = flat(local(e.geometry));
    ic.width = 0.05;
  } else {
    const ring = e.type === "way" ? closedRing(e.geometry, 0.02) : closedRing(outerRings(e.members).sort((a, b) => b.length - a.length)[0], 0.02);
    if (spec.kind === "arch") {
      const { line, width } = centreLine(closedRing(e.geometry, 0.005), spec.span > 1 ? 24 : 12);
      ic.line = flat(line);
      ic.width = r2(Math.max(0.04, width));
    } else ic.outline = flat(ring);
    // open grounds around the building: a rectangle (metres) painted as a plaza
    if (grounds) {
      const [cx, cz] = centroid(ring), hw = grounds[0] / 200, hd = grounds[1] / 200;
      parks.push([1, ...flat([[cx - hw, cz - hd], [cx + hw, cz - hd], [cx + hw, cz + hd], [cx - hw, cz + hd]])]);
    }
  }
  icons.push(ic);
}

// ---------- parks (type 0 lawn, 1 plaza: paved with trees round the edge) ----------
const PLAZAS = new Set([1506269, 237121375]); // 中正紀念公園 (自由廣場) and 艋舺公園 are mostly paved
for (const e of (await json("parks.json")).elements) {
  const rings = e.type === "way" ? [e.geometry] : outerRings(e.members);
  for (const g of rings) {
    if (g.length < 4 || !same(g[0], g.at(-1))) continue;
    const ring = closedRing(g, 0.03);
    if (ring.length < 3 || Math.abs(area(ring)) < 0.4) continue; // < 0.4 ha
    parks.push([PLAZAS.has(e.id) ? 1 : 0, ...flat(ring)]);
  }
}

// ---------- 貓空纜車 ----------
const gw = (await json("gondola.json")).elements;
const cable = local(gw.find((e) => e.type === "way").geometry);
const gondola = {
  line: flat(cable),
  stations: gw
    .filter((e) => e.type === "node")
    .map((e) => {
      const [x, z] = project(e.lat, e.lon);
      let i = 0;
      cable.forEach(([cx, cz], k) => (cx - x) ** 2 + (cz - z) ** 2 < (cable[i][0] - x) ** 2 + (cable[i][1] - z) ** 2 && (i = k));
      return { name: e.tags.name, i };
    })
    .sort((a, b) => a.i - b.i),
};

const lm = {
  icons,
  parks,
  gondola,
  dome: { ...ellipse(ways.get(442195153)), outline: flat(ways.get(442195153)) },
  t101: { center: centroid(ways.get(1159328965)) },
  nvidia: { site: flat(simplify(ways.get(1309916527), 0.02)), t16: flat(ways.get(1309916528)) },
  eastring: { stations: S, via: Object.fromEntries(Object.entries(via).map(([k, v]) => [k, v && v.map(r2)])), packages: PACKAGES },
};
await writeFile(out, JSON.stringify(lm));
const byDistrict = {};
for (const i of icons) (byDistrict[i.district] ??= new Set()).add(i.name);
for (const [d, names] of Object.entries(byDistrict)) console.log(`  ${d}: ${[...names].join("、")}`);
console.log(`icons ${icons.length}, parks ${parks.length}, gondola ${cable.length} towers / ${gondola.stations.map((s) => s.name).join(" ")}`);
console.log(`dome ${lm.dome.a}×${lm.dome.b} @${lm.dome.angle}, stations ${S.map((s) => s.id).join(" ")}`);
