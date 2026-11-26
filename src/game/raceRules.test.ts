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

test('race rules reject skipped checkpoints, wrong-way finish crossings, and premature finish triggers', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 240);
  const checkpoints = generateCheckpoints(frames, 6);
  const { finish } = getBannerPlacements(curve);
  const finYaw = Math.atan2(finish.tangent.x, finish.tangent.z);
  const reverseYaw = finYaw + Math.PI;

  let state: RaceState = {
    ...createInitialRaceState(3, 6),
    status: 'racing',
    countdownSeconds: 0,
  };

  // 1. Attempting to cross FINISH without hitting all checkpoints does not advance lap
  state = updateRaceState(
    state,
    finish.position.x,
    finish.position.z,
    24,
    finYaw,
    0.05,
    checkpoints,
    finish.position,
    finish.tangent,
    { isDriving: true, trackFrames: frames },
  );
  assert.equal(state.lap, 1);

  // Collect all 6 checkpoints sequentially
  for (const cp of checkpoints) {
    const yaw = Math.atan2(cp.tangent.x, cp.tangent.z);
    state = updateRaceState(
      state,
      cp.position.x,
      cp.position.z,
      24,
      yaw,
      0.2,
      checkpoints,
      finish.position,
      finish.tangent,
      { isDriving: true, vehicleName: 'Apex Formula X', trackFrames: frames },
    );
  }
  assert.equal(state.currentCheckpointIndex, checkpoints.length);

  // 2. Approaching 9 units BEFORE the finish strip must NOT complete the lap early
  const beforeFinish = finish.position.clone().addScaledVector(finish.tangent, -9.0);
  state = updateRaceState(
    state,
    beforeFinish.x,
    beforeFinish.z,
    24,
    finYaw,
    0.05,
    checkpoints,
    finish.position,
    finish.tangent,
    { isDriving: true, vehicleName: 'Apex Formula X', trackFrames: frames },
  );
  assert.equal(state.lap, 1, 'Lap must not complete 9u before the checkered finish strip');

  // 3. Driving backward across the finish strip triggers wrong-way warning and does not complete lap
  let wrongWayState = state;
  for (let i = 0; i < 12; i++) {
    wrongWayState = updateRaceState(
      wrongWayState,
      finish.position.x,
      finish.position.z,
      20,
      reverseYaw,
      0.05,
      checkpoints,
      finish.position,
      finish.tangent,
      { isDriving: true, trackFrames: frames },
    );
  }
  assert.equal(wrongWayState.lap, 1, 'Reverse crossing must not count a lap');
  assert.equal(wrongWayState.isWrongWay, true, 'Driving opposite circuit tangent flags isWrongWay');

  // 4. Swept high-speed forward crossing over the finish strip completes lap cleanly
  const justBeforeFinish = finish.position.clone().addScaledVector(finish.tangent, -4.0);
  state = updateRaceState(
    state,
    justBeforeFinish.x,
    justBeforeFinish.z,
    28,
    finYaw,
    0.05,
    checkpoints,
    finish.position,
    finish.tangent,
    { isDriving: true, vehicleName: 'Apex Formula X', trackFrames: frames },
  );
  assert.equal(state.lap, 1);

  const afterFinish = finish.position.clone().addScaledVector(finish.tangent, 5.0);
  state = updateRaceState(
    state,
    afterFinish.x,
    afterFinish.z,
    28,
    finYaw,
    0.05,
    checkpoints,
    finish.position,
    finish.tangent,
    { isDriving: true, vehicleName: 'Apex Formula X', trackFrames: frames },
  );
  assert.equal(state.lap, 2);
  assert.ok(state.lastLapTime !== null && state.lastLapTime > 0);
  assert.equal(state.activeVehicleName, 'Apex Formula X');
});

test('walking on foot cannot start a race, collect checkpoints, or cross the finish line', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 240);
  const checkpoints = generateCheckpoints(frames, 6);
  const { finish } = getBannerPlacements(curve);
  const finYaw = Math.atan2(finish.tangent.x, finish.tangent.z);

  // Walking through South Gate does not start countdown
  let waitingState = createInitialRaceState(3, 6);
  waitingState = updateRaceState(
    waitingState,
    0,
    140,
    9,
    Math.PI,
    0.1,
    checkpoints,
    finish.position,
    finish.tangent,
    { isDriving: false },
  );
  assert.equal(waitingState.status, 'waiting');

  // Exiting car mid-race keeps elapsed clock ticking but blocks on-foot checkpoint/finish triggers
  let racingState: RaceState = {
    ...createInitialRaceState(3, 6),
    status: 'racing',
    countdownSeconds: 0,
    currentCheckpointIndex: checkpoints.length,
    activeVehicleName: 'Velocity GT',
  };
  racingState = updateRaceState(
    racingState,
    finish.position.x,
    finish.position.z,
    9,
    finYaw,
    0.25,
    checkpoints,
    finish.position,
    finish.tangent,
    { isDriving: false },
  );
  assert.equal(racingState.lap, 1, 'On-foot player must not trigger finish line');
  assert.ok(racingState.elapsedTime >= 0.24, 'Race clock continues advancing while on foot');
  assert.equal(racingState.activeVehicleName, 'Velocity GT');
});
