// Dedicated 4K UHD (3840x2160, 30fps, 16s) VILLAIN Solo Rig & Shader Showcase
// Showcases the Villain's glossy obsidian-black beach-ball SDF body, dark-red silhouette outline,
// two expressive radar/periscope/sproing antennas, crimson eyes with pale glints,
// unzipping red outline seam mouth, and dignified slow blink.

import React, { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, getRemotionEnvironment, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { detectSoftwareGl } from "../shared/webglEnv";
import { VillainCharacter } from "./VillainCharacter";
import { villainShowcaseStateAt } from "./villainPhysics";

export interface VillainShowcaseVideoProps {
  speed?: number;
}

interface VillainStudioSceneProps {
  frame: number;
  width: number;
  height: number;
  speed: number;
}

const VillainStudioScene: React.FC<VillainStudioSceneProps> = ({ frame, width, height, speed }) => {
  const { camera, invalidate } = useThree();
  const tSec = frame / 30;
  const villain = villainShowcaseStateAt(tSec, speed);

  const camPos = useMemo(() => new THREE.Vector3(), []);
  const camLook = useMemo(() => new THREE.Vector3(), []);

  // Composed studio camera framing full beach-ball body + tall periscope antennas cleanly
  camPos.set(villain.position.x * 0.26 + Math.sin(tSec * 0.38) * 0.16, 0.86, 4.55);
  camLook.set(villain.position.x * 0.38, 0.56, 0.0);

  useLayoutEffect(() => {
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 42;
      camera.aspect = width / height;
      camera.near = 0.08;
      camera.far = 70;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    invalidate();
  }, [camera, camPos, camLook, width, height, frame, invalidate]);

  return (
    <>
      {/* Muted slate-obsidian studio cyclorama so dark-red outline & crimson eyes pop crisply */}
      <color attach="background" args={["#1c202a"]} />
      <fog attach="fog" args={["#1c202a", 11, 28]} />

      <ambientLight intensity={0.86} color="#d6deee" />
      <directionalLight position={[-3.8, 6.0, 4.5]} intensity={1.18} color="#f2f6ff" />
      <directionalLight position={[3.8, 2.8, -2.5]} intensity={0.58} color="#d48c98" />

      {/* Studio stage floor + back cyclorama wall + contact shadow */}
      <mesh position={[0, -0.78, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#2a303e" roughness={0.82} metalness={0.05} />
      </mesh>
      <mesh position={[0, 4.4, -5.6]}>
        <planeGeometry args={[30, 12]} />
        <meshStandardMaterial color="#212632" roughness={0.92} />
      </mesh>
      <mesh
        position={[villain.position.x, -0.765, villain.position.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[1.05, 32]} />
        <meshBasicMaterial color="#0b0d14" transparent opacity={0.42} depthWrite={false} />
      </mesh>

      {/* Hero Villain Character */}
      <VillainCharacter state={villain} tSec={tSec} scale={1.48} />
    </>
  );
};

export const VillainShowcaseVideo: React.FC<VillainShowcaseVideoProps> = ({ speed = 1.0 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const isRendering = getRemotionEnvironment().isRendering;
  const isSoftGl = useMemo(() => detectSoftwareGl(), []);

  return (
    <AbsoluteFill style={{ backgroundColor: "#1c202a" }} data-testid="villain-showcase-stage">
      <ThreeCanvas
        width={width}
        height={height}
        frameloop="demand"
        dpr={isSoftGl && !isRendering ? 0.35 : 1}
        gl={{
          antialias: !isSoftGl,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
        }}
        camera={{ fov: 42, near: 0.08, far: 70, position: [0, 0.86, 4.55] }}
      >
        <VillainStudioScene frame={frame} width={width} height={height} speed={speed} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
