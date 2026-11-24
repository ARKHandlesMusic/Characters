import test from "node:test";
import assert from "node:assert/strict";
import {
  BONE_NAMES,
  computeBodyMetrics,
  evaluateBasePersonPose,
  leftHandTapSignal,
  phoneScreenFlicker,
  phoneThumbScrollSignal,
  scrollFlickSignal,
  shoulderRollCurve,
  type PersonPoseMode,
} from "./basePersonRig";
import {
  applyPoseToSkeleton,
  buildBasePersonRig,
  headNeckProfileAtY,
  torsoProfileAtY,
} from "./basePersonGeometry";

test("basePersonRig defines exactly 54 articulated bones with unique names", () => {
  assert.equal(BONE_NAMES.length, 54);
  assert.equal(new Set(BONE_NAMES).size, 54);
  const state = evaluateBasePersonPose(0, "tpose");
  assert.equal(state.boneCount, 54);
  assert.equal(Object.keys(state.bones).length, 54);
});

test("shape settings produce distinct positive body metrics for heavier, slimmer, broader, and curvier bodies", () => {
  const base = computeBodyMetrics();
  const heavy = computeBodyMetrics({ heavier: 1 });
  const slim = computeBodyMetrics({ slimmer: 1 });
  const broad = computeBodyMetrics({ broader: 1 });
  const curvy = computeBodyMetrics({ curvier: 1 });

  assert.ok(heavy.waistWidth > base.waistWidth && heavy.armRadius > base.armRadius);
  assert.ok(slim.waistWidth < base.waistWidth && slim.legRadius < base.legRadius);
  assert.ok(broad.shoulderSpan > base.shoulderSpan && broad.chestWidth > base.chestWidth);
  assert.ok(curvy.pelvisWidth > base.pelvisWidth && curvy.waistWidth < base.waistWidth);
});

test("standing T-pose is never static and executes 4s breath, shoulder roll, two scroll flicks, and left-hand tap", () => {
  // Breath cycle (~4s period): low near t=0s, peak near t=2s, low near t=4s
  const b0 = evaluateBasePersonPose(0.0, "tpose").breathPhase;
  const b2 = evaluateBasePersonPose(2.0, "tpose").breathPhase;
  const b4 = evaluateBasePersonPose(4.0, "tpose").breathPhase;
  assert.ok(b2 > 0.95 && b0 < 0.05 && b4 < 0.05, `Expected 4s breath peak at 2s, got ${b0}, ${b2}, ${b4}`);

  // Shoulder roll dips at ~4.42s, rises high at ~5.25s, and settles near 0 by 7.5s
  const dip = shoulderRollCurve(4.42).lift;
  const rise = shoulderRollCurve(5.25).lift;
  const settled = Math.abs(shoulderRollCurve(7.5).lift);
  assert.ok(dip < -0.2, `Expected shoulder roll dip < -0.2, got ${dip}`);
  assert.ok(rise > 0.8, `Expected shoulder roll rise > 0.8, got ${rise}`);
  assert.ok(settled < 0.05, `Expected shoulder roll settled < 0.05, got ${settled}`);

  // Two scroll flicks on right index finger at 8.35s & 9.25s with calm valley between
  const f1 = scrollFlickSignal(8.35);
  const fMid = scrollFlickSignal(8.80);
  const f2 = scrollFlickSignal(9.25);
  assert.ok(f1 > 0.9 && f2 > 0.9 && fMid < 0.15, `Expected two distinct scroll flicks, got ${f1}, ${fMid}, ${f2}`);

  // Right index finger curls markedly more during scroll flick than at rest
  const idxRest = evaluateBasePersonPose(7.2, "tpose").bones.indexR2[0];
  const idxFlick = evaluateBasePersonPose(8.35, "tpose").bones.indexR2[0];
  assert.ok(idxFlick > idxRest + 0.45, "Right index finger must flick during scroll impulse");

  // Left-hand tap around 11.15s moves left wrist cleanly
  const tapPeak = leftHandTapSignal(11.15);
  const tapRest = leftHandTapSignal(2.0);
  assert.ok(tapPeak > 0.9 && tapRest < 0.05);
  const wristRest = evaluateBasePersonPose(2.0, "tpose").bones.handL[0];
  const wristTap = evaluateBasePersonPose(11.15, "tpose").bones.handL[0];
  assert.ok(wristTap > wristRest + 0.15, "Left wrist must dip on left-hand tap");

  // Never static across consecutive frames
  let movedCount = 0;
  for (let f = 1; f < 120; f++) {
    const prev = evaluateBasePersonPose((f - 1) / 30, "tpose");
    const cur = evaluateBasePersonPose(f / 30, "tpose");
    const delta =
      Math.abs(cur.bones.head[1] - prev.bones.head[1]) +
      Math.abs(cur.bones.upperArmL[2] - prev.bones.upperArmL[2]) +
      Math.abs(cur.bones.spineUpper[0] - prev.bones.spineUpper[0]);
    if (delta > 1e-6) movedCount++;
  }
  assert.equal(movedCount, 119, "Character must never be static across frames");
});

test("all pose presets produce finite 54-bone rotations", () => {
  const poses: PersonPoseMode[] = [
    "tpose",
    "stand",
    "walk",
    "seated",
    "typing",
    "slumped",
    "falling",
    "lyingPhone",
  ];
  for (const pose of poses) {
    for (let t = 0; t <= 14; t += 2.0) {
      const state = evaluateBasePersonPose(t, pose, { heavier: 0.25, broader: 0.2 });
      for (const bone of BONE_NAMES) {
        const [rx, ry, rz] = state.bones[bone];
        assert.ok(
          Number.isFinite(rx) && Number.isFinite(ry) && Number.isFinite(rz),
          `Non-finite rotation on ${bone} in pose ${pose} at t=${t}`,
        );
      }
    }
  }
});

test("lyingPhone pose has active right-thumb scrolling, live phone flicker, and non-static whole-body micro-motions", () => {
  let thumb1SweepMin = Infinity;
  let thumb1SweepMax = -Infinity;
  let thumb1PressMin = Infinity;
  let thumb1PressMax = -Infinity;
  let thumb2Min = Infinity;
  let thumb2Max = -Infinity;
  let headMin = Infinity;
  let headMax = -Infinity;
  let chestMin = Infinity;
  let chestMax = -Infinity;
  let kneeMin = Infinity;
  let kneeMax = -Infinity;
  let footMin = Infinity;
  let footMax = -Infinity;
  let flickerMin = Infinity;
  let flickerMax = -Infinity;

  const sStart = phoneThumbScrollSignal(0.0);
  const sEnd = phoneThumbScrollSignal(12.0);
  assert.ok(
    sEnd.reelIndex > sStart.reelIndex + 2,
    `Expected thumb scroll to advance multiple reels over 12s, got ${sStart.reelIndex} -> ${sEnd.reelIndex}`,
  );

  for (let f = 0; f <= 300; f++) {
    const t = f / 30;
    const pose = evaluateBasePersonPose(t, "lyingPhone");
    thumb1SweepMin = Math.min(thumb1SweepMin, pose.bones.thumbR1[2]);
    thumb1SweepMax = Math.max(thumb1SweepMax, pose.bones.thumbR1[2]);
    thumb1PressMin = Math.min(thumb1PressMin, pose.bones.thumbR1[0]);
    thumb1PressMax = Math.max(thumb1PressMax, pose.bones.thumbR1[0]);
    thumb2Min = Math.min(thumb2Min, pose.bones.thumbR2[0]);
    thumb2Max = Math.max(thumb2Max, pose.bones.thumbR2[0]);
    headMin = Math.min(headMin, pose.bones.head[0]);
    headMax = Math.max(headMax, pose.bones.head[0]);
    chestMin = Math.min(chestMin, pose.bones.spineUpper[0]);
    chestMax = Math.max(chestMax, pose.bones.spineUpper[0]);
    kneeMin = Math.min(kneeMin, pose.bones.thighL[2]);
    kneeMax = Math.max(kneeMax, pose.bones.thighL[2]);
    footMin = Math.min(footMin, pose.bones.footR[0]);
    footMax = Math.max(footMax, pose.bones.footR[0]);

    const flick = phoneScreenFlicker(t);
    assert.ok(Number.isFinite(flick) && flick >= 0.4 && flick <= 1.6, `Flicker out of range at t=${t}: ${flick}`);
    flickerMin = Math.min(flickerMin, flick);
    flickerMax = Math.max(flickerMax, flick);
  }

  assert.ok(
    thumb1SweepMax - thumb1SweepMin > 0.45,
    `Right thumb base must visibly sweep across phone, got range ${thumb1SweepMax - thumb1SweepMin}`,
  );
  assert.ok(
    thumb1PressMax - thumb1PressMin > 0.10,
    `Right thumb must visibly press onto screen, got range ${thumb1PressMax - thumb1PressMin}`,
  );
  assert.ok(thumb2Max - thumb2Min > 0.20, `Right thumb joint must visibly curl/extend, got range ${thumb2Max - thumb2Min}`);
  assert.ok(headMax - headMin > 0.04, `Head pitch must subtly move while watching reels, got ${headMax - headMin}`);
  assert.ok(chestMax - chestMin > 0.02, `Chest breathing must move spineUpper, got ${chestMax - chestMin}`);
  assert.ok(kneeMax - kneeMin > 0.03, `Propped left knee must have gentle sway, got ${kneeMax - kneeMin}`);
  assert.ok(footMax - footMin > 0.06, `Right ankle/foot must subtly fidget, got ${footMax - footMin}`);
  assert.ok(flickerMax - flickerMin > 0.15, `Phone screen glow must subtly flicker, got ${flickerMax - flickerMin}`);
});

test("buildBasePersonRig produces valid 54-bone SkinnedMesh geometries with unit skin weights and zero part phasing", () => {
  const rig = buildBasePersonRig();
  const metrics = computeBodyMetrics();

  // Exact 54 THREE.Bones matching BONE_NAMES
  assert.equal(rig.bones.length, 54);
  assert.equal(rig.skeleton.bones.length, 54);
  for (let i = 0; i < 54; i++) {
    assert.equal(rig.bones[i].name, BONE_NAMES[i]);
  }

  // Every vertex in every geometry has finite positions/normals and unit-summed skin weights
  for (const [name, geo] of Object.entries(rig.geometries)) {
    const pos = geo.getAttribute("position");
    const norm = geo.getAttribute("normal");
    const sw = geo.getAttribute("skinWeight");
    assert.ok(pos.count > 20, `Expected non-empty geometry for ${name}`);
    for (let i = 0; i < pos.count; i++) {
      const sumW = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i);
      assert.ok(Math.abs(sumW - 1.0) < 1e-3, `Skin weights for ${name}[${i}] must sum to 1, got ${sumW}`);
      assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(norm.getX(i)), `Finite vertex in ${name}[${i}]`);
    }
  }

  // Hoodless crewneck shirt: no separate drawstrings geometry and no floating back hood protrusion!
  const upperBackProf = torsoProfileAtY(1.36, metrics);
  const shirtPos = rig.geometries.hoodie.getAttribute("position");
  for (let i = 0; i < shirtPos.count; i++) {
    const x = shirtPos.getX(i);
    const y = shirtPos.getY(i);
    const z = shirtPos.getZ(i);
    if (Math.abs(x) < 0.10 && y >= 1.32 && y <= 1.44) {
      assert.ok(
        z >= upperBackProf.zCenter - upperBackProf.rzBack - 0.015,
        `Detected unexpected floating back hood protrusion at (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`,
      );
    }
  }

  // Red beanie stays strictly outside the skull cranium (zero skull clipping!)
  const bPos = rig.geometries.beanie.getAttribute("position");
  for (let i = 0; i < bPos.count; i++) {
    const x = bPos.getX(i);
    const y = bPos.getY(i);
    const z = bPos.getZ(i);
    if (y >= 1.595 && y <= 1.715) {
      const skull = headNeckProfileAtY(y);
      const normDist = Math.hypot(x / skull.rx, (z - skull.zCenter) / skull.rz);
      assert.ok(normDist > 1.02, `Beanie vertex at y=${y.toFixed(3)} clipped skull (normDist=${normDist.toFixed(3)})`);
    }
  }

  // Grounded socks rest cleanly on floor (y ~ 0.000)
  const sPos = rig.geometries.socks.getAttribute("position");
  let minY = Infinity;
  for (let i = 0; i < sPos.count; i++) {
    minY = Math.min(minY, sPos.getY(i));
  }
  assert.ok(minY >= 0 && minY <= 0.01, `Expected socks grounded near y=0, got minY=${minY}`);

  // Jeans front center crotch stays strictly flat/recessed behind front thigh plane (zero bulge!)
  const jPos = rig.geometries.jeans.getAttribute("position");
  let maxCrotchZ = -Infinity;
  let maxThighZ = -Infinity;
  for (let i = 0; i < jPos.count; i++) {
    const x = jPos.getX(i);
    const y = jPos.getY(i);
    const z = jPos.getZ(i);
    if (Math.abs(x) < 0.032 && y >= 0.78 && y <= 0.86) {
      maxCrotchZ = Math.max(maxCrotchZ, z);
    }
    if (Math.abs(x) > 0.055 && y >= 0.60 && y <= 0.80) {
      maxThighZ = Math.max(maxThighZ, z);
    }
  }
  assert.ok(
    maxCrotchZ <= maxThighZ,
    `Jeans center crotch (${maxCrotchZ.toFixed(4)}) must stay flush/behind front thigh plane (${maxThighZ.toFixed(4)})`,
  );

  // Thumbs sit anatomically ABOVE pinkies in standing T/A-pose!
  const thumbLY = rig.boneMap.thumbL1.matrixWorld.elements[13];
  const pinkyLY = rig.boneMap.pinkyL1.matrixWorld.elements[13];
  const thumbRY = rig.boneMap.thumbR1.matrixWorld.elements[13];
  const pinkyRY = rig.boneMap.pinkyR1.matrixWorld.elements[13];
  assert.ok(thumbLY > pinkyLY + 0.04, `Left thumb Y (${thumbLY.toFixed(3)}) must be above pinky Y (${pinkyLY.toFixed(3)})`);
  assert.ok(thumbRY > pinkyRY + 0.04, `Right thumb Y (${thumbRY.toFixed(3)}) must be above pinky Y (${pinkyRY.toFixed(3)})`);

  // Hoodie torso + shoulders + BOTH sleeves form ONE topologically welded connected mesh component!
  const hPos = rig.geometries.hoodie.getAttribute("position");
  const hNorm = rig.geometries.hoodie.getAttribute("normal");
  const hIdx = rig.geometries.hoodie.getIndex();
  assert.ok(hIdx, "Hoodie geometry must be indexed");
  const adj: number[][] = Array.from({ length: hPos.count }, () => []);
  for (let t = 0; t < hIdx.count; t += 3) {
    const a = hIdx.getX(t);
    const b = hIdx.getX(t + 1);
    const c = hIdx.getX(t + 2);
    adj[a].push(b, c);
    adj[b].push(a, c);
    adj[c].push(a, b);
  }
  // Pick a front chest vertex (x ~ 0, y ~ 1.15, z > 0.08) and BFS across shared triangle edges
  let chestSeed = -1;
  let leftWristIdx = -1;
  let rightWristIdx = -1;
  let maxX = -Infinity;
  let minX = Infinity;
  for (let i = 0; i < hPos.count; i++) {
    const x = hPos.getX(i);
    const y = hPos.getY(i);
    const z = hPos.getZ(i);
    if (chestSeed < 0 && Math.abs(x) < 0.03 && y > 1.10 && y < 1.22 && z > 0.08) {
      chestSeed = i;
    }
    if (x > maxX) {
      maxX = x;
      leftWristIdx = i;
    }
    if (x < minX) {
      minX = x;
      rightWristIdx = i;
    }
  }
  assert.ok(chestSeed >= 0 && leftWristIdx >= 0 && rightWristIdx >= 0);
  const visited = new Uint8Array(hPos.count);
  const queue = [chestSeed];
  visited[chestSeed] = 1;
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const nxt of adj[cur]) {
      if (!visited[nxt]) {
        visited[nxt] = 1;
        queue.push(nxt);
      }
    }
  }
  assert.equal(
    visited[leftWristIdx],
    1,
    `Left arm/sleeve (x=${maxX.toFixed(3)}) must be topologically welded to torso!`,
  );
  assert.equal(
    visited[rightWristIdx],
    1,
    `Right arm/sleeve (x=${minX.toFixed(3)}) must be topologically welded to torso!`,
  );
  // Every single vertex in the hoodless crewneck shirt must belong to ONE connected manifold (zero floating hood!)
  let visitedCount = 0;
  for (let i = 0; i < visited.length; i++) visitedCount += visited[i];
  assert.equal(
    visitedCount,
    hPos.count,
    `Hoodless shirt must be 100% single connected mesh (zero detached hood parts), reached ${visitedCount}/${hPos.count}`,
  );
  // Verify outward normals on front chest (nz > 0) and valid front-chest UVs for the 3D Ember print
  assert.ok(hNorm.getZ(chestSeed) > 0.5, `Front chest normal Z must face outward (>0.5), got ${hNorm.getZ(chestSeed)}`);
  const hUv = rig.geometries.hoodie.getAttribute("uv");
  assert.ok(hUv, "Hoodie geometry must include uv attribute for shirt graphic");
  let chestUvCount = 0;
  for (let i = 0; i < hPos.count; i++) {
    const u = hUv.getX(i);
    const v = hUv.getY(i);
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      chestUvCount++;
      assert.ok(hPos.getZ(i) > 0.02, "Shirt graphic UV must only map onto front chest, never back");
    }
  }
  assert.ok(chestUvCount >= 20, `Expected front-chest graphic UVs to cover torso print box, got ${chestUvCount}`);

  // Applying a live pose updates all 54 bones cleanly without throwing
  const livePose = evaluateBasePersonPose(5.25, "tpose");
  applyPoseToSkeleton(rig, livePose);
  assert.ok(Number.isFinite(rig.boneMap.head.matrixWorld.elements[12]));

  Object.values(rig.geometries).forEach((g) => g.dispose());
});
