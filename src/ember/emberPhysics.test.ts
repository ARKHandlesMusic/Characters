import test from "node:test";
import assert from "node:assert/strict";
import {
  doubleBlinkAt,
  emberMusicVideoStateAt,
  emberShowcaseStateAt,
  evaluateMorphOverlay,
  grammarSnapCurve,
} from "./emberPhysics";

test("grammarSnapCurve winds up negatively before snapping across and settling at 1", () => {
  assert.equal(grammarSnapCurve(0), 0);
  assert.ok(grammarSnapCurve(0.12) < -0.08, "Expected wind-up pull-back before snap");
  assert.ok(grammarSnapCurve(0.45) > 0.75, "Expected most snap distance early in move");
  assert.equal(grammarSnapCurve(1), 1);
});

test("evaluateMorphOverlay squashes/squints first and staggers eyes 1 frame apart", () => {
  // During wind-up (0.12s after morph start): squashed vertically and squinting
  const wind = evaluateMorphOverlay(10.12, 10.0, "mochi", "star");
  assert.ok(wind.squashMult[1] < 0.85, "Expected squash down during morph anticipation");
  assert.ok(wind.leftEye.squint > 0.3, "Expected eyes squinting during morph anticipation");

  // During zip (0.25s after morph start): left eye leads right eye by 1 frame and stretches vertically
  const zip = evaluateMorphOverlay(10.25, 10.0, "mochi", "bulb");
  assert.ok(zip.leftEye.stretchY > 1.15, "Expected left eye to stretch during zip");
  assert.ok(
    zip.leftEye.stretchY > zip.rightEye.stretchY,
    "Expected left eye zip stretch to lead right eye by 1 frame",
  );
  assert.notEqual(
    zip.leftEye.offset[1],
    zip.rightEye.offset[1],
    "Expected right eye position to trail left eye by 1 frame",
  );

  // After settle (1.2s): morphBlend === 1
  const done = evaluateMorphOverlay(11.2, 10.0, "mochi", "star");
  assert.equal(done.morphBlend, 1);
});

test("doubleBlinkAt produces two crisp blinks per loop", () => {
  assert.ok(doubleBlinkAt(0.32) > 0.8, "Expected first blink peak");
  assert.equal(doubleBlinkAt(0.43), 0, "Expected open gap between double blinks");
  assert.ok(doubleBlinkAt(0.54) > 0.8, "Expected second blink peak");
  assert.equal(doubleBlinkAt(1.8), 0, "Expected eyes open during idle");
});

test("emberShowcaseStateAt produces finite states across 30s with wave at 8.6s, bounce at 10.3s, smears, peel, and dive", () => {
  for (let f = 0; f < 900; f += 3) {
    const t = f / 30;
    const st = emberShowcaseStateAt(t);
    assert.ok(Number.isFinite(st.position.x) && Number.isFinite(st.position.y) && Number.isFinite(st.position.z));
    assert.ok(st.squashScale.every((v) => Number.isFinite(v) && v > 0.3 && v < 2.5));
    assert.equal(st.trailWorld.length, 5);
  }

  // Wave at 8.6s
  const waveSt = emberShowcaseStateAt(8.6);
  assert.ok(waveSt.waveRight > 0.25, "Expected Ember waving around 8.6s");

  // Bounce around 10.55s (launched at 10.3s)
  const bounceSt = emberShowcaseStateAt(10.55);
  assert.ok(bounceSt.position.y > 0.65, "Expected Ember airborne on 10.3s bounce");

  // Smear activates during fast dash (11.42s)
  const dashSt = emberShowcaseStateAt(11.42);
  assert.ok(dashSt.smearStrength > 0.25, "Expected curved smear trail during fast dash");

  // Sleeve peel active on Rubber Duck around 22.3s
  const peelSt = emberShowcaseStateAt(22.3);
  assert.equal(peelSt.shapeTo, "duck");
  assert.ok(peelSt.peelProgress > 0.2 && peelSt.peelProgress < 0.95);

  // Translucent skin coat active around 24.8s
  const skinSt = emberShowcaseStateAt(24.8);
  assert.ok(skinSt.skinCoatMode > 0.8, "Expected translucent skin coat mode on camcorder");

  // Dive back into surface triggers flat drawing bounce at 27.6s
  const diveSt = emberShowcaseStateAt(27.6);
  assert.ok(diveSt.flatDrawingOpacity > 0.5, "Expected 2D flat drawing inside screen after dive");
});

test("emberMusicVideoStateAt produces finite states across entire 188s track", () => {
  for (let sec = 0; sec <= 188; sec += 2) {
    const st = emberMusicVideoStateAt(sec, 0.5);
    assert.ok(Number.isFinite(st.position.x) && Number.isFinite(st.position.y) && Number.isFinite(st.position.z));
    assert.ok(st.glowIntensity > 0.5);
  }
});
