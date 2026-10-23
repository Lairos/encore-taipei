// Rendering pipeline. The time curtain renders the city twice — once at 上任那天, once at the chosen date —
// each into its own multisampled target, then splits them at the curtain before bloom and grading.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const quadVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

class DualDatePass extends Pass {
  constructor(scene, camera, world, state) {
    super();
    this.needsSwap = false;
    Object.assign(this, { scene, camera, world, state });
    const opts = { type: THREE.HalfFloatType, samples: 4 };
    this.rtAfter = new THREE.WebGLRenderTarget(1, 1, opts);
    this.rtBefore = new THREE.WebGLRenderTarget(1, 1, opts);
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tA: { value: null }, tB: { value: null }, uSplit: { value: -1 } },
        vertexShader: quadVS,
        fragmentShader: /* glsl */ `
          uniform sampler2D tA; uniform sampler2D tB; uniform float uSplit; varying vec2 vUv;
          void main() { gl_FragColor = (uSplit >= 0.0 && vUv.x < uSplit) ? texture2D(tB, vUv) : texture2D(tA, vUv); }`,
      }),
    );
  }
  setSize(w, h) {
    this.rtAfter.setSize(w, h);
    this.rtBefore.setSize(w, h);
  }
  render(renderer, writeBuffer, readBuffer) {
    const { scene, camera, world, state } = this;
    renderer.shadowMap.needsUpdate = world.shadowsLive; // once per frame; the second date pass reuses it
    world.setDate(state.dateRight);
    renderer.setRenderTarget(this.rtAfter);
    renderer.clear();
    renderer.render(scene, camera);
    const split = state.curtain ? state.split : -1;
    if (split >= 0) {
      world.setDate(state.dateLeft, { flash: false });
      renderer.setRenderTarget(this.rtBefore);
      renderer.clear();
      renderer.render(scene, camera);
      world.setDate(state.dateRight);
    }
    const u = this.quad.material.uniforms;
    u.tA.value = this.rtAfter.texture;
    u.tB.value = this.rtBefore.texture;
    u.uSplit.value = split;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
  }
}

// tilt-shift (miniature look), before-side grade, curtain glow, vignette
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uSplit: { value: -1 },
    uTilt: { value: 1 },
    uFocus: { value: 0.5 },
    uVig: { value: 0.9 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uSplit; uniform float uTilt; uniform float uFocus; uniform float uVig;
    varying vec2 vUv;
    const vec2 P[12] = vec2[](vec2(-0.326,-0.406), vec2(-0.840,-0.074), vec2(-0.696,0.457), vec2(-0.203,0.621), vec2(0.962,-0.195), vec2(0.473,-0.480),
                              vec2(0.519,0.767), vec2(0.185,-0.893), vec2(0.507,0.064), vec2(0.896,0.412), vec2(-0.322,-0.933), vec2(-0.792,-0.598));
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float r = uTilt * smoothstep(0.12, 0.5, abs(vUv.y - uFocus)) * 7.0;
      if (r > 0.3) {
        vec3 acc = col; float wsum = 1.0;
        for (int i = 0; i < 12; i++) { acc += texture2D(tDiffuse, vUv + P[i] * r / uRes).rgb; wsum += 1.0; }
        col = acc / wsum;
      }
      if (uSplit >= 0.0) {
        if (vUv.x < uSplit) {
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(col, vec3(l) * vec3(0.93, 0.98, 1.08), 0.3);
        }
        float dx = abs(vUv.x - uSplit) * uRes.x;
        col += vec3(1.0, 0.9, 0.72) * (exp(-dx * 0.7) * 1.2 + exp(-dx * 0.05) * 0.06);
      }
      vec2 q = vUv - 0.5;
      col *= 1.0 - dot(q, q) * uVig;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost(renderer, scene, camera, world) {
  const state = { dateLeft: 0, dateRight: 0, curtain: false, split: 0.5 };
  const composer = new EffectComposer(renderer);
  const dual = new DualDatePass(scene, camera, world, state);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.9);
  const finish = new ShaderPass(FinishShader);
  composer.addPass(dual);
  composer.addPass(bloom);
  composer.addPass(finish);
  composer.addPass(new OutputPass());
  return {
    state,
    composer,
    finish,
    bloom,
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      finish.uniforms.uRes.value.set(w * pr, h * pr);
    },
    render(dt) {
      finish.uniforms.uSplit.value = state.curtain ? state.split : -1;
      composer.render(dt);
    },
  };
}
