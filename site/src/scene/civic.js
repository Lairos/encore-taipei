// Policies without a construction site of their own, drawn the SimCity way: oversized, readable props, each changing
// with the date like the other layers (起點 → 做到了／正在做 → 接下來).
//   全市政策   生育補助, 育兒減工時, 托育補助, 敬老卡, AI 教育, 國中小午餐 and CiviClaw have no single place, so they
//              stand on a half ring of pedestals on the plaza east of City Hall, each rising on the day it starts
//   大街廓都更 the two demonstration sites — today's ground, then blueprint towers with public facilities
//   大安路人行道 the real works site — narrow pavement → works moving block by block → wide pavement (2027.02)
// The school campuses are part of the city (buildSchoolGrounds). Props only show in the game city.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { U, STAGE, mulberry, smooth } from "./shared.js";
import { POLICIES } from "./policies.js";

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
// many small parts → one mesh, coloured per vertex
const batchMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
function batch() {
  const geos = [];
  const col = new THREE.Color();
  return {
    add(geo, color) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      g.deleteAttribute("uv");
      col.set(color);
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(c, 3));
      geos.push(g);
    },
    build() {
      const grp = new THREE.Group();
      if (geos.length) grp.add(mesh(mergeGeometries(geos), batchMat));
      return grp;
    },
  };
}
// a prop's still parts → one vertex-coloured mesh, the glowing or see-through ones merged per material; anything
// marked keep() (a clock hand, a puff of steam) is left to move on its own
const keep = (o) => ((o.userData.keep = true), o);
function bake(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const plain = batch(),
    lit = new Map(),
    meshes = [];
  const walk = (o) => {
    if (o.userData.keep) return;
    if (o.isMesh && !o.isInstancedMesh) meshes.push(o);
    for (const c of o.children) walk(c);
  };
  root.children.forEach(walk);
  for (const o of meshes) {
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const m = o.material;
    if (m.transparent || (m.emissive?.getHex() && m.emissiveIntensity > 0)) {
      const gg = g.index ? g.toNonIndexed() : g;
      gg.deleteAttribute("uv");
      if (!lit.has(m)) lit.set(m, []);
      lit.get(m).push(gg);
    } else plain.add(g, "#" + m.color.getHexString());
    o.removeFromParent();
  }
  root.add(plain.build());
  for (const [m, geos] of lit) root.add(mesh(mergeGeometries(geos), m));
  return root;
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
const glowToon = (color, k = 0.5) => toon(color, { emissive: color, emissiveIntensity: k });

// ---------- City Hall: the citywide programmes on a half ring of pedestals ----------
// The policies with no single place of their own (`hub` in policies.js) stand on a plaza east of City Hall, in the
// order they began from the south end of the ring (by 臺北101) to the north, where the opening's camera sees the
// latest rise; each pedestal rises on the day its policy starts (illustrative).
function cityHall(T) {
  const ic = T.landmarks.icons.find((i) => i.name === "臺北市政府");
  const [x, z] = centroidOf(ring2(ic.outline));
  return { x, z, top: T.groundY(x, z) + ic.wall };
}
const HUB_R = 2.6; // ring radius round City Hall's centre; the roads west and north of it stay clear
export function hubLayout(T) {
  const ch = cityHall(T);
  const ids = POLICIES.filter((p) => p.hub)
    .sort((a, b) => a.event - b.event)
    .map((p) => p.id);
  const slots = new Map(
    ids.map((id, i) => {
      const a = THREE.MathUtils.degToRad(80 - (160 * i) / Math.max(1, ids.length - 1));
      const x = ch.x + Math.cos(a) * HUB_R,
        z = ch.z + Math.sin(a) * HUB_R;
      return [id, { x, z, y: T.groundY(x, z), a, i }];
    }),
  );
  return { ...ch, ids, slots, anchor: new THREE.Vector3(ch.x + 0.9, ch.top + 1.7, ch.z) };
}

// the plaza under the ring: paving with a gold inlay along the pedestals, kept clear of the city blocks, and people
// strolling past each pedestal once it is up
export function buildCivicPlaza(T) {
  const hub = hubLayout(T);
  const y = T.groundY(hub.x, hub.z);
  const R = HUB_R + 0.8;
  const ground = batch();
  ground.add(new THREE.CircleGeometry(R, 48, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).translate(hub.x, y + 0.016, hub.z), "#efe6d4");
  ground.add(new THREE.RingGeometry(HUB_R - 0.04, HUB_R + 0.04, 64, 1, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).translate(hub.x, y + 0.02, hub.z), "#e8b84a");
  // the marked spot of each pedestal, there before it rises
  for (const s of hub.slots.values()) ground.add(new THREE.CircleGeometry(0.37, 28).rotateX(-Math.PI / 2).translate(s.x, s.y + 0.024, s.z), "#d8cfbd");
  const g = ground.build();
  g.traverse((o) => o.isMesh && (o.castShadow = false));
  const exclusions = [];
  for (let dx = 0; dx <= R; dx += 0.7)
    for (let dz = -R; dz <= R; dz += 0.7) if (Math.hypot(dx, dz) <= R) exclusions.push({ x: hub.x + dx, z: hub.z + dz, r: 0.55 });
  // a walk in front of each pair of neighbouring pedestals, busy from when the later of the two went up
  const at = (a, r) => [hub.x + Math.cos(a) * r, hub.z + Math.sin(a) * r];
  const byId = Object.fromEntries(POLICIES.map((p) => [p.id, p]));
  const crowd = [];
  for (let i = 0; i + 1 < hub.ids.length; i++) {
    const s0 = hub.slots.get(hub.ids[i]),
      s1 = hub.slots.get(hub.ids[i + 1]);
    crowd.push({ walks: [[...at(s0.a, HUB_R + 0.5), ...at(s1.a, HUB_R + 0.5)]], n: 5, from: Math.max(byId[hub.ids[i]].event, byId[hub.ids[i + 1]].event), lift: 0.016 });
  }
  return { group: g, exclusions, crowd, hub: { anchor: hub.anchor, ids: hub.ids } };
}

// a pedestal at the policy's place in the ring (its marked spot is part of the plaza): the stand rises when the
// policy starts with its token, which hovers and slowly turns; the rim takes the policy's stage colour
function pedestal(T, p) {
  const s = hubLayout(T).slots.get(p.id);
  const g = site(T, s.x, s.z);
  const sb = batch();
  sb.add(new THREE.CylinderGeometry(0.33, 0.38, 0.2, 28).translate(0, 0.1, 0), "#fbf7ee");
  sb.add(new THREE.TorusGeometry(0.34, 0.03, 8, 40).rotateX(Math.PI / 2).translate(0, 0.2, 0), STAGE[p.status].color);
  const stand = sb.build();
  const token = new THREE.Group();
  g.add(stand, token);
  const phase = s.a * 3;
  return {
    group: g,
    token,
    anchor: new THREE.Vector3(s.x, s.y + (s.i % 2 ? 2.25 : 1.3), s.z), // staggered so neighbouring pins clear each other
    // returns how far it has risen (0..1)
    update(d, flash) {
      gameOnly(g);
      const k = smooth(p.event - 0.03, p.event + 0.08, d);
      stand.scale.set(1, Math.max(0.001, k), 1);
      token.visible = k > 0.5;
      const t = U.uTime.value;
      token.position.y = 0.32 + Math.sin(t * 1.5 + phase) * 0.03;
      token.rotation.y = t * 0.5 + phase;
      token.scale.setScalar(Math.max(0.001, smooth(0.5, 1, k)) * 1.3 * (1 + flash * 0.4));
      return k;
    },
  };
}
// the layer for a pedestal, its token's still parts baked; extra(k, d) animates what was kept
function onPedestal(ped, extra) {
  bake(ped.token);
  return { group: ped.group, anchor: ped.anchor, exclusions: [], update: extra ? (d, flash) => extra(ped.update(d, flash), d, flash) : ped.update };
}

// 生育補助加碼: a heart with balloons
export function buildBirth(T, p) {
  const ped = pedestal(T, p);
  ped.token.add(mesh(heartGeometry(0.42).translate(0, 0.2, 0), glowToon("#ff5d8f", 0.25)));
  [
    ["#ff8fb1", -0.24, 0.1],
    ["#7cc8f4", 0.26, -0.06],
    ["#ffdd33", -0.04, -0.24],
  ].forEach(([c, x, z], i) => {
    ped.token.add(mesh(new THREE.SphereGeometry(0.07, 12, 10).scale(1, 1.2, 1).translate(x, 0.52 + i * 0.06, z), toon(c)));
    ped.token.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.32, 3).translate(x, 0.3 + i * 0.06, z), toon("#ffffff"), false));
  });
  return onPedestal(ped);
}

// 敬老卡 600 點: the gold card
export function buildElder(T, p) {
  const ped = pedestal(T, p);
  const card = new THREE.Group();
  card.add(mesh(new THREE.BoxGeometry(0.46, 0.3, 0.035), glowToon("#ffc94a", 0.3)));
  card.add(mesh(new THREE.BoxGeometry(0.465, 0.055, 0.04).translate(0, 0.08, 0), toon("#ff8a3d")));
  card.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.04).translate(-0.14, -0.05, 0), toon("#e9e2d2")));
  card.position.y = 0.26;
  ped.token.add(card);
  return onPedestal(ped);
}

// 托育補助提高: a daycare house with toy blocks
export function buildChildcare(T, p) {
  const ped = pedestal(T, p);
  const t = ped.token;
  t.add(mesh(box(0.4, 0.22, 0.3), toon("#fff1d6")), mesh(new THREE.ConeGeometry(0.31, 0.18, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.75).translate(0, 0.31, 0), toon("#ff7a59")));
  t.add(mesh(box(0.08, 0.12, 0.01, 0, 0, 0.151), toon("#38b6ff")));
  ["#ff5d73", "#ffd23f", "#5cd68a"].forEach((c, i) => t.add(mesh(box(0.08, 0.08, 0.08, 0.27, i === 2 ? 0.08 : 0, i === 1 ? 0.12 : 0.02, i * 0.4), toon(c))));
  return onPedestal(ped);
}

// 育兒減工時不減薪: a clock reading 16:00 rather than 17:00, families on their way home; more join with the 2027
// expansion
export function buildWorktime(T, p) {
  const ped = pedestal(T, p);
  const face = new THREE.Group();
  face.position.y = 0.28;
  face.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 32).rotateX(Math.PI / 2), toon("#ffffff")));
  face.add(mesh(new THREE.TorusGeometry(0.2, 0.022, 6, 32), toon("#1d3557")));
  face.add(mesh(mergeGeometries(Array.from({ length: 12 }, (_, k) => new THREE.BoxGeometry(0.016, 0.04, 0.016).translate(0, 0.16, 0.03).rotateZ((k / 12) * Math.PI * 2))), toon("#1d3557"), false));
  const hour = keep(mesh(new THREE.BoxGeometry(0.024, 0.1, 0.016).translate(0, 0.045, 0.04), toon("#1d3557"), false));
  const minute = keep(mesh(new THREE.BoxGeometry(0.016, 0.15, 0.016).translate(0, 0.07, 0.045), toon("#ff5d73"), false));
  face.add(hour, minute);
  ped.token.add(face);
  const family = (dx, dz) => {
    const f = new THREE.Group();
    f.add(person("#2e6be6", 0.11).translateX(dx), person("#ff8a3d", 0.11).translateX(dx + 0.08), person("#ffd23f", 0.08).translateX(dx + 0.04).translateZ(0.07));
    f.position.set(0, 0.2, dz);
    return bake(f);
  };
  const pilot = family(-0.2, 0.12),
    expand = family(0.05, -0.18);
  ped.group.add(pilot, expand);
  const EXPAND = 2027.0;
  return onPedestal(ped, (k, d) => {
    pilot.visible = k > 0.99;
    expand.visible = k > 0.99 && d >= EXPAND;
    const t = U.uTime.value;
    minute.rotation.z = -t * 0.8;
    hour.rotation.z = -((4 + (t * 0.8) / (Math.PI * 2)) / 12) * Math.PI * 2;
  });
}

// AI 教育白皮書: an open book under a glowing chip
export function buildAiEdu(T, p) {
  const ped = pedestal(T, p);
  const t = ped.token;
  for (const sd of [-1, 1]) {
    t.add(mesh(new THREE.BoxGeometry(0.22, 0.02, 0.3).translate(sd * 0.11, 0, 0).rotateZ(sd * 0.22).translate(0, 0.06, 0), toon("#2e6be6")));
    t.add(mesh(new THREE.BoxGeometry(0.2, 0.02, 0.27).translate(sd * 0.1, 0.018, 0).rotateZ(sd * 0.22).translate(0, 0.06, 0), toon("#ffffff")));
  }
  const chip = new THREE.Group();
  chip.position.y = 0.36;
  chip.add(mesh(new THREE.BoxGeometry(0.2, 0.04, 0.2), toon("#1d3557")), mesh(new THREE.BoxGeometry(0.11, 0.045, 0.11), glowToon("#5fe3ff", 0.8)));
  const pins = [];
  for (let k = -1; k <= 1; k++)
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pins.push(new THREE.BoxGeometry(az ? 0.025 : 0.05, 0.012, az ? 0.05 : 0.025).translate(ax * 0.12 + (az ? k * 0.06 : 0), 0, az * 0.12 + (ax ? k * 0.06 : 0)));
  chip.add(mesh(mergeGeometries(pins), toon("#c9d3e3"), false));
  t.add(keep(bake(chip)));
  return onPedestal(ped, () => (chip.position.y = 0.36 + Math.sin(U.uTime.value * 2.2) * 0.03));
}

// 國中小營養午餐全面免費: a gold bowl of rice with chopsticks and a wisp of steam
export function buildLunch(T, p) {
  const ped = pedestal(T, p);
  const t = ped.token;
  t.add(mesh(new THREE.SphereGeometry(0.24, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, 0.24, 0), new THREE.MeshLambertMaterial({ color: "#ffc233", emissive: "#e09400", emissiveIntensity: 0.35, side: THREE.DoubleSide })));
  t.add(mesh(new THREE.SphereGeometry(0.22, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1).translate(0, 0.22, 0), toon("#ffffff")));
  for (const dx of [-0.03, 0.03]) t.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 5).rotateZ(0.5).translate(0.1 + dx, 0.36, 0.04), toon("#8a5a3c"), false));
  const steam = [0, 1, 2].map((i) => {
    const s = keep(mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshLambertMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, depthWrite: false }), false));
    t.add(s);
    return s;
  });
  return onPedestal(ped, () => {
    const time = U.uTime.value;
    steam.forEach((s, i) => {
      const u = (time * 0.35 + i / 3) % 1;
      s.position.set(Math.sin(u * 6 + i) * 0.04 - 0.05, 0.3 + u * 0.35, 0);
      s.scale.setScalar(0.6 + u);
      s.material.opacity = 0.6 * (1 - u);
    });
  });
}

// 市府 AI 助理 CiviClaw: a robot with agents circling it
export function buildCiviclaw(T, p) {
  const ped = pedestal(T, p);
  const t = ped.token;
  t.add(mesh(box(0.3, 0.24, 0.26, 0, 0.06), toon("#f4f6f8")), mesh(box(0.24, 0.09, 0.02, 0, 0.14, 0.13), toon("#1d3557")));
  for (const ex of [-0.06, 0.06]) t.add(mesh(new THREE.SphereGeometry(0.024, 10, 8).translate(ex, 0.185, 0.145), glowToon("#5fe3ff", 1)));
  t.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5).translate(0, 0.36, 0), toon("#9aa3ab"), false), mesh(new THREE.SphereGeometry(0.03, 10, 8).translate(0, 0.43, 0), glowToon("#5fe3ff", 1)));
  const agents = keep(new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), glowToon("#5fe3ff", 0.6), 4));
  agents.frustumCulled = false;
  t.add(agents);
  const am = new THREE.Matrix4(),
    av = new THREE.Vector3(),
    ae = new THREE.Euler(),
    aq = new THREE.Quaternion(),
    one = new THREE.Vector3(1, 1, 1);
  return onPedestal(ped, () => {
    const time = U.uTime.value;
    for (let k = 0; k < 4; k++) {
      const u = time * 0.9 + (k / 4) * Math.PI * 2;
      agents.setMatrixAt(k, am.compose(av.set(Math.cos(u) * 0.3, 0.18 + Math.sin(u * 2) * 0.06, Math.sin(u) * 0.3), aq.setFromEuler(ae.set(u, u * 0.7, 0)), one));
    }
    agents.instanceMatrix.needsUpdate = true;
  });
}

// ---------- school grounds (國中小, 高中): part of the city, campuses with a running track ----------
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
export function buildSchoolGrounds(T) {
  const a = campuses(T, T.geo.schools, 31, 1.8),
    b = campuses(T, T.landmarks.policySites.highSchools, 47, 1.9);
  const g = new THREE.Group();
  g.add(a.group, b.group);
  return { group: g, exclusions: [...a.poses, ...b.poses].map(({ x, z }) => ({ x, z, r: 0.75, low: 1.3 })) };
}

// ---------- 大街廓都更: the two demonstration sites ----------
export function buildUrban5099(T, p) {
  const ps = T.landmarks.policySites;
  const g = new THREE.Group();
  const sites = [];
  const DEMOLISHED = 2024.8; // 第一殯儀館 closed and was cleared in 2024 (中央社, 2024.05 estimate: June–November)
  const BUILT = 2032.0; // shown built in the 願景 picture
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
    // the plan: blueprint towers (容積 300%) over a podium of public services; built in the 願景 picture
    const plan = new THREE.Group();
    const bp = blueprintMat();
    for (const [ox, oz, h, w] of towers) plan.add(mesh(box(w, h, w * 0.8, ox, 0.2, oz), bp, false));
    plan.add(mesh(box(1.5, 0.2, 1.1, 0.15, 0, 0.1), bp, false));
    const built = new THREE.Group();
    for (const [ox, oz, h, w] of towers) {
      built.add(mesh(box(w, h, w * 0.8, ox, 0.2, oz), toon("#9cc3df")));
      built.add(mesh(box(w * 1.03, 0.04, w * 0.83, ox, 0.2 + h * 0.5, oz), toon("#f4f6f7")));
      built.add(mesh(box(w * 0.85, 0.04, w * 0.68, ox, 0.2 + h, oz), toon("#7cc05a")));
    }
    built.add(mesh(box(1.5, 0.2, 1.1, 0.15, 0, 0.1), toon("#f1ece2")));
    s.add(built);
    const pods = ["#ff7a59", "#5cd68a", "#ffd23f", "#38b6ff"]; // 托育・長照日照・圖書館・運動中心
    pods.forEach((c, i) => plan.add(mesh(box(0.22, 0.2, 0.22, -0.6 + i * 0.4, 0, 0.75), toon(c))));
    s.add(plan);
    sites.push({ s, old, plan, built, key, lot, marked });
    g.add(s);
  }
  const a = sites[0].s.position;
  return {
    group: g,
    anchor: new THREE.Vector3(a.x, a.y + 2.2, a.z),
    exclusions: sites.map(({ s }) => ({ x: s.position.x, z: s.position.z, r: 0.95 })),
    crowd: sites.map(({ s }) => ({ x: s.position.x, z: s.position.z, r: 2, n: 50, from: BUILT })), // the new blocks in use
    update(d, flash) {
      for (const { s, old, plan, built, key, lot, marked } of sites) {
        gameOnly(s);
        old.visible = key === "zhongshan" && d < DEMOLISHED;
        lot.visible = key === "zhongshan";
        marked.visible = d >= p.event;
        const k = smooth(p.event, p.event + 0.6, d);
        const b = smooth(BUILT - 0.6, BUILT, d); // illustrative: no construction timetable yet
        plan.visible = k > 0.01 && b < 0.99;
        plan.scale.set(1, Math.max(0.001, k), 1);
        plan.position.y = flash * 0.05;
        built.visible = b > 0.01;
        built.scale.set(1, Math.max(0.001, b), 1);
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
  // people walking each block: a few squeezed onto the old pavement until its works start, many on the new one
  // once it is rebuilt (the dates invert the smooth() schedule in update below)
  const dateAt = (f) => {
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      if (m * m * (3 - 2 * m) < f) lo = m;
      else hi = m;
    }
    return p.event + lo * (done - p.event);
  };
  const crowd = [];
  for (let b = 0; b < BLOCKS; b++) {
    const a = at((L * b) / BLOCKS + 0.06),
      c = at((L * (b + 1)) / BLOCKS - 0.06);
    const along = (o) => [a.x - a.dz * o, a.z + a.dx * o, c.x - c.dz * o, c.z + c.dx * o];
    const sides = (offs) => offs.flatMap((o) => [along(o), along(-o)]);
    crowd.push({ walks: sides([ROAD / 2 + NARROW * 0.5]), n: 3, from: -1e4, to: b <= 1 ? p.event : dateAt((b - 1) / BLOCKS), lift: 0.045, jitter: 0.005 });
    crowd.push({ walks: sides([ROAD / 2 + WIDE * 0.3, ROAD / 2 + WIDE * 0.48]), n: 18, from: dateAt((b + 1) / BLOCKS), lift: 0.05, jitter: 0.02 });
  }
  const mid = at(L / 2);
  return {
    group: g,
    anchor: new THREE.Vector3(mid.x, T.groundY(mid.x, mid.z) + 1.3, mid.z),
    crowd,
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
