// Policies without a construction site of their own, drawn the SimCity way: oversized, readable props where the
// city delivers them, each changing with the date like the other layers (起點 → 做到了／正在做 → 接下來).
//   生育補助   the city's women & children hospital (婦幼院區) — pink roof, heart and balloons from 2023.07
//   敬老卡     聯合醫院 branches, 萬芳 and 關渡 — a gold card over each hospital where the points now work (2026.07)
//   托育補助   City Hall (citywide; illustrative) — a daycare house that gains its slide and toy blocks (2026.07)
//   育兒減工時 City Hall (illustrative) — a street clock and families leaving work early (2026.03, more in 2027)
//   CiviClaw   City Hall — an AI halo with orbiting agents (planned for the end of 2027)
//   AI 教育    every high school — an AI Lab dome, rolled out over the four-year plan (2026.07 → 2030)
//   國中小午餐 every 國中小 — a school campus with a gold lunch bowl from 2026.08.31
//   大街廓都更 the two demonstration sites — today's ground, then blueprint towers with public facilities
//   大安路人行道 the real works site — narrow pavement → works moving block by block → wide pavement (2027.02)
// Props only show in the game city (the night city keeps the pins and glows).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { U, mulberry, smooth } from "./shared.js";

const BM = 0.016 * 0.8;
const ring2 = (flat) => {
  const r = [];
  for (let i = 0; i < flat.length; i += 2) r.push([flat[i], flat[i + 1]]);
  return r;
};
const centroidOf = (r) => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
const mats = new Map();
const toon = (color, opts = {}) => {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return mats.get(key);
};
// a box standing on y (its base), rotated about y
const box = (w, h, d, x = 0, y = 0, z = 0, ry = 0) => new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y + h / 2, z);
function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = shadow;
  return m;
}
// many small parts → one mesh per colour
function batch() {
  const byColor = new Map();
  return {
    add(geo, color) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      g.deleteAttribute("uv");
      if (!byColor.has(color)) byColor.set(color, []);
      byColor.get(color).push(g);
    },
    build() {
      const grp = new THREE.Group();
      for (const [c, geos] of byColor) grp.add(mesh(mergeGeometries(geos), toon(c, { side: THREE.DoubleSide })));
      return grp;
    },
  };
}
// a built prop's meshes, baked into a batch at (x, y, z)
function bake(group, b, x, y, z) {
  group.updateMatrixWorld(true);
  const at = new THREE.Matrix4().makeTranslation(x, y, z);
  group.traverse((o) => o.isMesh && b.add(o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(at, o.matrixWorld)), "#" + o.material.color.getHexString()));
}
const personGeos = (h) => [
  [new THREE.CapsuleGeometry(h * 0.22, h * 0.45, 3, 8).translate(0, h * 0.45, 0), null],
  [new THREE.SphereGeometry(h * 0.2, 10, 8).translate(0, h * 0.98, 0), "#f2c9a0"],
];

// props pop up with the game style and disappear in the night city
function gameOnly(group) {
  const k = smooth(0.45, 0.9, U.uGame.value);
  group.visible = k > 0.01;
  group.scale.setScalar(Math.max(0.001, k));
}
// a group placed at (x, z) on the ground, scaled about its foot
function site(T, x, z) {
  const g = new THREE.Group();
  g.position.set(x, T.groundY(x, z), z);
  return g;
}

// ---------- shared props ----------
function hospital(trim) {
  const g = new THREE.Group();
  const white = toon("#f6f6f2"),
    glass = toon("#7fa6c4");
  g.add(mesh(box(1.0, 0.42, 0.62), white), mesh(box(0.42, 0.62, 0.5, 0.18, 0, -0.02), white));
  for (const y of [0.1, 0.22, 0.34]) g.add(mesh(box(1.02, 0.05, 0.64, 0, y), glass, false));
  g.add(mesh(box(0.44, 0.04, 0.52, 0.18, 0.62), toon(trim)));
  // the medical cross on the roof (green, as on Taiwanese clinics — not the protected red cross)
  const cross = toon("#2fb36a");
  g.add(mesh(box(0.06, 0.2, 0.06, 0.18, 0.66), cross), mesh(box(0.2, 0.06, 0.06, 0.18, 0.73), cross));
  return g;
}
function person(color, h = 0.16) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CapsuleGeometry(h * 0.22, h * 0.45, 3, 8).translate(0, h * 0.45, 0), toon(color)));
  g.add(mesh(new THREE.SphereGeometry(h * 0.2, 10, 8).translate(0, h * 0.98, 0), toon("#f2c9a0")));
  return g;
}
function heartGeometry(s) {
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.35);
  sh.bezierCurveTo(0.05, -0.2, 0.5, -0.05, 0.5, 0.2);
  sh.bezierCurveTo(0.5, 0.45, 0.15, 0.5, 0, 0.28);
  sh.bezierCurveTo(-0.15, 0.5, -0.5, 0.45, -0.5, 0.2);
  sh.bezierCurveTo(-0.5, -0.05, -0.05, -0.2, 0, -0.35);
  return new THREE.ExtrudeGeometry(sh, { depth: 0.18, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 12 }).translate(0, 0, -0.09).scale(s, s, s);
}
function blueprintMat() {
  return new THREE.MeshLambertMaterial({ color: "#3d8bff", transparent: true, opacity: 0.45, emissive: "#1d5fd0", emissiveIntensity: 0.35, depthWrite: false });
}

// ---------- 生育補助加碼: the women & children hospital ----------
export function buildBirth(T, p) {
  const h = T.landmarks.policySites.hospitals.find((q) => q.name === "聯合醫院婦幼院區");
  const g = site(T, ...h.at);
  const roofBefore = toon("#9aa3ab"),
    pink = toon("#ff8fb1");
  const hosp = hospital("#9aa3ab");
  const roof = hosp.children.find((c) => c.material === roofBefore);
  g.add(hosp);
  const heart = mesh(heartGeometry(0.75), toon("#ff5d8f", { emissive: "#ff5d8f", emissiveIntensity: 0.25 }));
  const balloons = new THREE.Group();
  [
    ["#ff8fb1", -0.45, 0.2],
    ["#7cc8f4", 0.55, -0.15],
    ["#ffdd33", -0.2, -0.4],
  ].forEach(([c, x, z], i) => {
    balloons.add(mesh(new THREE.SphereGeometry(0.11, 12, 10).scale(1, 1.2, 1).translate(x, 1.05 + i * 0.12, z), toon(c)));
    balloons.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 3).translate(x, 0.72 + i * 0.12, z), toon("#ffffff"), false));
  });
  g.add(heart, balloons);
  return {
    group: g,
    anchor: new THREE.Vector3(h.at[0], T.groundY(...h.at) + 1.9, h.at[1]),
    exclusions: [{ x: h.at[0], z: h.at[1], r: 0.75 }],
    update(d, flash) {
      gameOnly(g);
      const on = d >= p.event;
      roof.material = on ? pink : roofBefore;
      heart.visible = balloons.visible = on;
      const t = U.uTime.value;
      heart.position.set(0.18, 1.25 + Math.sin(t * 1.6) * 0.06, 0);
      heart.rotation.y = t * 0.8;
      heart.scale.setScalar(1 + flash * 0.4);
      balloons.position.y = Math.sin(t * 1.2 + 1) * 0.04;
    },
  };
}

// ---------- 敬老卡 600 點: the hospitals where the points now pay for check-ups and registration ----------
export function buildElder(T, p) {
  const g = new THREE.Group();
  const cards = [];
  const cardGeo = new THREE.BoxGeometry(0.5, 0.32, 0.04);
  const cardMat = toon("#ffc94a", { emissive: "#ffb300", emissiveIntensity: 0.3 });
  const stripe = toon("#ff8a3d");
  const list = T.landmarks.policySites.hospitals.filter((q) => q.name !== "聯合醫院婦幼院區"); // 婦幼 carries 生育補助
  // the hospitals themselves are static: one mesh per colour for all of them
  const halls = batch();
  const model = hospital("#2fb3a8");
  for (const h of list) bake(model, halls, h.at[0], T.groundY(...h.at), h.at[1]);
  const built = halls.build();
  g.add(built);
  for (const h of list) {
    const card = new THREE.Group();
    card.add(mesh(cardGeo, cardMat), mesh(new THREE.BoxGeometry(0.5, 0.06, 0.045).translate(0, 0.08, 0), stripe));
    card.position.set(h.at[0], T.groundY(...h.at) + 1.05, h.at[1]);
    card.userData.y = card.position.y;
    cards.push(card);
    g.add(card);
  }
  const first = list[0].at;
  return {
    group: g,
    anchor: new THREE.Vector3(first[0], T.groundY(...first) + 1.8, first[1]),
    exclusions: list.map((h) => ({ x: h.at[0], z: h.at[1], r: 0.7 })),
    update(d, flash) {
      // the batch sits in world space, so it shows or hides with the game style rather than popping up
      const k = smooth(0.45, 0.9, U.uGame.value);
      built.visible = k > 0.5;
      const on = d >= p.event && k > 0.01;
      const t = U.uTime.value;
      cards.forEach((c, i) => {
        c.visible = on;
        c.rotation.y = t * 0.9 + i;
        c.position.y = c.userData.y + Math.sin(t * 1.4 + i) * 0.05;
        c.scale.setScalar(k * (1 + flash * 0.5));
      });
    },
  };
}

// ---------- City Hall: 托育補助, 育兒減工時 and CiviClaw share its plaza (citywide programmes) ----------
function cityHall(T) {
  const ic = T.landmarks.icons.find((i) => i.name === "臺北市政府");
  const [x, z] = centroidOf(ring2(ic.outline));
  return { x, z, top: T.groundY(x, z) + ic.wall };
}

export function buildChildcare(T, p) {
  const ch = cityHall(T);
  const [x, z] = [ch.x - 2.1, ch.z - 1.2]; // on the plaza north-west of City Hall (illustrative)
  const g = site(T, x, z);
  const wallBefore = toon("#d9d4c8"),
    wallAfter = toon("#fff1d6");
  const house = mesh(box(0.7, 0.36, 0.5), wallBefore);
  const roofG = new THREE.ConeGeometry(0.52, 0.3, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.75).translate(0, 0.51, 0);
  const roofBefore = toon("#8f9bab"),
    roofAfter = toon("#ff7a59");
  const roof = mesh(roofG, roofBefore);
  g.add(house, roof);
  // what the subsidy adds: toy blocks, a slide, a sunny yard
  const extra = new THREE.Group();
  const colors = ["#ff5d73", "#ffd23f", "#38b6ff", "#5cd68a"];
  [
    [0.55, 0, 0.2],
    [0.7, 0, 0.2],
    [0.62, 0.14, 0.2],
    [0.55, 0, 0.36],
  ].forEach(([bx, by, bz], i) => extra.add(mesh(box(0.13, 0.13, 0.13, bx, by, bz, i * 0.3), toon(colors[i]))));
  extra.add(mesh(box(0.06, 0.32, 0.06, -0.62, 0, -0.1), toon("#38b6ff")), mesh(new THREE.BoxGeometry(0.46, 0.03, 0.12).rotateZ(0.6).translate(-0.44, 0.17, -0.1), toon("#ffd23f")));
  extra.add(mesh(new THREE.CircleGeometry(0.6, 24).rotateX(-Math.PI / 2).translate(0.1, 0.006, 0.35), toon("#9ad36a"), false));
  extra.add(person("#ff8a3d", 0.12).translateX(0.3).translateZ(0.55), person("#5cd68a", 0.1).translateX(0.15).translateZ(0.62));
  g.add(extra);
  return {
    group: g,
    anchor: new THREE.Vector3(x, T.groundY(x, z) + 1.4, z),
    exclusions: [],
    update(d, flash) {
      gameOnly(g);
      const on = d >= p.event;
      house.material = on ? wallAfter : wallBefore;
      roof.material = on ? roofAfter : roofBefore;
      extra.visible = on;
      extra.scale.setScalar(1 + flash * 0.3);
    },
  };
}

export function buildWorktime(T, p) {
  const ch = cityHall(T);
  const [x, z] = [ch.x - 2.3, ch.z + 0.6]; // west plaza (illustrative)
  const g = site(T, x, z);
  // street clock: the minute hand runs, the face reads "an hour earlier"
  const clock = new THREE.Group();
  clock.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 8).translate(0, 0.45, 0), toon("#2d3436")));
  const face = new THREE.Group();
  face.position.y = 1.0;
  face.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 32).rotateX(Math.PI / 2), toon("#ffffff")));
  face.add(mesh(new THREE.TorusGeometry(0.26, 0.025, 6, 32), toon("#1d3557")));
  for (let k = 0; k < 12; k++) face.add(mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02).translate(0, 0.21, 0.035).rotateZ((k / 12) * Math.PI * 2), toon("#1d3557"), false));
  const hour = mesh(new THREE.BoxGeometry(0.03, 0.13, 0.02).translate(0, 0.06, 0.05), toon("#1d3557"), false);
  const minute = mesh(new THREE.BoxGeometry(0.02, 0.2, 0.02).translate(0, 0.09, 0.06), toon("#ff5d73"), false);
  face.add(hour, minute);
  clock.add(face);
  g.add(clock);
  // families heading home early; a second group joins with the 2027 expansion
  const fam = (n0, dx) => {
    const f = new THREE.Group();
    f.add(person("#2e6be6").translateX(dx), person("#ff8a3d").translateX(dx + 0.12), person("#ffd23f", 0.1).translateX(dx + 0.06).translateZ(0.1));
    f.position.z = 0.35;
    f.userData.n0 = n0;
    return f;
  };
  const pilot = fam(0, 0.2),
    expand = fam(1, -0.45);
  g.add(pilot, expand);
  const EXPAND = 2027.0;
  return {
    group: g,
    anchor: new THREE.Vector3(x, T.groundY(x, z) + 1.6, z),
    exclusions: [],
    update(d, flash) {
      gameOnly(g);
      const on = d >= p.event;
      clock.visible = on;
      pilot.visible = on;
      expand.visible = d >= EXPAND;
      // 16:00 rather than 17:00, the minute hand sweeping
      const t = U.uTime.value;
      minute.rotation.z = -t * 0.8;
      hour.rotation.z = -((4 + (t * 0.8) / (Math.PI * 2)) / 12) * Math.PI * 2;
      for (const f of [pilot, expand]) f.position.x = ((t * 0.12 + f.userData.n0 * 0.5) % 1) * 0.4;
      face.scale.setScalar(1 + flash * 0.4);
    },
  };
}

export function buildCiviclaw(T, p) {
  const ch = cityHall(T);
  const g = new THREE.Group();
  g.position.set(ch.x, ch.top + 0.35, ch.z);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 8, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.9, 1.4) }));
  const ring2b = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.025, 6, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.0, 1.4) }));
  const agents = new THREE.Group();
  for (let k = 0; k < 8; k++) {
    const a = mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), toon("#5fe3ff", { emissive: "#2aa8d6", emissiveIntensity: 0.6 }));
    a.userData.k = k;
    agents.add(a);
  }
  g.add(halo, ring2b, agents);
  return {
    group: g,
    anchor: new THREE.Vector3(ch.x + 1.2, ch.top + 1.8, ch.z + 0.6),
    exclusions: [],
    update(d, flash) {
      const k = smooth(0.45, 0.9, U.uGame.value) * smooth(p.event - 0.02, p.event + 0.05, d);
      g.visible = k > 0.01;
      g.scale.setScalar(Math.max(0.001, k) * (1 + flash * 0.3));
      const t = U.uTime.value;
      halo.rotation.y = t * 0.4;
      ring2b.position.y = 0.25 + Math.sin(t * 1.5) * 0.06;
      for (const a of agents.children) {
        const u = t * 0.7 + (a.userData.k / 8) * Math.PI * 2;
        a.position.set(Math.cos(u) * 1.1, 0.15 + Math.sin(u * 2) * 0.12, Math.sin(u) * 1.1);
        a.rotation.set(u, u * 0.7, 0);
      }
    },
  };
}

// ---------- school campuses (國中小: 午餐 / 高中: AI Lab) ----------
// one InstancedMesh per part: classroom wings, roofs, the running track and its field
function campuses(T, list, seed, size) {
  const rnd = mulberry(seed);
  const n = list.length;
  const parts = [
    [new THREE.BoxGeometry(0.62, 0.22, 0.14).translate(0, 0.11, -0.2), "#f4ead6"],
    [new THREE.BoxGeometry(0.14, 0.22, 0.4).translate(-0.24, 0.11, 0.02), "#f4ead6"],
    [new THREE.BoxGeometry(0.64, 0.03, 0.16).translate(0, 0.235, -0.2), "#c8553d"],
    [new THREE.BoxGeometry(0.16, 0.03, 0.42).translate(-0.24, 0.235, 0.02), "#c8553d"],
    [new THREE.CylinderGeometry(0.2, 0.2, 0.02, 28, 1).scale(1.5, 1, 1).translate(0.12, 0.02, 0.12), "#c6533f"],
    [new THREE.CylinderGeometry(0.15, 0.15, 0.02, 28, 1).scale(1.5, 1, 1).translate(0.12, 0.028, 0.12), "#7cc05a"],
    [new THREE.BoxGeometry(0.008, 0.3, 0.008).translate(-0.24, 0.15, -0.36), "#9aa3ab"],
    [new THREE.BoxGeometry(0.08, 0.05, 0.004).translate(-0.2, 0.27, -0.36), "#e74c3c"],
  ];
  const meshes = parts.map(([geo, c]) => {
    const im = new THREE.InstancedMesh(geo, toon(c), n);
    im.castShadow = im.receiveShadow = true;
    return im;
  });
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0);
  const poses = list.map(([x, z]) => {
    const ry = Math.floor(rnd() * 4) * (Math.PI / 2) + (rnd() - 0.5) * 0.3;
    return { x, z, y: T.groundY(x, z), ry };
  });
  poses.forEach(({ x, y, z, ry }, i) => {
    m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, ry), new THREE.Vector3(size, size, size));
    for (const im of meshes) im.setMatrixAt(i, m);
  });
  const g = new THREE.Group();
  g.add(...meshes);
  return { group: g, poses };
}

export function buildLunchCampus(T, p) {
  const list = T.geo.schools;
  const { group, poses } = campuses(T, list, 31, 1.8);
  // gold bowls with a wisp of steam, floating over every 國中小 from the first day of the 115 school year
  const bowlGeo = new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, 0.16, 0);
  const riceGeo = new THREE.SphereGeometry(0.15, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1).translate(0, 0.15, 0);
  const bowls = new THREE.InstancedMesh(bowlGeo, new THREE.MeshLambertMaterial({ color: "#ffc233", emissive: "#e09400", emissiveIntensity: 0.35, side: THREE.DoubleSide }), poses.length);
  const rice = new THREE.InstancedMesh(riceGeo, toon("#ffffff"), poses.length);
  const g = new THREE.Group();
  g.add(group, bowls, rice);
  const m = new THREE.Matrix4(),
    s = new THREE.Vector3(),
    v = new THREE.Vector3(),
    q = new THREE.Quaternion();
  return {
    group: g,
    exclusions: poses.map(({ x, z }) => ({ x, z, r: 0.75, low: 1.3 })),
    update(d, flash) {
      gameOnly(g);
      const on = d >= p.event;
      bowls.visible = rice.visible = on;
      if (!on || !g.visible) return;
      const t = U.uTime.value;
      poses.forEach(({ x, y, z }, i) => {
        m.compose(v.set(x, y + 0.85 + Math.sin(t * 1.5 + i) * 0.05, z), q, s.setScalar(1.8 * (1 + flash * 0.5)));
        bowls.setMatrixAt(i, m);
        rice.setMatrixAt(i, m);
      });
      bowls.instanceMatrix.needsUpdate = rice.instanceMatrix.needsUpdate = true;
    },
  };
}

export function buildAiEdu(T, p) {
  const list = T.landmarks.policySites.highSchools;
  const { group, poses } = campuses(T, list, 47, 1.9);
  // AI Labs arrive school by school over the four-year plan (order and pace illustrative)
  const END = p.event + 4;
  const rnd = mulberry(5);
  const start = poses.map(() => p.event + rnd() * (END - p.event - 0.3));
  const dome = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#5fe3ff", emissive: "#1aa3d6", emissiveIntensity: 0.5, transparent: true, opacity: 0.85 }), poses.length);
  const mast = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4).translate(0, 0.32, 0), toon("#1d3557"), poses.length);
  const g = new THREE.Group();
  g.add(group, dome, mast);
  const m = new THREE.Matrix4(),
    v = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let lastD = -1;
  return {
    group: g,
    anchor: new THREE.Vector3(list[0][0], T.groundY(list[0][0], list[0][1]) + 1.4, list[0][1]),
    exclusions: poses.map(({ x, z }) => ({ x, z, r: 0.75, low: 1.3 })),
    update(d, flash) {
      gameOnly(g);
      if (Math.abs(d - lastD) < 1e-4 && !flash) return;
      lastD = d;
      poses.forEach(({ x, y, z, ry }, i) => {
        const k = smooth(start[i], start[i] + 0.25, d);
        // on the roof of the main classroom wing (local 0.15, -0.2, scaled with the campus)
        const lx = 0.15 * 1.9,
          lz = -0.2 * 1.9;
        const ox = lx * Math.cos(ry) + lz * Math.sin(ry),
          oz = -lx * Math.sin(ry) + lz * Math.cos(ry);
        m.compose(v.set(x + ox, y + 0.25 * 1.9, z + oz), q.setFromAxisAngle(up, ry), sc.setScalar(Math.max(0.001, k) * 1.9 * (1 + flash * 0.3)));
        dome.setMatrixAt(i, m);
        mast.setMatrixAt(i, m);
      });
      dome.instanceMatrix.needsUpdate = mast.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- 大街廓都更: the two demonstration sites ----------
export function buildUrban5099(T, p) {
  const ps = T.landmarks.policySites;
  const g = new THREE.Group();
  const sites = [];
  const DEMOLISHED = 2024.8; // 第一殯儀館 closed and was cleared in 2024 (中央社, 2024.05 estimate: June–November)
  for (const [key, towers] of [
    ["zhongshan", [[0, 0, 1.4, 0.9], [0.55, 0.35, 0.9, 0.55]]],
    ["nangang", [[0, 0, 1.2, 0.8]]],
  ]) {
    const r = ring2(ps[key]);
    const [cx, cz] = centroidOf(r);
    const s = site(T, cx, cz);
    // 中山: the real lot; 南港: about 0.7 ha by 南港高工 (the plot itself is not published), drawn as a square
    const h = 0.42;
    const local = key === "nangang" ? [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, z]) => new THREE.Vector2(x, z)) : r.map(([x, z]) => new THREE.Vector2(x - cx, -(z - cz)));
    const lot = mesh(new THREE.ShapeGeometry(new THREE.Shape(local)).rotateX(-Math.PI / 2).translate(0, 0.02, 0), toon("#b9b6ae"), false);
    // once announced, the demonstration site is marked out in the plan colour
    const marked = mesh(new THREE.ShapeGeometry(new THREE.Shape(local)).rotateX(-Math.PI / 2).translate(0, 0.025, 0), toon("#8fb8ff"), false);
    s.add(marked);
    s.add(lot);
    // as found: the funeral parlour's low halls (until 2024), the school stays as it is
    const old = new THREE.Group();
    if (key === "zhongshan") for (const [ox, oz, w, d] of [[-0.3, -0.2, 0.6, 0.35], [0.35, 0.25, 0.5, 0.4], [-0.25, 0.45, 0.45, 0.3]]) old.add(mesh(box(w, 0.16, d, ox, 0, oz), toon("#a9a39a")));
    s.add(old);
    // the plan: blueprint towers (容積 300%) over a podium of public services
    const plan = new THREE.Group();
    const bp = blueprintMat();
    for (const [ox, oz, h, w] of towers) plan.add(mesh(box(w, h, w * 0.8, ox, 0.2, oz), bp, false));
    plan.add(mesh(box(1.5, 0.2, 1.1, 0.15, 0, 0.1), bp, false));
    const pods = ["#ff7a59", "#5cd68a", "#ffd23f", "#38b6ff"]; // 托育・長照日照・圖書館・運動中心
    pods.forEach((c, i) => plan.add(mesh(box(0.22, 0.2, 0.22, -0.6 + i * 0.4, 0, 0.75), toon(c))));
    s.add(plan);
    sites.push({ s, old, plan, key, lot, marked });
    g.add(s);
  }
  const a = sites[0].s.position;
  return {
    group: g,
    anchor: new THREE.Vector3(a.x, a.y + 2.2, a.z),
    exclusions: sites.map(({ s }) => ({ x: s.position.x, z: s.position.z, r: 0.95 })),
    update(d, flash) {
      for (const { s, old, plan, key, lot, marked } of sites) {
        gameOnly(s);
        old.visible = key === "zhongshan" && d < DEMOLISHED;
        lot.visible = key === "zhongshan";
        marked.visible = d >= p.event;
        const k = smooth(p.event, p.event + 0.6, d);
        plan.visible = k > 0.01;
        plan.scale.set(1, Math.max(0.001, k), 1);
        plan.position.y = flash * 0.05;
      }
    },
  };
}

// ---------- 大安路一段人行道 (仁愛路四段—市民大道四段): narrow → works block by block → 3.5–4.2 m ----------
export function buildSidewalk(T, p) {
  const done = p.done;
  const line = ring2(T.landmarks.policySites.sidewalk);
  const g = new THREE.Group();
  const acc = [0];
  for (let i = 1; i < line.length; i++) acc.push(acc[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const L = acc.at(-1);
  const at = (s) => {
    let i = 1;
    while (i < line.length - 1 && acc[i] < s) i++;
    const t = (s - acc[i - 1]) / (acc[i] - acc[i - 1]);
    const [x0, z0] = line[i - 1],
      [x1, z1] = line[i];
    const l = Math.hypot(x1 - x0, z1 - z0);
    return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, dx: (x1 - x0) / l, dz: (z1 - z0) / l };
  };
  // the street is drawn here too (大安路 is not one of the main roads the game city paints); widths exaggerated
  // (about ×6) so the change reads at district zoom: 1.5 m of cluttered pavement → 3.5–4.2 m with trees
  const ROAD = 0.3,
    NARROW = 0.06,
    WIDE = 0.25;
  const BLOCKS = 8;
  const strip = (s0, s1, off0, off1, y) => {
    const pos = [];
    const n = Math.max(2, Math.ceil((s1 - s0) / 0.2));
    for (let k = 0; k < n; k++) {
      const a = at(s0 + ((s1 - s0) * k) / n),
        b = at(s0 + ((s1 - s0) * (k + 1)) / n);
      const P = (q, o) => [q.x - q.dz * o, T.groundY(q.x, q.z) + y, q.z + q.dx * o];
      const [a0, a1, b0, b1] = [P(a, off0), P(a, off1), P(b, off0), P(b, off1)];
      pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  };
  const road = batch();
  road.add(strip(0, L, -ROAD / 2, ROAD / 2, 0.03), "#55595e");
  // lane markings: a dashed centre line
  for (let s0 = 0.1; s0 < L - 0.1; s0 += 0.22) road.add(strip(s0, s0 + 0.11, -0.008, 0.008, 0.034), "#f4f4f0");
  g.add(road.build());
  const blocks = [];
  const rnd = mulberry(77);
  for (let b = 0; b < BLOCKS; b++) {
    const s0 = (L * b) / BLOCKS + 0.04,
      s1 = (L * (b + 1)) / BLOCKS - 0.04;
    const before = batch(),
      works = batch(),
      after = batch();
    for (const sd of [-1, 1]) {
      const o = (sd * ROAD) / 2;
      const old = strip(s0, s1, o, o + sd * NARROW, 0.045);
      before.add(old, "#a7a29a");
      works.add(old.clone(), "#a7a29a"); // the old pavement stays under the barriers until the block is rebuilt
      after.add(strip(s0, s1, o, o + sd * WIDE, 0.05), "#f1dcb8");
      after.add(strip(s0, s1, o + sd * WIDE * 0.62, o + sd * WIDE * 0.8, 0.055), "#7cc05a"); // planting strip
      // scooters parked on the old pavement; barriers during the works; trees and walkers after
      for (let s = s0 + 0.05; s < s1; s += 0.09) {
        const q = at(s);
        const ang = -Math.atan2(q.dz, q.dx);
        const off = (f) => [q.x - q.dz * (o + sd * f), q.z + q.dx * (o + sd * f)];
        const [px, pz] = off(NARROW * 0.5);
        if (rnd() < 0.8) before.add(box(0.08, 0.05, 0.03, px, T.groundY(px, pz) + 0.05, pz, ang + Math.PI / 2), ["#e74c3c", "#2d3436", "#f2f2f2", "#3498db"][Math.floor(rnd() * 4)]);
        const [wx, wz] = off(WIDE * 0.95);
        works.add(box(0.09, 0.07, 0.018, wx, T.groundY(wx, wz) + 0.05, wz, ang), rnd() < 0.5 ? "#ff8a3d" : "#f4f4f0");
        const [tx, tz] = off(WIDE * 0.71);
        if (Math.round((s - s0) / 0.09) % 2 === 0) {
          after.add(new THREE.IcosahedronGeometry(0.085, 0).translate(tx, T.groundY(tx, tz) + 0.2, tz), "#6db24f");
          after.add(box(0.016, 0.13, 0.016, tx, T.groundY(tx, tz) + 0.05, tz), "#7a5a3c");
        }
        if (rnd() < 0.7) {
          const [wpx, wpz] = off(WIDE * (0.2 + rnd() * 0.3));
          const coat = ["#2e6be6", "#ff8a3d", "#5cd68a", "#ff5d73"][Math.floor(rnd() * 4)];
          for (const [geo, c] of personGeos(0.1)) after.add(geo.translate(wpx, T.groundY(wpx, wpz) + 0.05, wpz), c || coat);
        }
      }
    }
    const blk = { before: before.build(), works: works.build(), after: after.build(), b };
    g.add(blk.before, blk.works, blk.after);
    blocks.push(blk);
  }
  const mid = at(L / 2);
  return {
    group: g,
    anchor: new THREE.Vector3(mid.x, T.groundY(mid.x, mid.z) + 1.3, mid.z),
    exclusions: [{ rect: true, x: (line[0][0] + line.at(-1)[0]) / 2, z: (line[0][1] + line.at(-1)[1]) / 2, w: ROAD / 2 + WIDE + 0.12, d: Math.abs(line[0][1] - line.at(-1)[1]) / 2 + 0.1 }],
    update(d) {
      gameOnly(g);
      // blocks are rebuilt in turn from 仁愛路 northwards between the start of works and the planned completion (order illustrative)
      const k = smooth(p.event, done, d) * BLOCKS;
      for (const bl of blocks) {
        const state = d < p.event ? 0 : bl.b + 1 <= k ? 2 : bl.b < k + 1 ? 1 : 0;
        bl.before.visible = state === 0;
        bl.works.visible = state === 1;
        bl.after.visible = state === 2;
      }
    },
  };
}
