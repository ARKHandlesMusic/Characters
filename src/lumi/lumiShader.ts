// Dedicated Pink GLSL3 Raymarched SDF Shader Material for LUMI
// Configures the organic flowing halftone mochi SDF shader in Lumi's signature pastel-pink palette.

import * as THREE from "three";
import { createEmberShaderMaterial } from "../ember/emberShader";

export function createLumiShaderMaterial(): THREE.ShaderMaterial {
  const mat = createEmberShaderMaterial();
  mat.uniforms.uLumiPink.value = 1.0;
  return mat;
}
