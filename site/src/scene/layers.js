// Policy layers. Each layer reads the date (decimal year) and shows the city as it was / is / is planned at that moment.
// Visual grammar: 起點 = as found, 做到了 = lit and in use, 正在做 = scaffolds and cranes, 接下來 = glowing blueprint.
import * as THREE from "three";
import { U, LIGHT_GLSL, mulberry, smooth } from "./shared.js";
import { project } from "./geo.js";
import { describeRenewal } from "./policies.js";
import { ROAD_WIDTH } from "./city.js";
import { buildBirth, buildElder, buildChildcare, buildWorktime, buildCiviclaw, buildAiEdu, buildLunchCampus, buildUrban5099, buildSidewalk } from "./civic.js";

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

// ---------- 臺北大巨蛋: the real footprint and 74.5 m height; a fenced site with cranes (上任那天) → open and lit ----------
// as the photos show it: a full, pebble-like silver shell with steep rounded sides and a flat crown, panel seams,
// over a glass concourse ring with white floor bands; the Garden City mall and the two towers stand beside it (icons.js)
function buildDome(T, p) {
  const { center, a, b, angle } = T.landmarks.dome;
  const [x, z] = center;
  const y = T.groundY(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = -angle;
  const H = 74.5 * BM, // TVBS: the dome stands 74.5 m high
    BASE = 18 * BM; // glass concourse levels under the shell
  // shell profile: a superellipse from the eave to the crown (fuller shoulders than a sphere)
  const RINGS = 28,
    SEG = 120;
  const prof = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = (i / RINGS) * (Math.PI / 2);
    prof.push([1.025 * Math.pow(Math.cos(t), 2 / 2.7), BASE + (H - BASE) * Math.pow(Math.sin(t), 2 / 1.9)]);
  }
  const pos = [],
    uv = [],
    idx = [];
  for (let i = 0; i <= RINGS; i++)
    for (let j = 0; j <= SEG; j++) {
      const th = (j / SEG) * Math.PI * 2;
      const [s, py] = prof[i];
      pos.push(Math.cos(th) * a * s, py, Math.sin(th) * b * s);
      uv.push(j / SEG, i / RINGS);
    }
  for (let i = 0; i < RINGS; i++)
    for (let j = 0; j < SEG; j++) {
      const k = i * (SEG + 1) + j;
      idx.push(k, k + SEG + 1, k + 1, k + 1, k + SEG + 1, k + SEG + 2);
    }
  const shellGeo = new THREE.BufferGeometry();
  shellGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  shellGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  shellGeo.setIndex(idx);
  shellGeo.computeVertexNormals();
  // panel texture: radial seams and a lighter cladding band low on the shell
  const pc = document.createElement("canvas");
  pc.width = 1024;
  pc.height = 256;
  const pctx = pc.getContext("2d");
  const grad = pctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#e8ecf0");
  grad.addColorStop(0.18, "#f2f4f6");
  grad.addColorStop(0.24, "#c3cad2");
  grad.addColorStop(0.6, "#d3d9df");
  grad.addColorStop(1, "#dfe4e9");
  pctx.fillStyle = grad;
  pctx.fillRect(0, 0, 1024, 256);
  pctx.fillStyle = "rgba(90, 100, 112, 0.16)";
  for (let k = 0; k < 64; k++) pctx.fillRect(k * 16, 60, 1, 196);
  for (const yy of [46, 60, 120, 190]) pctx.fillRect(0, yy, 1024, 1);
  const panelTex = new THREE.CanvasTexture(pc);
  panelTex.colorSpace = THREE.SRGBColorSpace;
  panelTex.anisotropy = 8;
  const shell = new THREE.MeshStandardMaterial({ map: panelTex, color: 0xffffff, roughness: 0.32, metalness: 0.55, emissive: 0xffe2b8, emissiveIntensity: 0 });
  const dome = new THREE.Mesh(shellGeo, shell);
  // glass concourse ring under the shell: blue-grey glass, white floor slabs, mullions
  const fc = document.createElement("canvas");
  fc.width = 512;
  fc.height = 64;
  const fctx = fc.getContext("2d");
  fctx.fillStyle = "#5f7f99";
  fctx.fillRect(0, 0, 512, 64);
  fctx.fillStyle = "#f2f4f5";
  for (const yy of [0, 20, 40]) fctx.fillRect(0, yy, 512, 5);
  fctx.fillStyle = "rgba(230, 236, 240, 0.6)";
  for (let k = 0; k < 64; k++) fctx.fillRect(k * 8, 0, 1, 64);
  const facadeTex = new THREE.CanvasTexture(fc);
  facadeTex.colorSpace = THREE.SRGBColorSpace;
  facadeTex.wrapS = THREE.RepeatWrapping;
  facadeTex.repeat.set(3, 1);
  const glassM = new THREE.MeshStandardMaterial({ map: facadeTex, roughness: 0.25, metalness: 0.3, emissive: 0xffd9a0, emissiveMap: facadeTex, emissiveIntensity: 0 });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, BASE, SEG, 1, true).scale(a * 0.97, 1, b * 0.97).translate(0, BASE / 2, 0), glassM);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2).scale(a + 0.45, 1, b + 0.4).translate(0, 0.012, 0), new THREE.MeshStandardMaterial({ color: 0xb4b0a6, roughness: 1 }));
  // eave light ring (bloom at night)
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.022, 6, 120).rotateX(Math.PI / 2).scale(a * 1.025, 1, b * 1.025).translate(0, BASE + 0.005, 0), ringMat);
  // construction fence (before)
  const fenceMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uNight: U.uNight },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uNight; varying vec2 vUv; void main(){ float s = step(0.5, fract(vUv.x * 60.0)); vec3 c = mix(vec3(0.85,0.85,0.8), vec3(0.95,0.45,0.15), s) * mix(0.6, 0.18, uNight); gl_FragColor = vec4(c, 1.0); }`,
  });
  const fence = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.14, 96, 1, true).scale(a + 0.35, 1, b + 0.3).translate(0, 0.07, 0), fenceMat);
  // light beams (after, night city)
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
  // as found (2022.12): the shell up but the site still fenced, scaffolding round the base, two tower cranes, bare ground
  const works = new THREE.Group();
  const scaffold = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, BASE * 1.6, 72, 4, true).scale(a + 0.08, 1, b + 0.08).translate(0, (BASE * 1.6) / 2, 0),
    new THREE.MeshLambertMaterial({ color: 0xd98a3a, wireframe: true }),
  );
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2).scale(a + 0.45, 1, b + 0.4).translate(0, 0.016, 0), new THREE.MeshLambertMaterial({ color: 0x9c8466 }));
  works.add(scaffold, dirt);
  for (const [cx, cz, h] of [[a * 0.85, -b * 0.75, 2.6], [-a * 0.8, b * 0.7, 2.2]]) {
    const c = makeCrane(h);
    c.position.set(cx, 0, cz);
    works.add(c);
  }
  // the crowd on the plaza once it is open (game city)
  const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.018, 0.04, 2, 6).translate(0, 0.04, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), 160);
  const rnd = mulberry(91);
  const m4 = new THREE.Matrix4();
  const tints = ["#ff5d73", "#2e6be6", "#ffd23f", "#5cd68a", "#f4f4f0", "#1d3557"].map((h) => new THREE.Color(h));
  for (let i = 0; i < 160; i++) {
    const th = rnd() * Math.PI * 2,
      r = 1.06 + rnd() * 0.3;
    m4.makeTranslation(Math.cos(th) * a * r, 0.012, Math.sin(th) * b * r);
    crowd.setMatrixAt(i, m4);
    crowd.setColorAt(i, tints[i % tints.length]);
  }
  g.add(plaza, wall, dome, ring, fence, beams, works, crowd);
  for (const o of [plaza, wall, dome]) o.castShadow = o.receiveShadow = true;
  return {
    group: g,
    anchor: new THREE.Vector3(x, y + H + 0.6, z),
    exclusions: [{ x, z, r: a + 0.5 }],
    update(d, flash) {
      const on = smooth(p.event - 0.02, p.event + 0.02, d);
      fence.visible = on < 0.5;
      works.visible = on < 0.5;
      for (const c of works.children) if (c.userData.jib) c.userData.jib.rotation.y = Math.sin(U.uTime.value * 0.22 + c.position.x) * 1.3;
      crowd.visible = on > 0.5 && U.uGame.value > 0.5;
      beams.visible = on > 0.01;
      // unfinished: a duller, darker shell and dark glass; open: bright silver, the concourse lit at night
      shell.color.setHex(on > 0.5 ? 0xffffff : 0x9aa1a9);
      shell.emissiveIntensity = on * 0.1 * U.uNight.value + flash * 0.35;
      glassM.emissiveIntensity = on * 0.9 * U.uNight.value;
      glassM.color.setHex(on > 0.5 ? 0xffffff : 0x8a9097);
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
  // the works (2025.09.13–09.29): the island dug up, barriers round it, an excavator
  const works = new THREE.Group();
  works.add(new THREE.Mesh(flat(new THREE.CircleGeometry(0.42, 40)).translate(0, 0.006, 0), new THREE.MeshLambertMaterial({ color: 0x9c8466 })));
  const barrier = new THREE.MeshLambertMaterial({ color: 0xff8a3d }),
    white = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 });
  for (let k = 0; k < 28; k++) {
    const t = (k / 28) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.02), k % 2 ? barrier : white);
    b.position.set(Math.cos(t) * 0.5, 0.03, Math.sin(t) * 0.5);
    b.rotation.y = -t + Math.PI / 2;
    works.add(b);
  }
  const digger = new THREE.Group();
  const yellow = new THREE.MeshLambertMaterial({ color: 0xffc233 });
  digger.add(new THREE.Mesh(box(0.16, 0.08, 0.12, 0, 0.02, 0), yellow), new THREE.Mesh(box(0.08, 0.07, 0.1, -0.03, 0.1, 0), yellow));
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.025).translate(0.11, 0, 0), yellow);
  arm.position.set(0.04, 0.15, 0);
  arm.rotation.z = -0.5;
  digger.add(arm);
  digger.position.set(0.1, 0, -0.08);
  works.add(digger);
  for (const o of works.children) o.castShadow = true;
  junction.add(before, after, works);
  const ring = groundRing(1.2, GOLD);
  ring.position.y = 0.01;
  g.add(junction, ring);
  return {
    group: g,
    anchor: new THREE.Vector3(x, y + 0.9, z),
    exclusions: [{ x, z, r: 0.9 }],
    update(d, flash) {
      const on = d >= p.event;
      const dig = d >= p.works && !on;
      before.visible = !on && !dig;
      works.visible = dig;
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
    uniforms: { uDate: U.uDate, uFlash: { value: 0 }, uTime: U.uTime, uNight: U.uNight, uGame: U.uGame, uDone: { value: 0 } },
    vertexShader: `attribute float aStart; varying vec2 vUv; varying float vStart; void main(){ vUv = uv; vStart = aStart; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uDate; uniform float uFlash; uniform float uTime; uniform float uNight; uniform float uGame; uniform float uDone; varying vec2 vUv; varying float vStart;
      void main() {
        float t = vUv.x;
        float on = smoothstep(vStart - 0.01, vStart + 0.03, uDate);
        float dash = step(0.5, fract(t * 220.0));
        vec3 planned = vec3(0.8, 0.85, 0.95) * dash * 0.16;
        float pulse = smoothstep(0.9, 1.0, fract(t * 28.0 - uTime * 0.5));
        vec3 build = vec3(1.0, 0.54, 0.24) * (0.9 + pulse * 2.2);
        vec3 col = mix(planned, build, on) * (0.6 + 0.4 * uNight) + vec3(1.0, 0.7, 0.4) * uFlash * on;
        // in service: the Circular Line's yellow
        col = mix(col, vec3(1.0, 0.82, 0.1) * (0.8 + 0.6 * uNight), uDone);
        gl_FragColor = vec4(col, 1.0);
        if (uGame > 0.5) gl_FragColor = vec4(mix(mix(vec3(0.97), mix(vec3(0.92, 0.38, 0.06), vec3(0.98), step(0.5, fract(t * 400.0))), on), vec3(1.0, 0.8, 0.06), uDone), mix(mix(dash * 0.85, 1.0, on), 1.0, uDone));
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
  // in service (target 2032): station entrances in the line colour, and trains running the (underground) route
  const opened = new THREE.Group();
  const pavM = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 }),
    roofM = new THREE.MeshLambertMaterial({ color: 0xffcc1a, emissive: 0xffb300, emissiveIntensity: 0 });
  for (const st of stations) {
    const yy = T.groundY(st.x, st.z);
    const e = new THREE.Group();
    // a glass entrance under a yellow canopy, and the line's sign on a pole
    e.add(new THREE.Mesh(box(0.5, 0.2, 0.32, 0, 0, 0), pavM), new THREE.Mesh(box(0.62, 0.06, 0.44, 0, 0.2, 0), roofM));
    e.add(new THREE.Mesh(box(0.03, 0.55, 0.03, 0.38, 0, 0.2), pavM), new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 20).rotateX(Math.PI / 2).translate(0.38, 0.6, 0.2), roofM));
    e.position.set(st.x + 0.4, yy, st.z - 0.3);
    e.traverse((o) => o.isMesh && (o.castShadow = true));
    opened.add(e);
  }
  const CARS = 4,
    TRAINS = 8;
  const trains = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.09, 0.32, 3, 8).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 0 }), CARS * TRAINS);
  for (let i = 0; i < CARS * TRAINS; i++) trains.setColorAt(i, new THREE.Color(i % CARS === 0 ? "#ffcc1a" : "#f4f4f0"));
  trains.castShadow = true;
  opened.add(trains);
  g.add(opened);
  const tm = new THREE.Matrix4(),
    tq = new THREE.Quaternion(),
    tv = new THREE.Vector3(),
    tan = new THREE.Vector3(),
    one = new THREE.Vector3(1, 1, 1),
    xAxis = new THREE.Vector3(1, 0, 0);
  const curveLen = curve.getLength();
  const mid = byId.Y35;
  return {
    group: g,
    anchor: new THREE.Vector3(mid.x, T.groundY(mid.x, mid.z) + 1.4, mid.z),
    exclusions: stations.map((st) => ({ x: st.x + 0.4, z: st.z - 0.3, r: 0.45 })),
    update(d, flash) {
      mat.uniforms.uFlash.value = flash;
      const done = d >= p.done;
      mat.uniforms.uDone.value = done ? 1 : 0;
      opened.visible = done;
      if (done) {
        roofM.emissiveIntensity = 0.5 * U.uNight.value;
        trains.material.emissiveIntensity = 0.4 * U.uNight.value;
        const t = U.uTime.value;
        for (let k = 0; k < TRAINS; k++)
          for (let c = 0; c < CARS; c++) {
            // trains run both ways, spaced along the line
            const dir = k % 2 ? 1 : -1;
            const u = (((k / TRAINS + dir * t * 0.012 - (c * 0.42 * dir) / curveLen) % 1) + 1) % 1;
            curve.getPointAt(u, tv);
            curve.getTangentAt(u, tan);
            tq.setFromUnitVectors(xAxis, tan);
            tm.compose(tv.setY(tv.y + 0.17), tq, one);
            trains.setMatrixAt(k * CARS + c, tm);
          }
        trains.instanceMatrix.needsUpdate = true;
      }
      for (const c of cranes) {
        c.visible = d >= c.userData.date && !done;
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
  // under construction (from the end of 2026): the concrete frame rises; finished (2030): the transparent glass HQ
  const local = hqGeo.clone().translate(0, -y, 0);
  const frame = new THREE.Mesh(local, new THREE.MeshLambertMaterial({ color: 0xb9b7b0 }));
  frame.position.y = y;
  const glassHQ = new THREE.Group();
  const glassM = new THREE.MeshStandardMaterial({ color: 0xa9d4ee, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.88, emissive: 0x9fd8ff, emissiveIntensity: 0 });
  glassHQ.add(new THREE.Mesh(hqGeo, glassM), new THREE.LineSegments(new THREE.EdgesGeometry(hqGeo, 20), new THREE.LineBasicMaterial({ color: 0xf4f8fb })));
  // the grounds once it opens: trees round the building
  const groundsTrees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.75, 0).translate(0, 0.85, 0), new THREE.MeshLambertMaterial({ color: 0x5fae4a, flatShading: true }), 40);
  const tm4 = new THREE.Matrix4();
  for (let i = 0; i < 40; i++) {
    const [ax, az] = siteRing[i % siteRing.length],
      [bx, bz] = siteRing[(i + 1) % siteRing.length];
    const f = (i * 0.37) % 1;
    const px = ax + (bx - ax) * f + (cx - ax) * 0.06,
      pz = az + (bz - az) * f + (cz - az) * 0.06;
    tm4.compose(new THREE.Vector3(px, y, pz), new THREE.Quaternion(), new THREE.Vector3(0.14, 0.15, 0.14));
    groundsTrees.setMatrixAt(i, tm4);
  }
  for (const o of [frame, glassHQ.children[0], groundsTrees]) o.castShadow = o.receiveShadow = true;
  glassHQ.add(groundsTrees);
  g.add(lot, hq, ring, site, frame, glassHQ);
  return {
    group: g,
    anchor: new THREE.Vector3(cx, y + 2.0, cz),
    exclusions: [{ x: cx, z: cz, r: 1.6 }],
    update(d, flash) {
      const signed = d >= p.event,
        building = d >= p.works,
        open = d >= p.done;
      ring.material.uniforms.uA.value = signed ? 0.6 + flash * 2.5 : 0;
      // signed: the design as a blueprint over the fenced lot; then the frame goes up; then the glass building
      hq.visible = signed && !building;
      hq.userData.u.uProgress.value = 0.35 + 0.65 * smooth(p.event, p.works, d);
      site.visible = signed && !open;
      crane.visible = building && !open;
      crane.userData.jib.rotation.y = Math.sin(U.uTime.value * 0.2) * 1.4;
      frame.visible = building && !open;
      frame.scale.y = Math.max(0.001, smooth(p.works, p.done - 0.3, d));
      glassHQ.visible = open;
      glassM.emissiveIntensity = 0.4 * U.uNight.value + flash * 0.3;
    },
  };
}

// ---------- 都市更新: one scaffold per renewal unit approved since 上任那天 (都更處 open data, placed in its land section) ----------
// years from approving a renewal unit to the new building, for the 願景 picture only: a typical span for the
// steps after approval (business plan, review, rights conversion, demolition, construction), not a case schedule
const REBUILD = 8;
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
    })
    // and the props of the citywide policies (hospitals, the 大街廓 demonstration sites)
    .concat(T.landmarks.policySites.hospitals.map((h) => ({ c: h.at, r: 1.2 })))
    .concat(["zhongshan", "nangang"].map((k) => ({ c: centroidOf(ring2(T.landmarks.policySites[k])), r: 1.5 })));
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
          // the scaffold comes up on approval and comes down when the unit is rebuilt (illustrative, see REBUILD)
          float grow = smoothstep(aEvent, aEvent + 0.12, uDate) * (1.0 - step(aEvent + ${REBUILD.toFixed(1)}, uDate));
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
  // in the game city the old walk-ups stand inside each unit, grey with iron-sheet rooftop additions: approval is
  // the first step of renewal, so they stay standing under the scaffold
  const oldBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0xa59d92 }), n);
  const oldRoof = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x6f8fa6 }), n);
  const mo = new THREE.Matrix4();
  const poses = [];
  for (let i = 0; i < n; i++) {
    const [x, z, d, side] = sites[i];
    // footprint follows the unit's area (√ha × 100 m = side in world units), kept readable at city scale
    const w = Math.min(1, Math.max(0.3, side * (0.85 + rnd() * 0.3))),
      dd = Math.min(1, Math.max(0.3, side * (0.85 + rnd() * 0.3))),
      h = 0.45 + rnd() * 0.7;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 0.5);
    const y = T.groundY(x, z);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, dd));
    mesh.setMatrixAt(i, m);
    mo.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w * 0.8, 0.26, dd * 0.8));
    oldBody.setMatrixAt(i, mo);
    mo.compose(new THREE.Vector3(x, y + 0.26, z), q, new THREE.Vector3(w * 0.45, 0.07, dd * 0.5));
    oldRoof.setMatrixAt(i, mo);
    poses.push({ x, y, z, q, w, dd, h: 0.6 + rnd() * 0.7, d });
    ev[i] = d;
    size.set([w, h, dd], i * 3);
  }
  const old = new THREE.Group();
  for (const o of [oldBody, oldRoof]) {
    o.castShadow = o.receiveShadow = true;
    old.add(o);
  }
  // rebuilt (game city): a taller block with a glass base and a roof garden
  const newBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0xf3f1ea }), n);
  const newBase = new THREE.InstancedMesh(new THREE.BoxGeometry(1.04, 1, 1.04).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x8fb9d8 }), n);
  const newRoof = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.04, 0.9).translate(0, 0.02, 0), new THREE.MeshLambertMaterial({ color: 0x7cc05a }), n);
  const rebuilt = new THREE.Group();
  for (const o of [newBody, newBase, newRoof]) {
    o.castShadow = o.receiveShadow = true;
    rebuilt.add(o);
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
  const g = new THREE.Group();
  g.add(old, rebuilt, mesh);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0),
    pm = new THREE.Matrix4(),
    pv = new THREE.Vector3(),
    ps = new THREE.Vector3();
  let lastD = -1;
  const setRebuilt = (date) => {
    if (Math.abs(date - lastD) < 1e-4) return;
    lastD = date;
    poses.forEach(({ x, y, z, q, w, dd, h, d }, i) => {
      const done = date >= d + REBUILD;
      if (done) {
        newBody.setMatrixAt(i, pm.compose(pv.set(x, y, z), q, ps.set(w * 0.75, h, dd * 0.75)));
        newBase.setMatrixAt(i, pm.compose(pv.set(x, y, z), q, ps.set(w * 0.8, 0.12, dd * 0.8)));
        newRoof.setMatrixAt(i, pm.compose(pv.set(x, y + h, z), q, ps.set(w * 0.75, 1, dd * 0.75)));
        oldBody.setMatrixAt(i, zero);
        oldRoof.setMatrixAt(i, zero);
      } else {
        for (const o of [newBody, newBase, newRoof]) o.setMatrixAt(i, zero);
        oldBody.setMatrixAt(i, pm.compose(pv.set(x, y, z), q, ps.set(w * 0.8, 0.26, dd * 0.8)));
        oldRoof.setMatrixAt(i, pm.compose(pv.set(x, y + 0.26, z), q, ps.set(w * 0.45, 0.07, dd * 0.5)));
      }
    });
    for (const o of [newBody, newBase, newRoof, oldBody, oldRoof]) o.instanceMatrix.needsUpdate = true;
  };
  return {
    group: g,
    anchor: new THREE.Vector3(ax, T.groundY(ax, az) + 1.6, az),
    exclusions: sites.map(([x, z]) => ({ x, z, r: 0.35 })),
    update(d, flash) {
      mesh.material.uniforms.uFlash.value = flash;
      old.visible = rebuilt.visible = U.uGame.value > 0.5;
      if (old.visible) setRebuilt(d);
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

  // vision (市府 2026.10.08): 300 ha aligned with the runway. 台北中央公園 (110 ha) runs along the north side to the
  // 基隆河; the AI 產業聚落 (100 ha) and the 國際永續生活聚落 (90 ha) share the south side (which goes where is
  // illustrative). 基河路, 建業三路 and 北安路 cross the site towards the city centre.
  const W = 300 / (len + 2);
  const L = len + 2;
  const vision = new THREE.Group();
  vision.position.set(mid.x, 0, mid.y);
  vision.rotation.y = -ang; // local +x runs along the runway towards its west end, local +z is north
  const baseY = yAt(mid.x, mid.y);
  // the ground plates sit just above the highest ground in the site so the terrain never pokes through
  let topY = baseY;
  for (let u = -L / 2; u <= L / 2; u += 0.5)
    for (let v = -W / 2; v <= W / 2; v += 0.5) topY = Math.max(topY, yAt(mid.x + u * Math.cos(ang) - v * Math.sin(ang), mid.y + u * Math.sin(ang) + v * Math.cos(ang)));
  const rnd = mulberry(8);
  const parkW = (W * 110) / 300,
    southW = W - parkW,
    southZ = -W / 2 + southW / 2,
    parkZ = W / 2 - parkW / 2;
  const aiL = (L * 100) / 190,
    aiX = L / 2 - aiL / 2, // west part of the south side
    homeL = L - aiL,
    homeX = -L / 2 + homeL / 2;
  const flatMat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const plate = (w, d, x, z, c, lift = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), flatMat(c));
    m.position.set(x, topY + 0.03 + lift, z);
    m.receiveShadow = true;
    return m;
  };
  const ground = new THREE.Group();
  ground.add(plate(L, parkW, 0, parkZ, "#86c25f"), plate(aiL, southW, aiX, southZ, "#d9dde1"), plate(homeL, southW, homeX, southZ, "#eee3cf"));
  // 台北中央公園: lakes, paths, groves
  for (const [lx, lz, rx, rz] of [
    [-L * 0.22, parkZ + parkW * 0.05, 2.4, 0.9],
    [L * 0.25, parkZ - parkW * 0.1, 1.6, 0.7],
  ])
    ground.add(new THREE.Mesh(new THREE.CircleGeometry(1, 40).scale(rx, rz, 1).rotateX(-Math.PI / 2).translate(lx, topY + 0.045, lz), flatMat("#5fb6d9")));
  ground.add(plate(L - 0.6, 0.08, 0, parkZ, "#efe1c3", 0.012), plate(0.08, parkW - 0.4, -L * 0.05, parkZ, "#efe1c3", 0.012));
  // roads: the three cross-river corridors (N–S) and an east–west street along the park edge and through the south side
  const roads = new THREE.Group();
  for (const rx of [-L * 0.3, 0.02 * L, L * 0.3]) roads.add(plate(0.28, W, rx, 0, "#55595e", 0.02));
  roads.add(plate(L, 0.24, 0, W / 2 - parkW, "#55595e", 0.02), plate(L, 0.2, 0, southZ, "#55595e", 0.02));
  vision.add(ground, roads);
  // the park's trees, in the game city and (as soft lights) in the night city
  const nTrees = 520;
  const treeGeo = new THREE.IcosahedronGeometry(0.75, 0).scale(1, 1.1, 1).translate(0, 0.85, 0);
  const parkTrees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ color: 0x5fae4a, flatShading: true }), nTrees);
  const m4 = new THREE.Matrix4(),
    q4 = new THREE.Quaternion(),
    v4 = new THREE.Vector3(),
    s4 = new THREE.Vector3();
  const lakes = [
    [-L * 0.22, parkZ + parkW * 0.05, 2.6, 1.1],
    [L * 0.25, parkZ - parkW * 0.1, 1.8, 0.9],
  ];
  let placed = 0;
  while (placed < nTrees) {
    const tx = (rnd() - 0.5) * (L - 0.6),
      tz = parkZ + (rnd() - 0.5) * (parkW - 0.5);
    if (lakes.some(([lx, lz, rx, rz]) => ((tx - lx) / rx) ** 2 + ((tz - lz) / rz) ** 2 < 1)) continue;
    const s = 0.12 + rnd() * 0.1;
    parkTrees.setMatrixAt(placed++, m4.compose(v4.set(tx, topY, tz), q4, s4.set(s, s, s)));
  }
  parkTrees.castShadow = true;
  vision.add(parkTrees);

  // buildings: instanced bodies and roofs per kind, each rising in turn as the vision is built
  const glassM = new THREE.MeshLambertMaterial({ color: 0x8fb9d8, emissive: 0x9fd8ff, emissiveIntensity: 0 });
  const frameM = new THREE.MeshLambertMaterial({ color: 0xf2f4f5 });
  const gardenM = new THREE.MeshLambertMaterial({ color: 0x7cc05a });
  const dataM = new THREE.MeshLambertMaterial({ color: 0xc9ced3 });
  const homeM = new THREE.MeshLambertMaterial({ color: 0xf6efe3, emissive: 0xffd59a, emissiveIntensity: 0 });
  const homeRoofs = ["#e07a5f", "#5cb8a6", "#f2c14e", "#7a9cc6", "#c06c84"].map((h) => new THREE.Color(h));
  const items = []; // [kind, x, z, w, d, h, roofColor]
  // AI cluster: a ring of glass towers round a central plaza, data centres along the east–west street
  const cols = 5,
    rows = 2;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = aiX - aiL / 2 + ((i + 0.5) / cols) * aiL + (rnd() - 0.5) * 0.4,
        z = southZ + (j === 0 ? -1 : 1) * southW * 0.24;
      if (Math.abs(x - 0.02 * L) < 0.7 || Math.abs(x - L * 0.3) < 0.7) continue; // keep the corridors clear
      if (Math.abs(x - (aiX + aiL * 0.02)) < 1.4) continue; // and the hub
      const h = 0.9 + rnd() * 1.9 + (i === 2 ? 1.2 : 0);
      items.push(["tower", x, z, 0.75 + rnd() * 0.35, 0.65 + rnd() * 0.3, h]);
    }
  for (let i = 0; i < 4; i++) items.push(["data", aiX - aiL / 2 + ((i + 0.5) / 4) * aiL, southZ - southW * 0.44, 1.0, 0.36, 0.28]);
  // living community: mid-rise blocks round courtyards
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 3; j++) {
      const x = homeX - homeL / 2 + ((i + 0.5) / 6) * homeL,
        z = southZ + (j - 1) * southW * 0.3;
      if (Math.abs(x + L * 0.3) < 0.55) continue;
      items.push(["home", x + (rnd() - 0.5) * 0.25, z, 0.9 + rnd() * 0.3, 0.42, 0.45 + rnd() * 0.45, homeRoofs[(i + j) % homeRoofs.length]]);
    }
  // street trees in the two districts, between the buildings
  const nDistrictTrees = 220;
  const districtTrees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ color: 0x6db24f, flatShading: true }), nDistrictTrees);
  for (let i = 0; i < nDistrictTrees; i++) {
    let tx, tz;
    for (let tries = 0; tries < 20; tries++) {
      tx = (rnd() - 0.5) * (L - 0.6);
      tz = southZ + (rnd() - 0.5) * (southW - 0.4);
      if (!items.some(([, ix, iz, w, d]) => Math.abs(tx - ix) < w / 2 + 0.12 && Math.abs(tz - iz) < d / 2 + 0.12)) break;
    }
    const sc = 0.09 + rnd() * 0.05;
    districtTrees.setMatrixAt(i, m4.compose(v4.set(tx, topY, tz), q4, s4.set(sc, sc, sc)));
  }
  districtTrees.castShadow = true;
  vision.add(districtTrees);
  // the AI district's centrepiece: a ring-shaped glass hub round a green court (illustrative)
  const hubX = aiX + aiL * 0.02,
    hubZ = southZ;
  const hub = new THREE.Group();
  hub.add(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.22, 10, 48).rotateX(Math.PI / 2).scale(1, 1.6, 1).translate(0, 0.36, 0), glassM));
  hub.add(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 6, 48).rotateX(Math.PI / 2).translate(0, 0.72, 0), frameM));
  hub.add(new THREE.Mesh(new THREE.CircleGeometry(0.6, 32).rotateX(-Math.PI / 2).translate(0, 0.02, 0), gardenM));
  hub.position.set(hubX, topY, hubZ);
  hub.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
  vision.add(hub);
  const byKind = (k) => items.filter((it) => it[0] === k);
  const inst = (geo, mat, list) => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    im.castShadow = im.receiveShadow = true;
    vision.add(im);
    return im;
  };
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const towers = byKind("tower"),
    datas = byKind("data"),
    homes = byKind("home");
  const towerBody = inst(unit, glassM, towers),
    towerFrame = inst(new THREE.BoxGeometry(1.04, 0.05, 1.04).translate(0, 0.5, 0), frameM, towers),
    towerRoof = inst(new THREE.BoxGeometry(0.9, 0.04, 0.9).translate(0, 0.02, 0), gardenM, towers),
    dataBody = inst(unit, dataM, datas),
    homeBody = inst(unit, homeM, homes),
    homeRoof = inst(new THREE.BoxGeometry(1.06, 0.06, 1.1).translate(0, 0.03, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), homes);
  homes.forEach((it, i) => homeRoof.setColorAt(i, it[6]));
  const order = items.map((it, i) => ({ it, delay: rnd() * 0.6 }));
  let lastK = -1;
  const place = (k) => {
    if (Math.abs(k - lastK) < 1e-4) return;
    lastK = k;
    const counters = { tower: 0, data: 0, home: 0 };
    for (const { it, delay } of order) {
      const [kind, x, z, w, d, h] = it;
      const grow = THREE.MathUtils.clamp((k - delay) / 0.4, 0, 1);
      const hh = Math.max(0.001, h * grow);
      const i = counters[kind]++;
      if (kind === "tower") {
        towerBody.setMatrixAt(i, m4.compose(v4.set(x, topY, z), q4, s4.set(w, hh, d)));
        towerFrame.setMatrixAt(i, m4.compose(v4.set(x, topY + hh * 0.55, z), q4, s4.set(w, grow, d)));
        towerRoof.setMatrixAt(i, m4.compose(v4.set(x, topY + hh, z), q4, s4.set(w, grow, d)));
      } else if (kind === "data") dataBody.setMatrixAt(i, m4.compose(v4.set(x, topY, z), q4, s4.set(w, hh, d)));
      else {
        homeBody.setMatrixAt(i, m4.compose(v4.set(x, topY, z), q4, s4.set(w, hh, d)));
        homeRoof.setMatrixAt(i, m4.compose(v4.set(x, topY + hh, z), q4, s4.set(w, grow, d)));
      }
    }
    for (const im of [towerBody, towerFrame, towerRoof, dataBody, homeBody, homeRoof]) im.instanceMatrix.needsUpdate = true;
  };
  place(0);
  g.add(airport, vision);
  return {
    group: g,
    anchor: new THREE.Vector3(mid.x, baseY + 5.2, mid.y),
    exclusions: [{ rect: true, x: mid.x, z: mid.y, w: L / 2 + 0.3, d: W / 2 + 0.3 }],
    update(d, flash) {
      // the airport makes way, then the park greens and the districts rise
      const k = smooth(p.event, p.event + 0.9, d);
      vision.visible = k > 0.001;
      airport.visible = k < 0.999;
      apronMat.opacity = runway.material.opacity = 1 - k;
      apronMat.transparent = runway.material.transparent = k > 0;
      lights.visible = k < 0.5;
      ground.position.y = (1 - smooth(0, 0.3, k)) * -0.06;
      parkTrees.visible = k > 0.25;
      districtTrees.visible = k > 0.6;
      hub.scale.set(1, Math.max(0.001, smooth(0.5, 0.95, k)), 1);
      place(smooth(0.2, 1, k) * 1.6);
      const night = U.uNight.value;
      glassM.emissiveIntensity = 0.45 * night + flash * 0.4;
      homeM.emissiveIntensity = 0.35 * night;
    },
  };
}

// ---------- 自駕公車 (planned, 2027 下半年): driverless buses on the 北士科 demonstration loop and the 仁愛路 bus lane ----------
// routes illustrative; the buses: white with a blue band, dark windows and a sensor pod on the roof
function busModel() {
  const b = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xf6f7f8, emissive: 0xffffff, emissiveIntensity: 0 }),
    band = new THREE.MeshLambertMaterial({ color: 0x2e6be6 }),
    glass = new THREE.MeshLambertMaterial({ color: 0x2d3e50, emissive: 0xfff0c8, emissiveIntensity: 0 }),
    sensor = new THREE.MeshLambertMaterial({ color: 0x5fe3ff, emissive: 0x2aa8d6, emissiveIntensity: 0.6 });
  b.add(new THREE.Mesh(box(0.42, 0.13, 0.15, 0, 0.02, 0), white));
  b.add(new THREE.Mesh(box(0.43, 0.05, 0.155, 0, 0.08, 0), glass));
  b.add(new THREE.Mesh(box(0.43, 0.025, 0.155, 0, 0.035, 0), band));
  b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.03, 10).translate(0.12, 0.165, 0), sensor));
  for (const wx of [-0.13, 0.13]) for (const wz of [-0.075, 0.075]) b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10).rotateX(Math.PI / 2).translate(wx, 0.03, wz), new THREE.MeshLambertMaterial({ color: 0x2d3436 })));
  b.traverse((o) => o.isMesh && (o.castShadow = true));
  b.userData.lit = [white, glass];
  return b;
}
function buildAutobus(T, p) {
  const site = ring2(T.landmarks.nvidia.site);
  const [sx, sz] = centroidOf(site);
  const [x, z] = [sx + 3.2, sz + 1.2]; // demonstration loop beside the 北士科 site (illustrative)
  const y = T.groundY(x, z) + 0.06;
  const loop = new THREE.EllipseCurve(0, 0, 2.6, 1.6, 0, Math.PI * 2);
  const routes = [];
  const loopPts = loop.getSpacedPoints(160).map((v) => new THREE.Vector3(x + v.x, y, z + v.y));
  routes.push({ curve: new THREE.CatmullRomCurve3(loopPts, true), buses: 2, speed: 0.05, closed: true });
  // 仁愛路 bus lane (OpenStreetMap busway)
  const bw = ring2(T.landmarks.policySites.busway || []);
  if (bw.length > 1) {
    const lanePts = bw.map(([bx, bz]) => new THREE.Vector3(bx, T.groundY(bx, bz) + 0.05, bz));
    routes.push({ curve: new THREE.CatmullRomCurve3(lanePts, false, "centripetal"), buses: 4, speed: 0.025, closed: false });
  }
  const g = new THREE.Group();
  const lineMats = [];
  const buses = [];
  for (const r of routes) {
    const lm = new THREE.LineDashedMaterial({ color: new THREE.Color(0.8, 2.2, 2.6), dashSize: 0.15, gapSize: 0.1, transparent: true });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(r.curve.getSpacedPoints(300)), lm);
    line.computeLineDistances();
    lineMats.push(lm);
    g.add(line);
    for (let k = 0; k < r.buses; k++) {
      const b = busModel();
      b.userData.route = r;
      b.userData.phase = k / r.buses;
      b.userData.dir = r.closed || k % 2 === 0 ? 1 : -1;
      b.scale.setScalar(1.3);
      buses.push(b);
      g.add(b);
    }
  }
  const v = new THREE.Vector3(),
    tan = new THREE.Vector3();
  return {
    group: g,
    anchor: new THREE.Vector3(x + 2.6, y + 1.2, z),
    exclusions: [],
    update(d) {
      const on = smooth(p.event, p.event + 0.15, d);
      g.visible = on > 0.01;
      for (const lm of lineMats) lm.opacity = on * (1 - 0.6 * U.uGame.value);
      const t = U.uTime.value;
      for (const b of buses) {
        const { route, phase, dir } = b.userData;
        // round the loop; back and forth along the bus lane (half the buses start the other way)
        let u,
          back = false;
        if (route.closed) u = (t * route.speed + phase) % 1;
        else {
          const s2 = (t * route.speed * 2 + phase * 2 + (dir < 0 ? 1 : 0)) % 2;
          back = s2 >= 1;
          u = back ? 2 - s2 : s2;
        }
        route.curve.getPointAt(u, v);
        route.curve.getTangentAt(u, tan);
        if (back) tan.negate();
        b.position.copy(v);
        b.rotation.y = Math.atan2(-tan.z, tan.x);
        for (const m of b.userData.lit) m.emissiveIntensity = 0.35 * U.uNight.value;
      }
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
      uGameHide: { value: 0 }, // 1: drawn only in the night city (the game city has its own props)
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uDate; uniform float uEvent; uniform float uTime; uniform float uScale; uniform float uSize; uniform float uFlash;
      uniform float uReveal; uniform vec2 uRevealCenter; uniform float uGame; uniform float uGameHide;
      varying float vOn; varying float vSeed; varying float vVis;
      void main() {
        vOn = smoothstep(uEvent - 0.005, uEvent + 0.02, uDate);
        if (uGameHide > 0.5 && uGame > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
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

// schools: glowing points in the night city, campuses with lunch bowls in the game city (civic.js)
function buildSchools(T, p) {
  const pts = pointsLayer(T, T.geo.schools, p.event, "#c9d3e3", "#ffc56b", 0.9);
  pts.material.uniforms.uGameHide.value = 1;
  const campus = buildLunchCampus(T, p);
  const g = new THREE.Group();
  g.add(pts, campus.group);
  const [ax, az] = project(...p.place);
  return {
    group: g,
    anchor: new THREE.Vector3(ax, T.groundY(ax, az) + 1.2, az),
    exclusions: campus.exclusions,
    material: pts.material,
    update(d, flash) {
      pts.material.uniforms.uFlash.value = flash;
      campus.update(d, flash);
    },
  };
}

// YouBike: the stations, and from 2024.02.28 bikes riding the main streets of the game city
function buildYoubike(T, p) {
  const pts = pointsLayer(T, T.geo.youbike, p.event, "#c9d3e3", "#5fffe0", 0.42);
  const [ax, az] = project(...p.place);
  const rnd = mulberry(23);
  const roads = [];
  for (const r of T.geo.roads) {
    if (r[0] < 2) continue; // primary and secondary streets, not motorways
    const line = [];
    for (let i = 1; i + 1 < r.length; i += 2) line.push([r[i], r[i + 1]]);
    const lens = [0];
    for (let i = 1; i < line.length; i++) lens.push(lens[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
    if (lens.at(-1) > 1.5 && T.inCity(...line[0])) roads.push({ pts: line, lens, total: lens.at(-1), c: r[0] });
  }
  const N = 260;
  const riders = Array.from({ length: N }, () => {
    const r = roads[Math.floor(rnd() * roads.length)];
    return { r, s: rnd() * r.total, v: (0.12 + rnd() * 0.08) * (rnd() < 0.5 ? 1 : -1), seg: 0 };
  });
  // a chunky bike: yellow frame, two black wheels, a rider (sizes exaggerated, as the cars are)
  const parts = [
    [new THREE.BoxGeometry(0.1, 0.02, 0.012).translate(0, 0.045, 0), "#ffc233"],
    [new THREE.TorusGeometry(0.025, 0.008, 4, 10).translate(-0.04, 0.03, 0), "#2d3436"],
    [new THREE.TorusGeometry(0.025, 0.008, 4, 10).translate(0.04, 0.03, 0), "#2d3436"],
    [new THREE.CapsuleGeometry(0.013, 0.04, 2, 6).translate(-0.005, 0.085, 0), "#2e6be6"],
    [new THREE.SphereGeometry(0.014, 8, 6).translate(-0.005, 0.125, 0), "#f2c9a0"],
  ];
  const bikes = parts.map(([geo, c]) => {
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: c }), N);
    im.frustumCulled = false;
    im.castShadow = true;
    return im;
  });
  const g = new THREE.Group();
  g.add(pts, ...bikes);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    v = new THREE.Vector3(),
    size = new THREE.Vector3(2.4, 2.4, 2.4);
  let last = U.uTime.value;
  return {
    group: g,
    anchor: new THREE.Vector3(ax, T.groundY(ax, az) + 1.2, az),
    exclusions: [],
    material: pts.material,
    update(d, flash) {
      pts.material.uniforms.uFlash.value = flash;
      const on = d >= p.event && U.uGame.value > 0.5;
      for (const b of bikes) b.visible = on;
      const dt = Math.min(0.1, U.uTime.value - last);
      last = U.uTime.value;
      if (!on || dt <= 0) return;
      riders.forEach((c, i) => {
        const r = c.r;
        c.s = (c.s + c.v * dt + r.total) % r.total;
        while (c.seg > 0 && r.lens[c.seg] > c.s) c.seg--;
        while (c.seg < r.lens.length - 2 && r.lens[c.seg + 1] < c.s) c.seg++;
        const a = r.pts[c.seg],
          b = r.pts[c.seg + 1];
        const l = r.lens[c.seg + 1] - r.lens[c.seg] || 1;
        const t = (c.s - r.lens[c.seg]) / l;
        const dx = (b[0] - a[0]) / l,
          dz = (b[1] - a[1]) / l;
        // ride along the kerb, on the right of the direction of travel
        const side = c.v > 0 ? 1 : -1,
          off = ROAD_WIDTH[r.c] / 2 - 0.03;
        const x = a[0] + (b[0] - a[0]) * t - dz * off * side,
          z = a[1] + (b[1] - a[1]) * t + dx * off * side;
        m.compose(v.set(x, T.groundY(x, z) + 0.035, z), q.setFromAxisAngle(up, Math.atan2(-dz, dx) + (side < 0 ? Math.PI : 0)), size);
        for (const bk of bikes) bk.setMatrixAt(i, m);
      });
      for (const bk of bikes) bk.instanceMatrix.needsUpdate = true;
    },
  };
}

export const LAYER_BUILDERS = {
  sidewalk: buildSidewalk,
  birth: buildBirth,
  childcare: buildChildcare,
  elder: buildElder,
  worktime: buildWorktime,
  aiedu: buildAiEdu,
  urban5099: buildUrban5099,
  civiclaw: buildCiviclaw,
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
