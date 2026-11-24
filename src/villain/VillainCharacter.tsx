// React Three Fiber host for the VILLAIN (Pure GLSL3 Raymarched SDF Shader)
// Larger beach-ball black sphere with dark-red outline, two cartoony spring antennas,
// red eyes with pale glints, and unzipping red seam mouth. Zero useFrame().

import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { type VillainFrameState } from "./villainPhysics";
import { createVillainShaderMaterial } from "./villainShader";

export interface VillainCharacterProps {
  state: VillainFrameState;
  tSec: number;
  scale?: number;
}

export const VillainCharacter: React.FC<VillainCharacterProps> = ({
  state,
  tSec,
  scale = 1.48,
}) => {
  const { gl } = useThree();
  const villainMat = useMemo(() => createVillainShaderMaterial(), []);

  useEffect(() => {
    return () => {
      villainMat.dispose();
    };
  }, [villainMat]);

  const bufSize = new THREE.Vector2();
  gl.getDrawingBufferSize(bufSize);

  const u = villainMat.uniforms;
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
  u.uBreath.value = state.breath;

  u.uAntennaDir.value.set(...state.antennaDir);
  u.uAntennaStretch.value = state.antennaStretch;
  u.uAntennaSproing.value = state.antennaSproing;
  u.uAntennaSpread.value = state.antennaSpread;

  u.uMouthUnzip.value = state.mouthUnzip;
  u.uMouthChew.value = state.mouthChew;

  u.uBlink.value = state.blink;
  u.uEyelidCalm.value = state.eyelidCalm;
  u.uEyeGlance.value.set(...state.eyeGlance);

  u.uTrail0.value.set(...state.trailWorld[0]);
  u.uTrail1.value.set(...state.trailWorld[1]);
  u.uTrail2.value.set(...state.trailWorld[2]);
  u.uTrail3.value.set(...state.trailWorld[3]);
  u.uSmear.value = state.smearStrength;
  u.uOpacity.value = state.opacity;

  // Populate exact camera ViewProj right before draw so gl_FragDepth occludes crisply with Ember & real props!
  const handleBeforeRender = useMemo(() => {
    return (
      _renderer: THREE.WebGLRenderer,
      _scene: THREE.Scene,
      cam: THREE.Camera,
    ) => {
      cam.updateMatrixWorld();
      villainMat.uniforms.uViewProj.value.multiplyMatrices(
        cam.projectionMatrix,
        cam.matrixWorldInverse,
      );
    };
  }, [villainMat]);

  return (
    <group>
      {/* Large raymarched SDF bounding box covering beach-ball body + tall periscope antennas + lunge smear */}
      <mesh
        position={[state.position.x, state.position.y + 0.45 * scale, state.position.z]}
        material={villainMat}
        renderOrder={11}
        onBeforeRender={handleBeforeRender}
      >
        <boxGeometry args={[6.4 * scale, 6.2 * scale, 6.4 * scale]} />
      </mesh>

      {/* Subtle deep-crimson ambient rim light cast near the Villain's red outline & eyes */}
      <pointLight
        position={[state.position.x, state.position.y + 0.1, state.position.z + 0.4]}
        color="#d92030"
        intensity={1.6 + state.mouthUnzip * 1.4}
        distance={4.5}
        decay={2}
      />
    </group>
  );
};
