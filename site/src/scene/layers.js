// Policy layers. Each layer reads the date (decimal year) and shows the city as it was / is / is planned at that moment.
// Visual grammar: 起點 = as found, 做到了 = lit and in use, 正在做 = scaffolds and cranes, 接下來 = glowing blueprint.
import * as THREE from "three";
import { U, LIGHT_GLSL, mulberry, smooth } from "./shared.js";
import { project } from "./geo.js";
import { describeRenewal } from "./policies.js";

const GOLD = new THREE.Color("#ffc56b"),
  CYAN = new THREE.Color("#5fe3ff");

// Materials that glow additively in the night city and turn into solid, readable markers in the game city
const GLOW = [];
const glow = (m) => (GLOW.push(m), m);
export function setLayerStyle(g) {
  const blending = g > 0.5 ? THREE.NormalBlending : THREE.AdditiveBlending;
  for (const m of GLOW) m.blending = blending;
}

// ---------- shared materials ----------
// Blueprint: additive wireframe-ish glass that "draws" itself upward as progress goes 0 → 1.
function blueprintMaterials(color, baseY, height) {
  const u = { uColor: { value: new THREE.Color(color) }, uProgress: { value: 0 }, uBaseY: { value: baseY }, uHeight: { value: height }, uTime: U.uTime, uFade: { value: 1 }, uGame: U.uGame };
  const common = /* glsl */ `
    uniform vec3 uColor; uniform float uProgress; uniform float uBaseY; uniform float uHeight; uniform float uTime; uniform float uFade; uniform float uGame;
    varying vec3 vW; varying vec3 vN;`;
  const vs = /* glsl */ `${common}
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
  const fill = glow(new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: vs,
    fragmentShader: /* glsl */ `${common}
      void main() {
        float h = (vW.y - uBaseY) / uHeight;
        float front = uProgress * 1.02;
        if (h > front) discard;
        vec3 v = normalize(cameraPosition - vW);
        float rim = pow(1.0 - abs(dot(normalize(vN), v)), 2.0);
        float scan = smoothstep(0.92, 1.0, fract(vW.y * 6.0 - uTime * 0.8)) * 0.6;
        float edge = smoothstep(front - 0.04, front, h) * step(uProgress, 0.995) * 2.5; // bright build line
        float a = (0.08 + rim * 0.5 + scan * 0.25 + edge) * uFade;
        gl_FragColor = uGame > 0.5 ? vec4(mix(uColor, vec3(0.05, 0.36, 0.82), 0.65), clamp(0.42 + rim * 0.3 + scan * 0.2 + edge * 0.5, 0.0, 0.9) * uFade) : vec4(uColor * a, 1.0);
      }`,
  }));
  const lines = glow(new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `${common}
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = vec3(0.0, 1.0, 0.0); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `${common}
      void main() {
        float h = (vW.y - uBaseY) / uHeight;
        if (h > uProgress * 1.02) discard;
        gl_FragColor = uGame > 0.5 ? vec4(mix(uColor, vec3(1.0), 0.6), uFade) : vec4(uColor * 1.6 * uFade, 1.0);
      }`,
  }));
  return { fill, lines, uniforms: u };
}

function blueprint(geoms, color, baseY, height) {
  const g = new THREE.Group();
  const mats = blueprintMaterials(color, baseY, height);
  for (const geo of geoms) {
    g.add(new THREE.Mesh(geo, mats.fill));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), mats.lines));
  }
  g.userData.u = mats.uniforms;
  return g;
}

const box = (w, h, d, x, y, z, ry = 0) => new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y + h / 2, z);

const craneMat = new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff7a20, emissiveIntensity: 0.6, roughness: 0.6 });
function makeCrane(height = 2.2) {
  const c = new THREE.Group();
  c.add(new THREE.Mesh(box(0.08, height, 0.08, 0, 0, 0), craneMat));
  const jib = new THREE.Group();
  jib.add(new THREE.Mesh(box(1.6, 0.06, 0.06, 0.5, 0, 0), craneMat), new THREE.Mesh(box(0.06, 0.5, 0.02, 1.1, -0.5, 0), craneMat));
  jib.position.y = height;
  c.add(jib);
  c.traverse((o) => o.isMesh && (o.castShadow = true));
  c.userData.jib = jib;
  return c;
}

// glowing ground ring used to mark a delivered milestone
function groundRing(r, color) {
  const m = glow(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: 0 }, uTime: U.uTime, uGame: U.uGame },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uA; uniform float uTime; uniform float uGame; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(0.8, 0.94, d) * (1.0 - smoothstep(0.94, 1.0, d));
        float wave = smoothstep(0.0, 0.05, fract(uTime * 0.35) - d * 0.9) * (1.0 - smoothstep(0.05, 0.2, fract(uTime * 0.35) - d * 0.9)) * 0.5;
        gl_FragColor = uGame > 0.5 ? vec4(uColor, clamp((ring * 1.3 + wave) * uA, 0.0, 1.0)) : vec4(uColor * (ring * 1.4 + wave * step(d, 1.0)) * uA, 1.0);
      }`,
  }));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), m);
  mesh.renderOrder = 3;
  return mesh;
}

// ---------- 臺北 101 & 市政府: fixed anchors so the city is recognisable at a glance ----------
// metres → world units for buildings, matching the city blocks and OpenStreetMap extrusions
const BM = 0.016 * 0.8;
const ring2 = (flat) => {
  const r = [];
  for (let i = 0; i < flat.length; i += 2) r.push([flat[i], flat[i + 1]]);
  return r;
};
const centroidOf = (r) => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];

// ---------- 臺北101: real proportions (508 m) at its OpenStreetMap position ----------
// base section to 100 m tapering in, eight 8-storey "bamboo" modules flaring out, crown sections, spire
function buildAnchors(T) {
  const g = new THREE.Group();
  const [x, z] = T.landmarks.t101.center;
  const y = T.groundY(x, z);
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 8, 256);
  for (let i = 0; i < 256; i += 4) {
    ctx.fillStyle = i % 32 < 4 ? "#7ff0d8" : "#123a3a";
    ctx.fillRect(0, i, 8, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ color: 0x5f8f8a, roughness: 0.25, metalness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
  // square section, corners chamfered by rotating a 4-sided cylinder 45°
  const sq = (rTop, rBottom, h, y0) => new THREE.CylinderGeometry(rTop, rBottom, h, 4, 1).rotateY(Math.PI / 4).translate(0, y0 + h / 2, 0);
  const parts = [sq(0.4, 0.46, 100 * BM, 0)];
  for (let k = 0; k < 8; k++) parts.push(sq(0.42, 0.33, 34 * BM, (100 + k * 34) * BM));
  parts.push(sq(0.27, 0.3, 30 * BM, 372 * BM), sq(0.2, 0.24, 26 * BM, 402 * BM), sq(0.14, 0.17, 21 * BM, 428 * BM));
  parts.push(new THREE.CylinderGeometry(0.015, 0.05, 59 * BM, 6).translate(0, 449 * BM + (59 * BM) / 2, 0));
  for (const geo of parts) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.6, 0.4) }));
  tip.position.set(x, y + 508 * BM, z);
  g.add(tip);
  return {
    group: g,
    exclusions: [{ x, z, r: 0.6 }],
    update() {
      mat.emissiveIntensity = 0.4 + 2.2 * U.uNight.value;
    },
  };
}

// ---------- 臺北大巨蛋: the dome fitted to its real footprint (64 m above ground), dark and fenced → lit and in use ----------
function buildDome(T, p) {
  const { center, a, b, angle } = T.landmarks.dome;
  const [x, z] = center;
  const y = T.groundY(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = -angle;
  const H = 64 * BM,
    WALL = 22 * BM;
  const shell = new THREE.MeshStandardMaterial({ color: 0xcfd5dd, roughness: 0.35, metalness: 0.2, emissive: 0xffe2b8, emissiveIntensity: 0 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 18, 0, Math.PI * 2, 0, Math.PI / 2).scale(a, H - WALL, b).translate(0, WALL, 0), shell);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.02, WALL, 72, 1, true).scale(a, 1, b).translate(0, WALL / 2, 0), shell);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2).scale(a + 0.45, 1, b + 0.4).translate(0, 0.012, 0), new THREE.MeshStandardMaterial({ color: 0x9a968d, roughness: 1 }));
  // roof ribs: meridians and two parallels over the ellipsoid, like the real steel roof
  const rib = [];
  const P = (u, v) => new THREE.Vector3(Math.cos(u) * Math.cos(v) * a * 1.003, WALL + Math.sin(v) * (H - WALL) * 1.003, Math.sin(u) * Math.cos(v) * b * 1.003);
  for (let k = 0; k < 28; k++) {
    const u = (k / 28) * Math.PI * 2;
    for (let j = 0; j < 12; j++) rib.push(P(u, (j / 12) * (Math.PI / 2)), P(u, ((j + 1) / 12) * (Math.PI / 2)));
  }
  for (const v of [0.35, 0.8])
    for (let k = 0; k < 72; k++) rib.push(P((k / 72) * Math.PI * 2, v), P(((k + 1) / 72) * Math.PI * 2, v));
  const ribs = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rib), new THREE.LineBasicMaterial({ color: 0x8e98a6, transparent: true, opacity: 0.55 }));
  // roof light ring (bloom)
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 6, 96).rotateX(Math.PI / 2).scale(a, 1, b).translate(0, WALL + 0.01, 0), ringMat);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 6, 64).rotateX(Math.PI / 2).scale(a, 1, b).translate(0, WALL + (H - WALL) * 0.91, 0), ringMat);
  // construction fence (before)
  const fenceMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uNight: U.uNight },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uNight; varying vec2 vUv; void main(){ float s = step(0.5, fract(vUv.x * 60.0)); vec3 c = mix(vec3(0.85,0.85,0.8), vec3(0.95,0.45,0.15), s) * mix(0.6, 0.18, uNight); gl_FragColor = vec4(c, 1.0); }`,
  });
  const fence = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.14, 96, 1, true).scale(a + 0.35, 1, b + 0.3).translate(0, 0.07, 0), fenceMat);
  // light beams (after)
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uA: { value: 0 } },
    vertexShader: `varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uA; varying float vY; void main(){ gl_FragColor = vec4(vec3(1.0,0.9,0.7) * pow(1.0 - vY, 2.0) * 0.35 * uA, 1.0); }`,
  });
  const beams = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const t = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const bm = new THREE.Mesh(new THREE.ConeGeometry(0.22, 5, 16, 1, true).translate(0, -2.5, 0).rotateX(Math.PI), beamMat);
    bm.position.set(Math.cos(t) * (a + 0.2), 0.1, Math.sin(t) * (b + 0.2));
    bm.rotation.z = Math.cos(t) * 0.18;
    bm.rotation.x = -Math.sin(t) * 0.18;
    beams.add(bm);
  }
  g.add(plaza, wall, dome, ribs, ring, crown, fence, beams);
  for (const o of [plaza, wall, dome]) o.castShadow = o.receiveShadow = true;
  return {
    group: g,
    anchor: new THREE.Vector3(x, y + H + 0.6, z),
    exclusions: [{ x, z, r: a + 0.5 }],
    update(d, flash) {
      const on = smooth(p.event - 0.02, p.event + 0.02, d);
      fence.visible = on < 0.5;
      beams.visible = on > 0.01;
      shell.emissiveIntensity = on * (0.04 + 0.16 * U.uNight.value) + flash * 0.35;
      shell.color.setHex(on > 0.5 ? 0xe4e8ee : 0x9da3ab);
      ringMat.color.setRGB(2.2, 1.6, 0.95).multiplyScalar(on * (0.35 + 0.65 * U.uNight.value) + flash * 0.6);
      beamMat.uniforms.uA.value = (on * (0.15 + 0.35 * U.uNight.value) + flash * 0.6) * (1 - U.uGame.value);
      beams.rotation.y = U.uTime.value * 0.15;
    },
  };
}

// ---------- 公館圓環: roundabout → regular junction with crosswalks ----------
function buildGongguan(T, p) {
  // snap to the busiest road junction near the listed place (OpenStreetMap vertices shared by several roads)
  const [x0, z0] = project(...p.place);
  const near = [];
  T.geo.roads.forEach((r, id) => {
    if (r[0] > 3) return;
    for (let i = 1; i + 1 < r.length; i += 2) if ((r[i] - x0) ** 2 + (r[i + 1] - z0) ** 2 < 6.25) near.push([r[i], r[i + 1], id]);
  });
  let x = x0,
    z = z0,
    bestScore = -Infinity;
  for (const [px, pz] of near) {
    const roads = new Set(near.filter((q) => (q[0] - px) ** 2 + (q[1] - pz) ** 2 < 0.04).map((q) => q[2]));
    const score = roads.size * 10 - Math.hypot(px - x0, pz - z0);
    if (score > bestScore) [bestScore, x, z] = [score, px, pz];
  }
  const y = T.groundY(x, z) + 0.06; // just above the street ribbons
  // align the junction with the longest major road segment passing through it (OpenStreetMap)
  let ang = 0,
    best = 0;
  for (const r of T.geo.roads)
    if (r[0] <= 2)
      for (let i = 1; i + 3 < r.length; i += 2) {
        const mx = (r[i] + r[i + 2]) / 2,
          mz = (r[i + 1] + r[i + 3]) / 2,
          l = Math.hypot(r[i + 2] - r[i], r[i + 3] - r[i + 1]);
        if ((mx - x) ** 2 + (mz - z) ** 2 < 2.25 && l > best) {
          best = l;
          ang = Math.atan2(r[i + 3] - r[i + 1], r[i + 2] - r[i]);
        }
      }
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const junction = new THREE.Group();
  junction.rotation.y = -ang;
  const before = new THREE.Group(),
    after = new THREE.Group();
  const flat = (geo) => geo.rotateX(-Math.PI / 2);
  before.add(new THREE.Mesh(flat(new THREE.RingGeometry(0.34, 0.6, 48)), new THREE.MeshLambertMaterial({ color: 0x585c62 })));
  before.add(new THREE.Mesh(flat(new THREE.CircleGeometry(0.34, 48)).translate(0, 0.004, 0), new THREE.MeshLambertMaterial({ color: 0x6fae5a })));
  before.add(new THREE.Mesh(flat(new THREE.RingGeometry(0.34, 0.37, 48)).translate(0, 0.006, 0), new THREE.MeshLambertMaterial({ color: 0xf2f2ee })));
  const zebra = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 });
  for (let s = 0; s < 4; s++)
    for (let k = -3; k <= 3; k++) {
      const a = (s * Math.PI) / 2;
      const stripe = new THREE.Mesh(flat(new THREE.PlaneGeometry(0.17, 0.032)), zebra);
      stripe.position.set(Math.cos(a) * 0.42 - Math.sin(a) * k * 0.065, 0.004, Math.sin(a) * 0.42 + Math.cos(a) * k * 0.065);
      stripe.rotation.y = -a;
      after.add(stripe);
    }
  junction.add(before, after);
  const ring = groundRing(1.2, GOLD);
  ring.position.y = 0.01;
  g.add(junction, ring);
  return {
    group: g,
    anchor: new THREE.Vector3(x, y + 0.9, z),
    exclusions: [{ x, z, r: 0.9 }],
    update(d, flash) {
      const on = d >= p.event;
      before.visible = !on;
      after.visible = on;
      ring.material.uniforms.uA.value = on ? 0.55 + flash * 2 : 0;
    },
  };
}

// ---------- 捷運環狀線東環段: 10 stations where 捷運局 sites them, each works package lit from its start date ----------
const yearOf = (iso) => {
  const d = new Date(iso + "T00:00:00Z"),
    y = d.getUTCFullYear();
  return y + (d - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1));
};
function buildEastRing(T, p) {
  const { stations, via, packages } = T.landmarks.eastring;
  const byId = Object.fromEntries(stations.map((s) => [s.id, s]));
  // the bureau's route: Y29 … Y35, over 成美橋 to 松山 (Y36), 永春, 象山, 吳興街, then under 拇指山 past the 萬芳 shaft to 動物園
  const order = ["Y29", "Y30", "Y31", "Y32", "Y33", "Y34", "Y35", "chengmei", "Y36", "Y37", "Y38", "Y39", "wanfangShaft", "zooShaft", "Y1"];
  const ctrl = order.map((k) => (byId[k] ? [byId[k].x, byId[k].z] : via[k])).filter(Boolean);
  const flat = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
  const N = 600;
  const pts = flat.getSpacedPoints(N).map((v) => new THREE.Vector3(v.x, T.groundY(v.x, v.z) + 0.3, v.z));
  for (let pass = 0; pass < 6; pass++) for (let i = 1; i < pts.length - 1; i++) pts[i].y = Math.max(pts[i].y, (pts[i - 1].y + pts[i + 1].y) / 2); // smooth over 拇指山
  const curve = new THREE.CatmullRomCurve3(pts);
  // where each station falls along the curve (0..1)
  const along = (x, z) => {
    let best = 0,
      bd = Infinity;
    pts.forEach((q, i) => {
      const d = (q.x - x) ** 2 + (q.z - z) ** 2;
      if (d < bd) (bd = d), (best = i / N);
    });
    return best;
  };
  const tOf = Object.fromEntries(stations.map((s) => [s.id, along(s.x, s.z)]));
  const segs = packages.map((k) => ({ ...k, t0: tOf[k.from], t1: tOf[k.to], date: k.start ? yearOf(k.start) : 9999 }));
  const geo = new THREE.TubeGeometry(curve, 900, 0.09, 6, false);
  // per-vertex start date of the works package it belongs to (9999 = still tendering)
  const uvs = geo.attributes.uv;
  const start = new Float32Array(uvs.count);
  for (let i = 0; i < uvs.count; i++) {
    const t = uvs.getX(i);
    start[i] = (segs.find((s) => t >= Math.min(s.t0, s.t1) - 1e-3 && t <= Math.max(s.t0, s.t1) + 1e-3) || { date: 9999 }).date;
  }
  geo.setAttribute("aStart", new THREE.BufferAttribute(start, 1));
  const mat = glow(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uDate: U.uDate, uFlash: { value: 0 }, uTime: U.uTime, uNight: U.uNight, uGame: U.uGame },
    vertexShader: `attribute float aStart; varying vec2 vUv; varying float vStart; void main(){ vUv = uv; vStart = aStart; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uDate; uniform float uFlash; uniform float uTime; uniform float uNight; uniform float uGame; varying vec2 vUv; varying float vStart;
      void main() {
        float t = vUv.x;
        float on = smoothstep(vStart - 0.01, vStart + 0.03, uDate);
        float dash = step(0.5, fract(t * 220.0));
        vec3 planned = vec3(0.8, 0.85, 0.95) * dash * 0.16;
        float pulse = smoothstep(0.9, 1.0, fract(t * 28.0 - uTime * 0.5));
        vec3 build = vec3(1.0, 0.54, 0.24) * (0.9 + pulse * 2.2);
        vec3 col = mix(planned, build, on) * (0.6 + 0.4 * uNight) + vec3(1.0, 0.7, 0.4) * uFlash * on;
        gl_FragColor = vec4(col, 1.0);
        if (uGame > 0.5) gl_FragColor = vec4(mix(vec3(0.97), mix(vec3(0.92, 0.38, 0.06), vec3(0.98), step(0.5, fract(t * 400.0))), on), mix(dash * 0.85, 1.0, on));
      }`,
  }));
  const tube = new THREE.Mesh(geo, mat);
  // stations: small white discs, plus a crane at every station / shaft of a started package
  const stationMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.15 });
  const g = new THREE.Group();
  g.add(tube);
  for (const s of stations.filter((s) => !["Y29", "Y1"].includes(s.id))) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 20), stationMat);
    m.position.set(s.x, T.groundY(s.x, s.z) + 0.04, s.z);
    g.add(m);
  }
  const cranes = [];
  const sites = [];
  for (const k of segs.filter((k) => k.start)) {
    const ids = stations.filter((s) => tOf[s.id] >= Math.min(k.t0, k.t1) && tOf[s.id] <= Math.max(k.t0, k.t1) && !["Y29", "Y1", k.from === "Y37" ? "Y37" : "", k.to === "Y35" ? "Y35" : ""].includes(s.id));
    for (const s of ids) sites.push([s.x, s.z, k.date]);
    if (k.id === "CF763") sites.push([...via.wanfangShaft, k.date], [...via.zooShaft, k.date]);
  }
  for (const [sx, sz, date] of sites) {
    const c = makeCrane(1.8);
    c.position.set(sx + 0.25, T.groundY(sx, sz), sz + 0.2);
    Object.assign(c.userData, { date, phase: sx });
    cranes.push(c);
    g.add(c);
  }
  const mid = byId.Y35;
  return {
    group: g,
    anchor: new THREE.Vector3(mid.x, T.groundY(mid.x, mid.z) + 1.4, mid.z),
    exclusions: [],
    update(d, flash) {
      mat.uniforms.uFlash.value = flash;
      for (const c of cranes) {
        c.visible = d >= c.userData.date;
        c.userData.jib.rotation.y = Math.sin(U.uTime.value * 0.25 + c.userData.phase) * 1.2;
      }
    },
  };
}

// ---------- 輝達北士科總部: the real T17/T18 lot → signed (gold ring, site fence, crane) → low "Constellation" blueprint ----------
// press descriptions: modelled on the US HQ, low and wide (high site coverage), facade of triangles and polygons, lots of glass
function buildNvidia(T, p) {
  const siteRing = ring2(T.landmarks.nvidia.site);
  const [cx, cz] = centroidOf(siteRing);
  const y = Math.max(...siteRing.map(([x, z]) => T.groundY(x, z))) + 0.02;
  const g = new THREE.Group();
  const shape = (r) => new THREE.Shape(r.map(([x, z]) => new THREE.Vector2(x, z)));
  const lotGeo = new THREE.ShapeGeometry(shape(siteRing)).rotateX(Math.PI / 2).translate(0, y, 0);
  const lot = new THREE.Mesh(lotGeo, new THREE.MeshStandardMaterial({ color: 0x6b5f4c, roughness: 1, side: THREE.DoubleSide }));
  // building: the lot inset toward its centre (about 70% coverage), ~30 m, with a faceted roof rising to a raised centre
  const inset = siteRing.map(([x, z]) => [cx + (x - cx) * 0.84, cz + (z - cz) * 0.84]);
  const H = 30 * BM,
    pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const mid = inset.map(([x, z], i) => [cx + (x - cx) * 0.5, y + H + (i % 2 ? 0.1 : 0.05), cz + (z - cz) * 0.5]);
  const top = [cx, y + H + 0.16, cz];
  for (let i = 0; i < inset.length; i++) {
    const j = (i + 1) % inset.length;
    const a0 = [inset[i][0], y, inset[i][1]],
      b0 = [inset[j][0], y, inset[j][1]],
      a1 = [inset[i][0], y + H, inset[i][1]],
      b1 = [inset[j][0], y + H, inset[j][1]];
    tri(a0, b0, b1);
    tri(a0, b1, a1); // facade
    tri(a1, b1, mid[j]);
    tri(a1, mid[j], mid[i]); // outer roof facets
    tri(mid[i], mid[j], top); // inner roof facets
  }
  const hqGeo = new THREE.BufferGeometry();
  hqGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  hqGeo.computeVertexNormals();
  const hq = blueprint([hqGeo], CYAN, y, H + 0.16);
  const ring = groundRing(Math.max(...siteRing.map(([x, z]) => Math.hypot(x - cx, z - cz))) + 0.3, GOLD);
  ring.position.set(cx, y + 0.01, cz);
  // site fence along the real lot edges, and a tower crane
  const site = new THREE.Group();
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0xf28c28 });
  for (let i = 0; i < siteRing.length; i++) {
    const [x0, z0] = siteRing[i],
      [x1, z1] = siteRing[(i + 1) % siteRing.length];
    const l = Math.hypot(x1 - x0, z1 - z0);
    if (l < 0.02) continue;
    const f = new THREE.Mesh(new THREE.BoxGeometry(l, 0.12, 0.03), fenceMat);
    f.position.set((x0 + x1) / 2, y + 0.06, (z0 + z1) / 2);
    f.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    site.add(f);
  }
  const crane = makeCrane(2.4);
  crane.position.set(inset[0][0], y, inset[0][1]);
  site.add(crane);
  g.add(lot, hq, ring, site);
  return {
    group: g,
    anchor: new THREE.Vector3(cx, y + 2.0, cz),
    exclusions: [{ x: cx, z: cz, r: 1.6 }],
    update(d, flash) {
      const signed = d >= p.event;
      ring.material.uniforms.uA.value = signed ? 0.6 + flash * 2.5 : 0;
      hq.visible = signed;
      site.visible = signed;
      crane.userData.jib.rotation.y = Math.sin(U.uTime.value * 0.2) * 1.4;
      hq.userData.u.uProgress.value = 0.35 + 0.65 * smooth(p.event, 2028, d);
    },
  };
}

// ---------- 都市更新: one scaffold per renewal unit approved since 上任那天 (都更處 open data, placed in its land section) ----------
function buildRenewal(T, p) {
  const rnd = mulberry(353);
  // [x, z, approved (decimal year), sqrt(area ha), approved flag, case ID]; cases are placed within their land section,
  // so nudge any that land on a landmark (they are certainly not that building) just outside it
  const blocked = [ring2(T.landmarks.dome.outline), ring2(T.landmarks.nvidia.site)];
  // the representative buildings are small, so a scaffold beside one must also clear it: keep centres a scaffold's half-width away
  const icons = T.landmarks.icons
    .filter((i) => i.outline)
    .map((i) => {
      const r = ring2(i.outline);
      const c = centroidOf(r);
      return { c, r: Math.max(...r.map(([x, z]) => Math.hypot(x - c[0], z - c[1]))) + 0.6 };
    });
  const inPoly = (x, z, r) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    return c;
  };
  const sites = T.renewal.cases.map((c) => {
    let [x, z] = c;
    for (const r of blocked)
      if (inPoly(x, z, r)) {
        const [cx, cz] = centroidOf(r);
        const d = Math.hypot(x - cx, z - cz) || 1;
        for (let k = 0; k < 40 && inPoly(x, z, r); k++) (x += ((x - cx) / d) * 0.1), (z += ((z - cz) / d) * 0.1);
        (x += ((x - cx) / d) * 0.3), (z += ((z - cz) / d) * 0.3);
      }
    for (const { c: [cx, cz], r } of icons) {
      const d = Math.hypot(x - cx, z - cz);
      if (d < r) (x = cx + ((x - cx) / (d || 1)) * r), (z = cz + ((z - cz) / (d || 1)) * r);
    }
    return [x, z, ...c.slice(2)];
  });
  const n = sites.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const ev = new Float32Array(n),
    size = new Float32Array(n * 3);
  const mesh = new THREE.InstancedMesh(
    geo,
    glow(new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uDate: U.uDate, uTime: U.uTime, uNight: U.uNight, uFlash: { value: 0 }, uGame: U.uGame },
      vertexShader: /* glsl */ `
        attribute float aEvent; attribute vec3 aSize;
        uniform float uDate;
        varying vec3 vL; varying float vGrow; varying vec3 vNrm;
        void main() {
          float grow = smoothstep(aEvent, aEvent + 0.12, uDate);
          vGrow = grow;
          vec3 p = position; p.y *= grow;
          vL = (position + vec3(0.5, 0.0, 0.5)) * aSize; vL.y *= grow; vNrm = normal;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uNight; uniform float uFlash; uniform float uGame; varying vec3 vL; varying float vGrow; varying vec3 vNrm;
        void main() {
          if (vGrow < 0.01) discard;
          // scaffold lattice: only the poles and floor ledgers, with the frame edges brighter
          vec2 q = abs(vNrm.x) > 0.5 ? vL.zy : abs(vNrm.z) > 0.5 ? vL.xy : vL.xz;
          vec2 g = abs(fract(q / vec2(0.14, 0.1) + 0.5) - 0.5);
          float line = 1.0 - smoothstep(0.0, 0.07, min(g.x, g.y));
          vec3 col = vec3(1.0, 0.42, 0.1) * (0.03 + line * 0.5) * (0.55 + 0.45 * uNight) * (1.0 + uFlash);
          gl_FragColor = vec4(col, 1.0);
          if (uGame > 0.5) {
            // solid orange poles over a light orange sheet, so each site reads at city scale
            gl_FragColor = line > 0.45 ? vec4(vec3(1.0, 0.55, 0.15) * (0.85 + uFlash * 0.4), 1.0) : vec4(1.0, 0.62, 0.3, 0.28);
          }
        }`,
    })),
    n,
  );
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const [x, z, d, side] = sites[i];
    // footprint follows the unit's area (√ha × 100 m = side in world units), kept readable at city scale
    const w = Math.min(1, Math.max(0.3, side * (0.85 + rnd() * 0.3))),
      dd = Math.min(1, Math.max(0.3, side * (0.85 + rnd() * 0.3))),
      h = 0.45 + rnd() * 0.7;
    m.compose(new THREE.Vector3(x, T.groundY(x, z), z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 0.5), new THREE.Vector3(w, h, dd));
    mesh.setMatrixAt(i, m);
    ev[i] = d;
    size.set([w, h, dd], i * 3);
  }
  geo.setAttribute("aEvent", new THREE.InstancedBufferAttribute(ev, 1));
  geo.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 3));
  mesh.frustumCulled = false;
  // pin over the densest cluster of cases; label and map note carry the real count
  let ax = sites[0][0],
    az = sites[0][1],
    most = -1;
  for (const s of sites) {
    const k = sites.filter((q) => (q[0] - s[0]) ** 2 + (q[1] - s[1]) ** 2 < 36).length;
    if (k > most) [most, ax, az] = [k, s[0], s[1]];
  }
  describeRenewal(p, T.renewal);
  return {
    group: mesh,
    anchor: new THREE.Vector3(ax, T.groundY(ax, az) + 1.6, az),
    exclusions: [],
    update(d, flash) {
      mesh.material.uniforms.uFlash.value = flash;
    },
  };
}

// ---------- 松山機場 → 臺北 AI 園區 (zoning illustrative) ----------
function buildSongshan(T, p) {
  const ap = T.geo.airport;
  const g = new THREE.Group();
  const yAt = (x, z) => T.groundY(x, z) + 0.03;
  // airport as it is: aprons + runway with edge lights
  const apronMat = new THREE.MeshStandardMaterial({ color: 0x8d9095, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const airport = new THREE.Group();
  for (const a of ap.aprons) {
    // shape drawn in (x, -z) so that turning it flat keeps the normal pointing up
    const pts = [];
    for (let i = 0; i < a.length; i += 2) pts.push(new THREE.Vector2(a[i], -a[i + 1]));
    const sg = new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI / 2);
    const pos = sg.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, yAt(pos.getX(i), pos.getZ(i)) + 0.02);
    sg.computeVertexNormals();
    const apron = new THREE.Mesh(sg, apronMat);
    apron.receiveShadow = true;
    airport.add(apron);
  }
  const r = ap.runway;
  const a0 = new THREE.Vector2(r[0], r[1]),
    a1 = new THREE.Vector2(r[r.length - 2], r[r.length - 1]);
  const dir = a1.clone().sub(a0),
    len = dir.length();
  dir.normalize();
  const ang = Math.atan2(dir.y, dir.x);
  const mid = a0.clone().add(a1).multiplyScalar(0.5);
  // parked airliners (≈45 m) along each apron's long axis
  const body = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.5 }),
    tail = new THREE.MeshStandardMaterial({ color: 0x2e6be6, roughness: 0.5 });
  const plane = () => {
    const p = new THREE.Group();
    p.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 10).rotateZ(Math.PI / 2), body));
    p.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8).scale(1.6, 1, 1).translate(0.21, 0, 0), body));
    p.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.4).translate(0.02, -0.01, 0), body));
    p.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.15).translate(-0.18, 0.01, 0), body));
    p.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.008).translate(-0.19, 0.05, 0), tail));
    p.traverse((o) => o.isMesh && (o.castShadow = true));
    return p;
  };
  for (const a of ap.aprons) {
    const pts = [];
    for (let i = 0; i < a.length; i += 2) pts.push([a[i], a[i + 1]]);
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length,
      cz = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    let far = pts[0];
    for (const q of pts) if (Math.hypot(q[0] - cx, q[1] - cz) > Math.hypot(far[0] - cx, far[1] - cz)) far = q;
    const ax = Math.atan2(far[1] - cz, far[0] - cx);
    const span = Math.min(2.4, Math.hypot(far[0] - cx, far[1] - cz) * 1.2);
    const count = Math.max(1, Math.min(4, Math.round(span / 0.6)));
    for (let k = 0; k < count; k++) {
      const t = (k - (count - 1) / 2) * 0.6;
      const px = cx + Math.cos(ax) * t,
        pz = cz + Math.sin(ax) * t;
      const pl = plane();
      pl.position.set(px, yAt(px, pz) + 0.05, pz);
      pl.rotation.y = -ax + Math.PI / 2; // noses facing across the apron, towards the terminal
      airport.add(pl);
    }
  }
  // runway with its markings (edge lines, dashed centreline, threshold bars, numbers area), draped over the ground
  const rc = document.createElement("canvas");
  rc.width = 2048;
  rc.height = 64;
  const rg = rc.getContext("2d");
  rg.fillStyle = "#3a3c41";
  rg.fillRect(0, 0, 2048, 64);
  rg.fillStyle = "#f2f2ee";
  rg.fillRect(0, 3, 2048, 2);
  rg.fillRect(0, 59, 2048, 2);
  for (let x = 120; x < 1928; x += 48) rg.fillRect(x, 31, 26, 2);
  for (const x0 of [12, 2036 - 70]) for (let y = 9; y < 56; y += 6) rg.fillRect(x0, y, 70, 3);
  const rtex = new THREE.CanvasTexture(rc);
  rtex.colorSpace = THREE.SRGBColorSpace;
  rtex.anisotropy = 8;
  const rgeo = new THREE.PlaneGeometry(len, 0.6, 64, 1).rotateX(-Math.PI / 2);
  const runway = new THREE.Mesh(rgeo, new THREE.MeshStandardMaterial({ map: rtex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  runway.rotation.y = -ang;
  runway.position.set(mid.x, 0, mid.y);
  runway.updateMatrixWorld();
  const rp = rgeo.attributes.position,
    wv = new THREE.Vector3();
  for (let i = 0; i < rp.count; i++) {
    wv.set(rp.getX(i), 0, rp.getZ(i)).applyMatrix4(runway.matrixWorld);
    rp.setY(i, yAt(wv.x, wv.z) + 0.03);
  }
  rgeo.computeVertexNormals();
  runway.receiveShadow = true;
  airport.add(runway);
  const lightPos = [];
  for (let s = 0; s <= len; s += 0.6)
    for (const side of [-0.32, 0.32]) {
      const px = a0.x + dir.x * s - dir.y * side,
        pz = a0.y + dir.y * s + dir.x * side;
      lightPos.push(px, yAt(px, pz) + 0.04, pz);
    }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.Float32BufferAttribute(lightPos, 3));
  const lights = new THREE.Points(lg, new THREE.PointsMaterial({ color: new THREE.Color(2.0, 1.6, 1.0), size: 0.09, sizeAttenuation: true }));
  airport.add(lights);

  // vision: a 300 ha (≈300 unit²) site aligned with the runway, split 100 / 90 / 110 ha
  const W = 300 / (len + 2);
  const L = len + 2;
  const zones = [
    { ha: 100, color: CYAN, game: new THREE.Color("#2d7ff9"), kind: "ai" },
    { ha: 90, color: new THREE.Color("#b8d8ff"), game: new THREE.Color("#f2994a"), kind: "home" },
    { ha: 110, color: new THREE.Color("#7dffb0"), game: new THREE.Color("#3cb371"), kind: "park" },
  ];
  const vision = new THREE.Group();
  vision.position.set(mid.x, 0, mid.y);
  vision.rotation.y = -ang;
  const baseY = yAt(mid.x, mid.y);
  // the zone plates sit just above the highest ground in the site so the terrain never pokes through
  let topY = baseY;
  for (let u = -L / 2; u <= L / 2; u += 0.5)
    for (let v = -W / 2; v <= W / 2; v += 0.5) topY = Math.max(topY, yAt(mid.x + u * Math.cos(ang) - v * Math.sin(ang), mid.y + u * Math.sin(ang) + v * Math.cos(ang)));
  const rnd = mulberry(8);
  let off = -L / 2;
  const blueprints = [];
  for (const zn of zones) {
    const zl = (zn.ha / 300) * L;
    const cx = off + zl / 2;
    off += zl;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(zl - 0.3, W - 0.3).rotateX(-Math.PI / 2),
      glow(new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: zn.color }, uGameColor: { value: zn.game }, uA: { value: 0 }, uGame: U.uGame },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform vec3 uGameColor; uniform float uA; uniform float uGame; varying vec2 vUv;
          void main() {
            vec2 e = min(vUv, 1.0 - vUv);
            float border = 1.0 - smoothstep(0.0, 0.012, min(e.x, e.y));
            vec2 gr = abs(fract(vUv * vec2(24.0, 10.0)) - 0.5);
            float grid = (1.0 - smoothstep(0.0, 0.04, min(gr.x, gr.y))) * 0.12;
            gl_FragColor = uGame > 0.5 ? vec4(mix(uGameColor, vec3(1.0), border * 0.55 + grid * 1.5), clamp((border * 1.2 + grid * 1.5 + 0.4) * uA, 0.0, 0.85)) : vec4(uColor * (border * 1.6 + grid + 0.05) * uA, 1.0);
          }`,
      })),
    );
    plate.renderOrder = 3;
    plate.position.set(cx, topY + 0.03, 0);
    vision.add(plate);
    zn.plate = plate;
    const geoms = [];
    if (zn.kind === "ai") {
      for (let i = 0; i < 9; i++) {
        const h = 1.2 + rnd() * 3.2;
        geoms.push(box(0.7 + rnd() * 0.5, h, 0.7 + rnd() * 0.5, cx + (rnd() - 0.5) * (zl - 1.6), 0, (rnd() - 0.5) * (W - 2.2)));
      }
    } else if (zn.kind === "home") {
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) geoms.push(box(1.1, 0.8 + rnd() * 0.9, 0.55, cx + i * (zl / 3.4), 0, j * (W / 3.6)));
    }
    if (geoms.length) {
      const bp = blueprint(geoms, zn.color, baseY, 4.4);
      bp.position.y = baseY;
      vision.add(bp);
      blueprints.push(bp);
    } else {
      // park: a field of soft green points
      const tp = [];
      for (let i = 0; i < 420; i++) tp.push(cx + (rnd() - 0.5) * (zl - 0.6), baseY + 0.12 + rnd() * 0.18, (rnd() - 0.5) * (W - 0.6));
      const pg = new THREE.BufferGeometry();
      pg.setAttribute("position", new THREE.Float32BufferAttribute(tp, 3));
      zn.trees = new THREE.Points(pg, glow(new THREE.PointsMaterial({ color: new THREE.Color(0.5, 2.0, 1.0), size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      vision.add(zn.trees);
      const tg = new THREE.IcosahedronGeometry(0.75, 0).scale(1, 1.1, 1).translate(0, 0.85, 0);
      zn.gameTrees = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ color: 0x5fae4a, flatShading: true }), 160);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 160; i++) {
        const s = 0.14 + rnd() * 0.12;
        m4.compose(new THREE.Vector3(cx + (rnd() - 0.5) * (zl - 0.8), topY, (rnd() - 0.5) * (W - 0.8)), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
        zn.gameTrees.setMatrixAt(i, m4);
      }
      zn.gameTrees.castShadow = true;
      vision.add(zn.gameTrees);
    }
  }
  g.add(airport, vision);
  return {
    group: g,
    anchor: new THREE.Vector3(mid.x, baseY + 5.2, mid.y),
    exclusions: [{ rect: true, x: mid.x, z: mid.y, w: L / 2 + 0.3, d: W / 2 + 0.3 }],
    update(d, flash) {
      const k = smooth(p.event, p.event + 0.9, d);
      vision.visible = k > 0.001;
      airport.visible = k < 0.999;
      apronMat.opacity = runway.material.opacity = 1 - k;
      apronMat.transparent = runway.material.transparent = k > 0;
      lights.visible = k < 0.5;
      for (const zn of zones) {
        zn.plate.material.uniforms.uA.value = k * (0.8 + flash);
        if (zn.trees) {
          const game = U.uGame.value > 0.5;
          zn.trees.visible = !game;
          zn.trees.material.opacity = k;
          zn.gameTrees.visible = game && k > 0.6;
        }
      }
      for (const bp of blueprints) bp.userData.u.uProgress.value = smooth(p.event + 0.2, p.event + 1.2, d);
    },
  };
}

// ---------- 自駕公車示範 (planned): a small loop at 北士科 with a moving shuttle ----------
function buildAutobus(T, p) {
  const site = ring2(T.landmarks.nvidia.site);
  const [sx, sz] = centroidOf(site);
  const [x, z] = [sx + 3.2, sz + 1.2]; // demonstration loop beside the 北士科 site (illustrative)
  const y = T.groundY(x, z) + 0.08;
  const curve = new THREE.EllipseCurve(0, 0, 2.6, 1.6, 0, Math.PI * 2);
  const pts = curve.getSpacedPoints(120).map((v) => new THREE.Vector3(x + v.x, y, z + v.y));
  const lineMat = new THREE.LineDashedMaterial({ color: new THREE.Color(0.8, 2.2, 2.6), dashSize: 0.15, gapSize: 0.1, transparent: true });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
  line.computeLineDistances();
  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 3.0, 3.4) }));
  const g = new THREE.Group();
  g.add(line, bus);
  return {
    group: g,
    anchor: new THREE.Vector3(x + 2.6, y + 1.2, z),
    exclusions: [],
    update(d) {
      const on = smooth(p.event, p.event + 0.15, d);
      g.visible = on > 0.01;
      lineMat.opacity = on;
      const t = (U.uTime.value * 0.05) % 1;
      const a = curve.getPointAt(t),
        b = curve.getPointAt((t + 0.01) % 1);
      bus.position.set(x + a.x, y + 0.07, z + a.y);
      bus.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
    },
  };
}

// ---------- schools (免費午餐) and YouBike stations (前 30 分鐘免費) as glowing points ----------
function pointsLayer(T, list, event, colorBefore, colorAfter, sizeAfter) {
  const pos = new Float32Array(list.length * 3),
    seed = new Float32Array(list.length);
  list.forEach(([x, z], i) => {
    pos.set([x, T.groundY(x, z) + 0.12, z], i * 3);
    seed[i] = Math.random();
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const mat = glow(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uGame: U.uGame,
      uDate: U.uDate,
      uTime: U.uTime,
      uNight: U.uNight,
      uReveal: U.uReveal,
      uRevealCenter: U.uRevealCenter,
      uEvent: { value: event },
      uFlash: { value: 0 },
      uScale: { value: 1 },
      uC0: { value: new THREE.Color(colorBefore) },
      uC1: { value: new THREE.Color(colorAfter) },
      uSize: { value: sizeAfter },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uDate; uniform float uEvent; uniform float uTime; uniform float uScale; uniform float uSize; uniform float uFlash;
      uniform float uReveal; uniform vec2 uRevealCenter; uniform float uGame;
      varying float vOn; varying float vSeed; varying float vVis;
      void main() {
        vOn = smoothstep(uEvent - 0.005, uEvent + 0.02, uDate);
        vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vVis = 1.0 - smoothstep(uReveal - 10.0, uReveal, length(position.xz - uRevealCenter));
        vVis *= mix(1.0, 1.0 - smoothstep(70.0, 150.0, -mv.z), uGame);
        float s = mix(0.12, uSize, vOn) * (1.0 + 0.25 * sin(uTime * 2.0 + aSeed * 30.0) * vOn + uFlash * 1.5 * vOn);
        gl_PointSize = min(s * uScale / -mv.z, mix(26.0, 16.0, uGame));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uC0; uniform vec3 uC1; uniform float uNight; uniform float uGame;
      varying float vOn; varying float vSeed; varying float vVis;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        if (uGame > 0.5) {
          // game marker: a solid dot with a white rim
          vec3 c = mix(mix(vec3(0.62, 0.66, 0.72), uC1, vOn), vec3(1.0), smoothstep(0.55, 0.7, d));
          gl_FragColor = vec4(c, (1.0 - smoothstep(0.86, 1.0, d)) * vVis);
          return;
        }
        float core = 1.0 - smoothstep(0.0, 0.35, d);
        float halo = pow(1.0 - d, 2.0) * 0.5;
        vec3 c = mix(uC0 * 0.5, uC1, vOn);
        gl_FragColor = vec4(c * (core + halo) * mix(0.6, 1.0, uNight) * vVis, 1.0);
      }`,
  }));
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 4;
  return pts;
}

function buildSchools(T, p) {
  const pts = pointsLayer(T, T.geo.schools, p.event, "#c9d3e3", "#ffc56b", 0.9);
  const [ax, az] = project(...p.place);
  return { group: pts, anchor: new THREE.Vector3(ax, T.groundY(ax, az) + 1.2, az), exclusions: [], material: pts.material, update(d, flash) { pts.material.uniforms.uFlash.value = flash; } };
}
function buildYoubike(T, p) {
  const pts = pointsLayer(T, T.geo.youbike, p.event, "#c9d3e3", "#5fffe0", 0.42);
  const [ax, az] = project(...p.place);
  return { group: pts, anchor: new THREE.Vector3(ax, T.groundY(ax, az) + 1.2, az), exclusions: [], material: pts.material, update(d, flash) { pts.material.uniforms.uFlash.value = flash; } };
}

export const LAYER_BUILDERS = {
  dome: buildDome,
  gongguan: buildGongguan,
  eastring: buildEastRing,
  nvidia: buildNvidia,
  renewal: buildRenewal,
  songshan: buildSongshan,
  autobus: buildAutobus,
  lunch: buildSchools,
  youbike: buildYoubike,
};
export { buildAnchors };
