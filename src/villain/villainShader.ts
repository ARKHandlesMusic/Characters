// Pure GLSL3 3D Raymarched Signed Distance Field (SDF) Shader for the VILLAIN
// Design specification:
// - Larger glossy obsidian-black sphere (beach-ball scale, ~1.55x Ember)
// - Crisp dark-red silhouette outline & subtle dark organic flowing halftone dots (same shader family as Ember)
// - Two expressive cartoony antennas (radar swing toward Ember <10m, periscope stretch, marker point, damped sproing!)
// - Intense red eyes with pale glints (deadpan serious predator gaze, slow dignified blinks)
// - Zero mouth until eating: the dark-red outline unzips like a jagged zipper seam into a deep maw!
// - Subtle dark-crimson curved smear trail on fast lunges + exact raymarched gl_FragDepth via uViewProj

import * as THREE from "three";

const VILLAIN_VERT = /* glsl */ `
  out vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const VILLAIN_FRAG = /* glsl */ `
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
  uniform float uBreath;

  // Two cartoony antennas (ONLY the antennas are cartoony!)
  uniform vec2 uAntennaDir;       // x = left/right radar swing, y = forward/back tilt toward target
  uniform float uAntennaStretch;  // 0 = normal, 1 = periscope tall stretch
  uniform float uAntennaSproing;  // cartoony spring oscillation amplitude (-1..1)
  uniform float uAntennaSpread;   // 0.25 normal, widens on surprise, snaps crisp on straighten

  // Unzipping red outline seam mouth (0 = completely seamless, 1 = unzipped wide to eat!)
  uniform float uMouthUnzip;
  uniform float uMouthChew;

  // Eyes (red eyes with pale glints, slow dignified blinks, serious predator eyelids)
  uniform float uBlink;           // 0 = open, 1 = closed
  uniform float uEyelidCalm;      // subtle composed upper lid (0.18 default dignified deadpan)
  uniform vec2 uEyeGlance;        // tracking Ember or the Croissant

  // Subtle dark-crimson curved smear trail on fast lunges
  uniform vec3 uTrail0;
  uniform vec3 uTrail1;
  uniform vec3 uTrail2;
  uniform vec3 uTrail3;
  uniform float uSmear;

  uniform float uOpacity;

  // ==========================================================
  // Smooth Quintic Gradient Noise (same family as Ember — zero pixelation!)
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
      p = m * p * 2.03 + vec2(13.7, 7.9);
      a *= 0.5;
    }
    return v;
  }

  mat2 rot2(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
  }

  float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / max(0.0001, k);
    return min(a, b) - h * h * k * 0.25;
  }

  float smax(float a, float b, float k) {
    return -smin(-a, -b, k);
  }

  float sdSphere(vec3 p, float r) {
    return length(p) - r;
  }

  float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(0.0001, dot(ba, ba)), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }

  // Transform world point into Villain's local space
  vec3 toLocal(vec3 wp) {
    vec3 p = wp - uCenter;
    p.xz = rot2(-uYaw) * p.xz;
    p.xy = rot2(-uRoll) * p.xy;
    p.yz = rot2(-uPitch) * p.yz;
    return p / max(vec3(0.35), uSquash);
  }

  // Evaluates a single curved springy antenna (base -> mid flex -> tip bobble)
  // Returns vec2(distance, tipFactor 0..1)
  vec2 evalAntenna(vec3 p, float sideSign) {
    float baseSpread = 0.28 + uAntennaSpread * 0.14;
    vec3 root = vec3(sideSign * baseSpread, 0.66, 0.05);

    // Height grows tall in periscope mode!
    float len = mix(0.62, 1.18, clamp(uAntennaStretch, 0.0, 1.0));
    // Cartoony sproing lateral bend + radar swing toward target (Ember or Croissant!)
    float sproingX = uAntennaSproing * (0.34 + 0.08 * sideSign);
    float sproingZ = abs(uAntennaSproing) * 0.16;

    vec3 mid = root + vec3(
      sideSign * (0.14 + uAntennaSpread * 0.10) + uAntennaDir.x * 0.28 + sproingX * 0.55,
      len * 0.52,
      uAntennaDir.y * 0.24 + sproingZ * 0.5
    );
    vec3 tip = root + vec3(
      sideSign * (0.20 + uAntennaSpread * 0.18) + uAntennaDir.x * 0.58 + sproingX,
      len,
      uAntennaDir.y * 0.48 + sproingZ
    );

    float stalk1 = sdCapsule(p, root, mid, 0.044);
    float stalk2 = sdCapsule(p, mid, tip, 0.036);
    float stalk = smin(stalk1, stalk2, 0.06);
    float bulb = sdSphere(p - tip, 0.095);
    float d = smin(stalk, bulb, 0.045);
    float isTip = smoothstep(0.11, 0.03, bulb);
    return vec2(d, isTip);
  }

  // Returns vec3(distance, matTag, smearWeight)
  // matTag: 0.0 = main black ball, 1.0 = antenna stalk, 2.0 = antenna red tip, 3.0 = unzipped inner maw
  vec3 mapVillain(vec3 wp) {
    vec3 lp = toLocal(wp);
    vec3 bp = lp / (1.0 + vec3(uBreath * 0.35, uBreath * 0.55, uBreath * 0.35));

    // Plump beach-ball black sphere (slightly fuller bottom poise)
    float ball = sdSphere(bp, 0.78);
    float matTag = 0.0;

    // Unzipping seam mouth: ZERO mouth until uMouthUnzip > 0.01!
    // When eating, the red outline unzips horizontally across the front lower hemisphere!
    if (uMouthUnzip > 0.015) {
      float unzip = clamp(uMouthUnzip, 0.0, 1.0);
      float mouthWidth = 0.54 * unzip;
      float mouthOpen = (0.26 * unzip) * (1.0 - uMouthChew * 0.45);
      // Carve interior hollow maw cleanly out of the front hemisphere
      vec3 mp = bp - vec3(0.0, -0.18, 0.56);
      // Slight downward grin curve at corners
      mp.y += (mp.x * mp.x) * 0.18;
      vec3 mawScale = vec3(max(0.05, mouthWidth), max(0.03, mouthOpen), 0.52);
      float mawCarve = (length(mp / mawScale) - 1.0) * min(mawScale.x, min(mawScale.y, mawScale.z));
      float carvedBall = smax(ball, -mawCarve, 0.035);
      if (carvedBall > ball + 0.002) {
        matTag = 3.0; // Inside the unzipped dark crimson maw!
      }
      ball = carvedBall;
    }

    // Two expressive antennas
    vec2 antL = evalAntenna(bp, -1.0);
    vec2 antR = evalAntenna(bp, 1.0);
    float dAnt = min(antL.x, antR.x);
    float antTip = max(antL.y, antR.y);

    float dBody = smin(ball, dAnt, 0.08);
    if (dAnt < ball - 0.015) {
      matTag = antTip > 0.45 ? 2.0 : 1.0;
    }

    float scaleMin = min(uSquash.x, min(uSquash.y, uSquash.z));
    float d = dBody * scaleMin;
    float smearWeight = 0.0;

    // Subtle dark-crimson smear trail ONLY on fast lunges (Ember's animation grammar!)
    if (uSmear > 0.03) {
      float s0 = sdCapsule(wp, uCenter, uTrail0, 0.62 * uSmear * scaleMin);
      float s1 = sdCapsule(wp, uTrail0, uTrail1, 0.46 * uSmear * scaleMin);
      float s2 = sdCapsule(wp, uTrail1, uTrail2, 0.30 * uSmear * scaleMin);
      float s3 = sdCapsule(wp, uTrail2, uTrail3, 0.16 * uSmear * scaleMin);
      float dTrail = smin(smin(s0, s1, 0.18), smin(s2, s3, 0.14), 0.14);
      if (dTrail < d) {
        float distC = length(wp - uCenter);
        smearWeight = clamp((distC - 0.55) / 1.5, 0.0, 1.0) * uSmear;
      }
      d = smin(d, dTrail, 0.20);
    }

    return vec3(d, matTag, smearWeight);
  }

  vec3 calcNormal(vec3 p) {
    vec2 e = vec2(0.0035, 0.0);
    return normalize(vec3(
      mapVillain(p + e.xyy).x - mapVillain(p - e.xyy).x,
      mapVillain(p + e.yxy).x - mapVillain(p - e.yxy).x,
      mapVillain(p + e.yyx).x - mapVillain(p - e.yyx).x
    ));
  }

  // Intense RED EYES with PALE GLINTS + composed deadpan upper eyelid + slow dignified blink!
  vec4 evalRedEye(vec3 lp, vec3 eyeCenter) {
    if (lp.z < 0.25) return vec4(0.0);

    vec2 d = lp.xy - eyeCenter.xy;
    float rx = 0.115;
    float ry = max(0.010, 0.165 * (1.0 - uBlink * 0.94));
    vec2 q = vec2(d.x / rx, d.y / ry);

    // Deadpan serious predator upper lid: flattens top of eye slightly with dignified calm
    float lidCut = 1.0 - smoothstep(0.68 - uEyelidCalm, 0.80 - uEyelidCalm, q.y);
    float ovalMask = 1.0 - smoothstep(0.92, 1.04, length(q));
    float mask = ovalMask * lidCut;

    // Thin dark-red eye socket rim right around the eye
    float rimMask = (1.0 - smoothstep(1.0, 1.22, length(q))) * (1.0 - ovalMask) * lidCut;
    if (mask <= 0.001 && rimMask <= 0.001) return vec4(0.0);

    // Glowing ruby-crimson iris with deeper edge vignette
    float rad = length(q - uEyeGlance * 0.35);
    vec3 coreRed = vec3(1.0, 0.19, 0.24);
    vec3 deepRuby = vec3(0.45, 0.03, 0.06);
    vec3 irisCol = mix(coreRed, deepRuby, smoothstep(0.25, 0.96, rad));

    // Tiny concentrated dark pupil core in center of red eye for predatory focus
    float pupil = 1.0 - smoothstep(0.22, 0.34, length((q - uEyeGlance * 0.55) * vec2(1.15, 0.92)));
    irisCol = mix(irisCol, vec3(0.16, 0.01, 0.03), pupil * 0.65);

    // Crisp PALE GLINTS (primary upper-left glint + secondary tiny lower-right pale pinpoint!)
    float openFactor = 1.0 - smoothstep(0.55, 0.85, uBlink);
    if (openFactor > 0.01) {
      vec2 gl1 = (q - vec2(-0.30 + uEyeGlance.x * 0.45, 0.24 + uEyeGlance.y * 0.45)) / vec2(0.28, 0.30);
      float c1 = 1.0 - smoothstep(0.75, 1.0, length(gl1));
      vec2 gl2 = (q - vec2(0.26 + uEyeGlance.x * 0.35, -0.32 + uEyeGlance.y * 0.35)) / vec2(0.14, 0.15);
      float c2 = 1.0 - smoothstep(0.75, 1.0, length(gl2));
      irisCol = mix(irisCol, vec3(1.0, 0.93, 0.94), clamp(c1 + c2, 0.0, 1.0) * openFactor);
    }

    vec3 outCol = mix(vec3(0.55, 0.04, 0.08), irisCol, clamp(mask / max(0.001, max(mask, rimMask)), 0.0, 1.0));
    return vec4(outCol, max(mask, rimMask * 0.85));
  }

  void main() {
    if (uOpacity <= 0.005) discard;

    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorldPos - cameraPosition);

    // Tight analytic bounding-sphere early-out (0 raymarch steps on background pixels!)
    float maxS = max(uSquash.x, max(uSquash.y, uSquash.z));
    vec3 bCenter = uCenter + vec3(0.0, 0.38 * maxS, 0.0);
    float bRad = (uSmear > 0.03 ? 3.4 : 2.15) * maxS;
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
    vec3 hitPos = ro;
    float matTag = 0.0;
    float smearWeight = 0.0;

    for (int i = 0; i < 48; i++) {
      vec3 p = ro + rd * t;
      vec3 res = mapVillain(p);
      if (res.x < 0.0035) {
        hit = true;
        hitPos = p;
        matTag = res.y;
        smearWeight = res.z;
        break;
      }
      t += max(res.x * 0.9, 0.015);
      if (t > tMax) break;
    }

    if (!hit) discard;

    vec3 N = calcNormal(hitPos);
    vec3 V = -rd;
    vec3 L = normalize(vec3(-0.75, 0.60, 0.30));
    float ndl = dot(N, L);
    float fresnel = 1.0 - max(0.0, dot(N, V));
    vec3 lp = toLocal(hitPos);

    // ==========================================================
    // GLOSSY OBSIDIAN BLACK BALL + DARK-RED OUTLINE + SUBTLE ORGANIC HALFTONE
    // ==========================================================
    float celLit = smoothstep(0.16, 0.26, ndl);
    vec3 litBlack = vec3(0.145, 0.135, 0.165);   // Glossy obsidian sheen
    vec3 deepBlack = vec3(0.042, 0.036, 0.048);  // Velvet jet black shadow
    vec3 baseCol = mix(deepBlack, litBlack, celLit);

    // Matching smooth organic flowing halftone dots (subtle charcoal-plum & dark ruby tint!)
    float scale4k = max(0.5, uResolution.y / 1080.0);
    vec2 screenP = gl_FragCoord.xy / (36.0 * scale4k);
    float swirlAng = -0.32 + fbm2(screenP * 0.08 + vec2(-uTime * 0.07, uTime * 0.05)) * 0.38;
    vec2 warped = rot2(swirlAng) * screenP + vec2(
      fbm2(screenP * 0.11 + vec2(uTime * 0.10, 1.9)),
      fbm2(screenP * 0.11 + vec2(-1.7, -uTime * 0.09))
    ) * 0.48;
    vec2 cellId = floor(warped);
    vec2 cell = fract(warped) - 0.5;
    float sizeField = fbm2(cellId * 0.22 + vec2(uTime * 0.15, -uTime * 0.12)) * 0.5 + 0.5;
    float toneSize = mix(0.10, 0.34, clamp(ndl * 0.55 + 0.52, 0.0, 1.0));
    float dotR = clamp(toneSize * (0.62 + sizeField * 0.68), 0.05, 0.40);
    float dotAA = max(0.03, 0.055 / scale4k);
    float dotMask = 1.0 - smoothstep(dotR - dotAA, dotR + dotAA, length(cell));

    vec3 litDot = vec3(0.24, 0.21, 0.26);
    vec3 shadowDot = vec3(0.18, 0.05, 0.07);
    vec3 col = mix(baseCol, mix(shadowDot, litDot, celLit), dotMask * 0.65);

    // Sleek glossy pale-crimson specular highlight on upper-left crown
    vec3 Lspec = normalize(vec3(-0.62, 0.68, 0.42));
    vec3 H = normalize(Lspec + V);
    float spec = smoothstep(0.962, 0.976, dot(N, H));
    col = mix(col, vec3(0.76, 0.64, 0.68), spec * 0.58);

    // Antenna glowing dark-red bobble tips!
    if (matTag > 1.5 && matTag < 2.5) {
      vec3 tipLit = vec3(0.92, 0.18, 0.24);
      vec3 tipDark = vec3(0.52, 0.05, 0.09);
      col = mix(tipDark, tipLit, celLit);
      col = mix(col, vec3(1.0, 0.88, 0.90), smoothstep(0.92, 0.96, dot(N, H)) * 0.85);
    }

    // Unzipped mouth interior & glowing red zipper seam lip!
    if (uMouthUnzip > 0.015) {
      if (matTag > 2.5) {
        // Deep dark-burgundy interior maw
        col = vec3(0.22, 0.02, 0.04) * (0.5 + 0.5 * clamp(lp.z + 0.3, 0.0, 1.0));
      }
      // Crisp red zipper seam & alternating tiny zipper teeth right along the unzipped lip edge!
      vec3 mp = lp - vec3(0.0, -0.18, 0.56);
      mp.y += (mp.x * mp.x) * 0.18;
      float unzip = clamp(uMouthUnzip, 0.0, 1.0);
      float mouthWidth = 0.54 * unzip;
      float mouthOpen = (0.26 * unzip) * (1.0 - uMouthChew * 0.45);
      vec2 lipQ = vec2(mp.x / max(0.05, mouthWidth), mp.y / max(0.03, mouthOpen));
      float lipDist = abs(length(lipQ) - 1.0);
      if (lp.z > 0.22 && lipDist < 0.20) {
        // Zipper tooth notch modulation along the red seam
        float tooth = step(0.45, fract(lp.x * 16.0 + (mp.y > 0.0 ? 0.5 : 0.0)));
        float lipBand = 1.0 - smoothstep(0.04, 0.18, lipDist);
        vec3 seamCol = mix(vec3(0.75, 0.07, 0.12), vec3(1.0, 0.24, 0.28), tooth * 0.7);
        col = mix(col, seamCol, lipBand * 0.96);
      }
    }

    // Signature BOLD HAND-DRAWN DARK-RED OUTLINE hugging the entire silhouette (12fps subtle drawn boil!)
    float boil12 = gnoise2(hitPos.xy * 4.6 + vec2(-floor(uTime * 12.0) * 1.7, floor(uTime * 12.0) * 1.4)) * 0.036;
    float innerRedRim = smoothstep(0.56, 0.72, fresnel) * (1.0 - smoothstep(0.72, 0.86, fresnel));
    col = mix(col, vec3(0.52, 0.05, 0.08), innerRedRim * 0.55);
    float redOutline = smoothstep(0.70 + boil12, 0.85 + boil12, fresnel);
    col = mix(col, vec3(0.78, 0.09, 0.14), redOutline * 0.98);

    // ==========================================================
    // RED EYES WITH PALE GLINTS (only on main front sphere!)
    // ==========================================================
    if (matTag < 0.5) {
      vec4 eL = evalRedEye(lp, vec3(-0.26, 0.11, 0.70));
      vec4 eR = evalRedEye(lp, vec3(0.26, 0.11, 0.70));
      float eyeM = max(eL.a, eR.a);
      if (eyeM > 0.001) {
        vec3 eCol = eL.a >= eR.a ? eL.rgb : eR.rgb;
        col = mix(col, eCol, eyeM);
      }
    }

    float alpha = uOpacity;
    if (smearWeight > 0.01) {
      alpha *= mix(1.0, 0.22, smearWeight);
      col = mix(col, vec3(0.58, 0.05, 0.09), smearWeight * 0.45);
    }

    // Exact raymarched 3D clip-space depth for clean occlusion with Ember & real 3D props!
    vec4 clipPos = uViewProj * vec4(hitPos, 1.0);
    float ndcDepth = clipPos.z / max(0.0001, clipPos.w);
    gl_FragDepth = clamp(ndcDepth * 0.5 + 0.5, 0.0, 0.99999);

    fragColor = vec4(col, alpha);
  }
`;

export function createVillainShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VILLAIN_VERT,
    fragmentShader: VILLAIN_FRAG,
    transparent: true,
    depthWrite: true,
    side: THREE.BackSide,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(3840, 2160) },
      uViewProj: { value: new THREE.Matrix4() },
      uCenter: { value: new THREE.Vector3(0, 0, 0) },
      uSquash: { value: new THREE.Vector3(1, 1, 1) },
      uYaw: { value: 0 },
      uPitch: { value: 0 },
      uRoll: { value: 0 },
      uBreath: { value: 0 },
      uAntennaDir: { value: new THREE.Vector2(0, 0) },
      uAntennaStretch: { value: 0 },
      uAntennaSproing: { value: 0 },
      uAntennaSpread: { value: 0 },
      uMouthUnzip: { value: 0 },
      uMouthChew: { value: 0 },
      uBlink: { value: 0 },
      uEyelidCalm: { value: 0.18 },
      uEyeGlance: { value: new THREE.Vector2(0, 0) },
      uTrail0: { value: new THREE.Vector3(0, 0, 0) },
      uTrail1: { value: new THREE.Vector3(0, 0, 0) },
      uTrail2: { value: new THREE.Vector3(0, 0, 0) },
      uTrail3: { value: new THREE.Vector3(0, 0, 0) },
      uSmear: { value: 0 },
      uOpacity: { value: 1 },
    },
  });
}
