import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BANNER_TOTAL_HEIGHT,
  FIELD_HALF,
  FIELD_THICKNESS,
  STADIUM_CANOPY_INNER,
  STADIUM_CONCOURSE_OUTER,
  STADIUM_TOWER_HEIGHT,
  STADIUM_TOWER_RADIUS,
  TRACK_HALF,
  TRACK_WIDTH,
  analyzeTrackGeometry,
  computeSpectatorCameraPose,
  createTrackCurve,
  evaluateStadiumPoint,
  getBannerPlacements,
  sampleTrackFrames,
} from './trackLayout';

test('track stays strictly inside square grass field with outer margin', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 480);
  const pose = computeSpectatorCameraPose(1440 / 900);
  const metrics = analyzeTrackGeometry(curve, frames, pose.position);

  assert.ok(
    metrics.maxAbsTrackCoord <= FIELD_HALF - 10,
    `Expected outer track edge <= ${FIELD_HALF - 10}, got ${metrics.maxAbsTrackCoord.toFixed(2)}`,
  );
  assert.equal(TRACK_WIDTH, 16.8);
  assert.ok(
    metrics.totalLength > 900 && metrics.totalLength < 950,
    `Expected ~2x circuit length (~922 units), got ${metrics.totalLength.toFixed(2)}`,
  );
});

test('track has no crossings, no overlapping sections, and no pinched hairpins', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 480);
  const pose = computeSpectatorCameraPose(1440 / 900);
  const metrics = analyzeTrackGeometry(curve, frames, pose.position);

  // Inner edge never folds or pinches if min radius > half-width * 1.4
  assert.ok(
    metrics.minCurvatureRadius > TRACK_HALF * 1.4,
    `Min curvature radius ${metrics.minCurvatureRadius.toFixed(2)} too tight for half-width ${TRACK_HALF}`,
  );

  // Non-adjacent centerline distance must exceed track width + generous grass gap
  assert.ok(
    metrics.minNonAdjacentClearance >= TRACK_WIDTH * 1.75,
    `Min non-adjacent clearance ${metrics.minNonAdjacentClearance.toFixed(2)} too small (possible overlap)`,
  );
});

test('START and FINISH banners are cleanly separated and face the spectator camera', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 480);
  const pose = computeSpectatorCameraPose(1440 / 900);
  const metrics = analyzeTrackGeometry(curve, frames, pose.position);

  assert.ok(
    metrics.bannerSeparation >= 40,
    `Banner separation ${metrics.bannerSeparation.toFixed(2)} too close`,
  );
  assert.ok(
    metrics.startFacingDot >= 0.75 && metrics.finishFacingDot >= 0.75,
    `Banners should face spectator camera cleanly: start=${metrics.startFacingDot.toFixed(2)}, finish=${metrics.finishFacingDot.toFixed(2)}`,
  );
});

test('spectator camera frames entire square field and both banners with margin', () => {
  const curve = createTrackCurve();
  const { start, finish } = getBannerPlacements(curve);

  for (const aspect of [1440 / 900, 16 / 9, 4 / 3, 390 / 844]) {
    const pose = computeSpectatorCameraPose(aspect);
    const cam = new THREE.PerspectiveCamera(pose.fov, aspect, pose.near, pose.far);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld(true);

    const mustBeVisible = [
      new THREE.Vector3(-FIELD_HALF, 0, -FIELD_HALF),
      new THREE.Vector3(FIELD_HALF, 0, -FIELD_HALF),
      new THREE.Vector3(-FIELD_HALF, 0, FIELD_HALF),
      new THREE.Vector3(FIELD_HALF, 0, FIELD_HALF),
      new THREE.Vector3(-FIELD_HALF, -FIELD_THICKNESS, FIELD_HALF),
      new THREE.Vector3(FIELD_HALF, -FIELD_THICKNESS, FIELD_HALF),
      new THREE.Vector3(start.position.x, BANNER_TOTAL_HEIGHT, start.position.z),
      new THREE.Vector3(finish.position.x, BANNER_TOTAL_HEIGHT, finish.position.z),
    ];

    for (let i = 0; i < 16; i++) {
      const outer = evaluateStadiumPoint((i / 16) * Math.PI * 2, STADIUM_CONCOURSE_OUTER);
      mustBeVisible.push(new THREE.Vector3(outer.x, 15.5, outer.z));
    }
    for (const cornerAngle of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
      const tower = evaluateStadiumPoint(cornerAngle, STADIUM_TOWER_RADIUS);
      mustBeVisible.push(new THREE.Vector3(tower.x, STADIUM_TOWER_HEIGHT, tower.z));
    }

    for (const pt of mustBeVisible) {
      const ndc = pt.clone().project(cam);
      assert.ok(
        Math.abs(ndc.x) <= 0.9 && Math.abs(ndc.y) <= 0.9,
        `Aspect ${aspect.toFixed(2)}: point (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}, ${pt.z.toFixed(1)}) projected near edge (${ndc.x.toFixed(3)}, ${ndc.y.toFixed(3)})`,
      );
    }
  }
});

test('stadium structure stays strictly outside the 240x240 grass field', () => {
  for (let i = 0; i < 96; i++) {
    const theta = (i / 96) * Math.PI * 2;
    const innerCanopy = evaluateStadiumPoint(theta, STADIUM_CANOPY_INNER);
    const maxCoord = Math.max(Math.abs(innerCanopy.x), Math.abs(innerCanopy.z));
    assert.ok(
      maxCoord > FIELD_HALF + 10,
      `Stadium inner canopy at theta=${theta.toFixed(2)} encroaches grass field: maxCoord=${maxCoord.toFixed(2)}`,
    );
  }
});
