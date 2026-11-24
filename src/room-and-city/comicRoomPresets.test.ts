import test from "node:test";
import assert from "node:assert/strict";
import {
  computeTextureAlignedBalconyRows,
  evaluateAct1OpeningCamera,
  evaluateRoomCamera,
  generateCityLayout,
  getComicLightingConfig,
  verifyCityNoOverlaps,
} from "./comicRoomPresets";

test("generateCityLayout has ZERO road/footpath/building overlaps and spans 25+ buildings deep", () => {
  const layout = generateCityLayout();
  const issues = verifyCityNoOverlaps(layout);
  assert.deepEqual(issues, [], `Found overlapping city parcels: ${issues.join("; ")}`);

  const totalBuildings = 4 + layout.districtBuildings.length;
  assert.ok(totalBuildings >= 70, `Expected >= 70 buildings, got ${totalBuildings}`);

  const minBuildingZ = Math.min(...layout.districtBuildings.map((b) => b.z));
  assert.ok(minBuildingZ < -200, `Expected city to stretch beyond z=-200m, got ${minBuildingZ}`);
  assert.ok(layout.trees.length >= 40, `Expected >= 40 street trees, got ${layout.trees.length}`);
  assert.ok(layout.lamps.length >= 24, `Expected >= 24 streetlamps, got ${layout.lamps.length}`);
  assert.ok(layout.cars.length >= 16, `Expected >= 16 animated cars, got ${layout.cars.length}`);
  assert.ok(layout.mountains.length >= 8, `Expected >= 8 mountain peaks, got ${layout.mountains.length}`);
  assert.ok(layout.clouds.length >= 10, `Expected >= 10 drifting clouds, got ${layout.clouds.length}`);
});

test("windowZoom camera starts at lowered half-height (~18m) and flies smoothly through window into Shot 01", () => {
  const start = evaluateRoomCamera("windowZoom", 0, 15.88);
  const t4 = evaluateRoomCamera("windowZoom", 4.0, 15.88);
  const t9 = evaluateRoomCamera("windowZoom", 9.0, 15.88);
  const tGlass = evaluateRoomCamera("windowZoom", 12.8, 15.88);
  const tIntroEnd = evaluateRoomCamera("windowZoom", 13.56, 15.88);
  const tOrbitStart = evaluateRoomCamera("windowZoom", 14.38, 15.88);
  const tShot1End = evaluateRoomCamera("windowZoom", 15.88, 15.88);

  assert.ok(start.position[2] < -200, `Expected start z < -200, got ${start.position[2]}`);
  // Lowered to half height (~18.04m instead of old 36m!)
  assert.ok(
    start.position[1] > 17.0 && start.position[1] < 19.0,
    `Expected lowered half-height start y in (17, 19), got ${start.position[1].toFixed(2)}`,
  );
  // Slow ramp 0-4s covers less than 30% of corridor, fast ramp 4-10s covers > 55%
  const dist0to4 = t4.position[2] - start.position[2];
  const dist4to9 = t9.position[2] - t4.position[2];
  assert.ok(dist4to9 > dist0to4 * 2.0, `Expected 4-9s rush (${dist4to9.toFixed(1)}m) faster than 0-4s (${dist0to4.toFixed(1)}m)`);
  // Kisses window glass right at 00:12.80 (z = -2.65)
  assert.ok(Math.abs(tGlass.position[2] - -2.65) < 0.08, `Expected glass kiss at z=-2.65, got ${tGlass.position[2]}`);
  // Passes cleanly inside bedroom by 13.56s (z in [-2.0, -1.0])
  assert.ok(tIntroEnd.position[2] > -2.0 && tIntroEnd.position[2] < -1.0, `Expected inside room at 13.56s, got z=${tIntroEnd.position[2]}`);

  // Continuous zero-cut check across 12.6s -> 15.88s at 30fps (no jump anywhere!)
  let prev = evaluateRoomCamera("windowZoom", 12.6, 15.88);
  for (let s = 12.6 + 1 / 30; s <= 15.88; s += 1 / 30) {
    const cur = evaluateRoomCamera("windowZoom", s, 15.88);
    const step = Math.hypot(
      cur.position[0] - prev.position[0],
      cur.position[1] - prev.position[1],
      cur.position[2] - prev.position[2],
    );
    assert.ok(step < 0.30, `Camera discontinuity of ${step.toFixed(3)}m detected at t=${s.toFixed(2)}s`);
    assert.ok(cur.position.every(Number.isFinite) && cur.lookAt.every(Number.isFinite));
    prev = cur;
  }

  // Ends ~0.6m from his cheek [1.38, 0.86, -1.84] with smooth orbit drift over final 1.5s
  const distCheek = Math.hypot(
    tShot1End.position[0] - 1.38,
    tShot1End.position[1] - 0.86,
    tShot1End.position[2] - -1.84,
  );
  assert.ok(distCheek > 0.50 && distCheek < 0.72, `Expected ~0.6m from cheek, got ${distCheek.toFixed(3)}m`);
  const orbitDrift = Math.hypot(
    tShot1End.position[0] - tOrbitStart.position[0],
    tShot1End.position[2] - tOrbitStart.position[2],
  );
  assert.ok(orbitDrift > 0.05 && orbitDrift < 0.45, `Expected gentle orbit+drift over last 1.5s, got ${orbitDrift.toFixed(3)}m`);
});

test("evaluateAct1OpeningCamera has ZERO hard cuts across Intro + Shot 01 + Shot 02 + Shot 03 + Shot 04 (00:00 -> 24.52s)", () => {
  // Check frame-by-frame continuity from 12.80s (glass pass) all the way through 24.52s (Shot 05 handoff!)
  let prev = evaluateAct1OpeningCamera(12.8, 15.88);
  for (let s = 12.8 + 1 / 30; s <= 24.52; s += 1 / 30) {
    const cur = evaluateAct1OpeningCamera(s, 15.88);
    const posStep = Math.hypot(
      cur.position[0] - prev.position[0],
      cur.position[1] - prev.position[1],
      cur.position[2] - prev.position[2],
    );
    const lookStep = Math.hypot(
      cur.lookAt[0] - prev.lookAt[0],
      cur.lookAt[1] - prev.lookAt[1],
      cur.lookAt[2] - prev.lookAt[2],
    );
    assert.ok(posStep < 0.45, `Camera position jump of ${posStep.toFixed(3)}m at t=${s.toFixed(2)}s`);
    assert.ok(lookStep < 0.35, `Camera lookAt jump of ${lookStep.toFixed(3)}m at t=${s.toFixed(2)}s`);
    assert.ok(cur.fov >= 28 && cur.fov <= 62, `Out-of-range fov ${cur.fov} at t=${s.toFixed(2)}s`);
    prev = cur;
  }

  // Shot 02 settles squarely in macro view of BasePerson's rigged phone [1.265, 1.016, -1.322]
  const shot02Hold = evaluateAct1OpeningCamera(17.4, 15.88);
  const distToRealPhone = Math.hypot(
    shot02Hold.lookAt[0] - 1.265,
    shot02Hold.lookAt[1] - 1.016,
    shot02Hold.lookAt[2] - -1.322,
  );
  assert.ok(distToRealPhone < 0.08, `Expected Shot 02 lookAt on real phone, got dist=${distToRealPhone.toFixed(3)}m`);

  // Shot 04 ends at exact Shot 05 handoff coordinates [-0.1, 2.35, 14.53] -> [-0.1, 0.85, 0.35]
  const shot04End = evaluateAct1OpeningCamera(24.52, 15.88);
  assert.ok(Math.abs(shot04End.position[0] - -0.1) < 0.02);
  assert.ok(Math.abs(shot04End.position[1] - 2.35) < 0.02);
  assert.ok(Math.abs(shot04End.position[2] - 14.53) < 0.05);
  assert.ok(Math.abs(shot04End.fov - 58) < 0.1);
});

test("computeTextureAlignedBalconyRows strictly aligns slabs beneath painted facade window sills", () => {
  const rows = computeTextureAlignedBalconyRows(-6, 28, 14);
  assert.ok(rows.length >= 4, `Expected at least 4 aligned balcony rows on 28m tower, got ${rows.length}`);
  for (const r of rows) {
    assert.ok(
      r.sillY > -6 + 1.5 && r.sillY < -6 + 28 - 1.0,
      `Balcony sillY=${r.sillY.toFixed(2)} out of safe facade bounds`,
    );
    assert.ok(r.floorHeight > 1.0 && r.floorHeight < 5.0);
  }
  // Strictly descending top-to-bottom floor spacing matching canvas row coordinates
  for (let i = 1; i < rows.length; i++) {
    assert.ok(
      rows[i - 1].sillY - rows[i].sillY > 1.5,
      `Balcony rows too close or out of order: ${rows[i - 1].sillY} -> ${rows[i].sillY}`,
    );
  }
});

test("all lighting modes and room/city camera presets return finite configs", () => {
  for (const mode of ["day", "night", "muted"] as const) {
    const cfg = getComicLightingConfig(mode);
    assert.equal(cfg.mode, mode);
    assert.ok(Number.isFinite(cfg.fogFar) && cfg.fogFar > cfg.fogNear);
  }
  for (const preset of ["windowZoom", "bedPhone", "city", "cityTour", "wide", "desk", "window"] as const) {
    const state = evaluateRoomCamera(preset, 4, 16);
    assert.ok(state.position.every(Number.isFinite));
    assert.ok(state.lookAt.every(Number.isFinite));
    assert.ok(state.fov > 20 && state.fov < 90);
  }
});
