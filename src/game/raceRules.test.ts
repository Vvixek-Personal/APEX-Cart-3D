import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createTrackCurve,
  getBannerPlacements,
  sampleTrackFrames,
} from '../track/trackLayout';
import {
  RaceState,
  createInitialRaceState,
  generateCheckpoints,
  updateRaceState,
} from './raceRules';
import { KART_TOWN_SPAWN } from '../scene/townLayout';

test('race remains in waiting status while driving in town roads', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 240);
  const checkpoints = generateCheckpoints(frames, 6);
  const { finish } = getBannerPlacements(curve);

  let state = createInitialRaceState(3, 6);
  assert.equal(state.status, 'waiting');

  // Simulate driving in town (z = 318 down to z = 180)
  for (const z of [318, 280, 240, 200, 175]) {
    state = updateRaceState(
      state,
      KART_TOWN_SPAWN.x,
      z,
      20,
      Math.PI,
      0.05,
      checkpoints,
      finish.position,
      finish.tangent,
    );
    assert.equal(state.status, 'waiting', `Race must stay in waiting at z=${z}`);
  }
});

test('countdown triggers once upon entering stadium gate and transitions to racing', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 240);
  const checkpoints = generateCheckpoints(frames, 6);
  const { finish } = getBannerPlacements(curve);

  let state = createInitialRaceState(3, 6);

  // Cross inside stadium South Gate (z < 156)
  state = updateRaceState(
    state,
    0,
    150,
    20,
    Math.PI,
    0.05,
    checkpoints,
    finish.position,
    finish.tangent,
  );
  assert.equal(state.status, 'countdown');

  // Advance 4 seconds of countdown
  for (let i = 0; i < 80; i++) {
    state = updateRaceState(
      state,
      0,
      150,
      0,
      Math.PI,
      0.05,
      checkpoints,
      finish.position,
      finish.tangent,
    );
  }
  assert.equal(state.status, 'racing');
  assert.equal(state.lap, 1);

  // Leaving or revisiting gate area does not re-trigger countdown
  state = updateRaceState(
    state,
    0,
    180,
    10,
    0,
    0.05,
    checkpoints,
    finish.position,
    finish.tangent,
  );
  assert.equal(state.status, 'racing');
});

test('checkpoints progress sequentially and finish line completes 3 laps', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 240);
  const checkpoints = generateCheckpoints(frames, 6);
  const { finish } = getBannerPlacements(curve);

  let state: RaceState = {
    ...createInitialRaceState(3, 6),
    status: 'racing',
    countdownSeconds: 0,
  };

  for (let lap = 1; lap <= 3; lap++) {
    for (let c = 0; c < checkpoints.length; c++) {
      const cp = checkpoints[c];
      const yaw = Math.atan2(cp.tangent.x, cp.tangent.z);
      state = updateRaceState(
        state,
        cp.position.x,
        cp.position.z,
        22,
        yaw,
        0.5,
        checkpoints,
        finish.position,
        finish.tangent,
      );
      assert.equal(state.currentCheckpointIndex, c + 1);
    }

    const finYaw = Math.atan2(finish.tangent.x, finish.tangent.z);
    state = updateRaceState(
      state,
      finish.position.x,
      finish.position.z,
      22,
      finYaw,
      0.5,
      checkpoints,
      finish.position,
      finish.tangent,
    );

    if (lap < 3) {
      assert.equal(state.lap, lap + 1);
      assert.equal(state.currentCheckpointIndex, 0);
      assert.equal(state.isFinished, false);
    } else {
      assert.equal(state.isFinished, true);
      assert.equal(state.status, 'finished');
      assert.ok((state.finalTime ?? 0) > 0);
    }
  }

  // Ensure THREE vector usage stays valid
  assert.ok(finish.position instanceof THREE.Vector3);
});
