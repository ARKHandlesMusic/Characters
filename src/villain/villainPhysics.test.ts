import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  antennaSproingAt,
  bottomlessChompPropsAt,
  computeAntennaRadar,
  duoShowcaseStateAt,
  mouthEatEnvelope,
  slowDignifiedBlinkAt,
  villainMusicVideoStateAt,
  villainShowcaseStateAt,
} from "./villainPhysics";
import { emberMusicVideoStateAt } from "../ember/emberPhysics";

test("computeAntennaRadar swings toward Ember within 10m and disengages beyond 10m", () => {
  const vPos = new THREE.Vector3(0, 0, 0);
  const nearRight = computeAntennaRadar(vPos, new THREE.Vector3(4, 0, 0), 0, 10.0);
  assert.equal(nearRight.locked, true);
  assert.ok(nearRight.dir[0] > 0.9, `expected radar x > 0.9, got ${nearRight.dir[0]}`);

  const nearLeft = computeAntennaRadar(vPos, new THREE.Vector3(-5, 0, 0), 0, 10.0);
  assert.equal(nearLeft.locked, true);
  assert.ok(nearLeft.dir[0] < -0.9, `expected radar x < -0.9, got ${nearLeft.dir[0]}`);

  const farOut = computeAntennaRadar(vPos, new THREE.Vector3(14, 0, 0), 0, 10.0);
  assert.equal(farOut.locked, false);
  assert.equal(farOut.dir[0], 0);
});

test("mouth stays strictly sealed until eating and unzips smoothly during eating windows", () => {
  const windows: [number, number][] = [[10.0, 12.0]];
  assert.equal(mouthEatEnvelope(5.0, windows).unzip, 0);
  assert.equal(mouthEatEnvelope(9.9, windows).unzip, 0);
  assert.ok(mouthEatEnvelope(11.0, windows).unzip > 0.95);
  assert.equal(mouthEatEnvelope(12.2, windows).unzip, 0);
});

test("antenna sproing oscillates on disaster and settles, followed by slow dignified blink", () => {
  const sPeak = Math.abs(antennaSproingAt(10.07, [10.0]));
  const sSettled = Math.abs(antennaSproingAt(11.5, [10.0]));
  assert.ok(sPeak > 0.35, `expected strong antenna sproing, got ${sPeak}`);
  assert.equal(sSettled, 0);

  const blinkPeak = slowDignifiedBlinkAt(10.94, [10.7]);
  assert.ok(blinkPeak > 0.85, `expected slow dignified blink peak, got ${blinkPeak}`);
});

test("duoShowcaseStateAt plays Rule-of-Three poke test, two fake oranges + duck, and croissant gulp cleanly across 30s", () => {
  let maxSproing = 0;
  let maxUnzip = 0;
  let sawCroissantVisible = false;
  let sawCroissantEaten = false;

  for (let f = 0; f <= 900; f += 5) {
    const t = f / 30;
    const st = duoShowcaseStateAt(t, 1.0);
    assert.ok(Number.isFinite(st.villain.position.x) && Number.isFinite(st.ember.position.x));
    maxSproing = Math.max(maxSproing, Math.abs(st.villain.antennaSproing));
    maxUnzip = Math.max(maxUnzip, st.villain.mouthUnzip);
    if (t > 20.8 && t < 22.0 && st.props.croissantScale > 0.8) sawCroissantVisible = true;
    if (t > 23.2 && st.props.croissantScale < 0.05) sawCroissantEaten = true;
  }

  // Zero mouth during hero intro (2.0s)
  assert.equal(duoShowcaseStateAt(2.0).villain.mouthUnzip, 0);
  // Radar locked onto Ember in intro
  assert.equal(duoShowcaseStateAt(3.0).villain.radarLocked, true);
  assert.ok(maxSproing > 0.5, "expected cartoony antenna sproing on disasters");
  assert.ok(maxUnzip > 0.9, "expected red outline seam to unzip for eating");
  assert.equal(sawCroissantVisible, true);
  assert.equal(sawCroissantEaten, true);
});

test("villainMusicVideoStateAt stays quiet on emotional beats (02:03-02:11 & 02:32) and finite across 188s", () => {
  const quietBridge = villainMusicVideoStateAt(126.0, emberMusicVideoStateAt(126.0, 0).position);
  assert.equal(quietBridge.mouthUnzip, 0);
  assert.equal(quietBridge.antennaSproing, 0);
  assert.equal(quietBridge.smearStrength, 0);

  const quietFloor = villainMusicVideoStateAt(152.0, emberMusicVideoStateAt(152.0, 0).position);
  assert.equal(quietFloor.mouthUnzip, 0);
  assert.equal(quietFloor.antennaSproing, 0);

  for (let s = 0; s <= 188; s += 2) {
    const e = emberMusicVideoStateAt(s, 0.2);
    const v = villainMusicVideoStateAt(s, e.position);
    assert.ok(Number.isFinite(v.position.x) && Number.isFinite(v.position.y) && Number.isFinite(v.position.z));
  }
});

test("running gags: Ember disguises, chomp ledger progression, scared glow & 02:53 spark payoff", () => {
  // 1. Disguises in Duo Showcase & Bottomless
  assert.equal(duoShowcaseStateAt(7.0).ember.shapeTo, "bulb");
  assert.equal(duoShowcaseStateAt(13.5).ember.shapeTo, "duck");
  assert.equal(emberMusicVideoStateAt(52.0, 0).shapeTo, "duck");
  assert.equal(emberMusicVideoStateAt(78.0, 0).shapeTo, "camcorder");

  // 2. Chomp ledger tracks what the Villain eats instead of Ember
  assert.deepEqual(duoShowcaseStateAt(2.0).chompLedger, []);
  assert.deepEqual(duoShowcaseStateAt(24.0).chompLedger, ["fake-orange-1", "fake-orange-2", "croissant"]);
  const finalChomp = bottomlessChompPropsAt(180.0, new THREE.Vector3());
  assert.deepEqual(finalChomp.chompLedger, [
    "fake-orange",
    "cassette-player",
    "potted-plant",
    "croissant-1",
    "croissant-2",
  ]);

  // 3. Ember glows when scared (cornered in Duo Showcase + THE SPARK at 02:53 = 173.0s in Bottomless!)
  assert.ok((duoShowcaseStateAt(19.5).ember.scaredGlow ?? 0) > 0.85, "Ember should glow brightly when cornered");
  assert.ok((emberMusicVideoStateAt(173.1, 0).scaredGlow ?? 0) > 0.9, "Ember's scared glow must peak as the 02:53 spark!");
  assert.equal(emberMusicVideoStateAt(126.0, 0).scaredGlow ?? 0, 0, "Ember stays calm/quiet on 02:03-02:11 emotional beat");
});

test("villainShowcaseStateAt exercises periscope stretch, antenna sproing, unzipping mouth, and slow blink cleanly across 16s", () => {
  let maxStretch = 0;
  let maxSproing = 0;
  let maxUnzip = 0;
  let maxBlink = 0;

  for (let f = 0; f <= 480; f += 3) {
    const t = f / 30;
    const st = villainShowcaseStateAt(t, 1.0);
    assert.ok(Number.isFinite(st.position.x) && Number.isFinite(st.position.y) && Number.isFinite(st.position.z));
    maxStretch = Math.max(maxStretch, st.antennaStretch);
    maxSproing = Math.max(maxSproing, Math.abs(st.antennaSproing));
    maxUnzip = Math.max(maxUnzip, st.mouthUnzip);
    maxBlink = Math.max(maxBlink, st.blink);
  }

  assert.equal(villainShowcaseStateAt(1.5).mouthUnzip, 0);
  assert.ok(maxStretch > 0.75, `Expected tall periscope stretch, got ${maxStretch}`);
  assert.ok(maxSproing > 0.4, `Expected antenna sproing, got ${maxSproing}`);
  assert.ok(maxUnzip > 0.9, `Expected unzipping red seam mouth, got ${maxUnzip}`);
  assert.ok(maxBlink > 0.8, `Expected slow dignified blink, got ${maxBlink}`);
});
