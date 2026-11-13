// Illustration passes adapted from Simcraft. See LICENSE.simcraft.
import * as THREE from 'three';
import { createLighting } from './lighting.mjs';

export function createIllustrationEngine(canvas, {
  durationMs = 32000,
  loop = true,
  benchmarkCase = null,
} = {}) {
  const PW = 960;
  const PH = 540;
  const R = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  R.setPixelRatio(1);
  R.setSize(PW, PH, false);
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.toneMapping = THREE.NoToneMapping;
  R.shadowMap.enabled = true;
  R.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#F7F6F2');
  const cam = new THREE.PerspectiveCamera(35, PW / PH, .1, 300);
  const lighting = createLighting(scene);
  const sun = lighting.light;
  const amb = lighting.ambient;
  const GLOW = [lighting.disc];
  const NOINK = [];
  const updates = [];
  let cameraAt;
  const ramp = new THREE.DataTexture(
    new Uint8Array([155,160,185,255,255,255,255,255]), 2, 1, THREE.RGBAFormat,
  );
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  function toon(color, extra = {}) {
    return new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra });
  }
// ---------- illustration pass ----------
// Colour, surface direction + depth, and a shadow mask are rendered separately; a final pass draws the ink lines
// wherever depth or surface direction changes (so lines also appear where things meet, e.g. a cone on the road),
// with noise-varied weight and a slight wobble, and hatches the cast shadows with light strokes, like the reference.
const colorRT = new THREE.WebGLRenderTarget(PW, PH, { samples: 4, type: THREE.HalfFloatType });
const nrmRT = new THREE.WebGLRenderTarget(PW, PH, { type: THREE.HalfFloatType }); nrmRT.depthTexture = new THREE.DepthTexture(PW, PH, THREE.FloatType);
const shdRT = new THREE.WebGLRenderTarget(PW, PH);
const albRT = new THREE.WebGLRenderTarget(PW, PH);   // flat colours only (no sun): where one colour meets another, ink a line, like the reference
const normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
const shadowMat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
const post = new THREE.ShaderMaterial({ uniforms: { tC: { value: colorRT.texture }, tN: { value: nrmRT.texture }, tD: { value: nrmRT.depthTexture }, tS: { value: shdRT.texture }, tA: { value: albRT.texture }, invVP: { value: new THREE.Matrix4() }, sunDir: { value: new THREE.Vector3() }, camPos: { value: new THREE.Vector3() }, VP: { value: new THREE.Matrix4() }, tl: { value: 0 }, camRot: { value: new THREE.Matrix3() },
    solarCenter:{value:lighting.position.clone()},solarRadius:{value:lighting.solarRadius},res: { value: new THREE.Vector2(PW, PH) }, sky: { value: new THREE.Color("#DA3704") }, dbg: { value: 0 }, near: { value: .1 }, far: { value: 100 }, ink: { value: new THREE.Color("#0b0b14") } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
  fragmentShader: `
    uniform vec3 solarCenter;uniform float solarRadius;uniform sampler2D tC, tN, tD, tS, tA; uniform mat4 invVP; uniform mat3 camRot; uniform vec3 sunDir; uniform vec3 camPos; uniform mat4 VP; uniform float tl; uniform vec2 res; uniform float near, far; uniform vec3 ink, sky; uniform float dbg; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    float lin(float d){ return near * far / (far - d * (far - near)); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1./2.4)) - .055, step(.0031308, c)); }
    // Lines where depth or surface direction changes. Depth uses the second difference (z+ + z- - 2z): a flat surface,
    // even one seen almost edge-on like the road from knee height, has none, so it isn't inked by mistake.
    float ecol;   // colour-boundary part of the last edgeAt, kept apart so ground markings can be drawn lighter
    float edgeAt(vec2 uv, float r, float cdens){
      vec2 px = r / res; vec3 ac = texture2D(tA, uv).rgb; float dc = texture2D(tD, uv).r; bool skyC = dc > .99999; float zc = lin(dc); vec3 nc = texture2D(tN, uv).xyz * 2. - 1.;
      float e = 0.; ecol = 0.;
      for (int k = 0; k < 4; k++) { float a = float(k) * .785398; vec2 o = vec2(cos(a), sin(a)) * px;
        float d1 = texture2D(tD, uv + o).r, d2 = texture2D(tD, uv - o).r;
        bool s1 = d1 > .99999, s2 = d2 > .99999;
        if (skyC != s1 || skyC != s2) { e = 1.; continue; }
        if (skyC) continue;
        float z1 = lin(d1), z2 = lin(d2);
        float kz = 1. + zc / 12.;                                       // far away, depth precision drops: demand a bigger jump
        e = max(e, smoothstep(.006 * kz, .02 * kz, abs(z1 + z2 - 2. * zc) / zc));
        vec3 n1 = texture2D(tN, uv + o).xyz * 2. - 1., n2 = texture2D(tN, uv - o).xyz * 2. - 1.;
        e = max(e, smoothstep(.25, .5, 1. - min(dot(nc, n1), dot(nc, n2))));
        vec3 a1 = texture2D(tA, uv + o).rgb, a2 = texture2D(tA, uv - o).rgb;   // colour boundaries (window bars, frames, trim, stripes)
        float dcol = max(length(a1 - ac), length(a2 - ac));
        ecol = max(ecol, smoothstep(.07, .11, dcol) * cdens); }
      return e; }
    // Dusk sky looked up by view DIRECTION (not screen position), so clouds stay put in the world while the camera moves:
    // deep blue overhead to a warm peach horizon, flat anime clouds with pink undersides and a lit rim.
    float fbm(vec2 p){ float a = .5, v = 0.; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= .5; } return v; }
    vec3 skyAt(vec3 dir){ float e = dir.y + .55;   // night over a lit city: deep blue overhead, a warm pink-orange glow at the horizon, clouds lit from below
      vec3 hor = vec3(.84, .51, .34), low = vec3(.72, .38, .34), mid = vec3(.45, .35, .48), zen = vec3(.30, .35, .51);
      vec3 c = mix(hor, low, smoothstep(-.01, .06, e)); c = mix(c, mid, smoothstep(.06, .22, e)); c = mix(c, zen, smoothstep(.22, .7, e));
      vec2 q = dir.xz / (max(e, 0.) + .1);
      float n = fbm(q * 1.1 + vec2(3.1, 7.7)), band = smoothstep(.02, .1, e) * (1. - smoothstep(.5, .8, e));
      float cl = smoothstep(.47, .55, n) * band;
      vec3 ccol = mix(vec3(.94, .65, .50), vec3(.70, .45, .48), smoothstep(.5, .68, n) * smoothstep(.0, .3, e));   // undersides glow with the city's light
      c = mix(c, ccol, cl * .85);
      float st = step(.997, hash(floor(dir.xz / (e + .2) * 140.))) * smoothstep(.25, .5, e) * (1. - cl); c += st * 0.;   // a few stars through the light pollution
      return c; }
    void main(){
      vec2 p = vUv * res;
      // wobble: displace the lookup a little along slow noise, so lines are not ruler-straight
      vec2 wob = vec2(0.);   // no screen-space wobble: noise fixed to the screen made lines crawl when the camera moved
      float zl = lin(texture2D(tD, vUv).r);
      float w = mix(1.6, 1.1, smoothstep(6., 40., zl)) * (res.x / 1920.);            // half-width in px at 2880: ~2.4 px shown close up, ~1.8 far                                               // steady weight (2.1 px at 2880 = 1.4 px shown)
      vec4 wp0 = invVP * vec4(vUv * 2. - 1., texture2D(tD, vUv).r * 2. - 1., 1.); wp0 /= wp0.w;
      bool isSun=length(wp0.xyz-solarCenter)<solarRadius*1.03;float foot = length(fwidth(wp0.xyz));                          // metres per pixel here
      float cdens = 1. - smoothstep(.022, .05, foot);                 // colour lines (tiles, seams) fade before they crowd together and shimmer
      float e = edgeAt(vUv + wob, w, cdens);
      vec3 c = texture2D(tC, vUv).rgb;
      float d = texture2D(tD, vUv).r; bool isSky = d > .99999;
      if(isSky)c=vec3(.93,.92,.89);
      float lit = texture2D(tS, vUv).r;
      if (!isSky) {
        vec3 nC = texture2D(tN, vUv).xyz * 2. - 1.;
        float graze = smoothstep(.18, .4, abs(nC.z));                    // no hatching on surfaces seen nearly edge-on (ground from knee height)
        vec3 nw = normalize(camRot * nC), an = abs(nw);
        float thr = an.y > .7 ? .35 : .62;                             // upright and rounded things (cones, poles) turn to shade sooner, like the drawn reference
        float sh = (1. - smoothstep(thr - .05, thr + .05, lit)) * graze;           // 1 only where no direct sun reaches (cast shadow / turned away)
        c *= mix(vec3(1.), vec3(.70, .73, .91), sh);                  // two-tone: the shadow side is a clear cool step darker, like the reference
        // hatching anchored to the world (not the screen), so it moves with surfaces and can't crawl or blink.
        vec4 wp = invVP * vec4(vUv * 2. - 1., d * 2. - 1., 1.); wp /= wp.w;
        vec2 q = an.y > .7 ? wp.xz : (an.x > an.z ? wp.zy : wp.xy);    // the plane the surface lies in
        float hv = (q.x + q.y) * 11.;                                  // diagonal strokes ~6.5 cm apart
        float fw = fwidth(hv);                                         // stripes per pixel: fade out before they get too fine to draw cleanly
        float st = 1. - smoothstep(.0, fw * 1.5 + .08, abs(fract(hv) - .5) - .32);
        float castOnly = smoothstep(.12, .22, dot(nw, sunDir));          // faces the sun but is in shade = a cast shadow; turned-away sides stay plain two-tone
        float hatchOn = sh * castOnly * (1. - smoothstep(.12, .22, fw));
        c = mix(c, c * vec3(.62, .64, .80), st * hatchOn * .7);
        // hatching: fine diagonal strokes, broken up by noise, only inside shadow
        float hx = (p.x - p.y) * .18 + noise(p * .03) * 3.;
        float stroke = smoothstep(.86, .97, abs(sin(hx * 3.14159))) * step(.45, noise(p * vec2(.012, .05) + 3.));
        // (screen-space hatching removed: it slid over moving surfaces and read as blinking)
      }
      vec3 nUp = normalize(camRot * (texture2D(tN, vUv).xyz * 2. - 1.));
      float colW = isSky ? 0. : (nUp.y > .7 ? .38 : 1.);            // tile joints and paint edges on the ground: thin grey, like the reference; on objects: full ink
      e = max(smoothstep(.35, .65, e), smoothstep(.35, .65, ecol) * colW);                                   // crisp: a line is either there or not
      c = mix(c, ink, e * (isSky ? .75 : .70));
      // glow: bright pixels (screens, neon, lamps, lit windows) bloom softly into their surroundings
      vec3 gsum = vec3(0.); for (int k = 0; k < 16; k++) { float a = float(k) * 2.39996, r = (5. + float(k) * 2.2) * (res.x / 1920.); vec3 sc = texture2D(tC, vUv + vec2(cos(a), sin(a)) * r / res).rgb; gsum += max(sc - .8, 0.) * (1. - float(k) / 20.); }
      c += gsum * .025;
      if (dbg > .5) c = texture2D(tC, vUv).rgb; if (dbg > 1.5) c = vec3(texture2D(tS, vUv).r); if (dbg > 2.5) c = texture2D(tA, vUv).rgb; if (dbg > 3.5) c = vec3(1. - e);
      c *= mix(1., .95, smoothstep(.55, 1.08, length((vUv - .5) * vec2(1.6, 1.))));   // vignette
      // night grade: a little more saturation and a gentle S-curve so neon and screens pop
      float lum = dot(c, vec3(.2126, .7152, .0722)); c = max(mix(vec3(lum), c, 1.02), 0.); c = c * c * (3. - 2. * c) * .35 + c * .65;
      if(isSky)c=vec3(.93,.92,.89);if(isSun)c=texture2D(tC,vUv).rgb;gl_FragColor=vec4(toSRGB(clamp(c,0.,1.)),1.);
    }` });
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post); quad.frustumCulled = false;
const postScene = new THREE.Scene(); postScene.add(quad); const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function draw(target = null) {
  const bg = scene.background;
  R.setRenderTarget(colorRT); R.render(scene, cam);
  NOINK.forEach((o) => { o.visible = false; }); scene.background = null; scene.overrideMaterial = normalMat; R.setRenderTarget(nrmRT); R.setClearColor(0x000000, 0); R.clear(); R.render(scene, cam);
  GLOW.forEach((o) => { o.visible = false; }); scene.overrideMaterial = null; sun.visible = false; R.setRenderTarget(albRT); R.setClearColor(0x000000, 1); R.clear(); R.render(scene, cam); sun.visible = true;
  const si = sun.intensity; sun.intensity = 2 * Math.PI;   // mask pass (three divides Lambert by pi): lit = 2 x (sun . normal), so surfaces turned more than ~80 deg from the sun read as shade (crisp two-tone on cones and poles)
  scene.overrideMaterial = shadowMat; amb.visible = false; R.setRenderTarget(shdRT); R.setClearColor(0x000000, 1); R.clear(); R.render(scene, cam);
  sun.intensity = si; amb.visible = true; scene.overrideMaterial = null; scene.background = bg; GLOW.forEach((o) => { o.visible = true; }); NOINK.forEach((o) => { o.visible = true; });
  post.uniforms.near.value = cam.near; post.uniforms.far.value = cam.far;
  post.uniforms.camPos.value.copy(cam.position); post.uniforms.VP.value.copy(cam.projectionMatrix).multiply(cam.matrixWorldInverse); post.uniforms.sunDir.value.copy(sun.position).sub(sun.target.position).normalize(); post.uniforms.invVP.value.copy(cam.matrixWorld).multiply(cam.projectionMatrixInverse); post.uniforms.camRot.value.setFromMatrix4(cam.matrixWorld);
  R.setRenderTarget(target); R.render(postScene, postCam);
}

  function render(ms) {
    const time = loop ? ((ms % durationMs) + durationMs) % durationMs : Math.max(0, Math.min(ms, durationMs));
    for (const update of updates) update(time);
    if (!cameraAt) throw new Error('Set the scene camera before rendering');
    cameraAt(time, cam);
    cam.updateMatrixWorld(true);
    post.uniforms.tl.value = time / durationMs;
    draw();
  }
  function expose() {
    window.render = render;
    window.frame = index => render(index * 1000 / 24);
    window.DURATION_MS = durationMs;
    window.MATCH_LOOP_END = loop;
    window.BENCHMARK_SCENE_KEY = benchmarkCase;
    window.READY = true;
  }
  return {
    scene, renderer: R, camera: cam, lighting, updates, toon,
    noInk: NOINK, glow: GLOW, render, expose,
    setCamera(callback) { cameraAt = callback; },
  };
}
