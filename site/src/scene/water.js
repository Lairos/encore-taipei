// Rivers and lakes from OpenStreetMap polygons, plus the sea surface inside the slab.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { U, LIGHT_GLSL, MORPH_GLSL } from "./shared.js";

const ring = (flat) => {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push(new THREE.Vector2(flat[i], flat[i + 1]));
  return pts;
};

export function buildWater(T) {
  const parts = [];
  for (const p of T.geo.water) {
    const shape = new THREE.Shape(ring(p.o));
    for (const h of p.h) shape.holes.push(new THREE.Path(ring(h)));
    const g = new THREE.ShapeGeometry(shape);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getY(i);
      pos.setXYZ(i, x, T.groundY(x, z) + 0.012, z);
    }
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    parts.push(g);
  }
  // sea: one plane at sea level covering the slab; the terrain hides it wherever land is above 0
  const e = T.extent;
  const sea = new THREE.PlaneGeometry(e.maxX - e.minX, e.maxZ - e.minZ, 1, 1).rotateX(-Math.PI / 2).translate((e.minX + e.maxX) / 2, -0.04, (e.minZ + e.maxZ) / 2);
  sea.deleteAttribute("normal");
  sea.deleteAttribute("uv");
  parts.push(sea);
  const geom = mergeGeometries(parts);

  const mat = new THREE.ShaderMaterial({
    fog: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uHorizon: { value: new THREE.Color() } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      ${LIGHT_GLSL}
      ${MORPH_GLSL}
      uniform vec3 uHorizon;
      varying vec3 vW;
      void main() {
        if (morphD(vW.xz) < uMorphR) discard;
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(v.y, 0.0), 3.0);
        vec3 deep = mix(vec3(0.010, 0.022, 0.04), vec3(0.10, 0.22, 0.30), pow(1.0 - uNight, 2.0));
        vec3 col = deep + uHorizon * (0.08 + 0.5 * fres);
        // slow ripples catching city light
        float r = sin(vW.x * 3.1 + uTime * 0.9 + sin(vW.z * 2.3)) * sin(vW.z * 3.7 - uTime * 0.7);
        float glint = smoothstep(0.82, 1.0, r * 0.5 + 0.5);
        col += vec3(1.0, 0.72, 0.42) * glint * uNight * 0.16;
        col += vec3(0.6, 0.8, 1.0) * glint * (1.0 - uNight) * 0.05;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, U);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 1;
  return { mesh, material: mat, geometry: geom };
}
