// The opening, about 22 seconds: a chronological tour of what was done, then the vision.
//   0–3 s    上任那天 at night: the real city lights up from City Hall; the 大巨蛋 site still has its cranes
//   3–6 s    the city transforms: a wave from City Hall turns it into the game city, night → day, while a
//            dolly zoom flattens the perspective into a near-isometric game camera, coming down on the 大巨蛋 site
//   6–8 s    2023.12 the dome opens
//   8–10 s   2024.02 west along the main streets as YouBike riders appear
//   10–13 s  2025.09 south to 公館圓環: demolition, then the new crossing
//   13–17 s  2026 up over 大安 and 中正: lunch bowls over the schools, AI Labs, 大安路 under works; holding on 今天
//   17–22 s  2027 → 2030+ CiviClaw over City Hall, then north to 松山 as the AI park blueprint rises
import * as THREE from "three";
import { U, DATES, smooth, easeInOut } from "./shared.js";

export const DURATION = 22.5;
export const TRANSFORM = [3.0, 6.0]; // seconds over which the style goes real → game
export const GAME_FOV_RATIO = 0.6; // game camera FOV relative to the cinematic one (dolly zoom)

// camera keyframes [time, position, target], positions given for the cinematic FOV (dolly zoom applied on top)
const KEYS = [
  [0.0, [-46, 20, 74], [10, 2, 8]], // over 新店溪 at night, looking NE to 101 and 陽明山
  [2.8, [-14, 13, 44], [10, 1, 14]], // descending toward 信義 as the city lights up
  [5.6, [0, 14, 30], [9.5, 0.5, 14]], // the wave passes: the 大巨蛋 site, 101 and City Hall as a toy city
  [7.8, [3, 9, 24], [9.5, 0.5, 14]], // close on the dome as it opens
  [9.6, [-7, 6, 21], [-3, 0.3, 14]], // down to street level west of the dome: bikes on 忠孝 / 市民大道
  [11.2, [-18, 9, 50], [-13, 0.5, 41]], // south over 大安 toward 公館
  [12.8, [-16.7, 4.5, 49.7], [-14.3, 0.4, 46.1]], // close on 公館圓環 (the junction as the layer snaps it) as it is taken out
  [15.4, [-13, 13, 40], [-8, 0.5, 27]], // rising over 大安 and 中正: the campuses get their lunch bowls
  [17.4, [2, 18, 38], [8, 0.5, 19]], // 今天: 大安路, the dome and City Hall's plaza in one view
  [19.2, [8, 14, 33], [13.8, 0.5, 19]], // City Hall's AI halo lights up
  [21.0, [-14, 14, 6], [-2, 1, -12]], // 松山 as the AI park blueprint rises
  [DURATION, [-16, 15, 8], [-2, 1, -13]],
];
const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k[1])), false, "centripetal");
const tgtCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k[2])), false, "centripetal");

// each keyframe is reached at its time (the dates are timed to the shots); only the first and last moves ease
function curveParam(t) {
  const n = KEYS.length - 1;
  for (let i = 0; i < n; i++)
    if (t <= KEYS[i + 1][0]) {
      let local = (t - KEYS[i][0]) / (KEYS[i + 1][0] - KEYS[i][0]);
      if (i === 0) local = local * local * (2 - local);
      if (i === n - 1) local = local * (1 + local - local * local);
      return (i + local) / n;
    }
  return 1;
}

// date keyframes [time, decimal year]: each policy's moment falls while the camera is on it
const DATE_KEYS = [
  [0, DATES.inauguration],
  [6.0, DATES.inauguration],
  [7.8, 2023.95], // 大巨蛋 opens (2023.12.02) at about 7.7 s
  [9.6, 2024.25], // YouBike free 30 minutes (2024.02.28) at about 9.2 s
  [11.0, 2025.55],
  [12.8, 2025.78], // 公館圓環: demolition from about 12.1 s, the new crossing at about 12.6 s
  [15.6, 2026.75], // lunch (2026.08.31) at about 15.4 s; AI Labs and 大安路 works on the way
  [17.6, DATES.today],
  [19.2, 2028.0], // CiviClaw (end of 2027) at about 19.1 s
  [21.0, DATES.vision],
];
export function openingDate(t) {
  for (let i = 0; i < DATE_KEYS.length - 1; i++) {
    const [t0, d0] = DATE_KEYS[i],
      [t1, d1] = DATE_KEYS[i + 1];
    if (t <= t1) return d0 + (d1 - d0) * Math.max(0, (t - t0) / (t1 - t0));
  }
  return DATES.vision;
}
export const openingStyle = (t) => smooth(TRANSFORM[0], TRANSFORM[1], t);

export const finalView = { position: new THREE.Vector3(...KEYS.at(-1)[1]), target: new THREE.Vector3(...KEYS.at(-1)[2]) };

export function createOpening({ camera, world, post, baseFov }) {
  let t = 0;
  let done = false;
  const pos = new THREE.Vector3(),
    tgt = new THREE.Vector3();
  const apply = () => {
    const u = curveParam(Math.min(t, DURATION));
    posCurve.getPoint(u, pos);
    tgtCurve.getPoint(u, tgt);
    // dolly zoom: narrow the lens and pull back by the same amount, so framing holds while perspective flattens
    const p = openingStyle(t);
    const fov0 = baseFov();
    const fov = fov0 * (1 - (1 - GAME_FOV_RATIO) * easeInOut(p));
    const k = Math.tan(THREE.MathUtils.degToRad(fov0) / 2) / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.position.copy(tgt).addScaledVector(pos.sub(tgt), k);
    camera.lookAt(tgt);
    U.uReveal.value = 2 + 380 * Math.pow(smooth(0.25, 2.8, t), 1.6);
    world.setStyle(p, 1 - 0.28 * smooth(1.5, 5.0, t));
    post.finish.uniforms.uTilt.value = 1.35 - 0.5 * smooth(3, 6, t);
    post.finish.uniforms.uFocus.value = 0.42 + 0.06 * smooth(3, 6, t);
  };
  return {
    get time() {
      return t;
    },
    get done() {
      return done;
    },
    get target() {
      return tgt;
    },
    date: () => openingDate(t),
    update(dt) {
      if (done) return;
      t += dt;
      apply();
      if (t >= DURATION) done = true;
    },
    skip() {
      t = DURATION;
      apply();
      done = true;
    },
  };
}
