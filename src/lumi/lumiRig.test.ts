import test from "node:test";
import assert from "node:assert/strict";
import { createLumiPoseState, lumiShowcaseStateAt } from "./lumiRig";

test("createLumiPoseState constructs finite rose-glowing Lumi state with bowtie flutter", () => {
  const st = createLumiPoseState({ position: [0.5, 0.4, -0.2], tSec: 2.0, waveRight: 0.8 });
  assert.equal(st.position.x, 0.5);
  assert.equal(st.waveRight, 0.8);
  assert.ok(Number.isFinite(st.bowtieTilt));
  assert.ok(Number.isFinite(st.bowtieTailFlutter));
  assert.ok(st.roseGlow > 0.8);
});

test("lumiShowcaseStateAt runs wave, elastic bounce, smear dashes, heart/star morphs, and settles cleanly across 16s", () => {
  let maxWave = 0;
  let maxBounceY = -Infinity;
  let maxSmear = 0;
  let sawHeart = false;
  let sawStar = false;

  for (let f = 0; f <= 480; f += 3) {
    const t = f / 30;
    const st = lumiShowcaseStateAt(t, 1.0);
    assert.ok(Number.isFinite(st.position.x) && Number.isFinite(st.position.y) && Number.isFinite(st.position.z));
    assert.ok(st.squashScale.every((v) => Number.isFinite(v) && v > 0.3 && v < 2.5));
    assert.ok(Number.isFinite(st.bowtieTilt) && Number.isFinite(st.bowtieTailFlutter));
    maxWave = Math.max(maxWave, st.waveRight);
    maxBounceY = Math.max(maxBounceY, st.position.y);
    maxSmear = Math.max(maxSmear, st.smearStrength);
    if (st.shapeTo === "heart" && st.morphBlend > 0.8) sawHeart = true;
    if (st.shapeTo === "star" && st.morphBlend > 0.8) sawStar = true;
  }

  assert.ok(maxWave > 0.5, `Expected Lumi to wave enthusiastically, got maxWave=${maxWave}`);
  assert.ok(maxBounceY > 1.0, `Expected Lumi to bounce joyfully, got maxBounceY=${maxBounceY}`);
  assert.ok(maxSmear > 0.2, `Expected curved smear trail on dashes, got maxSmear=${maxSmear}`);
  assert.equal(sawHeart, true, "Expected Lumi to morph into a glowing Heart");
  assert.equal(sawStar, true, "Expected Lumi to morph into a 5-point Star");
});
