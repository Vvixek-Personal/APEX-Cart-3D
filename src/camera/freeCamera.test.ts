import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  FreeCameraController,
  createEmptyFreeCameraInput,
  getFreeCameraMinHeight,
} from './freeCamera';

test('syncFromCamera initializes upright yaw and pitch with zero roll', () => {
  const cam = new THREE.PerspectiveCamera(40, 1.6, 10, 4800);
  cam.position.set(220, 180, 310);
  cam.lookAt(10, 6, -20);

  const expectedForward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);

  const ctrl = new FreeCameraController();
  ctrl.syncFromCamera(cam);

  const syncedForward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  assert.ok(syncedForward.distanceTo(expectedForward) < 1e-4);

  const euler = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
  assert.ok(Math.abs(euler.z) < 1e-6, 'Camera roll must remain 0');
});

test('ground-plane WASD movement stays on XZ relative to heading even when pitched down', () => {
  const cam = new THREE.PerspectiveCamera(45, 1.6, 1, 4800);
  const ctrl = new FreeCameraController();
  ctrl.currentPosition.set(0, 100, 0);
  ctrl.targetPosition.set(0, 100, 0);
  ctrl.currentYaw = Math.PI / 2; // Facing -X
  ctrl.targetYaw = Math.PI / 2;
  ctrl.currentPitch = -1.1; // Looking steeply down ~63 deg
  ctrl.targetPitch = -1.1;

  const input = createEmptyFreeCameraInput();
  input.moveForward = true;

  for (let i = 0; i < 20; i++) {
    ctrl.update(cam, input, 0.05);
  }

  assert.ok(cam.position.x < -20, 'Should move forward along -X heading');
  assert.ok(Math.abs(cam.position.z) < 1e-3, 'Pure forward move should stay on heading');
  assert.ok(Math.abs(cam.position.y - 100) < 1e-3, 'Ground-plane move should not alter Y height');
});

test('R/F changes height on Y axis and clamps cleanly above ground across track, stadium, and outer terrain', () => {
  const cam = new THREE.PerspectiveCamera(45, 1.6, 1, 4800);
  const ctrl = new FreeCameraController();
  ctrl.currentPosition.set(50, 20, 50);
  ctrl.targetPosition.set(50, 20, 50);

  const riseInput = createEmptyFreeCameraInput();
  riseInput.rise = true;
  for (let i = 0; i < 30; i++) {
    ctrl.update(cam, riseInput, 0.05);
  }
  assert.ok(cam.position.y > 60, 'R should rise camera cleanly');

  const descendInput = createEmptyFreeCameraInput();
  descendInput.descend = true;
  for (let i = 0; i < 200; i++) {
    ctrl.update(cam, descendInput, 0.05);
  }
  const minH = getFreeCameraMinHeight(cam.position.x, cam.position.z);
  assert.ok(cam.position.y >= minH - 1e-4, 'Camera must not go below track/ground clearance');
});

test('Shift increases movement speed and Ctrl decreases movement speed', () => {
  const runDistance = (faster: boolean, slower: boolean): number => {
    const cam = new THREE.PerspectiveCamera(45, 1.6, 1, 4800);
    const ctrl = new FreeCameraController();
    ctrl.currentPosition.set(0, 80, 0);
    ctrl.targetPosition.set(0, 80, 0);
    ctrl.currentYaw = 0;
    ctrl.targetYaw = 0;
    ctrl.currentPitch = 0;
    ctrl.targetPitch = 0;

    const input = createEmptyFreeCameraInput();
    input.moveForward = true;
    input.faster = faster;
    input.slower = slower;
    for (let i = 0; i < 20; i++) {
      ctrl.update(cam, input, 0.05);
    }
    return Math.abs(cam.position.z);
  };

  const normalDist = runDistance(false, false);
  const fastDist = runDistance(true, false);
  const slowDist = runDistance(false, true);

  assert.ok(fastDist > normalDist * 1.8, 'Shift should accelerate movement');
  assert.ok(slowDist < normalDist * 0.5, 'Ctrl should slow movement');
});

test('look, pan, dolly, and wide stadium roaming keep camera upright without clipping or confining to track', () => {
  const cam = new THREE.PerspectiveCamera(45, 1.6, 1, 4800);
  const ctrl = new FreeCameraController();
  ctrl.currentPosition.set(0, 120, 260);
  ctrl.targetPosition.set(0, 120, 260);
  ctrl.currentYaw = 0;
  ctrl.targetYaw = 0;
  ctrl.currentPitch = -0.3;
  ctrl.targetPitch = -0.3;

  // Extreme upward & downward pitch clamping prevents flipping
  ctrl.addLookDelta(300, -5000, false);
  ctrl.update(cam, createEmptyFreeCameraInput(), 0.05);
  let up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  assert.ok(up.y > 0.01, 'Camera must stay upright when pitched steeply up');

  ctrl.addLookDelta(-200, 10000, true);
  for (let i = 0; i < 40; i++) {
    ctrl.update(cam, createEmptyFreeCameraInput(), 0.05);
  }
  up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  assert.ok(up.y > 0.01, 'Camera must stay upright when pitched steeply down');
  const euler = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
  assert.ok(Math.abs(euler.z) < 1e-6, 'Camera roll must remain zero');

  // Panning and dollying move camera position without confinement to track
  const beforePos = cam.position.clone();
  ctrl.addPanDelta(120, -80);
  ctrl.addDolly(15);
  for (let i = 0; i < 30; i++) {
    ctrl.update(cam, createEmptyFreeCameraInput(), 0.05);
  }
  assert.ok(cam.position.distanceTo(beforePos) > 10);

  // Confirm roaming beyond stadium & park (beyond +-212) is unrestricted up to +-900
  ctrl.targetPosition.set(480, 90, -520);
  for (let i = 0; i < 60; i++) {
    ctrl.update(cam, createEmptyFreeCameraInput(), 0.05);
  }
  assert.ok(cam.position.x > 400 && cam.position.z < -400);
});
