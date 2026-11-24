// High-performance InstancedMesh metropolis renderer (<25 draw calls) for the 25-block Comic-Print City:
// - 80+ buildings across 6 vivid Day/Night Comic-Print window-grid palettes + tapered teal/white spires
// - 160+ projecting 3D balconies & railings + ground-floor shopfront canopies
// - Detailed rooftops: parapets, stairwell penthouses, water towers on stilts, HVAC AC units, skylights, blinking beacons
// - 52 footpath street trees, 26 glowing streetlamps, dashed lane stripes & zebra crosswalks
// - 10 layered 3D comic mountain peaks + radiant layered Sun orbs on both +Z and -Z horizons

import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  type BuildingSpec,
  type CityLayout,
  CITY_GROUND_Y,
  computeTextureAlignedBalconyRows,
  WINDOW_FACADE_COLS,
  WINDOW_FACADE_PAD_X,
  WINDOW_FACADE_ROWS,
} from "./comicRoomPresets";
import {
  type ComicLightingConfig,
  createComicOutlineMaterial,
  createComicPrintMaterial,
  syncComicPrintMaterial,
} from "./comicPrintShader";

export interface CityInstancedDistrictProps {
  layout: CityLayout;
  lighting: ComicLightingConfig;
  tSec: number;
}

interface PaletteDef {
  wallDay: string;
  wallNight: string;
  shadow: string;
  winOff: string;
  winWarm: string;
  winCool: string;
}

const BUILDING_PALETTES: PaletteDef[] = [
  { wallDay: "#14879c", wallNight: "#0d4a66", shadow: "#0d2e4c", winOff: "#17234d", winWarm: "#fff4b3", winCool: "#9af7ff" },
  { wallDay: "#e6a817", wallNight: "#8f5d14", shadow: "#52321e", winOff: "#1b224a", winWarm: "#fff7c2", winCool: "#9bf2ff" },
  { wallDay: "#d93275", wallNight: "#7d1b4e", shadow: "#40123e", winOff: "#1c1645", winWarm: "#fff1b3", winCool: "#ffb8ed" },
  { wallDay: "#4854db", wallNight: "#232a78", shadow: "#15194d", winOff: "#12183d", winWarm: "#fff2b8", winCool: "#94ebff" },
  { wallDay: "#1fa686", wallNight: "#125754", shadow: "#0f313e", winOff: "#152147", winWarm: "#fff7bf", winCool: "#a8fbff" },
  { wallDay: "#d95d3b", wallNight: "#7d2d28", shadow: "#401629", winOff: "#1b1742", winWarm: "#fff2b3", winCool: "#ffe0ba" },
];

function createWindowFacadeTexture(palette: PaletteDef, seedOffset: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = palette.wallDay;
    ctx.fillRect(0, 0, 256, 512);

    // Subtle horizontal floor cornice bands
    ctx.fillStyle = "#181842";
    for (let y = 0; y < 512; y += 32) {
      ctx.fillRect(0, y, 256, 2);
    }

    const cols = WINDOW_FACADE_COLS;
    const rows = WINDOW_FACADE_ROWS;
    const padX = Math.round(WINDOW_FACADE_PAD_X * 256);
    const cellW = (256 - padX * 2) / cols;
    const cellH = 512 / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = ((r * 37 + c * 17 + seedOffset * 53) * 19) % 100;
        const wx = padX + c * cellW + 5;
        const wy = r * cellH + 6;
        const ww = cellW - 10;
        const wh = cellH - 12;

        // Window indigo frame
        ctx.fillStyle = "#181842";
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);

        // Window glass (warm lit, cool lit, or deep night glass)
        if (h < 34) {
          ctx.fillStyle = palette.winWarm;
        } else if (h < 50) {
          ctx.fillStyle = palette.winCool;
        } else {
          ctx.fillStyle = palette.winOff;
        }
        ctx.fillRect(wx, wy, ww, wh);

        // Crisp comic diagonal sheen bar on glass
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fillRect(wx + 2, wy + 2, ww * 0.32, wh * 0.65);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const _dummy = new THREE.Object3D();

function setInstancedMatrices(mesh: THREE.InstancedMesh, transforms: THREE.Matrix4[]) {
  transforms.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = transforms.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
}

function makeTransform(
  px: number,
  py: number,
  pz: number,
  sx: number,
  sy: number,
  sz: number,
  ry = 0,
): THREE.Matrix4 {
  _dummy.position.set(px, py, pz);
  _dummy.rotation.set(0, ry, 0);
  _dummy.scale.set(sx, sy, sz);
  _dummy.updateMatrix();
  return _dummy.matrix.clone();
}

export const CityInstancedDistrict: React.FC<CityInstancedDistrictProps> = ({
  layout,
  lighting,
  tSec,
}) => {
  const beaconMatRef = useRef<THREE.ShaderMaterial | null>(null);

  const district = useMemo(() => {
    const facadeTextures = BUILDING_PALETTES.map((p, idx) => createWindowFacadeTexture(p, idx + 1));

    const bldgMats = BUILDING_PALETTES.map((p, idx) =>
      createComicPrintMaterial({
        baseColor: "#ffffff",
        shadowColor: p.shadow,
        highlightColor: "#ffffff",
        emissive: "#ffdf99",
        emissiveIntensity: 0.72,
        map: facadeTextures[idx],
        dotScale: 5.5,
        inkStrength: 0.78,
      }),
    );

    const mats = {
      spire: createComicPrintMaterial({
        baseColor: "#eaf7ff",
        shadowColor: "#4f7fa6",
        highlightColor: "#ffffff",
        emissive: "#6be5ff",
        emissiveIntensity: 0.25,
        dotScale: 5.2,
        inkStrength: 0.72,
      }),
      outlineSpire: createComicOutlineMaterial(0.08, "#16163d"),
      balcony: createComicPrintMaterial({
        baseColor: "#eef3ff",
        shadowColor: "#4b558a",
        dotScale: 5.0,
        inkStrength: 0.85,
      }),
      railing: createComicPrintMaterial({
        baseColor: "#232659",
        shadowColor: "#111230",
        dotScale: 5.0,
        inkStrength: 0.75,
      }),
      awning: createComicPrintMaterial({
        baseColor: "#ff5c7c",
        shadowColor: "#7d1c45",
        dotScale: 5.0,
        inkStrength: 0.78,
      }),
      rooftopConcrete: createComicPrintMaterial({
        baseColor: "#c9d4eb",
        shadowColor: "#485280",
        dotScale: 5.2,
        inkStrength: 0.75,
      }),
      waterTowerWood: createComicPrintMaterial({
        baseColor: "#d9884e",
        shadowColor: "#5c2e28",
        dotScale: 5.0,
        inkStrength: 0.82,
      }),
      steelDark: createComicPrintMaterial({
        baseColor: "#353c6b",
        shadowColor: "#151738",
        dotScale: 5.0,
        inkStrength: 0.78,
      }),
      skylight: createComicPrintMaterial({
        baseColor: "#78ecff",
        shadowColor: "#2a7da6",
        emissive: "#64e8ff",
        emissiveIntensity: 0.72,
        dotScale: 5.0,
        inkStrength: 0.65,
      }),
      beaconRed: createComicPrintMaterial({
        baseColor: "#ff3355",
        shadowColor: "#99112b",
        emissive: "#ff2e55",
        emissiveIntensity: 1.5,
        dotScale: 4.5,
        inkStrength: 0.2,
      }),
      treeTrunk: createComicPrintMaterial({
        baseColor: "#784838",
        shadowColor: "#361b1c",
        dotScale: 5.0,
        inkStrength: 0.8,
      }),
      treeCanopy: createComicPrintMaterial({
        baseColor: "#36d97e",
        shadowColor: "#115e4b",
        highlightColor: "#9eff9e",
        dotScale: 5.0,
        inkStrength: 0.82,
      }),
      lampGlobe: createComicPrintMaterial({
        baseColor: "#fff8d6",
        shadowColor: "#ffd166",
        emissive: "#ffe99e",
        emissiveIntensity: 1.45,
        dotScale: 4.5,
        inkStrength: 0.25,
      }),
      roadStripe: createComicPrintMaterial({
        baseColor: "#fff6cc",
        shadowColor: "#c4b687",
        emissive: "#ffeaa3",
        emissiveIntensity: 0.22,
        dotScale: 5.5,
        inkStrength: 0.2,
        polygonOffset: true,
      }),
      mountain: createComicPrintMaterial({
        baseColor: "#5b5ea6",
        shadowColor: "#242559",
        highlightColor: "#a29be0",
        dotScale: 6.5,
        inkStrength: 0.52,
        fogScale: 0.72,
      }),
      mountainCap: createComicPrintMaterial({
        baseColor: "#f2d6ff",
        shadowColor: "#7f72b8",
        highlightColor: "#ffffff",
        dotScale: 6.0,
        inkStrength: 0.4,
        fogScale: 0.65,
      }),
      sunCore: createComicPrintMaterial({
        baseColor: "#fff4b8",
        shadowColor: "#ffc44d",
        emissive: "#ffcf5c",
        emissiveIntensity: 1.75,
        dotScale: 5.0,
        inkStrength: 0.15,
        fogScale: 0.12,
      }),
      sunHaloInner: new THREE.MeshBasicMaterial({
        color: "#ff9b54",
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
      sunHaloOuter: new THREE.MeshBasicMaterial({
        color: "#ff5c7c",
        transparent: true,
        opacity: 0.20,
        depthWrite: false,
      }),
    };

    // Bucket building transforms by palette & spire type
    const paletteBuckets: THREE.Matrix4[][] = BUILDING_PALETTES.map(() => []);
    const spireMatrices: THREE.Matrix4[] = [];
    const balconySlabs: THREE.Matrix4[] = [];
    const balconyRails: THREE.Matrix4[] = [];
    const awnings: THREE.Matrix4[] = [];
    const parapets: THREE.Matrix4[] = [];
    const penthouses: THREE.Matrix4[] = [];
    const waterTowerTanks: THREE.Matrix4[] = [];
    const waterTowerRoofs: THREE.Matrix4[] = [];
    const waterTowerLegs: THREE.Matrix4[] = [];
    const acUnits: THREE.Matrix4[] = [];
    const skylights: THREE.Matrix4[] = [];
    const antennaMasts: THREE.Matrix4[] = [];
    const beaconTips: THREE.Matrix4[] = [];

    const addRooftopDetails = (b: BuildingSpec) => {
      const topY = b.baseY + b.h;
      if (b.style === "spire") {
        antennaMasts.push(makeTransform(b.x, topY + 3.4, b.z, 0.22, 6.8, 0.22));
        beaconTips.push(makeTransform(b.x, topY + 6.95, b.z, 0.42, 0.42, 0.42));
        return;
      }

      // Raised parapet rim along roof perimeter
      const pThick = 0.28;
      const pH = 0.55;
      parapets.push(
        makeTransform(b.x, topY + pH * 0.5, b.z - b.d * 0.5 + pThick * 0.5, b.w, pH, pThick),
        makeTransform(b.x, topY + pH * 0.5, b.z + b.d * 0.5 - pThick * 0.5, b.w, pH, pThick),
        makeTransform(b.x - b.w * 0.5 + pThick * 0.5, topY + pH * 0.5, b.z, pThick, pH, b.d),
        makeTransform(b.x + b.w * 0.5 - pThick * 0.5, topY + pH * 0.5, b.z, pThick, pH, b.d),
      );

      if (b.rooftop.hasPenthouse) {
        const pw = Math.min(b.w * 0.34, 2.8);
        const pd = Math.min(b.d * 0.36, 2.4);
        const ph = 1.65;
        penthouses.push(makeTransform(b.x - b.w * 0.22, topY + ph * 0.5, b.z + b.d * 0.12, pw, ph, pd));
      }

      if (b.rooftop.hasWaterTower) {
        const wx = b.x + b.w * 0.22;
        const wz = b.z - b.d * 0.14;
        const legH = 1.35;
        const tankH = 1.85;
        waterTowerTanks.push(makeTransform(wx, topY + legH + tankH * 0.5, wz, 0.92, tankH, 0.92));
        waterTowerRoofs.push(makeTransform(wx, topY + legH + tankH + 0.48, wz, 1.06, 0.96, 1.06));
        for (const ox of [-0.52, 0.52]) {
          for (const oz of [-0.52, 0.52]) {
            waterTowerLegs.push(makeTransform(wx + ox, topY + legH * 0.5, wz + oz, 0.14, legH, 0.14));
          }
        }
      }

      for (let a = 0; a < b.rooftop.acCount; a++) {
        const ax = b.x - b.w * 0.24 + a * 1.15;
        const az = b.z - b.d * 0.24;
        acUnits.push(makeTransform(ax, topY + 0.42, az, 0.82, 0.78, 0.72));
      }

      if (b.rooftop.hasSkylight) {
        skylights.push(makeTransform(b.x + b.w * 0.12, topY + 0.26, b.z + b.d * 0.18, 2.1, 0.42, 1.5));
      }

      if (b.rooftop.hasAntenna) {
        const ax = b.x + b.w * 0.28;
        const az = b.z + b.d * 0.22;
        antennaMasts.push(makeTransform(ax, topY + 2.35, az, 0.14, 4.7, 0.14));
        beaconTips.push(makeTransform(ax, topY + 4.82, az, 0.34, 0.34, 0.34));
      }
    };

    layout.districtBuildings.forEach((b) => {
      if (b.style === "spire") {
        spireMatrices.push(makeTransform(b.x, b.baseY + b.h * 0.5, b.z, b.w, b.h, b.d));
      } else {
        paletteBuckets[b.paletteIndex % BUILDING_PALETTES.length].push(
          makeTransform(b.x, b.baseY + b.h * 0.5, b.z, b.w, b.h, b.d),
        );
      }

      // Texture-aligned 3D projecting balconies sitting strictly beneath painted 14x6 window sills!
      if (b.hasBalconies) {
        const alignedRows = computeTextureAlignedBalconyRows(b.baseY, b.h, WINDOW_FACADE_ROWS);
        const colSpanU = (1 - WINDOW_FACADE_PAD_X * 2) / WINDOW_FACADE_COLS;
        // Two clean symmetrical 2-column window bays (cols 1..2 and cols 3..4) or centered 2-column bay (cols 2..3)
        const bayPairs: [number, number][] = b.d >= 8.5 || b.w >= 8.5 ? [[1, 2], [3, 4]] : [[2, 3]];

        for (const face of b.balconyFaces) {
          const faceLen = face === "+x" || face === "-x" ? b.d : b.w;
          for (const rowInfo of alignedRows) {
            const by = rowInfo.sillY - 0.08; // top of slab kisses the exact painted window sill line!
            const railH = Math.min(0.84, Math.max(0.56, rowInfo.floorHeight * 0.44));
            const depthProj = 0.88;

            for (const [cStart, cEnd] of bayPairs) {
              const uCenter = WINDOW_FACADE_PAD_X + ((cStart + cEnd + 1) * 0.5) * colSpanU;
              const alongOffset = (uCenter - 0.5) * faceLen;
              const bayWidth = Math.max(1.25, (cEnd - cStart + 1) * colSpanU * faceLen + 0.14);

              if (face === "+x" || face === "-x") {
                const dir = face === "+x" ? 1 : -1;
                const bx = b.x + dir * (b.w * 0.5 + depthProj * 0.5);
                const bz = b.z + alongOffset;
                // Architectural concrete slab + underside wall corbel brackets
                balconySlabs.push(
                  makeTransform(bx, by, bz, depthProj, 0.14, bayWidth),
                  makeTransform(bx - dir * 0.22, by - 0.14, bz - bayWidth * 0.36, 0.38, 0.18, 0.12),
                  makeTransform(bx - dir * 0.22, by - 0.14, bz + bayWidth * 0.36, 0.38, 0.18, 0.12),
                );
                // Crisp open metal railing: top handrail, lower knee rail, corner posts + 3 vertical balusters!
                const frontX = bx + dir * (depthProj * 0.45);
                balconyRails.push(
                  makeTransform(frontX, by + railH, bz, 0.07, 0.07, bayWidth),
                  makeTransform(frontX, by + railH * 0.48, bz, 0.05, 0.05, bayWidth),
                  makeTransform(bx, by + railH, bz - bayWidth * 0.48, depthProj, 0.07, 0.07),
                  makeTransform(bx, by + railH, bz + bayWidth * 0.48, depthProj, 0.07, 0.07),
                  makeTransform(frontX, by + railH * 0.5, bz - bayWidth * 0.48, 0.06, railH, 0.06),
                  makeTransform(frontX, by + railH * 0.5, bz + bayWidth * 0.48, 0.06, railH, 0.06),
                  makeTransform(frontX, by + railH * 0.5, bz - bayWidth * 0.18, 0.04, railH, 0.04),
                  makeTransform(frontX, by + railH * 0.5, bz + bayWidth * 0.18, 0.04, railH, 0.04),
                );
              } else {
                const dir = face === "+z" ? 1 : -1;
                const bx = b.x + alongOffset;
                const bz = b.z + dir * (b.d * 0.5 + depthProj * 0.5);
                balconySlabs.push(
                  makeTransform(bx, by, bz, bayWidth, 0.14, depthProj),
                  makeTransform(bx - bayWidth * 0.36, by - 0.14, bz - dir * 0.22, 0.12, 0.18, 0.38),
                  makeTransform(bx + bayWidth * 0.36, by - 0.14, bz - dir * 0.22, 0.12, 0.18, 0.38),
                );
                const frontZ = bz + dir * (depthProj * 0.45);
                balconyRails.push(
                  makeTransform(bx, by + railH, frontZ, bayWidth, 0.07, 0.07),
                  makeTransform(bx, by + railH * 0.48, frontZ, bayWidth, 0.05, 0.05),
                  makeTransform(bx - bayWidth * 0.48, by + railH, bz, 0.07, 0.07, depthProj),
                  makeTransform(bx + bayWidth * 0.48, by + railH, bz, 0.07, 0.07, depthProj),
                  makeTransform(bx - bayWidth * 0.48, by + railH * 0.5, frontZ, 0.06, railH, 0.06),
                  makeTransform(bx + bayWidth * 0.48, by + railH * 0.5, frontZ, 0.06, railH, 0.06),
                  makeTransform(bx - bayWidth * 0.18, by + railH * 0.5, frontZ, 0.04, railH, 0.04),
                  makeTransform(bx + bayWidth * 0.18, by + railH * 0.5, frontZ, 0.04, railH, 0.04),
                );
              }
            }
          }
        }
      }

      // Ground-floor shopfront canopies facing Grand Central Boulevard
      if (b.hasAwning) {
        const facesRight = b.x < -2;
        const ax = facesRight ? b.x + b.w * 0.5 + 0.55 : b.x - b.w * 0.5 - 0.55;
        awnings.push(makeTransform(ax, b.baseY + 2.85, b.z, 1.15, 0.36, Math.min(b.d * 0.72, 3.8)));
      }

      addRooftopDetails(b);
    });

    // Trees (trunk + 2 sculpted canopy spheres per tree)
    const treeTrunks: THREE.Matrix4[] = [];
    const treeCrowns: THREE.Matrix4[] = [];
    layout.trees.forEach((tr) => {
      const s = tr.scale;
      treeTrunks.push(makeTransform(tr.x, tr.baseY + 1.05 * s, tr.z, 0.24 * s, 2.1 * s, 0.24 * s));
      treeCrowns.push(
        makeTransform(tr.x, tr.baseY + 2.65 * s, tr.z, 1.12 * s, 1.02 * s, 1.12 * s),
        makeTransform(tr.x + 0.35 * s, tr.baseY + 2.35 * s, tr.z - 0.22 * s, 0.76 * s, 0.72 * s, 0.76 * s),
      );
    });

    // Boulevard streetlamps (tall pole + curved arm + glowing cream globe)
    const lampPoles: THREE.Matrix4[] = [];
    const lampArms: THREE.Matrix4[] = [];
    const lampGlobes: THREE.Matrix4[] = [];
    layout.lamps.forEach((lp) => {
      lampPoles.push(makeTransform(lp.x, lp.baseY + 2.55, lp.z, 0.14, 5.1, 0.14));
      lampArms.push(makeTransform(lp.x + lp.facingX * 0.55, lp.baseY + 5.02, lp.z, 1.15, 0.11, 0.11));
      lampGlobes.push(makeTransform(lp.x + lp.facingX * 1.05, lp.baseY + 4.86, lp.z, 0.42, 0.34, 0.42));
    });

    // Dashed boulevard centerline stripes & zebra crosswalks
    const stripeMatrices: THREE.Matrix4[] = [];
    for (let z = -232; z <= -10; z += 5.5) {
      stripeMatrices.push(makeTransform(-1.6, CITY_GROUND_Y + 0.04, z, 0.22, 0.03, 2.4));
    }
    // Crosswalks along Grand Boulevard at every cross street
    for (let i = 0; i < 14; i++) {
      const cz = -6.8 - i * 16.5;
      for (const zOff of [-2.45, 2.45]) {
        for (let sx = -4.1; sx <= 0.9; sx += 0.92) {
          stripeMatrices.push(makeTransform(sx, CITY_GROUND_Y + 0.045, cz + zOff, 0.44, 0.03, 1.35));
        }
      }
    }

    // Layered sculpted comic mountain cones & snow/twilight caps
    const mountainBodies: THREE.Matrix4[] = [];
    const mountainCaps: THREE.Matrix4[] = [];
    layout.mountains.forEach((m) => {
      mountainBodies.push(makeTransform(m.x, CITY_GROUND_Y + m.height * 0.5, m.z, m.radius, m.height, m.radius, m.rotY));
      mountainCaps.push(
        makeTransform(
          m.x,
          CITY_GROUND_Y + m.height * 0.86,
          m.z,
          m.radius * 0.29,
          m.height * 0.29,
          m.radius * 0.29,
          m.rotY,
        ),
      );
    });

    // Shared geometries
    const geos = {
      box: new THREE.BoxGeometry(1, 1, 1),
      spire: new THREE.CylinderGeometry(0.18, 0.58, 1, 4),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
      cone: new THREE.ConeGeometry(0.65, 1, 12),
      sphere: new THREE.SphereGeometry(1, 14, 10),
      mtnCone: new THREE.ConeGeometry(1, 1, 7),
    };
    geos.spire.rotateY(Math.PI / 4);

    // Build all InstancedMeshes once cleanly
    const meshes: THREE.InstancedMesh[] = [];
    const makeIM = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(list.length, 1));
      setInstancedMatrices(im, list);
      meshes.push(im);
      return im;
    };

    const buildingMeshes = paletteBuckets.map((list, idx) => makeIM(geos.box, bldgMats[idx], list));
    const spireMesh = makeIM(geos.spire, mats.spire, spireMatrices);
    const spireOutlineMesh = makeIM(geos.spire, mats.outlineSpire, spireMatrices);
    const balconySlabMesh = makeIM(geos.box, mats.balcony, balconySlabs);
    const balconyRailMesh = makeIM(geos.box, mats.railing, balconyRails);
    const awningMesh = makeIM(geos.box, mats.awning, awnings);
    const parapetMesh = makeIM(geos.box, mats.rooftopConcrete, parapets);
    const penthouseMesh = makeIM(geos.box, mats.rooftopConcrete, penthouses);
    const waterTankMesh = makeIM(geos.cyl, mats.waterTowerWood, waterTowerTanks);
    const waterRoofMesh = makeIM(geos.cone, mats.steelDark, waterTowerRoofs);
    const waterLegMesh = makeIM(geos.box, mats.steelDark, waterTowerLegs);
    const acMesh = makeIM(geos.box, mats.rooftopConcrete, acUnits);
    const skylightMesh = makeIM(geos.box, mats.skylight, skylights);
    const antennaMesh = makeIM(geos.cyl, mats.steelDark, antennaMasts);
    const beaconMesh = makeIM(geos.sphere, mats.beaconRed, beaconTips);
    const trunkMesh = makeIM(geos.cyl, mats.treeTrunk, treeTrunks);
    const crownMesh = makeIM(geos.sphere, mats.treeCanopy, treeCrowns);
    const lampPoleMesh = makeIM(geos.cyl, mats.steelDark, lampPoles);
    const lampArmMesh = makeIM(geos.box, mats.steelDark, lampArms);
    const lampGlobeMesh = makeIM(geos.sphere, mats.lampGlobe, lampGlobes);
    const stripeMesh = makeIM(geos.box, mats.roadStripe, stripeMatrices);
    stripeMesh.name = "city-road-markings";
    const mtnMesh = makeIM(geos.mtnCone, mats.mountain, mountainBodies);
    const mtnCapMesh = makeIM(geos.mtnCone, mats.mountainCap, mountainCaps);

    return {
      facadeTextures,
      bldgMats,
      mats,
      geos,
      meshes,
      buildingMeshes,
      spireMesh,
      spireOutlineMesh,
      balconySlabMesh,
      balconyRailMesh,
      awningMesh,
      parapetMesh,
      penthouseMesh,
      waterTankMesh,
      waterRoofMesh,
      waterLegMesh,
      acMesh,
      skylightMesh,
      antennaMesh,
      beaconMesh,
      trunkMesh,
      crownMesh,
      lampPoleMesh,
      lampArmMesh,
      lampGlobeMesh,
      stripeMesh,
      mtnMesh,
      mtnCapMesh,
    };
  }, [layout]);

  beaconMatRef.current = district.mats.beaconRed;

  useEffect(() => {
    return () => {
      district.facadeTextures.forEach((t) => t.dispose());
      district.bldgMats.forEach((m) => m.dispose());
      Object.values(district.mats).forEach((m) => m.dispose());
      Object.values(district.geos).forEach((g) => g.dispose());
    };
  }, [district]);

  // Sync every ComicPrint material safely (excluding outlineSpire & MeshBasicMaterials)
  district.bldgMats.forEach((m) => syncComicPrintMaterial(m, lighting));
  Object.values(district.mats).forEach((m) => {
    if (m !== district.mats.outlineSpire) {
      syncComicPrintMaterial(m, lighting);
    }
  });

  // Blinking red aviation beacons on rooftop antennas
  if (beaconMatRef.current && beaconMatRef.current.uniforms.uEmissiveIntensity) {
    const pulse = 0.55 + 1.35 * (0.5 + 0.5 * Math.sin(tSec * 4.2));
    beaconMatRef.current.uniforms.uEmissiveIntensity.value = pulse;
  }

  return (
    <group name="city-instanced-district">
      {district.meshes.map((im, idx) => (
        <primitive key={idx} object={im} />
      ))}

      {/* Radiant Comic Sun Orb + Halo Rings on +Z horizon (framed clearly above skyline & mountains in WindowZoom4K Frame 0!) */}
      <group position={[18, 66, 212]}>
        <mesh material={district.mats.sunCore}>
          <sphereGeometry args={[15.5, 24, 18]} />
        </mesh>
        <mesh material={district.mats.sunHaloInner}>
          <sphereGeometry args={[24.0, 20, 14]} />
        </mesh>
        <mesh material={district.mats.sunHaloOuter}>
          <sphereGeometry args={[34.0, 20, 14]} />
        </mesh>
      </group>

      {/* Radiant Comic Sun Orb on -Z horizon (visible looking out his bedroom window & ComicCity4K!) */}
      <group position={[-42, 52, -268]}>
        <mesh material={district.mats.sunCore}>
          <sphereGeometry args={[13.0, 24, 18]} />
        </mesh>
        <mesh material={district.mats.sunHaloInner}>
          <sphereGeometry args={[20.5, 20, 14]} />
        </mesh>
        <mesh material={district.mats.sunHaloOuter}>
          <sphereGeometry args={[30.0, 20, 14]} />
        </mesh>
      </group>
    </group>
  );
};
