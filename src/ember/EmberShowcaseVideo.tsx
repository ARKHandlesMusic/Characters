// Dedicated 4K UHD (3840x2160, 30fps, 30s) EMBER Character Shader Showcase
// Showcases:
// 0.0-4.0s   : Flat 2D Ember inside muted glass surface -> squashes -> pushes face-first out -> ripples -> holds -> snaps onto stage
// 4.0-11.2s  : Alive breathing, swaying, curling nubs, organic flowing smooth-noise halftone, wave at 8.6s, bounce at 10.3s
// 11.2-20.7s : Spring-driven curved 2D smear dashes & morphs: Light Bulb -> Spinning Star -> Hopping Music Note -> ANYTHING word (eyes on two N's) -> Beating Heart
// 20.7-23.6s : Rubber Duck SDF coat -> Sleeve peel upward from bottom through pinching liquid neck -> Solid Duck revealed underneath!
// 23.6-26.5s : Translucent glossy toon+halftone skin coating around Camcorder (solid edges, solid eye dome & protruding fingers, see-through center!)
// 26.5-30.0s : Turns to screen, winds back, dives in slice-by-slice with ripples, lands inside screen as bouncing 2D drawing!

import React, { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, getRemotionEnvironment, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { emberShowcaseStateAt } from "./emberPhysics";
import { createScreenPortalMaterial } from "./emberShader";
import { EmberCharacter } from "./EmberCharacter";
import { clamp01, lerp, smootherstep } from "../shared/animation";
import { detectSoftwareGl } from "../shared/webglEnv";

const SolidRubberDuck: React.FC<{ position: [number, number, number]; scale: number; reveal: number }> = ({
  position,
  scale,
  reveal,
}) => {
  if (reveal <= 0.01) return null;
  const s = scale * (0.94 + 0.06 * reveal);
  return (
    <group position={position} scale={[s, s, s]}>
      {/* Plump golden rubber body */}
      <mesh position={[0, -0.26, -0.04]} scale={[0.56, 0.40, 0.62]}>
        <sphereGeometry args={[1, 28, 20]} />
        <meshStandardMaterial color="#ffd838" emissive="#5c3d00" emissiveIntensity={0.32} roughness={0.26} metalness={0.04} />
      </mesh>
      {/* Side wing contours */}
      <mesh position={[-0.46, -0.22, -0.06]} rotation={[0.1, 0.25, -0.25]} scale={[0.18, 0.22, 0.36]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color="#f5c628" emissive="#523500" emissiveIntensity={0.28} roughness={0.30} metalness={0.04} />
      </mesh>
      <mesh position={[0.46, -0.22, -0.06]} rotation={[0.1, -0.25, 0.25]} scale={[0.18, 0.22, 0.36]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color="#f5c628" emissive="#523500" emissiveIntensity={0.28} roughness={0.30} metalness={0.04} />
      </mesh>
      {/* Round head */}
      <mesh position={[0, 0.32, 0.10]}>
        <sphereGeometry args={[0.38, 26, 20]} />
        <meshStandardMaterial color="#ffdc44" emissive="#5c3d00" emissiveIntensity={0.32} roughness={0.24} metalness={0.04} />
      </mesh>
      {/* Upturned rubber tail */}
      <mesh position={[0, -0.06, -0.58]} rotation={[-0.65, 0, 0]}>
        <coneGeometry args={[0.18, 0.36, 18]} />
        <meshStandardMaterial color="#f8cb2e" emissive="#523500" emissiveIntensity={0.28} roughness={0.28} />
      </mesh>
      {/* Bright tangerine duck bill */}
      <mesh position={[0, 0.24, 0.48]} scale={[0.21, 0.10, 0.21]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color="#ff7726" emissive="#5e1f00" emissiveIntensity={0.3} roughness={0.24} metalness={0.04} />
      </mesh>
      {/* Glossy duck eyes */}
      <mesh position={[-0.17, 0.39, 0.41]}>
        <sphereGeometry args={[0.052, 14, 14]} />
        <meshStandardMaterial color="#120c0a" roughness={0.12} metalness={0.1} />
      </mesh>
      <mesh position={[0.17, 0.39, 0.41]}>
        <sphereGeometry args={[0.052, 14, 14]} />
        <meshStandardMaterial color="#120c0a" roughness={0.12} metalness={0.1} />
      </mesh>
      {/* Tiny white eye catchlights */}
      <mesh position={[-0.19, 0.41, 0.455]}>
        <sphereGeometry args={[0.017, 10, 10]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.15, 0.41, 0.455]}>
        <sphereGeometry args={[0.017, 10, 10]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
};

const SolidCamcorderProp: React.FC<{ position: [number, number, number]; scale: number; reveal: number }> = ({
  position,
  scale,
  reveal,
}) => {
  if (reveal <= 0.01) return null;
  const s = scale * 0.94;
  return (
    <group position={position} scale={[s, s, s]}>
      {/* Main muted charcoal matte body */}
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[1.04, 0.62, 0.80]} />
        <meshStandardMaterial color="#343a44" roughness={0.55} metalness={0.35} />
      </mesh>
      {/* Top metallic handle/viewfinder deck */}
      <mesh position={[0, 0.28, -0.04]}>
        <boxGeometry args={[0.56, 0.14, 0.56]} />
        <meshStandardMaterial color="#272c34" roughness={0.48} metalness={0.45} />
      </mesh>
      {/* Brushed cylindrical lens barrel */}
      <mesh position={[0, -0.06, 0.44]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.24, 0.34, 28]} />
        <meshStandardMaterial color="#232830" roughness={0.32} metalness={0.65} />
      </mesh>
      {/* Silver focus ring */}
      <mesh position={[0, -0.06, 0.52]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.23, 0.23, 0.06, 28]} />
        <meshStandardMaterial color="#8f98a6" roughness={0.28} metalness={0.78} />
      </mesh>
      {/* Dark optical glass lens */}
      <mesh position={[0, -0.06, 0.61]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.02, 24]} />
        <meshStandardMaterial color="#0e1726" roughness={0.08} metalness={0.85} />
      </mesh>
      {/* Side strap accent & REC tally lamp */}
      <mesh position={[0.36, 0.12, 0.41]}>
        <sphereGeometry args={[0.036, 12, 12]} />
        <meshBasicMaterial color="#e33e32" />
      </mesh>
      <mesh position={[-0.53, -0.08, 0.02]}>
        <boxGeometry args={[0.05, 0.34, 0.52]} />
        <meshStandardMaterial color="#1f232a" roughness={0.7} />
      </mesh>
    </group>
  );
};

interface EmberShowcaseSceneProps {
  frame: number;
  width: number;
  height: number;
  speed: number;
}

const EmberShowcaseScene: React.FC<EmberShowcaseSceneProps> = ({ frame, width, height, speed }) => {
  const { camera, invalidate } = useThree();
  const tSec = frame / 30;
  const emberState = emberShowcaseStateAt(tSec, speed);

  const portalMat = useMemo(() => createScreenPortalMaterial(), []);
  useEffect(() => {
    return () => {
      portalMat.dispose();
    };
  }, [portalMat]);

  // Update 2D glass screen portal uniforms
  const pu = portalMat.uniforms;
  pu.uTime.value = tSec;
  pu.uRippleTime.value = emberState.surfaceRippleTime;
  pu.uRippleOrigin.value.set(...emberState.surfaceRippleOrigin);
  pu.uFlatOpacity.value = emberState.flatDrawingOpacity;
  pu.uFlatPos.value.set(...emberState.flatDrawingPos);
  pu.uFlatSquash.value.set(...emberState.flatDrawingSquash);
  pu.uGlowBoost.value = emberState.clipPlaneEnabled ? 0.85 : 0.18;

  // Deterministic studio showcase camera framing:
  // Hero close-up during 4.2-10.0s so Ember's organic halftone & Eyes A fill the frame crisply,
  // smoothly pulling out for 10.3s bounce, 5-frame smear dashes, morph tour, sleeve peel & skin coat.
  const camPos = useMemo(() => new THREE.Vector3(), []);
  const camLook = useMemo(() => new THREE.Vector3(), []);

  if (tSec < 4.0) {
    const u = smootherstep(tSec / 4.0);
    camPos.set(lerp(0.18, 0.0, u), lerp(0.55, 0.28, u), lerp(3.55, 3.22, u));
    camLook.set(0, 0.12, lerp(-1.1, 0.25, u));
  } else if (tSec < 9.8) {
    // Lush hero close-up matching Reference Images 2, 3, 4 (full crown + 5 feet framed cleanly!)
    const sway = Math.sin((tSec - 4.0) * 0.55) * 0.22;
    camPos.set(sway, 0.26, 3.22);
    camLook.set(emberState.position.x * 0.35, 0.02, 0.32);
  } else if (tSec < 11.2) {
    // Pull back cleanly for 10.3s joyful bounce & upcoming smear dashes
    const u = smootherstep((tSec - 9.8) / 1.15);
    camPos.set(lerp(0.0, 0.0, u), lerp(0.26, 0.68, u), lerp(3.22, 5.25, u));
    camLook.set(0, lerp(0.02, 0.34, u), 0.25);
  } else if (tSec < 20.7) {
    // Wide clean stage framing for Light Bulb -> Star -> Music Note -> ANYTHING -> Heart
    const trackX = emberState.position.x * 0.18;
    const trackY = emberState.position.y * 0.16;
    camPos.set(trackX, 0.68 + trackY, 5.25);
    camLook.set(trackX * 0.6, 0.32 + trackY * 0.6, 0.25);
  } else if (tSec < 23.6) {
    // Closer hero study of Rubber Duck coat + sleeve peel upward!
    const u = smootherstep((tSec - 20.7) / 0.65);
    camPos.set(lerp(0.0, -0.85, u), lerp(0.68, 0.55, u), lerp(5.25, 3.65, u));
    camLook.set(lerp(0.0, -1.12, u), lerp(0.32, 0.28, u), 0.42);
  } else if (tSec < 26.5) {
    // Closer hero study of Translucent Skin Coating around Camcorder!
    const u = smootherstep((tSec - 23.6) / 0.65);
    camPos.set(lerp(-0.85, 0.98, u), lerp(0.55, 0.48, u), lerp(3.65, 3.55, u));
    camLook.set(lerp(-1.12, 1.28, u), lerp(0.28, 0.16, u), 0.34);
  } else {
    // Pull back to center for turn, wind-back & dive slice-by-slice into 2D glass portal!
    const u = smootherstep((tSec - 26.5) / 0.75);
    camPos.set(lerp(0.98, 0.12, u), lerp(0.48, 0.52, u), lerp(3.55, 4.05, u));
    camLook.set(lerp(1.28, 0.0, u), lerp(0.16, 0.2, u), lerp(0.34, -0.95, u));
  }

  useLayoutEffect(() => {
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 40;
      camera.aspect = width / height;
      camera.near = 0.1;
      camera.far = 80;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    invalidate();
  }, [camera, camPos, camLook, width, height, frame, invalidate]);

  const duckVisible = tSec >= 21.65 && tSec <= 25.0 ? clamp01((tSec - 21.65) / 0.25) : 0;
  const camcorderVisible = tSec >= 23.9 && tSec <= 27.2 ? clamp01((tSec - 23.9) / 0.22) : 0;

  return (
    <>
      {/* Muted neutral charcoal studio backdrop & lighting — Ember is the sole unmuted warm glow */}
      <color attach="background" args={["#14171d"]} />
      <fog attach="fog" args={["#14171d", 10, 26]} />

      <ambientLight intensity={0.42} color="#b9c3d4" />
      <directionalLight position={[-3.5, 5.5, 4.0]} intensity={0.85} color="#dfe7f5" />
      <directionalLight position={[3.0, 2.5, -2.0]} intensity={0.35} color="#8fa0bd" />

      {/* Clean matte muted studio stage floor (no desk clutter — pure character study) */}
      <mesh position={[0, -0.58, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#1d2129" roughness={0.82} metalness={0.08} />
      </mesh>

      {/* Subtle sleek 2D glass viewport surface where Ember emerges & dives back in */}
      <group position={[0, 0.72, -1.65]}>
        {/* Thin dark bezel frame */}
        <mesh position={[0, 0, -0.04]}>
          <boxGeometry args={[4.42, 2.74, 0.06]} />
          <meshStandardMaterial color="#0f1217" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Active 2D shader glass surface (draws flat 2D Ember + expanding orange ripples!) */}
        <mesh material={portalMat}>
          <planeGeometry args={[4.24, 2.56]} />
        </mesh>
      </group>

      {/* Solid Golden Rubber Duck revealed cleanly underneath Ember's upward-peeling sleeve! */}
      <SolidRubberDuck position={[-1.25, 0.05, 0.45]} scale={1.12} reveal={duckVisible} />

      {/* Solid Camcorder Prop visible right through Ember's translucent glossy skin coat! */}
      <SolidCamcorderProp position={[1.35, 0.06, 0.35]} scale={1.12} reveal={camcorderVisible} />

      {/* EMBER — Pure GLSL Raymarched SDF Shader Character */}
      <EmberCharacter state={emberState} tSec={tSec} scale={1.12} />
    </>
  );
};

export interface EmberShowcaseVideoProps {
  speed?: number;
}

export const EmberShowcaseVideo: React.FC<EmberShowcaseVideoProps> = ({ speed = 1.0 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const isRendering = getRemotionEnvironment().isRendering;
  const isSoftGl = useMemo(() => detectSoftwareGl(), []);

  return (
    <AbsoluteFill style={{ backgroundColor: "#14171d" }} data-testid="ember-showcase-stage">
      <ThreeCanvas
        width={width}
        height={height}
        frameloop="demand"
        dpr={isSoftGl && !isRendering ? 0.5 : 1}
        gl={{
          antialias: !isSoftGl,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
        }}
        camera={{ fov: 40, near: 0.1, far: 80, position: [0, 0.5, 3.5] }}
      >
        <EmberShowcaseScene frame={frame} width={width} height={height} speed={speed} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
