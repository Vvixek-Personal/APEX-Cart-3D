import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { FollowCameraController, FollowCameraPose } from './followCamera';
import { VEHICLE_CATALOG } from '../kart/vehicleCatalog';

function createEmptyPose(): FollowCameraPose {
  return {
    position: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
    fov: 46,
    near: 0.4,
    posRate: 10,
    lookRate: 10,
  };
}

test('FollowCameraController computes distinct valid poses across all 4 perspectives in driving & walking modes', () => {
  const ctrl = new FollowCameraController();
  const kartSpec = VEHICLE_CATALOG.big_kart;
  const gtSpec = VEHICLE_CATALOG.sport_gt;

  for (const persp of ['chase', 'cockpit', 'hood', 'wide'] as const) {
    const drvPose = ctrl.computeDesiredPose(
      persp,
      {
        mode: 'driving',
        x: 12,
        y: 0,
        z: 45,
        yaw: Math.PI,
        speed: 22,
        steerAngle: 0.35,
        lateralSpeed: 1.5,
        vehicleSpec: kartSpec,
      },
      createEmptyPose(),
    );
    assert.ok(Number.isFinite(drvPose.position.x) && Number.isFinite(drvPose.position.y));
    assert.ok(drvPose.position.y > 0.5, `${persp} driving camera must stay above track surface`);
    assert.ok(drvPose.fov >= 44 && drvPose.fov <= 76);

    const walkPose = ctrl.computeDesiredPose(
      persp,
      {
        mode: 'walking',
        x: -5,
        y: -0.6,
        z: 240,
        yaw: Math.PI,
        speed: 8,
        vehicleSpec: null,
      },
      createEmptyPose(),
    );
    assert.ok(walkPose.position.y > -0.2, `${persp} walking camera must stay above sidewalk`);
  }

  // Enclosed sports car cockpit sits offset on driver side whereas open-wheel kart is centered
  const kartCockpit = ctrl.computeDesiredPose(
    'cockpit',
    { mode: 'driving', x: 0, y: 0, z: 0, yaw: 0, speed: 0, vehicleSpec: kartSpec },
    createEmptyPose(),
  );
  const gtCockpit = ctrl.computeDesiredPose(
    'cockpit',
    { mode: 'driving', x: 0, y: 0, z: 0, yaw: 0, speed: 0, vehicleSpec: gtSpec },
    createEmptyPose(),
  );
  assert.equal(Math.abs(kartCockpit.position.x), 0);
  assert.ok(Math.abs(gtCockpit.position.x) > 0.25);
});

test('FollowCameraController widens FOV under high speed & boost and supports instant snap vs smooth damping', () => {
  const ctrl = new FollowCameraController();
  const spec = VEHICLE_CATALOG.sport_gt;

  const idlePose = ctrl.computeDesiredPose(
    'chase',
    { mode: 'driving', x: 0, y: 0, z: 0, yaw: 0, speed: 0, vehicleSpec: spec },
    createEmptyPose(),
  );
  const boostPose = ctrl.computeDesiredPose(
    'chase',
    {
      mode: 'driving',
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      speed: spec.stats.maxForwardSpeed,
      boostTimer: 0.8,
      isDrifting: true,
      vehicleSpec: spec,
    },
    createEmptyPose(),
  );
  assert.ok(boostPose.fov > idlePose.fov + 6, 'Boost + top speed should widen chase FOV');

  const cam = new THREE.PerspectiveCamera(46, 16 / 9, 0.4, 4800);
  const look = new THREE.Vector3();
  ctrl.update(
    cam,
    look,
    'chase',
    { mode: 'driving', x: 20, y: 0, z: -30, yaw: Math.PI * 0.5, speed: 15, vehicleSpec: spec },
    0.016,
    true,
  );
  const snappedDist = cam.position.distanceTo(new THREE.Vector3(20, 0, -30));
  assert.ok(snappedDist > 8 && snappedDist < 22, 'Snapped chase camera must frame vehicle immediately');
});
