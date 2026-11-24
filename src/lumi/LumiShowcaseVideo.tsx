// Dedicated 4K UHD (3840x2160, 30fps, 16s) LUMI Character Rig & Shader Showcase
// Showcases Lumi's full pink raymarched SDF rig, animated 3D ruby-red bowtie with fluttering tails,
// joyful arm waves, elastic squash-and-stretch bounce, curved smear dashes, and Heart/Star SDF morphs!

import React, { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, getRemotionEnvironment, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { detectSoftwareGl } from "../shared/webglEnv";
import { LumiCharacter } from "./LumiCharacter";
import { lumiShowcaseStateAt } from "./lumiRig";

export interface LumiShowcaseVideoProps {
  speed?: number;
}

interface LumiStudioSceneProps {
  frame: number;
  width: number;
  height: number;
  speed: number;
}

const LumiStudioScene: React.FC<LumiStudioSceneProps> = ({ frame, width, height, speed }) => {
  const { camera, invalidate } = useThree();
  const tSec = frame / 30;
  const lumi = lumiShowcaseStateAt(tSec, speed);

  const camPos = useMemo(() => new THREE.Vector3(), []);
  const camLook = useMemo(() => new THREE.Vector3(), []);

  // Gentle studio camera softly tracking Lumi's position
  camPos.set(lumi.position.x * 0.28 + Math.sin(tSec * 0.45) * 0.16, 0.72 + lumi.position.y * 0.15, 3.65);
  camLook.set(lumi.position.x * 0.42, 0.36 + lumi.position.y * 0.35, 0.0);

  useLayoutEffect(() => {
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 42;
      camera.aspect = width / height;
      camera.near = 0.08;
      camera.far = 60;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    invalidate();
  }, [camera, camPos, camLook, width, height, frame, invalidate]);

  return (
    <>
      {/* Clean muted plum-slate cyclorama stage so Lumi's pastel pink glow & ruby bowtie pop */}
      <color attach="background" args={["#231b2c"]} />
      <fog attach="fog" args={["#231b2c", 10, 26]} />

      <ambientLight intensity={0.85} color="#f8e0ef" />
      <directionalLight position={[-3.2, 5.8, 4.4]} intensity={1.15} color="#fff2f8" />
      <directionalLight position={[3.6, 2.8, -2.2]} intensity={0.55} color="#e0b0d4" />

      {/* Matte cyclorama floor + soft contact shadow tracking Lumi */}
      <mesh position={[0, -0.56, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[28, 28]} />
        <meshStandardMaterial color="#30243d" roughness={0.84} metalness={0.04} />
      </mesh>
      <mesh position={[0, 4.2, -5.2]}>
        <planeGeometry args={[28, 12]} />
        <meshStandardMaterial color="#271d32" roughness={0.92} />
      </mesh>
      <mesh
        position={[lumi.position.x, -0.545, lumi.position.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[
          Math.max(0.45, 0.88 - lumi.position.y * 0.18),
          Math.max(0.45, 0.88 - lumi.position.y * 0.18),
          1,
        ]}
      >
        <circleGeometry args={[0.72, 32]} />
        <meshBasicMaterial color="#120b1a" transparent opacity={0.34} depthWrite={false} />
      </mesh>

      {/* Hero Lumi Character */}
      <LumiCharacter state={lumi} tSec={tSec} scale={1.12} />
    </>
  );
};

export const LumiShowcaseVideo: React.FC<LumiShowcaseVideoProps> = ({ speed = 1.0 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const isRendering = getRemotionEnvironment().isRendering;
  const isSoftGl = useMemo(() => detectSoftwareGl(), []);

  return (
    <AbsoluteFill style={{ backgroundColor: "#231b2c" }} data-testid="lumi-showcase-stage">
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
        camera={{ fov: 42, near: 0.08, far: 60, position: [0, 0.72, 3.65] }}
      >
        <LumiStudioScene frame={frame} width={width} height={height} speed={speed} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
