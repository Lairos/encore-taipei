// Parks and open grounds (OpenStreetMap leisure=park, plus plazas round some landmarks) rasterised once:
// the city planner keeps blocks out of them, the game city paints lawns and plazas and plants their trees.
import * as THREE from "three";

const CELL = 0.25; // world units (25 m)

export function buildParks(T) {
  const e = T.extent;
  const w = Math.ceil((e.maxX - e.minX) / CELL),
    h = Math.ceil((e.maxZ - e.minZ) / CELL);
  const data = new Uint8Array(w * h * 2); // R lawn, G plaza
  // the 2-unit blocks that hold any park (grown by a cell), so planting can skip the rest of the city
  const B = 8;
  const bw = Math.ceil(w / B),
    bh = Math.ceil(h / B),
    hit = new Uint8Array(bw * bh);
  const mark = (i0, i1, j) => {
    for (let bj = Math.max(0, Math.floor((j - 1) / B)); bj <= Math.min(bh - 1, Math.floor((j + 1) / B)); bj++)
      for (let bi = Math.max(0, Math.floor((i0 - 1) / B)); bi <= Math.min(bw - 1, Math.floor((i1 + 1) / B)); bi++) hit[bj * bw + bi] = 1;
  };
  for (const p of T.landmarks.parks) {
    const ch = p[0] === 1 ? 1 : 0;
    const xs = [],
      zs = [];
    for (let i = 1; i < p.length; i += 2) xs.push((p[i] - e.minX) / CELL), zs.push((p[i + 1] - e.minZ) / CELL);
    const n = xs.length;
    const j0 = Math.max(0, Math.floor(Math.min(...zs))),
      j1 = Math.min(h - 1, Math.ceil(Math.max(...zs)));
    // scanline fill at cell centres
    for (let j = j0; j <= j1; j++) {
      const zc = j + 0.5;
      const cuts = [];
      for (let a = 0, b = n - 1; a < n; b = a++) if (zs[a] > zc !== zs[b] > zc) cuts.push(xs[a] + ((zc - zs[a]) * (xs[b] - xs[a])) / (zs[b] - zs[a]));
      cuts.sort((p, q) => p - q);
      for (let k = 0; k + 1 < cuts.length; k += 2) {
        const i0 = Math.max(0, Math.ceil(cuts[k] - 0.5)),
          i1 = Math.min(w - 1, Math.floor(cuts[k + 1] - 0.5));
        for (let i = i0; i <= i1; i++) data[(j * w + i) * 2 + ch] = 255;
        if (i0 <= i1) mark(i0, i1, j);
      }
    }
  }
  // plazas win where a park outline overlaps one
  for (let i = 0; i < w * h; i++) if (data[i * 2 + 1]) data[i * 2] = 0;
  const blocks = [];
  for (let k = 0; k < hit.length; k++)
    if (hit[k]) {
      const x0 = e.minX + (k % bw) * B * CELL,
        z0 = e.minZ + Math.floor(k / bw) * B * CELL;
      blocks.push([x0, z0, x0 + B * CELL, z0 + B * CELL]);
    }
  const cellAt = (x, z) => {
    const i = Math.floor((x - e.minX) / CELL),
      j = Math.floor((z - e.minZ) / CELL);
    return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i;
  };
  const lawn = (x, z) => {
    const k = cellAt(x, z);
    return k >= 0 && data[k * 2] > 0;
  };
  const plaza = (x, z) => {
    const k = cellAt(x, z);
    return k >= 0 && data[k * 2 + 1] > 0;
  };
  const texture = new THREE.DataTexture(data, w, h, THREE.RGFormat, THREE.UnsignedByteType);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return {
    lawn,
    plaza,
    open: (x, z) => lawn(x, z) || plaza(x, z),
    blocks,
    texture,
    // world xz → texture uv
    origin: new THREE.Vector2(e.minX, e.minZ),
    size: new THREE.Vector2(w * CELL, h * CELL),
  };
}
