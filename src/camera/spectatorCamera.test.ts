import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DEFAULT_SPECTATOR_CAMERA_CONFIG,
  SpectatorCameraController,
  SpectatorPoseOutput,
  resolveResponsiveSpectatorParams,
} from './spectatorCamera';
import { BANNER_TOTAL_HEIGHT, TRACK_LAYOUT_SCALE } from '../track/trackLayout';

function createEmptyPose(): SpectatorPoseOutput {
  return {
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
    fov: 38,
    near: 14,
    far: 4800,
    distance: 720,
    elevationDeg: 39,
    azimuthDeg: 34,
  };
}

test('default spectator camera config stays in architectural aerial skyline range', () => {
  assert.ok(
    DEFAULT_SPECTATOR_CAMERA_CONFIG.spectatorElevation >= 35 &&
      DEFAULT_SPECTATOR_CAMERA_CONFIG.spectatorElevation <= 55,
  );
  assert.ok(
    DEFAULT_SPECTATOR_CAMERA_CONFIG.spectatorFov >= 35 &&
      DEFAULT_SPECTATOR_CAMERA_CONFIG.spectatorFov <= 42,
  );
  assert.ok(DEFAULT_SPECTATOR_CAMERA_CONFIG.spectatorTargetHeight > 0);
  assert.ok(DEFAULT_SPECTATOR_CAMERA_CONFIG.spectatorDamping > 0);
  assert.ok(DEFAULT_SPECTATOR_CAMERA_CONFIG.spectatorOrbitSpeed > 0);
});

test('responsive spectator params stay within 35-55 deg across desktop, tablet, and mobile viewports', () => {
  const aspects = [
    1440 / 900, // Desktop widescreen
    1280 / 800, // Laptop
    768 / 1024, // Tablet portrait
    390 / 844,  // Mobile portrait
    844 / 390,  // Mobile landscape
  ];

  for (const aspect of aspects) {
    const params = resolveResponsiveSpectatorParams(aspect, DEFAULT_SPECTATOR_CAMERA_CONFIG);
    assert.ok(
      params.elevationDeg >= 35 && params.elevationDeg <= 55,
      `Elevation ${params.elevationDeg} out of 35-55 range for aspect ${aspect}`,
    );
    assert.ok(params.fov >= 35 && params.fov <= 50);
    assert.ok(params.padding >= 0.04 && params.padding <= 0.2);
  }

  const desktop = resolveResponsiveSpectatorParams(1440 / 900, DEFAULT_SPECTATOR_CAMERA_CONFIG);
  const mobilePortrait = resolveResponsiveSpectatorParams(390 / 844, DEFAULT_SPECTATOR_CAMERA_CONFIG);
  assert.equal(desktop.fov, DEFAULT_SPECTATOR_CAMERA_CONFIG.spectatorFov);
  assert.equal(desktop.prioritizeTrackAndKart, false);
  assert.equal(mobilePortrait.prioritizeTrackAndKart, true);
  assert.ok(mobilePortrait.elevationDeg >= desktop.elevationDeg);
});

test('track corners, banners, and kart stay inside viewport across all screen aspects and kart positions', () => {
  const controller = new SpectatorCameraController();
  const pose = createEmptyPose();
  const cam = new THREE.PerspectiveCamera(38, 1.6, 14, 4800);
  const proj = new THREE.Vector3();

  const aspects = [1440 / 900, 1280 / 800, 768 / 1024, 390 / 844, 844 / 390];
  const kartPositions: Array<[number, number]> = [
    [79.18, 16.91], // Starting grid
    [-95, -95],     // NW corner
    [95, -95],      // NE corner
    [-95, 95],      // SW corner
    [95, 95],       // SE corner
  ];

  const criticalWorldPoints = [
    new THREE.Vector3(-104, 0.2, -104),
    new THREE.Vector3(104, 0.2, -104),
    new THREE.Vector3(-104, 0.2, 104),
    new THREE.Vector3(104, 0.2, 104),
    new THREE.Vector3(40 * TRACK_LAYOUT_SCALE, BANNER_TOTAL_HEIGHT, 10 * TRACK_LAYOUT_SCALE),
    new THREE.Vector3(40 * TRACK_LAYOUT_SCALE, BANNER_TOTAL_HEIGHT, 31 * TRACK_LAYOUT_SCALE),
  ];

  for (const aspect of aspects) {
    for (const [kx, kz] of kartPositions) {
      controller.computeDesiredPose(aspect, kx, kz, 0, pose);

      assert.ok(pose.elevationDeg >= 35 && pose.elevationDeg <= 55);
      assert.ok(pose.position.y > 180, `Camera height ${pose.position.y} too low for skyline view`);
      assert.ok(Math.abs(pose.target.x) <= 20 && Math.abs(pose.target.z) <= 20);

      cam.fov = pose.fov;
      cam.aspect = aspect;
      cam.near = pose.near;
      cam.far = pose.far;
      cam.position.copy(pose.position);
      cam.lookAt(pose.lookTarget);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);

      for (const pt of [...criticalWorldPoints, new THREE.Vector3(kx, 1.5, kz)]) {
        proj.copy(pt).project(cam);
        assert.ok(
          Math.abs(proj.x) <= 0.99 && Math.abs(proj.y) <= 0.99 && proj.z < 1,
          `Point (${pt.x}, ${pt.y}, ${pt.z}) projected outside viewport NDC (${proj.x.toFixed(3)}, ${proj.y.toFixed(3)}) at aspect=${aspect.toFixed(2)}`,
        );
      }
    }
  }
});

test('orbital drift stays bounded in the three-quarter skyline arc and update damps smoothly from follow mode', () => {
  const controller = new SpectatorCameraController();
  const pose = createEmptyPose();

  for (let t = 0; t <= 400; t += 10) {
    controller.computeDesiredPose(1440 / 900, 79, 17, t, pose);
    assert.ok(
      pose.azimuthDeg >= DEFAULT_SPECTATOR_CAMERA_CONFIG.spectatorAzimuth - 22.1 &&
        pose.azimuthDeg <= DEFAULT_SPECTATOR_CAMERA_CONFIG.spectatorAzimuth + 22.1,
    );
    assert.ok(pose.elevationDeg >= 35 && pose.elevationDeg <= 55);
  }

  // Snap to skyline, then move camera to a low follow-mode pose and transition back smoothly
  const cam = new THREE.PerspectiveCamera(46, 1440 / 900, 0.5, 4800);
  const orbitTarget = new THREE.Vector3();
  controller.snapToPose(cam, 1440 / 900, 79, 17, orbitTarget);

  cam.position.set(79, 4.4, 7);
  cam.fov = 46;
  cam.near = 0.5;
  cam.lookAt(79, 0.95, 20);
  cam.updateProjectionMatrix();

  let prevDist = cam.position.distanceTo(
    (() => {
      controller.computeDesiredPose(1440 / 900, 79, 17, 0, pose);
      return pose.position;
    })(),
  );

  let converged = false;
  for (let step = 0; step < 180; step++) {
    const res = controller.update(cam, 1440 / 900, 79, 17, 1 / 60, orbitTarget, true);
    assert.ok(!Number.isNaN(cam.position.x) && !Number.isNaN(cam.position.y) && !Number.isNaN(cam.position.z));
    assert.ok(!Number.isNaN(cam.quaternion.x) && !Number.isNaN(cam.quaternion.w));
    const currentDist = cam.position.distanceTo(pose.position);
    assert.ok(currentDist <= prevDist + 2.5, 'Camera should converge smoothly without jumping away');
    prevDist = currentDist;
    if (res.converged) {
      converged = true;
      break;
    }
  }
  assert.equal(converged, true, 'Returning from follow camera should converge within 3 seconds');
});
