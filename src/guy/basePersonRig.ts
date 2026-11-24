// 54-Bone Articulated Base Person Kinematic Rig & Calm Procedural Motion Engine
// Shared across the entire film (BasePerson4K + Bottomless4K Acts I, II, IV, VI).
// 100% pure deterministic function of tSec — zero useFrame() or randomness side effects.

import { clamp01, smoothNoise1D, smootherstep } from "../shared/animation";

export type Vec3Tuple = [number, number, number];

// Exact 54-bone skeleton hierarchy:
// Core (6): pelvis, spineLower, spineMid, spineUpper, neck, head
// Left Arm (20): clavicleL, upperArmL, forearmL, forearmTwistL, handL + 5 fingers × 3 phalanges (15)
// Right Arm (20): clavicleR, upperArmR, forearmR, forearmTwistR, handR + 5 fingers × 3 phalanges (15)
// Left Leg (4): thighL, shinL, footL, toesL
// Right Leg (4): thighR, shinR, footR, toesR
// Total = 6 + 20 + 20 + 4 + 4 = 54 bones
export const BONE_NAMES = [
  "pelvis",
  "spineLower",
  "spineMid",
  "spineUpper",
  "neck",
  "head",
  // Left arm (20)
  "clavicleL",
  "upperArmL",
  "forearmL",
  "forearmTwistL",
  "handL",
  "thumbL1",
  "thumbL2",
  "thumbL3",
  "indexL1",
  "indexL2",
  "indexL3",
  "middleL1",
  "middleL2",
  "middleL3",
  "ringL1",
  "ringL2",
  "ringL3",
  "pinkyL1",
  "pinkyL2",
  "pinkyL3",
  // Right arm (20)
  "clavicleR",
  "upperArmR",
  "forearmR",
  "forearmTwistR",
  "handR",
  "thumbR1",
  "thumbR2",
  "thumbR3",
  "indexR1",
  "indexR2",
  "indexR3",
  "middleR1",
  "middleR2",
  "middleR3",
  "ringR1",
  "ringR2",
  "ringR3",
  "pinkyR1",
  "pinkyR2",
  "pinkyR3",
  // Left leg (4)
  "thighL",
  "shinL",
  "footL",
  "toesL",
  // Right leg (4)
  "thighR",
  "shinR",
  "footR",
  "toesR",
] as const;

export type BoneName = (typeof BONE_NAMES)[number];
export type BoneRotations = Record<BoneName, Vec3Tuple>;

export type PersonPoseMode =
  | "tpose"
  | "stand"
  | "walk"
  | "seated"
  | "typing"
  | "slumped"
  | "falling"
  | "lyingPhone"
  | "standingPhone"
  | "scratchHead";
export type FootwearMode = "socks" | "trainers";

export interface BodyShapeSettings {
  heavier: number; // 0..1: fuller torso, limbs, and softer hood drape
  slimmer: number; // 0..1: narrower waist, lean arms & legs
  broader: number; // 0..1: wider collarbones, chest & upper back
  curvier: number; // 0..1: fuller hips, tapered waist, sculpted silhouette
}

export const DEFAULT_BODY_SHAPE: BodyShapeSettings = {
  heavier: 0,
  slimmer: 0,
  broader: 0,
  curvier: 0,
};

export interface DerivedBodyMetrics {
  pelvisWidth: number;
  waistWidth: number;
  chestWidth: number;
  chestDepth: number;
  shoulderSpan: number;
  armRadius: number;
  legRadius: number;
  hoodieEase: number;
  jeansEase: number;
}

export interface BasePersonPoseState {
  boneCount: number;
  rootOffset: Vec3Tuple;
  breathPhase: number; // 0..1 inhale amount (~4s cycle)
  shoulderRollOffsetY: number; // dip < 0, rise > 0, settle -> 0
  scrollFlickValue: number; // 0..1 spike during the two right-hand scroll flicks
  leftTapValue: number; // 0..1 spike during the left-hand tap
  bones: BoneRotations;
  metrics: DerivedBodyMetrics;
}

export function computeBodyMetrics(shape: Partial<BodyShapeSettings> = {}): DerivedBodyMetrics {
  const heavier = clamp01(shape.heavier ?? 0);
  const slimmer = clamp01(shape.slimmer ?? 0);
  const broader = clamp01(shape.broader ?? 0);
  const curvier = clamp01(shape.curvier ?? 0);

  const mass = 1 + heavier * 0.24 - slimmer * 0.16;
  const pelvisWidth = 0.150 * (1 + heavier * 0.20 - slimmer * 0.12 + curvier * 0.22);
  const waistWidth = 0.142 * (1 + heavier * 0.26 - slimmer * 0.16 - curvier * 0.11);
  const chestWidth = 0.172 * (1 + heavier * 0.18 - slimmer * 0.12 + broader * 0.22 + curvier * 0.04);
  const chestDepth = 0.104 * (1 + heavier * 0.22 - slimmer * 0.14 + broader * 0.10 + curvier * 0.08);
  const shoulderSpan = 0.194 * (1 + broader * 0.18 + heavier * 0.08 - slimmer * 0.09);
  const armRadius = 0.049 * mass;
  const legRadius = 0.074 * (mass + curvier * 0.08);

  return {
    pelvisWidth,
    waistWidth,
    chestWidth,
    chestDepth,
    shoulderSpan,
    armRadius,
    legRadius,
    hoodieEase: 0.010 + heavier * 0.006,
    jeansEase: 0.007 + heavier * 0.004,
  };
}

function createZeroRotations(): BoneRotations {
  const out = {} as BoneRotations;
  for (const name of BONE_NAMES) {
    out[name] = [0, 0, 0];
  }
  return out;
}

function addRot(rot: BoneRotations, bone: BoneName, rx: number, ry: number, rz: number): void {
  rot[bone][0] += rx;
  rot[bone][1] += ry;
  rot[bone][2] += rz;
}

/**
 * Smooth Gaussian impulse helper for crisp micro-gestures (scroll flicks, finger taps).
 */
function pulseAt(tSec: number, center: number, width: number): number {
  const u = (tSec - center) / width;
  return Math.exp(-u * u);
}

/**
 * Shoulder roll profile: dips slightly (anticipation), rises smoothly, rolls back, and settles.
 * Active on a repeating 14s calm phrase (centered around 4.2s..6.8s on first pass).
 */
export function shoulderRollCurve(tSec: number): { lift: number; rollBack: number } {
  const cyc = ((tSec % 14.0) + 14.0) % 14.0;
  // Dip anticipation: 4.1s - 4.75s
  const dip = -0.35 * pulseAt(cyc, 4.42, 0.26);
  // Rise peak: 4.85s - 5.75s
  const rise = 1.0 * pulseAt(cyc, 5.25, 0.44);
  // Subtle settling undershoot: 6.05s - 6.55s
  const settle = -0.14 * pulseAt(cyc, 6.22, 0.30);

  const lift = dip + rise + settle;
  // Backward rotation lags slightly behind lift peak (classic organic roll arc!)
  const rollBack = 0.85 * pulseAt(cyc, 5.52, 0.48) - 0.18 * pulseAt(cyc, 4.5, 0.28);
  return { lift, rollBack };
}

/**
 * Two calm scroll flicks on the right hand (mouse-wheel index flicks) inside each 14s cycle.
 */
export function scrollFlickSignal(tSec: number): number {
  const cyc = ((tSec % 14.0) + 14.0) % 14.0;
  const flick1 = pulseAt(cyc, 8.35, 0.16);
  const flick2 = pulseAt(cyc, 9.25, 0.16);
  return Math.max(flick1, flick2);
}

/**
 * Gentle tap from his other (left) hand around 11.2s inside each 14s cycle.
 */
export function leftHandTapSignal(tSec: number): number {
  const cyc = ((tSec % 14.0) + 14.0) % 14.0;
  return pulseAt(cyc, 11.15, 0.20) + 0.35 * pulseAt(cyc, 11.58, 0.16);
}

/**
 * Natural human thumb-scrolling cadence on a smartphone (Reels / Shorts feed).
 * Produces varied organic swipe arcs (touch-down dip -> fast upward flick -> brief hover -> settle)
 * over a 16s loop with incommensurate intervals so it never looks robotic or static.
 */
export function phoneThumbScrollSignal(tSec: number): {
  swipe: number; // -0.35 (touchdown wind-up) .. +1.0 (upward flick peak)
  press: number; // 0..1 downward press toward glass
  reelIndex: number; // integer feed index incrementing on each flick
  reelSlide: number; // 0..1 smooth scroll progress within current flick
} {
  const period = 16.0;
  const cyc = ((tSec % period) + period) % period;
  const flickCenters = [0.95, 2.75, 5.25, 6.15, 8.65, 11.20, 13.75, 15.10];

  let swipe = 0;
  let press = 0;
  let reelIndex = Math.floor(tSec / period) * flickCenters.length;
  let reelSlide = 0;

  for (let i = 0; i < flickCenters.length; i++) {
    const c = flickCenters[i];
    const dt = cyc - c;
    // Slight thumb crouch/wind-up before pushing upward
    const windup = -0.36 * pulseAt(cyc, c - 0.19, 0.12);
    // Crisp upward flick sweep across the phone glass
    const upFlick = 1.05 * pulseAt(cyc, c + 0.04, 0.16);
    // Subtle relaxed return overshoot
    const settle = -0.10 * pulseAt(cyc, c + 0.32, 0.15);
    swipe += windup + upFlick + settle;

    // Thumb presses slightly down into the screen right during the flick contact phase
    press += pulseAt(cyc, c - 0.06, 0.15);

    if (dt >= 0.22) {
      reelIndex += 1;
    } else if (dt > -0.18) {
      reelSlide = smootherstep((dt + 0.18) / 0.40);
    }
  }

  // Gentle idle thumb hover micro-drift between swipes so the thumb is NEVER frozen
  const idleHover =
    Math.sin(tSec * 1.45 + 0.4) * 0.08 +
    smoothNoise1D(tSec * 0.95, 89) * 0.07;

  return {
    swipe: swipe + idleHover,
    press: clamp01(press),
    reelIndex,
    reelSlide,
  };
}

/**
 * Cold-blue smartphone screen brightness flicker (reacts to scrolling Reels & cut transitions).
 */
export function phoneScreenFlicker(tSec: number): number {
  const thumb = phoneThumbScrollSignal(tSec);
  const pulse =
    0.82 +
    0.16 * Math.sin(tSec * 5.7 + thumb.reelIndex * 1.9) +
    0.10 * smoothNoise1D(tSec * 3.1, 131) +
    0.18 * thumb.press;
  return Math.max(0.58, Math.min(1.22, pulse));
}

/**
 * Calm wandering attention gaze target (head turns first; torso/shoulders follow ~0.28s behind!).
 */
function attentionGazeAt(tSec: number): { yaw: number; pitch: number } {
  const yaw =
    Math.sin(tSec * 0.42 + 0.3) * 0.14 +
    smoothNoise1D(tSec * 0.31, 17) * 0.10;
  const pitch =
    Math.sin(tSec * 0.29 + 1.1) * 0.055 +
    smoothNoise1D(tSec * 0.24, 29) * 0.04;
  return { yaw, pitch };
}

/**
 * Evaluates all 54 bone rotations and root offset for the Base Person at time `tSec`.
 */
export function evaluateBasePersonPose(
  tSec: number,
  pose: PersonPoseMode = "tpose",
  shape: Partial<BodyShapeSettings> = {},
  lookUpOverride = 0, // 0..1 optional narrative cue (e.g. 02:53 Spark look-up in Bottomless4K!)
  handGripRelax = 0, // 0 = gripping phone firmly, 1 = fingers opened wide (catching / releasing phone!)
  doubleTapPulse = 0, // 0..1 crisp double-tap thumb dip on front OLED glass
  catchOut = 0, // 0 = normal standing reading grip, 1 = extended forward catching palm facing +Z
): BasePersonPoseState {
  const bones = createZeroRotations();
  const metrics = computeBodyMetrics(shape);

  // 1. Calm 4.0-second breath cycle (gentle inhale rise + relaxed exhale pause)
  const breathRaw = Math.sin((tSec * Math.PI * 2) / 4.0 - Math.PI / 2) * 0.5 + 0.5;
  const breath = smootherstep(breathRaw);

  // 2. Attention gaze & delayed follow-through (~0.28s behind his attention!)
  const gazeNow = attentionGazeAt(tSec);
  const gazeDelayed = attentionGazeAt(Math.max(0, tSec - 0.28));

  // 3. Shoulder roll (dip -> rise -> roll back -> settle)
  const shRoll = shoulderRollCurve(tSec);

  // 4. Two right-hand scroll flicks & left-hand gentle tap
  const flick = scrollFlickSignal(tSec);
  const leftTap = leftHandTapSignal(tSec);

  // 5. Independent slow limb drift (incommensurate frequencies so never static or mechanical)
  const driftLA = Math.sin(tSec * 0.53 + 0.4) * 0.028 + smoothNoise1D(tSec * 0.37, 41) * 0.018;
  const driftRA = Math.sin(tSec * 0.47 + 2.1) * 0.028 + smoothNoise1D(tSec * 0.33, 53) * 0.018;
  const driftLF = Math.sin(tSec * 0.61 + 1.3) * 0.032;
  const driftRF = Math.sin(tSec * 0.58 + 3.4) * 0.032;
  const swayX = Math.sin(tSec * 0.45) * 0.012 + smoothNoise1D(tSec * 0.25, 71) * 0.008;

  let rootOffset: Vec3Tuple = [swayX, breath * 0.009, 0];

  // =========================================================================
  // BASE POSE LAYER (matches Reference Image 1 poses accurately!)
  // =========================================================================
  if (pose === "tpose") {
    // Classic relaxed standing T/A-pose matching Reference Image 1 ("rest (ceiling light on, full colour)")
    // Arms extended cleanly outward at ~48 deg below horizontal with slightly softened elbows & open natural palms
    addRot(bones, "clavicleL", 0, 0, 0.05);
    addRot(bones, "clavicleR", 0, 0, -0.05);
    addRot(bones, "upperArmL", 0.02, 0.04, 0.72);
    addRot(bones, "upperArmR", 0.02, -0.04, -0.72);
    addRot(bones, "forearmL", -0.08, 0, 0.06);
    addRot(bones, "forearmR", -0.08, 0, -0.06);
    addRot(bones, "forearmTwistL", 0, -0.14, 0);
    addRot(bones, "forearmTwistR", 0, 0.14, 0);
    addRot(bones, "handL", 0.04, 0, 0.06);
    addRot(bones, "handR", 0.04, 0, -0.06);
    addRot(bones, "thighL", 0, 0.03, 0.025);
    addRot(bones, "thighR", 0, -0.03, -0.025);
    addRot(bones, "footL", 0, 0.08, 0);
    addRot(bones, "footR", 0, -0.08, 0);
  } else if (pose === "stand") {
    // Calm relaxed standing ("stand (ceiling light on, full colour)")
    addRot(bones, "upperArmL", 0.06, 0.08, 0.11);
    addRot(bones, "upperArmR", 0.06, -0.08, -0.11);
    addRot(bones, "forearmL", -0.18, 0, -0.04);
    addRot(bones, "forearmR", -0.18, 0, 0.04);
    addRot(bones, "handL", 0.06, 0.12, -0.05);
    addRot(bones, "handR", 0.06, -0.12, 0.05);
    addRot(bones, "thighL", -0.02, 0.04, 0.02);
    addRot(bones, "thighR", 0.02, -0.04, -0.02);
  } else if (pose === "walk") {
    const ph = tSec * 3.8;
    const stride = Math.sin(ph);
    rootOffset = [swayX, Math.abs(Math.cos(ph)) * 0.035, 0];
    addRot(bones, "pelvis", 0.04, -stride * 0.12, 0);
    addRot(bones, "spineUpper", 0.05, stride * 0.14, 0);
    addRot(bones, "thighL", stride * 0.48, 0, 0);
    addRot(bones, "shinL", Math.max(0, -stride) * 0.58 + 0.08, 0, 0);
    addRot(bones, "footL", -stride * 0.18, 0, 0);
    addRot(bones, "thighR", -stride * 0.48, 0, 0);
    addRot(bones, "shinR", Math.max(0, stride) * 0.58 + 0.08, 0, 0);
    addRot(bones, "footR", stride * 0.18, 0, 0);
    addRot(bones, "upperArmL", -stride * 0.36, 0, 0.14);
    addRot(bones, "forearmL", -0.25 - Math.max(0, stride) * 0.25, 0, 0);
    addRot(bones, "upperArmR", stride * 0.36, 0, -0.14);
    addRot(bones, "forearmR", -0.25 - Math.max(0, -stride) * 0.25, 0, 0);
  } else if (pose === "seated" || pose === "typing") {
    rootOffset = [0, -0.34 + breath * 0.007, 0];
    const typePulseL = pose === "typing" ? Math.sin(tSec * 9.5) * 0.05 : 0;
    const typePulseR = pose === "typing" ? Math.cos(tSec * 10.4) * 0.05 : 0;
    addRot(bones, "spineLower", 0.08, 0, 0);
    addRot(bones, "spineMid", 0.09, 0, 0);
    addRot(bones, "spineUpper", 0.08, 0, 0);
    addRot(bones, "neck", 0.14, 0, 0);
    addRot(bones, "head", 0.16, 0, 0);
    addRot(bones, "thighL", -1.48, 0.06, 0.04);
    addRot(bones, "shinL", 1.48, 0, 0);
    addRot(bones, "thighR", -1.48, -0.06, -0.04);
    addRot(bones, "shinR", 1.48, 0, 0);
    addRot(bones, "upperArmL", -0.68 + typePulseL, 0.18, 0.14);
    addRot(bones, "forearmL", -0.78 - typePulseL, 0, -0.16);
    addRot(bones, "forearmTwistL", 0, -0.45, 0);
    addRot(bones, "upperArmR", -0.68 + typePulseR, -0.18, -0.14);
    addRot(bones, "forearmR", -0.78 - typePulseR, 0, 0.16);
    addRot(bones, "forearmTwistR", 0, 0.45, 0);
  } else if (pose === "slumped") {
    rootOffset = [0, -0.34, 0];
    addRot(bones, "spineLower", 0.32, 0, 0);
    addRot(bones, "spineMid", 0.46, 0, 0);
    addRot(bones, "spineUpper", 0.48, 0, 0);
    addRot(bones, "neck", 0.34, 0, 0);
    addRot(bones, "head", 0.22, 0.32, -0.25);
    addRot(bones, "thighL", -1.48, 0.06, 0.04);
    addRot(bones, "shinL", 1.48, 0, 0);
    addRot(bones, "thighR", -1.48, -0.06, -0.04);
    addRot(bones, "shinR", 1.48, 0, 0);
    addRot(bones, "upperArmL", -1.25, 0.12, 0.22);
    addRot(bones, "forearmL", -0.45, 0, -0.25);
    addRot(bones, "upperArmR", -1.25, -0.12, -0.22);
    addRot(bones, "forearmR", -0.45, 0, 0.25);
  } else if (pose === "falling") {
    // Dynamic mid-air freefall pose: arms flung up overhead (~170 deg) into the rushing wind, bent flailing legs & arched torso!
    const wave = Math.sin(tSec * 2.6);
    const flutter = Math.cos(tSec * 4.1);
    addRot(bones, "spineLower", -0.16, wave * 0.08, 0.04);
    addRot(bones, "spineMid", -0.14, -wave * 0.06, -0.04);
    addRot(bones, "spineUpper", -0.12, 0, wave * 0.06);
    addRot(bones, "neck", 0.16, -0.06, 0.05);
    addRot(bones, "head", 0.18, -0.08, 0.06);
    // Clavicles lifted + upper arms raised ~170 deg overhead (0.28 + 2.66 = 2.94 rad ≈ 168-170 deg!)
    addRot(bones, "clavicleL", -0.08, -0.08, 0.28 + wave * 0.05);
    addRot(bones, "clavicleR", -0.08, 0.08, -0.28 - wave * 0.05);
    addRot(bones, "upperArmL", -0.22 + wave * 0.14, 0.14, 2.66 + flutter * 0.06);
    addRot(bones, "forearmL", -0.34 - flutter * 0.08, 0.08, -0.18);
    addRot(bones, "handL", -0.16, 0.10, -0.12);
    addRot(bones, "upperArmR", -0.18 - wave * 0.14, -0.14, -2.66 - flutter * 0.06);
    addRot(bones, "forearmR", -0.28 + flutter * 0.08, -0.08, 0.18);
    addRot(bones, "handR", -0.16, -0.10, 0.12);
    // Dynamic asymmetric bent freefall legs (one knee drawn up, one trailing back in the air!)
    addRot(bones, "thighL", 0.24 + wave * 0.14, 0.10, 0.18);
    addRot(bones, "shinL", 0.78 - wave * 0.12, 0, 0);
    addRot(bones, "footL", 0.42 + flutter * 0.08, 0, 0);
    addRot(bones, "thighR", -0.66 - wave * 0.14, -0.10, -0.16);
    addRot(bones, "shinR", 1.18 + wave * 0.12, 0, 0);
    addRot(bones, "footR", 0.36 - flutter * 0.08, 0, 0);
  } else if (pose === "lyingPhone") {
    // Lying relaxed on his back on the bed, head propped on the pillow looking into his glowing smartphone!
    // Right hand holds the phone above his chest with active thumb scrolling; left arm drapes naturally across his waist.
    // Every joint has subtle, incommensurate human micro-movement (breathing, gaze nods, shoulder shift, knee/ankle fidget)
    // so NOTHING ever feels static or robotic!
    const thumbScroll = phoneThumbScrollSignal(tSec);
    const chestBreath = Math.sin((tSec * Math.PI * 2) / 3.7 - Math.PI / 2) * 0.5 + 0.5;
    const chestSmooth = smootherstep(chestBreath);
    const torsoSettle = Math.sin(tSec * 0.43 + 0.8) * 0.032 + smoothNoise1D(tSec * 0.27, 63) * 0.022;
    const headInterestYaw = Math.sin(tSec * 0.58 + 0.2) * 0.065 + smoothNoise1D(tSec * 0.41, 97) * 0.045;
    const headInterestPitch =
      Math.sin(tSec * 0.72 + 1.4) * 0.048 +
      smoothNoise1D(tSec * 0.51, 109) * 0.032 +
      thumbScroll.press * 0.028;
    const kneeSwayL = Math.sin(tSec * 0.67 + 0.5) * 0.045 + smoothNoise1D(tSec * 0.35, 113) * 0.025;
    const ankleFidgetR = Math.sin(tSec * 1.18 + 0.9) * 0.095 + Math.sin(tSec * 0.49) * 0.055;
    const toeWiggleR = Math.sin(tSec * 1.85 + 0.2) * 0.10;
    const armBreathLift = chestSmooth * 0.038;
    const phoneTiltRoll = Math.sin(tSec * 0.52 + 1.7) * 0.045 - thumbScroll.swipe * 0.025;
    const phoneTiltPitch = Math.sin(tSec * 0.64 + 0.3) * 0.035 - thumbScroll.press * 0.032;

    // Subtle mattress sink/settle with breath (pelvis stays cleanly grounded on mattress!)
    rootOffset = [torsoSettle * 0.18, 0, chestSmooth * 0.006];

    // Propped gently up onto the pillow (+rx tilts +Y spine toward +Z -> UP off the mattress!)
    addRot(bones, "pelvis", 0.02, 0, torsoSettle * 0.45);
    addRot(bones, "spineLower", 0.06 + chestSmooth * 0.015, torsoSettle * 0.35, torsoSettle * 0.3);
    addRot(bones, "spineMid", 0.11 + chestSmooth * 0.028, torsoSettle * 0.25, -torsoSettle * 0.2);
    addRot(bones, "spineUpper", 0.15 + chestSmooth * 0.038, -torsoSettle * 0.2, 0);
    // Neck & head propped up on the cream pillow looking straight into his glowing phone
    addRot(bones, "neck", 0.26 - chestSmooth * 0.02 + headInterestPitch * 0.45, headInterestYaw * 0.45, 0);
    addRot(
      bones,
      "head",
      0.28 + headInterestPitch * 0.55 - lookUpOverride * 0.48,
      headInterestYaw * 0.55,
      -headInterestYaw * 0.22 + torsoSettle * 0.4,
    );

    // RIGHT ARM: Upper arm rests comfortably beside his ribs, elbow bent smoothly so the portrait smartphone
    // sits DEAD-UPRIGHT vertical (zero rightward tilt!) squarely in front of his eyes while his thumb glides cleanly over the glass!
    addRot(bones, "clavicleR", 0.05, 0.06, -0.04 - chestSmooth * 0.025);
    addRot(
      bones,
      "upperArmR",
      -0.48 - armBreathLift * 0.6,
      -0.24 + torsoSettle * 0.18,
      -0.24 - Math.sin(tSec * 0.55) * 0.016,
    );
    addRot(
      bones,
      "forearmR",
      -1.36 + armBreathLift * 0.45 + thumbScroll.swipe * 0.012,
      0.10,
      0.88,
    );
    // Ergonomic supination + level wrist alignment keeps the vertical portrait screen dead-straight!
    addRot(bones, "forearmTwistR", 0, 0.42 + phoneTiltRoll * 0.35, 0);
    addRot(
      bones,
      "handR",
      0.16 + phoneTiltPitch,
      -0.44 + phoneTiltRoll * 0.25,
      0.24 - thumbScroll.swipe * 0.022,
    );

    // LEFT ARM: Relaxed natural drape resting gently across his lower ribs/stomach (zero mid-air floating!),
    // rising & falling softly with every chest breath
    const leftFidget = Math.sin(tSec * 0.82 + 2.1) * 0.028;
    addRot(bones, "clavicleL", 0.02, -0.04, 0.04 + chestSmooth * 0.022);
    addRot(bones, "upperArmL", -0.05 - armBreathLift * 0.3, 0.04, 0.18 + leftFidget * 0.35);
    addRot(bones, "forearmL", -0.28 - chestSmooth * 0.03, -0.08, -0.84 - leftFidget * 0.3);
    addRot(bones, "forearmTwistL", 0, 1.12 + leftFidget * 0.4, 0);
    addRot(bones, "handL", -0.08 + chestSmooth * 0.03 + leftTap * 0.09, 0.04, -0.10);

    // LEFT LEG: Casually propped up with bent knee & foot planted comfortably on the teal duvet (classic bed-scrolling pose!)
    addRot(bones, "thighL", -0.72 + kneeSwayL * 0.35, 0.08 + kneeSwayL * 0.45, 0.09 + kneeSwayL);
    addRot(bones, "shinL", 1.40 - kneeSwayL * 0.25, 0, -kneeSwayL * 0.25);
    addRot(bones, "footL", -0.46 + Math.sin(tSec * 0.78) * 0.035, 0.05, 0);
    addRot(bones, "toesL", 0.06 + Math.sin(tSec * 1.25) * 0.045, 0, 0);

    // RIGHT LEG: Stretched out relaxed on the bed with subtle organic ankle sway & toe wiggles
    addRot(bones, "thighR", -0.14 + Math.sin(tSec * 0.41 + 1.1) * 0.025, -0.10, -0.09 - Math.sin(tSec * 0.38) * 0.02);
    addRot(bones, "shinR", 0.24 + Math.sin(tSec * 0.52 + 0.4) * 0.03, 0, 0);
    addRot(bones, "footR", 0.24 + ankleFidgetR, -0.12 + ankleFidgetR * 0.45, ankleFidgetR * 0.35);
    addRot(bones, "toesR", 0.05 + toeWiggleR, 0, 0);
  } else if (pose === "standingPhone") {
    // Standing naturally in the middle of the room (or colossal in the void!), holding his portrait smartphone
    // dead-upright in his REAL rigged right palm with his connected thumb continuously scrolling & double-tapping!
    const thumbScroll = phoneThumbScrollSignal(tSec);
    const relax = clamp01(handGripRelax);
    const chestBreath = Math.sin((tSec * Math.PI * 2) / 3.8 - Math.PI / 2) * 0.5 + 0.5;
    const chestSmooth = smootherstep(chestBreath);
    const microSway = Math.sin(tSec * 0.52) * 0.015;
    const headNudge = Math.sin(tSec * 0.78 + 0.5) * 0.025 + thumbScroll.press * 0.018;

    rootOffset = [microSway * 0.4, chestSmooth * 0.008, 0];

    // Natural upright torso & gentle head gaze down toward his glowing phone screen
    addRot(bones, "pelvis", 0.01, 0, microSway * 0.35);
    addRot(bones, "spineLower", 0.03 + chestSmooth * 0.012, 0, -microSway * 0.25);
    addRot(bones, "spineMid", 0.05 + chestSmooth * 0.018, 0, 0);
    addRot(bones, "spineUpper", 0.07 + chestSmooth * 0.022, -0.04, 0);
    addRot(bones, "neck", 0.16 + headNudge * 0.45 - lookUpOverride * 0.32, -0.04, 0);
    addRot(bones, "head", 0.18 + headNudge * 0.55 - lookUpOverride * 0.48, -0.06, 0);

    // RIGHT ARM: Smoothly interpolates between:
    // - catchOut = 1: Extended forward & slightly right catching the falling phone dead-upright facing +Z camera!
    //   (VERIFIED NORMAL = [0, 0.06, +0.9982], UP = [0, +0.9982, -0.06], POS = [-0.29242, 1.17857, +0.48447])
    // - catchOut = 0: Natural standing reading grip extended cleanly forward with elbow BELOW phone (0 chest & 0 forearm blockers!)
    //   (VERIFIED NORMAL = [0, 0.2201, -0.9755], UP = [0, 0.9755, 0.2201], POS = [-0.15577, 1.18178, +0.34478])
    const co = clamp01(catchOut);
    const lerpV = (a: number, b: number) => a + (b - a) * co;
    addRot(
      bones,
      "clavicleR",
      lerpV(0.04, 0.02),
      lerpV(0.05, -0.08),
      lerpV(-0.04 - chestSmooth * 0.018, -0.02 - chestSmooth * 0.01),
    );
    addRot(
      bones,
      "upperArmR",
      lerpV(-0.58 - chestSmooth * 0.015 + relax * 0.06, -1.18 + relax * 0.05),
      lerpV(-0.10, -0.10),
      lerpV(-0.14, -0.10),
    );
    addRot(
      bones,
      "forearmR",
      lerpV(-1.42 + chestSmooth * 0.014 + thumbScroll.swipe * 0.01 + relax * 0.1, -0.36 + relax * 0.06),
      lerpV(0.06, 0.04),
      lerpV(0.20, 0.14),
    );
    addRot(bones, "forearmTwistR", 0, lerpV(0, 1.66), 0);
    addRot(
      bones,
      "handR",
      lerpV(-1.1714 - relax * 0.12, 1.4902 - relax * 0.08),
      lerpV(0.0139, -0.3291),
      lerpV(0.6835 - thumbScroll.swipe * 0.018, -0.5501),
    );

    // LEFT ARM: Relaxed naturally at his side with subtle breath drift
    addRot(bones, "clavicleL", 0.01, -0.03, 0.04 + chestSmooth * 0.015);
    addRot(bones, "upperArmL", 0.08, 0.08, 0.14);
    addRot(bones, "forearmL", -0.22 - chestSmooth * 0.02, 0, -0.06);
    addRot(bones, "handL", 0.06, 0.10, -0.04);

    // GROUNDED STANDING LEGS
    addRot(bones, "thighL", -0.02 + microSway * 0.4, 0.04, 0.025);
    addRot(bones, "thighR", 0.02 - microSway * 0.4, -0.04, -0.025);
    addRot(bones, "shinL", 0.03, 0, 0);
    addRot(bones, "shinR", 0.03, 0, 0);
    addRot(bones, "footL", 0, 0.04, 0);
    addRot(bones, "footR", 0, -0.04, 0);
  } else if (pose === "scratchHead") {
    // Shot 48: Standing beside Ember, slightly tilted head, right hand raised gently scratching his red beanie!
    const scratchOsc = Math.sin(tSec * 9.5);
    const chestBreath = Math.sin((tSec * Math.PI * 2) / 3.8 - Math.PI / 2) * 0.5 + 0.5;
    const lookUpPitch = -lookUpOverride * 0.68;

    rootOffset = [0, chestBreath * 0.008, 0];
    addRot(bones, "spineLower", 0.02, 0.04, -0.03);
    addRot(bones, "spineMid", 0.03, 0.05, -0.03);
    addRot(bones, "spineUpper", 0.04, 0.06, -0.02);
    addRot(bones, "neck", 0.08 + lookUpPitch * 0.4, 0.06, -0.10 * (1 - lookUpOverride));
    addRot(bones, "head", 0.06 + lookUpPitch * 0.6 + scratchOsc * 0.025, 0.08, -0.14 * (1 - lookUpOverride));

    // RIGHT ARM: Raised up and bent at elbow so fingers touch & scratch the right side of his beanie!
    addRot(bones, "clavicleR", 0.08, -0.10, -0.26);
    addRot(bones, "upperArmR", -1.42, -0.35, -1.18 + scratchOsc * 0.04);
    addRot(bones, "forearmR", -2.05 + scratchOsc * 0.07, 0.25, 0.32);
    addRot(bones, "forearmTwistR", 0, -0.55, 0);
    addRot(bones, "handR", 0.22 + scratchOsc * 0.16, -0.15, 0.18);

    // LEFT ARM: Relaxed naturally down at his side
    addRot(bones, "clavicleL", 0.02, -0.04, 0.06);
    addRot(bones, "upperArmL", 0.08, 0.06, 0.16);
    addRot(bones, "forearmL", -0.28, 0, -0.08);
    addRot(bones, "handL", 0.06, 0.08, -0.05);

    // GROUNDED STANDING LEGS
    addRot(bones, "thighL", -0.03, 0.06, 0.03);
    addRot(bones, "thighR", 0.03, -0.06, -0.03);
    addRot(bones, "shinL", 0.04, 0, 0);
    addRot(bones, "shinR", 0.04, 0, 0);
    addRot(bones, "footL", 0, 0.06, 0);
    addRot(bones, "footR", 0, -0.06, 0);
  }

  // =========================================================================
  // CALM ALIVE OVERLAY (applied smoothly on T-pose / Stand / Seated / Typing)
  // =========================================================================
  if (pose !== "falling" && pose !== "lyingPhone" && pose !== "standingPhone" && pose !== "scratchHead") {
    const aliveScale = pose === "slumped" ? 0.35 : 1.0;

    // 4-second breath across the 3-part spine & subtle clavicle lift
    addRot(bones, "spineLower", -breath * 0.018 * aliveScale, gazeDelayed.yaw * 0.12, swayX * 0.8);
    addRot(bones, "spineMid", -breath * 0.026 * aliveScale, gazeDelayed.yaw * 0.20, 0);
    addRot(bones, "spineUpper", -breath * 0.032 * aliveScale, gazeDelayed.yaw * 0.28, -swayX * 0.5);

    // Attention gaze on neck & head + optional narrative look-up (e.g. 02:53 spark!)
    const lookUpPitch = -lookUpOverride * 0.62;
    addRot(bones, "neck", gazeNow.pitch * 0.45 + lookUpPitch * 0.4, gazeNow.yaw * 0.45, 0);
    addRot(bones, "head", gazeNow.pitch * 0.55 + lookUpPitch * 0.6, gazeNow.yaw * 0.55, -gazeNow.yaw * 0.08);

    // Shoulder roll (dip -> rise -> roll back -> settle) + breath lift + delayed follow-through
    const clavLift = (shRoll.lift * 0.12 + breath * 0.032) * aliveScale;
    const clavBack = shRoll.rollBack * 0.14 * aliveScale;
    addRot(bones, "clavicleL", clavBack * 0.4, -clavBack, clavLift);
    addRot(bones, "clavicleR", clavBack * 0.4, clavBack, -clavLift);

    // Independent slow limb drift (moment behind attention)
    addRot(bones, "upperArmL", driftLA * 0.85, gazeDelayed.yaw * 0.10, driftLA * 1.15);
    addRot(bones, "upperArmR", driftRA * 0.85, gazeDelayed.yaw * 0.10, -driftRA * 1.15);
    addRot(bones, "forearmL", -Math.abs(driftLF) * 0.9 - breath * 0.018, 0, driftLF * 0.5);
    addRot(bones, "forearmR", -Math.abs(driftRF) * 0.9 - breath * 0.018, 0, -driftRF * 0.5);

    // Forearm twist & wrist follow-through
    addRot(bones, "forearmTwistL", 0, driftLF * 0.95, 0);
    addRot(bones, "forearmTwistR", 0, -driftRF * 0.95 - flick * 0.14, 0);

    // Two right-hand scroll flicks (wrist micro-extension + index finger curl flick!)
    addRot(bones, "handR", -flick * 0.12 + driftRF * 0.4, 0, 0);

    // Left-hand gentle tap (wrist dip + relaxed finger tap!)
    addRot(bones, "handL", leftTap * 0.24 + driftLF * 0.4, 0, 0);

    // Subtle knee & ankle weight-shift micro-balance
    if (pose === "tpose" || pose === "stand") {
      addRot(bones, "thighL", swayX * 0.5, 0, -swayX * 0.6);
      addRot(bones, "thighR", -swayX * 0.5, 0, -swayX * 0.6);
      addRot(bones, "shinL", 0.03 + breath * 0.01, 0, 0);
      addRot(bones, "shinR", 0.03 + breath * 0.01, 0, 0);
      addRot(bones, "toesL", -0.02 + Math.sin(tSec * 0.4) * 0.015, 0, 0);
      addRot(bones, "toesR", -0.02 + Math.cos(tSec * 0.4) * 0.015, 0, 0);
    }
  }

  // =========================================================================
  // ALL 30 FINGER BONES (natural relaxed curl + right scroll flicks + left tap)
  // =========================================================================
  const fingerCurlBase = pose === "typing" ? 0.34 : pose === "tpose" ? 0.16 : 0.26;
  const fingerNames = ["thumb", "index", "middle", "ring", "pinky"] as const;
  if (pose === "lyingPhone" || pose === "standingPhone") {
    const thumbScroll = phoneThumbScrollSignal(tSec);
    const relax = pose === "standingPhone" ? clamp01(handGripRelax) : 0;
    const tap = pose === "standingPhone" ? clamp01(doubleTapPulse) : 0;
    // Left hand: relaxed slightly curled fingers
    for (let fi = 0; fi < fingerNames.length; fi++) {
      const fn = fingerNames[fi];
      const spread = (fi - 2) * 0.04;
      const ripple = Math.sin(tSec * 1.15 + fi * 0.85) * 0.05 + (fn === "index" ? leftTap * 0.2 : 0);
      const cL = 0.26 + fi * 0.04 + ripple;
      addRot(bones, `${fn}L1` as BoneName, -cL * 0.72, 0, spread);
      addRot(bones, `${fn}L2` as BoneName, -cL * 0.88, 0, 0);
      addRot(bones, `${fn}L3` as BoneName, -cL * 0.60, 0, 0);
    }

    // Right hand: 4 fingers wrap snugly around the back & left edge of the phone (smoothly opening wide as relax -> 1!)
    const gripFingers = ["index", "middle", "ring", "pinky"] as const;
    const gripScale = 1 - relax * 0.88;
    for (let gi = 0; gi < gripFingers.length; gi++) {
      const fn = gripFingers[gi];
      const microShift = Math.sin(tSec * 1.3 + gi * 1.1) * 0.02 + thumbScroll.press * 0.03;
      const grip = (0.72 + gi * 0.06 + microShift) * gripScale;
      addRot(bones, `${fn}R1` as BoneName, -grip * 0.42 + relax * 0.16, 0, -(gi - 1.5) * (0.025 + relax * 0.06));
      addRot(bones, `${fn}R2` as BoneName, -grip * 1.18, 0, 0);
      addRot(bones, `${fn}R3` as BoneName, -grip * 0.88, 0, 0);
    }

    // ACTIVE RIGHT THUMB SCROLLING + DOUBLE-TAPPING ARC right across the lower-right glass screen
    // (keeps the center Reel & "Time Limit Reached" modal 100% readable while reaching naturally for "Ignore Limit"!)
    const activeSwipe = thumbScroll.swipe * (1 - relax);
    const activePress = thumbScroll.press * (1 - relax);
    const isStandingPhone = pose === "standingPhone";
    addRot(
      bones,
      "thumbR1",
      ((isStandingPhone ? -0.26 : -0.46) - activePress * 0.14 - tap * 0.16) * (1 - relax * 0.7),
      ((isStandingPhone ? -0.38 : -0.28) - activePress * 0.08) * (1 - relax * 0.6),
      ((isStandingPhone ? 0.18 : 0.52) - activeSwipe * 0.36) * (1 - relax * 0.75) - relax * 0.35,
    );
    addRot(
      bones,
      "thumbR2",
      ((isStandingPhone ? 0.14 : 0.20) + activePress * 0.22 - activeSwipe * 0.18 + tap * 0.26) *
        (1 - relax * 0.8),
      0,
      -activeSwipe * 0.10,
    );
    addRot(
      bones,
      "thumbR3",
      ((isStandingPhone ? 0.10 : 0.14) + activePress * 0.14 - activeSwipe * 0.12 + tap * 0.20) *
        (1 - relax * 0.8),
      0,
      0,
    );
  } else {
    for (let fi = 0; fi < fingerNames.length; fi++) {
      const fn = fingerNames[fi];
      const spread = (fi - 2) * 0.045;
      // Left hand fingers (subtle independent ripple + left-hand tap!)
      const tapCurlL = fn === "index" || fn === "middle" ? leftTap * 0.42 : leftTap * 0.22;
      const waveL = Math.sin(tSec * 0.9 + fi * 0.7) * 0.04;
      const cL = fingerCurlBase + fi * 0.03 + waveL + tapCurlL;
      addRot(bones, `${fn}L1` as BoneName, cL * 0.75, 0, spread);
      addRot(bones, `${fn}L2` as BoneName, cL * 0.95, 0, 0);
      addRot(bones, `${fn}L3` as BoneName, cL * 0.65, 0, 0);

      // Right hand fingers (two distinct mouse scroll flicks on index finger!)
      const flickCurlR = fn === "index" ? flick * 0.68 : fn === "middle" ? flick * 0.18 : 0;
      const waveR = Math.sin(tSec * 0.85 + fi * 0.7 + 1.8) * 0.04;
      const cR = fingerCurlBase + fi * 0.03 + waveR + flickCurlR;
      addRot(bones, `${fn}R1` as BoneName, cR * 0.75, 0, -spread);
      addRot(bones, `${fn}R2` as BoneName, cR * 0.95, 0, 0);
      addRot(bones, `${fn}R3` as BoneName, cR * 0.65, 0, 0);
    }
  }

  return {
    boneCount: BONE_NAMES.length,
    rootOffset,
    breathPhase: breath,
    shoulderRollOffsetY: shRoll.lift,
    scrollFlickValue: flick,
    leftTapValue: leftTap,
    bones,
    metrics,
  };
}
