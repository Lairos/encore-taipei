// Sky dome with procedural stars and clouds, and the palette shared by sky, fog, lights and custom shaders:
// night ↔ dawn for the real city, then a bright clean daylight for the game city.
import * as THREE from "three";
import { U } from "./shared.js";

const P = {
  // [skyTop, horizon, sun, hemiSky, hemiGround, sunDir]
  night: [0x02040c, 0x0b1230, [0.11, 0.14, 0.26], [0.026, 0.036, 0.075], [0.008, 0.008, 0.014], [-0.3, 0.75, 0.45]],
  dawn: [0x0a1638, 0x5b4566, [0.95, 0.52, 0.36], [0.12, 0.13, 0.22], [0.035, 0.03, 0.04], [0.82, 0.2, 0.34]],
  day: [0x2a5fb0, 0xbfd3e6, [1.7, 1.58, 1.4], [0.5, 0.58, 0.75], [0.16, 0.14, 0.12], [0.5, 0.75, 0.3]],
  game: [0x3f8ee0, 0xd6ecf7, [0.82, 0.76, 0.66], [0.4, 0.46, 0.58], [0.26, 0.23, 0.19], [0.42, 0.78, 0.46]],
};

export function buildSky() {
  const uTop = { value: new THREE.Color() },
    uHorizon = { value: new THREE.Color() },
    uClouds = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTop, uHorizon, uClouds, uSunDir: U.uSunDir, uSunColor: U.uSunColor, uNight: U.uNight, uTime: U.uTime },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uNight; uniform float uTime; uniform float uClouds;
      varying vec3 vDir;
      float h(vec2 p){ p = fract(p * vec2(443.8, 441.4)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), 0.45));
        // below the horizon the diorama floats over a void: dark at night, soft haze by day
        col = mix(col, mix(uTop * 0.25, uHorizon * 0.92, uClouds), smoothstep(0.0, -0.25, y));
        float sun = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(sun, 8.0) * 0.25 + pow(sun, 200.0) * 1.5) * (1.0 - uNight * 0.7) * step(-0.02, y);
        // stars
        vec2 sp = vec2(atan(d.z, d.x) * 160.0, asin(clamp(y, -1.0, 1.0)) * 160.0);
        vec2 cell = floor(sp);
        float r = h(cell);
        float star = step(0.986, r) * smoothstep(0.35, 0.0, length(fract(sp) - 0.5));
        star *= 0.6 + 0.4 * sin(uTime * 2.0 + r * 80.0);
        col += vec3(0.85, 0.9, 1.0) * star * smoothstep(0.05, 0.3, y) * smoothstep(0.55, 1.0, uNight) * 1.4;
        // fluffy daytime clouds for the game city
        if (uClouds > 0.0 && y > 0.0) {
          vec2 cp = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.01, 0.0);
          float c = smoothstep(0.52, 0.78, fbm(cp));
          col = mix(col, vec3(1.0), c * 0.85 * uClouds * smoothstep(0.0, 0.12, y));
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uTop, uHorizon, uClouds };
}

const ca = new THREE.Color(),
  cb = new THREE.Color(),
  tmp = new THREE.Color(),
  tv = new THREE.Vector3();
function mixHex(a, b, t, out) {
  ca.setHex(a);
  cb.setHex(b);
  return out.copy(ca).lerp(cb, t);
}
const mixArr = (a, b, t, out) => out.setRGB(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
const arr = (a, out) => out.setRGB(a[0], a[1], a[2]);

// n = 1 night … 0.55 dawn … 0 day for the real city; g = 0..1 blends on to the game daylight
export function applyNight(n, { sky, fog, hemi, sun, waterMat }, g = 0) {
  const [A, B, t] = n > 0.55 ? [P.dawn, P.night, (n - 0.55) / 0.45] : [P.day, P.dawn, n / 0.55];
  const G = P.game;
  U.uNight.value = n;
  mixHex(A[0], B[0], t, sky.uTop.value).lerp(tmp.setHex(G[0]), g);
  mixHex(A[1], B[1], t, sky.uHorizon.value).lerp(tmp.setHex(G[1]), g);
  mixArr(A[2], B[2], t, U.uSunColor.value).lerp(arr(G[2], tmp), g);
  mixArr(A[3], B[3], t, U.uSkyColor.value).lerp(arr(G[3], tmp), g);
  mixArr(A[4], B[4], t, U.uGroundColor.value).lerp(arr(G[4], tmp), g);
  U.uSunDir.value.set(A[5][0] + (B[5][0] - A[5][0]) * t, A[5][1] + (B[5][1] - A[5][1]) * t, A[5][2] + (B[5][2] - A[5][2]) * t).normalize();
  U.uSunDir.value.lerp(tv.set(G[5][0], G[5][1], G[5][2]).normalize(), g).normalize();
  sky.uClouds.value = g;
  fog.color.copy(sky.uHorizon.value).lerp(sky.uTop.value, 0.35 * (1 - g));
  fog.near = 80 + 120 * g;
  fog.far = 460 + 340 * g;
  hemi.color.copy(U.uSkyColor.value);
  hemi.groundColor.copy(U.uGroundColor.value);
  hemi.intensity = Math.PI * (1 - 0.42 * g);
  sun.color.copy(U.uSunColor.value);
  sun.intensity = Math.PI * (1 + 0.3 * g);
  sun.position.copy(U.uSunDir.value).multiplyScalar(200);
  if (waterMat) waterMat.uniforms.uHorizon.value.copy(sky.uHorizon.value);
}
