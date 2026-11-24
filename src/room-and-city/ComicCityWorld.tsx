// Full 3D Comic-Print Metropolis surrounding His Bedroom Window:
// - Sky Dome (r=420) with twilight horizon glow & twinkling stars
// - Non-overlapping asphalt roads + raised concrete footpaths
// - His Teal Apartment Exterior Facade with an ACTUAL 4-panel open cutout around his bedroom window
// - Foreground Hero Landmarks matching the reference artwork:
//   * Golden-Yellow Cutaway Apartment Building with illuminated neighbor rooms & silhouettes
//   * Hot-Pink Building + Rooftop Starburst Sunburst Billboard
//   * Bubblegum-Pink Plaza with tiled floor, fountain, benches, umbrella tables & warm string lights
//   * Magenta Corner Cafe Building with ground-floor awnings
//   * Elevated Monorail Viaduct + moving 4-car white-and-teal sky-train
// - 18 multi-part stylized comic cars with glowing cream headlights + red taillights
// - Panoramic drifting 3D comic clouds + <CityInstancedDistrict />

import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  type CityLayout,
  CITY_GROUND_Y,
} from "./comicRoomPresets";
import {
  type ComicLightingConfig,
  createComicPrintMaterial,
  createComicSkyMaterial,
  syncComicPrintMaterial,
} from "./comicPrintShader";
import { CityInstancedDistrict } from "./CityInstancedDistrict";

export interface ComicCityWorldProps {
  layout: CityLayout;
  lighting: ComicLightingConfig;
  tSec: number;
  cameraPos?: [number, number, number];
  /**
   * When true (Shot 03 cutaway), hardware-stencils the entire 3D night city strictly inside
   * his open bedroom window glass opening and hides his apartment exterior wrap shell so the
   * deep GLSL Shader Void surrounds the outside of his house while his window still looks out onto the real 3D city!
   */
  voidCutawayMode?: boolean;
  /**
   * Optional hardware stencil ref (e.g. 1) when viewing the ACTUAL 3D city strictly through an external
   * portal opening (such as Scene 05's opening circular stone-brick well floor!).
   * Also hides the opaque ground/road planes since the camera looks out from underneath the road portal!
   */
  portalClipStencilRef?: number;
  /**
   * Optional circular portal cutout punched directly out of the actual city's asphalt road & ground plane
   * (marks pixels inside the circle with stencilRef so an underground 3D well renders straight through the road!).
   */
  drainPortalCutout?: {
    position: [number, number, number];
    radius: number;
    stencilRef?: number;
  };
}

function drawHalftoneAndBrushEtching(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dotColor: string,
  scratchColor: string,
  densityStep = 14,
) {
  // 1. Diagonal comic halftone dot field concentrated near top/bottom edges & corners
  ctx.fillStyle = dotColor;
  for (let y = 6; y < h; y += densityStep) {
    const edgeFactor = Math.max(0, 1 - Math.abs(y / h - 0.5) * 2.15);
    const edgeStrength = 1 - edgeFactor;
    const rowOffset = (Math.floor(y / densityStep) % 2) * (densityStep * 0.5);
    for (let x = 6; x < w; x += densityStep) {
      const horizEdge = Math.abs(x / w - 0.5) * 2;
      const r = Math.min(5.2, 1.35 + (edgeStrength * 2.6 + horizEdge * 1.4));
      if (r > 1.7) {
        ctx.beginPath();
        ctx.arc(x + rowOffset, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 2. Dry-brush paint streaks & etched cross-hatching scratches
  ctx.strokeStyle = scratchColor;
  ctx.lineCap = "round";
  for (let i = 0; i < 64; i++) {
    const seed = (i * 9301 + 49297) % 233280;
    const u = seed / 233280;
    const v = ((i * 4253 + 17389) % 233280) / 233280;
    const sx = u * w;
    const sy = v * h;
    const len = 36 + ((i * 37) % 115);
    const ang = -0.14 + (((i * 19) % 100) / 100) * 0.28;
    ctx.lineWidth = 1.2 + (i % 4) * 0.85;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
    ctx.stroke();
  }
}

function drawBrushEtchedWord(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  fontSize: number,
  fill: string,
  accentStroke: string,
  bgScratch: string,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.025);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${fontSize}px "Impact", "Arial Black", sans-serif`;

  // Layered brush-painted offset shadow & halftone ink halo
  ctx.fillStyle = accentStroke;
  ctx.fillText(text, 7, 8);

  // Expressive brush-stroke backing swipe behind letters
  ctx.strokeStyle = accentStroke;
  ctx.lineWidth = 10;
  ctx.lineJoin = "round";
  ctx.strokeText(text, 0, 0);

  // Main painted lettering
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);

  // Dry-brush etching scratch-outs across the painted strokes for hand-etched print texture
  ctx.strokeStyle = bgScratch;
  for (let i = 0; i < 28; i++) {
    const ox = -fontSize * 3.1 + ((i * 89) % Math.floor(fontSize * 6.2));
    const oy = -fontSize * 0.42 + ((i * 31) % Math.floor(fontSize * 0.84));
    ctx.lineWidth = 1.4 + (i % 3) * 1.0;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + 26 + (i % 5) * 10, oy + ((i % 3) - 1) * 4);
    ctx.stroke();
  }
  ctx.restore();
}



function createWaterTankEtchedTexture(bgHex: string, textHex: string, strokeHex: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, 1024, 512);

    // Comic halftone dot screen & brush-paint etching lines across the cylindrical tank
    drawHalftoneAndBrushEtching(ctx, 1024, 512, "rgba(18, 16, 54, 0.34)", "rgba(255, 250, 238, 0.28)", 14);

    // Two painted "WATER" faces around the 360-deg cylinder (u=0.25 & u=0.75) sized to sit flat-on within the visible cylinder arc
    [256, 768].forEach((cx) => {
      ctx.fillStyle = "rgba(10, 14, 34, 0.86)";
      for (let i = 0; i < 7; i++) {
        ctx.fillRect(cx - 168 + (i % 2) * 8, 162 + i * 24, 336 - (i % 3) * 14, 17);
      }
      drawBrushEtchedWord(ctx, "WATER", cx, 246, 86, textHex, strokeHex, bgHex);

      // Painterly brush drips below "WATER"
      ctx.fillStyle = textHex;
      [-115, -55, 8, 68, 118].forEach((dx, idx) => {
        const dripH = 22 + ((idx * 23) % 36);
        ctx.fillRect(cx + dx, 298, 5 + (idx % 3) * 2, dripH);
        ctx.beginPath();
        ctx.arc(cx + dx + 3, 298 + dripH, 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPlazaTileTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ff8fc7";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#d95296";
    ctx.lineWidth = 4;
    for (let i = 0; i <= 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

export const ComicCityWorld: React.FC<ComicCityWorldProps> = ({
  layout,
  lighting,
  tSec,
  cameraPos = [-1.6, 18, -60],
  voidCutawayMode = false,
  portalClipStencilRef,
  drainPortalCutout,
}) => {
  const cityGroupRef = useRef<THREE.Group>(null);
  const groundRoadGroupRef = useRef<THREE.Group>(null);
  const skyMat = useMemo(() => createComicSkyMaterial(), []);

  const assets = useMemo(() => {
    const waterTankTex = createWaterTankEtchedTexture("#28c7d9", "#fff9eb", "#141438");
    const plazaTex = createPlazaTileTexture();

    const mats = {
      groundBase: createComicPrintMaterial({
        baseColor: "#465199",
        shadowColor: "#1a1f52",
        dotScale: 6.0,
        inkStrength: 0.15,
      }),
      roadAsphalt: createComicPrintMaterial({
        baseColor: "#353c73",
        shadowColor: "#181c45",
        dotScale: 6.0,
        inkStrength: 0.25,
      }),
      footpath: createComicPrintMaterial({
        baseColor: "#b8c7f2",
        shadowColor: "#53629e",
        dotScale: 5.5,
        inkStrength: 0.65,
      }),
      heroTeal: createComicPrintMaterial({
        baseColor: "#168ea6",
        shadowColor: "#0c3d59",
        highlightColor: "#54d3e0",
        dotScale: 5.2,
        inkStrength: 0.82,
      }),
      heroTrim: createComicPrintMaterial({
        baseColor: "#eef6ff",
        shadowColor: "#6e87b0",
        dotScale: 5.0,
        inkStrength: 0.8,
      }),
      windowGlowWarm: createComicPrintMaterial({
        baseColor: "#ffeaa3",
        shadowColor: "#ffbe55",
        emissive: "#ffda78",
        emissiveIntensity: 1.25,
        dotScale: 4.8,
        inkStrength: 0.65,
      }),
      windowGlowCyan: createComicPrintMaterial({
        baseColor: "#8ef4ff",
        shadowColor: "#2ba3c4",
        emissive: "#5be3ff",
        emissiveIntensity: 1.05,
        dotScale: 4.8,
        inkStrength: 0.65,
      }),
      windowDark: createComicPrintMaterial({
        baseColor: "#2e4180",
        shadowColor: "#141c45",
        dotScale: 5.0,
        inkStrength: 0.72,
      }),
      yellowWall: createComicPrintMaterial({
        baseColor: "#ffd236",
        shadowColor: "#b5691d",
        highlightColor: "#fff29e",
        dotScale: 5.2,
        inkStrength: 0.85,
      }),
      pinkWall: createComicPrintMaterial({
        baseColor: "#ff388c",
        shadowColor: "#b5246f",
        highlightColor: "#ff94c8",
        dotScale: 5.2,
        inkStrength: 0.85,
      }),
      magentaWall: createComicPrintMaterial({
        baseColor: "#f23082",
        shadowColor: "#a82268",
        highlightColor: "#ff8abf",
        dotScale: 5.2,
        inkStrength: 0.85,
      }),

      waterTankPainted: createComicPrintMaterial({
        baseColor: "#ffffff",
        shadowColor: "#145d78",
        emissive: "#c8f8ff",
        emissiveIntensity: 0.58,
        map: waterTankTex,
        dotScale: 4.5,
        inkStrength: 0.78,
      }),
      steelFrame: createComicPrintMaterial({
        baseColor: "#262a5c",
        shadowColor: "#111230",
        dotScale: 5.0,
        inkStrength: 0.8,
      }),
      plazaFloor: createComicPrintMaterial({
        baseColor: "#ffffff",
        shadowColor: "#9c477e",
        map: plazaTex,
        dotScale: 5.5,
        inkStrength: 0.55,
      }),
      fountainWater: createComicPrintMaterial({
        baseColor: "#4ce6ff",
        shadowColor: "#19759e",
        emissive: "#38d8ff",
        emissiveIntensity: 0.65,
        dotScale: 5.0,
        inkStrength: 0.65,
      }),
      viaductDeck: createComicPrintMaterial({
        baseColor: "#d9e4ff",
        shadowColor: "#57659e",
        dotScale: 5.2,
        inkStrength: 0.8,
      }),
      trainBody: createComicPrintMaterial({
        baseColor: "#f8fbff",
        shadowColor: "#8ca1cc",
        emissive: "#e3f2ff",
        emissiveIntensity: 0.25,
        dotScale: 5.0,
        inkStrength: 0.82,
      }),
      trainStripe: createComicPrintMaterial({
        baseColor: "#1ed4c8",
        shadowColor: "#0e6b73",
        emissive: "#26e6d8",
        emissiveIntensity: 0.55,
        dotScale: 5.0,
        inkStrength: 0.72,
      }),
      cloud: createComicPrintMaterial({
        baseColor: "#fff4fa",
        shadowColor: "#7b7cc4",
        highlightColor: "#ffffff",
        dotScale: 6.2,
        inkStrength: 0.45,
        fogScale: 0.42,
      }),
      headlight: createComicPrintMaterial({
        baseColor: "#fff9cc",
        shadowColor: "#ffd866",
        emissive: "#fff1a3",
        emissiveIntensity: 1.85,
        dotScale: 4.5,
        inkStrength: 0.1,
      }),
      taillight: createComicPrintMaterial({
        baseColor: "#ff3352",
        shadowColor: "#a6112b",
        emissive: "#ff2445",
        emissiveIntensity: 1.75,
        dotScale: 4.5,
        inkStrength: 0.1,
      }),
      wheel: createComicPrintMaterial({
        baseColor: "#1b1e38",
        shadowColor: "#0d0f21",
        dotScale: 5.0,
        inkStrength: 0.6,
      }),
      awningMint: createComicPrintMaterial({
        baseColor: "#38e3b8",
        shadowColor: "#166e64",
        dotScale: 5.0,
        inkStrength: 0.75,
      }),
      woodWaterTower: createComicPrintMaterial({
        baseColor: "#db8a4f",
        shadowColor: "#633226",
        dotScale: 5.0,
        inkStrength: 0.82,
      }),
    };

    const carBodyMats = layout.cars.map((car) =>
      createComicPrintMaterial({
        baseColor: car.color,
        dotScale: 5.0,
        inkStrength: 0.82,
      }),
    );
    const carRoofMats = layout.cars.map((car) =>
      createComicPrintMaterial({
        baseColor: car.roofColor,
        dotScale: 5.0,
        inkStrength: 0.75,
      }),
    );

    return { waterTankTex, plazaTex, mats, carBodyMats, carRoofMats };
  }, [layout.cars]);

  useEffect(() => {
    return () => {
      skyMat.dispose();
      assets.waterTankTex.dispose();
      assets.plazaTex.dispose();
      Object.values(assets.mats).forEach((m) => m.dispose());
      assets.carBodyMats.forEach((m) => m.dispose());
      assets.carRoofMats.forEach((m) => m.dispose());
    };
  }, [skyMat, assets]);

  // Update sky dome & comic materials
  skyMat.uniforms.uNightFactor.value = lighting.nightFactor;
  skyMat.uniforms.uTime.value = tSec;
  Object.values(assets.mats).forEach((m) => syncComicPrintMaterial(m, lighting));
  assets.carBodyMats.forEach((m) => syncComicPrintMaterial(m, lighting));
  assets.carRoofMats.forEach((m) => syncComicPrintMaterial(m, lighting));

  // Monorail 4-car sky-train gliding continuously across the elevated viaduct
  const trainX = (((tSec * 9.5 + 48) % 96) + 96) % 96 - 48;

  const hero = layout.heroApartment;
  const yellow = layout.yellowApartment;
  const pink = layout.pinkBillboardBuilding;
  const magenta = layout.magentaPlazaBuilding;
  const plaza = layout.plaza;

  // His bedroom window opening bounds on front wall (z = -2.86): x in [-1.74, 0.24], y in [1.08, 2.28]
  const heroMinX = hero.x - hero.w * 0.5; // -9.6
  const heroMaxX = hero.x + hero.w * 0.5; // +8.4
  const heroMinY = CITY_GROUND_Y; // -6.0
  const heroMaxY = CITY_GROUND_Y + hero.h; // +10.2
  const winMinX = -1.76;
  const winMaxX = 0.26;
  const winMinY = 1.06;
  const winMaxY = 2.30;

  const drainCutoutRef = drainPortalCutout?.stencilRef ?? 2;
  const activeClipRef = voidCutawayMode ? 1 : portalClipStencilRef;
  const isPortalClipped = activeClipRef !== undefined;

  // Apply hardware stencil rules deterministically:
  // 1. voidCutawayMode (Shot 03) or portalClipStencilRef (Scene 05 looking from Well -> City):
  //    clip every mesh in the 3D city strictly to stencil === activeClipRef!
  // 2. drainPortalCutout (Scene 05 looking from City -> Well):
  //    punch a clean circular stencil hole (NotEqualStencilFunc) out of the asphalt road & ground planes!
  useLayoutEffect(() => {
    const grp = cityGroupRef.current;
    if (!grp) return;
    grp.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.renderOrder = voidCutawayMode ? -8 : portalClipStencilRef !== undefined ? 4 : 0;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m) continue;
          m.stencilWrite = isPortalClipped;
          m.stencilRef = activeClipRef ?? 1;
          m.stencilFunc = isPortalClipped ? THREE.EqualStencilFunc : THREE.AlwaysStencilFunc;
          m.stencilFail = THREE.KeepStencilOp;
          m.stencilZFail = THREE.KeepStencilOp;
          m.stencilZPass = THREE.KeepStencilOp;
        }
      }
    });

    // Handle road markings (city-road-markings inside CityInstancedDistrict):
    // - Hidden when viewing sky/buildings out from underneath the Well portal (portalClipStencilRef !== undefined)
    // - Stencil-punched (NotEqualStencilFunc) when drainPortalCutout is active so NO yellow stripe crosses the manhole!
    const roadMarkings = grp.getObjectByName("city-road-markings");
    if (roadMarkings instanceof THREE.Mesh) {
      roadMarkings.visible = portalClipStencilRef === undefined;
      if (drainPortalCutout && !isPortalClipped) {
        const mats = Array.isArray(roadMarkings.material) ? roadMarkings.material : [roadMarkings.material];
        for (const m of mats) {
          if (!m) continue;
          m.stencilWrite = true;
          m.stencilRef = drainCutoutRef;
          m.stencilFunc = THREE.NotEqualStencilFunc;
          m.stencilFail = THREE.KeepStencilOp;
          m.stencilZFail = THREE.KeepStencilOp;
          m.stencilZPass = THREE.KeepStencilOp;
        }
      }
    }

    // When drainPortalCutout is active on the actual city road, skip drawing road & ground strictly inside stencil === drainCutoutRef!
    const roadGrp = groundRoadGroupRef.current;
    if (roadGrp && drainPortalCutout && !isPortalClipped) {
      roadGrp.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.renderOrder = 0;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (!m) continue;
            m.stencilWrite = true;
            m.stencilRef = drainCutoutRef;
            m.stencilFunc = THREE.NotEqualStencilFunc;
            m.stencilFail = THREE.KeepStencilOp;
            m.stencilZFail = THREE.KeepStencilOp;
            m.stencilZPass = THREE.KeepStencilOp;
          }
        }
      });
    }
  }, [voidCutawayMode, portalClipStencilRef, isPortalClipped, activeClipRef, drainPortalCutout, drainCutoutRef, layout]);

  return (
    <group name="comic-city-world-root">
      {/* Window Portal Stencil Mask (active ONLY in Shot 03 voidCutawayMode): marks exact bedroom window pixels with stencil = 1 */}
      {voidCutawayMode && (
        <mesh position={[-0.75, 1.68, -2.85]} renderOrder={-12} frustumCulled={false}>
          <planeGeometry args={[1.96, 1.18]} />
          <meshBasicMaterial
            colorWrite={false}
            depthWrite={false}
            depthTest={false}
            stencilWrite={true}
            stencilRef={1}
            stencilFunc={THREE.AlwaysStencilFunc}
            stencilFail={THREE.KeepStencilOp}
            stencilZFail={THREE.ReplaceStencilOp}
            stencilZPass={THREE.ReplaceStencilOp}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Circular Street Drainage Hole Portal Stencil Writer (active in Scene 05 Shot 46!):
          marks the exact circular drainage opening on the road with stencil = drainCutoutRef BEFORE road & ground draw! */}
      {drainPortalCutout && !isPortalClipped && (
        <mesh
          position={[
            drainPortalCutout.position[0],
            drainPortalCutout.position[1] + 0.04,
            drainPortalCutout.position[2],
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={-6}
          frustumCulled={false}
        >
          <circleGeometry args={[drainPortalCutout.radius, 56]} />
          <meshBasicMaterial
            colorWrite={false}
            depthWrite={false}
            depthTest={true}
            stencilWrite={true}
            stencilRef={drainCutoutRef}
            stencilFunc={THREE.AlwaysStencilFunc}
            stencilFail={THREE.KeepStencilOp}
            stencilZFail={THREE.KeepStencilOp}
            stencilZPass={THREE.ReplaceStencilOp}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      <group ref={cityGroupRef} name="comic-city-world">
        {/* Panoramic Comic Sky Dome */}
        <mesh material={skyMat} frustumCulled={false}>
          <sphereGeometry args={[410, 32, 24]} />
        </mesh>

        {/* Ground & Asphalt Roads (hidden when viewing sky/buildings out from underneath the Well Floor Portal!) */}
        {portalClipStencilRef === undefined && (
          <group ref={groundRoadGroupRef} name="comic-city-ground-roads">
            {/* City Base Ground Plane (strictly behind z = -3.2 in voidCutawayMode so it never pokes under bedroom floor) */}
            <mesh
              position={[0, CITY_GROUND_Y - 0.08, voidCutawayMode ? -163 : -70]}
              rotation={[-Math.PI / 2, 0, 0]}
              material={assets.mats.groundBase}
            >
              <planeGeometry args={[520, voidCutawayMode ? 318 : 620]} />
            </mesh>

            {/* Non-Overlapping Asphalt Roads */}
            {layout.roads.map((r) => (
              <mesh
                key={r.id}
                position={[r.x, CITY_GROUND_Y + 0.01, r.z]}
                rotation={[-Math.PI / 2, 0, 0]}
                material={assets.mats.roadAsphalt}
              >
                <planeGeometry args={[r.w, r.d]} />
              </mesh>
            ))}
          </group>
        )}

        {/* Raised Concrete Footpaths (hidden when viewing sky/buildings out from underneath the Well Floor Portal!) */}
        {portalClipStencilRef === undefined &&
          layout.footpaths.map((fp) => (
            <mesh
              key={fp.id}
              position={[fp.x, CITY_GROUND_Y + fp.elevation * 0.5, fp.z]}
              material={assets.mats.footpath}
            >
              <boxGeometry args={[fp.w, fp.elevation, fp.d]} />
            </mesh>
          ))}

        {/* ===================================================================== */}
        {/* HIS TEAL APARTMENT BUILDING (hidden during voidCutawayMode so his house floats in pure void!) */}
        {/* ===================================================================== */}
        {!voidCutawayMode && (
          <group name="hero-teal-apartment-exterior">
        {/* Front exterior facade (-Z at z = -2.80) built from 4 panels strictly outside [winMinX..winMaxX, winMinY..winMaxY] */}
        {/* Left of window */}
        <mesh
          position={[(heroMinX + winMinX) * 0.5, (heroMinY + heroMaxY) * 0.5, -2.80]}
          material={assets.mats.heroTeal}
        >
          <boxGeometry args={[winMinX - heroMinX, hero.h, 0.22]} />
        </mesh>
        {/* Right of window */}
        <mesh
          position={[(winMaxX + heroMaxX) * 0.5, (heroMinY + heroMaxY) * 0.5, -2.80]}
          material={assets.mats.heroTeal}
        >
          <boxGeometry args={[heroMaxX - winMaxX, hero.h, 0.22]} />
        </mesh>
        {/* Below window */}
        <mesh
          position={[(winMinX + winMaxX) * 0.5, (heroMinY + winMinY) * 0.5, -2.80]}
          material={assets.mats.heroTeal}
        >
          <boxGeometry args={[winMaxX - winMinX, winMinY - heroMinY, 0.22]} />
        </mesh>
        {/* Above window */}
        <mesh
          position={[(winMinX + winMaxX) * 0.5, (winMaxY + heroMaxY) * 0.5, -2.80]}
          material={assets.mats.heroTeal}
        >
          <boxGeometry args={[winMaxX - winMinX, heroMaxY - winMaxY, 0.22]} />
        </mesh>

        {/* Side, Back, Roof & Lower Structural Volumes (strictly clear of bedroom interior x∈[-2.9,2.7], y∈[-0.1,2.85], z∈[-2.7,3.4]) */}
        {/* Left wing depth */}
        <mesh position={[-6.3, (heroMinY + heroMaxY) * 0.5, hero.z]} material={assets.mats.heroTeal}>
          <boxGeometry args={[6.6, hero.h, hero.d]} />
        </mesh>
        {/* Right wing depth */}
        <mesh position={[5.6, (heroMinY + heroMaxY) * 0.5, hero.z]} material={assets.mats.heroTeal}>
          <boxGeometry args={[5.6, hero.h, hero.d]} />
        </mesh>
        {/* Upper floors above bedroom */}
        <mesh position={[-0.1, (3.0 + heroMaxY) * 0.5, hero.z]} material={assets.mats.heroTeal}>
          <boxGeometry args={[6.2, heroMaxY - 3.0, hero.d]} />
        </mesh>
        {/* Lower floors below bedroom */}
        <mesh position={[-0.1, (heroMinY - 0.12) * 0.5, hero.z]} material={assets.mats.heroTeal}>
          <boxGeometry args={[6.2, -0.12 - heroMinY, hero.d]} />
        </mesh>
        {/* Rear structural wall behind bedroom */}
        <mesh position={[-0.1, 1.45, 5.1]} material={assets.mats.heroTeal}>
          <boxGeometry args={[6.2, 3.2, 2.8]} />
        </mesh>

        {/* Horizontal architectural floor ledges on front facade */}
        {[-2.6, 0.55, 3.7, 6.85, 10.1].map((ly, i) => (
          <mesh key={i} position={[hero.x, ly, -2.93]} material={assets.mats.heroTrim}>
            <boxGeometry args={[hero.w + 0.25, 0.16, 0.26]} />
          </mesh>
        ))}

        {/* Glowing warm exterior frame halo right around HIS open bedroom window so it beacons from 25 buildings away! */}
        <mesh position={[-0.75, 2.34, -2.92]} material={assets.mats.heroTrim}>
          <boxGeometry args={[2.22, 0.14, 0.22]} />
        </mesh>
        <mesh position={[-0.75, 1.00, -2.92]} material={assets.mats.heroTrim}>
          <boxGeometry args={[2.26, 0.14, 0.28]} />
        </mesh>
        <mesh position={[-1.80, 1.67, -2.92]} material={assets.mats.heroTrim}>
          <boxGeometry args={[0.14, 1.42, 0.22]} />
        </mesh>
        <mesh position={[0.30, 1.67, -2.92]} material={assets.mats.heroTrim}>
          <boxGeometry args={[0.14, 1.42, 0.22]} />
        </mesh>

        {/* Neighbor windows on His Teal Apartment facade (matching reference teal facade!) */}
        {[-6.8, -3.9, 2.6, 5.8].map((wx, xi) =>
          [-1.5, 1.67, 4.9, 8.1].map((wy, yi) => {
            const lit = (xi * 3 + yi * 2) % 4;
            const winMat = lit === 0 ? assets.mats.windowGlowWarm : assets.mats.windowDark;
            return (
              <group key={`${xi}-${yi}`} position={[wx, wy, -2.92]}>
                <mesh material={assets.mats.heroTrim}>
                  <boxGeometry args={[1.66, 1.32, 0.08]} />
                </mesh>
                <mesh position={[0, 0, -0.045]} material={winMat}>
                  <boxGeometry args={[1.44, 1.12, 0.05]} />
                </mesh>
                {/* Balcony on alternate floors */}
                {yi % 2 === 1 && (
                  <group position={[0, -0.70, -0.45]}>
                    <mesh material={assets.mats.heroTrim}>
                      <boxGeometry args={[1.86, 0.14, 0.84]} />
                    </mesh>
                    <mesh position={[0, 0.42, -0.38]} material={assets.mats.steelFrame}>
                      <boxGeometry args={[1.84, 0.72, 0.07]} />
                    </mesh>
                  </group>
                )}
              </group>
            );
          }),
        )}
        {/* Upper windows directly above his window */}
        {[4.9, 8.1].map((wy, yi) => (
          <group key={`center-${yi}`} position={[-0.75, wy, -2.92]}>
            <mesh material={assets.mats.heroTrim}>
              <boxGeometry args={[1.82, 1.32, 0.08]} />
            </mesh>
            <mesh position={[0, 0, -0.045]} material={yi === 0 ? assets.mats.windowGlowWarm : assets.mats.windowDark}>
              <boxGeometry args={[1.58, 1.12, 0.05]} />
            </mesh>
          </group>
        ))}

        {/* Ground-floor striped entrance canopy & warm lobby glass */}
        <mesh position={[-0.75, CITY_GROUND_Y + 2.65, -3.55]} material={assets.mats.awningMint}>
          <boxGeometry args={[4.4, 0.32, 1.45]} />
        </mesh>
        <mesh position={[-0.75, CITY_GROUND_Y + 1.35, -2.92]} material={assets.mats.windowGlowWarm}>
          <boxGeometry args={[3.4, 2.3, 0.12]} />
        </mesh>

        {/* Rooftop Penthouse + Water Tower + Radio Mast on His Apartment Building */}
        <mesh position={[-4.5, heroMaxY + 1.1, 1.6]} material={assets.mats.heroTrim}>
          <boxGeometry args={[3.4, 2.2, 3.0]} />
        </mesh>
        <group position={[3.8, heroMaxY, 0.8]}>
          <mesh position={[0, 2.5, 0]} material={assets.mats.woodWaterTower}>
            <cylinderGeometry args={[1.15, 1.22, 2.2, 14]} />
          </mesh>
          <mesh position={[0, 4.1, 0]} material={assets.mats.steelFrame}>
            <coneGeometry args={[1.38, 1.1, 14]} />
          </mesh>
          {[-0.72, 0.72].map((lx) =>
            [-0.72, 0.72].map((lz) => (
              <mesh key={`${lx}-${lz}`} position={[lx, 0.75, lz]} material={assets.mats.steelFrame}>
                <boxGeometry args={[0.16, 1.5, 0.16]} />
              </mesh>
            )),
          )}
        </group>
      </group>
        )}

      {/* ===================================================================== */}
      {/* LANDMARK 1: GOLDEN-YELLOW CUTAWAY APARTMENT (Block 0 Right)           */}
      {/* ===================================================================== */}
      <group position={[yellow.x, CITY_GROUND_Y, yellow.z]}>
        <mesh position={[0, yellow.h * 0.5, 0]} material={assets.mats.yellowWall}>
          <boxGeometry args={[yellow.w, yellow.h, yellow.d]} />
        </mesh>
        {/* Illuminated apartment bays facing Grand Boulevard (-X) and His Window (+Z) */}
        {[2.4, 5.6, 8.8, 12.0, 15.2].map((fy, fi) =>
          [-2.6, 0, 2.6].map((fz, zi) => (
            <group key={`y-${fi}-${zi}`} position={[-yellow.w * 0.5 - 0.04, fy, fz]}>
              <mesh material={assets.mats.steelFrame}>
                <boxGeometry args={[0.08, 2.15, 1.95]} />
              </mesh>
              <mesh
                position={[-0.03, 0, 0]}
                material={(fi + zi) % 3 === 0 ? assets.mats.windowGlowWarm : assets.mats.windowGlowCyan}
              >
                <boxGeometry args={[0.06, 1.92, 1.72]} />
              </mesh>
              {fi % 2 === 1 && (
                <group position={[-0.45, -1.02, 0]}>
                  <mesh material={assets.mats.yellowWall}>
                    <boxGeometry args={[0.88, 0.14, 2.05]} />
                  </mesh>
                  <mesh position={[-0.4, 0.42, 0]} material={assets.mats.steelFrame}>
                    <boxGeometry args={[0.07, 0.72, 2.02]} />
                  </mesh>
                </group>
              )}
            </group>
          )),
        )}
        {/* Ground-floor awning */}
        <mesh position={[-yellow.w * 0.5 - 0.58, 2.9, 0]} material={assets.mats.awningMint}>
          <boxGeometry args={[1.15, 0.35, 6.2]} />
        </mesh>
      </group>

      {/* ===================================================================== */}
      {/* LANDMARK 2: HOT-PINK BUILDING + TALLER BLACK "BOTTOMLESS" BILLBOARD   */}
      {/* + ROOFTOP "WATER" TANKER (halftone brush-paint etching on tanker!)    */}
      {/* ===================================================================== */}
      <group position={[pink.x, CITY_GROUND_Y, pink.z]}>
        <mesh position={[0, pink.h * 0.5, 0]} material={assets.mats.pinkWall}>
          <boxGeometry args={[pink.w, pink.h, pink.d]} />
        </mesh>

        {/* Clean comic windows on the pink building (no text on building walls!) */}
        {[2.1, 4.7].map((fy, fi) =>
          [-2.4, 0, 2.4].map((fx, xi) => (
            <mesh
              key={`p-${fi}-${xi}`}
              position={[fx, fy, pink.d * 0.5 + 0.04]}
              material={(fi + xi) % 2 === 0 ? assets.mats.windowGlowCyan : assets.mats.windowGlowWarm}
            >
              <boxGeometry args={[1.65, 1.45, 0.08]} />
            </mesh>
          )),
        )}
        {[2.1, 4.7].map((fy, fi) =>
          [-2.6, 0, 2.6].map((fz, zi) => (
            <mesh
              key={`ps-${fi}-${zi}`}
              position={[pink.w * 0.5 + 0.04, fy, fz]}
              material={(fi + zi) % 2 === 0 ? assets.mats.windowGlowWarm : assets.mats.windowGlowCyan}
            >
              <boxGeometry args={[0.08, 1.45, 1.7]} />
            </mesh>
          )),
        )}

        {/* HUGE ROOFTOP WATER TANKER WITH BRUSH-ETCHED HALFTONE "WATER" (no billboard — massive iconic silhouette!) */}
        <group position={[0.95, pink.h, 0.95]}>
          {/* 4 heavy-duty steel stilt legs + elevated platform */}
          {[-1.36, 1.36].map((lx) =>
            [-1.36, 1.36].map((lz) => (
              <mesh key={`wt-leg-${lx}-${lz}`} position={[lx, 0.62, lz]} material={assets.mats.steelFrame}>
                <boxGeometry args={[0.28, 1.24, 0.28]} />
              </mesh>
            )),
          )}
          <mesh position={[0, 1.22, 0]} material={assets.mats.steelFrame}>
            <boxGeometry args={[3.9, 0.22, 3.9]} />
          </mesh>
          {/* Massive cylindrical painted "WATER" tanker body (4.3m wide x 3.2m tall) rotated so "WATER" reads clearly toward the approaching camera! */}
          <mesh position={[0, 2.90, 0]} rotation={[0, 0.52, 0]} material={assets.mats.waterTankPainted}>
            <cylinderGeometry args={[2.08, 2.18, 3.22, 28]} />
          </mesh>
          {/* Dark indigo iron tension bands at top & bottom rims ONLY so "WATER" lettering is 100% unobstructed */}
          {[1.48, 4.32].map((hy, hi) => (
            <mesh key={hi} position={[0, hy, 0]} material={assets.mats.steelFrame}>
              <cylinderGeometry args={[2.22, 2.22, 0.14, 28]} />
            </mesh>
          ))}
          {/* Huge conical steel cap (peaks at +5.42m above roof — matches HUGE_WATER_TANK_CAP_PEAK_Y!) */}
          <mesh position={[0, 4.94, 0]} material={assets.mats.steelFrame}>
            <coneGeometry args={[2.46, 0.96, 28]} />
          </mesh>
          {/* Side vertical riser pipe tucked on the far-left (-X) side away from the lettering */}
          <mesh position={[-2.28, 2.38, 0]} material={assets.mats.steelFrame}>
            <cylinderGeometry args={[0.13, 0.13, 4.76, 8]} />
          </mesh>
        </group>
      </group>

      {/* ===================================================================== */}
      {/* LANDMARK 3: BUBBLEGUM-PINK PLAZA (Block 1 Left)                       */}
      {/* ===================================================================== */}
      <group position={[plaza.x, CITY_GROUND_Y, plaza.z]}>
        <mesh position={[0, 0.14, 0]} material={assets.mats.plazaFloor}>
          <boxGeometry args={[plaza.w, 0.28, plaza.d]} />
        </mesh>
        {/* Central glowing turquoise fountain */}
        <mesh position={[0, 0.52, 0]} material={assets.mats.heroTrim}>
          <cylinderGeometry args={[2.1, 2.3, 0.55, 20]} />
        </mesh>
        <mesh position={[0, 0.72, 0]} material={assets.mats.fountainWater}>
          <cylinderGeometry args={[1.82, 1.82, 0.22, 20]} />
        </mesh>
        <mesh position={[0, 1.35, 0]} material={assets.mats.fountainWater}>
          <coneGeometry args={[0.55, 1.25, 14]} />
        </mesh>
        {/* Cozy pink cafe kiosk & umbrella tables */}
        <mesh position={[4.2, 1.35, 2.8]} material={assets.mats.pinkWall}>
          <boxGeometry args={[2.4, 2.2, 1.8]} />
        </mesh>
        <mesh position={[4.2, 2.58, 2.8]} material={assets.mats.awningMint}>
          <boxGeometry args={[2.8, 0.28, 2.2]} />
        </mesh>
        {[
          [-3.8, -2.6],
          [3.6, -2.8],
          [-3.8, 2.8],
        ].map(([ux, uz], ui) => (
          <group key={ui} position={[ux, 0.28, uz]}>
            <mesh position={[0, 0.85, 0]} material={assets.mats.steelFrame}>
              <cylinderGeometry args={[0.08, 0.08, 1.7, 8]} />
            </mesh>
            <mesh position={[0, 1.85, 0]} material={ui % 2 === 0 ? assets.mats.awningMint : assets.mats.yellowWall}>
              <coneGeometry args={[1.15, 0.48, 12]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ===================================================================== */}
      {/* LANDMARK 4: MAGENTA CORNER CAFE BUILDING (Block 1 Right)              */}
      {/* ===================================================================== */}
      <group position={[magenta.x, CITY_GROUND_Y, magenta.z]}>
        <mesh position={[0, magenta.h * 0.5, 0]} material={assets.mats.magentaWall}>
          <boxGeometry args={[magenta.w, magenta.h, magenta.d]} />
        </mesh>
        {[3.2, 6.6, 10.0, 13.4, 16.8].map((fy, fi) =>
          [-3.2, 0, 3.2].map((fz, zi) => (
            <mesh
              key={`m-${fi}-${zi}`}
              position={[-magenta.w * 0.5 - 0.04, fy, fz]}
              material={(fi + zi) % 2 === 0 ? assets.mats.windowGlowWarm : assets.mats.windowGlowCyan}
            >
              <boxGeometry args={[0.08, 2.1, 1.95]} />
            </mesh>
          )),
        )}
        <mesh position={[-magenta.w * 0.5 - 0.62, 2.9, 0]} material={assets.mats.yellowWall}>
          <boxGeometry args={[1.25, 0.36, 7.6]} />
        </mesh>
      </group>

      {/* ===================================================================== */}
      {/* ELEVATED MONORAIL VIADUCT + MOVING 4-CAR WHITE & TEAL SKY-TRAIN       */}
      {/* ===================================================================== */}
      <group name="elevated-monorail">
        <mesh position={[-1.6, layout.viaduct.y, layout.viaduct.z]} material={assets.mats.viaductDeck}>
          <boxGeometry args={[layout.viaduct.spanX, 1.1, 3.2]} />
        </mesh>
        {layout.viaduct.pillarXs.map((px, pi) => (
          <mesh
            key={pi}
            position={[px, (CITY_GROUND_Y + layout.viaduct.y) * 0.5, layout.viaduct.z]}
            material={assets.mats.viaductDeck}
          >
            <boxGeometry args={[0.92, layout.viaduct.y - CITY_GROUND_Y, 1.25]} />
          </mesh>
        ))}
        {/* Moving 4-car articulated sky-train */}
        <group position={[trainX, layout.viaduct.y + 1.48, layout.viaduct.z]}>
          {[-7.8, -2.6, 2.6, 7.8].map((cx, ci) => (
            <group key={ci} position={[cx, 0, 0]}>
              <mesh material={assets.mats.trainBody}>
                <boxGeometry args={[4.75, 1.85, 2.05]} />
              </mesh>
              <mesh position={[0, -0.35, 0]} material={assets.mats.trainStripe}>
                <boxGeometry args={[4.8, 0.36, 2.12]} />
              </mesh>
              <mesh position={[0, 0.25, 0]} material={assets.mats.windowGlowWarm}>
                <boxGeometry args={[4.2, 0.58, 2.10]} />
              </mesh>
            </group>
          ))}
        </group>
      </group>

      {/* ===================================================================== */}
      {/* 18 MULTI-PART ANIMATED COMIC CARS (hidden when viewing sky out from underneath the Well Portal!) */}
      {/* ===================================================================== */}
      {portalClipStencilRef === undefined &&
        layout.cars.map((car, idx) => {
          const span = car.maxPos - car.minPos;
          const raw = car.startPos + car.speed * tSec - car.minPos;
          const wrapped = (((raw % span) + span) % span) + car.minPos;
          const px = car.axis === "z" ? car.laneCoord : wrapped;
          const pz = car.axis === "z" ? wrapped : car.laneCoord;
          const rotY =
            car.axis === "z"
              ? car.speed >= 0
                ? 0
                : Math.PI
              : car.speed >= 0
                ? Math.PI / 2
                : -Math.PI / 2;

          return (
            <group key={car.id} position={[px, CITY_GROUND_Y + 0.05, pz]} rotation={[0, rotY, 0]}>
              {/* Lower chassis */}
              <mesh position={[0, 0.44, 0]} material={assets.carBodyMats[idx]}>
                <boxGeometry args={[1.55, 0.56, 3.25]} />
              </mesh>
              {/* Upper cabin */}
              <mesh position={[0, 0.92, -0.15]} material={assets.carRoofMats[idx]}>
                <boxGeometry args={[1.32, 0.48, 1.72]} />
              </mesh>
              {/* 4 Wheels */}
              {[-0.76, 0.76].map((wx) =>
                [-0.96, 0.96].map((wz) => (
                  <mesh
                    key={`${wx}-${wz}`}
                    position={[wx, 0.26, wz]}
                    rotation={[0, 0, Math.PI / 2]}
                    material={assets.mats.wheel}
                  >
                    <cylinderGeometry args={[0.26, 0.26, 0.22, 10]} />
                  </mesh>
                )),
              )}
              {/* Glowing Cream Headlights (+Z front in car local space) */}
              <mesh position={[-0.48, 0.48, 1.65]} material={assets.mats.headlight}>
                <boxGeometry args={[0.32, 0.20, 0.08]} />
              </mesh>
              <mesh position={[0.48, 0.48, 1.65]} material={assets.mats.headlight}>
                <boxGeometry args={[0.32, 0.20, 0.08]} />
              </mesh>
              {/* Glowing Red Taillights (-Z rear in car local space) */}
              <mesh position={[-0.48, 0.48, -1.65]} material={assets.mats.taillight}>
                <boxGeometry args={[0.34, 0.18, 0.08]} />
              </mesh>
              <mesh position={[0.48, 0.48, -1.65]} material={assets.mats.taillight}>
                <boxGeometry args={[0.34, 0.18, 0.08]} />
              </mesh>
            </group>
          );
        })}

      {/* ===================================================================== */}
      {/* PANORAMIC DRIFTING 3D COMIC CLOUDS                                    */}
      {/* ===================================================================== */}
      {layout.clouds.map((cl) => {
        const driftedX = cl.x + Math.sin(tSec * 0.08 * cl.driftSpeed + cl.z * 0.02) * 14.0;
        return (
          <group key={cl.id} position={[driftedX, cl.y, cl.z]}>
            <mesh scale={[cl.scaleX * 0.55, cl.scaleY * 0.55, cl.scaleZ * 0.55]} material={assets.mats.cloud}>
              <sphereGeometry args={[1, 14, 10]} />
            </mesh>
            <mesh
              position={[-cl.scaleX * 0.34, -cl.scaleY * 0.08, 0.5]}
              scale={[cl.scaleX * 0.38, cl.scaleY * 0.42, cl.scaleZ * 0.42]}
              material={assets.mats.cloud}
            >
              <sphereGeometry args={[1, 12, 8]} />
            </mesh>
            <mesh
              position={[cl.scaleX * 0.36, -cl.scaleY * 0.1, -0.4]}
              scale={[cl.scaleX * 0.40, cl.scaleY * 0.44, cl.scaleZ * 0.44]}
              material={assets.mats.cloud}
            >
              <sphereGeometry args={[1, 12, 8]} />
            </mesh>
          </group>
        );
      })}

      {/* Instanced 25-Block Metropolis, Rooftops, Trees, Lamps, Mountains & Sun */}
      <CityInstancedDistrict layout={layout} lighting={lighting} tSec={tSec} />

      {/* Subtle exterior bounce light outside the bedroom window in night mode */}
      {lighting.mode === "night" && cameraPos[2] < -4.2 && (
        <pointLight position={[-0.75, 1.68, -4.06]} color="#52c8ff" intensity={1.8} distance={10} />
      )}
      </group>
    </group>
  );
};
