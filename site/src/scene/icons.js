// Iconic buildings on their real footprints, each with the roof that makes it recognisable:
// 中正紀念堂 (white hall, blue octagonal roof), 國家戲劇院／音樂廳 and 圓山大飯店 (double-eaved palace roofs),
// 臺北車站 (hipped roof), 總統府 (red brick with its central tower).
import * as THREE from "three";
import { U } from "./shared.js";

const ringOf = (flat) => {
  const r = [];
  for (let i = 0; i < flat.length; i += 2) r.push([flat[i], flat[i + 1]]);
  return r;
};
const scaleRing = (r, c, k) => r.map(([x, z]) => [c[0] + (x - c[0]) * k, c[1] + (z - c[1]) * k]);

// band between two rings of the same length (walls when the rings match, roof slopes when the top one is smaller)
function loft(a, y0, b, y1) {
  const pos = [];
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    pos.push(a[i][0], y0, a[i][1], a[j][0], y0, a[j][1], b[j][0], y1, b[j][1]);
    pos.push(a[i][0], y0, a[i][1], b[j][0], y1, b[j][1], b[i][0], y1, b[i][1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function cap(r, y) {
  const tris = THREE.ShapeUtils.triangulateShape(
    r.map(([x, z]) => new THREE.Vector2(x, z)),
    [],
  );
  const pos = [];
  for (const [a, b, c] of tris) for (const k of [a, c, b]) pos.push(r[k][0], y, r[k][1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function buildIcons(T) {
  const group = new THREE.Group();
  const lit = [];
  for (const ic of T.landmarks.icons) {
    const r = ringOf(ic.outline);
    const c = [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
    const y0 = Math.min(...r.map(([x, z]) => T.groundY(x, z))) - 0.01;
    const yw = y0 + ic.wall;
    const wallM = new THREE.MeshStandardMaterial({ color: ic.wallC, roughness: 0.8, emissive: ic.wallC, emissiveIntensity: 0 });
    const roofM = new THREE.MeshStandardMaterial({ color: ic.roofC, roughness: 0.55, metalness: 0.1, emissive: ic.roofC, emissiveIntensity: 0 });
    lit.push(wallM, roofM);
    const add = (geo, m) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    };
    add(loft(r, y0, r, yw), wallM);
    if (ic.kind === "hip") {
      const inner = scaleRing(r, c, 0.45);
      add(loft(scaleRing(r, c, 1.06), yw, inner, yw + ic.roof), roofM);
      add(cap(inner, yw + ic.roof), roofM);
    } else if (ic.kind === "palace") {
      // lower eave, a short clerestory wall, then the upper eave rising to a ridge
      const h = ic.roof;
      add(loft(scaleRing(r, c, 1.12), yw, scaleRing(r, c, 0.84), yw + h * 0.35), roofM);
      add(loft(scaleRing(r, c, 0.8), yw + h * 0.35, scaleRing(r, c, 0.8), yw + h * 0.55), wallM);
      const top = scaleRing(r, c, 0.32);
      add(loft(scaleRing(r, c, 0.94), yw + h * 0.55, top, yw + h), roofM);
      add(cap(top, yw + h), roofM);
    } else if (ic.kind === "octagon") {
      // 中正紀念堂: two tiers of blue octagonal roof over a white drum, gold finial
      const rad = Math.max(...r.map(([x, z]) => Math.hypot(x - c[0], z - c[1]))) * 0.72;
      const h = ic.roof;
      const oct = (rt, rb, hh, y, m) => {
        const g = new THREE.CylinderGeometry(rt, rb, hh, 8, 1).rotateY(Math.PI / 8).translate(c[0], y + hh / 2, c[1]);
        add(g, m);
      };
      add(cap(r, yw), wallM);
      oct(rad * 0.72, rad * 1.04, h * 0.32, yw, roofM);
      oct(rad * 0.6, rad * 0.6, h * 0.16, yw + h * 0.32, wallM);
      oct(rad * 0.08, rad * 0.78, h * 0.48, yw + h * 0.48, roofM);
      const fin = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe8c24a, metalness: 0.6, roughness: 0.3 }));
      fin.position.set(c[0], yw + h * 0.98, c[1]);
      group.add(fin);
    } else if (ic.kind === "tower") {
      // 總統府: flat-roofed brick wings; the tower stands mid-way along the east (front) facade
      add(cap(r, yw), roofM);
      const east = Math.max(...r.map(([x]) => x));
      const tx = east - 0.12,
        tz = c[1];
      const tw = 0.16;
      const tower = new THREE.BoxGeometry(tw, ic.tower, tw).translate(tx, y0 + ic.tower / 2, tz);
      add(tower, wallM);
      add(new THREE.BoxGeometry(tw * 1.25, 0.03, tw * 1.25).translate(tx, y0 + ic.tower * 0.82, tz), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.8 }));
      add(new THREE.ConeGeometry(tw * 0.62, 0.12, 4).rotateY(Math.PI / 4).translate(tx, y0 + ic.tower + 0.06, tz), roofM);
    }
  }
  return {
    group,
    update() {
      for (const m of lit) m.emissiveIntensity = 0.28 * U.uNight.value; // floodlit at night
    },
  };
}
