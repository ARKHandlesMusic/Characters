// Pure deterministic spring-driven physics, animation grammar, smear trail, and morph engine for EMBER.
// Nothing in Ember's body deformation is keyframed: squash/stretch, wobble, bank/lean, skirt trail,
// foot ripple speed, heading yaw, curved smear history, and 1-frame-staggered eye zips are all
// derived deterministically from the path and springs (fixed step from t=0, pure function of t).

import * as THREE from "three";
import { clamp01, easeOutCubic, lerp, settleCurve, smootherstep, smoothNoise1D } from "../shared/animation";

export type EmberShapeId =
  | "mochi"
  | "bulb"
  | "star"
  | "note"
  | "heart"
  | "word"
  | "duck"
  | "camcorder"
  | "duster"
  | "chalk"
  | "phone"
  | "monitor"
  | "swatter"
  | "bat";

export interface EmberEyeState {
  offset: [number, number, number]; // local position relative to Ember center
  stretchY: number;
  stretchX: number;
  blink: number; // 0 = open, 1 = closed slit
  squint: number; // 0 = normal, 1 = anticipation squint
  glance: [number, number];
}

export interface EmberFrameState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  speed: number;
  headingYaw: number;
  leanPitch: number;
  leanRoll: number;
  squashScale: [number, number, number]; // [sx, sy, sz] spring-derived squash & stretch
  skirtTrail: [number, number, number]; // opposite velocity drag on ghost feet
  footRipplePhase: number;
  footRippleAmp: number;
  breath: number;
  waveLeft: number;
  waveRight: number;

  // Shape morphing (pure SDF blend)
  shapeFrom: EmberShapeId;
  shapeTo: EmberShapeId;
  morphBlend: number; // 0..1
  shapeActionPhase: number; // local time after morph completes (bulb flicker, star snap, note hops, heart beat)
  bulbLit: number; // 0..1 flicker glow for light bulb

  // Curved 2D smear trail (5 world-space past positions along real curved path)
  trailWorld: [number, number, number][];
  smearStrength: number; // 0..1 gated by speed

  // Surface emergence / dive clipping plane
  clipPlaneEnabled: boolean;
  clipPlanePoint: [number, number, number];
  clipPlaneNormal: [number, number, number]; // keeps dot(p - point, normal) >= 0
  surfaceRippleTime: number; // <0 inactive, >=0 expanding ripple age in seconds
  surfaceRippleOrigin: [number, number];
  flatDrawingOpacity: number; // 0..1 for 2D Ember living inside the screen surface
  flatDrawingPos: [number, number];
  flatDrawingSquash: [number, number];

  // Object making (sleeve peel) & translucent skin coating
  peelProgress: number; // 0 = full coat, 0..1 peels upward from bottom into Ember blob on top
  peelRevealObject: number; // 0..1 visibility of the solid underlying object
  skinCoatMode: number; // 0 = opaque toon, 1 = translucent skin with solid edges & eye dome

  // Word morph ("ANYTHING" / "BOTTOMLESS")
  wordReveal: number; // 0..1
  wordText: string;

  // Eyes A (left and right independently spring-zipped 1 frame apart!)
  leftEye: EmberEyeState;
  rightEye: EmberEyeState;
  glowIntensity: number;
  // Running gag: Ember glows intensely when scared — and THAT glow is "the spark" at 02:53!
  scaredGlow?: number;
}

export function shapeIdToIndex(shape: EmberShapeId): number {
  switch (shape) {
    case "mochi":
      return 0;
    case "bulb":
      return 1;
    case "star":
      return 2;
    case "note":
      return 3;
    case "heart":
      return 4;
    case "duck":
      return 5;
    case "camcorder":
      return 6;
    case "duster":
      return 7;
    case "chalk":
      return 8;
    case "phone":
      return 9;
    case "monitor":
      return 10;
    case "swatter":
      return 11;
    case "bat":
      return 12;
    case "word":
      return 0;
  }
}

/**
 * Eye anchor positions (local x, y, z) on each SDF shape.
 */
export function eyeAnchorsForShape(shape: EmberShapeId): {
  left: [number, number, number];
  right: [number, number, number];
} {
  switch (shape) {
    case "bulb":
      return { left: [-0.2, 0.14, 0.62], right: [0.2, 0.14, 0.62] };
    case "star":
      return { left: [-0.19, 0.04, 0.4], right: [0.19, 0.04, 0.4] };
    case "note":
      return { left: [-0.34, -0.34, 0.36], right: [-0.08, -0.32, 0.36] };
    case "heart":
      return { left: [-0.22, 0.06, 0.46], right: [0.22, 0.06, 0.46] };
    case "duck":
      return { left: [-0.19, 0.34, 0.48], right: [0.19, 0.34, 0.48] };
    case "camcorder":
      return { left: [-0.14, 0.56, 0.44], right: [0.14, 0.56, 0.44] };
    case "duster":
      return { left: [-0.24, 0.14, 0.44], right: [0.24, 0.14, 0.44] };
    case "chalk":
      return { left: [-0.14, 0.18, 0.32], right: [0.14, 0.18, 0.32] };
    case "phone":
      return { left: [-0.18, 0.22, 0.24], right: [0.18, 0.22, 0.24] };
    case "monitor":
      return { left: [-0.28, 0.26, 0.24], right: [0.28, 0.26, 0.24] };
    case "swatter":
      // User brief: "the eyes of ember are on the handle" of the fly swatter!
      return { left: [-0.11, -0.44, 0.19], right: [0.11, -0.44, 0.19] };
    case "bat":
      // Eyes perched fiercely on the thick upper barrel of the baseball bat!
      return { left: [-0.15, 0.34, 0.25], right: [0.15, 0.34, 0.25] };
    case "word":
      // Eyes land on the two widest middle strokes (the two N's in ANYTHING)
      return { left: [-0.88, 0.04, 0.34], right: [0.92, 0.04, 0.34] };
    case "mochi":
    default:
      return { left: [-0.24, 0.04, 0.68], right: [0.24, 0.04, 0.68] };
  }
}

/**
 * Animation grammar snap move:
 * hold -> wind-up (pull back opposite direction) -> 5-frame snap (most distance in frames 1-2) -> overshoot -> settle.
 * Pure function of normalized time u in [0, 1].
 */
export function grammarSnapCurve(u: number): number {
  const x = clamp01(u);
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Wind-up phase: 0..0.24 pulls back to -0.14
  if (x < 0.24) {
    const p = x / 0.24;
    return -0.14 * Math.sin(p * Math.PI);
  }
  // Fast 5-frame snap + overshoot + damped spring wobble: 0.24..1.0
  const s = (x - 0.24) / 0.76;
  // Very steep initial launch (most distance in first ~18% of snap) with lively wobble
  const launch = 1 - Math.exp(-9.2 * s) * (Math.cos(15.5 * s) + (9.2 / 15.5) * Math.sin(15.5 * s));
  return launch;
}

/**
 * Computes periodic quick double-blink [0..1] (two crisp blinks per ~3.4s cycle).
 */
export function doubleBlinkAt(tSec: number, seedOffset = 0): number {
  const period = 3.4;
  const phase = (((tSec + seedOffset) % period) + period) % period;
  const pulse = (center: number, halfWidth: number) => {
    const d = Math.abs(phase - center);
    if (d >= halfWidth) return 0;
    return Math.pow(1 - d / halfWidth, 2);
  };
  return Math.max(pulse(0.32, 0.065), pulse(0.54, 0.065));
}

/**
 * Deterministic spring squash-and-stretch solver derived strictly from the path's velocity & acceleration.
 * Re-simulates a light 1D vertical squash spring over a short trailing window (1.2s at 120Hz)
 * so every frame is a pure function of t with zero drift and zero keyframes.
 */
export function solvePathSprings(
  tSec: number,
  samplePos: (t: number) => THREE.Vector3,
): {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  accel: THREE.Vector3;
  speed: number;
  squashScale: [number, number, number];
  leanPitch: number;
  leanRoll: number;
  skirtTrail: [number, number, number];
  trailWorld: [number, number, number][];
  smearStrength: number;
} {
  const eps = 1 / 120;
  const pos = samplePos(tSec);
  const posPrev = samplePos(Math.max(0, tSec - eps));
  const posNext = samplePos(tSec + eps);

  const velocity = posNext.clone().sub(posPrev).multiplyScalar(1 / (2 * eps));
  const velPrev = pos.clone().sub(posPrev).multiplyScalar(1 / eps);
  const velNext = posNext.clone().sub(pos).multiplyScalar(1 / eps);
  const accel = velNext.clone().sub(velPrev).multiplyScalar(1 / eps);
  const speed = velocity.length();

  // Re-simulate damped squash spring over trailing 1.1s window (120Hz = 132 tiny steps)
  const dt = 1 / 120;
  const windowSec = 1.1;
  const startT = Math.max(0, tSec - windowSec);
  const steps = Math.max(1, Math.round((tSec - startT) / dt));
  let sy = 1.0;
  let vsy = 0.0;
  let prevSpd = 0;

  for (let i = 0; i <= steps; i++) {
    const ti = startT + i * dt;
    const p0 = samplePos(Math.max(0, ti - dt));
    const p1 = samplePos(ti);
    const vx = (p1.x - p0.x) / dt;
    const vy = (p1.y - p0.y) / dt;
    const vz = (p1.z - p0.z) / dt;
    const spd = Math.hypot(vx, vy, vz);
    const decel = Math.max(0, prevSpd - spd) / dt;
    prevSpd = spd;

    // Target stretch along speed, squash impulse on sudden stop or vertical landing
    const verticalBoost = Math.min(0.32, Math.abs(vy) * 0.065);
    const stopSquash = Math.min(0.36, decel * 0.011);
    const targetSy = 1.0 + verticalBoost - stopSquash;

    const k = 195;
    const c = 13.5;
    vsy += (k * (targetSy - sy) - c * vsy) * dt;
    sy += vsy * dt;
  }

  sy = THREE.MathUtils.clamp(sy, 0.62, 1.44);
  // Volume preservation: sx * sy * sz ≈ 1, with extra elongation along fast speed
  const speedStretch = Math.min(0.35, speed * 0.036);
  const invSqrt = 1 / Math.sqrt(Math.max(0.4, sy));
  const sx = THREE.MathUtils.clamp(invSqrt * (1 + speedStretch * 0.45), 0.68, 1.48);
  const sz = THREE.MathUtils.clamp(invSqrt * (1 - speedStretch * 0.12), 0.72, 1.38);

  // Lean into turns & forward motion
  const leanRoll = THREE.MathUtils.clamp(-velocity.x * 0.075 - accel.x * 0.008, -0.42, 0.42);
  const leanPitch = THREE.MathUtils.clamp(velocity.z * 0.05 + velocity.y * 0.04, -0.35, 0.35);

  // Skirt trails opposite to velocity
  const trailMag = Math.min(0.55, speed * 0.08);
  const dir = speed > 0.05 ? velocity.clone().divideScalar(speed) : new THREE.Vector3(0, 0, 0);
  const skirtTrail: [number, number, number] = [
    -dir.x * trailMag,
    -dir.y * trailMag * 0.5,
    -dir.z * trailMag,
  ];

  // Curved 2D smear trail: sample 5 real past positions along Ember's actual curved path
  const smearStrength = smootherstep((speed - 2.4) / 4.2);
  const trailWorld: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) {
    const pastT = Math.max(0, tSec - (i + 1) * 0.016);
    const pp = samplePos(pastT);
    trailWorld.push([pp.x, pp.y, pp.z]);
  }

  return {
    position: pos,
    velocity,
    accel,
    speed,
    squashScale: [sx, sy, sz],
    leanPitch,
    leanRoll,
    skirtTrail,
    trailWorld,
    smearStrength,
  };
}

/**
 * Evaluates a morph transition with hold -> squash & squint -> pop tall -> overshoot -> settle,
 * and zips left/right eyes 1 frame (1/30s) apart with vertical stretch and landing blink!
 */
export function evaluateMorphOverlay(
  tSec: number,
  morphStartSec: number,
  fromShape: EmberShapeId,
  toShape: EmberShapeId,
  speedMult = 1.0,
): {
  morphBlend: number;
  squashMult: [number, number, number];
  leftEye: EmberEyeState;
  rightEye: EmberEyeState;
  actionTime: number;
} {
  const dt = (tSec - morphStartSec) * speedMult;
  const fromAnchors = eyeAnchorsForShape(fromShape);
  const toAnchors = eyeAnchorsForShape(toShape);

  const windDur = 0.22;
  const snapDur = 0.26;
  const settleDur = 0.42;

  let morphBlend = 0;
  let sx = 1;
  let sy = 1;
  let sz = 1;
  let squint = 0;

  if (dt <= 0) {
    morphBlend = 0;
  } else if (dt < windDur) {
    // Squash down and squint tightly before popping into new shape (Image 6 row 1-2!)
    const p = smootherstep(dt / windDur);
    sy = lerp(1.0, 0.62, p);
    sx = lerp(1.0, 1.28, p);
    sz = lerp(1.0, 1.22, p);
    squint = p * 0.85;
    morphBlend = 0;
  } else if (dt < windDur + snapDur) {
    // Pop tall into the new shape with bold overshoot!
    const p = (dt - windDur) / snapDur;
    morphBlend = easeOutCubic(p);
    const pop = Math.sin(p * Math.PI);
    sy = lerp(0.62, 1.0, p) + pop * 0.34;
    sx = lerp(1.28, 1.0, p) - pop * 0.16;
    sz = lerp(1.22, 1.0, p) - pop * 0.12;
    squint = (1 - p) * 0.4;
  } else {
    morphBlend = 1;
    const s = (dt - windDur - snapDur) / settleDur;
    const wob = Math.exp(-6.5 * s) * Math.sin(15 * s) * 0.14;
    sy = 1 + wob;
    sx = 1 - wob * 0.6;
    sz = 1 - wob * 0.5;
  }

  // Independent eye zips: left eye starts at windDur, right eye starts 1 frame (1/30s) later!
  const solveEye = (
    fromPt: [number, number, number],
    toPt: [number, number, number],
    delayFrames: number,
  ): EmberEyeState => {
    const zipStart = windDur + delayFrames / 30;
    const zipDur = 0.18;
    const zipU = clamp01((dt - zipStart) / zipDur);
    const eased = settleCurve(zipU * 1.35, 8.5, 14.0);
    const inFlight = zipU > 0.02 && zipU < 0.96 ? Math.sin(zipU * Math.PI) : 0;

    // Blink cleanly right as eye lands!
    const landDt = dt - (zipStart + zipDur);
    const landBlink =
      landDt >= 0 && landDt < 0.14 ? Math.sin((landDt / 0.14) * Math.PI) : 0;
    const idleBlink = doubleBlinkAt(tSec, delayFrames * 0.01);

    const glanceX = smoothNoise1D(tSec * 0.65, 41) * 0.045;
    const glanceY = smoothNoise1D(tSec * 0.52, 73) * 0.028;

    return {
      offset: [
        lerp(fromPt[0], toPt[0], clamp01(eased)),
        lerp(fromPt[1], toPt[1], clamp01(eased)),
        lerp(fromPt[2], toPt[2], clamp01(eased)),
      ],
      stretchY: 1.0 + inFlight * 1.15, // tall stretched eyes during zip (Image 6!)
      stretchX: 1.0 - inFlight * 0.32,
      blink: Math.max(landBlink, idleBlink),
      squint,
      glance: [glanceX, glanceY],
    };
  };

  return {
    morphBlend,
    squashMult: [sx, sy, sz],
    leftEye: solveEye(fromAnchors.left, toAnchors.left, 0),
    rightEye: solveEye(fromAnchors.right, toAnchors.right, 1),
    actionTime: Math.max(0, dt - (windDur + snapDur * 0.6)),
  };
}

/**
 * Full 30-second Ember Character Showcase choreography (EmberShowcase4K):
 * 0.0 - 4.0s : Flat 2D drawing inside glass screen -> squashes -> pushes face-first out -> ripples -> holds half-out -> ducks -> snaps onto desk surface!
 * 4.0 - 11.2s: Alive breathing, swaying, curling nubs, wave at 8.6s, joyful bounce at 10.3s!
 * 11.2 - 20.5s: 5-frame smear dashes & morph cycle: Light Bulb (flickers on) -> Spinning Star -> Hopping Music Note -> ANYTHING word (eyes on two N's) -> Beating Heart!
 * 20.5 - 26.2s: Rubber Duck coat + sleeve peel upward revealing solid duck -> Translucent halftone skin coat over Camcorder!
 * 26.2 - 30.0s: Turns to screen, winds back, dives in slice-by-slice with ripples, lands inside screen as bouncing 2D drawing!
 */
export function emberShowcaseStateAt(tSec: number, speed = 1.0): EmberFrameState {
  const t = Math.max(0, tSec * speed);
  const screenZ = -1.65;

  // Waypoint path function with grammarSnapCurve dashes and 10.3s bounce
  const pathAt = (s: number): THREE.Vector3 => {
    // 0..1.35s: completely behind glass screen (only flat 2D Ember drawing is visible inside surface!)
    if (s < 1.35) return new THREE.Vector3(0.0, 0.22, screenZ - 0.98);
    // 1.35..2.35s: pushes face-first halfway out of glass, looks round
    if (s < 2.35) {
      const u = smootherstep((s - 1.35) / 0.85);
      return new THREE.Vector3(0.0, 0.22, lerp(screenZ - 0.98, screenZ + 0.25, u));
    }
    // 2.35..3.05s: holds half out, ducks back a little (2.7..3.05s)
    if (s < 3.05) {
      const duck = smootherstep((s - 2.65) / 0.35) * 0.24;
      return new THREE.Vector3(0.0, 0.22 - duck * 0.2, screenZ + 0.25 - duck);
    }
    // 3.05..3.95s: snaps out onto surface center!
    if (s < 3.95) {
      const u = grammarSnapCurve((s - 3.05) / 0.85);
      return new THREE.Vector3(0.0, lerp(0.18, 0.0, clamp01(u)) + Math.sin(clamp01(u) * Math.PI) * 0.35, lerp(screenZ + 0.05, 0.35, u));
    }
    // 3.95..11.2s: lives on surface — gentle alive sway, wave at 8.6s, joyful bounce at 10.3s!
    if (s < 11.2) {
      const swayX = Math.sin((s - 4.0) * 1.15) * 0.14;
      // Anticipation dip before 10.3s bounce, then crisp parabolic hop!
      let bounceY = 0;
      if (s >= 10.0 && s < 10.22) {
        bounceY = -0.14 * Math.sin(((s - 10.0) / 0.22) * Math.PI);
      } else if (s >= 10.22 && s < 10.92) {
        const bp = (s - 10.22) / 0.7;
        bounceY = Math.sin(bp * Math.PI) * 1.12;
      }
      return new THREE.Vector3(swayX, bounceY, 0.35);
    }
    // 11.2..13.0s: Dash left -> Light Bulb
    if (s < 13.0) {
      const u = grammarSnapCurve((s - 11.2) / 0.65);
      return new THREE.Vector3(lerp(0.0, -2.15, u), Math.sin(clamp01(u) * Math.PI) * 0.42, lerp(0.35, 0.1, u));
    }
    // 13.0..14.8s: Swoop up -> Spinning Star
    if (s < 14.8) {
      const u = grammarSnapCurve((s - 13.0) / 0.68);
      return new THREE.Vector3(lerp(-2.15, 0.25, u), lerp(0.0, 1.55, u) + Math.sin(clamp01(u) * Math.PI) * 0.55, lerp(0.1, -0.1, u));
    }
    // 14.8..16.7s: Dive down-right -> Hopping Music Note
    if (s < 16.7) {
      const u = grammarSnapCurve((s - 14.8) / 0.65);
      const basePos = new THREE.Vector3(lerp(0.25, 2.05, u), lerp(1.55, 0.18, u), lerp(-0.1, 0.35, u));
      // 3 joyful hops after landing (15.55..16.6s)
      const hopT = s - 15.55;
      if (hopT > 0 && hopT < 1.05) {
        const sub = (hopT % 0.35) / 0.35;
        basePos.y += Math.sin(sub * Math.PI) * 0.45;
      }
      return basePos;
    }
    // 16.7..18.9s: Glide to front -> ANYTHING word
    if (s < 18.9) {
      const u = grammarSnapCurve((s - 16.7) / 0.62);
      return new THREE.Vector3(lerp(2.05, 0.0, u), lerp(0.18, 0.08, u), lerp(0.35, 0.72, u));
    }
    // 18.9..20.7s: Come home -> Beating Heart
    if (s < 20.7) {
      const u = grammarSnapCurve((s - 18.9) / 0.62);
      return new THREE.Vector3(lerp(0.0, 0.0, u), lerp(0.08, 0.22, u) + Math.sin(clamp01(u) * Math.PI) * 0.35, lerp(0.72, 0.35, u));
    }
    // 20.7..23.6s: Dash left-front to make Rubber Duck (coat -> sleeve peel upward!)
    if (s < 23.6) {
      const u = grammarSnapCurve((s - 20.7) / 0.55);
      const peelHop = s > 22.9 ? Math.sin(clamp01((s - 22.9) / 0.65) * Math.PI) * 0.65 : 0;
      const peelShiftX = s > 22.9 ? easeOutCubic(clamp01((s - 22.9) / 0.65)) * 0.95 : 0;
      return new THREE.Vector3(lerp(0.0, -1.25, u) + peelShiftX, lerp(0.22, 0.05, u) + peelHop, lerp(0.35, 0.45, u));
    }
    // 23.6..26.5s: Dash right-front to melt into Translucent Skin over Camcorder -> pop back up
    if (s < 26.5) {
      const u = grammarSnapCurve((s - 23.6) / 0.55);
      const popUp = s > 25.85 ? easeOutCubic(clamp01((s - 25.85) / 0.55)) * 0.55 : 0;
      return new THREE.Vector3(lerp(-0.3, 1.35, u), 0.06 + popUp, lerp(0.45, 0.35, u));
    }
    // 26.5..30.0s: Wind back and dive cleanly into the 2D screen surface slice-by-slice!
    const u = grammarSnapCurve((s - 26.5) / 1.45);
    return new THREE.Vector3(lerp(1.35, 0.0, u), lerp(0.55, 0.22, u) + Math.sin(clamp01(u) * Math.PI) * 0.38, lerp(0.35, screenZ - 0.72, u));
  };

  const springs = solvePathSprings(t, pathAt);

  // Determine active shape & morph grammar
  let shapeFrom: EmberShapeId = "mochi";
  let shapeTo: EmberShapeId = "mochi";
  let morphStart = -10;
  let bulbLit = 0;
  let wordReveal = 0;
  let peelProgress = 0;
  let peelRevealObject = 0;
  let skinCoatMode = 0;

  if (t >= 11.45 && t < 13.15) {
    shapeFrom = "mochi";
    shapeTo = "bulb";
    morphStart = 11.45;
    const litDt = t - 12.0;
    if (litDt > 0) {
      // Crisp light bulb flicker ON!
      bulbLit = litDt < 0.08 ? 0.95 : litDt < 0.14 ? 0.2 : litDt < 0.22 ? 1.0 : 0.96;
    }
  } else if (t >= 13.15 && t < 14.95) {
    shapeFrom = "bulb";
    shapeTo = "star";
    morphStart = 13.15;
  } else if (t >= 14.95 && t < 16.85) {
    shapeFrom = "star";
    shapeTo = "note";
    morphStart = 14.95;
  } else if (t >= 16.85 && t < 19.05) {
    shapeFrom = "note";
    shapeTo = "word";
    morphStart = 16.85;
    wordReveal = smootherstep((t - 17.1) / 0.45) * (1 - smootherstep((t - 18.7) / 0.35));
  } else if (t >= 19.05 && t < 20.85) {
    shapeFrom = "word";
    shapeTo = "heart";
    morphStart = 19.05;
  } else if (t >= 20.85 && t < 23.6) {
    shapeFrom = "heart";
    shapeTo = "duck";
    morphStart = 20.85;
    // Sleeve peel upward from bottom (21.65s -> 22.95s) revealing solid rubber duck!
    peelProgress = smootherstep((t - 21.65) / 1.25);
    peelRevealObject = smootherstep((t - 21.72) / 0.45);
  } else if (t >= 23.6 && t < 26.5) {
    shapeFrom = "mochi";
    shapeTo = "camcorder";
    morphStart = 23.6;
    // Translucent glossy skin coating over camcorder, popping back into Ember at 25.8s
    skinCoatMode = smootherstep((t - 24.05) / 0.35) * (1 - smootherstep((t - 25.75) / 0.35));
    peelRevealObject = smootherstep((t - 23.95) / 0.25);
  } else if (t >= 26.5) {
    shapeFrom = "camcorder";
    shapeTo = "mochi";
    morphStart = 26.1;
  }

  const morph = evaluateMorphOverlay(t, morphStart, shapeFrom, shapeTo, 1.0);

  // Combine spring squash-stretch with morph anticipation/pop
  const squashScale: [number, number, number] = [
    springs.squashScale[0] * morph.squashMult[0],
    springs.squashScale[1] * morph.squashMult[1],
    springs.squashScale[2] * morph.squashMult[2],
  ];

  // Alive wave at 8.6s (lasts ~1.1s)
  const waveWindow = t >= 8.2 && t <= 9.5 ? Math.sin(clamp01((t - 8.2) / 1.3) * Math.PI) : 0;
  const waveRight = waveWindow * (0.65 + 0.35 * Math.sin((t - 8.2) * 16.0));
  const waveLeft = Math.sin(t * 2.1) * 0.12;

  // Heading yaw: faces velocity on dashes, turns toward camera on holds, turns toward screen on dive!
  let headingYaw = 0;
  if (t >= 26.5 && t < 28.4) {
    headingYaw = Math.PI * smootherstep((t - 26.5) / 0.45); // faces screen before diving in
  } else if (springs.speed > 1.2) {
    headingYaw = THREE.MathUtils.clamp(Math.atan2(springs.velocity.x, Math.max(0.8, springs.velocity.z + 2.5)) * 0.55, -0.7, 0.7);
  } else {
    headingYaw = Math.sin(t * 0.8) * 0.12;
  }

  // Surface slice plane active during emergence (0..4.2s) and dive back in (26.6..30s)
  const clipPlaneEnabled = t < 4.2 || t > 26.6;
  const rippleOutAge = t >= 1.45 && t < 4.5 ? t - 1.45 : -1;
  const rippleInAge = t >= 27.15 ? t - 27.15 : -1;
  const surfaceRippleTime = rippleInAge >= 0 ? rippleInAge : rippleOutAge;

  // 2D flat drawing inside screen before emergence (0..1.9s) and after dive-in (27.4..30s)
  let flatDrawingOpacity = 0;
  let flatDrawingPos: [number, number] = [0.0, 0.22];
  let flatDrawingSquash: [number, number] = [1, 1];
  if (t < 1.95) {
    flatDrawingOpacity = 1 - smootherstep((t - 1.35) / 0.55);
    // Squashes before pushing through glass
    const preSq = smootherstep((t - 0.8) / 0.5);
    flatDrawingSquash = [1 + preSq * 0.24, 1 - preSq * 0.22];
  } else if (t > 27.35) {
    const landT = t - 27.35;
    flatDrawingOpacity = smootherstep(landT / 0.25);
    // Picks up dive momentum inside the surface with a damped bounce!
    const bounce = Math.exp(-5.5 * landT) * Math.sin(14.0 * landT);
    flatDrawingPos = [-0.22 * (1 - Math.exp(-4.0 * landT)), 0.22 - Math.abs(bounce) * 0.18];
    flatDrawingSquash = [1 + bounce * 0.28, 1 - bounce * 0.25];
  }

  // Foot ripple speeds up dynamically with travel velocity
  const footRipplePhase = t * 5.2 + springs.speed * 1.4;
  const footRippleAmp = 0.045 + Math.min(0.08, springs.speed * 0.015);

  return {
    position: springs.position,
    velocity: springs.velocity,
    speed: springs.speed,
    headingYaw,
    leanPitch: springs.leanPitch,
    leanRoll: springs.leanRoll,
    squashScale,
    skirtTrail: springs.skirtTrail,
    footRipplePhase,
    footRippleAmp,
    breath: Math.sin(t * 2.15) * 0.045,
    waveLeft,
    waveRight,
    shapeFrom,
    shapeTo,
    morphBlend: morph.morphBlend,
    shapeActionPhase: morph.actionTime,
    bulbLit,
    trailWorld: springs.trailWorld,
    smearStrength: springs.smearStrength,
    clipPlaneEnabled,
    clipPlanePoint: [0, 0, screenZ],
    clipPlaneNormal: [0, 0, 1],
    surfaceRippleTime,
    surfaceRippleOrigin: [0.0, 0.22],
    flatDrawingOpacity,
    flatDrawingPos,
    flatDrawingSquash,
    peelProgress,
    peelRevealObject,
    skinCoatMode,
    wordReveal,
    wordText: "ANYTHING",
    leftEye: morph.leftEye,
    rightEye: morph.rightEye,
    glowIntensity: 1.0 + bulbLit * 0.85,
    scaredGlow: 0,
  };
}

/**
 * Full 188-second Ember Choreography inside the 4K "Bottomless" Music Video!
 * Integrates Ember into every single act as the unmuted glowing orange protagonist.
 */
export function emberMusicVideoStateAt(tSec: number, kickPulse: number): EmberFrameState {
  // Position path synchronized to the 7 acts of Bottomless — stays strictly out of the focal point
  // (corners, backgrounds, gaps between lyrics) and goes quiet on emotional beats (02:03-02:11 & 02:32)!
  const pathAt = (s: number): THREE.Vector3 => {
    // Act 0 & 1 (0..40.86s): Peripheral upper-right / left edges beside the 3AM monolith (never blocking screen or lyrics)
    if (s < 3.6) {
      const u = smootherstep(s / 3.4);
      return new THREE.Vector3(lerp(1.45, 1.85, u), 0.72 + Math.sin(s * 2.0) * 0.06, lerp(-0.15, 0.35, u));
    }
    if (s < 13.56) {
      const u = grammarSnapCurve(clamp01((s - 3.6) / 0.85));
      let bounceY = 0;
      if (s >= 10.2 && s < 10.9) bounceY = Math.sin(((s - 10.2) / 0.7) * Math.PI) * 0.78;
      return new THREE.Vector3(lerp(1.85, 2.35, u) + Math.sin(s * 1.4) * 0.12, 0.72 + bounceY, lerp(0.35, 0.45, u));
    }
    if (s < 40.86) {
      // Verse 1: agile curved dashes along outer left/right corners & upper background margins
      const phase = s - 13.56;
      const seg = Math.floor(phase / 4.5);
      const localU = grammarSnapCurve((phase % 4.5) / 0.72);
      const pts: [number, number, number][] = [
        [2.35, 0.72, 0.45],
        [-2.35, 1.35, 0.85],
        [2.45, 1.65, -0.45],
        [-2.25, 0.95, 0.25],
        [2.35, 1.45, 0.55],
        [-2.15, 1.15, -0.25],
        [2.1, 0.95, -0.45],
      ];
      const pA = pts[Math.min(seg, pts.length - 1)];
      const pB = pts[Math.min(seg + 1, pts.length - 1)];
      return new THREE.Vector3(lerp(pA[0], pB[0], localU), lerp(pA[1], pB[1], localU), lerp(pA[2], pB[2], localU));
    }
    // Act 2 (40.86..66.86s): Outer shaft margin
    if (s < 66.86) {
      const ls = s - 40.86;
      return new THREE.Vector3(Math.sin(ls * 0.8) * 2.45, 3.2 - ls * 0.52, Math.cos(ls * 0.7) * 2.15);
    }
    // Act 3 (66.86..94.72s): Desert Server Cathedral outer aisle
    if (s < 94.72) {
      const ls = s - 66.86;
      return new THREE.Vector3(2.85 + Math.sin(ls * 0.55) * 0.65, 1.65 + Math.sin(ls * 1.1) * 0.3, 2.2 - ls * 0.15);
    }
    // Act 4 (94.72..123.07s): Predictive Loom outer spiral
    if (s < 123.07) {
      const ls = s - 94.72;
      return new THREE.Vector3(Math.cos(ls * 0.75) * 2.55, 2.4 - ls * 0.42, Math.sin(ls * 0.75) * 2.35);
    }
    // Act 5 Bridge (123.07..149.20s):
    // 02:03 - 02:11 (123.07..131.15s) EMOTIONAL BEAT — quiet, hushed, settled in far right corner
    if (s < 131.15) {
      return new THREE.Vector3(2.85, 0.95 + Math.sin(s * 0.65) * 0.03, 1.1);
    }
    if (s < 149.2) {
      const ls = s - 131.15;
      return new THREE.Vector3(2.65 + Math.sin(ls * 1.2) * 0.5, 1.35 + Math.cos(ls * 1.6) * 0.35, 0.4);
    }
    // Act 6 Finale (149.20..188.0s):
    // 02:32 (149.2..158.5s) EMOTIONAL FLOOR BEAT — rests quietly on left peripheral terrace
    if (s < 158.5) {
      return new THREE.Vector3(-2.75, 1.15 + Math.sin(s * 0.6) * 0.04, 0.65);
    }
    if (s < 171.0) {
      const ls = s - 158.5;
      return new THREE.Vector3(-2.45 + Math.sin(ls * 0.7) * 0.45, 1.35 + Math.sin(ls * 1.6) * 0.12, 0.65);
    }
    // 02:52 - 02:54 (171.6..174.6s): Villain swoops close right above the man on terrace ->
    // Ember flares into the blazing 02:53 scared SPARK glow, then escapes into the open sunrise sky!
    if (s < 174.4) {
      const u = smootherstep((s - 171.0) / 1.4);
      const jitter = s > 172.2 && s < 173.8 ? Math.sin(s * 34.0) * 0.06 : 0;
      return new THREE.Vector3(lerp(-2.45, -1.05, u) + jitter, lerp(1.35, 3.05, u) + Math.abs(jitter) * 0.6, lerp(0.65, 0.35, u));
    }
    const soar = smootherstep((s - 174.2) / 9.0);
    return new THREE.Vector3(lerp(-1.05, 1.55, soar), lerp(3.05, 6.2, soar), lerp(0.35, -4.4, soar));
  };

  const springs = solvePathSprings(tSec, pathAt);

  // RUNNING GAG — THE DISGUISES: Ember hides disguised as real objects along the margins across the song!
  let shapeFrom: EmberShapeId = "mochi";
  let shapeTo: EmberShapeId = "mochi";
  let morphStart = -10;
  let bulbLit = 0;
  let skinCoatMode = 0;

  if (tSec >= 18.37 && tSec < 24.5) {
    shapeFrom = "mochi";
    shapeTo = "bulb"; // Disguised as a glowing Light Bulb!
    morphStart = 18.37;
    bulbLit = 0.95;
  } else if (tSec >= 24.5 && tSec < 30.82) {
    shapeFrom = "bulb";
    shapeTo = "note"; // Disguised as a Music Note!
    morphStart = 24.5;
  } else if (tSec >= 32.98 && tSec < 40.86) {
    shapeFrom = "note";
    shapeTo = "heart";
    morphStart = 32.98;
  } else if (tSec >= 48.0 && tSec < 56.5) {
    shapeFrom = "mochi";
    shapeTo = "duck"; // Disguised as a Rubber Duck in Chorus 1 margin!
    morphStart = 48.0;
  } else if (tSec >= 73.95 && tSec < 84.5) {
    shapeFrom = "mochi";
    shapeTo = "camcorder"; // Disguised as a Camcorder with translucent skin coat in Desert Servers!
    morphStart = 73.95;
    skinCoatMode = 0.55 * smootherstep((tSec - 74.6) / 0.7);
  } else if (tSec >= 86.29 && tSec < 94.72) {
    shapeFrom = "camcorder";
    shapeTo = "star";
    morphStart = 86.29;
  } else if (tSec >= 102.0 && tSec < 112.0) {
    shapeFrom = "mochi";
    shapeTo = "bulb"; // Disguised as a bulb in the Loom periphery!
    morphStart = 102.0;
    bulbLit = 0.75;
  } else if (tSec >= 131.15 && tSec < 149.2) {
    shapeFrom = "mochi";
    shapeTo = "mochi";
    skinCoatMode = 0.45 * smootherstep((tSec - 135.6) / 1.2);
  } else if (tSec >= 161.03 && tSec < 171.8) {
    shapeFrom = "mochi";
    shapeTo = "heart";
    morphStart = 161.03;
  } else if (tSec >= 171.8 && tSec < 175.0) {
    // Back to wide-eyed scared mochi right before flaring as the 02:53 spark!
    shapeFrom = "heart";
    shapeTo = "mochi";
    morphStart = 171.8;
  } else if (tSec >= 175.0) {
    shapeFrom = "mochi";
    shapeTo = "star";
    morphStart = 175.0;
    bulbLit = 0.85;
  }

  const morph = evaluateMorphOverlay(tSec, morphStart, shapeFrom, shapeTo, 1.0);
  const beatBoost = 1 + kickPulse * 0.09;

  // RUNNING GAG: Ember glows brightly whenever scared by the Villain —
  // and THAT scared glow at 02:53 (172.2..174.4s) IS "the spark" that makes the man finally look up!
  const scaredPulse = (start: number, peak: number, end: number, maxVal: number) => {
    if (tSec < start || tSec > end) return 0;
    if (tSec < peak) return smootherstep((tSec - start) / Math.max(0.05, peak - start)) * maxVal;
    return (1 - smootherstep((tSec - peak) / Math.max(0.05, end - peak))) * maxVal;
  };
  const scaredGlow = Math.max(
    scaredPulse(23.1, 24.1, 25.0, 0.72), // Scared right before Villain gets distracted by Fake Orange!
    scaredPulse(77.4, 78.4, 79.4, 0.74), // Scared in Desert Servers before Villain eats Potted Plant!
    scaredPulse(106.5, 107.6, 108.5, 0.80), // Scared in Loom before Villain spots Croissant!
    scaredPulse(172.0, 173.1, 174.6, 1.0), // THE 02:53 SPARK PAYOFF!
  );

  // Wave at 8.6s during intro!
  const waveWin = tSec >= 8.2 && tSec <= 9.5 ? Math.sin(clamp01((tSec - 8.2) / 1.3) * Math.PI) : 0;

  return {
    position: springs.position,
    velocity: springs.velocity,
    speed: springs.speed,
    headingYaw: THREE.MathUtils.clamp(springs.velocity.x * 0.14, -0.65, 0.65),
    leanPitch: springs.leanPitch,
    leanRoll: springs.leanRoll,
    squashScale: [
      springs.squashScale[0] * morph.squashMult[0] * beatBoost,
      springs.squashScale[1] * morph.squashMult[1] * beatBoost,
      springs.squashScale[2] * morph.squashMult[2] * beatBoost,
    ],
    skirtTrail: springs.skirtTrail,
    footRipplePhase: tSec * 5.6 + springs.speed * 1.4,
    footRippleAmp: 0.05 + Math.min(0.08, springs.speed * 0.015),
    breath: Math.sin(tSec * 2.2) * 0.045,
    waveLeft: Math.sin(tSec * 2.0) * 0.14,
    waveRight: waveWin * (0.65 + 0.35 * Math.sin((tSec - 8.2) * 16.0)),
    shapeFrom,
    shapeTo,
    morphBlend: morph.morphBlend,
    shapeActionPhase: morph.actionTime,
    bulbLit,
    trailWorld: springs.trailWorld,
    smearStrength: springs.smearStrength,
    clipPlaneEnabled: false,
    clipPlanePoint: [0, 0, 0.09],
    clipPlaneNormal: [0, 0, 1],
    surfaceRippleTime: -1,
    surfaceRippleOrigin: [0, 0.2],
    flatDrawingOpacity: 0,
    flatDrawingPos: [0, 0.2],
    flatDrawingSquash: [1, 1],
    peelProgress: 0,
    peelRevealObject: 0,
    skinCoatMode,
    wordReveal: 0,
    wordText: "BOTTOMLESS",
    leftEye: {
      ...morph.leftEye,
      stretchY: morph.leftEye.stretchY * (1 + scaredGlow * 0.22),
    },
    rightEye: {
      ...morph.rightEye,
      stretchY: morph.rightEye.stretchY * (1 + scaredGlow * 0.22),
    },
    glowIntensity: 1.0 + bulbLit * 0.65 + kickPulse * 0.35 + scaredGlow * 2.1,
    scaredGlow,
  };
}
