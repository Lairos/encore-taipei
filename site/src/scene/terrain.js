// Real Taipei basin terrain cut into a diorama slab, with height/mask lookups for everything placed on it.
import * as THREE from "three";
import { U, LIGHT_GLSL, MORPH_GLSL } from "./shared.js";

export const VS = 0.016; // world units per metre of elevation (100 m units × 1.6 vertical exaggeration)
export const BASE_Y = -2.2; // bottom of the diorama slab
const CARVE = 0.12; // how far river beds sit below the surrounding ground

// SRTM noise dips slightly below 0 m in the basin; only clearly negative cells are sea floor
export const surfaceY = (h) => (h < -1.5 ? -0.12 : Math.max(0.3, h) * VS);

export async function loadTerrain() {
  const [geo, bin, renewal, landmarks] = await Promise.all([
    fetch("/data/geo.json").then((r) => r.json()),
    fetch("/data/terrain.bin").then((r) => r.arrayBuffer()),
    fetch("/data/renewal.json").then((r) => r.json()),
    fetch("/data/landmarks.json").then((r) => r.json()),
  ]);
  const g = geo.grid;
  const heights = new Int16Array(bin, 0, g.nx * g.nz);
  const mask = new Uint8Array(bin, g.nx * g.nz * 2, g.mw * g.mh);

  const elev = (x, z) => {
    const fx = Math.min(g.nx - 1.001, Math.max(0, (x - g.minX) / g.step)),
      fz = Math.min(g.nz - 1.001, Math.max(0, (z - g.minZ) / g.step));
    const i = Math.floor(fx),
      j = Math.floor(fz),
      u = fx - i,
      v = fz - j;
    const h = (a, b) => heights[b * g.nx + a];
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
  const maskAt = (x, z) => {
    const i = Math.round((x - g.minX) / g.cell),
      j = Math.round((z - g.minZ) / g.cell);
    return i < 0 || j < 0 || i >= g.mw || j >= g.mh ? 0 : mask[j * g.mw + i];
  };
  // ground height in world units (river beds are not carved here, so roads and bridges stay on top)
  const groundY = (x, z) => surfaceY(elev(x, z));
  const inCity = (x, z) => (maskAt(x, z) & 1) === 1;
  const isWater = (x, z) => (maskAt(x, z) & 2) === 2;
  const extent = { minX: g.minX, minZ: g.minZ, maxX: g.minX + (g.nx - 1) * g.step, maxZ: g.minZ + (g.nz - 1) * g.step };

  return { geo, renewal, landmarks, elev, groundY, maskAt, inCity, isWater, extent };
}

export function buildTerrain(T) {
  const { geo, extent } = T;
  const { nx, nz, step, minX, minZ } = geo.grid;
  const pos = new Float32Array(nx * nz * 3),
    col = new Float32Array(nx * nz * 3),
    city = new Float32Array(nx * nz),
    hgt = new Float32Array(nx * nz);
  const c = new THREE.Color();
  const LOW = new THREE.Color(0x4a5544),
    CITYC = new THREE.Color(0x5c5953),
    FOREST = new THREE.Color(0x203628),
    HIGH = new THREE.Color(0x46523c),
    SAND = new THREE.Color(0x6b6453);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i,
        x = minX + i * step,
        z = minZ + j * step;
      const h = T.elev(x, z),
        m = T.maskAt(x, z);
      let y = surfaceY(h);
      if (m & 2) y -= CARVE;
      pos.set([x, y, z], k * 3);
      hgt[k] = h;
      city[k] = m & 1 ? 1 : 0;
      // albedo: basin floor → city grey, slopes → forest, ridges → lighter scrub
      const forest = THREE.MathUtils.smoothstep(h, 25, 120);
      c.copy(m & 1 ? CITYC : LOW).lerp(FOREST, forest);
      c.lerp(HIGH, THREE.MathUtils.smoothstep(h, 450, 1000));
      if (h < 3 && !(m & 1)) c.lerp(SAND, 0.4);
      col.set([c.r, c.g, c.b], k * 3);
    }
  const idx = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i,
        b = a + 1,
        d = a + nx,
        e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geom.setAttribute("aCity", new THREE.BufferAttribute(city, 1));
  geom.setAttribute("aH", new THREE.BufferAttribute(hgt, 1));
  geom.setIndex(idx);
  geom.computeVertexNormals();

  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute vec3 color; attribute float aCity; attribute float aH;
      varying vec3 vColor; varying vec3 vN; varying float vCity; varying float vH; varying vec3 vW;
      void main() {
        vColor = color; vCity = aCity; vH = aH; vN = normal;
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      ${LIGHT_GLSL}
      ${MORPH_GLSL}
      uniform float uReveal; uniform vec2 uRevealCenter;
      varying vec3 vColor; varying vec3 vN; varying float vCity; varying float vH; varying vec3 vW;
      void main() {
        if (morphD(vW.xz) < uMorphR) discard;
        vec3 n = normalize(vN);
        vec3 col = shade(vColor, n);
        // topographic contours every 100 m on the hills: a quiet "model maker" detail
        float c = vH / 100.0, f = fract(c), w = fwidth(c);
        float line = 1.0 - smoothstep(0.0, w * 1.5, min(f, 1.0 - f));
        col += line * step(60.0, vH) * 0.035 * (0.4 + 0.6 * (1.0 - uNight));
        // sodium-light spill over the city at night, following the opening light-up wave
        float on = 1.0 - smoothstep(uReveal - 25.0, uReveal, length(vW.xz - uRevealCenter));
        col += vec3(1.0, 0.55, 0.25) * vCity * uNight * 0.055 * on * (1.0 - smoothstep(20.0, 80.0, vH));
        col += vec3(0.6, 0.95, 1.0) * waveRing(vW.xz) * 1.4;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, U);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData.real = true;

  // slab walls: the terrain edge dropped to BASE_Y, banded like a cut model
  const walls = buildWalls(T, extent, nx, nz, step, minX, minZ);
  const group = new THREE.Group();
  group.add(mesh, walls);
  group.userData.surface = mesh;
  return group;
}

function buildWalls(T, extent, nx, nz, step, minX, minZ) {
  const edges = [];
  for (let i = 0; i < nx; i++) edges.push([minX + i * step, extent.minZ]);
  for (let j = 1; j < nz; j++) edges.push([extent.maxX, minZ + j * step]);
  for (let i = nx - 2; i >= 0; i--) edges.push([minX + i * step, extent.maxZ]);
  for (let j = nz - 2; j >= 0; j--) edges.push([extent.minX, minZ + j * step]);
  const pos = [],
    uv = [];
  let run = 0;
  for (let k = 0; k < edges.length - 1; k++) {
    const [x0, z0] = edges[k],
      [x1, z1] = edges[k + 1];
    const y0 = surfaceY(T.elev(x0, z0)),
      y1 = surfaceY(T.elev(x1, z1));
    const l = Math.hypot(x1 - x0, z1 - z0);
    pos.push(x0, y0, z0, x0, BASE_Y, z0, x1, y1, z1, x1, y1, z1, x0, BASE_Y, z0, x1, BASE_Y, z1);
    uv.push(run, y0, run, BASE_Y, run + l, y1, run + l, y1, run, BASE_Y, run + l, BASE_Y);
    run += l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uNight;
      varying vec2 vUv;
      void main() {
        float y = vUv.y;
        // soil strata: darker toward the base, thin light seams
        vec3 a = vec3(0.10, 0.085, 0.075), b = vec3(0.035, 0.03, 0.03);
        vec3 col = mix(b, a, smoothstep(${BASE_Y.toFixed(2)}, 0.5, y));
        float seam = smoothstep(0.92, 1.0, fract(y * 2.2 + 0.3)) * 0.035;
        col += seam;
        col *= mix(1.0, 0.55, uNight);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uNight = U.uNight;
  return new THREE.Mesh(g, m);
}
