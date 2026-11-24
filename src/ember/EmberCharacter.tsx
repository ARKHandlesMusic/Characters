// React Three Fiber host for EMBER (Pure GLSL Raymarched SDF Shader) + Word Morph ("ANYTHING") + Peeled/Coated Real Props
// Strictly driven by useCurrentFrame() via EmberFrameState — zero useFrame().

import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { type EmberFrameState, shapeIdToIndex } from "./emberPhysics";
import { createEmberShaderMaterial } from "./emberShader";
import { clamp01, entranceEnvelope } from "../shared/animation";

export interface EmberCharacterProps {
  state: EmberFrameState;
  tSec: number;
  scale?: number;
}

/**
 * Procedural CanvasTexture for a single bold cartoon orange-halftone letter (ANYTHING word morph).
 */
function createWordLetterTexture(char: string, withEyes: boolean, blink: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, 256, 320);

  // Two-tone warm apricot-to-tangerine gradient fill
  const grad = ctx.createLinearGradient(0, 30, 220, 290);
  grad.addColorStop(0, "#ffe2a8");
  grad.addColorStop(0.52, "#ffd187");
  grad.addColorStop(0.55, "#f28852");
  grad.addColorStop(1, "#e8723d");

  ctx.font = "900 250px 'Arial Black', Impact, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Dark espresso cartoon outline
  ctx.lineWidth = 22;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#361810";
  ctx.strokeText(char, 128, 172);

  // Orange-cream toon body fill
  ctx.fillStyle = grad;
  ctx.fillText(char, 128, 172);

  // Subtle organic cream halftone dots clipped inside the letter
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "rgba(255, 244, 214, 0.52)";
  for (let y = 24; y < 300; y += 22) {
    for (let x = 24; x < 240; x += 22) {
      const r = 3.2 + Math.sin(x * 0.05 + y * 0.04) * 2.1;
      ctx.beginPath();
      ctx.arc(x + Math.sin(y * 0.06) * 4, y, Math.max(1.5, r), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // If this is one of the two N's (the word's two widest strokes!), place Ember's Eye A cleanly on it!
  if (withEyes) {
    const ry = Math.max(3, 28 * (1 - blink * 0.92));
    ctx.fillStyle = "#0e0806";
    ctx.beginPath();
    ctx.ellipse(128, 166, 17, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    if (blink < 0.65) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(122, 155, 6, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(134, 176, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const EmberCharacter: React.FC<EmberCharacterProps> = ({
  state,
  tSec,
  scale = 1.0,
}) => {
  const { gl } = useThree();
  const emberMat = useMemo(() => createEmberShaderMaterial(), []);

  // Pre-build textured letter cards for the "ANYTHING" word morph (eyes land on the 2 N's: index 1 and 6!)
  const wordLetters = useMemo(() => {
    const chars = "ANYTHING".split("");
    return chars.map((ch, idx) => ({
      ch,
      idx,
      hasEye: idx === 1 || idx === 6, // The two N's — the word's two widest strokes either side of middle!
      texOpen: createWordLetterTexture(ch, idx === 1 || idx === 6, 0),
      texBlink: createWordLetterTexture(ch, idx === 1 || idx === 6, 0.95),
    }));
  }, []);

  // Soft feathered radial glow sprite texture (ZERO hard circular edge around Ember's scaredGlow!)
  const scaredGlowTex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0.0, "rgba(255, 246, 200, 0.95)");
    grad.addColorStop(0.35, "rgba(255, 214, 130, 0.45)");
    grad.addColorStop(0.72, "rgba(255, 178, 86, 0.12)");
    grad.addColorStop(1.0, "rgba(255, 178, 86, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  useEffect(() => {
    return () => {
      emberMat.dispose();
      scaredGlowTex.dispose();
      wordLetters.forEach((l) => {
        l.texOpen.dispose();
        l.texBlink.dispose();
      });
    };
  }, [emberMat, scaredGlowTex, wordLetters]);

  // Measure EXACT physical drawing-buffer resolution so halftone dots are razor-sharp at any DPR/4K
  const bufSize = new THREE.Vector2();
  gl.getDrawingBufferSize(bufSize);

  const u = emberMat.uniforms;
  u.uTime.value = tSec;
  u.uResolution.value.set(Math.max(1, bufSize.x), Math.max(1, bufSize.y));
  u.uCenter.value.copy(state.position);
  u.uSquash.value.set(
    state.squashScale[0] * scale,
    state.squashScale[1] * scale,
    state.squashScale[2] * scale,
  );
  u.uYaw.value = state.headingYaw;
  u.uPitch.value = state.leanPitch;
  u.uRoll.value = state.leanRoll;
  u.uSkirtTrail.value.set(...state.skirtTrail);
  u.uFootPhase.value = state.footRipplePhase;
  u.uFootAmp.value = state.footRippleAmp;
  u.uBreath.value = state.breath;
  u.uWaveLeft.value = state.waveLeft;
  u.uWaveRight.value = state.waveRight;

  u.uShapeFrom.value = shapeIdToIndex(state.shapeFrom);
  u.uShapeTo.value = shapeIdToIndex(state.shapeTo);
  u.uMorph.value = state.morphBlend;
  u.uActionTime.value = state.shapeActionPhase;
  u.uBulbLit.value = state.bulbLit;
  u.uScaredGlow.value = state.scaredGlow ?? 0;
  u.uLumiPink.value = 0.0;

  u.uPeel.value = state.peelProgress;
  u.uSkinMode.value = state.skinCoatMode;

  u.uTrail0.value.set(...state.trailWorld[0]);
  u.uTrail1.value.set(...state.trailWorld[1]);
  u.uTrail2.value.set(...state.trailWorld[2]);
  u.uTrail3.value.set(...state.trailWorld[3]);
  u.uTrail4.value.set(...state.trailWorld[4]);
  u.uSmear.value = state.smearStrength;

  u.uClipEnabled.value = state.clipPlaneEnabled ? 1.0 : 0.0;
  u.uClipPoint.value.set(...state.clipPlanePoint);
  u.uClipNormal.value.set(...state.clipPlaneNormal);

  u.uLeftEyePos.value.set(...state.leftEye.offset);
  u.uRightEyePos.value.set(...state.rightEye.offset);
  u.uLeftEyeStretch.value.set(state.leftEye.stretchX, state.leftEye.stretchY);
  u.uRightEyeStretch.value.set(state.rightEye.stretchX, state.rightEye.stretchY);
  u.uEyeBlink.value.set(state.leftEye.blink, state.rightEye.blink);
  u.uEyeSquint.value = state.leftEye.squint;
  u.uEyeGlance.value.set(...state.leftEye.glance);

  // Fade out central SDF blob cleanly while expanded into the 8-letter ANYTHING word
  u.uOpacity.value = clamp01(1 - state.wordReveal * 1.15);

  const handleBeforeRender = useMemo(() => {
    return (
      _renderer: THREE.WebGLRenderer,
      _scene: THREE.Scene,
      cam: THREE.Camera,
    ) => {
      cam.updateMatrixWorld();
      emberMat.uniforms.uViewProj.value.multiplyMatrices(
        cam.projectionMatrix,
        cam.matrixWorldInverse,
      );
    };
  }, [emberMat]);

  const isBlinking = state.leftEye.blink > 0.55;

  return (
    <group>
      {/* Raymarched SDF bounding box centered around Ember (large enough to cover full curved smear trail & peel rise) */}
      <mesh
        position={[state.position.x, state.position.y + 0.25, state.position.z]}
        material={emberMat}
        renderOrder={12}
        onBeforeRender={handleBeforeRender}
      >
        <boxGeometry args={[7.5 * scale, 5.5 * scale, 7.5 * scale]} />
      </mesh>

      {/* Warm practical light emitted by Ember (orange/gold) */}
      {(() => {
        const scared = clamp01(state.scaredGlow ?? 0);
        const lightColor = scared > 0.35 ? "#ffdf96" : "#ff9944";
        return (
          <>
            <pointLight
              position={[state.position.x, state.position.y + 0.15, state.position.z + 0.35]}
              color={lightColor}
              intensity={4.2 * state.glowIntensity + scared * 16.0}
              distance={5.5 + scared * 10.5}
              decay={2}
            />
            {scared > 0.12 && (
              <sprite
                position={[state.position.x, state.position.y + 0.08, state.position.z - 0.12]}
                scale={[(2.8 + scared * 1.6) * scale, (2.8 + scared * 1.6) * scale, 1]}
                renderOrder={11}
              >
                <spriteMaterial
                  map={scaredGlowTex}
                  color="#ffe49e"
                  transparent
                  opacity={scared * 0.65}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </sprite>
            )}
          </>
        );
      })()}

      {/* 3D WORD MORPH ("ANYTHING"): Letters pop in left-to-right and ripple, eyes on the two N's! */}
      {state.wordReveal > 0.02 && (
        <group position={[state.position.x, state.position.y + 0.12, state.position.z + 0.2]}>
          {wordLetters.map((item) => {
            const delay = item.idx * 0.045;
            const pop = entranceEnvelope(state.shapeActionPhase - delay + 0.22, 0.34);
            const rippleY = Math.sin(tSec * 6.5 - item.idx * 0.65) * 0.09 * state.wordReveal;
            const tiltZ = Math.sin(tSec * 4.2 - item.idx * 0.5) * 0.07;
            const sc = Math.max(0.001, pop * state.wordReveal * 0.68 * scale);
            const x = (item.idx - 3.5) * 0.52 * scale;
            return (
              <mesh
                key={item.idx}
                position={[x, rippleY, 0]}
                rotation={[0, 0, tiltZ]}
                scale={[sc, sc, 1]}
                renderOrder={14}
              >
                <planeGeometry args={[0.82, 1.02]} />
                <meshBasicMaterial
                  map={isBlinking && item.hasEye ? item.texBlink : item.texOpen}
                  transparent
                  side={THREE.DoubleSide}
                />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
};
