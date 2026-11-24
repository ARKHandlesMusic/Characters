// Ultra-Detailed Smoothed Comic-Print 3D Bedroom matching the attached reference art:
// - Sky-blue walls, ultramarine floor, pink rug with halftone edges, crisp indigo ink outlines
// - Real 4-panel cutout open window on the -Z wall looking straight into the 3D Comic-Print Metropolis
// - Periwinkle wardrobe, 3x3 bookcase with colorful books & bins, framed pink poster, lush potted plant,
//   desk with T-pose monitor, articulated lamp (casts hard cream night spotlight pool), purple swivel chair,
//   purple nightstand, teal-duvet bed with rounded pillows, unobstructed 3:00 wall clock & raised pendant lamp.
// - All interior materials respect Muted (cool newsprint grey) & Night (deep ultramarine + cream lamp pool),
//   while keeping the 3D city outside in full vivid colour!

import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  type ComicLightingConfig,
  createComicPrintMaterial,
  syncComicPrintMaterial,
} from "./comicPrintShader";

export interface ComicBedroomProps {
  lighting: ComicLightingConfig;
  /** Optional 0..1 animation folding the walls & ceiling outward into the void (used in legacy fold views) */
  wallsFoldProgress?: number;
  /** Optional 0..1 cutaway progress for Shot 03: smoothly vanishes the roof/ceiling & front +Z wall so nothing phases through the roof! */
  openCutaway?: number;
  /** Optional 0..1 dissolve progress for Shot 04: smoothly vanishes ALL remaining walls, window frame & wall fixtures leaving ONLY the floor + furniture! */
  dissolveWalls?: number;
  /** Optional 0..1 power-off progress for Shot 48: smoothly shuts down the desk monitor screen to pitch black! */
  monitorPowerOff?: number;
  /** Optional 0..1 dissolve for Shot 49: cleanly vanishes ONLY the ceiling & pendant lamp while keeping all 4 walls intact! */
  roofOnlyDissolve?: number;
}

function createMonitorTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#222633";
    ctx.fillRect(0, 0, 512, 320);
    ctx.fillStyle = "#171a24";
    ctx.fillRect(0, 0, 132, 320);
    ctx.fillStyle = "#4c546e";
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(16, 26 + i * 26, 60 + ((i * 23) % 38), 8);
    }
    ctx.strokeStyle = "#333a4f";
    ctx.lineWidth = 1.5;
    for (let x = 152; x <= 492; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, 236);
      ctx.lineTo(320 + (x - 320) * 1.4, 316);
      ctx.stroke();
    }
    // Crisp T-pose silhouette in 3D viewport
    ctx.fillStyle = "#adb6cc";
    ctx.beginPath();
    ctx.arc(320, 94, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(306, 116, 28, 72);
    ctx.fillRect(246, 120, 148, 15);
    ctx.fillRect(306, 188, 11, 74);
    ctx.fillRect(323, 188, 11, 74);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const ComicBedroom: React.FC<ComicBedroomProps> = ({
  lighting,
  wallsFoldProgress = 0,
  openCutaway = 0,
  dissolveWalls = 0,
  monitorPowerOff = 0,
  roofOnlyDissolve = 0,
}) => {
  const assets = useMemo(() => {
    const monitorTex = createMonitorTexture();
    const roomOpts = { respectMuted: true, receiveLampPool: true, fogScale: 0.0 };

    const mats = {
      wallBlue: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#8edbff",
        shadowColor: "#4668c9",
        highlightColor: "#ccf0ff",
        dotScale: 5.2,
        inkStrength: 0.55,
      }),
      ceilingPeriwinkle: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#7481d6",
        shadowColor: "#394094",
        dotScale: 5.5,
        inkStrength: 0.4,
      }),
      floorUltra: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#3344db",
        shadowColor: "#171f7d",
        highlightColor: "#5e72ff",
        dotScale: 5.4,
        inkStrength: 0.42,
      }),
      rugPink: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#ff6fb8",
        shadowColor: "#9c2b7b",
        highlightColor: "#ffd4ec",
        dotScale: 4.8,
        inkStrength: 0.65,
        polygonOffset: true,
      }),
      trimCream: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#f7f3eb",
        shadowColor: "#98a0c7",
        dotScale: 5.0,
        inkStrength: 0.72,
      }),
      periwinkle: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#9da8f2",
        shadowColor: "#4952a3",
        highlightColor: "#d5dcff",
        dotScale: 4.8,
        inkStrength: 0.82,
      }),
      purpleFurniture: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#8a42eb",
        shadowColor: "#3a1780",
        highlightColor: "#c494ff",
        dotScale: 4.8,
        inkStrength: 0.85,
      }),
      deskTop: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#fcf8f0",
        shadowColor: "#9ba4cc",
        dotScale: 4.8,
        inkStrength: 0.78,
      }),
      darkInkMetal: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#252954",
        shadowColor: "#11132e",
        dotScale: 4.8,
        inkStrength: 0.75,
      }),
      duvetTeal: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#10cf9f",
        shadowColor: "#0a6168",
        highlightColor: "#7af5d2",
        dotScale: 5.0,
        inkStrength: 0.85,
      }),
      pillowCream: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#f7f1e6",
        shadowColor: "#8e96bf",
        dotScale: 5.0,
        inkStrength: 0.8,
      }),
      posterPink: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#ff72ad",
        shadowColor: "#a8336e",
        dotScale: 5.0,
        inkStrength: 0.7,
      }),
      lampCoral: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#ff5c8a",
        shadowColor: "#8c1e4a",
        dotScale: 4.8,
        inkStrength: 0.8,
      }),
      lampBulb: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#fff8db",
        shadowColor: "#ffda78",
        emissive: "#fff0b3",
        emissiveIntensity: 1.5,
        dotScale: 4.5,
        inkStrength: 0.2,
      }),
      plantGreen: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#18b87a",
        shadowColor: "#0c4f49",
        highlightColor: "#7ff2b8",
        dotScale: 4.8,
        inkStrength: 0.85,
      }),
      bookPink: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#ff66aa",
        shadowColor: "#8f2461",
        dotScale: 4.8,
        inkStrength: 0.8,
      }),
      bookYellow: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#ffd247",
        shadowColor: "#9e621c",
        dotScale: 4.8,
        inkStrength: 0.8,
      }),
      bookCyan: createComicPrintMaterial({
        ...roomOpts,
        baseColor: "#33d6e8",
        shadowColor: "#155f82",
        dotScale: 4.8,
        inkStrength: 0.8,
      }),
      monitorScreen: new THREE.MeshBasicMaterial({ map: monitorTex }),
    };

    return { monitorTex, mats };
  }, []);

  useEffect(() => {
    return () => {
      assets.monitorTex.dispose();
      Object.values(assets.mats).forEach((m) => m.dispose());
    };
  }, [assets]);

  Object.values(assets.mats).forEach((m) => syncComicPrintMaterial(m, lighting));

  // Toggle desk lamp bulb glow stronger at night
  if (assets.mats.lampBulb.uniforms.uEmissiveIntensity) {
    assets.mats.lampBulb.uniforms.uEmissiveIntensity.value = lighting.nightFactor > 0.5 ? 2.1 : 0.45;
  }

  // Smooth wall fold-out & cutaway/dissolve kinematics:
  // - openCutaway (Shot 03): cleanly lifts & vanishes roof/ceiling, front +Z wall, and ceiling lamp so falling items drop straight into the open bedroom!
  // - dissolveWalls (Shot 04): vanishes ALL remaining walls, baseboards, window frame/curtains, wall clock & poster leaving ONLY the floor & furniture!
  const fold = Math.max(0, Math.min(1, wallsFoldProgress));
  const cutaway = Math.max(0, Math.min(1, openCutaway));
  const dissolve = Math.max(0, Math.min(1, dissolveWalls));
  const roofOff = Math.max(0, Math.min(1, roofOnlyDissolve));
  const monOff = Math.max(0, Math.min(1, monitorPowerOff));

  // Smoothly darken desk monitor screen as monitorPowerOff -> 1
  const screenBright = Math.max(0.02, 1 - monOff * 0.98);
  assets.mats.monitorScreen.color.setRGB(screenBright, screenBright, screenBright);

  const showCeiling = fold < 0.55 && cutaway < 0.72 && dissolve < 0.45 && roofOff < 0.78;
  const showFrontWall = fold < 0.55 && cutaway < 0.72 && dissolve < 0.45;
  const showSideAndWindowWalls = fold < 0.96 && dissolve < 0.88;
  const wallFoldCombined = Math.max(fold, dissolve);
  const foldAngle = wallFoldCombined * 1.48;
  const wallDropY = -wallFoldCombined * wallFoldCombined * 3.8;
  const ceilRiseY = Math.max(fold, cutaway, roofOff) * Math.max(fold, cutaway, roofOff) * 4.8;

  // Bedroom inner dimensions: x in [-2.85, +2.65], y in [0, 2.75], z in [-2.65, +3.35]
  // Open window cutout on back wall (z = -2.65): x in [-1.74, +0.24], y in [1.08, 2.28]
  return (
    <group name="comic-bedroom-interior">
      {/* Floor (deep ultramarine) — ALWAYS stays grounded inside the Shot 04 glass box! */}
      <mesh position={[-0.1, 0, 0.35]} rotation={[-Math.PI / 2, 0, 0]} material={assets.mats.floorUltra}>
        <planeGeometry args={[5.5, 6.0]} />
      </mesh>
      {/* Thin grounded floor slab thickness so the floating floor looks architectural in the void! */}
      {dissolve > 0.05 && (
        <mesh position={[-0.1, -0.07, 0.35]} material={assets.mats.darkInkMetal}>
          <boxGeometry args={[5.56, 0.13, 6.06]} />
        </mesh>
      )}
      {/* Bright pink rug under desk & chair */}
      <mesh position={[-0.78, 0.008, -1.25]} rotation={[-Math.PI / 2, 0, 0]} material={assets.mats.rugPink}>
        <planeGeometry args={[2.55, 1.95]} />
      </mesh>

      {showCeiling && (
        <mesh
          position={[-0.1, 2.75 + ceilRiseY, 0.35]}
          rotation={[Math.PI / 2, 0, 0]}
          material={assets.mats.ceilingPeriwinkle}
        >
          <planeGeometry args={[5.5, 6.0]} />
        </mesh>
      )}
      {showFrontWall && (
        <group position={[-0.1, -cutaway * cutaway * 3.8 + wallDropY, 3.35]} rotation={[Math.max(fold, cutaway) * 1.4, 0, 0]}>
          <mesh position={[0, 1.375, 0]} rotation={[0, Math.PI, 0]} material={assets.mats.wallBlue}>
            <planeGeometry args={[5.5, 2.75]} />
          </mesh>
        </group>
      )}

      {showSideAndWindowWalls && (
        <>
          {/* Left Wall (hinged along floor line x = -2.85) */}
          <group position={[-2.85, wallDropY, 0.35]} rotation={[0, 0, foldAngle]}>
            <mesh position={[0, 1.375, 0]} rotation={[0, Math.PI / 2, 0]} material={assets.mats.wallBlue}>
              <planeGeometry args={[6.0, 2.75]} />
            </mesh>
          </group>
          {/* Right Wall (hinged along floor line x = +2.65) */}
          <group position={[2.65, wallDropY, 0.35]} rotation={[0, 0, -foldAngle]}>
            <mesh position={[0, 1.375, 0]} rotation={[0, -Math.PI / 2, 0]} material={assets.mats.wallBlue}>
              <planeGeometry args={[6.0, 2.75]} />
            </mesh>
          </group>

          {/* BACK WALL (-Z at z = -2.65) WITH REAL 4-PANEL OPEN WINDOW CUTOUT (x∈[-1.74,0.24], y∈[1.08,2.28]) */}
          <group position={[0, wallDropY, -2.65]} rotation={[-foldAngle * 0.72, 0, 0]}>
            {/* Left strip: x in [-2.85, -1.74] */}
            <mesh position={[-2.295, 1.375, 0]} material={assets.mats.wallBlue}>
              <planeGeometry args={[1.11, 2.75]} />
            </mesh>
            {/* Right strip: x in [0.24, 2.65] */}
            <mesh position={[1.445, 1.375, 0]} material={assets.mats.wallBlue}>
              <planeGeometry args={[2.41, 2.75]} />
            </mesh>
            {/* Below window: y in [0, 1.08] */}
            <mesh position={[-0.75, 0.54, 0]} material={assets.mats.wallBlue}>
              <planeGeometry args={[1.98, 1.08]} />
            </mesh>
            {/* Above window: y in [2.28, 2.75] */}
            <mesh position={[-0.75, 2.515, 0]} material={assets.mats.wallBlue}>
              <planeGeometry args={[1.98, 0.47]} />
            </mesh>
          </group>

          {/* Baseboards (dissolve together with the walls in Shot 04!) */}
          <group position={[0, wallDropY * 0.5, 0]}>
            <mesh position={[-2.82, 0.06, 0.35]} material={assets.mats.trimCream}>
              <boxGeometry args={[0.05, 0.12, 6.0]} />
            </mesh>
            <mesh position={[2.62, 0.06, 0.35]} material={assets.mats.trimCream}>
              <boxGeometry args={[0.05, 0.12, 6.0]} />
            </mesh>
            <mesh position={[-0.1, 0.06, -2.62]} material={assets.mats.trimCream}>
              <boxGeometry args={[5.5, 0.12, 0.05]} />
            </mesh>
          </group>

          {/* OPEN WINDOW FRAME, SILL, BLIND HEADER & CENTER MULLION */}
          <group position={[-0.75, 1.68 + wallDropY, -2.64]} rotation={[-foldAngle * 0.5, 0, 0]}>
            {/* Cream roller blind header at top of window */}
            <mesh position={[0, 0.54, 0.05]} material={assets.mats.trimCream}>
              <boxGeometry args={[2.12, 0.22, 0.10]} />
            </mesh>
            {/* Bottom windowsill */}
            <mesh position={[0, -0.62, 0.05]} material={assets.mats.trimCream}>
              <boxGeometry args={[2.16, 0.07, 0.20]} />
            </mesh>
            {/* Left & Right casing */}
            <mesh position={[-1.02, 0, 0.01]} material={assets.mats.trimCream}>
              <boxGeometry args={[0.08, 1.26, 0.18]} />
            </mesh>
            <mesh position={[1.02, 0, 0.01]} material={assets.mats.trimCream}>
              <boxGeometry args={[0.08, 1.26, 0.18]} />
            </mesh>
            {/* Slim center mullion */}
            <mesh position={[0.04, -0.05, 0.0]} material={assets.mats.trimCream}>
              <boxGeometry args={[0.06, 1.12, 0.07]} />
            </mesh>
            {/* Open curtains pulled back cleanly on both sides of the window (Page 6 detail!) */}
            {[-1.16, 1.16].map((cx, ci) => (
              <group key={ci} position={[cx, -0.06, 0.09]}>
                <mesh material={assets.mats.periwinkle}>
                  <boxGeometry args={[0.20, 1.38, 0.07]} />
                </mesh>
                <mesh position={[ci === 0 ? 0.06 : -0.06, 0, 0.03]} material={assets.mats.purpleFurniture}>
                  <cylinderGeometry args={[0.045, 0.055, 1.36, 10]} />
                </mesh>
              </group>
            ))}
          </group>

          {/* UNOBSTRUCTED 3:00 ROUND WALL CLOCK (right of window — dissolves with back wall in Shot 04!) */}
          <group position={[1.02, 1.98 + wallDropY, -2.61]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={assets.mats.darkInkMetal}>
              <cylinderGeometry args={[0.21, 0.21, 0.04, 24]} />
            </mesh>
            <mesh position={[0, 0, 0.015]} rotation={[Math.PI / 2, 0, 0]} material={assets.mats.trimCream}>
              <cylinderGeometry args={[0.185, 0.185, 0.025, 24]} />
            </mesh>
            {/* 3 o'clock hour hand */}
            <mesh position={[0.052, 0, 0.032]} material={assets.mats.darkInkMetal}>
              <boxGeometry args={[0.105, 0.014, 0.008]} />
            </mesh>
            {/* 12 o'clock minute hand */}
            <mesh position={[0, 0.065, 0.032]} material={assets.mats.darkInkMetal}>
              <boxGeometry args={[0.012, 0.13, 0.008]} />
            </mesh>
          </group>
        </>
      )}

      {/* RAISED PENDANT CEILING LAMP (vanishes cleanly when roof opens!) */}
      {showCeiling && (
        <group position={[-0.62, 2.75 + ceilRiseY, -0.82]}>
          <mesh position={[0, -0.04, 0]} material={assets.mats.periwinkle}>
            <cylinderGeometry args={[0.06, 0.07, 0.08, 14]} />
          </mesh>
          <mesh position={[0, -0.26, 0]} material={assets.mats.darkInkMetal}>
            <cylinderGeometry args={[0.012, 0.012, 0.44, 8]} />
          </mesh>
          <mesh position={[0, -0.52, 0]} material={assets.mats.periwinkle}>
            <sphereGeometry args={[0.19, 20, 16]} />
          </mesh>
        </group>
      )}

      {/* TALL PERIWINKLE WARDROBE (Left Wall Front) */}
      <group position={[-2.52, 0, 0.88]}>
        <mesh position={[0, 1.08, 0]} material={assets.mats.periwinkle}>
          <boxGeometry args={[0.62, 2.16, 1.24]} />
        </mesh>
        <mesh position={[0.32, 1.12, -0.10]} material={assets.mats.darkInkMetal}>
          <boxGeometry args={[0.03, 0.24, 0.025]} />
        </mesh>
        <mesh position={[0.32, 1.12, 0.10]} material={assets.mats.darkInkMetal}>
          <boxGeometry args={[0.03, 0.24, 0.025]} />
        </mesh>
      </group>

      {/* 3x3 BOOKCASE WITH COLORFUL BOOKS & BINS + FRAMED PINK POSTER ABOVE */}
      <group position={[-2.60, 0, -0.96]}>
        {/* Outer frame */}
        <mesh position={[0, 0.66, 0]} material={assets.mats.periwinkle}>
          <boxGeometry args={[0.42, 1.32, 1.18]} />
        </mesh>
        {/* Colorful comic books on upper two shelves */}
        {[0.68, 1.04].map((sy, ri) => (
          <group key={ri} position={[0.08, sy, 0]}>
            <mesh position={[0, 0.04, -0.34]} material={assets.mats.bookCyan}>
              <boxGeometry args={[0.24, 0.24, 0.14]} />
            </mesh>
            <mesh position={[0, 0.02, -0.12]} material={assets.mats.bookPink}>
              <boxGeometry args={[0.24, 0.20, 0.18]} />
            </mesh>
            <mesh position={[0, 0.05, 0.14]} material={assets.mats.bookYellow}>
              <boxGeometry args={[0.22, 0.26, 0.14]} />
            </mesh>
            <mesh position={[0, 0.03, 0.36]} material={assets.mats.purpleFurniture}>
              <boxGeometry args={[0.24, 0.22, 0.16]} />
            </mesh>
          </group>
        ))}
        {/* Three cream storage bins along bottom row */}
        {[-0.36, 0, 0.36].map((bz, bi) => (
          <mesh key={bi} position={[0.07, 0.24, bz]} material={assets.mats.trimCream}>
            <boxGeometry args={[0.32, 0.30, 0.32]} />
          </mesh>
        ))}
      </group>

      {/* FRAMED PINK POSTER ON LEFT WALL ABOVE BOOKCASE (dissolves with left wall in Shot 04!) */}
      {showSideAndWindowWalls && (
        <group position={[-2.82, 1.88 + wallDropY, -0.96]} rotation={[0, Math.PI / 2, 0]}>
          <mesh material={assets.mats.darkInkMetal}>
            <boxGeometry args={[0.62, 0.78, 0.04]} />
          </mesh>
          <mesh position={[0, 0, 0.022]} material={assets.mats.trimCream}>
            <planeGeometry args={[0.54, 0.70]} />
          </mesh>
          <mesh position={[0, 0, 0.026]} material={assets.mats.posterPink}>
            <planeGeometry args={[0.42, 0.56]} />
          </mesh>
        </group>
      )}

      {/* POTTED LUSH BROADLEAF HOUSEPLANT (Back-Left Corner) */}
      <group position={[-2.32, 0, -2.02]}>
        <mesh position={[0, 0.20, 0]} material={assets.mats.purpleFurniture}>
          <cylinderGeometry args={[0.22, 0.15, 0.40, 16]} />
        </mesh>
        {[0, 1, 2, 3, 4, 5, 6].map((li) => {
          const ang = (li / 7) * Math.PI * 2;
          return (
            <mesh
              key={li}
              position={[Math.cos(ang) * 0.15, 0.46 + (li % 2) * 0.09, Math.sin(ang) * 0.15]}
              rotation={[Math.sin(ang) * 0.52, ang, -Math.cos(ang) * 0.52]}
              scale={[1.0, 0.22, 1.7]}
              material={assets.mats.plantGreen}
            >
              <sphereGeometry args={[0.13, 12, 10]} />
            </mesh>
          );
        })}
      </group>

      {/* DESK + T-POSE MONITOR + ARTICULATED LAMP + SWIVEL CHAIR (Directly beneath Open Window!) */}
      <group position={[-0.86, 0, -2.04]}>
        <mesh position={[0, 0.76, 0]} material={assets.mats.deskTop}>
          <boxGeometry args={[1.56, 0.055, 0.72]} />
        </mesh>
        {[-0.72, 0.72].map((lx) =>
          [-0.30, 0.30].map((lz) => (
            <mesh key={`${lx}-${lz}`} position={[lx, 0.37, lz]} material={assets.mats.darkInkMetal}>
              <boxGeometry args={[0.045, 0.74, 0.045]} />
            </mesh>
          )),
        )}
        {/* Monitor with T-pose 3D viewport */}
        <mesh position={[0.08, 0.80, -0.12]} material={assets.mats.darkInkMetal}>
          <boxGeometry args={[0.24, 0.025, 0.16]} />
        </mesh>
        <mesh position={[0.08, 0.92, -0.14]} material={assets.mats.darkInkMetal}>
          <boxGeometry args={[0.05, 0.22, 0.04]} />
        </mesh>
        <mesh position={[0.08, 1.13, -0.12]} material={assets.mats.darkInkMetal}>
          <boxGeometry args={[0.74, 0.44, 0.036]} />
        </mesh>
        <mesh position={[0.08, 1.13, -0.098]} material={assets.mats.monitorScreen}>
          <planeGeometry args={[0.69, 0.39]} />
        </mesh>
        {/* Keyboard & mouse */}
        <mesh position={[0.04, 0.798, 0.14]} material={assets.mats.trimCream}>
          <boxGeometry args={[0.42, 0.018, 0.14]} />
        </mesh>
        <mesh position={[0.36, 0.796, 0.14]} material={assets.mats.posterPink}>
          <boxGeometry args={[0.18, 0.008, 0.16]} />
        </mesh>
        {/* Mini desk succulent */}
        <group position={[0.58, 0.79, -0.06]}>
          <mesh position={[0, 0.06, 0]} material={assets.mats.bookCyan}>
            <cylinderGeometry args={[0.065, 0.052, 0.12, 12]} />
          </mesh>
          <mesh position={[0, 0.14, 0]} material={assets.mats.plantGreen}>
            <sphereGeometry args={[0.065, 10, 8]} />
          </mesh>
        </group>

        {/* Articulated Comic Desk Lamp (left edge of desk, glowing bulb casting hard cream night pool!) */}
        <group position={[-0.56, 0.79, -0.08]}>
          <mesh material={assets.mats.darkInkMetal}>
            <cylinderGeometry args={[0.08, 0.09, 0.03, 14]} />
          </mesh>
          <mesh position={[-0.04, 0.21, 0]} rotation={[0, 0, 0.22]} material={assets.mats.lampCoral}>
            <cylinderGeometry args={[0.012, 0.012, 0.42, 8]} />
          </mesh>
          <mesh position={[0.06, 0.42, 0.04]} rotation={[0.22, 0, -0.68]} material={assets.mats.lampCoral}>
            <cylinderGeometry args={[0.012, 0.012, 0.34, 8]} />
          </mesh>
          <mesh position={[0.17, 0.46, 0.08]} rotation={[0.34, 0, -0.82]} material={assets.mats.lampCoral}>
            <coneGeometry args={[0.095, 0.15, 16]} />
          </mesh>
          <mesh position={[0.20, 0.42, 0.10]} material={assets.mats.lampBulb}>
            <sphereGeometry args={[0.052, 12, 10]} />
          </mesh>
        </group>

        {/* Purple Swivel Office Chair */}
        <group position={[-0.08, 0, 0.62]} rotation={[0, 0.24, 0]}>
          <mesh position={[0, 0.47, 0]} material={assets.mats.purpleFurniture}>
            <boxGeometry args={[0.48, 0.075, 0.46]} />
          </mesh>
          <mesh position={[0, 0.85, 0.21]} material={assets.mats.purpleFurniture}>
            <boxGeometry args={[0.46, 0.64, 0.065]} />
          </mesh>
          <mesh position={[0, 0.25, 0]} material={assets.mats.darkInkMetal}>
            <cylinderGeometry args={[0.03, 0.03, 0.42, 10]} />
          </mesh>
          {[0, 1, 2, 3, 4].map((ci) => {
            const ca = (ci / 5) * Math.PI * 2;
            return (
              <mesh
                key={ci}
                position={[Math.cos(ca) * 0.16, 0.055, Math.sin(ca) * 0.16]}
                rotation={[0, -ca, 0]}
                material={assets.mats.darkInkMetal}
              >
                <boxGeometry args={[0.32, 0.035, 0.04]} />
              </mesh>
            );
          })}
        </group>
      </group>

      {/* PURPLE NIGHTSTAND + COLD TEA MUG + COILED CHARGER CABLE + EMERALD-TEAL BED (Right Side) */}
      <group position={[0.46, 0, -2.06]}>
        <mesh position={[0, 0.28, 0]} material={assets.mats.purpleFurniture}>
          <boxGeometry args={[0.50, 0.56, 0.44]} />
        </mesh>
        {/* Cold tea ceramic mug resting on nightstand (planted background prop from Page 6!) */}
        <group position={[-0.08, 0.56, 0.02]}>
          <mesh position={[0, 0.052, 0]} material={assets.mats.trimCream}>
            <cylinderGeometry args={[0.046, 0.042, 0.104, 16]} />
          </mesh>
          {/* Dark cold tea liquid surface inside mug */}
          <mesh position={[0, 0.092, 0]} material={assets.mats.darkInkMetal}>
            <cylinderGeometry args={[0.038, 0.038, 0.012, 14]} />
          </mesh>
          {/* Mug handle */}
          <mesh position={[0.052, 0.052, 0]} rotation={[0, 0, Math.PI / 2]} material={assets.mats.trimCream}>
            <torusGeometry args={[0.028, 0.008, 8, 14, Math.PI]} />
          </mesh>
        </group>
        {/* Coiled charger cable & USB plug trailing toward his bed */}
        <group position={[0.12, 0.566, 0.06]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={assets.mats.darkInkMetal}>
            <torusGeometry args={[0.052, 0.007, 8, 18]} />
          </mesh>
          <mesh position={[0.02, 0.006, 0.02]} rotation={[Math.PI / 2, 0, 0.4]} material={assets.mats.darkInkMetal}>
            <torusGeometry args={[0.036, 0.006, 8, 16]} />
          </mesh>
          <mesh position={[0.14, 0.004, 0.06]} rotation={[0, 0.3, Math.PI / 2]} material={assets.mats.darkInkMetal}>
            <cylinderGeometry args={[0.005, 0.005, 0.24, 6]} />
          </mesh>
        </group>
      </group>
      <group position={[1.68, 0, -1.16]}>
        <mesh position={[0, 0.66, -1.04]} material={assets.mats.periwinkle}>
          <boxGeometry args={[1.64, 1.04, 0.08]} />
        </mesh>
        <mesh position={[0, 0.34, 0]} material={assets.mats.duvetTeal}>
          <boxGeometry args={[1.60, 0.44, 2.02]} />
        </mesh>
        <mesh position={[-0.38, 0.62, -0.74]} scale={[1.0, 0.34, 0.66]} material={assets.mats.pillowCream}>
          <sphereGeometry args={[0.31, 18, 14]} />
        </mesh>
        <mesh position={[0.38, 0.62, -0.74]} scale={[1.0, 0.34, 0.66]} material={assets.mats.pillowCream}>
          <sphereGeometry args={[0.31, 18, 14]} />
        </mesh>
      </group>
    </group>
  );
};
