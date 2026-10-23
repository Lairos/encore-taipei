// The 12 districts for 我的臺北 → src/data/districts.json (bundled with the page)
// Each district: outline (local units), label point, and counts of what the map shows inside it.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { project } from "../src/scene/geo.js";

const raw = (f) => fileURLToPath(new URL(`../data-raw/${f}`, import.meta.url));
const pub = (f) => fileURLToPath(new URL(`../public/data/${f}`, import.meta.url));
const ORDER = ["中正區", "大同區", "中山區", "松山區", "大安區", "萬華區", "信義區", "士林區", "北投區", "內湖區", "南港區", "文山區"];

const eq = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
function assemble(chains) {
  const pool = chains.map((c) => c.slice());
  const rings = [];
  while (pool.length) {
    let cur = pool.pop(),
      grew = true;
    while (!eq(cur[0], cur.at(-1)) && grew) {
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
    if (cur.length > 3 && eq(cur[0], cur.at(-1))) rings.push(cur);
  }
  return rings;
}
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, Math.floor(pts.length / 2)], [Math.floor(pts.length / 2), pts.length - 1]];
  keep[Math.floor(pts.length / 2)] = 1;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a],
      [bx, bz] = pts[b];
    const len = Math.hypot(bx - ax, bz - az) || 1e-9;
    let best = -1,
      bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * (bz - az) - (pts[i][1] - az) * (bx - ax)) / len;
      if (d > best) (best = d), (bi = i);
    }
    if (best > tol) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = (r) => r.reduce((s, p, i) => s + (r[(i + 1) % r.length][0] - p[0]) * (r[(i + 1) % r.length][1] + p[1]), 0) / 2;
const inside = (pt, rings) => {
  let c = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      if (r[i][1] > pt[1] !== r[j][1] > pt[1] && pt[0] < ((r[j][0] - r[i][0]) * (pt[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
};

const osm = JSON.parse(await readFile(raw("districts.json"), "utf8"));
const geo = JSON.parse(await readFile(pub("geo.json"), "utf8"));
const renewal = JSON.parse(await readFile(pub("renewal.json"), "utf8"));

const districts = osm.elements.map((e) => {
  const chains = e.members.filter((m) => m.type === "way" && m.role === "outer" && m.geometry).map((m) => m.geometry.map((g) => project(g.lat, g.lon)));
  const rings = assemble(chains);
  const main = rings.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
  const count = (pts) => pts.filter((p) => inside(p, rings)).length;
  // label point: the vertex-average of the outline, nudged inside if needed
  let cx = main.reduce((s, p) => s + p[0], 0) / main.length,
    cz = main.reduce((s, p) => s + p[1], 0) / main.length;
  if (!inside([cx, cz], rings)) [cx, cz] = main[Math.floor(main.length / 3)];
  return {
    name: e.tags.name,
    center: [+cx.toFixed(1), +cz.toFixed(1)],
    outline: simplify(main, 0.15).map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
    stats: {
      renewal: count(renewal.cases.map((c) => [c[0], c[1]])),
      schools: count(geo.schools.map((s) => [s[0], s[1]])),
      youbike: count(geo.youbike),
    },
  };
});
districts.sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
await writeFile(fileURLToPath(new URL("../src/data/districts.json", import.meta.url)), JSON.stringify(districts));
console.log(districts.map((d) => `${d.name} 都更${d.stats.renewal} 學校${d.stats.schools} YouBike${d.stats.youbike} (${d.outline.length}pts)`).join("\n"));
