// Representative buildings, a few per district, each on its real footprint with the shape that makes it recognisable:
// 中正紀念堂 (white hall, blue octagonal roof), 總統府 (red brick and its tower), temples with swallow-tail ridges,
// 國父紀念館 (golden roof), 小巨蛋 and 南港展覽館 (curved roofs), 西門紅樓 (octagon), 美麗華摩天輪, 彩虹橋 / 關渡大橋 (red arches),
// 錦帶橋 (moon bridge) and the 貓空纜車 gondolas. Everything else in the city is the standard procedural fabric.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { U } from "./shared.js";
import { ROAD_WIDTH } from "./city.js";

const BM = 0.016 * 0.8; // metres → world units, as for the city blocks

const ringOf = (flat) => {
  const r = [];
  for (let i = 0; i < flat.length; i += 2) r.push([flat[i], flat[i + 1]]);
  return r;
};
const centroidOf = (r) => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
const scaleRing = (r, c, k) => r.map(([x, z]) => [c[0] + (x - c[0]) * k, c[1] + (z - c[1]) * k]);
const areaOf = (r) => Math.abs(r.reduce((s, p, i) => s + (r[(i + 1) % r.length][0] - p[0]) * (r[(i + 1) % r.length][1] + p[1]), 0) / 2);

function fromPositions(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
// band between two rings of the same length (walls when the rings match, roof slopes when the top one is smaller).
// bays: also write uv in window bays (u along the facade, v in storeys) for the window texture
function loft(a, y0, b, y1, bays = false) {
  const pos = [],
    uv = [];
  let run = 0;
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    pos.push(a[i][0], y0, a[i][1], a[j][0], y0, a[j][1], b[j][0], y1, b[j][1]);
    pos.push(a[i][0], y0, a[i][1], b[j][0], y1, b[j][1], b[i][0], y1, b[i][1]);
    if (bays) {
      const l = Math.hypot(a[j][0] - a[i][0], a[j][1] - a[i][1]) / (6 * BM * 0.8),
        h = (y1 - y0) / (3.8 * BM);
      uv.push(run, 0, run + l, 0, run + l, h, run, 0, run + l, h, run, h);
      run += l;
    }
  }
  const g = fromPositions(pos);
  if (bays) g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
function cap(r, y) {
  const tris = THREE.ShapeUtils.triangulateShape(
    r.map(([x, z]) => new THREE.Vector2(x, z)),
    [],
  );
  const pos = [];
  for (const [a, b, c] of tris) for (const k of [a, c, b]) pos.push(r[k][0], y, r[k][1]);
  return fromPositions(pos);
}
// triangles facing up whatever order they were listed in (roof slopes)
function upTris(list) {
  const pos = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (const [p, q, r] of list) {
    a.set(...p);
    b.set(...q);
    c.set(...r);
    const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    pos.push(...p, ...(ny >= 0 ? [q, r] : [r, q]).flat());
  }
  return fromPositions(pos);
}

// best-fit (minimum-area) rectangle: centre, long axis u, half sizes a ≥ b, and how much of it the footprint fills
function obb(r) {
  const pts = r.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [],
    upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of pts.slice().reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const [x0, z0] = hull[i],
      [x1, z1] = hull[(i + 1) % hull.length];
    const l = Math.hypot(x1 - x0, z1 - z0);
    if (l < 1e-6) continue;
    const ux = (x1 - x0) / l,
      uz = (z1 - z0) / l;
    let s0 = Infinity,
      s1 = -Infinity,
      t0 = Infinity,
      t1 = -Infinity;
    for (const [x, z] of hull) {
      const s = x * ux + z * uz,
        t = -x * uz + z * ux;
      s0 = Math.min(s0, s);
      s1 = Math.max(s1, s);
      t0 = Math.min(t0, t);
      t1 = Math.max(t1, t);
    }
    const area = (s1 - s0) * (t1 - t0);
    if (!best || area < best.area) best = { area, ux, uz, s: (s0 + s1) / 2, t: (t0 + t1) / 2, hs: (s1 - s0) / 2, ht: (t1 - t0) / 2 };
  }
  const { ux, uz, s, t, hs, ht } = best;
  const c = [s * ux - t * uz, s * uz + t * ux];
  // long axis first
  const o = hs >= ht ? { c, ux, uz, a: hs, b: ht } : { c, ux: -uz, uz: ux, a: ht, b: hs };
  o.fill = areaOf(r) / (4 * o.a * o.b);
  return o;
}
// point in the rectangle frame: s along the long axis, t across
const at = (o, s, t, y) => [o.c[0] + o.ux * s - o.uz * t, y, o.c[1] + o.uz * s + o.ux * t];

// hip roof over a rectangle (a × b) from y0 to y0 + h; the corners lift for the curved eaves of Chinese roofs
function hipRoof(o, a, b, y0, h, ridge, lift) {
  const r = Math.min(a * 0.92, Math.max(a - b, ridge * a));
  const y1 = y0 + h;
  const c = (s, t) => at(o, s, t, y0 + lift);
  const m = (s, t) => at(o, s, t, y0);
  const R0 = at(o, -r, 0, y1),
    R1 = at(o, r, 0, y1);
  const tris = [];
  for (const side of [-1, 1]) {
    // long slopes, with a midpoint on the eave so the corners can curl up
    const cL = c(-a, side * b),
      cR = c(a, side * b),
      mid = m(0, side * b);
    tris.push([cL, mid, R0], [mid, R1, R0], [mid, cR, R1]);
    // hipped ends
    const e0 = c(side * a, -b),
      e1 = c(side * a, b),
      em = m(side * a, 0),
      R = side < 0 ? R0 : R1;
    tris.push([e0, em, R], [em, e1, R]);
  }
  // underside of the eaves
  tris.push([c(-a, -b), c(a, -b), c(a, b)], [c(-a, -b), c(a, b), c(-a, b)]);
  return { geo: upTris(tris), r, y1 };
}
// sloped band between two rectangles (the lower eave of a double roof)
function band(o, a0, b0, y0, a1, b1, y1, lift) {
  const tris = [];
  const lo = [
    [-a0, -b0],
    [a0, -b0],
    [a0, b0],
    [-a0, b0],
  ];
  const hi = [
    [-a1, -b1],
    [a1, -b1],
    [a1, b1],
    [-a1, b1],
  ];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const p0 = at(o, lo[i][0], lo[i][1], y0 + lift),
      p1 = at(o, lo[j][0], lo[j][1], y0 + lift),
      mid = at(o, (lo[i][0] + lo[j][0]) / 2, (lo[i][1] + lo[j][1]) / 2, y0),
      q0 = at(o, hi[i][0], hi[i][1], y1),
      q1 = at(o, hi[j][0], hi[j][1], y1);
    tris.push([p0, mid, q0], [mid, q1, q0], [mid, p1, q1]);
  }
  return upTris(tris);
}
const rectRing = (o, a, b) => [
  [o.c[0] + o.ux * -a - o.uz * -b, o.c[1] + o.uz * -a + o.ux * -b],
  [o.c[0] + o.ux * a - o.uz * -b, o.c[1] + o.uz * a + o.ux * -b],
  [o.c[0] + o.ux * a - o.uz * b, o.c[1] + o.uz * a + o.ux * b],
  [o.c[0] + o.ux * -a - o.uz * b, o.c[1] + o.uz * -a + o.ux * b],
];
// a box along the rectangle's long axis (ridges), optionally pitched about the cross axis (swallow tails)
function beam(o, s, len, y, w, h, pitch = 0) {
  const g = new THREE.BoxGeometry(len, h, w);
  if (pitch) g.translate(len / 2, 0, 0).rotateZ(pitch);
  g.rotateY(-Math.atan2(o.uz, o.ux)).translate(...at(o, s, 0, y));
  return g;
}

// one wall bay with a window: white wall (tinted by each building's colour) by day, the window lit at night
const bayTextures = {};
function bays(night = false) {
  if (bayTextures[night]) return bayTextures[night];
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  ctx.fillStyle = night ? "#000" : "#fff";
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = night ? "#ffd59a" : "#6f8496";
  ctx.fillRect(5, 9, 22, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return (bayTextures[night] = t);
}

// SimCity scale: in the game city a small landmark grows about its own centre so it reads at district zoom
// (about 140 m across at least, at most ×2.2), as far as the main streets around it and its neighbours allow.
// The night city keeps every building at true size. Returns name → { pivot [x, z], y0, R, k }.
function exaggeration(T) {
  const groups = new Map();
  for (const ic of T.landmarks.icons) {
    if (!ic.outline) continue;
    const r = ringOf(ic.outline);
    if (!groups.has(ic.name)) groups.set(ic.name, { pts: [], y0: Infinity });
    const gr = groups.get(ic.name);
    gr.pts.push(...r);
    gr.y0 = Math.min(gr.y0, ...r.map(([x, z]) => T.groundY(x, z)));
  }
  // main-road segments, for the clearance check
  const segs = [];
  for (const rd of T.geo.roads) for (let i = 1; i + 3 < rd.length; i += 2) segs.push([rd[i], rd[i + 1], rd[i + 2], rd[i + 3], ROAD_WIDTH[rd[0]] / 2]);
  const segDist = (x, z, [x0, z0, x1, z1]) => {
    const dx = x1 - x0,
      dz = z1 - z0,
      l = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l));
    return Math.hypot(x - x0 - dx * t, z - z0 - dz * t);
  };
  const out = new Map();
  for (const [name, gr] of groups) {
    const pivot = centroidOf(gr.pts);
    const R = Math.max(...gr.pts.map(([x, z]) => Math.hypot(x - pivot[0], z - pivot[1])));
    let k = Math.min(2.2, Math.max(1, 0.7 / R));
    // keep clear of the main streets the footprint does not already cross
    for (const sg of segs) {
      const d = segDist(...pivot, sg) - sg[4] - 0.03;
      if (d > R) k = Math.min(k, d / R);
    }
    out.set(name, { pivot, y0: gr.y0 - 0.01, R, k: Math.max(1, k) });
  }
  // and of each other
  const list = [...out.values()];
  for (let pass = 0; pass < 4; pass++)
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i],
          b = list[j];
        const d = Math.hypot(a.pivot[0] - b.pivot[0], a.pivot[1] - b.pivot[1]) * 0.95;
        const need = a.k * a.R + b.k * b.R;
        if (need > d && a.R + b.R < d) {
          const f = (d - a.R - b.R) / (need - a.R - b.R);
          a.k = 1 + (a.k - 1) * f;
          b.k = 1 + (b.k - 1) * f;
        }
      }
  return out;
}
// vertex patch: grow about the landmark's pivot as the game style comes in
const GROW = (sh) => {
  sh.uniforms.uGameK = U.uGame;
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec3 aPivot; attribute float aK; uniform float uGameK;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = aPivot + (transformed - aPivot) * mix(1.0, aK, smoothstep(0.3, 0.9, uGameK));");
};
let depthMat = null;
function growDepth() {
  if (!depthMat) {
    depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depthMat.onBeforeCompile = GROW;
    depthMat.customProgramCacheKey = () => "icon-grow-depth";
  }
  return depthMat;
}

export function buildIcons(T) {
  const scale = exaggeration(T);
  let cur = { pivot: [0, 0], y0: 0, k: 1 }; // the landmark being built
  const group = new THREE.Group();
  const lit = []; // floodlit at night
  const wheels = [];
  const mats = new Map();
  const buckets = new Map();
  // one material per finish (roughness, metal, windows, sides, night glow) with the colour per vertex, so the
  // whole set of landmarks draws in a handful of calls; mat() hands back the finish and the colour together
  const mat = (color, { rough = 0.8, metal = 0, map = false, double = false, glow = 0.28 } = {}) => {
    const key = `${rough}|${metal}|${map}|${double}|${glow}`;
    if (!mats.has(key)) {
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, emissive: 0xffffff, emissiveIntensity: 0, side: double ? THREE.DoubleSide : THREE.FrontSide });
      if (map) Object.assign(m, { map: bays(), emissiveMap: bays(true) });
      // floodlit in its own colour at night (lit windows stay warm white)
      m.onBeforeCompile = (sh) => {
        GROW(sh);
        if (!map) sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;");
      };
      m.customProgramCacheKey = () => `icon-grow|${map}`;
      m.userData.glow = map ? 0.6 : glow;
      lit.push(m);
      mats.set(key, m);
    }
    return { m: mats.get(key), color: new THREE.Color(color) };
  };
  const add = (geo, { m, color }) => {
    if (!buckets.has(m)) buckets.set(m, []);
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!m.map) g.deleteAttribute("uv");
    const n = g.attributes.position.count;
    const pv = new Float32Array(n * 3),
      kk = new Float32Array(n).fill(cur.k),
      cc = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pv.set([cur.pivot[0], cur.y0, cur.pivot[1]], i * 3);
      cc.set([color.r, color.g, color.b], i * 3);
    }
    g.setAttribute("aPivot", new THREE.BufferAttribute(pv, 3));
    g.setAttribute("aK", new THREE.BufferAttribute(kk, 1));
    g.setAttribute("color", new THREE.BufferAttribute(cc, 3));
    buckets.get(m).push(g);
  };

  for (const ic of T.landmarks.icons) {
    cur = scale.get(ic.name) || { pivot: [0, 0], y0: 0, k: 1 };
    ic.k = cur.k; // read by the map labels
    if (ic.kind === "wheel") {
      wheels.push(buildWheel(T, ic, group));
      continue;
    }
    if (ic.kind === "arch") {
      buildArch(T, ic, add, mat);
      continue;
    }
    if (ic.kind === "moon") {
      buildMoon(T, ic, add, mat);
      continue;
    }
    const r = ringOf(ic.outline);
    // OpenStreetMap rings come either way round; walls need one winding to face outwards
    if (r.reduce((s, p, i) => s + (r[(i + 1) % r.length][0] - p[0]) * (r[(i + 1) % r.length][1] + p[1]), 0) < 0) r.reverse();
    const c = centroidOf(r);
    const y0 = Math.min(...r.map(([x, z]) => T.groundY(x, z))) - 0.01;
    const yw = y0 + ic.wall;
    const wallM = mat(ic.wallC, { map: !!ic.windows });
    // pitched landmark roofs are floodlit at night; flat and curved modern roofs stay dark
    const roofM = mat(ic.roofC, { rough: 0.55, metal: 0.1, double: true, glow: ic.kind === "flat" || ic.kind === "arena" ? 0.05 : 0.28 });
    add(loft(r, y0, r, yw, !!ic.windows), wallM);

    if (ic.kind === "flat") add(cap(r, yw), roofM);
    else if (ic.kind === "hip") {
      const inner = scaleRing(r, c, 0.45);
      add(loft(scaleRing(r, c, 1.06), yw, inner, yw + ic.roof), roofM);
      add(cap(inner, yw + ic.roof), roofM);
    } else if (ic.kind === "palace") {
      // lower eave, a short clerestory wall, then the upper eave rising to a ridge
      const h = ic.roof;
      add(loft(scaleRing(r, c, 1.12), yw, scaleRing(r, c, 0.84), yw + h * 0.35), roofM);
      add(loft(scaleRing(r, c, 0.8), yw + h * 0.35, scaleRing(r, c, 0.8), yw + h * 0.55), wallM);
      const top = scaleRing(r, c, 0.32);
      add(loft(scaleRing(r, c, 0.94), yw + h * 0.55, top, yw + h), roofM);
      add(cap(top, yw + h), roofM);
    } else if (ic.kind === "hall") {
      const o = obb(r);
      if (o.fill < 0.7) {
        // wings round a courtyard: a tiled flat roof is closer than one big hip over the courtyard
        add(cap(r, yw), roofM);
        add(loft(r, yw, scaleRing(r, c, 0.985), yw + ic.roof * 0.25), roofM);
      } else {
        const h = ic.roof,
          over = Math.min(0.03, o.b * 0.18),
          lift = h * 0.16;
        let top;
        if (ic.eaves === 2) {
          add(band(o, o.a + over, o.b + over, yw, o.a * 0.8, o.b * 0.8, yw + h * 0.3, lift), roofM);
          const inner = rectRing(o, o.a * 0.78, o.b * 0.78);
          add(loft(inner, yw + h * 0.28, inner, yw + h * 0.5), wallM);
          top = hipRoof(o, o.a * 0.78 + over, o.b * 0.78 + over, yw + h * 0.5, h * 0.5, ic.ridge ?? 0.5, lift * 0.8);
        } else top = hipRoof(o, o.a + over, o.b + over, yw, h, ic.ridge ?? 0.5, lift);
        add(top.geo, roofM);
        if (ic.temple || ic.accent) {
          const accentM = mat(ic.accent || ic.roofC, { rough: 0.5 });
          const t = Math.max(0.006, h * 0.08);
          add(beam(o, 0, top.r * 2 + t, top.y1 + t * 0.3, t, t), accentM);
          if (ic.temple)
            // swallow-tail ridge ends curling up and out
            for (const side of [-1, 1]) add(beam(o, side * top.r, side * t * 4, top.y1 + t * 0.4, t * 0.9, t * 0.8, side * 0.55), accentM);
        }
      }
    } else if (ic.kind === "octagon") {
      // 中正紀念堂: two tiers of blue octagonal roof over a white drum, gold finial
      const rad = Math.max(...r.map(([x, z]) => Math.hypot(x - c[0], z - c[1]))) * 0.72;
      const h = ic.roof;
      const oct = (rt, rb, hh, y, m) => add(new THREE.CylinderGeometry(rt, rb, hh, 8, 1).rotateY(Math.PI / 8).translate(c[0], y + hh / 2, c[1]), m);
      add(cap(r, yw), wallM);
      oct(rad * 0.72, rad * 1.04, h * 0.32, yw, roofM);
      oct(rad * 0.6, rad * 0.6, h * 0.16, yw + h * 0.32, wallM);
      oct(rad * 0.08, rad * 0.78, h * 0.48, yw + h * 0.48, roofM);
      add(new THREE.SphereGeometry(rad * 0.08, 10, 8).translate(c[0], yw + h * 0.98, c[1]), mat("#e8c24a", { rough: 0.3, metal: 0.6 }));
    } else if (ic.kind === "tower") {
      // 總統府: flat-roofed brick wings; the tower stands mid-way along the east (front) facade
      add(cap(r, yw), roofM);
      const east = Math.max(...r.map(([x]) => x));
      const tx = east - 0.12,
        tz = c[1];
      const tw = 0.16;
      add(new THREE.BoxGeometry(tw, ic.tower, tw).translate(tx, y0 + ic.tower / 2, tz), wallM);
      add(new THREE.BoxGeometry(tw * 1.25, 0.03, tw * 1.25).translate(tx, y0 + ic.tower * 0.82, tz), mat("#f2efe8"));
      add(new THREE.ConeGeometry(tw * 0.62, 0.12, 4).rotateY(Math.PI / 4).translate(tx, y0 + ic.tower + 0.06, tz), roofM);
    } else if (ic.kind === "drum") {
      // 西門紅樓: the cross-shaped hall, and the octagon at its east end facing the plaza
      add(cap(r, yw), roofM);
      const east = Math.max(...r.map(([x]) => x));
      const end = r.filter(([x]) => x > east - 0.22);
      const zs = end.map(([, z]) => z);
      const rad = (Math.max(...zs) - Math.min(...zs)) / 2;
      const ox = east - rad,
        oz = (Math.max(...zs) + Math.min(...zs)) / 2;
      const oct = (rt, rb, hh, y, m) => add(new THREE.CylinderGeometry(rt, rb, hh, 8, 1).rotateY(Math.PI / 8).translate(ox, y + hh / 2, oz), m);
      oct(rad, rad, ic.drum, y0, wallM);
      oct(rad * 0.25, rad * 1.08, rad * 0.55, y0 + ic.drum, roofM);
      oct(rad * 0.22, rad * 0.22, rad * 0.2, y0 + ic.drum + rad * 0.5, mat("#f2efe8"));
      oct(0.002, rad * 0.3, rad * 0.25, y0 + ic.drum + rad * 0.7, roofM);
    } else if (ic.kind === "arena") {
      // curved roof: rings drawn in towards the centre, rising on a flattened dome
      let prev = scaleRing(r, c, 1.03),
        py = yw;
      for (const k of [0.94, 0.82, 0.66, 0.46, 0.24]) {
        const ring = scaleRing(r, c, k),
          y = yw + ic.roof * Math.sqrt(1 - Math.pow(k, ic.flatness ?? 2)); // higher flatness: flatter top, rounder edge
        add(loft(prev, py, ring, y), roofM);
        prev = ring;
        py = y;
      }
      add(cap(prev, py), roofM);
    }
  }

  // 貓空纜車
  cur = { pivot: [0, 0], y0: 0, k: 1 };
  const gondola = T.landmarks.gondola ? buildGondola(T, T.landmarks.gondola, add, mat, group) : null;

  for (const [m, geos] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.customDepthMaterial = growDepth();
    group.add(mesh);
  }
  return {
    group,
    // ground the city blocks must keep clear of: footprints (bridges and the cable car excepted);
    // round the low historic buildings the blocks stay low too, so a temple is not lost among towers
    // (at their game size, so the grown landmark has room)
    exclusions: [...scale].map(([name, { pivot, R, k }]) => {
      const ic = T.landmarks.icons.find((i) => i.name === name);
      const rad = R * k + 0.12;
      return { x: pivot[0], z: pivot[1], r: rad, low: (ic.wall || 0) + (ic.roof || 0) < 40 * BM ? rad + 1.4 : 0 };
    }),
    update() {
      for (const m of lit) m.emissiveIntensity = m.userData.glow * U.uNight.value;
      for (const w of wheels) w.light(U.uNight.value);
    },
    animate(dt) {
      for (const w of wheels) w.spin(dt);
      gondola?.run(dt);
    },
  };
}
// ---------- 美麗華摩天輪: 70 m wheel on the mall roof, top at 100 m; turning, lit in colours at night ----------
function buildWheel(T, ic, group) {
  const [x, z] = ic.at;
  const y = T.groundY(x, z);
  const R = ic.diameter / 2,
    cy = y + ic.height - R;
  const yaw = 0.35; // the wheel's face turned towards the river
  const frameM = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.5, metalness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 });
  const rimM = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.4, metalness: 0.3, emissive: 0xff5fa8, emissiveIntensity: 0 });
  const hub = new THREE.Group();
  hub.position.set(x, cy, z);
  hub.rotation.y = yaw;
  const rotor = new THREE.Group();
  hub.add(rotor);
  rotor.add(new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.025, 6, 72), rimM));
  rotor.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.9, R * 0.012, 4, 72), frameM));
  const spokes = [];
  for (let i = 0; i < 16; i++) spokes.push(new THREE.BoxGeometry(R * 0.012, R, R * 0.012).translate(0, R / 2, 0).rotateZ((i / 16) * Math.PI * 2));
  rotor.add(new THREE.Mesh(mergeGeometries(spokes), frameM));
  hub.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.06, R * 0.06, R * 0.3, 12).rotateX(Math.PI / 2), frameM));
  // A-frame legs down to the roof on both sides of the wheel
  const roofY = y + ic.height - 2 * R - 0.01;
  const legs = [];
  for (const side of [-1, 1])
    for (const lean of [-1, 1]) {
      const foot = new THREE.Vector3(lean * R * 0.45, roofY - cy, side * R * 0.16),
        top = new THREE.Vector3(0, 0, side * R * 0.12);
      const g = new THREE.BoxGeometry(R * 0.035, R * 0.035, foot.distanceTo(top)).translate(0, 0, foot.distanceTo(top) / 2);
      g.lookAt(new THREE.Vector3().subVectors(foot, top));
      legs.push(g.translate(top.x, top.y, top.z));
    }
  const legMesh = new THREE.Mesh(mergeGeometries(legs), frameM);
  hub.add(legMesh);
  // cabins hang level, so they are placed every frame rather than turned with the rotor
  const N = 48;
  const cabins = new THREE.InstancedMesh(new THREE.BoxGeometry(R * 0.07, R * 0.09, R * 0.07), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0 }), N);
  const palette = ["#ff5d73", "#ffb238", "#ffe14d", "#5cd68a", "#38b6ff", "#9b7bff"].map((h) => new THREE.Color(h));
  for (let i = 0; i < N; i++) cabins.setColorAt(i, palette[i % palette.length]);
  hub.add(cabins);
  for (const o of [...rotor.children, legMesh, cabins]) o.castShadow = true;
  group.add(hub);
  let angle = 0;
  const m = new THREE.Matrix4();
  const place = () => {
    for (let i = 0; i < N; i++) {
      const a = angle + (i / N) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * R, Math.sin(a) * R - R * 0.06, 0);
      cabins.setMatrixAt(i, m);
    }
    cabins.instanceMatrix.needsUpdate = true;
    rotor.rotation.z = angle;
  };
  place();
  return {
    spin(dt) {
      angle += dt * ((Math.PI * 2) / 120); // a turn every two minutes (the real one takes about 17)
      place();
    },
    light(n) {
      rimM.emissiveIntensity = 1.6 * n;
      frameM.emissiveIntensity = 0.15 * n;
      cabins.material.emissiveIntensity = 0.35 * n;
    },
  };
}

// polyline helpers for bridges and the cable car
function lengths(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return acc;
}
function sample(pts, acc, s) {
  let i = 1;
  while (i < pts.length - 1 && acc[i] < s) i++;
  const t = Math.min(1, Math.max(0, (s - acc[i - 1]) / (acc[i] - acc[i - 1] || 1)));
  const [x0, z0] = pts[i - 1],
    [x1, z1] = pts[i];
  const l = Math.hypot(x1 - x0, z1 - z0) || 1;
  return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, dx: (x1 - x0) / l, dz: (z1 - z0) / l };
}

// ---------- arch bridges: deck along the real centre line, red arch ribs over the main span, hangers ----------
function buildArch(T, ic, add, mat) {
  const pts = ringOf(ic.line);
  const acc = lengths(pts),
    L = acc.at(-1);
  const span = ic.span === 1 ? L : Math.min(L, ic.span);
  const s0 = (L - span) / 2;
  const yA = T.groundY(...pts[0]),
    yB = T.groundY(...pts.at(-1));
  // water level: the lowest ground along the bridge (rivers sit near sea level, 大湖 well above it)
  const waterY = Math.min(
    ...Array.from({ length: 21 }, (_, k) => {
      const p = sample(pts, acc, (L * k) / 20);
      return T.groundY(p.x, p.z);
    }),
  );
  const deckMid = waterY + ic.deck;
  // deck rises from each bank to its height over the water
  const deckY = (s) => {
    const u = s / L;
    const ramp = Math.min(1, Math.min(s, L - s) / Math.max(0.6, L * 0.15));
    return THREE.MathUtils.lerp(u < 0.5 ? yA : yB, Math.max(deckMid, yA, yB), THREE.MathUtils.smootherstep(ramp, 0, 1));
  };
  const steps = Math.max(24, Math.ceil(L / 0.04));
  const w = ic.width / 2;
  const deck = [],
    ribs = [[], []];
  const ribCount = ic.span === 1 ? 1 : 2;
  for (let k = 0; k <= steps; k++) {
    const s = (L * k) / steps;
    const p = sample(pts, acc, s);
    const nx = -p.dz,
      nz = p.dx;
    const y = deckY(s);
    deck.push([p.x + nx * w, y, p.z + nz * w, p.x - nx * w, y, p.z - nz * w]);
    const u = (s - s0) / span;
    if (u >= -1e-6 && u <= 1 + 1e-6) {
      // half-through: the ribs spring a little below the deck and peak at deck + rise
      const ry = y - ic.rise * 0.18 + ic.rise * 1.18 * 4 * u * (1 - u);
      if (ribCount === 1) ribs[0].push(new THREE.Vector3(p.x, ry, p.z));
      else for (const [i, sd] of [[0, 1], [1, -1]]) ribs[i].push(new THREE.Vector3(p.x + nx * w * sd * 0.92, ry, p.z + nz * w * sd * 0.92));
    }
  }
  // deck slab: top, underside and edges
  const pos = [];
  const th = 0.012;
  for (let k = 0; k < steps; k++) {
    const [ax, ay, az, bx, by, bz] = deck[k],
      [cx, cy, cz, dx, dy, dz] = deck[k + 1];
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, bx, by, bz, dx, dy, dz, cx, cy, cz);
    pos.push(ax, ay - th, az, cx, cy - th, cz, bx, by - th, bz, bx, by - th, bz, cx, cy - th, cz, dx, dy - th, dz);
    pos.push(ax, ay, az, cx, cy, cz, ax, ay - th, az, cx, cy, cz, cx, cy - th, cz, ax, ay - th, az);
    pos.push(bx, by, bz, bx, by - th, bz, dx, dy, dz, dx, dy, dz, bx, by - th, bz, dx, dy - th, dz);
  }
  add(fromPositions(pos), mat("#9a9c9f", { double: true, glow: 0.12 }));
  const red = mat(ic.color, { rough: 0.45, metal: 0.2, glow: 0.6 });
  const rad = Math.max(0.008, ic.rise * 0.05);
  for (const rib of ribs.slice(0, ribCount)) {
    if (rib.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(rib);
    add(new THREE.TubeGeometry(curve, rib.length * 2, rad, 6, false), red);
    // hangers from the rib down to the deck where the rib is above it
    for (let i = 1; i < rib.length - 1; i += 2) {
      const p = rib[i];
      const s = s0 + (span * i) / (rib.length - 1);
      const dy = p.y - deckY(s);
      if (dy > rad * 2) add(new THREE.CylinderGeometry(rad * 0.18, rad * 0.18, dy, 4).translate(p.x, p.y - dy / 2, p.z), red);
    }
  }
  if (ribCount === 2)
    // cross braces between the two ribs near the crown
    for (let i = Math.floor(ribs[0].length * 0.3); i < ribs[0].length * 0.7; i += 3) {
      const a = ribs[0][i],
        b = ribs[1][i];
      const len = a.distanceTo(b);
      const g = new THREE.BoxGeometry(rad, rad, len);
      g.lookAt(new THREE.Vector3().subVectors(b, a));
      add(g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), red);
    }
  // piers under the approach spans
  const pierM = mat("#b9b6ae", { glow: 0.1 });
  for (let s = 0.25; s < L - 0.1; s += 0.45) {
    if (s > s0 - 0.1 && s < s0 + span + 0.1) continue;
    const p = sample(pts, acc, s);
    const top = deckY(s) - th;
    const base = Math.min(T.groundY(p.x, p.z), waterY) - 0.05;
    if (top - base > 0.04) add(new THREE.BoxGeometry(w * 1.4, top - base, 0.03).rotateY(-Math.atan2(p.dz, p.dx)).translate(p.x, (top + base) / 2, p.z), pierM);
  }
}

// ---------- 錦帶橋: a round "moon bridge" whose arch and reflection make a full circle ----------
function buildMoon(T, ic, add, mat) {
  const [[x0, z0], [x1, z1]] = ringOf(ic.line);
  const L = Math.hypot(x1 - x0, z1 - z0);
  const base = T.groundY((x0 + x1) / 2, (z0 + z1) / 2) - 0.01;
  const R = L * 0.32,
    ry = Math.max(R * 1.28, ic.rise * 0.85),
    top = base + Math.max(ic.rise, ry + 0.02);
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, base + 0.004);
  for (let i = 1; i <= 16; i++) {
    const u = -0.5 + i / 16;
    shape.lineTo(u * L, base + 0.004 + (top - base) * Math.sqrt(Math.max(0, 1 - (2 * u) ** 2)) ** 0.6);
  }
  shape.lineTo(R, base);
  for (let i = 1; i < 24; i++) {
    const a = (i / 24) * Math.PI;
    shape.lineTo(Math.cos(a) * R, base + Math.sin(a) * ry);
  }
  shape.lineTo(-R, base);
  const g = new THREE.ExtrudeGeometry(shape, { depth: ic.width, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -ic.width / 2);
  g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  add(g, mat(ic.color, { rough: 0.7, glow: 0.4 }));
}

// ---------- 貓空纜車: towers on the real line, two cables, cabins running both ways between the stations ----------
function buildGondola(T, gd, add, mat, group) {
  const pts = ringOf(gd.line);
  const stations = new Map(gd.stations.map((s) => [s.i, s]));
  const towerH = 24 * BM,
    stationH = 9 * BM,
    gap = 0.035;
  const towerM = mat("#7d858c", { metal: 0.4, rough: 0.5, glow: 0.1 });
  const stationM = mat("#eef1f2", { glow: 0.4 });
  const stationRoof = mat("#3aa6a0", { double: true, glow: 0.3 });
  const tops = pts.map(([x, z], i) => {
    const g = T.groundY(x, z);
    if (stations.has(i)) {
      const prev = pts[Math.max(0, i - 1)],
        next = pts[Math.min(pts.length - 1, i + 1)];
      const yaw = -Math.atan2(next[1] - prev[1], next[0] - prev[0]);
      add(new THREE.BoxGeometry(0.2, stationH, 0.12).rotateY(yaw).translate(x, g + stationH / 2, z), stationM);
      add(new THREE.CylinderGeometry(0.001, 0.13, 0.05, 4, 1).rotateY(Math.PI / 4).scale(1.1, 1, 0.75).rotateY(yaw).translate(x, g + stationH + 0.025, z), stationRoof);
      return g + stationH * 0.7;
    }
    add(new THREE.CylinderGeometry(0.006, 0.012, towerH, 4).translate(x, g + towerH / 2, z), towerM);
    const prev = pts[Math.max(0, i - 1)],
      next = pts[Math.min(pts.length - 1, i + 1)];
    add(new THREE.BoxGeometry(0.008, 0.008, gap * 2.6).rotateY(-Math.atan2(next[1] - prev[1], next[0] - prev[0])).translate(x, g + towerH, z), towerM);
    return g + towerH;
  });
  // cable paths (sagging between towers), one each side of the line
  const acc = lengths(pts);
  const paths = [[], []];
  for (let i = 0; i < pts.length - 1; i++) {
    const [xa, za] = pts[i],
      [xb, zb] = pts[i + 1];
    const l = Math.hypot(xb - xa, zb - za) || 1;
    const nx = -(zb - za) / l,
      nz = (xb - xa) / l;
    for (let k = 0; k < 8; k++) {
      const u = k / 8;
      const y = tops[i] + (tops[i + 1] - tops[i]) * u - 0.06 * l * u * (1 - u);
      for (const [j, sd] of [[0, 1], [1, -1]]) paths[j].push(new THREE.Vector3(xa + (xb - xa) * u + nx * gap * sd, y, za + (zb - za) * u + nz * gap * sd));
    }
  }
  const [xe, ze] = pts.at(-1);
  const n = pts.length,
    l = Math.hypot(xe - pts[n - 2][0], ze - pts[n - 2][1]) || 1;
  for (const [j, sd] of [[0, 1], [1, -1]]) paths[j].push(new THREE.Vector3(xe - ((ze - pts[n - 2][1]) / l) * gap * sd, tops.at(-1), ze + ((xe - pts[n - 2][0]) / l) * gap * sd));
  const lineGeo = new THREE.BufferGeometry().setFromPoints(paths.flatMap((p) => p.slice(1).flatMap((v, i) => [p[i], v])));
  group.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x3b4146, transparent: true, opacity: 0.8 })));
  // cabins, evenly spaced, uphill on one cable and downhill on the other
  const curves = paths.map((p) => {
    const d = [0];
    for (let i = 1; i < p.length; i++) d.push(d[i - 1] + p[i].distanceTo(p[i - 1]));
    return { p, d, L: d.at(-1) };
  });
  const per = Math.round(acc.at(-1) / 0.22);
  const cabins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.032, 0.03), new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: 0xfff2c0, emissiveIntensity: 0 }), per * 2);
  const colors = ["#2fb3a8", "#2fb3a8", "#f2c84b"].map((h) => new THREE.Color(h)); // mostly the green-teal cabins, some 貓纜之眼 crystal cabins
  for (let i = 0; i < per * 2; i++) cabins.setColorAt(i, colors[i % 3]);
  cabins.castShadow = true;
  group.add(cabins);
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let t = 0;
  const pointAt = (c, s) => {
    s = ((s % c.L) + c.L) % c.L;
    let i = 1;
    while (i < c.d.length - 1 && c.d[i] < s) i++;
    return v.lerpVectors(c.p[i - 1], c.p[i], (s - c.d[i - 1]) / (c.d[i] - c.d[i - 1] || 1));
  };
  const run = (dt) => {
    t += dt * 0.12;
    for (let k = 0; k < per; k++) {
      for (const [j, dir] of [[0, 1], [1, -1]]) {
        const c = curves[j];
        const p = pointAt(c, dir * t + (k / per) * c.L);
        m.makeTranslation(p.x, p.y - 0.03, p.z);
        cabins.setMatrixAt(k * 2 + j, m);
      }
    }
    cabins.instanceMatrix.needsUpdate = true;
    cabins.material.emissiveIntensity = 0.5 * U.uNight.value;
  };
  run(0);
  return { run };
}
