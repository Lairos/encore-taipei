// Assembles the diorama and owns the date: setDate() renders "Taipei at that moment", tick() reports milestones crossed.
// It also owns the style: setStyle(p) moves the transition wave from the real night city (0) to the game city (1).
import * as THREE from "three";
import { U, smooth, easeInOut } from "./shared.js";
import { loadTerrain, buildTerrain } from "./terrain.js";
import { buildWater } from "./water.js";
import { planCity, buildCity, buildRoads } from "./city.js";
import { LAYER_BUILDERS, buildAnchors, setLayerStyle } from "./layers.js";
import { buildSky, applyNight } from "./sky.js";
import { buildGameTerrain, buildGameWater, buildGameCity, buildTrees, buildStreets, buildTraffic, buildCloudShadows } from "./game.js";
import { POLICIES } from "./policies.js";

const WAVE_MAX = 260; // radius that covers the whole slab from City Hall

export async function createWorld(scene, { quality }) {
  const T = await loadTerrain();
  const terrain = buildTerrain(T);
  scene.add(terrain);
  const water = buildWater(T);
  scene.add(water.mesh);
  const anchors = buildAnchors(T);
  scene.add(anchors.group);

  const layers = new Map();
  for (const p of POLICIES) {
    const build = LAYER_BUILDERS[p.id];
    if (!build) continue;
    const l = build(T, p);
    layers.set(p.id, { policy: p, ...l });
    scene.add(l.group);
  }
  const exclusions = [...anchors.exclusions, ...[...layers.values()].flatMap((l) => l.exclusions)];
  const items = planCity(T, { quality, exclusions });
  const city = buildCity(items);
  scene.add(city.mesh);
  const realRoads = buildRoads(T);
  scene.add(realRoads);

  // game-style city, revealed by the wave
  const game = new THREE.Group();
  game.add(buildGameTerrain(T, terrain.userData.surface), buildGameWater(water.geometry), buildGameCity(items, quality));
  const trees = buildTrees(T, items, quality);
  const streets = buildStreets(T);
  const traffic = buildTraffic(T, streets.polylines, quality);
  const clouds = buildCloudShadows(T);
  game.add(trees.group, streets.mesh, traffic.mesh, clouds.group);
  scene.add(game);
  const real = [terrain.userData.surface, water.mesh, city.mesh, realRoads];

  const sky = buildSky();
  scene.add(sky.mesh);
  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  const sm = quality === "high" ? 4096 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow, { bias: -0.0004, normalBias: 0.03, radius: 2, intensity: 0 });
  scene.add(hemi, sun, sun.target);
  scene.fog = new THREE.Fog(0x0b1230, 80, 460);
  const env = { sky, fog: scene.fog, hemi, sun, waterMat: water.material };

  // ---------- style ----------
  let style = -1;
  let styleShadow = 0;
  let shadowsLive = false;
  let nightReal = 1;
  function setStyle(p, night = nightReal) {
    nightReal = night;
    style = p;
    const e = easeInOut(p);
    U.uMorphR.value = p <= 0 ? -10 : p >= 1 ? 1e5 : e * WAVE_MAX;
    U.uGame.value = smooth(0.15, 0.6, p);
    applyNight(night * (1 - smooth(0.0, 0.55, p)), env, smooth(0.2, 0.8, p));
    styleShadow = 0.75 * smooth(0.82, 1.0, p);
    for (const o of real) o.visible = p < 1;
    game.visible = p > 0;
    setLayerStyle(U.uGame.value);
  }

  // ---------- milestones ----------
  const flashAt = new Map();
  let prev = null;
  const listeners = [];
  function tick(mainDate, time) {
    if (prev !== null && mainDate > prev)
      for (const p of POLICIES)
        for (const ev of [p.event, p.event2])
          if (ev !== undefined && prev < ev && mainDate >= ev) {
            flashAt.set(p.id, time);
            for (const fn of listeners) fn(p, ev);
          }
    prev = mainDate;
  }

  function setDate(d, { flash = true } = {}) {
    U.uDate.value = d;
    const now = U.uTime.value;
    for (const [id, l] of layers) {
      const t = flashAt.get(id);
      l.update(d, flash && t !== undefined ? Math.exp(-(now - t) * 1.6) : 0);
    }
    anchors.update(d);
  }

  return {
    T,
    layers,
    city,
    counts: { buildings: items.length, trees: trees.count },
    tick,
    setDate,
    setStyle,
    get style() {
      return style;
    },
    // the shadow map must exist before any shadow-receiving material draws, even while shadows are paused
    get shadowsLive() {
      return shadowsLive || !sun.shadow.map;
    },
    onMilestone: (fn) => listeners.push(fn),
    resize(heightPx, fov) {
      const scale = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
      for (const l of layers.values()) if (l.material?.uniforms?.uScale) l.material.uniforms.uScale.value = scale;
    },
    // per frame: sky follows the camera; traffic, clouds and the shadow box follow the view in game style
    update(dt, camera, target) {
      sky.mesh.position.copy(camera.position);
      if (style <= 0) return;
      traffic.update(dt);
      clouds.update(dt);
      const dist = camera.position.distanceTo(target);
      for (const m of trees.lod) m.visible = camera.position.distanceTo(m.boundingSphere.center) < m.userData.maxDist + m.boundingSphere.radius;
      // shadows read only when close; far away they cost a full shadow pass for nothing
      const near = 1 - smooth(110, 170, dist);
      sun.shadow.intensity = styleShadow * near;
      shadowsLive = sun.shadow.intensity > 0.01;
      const half = THREE.MathUtils.clamp(dist * 0.75, 12, 150);
      const cam = sun.shadow.camera;
      if (Math.abs(cam.right - half) > 0.5) {
        Object.assign(cam, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 400 });
        cam.updateProjectionMatrix();
      }
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(U.uSunDir.value, 150);
    },
  };
}
