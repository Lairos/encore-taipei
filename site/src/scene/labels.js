// Map labels for the game city: district names when zoomed out, the representative buildings' names when zoomed in.
// Plain DOM over the canvas (sharp at any size, untouched by the tilt-shift blur); labels that would overlap one
// already placed, or a policy pin, are skipped for that frame. Clicking one flies there.
import * as THREE from "three";
import { smooth } from "./shared.js";
import DISTRICTS from "../data/districts.json";

const BM = 0.016 * 0.8; // metres → world units for buildings

const ringOf = (flat) => {
  const r = [];
  for (let i = 0; i < flat.length; i += 2) r.push([flat[i], flat[i + 1]]);
  return r;
};
// where a ring crosses the row z, left to right: inside lies between each pair
const crossings = (z, r) => {
  const xs = [];
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z) xs.push(((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]);
  return xs.sort((a, b) => a - b);
};

// where a district's name goes: the middle of its built-up part (北投, 士林 and 南港 are mostly mountain),
// snapped to a built-up point so an L-shaped district still gets its label on itself
function districtPoint(T, d) {
  const xs = d.outline.map((p) => p[0]),
    zs = d.outline.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const pts = [];
  // row by row, sampling only inside the outline (a point-in-polygon test per sample is slow on a phone)
  for (let z = Math.min(...zs); z < Math.max(...zs); z += 0.8) {
    const c = crossings(z, d.outline);
    for (let k = 0; k + 1 < c.length; k += 2)
      for (let x = x0 + Math.ceil((c[k] - x0) / 0.8) * 0.8; x < c[k + 1]; x += 0.8) if (T.inCity(x, z) && !T.isWater(x, z) && T.elev(x, z) < 60) pts.push([x, z]);
  }
  if (!pts.length) return new THREE.Vector3(d.center[0], T.groundY(...d.center), d.center[1]);
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length,
    mz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const [x, z] = pts.reduce((b, p) => ((p[0] - mx) ** 2 + (p[1] - mz) ** 2 < (b[0] - mx) ** 2 + (b[1] - mz) ** 2 ? p : b));
  return new THREE.Vector3(x, T.groundY(x, z), z);
}

// one label per named place: the parts of a temple or an exhibition centre share one, placed over the tallest part
function placesOf(T) {
  const lm = T.landmarks;
  const byName = new Map();
  const put = (name, district, x, z, top) => {
    const e = byName.get(name) || { name, district, xs: [], zs: [], top: 0 };
    e.xs.push(x);
    e.zs.push(z);
    e.top = Math.max(e.top, top);
    byName.set(name, e);
  };
  for (const ic of lm.icons) {
    if (ic.label === false) continue; // parts of a larger landmark (the 大巨蛋 complex)
    if (ic.at) put(ic.name, ic.district, ...ic.at, T.groundY(...ic.at) + ic.height);
    else if (ic.line) {
      const n = ic.line.length;
      const x = (ic.line[0] + ic.line[n - 2]) / 2,
        z = (ic.line[1] + ic.line[n - 1]) / 2;
      put(ic.name, ic.district, x, z, T.groundY(x, z) + (ic.deck || 0) + ic.rise);
    } else {
      const r = ringOf(ic.outline);
      const x = r.reduce((s, p) => s + p[0], 0) / r.length,
        z = r.reduce((s, p) => s + p[1], 0) / r.length;
      // landmarks grow in the game city (icons.js sets k), and the labels only show there
      put(ic.name, ic.district, x, z, T.groundY(x, z) + (ic.wall + (ic.roof || 0) + (ic.tower || 0)) * (ic.k || 1));
    }
  }
  const [tx, tz] = lm.t101.center;
  put("臺北101", "信義區", tx, tz, T.groundY(tx, tz) + 508 * BM);
  for (const p of lm.places || []) put(p.name, p.district, ...p.at, T.groundY(...p.at) + 0.2);
  if (lm.gondola) {
    const g = ringOf(lm.gondola.line);
    const [x, z] = g[Math.floor(g.length / 2)];
    put("貓空纜車", "文山區", x, z, T.groundY(x, z) + 0.4);
  }
  return [...byName.values()].map((e) => {
    const x = e.xs.reduce((s, v) => s + v, 0) / e.xs.length,
      z = e.zs.reduce((s, v) => s + v, 0) / e.zs.length;
    // taller first wins a clash; 101 above all
    return { name: e.name, district: e.district, p: new THREE.Vector3(x, e.top + 0.05, z), base: T.groundY(x, z), priority: e.name === "臺北101" ? 1e9 : e.top };
  });
}

// what a click on a district name shows: its densest group of representative buildings, framed so their names show
function districtFocus(places, fallback) {
  if (!places.length) return { p: fallback, span: 10 };
  const near = (a, b) => Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z) < 10;
  const best = places.reduce((b, q) => (places.filter((o) => near(q, o)).length > places.filter((o) => near(b, o)).length ? q : b));
  const group = places.filter((o) => near(best, o));
  const p = new THREE.Vector3();
  for (const o of group) p.add(o.p);
  p.divideScalar(group.length).setY(Math.min(...group.map((o) => o.p.y)));
  const extent = Math.max(...group.map((o) => Math.hypot(o.p.x - p.x, o.p.z - p.z)));
  return { p, span: THREE.MathUtils.clamp(extent * 2 + 4, 7, 11) };
}

export function createLabels({ T, root, onPick }) {
  const make = (kind, name, p, priority, focus) => {
    const el = document.createElement("button");
    el.className = `label label-${kind}`;
    el.textContent = name;
    el.setAttribute("aria-label", `前往${name}`);
    el.tabIndex = -1;
    root.appendChild(el);
    const l = { kind, name, p, priority, el, w: 0, h: 0, shown: true };
    el.addEventListener("click", () => (focus ? onPick(focus.p, focus.span) : onPick(p, 4)));
    return l;
  };
  const placeData = placesOf(T);
  const districtPoints = new Map();
  const districts = DISTRICTS.map((d) => {
    const p = districtPoint(T, d);
    districtPoints.set(d.name, p);
    const focus = districtFocus(placeData.filter((q) => q.district === d.name), p);
    return make("district", d.name, p.clone().setY(p.y + 0.3), 0, focus);
  });
  const places = placeData
    .map((q) => Object.assign(make("place", q.name, q.p, q.priority), { base: new THREE.Vector3(q.p.x, q.base, q.p.z) }))
    .sort((a, b) => b.priority - a.priority);
  const all = [...districts, ...places];
  const measure = () => {
    for (const l of all) {
      l.el.style.display = "";
      l.w = l.el.offsetWidth;
      l.h = l.el.offsetHeight;
      l.shown = true;
    }
  };
  measure();
  document.fonts?.ready.then(measure); // the game font arrives after the first layout

  const v = new THREE.Vector3();
  const show = (l, on) => {
    if (on === l.shown) return;
    l.shown = on;
    l.el.style.display = on ? "" : "none";
  };
  let wasOn = null;
  return {
    districtPoint: (name) => districtPoints.get(name),
    // obstacles: screen rects already taken (policy pins), as [left, top, right, bottom]
    update(camera, target, on, obstacles = []) {
      if (on !== wasOn) {
        wasOn = on;
        root.classList.toggle("on", on);
        for (const l of all) l.el.tabIndex = on ? 0 : -1;
        if (on) measure();
      }
      if (!on) return;
      const w = innerWidth,
        h = innerHeight;
      // how much ground the view spans across its narrower side, in world units (1 = 100 m)
      const span = 2 * camera.position.distanceTo(target) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.min(1, camera.aspect);
      const aDistrict = smooth(13, 16, span),
        aPlace = 1 - smooth(12, 15, span);
      const taken = obstacles.slice();
      const order = aDistrict >= aPlace ? [districts, places] : [places, districts];
      for (const list of order)
        for (const l of list) {
          const a = l.kind === "district" ? aDistrict : aPlace;
          // building names only round the middle of the view, so a tilted camera does not fill the horizon with them
          if (a < 0.02 || (l.kind === "place" && Math.hypot(l.p.x - target.x, l.p.z - target.z) > span * 1.1)) {
            show(l, false);
            continue;
          }
          v.copy(l.p).project(camera);
          // a tower whose top is above the frame (101 close up) keeps its name at the top edge, over its foot
          const pinTop = l.base && v.z < 1 && v.y > 1.05;
          if (pinTop) v.copy(l.base).project(camera); // the foot decides whether it is in view
          if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) {
            show(l, false);
            continue;
          }
          const x = (v.x * 0.5 + 0.5) * w,
            y = pinTop ? 110 : (-v.y * 0.5 + 0.5) * h;
          // building names sit above their point on a short stem; a district name is centred on its point,
          // or nudged just off it when a pin is already there
          const shifts = l.kind === "district" ? [[0, 0], [0, 1.1], [0, -1.1], [0.7, 0], [-0.7, 0]] : [[0, 0]];
          let box = null;
          for (const [sx, sy] of shifts) {
            const cx = x + sx * l.w,
              cy = l.kind === "district" ? y + sy * l.h : y - l.h / 2 - 8;
            const b = [cx - l.w / 2, cy - l.h / 2, cx + l.w / 2, cy + l.h / 2];
            const inside = b[0] >= 4 && b[2] <= w - 4 && b[1] >= 4 && b[3] <= h - 4;
            if (inside && !taken.some((t) => b[0] < t[2] + 4 && b[2] > t[0] - 4 && b[1] < t[3] + 2 && b[3] > t[1] - 2)) {
              box = b;
              break;
            }
          }
          if (!box) {
            show(l, false);
            continue;
          }
          taken.push(box);
          show(l, true);
          l.el.style.transform = `translate(${box[0].toFixed(1)}px, ${box[1].toFixed(1)}px)`;
          l.el.style.opacity = a.toFixed(2);
        }
    },
  };
}
