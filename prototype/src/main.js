import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import { U, DATES, STOPS, stopToDate, easeInOut } from "./shared.js";
import { createWorld } from "./world.js";
import { createPost } from "./post.js";
import { createOpening, GAME_FOV_RATIO } from "./opening.js";
import { createUI } from "./ui.js";
import { POLICIES } from "./policies.js";

const params = new URLSearchParams(location.search);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const quality = params.get("quality") || (innerWidth <= 800 || /Mobi|Android/i.test(navigator.userAgent) ? "medium" : "high");

const stage = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
const pixelRatio = Math.min(devicePixelRatio, quality === "high" ? 1.75 : 1.3);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // refreshed once per frame by the render pass, not once per date
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.3, 3000);
const controls = new MapControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 6, maxDistance: 420, maxPolarAngle: 1.25, zoomSpeed: 1.2 });
controls.enabled = false;

// cinematic lens; the game style narrows it (dolly zoom) for a near-isometric look
const baseFov = () => (innerWidth < innerHeight ? 52 : 36);
const fovFor = (p) => baseFov() * (1 - (1 - GAME_FOV_RATIO) * easeInOut(p));

const world = await createWorld(scene, { quality });
const post = createPost(renderer, scene, camera, world);
const opening = createOpening({ camera, world, post, baseFov });

// ---------- app state ----------
let mode = "opening";
let mainDate = DATES.inauguration;
let dateTween = null;
let fly = null;
let style = 0;
let styleTween = null;
const curtain = { on: false, split: 0.5 };

const ui = createUI({
  onScrub(s, { animate }) {
    const to = stopToDate(s);
    if (animate) dateTween = { from: mainDate, to, t0: performance.now(), dur: 900 };
    else {
      dateTween = null;
      mainDate = to;
    }
  },
  onCurtain(on) {
    setCurtain(on);
  },
  onSplit(x) {
    curtain.split = x;
    ui.setCurtain(curtain.on, x);
  },
  onPin(id) {
    const p = POLICIES.find((q) => q.id === id);
    ui.showPolicy(p, mainDate);
    const l = world.layers.get(id);
    if (l?.anchor) flyTo(l.anchor, FLY_DIST[id] || 14);
    // a planned item is only visible once the timeline reaches it
    if (p.status === "planned" && mainDate < p.event) dateTween = { from: mainDate, to: Math.max(p.event + 1.2, STOPS[2]), t0: performance.now(), dur: 1200 };
  },
  onSkip() {
    opening.skip();
  },
  onCta(kind) {
    ui.showOutro(false);
    if (kind === "curtain") {
      dateTween = { from: mainDate, to: DATES.today, t0: performance.now(), dur: 1200 };
      setCurtain(true);
      flyTo(CURTAIN_VIEW, 46); // the dense core, where most of the before/after changes sit
    }
  },
  onStyle(toGame) {
    styleTween = { from: style, to: toGame ? 1 : 0, t0: performance.now(), dur: 3200 };
  },
});

const CURTAIN_VIEW = new THREE.Vector3(2, 3, 18);
const FLY_DIST = { dome: 9, gongguan: 5, nvidia: 11, autobus: 12, songshan: 34, eastring: 46, renewal: 34, lunch: 40, youbike: 40 };
for (const [id, l] of world.layers) if (l.anchor) ui.addPin(id, l.anchor, l.policy);
world.onMilestone((p, ev) => {
  if (mode === "opening" || dateTween) ui.caption(p, ev);
});

function setCurtain(on) {
  curtain.on = on;
  if (on) curtain.split = 0.5;
  ui.setCurtain(on, curtain.split);
}

// fly distances are given for the cinematic lens; scale them to the current one
const lensScale = () => Math.tan(THREE.MathUtils.degToRad(baseFov()) / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
function flyTo(anchor, dist) {
  dist *= lensScale();
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.y < 0.5) dir.setY(0.5).normalize();
  fly = {
    t0: performance.now(),
    fromP: camera.position.clone(),
    fromT: controls.target.clone(),
    toT: anchor.clone().setY(anchor.y - dist * 0.05),
    toP: anchor.clone().add(dir.multiplyScalar(dist)),
  };
}

// change the lens while keeping the framing (dolly zoom around the orbit target)
function setFov(fov) {
  const k = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  camera.position.sub(controls.target).multiplyScalar(k).add(controls.target);
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

function enterExplore() {
  mode = "explore";
  style = 1;
  ui.setMode("explore");
  controls.target.copy(opening.target);
  controls.enabled = true;
  controls.update();
  ui.showOutro(true);
  post.finish.uniforms.uTilt.value = 0.85;
  post.finish.uniforms.uFocus.value = 0.5;
}

// keep the camera over the diorama
const ext = world.T.extent;
controls.addEventListener("change", () => {
  const t = controls.target;
  const cx = THREE.MathUtils.clamp(t.x, ext.minX + 10, ext.maxX - 10),
    cz = THREE.MathUtils.clamp(t.z, ext.minZ + 10, ext.maxZ - 10);
  if (cx !== t.x || cz !== t.z) {
    camera.position.x += cx - t.x;
    camera.position.z += cz - t.z;
    t.set(cx, t.y, cz);
  }
});
renderer.domElement.addEventListener("pointerdown", () => {
  if (mode === "explore") ui.showOutro(false);
  fly = null;
});

function resize() {
  const w = innerWidth,
    h = innerHeight;
  camera.aspect = w / h;
  if (mode === "explore") setFov(fovFor(style));
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.setSize(w, h, pixelRatio);
}
addEventListener("resize", resize);
resize();

world.setStyle(0, 1);
U.uReveal.value = 0;
ui.setTimeline(mainDate);
if (reduced || params.has("skip")) opening.skip();
const freezeAt = params.has("t") ? +params.get("t") : null; // ?t=5 holds the opening at 5 s (for tuning)

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  step(Math.max(0, Math.min(0.05, (now - last) / 1000)), now);
  last = now;
}
function step(dt, now) {
  U.uTime.value += dt;

  if (mode === "opening") {
    opening.update(freezeAt === null ? dt : Math.max(0, freezeAt - opening.time));
    mainDate = opening.date();
    ui.setCounter(mainDate);
    if (opening.done) enterExplore();
  } else {
    if (dateTween) {
      const k = Math.min(1, (now - dateTween.t0) / dateTween.dur);
      mainDate = dateTween.from + (dateTween.to - dateTween.from) * easeInOut(k);
      if (k === 1) dateTween = null;
    }
    if (styleTween) {
      const k = Math.min(1, (now - styleTween.t0) / styleTween.dur);
      style = styleTween.from + (styleTween.to - styleTween.from) * k;
      world.setStyle(style, 0.72);
      setFov(fovFor(style));
      if (k === 1) styleTween = null;
    }
    if (fly) {
      const k = easeInOut(Math.min(1, (now - fly.t0) / 1100));
      camera.position.lerpVectors(fly.fromP, fly.toP, k);
      controls.target.lerpVectors(fly.fromT, fly.toT, k);
      if (k === 1) fly = null;
    }
    controls.update();
  }
  const s = mode === "opening" ? world.style : style;
  ui.setTheme(s > 0.5);
  post.bloom.strength = 0.6 - 0.48 * s; // bloom suits the night city, only a touch in daylight
  controls.minPolarAngle = 0.32 * s; // the game view keeps an oblique, SimCity-like angle
  controls.maxPolarAngle = 1.25 - 0.13 * s;
  ui.setTimeline(mainDate);
  world.tick(mainDate, U.uTime.value);
  world.update(dt, camera, mode === "opening" ? opening.target : controls.target);
  world.resize(innerHeight * pixelRatio, camera.fov);
  post.state.dateRight = mainDate;
  post.state.dateLeft = DATES.inauguration;
  post.state.curtain = curtain.on;
  post.state.split = curtain.split;
  ui.updatePins(camera, mainDate, curtain.on, curtain.split);
  post.render(dt);
}
ui.loaded();
requestAnimationFrame(frame);

// small hook for tuning and automated captures
window.taipei = {
  camera,
  controls,
  world,
  post,
  setCurtain,
  onSplit: (x) => ((curtain.split = x), ui.setCurtain(curtain.on, x)),
  get date() {
    return mainDate;
  },
  set date(d) {
    mainDate = d;
  },
  // advance the app by `seconds` without relying on requestAnimationFrame (background tabs, captures)
  advance(seconds, fps = 30) {
    let t = performance.now();
    for (let i = 0; i < Math.round(seconds * fps); i++) step(1 / fps, (t += 1000 / fps));
  },
};
