// Pure deterministic layout, lighting presets, camera kinematics, and AABB overlap verifier
// for the Comic-Print 3D Bedroom and 25-Building Non-Overlapping 3D Metropolis.
//
// Coordinate System:
// - Bedroom interior occupies x in [-2.85, +2.65], y in [0, 2.75], z in [-2.65, +3.35]
// - Open bedroom window on the -Z wall: x in [-1.74, +0.24], y in [1.08, 2.28], z = -2.65
// - Grand Central Boulevard runs along -Z (x in [-4.6, +1.4] asphalt, footpaths at [-6.8,-4.6] & [+1.4,+3.6])
// - WindowZoom4K starts 25 buildings away (z = -206, facing +Z) and zooms smoothly down the
//   unobstructed boulevard straight through his open glowing bedroom window at z = -2.65 -> -1.05!

import * as THREE from "three";
import type { ComicLightingConfig, RoomLightingMode } from "./comicPrintShader";

export type { RoomLightingMode };
export type RoomCameraPreset =
  | "windowZoom"
  | "bedPhone"
  | "city"
  | "cityTour"
  | "wide"
  | "desk"
  | "window";

export interface Rect2D {
  id: string;
  x: number; // center X
  z: number; // center Z
  w: number; // width along X
  d: number; // depth along Z
}

export interface RoadSegment extends Rect2D {
  axis: "z" | "x";
  lanes: number;
}

export interface FootpathSegment extends Rect2D {
  elevation: number;
}

export interface BuildingSpec extends Rect2D {
  h: number;
  baseY: number;
  paletteIndex: number; // 0..5
  style: "apartment" | "tower" | "spire" | "hero" | "yellow" | "pink" | "magenta";
  hasBalconies: boolean;
  balconyFaces: ("+x" | "-x" | "+z" | "-z")[];
  hasAwning: boolean;
  rooftop: {
    hasWaterTower: boolean;
    hasPenthouse: boolean;
    acCount: number;
    hasAntenna: boolean;
    hasSkylight: boolean;
  };
}

export interface TreeSpec {
  id: string;
  x: number;
  z: number;
  baseY: number;
  scale: number;
  tint: number;
}

export interface StreetLampSpec {
  id: string;
  x: number;
  z: number;
  baseY: number;
  facingX: number; // +1 or -1 toward roadway
}

export interface CarSpec {
  id: string;
  axis: "z" | "x";
  laneCoord: number; // x if axis==='z', z if axis==='x'
  startPos: number; // initial z or x
  minPos: number;
  maxPos: number;
  speed: number; // m/s signed
  color: string;
  roofColor: string;
}

export interface MountainSpec {
  id: string;
  x: number;
  z: number;
  radius: number;
  height: number;
  rotY: number;
  ridge: "farPlusZ" | "farMinusZ";
}

export interface CloudSpec {
  id: string;
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  driftSpeed: number;
}

export interface CityLayout {
  groundY: number;
  roads: RoadSegment[];
  footpaths: FootpathSegment[];
  heroApartment: BuildingSpec;
  yellowApartment: BuildingSpec;
  pinkBillboardBuilding: BuildingSpec;
  magentaPlazaBuilding: BuildingSpec;
  plaza: Rect2D;
  viaduct: {
    z: number;
    y: number;
    spanX: number;
    pillarXs: number[];
  };
  districtBuildings: BuildingSpec[];
  trees: TreeSpec[];
  lamps: StreetLampSpec[];
  cars: CarSpec[];
  mountains: MountainSpec[];
  clouds: CloudSpec[];
}

export interface CameraFrameState {
  position: [number, number, number];
  lookAt: [number, number, number];
  fov: number;
}

export const CITY_GROUND_Y = -6.0;
export const BOULEVARD_CENTER_X = -1.6;
export const BOULEVARD_ROAD_W = 6.0; // x in [-4.6, +1.4]
export const FOOTPATH_W = 2.2; // left: [-6.8, -4.6], right: [+1.4, +3.6]

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Generates the complete, mathematically guaranteed non-overlapping 25-block 3D comic city.
 */
export function generateCityLayout(): CityLayout {
  const rand = seededRandom(20261120);
  const groundY = CITY_GROUND_Y;

  const roads: RoadSegment[] = [];
  const footpaths: FootpathSegment[] = [];
  const districtBuildings: BuildingSpec[] = [];
  const trees: TreeSpec[] = [];
  const lamps: StreetLampSpec[] = [];

  // 1. Primary North-South Boulevards (along Z from z = -236 to z = +82, length = 318)
  // Note: Grand Central Boulevard runs from z = -236 up to z = -3.4 (stopping cleanly in front of His Apartment Building!)
  const mainBlvdMinZ = -236;
  const mainBlvdMaxZ = -3.4;
  const mainBlvdLen = mainBlvdMaxZ - mainBlvdMinZ;
  const mainBlvdMidZ = (mainBlvdMinZ + mainBlvdMaxZ) * 0.5;

  roads.push({
    id: "road-grand-blvd",
    x: BOULEVARD_CENTER_X,
    z: mainBlvdMidZ,
    w: BOULEVARD_ROAD_W, // [-4.6, +1.4]
    d: mainBlvdLen,
    axis: "z",
    lanes: 2,
  });

  // Left & Right raised footpaths flanking Grand Central Boulevard
  footpaths.push({
    id: "fp-blvd-left",
    x: -5.7, // [-6.8, -4.6]
    z: mainBlvdMidZ,
    w: FOOTPATH_W,
    d: mainBlvdLen,
    elevation: 0.22,
  });
  footpaths.push({
    id: "fp-blvd-right",
    x: 2.5, // [+1.4, +3.6]
    z: mainBlvdMidZ,
    w: FOOTPATH_W,
    d: mainBlvdLen,
    elevation: 0.22,
  });

  // West & East Parallel Outer Avenues (keep outer city blocks cleanly gridded)
  // Left inner block sits in x in [-21.6, -7.2] (width 14.4); West Ave at x = -25.4 (w=5.2 -> [-28.0, -22.8])
  // Right inner block sits in x in [+4.0, +18.4] (width 14.4); East Ave at x = +22.2 (w=5.2 -> [+19.6, +24.8])
  const outerMinZ = -236;
  const outerMaxZ = 78;
  const outerLen = outerMaxZ - outerMinZ;
  const outerMidZ = (outerMinZ + outerMaxZ) * 0.5;

  roads.push({
    id: "road-west-ave",
    x: -25.4,
    z: outerMidZ,
    w: 5.2,
    d: outerLen,
    axis: "z",
    lanes: 2,
  });
  roads.push({
    id: "road-east-ave",
    x: 22.2,
    z: outerMidZ,
    w: 5.2,
    d: outerLen,
    axis: "z",
    lanes: 2,
  });

  footpaths.push(
    { id: "fp-west-e", x: -22.2, z: outerMidZ, w: 1.2, d: outerLen, elevation: 0.22 },
    { id: "fp-west-w", x: -28.6, z: outerMidZ, w: 1.2, d: outerLen, elevation: 0.22 },
    { id: "fp-east-w", x: 19.0, z: outerMidZ, w: 1.2, d: outerLen, elevation: 0.22 },
    { id: "fp-east-e", x: 25.4, z: outerMidZ, w: 1.2, d: outerLen, elevation: 0.22 },
  );

  // 2. Front Cross-Street right in front of His Apartment Building (z in [-9.0, -4.6], center -6.8)
  // Wait: His apartment front wall is at z = -2.88, with a raised front sidewalk at z in [-4.5, -2.9]
  footpaths.push({
    id: "fp-hero-front",
    x: -1.6,
    z: -3.7,
    w: 22.0,
    d: 1.6,
    elevation: 0.22,
  });

  // Cross avenues every 16.5m along -Z starting at z = -6.8 -> 14 cross-streets!
  const crossStreetZs: number[] = [];
  for (let i = 0; i < 14; i++) {
    const cz = -6.8 - i * 16.5;
    crossStreetZs.push(cz);
    roads.push({
      id: `road-cross-${i}`,
      x: -1.6,
      z: cz,
      w: 112.0, // spans from x = -57.6 to +54.4
      d: 4.4, // [cz - 2.2, cz + 2.2]
      axis: "x",
      lanes: 2,
    });
  }

  // Backdrop cross-streets behind His Apartment Building (+Z) for skyline depth during WindowZoom4K
  const backCrossZs = [12.0, 34.0, 56.0];
  backCrossZs.forEach((cz, idx) => {
    roads.push({
      id: `road-back-cross-${idx}`,
      x: -1.6,
      z: cz,
      w: 112.0,
      d: 4.4,
      axis: "x",
      lanes: 2,
    });
  });

  // 3. Hero Landmarks (strictly placed inside clean city parcels, ZERO road/footpath overlaps)
  // His Teal Apartment Building: surrounds his bedroom (x in [-2.85, 2.65], z in [-2.65, 3.35])
  const heroApartment: BuildingSpec = {
    id: "hero-teal-apartment",
    x: -0.6, // [-9.6, +8.4]
    z: 1.8, // [-2.88, +6.48] -> well clear of front sidewalk [-4.5,-2.9] & back cross road [9.8,14.2]
    w: 18.0,
    d: 9.36,
    h: 16.2,
    baseY: groundY,
    paletteIndex: 0,
    style: "hero",
    hasBalconies: true,
    balconyFaces: ["-z"],
    hasAwning: true,
    rooftop: {
      hasWaterTower: true,
      hasPenthouse: true,
      acCount: 4,
      hasAntenna: true,
      hasSkylight: false,
    },
  };

  // Block 0 (between cross-street 0 [-9.0..-4.6] and cross-street 1 [-25.5..-21.1]):
  // Safe Z band for Block 0: z in [-20.4, -9.7] (center = -15.05, depth <= 10.2)
  // Right parcel x in [+4.2, +17.8], Left parcel x in [-21.0, -7.4]
  const yellowApartment: BuildingSpec = {
    id: "landmark-yellow-apartment",
    x: 8.6, // [+4.6, +12.6]
    z: -15.0, // [-19.6, -10.4]
    w: 8.0,
    d: 9.2,
    h: 17.5,
    baseY: groundY,
    paletteIndex: 1,
    style: "yellow",
    hasBalconies: true,
    balconyFaces: ["-x", "+z"],
    hasAwning: true,
    rooftop: {
      hasWaterTower: false,
      hasPenthouse: true,
      acCount: 3,
      hasAntenna: false,
      hasSkylight: true,
    },
  };

  const pinkBillboardBuilding: BuildingSpec = {
    id: "landmark-pink-billboard",
    x: -11.4, // [-15.4, -7.4]
    z: -15.0, // [-19.5, -10.5]
    w: 8.0,
    d: 9.0,
    h: 6.8,
    baseY: groundY,
    paletteIndex: 2,
    style: "pink",
    hasBalconies: false,
    balconyFaces: [],
    hasAwning: true,
    rooftop: {
      hasWaterTower: false,
      hasPenthouse: false,
      acCount: 2,
      hasAntenna: false,
      hasSkylight: false,
    },
  };

  // Block 1 (between cross-street 1 [-25.5..-21.1] and cross-street 2 [-42.0..-37.6]):
  // Safe Z band: z in [-36.9, -26.2] (center = -31.55)
  const plaza: Rect2D = {
    id: "landmark-pink-plaza",
    x: -13.6, // [-20.2, -7.0]
    z: -31.55, // [-36.8, -26.3]
    w: 13.2,
    d: 10.5,
  };

  const magentaPlazaBuilding: BuildingSpec = {
    id: "landmark-magenta-cafe",
    x: 9.8, // [+4.6, +15.0]
    z: -31.55, // [-36.55, -26.55]
    w: 10.4,
    d: 10.0,
    h: 19.2,
    baseY: groundY,
    paletteIndex: 2,
    style: "magenta",
    hasBalconies: true,
    balconyFaces: ["-x", "+z"],
    hasAwning: true,
    rooftop: {
      hasWaterTower: true,
      hasPenthouse: true,
      acCount: 3,
      hasAntenna: true,
      hasSkylight: false,
    },
  };

  // Elevated Monorail Viaduct running across Cross-Street 2 (z = -39.8) with pillars strictly on footpath medians!
  const viaduct = {
    z: -39.8,
    y: groundY + 7.2,
    spanX: 98.0,
    pillarXs: [-28.6, -22.2, -5.7, 2.5, 19.0, 25.4],
  };

  // 4. Blocks 2..13 along BOTH sides of Grand Central Boulevard (12 full blocks x 2 buildings per side = 48 boulevard buildings)
  // Plus outer West & East skyline wings (24+ flanking towers) + Backdrop skyline behind His Apartment (+Z, 12 towers)
  // Total = 80+ detailed buildings stretching >225m (26 buildings deep)!
  for (let b = 0; b < 13; b++) {
    const zNorth = crossStreetZs[b] - 2.2; // more negative
    const zSouth = crossStreetZs[b + 1] + 2.2; // more negative than zNorth? Wait: crossStreetZs[b] > crossStreetZs[b+1]!
    // crossStreetZs[0] = -6.8, crossStreetZs[1] = -23.3 -> parcel spans [-21.1, -9.0]
    const parcelMaxZ = zNorth - 0.65;
    const parcelMinZ = zSouth + 0.65;
    const parcelDepth = parcelMaxZ - parcelMinZ; // ~10.8m
    const parcelMidZ = (parcelMinZ + parcelMaxZ) * 0.5;

    // Two buildings deep along Z inside each parcel (front + rear lot) -> 26 buildings along the boulevard!
    const subDepth = (parcelDepth - 0.9) * 0.5; // ~4.95m each, 0.9m alley gap
    const subZs = [parcelMaxZ - subDepth * 0.5, parcelMinZ + subDepth * 0.5];

    // Inner Left & Right Boulevard Lots (skip Block 0 and Block 1 which hold the hero landmarks)
    if (b >= 2) {
      subZs.forEach((sz, slotIdx) => {
        // Left Boulevard Frontage: x in [-16.6, -7.4] -> center -12.0, w = 8.4..9.0
        const wL = 7.6 + rand() * 1.4;
        const xL = -7.35 - wL * 0.5;
        const isSpireL = b >= 4 && (b + slotIdx) % 5 === 0;
        const hL = isSpireL ? 28 + rand() * 16 : 11 + rand() * 16 + Math.min(b, 8) * 0.9;

        districtBuildings.push({
          id: `bldg-blvd-L-${b}-${slotIdx}`,
          x: xL,
          z: sz,
          w: wL,
          d: subDepth,
          h: hL,
          baseY: groundY,
          paletteIndex: (b * 2 + slotIdx) % 6,
          style: isSpireL ? "spire" : hL > 21 ? "tower" : "apartment",
          hasBalconies: !isSpireL && rand() > 0.22,
          balconyFaces: ["+x", "-z"],
          hasAwning: slotIdx === 0 || rand() > 0.35,
          rooftop: {
            hasWaterTower: !isSpireL && rand() > 0.48,
            hasPenthouse: !isSpireL && rand() > 0.3,
            acCount: isSpireL ? 0 : 1 + Math.floor(rand() * 3),
            hasAntenna: isSpireL || rand() > 0.58,
            hasSkylight: !isSpireL && rand() > 0.52,
          },
        });

        // Right Boulevard Frontage: x in [+4.15, +13.6]
        const wR = 7.6 + rand() * 1.4;
        const xR = 4.15 + wR * 0.5;
        const isSpireR = b >= 3 && (b + slotIdx) % 6 === 2;
        const hR = isSpireR ? 30 + rand() * 15 : 12 + rand() * 15 + Math.min(b, 8) * 0.95;

        districtBuildings.push({
          id: `bldg-blvd-R-${b}-${slotIdx}`,
          x: xR,
          z: sz,
          w: wR,
          d: subDepth,
          h: hR,
          baseY: groundY,
          paletteIndex: (b * 3 + slotIdx + 1) % 6,
          style: isSpireR ? "spire" : hR > 21 ? "tower" : "apartment",
          hasBalconies: !isSpireR && rand() > 0.22,
          balconyFaces: ["-x", "-z"],
          hasAwning: slotIdx === 0 || rand() > 0.35,
          rooftop: {
            hasWaterTower: !isSpireR && rand() > 0.45,
            hasPenthouse: !isSpireR && rand() > 0.3,
            acCount: isSpireR ? 0 : 1 + Math.floor(rand() * 3),
            hasAntenna: isSpireR || rand() > 0.55,
            hasSkylight: !isSpireR && rand() > 0.5,
          },
        });
      });
    }

    // Outer West Wing (strictly west of West Avenue footpath at x = -29.2 -> x in [-43, -30.0])
    if (b % 1 === 0) {
      const wW = 9.4 + rand() * 3.0;
      const xW = -30.2 - wW * 0.5;
      const isSpireW = b % 4 === 1;
      const hW = isSpireW ? 32 + rand() * 14 : 15 + rand() * 18;
      districtBuildings.push({
        id: `bldg-west-${b}`,
        x: xW,
        z: parcelMidZ,
        w: wW,
        d: parcelDepth - 0.6,
        h: hW,
        baseY: groundY,
        paletteIndex: (b + 4) % 6,
        style: isSpireW ? "spire" : "tower",
        hasBalconies: !isSpireW && b < 8,
        balconyFaces: ["+x"],
        hasAwning: false,
        rooftop: {
          hasWaterTower: !isSpireW && rand() > 0.5,
          hasPenthouse: !isSpireW && rand() > 0.35,
          acCount: isSpireW ? 0 : 2,
          hasAntenna: isSpireW || rand() > 0.5,
          hasSkylight: false,
        },
      });

      // Outer East Wing (strictly east of East Avenue footpath at x = +26.0 -> x in [+26.8, +40.0])
      const wE = 9.4 + rand() * 3.0;
      const xE = 26.8 + wE * 0.5;
      const isSpireE = b % 4 === 3;
      const hE = isSpireE ? 34 + rand() * 14 : 16 + rand() * 18;
      districtBuildings.push({
        id: `bldg-east-${b}`,
        x: xE,
        z: parcelMidZ,
        w: wE,
        d: parcelDepth - 0.6,
        h: hE,
        baseY: groundY,
        paletteIndex: (b + 2) % 6,
        style: isSpireE ? "spire" : "tower",
        hasBalconies: !isSpireE && b < 8,
        balconyFaces: ["-x"],
        hasAwning: false,
        rooftop: {
          hasWaterTower: !isSpireE && rand() > 0.5,
          hasPenthouse: !isSpireE && rand() > 0.35,
          acCount: isSpireE ? 0 : 2,
          hasAntenna: isSpireE || rand() > 0.5,
          hasSkylight: false,
        },
      });
    }
  }

  // 5. Flanking neighbors beside His Apartment Building (same z band [-2.5, +6.2], strictly clear of roads!)
  districtBuildings.push(
    {
      id: "bldg-hero-neighbor-L",
      x: -15.4, // [-20.4, -10.4] -> clear of hero [-9.6, +8.4] & West Ave footpath [-22.8, -21.6]
      z: 1.8,
      w: 10.0,
      d: 8.8,
      h: 21.5,
      baseY: groundY,
      paletteIndex: 3,
      style: "apartment",
      hasBalconies: true,
      balconyFaces: ["-z"],
      hasAwning: true,
      rooftop: { hasWaterTower: true, hasPenthouse: true, acCount: 2, hasAntenna: false, hasSkylight: true },
    },
    {
      id: "bldg-hero-neighbor-R",
      x: 13.6, // [+9.2, +18.0] -> clear of hero [-9.6, +8.4] & East Ave footpath [+18.4, +19.6]
      z: 1.8,
      w: 8.8,
      d: 8.8,
      h: 23.0,
      baseY: groundY,
      paletteIndex: 5,
      style: "apartment",
      hasBalconies: true,
      balconyFaces: ["-z"],
      hasAwning: true,
      rooftop: { hasWaterTower: false, hasPenthouse: true, acCount: 3, hasAntenna: true, hasSkylight: false },
    },
  );

  // 6. Distant Backdrop Skyline behind His Apartment (+Z in [17..72]) — visible over His Building during WindowZoom4K!
  const backRows = [
    { z: 23.0, d: 13.0 }, // between back cross 0 (12+2.2=14.2) and 1 (34-2.2=31.8)
    { z: 45.0, d: 13.0 }, // between back cross 1 (36.2) and 2 (53.8)
    { z: 66.5, d: 12.0 }, // behind back cross 2 (58.2)
  ];
  const backXs = [-42.0, -14.5, -1.6, 11.5, 38.0];
  backRows.forEach((row, ri) => {
    backXs.forEach((bx, ci) => {
      const w = 10.4 + ((ri * 3 + ci * 2) % 3) * 1.1;
      const isSpire = (ri + ci) % 3 === 1;
      const h = isSpire ? 38 + ri * 7 + (ci % 2) * 5 : 22 + ri * 5 + ((ci * 7) % 11);
      districtBuildings.push({
        id: `bldg-backdrop-${ri}-${ci}`,
        x: bx,
        z: row.z,
        w,
        d: row.d,
        h,
        baseY: groundY,
        paletteIndex: (ri * 2 + ci) % 6,
        style: isSpire ? "spire" : "tower",
        hasBalconies: false,
        balconyFaces: [],
        hasAwning: false,
        rooftop: {
          hasWaterTower: !isSpire && ci % 2 === 0,
          hasPenthouse: !isSpire,
          acCount: isSpire ? 0 : 2,
          hasAntenna: isSpire || (ri === 2 && ci % 2 === 1),
          hasSkylight: false,
        },
      });
    });
  });

  // 7. Street Trees & Glowing Streetlamps planted strictly along the raised Grand Boulevard footpaths!
  // Left footpath center x = -5.7 (curb at -4.85, tree line at -5.85)
  // Right footpath center x = +2.5 (curb at +1.65, tree line at +2.65)
  for (let b = 0; b < 13; b++) {
    const zTop = crossStreetZs[b] - 3.6;
    const zBot = crossStreetZs[b + 1] + 3.6;
    const zMid = (zTop + zBot) * 0.5;

    // Two trees per block per side = 52 boulevard street trees
    [zTop - 1.2, zBot + 1.2].forEach((tz, ti) => {
      trees.push(
        {
          id: `tree-L-${b}-${ti}`,
          x: -5.85,
          z: tz,
          baseY: groundY + 0.22,
          scale: 0.92 + ((b + ti) % 3) * 0.14,
          tint: (b + ti) % 3,
        },
        {
          id: `tree-R-${b}-${ti}`,
          x: 2.65,
          z: tz,
          baseY: groundY + 0.22,
          scale: 0.96 + ((b * 2 + ti) % 3) * 0.13,
          tint: (b + ti + 1) % 3,
        },
      );
    });

    // Glowing boulevard streetlamps right along the curbs (26 lamps)
    lamps.push(
      { id: `lamp-L-${b}`, x: -4.92, z: zMid, baseY: groundY + 0.22, facingX: 1 },
      { id: `lamp-R-${b}`, x: 1.72, z: zMid, baseY: groundY + 0.22, facingX: -1 },
    );
  }

  // 8. Animated Stylized Comic Cars running strictly down road lanes!
  const carColors: [string, string][] = [
    ["#ff4f79", "#fff4f8"],
    ["#ffd23f", "#fff9e0"],
    ["#2fd4c8", "#e8fffc"],
    ["#ff7b3b", "#fff2e6"],
    ["#6c63ff", "#ecebff"],
    ["#42d674", "#eafff1"],
  ];
  const cars: CarSpec[] = [];
  // 12 cars cruising both lanes of Grand Central Boulevard (right lane x = -0.15 toward +Z, left lane x = -3.05 toward -Z)
  for (let i = 0; i < 12; i++) {
    const towardPlusZ = i % 2 === 0;
    const [body, roof] = carColors[i % carColors.length];
    cars.push({
      id: `car-blvd-${i}`,
      axis: "z",
      laneCoord: towardPlusZ ? -0.15 : -3.05,
      startPos: -222 + i * 18.2,
      minPos: -230,
      maxPos: -9.5,
      speed: towardPlusZ ? 7.8 + (i % 3) * 1.4 : -(7.4 + (i % 3) * 1.3),
      color: body,
      roofColor: roof,
    });
  }
  // 6 cross-avenue cars cruising cleanly along Cross-Streets 0..5
  for (let i = 0; i < 6; i++) {
    const cz = crossStreetZs[i];
    const goRight = i % 2 === 0;
    const [body, roof] = carColors[(i + 2) % carColors.length];
    cars.push({
      id: `car-cross-${i}`,
      axis: "x",
      laneCoord: cz + (goRight ? 1.0 : -1.0),
      startPos: -42 + i * 14.5,
      minPos: -50,
      maxPos: 48,
      speed: goRight ? 8.2 : -8.0,
      color: body,
      roofColor: roof,
    });
  }

  // 9. Sculpted 3D Mountain Ranges on BOTH +Z (WindowZoom horizon) and -Z (looking out his window!)
  const mountains: MountainSpec[] = [
    // +Z Horizon Ridge (behind His Apartment & Backdrop Skyline — framed at start of WindowZoom4K!)
    { id: "mtn-p1", x: -128, z: 192, radius: 74, height: 68, rotY: 0.3, ridge: "farPlusZ" },
    { id: "mtn-p2", x: -58, z: 205, radius: 68, height: 78, rotY: 1.1, ridge: "farPlusZ" },
    { id: "mtn-p3", x: 14, z: 214, radius: 78, height: 86, rotY: 0.7, ridge: "farPlusZ" },
    { id: "mtn-p4", x: 86, z: 198, radius: 70, height: 74, rotY: 2.0, ridge: "farPlusZ" },
    { id: "mtn-p5", x: 152, z: 185, radius: 66, height: 64, rotY: 1.4, ridge: "farPlusZ" },
    { id: "mtn-p6", x: -18, z: 175, radius: 56, height: 52, rotY: 2.6, ridge: "farPlusZ" },
    // -Z Horizon Ridge (far end of Grand Central Boulevard when looking out his bedroom window!)
    { id: "mtn-m1", x: -115, z: -282, radius: 72, height: 66, rotY: 0.5, ridge: "farMinusZ" },
    { id: "mtn-m2", x: -42, z: -294, radius: 76, height: 82, rotY: 1.8, ridge: "farMinusZ" },
    { id: "mtn-m3", x: 32, z: -290, radius: 74, height: 76, rotY: 0.9, ridge: "farMinusZ" },
    { id: "mtn-m4", x: 108, z: -278, radius: 68, height: 64, rotY: 2.3, ridge: "farMinusZ" },
  ];

  // 10. Panoramic Drifting Comic Clouds across both skies
  const clouds: CloudSpec[] = [
    // Visible in +Z sky during WindowZoom4K
    { id: "cld-p1", x: -58, y: 74, z: 128, scaleX: 28, scaleY: 7.5, scaleZ: 10, driftSpeed: 1.1 },
    { id: "cld-p2", x: -8, y: 66, z: 156, scaleX: 30, scaleY: 8.2, scaleZ: 11, driftSpeed: 0.85 },
    { id: "cld-p3", x: 54, y: 76, z: 142, scaleX: 28, scaleY: 7.6, scaleZ: 10, driftSpeed: 1.0 },
    { id: "cld-p4", x: -34, y: 58, z: 86, scaleX: 22, scaleY: 5.8, scaleZ: 8, driftSpeed: 1.3 },
    { id: "cld-p5", x: 34, y: 60, z: 96, scaleX: 24, scaleY: 6.0, scaleZ: 8.5, driftSpeed: 1.15 },
    { id: "cld-p6", x: 94, y: 68, z: 170, scaleX: 26, scaleY: 7.2, scaleZ: 10, driftSpeed: 0.9 },
    // Visible along mid-boulevard overhead & -Z horizon when looking out the window
    { id: "cld-m1", x: -56, y: 44, z: -85, scaleX: 19, scaleY: 5.5, scaleZ: 8, driftSpeed: 1.2 },
    { id: "cld-m2", x: 48, y: 48, z: -120, scaleX: 22, scaleY: 6.0, scaleZ: 9, driftSpeed: 0.95 },
    { id: "cld-m3", x: -24, y: 56, z: -215, scaleX: 26, scaleY: 7.5, scaleZ: 10, driftSpeed: 0.85 },
    { id: "cld-m4", x: 46, y: 50, z: -235, scaleX: 24, scaleY: 6.8, scaleZ: 9.5, driftSpeed: 1.05 },
    { id: "cld-m5", x: -82, y: 52, z: -185, scaleX: 21, scaleY: 6.0, scaleZ: 8.5, driftSpeed: 1.1 },
    { id: "cld-m6", x: 84, y: 58, z: -165, scaleX: 22, scaleY: 6.2, scaleZ: 9, driftSpeed: 0.9 },
  ];

  return {
    groundY,
    roads,
    footpaths,
    heroApartment,
    yellowApartment,
    pinkBillboardBuilding,
    magentaPlazaBuilding,
    plaza,
    viaduct,
    districtBuildings,
    trees,
    lamps,
    cars,
    mountains,
    clouds,
  };
}

function rectsOverlap2D(a: Rect2D, b: Rect2D, eps = 0.02): boolean {
  const axMin = a.x - a.w * 0.5 + eps;
  const axMax = a.x + a.w * 0.5 - eps;
  const azMin = a.z - a.d * 0.5 + eps;
  const azMax = a.z + a.d * 0.5 - eps;

  const bxMin = b.x - b.w * 0.5 + eps;
  const bxMax = b.x + b.w * 0.5 - eps;
  const bzMin = b.z - b.d * 0.5 + eps;
  const bzMax = b.z + b.d * 0.5 - eps;

  return axMin < bxMax && axMax > bxMin && azMin < bzMax && azMax > bzMin;
}

/**
 * Verifies ZERO AABB overlaps between every building and every road, footpath, and other building.
 */
export function verifyCityNoOverlaps(layout: CityLayout): string[] {
  const issues: string[] = [];
  const allBuildings: BuildingSpec[] = [
    layout.heroApartment,
    layout.yellowApartment,
    layout.pinkBillboardBuilding,
    layout.magentaPlazaBuilding,
    ...layout.districtBuildings,
  ];

  for (let i = 0; i < allBuildings.length; i++) {
    const b = allBuildings[i];
    for (const r of layout.roads) {
      if (rectsOverlap2D(b, r)) {
        issues.push(`Building ${b.id} overlaps road ${r.id}`);
      }
    }
    for (const f of layout.footpaths) {
      if (rectsOverlap2D(b, f)) {
        issues.push(`Building ${b.id} overlaps footpath ${f.id}`);
      }
    }
    for (let j = i + 1; j < allBuildings.length; j++) {
      const other = allBuildings[j];
      if (rectsOverlap2D(b, other)) {
        issues.push(`Building ${b.id} overlaps building ${other.id}`);
      }
    }
  }
  return issues;
}

export function getComicLightingConfig(mode: RoomLightingMode): ComicLightingConfig {
  if (mode === "night") {
    return {
      mode,
      lightDir: new THREE.Vector3(-0.35, 0.72, -0.58).normalize(),
      inkColor: new THREE.Color("#0e0e2e"),
      fogColor: new THREE.Color("#2a1e4d"),
      fogNear: 28,
      fogFar: 255,
      fogMaxBlend: 0.84,
      nightFactor: 1.0,
      mutedFactor: 0.0,
      lampPos: new THREE.Vector3(-1.42, 1.32, -1.94),
      lampDir: new THREE.Vector3(0.42, -0.78, 0.34).normalize(),
      lampColor: new THREE.Color("#fff0c4"),
      lampStrength: 0.94,
    };
  }
  if (mode === "muted") {
    return {
      mode,
      lightDir: new THREE.Vector3(0.42, 0.80, -0.42).normalize(),
      inkColor: new THREE.Color("#1a1c38"),
      fogColor: new THREE.Color("#9bd7ff"),
      fogNear: 34,
      fogFar: 270,
      fogMaxBlend: 0.78,
      nightFactor: 0.0,
      mutedFactor: 1.0,
      lampPos: new THREE.Vector3(-1.42, 1.32, -1.94),
      lampDir: new THREE.Vector3(0.42, -0.78, 0.34).normalize(),
      lampColor: new THREE.Color("#fff5dc"),
      lampStrength: 0.0,
    };
  }
  // Day mode
  return {
    mode,
    lightDir: new THREE.Vector3(0.46, 0.82, -0.34).normalize(),
    inkColor: new THREE.Color("#181842"),
    fogColor: new THREE.Color("#9edbff"),
    fogNear: 34,
    fogFar: 275,
    fogMaxBlend: 0.78,
    nightFactor: 0.0,
    mutedFactor: 0.0,
    lampPos: new THREE.Vector3(-1.42, 1.32, -1.94),
    lampDir: new THREE.Vector3(0.42, -0.78, 0.34).normalize(),
    lampColor: new THREE.Color("#fff6de"),
    lampStrength: 0.0,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Evaluates deterministic 3D camera state for any RoomCameraPreset at time tSec (0..durationSec).
 */
export const WINDOW_FACADE_ROWS = 14;
export const WINDOW_FACADE_COLS = 6;
export const WINDOW_FACADE_PAD_X = 10 / 256;

/**
 * Pure deterministic mapping from painted window row index (0..rows-1, top-to-bottom on CanvasTexture)
 * to exact world Y of the window sill line on a building of height `h` resting at `baseY`.
 * Ensures 3D projecting balconies align 100% with painted window sills at low flyover altitudes!
 */
export function computeTextureAlignedBalconyRows(
  baseY: number,
  h: number,
  rows = WINDOW_FACADE_ROWS,
): { row: number; sillY: number; floorHeight: number }[] {
  const floorHeight = h / rows;
  const out: { row: number; sillY: number; floorHeight: number }[] = [];
  // Window bottom in createWindowFacadeTexture is at pixel (r + 1) * cellH - 6 (on 512px tall canvas).
  // Since canvas y=0 maps to BoxGeometry UV v=1 (top) and y=512 maps to v=0 (bottom):
  // vSill = 1 - ((r + 1) / rows - 4 / 512) -> sillY = baseY + h * vSill.
  // Pick well-spaced rows (every 3rd floor, avoiding ground shopfront and very top parapet row).
  for (let r = 2; r < rows - 2; r += 3) {
    const vSill = 1 - ((r + 1) / rows - 3 / 512);
    const sillY = baseY + h * vSill;
    if (sillY > baseY + 3.1 && sillY < baseY + h - 1.35) {
      out.push({ row: r, sillY, floorHeight });
    }
  }
  return out;
}

/**
 * Pure continuous camera choreography for the unbroken Intro + Shot 01 -> Shot 04 single take (00:00.00 -> 00:24.52):
 * - 00:00.00 -> 12.80: Half-height night skyline dolly-in between towers -> kisses bedroom window glass
 * - 12.80 -> 15.88: Decelerates smoothly into Shot 01 Blue Face close-up + 4 deg orbit
 * - 15.88 -> 18.37: Shot 02 — Smoothly glides down his arm right onto HIS actual 3D phone & connected rigged thumb (ZERO cut!)
 * - 18.37 -> 22.18: Shot 03 — Continuously cranes back & up away from his phone into open-top cutaway bedroom in void
 * - 22.18 -> 24.52: Shot 04 — Smoothly pulls back through the gluey glass membrane out into deep void + endless chains
 */
export function evaluateAct1OpeningCamera(tSec: number, durationSec = 15.88): CameraFrameState {
  if (tSec <= 15.88) {
    return evaluateRoomCamera("windowZoom", tSec, durationSec);
  }

  const smoother = (x: number) => {
    const c = clamp01(x);
    return c * c * c * (c * (c * 6 - 15) + 10);
  };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  // Exact handoff state at t = 15.88s (zero discontinuity!)
  const s1End = evaluateRoomCamera("windowZoom", 15.88, durationSec);

  // Target macro phone-in-hand framing looking dead-on at his straightened upright smartphone [1.315, 0.974, -1.293]
  const shot2Pos: [number, number, number] = [1.448, 1.106, -1.588];
  const shot2Look: [number, number, number] = [1.315, 0.974, -1.293];
  const shot2Fov = 32;

  // Shot 03 wide cutaway framing: looking down into the open-top bedroom (man on bed still scrolling + city through window + void around house!)
  const shot3Pos: [number, number, number] = [0.22, 2.95, 5.15];
  const shot3Look: [number, number, number] = [0.05, 0.88, -1.25];
  const shot3Fov = 50;

  // Shot 04 void box framing: outside the iridescent bubble-glass chamber looking into floor + endless chains (leaving right margin clear for big Ember!)
  const shot4Pos: [number, number, number] = [-0.1, 2.35, 14.53];
  const shot4Look: [number, number, number] = [-0.1, 0.85, 0.35];
  const shot4Fov = 58;

  if (tSec <= 18.37) {
    // Shot 02 (15.88 -> 18.37): Smooth curved glide from Blue Face down to his rigged right hand & thumb scrolling his upright phone!
    const u = smoother(clamp01((tSec - 15.88) / 1.25));
    const micro = smoother(clamp01((tSec - 16.95) / 1.42));
    // Gentle organic S-arc around his cheek + subtle handheld breathing drift while watching his thumb scroll reels
    const arcX = Math.sin(u * Math.PI) * 0.045;
    const arcY = Math.sin(u * Math.PI) * 0.032;
    const px = lerp(s1End.position[0], shot2Pos[0], u) + arcX + micro * 0.022;
    const py = lerp(s1End.position[1], shot2Pos[1], u) + arcY + micro * 0.014;
    const pz = lerp(s1End.position[2], shot2Pos[2], u) - micro * 0.016;
    const lx = lerp(s1End.lookAt[0], shot2Look[0], u);
    const ly = lerp(s1End.lookAt[1], shot2Look[1], u);
    const lz = lerp(s1End.lookAt[2], shot2Look[2], u);
    const fov = lerp(s1End.fov, shot2Fov, u);
    return { position: [px, py, pz], lookAt: [lx, ly, lz], fov };
  }

  if (tSec <= 22.18) {
    // Shot 03 (18.37 -> 22.18): Fluid cinema crane arc pulling back & up away from his phone (man keeps scrolling on bed!)
    const u = smoother(clamp01((tSec - 18.37) / (22.18 - 18.37)));
    const startPos: [number, number, number] = [shot2Pos[0] + 0.022, shot2Pos[1] + 0.014, shot2Pos[2] - 0.016];
    // Natural sweeping lateral + vertical crane curve (zero robotic straight-line slide!)
    const arcX = Math.sin(u * Math.PI) * -0.58;
    const arcY = Math.sin(u * Math.PI) * 0.56;
    return {
      position: [
        lerp(startPos[0], shot3Pos[0], u) + arcX,
        lerp(startPos[1], shot3Pos[1], u) + arcY,
        lerp(startPos[2], shot3Pos[2], u),
      ],
      lookAt: [
        lerp(shot2Look[0], shot3Look[0], u),
        lerp(shot2Look[1], shot3Look[1], u) + Math.sin(u * Math.PI) * 0.14,
        lerp(shot2Look[2], shot3Look[2], u),
      ],
      fov: lerp(shot2Fov, shot3Fov, u),
    };
  }

  // Shot 04 (22.18 -> 24.52): Smooth sweeping pull-back through the gluey bubble membrane into deep shader void + endless chains!
  const u = smoother(clamp01((tSec - 22.18) / (24.52 - 22.18)));
  const craneArcX = Math.sin(u * Math.PI) * 0.65;
  const craneArcY = Math.sin(u * Math.PI) * 0.34;
  return {
    position: [
      lerp(shot3Pos[0], shot4Pos[0], u) + craneArcX,
      lerp(shot3Pos[1], shot4Pos[1], u) + craneArcY,
      lerp(shot3Pos[2], shot4Pos[2], u),
    ],
    lookAt: [
      lerp(shot3Look[0], shot4Look[0], u),
      lerp(shot3Look[1], shot4Look[1], u),
      lerp(shot3Look[2], shot4Look[2], u),
    ],
    fov: lerp(shot3Fov, shot4Fov, u),
  };
}

export function evaluateRoomCamera(
  preset: RoomCameraPreset,
  tSec: number,
  durationSec = 16,
): CameraFrameState {
  const u = clamp01(durationSec > 0 ? tSec / durationSec : 0);

  if (preset === "windowZoom") {
    // Act I Continuous Single-Take Opening (00:00.00 -> 00:15.88, Storyboard Pages 5 & 6):
    // - 00:00.00 -> 00:12.80: Straight-line absolute dolly-in at dramatic mid-rise skyline height (y=18m, half previous altitude!)
    //   passing texture-aligned balconies & huge WATER tanker (Ember sleeping + Villain rising & blinking), kissing window glass at 00:12.80.
    // - 00:12.80 -> 00:15.88: ONE unbroken silky deceleration through the window glass straight into Shot 01 / 50
    //   ("BLUE FACE"), slowing to a near stop ~0.60m from his cheek, with a 3cm right drift & 4-degree orbit
    //   around his head during the last 1.5s (14.38 -> 15.88s) so the phone edge slides into the lower frame!
    const tGlass = 12.8;
    const tShot1End = 16.07;
    const distStart = 222.35; // z = -225.0 -> -2.65

    const smoother = (x: number) => {
      const c = clamp01(x);
      return c * c * c * (c * (c * 6 - 15) + 10);
    };

    if (tSec <= tGlass) {
      const p = clamp01(tSec / tGlass);
      const distRemain = clamp01(1 - smoother(p));
      const z = -2.65 - distStart * distRemain;

      // Half-height mid-rise canyon flyover: starts at y = 18.04m (half of old 36.04m!) gliding smoothly between towers,
      // staying safely above the elevated monorail viaduct (top y = +3.6m at z = -39.8) down to window center (y = 1.64m)
      const altFactor = Math.pow(distRemain, 0.85);
      const y = 1.64 + 16.4 * altFactor;

      // Straight-line corridor alignment from boulevard center (-1.6) to open left window pane (-1.16)
      const alignWindow = smoothstep(0.68, 0.98, p);
      const x = BOULEVARD_CENTER_X * (1 - alignWindow) + -1.16 * alignWindow;

      // Lowered horizon gaze matching the dramatic mid-rise boulevard corridor -> locks smoothly onto glowing blue hero window
      const lookX = -1.16 * alignWindow + BOULEVARD_CENTER_X * (1 - alignWindow) + smoothstep(0.86, 1.0, p) * 0.85;
      const lookY = 1.56 + 8.6 * Math.pow(distRemain, 0.90);
      const lookZ = Math.min(z + 48.0 * Math.pow(distRemain, 0.65) + 3.5, 6.0);
      const fov = 58 - 14 * smoothstep(0.55, 1.0, p); // 58deg wide establishing -> 44deg window kiss

      return {
        position: [x, y, Math.min(z, -2.65)],
        lookAt: [lookX, lookY, lookZ],
        fov,
      };
    } else {
      // 00:12.80 -> 00:15.88: ONE continuous decelerating glide through the window glass -> ~0.62m from his cheek!
      const s = clamp01((tSec - tGlass) / (tShot1End - tGlass));
      // Smooth continuous deceleration (no cut or pause at 13.56s!) slowing gracefully to a near stop by 15.88s
      const decel = 1 - Math.pow(1 - s, 3.6);
      // Faster lookAt convergence so his blue-lit face & glowing phone lock cleanly into frame right at 13.56s
      const lookDecel = 1 - Math.pow(1 - s, 4.8);

      const baseX = -1.16 + (0.94 - -1.16) * decel;
      const baseY = 1.64 + (1.12 - 1.64) * decel;
      const baseZ = -2.65 + (-1.44 - -2.65) * decel;

      // Last 1.5s (14.38 -> 15.88s): smooth 4-degree orbit around his head [1.38, 0.86, -1.84] + 3cm right drift
      // so the glowing phone edge slides into the lower-right foreground & 3D glass lyrics visibly parallax!
      const orbitP = smoother(clamp01((tSec - 14.38) / 1.5));
      const orbitRad = ((4.0 * Math.PI) / 180) * orbitP;
      const pivotX = 1.38;
      const pivotZ = -1.84;
      const rx = baseX - pivotX;
      const rz = baseZ - pivotZ;
      const cosA = Math.cos(orbitRad);
      const sinA = Math.sin(orbitRad);
      // Camera right vector along bed close-up is (+0.402, 0, +0.916); add 0.03m smooth drift to the right
      const driftM = 0.03 * orbitP;
      const x = pivotX + (rx * cosA - rz * sinA) + 0.402 * driftM;
      const y = baseY - 0.012 * orbitP;
      const z = pivotZ + (rx * sinA + rz * cosA) + 0.916 * driftM;

      // Smoothly locks onto his three-quarter blue-lit face + lower-right phone edge + dark upper-right bokeh space!
      const lookX = -0.31 + (1.44 - -0.31) * lookDecel + 0.016 * orbitP;
      const lookY = 1.56 + (0.94 - 1.56) * lookDecel - 0.024 * orbitP;
      const lookZ = 0.85 + (-1.66 - 0.85) * lookDecel + 0.055 * orbitP;

      // 44deg at window pass -> tight 50mm-equivalent 38deg close-up framing cheek, phone edge, and behind-head bokeh
      const fov = 44 - 6 * decel;

      return {
        position: [x, y, z],
        lookAt: [lookX, lookY, lookZ],
        fov,
      };
    }
  }

  if (preset === "bedPhone") {
    // Intimate close-up hovering ~0.8m beside his right shoulder/headboard side looking cleanly at:
    // his blue-lit face on the cream pillow, the glowing vertical Reels screen properly nestled in his right hand,
    // his actively scrolling right thumb, his relaxed left arm on his chest, and his propped knee!
    const driftX = Math.sin(u * Math.PI * 2) * 0.035;
    const driftY = Math.sin(u * Math.PI * 2 + 1.1) * 0.018;
    const driftZ = Math.cos(u * Math.PI * 2) * 0.035;
    return {
      position: [0.56 + driftX, 1.34 + driftY, -1.68 + driftZ],
      lookAt: [1.38, 0.90, -1.56],
      fov: 40,
    };
  }

  if (preset === "city" || preset === "cityTour") {
    // Unobstructed daytime/nighttime elevated boulevard panorama looking down Grand Central Boulevard!
    const sway = Math.sin(u * Math.PI * 2) * 0.85;
    const z = preset === "cityTour" ? -12.0 - u * 54.0 : -11.5 - Math.sin(u * Math.PI) * 12.0;
    const y = preset === "cityTour" ? 15.5 + Math.sin(u * Math.PI) * 5.0 : 17.5;
    return {
      position: [BOULEVARD_CENTER_X + sway, y, z],
      lookAt: [BOULEVARD_CENTER_X, 6.2, z - 74.0],
      fov: 50,
    };
  }

  if (preset === "desk") {
    const drift = Math.sin(u * Math.PI * 2) * 0.08;
    return {
      position: [-0.62 + drift, 1.46, 0.18],
      lookAt: [-0.95, 1.24, -2.35],
      fov: 44,
    };
  }

  if (preset === "window") {
    const pan = Math.sin(u * Math.PI * 2) * 0.14;
    return {
      position: [-0.62 + pan, 1.68, -2.18],
      lookAt: [-8.8 + pan * 0.5, 4.4, -15.0],
      fov: 56,
    };
  }

  // Default "wide" bedroom establishing shot (matches reference wide angle!)
  const breathe = Math.sin(u * Math.PI * 2) * 0.06;
  return {
    position: [-1.42 + breathe, 1.66, 2.38],
    lookAt: [0.18, 1.18, -1.45],
    fov: 47,
  };
}
