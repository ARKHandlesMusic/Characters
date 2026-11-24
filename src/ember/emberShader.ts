// Pure GLSL 3D Raymarched Signed Distance Field (SDF) Shader for EMBER
// Implements:
// - Mochi ghost (dome + 5 rippling ghost feet + 2 waving arm nubs)
// - Smooth SDF morphs: Light Bulb, 5-Point Star, Eighth Music Note, Beating Heart, Rubber Duck Coat, Camcorder Skin
// - Organic flowing smooth-noise halftone dots (non-repeating fluid current + evolving size field, zero pixelation)
// - Two-tone glossy orange-cream toon shading, crisp espresso ink outline, jelly-bean specular highlight
// - Eyes A (jet-black tall ovals + dual white catchlights, 1-frame stagger zip stretch, double blink, squint)
// - Curved 2D smear trail along real path history
// - Exact 2D surface slice clipping plane + Screen Portal flat 2D drawing & expanding glass ripples
// - Sleeve peel upward from bottom (pinching liquid neck -> Ember blob on top) & Translucent glossy skin coat

import * as THREE from "three";

const EMBER_VERT = /* glsl */ `
  out vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const EMBER_FRAG = /* glsl */ `
  precision highp float;

  in vec3 vWorldPos;
  out vec4 fragColor;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform mat4 uViewProj;
  uniform vec3 uCenter;
  uniform vec3 uSquash;
  uniform float uYaw;
  uniform float uPitch;
  uniform float uRoll;
  uniform vec3 uSkirtTrail;
  uniform float uFootPhase;
  uniform float uFootAmp;
  uniform float uBreath;
  uniform float uWaveLeft;
  uniform float uWaveRight;

  // Morph uniforms
  uniform int uShapeFrom;
  uniform int uShapeTo;
  uniform float uMorph;
  uniform float uActionTime;
  uniform float uBulbLit;
  uniform float uScaredGlow;
  uniform float uLumiPink;

  // Sleeve peel & translucent skin coat
  uniform float uPeel;
  uniform float uSkinMode;

  // Curved 2D smear trail (5 world-space past points)
  uniform vec3 uTrail0;
  uniform vec3 uTrail1;
  uniform vec3 uTrail2;
  uniform vec3 uTrail3;
  uniform vec3 uTrail4;
  uniform float uSmear;

  // Surface slice plane
  uniform float uClipEnabled;
  uniform vec3 uClipPoint;
  uniform vec3 uClipNormal;

  // Eyes A (independent left & right)
  uniform vec3 uLeftEyePos;
  uniform vec3 uRightEyePos;
  uniform vec2 uLeftEyeStretch;
  uniform vec2 uRightEyeStretch;
  uniform vec2 uEyeBlink;   // x = left, y = right
  uniform float uEyeSquint;
  uniform vec2 uEyeGlance;

  uniform float uOpacity;

  // ==========================================================
  // Smooth Quintic Gradient Noise (ZERO grid pixelation!)
  // ==========================================================
  vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float gnoise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
    float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm2(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    mat2 m = mat2(0.80, -0.60, 0.60, 0.80);
    for (int i = 0; i < 3; i++) {
      v += a * gnoise2(p);
      p = m * p * 2.03 + vec2(17.1, 9.3);
      a *= 0.5;
    }
    return v;
  }

  // ==========================================================
  // SDF Primitives & Smooth Min
  // ==========================================================
  float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / max(0.0001, k);
    return min(a, b) - h * h * k * 0.25;
  }

  float smax(float a, float b, float k) {
    return -smin(-a, -b, k);
  }

  mat2 rot2(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
  }

  float sdSphere(vec3 p, float r) {
    return length(p) - r;
  }

  float sdEllipsoid(vec3 p, vec3 r) {
    float k0 = length(p / r);
    float k1 = length(p / (r * r));
    return k0 * (k0 - 1.0) / max(0.0001, k1);
  }

  float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(0.0001, dot(ba, ba)), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }

  float sdRoundBox(vec3 p, vec3 b, float r) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
  }

  // 2D rounded 5-pointed star extruded cleanly along Z
  float sdStar5_2D(vec2 p, float r, float rf) {
    const vec2 k1 = vec2(0.809016994375, -0.587785252292);
    const vec2 k2 = vec2(-k1.x, k1.y);
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
  }

  // ==========================================================
  // SHAPE 0: EMBER — Plump Mochi Ghost (dome + 5 small feet + 2 arm nubs)
  // Matches Reference Images 2, 3, 4!
  // ==========================================================
  float sdMochi(vec3 p) {
    // Subtle alive breathing expansion
    vec3 bp = p / (1.0 + vec3(uBreath * 0.55, uBreath, uBreath * 0.55));

    // Plump soft mochi dome (wider at cheeks, gentle round crown)
    float dome = sdEllipsoid(bp - vec3(0.0, 0.06, 0.0), vec3(0.74, 0.72, 0.68));
    float baseCut = -(bp.y + 0.44);
    float body = smax(dome, baseCut, 0.24);

    // 5 small rounded ghost feet around bottom skirt, rippling dynamically & trailing behind velocity
    float feet = 1e5;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float ang = fi * 1.256637 + 0.32;
      float ripple = sin(uFootPhase + fi * 1.45) * uFootAmp;
      vec3 fpos = vec3(
        cos(ang) * 0.46 + uSkirtTrail.x * 0.42,
        -0.42 + ripple + uSkirtTrail.y * 0.22,
        sin(ang) * 0.40 + uSkirtTrail.z * 0.42
      );
      feet = smin(feet, sdSphere(bp - fpos, 0.21), 0.16);
    }
    float res = smin(body, feet, 0.22);

    // 2 cute rounded arm nubs sticking out left and right (wave right at 8.6s; extended reachL when uWaveLeft > 0.25!)
    float reachL = max(0.0, uWaveLeft - 0.25);
    vec3 leftTip = vec3(
      -0.78 - reachL * 0.62,
      -0.10 + min(uWaveLeft, 0.25) * 0.22 + reachL * 0.08,
      0.06 - reachL * 0.42
    );
    vec3 rightTip = vec3(0.78 + uWaveRight * 0.08, -0.10 + uWaveRight * 0.48, 0.08);
    float armL = sdCapsule(bp, vec3(-0.56, -0.12, 0.02), leftTip, 0.17);
    if (reachL > 0.01) {
      float pawL = sdSphere(bp - leftTip, 0.175 + reachL * 0.025);
      armL = smin(armL, pawL, 0.08);
    }
    float armR = sdCapsule(bp, vec3(0.56, -0.12, 0.02), rightTip, 0.17);
    res = smin(res, armL, 0.15);
    res = smin(res, armR, 0.15);

    return res;
  }

  // ==========================================================
  // SHAPE 1: LIGHT BULB (pear bulb + tapered neck + 3 screw rings)
  // ==========================================================
  float sdBulb(vec3 p) {
    float glass = sdSphere(p - vec3(0.0, 0.18, 0.0), 0.56);
    float neck = sdCapsule(p, vec3(0.0, 0.08, 0.0), vec3(0.0, -0.34, 0.0), 0.30);
    float d = smin(glass, neck, 0.28);
    // 3 ribbed screw base rings
    float r1 = sdCapsule(p, vec3(-0.08, -0.44, 0.0), vec3(0.08, -0.44, 0.0), 0.23);
    float r2 = sdCapsule(p, vec3(-0.06, -0.56, 0.0), vec3(0.06, -0.56, 0.0), 0.21);
    float tip = sdSphere(p - vec3(0.0, -0.68, 0.0), 0.13);
    d = smin(d, r1, 0.05);
    d = smin(d, r2, 0.05);
    d = smin(d, tip, 0.04);
    return d;
  }

  // ==========================================================
  // SHAPE 2: 5-POINT STAR (snaps round 72 deg a point at a time!)
  // ==========================================================
  float sdStar(vec3 p) {
    // Stepped crisp snap rotation (one point at a time every 0.35s)
    float stepIdx = floor(uActionTime / 0.35);
    float stepFrac = fract(uActionTime / 0.35);
    float snap = smoothstep(0.0, 0.28, stepFrac);
    float rotAng = (stepIdx + snap) * 1.256637 * 0.5;
    vec3 q = p;
    q.xy = rot2(rotAng) * q.xy;
    float d2 = sdStar5_2D(q.xy, 0.86, 0.47);
    vec2 w = vec2(d2, abs(q.z) - 0.19);
    return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.09;
  }

  // ==========================================================
  // SHAPE 3: EIGHTH MUSIC NOTE (tilted head + stem + curved flag)
  // ==========================================================
  float sdNote(vec3 p) {
    vec3 hp = p - vec3(-0.22, -0.34, 0.0);
    hp.xy = rot2(0.38) * hp.xy;
    float head = sdEllipsoid(hp, vec3(0.36, 0.26, 0.24));
    float stem = sdCapsule(p, vec3(0.06, -0.26, 0.0), vec3(0.06, 0.72, 0.0), 0.10);
    float flag1 = sdCapsule(p, vec3(0.06, 0.72, 0.0), vec3(0.56, 0.44, 0.0), 0.11);
    float flag2 = sdCapsule(p, vec3(0.56, 0.44, 0.0), vec3(0.50, 0.08, 0.0), 0.09);
    float d = smin(head, stem, 0.09);
    d = smin(d, flag1, 0.08);
    d = smin(d, flag2, 0.09);
    return d;
  }

  // ==========================================================
  // SHAPE 4: BEATING HEART (lub-dub double systolic beat!)
  // ==========================================================
  float sdHeart(vec3 p) {
    float beatCycle = fract(uActionTime * 1.35);
    float lub = exp(-pow((beatCycle - 0.12) / 0.07, 2.0)) * 0.11;
    float dub = exp(-pow((beatCycle - 0.30) / 0.08, 2.0)) * 0.075;
    vec3 q = p / (1.0 + lub + dub);
    // Volumetric smooth heart via twin tilted lobes + lower taper
    vec3 s = vec3(abs(q.x), q.y, q.z);
    float lobe = sdEllipsoid(s - vec3(0.28, 0.18, 0.0), vec3(0.42, 0.42, 0.38));
    vec3 tp = vec3(s.x, s.y + 0.12, s.z);
    tp.xy = rot2(-0.56) * tp.xy;
    float point = sdCapsule(tp, vec3(0.0, 0.18, 0.0), vec3(0.0, -0.58, 0.0), 0.26);
    return smin(lobe, point, 0.22);
  }

  // ==========================================================
  // SHAPE 5: RUBBER DUCK COAT + SLEEVE PEEL UPWARD (Images 8 & 17!)
  // ==========================================================
  float sdDuckCoat(vec3 p) {
    // Exact duck silhouette: plump body + head + flat bill + upturned tail
    float body = sdEllipsoid(p - vec3(0.0, -0.26, -0.04), vec3(0.58, 0.42, 0.64));
    float head = sdSphere(p - vec3(0.0, 0.32, 0.10), 0.40);
    float bill = sdEllipsoid(p - vec3(0.0, 0.24, 0.50), vec3(0.22, 0.11, 0.22));
    float tail = sdCapsule(p, vec3(0.0, -0.18, -0.45), vec3(0.0, 0.04, -0.74), 0.16);
    float duck = smin(body, head, 0.16);
    duck = smin(duck, bill, 0.06);
    duck = smin(duck, tail, 0.12);

    if (uPeel <= 0.005) return duck;

    // Sleeve peels UPWARD from bottom (-0.75 -> +0.85), bubbling through a liquid neck into Ember on top!
    float peelCutY = mix(-0.82, 0.92, smoothstep(0.0, 0.82, uPeel));
    // Wavy organic peel rim
    float rimWave = 0.06 * sin(atan(p.z, p.x) * 4.0 + uTime * 3.0);
    float coatTrim = smax(duck - 0.035, (peelCutY + rimWave) - p.y, 0.07);

    // Growing Ember mochi blob bubbling up on top as coat peels off!
    float topScale = smoothstep(0.10, 0.72, uPeel);
    float topY = mix(0.48, 1.15, smoothstep(0.12, 0.95, uPeel));
    vec3 blobP = (p - vec3(0.0, topY, 0.0)) / max(0.22, topScale * 0.92);
    float topBlob = sdMochi(blobP) * max(0.22, topScale * 0.92);

    // Pinching liquid neck connecting peeling sleeve to rising blob (pinches off at uPeel > 0.76)
    float neckThick = 0.20 * sin(clamp(uPeel / 0.80, 0.0, 1.0) * 3.14159);
    float neck = sdCapsule(p, vec3(0.0, peelCutY + 0.08, 0.02), vec3(0.0, topY - 0.22, 0.0), max(0.01, neckThick));

    float blended = smin(coatTrim, topBlob, mix(0.28, 0.02, smoothstep(0.68, 0.92, uPeel)));
    if (neckThick > 0.025) {
      blended = smin(blended, neck, 0.16);
    }
    return mix(blended, topBlob, smoothstep(0.84, 1.0, uPeel));
  }

  // ==========================================================
  // SHAPE 6: CAMCORDER / PROP SKIN COAT (Images 14, 15, 16!)
  // ==========================================================
  float sdCamcorderSkin(vec3 p) {
    // Thin glossy skin wrapping a boxy camcorder + lens + slow creeping organic lumps
    float lump = fbm2(p.xy * 2.4 + vec2(uTime * 0.55, -uTime * 0.42)) * 0.055;
    float camBody = sdRoundBox(p - vec3(0.0, -0.08, 0.0), vec3(0.56, 0.34, 0.44), 0.14) + lump;
    float lens = sdCapsule(p, vec3(0.0, -0.06, 0.35), vec3(0.0, -0.06, 0.62), 0.24) + lump * 0.6;
    float skin = smin(camBody, lens, 0.10);
    // Solid protruding eye dome sitting on top of the outline + cute protruding finger nubs!
    float eyeDome = sdSphere(p - vec3(0.0, 0.44, 0.16), 0.28);
    float fingerL = sdSphere(p - vec3(-0.62, 0.26 + sin(uTime * 3.1) * 0.06, 0.14), 0.14);
    float fingerR = sdSphere(p - vec3(0.62, 0.24 + cos(uTime * 2.8) * 0.06, 0.14), 0.14);
    skin = smin(skin, eyeDome, 0.09);
    skin = smin(skin, fingerL, 0.06);
    skin = smin(skin, fingerR, 0.06);
    return skin;
  }

  // ==========================================================
  // SHAPE 7: SCULPTED CHALKBOARD FELT DUSTER (Shot 16 Apple Erase!)
  // Ergonomic curved grip handle on top + plush corduroy-grooved felt eraser pad on bottom
  // ==========================================================
  float sdDuster(vec3 p) {
    // Subtle springy scrub shear along X as Ember scrubs back and forth!
    vec3 q = p;
    q.x += sin(uActionTime * 15.0) * 0.045 * clamp(-q.y + 0.15, 0.0, 0.6);

    // Top ergonomic chamfered handle block (where Ember's eyes perch cleanly on front +Z!)
    float handle = sdRoundBox(q - vec3(0.0, 0.16, 0.06), vec3(0.76, 0.20, 0.30), 0.10);
    // Subtle pinched finger-groove waist between handle and felt pad
    float neck = sdRoundBox(q - vec3(0.0, -0.05, 0.02), vec3(0.68, 0.10, 0.25), 0.07);
    // Thick plush bottom felt scrubbing pad with subtle corduroy wiping ribs along bottom face
    float feltRibs = sin(q.x * 24.0) * 0.016 * smoothstep(-0.14, -0.34, q.y);
    float feltPad = sdRoundBox(q - vec3(0.0, -0.24, -0.04), vec3(0.86, 0.18, 0.36), 0.08) + feltRibs;
    // Slight domed crown crest along top center of the wooden grip
    float gripCrest = sdCapsule(q, vec3(-0.46, 0.34, 0.06), vec3(0.46, 0.34, 0.06), 0.10);

    float d = smin(handle, neck, 0.08);
    d = smin(d, feltPad, 0.09);
    d = smin(d, gripCrest, 0.12);
    return d;
  }

  // ==========================================================
  // SHAPE 8: SCULPTED CLASSROOM CHALK STICK (Shot 23 Teacher Board Heart!)
  // Smooth tapered chalk cylinder + subtle paper sleeve collar + writing tip
  // ==========================================================
  float sdChalk(vec3 p) {
    vec3 q = p;
    // Slight playful writing slant when tracing across the smartboard
    q.xy = rot2(0.18) * q.xy;
    // Main chalk stick cylinder body
    float stick = sdCapsule(q, vec3(0.0, -0.58, 0.0), vec3(0.0, 0.64, 0.0), 0.24);
    // Tapered dusty chalk writing tip at bottom (-Y)
    float tip = sdCapsule(q, vec3(0.0, -0.56, 0.0), vec3(0.0, -0.84, 0.0), 0.14);
    // Crisp paper wrapper band around mid-shaft
    float band = sdRoundBox(q - vec3(0.0, 0.14, 0.0), vec3(0.22, 0.24, 0.22), 0.08);
    float d = smin(stick, tip, 0.08);
    d = smin(d, band, 0.06);
    return d;
  }

  // ==========================================================
  // SHAPE 9: SCULPTED SMARTPHONE SLAB (Shot 25 Ember Phone Morph!)
  // Rounded flagship smartphone silhouette + camera bump + side power button
  // ==========================================================
  float sdPhone(vec3 p) {
    vec3 q = p;
    float body = sdRoundBox(q, vec3(0.40, 0.78, 0.095), 0.095);
    // Subtle sleek screen bezel groove & Dynamic Island notch on front (+Z) so phone silhouette reads instantly!
    float screenRecess = sdRoundBox(q - vec3(0.0, 0.0, 0.185), vec3(0.35, 0.71, 0.032), 0.055);
    body = smax(body, -screenRecess, 0.025);
    float camBump = sdRoundBox(q - vec3(-0.18, 0.48, -0.10), vec3(0.14, 0.18, 0.045), 0.04);
    float powerBtn = sdRoundBox(q - vec3(0.49, 0.22, 0.0), vec3(0.03, 0.14, 0.035), 0.015);
    float volUp = sdRoundBox(q - vec3(-0.49, 0.32, 0.0), vec3(0.026, 0.11, 0.032), 0.012);
    float volDn = sdRoundBox(q - vec3(-0.49, 0.12, 0.0), vec3(0.026, 0.11, 0.032), 0.012);
    float d = smin(body, camBump, 0.04);
    d = smin(d, powerBtn, 0.03);
    d = smin(d, volUp, 0.025);
    d = smin(d, volDn, 0.025);
    return d;
  }

  // ==========================================================
  // SHAPE 10: SCULPTED WIDESCREEN DESKTOP MONITOR (Shot 30!)
  // Rounded 16:9 display housing + recessed screen bezel + sculpted stand neck + flat base foot
  // ==========================================================
  float sdMonitor(vec3 p) {
    vec3 q = p;
    // Main widescreen display panel sitting slightly elevated above center
    float panel = sdRoundBox(q - vec3(0.0, 0.24, 0.0), vec3(0.88, 0.50, 0.10), 0.085);
    // Recessed screen face on front (+Z) so bezel lip reads crisply!
    float screenRecess = sdRoundBox(q - vec3(0.0, 0.25, 0.185), vec3(0.79, 0.41, 0.045), 0.04);
    panel = smax(panel, -screenRecess, 0.028);
    // Subtle top webcam bump
    float camDot = sdSphere(q - vec3(0.0, 0.78, 0.04), 0.06);
    // Tapered central monitor stand neck descending cleanly from panel rear-bottom
    float neck = sdCapsule(q, vec3(0.0, -0.18, -0.05), vec3(0.0, -0.62, -0.09), 0.11);
    // Sleek flat desktop base plate
    float baseFoot = sdRoundBox(q - vec3(0.0, -0.68, 0.0), vec3(0.46, 0.055, 0.24), 0.045);

    float d = smin(panel, camDot, 0.035);
    d = smin(d, neck, 0.06);
    d = smin(d, baseFoot, 0.055);
    return d;
  }

  // ==========================================================
  // SHAPE 11: SCULPTED FLY SWATTER (Shot 31 Swamp Mosquitoes!)
  // Wide rounded grid-textured swatter paddle on top + ergonomic handle below (eyes sit on the handle!)
  // ==========================================================
  float sdSwatter(vec3 p) {
    vec3 q = p;
    // Wide flat mesh paddle on upper half (+Y) with subtle waffle grid relief
    float gridRib = (sin(q.x * 26.0) * sin(q.y * 26.0)) * 0.016 * smoothstep(0.05, 0.25, q.y);
    float paddle = sdRoundBox(q - vec3(0.0, 0.42, 0.0), vec3(0.56, 0.46, 0.048), 0.055) + gridRib;
    // Reinforced perimeter paddle rim
    float rimOuter = sdRoundBox(q - vec3(0.0, 0.42, 0.0), vec3(0.58, 0.48, 0.062), 0.065);
    float rimHole = sdRoundBox(q - vec3(0.0, 0.42, 0.0), vec3(0.47, 0.37, 0.14), 0.04);
    float rim = smax(rimOuter, -rimHole, 0.02);
    // Tapered neck connecting paddle down into chunky ergonomic handle (where Ember's eyes live!)
    float neck = sdCapsule(q, vec3(0.0, -0.02, 0.0), vec3(0.0, -0.24, 0.0), 0.095);
    float handle = sdCapsule(q, vec3(0.0, -0.22, 0.0), vec3(0.0, -0.84, 0.0), 0.175);
    // Cute little hang-loop nub at bottom of handle
    float pommel = sdSphere(q - vec3(0.0, -0.90, 0.0), 0.13);

    float d = min(paddle, rim);
    d = smin(d, neck, 0.06);
    d = smin(d, handle, 0.07);
    d = smin(d, pommel, 0.04);
    return d;
  }

  // ==========================================================
  // SHAPE 12: SCULPTED BASEBALL BAT (Shot 38 Angry Camera Smash!)
  // Thick rounded slugger barrel tapering down to slender grip & round knob
  // ==========================================================
  float sdBat(vec3 p) {
    vec3 q = p;
    // Thick upper barrel (+Y)
    float barrel = sdCapsule(q, vec3(0.0, 0.18, 0.0), vec3(0.0, 0.86, 0.0), 0.24);
    // Smooth mid taper
    float mid = sdCapsule(q, vec3(0.0, -0.22, 0.0), vec3(0.0, 0.28, 0.0), 0.17);
    // Slender taped grip handle (-Y)
    float grip = sdCapsule(q, vec3(0.0, -0.82, 0.0), vec3(0.0, -0.18, 0.0), 0.11);
    // Classic flared baseball bat knob at bottom
    float knob = sdSphere(q - vec3(0.0, -0.88, 0.0), 0.165);

    float d = smin(barrel, mid, 0.12);
    d = smin(d, grip, 0.10);
    d = smin(d, knob, 0.05);
    return d;
  }

  float evalShape(int id, vec3 p) {
    if (id == 0) return sdMochi(p);
    if (id == 1) return sdBulb(p);
    if (id == 2) return sdStar(p);
    if (id == 3) return sdNote(p);
    if (id == 4) return sdHeart(p);
    if (id == 5) return sdDuckCoat(p);
    if (id == 6) return sdCamcorderSkin(p);
    if (id == 7) return sdDuster(p);
    if (id == 8) return sdChalk(p);
    if (id == 9) return sdPhone(p);
    if (id == 10) return sdMonitor(p);
    if (id == 11) return sdSwatter(p);
    return sdBat(p);
  }

  // Transform world point into Ember's local space (rotation + spring squash/stretch)
  vec3 toLocal(vec3 wp) {
    vec3 p = wp - uCenter;
    p.xz = rot2(-uYaw) * p.xz;
    p.xy = rot2(-uRoll) * p.xy;
    p.yz = rot2(-uPitch) * p.yz;
    return p / max(vec3(0.35), uSquash);
  }

  // Distance + smear weight (returns vec2(distance, smearFactor 0=body, 1=tail))
  vec2 mapEmber(vec3 wp) {
    vec3 lp = toLocal(wp);
    float dA = evalShape(uShapeFrom, lp);
    float dB = evalShape(uShapeTo, lp);
    float dBody = mix(dA, dB, clamp(uMorph, 0.0, 1.0)) * min(uSquash.x, min(uSquash.y, uSquash.z));

    float d = dBody;
    float smearWeight = 0.0;

    // Curved 2D smear trail swept back along Ember's real curved path (Image 5!)
    if (uSmear > 0.02) {
      float s0 = sdCapsule(wp, uCenter, uTrail0, 0.56 * uSmear);
      float s1 = sdCapsule(wp, uTrail0, uTrail1, 0.44 * uSmear);
      float s2 = sdCapsule(wp, uTrail1, uTrail2, 0.32 * uSmear);
      float s3 = sdCapsule(wp, uTrail2, uTrail3, 0.21 * uSmear);
      float s4 = sdCapsule(wp, uTrail3, uTrail4, 0.11 * uSmear);
      float dTrail = smin(smin(smin(s0, s1, 0.16), s2, 0.14), smin(s3, s4, 0.12), 0.12);
      if (dTrail < dBody) {
        float distFromCenter = length(wp - uCenter);
        smearWeight = clamp((distFromCenter - 0.45) / 1.4, 0.0, 1.0) * uSmear;
      }
      d = smin(dBody, dTrail, 0.22);
    }

    // Exact 2D surface slice clipping plane (only what is in front of glass shows!)
    if (uClipEnabled > 0.5) {
      float planeDist = -dot(wp - uClipPoint, normalize(uClipNormal));
      d = max(d, planeDist);
    }

    return vec2(d, smearWeight);
  }

  vec3 calcNormal(vec3 p) {
    vec2 e = vec2(0.0035, 0.0);
    return normalize(vec3(
      mapEmber(p + e.xyy).x - mapEmber(p - e.xyy).x,
      mapEmber(p + e.yxy).x - mapEmber(p - e.yxy).x,
      mapEmber(p + e.yyx).x - mapEmber(p - e.yyx).x
    ));
  }

  // Evaluate analytic Eyes A (jet-black vertical oval + 2 crisp white catchlights, or happy curved wink arc!)
  // Returns vec4(rgb, mask)
  vec4 evalEye(vec3 lp, vec3 eyeCenter, vec2 stretch, float blink, float squint, float isWink) {
    // Only render on front-facing hemisphere
    if (lp.z < eyeCenter.z - 0.48) return vec4(0.0);

    vec2 d = (lp.xy - eyeCenter.xy);
    vec3 col = vec3(0.055, 0.032, 0.025);

    // Peaceful sleeping closed eye: pure curved comic outline arc (◡), no filled oval or catchlights!
    if (blink > 1.15) {
      vec2 ap = d - vec2(0.0, 0.048);
      ap.x = abs(ap.x);
      ap.y = -ap.y;
      vec2 sc = vec2(0.78, 0.625);
      float arcR = 0.118;
      float arcThick = 0.023;
      float arcD = (sc.y * ap.x > sc.x * ap.y)
        ? length(ap - sc * arcR)
        : abs(length(ap) - arcR);
      float sleepMask = 1.0 - smoothstep(arcThick - 0.005, arcThick + 0.005, arcD);
      if (sleepMask <= 0.001) return vec4(0.0);
      return vec4(col, sleepMask);
    }

    // Expressive happy curved wink arch (⌒) when one eye is winking shut!
    if (isWink > 0.5 && blink > 0.65) {
      vec2 ap = d - vec2(0.0, -0.050);
      ap.x = abs(ap.x);
      vec2 sc = vec2(0.78, 0.625); // ~51 deg half-span -> crisp smiling wink curve!
      float arcR = 0.118;
      float arcThick = 0.024;
      float arcD = (sc.y * ap.x > sc.x * ap.y)
        ? length(ap - sc * arcR)
        : abs(length(ap) - arcR);
      float winkMask = 1.0 - smoothstep(arcThick - 0.005, arcThick + 0.005, arcD);
      if (winkMask <= 0.001) return vec4(0.0);
      return vec4(col, winkMask);
    }

    // Vertical radius shrinks cleanly during blink & squint, elongates during morph zip!
    float rx = 0.095 * stretch.x * (1.0 + squint * 0.22);
    float ry = max(0.011, 0.165 * stretch.y * (1.0 - blink * 0.93) * (1.0 - squint * 0.62));
    vec2 q = vec2(d.x / rx, d.y / ry);
    float dist = length(q);
    float mask = 1.0 - smoothstep(0.92, 1.05, dist);
    if (mask <= 0.001) return vec4(0.0);

    // Two crisp white glossy catchlights (hidden when eyes are closed into blink slits)
    float openFactor = 1.0 - smoothstep(0.55, 0.88, blink);
    if (openFactor > 0.01) {
      // Main larger upper-left oval catchlight (matches Images 2, 3, 4!)
      vec2 hl1 = (q - vec2(-0.28 + uEyeGlance.x * 2.5, 0.30 + uEyeGlance.y * 2.5)) / vec2(0.32, 0.36);
      float c1 = 1.0 - smoothstep(0.82, 1.02, length(hl1));
      // Secondary tiny lower-right pinpoint catchlight
      vec2 hl2 = (q - vec2(0.24 + uEyeGlance.x * 2.0, -0.34 + uEyeGlance.y * 2.0)) / vec2(0.16, 0.18);
      float c2 = 1.0 - smoothstep(0.78, 1.02, length(hl2));
      col = mix(col, vec3(1.0, 0.99, 0.96), clamp(c1 + c2, 0.0, 1.0) * openFactor);
    }

    return vec4(col, mask);
  }

  void main() {
    if (uOpacity <= 0.005) discard;

    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorldPos - cameraPosition);

    // Tight analytic bounding-sphere early-out (0 raymarch steps on empty background pixels!)
    float maxS = max(uSquash.x, max(uSquash.y, uSquash.z));
    vec3 bCenter = uCenter + vec3(0.0, uPeel > 0.05 ? 0.45 * maxS : 0.05 * maxS, 0.0);
    float bRad = (uSmear > 0.02 ? 3.6 : (uPeel > 0.05 ? 2.4 : (uWaveLeft > 0.30 ? 2.05 : 1.55))) * maxS;
    vec3 oc = ro - bCenter;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - bRad * bRad;
    float disc = b * b - c;
    if (disc < 0.0) discard;
    float sq = sqrt(disc);
    float t = max(0.0, -b - sq);
    float tMax = -b + sq;
    if (tMax < 0.0) discard;

    bool hit = false;
    float smearWeight = 0.0;
    vec3 hitPos = ro;

    // 48 high-precision steps starting right at the bounding sphere entry!
    for (int i = 0; i < 48; i++) {
      vec3 p = ro + rd * t;
      vec2 res = mapEmber(p);
      if (res.x < 0.0035) {
        hit = true;
        hitPos = p;
        smearWeight = res.y;
        break;
      }
      t += max(res.x * 0.9, 0.014);
      if (t > tMax) break;
    }

    if (!hit) discard;

    vec3 N = calcNormal(hitPos);
    vec3 V = -rd;
    // Side-top-left key light so the diagonal cel split cuts right across Ember's cheeks (Images 2, 3, 4!)
    vec3 L = normalize(vec3(-0.78, 0.56, 0.26));
    float ndl = dot(N, L);
    float fresnel = 1.0 - max(0.0, dot(N, V));

    // ==========================================================
    // TWO-TONE GLOSSY ORANGE MOCHI TOON LOOK (Images 2, 3, 4!)
    // ==========================================================
    // Crisp curved cel split (~48% butter-apricot highlight, ~52% vibrant coral-tangerine shadow)
    float celLit = smoothstep(0.14, 0.23, ndl);
    vec3 litBase = mix(vec3(1.0, 0.855, 0.595), vec3(1.0, 0.825, 0.915), uLumiPink);      // Butter-apricot (Ember) or Bubblegum-cream (Lumi)
    vec3 shadowBase = mix(vec3(0.935, 0.485, 0.275), vec3(0.955, 0.435, 0.685), uLumiPink); // Coral-tangerine or Strawberry-rose
    vec3 deepRim = mix(vec3(0.84, 0.36, 0.18), vec3(0.78, 0.22, 0.48), uLumiPink);

    // Bulb glow brightens smoothly to luminous warm cream-white when lit!
    if (uBulbLit > 0.01) {
      litBase = mix(litBase, vec3(1.0, 0.985, 0.91), uBulbLit * 0.88);
      shadowBase = mix(shadowBase, vec3(0.99, 0.89, 0.66), uBulbLit * 0.78);
    }

    // Chalk morph shifts smoothly to warm creamy chalk-peach while keeping Ember's orange soul!
    float chalkMix = (uShapeTo == 8 ? clamp(uMorph, 0.0, 1.0) : 0.0)
      + (uShapeFrom == 8 ? (1.0 - clamp(uMorph, 0.0, 1.0)) : 0.0);
    if (chalkMix > 0.01) {
      float cm = clamp(chalkMix, 0.0, 1.0);
      litBase = mix(litBase, vec3(1.0, 0.955, 0.875), cm * 0.72);
      shadowBase = mix(shadowBase, vec3(0.98, 0.72, 0.56), cm * 0.62);
    }

    // Phone morph adds a subtle glossy amber-titanium screen sheen while staying unmistakably Ember!
    float phoneMix = (uShapeTo == 9 ? clamp(uMorph, 0.0, 1.0) : 0.0)
      + (uShapeFrom == 9 ? (1.0 - clamp(uMorph, 0.0, 1.0)) : 0.0);
    if (phoneMix > 0.01) {
      float pm = clamp(phoneMix, 0.0, 1.0);
      litBase = mix(litBase, vec3(1.0, 0.82, 0.50), pm * 0.45);
      shadowBase = mix(shadowBase, vec3(0.86, 0.38, 0.22), pm * 0.45);
    }

    // Monitor morph adds a subtle warm-amber luminous screen highlight while keeping Ember's orange soul!
    float monMix = (uShapeTo == 10 ? clamp(uMorph, 0.0, 1.0) : 0.0)
      + (uShapeFrom == 10 ? (1.0 - clamp(uMorph, 0.0, 1.0)) : 0.0);
    if (monMix > 0.01) {
      float mm = clamp(monMix, 0.0, 1.0);
      litBase = mix(litBase, vec3(1.0, 0.89, 0.64), mm * 0.42);
      shadowBase = mix(shadowBase, vec3(0.90, 0.43, 0.24), mm * 0.42);
    }

    // RUNNING GAG: Ember glows intensely when scared (and that glow IS the spark at 02:53!)
    if (uScaredGlow > 0.01) {
      float sg = clamp(uScaredGlow, 0.0, 1.0);
      litBase = mix(litBase, vec3(1.0, 0.995, 0.92), sg * 0.92);
      shadowBase = mix(shadowBase, vec3(1.0, 0.86, 0.52), sg * 0.85);
    }

    vec3 baseCol = mix(shadowBase, litBase, celLit);

    // ==========================================================
    // ORGANIC FLOWING HALFTONE DOTS (Reference Image 4!)
    // Bold, crisp round dots carried & gently bent by a slowly turning fluid current;
    // dot size comes from a smooth evolving field so it never repeats & never pixelates!
    // ==========================================================
    float scale4k = max(0.5, uResolution.y / 1080.0);
    vec2 screenP = gl_FragCoord.xy / (36.0 * scale4k);

    // Gentle low-frequency fluid current bends the dot rows smoothly while keeping every dot round!
    float swirlAng = 0.36 + fbm2(screenP * 0.08 + vec2(uTime * 0.08, -uTime * 0.06)) * 0.42;
    vec2 flowUv = rot2(swirlAng) * screenP;
    vec2 gentleDrift = vec2(
      fbm2(screenP * 0.12 + vec2(uTime * 0.12, 3.1)),
      fbm2(screenP * 0.12 + vec2(-2.4, -uTime * 0.10))
    ) * 0.55;
    vec2 warped = flowUv + gentleDrift;

    vec2 cellId = floor(warped);
    vec2 cell = fract(warped) - 0.5;
    float dotDist = length(cell);

    // Smooth evolving per-dot size field (never repeats, zero grid pixelation!)
    float sizeField = fbm2(cellId * 0.22 + vec2(-uTime * 0.18, uTime * 0.14)) * 0.5 + 0.5;
    // Larger generous dots in lit crown & cheeks, delicately tapering smaller into lower shadow
    float toneSize = mix(0.11, 0.39, clamp(ndl * 0.58 + 0.56, 0.0, 1.0));
    float dotRadius = clamp(toneSize * (0.64 + sizeField * 0.72), 0.05, 0.43);
    float dotAA = max(0.03, 0.055 / scale4k);
    float dotMask = 1.0 - smoothstep(dotRadius - dotAA, dotRadius + dotAA, dotDist);

    // Light creamy dots where lit, warm apricot-peach (or blush-pink for Lumi) dots in shadow
    vec3 litDotCol = mix(vec3(1.0, 0.96, 0.84), vec3(1.0, 0.94, 0.975), uLumiPink);
    vec3 shadowDotCol = mix(vec3(1.0, 0.80, 0.61), vec3(1.0, 0.72, 0.86), uLumiPink);
    vec3 dotCol = mix(shadowDotCol, litDotCol, celLit);
    vec3 col = mix(baseCol, dotCol, dotMask * 0.86);

    // Crisp glossy white jelly-bean specular pill on top-left crown (exact Images 2, 3, 4!)
    vec3 Lspec = normalize(vec3(-0.62, 0.66, 0.42));
    vec3 H = normalize(Lspec + V);
    float spec = smoothstep(0.964, 0.976, dot(N, H));
    col = mix(col, vec3(1.0, 0.995, 0.98), spec * 0.94);

    // Subtle warm peach (or rose-blush) inner rim highlight right inside the ink outline
    float innerRim = smoothstep(0.58, 0.78, fresnel) * (1.0 - smoothstep(0.78, 0.90, fresnel));
    vec3 rimTint = mix(vec3(1.0, 0.91, 0.76), vec3(1.0, 0.88, 0.96), uLumiPink);
    col = mix(col, mix(rimTint, vec3(1.0, 0.99, 0.88), uScaredGlow), innerRim * (0.48 + uScaredGlow * 0.48));

    // Crisp hand-drawn dark-espresso (or berry-plum for Lumi) cartoon outline with subtle 12fps line boil
    float boil12 = gnoise2(hitPos.xy * 5.2 + vec2(floor(uTime * 12.0) * 1.9, -floor(uTime * 12.0) * 1.3)) * 0.038;
    float outline = smoothstep(0.76 + boil12, 0.88 + boil12, fresnel);
    vec3 baseOutlineCol = mix(vec3(0.22, 0.09, 0.06), vec3(0.28, 0.06, 0.16), uLumiPink);
    vec3 outlineCol = mix(baseOutlineCol, vec3(1.0, 0.82, 0.42), uScaredGlow * 0.65);
    col = mix(col, outlineCol, outline * 0.96);

    // Warm slice highlight right where Ember cuts through a 2D glass plane
    if (uClipEnabled > 0.5) {
      float sliceDist = abs(dot(hitPos - uClipPoint, normalize(uClipNormal)));
      float seamGlow = 1.0 - smoothstep(0.0, 0.055, sliceDist);
      col = mix(col, vec3(1.0, 0.92, 0.76), seamGlow * 0.75);
    }

    // ==========================================================
    // ANALYTIC EYES A (two jet-black ovals + twin white catchlights)
    // ==========================================================
    vec3 lp = toLocal(hitPos);
    // Offset eyes upward smoothly with rising Ember blob during sleeve peel!
    vec3 peelShift = vec3(0.0, uPeel > 0.1 ? mix(0.0, 0.72, smoothstep(0.12, 0.92, uPeel)) : 0.0, 0.0);
    float isWink = abs(uEyeBlink.x - uEyeBlink.y) > 0.45 ? 1.0 : 0.0;
    vec4 eL = evalEye(lp - peelShift, uLeftEyePos, uLeftEyeStretch, uEyeBlink.x, uEyeSquint, isWink);
    vec4 eR = evalEye(lp - peelShift, uRightEyePos, uRightEyeStretch, uEyeBlink.y, uEyeSquint, isWink);
    float eyeMask = max(eL.a, eR.a);
    if (eyeMask > 0.001) {
      vec3 eyeCol = eL.a >= eR.a ? eL.rgb : eR.rgb;
      col = mix(col, eyeCol, eyeMask);
    }

    // ==========================================================
    // ALPHA: Opaque Toon vs Translucent Skin Coat vs Smear Fade
    // ==========================================================
    float alpha = uOpacity;

    // Translucent glossy skin coating (Images 14, 15, 16!):
    // Solid at Fresnel edges, solid on top eye dome & protruding fingers, see-through over interior!
    if (uSkinMode > 0.01) {
      float solidTopDome = smoothstep(0.24, 0.36, lp.y);
      float solidSideNubs = smoothstep(0.54, 0.62, abs(lp.x));
      float solidRim = smoothstep(0.42, 0.76, fresnel);
      float skinAlpha = max(max(solidRim, max(solidTopDome, solidSideNubs)), max(eyeMask, 0.18));
      alpha *= mix(1.0, skinAlpha, uSkinMode);
    }

    // Smear tail fades gracefully toward the rear tip (Image 5!)
    if (smearWeight > 0.01) {
      alpha *= mix(1.0, 0.24, smearWeight);
      col = mix(col, deepRim, smearWeight * 0.25);
    }

    // Exact raymarched 3D clip-space depth so Ember cleanly occludes with solid Duck, Camcorder, Screen & Music Video worlds!
    vec4 clipPos = uViewProj * vec4(hitPos, 1.0);
    float ndcDepth = clipPos.z / max(0.0001, clipPos.w);
    gl_FragDepth = clamp(ndcDepth * 0.5 + 0.5, 0.0, 0.99999);

    fragColor = vec4(col, alpha);
  }
`;

export function createEmberShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: EMBER_VERT,
    fragmentShader: EMBER_FRAG,
    transparent: true,
    depthWrite: true,
    side: THREE.BackSide, // Render back-faces of bounding volume so camera can zoom right inside!
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(3840, 2160) },
      uViewProj: { value: new THREE.Matrix4() },
      uCenter: { value: new THREE.Vector3(0, 0, 0) },
      uSquash: { value: new THREE.Vector3(1, 1, 1) },
      uYaw: { value: 0 },
      uPitch: { value: 0 },
      uRoll: { value: 0 },
      uSkirtTrail: { value: new THREE.Vector3(0, 0, 0) },
      uFootPhase: { value: 0 },
      uFootAmp: { value: 0.05 },
      uBreath: { value: 0 },
      uWaveLeft: { value: 0 },
      uWaveRight: { value: 0 },
      uShapeFrom: { value: 0 },
      uShapeTo: { value: 0 },
      uMorph: { value: 0 },
      uActionTime: { value: 0 },
      uBulbLit: { value: 0 },
      uScaredGlow: { value: 0 },
      uLumiPink: { value: 0 },
      uPeel: { value: 0 },
      uSkinMode: { value: 0 },
      uTrail0: { value: new THREE.Vector3(0, 0, 0) },
      uTrail1: { value: new THREE.Vector3(0, 0, 0) },
      uTrail2: { value: new THREE.Vector3(0, 0, 0) },
      uTrail3: { value: new THREE.Vector3(0, 0, 0) },
      uTrail4: { value: new THREE.Vector3(0, 0, 0) },
      uSmear: { value: 0 },
      uClipEnabled: { value: 0 },
      uClipPoint: { value: new THREE.Vector3(0, 0, -1.65) },
      uClipNormal: { value: new THREE.Vector3(0, 0, 1) },
      uLeftEyePos: { value: new THREE.Vector3(-0.24, 0.04, 0.68) },
      uRightEyePos: { value: new THREE.Vector3(0.24, 0.04, 0.68) },
      uLeftEyeStretch: { value: new THREE.Vector2(1, 1) },
      uRightEyeStretch: { value: new THREE.Vector2(1, 1) },
      uEyeBlink: { value: new THREE.Vector2(0, 0) },
      uEyeSquint: { value: 0 },
      uEyeGlance: { value: new THREE.Vector2(0, 0) },
      uOpacity: { value: 1 },
    },
  });
}

// =========================================================================
// 2D SCREEN SURFACE PORTAL SHADER (Flat 2D Ember Drawing + Glass Ripples)
// Matches Reference Images 7, 9, 10, 11, 12!
// =========================================================================
const PORTAL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PORTAL_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform float uTime;
  uniform float uRippleTime;
  uniform vec2 uRippleOrigin;
  uniform float uFlatOpacity;
  uniform vec2 uFlatPos;
  uniform vec2 uFlatSquash;
  uniform float uGlowBoost;

  float sdCircle(vec2 p, float r) { return length(p) - r; }

  void main() {
    // Muted dark charcoal 2D glass viewport surface (unmuted Ember pops warmly against it!)
    vec2 p = (vUv - 0.5) * vec2(2.0, 1.25);
    vec3 col = vec3(0.11, 0.125, 0.15);

    // Subtle viewport grid lines (muted grey)
    vec2 g = abs(fract(vUv * vec2(16.0, 10.0) - 0.5) - 0.5) / fwidth(vUv * vec2(16.0, 10.0));
    float gridLine = 1.0 - min(min(g.x, g.y), 1.0);
    col += vec3(0.03) * gridLine;

    // Warm unmuted orange aura glow cast on the glass where Ember crosses!
    float dOrig = length(p - uRippleOrigin * 0.25);
    col += vec3(0.95, 0.48, 0.20) * exp(-dOrig * 3.8) * (0.28 + uGlowBoost * 0.45);

    // Expanding concentric orange glass ripples when Ember pushes out or dives back in!
    if (uRippleTime >= 0.0 && uRippleTime < 3.2) {
      for (int i = 0; i < 3; i++) {
        float age = uRippleTime - float(i) * 0.24;
        if (age > 0.0) {
          float rad = age * 0.65;
          float ring = exp(-pow((dOrig - rad) / 0.022, 2.0)) * exp(-age * 1.45);
          col += vec3(1.0, 0.68, 0.34) * ring * 0.9;
        }
      }
    }

    // Flat 2D drawing of Ember living inside the surface (same two-tone orange-cream + Eyes A!)
    if (uFlatOpacity > 0.01) {
      vec2 fp = (p - uFlatPos * 0.25) / max(vec2(0.4), uFlatSquash * 0.32);
      float dome = length(fp * vec2(1.0, 1.05)) - 0.72;
      float cut = -(fp.y + 0.44);
      float body = max(dome, cut);
      // 4 cute flat skirt feet
      for (int i = 0; i < 4; i++) {
        float fx = -0.45 + float(i) * 0.30;
        body = min(body, sdCircle(fp - vec2(fx, -0.42 + sin(uTime * 5.0 + float(i)) * 0.04), 0.18));
      }
      float fill = 1.0 - smoothstep(-0.02, 0.02, body);
      float outline = smoothstep(-0.05, -0.01, body) * fill;
      if (fill > 0.01) {
        // Curved diagonal two-tone cel split + subtle organic halftone dots matching 3D Ember!
        float splitEdge = fp.x - fp.y * 0.42 + sin(fp.y * 4.5 + uTime) * 0.04;
        float cel = 1.0 - smoothstep(-0.04, 0.04, splitEdge);
        vec3 flatCol = mix(vec3(0.935, 0.485, 0.275), vec3(1.0, 0.855, 0.595), cel);
        vec2 dotCell = fract(fp * 5.8 + vec2(sin(fp.y * 2.4 + uTime * 0.6) * 0.18, cos(fp.x * 2.4) * 0.18)) - 0.5;
        float dotM = 1.0 - smoothstep(0.18, 0.26, length(dotCell));
        flatCol = mix(flatCol, mix(vec3(1.0, 0.78, 0.57), vec3(1.0, 0.95, 0.80), cel), dotM * 0.62);
        // Glossy jelly-bean specular pill
        vec2 spP = fp - vec2(-0.36, 0.34);
        spP = mat2(0.82, -0.57, 0.57, 0.82) * spP;
        float sp = 1.0 - smoothstep(0.11, 0.145, length(spP * vec2(1.4, 0.85)));
        flatCol = mix(flatCol, vec3(1.0, 0.99, 0.96), sp * 0.94);
        // Eyes A with twin crisp white catchlights
        vec2 qL = (fp - vec2(-0.22, 0.04)) / vec2(0.095, 0.155);
        vec2 qR = (fp - vec2(0.22, 0.04)) / vec2(0.095, 0.155);
        float eL = 1.0 - smoothstep(0.90, 1.05, length(qL));
        float eR = 1.0 - smoothstep(0.90, 1.05, length(qR));
        float eyeM = max(eL, eR);
        if (eyeM > 0.01) {
          vec2 q = eL >= eR ? qL : qR;
          vec3 eCol = vec3(0.055, 0.032, 0.025);
          float c1 = 1.0 - smoothstep(0.80, 1.02, length((q - vec2(-0.28, 0.30)) / vec2(0.34, 0.38)));
          float c2 = 1.0 - smoothstep(0.78, 1.02, length((q - vec2(0.24, -0.34)) / vec2(0.17, 0.19)));
          eCol = mix(eCol, vec3(1.0, 0.99, 0.96), clamp(c1 + c2, 0.0, 1.0));
          flatCol = mix(flatCol, eCol, eyeM);
        }
        flatCol = mix(flatCol, vec3(0.22, 0.09, 0.06), outline);
        col = mix(col, flatCol, fill * uFlatOpacity);
      }
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createScreenPortalMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PORTAL_VERT,
    fragmentShader: PORTAL_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uRippleTime: { value: -1 },
      uRippleOrigin: { value: new THREE.Vector2(0, 0) },
      uFlatOpacity: { value: 0 },
      uFlatPos: { value: new THREE.Vector2(0, 0) },
      uFlatSquash: { value: new THREE.Vector2(1, 1) },
      uGlowBoost: { value: 0.5 },
    },
  });
}
