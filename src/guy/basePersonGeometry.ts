// Pure Procedural 54-Bone Seamless SkinnedMesh Geometry Builder for BasePerson
// Replaces disconnected primitive stacks with continuous, smoothly weighted anatomical meshes:
// - 54 real THREE.Bone hierarchy in canonical A-pose bind pose (zero shoulder distortion in T-pose!)
// - Seamless continuous hoodless crewneck shirt torso + sloping shoulders + sleeves + cuffs
// - Slim athletic chest & waist aligned smoothly to continuous jeans pelvis + tapered legs (zero doughnut bulge!)
// - Shorter continuous welded neck + smooth blank mannequin head
// - Single welded sculpted RED ribbed beanie (smooth sinusoidal vertical knit ribs, zero floating bumps!)
// - Firmly attached continuous wrists + sculpted palms + 5 smoothly rooted articulated fingers per hand
// - Continuous grounded socks & stylized trainers resting flush on y = 0.000

import * as THREE from "three";
import {
  BONE_NAMES,
  type BasePersonPoseState,
  type BodyShapeSettings,
  type BoneName,
  type DerivedBodyMetrics,
  computeBodyMetrics,
} from "./basePersonRig";

export const BONE_INDEX: Record<BoneName, number> = Object.fromEntries(
  BONE_NAMES.map((name, idx) => [name, idx]),
) as Record<BoneName, number>;

export const ARM_BIND_ANGLE = 0.72; // Canonical A-pose bind angle (matches standing T/A-pose cleanly!)

interface SkinWeightEntry {
  index: number;
  weight: number;
}

function packWeights(entries: SkinWeightEntry[]): { indices: [number, number, number, number]; weights: [number, number, number, number] } {
  const filtered = entries.filter((e) => e.weight > 1e-5).sort((a, b) => b.weight - a.weight).slice(0, 4);
  if (filtered.length === 0) {
    return { indices: [0, 0, 0, 0], weights: [1, 0, 0, 0] };
  }
  const sum = filtered.reduce((acc, e) => acc + e.weight, 0);
  const indices: [number, number, number, number] = [0, 0, 0, 0];
  const weights: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < filtered.length; i++) {
    indices[i] = filtered[i].index;
    weights[i] = filtered[i].weight / sum;
  }
  return { indices, weights };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

interface SkinnedMeshBuilder {
  positions: number[];
  uvs: number[];
  skinIndices: number[];
  skinWeights: number[];
  indices: number[];
}

function createBuilder(): SkinnedMeshBuilder {
  return { positions: [], uvs: [], skinIndices: [], skinWeights: [], indices: [] };
}

function pushVertex(
  b: SkinnedMeshBuilder,
  x: number,
  y: number,
  z: number,
  weights: SkinWeightEntry[],
  u = -1,
  v = -1,
): number {
  const idx = b.positions.length / 3;
  b.positions.push(x, y, z);
  b.uvs.push(u, v);
  const packed = packWeights(weights);
  b.skinIndices.push(...packed.indices);
  b.skinWeights.push(...packed.weights);
  return idx;
}

function finalizeGeometry(b: SkinnedMeshBuilder): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(b.positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uvs, 2));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(b.skinIndices, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(b.skinWeights, 4));
  geo.setIndex(b.indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Adds a smooth lofted closed-ring tubular surface along rings of vertices with optional rounded end caps.
 */
function addLoftedTube(
  b: SkinnedMeshBuilder,
  rings: Array<{ pts: Array<[number, number, number]>; weights: Array<SkinWeightEntry[]> }>,
  capStart = false,
  capEnd = false,
): void {
  if (rings.length < 2) return;
  const segs = rings[0].pts.length;
  const ringOffsets: number[] = [];

  for (let r = 0; r < rings.length; r++) {
    ringOffsets.push(b.positions.length / 3);
    for (let s = 0; s < segs; s++) {
      const [x, y, z] = rings[r].pts[s];
      pushVertex(b, x, y, z, rings[r].weights[s]);
    }
  }

  // Automatically orient triangle winding strictly OUTWARD by comparing face normal to ring centroid!
  const midR = Math.floor((rings.length - 1) / 2);
  const midRing = rings[midR].pts;
  let mcx = 0;
  let mcy = 0;
  let mcz = 0;
  for (const [x, y, z] of midRing) {
    mcx += x;
    mcy += y;
    mcz += z;
  }
  mcx /= segs;
  mcy /= segs;
  mcz /= segs;

  const pA = rings[midR].pts[0];
  const pB = rings[midR].pts[1 % segs];
  const pC = rings[midR + 1].pts[1 % segs];
  const e1x = pC[0] - pA[0];
  const e1y = pC[1] - pA[1];
  const e1z = pC[2] - pA[2];
  const e2x = pB[0] - pA[0];
  const e2y = pB[1] - pA[1];
  const e2z = pB[2] - pA[2];
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  const outDot = nx * (pA[0] - mcx) + ny * (pA[1] - mcy) + nz * (pA[2] - mcz);
  const flip = outDot < 0;

  for (let r = 0; r < rings.length - 1; r++) {
    const r0 = ringOffsets[r];
    const r1 = ringOffsets[r + 1];
    for (let s = 0; s < segs; s++) {
      const sNext = (s + 1) % segs;
      const a = r0 + s;
      const bIdx = r0 + sNext;
      const c = r1 + sNext;
      const d = r1 + s;
      if (!flip) {
        b.indices.push(a, c, bIdx, a, d, c);
      } else {
        b.indices.push(a, bIdx, c, a, c, d);
      }
    }
  }

  if (capStart) {
    const first = rings[0];
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const [x, y, z] of first.pts) {
      cx += x;
      cy += y;
      cz += z;
    }
    const cIdx = pushVertex(b, cx / segs, cy / segs, cz / segs, first.weights[0]);
    const r0 = ringOffsets[0];
    for (let s = 0; s < segs; s++) {
      const sNext = (s + 1) % segs;
      if (!flip) {
        b.indices.push(cIdx, r0 + s, r0 + sNext);
      } else {
        b.indices.push(cIdx, r0 + sNext, r0 + s);
      }
    }
  }

  if (capEnd) {
    const last = rings[rings.length - 1];
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const [x, y, z] of last.pts) {
      cx += x;
      cy += y;
      cz += z;
    }
    const cIdx = pushVertex(b, cx / segs, cy / segs, cz / segs, last.weights[0]);
    const rLast = ringOffsets[rings.length - 1];
    for (let s = 0; s < segs; s++) {
      const sNext = (s + 1) % segs;
      if (!flip) {
        b.indices.push(cIdx, rLast + sNext, rLast + s);
      } else {
        b.indices.push(cIdx, rLast + s, rLast + sNext);
      }
    }
  }
}

/**
 * Analytic smooth torso cross-section profile (slimmer chest, flat aligned waist, smooth crew collar slope).
 */
export function torsoProfileAtY(
  y: number,
  metrics: DerivedBodyMetrics,
): { rx: number; rzFront: number; rzBack: number; zCenter: number } {
  const chestW = metrics.chestWidth + metrics.hoodieEase;
  const waistW = metrics.waistWidth + metrics.hoodieEase;
  const chestD = metrics.chestDepth + metrics.hoodieEase;

  // Height spans y = 0.835 (natural hoodie hip hem covering waist cleanly) to y = 1.432 (collar rim)
  const t = clamp01((y - 0.835) / (1.432 - 0.835));

  let rx: number;
  if (t < 0.09) {
    // Sleek tailored ribbed hem draping smoothly over upper hips (NO waist doughnut!)
    const u = t / 0.09;
    rx = waistW * (0.98 + 0.02 * smoothstep(0, 1, u));
  } else if (t < 0.52) {
    // Slim straight waist rising softly into ribcage
    const u = (t - 0.09) / 0.43;
    rx = waistW * 1.00 + (chestW * 0.96 - waistW * 1.00) * smoothstep(0, 1, u);
  } else if (t < 0.915) {
    // Broad athletic upper chest & natural shoulder shelf (supports seamless welded armhole!)
    const u = (t - 0.52) / 0.395;
    rx = chestW * (0.96 + 0.04 * Math.sin(u * Math.PI * 0.85) - 0.05 * smoothstep(0.65, 1.0, u));
  } else {
    // Smooth organic trapezius slope from top of shoulders (y ~ 1.382) into hoodie collar (y = 1.432)
    const u = (t - 0.915) / 0.085;
    const s = smoothstep(0, 1, u);
    rx = chestW * 0.91 * (1 - s) + 0.064 * s;
  }

  // Smooth depth profile (aligned flat waist, gentle chest fullness, smooth trapezius taper)
  let depthScale = 0.86;
  if (t < 0.12) {
    depthScale = 0.84 + 0.04 * smoothstep(0, 0.12, t);
  } else if (t < 0.84) {
    const u = (t - 0.12) / 0.72;
    depthScale = 0.88 + 0.12 * Math.sin(u * Math.PI * 0.85);
  } else {
    const u = (t - 0.84) / 0.16;
    const s = smoothstep(0, 1, u);
    depthScale = 0.95 * (1 - s) + (0.062 / chestD) * s;
  }

  const rz = chestD * depthScale;
  const zCenter = Math.sin(t * Math.PI) * 0.006;
  return { rx, rzFront: rz * 1.02, rzBack: rz * 0.96, zCenter };
}

/**
 * Analytic smooth head+shorter-neck radius profile so the red beanie stays mathematically outside the skull!
 */
export function headNeckProfileAtY(y: number): { rx: number; rz: number; zCenter: number } {
  // Starts inside collar at y = 1.36 -> short neck (1.39..1.47) -> sculpted jaw/chin -> smooth oval cranium (1.47..1.72)
  const pts: Array<[number, number, number, number]> = [
    [1.360, 0.056, 0.056, 0.004], // inside hoodie collar
    [1.405, 0.049, 0.050, 0.006], // collar rim
    [1.448, 0.046, 0.048, 0.008], // shorter sleek neck
    [1.476, 0.054, 0.058, 0.012], // under-chin transition
    [1.505, 0.072, 0.080, 0.014], // smooth jawline
    [1.545, 0.085, 0.095, 0.012], // cheeks
    [1.590, 0.090, 0.101, 0.008], // brow / mid-head
    [1.640, 0.089, 0.100, 0.004], // upper temples
    [1.682, 0.074, 0.084, 0.001], // crown curve
    [1.710, 0.044, 0.050, 0.000], // top crown
    [1.724, 0.002, 0.002, 0.000], // apex
  ];

  if (y <= pts[0][0]) return { rx: pts[0][1], rz: pts[0][2], zCenter: pts[0][3] };
  for (let i = 0; i < pts.length - 1; i++) {
    const [y0, rx0, rz0, z0] = pts[i];
    const [y1, rx1, rz1, z1] = pts[i + 1];
    if (y <= y1) {
      const u = smoothstep(y0, y1, y);
      return {
        rx: rx0 + (rx1 - rx0) * u,
        rz: rz0 + (rz1 - rz0) * u,
        zCenter: z0 + (z1 - z0) * u,
      };
    }
  }
  return { rx: 0.002, rz: 0.002, zCenter: 0 };
}

export interface BuiltBasePersonRig {
  rootBone: THREE.Bone;
  bones: THREE.Bone[];
  boneMap: Record<BoneName, THREE.Bone>;
  skeleton: THREE.Skeleton;
  geometries: {
    hoodie: THREE.BufferGeometry;
    jeans: THREE.BufferGeometry;
    headNeck: THREE.BufferGeometry;
    beanie: THREE.BufferGeometry;
    hands: THREE.BufferGeometry;
    socks: THREE.BufferGeometry;
    trainersUpper: THREE.BufferGeometry;
    trainersSole: THREE.BufferGeometry;
    trainersAccent: THREE.BufferGeometry;
  };
  pelvisBaseY: number;
}

// Anatomical finger layout in A-pose hand frame (+X*dir = UP/TOP thumb side, -X*dir = DOWN/BOTTOM pinky side!)
const FINGER_BIND_SPEC = [
  { key: "thumb", x: 0.032, y: -0.024, z: 0.011, rotZ: 0.56, rotY: -0.28, len: [0.028, 0.024, 0.019], rBase: 0.0108 },
  { key: "index", x: 0.025, y: -0.074, z: 0.004, rotZ: 0.06, rotY: 0.0, len: [0.034, 0.025, 0.019], rBase: 0.0092 },
  { key: "middle", x: 0.008, y: -0.078, z: 0.002, rotZ: 0.01, rotY: 0.0, len: [0.038, 0.027, 0.020], rBase: 0.0094 },
  { key: "ring", x: -0.010, y: -0.075, z: 0.0, rotZ: -0.04, rotY: 0.0, len: [0.034, 0.024, 0.018], rBase: 0.0088 },
  { key: "pinky", x: -0.026, y: -0.068, z: -0.002, rotZ: -0.10, rotY: 0.0, len: [0.027, 0.020, 0.016], rBase: 0.0078 },
] as const;

/**
 * Builds the complete 54-bone THREE.Skeleton (in A-pose bind pose) and all continuous,
 * seamlessly weighted BufferGeometries for the BasePerson character.
 */
export function buildBasePersonRig(shape: Partial<BodyShapeSettings> = {}): BuiltBasePersonRig {
  const metrics = computeBodyMetrics(shape);
  const pelvisBaseY = 0.90;
  const hipX = Math.max(0.080, metrics.pelvisWidth * 0.52);
  const shoulderX = metrics.shoulderSpan * 0.88;

  const upperArmLen = 0.27;
  const forearmLen = 0.24;
  const thighLen = 0.41;
  const shinLen = 0.405; // pelvisBaseY (0.90) - 0.015 - 0.41 - 0.405 = 0.070 ankle height!

  // 1. Construct all 54 THREE.Bones in exact BONE_NAMES order
  const boneMap = {} as Record<BoneName, THREE.Bone>;
  const bones: THREE.Bone[] = BONE_NAMES.map((name) => {
    const b = new THREE.Bone();
    b.name = name;
    boneMap[name] = b;
    return b;
  });

  // Core hierarchy (shorter natural neck: collar at ~1.40, head center ~1.56!)
  boneMap.pelvis.position.set(0, pelvisBaseY, 0);
  boneMap.spineLower.position.set(0, 0.07, 0); // y = 0.97
  boneMap.spineMid.position.set(0, 0.15, 0); // y = 1.12
  boneMap.spineUpper.position.set(0, 0.16, 0); // y = 1.28
  boneMap.neck.position.set(0, 0.135, 0.005); // y = 1.415
  boneMap.head.position.set(0, 0.068, 0.006); // y = 1.483 (shorter natural neck!)

  boneMap.pelvis.add(boneMap.spineLower);
  boneMap.spineLower.add(boneMap.spineMid);
  boneMap.spineMid.add(boneMap.spineUpper);
  boneMap.spineUpper.add(boneMap.neck);
  boneMap.neck.add(boneMap.head);

  // Arms hierarchy (20 bones per side, canonical A-pose bind rotation ±ARM_BIND_ANGLE)
  (["L", "R"] as const).forEach((side) => {
    const dir = side === "L" ? 1 : -1;
    const clav = boneMap[`clavicle${side}` as BoneName];
    const upper = boneMap[`upperArm${side}` as BoneName];
    const fore = boneMap[`forearm${side}` as BoneName];
    const twist = boneMap[`forearmTwist${side}` as BoneName];
    const hand = boneMap[`hand${side}` as BoneName];

    clav.position.set(dir * 0.048, 0.095, 0);
    upper.position.set(dir * (shoulderX - 0.048), -0.030, 0);
    upper.rotation.set(0, 0, dir * ARM_BIND_ANGLE);
    fore.position.set(0, -upperArmLen, 0);
    twist.position.set(0, -forearmLen * 0.5, 0);
    hand.position.set(0, -forearmLen * 0.5, 0);

    boneMap.spineUpper.add(clav);
    clav.add(upper);
    upper.add(fore);
    fore.add(twist);
    twist.add(hand);

    for (const fg of FINGER_BIND_SPEC) {
      const f1 = boneMap[`${fg.key}${side}1` as BoneName];
      const f2 = boneMap[`${fg.key}${side}2` as BoneName];
      const f3 = boneMap[`${fg.key}${side}3` as BoneName];

      f1.position.set(fg.x * dir, fg.y, fg.z);
      f1.rotation.set(0, fg.rotY * dir, fg.rotZ * dir);
      f2.position.set(0, -fg.len[0], 0);
      f3.position.set(0, -fg.len[1], 0);

      hand.add(f1);
      f1.add(f2);
      f2.add(f3);
    }
  });

  // Legs hierarchy (4 bones per side; foot sits at y = 0.070, bottom sole at y = 0.000!)
  (["L", "R"] as const).forEach((side) => {
    const dir = side === "L" ? 1 : -1;
    const thigh = boneMap[`thigh${side}` as BoneName];
    const shin = boneMap[`shin${side}` as BoneName];
    const foot = boneMap[`foot${side}` as BoneName];
    const toes = boneMap[`toes${side}` as BoneName];

    thigh.position.set(dir * hipX, -0.015, 0); // y = 0.885
    shin.position.set(0, -thighLen, 0); // y = 0.475
    foot.position.set(0, -shinLen, 0); // y = 0.070
    toes.position.set(0, -0.048, 0.092); // y = 0.022

    boneMap.pelvis.add(thigh);
    thigh.add(shin);
    shin.add(foot);
    foot.add(toes);
  });

  // Compute exact world matrices in canonical A-pose bind pose
  boneMap.pelvis.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();

  // Helper to transform a bone-local point into bind-pose world space
  const toBindWorld = (bone: THREE.Bone, lx: number, ly: number, lz: number): [number, number, number] => {
    const v = new THREE.Vector3(lx, ly, lz).applyMatrix4(bone.matrixWorld);
    return [v.x, v.y, v.z];
  };

  // =========================================================================
  // 2. SINGLE-MANIFOLD WELDED HOODIE (Torso + Integrated Collar + Welded Shoulders & Sleeves!)
  // =========================================================================
  // Both arms share the EXACT 24 boundary vertex indices of the left/right torso armholes!
  // Zero detached floating tubes, zero shoulder gaps, zero internal BackSide outline cut lines!
  const hoodieB = createBuilder();
  const torsoSegs = 36;
  const rArmBot = 18;
  const rArmTop = 24; // 6 vertical intervals -> 24-vertex armhole boundary loop!
  const rArmMid = (rArmBot + rArmTop) * 0.5; // 21

  const torsoYs: number[] = [];
  for (let r = 0; r <= 17; r++) {
    torsoYs.push(0.835 + (r / 17) * (1.228 - 0.835));
  }
  for (let i = 0; i <= 6; i++) {
    torsoYs.push(1.250 + (i / 6) * (1.382 - 1.250)); // r = 18..24 exact armhole span!
  }
  torsoYs.push(1.398, 1.412, 1.424, 1.432, 1.430, 1.414); // r = 25..30 trapezius + integrated rolled collar!

  const isLeftInterior = (r: number, s: number): boolean =>
    r > rArmBot && r < rArmTop && (s >= 34 || s <= 2);
  const isRightInterior = (r: number, s: number): boolean =>
    r > rArmBot && r < rArmTop && s >= 16 && s <= 20;
  const isLeftQuadHole = (r: number, s: number): boolean =>
    r >= rArmBot && r < rArmTop && (s >= 33 || s <= 2);
  const isRightQuadHole = (r: number, s: number): boolean =>
    r >= rArmBot && r < rArmTop && s >= 15 && s <= 20;

  const torsoGrid: number[][] = [];
  const torsoPosMap = new Map<number, [number, number, number]>();

  for (let r = 0; r < torsoYs.length; r++) {
    const rowIdx: number[] = [];
    const baseY = torsoYs[r];

    for (let s = 0; s < torsoSegs; s++) {
      if (isLeftInterior(r, s) || isRightInterior(r, s)) {
        rowIdx.push(-1);
        continue;
      }

      let yEval = baseY;
      let sEval = s;
      let holeSide: "L" | "R" | null = null;

      // Gently round the 24-vertex armhole boundary on the analytic torso surface into a smooth anatomical oval!
      if (r >= rArmBot && r <= rArmTop) {
        const dsL = s <= 18 ? s : s - torsoSegs; // signed angular offset from s = 0 (Left)
        const dsR = s - 18; // signed angular offset from s = 18 (Right)
        if (Math.abs(dsL) <= 3) {
          holeSide = "L";
          const u = (r - rArmMid) / 3;
          const v = dsL / 3;
          const r2 = u * u + v * v;
          if (r2 > 1.001) {
            const roundScale = Math.pow(r2, -0.24);
            yEval = 1.316 + u * roundScale * 0.066;
            sEval = dsL * roundScale;
          }
        } else if (Math.abs(dsR) <= 3) {
          holeSide = "R";
          const u = (r - rArmMid) / 3;
          const v = dsR / 3;
          const r2 = u * u + v * v;
          if (r2 > 1.001) {
            const roundScale = Math.pow(r2, -0.24);
            yEval = 1.316 + u * roundScale * 0.066;
            sEval = 18 + dsR * roundScale;
          }
        }
      }

      const ang = (sEval / torsoSegs) * Math.PI * 2;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);

      let x: number;
      let z: number;
      if (r === 29) {
        // Integrated soft rolled collar top lip
        x = cosA * 0.060;
        z = 0.005 + sinA * 0.062;
      } else if (r === 30) {
        // Integrated collar inner tuck around neck (zero separate seam tube!)
        x = cosA * 0.052;
        z = 0.005 + sinA * 0.054;
      } else {
        const prof = torsoProfileAtY(yEval, metrics);
        x = cosA * prof.rx;
        const rz = sinA >= 0 ? prof.rzFront : prof.rzBack;
        const sq = 0.94 + 0.06 * Math.abs(cosA * sinA) * 2.0;
        z = prof.zCenter + sinA * rz * sq;
      }

      let wts: SkinWeightEntry[];
      if (holeSide) {
        // Exact smooth shoulder-junction weights on the 24 shared armhole vertices
        const clavIdx = BONE_INDEX[`clavicle${holeSide}` as BoneName];
        const upIdx = BONE_INDEX[`upperArm${holeSide}` as BoneName];
        wts = [
          { index: BONE_INDEX.spineUpper, weight: 0.56 },
          { index: clavIdx, weight: 0.34 },
          { index: upIdx, weight: 0.10 },
        ];
      } else if (r >= 29) {
        wts = [
          { index: BONE_INDEX.spineUpper, weight: 0.85 },
          { index: BONE_INDEX.neck, weight: 0.15 },
        ];
      } else {
        const wPelvis = 1 - smoothstep(0.87, 0.99, yEval);
        const wLow = smoothstep(0.87, 0.99, yEval) * (1 - smoothstep(1.04, 1.17, yEval));
        const wMid = smoothstep(1.04, 1.17, yEval) * (1 - smoothstep(1.20, 1.33, yEval));
        const wUp = smoothstep(1.20, 1.33, yEval);
        const clavFactor = smoothstep(1.25, 1.39, yEval) * smoothstep(0.055, 0.145, Math.abs(x)) * 0.42;
        const clavIdx = x >= 0 ? BONE_INDEX.clavicleL : BONE_INDEX.clavicleR;
        wts = [
          { index: BONE_INDEX.pelvis, weight: wPelvis },
          { index: BONE_INDEX.spineLower, weight: wLow },
          { index: BONE_INDEX.spineMid, weight: wMid },
          { index: BONE_INDEX.spineUpper, weight: wUp * (1 - clavFactor) },
          { index: clavIdx, weight: wUp * clavFactor },
        ];
      }

      // Exact 1500:1024 front-chest planar UVs matching our captured transparent 3D winking Ember PNG!
      // Non-front/back vertices get (-2, -2) so the graphic NEVER bleeds onto back or sleeves!
      let chestU = -2;
      let chestV = -2;
      if (r <= 26 && sinA > 0.22 && z > 0.025) {
        const printW = 0.270;
        const printH = printW * (1024 / 1500);
        chestU = (x + printW * 0.5) / printW;
        chestV = (yEval - 1.075) / printH;
      }

      const vIdx = pushVertex(hoodieB, x, yEval, z, wts, chestU, chestV);
      rowIdx.push(vIdx);
      torsoPosMap.set(vIdx, [x, yEval, z]);
    }
    torsoGrid.push(rowIdx);
  }

  // Emit all torso quads EXCEPT the two 6x6 armhole openings (outward normals!)
  for (let r = 0; r < torsoYs.length - 1; r++) {
    for (let s = 0; s < torsoSegs; s++) {
      if (isLeftQuadHole(r, s) || isRightQuadHole(r, s)) continue;
      const sNext = (s + 1) % torsoSegs;
      const a = torsoGrid[r][s];
      const bIdx = torsoGrid[r][sNext];
      const c = torsoGrid[r + 1][sNext];
      const d = torsoGrid[r + 1][s];
      hoodieB.indices.push(a, c, bIdx, a, d, c);
    }
  }

  // Cap bottom hoodie hem cleanly at y = 0.835 (facing -Y downward)
  const hemCenterIdx = pushVertex(hoodieB, 0, 0.835, 0, [{ index: BONE_INDEX.pelvis, weight: 1 }]);
  for (let s = 0; s < torsoSegs; s++) {
    const sNext = (s + 1) % torsoSegs;
    hoodieB.indices.push(hemCenterIdx, torsoGrid[0][s], torsoGrid[0][sNext]);
  }

  // Stitch BOTH sleeves directly onto the 24 shared torso armhole vertices (100% continuous unified mesh!)
  (["L", "R"] as const).forEach((side) => {
    const dir = side === "L" ? 1 : -1;
    const upperBone = boneMap[`upperArm${side}` as BoneName];
    const clavIdx = BONE_INDEX[`clavicle${side}` as BoneName];
    const upIdx = BONE_INDEX[`upperArm${side}` as BoneName];
    const foreIdx = BONE_INDEX[`forearm${side}` as BoneName];
    const twistIdx = BONE_INDEX[`forearmTwist${side}` as BoneName];

    // Exact 24-vertex shared armhole boundary loop ordered k=0 (TOP) -> k=6 (FRONT) -> k=12 (ARMPIT) -> k=18 (BACK)
    const armholeLoop: number[] = [];
    if (side === "L") {
      for (let k = 0; k <= 3; k++) armholeLoop.push(torsoGrid[rArmTop][k]);
      for (let k = 1; k <= 6; k++) armholeLoop.push(torsoGrid[rArmTop - k][3]);
      for (let k = 1; k <= 6; k++) armholeLoop.push(torsoGrid[rArmBot][(3 - k + torsoSegs) % torsoSegs]);
      for (let k = 1; k <= 6; k++) armholeLoop.push(torsoGrid[rArmBot + k][33]);
      for (let k = 1; k <= 2; k++) armholeLoop.push(torsoGrid[rArmTop][(33 + k) % torsoSegs]);
    } else {
      for (let k = 0; k <= 3; k++) armholeLoop.push(torsoGrid[rArmTop][18 - k]);
      for (let k = 1; k <= 6; k++) armholeLoop.push(torsoGrid[rArmTop - k][15]);
      for (let k = 1; k <= 6; k++) armholeLoop.push(torsoGrid[rArmBot][15 + k]);
      for (let k = 1; k <= 6; k++) armholeLoop.push(torsoGrid[rArmBot + k][21]);
      for (let k = 1; k <= 2; k++) armholeLoop.push(torsoGrid[rArmTop][21 - k]);
    }

    const segs = armholeLoop.length; // 24
    const armR = metrics.armRadius + metrics.hoodieEase * 0.68; // Natural relaxed streetwear hoodie sleeve!
    const totalLen = upperArmLen + forearmLen; // 0.51m
    const bridgeDist = 0.088; // Exact localY distance where full circular sleeve clears armpit cleanly!
    const bridgeSteps = 5;
    const armSteps = 18;

    const sleeveRadiusAtU = (u: number): number => {
      if (u < 0.53) {
        const t = u / 0.53;
        return armR * (1.02 - 0.16 * smoothstep(0, 1, t));
      }
      if (u < 0.90) {
        const t = (u - 0.53) / 0.37;
        return armR * (0.86 - 0.18 * smoothstep(0, 1, t));
      }
      const t = (u - 0.90) / 0.10;
      return armR * (0.68 - 0.04 * smoothstep(0, 1, t));
    };

    const sleeveRingIdx: number[][] = [armholeLoop];

    // Precompute Ring 0 (shared armhole) and Bridge Target Ring (d = bridgeDist) world positions
    const pHole: Array<[number, number, number]> = armholeLoop.map((idx) => torsoPosMap.get(idx)!);
    const bridgeTargetRad = sleeveRadiusAtU(bridgeDist / totalLen);
    const pBridgeEnd: Array<[number, number, number]> = [];
    for (let k = 0; k < segs; k++) {
      const phi = (k / segs) * Math.PI * 2;
      pBridgeEnd.push(
        toBindWorld(
          upperBone,
          dir * Math.cos(phi) * bridgeTargetRad,
          -bridgeDist,
          Math.sin(phi) * bridgeTargetRad * 0.98,
        ),
      );
    }

    // Rings 1..bridgeSteps: Sculpted organic deltoid shoulder cap & smooth concave armpit gusset!
    for (let br = 1; br <= bridgeSteps; br++) {
      const t = br / bridgeSteps;
      const sCurve = smoothstep(0, 1, t);
      const arch = Math.sin(t * Math.PI);
      const ring: number[] = [];

      const wTorso = (1 - smoothstep(0.0, 0.72, t)) * 0.52;
      const wClav = (1 - smoothstep(0.0, 0.92, t)) * 0.34;
      const wUp = Math.max(0.05, 1 - wTorso - wClav);

      for (let k = 0; k < segs; k++) {
        const phi = (k / segs) * Math.PI * 2;
        const p0 = pHole[k];
        const p1 = pBridgeEnd[k];
        // Rounded deltoid fullness on top/outer shoulder (cos(phi) > -0.25), sleek tight armpit underneath!
        const deltoidMask = smoothstep(-0.25, 1.0, Math.cos(phi));
        const wx = p0[0] + (p1[0] - p0[0]) * sCurve + dir * arch * 0.014 * deltoidMask;
        const wy = p0[1] + (p1[1] - p0[1]) * sCurve + arch * 0.018 * deltoidMask;
        const wz = p0[2] + (p1[2] - p0[2]) * sCurve + Math.sin(phi) * arch * 0.006 * deltoidMask;
        ring.push(
          pushVertex(hoodieB, wx, wy, wz, [
            { index: BONE_INDEX.spineUpper, weight: wTorso },
            { index: clavIdx, weight: wClav },
            { index: upIdx, weight: wUp },
          ]),
        );
      }
      sleeveRingIdx.push(ring);
    }

    // Rings (bridgeSteps+1)..(bridgeSteps+armSteps): Continuous upper arm -> elbow -> forearm -> ribbed cuff!
    for (let ar = 1; ar <= armSteps; ar++) {
      const f = ar / armSteps;
      const localY = -(bridgeDist + f * (totalLen - bridgeDist));
      const u = clamp01(-localY / totalLen);
      const rad = sleeveRadiusAtU(u);
      const ring: number[] = [];

      const wUp = 1 - smoothstep(0.45, 0.61, u);
      const wFore = smoothstep(0.45, 0.61, u) * (1 - smoothstep(0.68, 0.86, u));
      const wTwist = smoothstep(0.68, 0.86, u);

      for (let k = 0; k < segs; k++) {
        const phi = (k / segs) * Math.PI * 2;
        const [wx, wy, wz] = toBindWorld(
          upperBone,
          dir * Math.cos(phi) * rad,
          localY,
          Math.sin(phi) * rad * 0.98,
        );
        ring.push(
          pushVertex(hoodieB, wx, wy, wz, [
            { index: upIdx, weight: wUp },
            { index: foreIdx, weight: wFore },
            { index: twistIdx, weight: wTwist },
          ]),
        );
      }
      sleeveRingIdx.push(ring);
    }

    // Final tucked inner wrist cuff lip wrapping neatly around white wrist (no sharp cut edge!)
    const cuffTuckRing: number[] = [];
    for (let k = 0; k < segs; k++) {
      const phi = (k / segs) * Math.PI * 2;
      const [wx, wy, wz] = toBindWorld(
        upperBone,
        dir * Math.cos(phi) * 0.025,
        -totalLen + 0.008,
        Math.sin(phi) * 0.023,
      );
      cuffTuckRing.push(pushVertex(hoodieB, wx, wy, wz, [{ index: twistIdx, weight: 1.0 }]));
    }
    sleeveRingIdx.push(cuffTuckRing);

    // Emit stitched sleeve quads with guaranteed outward winding (verified per side!)
    const flipSleeve = side === "L";
    for (let r = 0; r < sleeveRingIdx.length - 1; r++) {
      const r0 = sleeveRingIdx[r];
      const r1 = sleeveRingIdx[r + 1];
      for (let k = 0; k < segs; k++) {
        const kNext = (k + 1) % segs;
        const a = r0[k];
        const bIdx = r0[kNext];
        const c = r1[kNext];
        const d = r1[k];
        if (flipSleeve) {
          hoodieB.indices.push(a, bIdx, c, a, c, d);
        } else {
          hoodieB.indices.push(a, c, bIdx, a, d, c);
        }
      }
    }
  });

  // Hoodless crewneck shirt: no floating back hood and no hoodie drawstrings.

  // =========================================================================
  // 4. CONTINUOUS SEAMLESS JEANS (100% Flat Modest Pelvis + Smoothly Connected Tapered Legs!)
  // =========================================================================
  const jeansB = createBuilder();
  const legR = metrics.legRadius + metrics.jeansEase * 0.72;

  // Flat-fronted upper hip saddle tucked cleanly under hoodie hem (y = 0.805..0.905)
  // Strictly recessed behind the front thigh plane so there is NEVER any center crotch bulge!
  const pelvRings: Array<{ pts: Array<[number, number, number]>; weights: Array<SkinWeightEntry[]> }> = [];
  for (let r = 0; r <= 7; r++) {
    const u = r / 7;
    const y = 0.805 + u * 0.100; // ends cleanly at inseam arch (0.805), never protrudes downward!
    const rx = (metrics.pelvisWidth + metrics.jeansEase) * (0.94 + 0.04 * u);
    const rzBack = legR * 0.94;
    const rzFrontBase = legR * 0.82; // strictly behind front thigh surface (legR * 1.02) -> ZERO bulge!
    const pts: Array<[number, number, number]> = [];
    const wts: Array<SkinWeightEntry[]> = [];
    for (let s = 0; s < 28; s++) {
      const a = (s / 28) * Math.PI * 2;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const x = cosA * rx;
      // Flatten front center gently so jeans front reads completely smooth & modest
      const centerFlat = sinA > 0 ? 1 - 0.14 * Math.exp(-Math.pow(x / 0.05, 2)) : 1.0;
      const z = sinA >= 0 ? sinA * rzFrontBase * centerFlat : sinA * rzBack;
      pts.push([x, y, z]);
      const legBlend = (1 - smoothstep(0.805, 0.875, y)) * smoothstep(0.025, 0.095, Math.abs(x)) * 0.50;
      const thighIdx = x >= 0 ? BONE_INDEX.thighL : BONE_INDEX.thighR;
      wts.push([
        { index: BONE_INDEX.pelvis, weight: 1 - legBlend },
        { index: thighIdx, weight: legBlend },
      ]);
    }
    pelvRings.push({ pts, weights: wts });
  }
  addLoftedTube(jeansB, pelvRings, true, false);

  // Continuous seamless left & right jeans legs (joined seamlessly into hips -> smooth knee -> calf -> ankle)
  (["L", "R"] as const).forEach((side) => {
    const dir = side === "L" ? 1 : -1;
    const thighIdx = BONE_INDEX[`thigh${side}` as BoneName];
    const shinIdx = BONE_INDEX[`shin${side}` as BoneName];
    const rings: Array<{ pts: Array<[number, number, number]>; weights: Array<SkinWeightEntry[]> }> = [];
    const steps = 26;
    const segs = 24;

    for (let r = 0; r <= steps; r++) {
      const u = r / steps;
      const y = 0.885 - u * (0.885 - 0.088); // rises smoothly into hip under hoodie down to ankle cuff!

      let radX: number;
      let radZ: number;
      if (u < 0.12) {
        // Smooth hip-to-thigh transition bridging seamlessly to pelvis
        const t = u / 0.12;
        radX = legR * (1.06 - 0.04 * t);
        radZ = legR * (0.98 + 0.04 * t);
      } else if (u < 0.50) {
        // Natural athletic thigh tapering gently to knee
        const t = (u - 0.12) / 0.38;
        radX = legR * (1.02 - 0.24 * smoothstep(0, 1, t));
        radZ = legR * (1.02 - 0.22 * smoothstep(0, 1, t));
      } else if (u < 0.72) {
        // Subtle natural calf fullness below knee
        const t = (u - 0.50) / 0.22;
        const calfBump = Math.sin(t * Math.PI) * 0.03;
        radX = legR * (0.78 - 0.05 * t + calfBump);
        radZ = legR * (0.80 - 0.04 * t + calfBump * 1.2);
      } else {
        // Neat tapered jeans ankle hem
        const t = (u - 0.72) / 0.28;
        radX = legR * (0.73 - 0.11 * smoothstep(0, 1, t));
        radZ = legR * (0.76 - 0.13 * smoothstep(0, 1, t));
      }

      // Smoothly bring inner upper thigh together at hip so there is ZERO gap or awkward crotch channel!
      const hipPull = (1 - smoothstep(0.0, 0.16, u)) * 0.012;
      const cx = dir * (hipX * (1 - u * 0.04) - hipPull);
      const pts: Array<[number, number, number]> = [];
      const wts: Array<SkinWeightEntry[]> = [];

      const wPelvis = smoothstep(0.815, 0.885, y) * 0.72;
      const wKneeShin = 1 - smoothstep(0.42, 0.53, y);
      const wThigh = (1 - wPelvis) * (1 - wKneeShin);

      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * radX, y, Math.sin(a) * radZ]);
        wts.push([
          { index: BONE_INDEX.pelvis, weight: wPelvis },
          { index: thighIdx, weight: wThigh },
          { index: shinIdx, weight: wKneeShin },
        ]);
      }
      rings.push({ pts, weights: wts });
    }
    addLoftedTube(jeansB, rings, false, true);
  });

  // =========================================================================
  // 5. CONTINUOUS SHORTER NECK + SMOOTH BLANK MANNEQUIN HEAD (1 welded mesh!)
  // =========================================================================
  const headB = createBuilder();
  const headRows = 28;
  const headSegs = 32;
  const headRings: Array<{ pts: Array<[number, number, number]>; weights: Array<SkinWeightEntry[]> }> = [];
  for (let r = 0; r <= headRows; r++) {
    const y = 1.36 + (r / headRows) * (1.724 - 1.36);
    const p = headNeckProfileAtY(y);
    const pts: Array<[number, number, number]> = [];
    const wts: Array<SkinWeightEntry[]> = [];

    const wTorso = 1 - smoothstep(1.37, 1.43, y);
    const wNeck = smoothstep(1.37, 1.43, y) * (1 - smoothstep(1.45, 1.52, y));
    const wHead = smoothstep(1.45, 1.52, y);

    for (let s = 0; s < headSegs; s++) {
      const a = (s / headSegs) * Math.PI * 2;
      pts.push([Math.cos(a) * p.rx, y, p.zCenter + Math.sin(a) * p.rz]);
      wts.push([
        { index: BONE_INDEX.spineUpper, weight: wTorso },
        { index: BONE_INDEX.neck, weight: wNeck },
        { index: BONE_INDEX.head, weight: wHead },
      ]);
    }
    headRings.push({ pts, weights: wts });
  }
  addLoftedTube(headB, headRings, true, true);

  // =========================================================================
  // 6. SMOOTH SCULPTED RED RIBBED BEANIE (1 welded smooth mesh, ZERO bumpy floating capsules!)
  // =========================================================================
  const beanieB = createBuilder();
  const beanieRows = 20;
  const beanieSegs = 48; // smooth 24 vertical knit ribs baked directly into the continuous mesh!
  const beanieRings: Array<{ pts: Array<[number, number, number]>; weights: Array<SkinWeightEntry[]> }> = [];

  for (let r = 0; r <= beanieRows; r++) {
    const u = r / beanieRows;
    // Sits cleanly across mid-forehead (y = 1.592) up to cozy rounded knit crown (y = 1.752)
    const y = 1.592 + u * (1.752 - 1.592);
    const skull = headNeckProfileAtY(Math.min(1.724, y));

    // Folded ribbed cuff spans u = 0.00..0.44, dome spans u = 0.44..1.00
    const cuffZone = smoothstep(0.02, 0.12, u) * (1 - smoothstep(0.38, 0.48, u));
    const domeFactor = smoothstep(0.42, 1.0, u);
    // Strict clearance outside skull at all heights (guaranteed zero skull phasing!)
    const baseClearance = 0.011 + cuffZone * 0.008;
    const crownTaper = u > 0.72 ? Math.cos(((u - 0.72) / 0.28) * (Math.PI / 2)) : 1.0;

    const rxBase =
      u < 0.72
        ? skull.rx + baseClearance
        : Math.max(0.002, Math.max(skull.rx + 0.011, 0.090 * crownTaper));
    const rzBase =
      u < 0.72
        ? skull.rz + baseClearance
        : Math.max(0.002, Math.max(skull.rz + 0.011, 0.100 * crownTaper));

    const pts: Array<[number, number, number]> = [];
    const wts: Array<SkinWeightEntry[]> = [];
    for (let s = 0; s < beanieSegs; s++) {
      const a = (s / beanieSegs) * Math.PI * 2;
      // Smooth continuous vertical knit rib wave (24 ribs around cuff, subtle on dome!)
      const ribAmp = cuffZone * 0.0032 + (1 - cuffZone) * (1 - domeFactor) * 0.0010;
      const rib = Math.cos(a * 24) * ribAmp;
      const px = Math.cos(a) * (rxBase + rib);
      const pz = skull.zCenter + Math.sin(a) * (rzBase + rib);
      pts.push([px, y, pz]);
      wts.push([{ index: BONE_INDEX.head, weight: 1.0 }]);
    }
    beanieRings.push({ pts, weights: wts });
  }
  addLoftedTube(beanieB, beanieRings, true, true);

  // =========================================================================
  // 7. BUTTERY-SMOOTH CONTINUOUS HANDS (Sculpted Palm + Thenar Cushion + Smooth Rounded Fingers)
  // =========================================================================
  const handsB = createBuilder();
  (["L", "R"] as const).forEach((side) => {
    const dir = side === "L" ? 1 : -1;
    const handBone = boneMap[`hand${side}` as BoneName];
    const twistIdx = BONE_INDEX[`forearmTwist${side}` as BoneName];
    const handIdx = BONE_INDEX[`hand${side}` as BoneName];

    // Smoothly sculpted Wrist + Pillowy Anatomical Palm + Rounded Knuckle Ridge
    const palmRings: Array<{ pts: Array<[number, number, number]>; weights: Array<SkinWeightEntry[]> }> = [];
    const palmSteps = 20;
    const palmSegs = 28;
    for (let r = 0; r <= palmSteps; r++) {
      const u = r / palmSteps;
      const ly = 0.038 - u * 0.122; // +0.038 inside sleeve cuff -> 0.0 wrist -> -0.084 soft rounded knuckle dome!

      let rx: number;
      let rz: number;
      if (ly > -0.004) {
        // Silky smooth wrist emerging directly from inside tucked hoodie cuff
        const t = clamp01((0.038 - ly) / 0.042);
        rx = 0.026 + 0.005 * smoothstep(0, 1, t);
        rz = 0.021 - 0.0025 * smoothstep(0, 1, t);
      } else {
        // Widens into soft anatomical palm, then rounds cleanly over the distal knuckle dome (no blunt cut!)
        const t = clamp01((-0.004 - ly) / 0.080);
        const domeRound = t > 0.78 ? Math.cos(((t - 0.78) / 0.22) * (Math.PI * 0.44)) : 1.0;
        const palmSpread = Math.sin(Math.pow(Math.min(0.88, t), 0.75) * Math.PI * 0.85);
        rx = (0.031 + 0.0105 * palmSpread) * Math.max(0.42, domeRound);
        rz = (0.0185 - 0.0040 * smoothstep(0, 0.85, t)) * Math.max(0.32, domeRound);
      }

      // Soft sculpted thenar thumb muscle cushion on the top/front (+X*dir) edge of palm
      const thenarZone = smoothstep(0.004, -0.022, ly) * (1 - smoothstep(-0.042, -0.068, ly));

      const wTwist = 1 - smoothstep(-0.008, 0.022, -ly);
      const pts: Array<[number, number, number]> = [];
      const wts: Array<SkinWeightEntry[]> = [];
      for (let s = 0; s < palmSegs; s++) {
        const a = (s / palmSegs) * Math.PI * 2;
        const cosA = Math.cos(a);
        const sinA = Math.sin(a);
        // Gentle super-ellipse flattening for smooth palm/back planes + organic thenar curve toward thumb
        const thumbSide = Math.max(0, cosA * dir);
        const thenarPadX = dir * thenarZone * thumbSide * thumbSide * 0.0065;
        const thenarPadZ = thenarZone * thumbSide * Math.max(0, sinA) * 0.0045;
        const [wx, wy, wz] = toBindWorld(
          handBone,
          cosA * rx + thenarPadX,
          ly,
          sinA * rz + thenarPadZ,
        );
        pts.push([wx, wy, wz]);
        wts.push([
          { index: twistIdx, weight: wTwist },
          { index: handIdx, weight: 1 - wTwist },
        ]);
      }
      palmRings.push({ pts, weights: wts });
    }
    addLoftedTube(handsB, palmRings, false, true);

    // 5 Buttery-Smooth Tapered Fingers with deep seamless palm roots & hemispherical rounded tips!
    for (const fg of FINGER_BIND_SPEC) {
      const f1Bone = boneMap[`${fg.key}${side}1` as BoneName];
      const f1Idx = BONE_INDEX[`${fg.key}${side}1` as BoneName];
      const f2Idx = BONE_INDEX[`${fg.key}${side}2` as BoneName];
      const f3Idx = BONE_INDEX[`${fg.key}${side}3` as BoneName];

      const [l1, l2, l3] = fg.len;
      const totalL = l1 + l2 + l3;
      const rings: Array<{ pts: Array<[number, number, number]>; weights: Array<SkinWeightEntry[]> }> = [];
      const steps = 16;
      const segs = 16;

      for (let r = 0; r <= steps; r++) {
        const u = r / steps;
        // Root +0.022m inside the rounded palm knuckle dome for silky zero-seam blending!
        const ly = 0.022 - u * (totalL + 0.022);
        const along = clamp01(-ly / totalL);

        const baseBlend = ly > 0 ? 1.06 + 0.12 * smoothstep(0, 0.022, ly) : 1.06 - 0.24 * smoothstep(0, 0.85, along);
        // Smooth hemispherical fingertip dome over final 18% of finger length
        const tipDome = along > 0.82 ? Math.cos(((along - 0.82) / 0.18) * (Math.PI * 0.48)) : 1.0;
        const rad = fg.rBase * baseBlend * Math.max(0.14, tipDome);

        const wHand = 1 - smoothstep(-0.012, 0.014, -ly);
        const wF1 = (1 - wHand) * (1 - smoothstep(l1 - 0.008, l1 + 0.008, -ly));
        const wF2 = smoothstep(l1 - 0.008, l1 + 0.008, -ly) * (1 - smoothstep(l1 + l2 - 0.007, l1 + l2 + 0.007, -ly));
        const wF3 = smoothstep(l1 + l2 - 0.007, l1 + l2 + 0.007, -ly);

        const pts: Array<[number, number, number]> = [];
        const wts: Array<SkinWeightEntry[]> = [];
        for (let s = 0; s < segs; s++) {
          const a = (s / segs) * Math.PI * 2;
          const [wx, wy, wz] = toBindWorld(f1Bone, Math.cos(a) * rad, ly, Math.sin(a) * rad * 0.94);
          pts.push([wx, wy, wz]);
          wts.push([
            { index: handIdx, weight: wHand },
            { index: f1Idx, weight: wF1 },
            { index: f2Idx, weight: wF2 },
            { index: f3Idx, weight: wF3 },
          ]);
        }
        rings.push({ pts, weights: wts });
      }
      addLoftedTube(handsB, rings, false, true);
    }
  });

  // =========================================================================
  // 8. SINGLE-PIECE CONTINUOUS SMOOTH SOCKS & ROUNDED TRAINERS (flush on y = 0.000!)
  // =========================================================================
  const socksB = createBuilder();
  const trainersUpB = createBuilder();
  const trainersSoleB = createBuilder();
  const trainersAccB = createBuilder();

  (["L", "R"] as const).forEach((side) => {
    const dir = side === "L" ? 1 : -1;
    const cx = dir * (hipX * 0.94);
    const shinIdx = BONE_INDEX[`shin${side}` as BoneName];
    const footIdx = BONE_INDEX[`foot${side}` as BoneName];
    const toesIdx = BONE_INDEX[`toes${side}` as BoneName];

    // ONE single continuous L-curved anatomical sock from calf/ankle -> soft heel -> smooth instep -> rounded toe!
    // Zero separate intersecting ankle tube -> zero crease or bump at the ankle!
    const sockRings: Array<{ pts: Array<[number, number, number]>; weights: Array<SkinWeightEntry[]> }> = [];
    const sSteps = 26;
    const sSegs = 24;

    // Smooth curved spine (cy, cz) & local cross-section pitch angle (theta: 0 = horizontal ankle ring, pi/2 = vertical toe ring!)
    const evalSockSpine = (u: number): { cy: number; cz: number; pitch: number; rx: number; rTop: number; rBot: number } => {
      if (u < 0.34) {
        // Upper ankle cuff smoothly descending from inside jeans hem and beginning gentle forward bend
        const t = u / 0.34;
        const s = smoothstep(0, 1, t);
        const bend = Math.pow(t, 1.8) * (Math.PI * 0.28);
        return {
          cy: 0.122 - s * 0.070, // 0.122 -> 0.052
          cz: s * s * 0.012,
          pitch: bend,
          rx: 0.039 + s * 0.004,
          rTop: 0.040 + s * 0.005,
          rBot: 0.041 + s * 0.010, // soft anatomical Achilles & heel rounding!
        };
      }
      if (u < 0.84) {
        // Smooth instep gliding forward over midfoot toward toes with grounded flat sole
        const t = (u - 0.34) / 0.50;
        const s = smoothstep(0, 1, t);
        const pitch = Math.PI * 0.28 + smoothstep(0, 0.32, t) * (Math.PI * 0.22); // reaches clean vertical cross-section!
        const archWidth = 0.043 + Math.sin(t * Math.PI) * 0.0045;
        return {
          cy: 0.052 - s * 0.025, // 0.052 -> 0.027
          cz: 0.012 + t * 0.118, // 0.012 -> 0.130
          pitch,
          rx: archWidth,
          rTop: 0.045 - s * 0.020, // smooth sloping instep!
          rBot: 0.051 - s * 0.026,
        };
      }
      // Hemispherical soft rounded toe dome (u = 0.84..1.00)
      const t = (u - 0.84) / 0.16;
      const dome = Math.cos(t * Math.PI * 0.48);
      return {
        cy: 0.027 - t * 0.007,
        cz: 0.130 + Math.sin(t * Math.PI * 0.5) * 0.030, // toe tip at +0.160
        pitch: Math.PI * 0.5,
        rx: Math.max(0.005, 0.043 * dome),
        rTop: Math.max(0.004, 0.025 * dome),
        rBot: Math.max(0.004, 0.025 * dome),
      };
    };

    for (let r = 0; r <= sSteps; r++) {
      const u = r / sSteps;
      const sp = evalSockSpine(u);
      // Cross-section basis in YZ plane perpendicular to spine pitch
      // cos(pitch) along +Z (front of ankle), sin(pitch) along +Y (top of instep)!
      const fwdY = Math.sin(sp.pitch);
      const fwdZ = Math.cos(sp.pitch);

      const wShin = 1 - smoothstep(0.08, 0.34, u);
      const wToes = smoothstep(0.62, 0.82, u);
      const wFoot = Math.max(0.01, 1 - wShin - wToes);

      const pts: Array<[number, number, number]> = [];
      const wts: Array<SkinWeightEntry[]> = [];
      for (let s = 0; s < sSegs; s++) {
        const a = (s / sSegs) * Math.PI * 2;
        const cosA = Math.cos(a);
        const sinA = Math.sin(a);
        const radYZ = sinA >= 0 ? sp.rTop : sp.rBot;
        const px = cx + cosA * sp.rx;
        const rawY = sp.cy + sinA * radYZ * fwdY;
        const rawZ = sp.cz + sinA * radYZ * fwdZ;
        // Softly flatten sole against floor y = 0.002 so sock stands smoothly grounded!
        const py = rawY < 0.006 ? 0.002 + Math.max(0, rawY - 0.002) * 0.45 : rawY;
        pts.push([px, Math.max(0.002, py), rawZ]);
        wts.push([
          { index: shinIdx, weight: wShin },
          { index: footIdx, weight: wFoot },
          { index: toesIdx, weight: wToes },
        ]);
      }
      sockRings.push({ pts, weights: wts });
    }
    addLoftedTube(socksB, sockRings, false, true);

    // Outdoor Trainers (Smoother rounded sneaker Upper + Crisp White Midsole + Red Heel Tab!)
    const trUpRings: Array<{ pts: Array<[number, number, number]>; weights: Array<SkinWeightEntry[]> }> = [];
    const trSoleRings: Array<{ pts: Array<[number, number, number]>; weights: Array<SkinWeightEntry[]> }> = [];
    for (let r = 0; r <= 18; r++) {
      const u = r / 18;
      const z = -0.056 + u * 0.228; // -0.056 heel to +0.172 toe
      const env = Math.sin(Math.pow(u, 0.78) * Math.PI);
      const halfW = 0.050 * Math.pow(Math.max(0.10, env), 0.48);
      const wToes = smoothstep(0.082, 0.118, z);

      const topY = 0.022 + (0.068 - u * 0.036) * Math.pow(Math.max(0.08, env), 0.42);
      const botY = 0.020;
      const cy = (topY + botY) * 0.5;
      const halfH = Math.max(0.004, (topY - botY) * 0.5);
      const uPts: Array<[number, number, number]> = [];
      const sPts: Array<[number, number, number]> = [];
      const wts: Array<SkinWeightEntry[]> = [];
      for (let s = 0; s < 22; s++) {
        const a = (s / 22) * Math.PI * 2;
        uPts.push([cx + Math.cos(a) * halfW, cy + Math.sin(a) * halfH, z]);
        const soleHalfH = 0.0115;
        const soleY = Math.max(0.001, 0.0125 + Math.sin(a) * soleHalfH);
        sPts.push([cx + Math.cos(a) * (halfW * 1.04), soleY, z]);
        wts.push([
          { index: footIdx, weight: 1 - wToes },
          { index: toesIdx, weight: wToes },
        ]);
      }
      trUpRings.push({ pts: uPts, weights: wts });
      trSoleRings.push({ pts: sPts, weights: wts });
    }
    addLoftedTube(trainersUpB, trUpRings, true, true);
    addLoftedTube(trainersSoleB, trSoleRings, true, true);

    const trCollarRings: Array<{ pts: Array<[number, number, number]>; weights: Array<SkinWeightEntry[]> }> = [];
    for (let r = 0; r <= 6; r++) {
      const u = r / 6;
      const y = 0.105 - u * 0.042;
      const pts: Array<[number, number, number]> = [];
      const wts: Array<SkinWeightEntry[]> = [];
      for (let s = 0; s < 22; s++) {
        const a = (s / 22) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * 0.044, y, -0.004 + Math.sin(a) * 0.045]);
        wts.push([{ index: footIdx, weight: 1.0 }]);
      }
      trCollarRings.push({ pts, weights: wts });
    }
    addLoftedTube(trainersUpB, trCollarRings, false, false);

    const tabRings: Array<{ pts: Array<[number, number, number]>; weights: Array<SkinWeightEntry[]> }> = [];
    for (let r = 0; r <= 3; r++) {
      const y = 0.056 + (r / 3) * 0.032;
      const pts: Array<[number, number, number]> = [];
      const wts: Array<SkinWeightEntry[]> = [];
      for (let s = 0; s < 12; s++) {
        const a = (s / 12) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * 0.022, y, -0.049 + Math.sin(a) * 0.008]);
        wts.push([{ index: footIdx, weight: 1.0 }]);
      }
      tabRings.push({ pts, weights: wts });
    }
    addLoftedTube(trainersAccB, tabRings, true, true);
  });

  return {
    rootBone: boneMap.pelvis,
    bones,
    boneMap,
    skeleton,
    geometries: {
      hoodie: finalizeGeometry(hoodieB),
      jeans: finalizeGeometry(jeansB),
      headNeck: finalizeGeometry(headB),
      beanie: finalizeGeometry(beanieB),
      hands: finalizeGeometry(handsB),
      socks: finalizeGeometry(socksB),
      trainersUpper: finalizeGeometry(trainersUpB),
      trainersSole: finalizeGeometry(trainersSoleB),
      trainersAccent: finalizeGeometry(trainersAccB),
    },
    pelvisBaseY,
  };
}

// Precomputed anatomical splay offsets for proximal finger bones (so thumb stays splayed naturally!)
const FINGER_BIND_OFFSET: Partial<Record<BoneName, [number, number]>> = {};
(["L", "R"] as const).forEach((side) => {
  const dir = side === "L" ? 1 : -1;
  for (const fg of FINGER_BIND_SPEC) {
    FINGER_BIND_OFFSET[`${fg.key}${side}1` as BoneName] = [fg.rotY * dir, fg.rotZ * dir];
  }
});

/**
 * Deterministically applies all 54 bone rotations & root offset to the live THREE.Skeleton.
 * Zero allocations per frame!
 */
export function applyPoseToSkeleton(rig: BuiltBasePersonRig, poseState: BasePersonPoseState): void {
  const { rootOffset, bones: rotMap } = poseState;
  rig.rootBone.position.set(rootOffset[0], rig.pelvisBaseY + rootOffset[1], rootOffset[2]);
  for (let i = 0; i < BONE_NAMES.length; i++) {
    const name = BONE_NAMES[i];
    const [rx, ry, rz] = rotMap[name];
    const off = FINGER_BIND_OFFSET[name];
    if (off) {
      rig.bones[i].rotation.set(rx, ry + off[0], rz + off[1]);
    } else {
      rig.bones[i].rotation.set(rx, ry, rz);
    }
  }
  rig.rootBone.updateMatrixWorld(true);
}
