// Dedicated React Three Fiber host for LUMI (Pure GLSL3 Pink Raymarched SDF Shader + 3D Ruby-Red Bowtie)
// Strictly driven by useCurrentFrame() via LumiFrameState — zero useFrame().

import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { shapeIdToIndex } from "../ember/emberPhysics";
import { clamp01 } from "../shared/animation";
import type { LumiFrameState } from "./lumiRig";
import { createLumiShaderMaterial } from "./lumiShader";

export interface LumiCharacterProps {
  state: LumiFrameState;
  tSec: number;
  scale?: number;
}

export const LumiCharacter: React.FC<LumiCharacterProps> = ({
  state,
  tSec,
  scale = 1.0,
}) => {
  const { gl } = useThree();
  const lumiMat = useMemo(() => createLumiShaderMaterial(), []);

  useEffect(() => {
    return () => {
      lumiMat.dispose();
    };
  }, [lumiMat]);

  const bufSize = new THREE.Vector2();
  gl.getDrawingBufferSize(bufSize);

  const u = lumiMat.uniforms;
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
  u.uLumiPink.value = 1.0;

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
  u.uOpacity.value = clamp01(1 - state.wordReveal * 1.15);

  const handleBeforeRender = useMemo(() => {
    return (
      _renderer: THREE.WebGLRenderer,
      _scene: THREE.Scene,
      cam: THREE.Camera,
    ) => {
      cam.updateMatrixWorld();
      lumiMat.uniforms.uViewProj.value.multiplyMatrices(
        cam.projectionMatrix,
        cam.matrixWorldInverse,
      );
    };
  }, [lumiMat]);

  const showBowtie =
    state.wordReveal < 0.25 &&
    (state.shapeTo === "mochi" || state.morphBlend < 0.45);
  const bowtieScale =
    state.shapeTo === "mochi"
      ? 1.0
      : clamp01(1 - state.morphBlend * 2.2);

  return (
    <group name="lumi-character">
      {/* Raymarched pink SDF bounding box */}
      <mesh
        position={[state.position.x, state.position.y + 0.25, state.position.z]}
        material={lumiMat}
        renderOrder={12}
        onBeforeRender={handleBeforeRender}
      >
        <boxGeometry args={[7.5 * scale, 5.5 * scale, 7.5 * scale]} />
      </mesh>

      {/* Warm rose-pink practical light emitted by Lumi */}
      <pointLight
        position={[state.position.x, state.position.y + 0.15, state.position.z + 0.35]}
        color="#ff78be"
        intensity={4.2 * state.roseGlow}
        distance={6.0}
        decay={2}
      />

      {/* LUMI'S SIGNATURE 3D RUBY-RED BOWTIE WITH SECONDARY TILT & FLUTTERING RIBBON TAILS */}
      {showBowtie && bowtieScale > 0.02 && (
        <group
          position={[state.position.x, state.position.y, state.position.z]}
          rotation={[state.leanPitch, state.headingYaw, state.leanRoll]}
          scale={[
            state.squashScale[0] * scale * bowtieScale,
            state.squashScale[1] * scale * bowtieScale,
            state.squashScale[2] * scale * bowtieScale,
          ]}
        >
          <group
            position={[-0.24, 0.74, 0.10]}
            rotation={[0.10, 0.18, 0.42 + state.bowtieTilt]}
          >
            {/* Left plump ribbon wing (dark ink back-rim + bright ruby-red inner lobe) */}
            <mesh position={[-0.22, 0.02, -0.015]} rotation={[0, 0, 0.16]} scale={[1.18, 0.84, 0.46]} renderOrder={13}>
              <sphereGeometry args={[0.19, 16, 14]} />
              <meshBasicMaterial color="#4a091e" />
            </mesh>
            <mesh position={[-0.22, 0.02, 0.0]} rotation={[0, 0, 0.16]} scale={[1.06, 0.72, 0.42]} renderOrder={14}>
              <sphereGeometry args={[0.185, 16, 14]} />
              <meshStandardMaterial color="#ff2a62" emissive="#d91448" emissiveIntensity={0.35} roughness={0.35} />
            </mesh>
            <mesh position={[-0.20, 0.07, 0.068]} rotation={[0, 0, 0.22]} scale={[0.9, 0.35, 0.25]} renderOrder={15}>
              <sphereGeometry args={[0.075, 10, 10]} />
              <meshBasicMaterial color="#ff9ec0" />
            </mesh>

            {/* Right plump ribbon wing */}
            <mesh position={[0.22, 0.02, -0.015]} rotation={[0, 0, -0.16]} scale={[1.18, 0.84, 0.46]} renderOrder={13}>
              <sphereGeometry args={[0.19, 16, 14]} />
              <meshBasicMaterial color="#4a091e" />
            </mesh>
            <mesh position={[0.22, 0.02, 0.0]} rotation={[0, 0, -0.16]} scale={[1.06, 0.72, 0.42]} renderOrder={14}>
              <sphereGeometry args={[0.185, 16, 14]} />
              <meshStandardMaterial color="#ff2a62" emissive="#d91448" emissiveIntensity={0.35} roughness={0.35} />
            </mesh>
            <mesh position={[0.20, 0.07, 0.068]} rotation={[0, 0, -0.22]} scale={[0.9, 0.35, 0.25]} renderOrder={15}>
              <sphereGeometry args={[0.075, 10, 10]} />
              <meshBasicMaterial color="#ff9ec0" />
            </mesh>

            {/* Center plush knot + dark ink rim */}
            <mesh position={[0, 0, -0.01]} scale={[0.92, 1.05, 0.75]} renderOrder={14}>
              <sphereGeometry args={[0.115, 14, 12]} />
              <meshBasicMaterial color="#4a091e" />
            </mesh>
            <mesh position={[0, 0, 0.012]} scale={[0.82, 0.94, 0.72]} renderOrder={15}>
              <sphereGeometry args={[0.105, 14, 12]} />
              <meshStandardMaterial color="#ff477e" emissive="#e01950" emissiveIntensity={0.42} roughness={0.3} />
            </mesh>

            {/* Two fluttering ribbon tails below the knot */}
            <mesh
              position={[-0.08, -0.16, -0.02]}
              rotation={[0, 0, 0.32 + state.bowtieTailFlutter]}
              renderOrder={13}
            >
              <boxGeometry args={[0.075, 0.20, 0.028]} />
              <meshStandardMaterial color="#e01950" emissive="#8f0a30" emissiveIntensity={0.28} roughness={0.4} />
            </mesh>
            <mesh
              position={[0.08, -0.16, -0.02]}
              rotation={[0, 0, -0.32 - state.bowtieTailFlutter * 0.85]}
              renderOrder={13}
            >
              <boxGeometry args={[0.075, 0.20, 0.028]} />
              <meshStandardMaterial color="#e01950" emissive="#8f0a30" emissiveIntensity={0.28} roughness={0.4} />
            </mesh>
          </group>
        </group>
      )}
    </group>
  );
};
