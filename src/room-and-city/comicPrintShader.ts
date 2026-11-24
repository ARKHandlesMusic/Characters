// Comic-Print GLSL Shader Suite for "Bottomless" Bedroom & 3D Metropolis
// Style specification:
// - Flat bright colour, hard light bands with crisp halftone dots along every light/shadow edge
// - Indigo ink lines (#181842) on warm paper; supports InstancedMesh (#ifdef USE_INSTANCING)
// - Night mode: deep ultramarine shadow tint with hard cream desk-lamp pool + circular rug pool + ceiling halo
// - Muted mode: cool newsprint grey with halftone dots and ink lines preserved (city stays full colour)
// - Distance atmospheric fog for 25-block skyline & misty mountains

import * as THREE from "three";

export type RoomLightingMode = "day" | "night" | "muted";

export interface ComicLightingConfig {
  mode: RoomLightingMode;
  lightDir: THREE.Vector3;
  inkColor: THREE.Color;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  fogMaxBlend: number;
  nightFactor: number;
  mutedFactor: number;
  lampPos: THREE.Vector3;
  lampDir: THREE.Vector3;
  lampColor: THREE.Color;
  lampStrength: number;
}

export interface ComicPrintMaterialOptions {
  baseColor: string;
  shadowColor?: string;
  highlightColor?: string;
  emissive?: string;
  emissiveIntensity?: number;
  map?: THREE.Texture | null;
  dotScale?: number;
  inkStrength?: number;
  receiveLampPool?: boolean;
  respectMuted?: boolean;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  polygonOffset?: boolean;
  fogScale?: number;
}

const COMIC_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 localPos = vec4(position, 1.0);
    vec3 localNormal = normal;

    #ifdef USE_INSTANCING
      localPos = instanceMatrix * localPos;
      localNormal = mat3(instanceMatrix) * localNormal;
    #endif

    vec4 worldPos = modelMatrix * localPos;
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const COMIC_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uBaseColor;
  uniform vec3 uShadowColor;
  uniform vec3 uHighlightColor;
  uniform vec3 uEmissive;
  uniform float uEmissiveIntensity;
  uniform vec3 uInkColor;
  uniform vec3 uLightDir;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFogMaxBlend;
  uniform float uFogScale;
  uniform float uNightFactor;
  uniform float uMutedFactor;
  uniform float uRespectMuted;
  uniform float uReceiveLampPool;
  uniform vec3 uLampPos;
  uniform vec3 uLampDir;
  uniform vec3 uLampColor;
  uniform float uLampStrength;
  uniform float uDotScale;
  uniform float uInkStrength;
  uniform float uOpacity;
  uniform float uHasMap;
  uniform sampler2D uMap;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  varying vec3 vViewDir;

  // Rotated 45-deg screen-space halftone dot field for crisp print dots on every band edge
  float halftoneDots(vec2 fragCoord, float scale) {
    float angle = 0.78539816;
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 cell = fract((rot * fragCoord) / max(scale, 2.0)) - 0.5;
    return length(cell) * 1.41421356;
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(uLightDir);

    vec4 texSample = uHasMap > 0.5 ? texture2D(uMap, vUv) : vec4(1.0);
    vec3 albedo = uBaseColor * texSample.rgb;
    vec3 shadowCol = uShadowColor * texSample.rgb;
    vec3 hiCol = uHighlightColor * texSample.rgb;

    // Night deepens non-emissive surfaces into rich comic ultramarine
    if (uNightFactor > 0.01) {
      vec3 ultraTint = vec3(0.08, 0.11, 0.30);
      albedo = mix(albedo, mix(albedo * 0.34, ultraTint, 0.44), uNightFactor * 0.92);
      shadowCol = mix(shadowCol, vec3(0.04, 0.06, 0.19), uNightFactor * 0.94);
      hiCol = mix(hiCol, mix(hiCol * 0.45, vec3(0.24, 0.32, 0.68), 0.35), uNightFactor * 0.82);
    }

    // Hard comic 3-band lighting with crisp halftone dot transition at the shadow edge
    float ndl = dot(N, L) * 0.5 + 0.5;
    float dotDist = halftoneDots(gl_FragCoord.xy, uDotScale);

    // Shadow-to-mid halftone band
    float shadowBand = smoothstep(0.30, 0.56, ndl);
    float shadowDotMask = step(dotDist, (1.0 - shadowBand) * 0.92);
    vec3 col = mix(albedo, shadowCol, shadowDotMask * 0.78);
    if (ndl < 0.32) {
      col = shadowCol;
    }

    // Mid-to-highlight hard comic band with subtle dot feathering
    float hiBand = smoothstep(0.76, 0.88, ndl);
    float hiDotMask = step(dotDist, hiBand * 0.72);
    col = mix(col, hiCol, hiDotMask * 0.48);

    // Nighttime hard cream desk-lamp spotlight pool + circular rug pool + ceiling halo
    if (uReceiveLampPool > 0.5 && uLampStrength > 0.01) {
      vec3 toFrag = vWorldPos - uLampPos;
      float dist = length(toFrag);
      vec3 dir = toFrag / max(dist, 0.001);
      float cone = dot(dir, normalize(uLampDir));
      float spotEdge = smoothstep(0.56, 0.74, cone) * smoothstep(3.6, 0.75, dist);

      // Secondary warm floor pool centered beneath desk/chair
      float floorDist = length(vWorldPos.xz - vec2(-0.85, -1.55));
      float floorPool = smoothstep(1.95, 1.15, floorDist) * smoothstep(0.35, 0.0, abs(vWorldPos.y));

      // Gentle ceiling halo above the lamp
      float ceilHalo = smoothstep(1.65, 0.45, length(vWorldPos - vec3(-0.92, 2.55, -1.92))) * 0.45;

      float pool = clamp(max(spotEdge, max(floorPool * 0.88, ceilHalo)), 0.0, 1.0);
      float poolDots = step(dotDist, pool * 1.05);
      float hardPool = mix(poolDots, 1.0, smoothstep(0.55, 0.78, pool));

      vec3 litRoomColor = uBaseColor * texSample.rgb * uLampColor * 1.18;
      col = mix(col, litRoomColor, hardPool * uLampStrength);
    }

    // Crisp indigo ink silhouette rim
    float ndv = abs(dot(N, V));
    float rimInk = 1.0 - smoothstep(0.10, 0.23, ndv);
    col = mix(col, uInkColor, rimInk * uInkStrength);

    // Add self-luminous emissive accents (windows, lamp bulbs, headlights, billboards, sun)
    vec3 emissiveTerm = uEmissive * uEmissiveIntensity * (1.0 - uHasMap * 0.88);
    // For textured window-grid buildings, illuminate ONLY the bright lit window panes at night!
    float texLuma = dot(texSample.rgb, vec3(0.299, 0.587, 0.114));
    if (uHasMap > 0.5 && uEmissiveIntensity > 0.05) {
      float litMask = smoothstep(0.76, 0.90, texLuma);
      emissiveTerm += texSample.rgb * litMask * uEmissiveIntensity * (0.28 + 1.15 * uNightFactor);
    }
    col += emissiveTerm;

    // Muted newsprint grey mode for his room (keeps dots + indigo ink lines, leaves 3D city vivid!)
    if (uRespectMuted > 0.5 && uMutedFactor > 0.01) {
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 newsprint = mix(vec3(0.22, 0.24, 0.30), vec3(0.84, 0.86, 0.90), lum);
      // Reinforce crisp comic dots on muted grey shadow midtones
      float mutedDot = step(dotDist, (1.0 - lum) * 0.58) * 0.14;
      newsprint -= vec3(mutedDot);
      col = mix(col, newsprint, uMutedFactor);
    }

    // Atmospheric horizon distance fog (25-block skyline & misty distant mountains)
    if (uFogScale > 0.001) {
      float camDist = length(cameraPosition - vWorldPos);
      float distFog = smoothstep(uFogNear, uFogFar, camDist);
      float heightEase = 1.0 - smoothstep(6.0, 62.0, vWorldPos.y) * 0.32;
      float fogAmt = clamp(distFog * heightEase * uFogScale, 0.0, uFogMaxBlend);
      // Subtle halftone grain right at the mist band
      float fogGrain = mix(fogAmt, clamp(fogAmt + (step(dotDist, fogAmt) - 0.5) * 0.08, 0.0, uFogMaxBlend), 0.35);
      col = mix(col, uFogColor, fogGrain);
    }

    gl_FragColor = vec4(col, uOpacity * texSample.a);
  }
`;

export function createComicPrintMaterial(opts: ComicPrintMaterialOptions): THREE.ShaderMaterial {
  const base = new THREE.Color(opts.baseColor);
  const shadow = opts.shadowColor
    ? new THREE.Color(opts.shadowColor)
    : base.clone().multiplyScalar(0.52).lerp(new THREE.Color("#1d1e5a"), 0.28);
  const highlight = opts.highlightColor
    ? new THREE.Color(opts.highlightColor)
    : base.clone().lerp(new THREE.Color("#fffdf6"), 0.28);

  return new THREE.ShaderMaterial({
    uniforms: {
      uBaseColor: { value: base },
      uShadowColor: { value: shadow },
      uHighlightColor: { value: highlight },
      uEmissive: { value: new THREE.Color(opts.emissive ?? "#000000") },
      uEmissiveIntensity: { value: opts.emissiveIntensity ?? 0.0 },
      uInkColor: { value: new THREE.Color("#181842") },
      uLightDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uFogColor: { value: new THREE.Color("#8fd3ff") },
      uFogNear: { value: 22.0 },
      uFogFar: { value: 235.0 },
      uFogMaxBlend: { value: 0.88 },
      uFogScale: { value: opts.fogScale ?? 1.0 },
      uNightFactor: { value: 0.0 },
      uMutedFactor: { value: 0.0 },
      uRespectMuted: { value: opts.respectMuted ? 1.0 : 0.0 },
      uReceiveLampPool: { value: opts.receiveLampPool ? 1.0 : 0.0 },
      uLampPos: { value: new THREE.Vector3(-1.46, 1.24, -1.96) },
      uLampDir: { value: new THREE.Vector3(0.35, -0.82, 0.32).normalize() },
      uLampColor: { value: new THREE.Color("#fff1cc") },
      uLampStrength: { value: 0.0 },
      uDotScale: { value: opts.dotScale ?? 5.5 },
      uInkStrength: { value: opts.inkStrength ?? 0.65 },
      uOpacity: { value: opts.opacity ?? 1.0 },
      uHasMap: { value: opts.map ? 1.0 : 0.0 },
      uMap: { value: opts.map ?? null },
    },
    vertexShader: COMIC_VERTEX_SHADER,
    fragmentShader: COMIC_FRAGMENT_SHADER,
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    depthWrite: opts.depthWrite ?? true,
    polygonOffset: opts.polygonOffset ?? false,
    polygonOffsetFactor: opts.polygonOffset ? -1 : 0,
    polygonOffsetUnits: opts.polygonOffset ? -1 : 0,
  });
}

/**
 * Defensive sync helper: safely updates any ComicPrint ShaderMaterial uniforms
 * and gracefully skips non-comic or outline-only ShaderMaterials.
 */
export function syncComicPrintMaterial(
  mat: THREE.Material | null | undefined,
  cfg: ComicLightingConfig,
): void {
  if (!(mat instanceof THREE.ShaderMaterial)) return;
  const u = mat.uniforms;
  if (!u || !u.uLightDir || !u.uInkColor) return;

  u.uLightDir.value.copy(cfg.lightDir);
  u.uInkColor.value.copy(cfg.inkColor);
  u.uFogColor.value.copy(cfg.fogColor);
  u.uFogNear.value = cfg.fogNear;
  u.uFogFar.value = cfg.fogFar;
  u.uFogMaxBlend.value = cfg.fogMaxBlend;
  u.uNightFactor.value = cfg.nightFactor;
  u.uMutedFactor.value = cfg.mutedFactor;
  u.uLampPos.value.copy(cfg.lampPos);
  u.uLampDir.value.copy(cfg.lampDir);
  u.uLampColor.value.copy(cfg.lampColor);
  u.uLampStrength.value = cfg.lampStrength;
}

/**
 * Inverted-hull indigo comic outline shader (supports InstancedMesh!).
 */
export function createComicOutlineMaterial(thickness = 0.035, color = "#16163d"): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: thickness },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      void main() {
        vec3 displaced = position + normalize(normal) * uThickness;
        vec4 localPos = vec4(displaced, 1.0);
        #ifdef USE_INSTANCING
          localPos = instanceMatrix * localPos;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * localPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
      }
    `,
    side: THREE.BackSide,
  });
}

/**
 * Comic-Print Sky Dome with crisp sky gradient, warm coral-amber twilight-dusk horizon glow band,
 * subtle halftone band transition, and crisp upper night stars.
 */
export function createComicSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uNightFactor: { value: 0.0 },
      uTime: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uNightFactor;
      uniform float uTime;
      varying vec3 vDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        float elev = clamp(d.y, -0.1, 1.0);

        // Daytime vibrant comic sky
        vec3 dayZenith = vec3(0.24, 0.62, 0.96);
        vec3 dayMid = vec3(0.49, 0.80, 0.99);
        vec3 dayHorizon = vec3(0.84, 0.94, 1.00);
        vec3 daySky = mix(dayHorizon, dayMid, smoothstep(0.0, 0.28, elev));
        daySky = mix(daySky, dayZenith, smoothstep(0.24, 0.72, elev));

        // Nighttime deep ultramarine comic sky with twilight-dusk coral/amber horizon glow
        vec3 nightZenith = vec3(0.03, 0.05, 0.16);
        vec3 nightMid = vec3(0.09, 0.12, 0.34);
        vec3 nightLower = vec3(0.22, 0.16, 0.44);
        vec3 duskGlow = vec3(0.92, 0.44, 0.36);

        vec3 nightSky = mix(nightLower, nightMid, smoothstep(0.03, 0.24, elev));
        nightSky = mix(nightSky, nightZenith, smoothstep(0.22, 0.68, elev));

        // Warm sunset/twilight ribbon right at the horizon so mountains & skyline pop in silhouette
        float horizonBand = exp(-pow((elev - 0.035) * 9.5, 2.0));
        nightSky = mix(nightSky, duskGlow, horizonBand * 0.58);

        // Crisp twinkling stars in the upper night sky
        if (uNightFactor > 0.2 && elev > 0.12) {
          vec2 starUv = vec2(atan(d.x, d.z) * 28.0, elev * 64.0);
          vec2 cellId = floor(starUv);
          vec2 cellLocal = fract(starUv) - 0.5;
          float rnd = hash21(cellId);
          if (rnd > 0.955) {
            float starRadius = 0.08 + fract(rnd * 91.7) * 0.10;
            float twinkle = 0.72 + 0.28 * sin(uTime * 2.4 + rnd * 40.0);
            float star = smoothstep(starRadius, 0.0, length(cellLocal)) * smoothstep(0.12, 0.32, elev);
            vec3 starCol = mix(vec3(1.0, 0.97, 0.86), vec3(0.75, 0.89, 1.0), fract(rnd * 37.3));
            nightSky += starCol * star * twinkle * 1.15;
          }
        }

        // Subtle comic halftone banding in sky transitions
        vec3 col = mix(daySky, nightSky, uNightFactor);
        float angle = 0.785398;
        mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        vec2 dotCell = fract((rot * gl_FragCoord.xy) / 7.5) - 0.5;
        float dotVal = step(length(dotCell), 0.20);
        float bandZone = smoothstep(0.14, 0.22, elev) * (1.0 - smoothstep(0.22, 0.34, elev));
        col = mix(col, col * 1.07, dotVal * bandZone * 0.45);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
}
