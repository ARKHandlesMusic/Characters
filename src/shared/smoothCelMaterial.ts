// Completely Smooth Cel-Shaded Skinned Toon Material & Inverted-Hull Silhouette Outline
// Designed specifically for smooth articulated THREE.SkinnedMesh characters (BasePerson):
// - Full Three.js hardware/WebGL skinning support (54-bone skeleton)
// - Clean smooth antialiased 3-band cel shading (ZERO halftone dots, ZERO bumpy crease rings, ZERO noise!)
// - Paired BackSide inverted-hull outline draws crisp ink strictly around the outer silhouette!

import * as THREE from "three";
import type { HalftonePalette } from "./halftoneMaterial";

const SMOOTH_CEL_VERTEX = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 objectNormal = vec3(normal);
    #include <skinbase_vertex>
    #include <skinnormal_vertex>

    vec3 transformed = vec3(position);
    #include <skinning_vertex>

    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vWorldPos = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SMOOTH_CEL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3 uBaseColor;
  uniform vec3 uShadowColor;
  uniform vec3 uHighlightColor;
  uniform vec3 uRimColor;
  uniform float uRimStrength;

  uniform sampler2D uDecalMap;
  uniform float uHasDecal;

  uniform vec3 uLightDir;
  uniform vec3 uKeyColor;
  uniform vec3 uFillColor;
  uniform vec3 uPointPos;
  uniform vec3 uPointColor;
  uniform float uPointIntensity;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uLightDir);

    // Smooth wrapped directional light + practical room point light
    float ndl = dot(N, L) * 0.5 + 0.5;
    vec3 toPoint = uPointPos - vWorldPos;
    float pDist = length(toPoint);
    float pAtten = uPointIntensity / (1.0 + 0.16 * pDist * pDist);
    float pTerm = max(0.0, dot(N, toPoint / max(0.001, pDist))) * pAtten * 0.35;

    float lightVal = clamp(ndl * 0.88 + pTerm, 0.0, 1.0);

    // Buttery smooth antialiased 3-band cel ramp (zero dots, zero internal seam artifacts!)
    float bandMid = smoothstep(0.32, 0.44, lightVal);
    float bandHi = smoothstep(0.68, 0.80, lightVal);

    vec3 shadowTone = mix(uShadowColor, uBaseColor * 0.56, 0.35);
    vec3 midTone = uBaseColor * mix(vec3(0.92), uKeyColor, 0.45);
    vec3 hiTone = mix(midTone * 1.12, uHighlightColor, 0.38);

    vec3 col = mix(shadowTone, midTone, bandMid);
    col = mix(col, hiTone, bandHi);

    // Gentle hemisphere sky/ground bounce for smooth sculptural volume
    float hemi = N.y * 0.5 + 0.5;
    col += uBaseColor * mix(uShadowColor * 0.25, uFillColor * 0.22, hemi) * 0.42;

    // Soft grazing highlight rim on the lit side
    float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.2);
    float litSide = smoothstep(0.25, 0.75, ndl);
    col += uRimColor * fresnel * litSide * uRimStrength;

    // Screen-printed shirt graphic decal (e.g. real 3D winking Ember screenshot!)
    if (uHasDecal > 0.5 && vUv.x >= 0.0 && vUv.x <= 1.0 && vUv.y >= 0.0 && vUv.y <= 1.0) {
      vec4 decal = texture2D(uDecalMap, vUv);
      if (decal.a > 0.02) {
        // Gentle fabric cel lighting modulation so print sits organically on the hoodie cloth
        float fabricLight = mix(0.82, 1.05, bandMid * 0.72 + bandHi * 0.28);
        col = mix(col, decal.rgb * fabricLight, clamp(decal.a, 0.0, 1.0));
      }
    }

    // Smooth atmospheric depth fog
    float camDist = length(cameraPosition - vWorldPos);
    float fogFactor = 1.0 - exp(-pow(camDist * uFogDensity, 1.65));
    col = mix(col, uFogColor, clamp(fogFactor, 0.0, 0.92));

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

const SKINNED_OUTLINE_VERTEX = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>

  uniform float uOutlineWidth;
  varying vec3 vWorldPos;

  void main() {
    vec3 objectNormal = vec3(normal);
    #include <skinbase_vertex>
    #include <skinnormal_vertex>

    vec3 transformed = vec3(position);
    #include <skinning_vertex>

    // Inflate strictly outward along smooth skinned normal for clean silhouette ink
    transformed += normalize(objectNormal) * uOutlineWidth;

    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vWorldPos = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SKINNED_OUTLINE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3 uOutlineColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorldPos;

  void main() {
    float camDist = length(cameraPosition - vWorldPos);
    float fogFactor = 1.0 - exp(-pow(camDist * uFogDensity, 1.65));
    vec3 col = mix(uOutlineColor, uFogColor, clamp(fogFactor, 0.0, 0.92));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface SmoothCelMaterialOptions {
  baseColor: THREE.ColorRepresentation;
  shadowColor: THREE.ColorRepresentation;
  highlightColor?: THREE.ColorRepresentation;
  rimColor?: THREE.ColorRepresentation;
  rimStrength?: number;
  decalMap?: THREE.Texture | null;
}

const FALLBACK_DECAL_TEX = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
FALLBACK_DECAL_TEX.needsUpdate = true;

export function createSmoothCelMaterial(options: SmoothCelMaterialOptions): THREE.ShaderMaterial {
  const base = new THREE.Color(options.baseColor);
  const highlight = options.highlightColor
    ? new THREE.Color(options.highlightColor)
    : base.clone().lerp(new THREE.Color("#ffffff"), 0.22);

  return new THREE.ShaderMaterial({
    vertexShader: SMOOTH_CEL_VERTEX,
    fragmentShader: SMOOTH_CEL_FRAGMENT,
    uniforms: {
      uBaseColor: { value: base },
      uShadowColor: { value: new THREE.Color(options.shadowColor) },
      uHighlightColor: { value: highlight },
      uRimColor: { value: new THREE.Color(options.rimColor ?? "#fff7ea") },
      uRimStrength: { value: options.rimStrength ?? 0.22 },
      uDecalMap: { value: options.decalMap ?? FALLBACK_DECAL_TEX },
      uHasDecal: { value: options.decalMap ? 1.0 : 0.0 },
      uLightDir: { value: new THREE.Vector3(-0.30, 0.84, 0.62).normalize() },
      uKeyColor: { value: new THREE.Color("#fffaf0") },
      uFillColor: { value: new THREE.Color("#aebcd6") },
      uPointPos: { value: new THREE.Vector3(0, 2.4, 0.8) },
      uPointColor: { value: new THREE.Color("#fff3dc") },
      uPointIntensity: { value: 1.15 },
      uFogColor: { value: new THREE.Color("#cfc9be") },
      uFogDensity: { value: 0.01 },
    },
  });
}

export function createSkinnedOutlineMaterial(
  outlineColor: THREE.ColorRepresentation = "#14161f",
  outlineWidth = 0.0042,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SKINNED_OUTLINE_VERTEX,
    fragmentShader: SKINNED_OUTLINE_FRAGMENT,
    side: THREE.BackSide,
    uniforms: {
      uOutlineColor: { value: new THREE.Color(outlineColor) },
      uOutlineWidth: { value: outlineWidth },
      uFogColor: { value: new THREE.Color("#cfc9be") },
      uFogDensity: { value: 0.01 },
    },
  });
}

export function syncSmoothCelUniforms(mat: THREE.ShaderMaterial, palette: HalftonePalette): void {
  const u = mat.uniforms;
  if (u.uLightDir) u.uLightDir.value.copy(palette.lightDir).normalize();
  if (u.uKeyColor) u.uKeyColor.value.copy(palette.keyColor);
  if (u.uFillColor) u.uFillColor.value.copy(palette.fillColor);
  if (u.uPointPos) u.uPointPos.value.copy(palette.pointPos);
  if (u.uPointColor) u.uPointColor.value.copy(palette.pointColor);
  if (u.uPointIntensity) u.uPointIntensity.value = palette.pointIntensity;
  if (u.uFogColor) u.uFogColor.value.copy(palette.fogColor);
  if (u.uFogDensity) u.uFogDensity.value = palette.fogDensity;
}
