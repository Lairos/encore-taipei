// Entry for the home page: the 3D city, or the plain-text version when 3D cannot run.
import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import { U, DATES, STOPS, stopToDate, easeInOut } from "./shared.js";
import { createWorld } from "./world.js";
import { createPost } from "./post.js";
import { createOpening, GAME_FOV_RATIO } from "./opening.js";
import { createUI } from "./ui.js";
import { createPersona } from "./persona.js";
import { createLabels } from "./labels.js";
import { POLICIES, OPENING_CAPTIONS } from "./policies.js";

function webglReady() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

function showFallback() {
  document.body.classList.remove("is-opening");
  document.body.classList.add("no-3d");
  document.getElementById("fallback").hidden = false;
  document.getElementById("loading").classList.add("gone");
}

export async function boot() {
  if (!webglReady() || new URLSearchParams(location.search).has("no3d")) return showFallback(); // ?no3d previews the text version
  try {
    await start();
  } catch (err) {
    console.error(err);
    showFallback();
  }
}

async function start() {
  const params = new URLSearchParams(location.search);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const quality = params.get("quality") || (innerWidth <= 800 || /Mobi|Android/i.test(navigator.userAgent) ? "medium" : "high");
  // deep links: ?focus=<policy> opens one policy, ?me=<personas>&d=<district> replays 我的臺北
  const deepFocus = params.get("focus");
  const deepMe = params.get("me");

  const stage = document.getElementById("stage");
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  const maxRatio = Math.min(devicePixelRatio, quality === "high" ? 1.75 : 1.3);
  let pixelRatio = maxRatio;
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
  const tweenDate = (to, dur = 1200) => (dateTween = { from: mainDate, to, t0: performance.now(), dur });

  const ui = createUI({
    onScrub(s, { animate }) {
      const to = stopToDate(s);
      if (animate) tweenDate(to, 900);
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
      focusPolicy(id);
    },
    onHub() {
      focusHub();
    },
    onSkip() {
      opening.skip();
    },
    onCta(kind) {
      ui.showOutro(false);
      if (kind === "curtain") {
        tweenDate(DATES.today);
        setCurtain(true);
        flyTo(CURTAIN_VIEW, 46); // the dense core, where most of the before/after changes sit
      }
      if (kind === "me") persona.open();
    },
    onStyle(toGame) {
      styleTween = { from: style, to: toGame ? 1 : 0, t0: performance.now(), dur: 3200 };
    },
  });

  const CURTAIN_VIEW = new THREE.Vector3(2, 3, 18);
  const FLY_DIST = { dome: 9, gongguan: 5, nvidia: 11, autobus: 12, songshan: 34, eastring: 46, renewal: 34, youbike: 40 };
  const HUB_DIST = 9, // the whole ring of citywide policies over City Hall
    PEDESTAL_DIST = 6; // one pad with its neighbours, close enough for each to have its own pin
  // the ring is looked at from the north-west: City Hall in front, 臺北101 behind rather than in the way
  const HUB_VIEW = new THREE.Vector3(-0.45, 0.65, -0.6);
  for (const [id, l] of world.layers) if (l.anchor) ui.addPin(id, l.anchor, l.policy);
  ui.addHub(world.hub.anchor, world.hub.ids);
  world.onMilestone((p, ev, label) => {
    if ((mode === "opening" && OPENING_CAPTIONS.includes(p.id)) || dateTween) ui.caption(p, ev, label);
  });

  function focusPolicy(id) {
    const p = POLICIES.find((q) => q.id === id);
    if (!p) return;
    ui.showOutro(false);
    ui.showPolicy(p, mainDate);
    const l = world.layers.get(id);
    // on a phone the card covers the lower part of the screen: frame the place in the part above it
    if (l?.anchor) flyTo(l.anchor, FLY_DIST[id] || (p.hub ? PEDESTAL_DIST : 14), innerWidth <= 760 ? 0.22 : 0, 0, p.hub ? HUB_VIEW : null);
    // a planned item is only visible once the timeline reaches it
    if (p.status === "planned" && mainDate < p.event) tweenDate(Math.max(p.event + 1.2, STOPS[2]));
  }

  function focusHub() {
    ui.showOutro(false);
    ui.showHub(mainDate);
    const phone = innerWidth <= 760;
    flyTo(world.hub.anchor, HUB_DIST, phone ? 0.32 : 0, phone ? 0 : 0.17, HUB_VIEW); // the ring is wider than a single place
  }

  function setCurtain(on) {
    curtain.on = on;
    if (on) curtain.split = 0.5;
    ui.setCurtain(on, curtain.split);
  }

  // fly distances are given for the cinematic lens; scale them to the current one
  const lensScale = () => Math.tan(THREE.MathUtils.degToRad(baseFov()) / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  // lift: how far above the middle of the screen the place should end up (fraction of the screen height);
  // side: how far left of the middle (fraction of the width), to keep a wide place clear of the card on the right;
  // view: a direction to look from instead of the current one
  function flyTo(anchor, dist, lift = 0, side = 0, view = null) {
    dist *= lensScale();
    const dir = (view ? view.clone() : camera.position.clone().sub(controls.target)).normalize();
    if (dir.y < 0.5) dir.setY(0.5).normalize();
    const viewH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const toward = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar((lift * viewH) / Math.max(0.4, dir.y));
    toward.add(new THREE.Vector3(dir.z, 0, -dir.x).normalize().multiplyScalar(side * viewH * camera.aspect));
    const toT = anchor.clone().setY(anchor.y - dist * 0.05).add(toward);
    fly = {
      t0: performance.now(),
      fromP: camera.position.clone(),
      fromT: controls.target.clone(),
      toT,
      toP: anchor.clone().add(toward).add(dir.multiplyScalar(dist)),
    };
  }

  // fly so the view spans `span` world units across its narrower side, whatever the lens
  const flyToSpan = (p, span) => flyTo(p, span / (2 * Math.tan(THREE.MathUtils.degToRad(baseFov()) / 2) * Math.min(1, camera.aspect)));
  const labels = createLabels({ T: world.T, root: document.getElementById("labels"), onPick: flyToSpan });

  // change the lens while keeping the framing (dolly zoom around the orbit target)
  function setFov(fov) {
    const k = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    camera.position.sub(controls.target).multiplyScalar(k).add(controls.target);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  const persona = createPersona({
    ui,
    world,
    focusPolicy,
    hasPin: (id) => !!world.layers.get(id)?.anchor,
    showToday: () => tweenDate(DATES.today),
    flyToDistrict(d) {
      const xs = d.outline.map((p) => p[0]),
        zs = d.outline.map((p) => p[1]);
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
      // the built-up middle of the district, where its name is drawn (not the mountains of 北投 or 士林)
      flyTo(labels.districtPoint(d.name) || new THREE.Vector3(d.center[0], world.T.groundY(d.center[0], d.center[1]), d.center[1]), Math.max(24, span * 0.9));
    },
    // the current view as an image, for the share card (read straight after a render, while the buffer is intact)
    snapshot() {
      post.render(0);
      return renderer.domElement;
    },
  });

  let pendingDeepLink = deepFocus || deepMe;
  function enterExplore() {
    mode = "explore";
    style = 1;
    ui.setMode("explore");
    controls.target.copy(opening.target);
    controls.enabled = true;
    controls.update();
    post.finish.uniforms.uTilt.value = 0.85;
    post.finish.uniforms.uFocus.value = 0.5;
    if (!pendingDeepLink) return ui.showOutro(true);
    pendingDeepLink = null;
    mainDate = DATES.today;
    if (deepFocus) focusPolicy(deepFocus);
    else persona.run(deepMe.split(","), params.get("d"));
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
    persona.interrupt();
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
  if (reduced || pendingDeepLink || params.has("skip")) opening.skip();
  const freezeAt = params.has("t") ? +params.get("t") : null; // ?t=5 holds the opening at 5 s (for tuning)

  // dynamic quality for a steady frame rate on slower GPUs, best rung first. The cost is mostly per pixel, so
  // sharpness goes first, then the bloom, then shadows refresh every third frame; below 1 only when really slow
  // (under 25 fps), not for a phone that merely holds itself at 30 to save power
  const one = Math.min(1, maxRatio);
  const rungs = [];
  for (let r = maxRatio; r > 1.001; r -= 0.15) rungs.push({ pr: r, bloom: true, shadowEvery: 1, slowAt: 26 });
  rungs.push(
    { pr: one, bloom: true, shadowEvery: 1, slowAt: 26 },
    { pr: one, bloom: false, shadowEvery: 1, slowAt: 26 },
    { pr: one, bloom: false, shadowEvery: 3, slowAt: 40 },
    { pr: Math.min(one, 0.85), bloom: false, shadowEvery: 3, slowAt: 40 },
    { pr: Math.min(one, 0.75), bloom: false, shadowEvery: 3, slowAt: Infinity },
  );
  let rung = 0,
    slow = 0,
    fast = 0,
    avg = 16,
    patience = 600, // frames of headroom before trying the rung above; doubles each time that proves too much
    climbed = false;
  function setRung(i) {
    rung = i;
    const q = rungs[i];
    post.bloom.enabled = q.bloom;
    post.state.shadowEvery = q.shadowEvery;
    if (q.pr !== pixelRatio) {
      pixelRatio = q.pr;
      renderer.setPixelRatio(pixelRatio);
      resize();
    }
  }
  function adapt(ms) {
    avg += (Math.min(ms, 100) - avg) * 0.05; // one long stall (a shader compiling) is not a slow GPU
    slow = avg > rungs[rung].slowAt ? slow + 1 : 0;
    fast = avg < 18 ? fast + 1 : 0; // holding 60 fps
    if (slow > (avg > 40 ? 20 : 90) && rung < rungs.length - 1) {
      if (climbed) patience *= 2;
      climbed = false;
      setRung(rung + 1);
      slow = fast = 0;
    } else if (fast > patience && rung > 0) {
      climbed = true;
      setRung(rung - 1);
      slow = fast = 0;
    }
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!document.hidden) adapt(now - last);
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
    labels.update(camera, controls.target, mode === "explore" && style > 0.5, ui.pinRects());
    post.render(dt);
  }
  ui.loaded();
  requestAnimationFrame(frame);

  // small hook for QA and automated captures
  window.taipei = {
    readyAt: performance.now(), // when the city was built and the first frame queued
    get quality() {
      return { rung, of: rungs.length, avg: +avg.toFixed(1), ...rungs[rung] };
    },
    camera,
    controls,
    world,
    post,
    persona,
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
}
