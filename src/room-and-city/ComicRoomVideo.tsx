// Remotion 4K UHD (3840x2160, 30fps) Comic-Print Bedroom & 25-Block 3D Metropolis Stage
// Pure environment showcase supporting Day, Night, and Muted lighting modes across Room & City presets.

import React, { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, getRemotionEnvironment, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { detectSoftwareGl } from "../shared/webglEnv";
import type { RoomLightingMode } from "./comicPrintShader";
import {
  type RoomCameraPreset,
  evaluateRoomCamera,
  generateCityLayout,
  getComicLightingConfig,
} from "./comicRoomPresets";
import { ComicBedroom } from "./ComicBedroom";
import { ComicCityWorld } from "./ComicCityWorld";

export interface ComicRoomVideoProps {
  lightingMode?: RoomLightingMode;
  cameraPreset?: RoomCameraPreset;
}

export interface ComicRoomSceneProps {
  frame: number;
  fps: number;
  durationInFrames: number;
  width: number;
  height: number;
  lightingMode: RoomLightingMode;
  cameraPreset: RoomCameraPreset;
}

export const ComicRoomScene: React.FC<ComicRoomSceneProps> = ({
  frame,
  fps,
  durationInFrames,
  width,
  height,
  lightingMode,
  cameraPreset,
}) => {
  const { camera, invalidate } = useThree();
  const tSec = frame / fps;
  const durationSec = durationInFrames / fps;

  const layout = useMemo(() => generateCityLayout(), []);
  const lighting = useMemo(() => getComicLightingConfig(lightingMode), [lightingMode]);
  const camState = evaluateRoomCamera(cameraPreset, tSec, durationSec);

  useLayoutEffect(() => {
    camera.position.set(camState.position[0], camState.position[1], camState.position[2]);
    camera.lookAt(camState.lookAt[0], camState.lookAt[1], camState.lookAt[2]);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = camState.fov;
      camera.aspect = width / height;
      camera.near = 0.06;
      camera.far = 520;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    invalidate();
  }, [camera, camState, width, height, frame, invalidate]);

  const ambientVal = lightingMode === "night" ? 0.56 : 0.85;

  return (
    <>
      <color attach="background" args={[lightingMode === "night" ? "#070b1c" : "#7cc6ff"]} />
      <ambientLight intensity={ambientVal} />
      {lightingMode === "night" && (
        <pointLight position={[-1.42, 1.32, -1.94]} color="#fff0c4" intensity={1.8} distance={5.0} />
      )}

      {/* Full 25-Block 3D Comic-Print Metropolis */}
      <ComicCityWorld
        layout={layout}
        lighting={lighting}
        tSec={tSec}
        cameraPos={camState.position}
      />

      {/* Ultra-Detailed Smoothed Comic-Print 3D Bedroom */}
      <ComicBedroom lighting={lighting} />
    </>
  );
};

export const ComicRoomVideo: React.FC<ComicRoomVideoProps> = ({
  lightingMode = "day",
  cameraPreset = "wide",
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const isRendering = getRemotionEnvironment().isRendering;
  const isSoftGl = useMemo(() => detectSoftwareGl(), []);

  return (
    <AbsoluteFill
      style={{ backgroundColor: lightingMode === "night" ? "#0b1029" : "#7cc6ff" }}
      data-testid="comic-room-stage"
    >
      <ThreeCanvas
        width={width}
        height={height}
        frameloop="demand"
        dpr={isSoftGl && !isRendering ? 0.5 : 1}
        gl={{
          antialias: !isSoftGl,
          stencil: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
        }}
        camera={{ fov: 47, near: 0.06, far: 520, position: [-1.42, 1.66, 2.38] }}
      >
        <ComicRoomScene
          frame={frame}
          fps={fps}
          durationInFrames={durationInFrames}
          width={width}
          height={height}
          lightingMode={lightingMode}
          cameraPreset={cameraPreset}
        />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
