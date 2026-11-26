import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createInitialRaceState,
  generateCheckpoints,
  updateRaceState,
} from './raceRules';
import { createTrackCurve, sampleTrackFrames, getBannerPlacements } from '../track/trackLayout';

test('race countdown transitions to racing after countdown timer expires', () => {
  let state = createInitialRaceState(3, 4);
  assert.equal(state.status, 'countdown');

  // Step countdown
  for (let i = 0; i < 40; i++) {
    state = updateRaceState(state, 0, 0, 0, 0, 0.1, [], new THREE.Vector3(), new THREE.Vector3());
  }

  assert.equal(state.status, 'racing');
  assert.equal(state.lap, 1);
  assert.equal(state.currentCheckpointIndex, 0);
});

test('kart progresses through checkpoints in order and completes lap upon crossing finish line', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 60);
  const checkpoints = generateCheckpoints(frames, 4);
  const { finish } = getBannerPlacements(curve);

  let state = createInitialRaceState(3, 4);
  // Force status to racing
  state = { ...state, status: 'racing', countdownSeconds: 0 };

  assert.equal(state.lap, 1);
  assert.equal(state.currentCheckpointIndex, 0);

  // Drive kart through each checkpoint in order
  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    state = updateRaceState(
      state,
      cp.position.x,
      cp.position.z,
      15,
      Math.atan2(cp.tangent.x, cp.tangent.z),
      0.1,
      checkpoints,
      finish.position,
      finish.tangent,
    );
    assert.equal(state.currentCheckpointIndex, i + 1);
  }

  // Now cross finish line
  state = updateRaceState(
    state,
    finish.position.x,
    finish.position.z,
    15,
    Math.atan2(finish.tangent.x, finish.tangent.z),
    0.1,
    checkpoints,
    finish.position,
    finish.tangent,
  );

  assert.equal(state.lap, 2);
  assert.equal(state.currentCheckpointIndex, 0);
  assert.ok(state.bestLapTime !== null);
});

test('race finishes after 3 completed laps and records final time', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 60);
  const checkpoints = generateCheckpoints(frames, 2);
  const { finish } = getBannerPlacements(curve);

  let state = createInitialRaceState(3, 2);
  state = { ...state, status: 'racing', countdownSeconds: 0 };

  // Complete 3 laps
  for (let lap = 1; lap <= 3; lap++) {
    for (const cp of checkpoints) {
      state = updateRaceState(
        state,
        cp.position.x,
        cp.position.z,
        15,
        Math.atan2(cp.tangent.x, cp.tangent.z),
        0.1,
        checkpoints,
        finish.position,
        finish.tangent,
      );
    }
    state = updateRaceState(
      state,
      finish.position.x,
      finish.position.z,
      15,
      Math.atan2(finish.tangent.x, finish.tangent.z),
      0.1,
      checkpoints,
      finish.position,
      finish.tangent,
    );
  }

  assert.equal(state.isFinished, true);
  assert.equal(state.status, 'finished');
  assert.ok(state.finalTime !== null);
  assert.equal(state.lap, 3);
});
