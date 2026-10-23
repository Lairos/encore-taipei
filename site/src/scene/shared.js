import * as THREE from "three";

// Uniforms every custom shader reads. uDate is a decimal year and is the single source of "what has happened".
export const U = {
  uDate: { value: 2026.81 },
  uTime: { value: 0 },
  uNight: { value: 0.62 },
  uReveal: { value: 1e4 }, // radius (world units) of the opening light-up wave around City Hall
  uRevealCenter: { value: new THREE.Vector2(14.6, 19.4) }, // 臺北市政府
  // real → game transition: a wave of radius uMorphR spreads from City Hall; inside it the city is in game style
  uMorphR: { value: -10 },
  uGame: { value: 0 }, // 0..1 overall, for things that switch style as a whole (glows, icons)
  uSunDir: { value: new THREE.Vector3(0.4, 0.5, -0.6).normalize() },
  uSunColor: { value: new THREE.Color() },
  uSkyColor: { value: new THREE.Color() },
  uGroundColor: { value: new THREE.Color() },
};
U.uMorphCenter = U.uRevealCenter;

// GLSL for the transition wave, centred on City Hall like the opening light-up.
export const MORPH_GLSL = /* glsl */ `
uniform float uMorphR; uniform vec2 uMorphCenter;
float morphD(vec2 xz) { return length(xz - uMorphCenter); }
float waveRing(vec2 xz) { float d = morphD(xz) - uMorphR; return exp(-d * d * 1.2) * step(0.0, uMorphR) * step(uMorphR, 400.0); }
`;

export const STAGE = {
  start: { key: "start", zh: "起點", color: "#c9d3e3" },
  done: { key: "done", zh: "做到了", color: "#ffc56b" },
  ongoing: { key: "ongoing", zh: "正在做", color: "#ff8a3d" },
  planned: { key: "planned", zh: "接下來", color: "#5fe3ff" },
};

// decimal year from a calendar date
export const ymd = (y, m = 1, d = 1) => y + (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1));

export const DATES = {
  inauguration: ymd(2022, 12, 25),
  today: ymd(2026, 10, 23),
  plan2027: ymd(2027, 12, 1),
  vision: 2033, // 願景: after the dated plans (輝達 2030, 東環段 2032, 松山機場 after the 2033 third runway)
};

// timeline slider position (0..3) <-> decimal year, piecewise linear between the four stops
export const STOPS = [DATES.inauguration, DATES.today, DATES.plan2027, DATES.vision];
export function stopToDate(s) {
  const i = Math.min(2, Math.floor(s));
  return STOPS[i] + (STOPS[i + 1] - STOPS[i]) * Math.min(1, s - i);
}
export function dateToStop(d) {
  for (let i = 0; i < 3; i++) if (d <= STOPS[i + 1]) return i + Math.max(0, (d - STOPS[i]) / (STOPS[i + 1] - STOPS[i]));
  return 3;
}

export function formatDate(d) {
  if (d >= DATES.plan2027 + 0.3) return "2030+";
  if (d > DATES.today + 0.02) return String(Math.floor(d));
  const y = Math.floor(d),
    ms = Date.UTC(y, 0, 1) + (d - y) * (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1));
  const t = new Date(ms);
  return `${y}.${String(t.getUTCMonth() + 1).padStart(2, "0")}.${String(t.getUTCDate()).padStart(2, "0")}`;
}

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// deterministic PRNG so the city looks the same on every load
export function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// GLSL shared by the custom materials: hemisphere + sun lighting, matched to the scene lights
export const LIGHT_GLSL = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyColor; uniform vec3 uGroundColor;
uniform float uNight; uniform float uTime; uniform float uDate;
vec3 shade(vec3 albedo, vec3 n) {
  float diff = max(dot(n, uSunDir), 0.0);
  vec3 hemi = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
  return albedo * (hemi + uSunColor * diff);
}
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;
