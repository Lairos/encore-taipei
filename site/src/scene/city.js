// Procedural city fabric inside the real Taipei boundary, plus the major road network as moving light.
// The building list is shared with the game-style city so each block keeps its place through the transition.
import * as THREE from "three";
import { U, LIGHT_GLSL, MORPH_GLSL, mulberry } from "./shared.js";
import { project } from "./geo.js";
import { VS } from "./terrain.js";

// Activity centres that pull density and height up (lat, lon, weight, radius in units)
const HOTSPOTS = [
  [25.0336, 121.5645, 1.0, 9], // 信義計畫區
  [25.0478, 121.517, 0.8, 10], // 臺北車站
  [25.0526, 121.5203, 0.6, 9], // 中山
  [25.0418, 121.544, 0.7, 10], // 忠孝東路
  [25.055, 121.6175, 0.7, 8], // 南港
  [25.0795, 121.577, 0.6, 9], // 內湖科學園區
  [25.093, 121.526, 0.45, 9], // 士林
  [25.035, 121.5, 0.45, 8], // 萬華
  [25.026, 121.543, 0.5, 10], // 大安
  [24.99, 121.56, 0.35, 10], // 文山
  [25.132, 121.498, 0.35, 9], // 北投
].map(([lat, lon, w, r]) => {
  const [x, z] = project(lat, lon);
  return { x, z, w, r };
});

export function hotness(x, z) {
  let s = 0;
  for (const h of HOTSPOTS) s += h.w * Math.exp(-((x - h.x) ** 2 + (z - h.z) ** 2) / (2 * h.r * h.r));
  return Math.min(1.3, s);
}

export const ROAD_WIDTH = [0.34, 0.3, 0.24, 0.18]; // motorway, trunk, primary, secondary (world units)

// Raster of the road corridors so blocks never sit on a street
function roadMask(T) {
  const e = T.extent,
    cell = 0.25;
  const w = Math.ceil((e.maxX - e.minX) / cell) + 1,
    h = Math.ceil((e.maxZ - e.minZ) / cell) + 1;
  const m = new Uint8Array(w * h);
  for (const r of T.geo.roads) {
    const hw = ROAD_WIDTH[r[0]] / 2 + 0.04;
    const k = Math.ceil(hw / cell);
    for (let i = 1; i + 3 < r.length; i += 2) {
      const x0 = r[i],
        z0 = r[i + 1],
        x1 = r[i + 2],
        z1 = r[i + 3];
      const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.1) + 1;
      for (let s = 0; s <= steps; s++) {
        const gx = Math.round((x0 + ((x1 - x0) * s) / steps - e.minX) / cell),
          gz = Math.round((z0 + ((z1 - z0) * s) / steps - e.minZ) / cell);
        for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx++) if (gx + dx >= 0 && gz + dz >= 0 && gx + dx < w && gz + dz < h) m[(gz + dz) * w + gx + dx] = 1;
      }
    }
  }
  return (x, z) => {
    const gx = Math.round((x - e.minX) / cell),
      gz = Math.round((z - e.minZ) / cell);
    return gx >= 0 && gz >= 0 && gx < w && gz < h && m[gz * w + gx] === 1;
  };
}

// Where the blocks go. Each item: { x, z, y, w, d, h, hm (metres), ang, hot, seed }
export function planCity(T, { quality, exclusions, open = () => false }) {
  const rnd = mulberry(20261023);
  const spacing = quality === "high" ? 0.46 : 0.6;
  const e = T.extent;
  const onRoad = roadMask(T);
  const items = [];
  const excluded = (x, z) => exclusions.some((c) => (c.rect ? Math.abs(x - c.x) < c.w && Math.abs(z - c.z) < c.d : (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r));
  for (let z = e.minZ; z < e.maxZ; z += spacing)
    for (let x = e.minX; x < e.maxX; x += spacing) {
      const px = x + (rnd() - 0.5) * spacing * 0.6,
        pz = z + (rnd() - 0.5) * spacing * 0.6;
      if (!T.inCity(px, pz) || T.isWater(px, pz) || T.isWater(px + 0.3, pz) || T.isWater(px - 0.3, pz) || T.isWater(px, pz + 0.3) || T.isWater(px, pz - 0.3)) continue;
      const h0 = T.elev(px, pz);
      if (h0 > 75) continue;
      const slope = Math.abs(T.elev(px + 0.4, pz) - T.elev(px - 0.4, pz)) + Math.abs(T.elev(px, pz + 0.4) - T.elev(px, pz - 0.4));
      if (slope > 14 || excluded(px, pz) || open(px, pz) || open(px + 0.12, pz) || open(px - 0.12, pz) || open(px, pz + 0.12) || open(px, pz - 0.12)) continue;
      const hot = hotness(px, pz);
      if (rnd() > 0.55 + hot * 0.45 - Math.max(0, h0 - 30) * 0.012) continue;
      const r = rnd();
      let hm = r < 0.58 ? 10 + rnd() * 10 : r < 0.9 ? 22 + rnd() * 22 : 48 + rnd() * 60;
      hm *= 0.75 + hot * 0.55;
      if (exclusions.some((c) => c.low && (px - c.x) ** 2 + (pz - c.z) ** 2 < c.low * c.low)) hm = Math.min(hm, 12 + rnd() * 14);
      const w = 0.16 + rnd() * 0.2 + (hm > 60 ? 0.08 : 0),
        d = 0.16 + rnd() * 0.2 + (hm > 60 ? 0.08 : 0);
      const ang = 0.18 * Math.sin(px * 0.045) + 0.14 * Math.cos(pz * 0.05) + (rnd() < 0.15 ? (rnd() - 0.5) * 0.6 : 0);
      // keep the footprint off the streets
      const c = Math.cos(ang),
        s = Math.sin(ang);
      let blocked = onRoad(px, pz);
      for (const [a, b] of [
        [w / 2, d / 2],
        [-w / 2, d / 2],
        [w / 2, -d / 2],
        [-w / 2, -d / 2],
      ])
        blocked ||= onRoad(px + a * c + b * s, pz - a * s + b * c);
      if (blocked) continue;
      items.push({ x: px, z: pz, y: T.groundY(px, pz) - 0.02, w, d, h: hm * VS * 0.8, hm, ang, hot, seed: rnd() * 100 });
    }
  return items;
}

// Night-time "real" city: boxes with lit windows. Blocks sink into the ground as the game wave reaches them.
export function buildCity(items) {
  const n = items.length;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      ${MORPH_GLSL}
      attribute float aSeed; attribute vec3 aSize;
      varying vec3 vL; varying vec3 vN; varying vec3 vW; varying float vSeed; varying vec3 vSize;
      void main() {
        vec2 origin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        float keep = smoothstep(uMorphR - 0.5, uMorphR + 4.0, morphD(origin));
        vec3 p = position; p.y *= keep;
        vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0); vW = w.xyz;
        vL = (p + vec3(0.5, 0.0, 0.5)) * aSize; vSize = aSize; vSeed = aSeed;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      ${LIGHT_GLSL}
      ${MORPH_GLSL}
      uniform float uReveal; uniform vec2 uRevealCenter;
      varying vec3 vL; varying vec3 vN; varying vec3 vW; varying float vSeed; varying vec3 vSize;
      void main() {
        if (morphD(vW.xz) < uMorphR - 0.5) discard;
        vec3 n = normalize(vN);
        float s = vSeed;
        vec3 base = mix(vec3(0.17, 0.17, 0.18), vec3(0.34, 0.33, 0.31), hash21(vec2(s, 1.7)));
        base = mix(base, vec3(0.2, 0.27, 0.33), step(0.82, hash21(vec2(s, 9.1)))); // some glass towers
        float roof = step(0.5, n.y);
        vec3 col = shade(base * mix(1.0, 1.15, roof), n);
        // window grid on the facades
        float side = 1.0 - roof;
        float u = abs(n.x) > 0.5 ? vL.z : vL.x;
        float fy = vL.y / 0.052, fu = u / 0.07;
        float win = step(0.3, fract(fy)) * (1.0 - step(0.86, fract(fy))) * step(0.22, fract(fu)) * (1.0 - step(0.8, fract(fu)));
        float litFrac = 0.18 + 0.34 * hash21(vec2(s, 3.3));
        float lit = step(hash21(vec2(floor(fu), floor(fy)) + s * 31.0), litFrac);
        float far = smoothstep(0.3, 0.9, fwidth(fy));
        float dark = step(0.8, hash21(vec2(s, 7.7))); // a fifth of the buildings stay dark: the city reads as light, not boxes
        float glow = mix(win * lit, litFrac * 0.22, far) * step(0.06, vL.y) * (1.0 - dark);
        vec3 wcol = mix(vec3(1.0, 0.66, 0.32), vec3(0.75, 0.86, 1.0), step(0.7, hash21(vec2(s, 5.5))));
        float on = 1.0 - smoothstep(uReveal - 8.0, uReveal, length(vW.xz - uRevealCenter));
        col = mix(col, col * 0.55, uNight) + wcol * glow * side * uNight * on * 1.25;
        // daytime: faint window reflections so facades are not flat
        col += vec3(0.5, 0.6, 0.7) * win * side * (1.0 - uNight) * 0.04;
        // a red aviation light on the tallest roofs
        float tall = step(1.3, vSize.y) * roof * step(length(vL.xz - vSize.xz * 0.5), 0.05);
        col += vec3(1.0, 0.1, 0.05) * tall * (0.5 + 0.5 * sin(uTime * 3.0 + s * 20.0)) * 2.0 * uNight;
        col += vec3(0.6, 0.95, 1.0) * waveRing(vW.xz) * 1.6;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, U);
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const seeds = new Float32Array(n),
    sizes = new Float32Array(n * 3);
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0);
  items.forEach((b, i) => {
    q.setFromAxisAngle(up, b.ang);
    m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m);
    seeds[i] = b.seed;
    sizes.set([b.w, b.h, b.d], i * 3);
  });
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  geo.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 3));
  mesh.frustumCulled = false;
  return { mesh, count: n };
}

export function buildRoads(T) {
  const pos = [],
    dist = [],
    cls = [];
  for (const r of T.geo.roads) {
    const c = r[0];
    let run = Math.random() * 10;
    const lift = c === 0 ? 0.09 : 0.045;
    for (let i = 1; i + 3 < r.length; i += 2) {
      const x0 = r[i],
        z0 = r[i + 1],
        x1 = r[i + 2],
        z1 = r[i + 3];
      const l = Math.hypot(x1 - x0, z1 - z0);
      pos.push(x0, T.groundY(x0, z0) + lift, z0, x1, T.groundY(x1, z1) + lift, z1);
      dist.push(run, run + l);
      cls.push(c, c);
      run += l;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aDist", new THREE.Float32BufferAttribute(dist, 1));
  g.setAttribute("aCls", new THREE.Float32BufferAttribute(cls, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute float aDist; attribute float aCls;
      varying float vDist; varying float vCls; varying vec3 vW;
      void main() { vDist = aDist; vCls = aCls; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      ${MORPH_GLSL}
      uniform float uTime; uniform float uNight; uniform float uReveal; uniform vec2 uRevealCenter;
      varying float vDist; varying float vCls; varying vec3 vW;
      void main() {
        if (morphD(vW.xz) < uMorphR) discard;
        float major = 1.0 - step(1.5, vCls);
        float speed = mix(0.25, 0.45, major);
        float p = fract(vDist * 0.22 - uTime * speed);
        float car = smoothstep(0.86, 1.0, p);
        vec3 col = vec3(1.0, 0.55, 0.25) * mix(0.07, 0.16, major) + vec3(1.0, 0.86, 0.66) * car * mix(0.35, 0.8, major);
        float on = 1.0 - smoothstep(uReveal - 10.0, uReveal, length(vW.xz - uRevealCenter));
        col *= mix(0.3, 1.0, uNight) * on;
        #ifdef USE_FOG
          col *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  Object.assign(mat.uniforms, U);
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 2;
  return lines;
}
