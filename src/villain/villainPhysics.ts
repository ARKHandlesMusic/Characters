// Pure deterministic spring physics, radar antenna math, unzipping mouth, Rule-of-Three slapstick comedy,
// and silent duo choreography for the VILLAIN + EMBER.
// Follows all 8 rules:
// 1. SILENT (zero voices/captions/bubbles — pure eyes, posture, props, antennas)
// 2. RULE OF THREE (setup -> repeat -> break on third: Poke Test & Two Fake Oranges Before Real Duck)
// 3. OWN MOVIE (never acknowledges song, lyrics, or camera; man never notices until 02:53!)
// 4. STAY OUT OF FOCAL POINT in Bottomless4K; go quiet/mirror mood on 02:03-02:11 and 02:32
// 5. VILLAIN KEEPS ITS DIGNITY (never hurried, never embarrassed; straightens antennas & blinks slowly after disasters!)
// 6. REAL PROPS (duck, apple, croissant, alarm clock, camcorder, plant, cassette player, toy car)
// 7. EMBER'S ANIMATION GRAMMAR (wind-up -> snap -> overshoot -> settle + smear trail on dashes/lunges)
// 8. ONLY THE ANTENNA IS CARTOONY (damped sproing!)

import * as THREE from "three";
import { clamp01, easeOutCubic, lerp, smootherstep } from "../shared/animation";
import {
  type EmberFrameState,
  doubleBlinkAt,
  evaluateMorphOverlay,
  grammarSnapCurve,
  solvePathSprings,
} from "../ember/emberPhysics";

export interface VillainFrameState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  speed: number;
  headingYaw: number;
  leanPitch: number;
  leanRoll: number;
  squashScale: [number, number, number];
  breath: number;

  // Cartoony antennas: radar (<10m Ember lock / Croissant override), periscope, sproing, dignified straighten
  antennaDir: [number, number];
  antennaStretch: number; // 0 = normal, 1 = periscope
  antennaSproing: number; // damped spring boing (-1..1)
  antennaSpread: number;
  radarLocked: boolean;

  // Unzipping red outline seam mouth (0 = NO MOUTH until eating!)
  mouthUnzip: number;
  mouthChew: number;

  // Deadpan red eyes with pale glints & slow dignified blink
  blink: number;
  eyelidCalm: number;
  eyeGlance: [number, number];

  // Smear trail on fast lunges
  trailWorld: [number, number, number][];
  smearStrength: number;
  opacity: number;
}

export interface DuoPropsState {
  croissantPos: [number, number, number];
  croissantScale: number; // shrinks to 0 when gulped by Villain!
  apple1Pos: [number, number, number];
  apple1Tilt: number;
  apple1Scale: number; // shrinks into Villain's unzipped maw (Chomp Ledger #1)
  apple2Pos: [number, number, number];
  apple2Tilt: number;
  apple2Scale: number; // shrinks into Villain's unzipped maw (Chomp Ledger #2)
  duckPos: [number, number, number];
  duckBounce: number;
  alarmPos: [number, number, number];
  alarmShake: number;
  toyCarPos: [number, number, number];
  toyCarYaw: number;
  plantPos: [number, number, number];
  plantSway: number;
  cassettePos: [number, number, number];
  cassetteJolt: number;
  camcorderPos: [number, number, number];
}

export interface DuoShowcaseFrame {
  ember: EmberFrameState;
  villain: VillainFrameState;
  props: DuoPropsState;
  /** Silent deterministic chomp ledger: props the Villain ended up eating instead of Ember! */
  chompLedger: string[];
}

export interface BottomlessChompProp {
  kind: "orange" | "cassette" | "plant" | "croissant";
  position: [number, number, number];
  scale: number;
}

/**
 * Computes radar antenna direction toward a target within 10 metres.
 * Returns { dir: [x, z], locked: boolean }.
 */
export function computeAntennaRadar(
  villainPos: THREE.Vector3,
  targetPos: THREE.Vector3,
  villainYaw: number,
  radarRangeMeters = 10.0,
): { dir: [number, number]; locked: boolean } {
  const delta = targetPos.clone().sub(villainPos);
  const dist = delta.length();
  if (dist > radarRangeMeters || dist < 0.001) {
    return { dir: [0, 0], locked: false };
  }
  // Transform delta into Villain's local XZ frame
  const c = Math.cos(-villainYaw);
  const s = Math.sin(-villainYaw);
  const lx = delta.x * c - delta.z * s;
  const lz = delta.x * s + delta.z * c;
  const norm = Math.max(0.001, Math.hypot(lx, lz));
  return {
    dir: [THREE.MathUtils.clamp(lx / norm, -1, 1), THREE.MathUtils.clamp(lz / norm, -1, 1)],
    locked: true,
  };
}

/**
 * Cartoony damped antenna SPROING impulse (ONLY the antenna is cartoony!).
 * Fires at disasterTime, oscillates with crisp boing, then settles cleanly for dignified straightening.
 */
export function antennaSproingAt(tSec: number, disasterTimes: number[]): number {
  let sum = 0;
  for (const dt0 of disasterTimes) {
    const dt = tSec - dt0;
    if (dt >= 0 && dt < 1.35) {
      sum += Math.exp(-3.6 * dt) * Math.sin(24.0 * dt);
    }
  }
  return THREE.MathUtils.clamp(sum, -1.2, 1.2);
}

/**
 * Slow, unhurried, dignified blink (0..1) — fires calmly after every disaster once antennas straighten!
 */
export function slowDignifiedBlinkAt(tSec: number, dignityTimes: number[]): number {
  let b = 0;
  // Also a calm periodic slow blink every ~5.2s
  const phase = ((tSec % 5.2) + 5.2) % 5.2;
  if (phase > 4.65 && phase < 5.05) {
    b = Math.max(b, Math.sin(((phase - 4.65) / 0.4) * Math.PI));
  }
  for (const bt of dignityTimes) {
    const dt = tSec - bt;
    if (dt >= 0 && dt < 0.48) {
      // Deliberate, slow, completely unbothered blink
      b = Math.max(b, Math.pow(Math.sin((dt / 0.48) * Math.PI), 0.75));
    }
  }
  return clamp01(b);
}

/**
 * Unzipped seam mouth envelope (0 outside eating beats, unzips smoothly -> chews -> zips shut cleanly).
 */
export function mouthEatEnvelope(tSec: number, eatWindows: [number, number][]): { unzip: number; chew: number } {
  let unzip = 0;
  let chew = 0;
  for (const [start, end] of eatWindows) {
    if (tSec >= start && tSec <= end) {
      const dur = Math.max(0.1, end - start);
      const u = (tSec - start) / dur;
      const openIn = smootherstep(u / 0.22);
      const closeOut = 1 - smootherstep((u - 0.76) / 0.24);
      unzip = Math.max(unzip, openIn * closeOut);
      if (u > 0.22 && u < 0.76) {
        chew = Math.max(chew, 0.5 + 0.5 * Math.sin(((u - 0.22) / 0.54) * Math.PI * 4));
      }
    }
  }
  return { unzip: clamp01(unzip), chew: clamp01(chew) };
}

/**
 * 30-second 4K Silent Comedy Character Showcase ("EmberAndVillain4K"):
 * 0.0 - 5.0s   : Hero introduction — beach-ball black Villain glides in unhurriedly; radar antennas swing & lock onto Ember!
 * 5.0 - 11.5s  : RULE OF THREE #1 (The Poke Test): Pokes Cassette Player (#1) -> Pokes Potted Plant (#2) -> Pokes Alarm Clock (#3 -> rings & Toy Car zips underneath -> SPROING! -> straightens antennas & slow dignified blink!)
 * 11.5 - 18.5s : RULE OF THREE #2 (Two Fake Oranges Before the Real Duck): Unzips seam to chomp Orange Apple #1 -> Unzips to chomp Orange Apple #2 -> Lunges at #3 Real Rubber Duck -> bounces off! -> straightens antennas & slow dignified blink!
 * 18.5 - 25.0s : THE CROISSANT WEAKNESS: Corners Ember near Camcorder -> Croissant appears -> antennas IMMEDIATELY snap off Ember onto Croissant -> unhurried float -> unzips red seam wide -> gulps Croissant whole -> zips shut, straightens antennas & slow blink while Ember escapes!
 * 25.0 - 30.0s : Silent stand-off — Ember waves cheekily & smear-dashes off; Villain tracks with radar antennas, slow dignified blink, floats off calmly.
 */
export function duoShowcaseStateAt(tSec: number, speed = 1.0): DuoShowcaseFrame {
  const t = Math.max(0, tSec * speed);

  // ---- EMBER PATH (agile wind-up -> 5-frame snap dashes with smear trails!) ----
  const emberPath = (s: number): THREE.Vector3 => {
    // 0..5.0s: Bounces happily on left-center stage, waves at 3.2s
    if (s < 5.0) {
      const hop = s > 1.8 && s < 2.5 ? Math.sin(((s - 1.8) / 0.7) * Math.PI) * 0.75 : 0;
      return new THREE.Vector3(-1.35 + Math.sin(s * 1.3) * 0.14, 0.05 + hop, 0.35);
    }
    // 5.0..11.5s: Hides playfully behind props during Poke Test, pops out & zips right at 9.2s when Alarm Clock triggers!
    if (s < 9.1) {
      const u = grammarSnapCurve(clamp01((s - 5.0) / 0.65));
      return new THREE.Vector3(lerp(-1.35, -2.55, u), 0.05 + Math.sin(s * 2.5) * 0.08, lerp(0.35, -0.55, u));
    }
    if (s < 11.5) {
      const u = grammarSnapCurve(clamp01((s - 9.1) / 0.58));
      return new THREE.Vector3(lerp(-2.55, 2.15, u), 0.05 + Math.sin(clamp01(u) * Math.PI) * 0.65, lerp(-0.55, 0.45, u));
    }
    // 11.5..18.5s: Darts behind Fake Oranges & pops up behind the Real Duck!
    if (s < 16.0) {
      const u = grammarSnapCurve(clamp01((s - 11.5) / 0.65));
      return new THREE.Vector3(lerp(2.15, 0.45, u), 0.12 + Math.sin(s * 2.2) * 0.08, lerp(0.45, -0.35, u));
    }
    if (s < 18.5) {
      const u = grammarSnapCurve(clamp01((s - 16.0) / 0.55));
      return new THREE.Vector3(lerp(0.45, 2.35, u), 0.15 + Math.sin(clamp01(u) * Math.PI) * 0.52, lerp(-0.35, 0.38, u));
    }
    // 18.5..24.8s: Cornered near Camcorder on right, watches in quiet disbelief as Villain eats Croissant, then hops happily!
    if (s < 23.0) {
      return new THREE.Vector3(2.35 + Math.sin(s * 1.6) * 0.08, 0.15, 0.38);
    }
    if (s < 25.4) {
      const u = grammarSnapCurve(clamp01((s - 23.0) / 0.6));
      return new THREE.Vector3(lerp(2.35, -0.65, u), 0.12 + Math.sin(clamp01(u) * Math.PI) * 0.72, lerp(0.38, 0.65, u));
    }
    // 25.4..30.0s: Cheeky wave at 26.2s then zips smoothly off left with smear trail!
    if (s < 27.2) {
      return new THREE.Vector3(-0.65 + Math.sin(s * 1.8) * 0.08, 0.12, 0.65);
    }
    const u = grammarSnapCurve(clamp01((s - 27.2) / 0.85));
    return new THREE.Vector3(lerp(-0.65, -4.8, u), 0.12 + Math.sin(clamp01(u) * Math.PI) * 0.55, lerp(0.65, 0.15, u));
  };

  // ---- VILLAIN PATH (beach-ball scale, flies calmly, never hurried, composed lunges!) ----
  const villainPath = (s: number): THREE.Vector3 => {
    const hover = Math.sin(s * 1.65) * 0.09;
    // 0..5.0s: Framed cleanly inside stage right from frame 0, glides gently closer, locks radar onto Ember
    if (s < 5.0) {
      const u = smootherstep(s / 2.4);
      return new THREE.Vector3(lerp(1.72, 1.28, u), 0.72 + hover, lerp(-0.15, 0.25, u));
    }
    // 5.0..11.5s: RULE OF THREE — Poke Test!
    // Poke #1 (5.6..7.0s): Cassette Player at [-0.6, 0, -0.35]
    if (s < 7.1) {
      const u = smootherstep((s - 5.0) / 0.9);
      const poke1 = s > 6.1 && s < 6.75 ? Math.sin(((s - 6.1) / 0.65) * Math.PI) * 0.28 : 0;
      return new THREE.Vector3(lerp(1.35, -0.35, u), 0.76 + hover - poke1, lerp(0.25, -0.15, u));
    }
    // Poke #2 (7.1..8.7s): Potted Plant at [-1.75, 0, -0.45]
    if (s < 8.7) {
      const u = smootherstep((s - 7.1) / 0.7);
      const poke2 = s > 7.85 && s < 8.45 ? Math.sin(((s - 7.85) / 0.6) * Math.PI) * 0.26 : 0;
      return new THREE.Vector3(lerp(-0.35, -1.55, u), 0.82 + hover - poke2, lerp(-0.15, -0.25, u));
    }
    // Poke #3 (8.7..11.5s): Alarm Clock at [-2.4, 0, 0.25] -> triggers ringing + Toy Car whizzes underneath -> tiny dignified recoil!
    if (s < 11.5) {
      const u = smootherstep((s - 8.7) / 0.65);
      const recoil = s > 9.45 ? Math.exp(-(s - 9.45) * 4.5) * 0.34 : 0;
      return new THREE.Vector3(lerp(-1.55, -2.05, u) + recoil * 0.6, 0.78 + hover + recoil, lerp(-0.25, 0.32, u));
    }
    // 11.5..18.5s: RULE OF THREE — Two Fake Oranges Before Real Duck!
    // Chomp #1 (12.0..13.8s): Apple/Orange decoy #1 at [-0.95, 0, 0.55]
    if (s < 13.9) {
      const u = grammarSnapCurve(clamp01((s - 11.5) / 0.85));
      const dip = s > 12.4 && s < 13.4 ? Math.sin(((s - 12.4) / 1.0) * Math.PI) * 0.38 : 0;
      return new THREE.Vector3(lerp(-2.05, -0.95, u), 0.78 + hover - dip, lerp(0.32, 0.52, u));
    }
    // Chomp #2 (13.9..15.8s): Apple/Orange decoy #2 at [0.15, 0, 0.65]
    if (s < 15.9) {
      const u = grammarSnapCurve(clamp01((s - 13.9) / 0.8));
      const dip = s > 14.5 && s < 15.4 ? Math.sin(((s - 14.5) / 0.9) * Math.PI) * 0.38 : 0;
      return new THREE.Vector3(lerp(-0.95, 0.15, u), 0.78 + hover - dip, lerp(0.52, 0.62, u));
    }
    // #3 Real Duck (15.9..18.5s) at [1.15, 0, 0.52] -> lunges & bounces off Rubber Duck -> straightens antennas & slow blink!
    if (s < 18.5) {
      const u = grammarSnapCurve(clamp01((s - 15.9) / 0.72));
      const bounceBack = s > 16.75 ? Math.exp(-(s - 16.75) * 4.0) * 0.42 : 0;
      const dip = s > 16.25 && s < 16.85 ? Math.sin(((s - 16.25) / 0.6) * Math.PI) * 0.36 : 0;
      return new THREE.Vector3(lerp(0.15, 1.05, u) - bounceBack * 0.5, 0.78 + hover - dip + bounceBack, lerp(0.62, 0.52, u));
    }
    // 18.5..25.0s: THE CROISSANT WEAKNESS!
    // 18.5..20.2s: Approaches cornered Ember on right [1.75, 0.75, 0.42]
    if (s < 20.4) {
      const u = smootherstep((s - 18.5) / 1.1);
      return new THREE.Vector3(lerp(1.05, 1.55, u), 0.78 + hover, lerp(0.52, 0.42, u));
    }
    // 20.4..25.0s: Spots Croissant on left [-1.45, -0.2, 0.85] -> floats calmly straight over, unzips seam, gulps it!
    if (s < 25.0) {
      const u = smootherstep((s - 20.5) / 1.65);
      const gulpDip = s > 22.1 && s < 23.4 ? Math.sin(((s - 22.1) / 1.3) * Math.PI) * 0.46 : 0;
      return new THREE.Vector3(lerp(1.55, -1.45, u), 0.78 + hover - gulpDip, lerp(0.42, 0.82, u));
    }
    // 25.0..30.0s: Satisfied calm hover, watches Ember zip away, drifts out calmly right
    const u = smootherstep((s - 27.6) / 2.2);
    return new THREE.Vector3(lerp(-1.45, 0.85, u), 0.80 + hover, lerp(0.82, 0.25, u));
  };

  const eSprings = solvePathSprings(t, emberPath);
  const vSprings = solvePathSprings(t, villainPath);

  // ---- VILLAIN ANTENNAS: Radar (<10m), Periscope (Poke Test), Croissant Override, Cartoony Sproing! ----
  const croissantPosVec = new THREE.Vector3(-1.45, -0.22, 0.85);
  const croissantPresent = t >= 20.2 && t < 22.85;

  // Disaster beats where ONLY the antennas go cartoony SPROING!
  // 1) Alarm Clock + Toy Car disaster at 9.42s
  // 2) Fake Orange #1 clunk at 12.85s
  // 3) Fake Orange #2 clunk at 14.95s
  // 4) Real Rubber Duck bounce disaster at 16.72s
  const disasterTimes = [9.42, 12.85, 14.95, 16.72];
  // Calm slow dignified blinks right after straightening antennas following every disaster & after Croissant!
  const dignityBlinkTimes = [10.45, 13.55, 15.65, 17.65, 24.05, 28.4];

  const antennaSproing = antennaSproingAt(t, disasterTimes);

  // Periscope stretch during Poke Test (5.4..9.4s)
  const antennaStretch = smootherstep((t - 5.3) / 0.55) * (1 - smootherstep((t - 9.4) / 0.35));

  // Villain yaw smoothly faces its active interest (Croissant overrides Ember immediately!)
  const activeTarget = croissantPresent ? croissantPosVec : eSprings.position;
  const toTarget = activeTarget.clone().sub(vSprings.position);
  const desiredYaw = THREE.MathUtils.clamp(Math.atan2(toTarget.x, Math.max(1.2, toTarget.z + 2.4)) * 0.65, -0.78, 0.78);
  const villainYaw = desiredYaw;

  // Radar lock: swings strictly toward Ember (or Croissant when visible!) within 10 metres
  const radar = computeAntennaRadar(vSprings.position, activeTarget, villainYaw, 10.0);

  // Straighten antennas briskly after each disaster (reduces tilt briefly to upright dignified posture)
  let straightenMask = 0;
  for (const dt0 of [10.15, 17.35, 23.75]) {
    if (t >= dt0 && t < dt0 + 0.85) {
      straightenMask = Math.max(straightenMask, Math.sin(((t - dt0) / 0.85) * Math.PI));
    }
  }
  const antennaDir: [number, number] = [
    radar.dir[0] * (1 - straightenMask * 0.85),
    radar.dir[1] * (1 - straightenMask * 0.85),
  ];

  // Unzipping seam mouth windows: ONLY opens when eating!
  // (Apple #1: 12.35..13.35s, Apple #2: 14.45..15.35s, Duck lunge: 16.25..16.95s, Croissant gulp: 21.85..23.65s)
  const mouth = mouthEatEnvelope(t, [
    [12.35, 13.35],
    [14.45, 15.35],
    [16.25, 16.95],
    [21.85, 23.65],
  ]);

  const villainBlink = slowDignifiedBlinkAt(t, dignityBlinkTimes);

  const villain: VillainFrameState = {
    position: vSprings.position,
    velocity: vSprings.velocity,
    speed: vSprings.speed,
    headingYaw: villainYaw,
    leanPitch: vSprings.leanPitch * 0.65,
    leanRoll: vSprings.leanRoll * 0.65,
    squashScale: [
      lerp(1, vSprings.squashScale[0], 0.6),
      lerp(1, vSprings.squashScale[1], 0.6),
      lerp(1, vSprings.squashScale[2], 0.6),
    ],
    breath: Math.sin(t * 1.55) * 0.025,
    antennaDir,
    antennaStretch,
    antennaSproing,
    antennaSpread: Math.abs(antennaSproing) * 0.55 + mouth.unzip * 0.25,
    radarLocked: radar.locked,
    mouthUnzip: mouth.unzip,
    mouthChew: mouth.chew,
    blink: villainBlink,
    eyelidCalm: croissantPresent ? 0.04 : 0.20, // Eyes widen slightly at sight of Croissant!
    eyeGlance: [
      THREE.MathUtils.clamp(radar.dir[0] * 0.32, -0.32, 0.32),
      THREE.MathUtils.clamp((activeTarget.y - vSprings.position.y) * 0.14, -0.22, 0.22),
    ],
    trailWorld: vSprings.trailWorld.slice(0, 4),
    smearStrength: vSprings.smearStrength * 0.75,
    opacity: 1,
  };

  // ---- EMBER STATE (RUNNING GAGS: Object Disguises + Scared Glow when cornered, zero dialogue!) ----
  let shapeFrom: "mochi" | "bulb" | "duck" = "mochi";
  let shapeTo: "mochi" | "bulb" | "duck" = "mochi";
  let morphStart = -10;
  let bulbLit = 0;

  // Disguise #1 during Poke Test (5.2..9.0s): Ember hides disguised as a Light Bulb!
  if (t >= 5.2 && t < 9.0) {
    shapeFrom = "mochi";
    shapeTo = "bulb";
    morphStart = 5.2;
    bulbLit = 0.55;
  } else if (t >= 9.0 && t < 11.7) {
    shapeFrom = "bulb";
    shapeTo = "mochi";
    morphStart = 9.0;
  } else if (t >= 11.7 && t < 15.8) {
    // Disguise #2 during Fake Oranges (11.7..15.8s): Ember hides disguised as a Rubber Duck!
    shapeFrom = "mochi";
    shapeTo = "duck";
    morphStart = 11.7;
  } else if (t >= 15.8 && t < 18.0) {
    shapeFrom = "duck";
    shapeTo = "mochi";
    morphStart = 15.8;
  }

  const morph = evaluateMorphOverlay(t, morphStart, shapeFrom, shapeTo, 1.0);
  const wave1 = t >= 3.0 && t <= 4.3 ? Math.sin(clamp01((t - 3.0) / 1.3) * Math.PI) : 0;
  const wave2 = t >= 25.8 && t <= 27.1 ? Math.sin(clamp01((t - 25.8) / 1.3) * Math.PI) : 0;
  const waveAmt = Math.max(wave1, wave2);

  // RUNNING GAG: Ember glows brightly when scared!
  // Flares incandescent warm gold when Villain corners it at 18.6..20.5s (relieved instantly when Croissant arrives!)
  const scaredCorner =
    t >= 18.5 && t <= 20.9
      ? smootherstep((t - 18.5) / 0.55) * (1 - smootherstep((t - 20.2) / 0.55)) * 0.96
      : 0;
  const scaredClose =
    eSprings.position.distanceTo(vSprings.position) < 2.05 && mouth.unzip > 0.1 ? 0.55 : 0;
  const scaredGlow = Math.max(scaredCorner, scaredClose);

  const ember: EmberFrameState = {
    position: eSprings.position,
    velocity: eSprings.velocity,
    speed: eSprings.speed,
    headingYaw: THREE.MathUtils.clamp(
      Math.atan2(vSprings.position.x - eSprings.position.x, 3.0) * 0.45,
      -0.6,
      0.6,
    ),
    leanPitch: eSprings.leanPitch,
    leanRoll: eSprings.leanRoll,
    squashScale: [
      eSprings.squashScale[0] * morph.squashMult[0],
      eSprings.squashScale[1] * morph.squashMult[1],
      eSprings.squashScale[2] * morph.squashMult[2],
    ],
    skirtTrail: eSprings.skirtTrail,
    footRipplePhase: t * 5.4 + eSprings.speed * 1.4,
    footRippleAmp: 0.048 + Math.min(0.08, eSprings.speed * 0.015),
    breath: Math.sin(t * 2.2) * 0.045,
    waveLeft: Math.sin(t * 2.0) * 0.12,
    waveRight: waveAmt * (0.65 + 0.35 * Math.sin(t * 16.0)),
    shapeFrom,
    shapeTo,
    morphBlend: morph.morphBlend,
    shapeActionPhase: morph.actionTime,
    bulbLit,
    trailWorld: eSprings.trailWorld,
    smearStrength: eSprings.smearStrength,
    clipPlaneEnabled: false,
    clipPlanePoint: [0, 0, -4],
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
    wordText: "ANYTHING",
    leftEye: {
      ...morph.leftEye,
      stretchY: morph.leftEye.stretchY * (1 + scaredGlow * 0.22),
      blink: Math.max(morph.leftEye.blink, doubleBlinkAt(t, 0.2)),
    },
    rightEye: {
      ...morph.rightEye,
      stretchY: morph.rightEye.stretchY * (1 + scaredGlow * 0.22),
      blink: Math.max(morph.rightEye.blink, doubleBlinkAt(t, 0.2)),
    },
    glowIntensity: 1.0 + bulbLit * 0.55 + scaredGlow * 1.85,
    scaredGlow,
  };

  // ---- ALL 8 REAL PROPS STATE + CHOMP LEDGER ----
  // Fake Orange #1 & #2 visibly shrink into Villain's unzipped maw; Real Duck bounces out unscathed!
  const apple1Scale = 1 - smootherstep((t - 12.82) / 0.28);
  const apple2Scale = 1 - smootherstep((t - 14.92) / 0.28);
  // Croissant enters smoothly at 20.1s and gets gulped whole at 22.85s!
  const croissantEnter = smootherstep((t - 20.0) / 0.45);
  const croissantEaten = 1 - smootherstep((t - 22.65) / 0.25);
  const croissantScale = croissantEnter * croissantEaten;

  const chompLedger: string[] = [];
  if (t >= 12.95) chompLedger.push("fake-orange-1");
  if (t >= 15.05) chompLedger.push("fake-orange-2");
  if (t >= 22.75) chompLedger.push("croissant");

  // Toy car zooms across stage right when Alarm Clock triggers at 9.35s!
  const carU = clamp01((t - 9.35) / 1.45);
  const toyCarX = t < 9.35 ? -3.15 : lerp(-3.15, 3.65, easeOutCubic(carU));

  const props: DuoPropsState = {
    croissantPos: [-1.45, -0.34, 0.85],
    croissantScale,
    apple1Pos: [-0.95, -0.35, 0.55],
    apple1Tilt: t > 12.6 && t < 13.2 ? Math.sin((t - 12.6) * 18) * 0.28 : 0,
    apple1Scale,
    apple2Pos: [0.15, -0.35, 0.65],
    apple2Tilt: t > 14.7 && t < 15.3 ? Math.sin((t - 14.7) * 18) * 0.28 : 0,
    apple2Scale,
    duckPos: [1.15, -0.28, 0.52],
    duckBounce: t > 16.68 && t < 17.6 ? Math.abs(Math.sin((t - 16.68) * 12)) * 0.22 * Math.exp(-(t - 16.68) * 2.5) : 0,
    alarmPos: [-2.4, -0.30, 0.25],
    alarmShake: t > 9.32 && t < 10.6 ? Math.sin((t - 9.32) * 42) * 0.24 * Math.exp(-(t - 9.32) * 1.8) : 0,
    toyCarPos: [toyCarX, -0.44, 0.42],
    toyCarYaw: 0,
    plantPos: [-1.75, -0.36, -0.45],
    plantSway: t > 8.05 && t < 9.1 ? Math.sin((t - 8.05) * 14) * 0.22 * Math.exp(-(t - 8.05) * 2.5) : 0,
    cassettePos: [-0.6, -0.42, -0.35],
    cassetteJolt: t > 6.3 && t < 7.0 ? Math.exp(-(t - 6.3) * 6) * 0.1 : 0,
    camcorderPos: [2.65, -0.26, 0.12],
  };

  return { ember, villain, props, chompLedger };
}

/**
 * Full 188-second Villain Choreography inside the 4K "Bottomless" Music Video!
 * Strictly enforces:
 * - Lives in its own silent movie (corners, backgrounds, gaps between lyrics; never blocks focal point!)
 * - Radar antennas swing toward Ember whenever within 10 metres!
 * - Goes quiet & mirrors the mood on emotional beats: 02:03-02:11 (123-131s) and 02:32 (150-158s)!
 * - Glides calmly overhead at 02:53 (173s) right as the man finally looks up!
 */
export function villainMusicVideoStateAt(tSec: number, emberPos: THREE.Vector3): VillainFrameState {
  const pathAt = (s: number): THREE.Vector3 => {
    const hover = Math.sin(s * 1.45) * 0.12;
    // Act 0 & 1 (0..40.86s): Peripheral right-rear corner of midnight bedroom, floating unhurriedly behind blinds/headlines
    if (s < 40.86) {
      const driftX = 3.25 + Math.sin(s * 0.35) * 0.65;
      const driftY = 1.65 + hover + Math.cos(s * 0.45) * 0.25;
      return new THREE.Vector3(driftX, driftY, -1.85 + Math.sin(s * 0.25) * 0.5);
    }
    // Act 2 (40.86..66.86s): Follows silently in outer perimeter of Bottomless Shaft
    if (s < 66.86) {
      const ls = s - 40.86;
      return new THREE.Vector3(Math.cos(ls * 0.65) * 3.1, 3.8 - ls * 0.52 + hover, Math.sin(ls * 0.65) * 2.8 - 1.2);
    }
    // Act 3 (66.86..94.72s): Peeks with periscope antennas between outer desert server racks
    if (s < 94.72) {
      const ls = s - 66.86;
      return new THREE.Vector3(-3.4 + Math.sin(ls * 0.42) * 0.9, 2.0 + hover, 1.5 - ls * 0.15);
    }
    // Act 4 (94.72..123.07s): Orbits wide outer periphery of Predictive Loom
    if (s < 123.07) {
      const ls = s - 94.72;
      return new THREE.Vector3(-Math.cos(ls * 0.62) * 3.2, 2.8 - ls * 0.42 + hover, -Math.sin(ls * 0.62) * 2.9);
    }
    // Act 5 Bridge (123.07..149.20s):
    // 02:03 - 02:11 (123.07..131.15s) EMOTIONAL BEAT — goes completely quiet, still, peripheral!
    if (s < 131.15) {
      return new THREE.Vector3(-3.45, 1.15 + Math.sin(s * 0.6) * 0.03, 0.85);
    }
    if (s < 149.2) {
      const ls = s - 131.15;
      return new THREE.Vector3(-3.1 + Math.sin(ls * 0.7) * 0.6, 1.8 + hover, -0.9);
    }
    // Act 6 Finale (149.20..188.0s):
    // 02:32 (149.2..158.0s) EMOTIONAL FLOOR BEAT — rests quietly off to the right periphery, mirroring the stillness!
    if (s < 158.5) {
      return new THREE.Vector3(3.35, 1.45 + Math.sin(s * 0.55) * 0.04, 0.25);
    }
    // 02:51 - 02:54 (171.0..174.4s): Swoops close behind Ember right above the man on terrace ->
    // triggers Ember's blazing 02:53 scared SPARK glow! Then spots an irresistible Croissant drifting past at 174.4s!
    if (s < 174.4) {
      const u = smootherstep((s - 170.8) / 1.5);
      return new THREE.Vector3(lerp(3.35, 0.15, u), lerp(1.45, 3.35, u) + hover, lerp(0.25, 0.15, u));
    }
    const soar = smootherstep((s - 174.4) / 9.5);
    return new THREE.Vector3(lerp(0.15, -2.45, soar), lerp(3.35, 5.8, soar) + hover, lerp(0.15, -3.8, soar));
  };

  const springs = solvePathSprings(tSec, pathAt);
  const isQuietEmotionalBeat =
    (tSec >= 123.0 && tSec <= 131.2) || (tSec >= 150.0 && tSec <= 158.5);

  // Irresistible Croissant overrides radar in Act 4 (107.6..110.2s) and right after 02:53 spark (174.0..176.8s)!
  const croissantAt108 = tSec >= 107.6 && tSec <= 110.4;
  const croissantAt174 = tSec >= 174.0 && tSec <= 176.8;
  const croissantTarget = croissantAt108
    ? new THREE.Vector3(springs.position.x - 1.1, springs.position.y - 0.3, springs.position.z + 0.5)
    : croissantAt174
      ? new THREE.Vector3(springs.position.x - 1.25, springs.position.y - 0.2, springs.position.z + 0.45)
      : null;

  const activeTarget = croissantTarget ?? emberPos;
  const toTarget = activeTarget.clone().sub(springs.position);
  const yaw = THREE.MathUtils.clamp(Math.atan2(toTarget.x, Math.max(1.2, toTarget.z + 2.5)) * 0.55, -0.75, 0.75);
  const radar = computeAntennaRadar(springs.position, activeTarget, yaw, 10.0);

  // CHOMP LEDGER + 02:53 SCARE:
  // 24.6..26.2s Fake Orange | 53.5..55.2s Cassette | 79.0..80.8s Potted Plant |
  // 108.0..110.2s Croissant #1 | 172.2..173.6s Brief scary unzip above man -> 02:53 SPARK! | 174.4..176.6s Croissant #2!
  const mouth = isQuietEmotionalBeat
    ? { unzip: 0, chew: 0 }
    : mouthEatEnvelope(tSec, [
        [24.6, 26.2],
        [53.5, 55.2],
        [79.0, 80.8],
        [108.0, 110.2],
        [172.3, 173.6],
        [174.4, 176.6],
      ]);

  const sproing = isQuietEmotionalBeat ? 0 : antennaSproingAt(tSec, [27.0, 56.0, 81.5, 138.0]);
  const periscope = !isQuietEmotionalBeat && tSec >= 68.0 && tSec <= 78.0 ? 0.75 : 0;

  return {
    position: springs.position,
    velocity: springs.velocity,
    speed: springs.speed,
    headingYaw: yaw,
    leanPitch: isQuietEmotionalBeat ? 0 : springs.leanPitch * 0.5,
    leanRoll: isQuietEmotionalBeat ? 0 : springs.leanRoll * 0.5,
    squashScale: [1, 1, 1],
    breath: Math.sin(tSec * 1.4) * 0.02,
    antennaDir: isQuietEmotionalBeat ? [0, 0] : radar.dir,
    antennaStretch: periscope,
    antennaSproing: sproing,
    antennaSpread: Math.abs(sproing) * 0.4 + mouth.unzip * 0.2,
    radarLocked: !isQuietEmotionalBeat && radar.locked,
    mouthUnzip: mouth.unzip,
    mouthChew: mouth.chew,
    blink: slowDignifiedBlinkAt(tSec, [27.8, 56.8, 82.4, 111.0, 126.5, 154.0, 177.2]),
    eyelidCalm: croissantTarget ? 0.04 : isQuietEmotionalBeat ? 0.30 : 0.18,
    eyeGlance: isQuietEmotionalBeat ? [0, -0.06] : [radar.dir[0] * 0.25, 0],
    trailWorld: springs.trailWorld.slice(0, 4),
    smearStrength: isQuietEmotionalBeat ? 0 : springs.smearStrength * 0.5,
    opacity: 1,
  };
}

/**
 * Computes the active peripheral prop for the Villain's silent Chomp Ledger & Croissant running gag
 * inside Bottomless4K (strictly off-center so lyrics & focal phone stay unobstructed!).
 */
export function bottomlessChompPropsAt(
  tSec: number,
  villainPos: THREE.Vector3,
): { activeProp: BottomlessChompProp | null; chompLedger: string[] } {
  const chompLedger: string[] = [];
  if (tSec >= 25.6) chompLedger.push("fake-orange");
  if (tSec >= 54.6) chompLedger.push("cassette-player");
  if (tSec >= 80.2) chompLedger.push("potted-plant");
  if (tSec >= 109.6) chompLedger.push("croissant-1");
  if (tSec >= 176.0) chompLedger.push("croissant-2");

  const windows: { kind: BottomlessChompProp["kind"]; start: number; gulp: number; end: number; offset: [number, number, number] }[] = [
    { kind: "orange", start: 23.0, gulp: 25.4, end: 26.2, offset: [0.35, -0.62, 0.45] },
    { kind: "cassette", start: 52.0, gulp: 54.4, end: 55.2, offset: [-0.35, -0.60, 0.45] },
    { kind: "plant", start: 77.5, gulp: 80.0, end: 80.8, offset: [0.32, -0.65, 0.45] },
    { kind: "croissant", start: 107.2, gulp: 109.4, end: 110.2, offset: [-0.45, -0.52, 0.48] },
    { kind: "croissant", start: 173.8, gulp: 175.8, end: 176.6, offset: [-0.52, -0.45, 0.48] },
  ];

  for (const w of windows) {
    if (tSec >= w.start && tSec <= w.end) {
      const enter = smootherstep((tSec - w.start) / 0.45);
      const eaten = 1 - smootherstep((tSec - w.gulp) / 0.35);
      const sc = enter * eaten * 0.72;
      if (sc > 0.02) {
        return {
          activeProp: {
            kind: w.kind,
            position: [
              villainPos.x + w.offset[0],
              villainPos.y + w.offset[1],
              villainPos.z + w.offset[2],
            ],
            scale: sc,
          },
          chompLedger,
        };
      }
    }
  }

  return { activeProp: null, chompLedger };
}

/**
 * Deterministic 16-second solo rig showcase path for the Villain:
 * - 0.0 -> 3.5s : Dignified hover at center, slow breath, calm radar sweep
 * - 3.5 -> 6.5s : Periscope antenna stretch tall + deadpan gaze scan + slow blink
 * - 6.5 -> 9.4s : Snappy lunge dash left -> dark-crimson smear -> cartoony antenna SPROING -> straighten & blink
 * - 9.4 -> 13.0s: Returns center, unzips red outline seam mouth wide + chomp/chew -> seals seamlessly
 * - 13.0 -> 16.0s: Settles back into dignified hero hover (loops seamlessly)
 */
function villainSoloPathAt(tSec: number): THREE.Vector3 {
  const t = ((tSec % 16.0) + 16.0) % 16.0;
  let x = Math.sin(t * 0.55) * 0.08;
  let y = 0.24 + Math.sin(t * 1.65) * 0.06;
  let z = 0.0;

  if (t >= 6.5 && t < 9.4) {
    const dashOut = grammarSnapCurve(clamp01((t - 6.5) / 0.55));
    const dashBack = smootherstep(clamp01((t - 8.15) / 1.15));
    x = lerp(0, -1.25, dashOut) * (1 - dashBack);
    z = Math.sin(clamp01((t - 6.5) / 0.55) * Math.PI) * 0.35;
    y += Math.sin(clamp01((t - 6.5) / 0.55) * Math.PI) * 0.14;
  } else if (t >= 9.6 && t < 12.6) {
    const u = (t - 9.6) / 3.0;
    const chompEnv = Math.sin(u * Math.PI);
    z += chompEnv * 0.32;
    y -= chompEnv * 0.08;
  }

  return new THREE.Vector3(x, y, z);
}

/**
 * Evaluates Villain's complete solo rig showcase state across 16 seconds.
 */
export function villainShowcaseStateAt(tSec: number, speed = 1.0): VillainFrameState {
  const t = ((tSec * speed) % 16.0 + 16.0) % 16.0;
  const springs = solvePathSprings(t, villainSoloPathAt);
  const headingYaw = THREE.MathUtils.clamp(springs.velocity.x * 0.16, -0.38, 0.38);

  // Virtual moving radar target so antennas actively sweep & lock during the showcase
  const virtualTarget = new THREE.Vector3(
    Math.sin(t * 0.95) * 3.8,
    0.35,
    Math.cos(t * 0.72) * 2.2 + 1.5,
  );
  const radar = computeAntennaRadar(springs.position, virtualTarget, headingYaw, 10.0);

  // Periscope tall stretch between 3.6s and 6.2s
  const periscopeEnv =
    t >= 3.6 && t <= 6.2
      ? Math.sin(clamp01((t - 3.6) / 2.6) * Math.PI)
      : 0;
  const antennaStretch = smootherstep(periscopeEnv) * 0.92;

  // Cartoony antenna SPROING right after the 6.5s lunge snap (7.12s) + dignified straighten!
  const antennaSproing = antennaSproingAt(t, [7.12]);

  // Unzipping red outline seam mouth between 10.1s and 12.2s (strictly 0 outside eating window!)
  const mouth = mouthEatEnvelope(t, [[10.1, 12.2]]);

  // Slow dignified blinks at 4.8s, 7.85s (right after antenna sproing!), and 13.6s
  const blink = slowDignifiedBlinkAt(t, [4.8, 7.85, 13.6]);

  const antennaSpread =
    0.26 + Math.abs(antennaSproing) * 0.36 + mouth.unzip * 0.14;

  return {
    position: springs.position,
    velocity: springs.velocity,
    speed: springs.speed,
    headingYaw,
    leanPitch: springs.leanPitch * 0.5 + mouth.unzip * 0.10,
    leanRoll: springs.leanRoll * 0.5,
    squashScale: [
      springs.squashScale[0] * (1 + mouth.unzip * 0.05),
      springs.squashScale[1] * (1 - mouth.unzip * 0.04),
      springs.squashScale[2],
    ],
    breath: Math.sin(t * 1.9) * 0.5 + 0.5,
    antennaDir: [radar.dir[0] * 0.85, radar.dir[1] * 0.55],
    antennaStretch,
    antennaSproing,
    antennaSpread,
    radarLocked: radar.locked,
    mouthUnzip: mouth.unzip,
    mouthChew: mouth.chew,
    blink,
    eyelidCalm: mouth.unzip > 0.2 ? 0.05 : 0.18,
    eyeGlance: [radar.dir[0] * 0.34, periscopeEnv * 0.18],
    trailWorld: springs.trailWorld.slice(0, 4),
    smearStrength: springs.smearStrength * 0.85,
    opacity: 1,
  };
}

