// Multi-Style Hand-Drawn Animation Shader System (4 Distinct Surface Styles + Clean Drawn Sky)
// 1. comicPrint  — Characters & Main Hero Assets: flat bright color, hard cel bands, RESTRAINED halftone dots
//                  ONLY on light-band/shadow edges, hand-drawn indigo ink lines on warm paper (12fps boil).
// 2. vinylToy    — Chunky Props, Toys, Hearts & Terraces: ZERO halftone, clean saturated pastels, soft wrapped
//                  light with cool violet shadows, deep contact shadows, gentle hand-drawn rim.
// 3. risograph   — Feeds, Headlines, Reel Strips & Prints: ZERO halftone circles; 3 authentic riso inks
//                  (fluorescent pink, riso blue, riso teal) on warm paper, second blue shadow pass with
//                  fine stippled edge, slightly out-of-register key line, tactile paper grain.
// 4. paintedScan — Rooms, Floors, Skyscrapers, Dunes & Concrete: ZERO halftone; calm flat painted planes in
//                  cool tones, visible directional brush strokes ONLY at light transitions & rims, canvas tooth.

import * as THREE from "three";

export type SurfaceStyle = "comicPrint" | "vinylToy" | "risograph" | "paintedScan";

const STYLE_INDEX: Record<SurfaceStyle, number> = {
  comicPrint: 0,
  vinylToy: 1,
  risograph: 2,
  paintedScan: 3,
};

const HALFTONE_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vLocalPos = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mvPos = viewMatrix * worldPos;
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const HALFTONE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uBaseColor;
  uniform vec3 uShadowColor;
  uniform vec3 uPaperColor;
  uniform vec3 uEmissive;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  uniform vec3 uLightDir;
  uniform vec3 uKeyColor;
  uniform vec3 uFillColor;
  uniform vec3 uPointPos;
  uniform vec3 uPointColor;
  uniform float uPointIntensity;

  uniform vec2 uResolution;
  uniform float uDotPitch;
  uniform float uCmykSplit;
  uniform float uOutlineStrength;
  uniform float uOpacity;
  uniform float uInkContrast;
  uniform float uStyle;
  uniform float uTime;

  uniform float uUseMap;
  uniform sampler2D uMap;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec3 vViewDir;
  varying vec2 vUv;

  // Smooth deterministic hash & value noise (for hand-drawn 12fps boil, stipple & brush strokes)
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Clean single-plate halftone dot mask for Comic Print light-band edges ONLY
  float edgeHalftoneDot(vec2 fragCoord, float angleRad, float pitch, float density) {
    float c = cos(angleRad);
    float s = sin(angleRad);
    vec2 p = (mat2(c, -s, s, c) * fragCoord) / pitch;
    float dist = length(fract(p) - 0.5);
    float radius = sqrt(clamp(density, 0.0, 1.0)) * 0.48;
    float aa = max(0.04, 1.15 / pitch);
    return 1.0 - smoothstep(radius - aa, radius + aa, dist);
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uLightDir);

    // 12fps stepped hand-drawn animation boil seed (authentic drawn line life!)
    float boilStep = floor(uTime * 12.0);
    float scale4k = max(0.5, uResolution.y / 1080.0);
    vec2 drawnCoord = gl_FragCoord.xy / max(1.0, scale4k * 3.0);
    float lineBoil = (vnoise(drawnCoord * 0.14 + vec2(boilStep * 1.73, -boilStep * 1.19)) - 0.5) * 0.095;
    float paperTooth = (vnoise(gl_FragCoord.xy / max(1.0, scale4k * 1.6)) - 0.5) * 0.028;

    // Base albedo (solid color or procedural print canvas texture)
    vec3 albedo = uBaseColor;
    if (uUseMap > 0.5) {
      vec4 tex = texture2D(uMap, vUv);
      albedo *= tex.rgb;
    }

    // Lighting terms
    float ndl = dot(N, L);
    float smoothLight = ndl * 0.5 + 0.5;
    float hemi = N.y * 0.5 + 0.5;

    // Real inverse-square falloff practical point light
    vec3 toLight = uPointPos - vWorldPos;
    float dist = length(toLight);
    vec3 pDir = toLight / max(0.001, dist);
    float atten = uPointIntensity / (1.0 + 0.12 * dist * dist);
    float pNdl = max(0.0, dot(N, pDir));
    vec3 pointContrib = uPointColor * pNdl * atten;

    float emissiveMag = max(max(uEmissive.r, uEmissive.g), uEmissive.b);
    float fresnel = 1.0 - abs(dot(N, V));

    // Hand-drawn crease / edge detector via screen-space normal derivatives
    float normalEdge = length(fwidth(N));
    float creaseInk = smoothstep(0.28, 0.62, normalEdge + lineBoil * 0.6);

    vec3 finalColor = albedo;

    // =========================================================================
    // STYLE 0: COMIC PRINT (Characters & Main Hero Assets — Edge-Only Halftone)
    // Flat bright color, hard light bands, halftone dots ONLY on band edges,
    // hand-drawn indigo ink lines on warm paper!
    // =========================================================================
    if (uStyle < 0.5) {
      // Crisp 3-step hard light bands
      float bandMid = smoothstep(0.30, 0.34, smoothLight);
      float bandHi = smoothstep(0.66, 0.70, smoothLight);
      float celVal = 0.24 + bandMid * 0.44 + bandHi * 0.32;

      vec3 shadowTint = mix(uShadowColor, vec3(0.09, 0.13, 0.32), 0.35);
      vec3 lit = albedo * mix(shadowTint * 0.95, uKeyColor * 1.05, celVal)
               + albedo * mix(shadowTint, uFillColor, hemi) * 0.24
               + albedo * pointContrib * 0.85
               + uEmissive * 0.88;

      // Subtle warm paper tinting on highlights
      lit = mix(lit, lit * mix(vec3(1.0), uPaperColor, 0.22), bandHi);
      lit = clamp(mix(vec3(0.5), lit, uInkContrast * 0.96), 0.0, 1.0);

      // RESTRAINED fine halftone dots ONLY along the light-band transition edge & shadow rim (never polka dots!)
      float edgeBand1 = smoothstep(0.22, 0.31, smoothLight) * (1.0 - smoothstep(0.33, 0.43, smoothLight));
      float deepRim = (1.0 - smoothstep(0.08, 0.24, smoothLight)) * 0.45;
      float edgeZone = clamp(edgeBand1 * 0.85 + deepRim, 0.0, 1.0);

      float pitch = max(5.5, uDotPitch * 0.92 * scale4k);
      float dotDensity = edgeZone * (0.52 - smoothLight * 0.22);
      float dotMask = edgeHalftoneDot(gl_FragCoord.xy, 0.785398, pitch, dotDensity);

      // Indigo comic ink dots on shadow edges (strictly darker tonal dots so dark fabrics stay sleek & rich!)
      vec3 indigoInk = vec3(0.07, 0.09, 0.20);
      vec3 dotTint = mix(indigoInk, lit * 0.68, 0.35);
      finalColor = mix(lit, dotTint, dotMask * edgeZone * 0.34 * (1.0 - clamp(emissiveMag * 0.7, 0.0, 0.7)));

      // Hand-drawn indigo ink silhouette & structural crease lines with 12fps boil
      float silInk = smoothstep(0.64 + lineBoil, 0.80 + lineBoil, fresnel);
      float drawnLine = clamp(max(silInk, creaseInk * 0.62), 0.0, 1.0) * uOutlineStrength;
      finalColor = mix(finalColor, indigoInk, drawnLine * (1.0 - clamp(emissiveMag * 0.65, 0.0, 0.65)));
      finalColor = clamp(finalColor + paperTooth * 0.75, 0.0, 1.0);
    }

    // =========================================================================
    // STYLE 1: VINYL TOYS (Chunky Props, Hearts, Terraces, Chains — NO Halftone)
    // Clean saturated pastels, soft wrapped light, cool violet shadows,
    // deep contact shadows, subtle hand-drawn contour!
    // =========================================================================
    else if (uStyle < 1.5) {
      // Soft wrapped light for chunky matte-satin vinyl toy look
      float wrapLight = clamp((ndl + 0.58) / 1.58, 0.0, 1.0);
      wrapLight = smoothstep(0.05, 0.96, wrapLight);

      // Lift albedo slightly toward clean saturated vinyl pastel
      vec3 pastelAlbedo = mix(albedo, pow(clamp(albedo, 0.0, 1.0), vec3(0.84)) * 1.08, 0.42);
      vec3 violetShadow = vec3(0.24, 0.16, 0.42);
      vec3 deepContact = vec3(0.11, 0.07, 0.22);

      // Grounded bottom contact shadow approximation
      float contactAO = smoothstep(-0.65, 0.35, N.y);
      vec3 toyDiffuse = pastelAlbedo * mix(violetShadow * 0.95, uKeyColor * 1.06, wrapLight);
      toyDiffuse = mix(toyDiffuse * 0.62 + deepContact * 0.22, toyDiffuse, 0.35 + 0.65 * contactAO);

      // Soft vinyl satin specular sheen
      vec3 H = normalize(L + V);
      float satinSpec = pow(max(0.0, dot(N, H)), 18.0) * 0.24;
      float softRim = pow(fresnel, 2.4) * 0.16;

      finalColor = toyDiffuse
        + pastelAlbedo * pointContrib * 0.72
        + uFillColor * softRim * 0.45
        + vec3(1.0, 0.97, 0.94) * satinSpec
        + uEmissive * 0.78;

      // Delicate hand-drawn plum-indigo toy contour (keeps drawn animation cohesion)
      float toyLine = smoothstep(0.73 + lineBoil * 0.8, 0.88 + lineBoil * 0.8, fresnel) * uOutlineStrength * 0.55;
      finalColor = mix(finalColor, vec3(0.14, 0.10, 0.26), toyLine * (1.0 - clamp(emissiveMag * 0.65, 0.0, 0.65)));
      finalColor = clamp(finalColor + paperTooth * 0.35, 0.0, 1.0);
    }

    // =========================================================================
    // STYLE 2: RISOGRAPH (Feeds, Headlines, Reel Strips — 3 Spot Inks + Stipple)
    // Fluorescent pink, riso blue, riso teal flat tints on warm paper,
    // second blue shadow pass with STIPPLED edge, out-of-register key line!
    // =========================================================================
    else if (uStyle < 2.5) {
      vec3 risoPink = vec3(1.00, 0.28, 0.52);
      vec3 risoBlue = vec3(0.11, 0.36, 0.96);
      vec3 risoTeal = vec3(0.02, 0.68, 0.62);

      // Project base albedo into the 3 authentic riso spot ink weights
      float wPink = clamp(albedo.r * 0.95 - albedo.g * 0.35 + uEmissive.r * 0.5, 0.0, 1.0);
      float wTeal = clamp(albedo.g * 0.88 - albedo.r * 0.25 + uEmissive.g * 0.45, 0.0, 1.0);
      float wBlue = clamp(albedo.b * 0.90 + (1.0 - max(albedo.r, albedo.g)) * 0.35 + uEmissive.b * 0.4, 0.0, 1.0);

      // Flat risograph ink overprint on warm cream paper
      vec3 inkMix = uPaperColor;
      inkMix = mix(inkMix, inkMix * mix(vec3(1.0), risoPink, 0.86), clamp(wPink * 0.82, 0.0, 0.88));
      inkMix = mix(inkMix, inkMix * mix(vec3(1.0), risoTeal, 0.84), clamp(wTeal * 0.78, 0.0, 0.84));
      inkMix = mix(inkMix, inkMix * mix(vec3(1.0), risoBlue, 0.82), clamp(wBlue * 0.72, 0.0, 0.80));

      // Preserve crisp procedural print text/graphics when mapped
      if (uUseMap > 0.5) {
        inkMix = mix(inkMix, albedo * uPaperColor * 0.98 + uEmissive * 0.55, 0.58);
      } else {
        inkMix = mix(inkMix, clamp(inkMix * 0.82 + uEmissive * 0.72, 0.0, 1.0), clamp(emissiveMag * 0.65, 0.0, 0.75));
      }

      // Second Riso Blue shadow pass with FINE STIPPLED grain edge (NOT halftone circles!)
      float stippleNoise = hash12(floor(gl_FragCoord.xy / max(1.0, scale4k * 1.15)) + vec2(boilStep * 0.5, 0.0));
      float shadowMask = 1.0 - smoothstep(0.24, 0.58, smoothLight + (stippleNoise - 0.5) * 0.28);
      vec3 secondBluePass = inkMix * mix(vec3(1.0), risoBlue * 0.78, 0.72);
      finalColor = mix(inkMix, secondBluePass, shadowMask * 0.78);
      finalColor += pointContrib * albedo * 0.42;

      // Key line printed slightly OUT OF REGISTER (hand-drawn offset ink pass!)
      float regShift = (0.04 + clamp(uCmykSplit, 0.0, 1.5) * 0.045);
      float keyLineMain = smoothstep(0.68 + lineBoil, 0.84 + lineBoil, fresnel);
      float keyLineOffset = smoothstep(0.62 - regShift + lineBoil, 0.78 - regShift + lineBoil, fresnel) * (1.0 - keyLineMain);
      finalColor = mix(finalColor, risoPink * 0.88, keyLineOffset * 0.45 * uOutlineStrength);
      finalColor = mix(finalColor, vec3(0.08, 0.14, 0.36), max(keyLineMain, creaseInk * 0.5) * 0.82 * uOutlineStrength);

      // Authentic tactile riso paper grain
      float risoGrain = (hash12(floor(gl_FragCoord.xy / max(1.0, scale4k * 0.9))) - 0.5) * 0.055;
      finalColor = clamp(finalColor + risoGrain, 0.0, 1.0);
    }

    // =========================================================================
    // STYLE 3: PAINTED SCANS (Rooms, Floors, Dunes, Skyscrapers — NO Halftone)
    // Calm flat planes in cool painted colors, visible directional brush strokes
    // ONLY where light changes and around rims, fine canvas weave!
    // =========================================================================
    else {
      // Calm flat cool-shifted painted plane color
      vec3 coolPaint = mix(albedo, albedo * vec3(0.90, 0.95, 1.05), 0.28);
      float softBand = smoothstep(0.20, 0.76, smoothLight);
      vec3 litPlane = coolPaint * mix(uShadowColor * 0.92 + vec3(0.04, 0.06, 0.10), uKeyColor * 0.98, 0.25 + softBand * 0.75)
                    + coolPaint * mix(uShadowColor, uFillColor, hemi) * 0.34
                    + coolPaint * pointContrib * 0.72
                    + uEmissive * 0.82;

      // Directional painterly brush strokes ONLY at light transitions (terminator) & rims!
      float terminatorZone = smoothstep(0.16, 0.42, smoothLight) * (1.0 - smoothstep(0.46, 0.74, smoothLight));
      float rimZone = smoothstep(0.46, 0.82, fresnel);
      float brushMask = clamp(terminatorZone * 0.92 + rimZone * 0.85, 0.0, 1.0);

      // Anisotropic stretched brush strokes aligned diagonally along world/screen planes
      vec2 strokeUv = (vWorldPos.xy + vec2(vWorldPos.z * 0.7, -vWorldPos.z * 0.5)) * vec2(1.4, 8.2);
      float stroke1 = vnoise(strokeUv + vec2(boilStep * 0.15, 0.0));
      float stroke2 = vnoise(strokeUv * 1.9 + vec2(4.2, -2.1));
      float brush = (stroke1 * 0.65 + stroke2 * 0.35) - 0.5;

      vec3 strokeColor = brush > 0.0
        ? mix(litPlane, uFillColor * 0.85 + uPaperColor * 0.25, 0.45)
        : mix(litPlane, uShadowColor * 0.85, 0.48);
      finalColor = mix(litPlane, strokeColor, abs(brush) * 1.45 * brushMask);

      // Subtle hand-drawn charcoal/indigo architectural edge line
      float archEdge = clamp(max(smoothstep(0.74 + lineBoil, 0.88 + lineBoil, fresnel), creaseInk * 0.42), 0.0, 1.0);
      finalColor = mix(finalColor, vec3(0.08, 0.11, 0.20), archEdge * uOutlineStrength * 0.58);

      // Subtle woven linen canvas tooth
      vec2 canvasP = gl_FragCoord.xy / max(1.0, scale4k * 2.2);
      float weave = (sin(canvasP.x * 3.14159) * sin(canvasP.y * 3.14159)) * 0.018;
      finalColor = clamp(finalColor + weave + paperTooth * 0.55, 0.0, 1.0);
    }

    // Smooth atmospheric depth fog into painted sky horizon
    float camDist = length(cameraPosition - vWorldPos);
    float fogFactor = 1.0 - exp(-pow(camDist * uFogDensity, 1.65));
    finalColor = mix(finalColor, uFogColor, clamp(fogFactor, 0.0, 0.94));

    gl_FragColor = vec4(finalColor, uOpacity);
  }
`;

export interface HalftonePalette {
  paperColor: THREE.Color;
  fogColor: THREE.Color;
  fogDensity: number;
  lightDir: THREE.Vector3;
  keyColor: THREE.Color;
  fillColor: THREE.Color;
  pointPos: THREE.Vector3;
  pointColor: THREE.Color;
  pointIntensity: number;
}

export interface HalftoneMaterialOptions {
  baseColor: THREE.ColorRepresentation;
  shadowColor?: THREE.ColorRepresentation;
  emissive?: THREE.ColorRepresentation;
  dotPitch?: number;
  outlineStrength?: number;
  opacity?: number;
  inkContrast?: number;
  style?: SurfaceStyle;
  map?: THREE.Texture | null;
  side?: THREE.Side;
  transparent?: boolean;
  depthWrite?: boolean;
}

export function createHalftoneMaterial(options: HalftoneMaterialOptions): THREE.ShaderMaterial {
  const styleIdx = STYLE_INDEX[options.style ?? "comicPrint"];
  const mat = new THREE.ShaderMaterial({
    vertexShader: HALFTONE_VERTEX_SHADER,
    fragmentShader: HALFTONE_FRAGMENT_SHADER,
    transparent: options.transparent ?? (options.opacity !== undefined && options.opacity < 1),
    depthWrite: options.depthWrite ?? true,
    side: options.side ?? THREE.FrontSide,
    uniforms: {
      uBaseColor: { value: new THREE.Color(options.baseColor) },
      uShadowColor: { value: new THREE.Color(options.shadowColor ?? "#141a2e") },
      uPaperColor: { value: new THREE.Color("#f3ede0") },
      uEmissive: { value: new THREE.Color(options.emissive ?? "#000000") },
      uFogColor: { value: new THREE.Color("#0b0f1c") },
      uFogDensity: { value: 0.025 },
      uLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.4).normalize() },
      uKeyColor: { value: new THREE.Color("#fff5e6") },
      uFillColor: { value: new THREE.Color("#3b82f6") },
      uPointPos: { value: new THREE.Vector3(0, 1, 2) },
      uPointColor: { value: new THREE.Color("#00d4ff") },
      uPointIntensity: { value: 1.5 },
      uResolution: { value: new THREE.Vector2(3840, 2160) },
      uDotPitch: { value: options.dotPitch ?? 9.5 },
      uCmykSplit: { value: 0.25 },
      uOutlineStrength: { value: options.outlineStrength ?? 0.82 },
      uOpacity: { value: options.opacity ?? 1.0 },
      uInkContrast: { value: options.inkContrast ?? 1.08 },
      uStyle: { value: styleIdx },
      uTime: { value: 0.0 },
      uUseMap: { value: options.map ? 1.0 : 0.0 },
      uMap: { value: options.map ?? null },
    },
  });
  return mat;
}

export function syncHalftoneUniforms(
  mat: THREE.ShaderMaterial,
  palette: HalftonePalette,
  width: number,
  height: number,
  cmykSplit: number,
  dotScale = 1.0,
  basePitch = 9.5,
  tSec = 0,
): void {
  const u = mat.uniforms;
  u.uPaperColor.value.copy(palette.paperColor);
  u.uFogColor.value.copy(palette.fogColor);
  u.uFogDensity.value = palette.fogDensity;
  u.uLightDir.value.copy(palette.lightDir).normalize();
  u.uKeyColor.value.copy(palette.keyColor);
  u.uFillColor.value.copy(palette.fillColor);
  u.uPointPos.value.copy(palette.pointPos);
  u.uPointColor.value.copy(palette.pointColor);
  u.uPointIntensity.value = palette.pointIntensity;
  u.uResolution.value.set(width, height);
  u.uCmykSplit.value = cmykSplit;
  u.uDotPitch.value = basePitch * dotScale;
  if (u.uTime) {
    u.uTime.value = tSec;
  }
}

// =========================================================================
// CLEAN HAND-PAINTED / RISOGRAPH SKY BACKDROP SHADER (ZERO HALFTONE DOTS!)
// Eliminates the screen-wide halftone grid over the viewer lens completely!
// =========================================================================
const BACKDROP_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldDir;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(wp.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const BACKDROP_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform vec3 uTopColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uBottomColor;
  uniform vec3 uAccentColor;
  uniform vec3 uPaperColor;
  uniform vec2 uResolution;
  uniform float uDotPitch;
  uniform float uRayStrength;
  uniform float uRayAngleOffset;
  uniform float uSunElevation;
  uniform float uCmykSplit;

  varying vec2 vUv;
  varying vec3 vWorldDir;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
      mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float elev = dir.y;

    // Smooth painted sky/horizon/ground gradient with gentle hand-painted horizontal bands
    vec3 grad = elev >= 0.0
      ? mix(uHorizonColor, uTopColor, smoothstep(0.0, 0.65, elev))
      : mix(uHorizonColor, uBottomColor, smoothstep(0.0, 0.55, -elev));

    // Soft painterly sky brush wisps near the horizon (zero dots!)
    float horizonBand = exp(-abs(elev) * 4.5);
    float wisp = vnoise(vec2(atan(dir.x, dir.z) * 3.5, elev * 14.0)) - 0.5;
    grad = mix(grad, mix(uHorizonColor, uAccentColor, 0.25), wisp * 0.24 * horizonBand);

    // Clean painted sunrise rays (Desert Cathedral & Dawn Finale)
    if (uRayStrength > 0.01) {
      vec2 sunVec = vec2(dir.x, dir.y - uSunElevation);
      float ang = atan(sunVec.y, sunVec.x) + uRayAngleOffset;
      float rays = smoothstep(0.18, 0.82, sin(ang * 12.0) * 0.5 + 0.5);
      float sunDist = length(sunVec);
      float sunDisc = 1.0 - smoothstep(0.15, 0.20, sunDist);
      grad = mix(grad, uAccentColor, rays * uRayStrength * 0.30 * exp(-sunDist * 0.95));
      grad = mix(grad, uPaperColor, sunDisc * uRayStrength * 0.85);
    }

    // Very delicate warm paper/canvas grain (completely clean viewer, zero halftone grid!)
    float scale4k = max(0.5, uResolution.y / 1080.0);
    float grain = (hash12(floor(gl_FragCoord.xy / max(1.0, scale4k * 1.35))) - 0.5) * 0.022;
    vec3 outCol = clamp(grad + grain, 0.0, 1.0);

    gl_FragColor = vec4(outCol, 1.0);
  }
`;

export function createBackdropMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: BACKDROP_VERTEX_SHADER,
    fragmentShader: BACKDROP_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTopColor: { value: new THREE.Color("#091124") },
      uHorizonColor: { value: new THREE.Color("#142b52") },
      uBottomColor: { value: new THREE.Color("#070912") },
      uAccentColor: { value: new THREE.Color("#00d4ff") },
      uPaperColor: { value: new THREE.Color("#f3ede0") },
      uResolution: { value: new THREE.Vector2(3840, 2160) },
      uDotPitch: { value: 11.0 },
      uRayStrength: { value: 0.0 },
      uRayAngleOffset: { value: 0.0 },
      uSunElevation: { value: 0.25 },
      uCmykSplit: { value: 0.2 },
    },
  });
}
