// Pure deterministic animation math & seeded PRNG (no Math.random, no stateful clocks)

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function remap(
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  const t = clamp01((v - inMin) / (inMax - inMin));
  return lerp(outMin, outMax, t);
}

export function smootherstep(t: number): number {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

export function easeInCubic(t: number): number {
  const x = clamp01(t);
  return x * x * x;
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOutBack(t: number, overshoot = 1.45): number {
  const x = clamp01(t);
  const c3 = overshoot + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + overshoot * Math.pow(x - 1, 2);
}

/**
 * 0 -> 1 damped spring settle with zero initial slope (from animation-principles skill).
 * Smoothly overshoots and settles without a jolt at u = 0.
 */
export function settleCurve(u: number, k = 6.5, w = 13.5): number {
  const x = Math.max(0, u);
  if (x === 0) return 0;
  if (x > 2.2) return 1;
  return 1 - Math.exp(-k * x) * (Math.cos(w * x) + (k / w) * Math.sin(w * x));
}

/**
 * Full grammar of a deliberate entrance: anticipation -> snap action -> overshoot -> settle.
 * Returns normalized 0..1+ value for t in [0, duration].
 */
export function entranceEnvelope(t: number, duration = 0.42): number {
  if (t <= 0) return 0;
  const u = t / duration;
  if (u >= 2.0) return 1;
  if (u < 0.16) {
    // Subtle anticipation dip
    const p = u / 0.16;
    return -0.07 * Math.sin(p * Math.PI);
  }
  return settleCurve((u - 0.16) / 0.84, 7.2, 12.5);
}

/**
 * Deterministic seeded PRNG (Mulberry32) so parallel frame renders are 100% reproducible.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic 1D value noise for subtle organic idle drift without Math.random().
 */
export function smoothNoise1D(x: number, seed = 17): number {
  const xi = Math.floor(x);
  const xf = x - xi;
  const hash = (n: number) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  };
  const u = xf * xf * (3 - 2 * xf);
  return lerp(hash(xi), hash(xi + 1), u) * 2 - 1;
}
