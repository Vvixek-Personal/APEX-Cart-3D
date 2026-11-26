import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackCurve, sampleTrackFrames } from '../track/trackLayout';
import { createInitialKartState, stepKartPhysics } from './kartPhysics';
import {
  KART_TOWN_SPAWN,
  TOWN_ROADS,
  getWorldGroundY,
  isPositionOnTownRoad,
} from '../scene/townLayout';

test('kart spawns on town road facing north (not in stadium)', () => {
  const curve = createTrackCurve();
  const initial = createInitialKartState(curve);

  assert.equal(initial.x, KART_TOWN_SPAWN.x);
  assert.equal(initial.z, KART_TOWN_SPAWN.z);
  assert.ok(initial.z > 220, 'Spawn Z must be inside the town district south of stadium');
  assert.equal(isPositionOnTownRoad(initial.x, initial.z), true, 'Spawn point must lie on a town road');
  assert.ok(Math.abs(initial.yaw - Math.PI) < 1e-4, 'Kart must face North (-Z) toward stadium');
});

test('kart drives freely along town road and straight through open South Stadium Gate without walls', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 240);
  let state = createInitialKartState(curve);

  const driveInput = {
    accelerate: true,
    brakeReverse: false,
    steerLeft: false,
    steerRight: false,
  };

  // Drive north along Main Avenue from z = 318 straight through South Gate (z = 150) onto track (z < 110)
  let passedGateSpeed = 0;
  for (let i = 0; i < 190; i++) {
    state = stepKartPhysics(state, driveInput, 0.05, frames);
    if (state.z < 150 && passedGateSpeed === 0) {
      passedGateSpeed = state.speed;
    }
  }

  assert.ok(state.z < 115, `Expected kart to enter stadium field (z < 115), got z=${state.z.toFixed(2)}`);
  assert.ok(passedGateSpeed > 20, `Kart should maintain high speed through open gate, got ${passedGateSpeed.toFixed(2)}`);
  assert.ok(state.speed > 15, `Kart should remain at driving speed on track spur, got ${state.speed.toFixed(2)}`);
});

test('town includes small side roads and multiple lanes', () => {
  const smallRoads = TOWN_ROADS.filter((r) => {
    const width = r.axis === 'ns' ? r.xMax - r.xMin : r.zMax - r.zMin;
    return width <= 6.5;
  });
  const twoLaneRoads = TOWN_ROADS.filter((r) => r.lanes === 2);

  assert.ok(smallRoads.length >= 6, 'Town should have multiple small narrow roads/alleys');
  assert.ok(twoLaneRoads.length >= 4, 'Town should have multiple two-lane streets');
});

test('ground elevation ramps smoothly from town road up to stadium field', () => {
  const yTown = getWorldGroundY(0, 225);
  const yMidRamp = getWorldGroundY(0, 166);
  const yField = getWorldGroundY(0, 110);

  assert.ok(yTown < yMidRamp && yMidRamp < yField, 'Connector road should ramp monotonically into stadium');
  assert.equal(yField, 0);
});
