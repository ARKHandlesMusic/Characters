// Dedicated 4K UHD (3840x2160, 30fps, 16s) Standing T-Pose Base Person Showcase
// Set inside the Ultra-Detailed Comic-Print Bedroom with a genuine 3D Comic-Print City World
// outside the real cutout window (NO flat window image!).
// Center hero: BasePerson (54-bone smooth cel-shaded rig, red ribbed beanie, hoodless green crewneck shirt
// with real 3D winking Ember print, vibrant yellow jeans, smooth hands & grounded socks/trainers) in his
// living standing T-pose (4s breath, independent calm limb drift, shoulder roll, scroll flicks & hand tap).

import React, { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, getRemotionEnvironment, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import type { FootwearMode, PersonPoseMode } from "./basePersonRig";
import {
  type RoomLightingMode,
  generateCityLayout,
  getComicLightingConfig,
} from "../room-and-city/comicRoomPresets";
import type { HalftonePalette } from "../shared/halftoneMaterial";
import { detectSoftwareGl } from "../shared/webglEnv";
import { BasePerson } from "./BasePerson";
import { ComicBedroom } from "../room-and-city/ComicBedroom";
import { ComicCityWorld } from "../room-and-city/ComicCityWorld";

export interface BasePersonVideoProps {
  pose?: PersonPoseMode;
  footwear?: FootwearMode;
  lightingMode?: RoomLightingMode;
  heavier?: number;
  slimmer?: number;
  broader?: number;
  curvier?: number;
}

interface BasePersonStudioSceneProps {
  frame: number;
  width: number;
  height: number;
  pose: PersonPoseMode;
  footwear: FootwearMode;
  lightingMode: RoomLightingMode;
  shape: { heavier: number; slimmer: number; broader: number; curvier: number };
}

const BasePersonStudioScene: React.FC<BasePersonStudioSceneProps> = ({
  frame,
  width,
  height,
  pose,
  footwear,
  lightingMode,
  shape,
}) => {
  const { camera, invalidate } = useThree();
  const tSec = frame / 30;

  const layout = useMemo(() => generateCityLayout(), []);
  const lighting = useMemo(() => getComicLightingConfig(lightingMode), [lightingMode]);

  // Sync BasePerson's smooth cel lighting palette cleanly with the active Comic Print room lighting!
  const palette = useMemo<HalftonePalette>(() => {
    const isNight = lighting.mode === "night";
    return {
      paperColor: new THREE.Color(isNight ? "#1a1f4a" : "#f7f3eb"),
      fogColor: lighting.fogColor.clone(),
      fogDensity: 0.0,
      lightDir: new THREE.Vector3(-0.32, 0.82, 0.56).normalize(),
      keyColor: new THREE.Color(isNight ? "#fff5d8" : "#fffcf4"),
      fillColor: new THREE.Color(isNight ? "#4860d8" : "#9bc8ff"),
      pointPos: lighting.lampPos.clone(),
      pointColor: lighting.lampColor.clone(),
      pointIntensity: isNight ? 1.55 : 0.65,
    };
  }, [lighting]);

  // Calm studio camera framing full standing T-pose + ultra-detailed Comic Print bedroom + 3D city window!
  const camX = Math.sin(tSec * 0.28) * 0.14;
  const camY = 1.08 + Math.sin(tSec * 0.42) * 0.012;
  const camZ = 3.04;

  useLayoutEffect(() => {
    camera.position.set(camX, camY, camZ);
    camera.lookAt(0, 0.98, -0.35);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 46;
      camera.aspect = width / height;
      camera.near = 0.08;
      camera.far = 520;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    invalidate();
  }, [camera, camX, camY, camZ, width, height, frame, invalidate]);

  return (
    <>
      <color attach="background" args={[lightingMode === "night" ? "#0e1333" : "#7cc6ff"]} />
      {/* Genuine 3D Comic-Print City World outside the real open window */}
      <ComicCityWorld layout={layout} lighting={lighting} tSec={tSec} />
      {/* Ultra-detailed smoothed Comic-Print Bedroom */}
      <ComicBedroom lighting={lighting} />

      {/* Center Hero: 54-Bone Base Person in living standing T-pose */}
      <BasePerson
        tSec={tSec}
        pose={pose}
        shape={shape}
        footwear={footwear}
        palette={palette}
        width={width}
        height={height}
        cmykSplit={0.04}
        position={[0.04, 0.008, 0.22]}
        scale={1.0}
      />
    </>
  );
};

export const BasePersonVideo: React.FC<BasePersonVideoProps> = ({
  pose = "tpose",
  footwear = "socks",
  lightingMode = "day",
  heavier = 0,
  slimmer = 0,
  broader = 0,
  curvier = 0,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const isRendering = getRemotionEnvironment().isRendering;
  const isSoftGl = useMemo(() => detectSoftwareGl(), []);

  const shape = useMemo(
    () => ({ heavier, slimmer, broader, curvier }),
    [heavier, slimmer, broader, curvier],
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#8ad4fa" }} data-testid="base-person-stage">
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
        camera={{ fov: 46, near: 0.08, far: 160, position: [0, 1.08, 3.04] }}
      >
        <BasePersonStudioScene
          frame={frame}
          width={width}
          height={height}
          pose={pose}
          footwear={footwear}
          lightingMode={lightingMode}
          shape={shape}
        />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
