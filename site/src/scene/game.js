// The "模擬城市" side of the city: daylight toy-model buildings, trees, streets and traffic.
// Everything here only shows inside the transition wave (uMorphR around City Hall), so the real night city
// turns into this one block by block. Uses three.js Lambert lighting so it gets real shadows.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { U, mulberry } from "./shared.js";
import { surfaceY } from "./terrain.js";
import { ROAD_WIDTH, hotness } from "./city.js";

// ---------- material patch: appear inside the wave, pop up as it passes, glow on the wave front ----------
function morphPatch(mat, { pop = false, vertex = "", fragment = "", fragDecl = "", vertDecl = "" } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMorphR = U.uMorphR;
    sh.uniforms.uMorphCenter = U.uMorphCenter;
    sh.uniforms.uTime = U.uTime;
    const decl = `uniform float uMorphR; uniform vec2 uMorphCenter; uniform float uTime; varying vec2 vMorphXZ;`;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${decl}\n${vertDecl}`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 mOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        #else
          vec2 mOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        #endif
        ${pop ? "float mGrow = smoothstep(uMorphR, uMorphR - 7.0, length(mOrigin - uMorphCenter)); transformed.y *= mGrow + sin(mGrow * 3.14159) * 0.28;" : ""}
        ${vertex}`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 mW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mW = instanceMatrix * mW;
        #endif
        vMorphXZ = (modelMatrix * mW).xz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n${decl}\n${fragDecl}`)
      .replace("void main() {", "void main() {\n  if (length(vMorphXZ - uMorphCenter) > uMorphR) discard;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float mRing = length(vMorphXZ - uMorphCenter) - uMorphR;
        totalEmissiveRadiance += vec3(0.6, 0.95, 1.0) * exp(-mRing * mRing * 1.2) * 1.4 * step(uMorphR, 400.0);`,
      )
      .replace("#include <color_fragment>", `#include <color_fragment>\n${fragment}`);
  };
  // every patch variant needs its own program; by default three.js keys them all on the same callback source
  mat.customProgramCacheKey = () => `morph|${pop}|${vertDecl}|${vertex}|${fragDecl}|${fragment}`;
  return mat;
}

const hex = (h) => new THREE.Color(h);
const WALLS = ["#f4ead6", "#ece7dc", "#f7f3ea", "#e3ded3", "#f4ead6", "#ece7dc", "#f1d9cf", "#d9e7ef", "#ecd8ad", "#d8ecdf"].map(hex);
const ROOFS = ["#d9734e", "#8a929b", "#a0a7ae", "#c8553d", "#8a929b", "#6f8fa6", "#6aa36f", "#4b9aa0", "#e0a23a"].map(hex);
const GLASS = ["#86b9dc", "#6aa3cf", "#9cc7d9", "#7fa8c9"].map(hex);

// ---------- terrain ----------
export function buildGameTerrain(T, realSurface) {
  const geo = realSurface.geometry.clone();
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const PAVE = hex("#bdb6a6"),
    PAVE2 = hex("#b3b8ba"),
    GRASS = hex("#93c25a"),
    HILL = hex("#79b955"),
    FOREST = hex("#5c9c45"),
    PEAK = hex("#6f9a52"),
    SAND = hex("#e8dcab"),
    LAWN = hex("#b9c98f");
  const h = geo.attributes.aH.array,
    city = geo.attributes.aCity.array;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i),
      e = h[i];
    if (city[i] && e < 70) c.copy(PAVE).lerp(PAVE2, THREE.MathUtils.smoothstep(Math.sin(x * 0.11) * Math.cos(z * 0.09), -0.3, 0.6) * 0.6).lerp(LAWN, 0.5 * (1 - Math.min(1, hotness(x, z) * 1.4)));
    else c.copy(GRASS);
    c.lerp(HILL, THREE.MathUtils.smoothstep(e, 40, 140));
    c.lerp(FOREST, THREE.MathUtils.smoothstep(e, 140, 450));
    c.lerp(PEAK, THREE.MathUtils.smoothstep(e, 700, 1050));
    if (e < 6 && !city[i] && (T.isWater(x + 0.6, z) || T.isWater(x - 0.6, z) || T.isWater(x, z + 0.6) || T.isWater(x, z - 0.6))) c.lerp(SAND, 0.7);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, morphPatch(new THREE.MeshLambertMaterial({ vertexColors: true })));
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- water ----------
export function buildGameWater(geometry) {
  const mat = new THREE.ShaderMaterial({
    fog: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uMorphR; uniform vec2 uMorphCenter; uniform float uTime;
      varying vec3 vW;
      void main() {
        float md = length(vW.xz - uMorphCenter);
        if (md > uMorphR) discard;
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(v.y, 0.0), 3.0);
        vec3 col = mix(vec3(0.16, 0.62, 0.76), vec3(0.62, 0.86, 0.95), 0.15 + 0.6 * fres);
        float r = sin(vW.x * 4.0 + uTime * 1.2 + sin(vW.z * 3.0)) * sin(vW.z * 4.4 - uTime);
        col += vec3(1.0) * smoothstep(0.88, 1.0, r * 0.5 + 0.5) * 0.25;
        float ring = md - uMorphR;
        col += vec3(0.6, 0.95, 1.0) * exp(-ring * ring * 1.2) * 1.4 * step(uMorphR, 400.0);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.uMorphR = U.uMorphR;
  mat.uniforms.uMorphCenter = U.uMorphCenter;
  mat.uniforms.uTime = U.uTime;
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.renderOrder = 1;
  return mesh;
}

// ---------- buildings: five archetypes, each one InstancedMesh ----------
function part(geo, id) {
  geo.deleteAttribute("uv");
  geo.setAttribute("aPart", new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count).fill(id), 1));
  return geo;
}
const B = (w, h, d, x, y, z, id) => part(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), id);
function gable(y0, y1, id) {
  // triangular prism roof along x, eaves at y0, ridge at y1, slightly overhanging
  const x = 0.54,
    z = 0.56;
  const v = [
    [-x, y0, -z], [x, y0, -z], [x, y1, 0], [-x, y0, -z], [x, y1, 0], [-x, y1, 0],
    [x, y0, z], [-x, y0, z], [-x, y1, 0], [x, y0, z], [-x, y1, 0], [x, y1, 0],
    [-x, y0, -z], [-x, y1, 0], [-x, y0, z], [x, y0, -z], [x, y0, z], [x, y1, 0],
  ].flat();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(new Array(18).fill(id), 1));
  return g;
}
const cyl = (r, h, x, y, z, id) => part(new THREE.CylinderGeometry(r, r, h, 10).translate(x, y + h / 2, z), id);
const merge = (parts) => mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
// part ids: 0 wall · 1 roof (aRoof colour) · 2 rooftop equipment · 3 glass curtain wall
const ARCHETYPES = {
  house: merge([B(1, 0.64, 1, 0, 0, 0, 0), gable(0.64, 1.0, 1)]),
  apt: merge([B(1, 0.94, 1, 0, 0, 0, 0), B(1.04, 0.03, 1.04, 0, 0.94, 0, 1), B(0.34, 0.05, 0.3, 0.16, 0.97, -0.16, 2), cyl(0.09, 0.06, -0.22, 0.97, 0.2, 2)]),
  tower: merge([B(1, 0.9, 1, 0, 0, 0, 0), B(0.8, 0.06, 0.8, 0, 0.9, 0, 1), B(0.3, 0.04, 0.3, 0, 0.96, 0, 2)]),
  glass: merge([B(1, 0.84, 1, 0, 0, 0, 3), B(0.72, 0.14, 0.72, 0, 0.84, 0, 3), B(0.74, 0.02, 0.74, 0, 0.98, 0, 1)]),
  office: merge([B(1, 0.88, 1, 0, 0, 0, 0), B(1.02, 0.06, 1.02, 0, 0.88, 0, 1), B(0.5, 0.06, 0.18, 0.1, 0.94, 0.2, 2)]),
};

const BUILDING_VERT = `attribute float aPart; attribute vec3 aSize; attribute vec3 aRoof;
  varying float vPart; varying vec3 vLocal; varying vec3 vObjN; varying vec3 vRoof;`;
const BUILDING_FRAG = `varying float vPart; varying vec3 vLocal; varying vec3 vObjN; varying vec3 vRoof;`;
const BUILDING_COLOR = /* glsl */ `
  float wall = 1.0 - step(0.5, abs(vObjN.y));
  if (vPart > 0.5 && vPart < 1.5) diffuseColor.rgb = vRoof;
  else if (vPart > 1.5 && vPart < 2.5) diffuseColor.rgb = vec3(0.88, 0.89, 0.9);
  else if (wall > 0.5) {
    float u = abs(vObjN.x) > 0.5 ? vLocal.z : vLocal.x;
    float glass = step(2.5, vPart);
    float fy = vLocal.y / mix(0.05, 0.034, glass), fu = u / mix(0.065, 0.04, glass);
    float win = step(0.32, fract(fy)) * step(fract(fy), 0.86) * step(mix(0.22, 0.08, glass), fract(fu)) * step(fract(fu), mix(0.78, 0.92, glass)) * step(0.05, vLocal.y);
    float far = smoothstep(0.35, 0.9, fwidth(fy));
    vec3 pane = mix(vec3(0.3, 0.42, 0.55), vec3(0.55, 0.72, 0.85), fract(sin(dot(floor(vec2(fu, fy)), vec2(12.9, 78.2))) * 437.5) * 0.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, pane, mix(win, 0.35 + 0.3 * glass, far) * mix(0.85, 0.95, glass));
  }
  diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.06, vLocal.y)); // contact darkening at the base
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.84, 0.8), smoothstep(90.0, 260.0, length(vViewPosition)) * 0.6);
`;

// Instances are split into map tiles so the camera (and the sun's shadow camera) can skip tiles out of view.
const TILE = 24;
function byTile(list, xz) {
  const m = new Map();
  for (const it of list) {
    const [x, z] = xz(it);
    const k = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return [...m.values()];
}
// a geometry that shares the base vertex buffers, so each tile only adds its own instance attributes
function shareGeometry(base) {
  const g = new THREE.BufferGeometry();
  for (const [k, v] of Object.entries(base.attributes)) g.setAttribute(k, v);
  if (base.index) g.setIndex(base.index);
  return g;
}
function finishTile(mesh) {
  mesh.computeBoundingSphere();
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function buildGameCity(items, quality) {
  const rnd = mulberry(77);
  const groups = { house: [], apt: [], tower: [], glass: [], office: [] };
  for (const b of items) {
    let k;
    if (b.hm < 15) k = rnd() < 0.45 ? "house" : "apt";
    else if (b.hm < 46) k = b.hot > 0.7 && rnd() < 0.35 ? "office" : "apt";
    else if (b.hm < 80) k = b.hot > 0.5 && rnd() < 0.4 ? "glass" : "tower";
    else k = b.hot > 0.45 ? "glass" : "tower";
    groups[k].push(b);
  }
  const g = new THREE.Group();
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0);
  for (const [kind, all] of Object.entries(groups)) {
    if (!all.length) continue;
    const mat = morphPatch(new THREE.MeshLambertMaterial({ color: 0xffffff }), {
      pop: true,
      vertDecl: BUILDING_VERT,
      vertex: "vPart = aPart; vLocal = (position + vec3(0.5, 0.0, 0.5)) * aSize; vObjN = normal; vRoof = aRoof;",
      fragDecl: BUILDING_FRAG,
      fragment: BUILDING_COLOR,
    });
    for (const list of byTile(all, (b) => [b.x, b.z])) {
      const geo = shareGeometry(ARCHETYPES[kind]);
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const size = new Float32Array(list.length * 3),
        roof = new Float32Array(list.length * 3);
      list.forEach((b, i) => {
        const hgt = kind === "house" ? Math.max(b.h, 0.1) : b.h;
        q.setFromAxisAngle(up, b.ang);
        m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.w * 1.2, hgt, b.d * 1.2)); // chunkier blocks fill the streets' grid
        mesh.setMatrixAt(i, m);
        const wall = kind === "glass" ? GLASS[Math.floor(rnd() * GLASS.length)] : WALLS[Math.floor(rnd() * WALLS.length)];
        mesh.setColorAt(i, wall);
        const rc = kind === "glass" || kind === "tower" || kind === "office" ? hex(rnd() < 0.5 ? "#9aa3ab" : "#b7bdc2") : ROOFS[Math.floor(rnd() * ROOFS.length)];
        roof.set([rc.r, rc.g, rc.b], i * 3);
        size.set([b.w * 1.2, hgt, b.d * 1.2], i * 3);
      });
      geo.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 3));
      geo.setAttribute("aRoof", new THREE.InstancedBufferAttribute(roof, 3));
      g.add(finishTile(mesh));
    }
  }
  return g;
}

// ---------- trees: forested hills and street trees ----------
export function buildTrees(T, items, quality) {
  const rnd = mulberry(5);
  const e = T.extent;
  const step = quality === "high" ? 1.1 : 1.5;
  const occupied = new Set(items.map((b) => `${Math.round(b.x / 0.5)},${Math.round(b.z / 0.5)}`));
  const broad = [],
    conifer = [],
    street = [];
  for (let z = e.minZ + 1; z < e.maxZ - 1; z += step)
    for (let x = e.minX + 1; x < e.maxX - 1; x += step) {
      const px = x + (rnd() - 0.5) * step,
        pz = z + (rnd() - 0.5) * step;
      if (T.isWater(px, pz)) continue;
      const h = T.elev(px, pz);
      if (h < 2) continue;
      const city = T.inCity(px, pz) && h < 70;
      const p = city ? 0.05 : 0.06 + 0.7 * THREE.MathUtils.smoothstep(h, 15, 90);
      if (rnd() > p) continue;
      if (city && occupied.has(`${Math.round(px / 0.5)},${Math.round(pz / 0.5)}`)) continue;
      const s = city ? 0.13 + rnd() * 0.08 : 0.22 + rnd() * 0.2;
      (h > 520 && rnd() < 0.6 ? conifer : broad).push([px, surfaceY(h) - 0.02, pz, s, rnd()]);
    }
  // street trees lining both sides of trunk / primary / secondary roads
  for (const r of T.geo.roads) {
    if (r[0] === 0) continue;
    const off = ROAD_WIDTH[r[0]] / 2 + 0.07;
    for (let i = 1; i + 3 < r.length; i += 2) {
      const x0 = r[i],
        z0 = r[i + 1],
        x1 = r[i + 2],
        z1 = r[i + 3];
      const l = Math.hypot(x1 - x0, z1 - z0);
      if (l < 0.01) continue;
      const nx = -(z1 - z0) / l,
        nz = (x1 - x0) / l;
      for (let t = 0.2; t < l; t += step * 0.55)
        for (const sd of [-1, 1]) {
          const px = x0 + ((x1 - x0) * t) / l + nx * off * sd,
            pz = z0 + ((z1 - z0) * t) / l + nz * off * sd;
          if (!T.inCity(px, pz) || T.isWater(px, pz) || occupied.has(`${Math.round(px / 0.5)},${Math.round(pz / 0.5)}`) || rnd() < 0.25) continue;
          street.push([px, T.groundY(px, pz) - 0.01, pz, 0.055 + rnd() * 0.03, rnd()]);
        }
    }
  }
  const greens = ["#6db24f", "#7cc05a", "#5ea447", "#8ac765", "#4f9a46"].map(hex);
  const mat = morphPatch(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), { pop: true });
  const lod = [];
  const make = (base, all, maxDist) =>
    byTile(all, (t) => [t[0], t[2]]).map((list) => {
      const mesh = new THREE.InstancedMesh(shareGeometry(base), mat, list.length);
      const m = new THREE.Matrix4();
      list.forEach(([x, y, z, s, r], i) => {
        m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 6.28), new THREE.Vector3(s, s * (0.9 + r * 0.5), s));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, greens[Math.floor(r * greens.length)]);
      });
      finishTile(mesh);
      if (maxDist) {
        mesh.userData.maxDist = maxDist;
        lod.push(mesh);
      }
      return mesh;
    });
  const blob = new THREE.IcosahedronGeometry(0.75, 0).scale(1, 1.1, 1).translate(0, 0.85, 0);
  const g = new THREE.Group();
  for (const mesh of [...make(blob, broad), ...make(new THREE.ConeGeometry(0.6, 1.9, 7).translate(0, 0.95, 0), conifer), ...make(blob, street, 130)]) g.add(mesh);
  return { group: g, lod, count: broad.length + conifer.length + street.length };
}

// ---------- streets as ribbons, with lane markings ----------
export function buildStreets(T) {
  const pos = [],
    uv = [],
    cls = [],
    idx = [];
  const polylines = [];
  for (const r of T.geo.roads) {
    const c = r[0];
    const pts = [];
    for (let i = 1; i + 1 < r.length; i += 2) pts.push([r[i], r[i + 1]]);
    if (pts.length < 2) continue;
    const hw = ROAD_WIDTH[c] / 2,
      lift = c === 0 ? 0.07 : 0.035;
    let run = 0;
    const base = pos.length / 3;
    const lens = [0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)],
        b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b[1] - a[1]),
        nz = b[0] - a[0];
      const l = Math.hypot(nx, nz) || 1;
      nx /= l;
      nz /= l;
      if (i > 0) run += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (i > 0) lens.push(run);
      const [x, z] = pts[i];
      const y = T.groundY(x, z) + lift;
      pos.push(x + nx * hw, y, z + nz * hw, x - nx * hw, y, z - nz * hw);
      uv.push(run, 1, run, -1);
      cls.push(c, c);
      if (i > 0) {
        const k = base + i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    }
    polylines.push({ c, pts, lens, total: run });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aCls", new THREE.Float32BufferAttribute(cls, 1));
  g.setIndex(idx);
  const mat = morphPatch(new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), {
    vertDecl: "attribute float aCls; varying vec2 vRoadUv; varying float vCls;",
    vertex: "vRoadUv = uv; vCls = aCls;",
    fragDecl: "varying vec2 vRoadUv; varying float vCls;",
    fragment: /* glsl */ `
      vec3 asphalt = mix(vec3(0.5, 0.52, 0.56), vec3(0.6, 0.61, 0.63), step(2.5, vCls));
      float across = abs(vRoadUv.y);
      float edge = smoothstep(0.78, 0.84, across) * (1.0 - smoothstep(0.9, 0.96, across));
      float centre = (1.0 - smoothstep(0.04, 0.09, across)) * step(0.5, fract(vRoadUv.x * 3.0)) * (1.0 - step(2.5, vCls));
      diffuseColor.rgb = mix(asphalt, vec3(0.95, 0.93, 0.85), max(edge * 0.8, centre));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.98, 0.82, 0.35), centre * step(vCls, 0.5));`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  return { mesh, polylines };
}

// ---------- traffic ----------
export function buildTraffic(T, polylines, quality) {
  const rnd = mulberry(11);
  const roads = polylines.filter((p) => p.c <= 2 && p.total > 2);
  const n = quality === "high" ? 900 : 380;
  const cars = [];
  for (let i = 0; i < n; i++) {
    const r = roads[Math.floor(rnd() * roads.length)];
    cars.push({ r, s: rnd() * r.total, v: (0.5 + rnd() * 0.7) * (rnd() < 0.5 ? 1 : -1), lane: (ROAD_WIDTH[r.c] / 2) * 0.45, seg: 0 });
  }
  const geo = merge([B(1, 0.5, 0.5, 0, 0, 0, 0), B(0.55, 0.32, 0.46, -0.05, 0.5, 0, 2)]);
  const mesh = new THREE.InstancedMesh(geo.scale(0.15, 0.13, 0.13), morphPatch(new THREE.MeshLambertMaterial({ color: 0xffffff })), n);
  const palette = ["#ff5a4e", "#ffd23f", "#3da5e0", "#ffffff", "#5cb85c", "#ff9f43", "#f2f2f2", "#2d3436"].map(hex);
  cars.forEach((c, i) => mesh.setColorAt(i, palette[Math.floor(rnd() * palette.length)]));
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    p = new THREE.Vector3(),
    one = new THREE.Vector3(1, 1, 1);
  function update(dt) {
    cars.forEach((c, i) => {
      const r = c.r;
      c.s += c.v * dt;
      if (c.s < 0) c.s += r.total;
      if (c.s > r.total) c.s -= r.total;
      while (c.seg > 0 && r.lens[c.seg] > c.s) c.seg--;
      while (c.seg < r.lens.length - 2 && r.lens[c.seg + 1] < c.s) c.seg++;
      const a = r.pts[c.seg],
        b = r.pts[c.seg + 1];
      const l = r.lens[c.seg + 1] - r.lens[c.seg] || 1;
      const t = (c.s - r.lens[c.seg]) / l;
      const dx = (b[0] - a[0]) / l,
        dz = (b[1] - a[1]) / l;
      const side = c.v > 0 ? 1 : -1;
      const x = a[0] + (b[0] - a[0]) * t - dz * c.lane * side,
        z = a[1] + (b[1] - a[1]) * t + dx * c.lane * side;
      p.set(x, T.groundY(x, z) + (r.c === 0 ? 0.07 : 0.035), z);
      q.setFromAxisAngle(up, Math.atan2(-dz, dx) + (side < 0 ? Math.PI : 0));
      m.compose(p, q, one);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { mesh, update };
}

// ---------- drifting cloud shadows (the clouds themselves are invisible) ----------
export function buildCloudShadows(T) {
  const rnd = mulberry(3);
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const e = T.extent;
  for (let i = 0; i < 16; i++) {
    const blobs = [];
    for (let k = 0; k < 5; k++) blobs.push(new THREE.SphereGeometry(3 + rnd() * 3, 10, 8).translate((rnd() - 0.5) * 9, 0, (rnd() - 0.5) * 5));
    const c = new THREE.Mesh(mergeGeometries(blobs).scale(1, 0.35, 1), mat);
    c.position.set(e.minX + rnd() * (e.maxX - e.minX), 48 + rnd() * 8, e.minZ + rnd() * (e.maxZ - e.minZ));
    c.castShadow = true;
    g.add(c);
  }
  return {
    group: g,
    update(dt) {
      for (const c of g.children) {
        c.position.x += dt * 0.6;
        if (c.position.x > e.maxX + 15) c.position.x = e.minX - 15;
      }
    },
  };
}
