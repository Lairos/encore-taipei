// Real buildings around the landmarks: OpenStreetMap footprints extruded to their tagged height.
// One merged geometry, two looks: the lit night city (custom shader) and the game city (Lambert, shadows).
import * as THREE from "three";
import { U, LIGHT_GLSL, MORPH_GLSL } from "./shared.js";
import { morphPatch } from "./game.js";

function inside(x, z, xs, zs) {
  let c = false;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) if (zs[i] > z !== zs[j] > z && x < ((xs[j] - xs[i]) * (z - zs[i])) / (zs[j] - zs[i]) + xs[i]) c = !c;
  return c;
}

export function buildRealGeometry(T) {
  const pos = [],
    nrm = [],
    wall = [], // x: distance along the facade, y: height above the building base (roof vertices: x = -1)
    meta = [], // seed, kind (+10 × special), base y, height
    center = [],
    idx = [];
  let seed = 0;
  for (const b of T.landmarks.buildings) {
    const [h, kind, special] = b;
    const xs = [],
      zs = [];
    for (let i = 3; i < b.length; i += 2) xs.push(b[i]), zs.push(b[i + 1]);
    const n = xs.length;
    let base = Infinity,
      cx = 0,
      cz = 0;
    for (let i = 0; i < n; i++) {
      base = Math.min(base, T.groundY(xs[i], zs[i]));
      cx += xs[i] / n;
      cz += zs[i] / n;
    }
    base -= 0.01;
    const top = base + h;
    const s = (seed = (seed * 9301 + 49297) % 233280) / 2332.8;
    const m = [s, kind + special * 10, base, h];
    let run = 0;
    // walls, normals pointing out of the footprint
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = xs[j] - xs[i],
        dz = zs[j] - zs[i],
        l = Math.hypot(dx, dz);
      if (l < 1e-4) continue;
      let nx = dz / l,
        nz = -dx / l;
      const mx = (xs[i] + xs[j]) / 2,
        mz = (zs[i] + zs[j]) / 2;
      if (inside(mx + nx * 0.01, mz + nz * 0.01, xs, zs)) (nx = -nx), (nz = -nz);
      const k = pos.length / 3;
      pos.push(xs[i], base, zs[i], xs[j], base, zs[j], xs[j], top, zs[j], xs[i], top, zs[i]);
      for (let v = 0; v < 4; v++) nrm.push(nx, 0, nz), meta.push(...m), center.push(cx, cz);
      wall.push(run, 0, run + l, 0, run + l, h, run, h);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      run += l;
    }
    // roof
    const contour = xs.map((x, i) => new THREE.Vector2(x, zs[i]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const k = pos.length / 3;
    for (let i = 0; i < n; i++) pos.push(xs[i], top, zs[i]), nrm.push(0, 1, 0), wall.push(-1, h), meta.push(...m), center.push(cx, cz);
    for (const [a, b2, c] of tris) idx.push(k + a, k + c, k + b2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("aWall", new THREE.Float32BufferAttribute(wall, 2));
  g.setAttribute("aMeta", new THREE.Float32BufferAttribute(meta, 4));
  g.setAttribute("aCenter", new THREE.Float32BufferAttribute(center, 2));
  g.setAttribute("aBase", new THREE.Float32BufferAttribute(meta.filter((_, i) => i % 4 === 2), 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ---------- night city ----------
export function buildRealNight(geo) {
  const mat = new THREE.ShaderMaterial({
    fog: true,
    side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      ${MORPH_GLSL}
      attribute vec2 aWall; attribute vec4 aMeta; attribute vec2 aCenter;
      varying vec2 vWall; varying vec4 vMeta; varying vec3 vN; varying vec3 vW;
      void main() {
        float keep = smoothstep(uMorphR - 0.5, uMorphR + 4.0, morphD(aCenter));
        vec3 p = position; p.y = aMeta.z + (p.y - aMeta.z) * keep;
        vWall = vec2(aWall.x, aWall.y * keep); vMeta = aMeta; vN = normal;
        vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      ${LIGHT_GLSL}
      ${MORPH_GLSL}
      uniform float uReveal; uniform vec2 uRevealCenter;
      varying vec2 vWall; varying vec4 vMeta; varying vec3 vN; varying vec3 vW;
      void main() {
        if (morphD(vW.xz) < uMorphR - 0.5) discard;
        vec3 n = normalize(vN);
        float s = vMeta.x;
        float roof = step(vWall.x, -0.5);
        vec3 base = mix(vec3(0.17, 0.17, 0.18), vec3(0.34, 0.33, 0.31), hash21(vec2(s, 1.7)));
        vec3 col = shade(base * mix(1.0, 1.15, roof), n);
        float fy = vWall.y / 0.042, fu = vWall.x / 0.06;
        float win = step(0.3, fract(fy)) * (1.0 - step(0.86, fract(fy))) * step(0.22, fract(fu)) * (1.0 - step(0.8, fract(fu)));
        float litFrac = 0.18 + 0.34 * hash21(vec2(s, 3.3));
        float lit = step(hash21(vec2(floor(fu), floor(fy)) + s * 31.0), litFrac);
        float far = smoothstep(0.3, 0.9, fwidth(fy));
        float glow = mix(win * lit, litFrac * 0.22, far) * step(0.05, vWall.y) * (1.0 - roof);
        vec3 wcol = mix(vec3(1.0, 0.66, 0.32), vec3(0.75, 0.86, 1.0), step(0.7, hash21(vec2(s, 5.5))));
        float on = 1.0 - smoothstep(uReveal - 8.0, uReveal, length(vW.xz - uRevealCenter));
        col = mix(col, col * 0.55, uNight) + wcol * glow * uNight * on * 1.25;
        col += vec3(0.6, 0.95, 1.0) * waveRing(vW.xz) * 1.6;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, U);
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}

// ---------- game city ----------
const GAME_COLOR = /* glsl */ `
  float roof = step(vWall.x, -0.5);
  float kind = mod(vMeta.y, 10.0), special = floor(vMeta.y / 10.0);
  float s = vMeta.x;
  float r1 = fract(sin(s * 12.9898) * 43758.5453), r2 = fract(sin(s * 78.233) * 12345.678);
  // walls by building type: homes in warm whites, offices in pale glass, public buildings in sand, industry in grey
  vec3 wallC = kind < 0.5 ? mix(vec3(0.95, 0.92, 0.85), vec3(0.93, 0.88, 0.8), r1)
    : kind < 1.5 ? mix(vec3(0.66, 0.77, 0.86), vec3(0.88, 0.9, 0.92), r1)
    : kind < 2.5 ? vec3(0.93, 0.87, 0.76)
    : kind < 3.5 ? vec3(0.84, 0.84, 0.82)
    : mix(vec3(0.92, 0.9, 0.86), vec3(0.86, 0.88, 0.9), r1);
  vec3 roofC = kind < 0.5 ? (r2 < 0.35 ? vec3(0.8, 0.45, 0.32) : r2 < 0.7 ? vec3(0.58, 0.6, 0.63) : vec3(0.68, 0.7, 0.72))
    : kind < 2.5 && kind > 1.5 ? vec3(0.78, 0.36, 0.28)
    : vec3(0.7, 0.72, 0.74);
  if (special > 0.5 && special < 1.5) { wallC = vec3(0.96, 0.92, 0.84); roofC = vec3(0.91, 0.69, 0.23); } // 國父紀念館: golden roof
  if (special > 1.5) { wallC = vec3(0.92, 0.9, 0.85); roofC = vec3(0.73, 0.71, 0.66); } // 市政府
  if (roof > 0.5) diffuseColor.rgb = roofC;
  else {
    float glass = step(0.5, kind) * step(kind, 1.5);
    float fy = vWall.y / mix(0.044, 0.034, glass), fu = vWall.x / mix(0.06, 0.04, glass);
    float win = step(0.32, fract(fy)) * step(fract(fy), 0.86) * step(mix(0.22, 0.08, glass), fract(fu)) * step(fract(fu), mix(0.78, 0.92, glass)) * step(0.05, vWall.y);
    float far = smoothstep(0.35, 0.9, fwidth(fy));
    vec3 pane = mix(vec3(0.3, 0.42, 0.55), vec3(0.55, 0.72, 0.85), 0.4);
    diffuseColor.rgb = mix(wallC, pane, mix(win, 0.3 + 0.3 * glass, far) * mix(0.8, 0.95, glass));
    diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.06, vWall.y));
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.84, 0.8), smoothstep(90.0, 260.0, length(vViewPosition)) * 0.6);
`;

export function buildRealGame(geo) {
  const mat = morphPatch(new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), {
    pop: true,
    merged: true,
    vertDecl: "attribute vec2 aWall; attribute vec4 aMeta; attribute vec2 aCenter; attribute float aBase; varying vec2 vWall; varying vec4 vMeta;",
    vertex: "vWall = aWall; vMeta = aMeta;",
    fragDecl: "varying vec2 vWall; varying vec4 vMeta;",
    fragment: GAME_COLOR,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
