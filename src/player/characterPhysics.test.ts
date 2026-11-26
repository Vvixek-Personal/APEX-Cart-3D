import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARACTER_PHYSICS,
  createInitialCharacterState,
  enterVehicle,
  exitVehicle,
  findNearestVehicle,
  stepCharacterPhysics,
} from './characterPhysics';
import { TOWN_VEHICLE_SPAWNS, VEHICLE_CATALOG } from '../kart/vehicleCatalog';
import { createTrackCurve, sampleTrackFrames } from '../track/trackLayout';
import { stepKartPhysics } from '../kart/kartPhysics';

test('character spawns walking on Main Avenue within reach of oversized Mega Kart', () => {
  const charState = createInitialCharacterState();
  assert.equal(charState.mode, 'walking');
  assert.equal(charState.activeVehicleId, null);

  const targets = TOWN_VEHICLE_SPAWNS.map((s) => ({
    instanceId: s.instanceId,
    x: s.x,
    z: s.z,
    yaw: s.yaw,
    radius: VEHICLE_CATALOG[s.specId].stats.kartRadius,
  }));

  const nearest = findNearestVehicle(charState.x, charState.z, targets);
  assert.ok(nearest, 'Spawned character should immediately be within range of a vehicle');
  assert.equal(nearest.vehicle.instanceId, 'veh_mega_kart');
  assert.ok(
    nearest.distance <= CHARACTER_PHYSICS.enterRange,
    `Mega Kart distance ${nearest.distance.toFixed(2)} must be <= ${CHARACTER_PHYSICS.enterRange}`,
  );
});

test('character walks, sprints, and turns smoothly without getting stuck', () => {
  let state = createInitialCharacterState();
  const initialZ = state.z;

  const walkInput = {
    accelerate: true,
    brakeReverse: false,
    steerLeft: false,
    steerRight: false,
  };

  for (let i = 0; i < 30; i++) {
    state = stepCharacterPhysics(state, walkInput, false, 0.05);
  }
  assert.ok(state.z < initialZ - 8, 'Walking north should decrease Z along Main Avenue');
  assert.ok(state.walkCycle > 5, 'Walk stride cycle should advance while walking');

  const sprintBeforeZ = state.z;
  for (let i = 0; i < 20; i++) {
    state = stepCharacterPhysics(state, walkInput, true, 0.05);
  }
  assert.equal(state.isSprinting, true);
  assert.ok(state.z < sprintBeforeZ - 10, 'Sprinting should cover ground faster than walking');
});

test('player can enter any chosen car, drive it, exit, and swap to another car', () => {
  let charState = createInitialCharacterState();
  const megaKartSpawn = TOWN_VEHICLE_SPAWNS.find((v) => v.instanceId === 'veh_mega_kart')!;
  const gtSpawn = TOWN_VEHICLE_SPAWNS.find((v) => v.instanceId === 'veh_main_gt')!;

  const megaTarget = {
    instanceId: megaKartSpawn.instanceId,
    x: megaKartSpawn.x,
    z: megaKartSpawn.z,
    yaw: megaKartSpawn.yaw,
    radius: VEHICLE_CATALOG.big_kart.stats.kartRadius,
  };
  const gtTarget = {
    instanceId: gtSpawn.instanceId,
    x: gtSpawn.x,
    z: gtSpawn.z,
    yaw: gtSpawn.yaw,
    radius: VEHICLE_CATALOG.sport_gt.stats.kartRadius,
  };

  // Enter Mega Kart
  charState = enterVehicle(charState, megaTarget);
  assert.equal(charState.mode, 'driving');
  assert.equal(charState.activeVehicleId, 'veh_mega_kart');

  // Exit Mega Kart safely beside it
  charState = exitVehicle(charState, megaTarget);
  assert.equal(charState.mode, 'walking');
  assert.equal(charState.activeVehicleId, null);
  const distFromMega = Math.hypot(charState.x - megaTarget.x, charState.z - megaTarget.z);
  assert.ok(distFromMega >= megaTarget.radius + CHARACTER_PHYSICS.radius - 0.05);

  // Enter Velocity GT sports coupe next
  charState = enterVehicle(charState, gtTarget);
  assert.equal(charState.mode, 'driving');
  assert.equal(charState.activeVehicleId, 'veh_main_gt');

  // Drive Velocity GT forward with a progressive, realistic launch
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 240);
  let gtState = {
    x: gtSpawn.x,
    z: gtSpawn.z,
    yaw: gtSpawn.yaw,
    speed: 0,
    steerAngle: 0,
    wheelSpin: 0,
    onTrack: true,
  };
  for (let i = 0; i < 60; i++) {
    gtState = stepKartPhysics(
      gtState,
      { accelerate: true, brakeReverse: false, steerLeft: false, steerRight: false },
      0.05,
      frames,
      VEHICLE_CATALOG.sport_gt.stats,
    );
  }
  assert.ok(gtState.speed > 10 && gtState.speed < 16, `Velocity GT should reach 36–58 km/h after 3 seconds, got ${(gtState.speed * 3.6).toFixed(2)} km/h`);
});

test('big kart and multi-car fleet have enlarged dimensions and valid spawns', () => {
  assert.ok(VEHICLE_CATALOG.big_kart.stats.kartRadius >= 1.35, 'Mega Kart must have enlarged collision radius');
  assert.ok(TOWN_VEHICLE_SPAWNS.length >= 8, 'Town should contain multiple selectable parked cars and karts');

  const uniqueIds = new Set(TOWN_VEHICLE_SPAWNS.map((s) => s.instanceId));
  assert.equal(uniqueIds.size, TOWN_VEHICLE_SPAWNS.length);
  for (const s of TOWN_VEHICLE_SPAWNS) {
    assert.ok(VEHICLE_CATALOG[s.specId], `Missing vehicle spec ${s.specId}`);
  }
});

test('exitVehicle automatically falls back to passenger/rear side when driver door is blocked', () => {
  const vehicle = {
    instanceId: 'veh_test',
    x: 0,
    z: 245,
    yaw: Math.PI, // Facing North (-Z), so left driver side is at -X
    radius: 1.5,
  };
  const drivingState = enterVehicle(createInitialCharacterState(), vehicle);

  // Place a blocking parked vehicle directly on the left driver-side door (-X)
  const blocker = { x: -3.0, z: 245, radius: 1.6 };
  const exited = exitVehicle(drivingState, vehicle, [blocker]);

  assert.equal(exited.mode, 'walking');
  const distToBlocker = Math.hypot(exited.x - blocker.x, exited.z - blocker.z);
  assert.ok(
    distToBlocker >= blocker.radius + CHARACTER_PHYSICS.radius - 0.05,
    `Exited character must not overlap blocking car (dist=${distToBlocker.toFixed(2)})`,
  );
  assert.ok(exited.x > 1.5, `Character should exit on unobstructed right side (+X), got x=${exited.x.toFixed(2)}`);
});
