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
function buildAnchors(T) {
  const g = new THREE.Group();
  const [x, z] = project(25.03395, 121.5645);
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
  const parts = [box(1.0, 0.55, 0.9, 0, 0, 0)];
  parts.push(new THREE.CylinderGeometry(0.28, 0.36, 2.0, 4, 1).rotateY(Math.PI / 4).translate(0, 0.55 + 1.0, 0));
  for (let k = 0; k < 8; k++) parts.push(new THREE.CylinderGeometry(0.34, 0.25, 0.62, 4, 1).rotateY(Math.PI / 4).translate(0, 2.55 + k * 0.62 + 0.31, 0));
  parts.push(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 4).rotateY(Math.PI / 4).translate(0, 7.51 + 0.25, 0));
  parts.push(new THREE.CylinderGeometry(0.02, 0.05, 1.0, 6).translate(0, 8.0 + 0.5, 0));
  for (const p of parts) {
    const m = new THREE.Mesh(p, mat);
    m.position.set(x, y, z);
    g.add(m);
  }
  g.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.6, 0.4) }));
  tip.position.set(x, y + 9.0, z);
  g.add(tip);

  // City Hall: low cross-shaped block east of 101
  const [hx, hz] = project(25.03752, 121.56447);
  const hy = T.groundY(hx, hz);
  const hallMat = new THREE.MeshStandardMaterial({ color: 0xb9b2a5, roughness: 0.8, emissive: 0xffc98a, emissiveIntensity: 0 });
  for (const geo of [box(1.6, 0.42, 0.5, 0, 0, 0), box(0.5, 0.42, 1.4, 0, 0, 0), box(0.42, 0.62, 0.42, 0, 0, 0)]) {
    const m = new THREE.Mesh(geo, hallMat);
    m.position.set(hx, hy, hz);
    g.add(m);
  }
  return {
    group: g,
    exclusions: [
      { x, z, r: 1.0 },
      { x: hx, z: hz, r: 1.1 },
    ],
    update() {
      mat.emissiveIntensity = 0.4 + 2.2 * U.uNight.value;
      hallMat.emissiveIntensity = 0.25 * U.uNight.value;
    },
  };
}

// ---------- 臺北大巨蛋: dark and fenced → lit and in use ----------
function buildDome(T, p) {
  const [x, z] = project(...p.place);
  const y = T.groundY(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const shell = new THREE.MeshStandardMaterial({ color: 0xcfd5dd, roughness: 0.35, metalness: 0.2, emissive: 0xffe2b8, emissiveIntensity: 0 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 20, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.55, 0.62, 1.38).translate(0, 0.32, 0), shell);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.04, 0.34, 64, 1, true).scale(1.56, 1, 1.39).translate(0, 0.17, 0), shell);
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.03, 64).scale(1, 1, 0.9), new THREE.MeshStandardMaterial({ color: 0x8d8a82, roughness: 1 }));
  // roof light ring (bloom)
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 6, 96).rotateX(Math.PI / 2).scale(1.56, 1, 1.39).translate(0, 0.34, 0), ringMat);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.02, 6, 64).rotateX(Math.PI / 2).scale(1.56, 1, 1.39).translate(0, 0.9, 0), ringMat);
  // construction fence (before)
  const fenceMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uNight: U.uNight },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uNight; varying vec2 vUv; void main(){ float s = step(0.5, fract(vUv.x * 60.0)); vec3 c = mix(vec3(0.85,0.85,0.8), vec3(0.95,0.45,0.15), s) * mix(0.6, 0.18, uNight); gl_FragColor = vec4(c, 1.0); }`,
  });
  const fence = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 0.16, 96, 1, true).scale(1, 1, 0.88).translate(0, 0.08, 0), fenceMat);
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
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.22, 5, 16, 1, true).translate(0, -2.5, 0).rotateX(Math.PI), beamMat);
    b.position.set(Math.cos(a) * 1.7, 0.1, Math.sin(a) * 1.5);
    b.rotation.z = Math.cos(a) * 0.18;
    b.rotation.x = -Math.sin(a) * 0.18;
    beams.add(b);
  }
  g.add(plaza, wall, dome, ring, crown, fence, beams);
  for (const o of [plaza, wall, dome]) o.castShadow = o.receiveShadow = true;
  return {
    group: g,
    anchor: new THREE.Vector3(x, y + 1.6, z),
    exclusions: [{ x, z, r: 2.4 }],
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

// ---------- 捷運環狀線東環段 (route drawn for illustration) ----------
const EAST_RING = [
  [24.9829, 121.5414], // 大坪林
  [24.9905, 121.5585],
  [24.9983, 121.5794], // 動物園
  [25.0175, 121.5935],
  [25.038, 121.6075],
  [25.0553, 121.6176], // 南港展覽館
  [25.0672, 121.6116], // 東湖
  [25.0837, 121.5944], // 內湖
  [25.0848, 121.5556], // 劍南路
  [25.0935, 121.5262], // 士林
];
function buildEastRing(T, p) {
  const flat = new THREE.CatmullRomCurve3(
    EAST_RING.map(([la, lo]) => {
      const [x, z] = project(la, lo);
      return new THREE.Vector3(x, 0, z);
    }),
  );
  const pts = flat.getSpacedPoints(400).map((v) => new THREE.Vector3(v.x, T.groundY(v.x, v.z) + 0.45, v.z));
  for (let pass = 0; pass < 6; pass++) for (let i = 1; i < pts.length - 1; i++) pts[i].y = Math.max(pts[i].y, (pts[i - 1].y + pts[i + 1].y) / 2); // smooth over hills
  const curve = new THREE.CatmullRomCurve3(pts);
  const SPLIT = 0.42; // first works package (south) vs second
  const mat = glow(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uA: { value: 0 }, uB: { value: 0 }, uFlash: { value: 0 }, uTime: U.uTime, uNight: U.uNight, uGame: U.uGame },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uA; uniform float uB; uniform float uFlash; uniform float uTime; uniform float uNight; uniform float uGame; varying vec2 vUv;
      void main() {
        float t = vUv.x;
        float on = t < ${SPLIT} ? uA : uB;
        float dash = step(0.5, fract(t * 140.0));
        vec3 planned = vec3(0.8, 0.85, 0.95) * dash * 0.16;
        float pulse = smoothstep(0.9, 1.0, fract(t * 18.0 - uTime * 0.5));
        vec3 build = vec3(1.0, 0.54, 0.24) * (0.9 + pulse * 2.2);
        vec3 col = mix(planned, build, on) * (0.6 + 0.4 * uNight) + vec3(1.0, 0.7, 0.4) * uFlash * on;
        gl_FragColor = vec4(col, 1.0);
        if (uGame > 0.5) gl_FragColor = vec4(mix(vec3(0.97), mix(vec3(0.92, 0.38, 0.06), vec3(0.98), step(0.5, fract(t * 260.0))), on), mix(dash * 0.85, 1.0, on));
      }`,
  }));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 600, 0.09, 6, false), mat);
  // tower cranes along each works package (illustrative)
  const cranes = [];
  for (const [t, which] of [
    [0.12, "A"],
    [0.3, "A"],
    [0.6, "B"],
    [0.8, "B"],
  ]) {
    const v = curve.getPointAt(t);
    const c = makeCrane();
    c.position.set(v.x + 0.3, T.groundY(v.x, v.z), v.z + 0.3);
    Object.assign(c.userData, { which, phase: t * 10 });
    cranes.push(c);
  }
  const g = new THREE.Group();
  g.add(tube, ...cranes);
  const mid = curve.getPointAt(0.5);
  return {
    group: g,
    anchor: new THREE.Vector3(mid.x, mid.y + 1.3, mid.z),
    exclusions: [],
    update(d, flash) {
      mat.uniforms.uA.value = smooth(p.event - 0.01, p.event + 0.03, d);
      mat.uniforms.uB.value = smooth(p.event2 - 0.01, p.event2 + 0.03, d);
      mat.uniforms.uFlash.value = flash;
      for (const c of cranes) {
        c.visible = d >= (c.userData.which === "A" ? p.event : p.event2);
        c.userData.jib.rotation.y = Math.sin(U.uTime.value * 0.25 + c.userData.phase) * 1.2;
      }
    },
  };
}

// ---------- 輝達北士科總部: empty lot → signed (gold ring) → blueprint HQ ----------
function buildNvidia(T, p) {
  const [x, z] = project(...p.place);
  const y = T.groundY(x, z) + 0.02;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6b5f4c, roughness: 1 }));
  const hq = blueprint(
    [box(2.4, 0.9, 1.3, -0.1, 0, 0), box(1.1, 1.6, 0.9, 0.7, 0, 0.1), new THREE.CylinderGeometry(0.45, 0.45, 1.25, 24).translate(-0.85, 0.625, 0.1)],
    CYAN,
    y,
    1.6,
  );
  const ring = groundRing(2.3, GOLD);
  ring.position.y = 0.02;
  const site = new THREE.Group();
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0xf28c28 });
  for (const [w, d, fx, fz] of [
    [3.4, 0.03, 0, -1.2],
    [3.4, 0.03, 0, 1.2],
    [0.03, 2.4, -1.7, 0],
    [0.03, 2.4, 1.7, 0],
  ])
    site.add(new THREE.Mesh(box(w, 0.12, d, fx, 0, fz), fenceMat));
  const crane = makeCrane(2.6);
  crane.position.set(1.2, 0, -0.8);
  site.add(crane);
  g.add(lot, hq, ring, site);
  return {
    group: g,
    anchor: new THREE.Vector3(x, y + 2.2, z),
    exclusions: [{ rect: true, x, z, w: 1.9, d: 1.4 }],
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
  const sites = T.renewal.cases; // [x, z, approved (decimal year), sqrt(area ha), approved flag, case ID]
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
  const apronMat = new THREE.MeshStandardMaterial({ color: 0x55565c, roughness: 0.95 });
  const airport = new THREE.Group();
  for (const a of ap.aprons) {
    const pts = [];
    for (let i = 0; i < a.length; i += 2) pts.push(new THREE.Vector2(a[i], a[i + 1]));
    const sg = new THREE.ShapeGeometry(new THREE.Shape(pts));
    const pos = sg.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i), yAt(pos.getX(i), pos.getY(i)), pos.getY(i));
    sg.computeVertexNormals();
    airport.add(new THREE.Mesh(sg, apronMat).translateY(0.0));
  }
  const r = ap.runway;
  const a0 = new THREE.Vector2(r[0], r[1]),
    a1 = new THREE.Vector2(r[r.length - 2], r[r.length - 1]);
  const dir = a1.clone().sub(a0),
    len = dir.length();
  dir.normalize();
  const ang = Math.atan2(dir.y, dir.x);
  const mid = a0.clone().add(a1).multiplyScalar(0.5);
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2c2d31, roughness: 0.9 }));
  runway.rotation.y = -ang;
  runway.position.set(mid.x, yAt(mid.x, mid.y) + 0.01, mid.y);
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
  const [x, z] = project(...p.place);
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
