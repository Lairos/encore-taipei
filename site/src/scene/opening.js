// The opening, about 17 seconds:
//   0–9 s   上任那天 at night → milestones light up across the real city (time-lapse to 今天)
//   9–13 s  the city transforms: a wave from City Hall turns it into the game city, night → day,
//           while a dolly-zoom flattens the perspective into a near-isometric game camera
//   13–17 s in game style, the 2030+ blueprint is laid out over 松山
import * as THREE from "three";
import { U, DATES, smooth, easeInOut } from "./shared.js";

export const DURATION = 17.5;
export const TRANSFORM = [9.4, 12.9]; // seconds over which the style goes real → game
export const GAME_FOV_RATIO = 0.6; // game camera FOV relative to the cinematic one (dolly zoom)

// camera keyframes [time, position, target], positions given for the cinematic FOV (dolly zoom applied on top)
const KEYS = [
  [0.0, [-46, 20, 74], [10, 2, 8]], // over 新店溪 at night, looking NE to 101 and 陽明山
  [2.6, [-20, 14, 44], [10, 1, 12]], // descending toward 大巨蛋 as the city lights up
  [5.2, [22, 13, 36], [4, 0, 6]], // past 101 / 信義
  [7.8, [52, 26, 8], [-6, 0, -16]], // east over 南港: 東環段 cranes, 內湖
  [9.8, [34, 38, 52], [8, 1, 10]], // rising over 信義: the wave starts at City Hall
  [12.6, [-2, 40, 56], [8, 1, 10]], // swinging to the classic game angle as the wave crosses the basin
  [14.4, [-2, 13, 27], [10, 1, 14]], // swooping down: 101 and 大巨蛋 as a toy city, traffic and shadows
  [16.2, [-14, 14, 6], [-2, 1, -12]], // gliding north to 松山 as the blueprint rises
  [DURATION, [-16, 15, 8], [-2, 1, -13]],
];
const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k[1])), false, "centripetal");
const tgtCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k[2])), false, "centripetal");

function curveParam(t) {
  for (let i = 0; i < KEYS.length - 1; i++)
    if (t <= KEYS[i + 1][0]) {
      const local = (t - KEYS[i][0]) / (KEYS[i + 1][0] - KEYS[i][0]);
      return (i + local) / (KEYS.length - 1);
    }
  return 1;
}

export function openingDate(t) {
  if (t < 2.0) return DATES.inauguration;
  if (t < 8.0) return DATES.inauguration + (DATES.today - DATES.inauguration) * easeInOut((t - 2.0) / 6.0);
  if (t < 14.4) return DATES.today;
  return DATES.today + (DATES.vision - DATES.today) * easeInOut(Math.min(1, (t - 14.4) / 2.0));
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
    const eased = easeInOut(u) * 0.2 + u * 0.8;
    posCurve.getPoint(eased, pos);
    tgtCurve.getPoint(eased, tgt);
    // dolly zoom: narrow the lens and pull back by the same amount, so framing holds while perspective flattens
    const p = openingStyle(t);
    const fov0 = baseFov();
    const fov = fov0 * (1 - (1 - GAME_FOV_RATIO) * easeInOut(p));
    const k = Math.tan(THREE.MathUtils.degToRad(fov0) / 2) / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.position.copy(tgt).addScaledVector(pos.sub(tgt), k);
    camera.lookAt(tgt);
    U.uReveal.value = 2 + 380 * Math.pow(smooth(0.25, 3.2, t), 1.6);
    world.setStyle(p, 1 - 0.28 * smooth(2.5, 9.0, t));
    post.finish.uniforms.uTilt.value = 1.35 - 0.5 * smooth(6, 10, t);
    post.finish.uniforms.uFocus.value = 0.42 + 0.06 * smooth(6, 10, t);
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
