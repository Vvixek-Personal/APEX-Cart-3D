import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BANNER_TOTAL_HEIGHT,
  FIELD_HALF,
  PARK_HALF,
  STADIUM_INNER_STAND_CLEAR,
  STADIUM_NORTH_CANOPY_HEIGHT,
  STADIUM_TOWER_HEIGHT,
  STADIUM_TOWER_OFFSET,
  TRACK_HALF,
  TRACK_WIDTH,
  analyzeTrackGeometry,
  computeSpectatorCameraPose,
  createTrackCurve,
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
      new THREE.Vector3(start.position.x, BANNER_TOTAL_HEIGHT, start.position.z),
      new THREE.Vector3(finish.position.x, BANNER_TOTAL_HEIGHT, finish.position.z),
      new THREE.Vector3(-PARK_HALF, -1.0, -PARK_HALF),
      new THREE.Vector3(PARK_HALF, -1.0, -PARK_HALF),
      new THREE.Vector3(-PARK_HALF, -1.0, PARK_HALF),
      new THREE.Vector3(PARK_HALF, -1.0, PARK_HALF),
      new THREE.Vector3(-102, STADIUM_NORTH_CANOPY_HEIGHT, -174),
      new THREE.Vector3(102, STADIUM_NORTH_CANOPY_HEIGHT, -174),
      new THREE.Vector3(166, 15, 0),
      new THREE.Vector3(-162, 14, 0),
      new THREE.Vector3(-STADIUM_TOWER_OFFSET, STADIUM_TOWER_HEIGHT, -STADIUM_TOWER_OFFSET),
      new THREE.Vector3(STADIUM_TOWER_OFFSET, STADIUM_TOWER_HEIGHT, STADIUM_TOWER_OFFSET),
    ];

    for (const pt of mustBeVisible) {
      const ndc = pt.clone().project(cam);
      assert.ok(
        Math.abs(ndc.x) <= 0.92 && Math.abs(ndc.y) <= 0.92,
        `Aspect ${aspect.toFixed(2)}: point (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}, ${pt.z.toFixed(1)}) projected near edge (${ndc.x.toFixed(3)}, ${ndc.y.toFixed(3)})`,
      );
    }
  }
});

test('stadium stands, pavilion, and landscaping stay strictly outside the 240x240 grass field', () => {
  assert.ok(
    STADIUM_INNER_STAND_CLEAR > FIELD_HALF + 5,
    `Expected stadium inner clearance > ${FIELD_HALF + 5}, got ${STADIUM_INNER_STAND_CLEAR}`,
  );
  assert.ok(
    STADIUM_TOWER_OFFSET > FIELD_HALF + 30,
    `Expected floodlight towers well outside grass corners, got ${STADIUM_TOWER_OFFSET}`,
  );
});
