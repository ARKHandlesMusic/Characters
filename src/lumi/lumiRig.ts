// Pure deterministic spring-driven rig, bowtie secondary motion, and 16s showcase choreography for LUMI.
// 100% deterministic function of tSec — zero useFrame() or randomness side effects.

import * as THREE from "three";
import { clamp01, lerp, smootherstep, smoothNoise1D } from "../shared/animation";
import {
  type EmberFrameState,
  type EmberShapeId,
  doubleBlinkAt,
  evaluateMorphOverlay,
  grammarSnapCurve,
  solvePathSprings,
} from "../ember/emberPhysics";

export interface LumiFrameState extends EmberFrameState {
  /** Secondary spring tilt on Lumi's 3D ruby-red bowtie driven by vertical/horizontal acceleration */
  bowtieTilt: number;
  /** Flutter angle for the two ribbon tails below the bowtie knot */
  bowtieTailFlutter: number;
  /** Soft rose-pink halo glow intensity */
  roseGlow: number;
}

export interface LumiPoseOptions {
  position?: [number, number, number];
  tSec: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
  squash?: [number, number, number];
  glance?: [number, number];
  blink?: number;
  squint?: number;
  waveLeft?: number;
  waveRight?: number;
  shape?: EmberShapeId;
  roseGlow?: number;
}

/**
 * Helper to construct a clean, fully-populated LumiFrameState for custom scenes or poses.
 */
export function createLumiPoseState(opts: LumiPoseOptions): LumiFrameState {
  const pos = opts.position ?? [0, 0.35, 0];
  const blink = opts.blink ?? doubleBlinkAt(opts.tSec + 0.75);
  const squint = opts.squint ?? 0;
  const glance = opts.glance ?? [0, 0];
  const shape = opts.shape ?? "mochi";
  const breath = Math.sin(opts.tSec * 2.75) * 0.5 + 0.5;
  const tailFlutter = Math.sin(opts.tSec * 5.2) * 0.12 + Math.cos(opts.tSec * 3.1) * 0.05;

  return {
    position: new THREE.Vector3(pos[0], pos[1], pos[2]),
    velocity: new THREE.Vector3(0, 0, 0),
    speed: 0,
    headingYaw: opts.yaw ?? 0,
    leanPitch: opts.pitch ?? 0,
    leanRoll: opts.roll ?? 0,
    squashScale: opts.squash ?? [1, 1, 1],
    skirtTrail: [0, 0, 0],
    footRipplePhase: opts.tSec * 2.2,
    footRippleAmp: 0.72,
    breath,
    waveLeft: opts.waveLeft ?? 0,
    waveRight: opts.waveRight ?? 0,
    shapeFrom: shape,
    shapeTo: shape,
    morphBlend: 1,
    shapeActionPhase: opts.tSec,
    bulbLit: 0,
    trailWorld: [pos, pos, pos, pos, pos],
    smearStrength: 0,
    clipPlaneEnabled: false,
    clipPlanePoint: [0, 0, 0],
    clipPlaneNormal: [0, 0, 1],
    surfaceRippleTime: -1,
    surfaceRippleOrigin: [0, 0],
    flatDrawingOpacity: 0,
    flatDrawingPos: [0, 0],
    flatDrawingSquash: [1, 1],
    peelProgress: 0,
    peelRevealObject: 0,
    skinCoatMode: 0,
    wordReveal: 0,
    wordText: "",
    leftEye: {
      offset: [-0.21, 0.05, 0.55],
      stretchY: 1.0,
      stretchX: 1.0,
      blink,
      squint,
      glance,
    },
    rightEye: {
      offset: [0.21, 0.05, 0.55],
      stretchY: 1.0,
      stretchX: 1.0,
      blink,
      squint,
      glance,
    },
    glowIntensity: opts.roseGlow ?? 1.15,
    scaredGlow: 0,
    bowtieTilt: Math.sin(opts.tSec * 2.75 - 0.5) * 0.06,
    bowtieTailFlutter: tailFlutter,
    roseGlow: opts.roseGlow ?? 1.15,
  };
}

/**
 * Deterministic 16-second solo rig showcase path for Lumi:
 * - 0.0 -> 3.8s : Gentle dreamy hover at center, warm breathing, curious glance & double-blink
 * - 3.8 -> 6.8s : Playful side sway & enthusiastic wave (both arm nubs + bowtie tilt!)
 * - 6.8 -> 9.6s : Elastic squash-and-stretch bounce arc with springy bowtie lag
 * - 9.6 -> 13.4s: Curved smear zip left -> Heart morph -> curved zip right -> Star morph -> return to center
 * - 13.4 -> 16.0s: Settles back into mochi pink Lumi with happy warm squint (loops seamlessly!)
 */
function lumiShowcasePathAt(tSec: number): THREE.Vector3 {
  const t = ((tSec % 16.0) + 16.0) % 16.0;
  let x = Math.sin(t * 0.85) * 0.10;
  let y = 0.28 + Math.sin(t * 2.4) * 0.09;
  let z = 0.05 + Math.cos(t * 1.1) * 0.05;

  // 3.8 -> 6.8s: Cheerful wave sway
  if (t >= 3.8 && t < 6.8) {
    const u = (t - 3.8) / 3.0;
    const env = Math.sin(u * Math.PI);
    x += Math.sin(u * Math.PI * 2.0) * 0.24 * env;
    y += env * 0.14;
  }

  // 6.8 -> 9.6s: Wind-up anticipation dip -> joyful high elastic bounce -> soft landing!
  if (t >= 6.8 && t < 9.6) {
    const u = (t - 6.8) / 2.8;
    if (u < 0.18) {
      // Anticipation dip
      const d = smootherstep(u / 0.18);
      y -= d * 0.22;
    } else if (u < 0.72) {
      // Parabolic joyful bounce arc
      const b = (u - 0.18) / 0.54;
      y += Math.sin(b * Math.PI) * 1.05 - (1 - Math.sin(b * Math.PI)) * 0.12;
      x += Math.sin(b * Math.PI) * 0.22;
    } else {
      // Damped landing cushion
      const l = (u - 0.72) / 0.28;
      y -= Math.sin(l * Math.PI) * 0.14 * (1 - l);
    }
  }

  // 9.6 -> 13.8s: Two snappy curved smear dashes (left for Heart, right for Star, back to center)
  if (t >= 9.6 && t < 11.4) {
    const u = grammarSnapCurve(clamp01((t - 9.6) / 0.65));
    x = lerp(x, -1.22, u);
    y += Math.sin(clamp01((t - 9.6) / 0.65) * Math.PI) * 0.28;
    z += Math.sin(clamp01((t - 9.6) / 0.65) * Math.PI) * 0.20;
  } else if (t >= 11.4 && t < 13.3) {
    const u = grammarSnapCurve(clamp01((t - 11.4) / 0.72));
    x = lerp(-1.22, 1.18, u);
    y += Math.sin(clamp01((t - 11.4) / 0.72) * Math.PI) * 0.34;
    z -= Math.sin(clamp01((t - 11.4) / 0.72) * Math.PI) * 0.18;
  } else if (t >= 13.3 && t < 14.4) {
    const u = grammarSnapCurve(clamp01((t - 13.3) / 0.68));
    x = lerp(1.18, 0.0, u);
    y += Math.sin(clamp01((t - 13.3) / 0.68) * Math.PI) * 0.22;
  }

  return new THREE.Vector3(x, y, z);
}

/**
 * Evaluates Lumi's complete spring-driven rig state at time `tSec` for her 16-second solo showcase.
 */
export function lumiShowcaseStateAt(tSec: number, speed = 1.0): LumiFrameState {
  const t = ((tSec * speed) % 16.0 + 16.0) % 16.0;
  const spring = solvePathSprings(t, lumiShowcasePathAt);

  // Morph sequence: Mochi -> Beating Heart (10.0s) -> 5-Point Star (11.9s) -> Mochi (13.6s)
  let shapeFrom: EmberShapeId = "mochi";
  let shapeTo: EmberShapeId = "mochi";
  let morphBlend = 1;
  let shapeActionPhase = t;
  let morphOverlay = {
    morphBlend: 1,
    squashMult: [1, 1, 1] as [number, number, number],
    leftEye: {
      offset: [-0.21, 0.05, 0.55] as [number, number, number],
      stretchY: 1,
      stretchX: 1,
      blink: 0,
      squint: 0,
      glance: [0, 0] as [number, number],
    },
    rightEye: {
      offset: [0.21, 0.05, 0.55] as [number, number, number],
      stretchY: 1,
      stretchX: 1,
      blink: 0,
      squint: 0,
      glance: [0, 0] as [number, number],
    },
  };

  if (t >= 10.0 && t < 11.9) {
    shapeFrom = "mochi";
    shapeTo = "heart";
    morphOverlay = evaluateMorphOverlay(t, 10.0, "mochi", "heart");
    morphBlend = morphOverlay.morphBlend;
    shapeActionPhase = Math.max(0, t - 10.42);
  } else if (t >= 11.9 && t < 13.6) {
    shapeFrom = "heart";
    shapeTo = "star";
    morphOverlay = evaluateMorphOverlay(t, 11.9, "heart", "star");
    morphBlend = morphOverlay.morphBlend;
    shapeActionPhase = Math.max(0, t - 12.32);
  } else if (t >= 13.6 && t < 15.0) {
    shapeFrom = "star";
    shapeTo = "mochi";
    morphOverlay = evaluateMorphOverlay(t, 13.6, "star", "mochi");
    morphBlend = morphOverlay.morphBlend;
    shapeActionPhase = Math.max(0, t - 14.02);
  }

  // Cheerful waving between 4.1s and 6.5s
  const waveEnv =
    t >= 4.1 && t <= 6.5
      ? Math.sin(clamp01((t - 4.1) / 2.4) * Math.PI)
      : 0;
  const waveRight = waveEnv * (0.65 + 0.35 * Math.sin(t * 14.0));
  const waveLeft = waveEnv * 0.25 * (0.5 + 0.5 * Math.cos(t * 10.0));

  // Happy warm squint during wave peak & final settle
  const happySquint =
    waveEnv * 0.42 +
    (t >= 14.5 && t <= 15.7 ? Math.sin(clamp01((t - 14.5) / 1.2) * Math.PI) * 0.52 : 0);

  const blink = doubleBlinkAt(t + 0.8);
  const glanceX =
    smoothNoise1D(t * 0.72, 23) * 0.34 +
    THREE.MathUtils.clamp(spring.velocity.x * 0.14, -0.32, 0.32);
  const glanceY =
    smoothNoise1D(t * 0.65, 51) * 0.20 +
    THREE.MathUtils.clamp(spring.velocity.y * 0.12, -0.22, 0.22);

  const squashScale: [number, number, number] = [
    spring.squashScale[0] * morphOverlay.squashMult[0],
    spring.squashScale[1] * morphOverlay.squashMult[1],
    spring.squashScale[2] * morphOverlay.squashMult[2],
  ];

  // Secondary spring response on her ruby-red bowtie from vertical & horizontal velocity
  const bowtieTilt =
    THREE.MathUtils.clamp(-spring.velocity.x * 0.085, -0.32, 0.32) +
    Math.sin(t * 3.4) * 0.055;
  const bowtieTailFlutter =
    Math.sin(t * 6.4) * (0.14 + Math.min(0.28, spring.speed * 0.09)) +
    THREE.MathUtils.clamp(spring.velocity.y * 0.12, -0.25, 0.25);

  const roseGlow = 1.15 + Math.sin(t * 2.6) * 0.12 + (shapeTo === "heart" ? 0.28 * morphBlend : 0);

  return {
    position: spring.position,
    velocity: spring.velocity,
    speed: spring.speed,
    headingYaw: THREE.MathUtils.clamp(spring.velocity.x * 0.18, -0.45, 0.45),
    leanPitch: spring.leanPitch,
    leanRoll: spring.leanRoll,
    squashScale,
    skirtTrail: spring.skirtTrail,
    footRipplePhase: t * (2.2 + Math.min(3.0, spring.speed * 1.4)),
    footRippleAmp: 0.72 + Math.min(0.45, spring.speed * 0.16),
    breath: Math.sin(t * 2.8) * 0.5 + 0.5,
    waveLeft,
    waveRight,
    shapeFrom,
    shapeTo,
    morphBlend,
    shapeActionPhase,
    bulbLit: 0,
    trailWorld: spring.trailWorld,
    smearStrength: spring.smearStrength,
    clipPlaneEnabled: false,
    clipPlanePoint: [0, 0, 0],
    clipPlaneNormal: [0, 0, 1],
    surfaceRippleTime: -1,
    surfaceRippleOrigin: [0, 0],
    flatDrawingOpacity: 0,
    flatDrawingPos: [0, 0],
    flatDrawingSquash: [1, 1],
    peelProgress: 0,
    peelRevealObject: 0,
    skinCoatMode: 0,
    wordReveal: 0,
    wordText: "",
    leftEye: {
      ...morphOverlay.leftEye,
      blink: Math.max(blink, morphOverlay.leftEye.blink),
      squint: Math.max(happySquint, morphOverlay.leftEye.squint),
      glance: [glanceX, glanceY],
    },
    rightEye: {
      ...morphOverlay.rightEye,
      blink: Math.max(blink, morphOverlay.rightEye.blink),
      squint: Math.max(happySquint, morphOverlay.rightEye.squint),
      glance: [glanceX, glanceY],
    },
    glowIntensity: roseGlow,
    scaredGlow: 0,
    bowtieTilt,
    bowtieTailFlutter,
    roseGlow,
  };
}
