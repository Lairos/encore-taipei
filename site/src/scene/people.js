// Foot traffic in the game city: a steady trickle along the sidewalks and through the parks, and crowds where a policy
// changes a place, gathering from the day it lands (the dome opening, each rebuilt block of 大安路, the 東環段
// stations, a renewed tower…). Illustrative, like the rest of the game city. Everyone paces to and fro in the vertex
// shader, so the whole crowd is one draw call with no work per frame, and both sides of the time curtain follow uDate.
//
// A layer asks for a crowd by returning `crowd: [...]`, each entry one of
//   { x, z, r, n, from, to? }          n people on the sidewalks and open ground within r of (x, z)
//   { walks, n, from, to?, ... }       n people pacing along given segments [x0, z0, x1, z1]; with `frame` they are in
//                                      that object's local space at height `y`, otherwise `lift` above the ground
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { U, mulberry } from "./shared.js";
import { ROAD_WIDTH } from "./city.js";

const NEVER = 1e4; // a date that never comes (or has always passed, negated)
const CELL = 2; // grid for finding sidewalk pieces near a point (world units)

// both edges of every street but the motorways, cut into pieces of up to 1.2 units
function sidewalks(T, polylines) {
  const pieces = [];
  const grid = new Map();
  for (const { c, pts } of polylines) {
    if (c === 0) continue;
    const off = ROAD_WIDTH[c] / 2 + 0.05;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, z0] = pts[i],
        [x1, z1] = pts[i + 1];
      const l = Math.hypot(x1 - x0, z1 - z0);
      if (l < 0.2) continue;
      const nx = -(z1 - z0) / l,
        nz = (x1 - x0) / l;
      const n = Math.ceil(l / 1.2);
      for (let k = 0; k < n; k++)
        for (const sd of [-1, 1]) {
          const ax = x0 + ((x1 - x0) * k) / n + nx * off * sd,
            az = z0 + ((z1 - z0) * k) / n + nz * off * sd,
            bx = x0 + ((x1 - x0) * (k + 1)) / n + nx * off * sd,
            bz = z0 + ((z1 - z0) * (k + 1)) / n + nz * off * sd;
          const mx = (ax + bx) / 2,
            mz = (az + bz) / 2;
          if (!T.inCity(mx, mz) || T.isWater(mx, mz)) continue;
          const p = [ax, az, bx, bz];
          pieces.push(p);
          const key = `${Math.floor(mx / CELL)},${Math.floor(mz / CELL)}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(p);
        }
    }
  }
  const near = (x, z, r) => {
    const out = [];
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++)
        for (const p of grid.get(`${i},${j}`) || []) if (Math.hypot((p[0] + p[2]) / 2 - x, (p[1] + p[3]) / 2 - z) < r) out.push(p);
    return out;
  };
  return { pieces, near };
}

function peopleMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uDate: U.uDate, uTime: U.uTime, uGame: U.uGame, uSkin: { value: new THREE.Color("#f2c9a0") } });
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uDate; uniform float uTime; uniform float uGame;
        attribute vec3 aA; attribute vec3 aB; attribute vec4 aWalk; attribute float aSkin; varying float vSkin;`,
      )
      .replace(
        "#include <begin_vertex>",
        `// to and fro between A and B (aWalk: phase, speed, from, to); there only between those dates, in the game city
        float len = max(distance(aA.xz, aB.xz), 0.05);
        float u = mod(aWalk.x + uTime * aWalk.y / len, 2.0);
        float show = smoothstep(aWalk.z, aWalk.z + 0.08, uDate) * (1.0 - step(aWalk.w, uDate)) * smoothstep(0.45, 0.9, uGame);
        vec3 transformed = position * show + mix(aA, aB, u < 1.0 ? u : 2.0 - u);
        transformed.y += abs(sin(uTime * 10.0 + aWalk.x * 37.0)) * 0.006 * show; // a little bounce in the step
        vSkin = aSkin;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSkin; varying float vSkin;")
      .replace("#include <color_fragment>", "#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, uSkin, vSkin);");
  };
  m.customProgramCacheKey = () => "people";
  return m;
}

export function buildPeople(T, { polylines, parks, exclusions, crowds, quality }) {
  const rnd = mulberry(29);
  const k = quality === "high" ? 1 : 0.6; // fewer on phones
  const walks = sidewalks(T, polylines);
  const blocked = (x, z) => exclusions.some((e) => (e.rect ? Math.abs(x - e.x) < e.w && Math.abs(z - e.z) < e.d : (x - e.x) ** 2 + (z - e.z) ** 2 < e.r * e.r));
  const people = []; // [ax, ay, az, bx, by, bz, from, to]
  const v = new THREE.Vector3();

  // a stretch of up to a unit along a segment, nudged sideways so a crowd is not all in one file
  const stretch = ([x0, z0, x1, z1], jitter) => {
    const l = Math.hypot(x1 - x0, z1 - z0) || 1;
    const span = Math.min(l, 0.3 + rnd() * 0.7);
    const s0 = rnd() * (l - span),
      s1 = s0 + span;
    const dx = (x1 - x0) / l,
      dz = (z1 - z0) / l,
      j = (rnd() - 0.5) * 2 * jitter;
    return [x0 + dx * s0 - dz * j, z0 + dz * s0 + dx * j, x0 + dx * s1 - dz * j, z0 + dz * s1 + dx * j];
  };
  const onGround = ([ax, az, bx, bz], from, to = NEVER, lift = 0.01) => people.push([ax, T.groundY(ax, az) + lift, az, bx, T.groundY(bx, bz) + lift, bz, from, to]);
  // a short walk across open ground (lawns, plazas) starting at (x, z)
  const stroll = (x, z, from, to) => {
    const a = rnd() * Math.PI * 2,
      l = 0.3 + rnd() * 0.5;
    const x1 = x + Math.cos(a) * l,
      z1 = z + Math.sin(a) * l;
    const ok = (px, pz) => parks.open(px, pz) && !T.isWater(px, pz) && !blocked(px, pz);
    if (!ok(x, z) || !ok(x1, z1) || !ok((x + x1) / 2, (z + z1) / 2)) return false;
    onGround([x, z, x1, z1], from, to);
    return true;
  };

  // the everyday city
  for (let i = Math.round(1200 * k); i > 0; i--) onGround(stretch(walks.pieces[Math.floor(rnd() * walks.pieces.length)], 0.02), -NEVER);
  for (let n = Math.round(400 * k), tries = 0; n > 0 && tries < 20000; tries++) {
    const [x0, z0, x1, z1] = parks.blocks[Math.floor(rnd() * parks.blocks.length)];
    if (stroll(x0 + rnd() * (x1 - x0), z0 + rnd() * (z1 - z0), -NEVER)) n--;
  }

  // where a policy changed a place
  for (const c of crowds) {
    const n = Math.max(1, Math.round(c.n * k));
    const when = () => c.from + rnd() * 0.3; // a crowd gathers over a few months
    if (c.walks) {
      c.frame?.updateWorldMatrix(true, false);
      for (let i = 0; i < n; i++) {
        const [ax, az, bx, bz] = stretch(c.walks[Math.floor(rnd() * c.walks.length)], c.jitter ?? 0.02);
        if (!c.frame) {
          onGround([ax, az, bx, bz], when(), c.to, c.lift);
          continue;
        }
        const a = c.frame.localToWorld(v.set(ax, c.y, az)).toArray(),
          b = c.frame.localToWorld(v.set(bx, c.y, bz)).toArray();
        people.push([...a, ...b, when(), c.to ?? NEVER]);
      }
      continue;
    }
    // mostly on the nearby sidewalks (looking further out where only side streets, which the game city does not draw,
    // are close), the rest milling about any open ground
    let near = walks.near(c.x, c.z, c.r);
    for (let r = c.r * 1.5; near.length < 6 && r < c.r * 4; r *= 1.5) near = walks.near(c.x, c.z, r);
    for (let i = 0, tries = 0; i < n && tries < n * 40; tries++) {
      if (near.length && rnd() < 0.75) {
        onGround(stretch(near[Math.floor(rnd() * near.length)], 0.03), when(), c.to);
        i++;
      } else {
        const a = rnd() * Math.PI * 2,
          d = Math.sqrt(rnd()) * c.r;
        if (stroll(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, when(), c.to)) i++;
      }
    }
  }

  // one figure, a few pixels tall: a body in a coat colour and a head, told apart by aSkin
  const body = new THREE.CapsuleGeometry(0.022, 0.05, 1, 5).translate(0, 0.05, 0);
  const head = new THREE.SphereGeometry(0.02, 5, 3).translate(0, 0.11, 0);
  body.setAttribute("aSkin", new THREE.Float32BufferAttribute(new Float32Array(body.attributes.position.count), 1));
  head.setAttribute("aSkin", new THREE.Float32BufferAttribute(new Float32Array(head.attributes.position.count).fill(1), 1));
  const geo = mergeGeometries([body, head]).scale(1.4, 1.4, 1.4);
  geo.deleteAttribute("uv");
  const N = people.length;
  const A = new Float32Array(N * 3),
    B = new Float32Array(N * 3),
    W = new Float32Array(N * 4);
  people.forEach(([ax, ay, az, bx, by, bz, from, to], i) => {
    A.set([ax, ay, az], i * 3);
    B.set([bx, by, bz], i * 3);
    W.set([rnd() * 2, 0.05 + rnd() * 0.06, from, to], i * 4);
  });
  geo.setAttribute("aA", new THREE.InstancedBufferAttribute(A, 3));
  geo.setAttribute("aB", new THREE.InstancedBufferAttribute(B, 3));
  geo.setAttribute("aWalk", new THREE.InstancedBufferAttribute(W, 4));
  const mesh = new THREE.InstancedMesh(geo, peopleMaterial(), N);
  const coats = ["#2e6be6", "#ff5d73", "#ffd23f", "#5cd68a", "#1d3557", "#ff8a3d", "#f4f4f0", "#9b6bd6"].map((h) => new THREE.Color(h));
  for (let i = 0; i < N; i++) mesh.setColorAt(i, coats[Math.floor(rnd() * coats.length)]);
  mesh.frustumCulled = false; // where they are is worked out in the shader
  mesh.receiveShadow = true;
  return { mesh, count: N };
}
