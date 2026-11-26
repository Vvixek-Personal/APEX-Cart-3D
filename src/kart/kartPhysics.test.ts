import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackCurve, sampleTrackFrames } from '../track/trackLayout';
import { createInitialKartState, stepKartPhysics } from './kartPhysics';
import {
  KART_TOWN_SPAWN,
  TOWN_BLOCKS,
  TOWN_BUILDINGS,
  TOWN_ROADS,
  UNIFORM_BLOCK_DEPTH,
  UNIFORM_BLOCK_WIDTH,
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

test('every town block shares the exact same uniform width and depth measurements', () => {
  assert.equal(TOWN_BLOCKS.length, 24);
  for (const blk of TOWN_BLOCKS) {
    const w = Math.round((blk.xMax - blk.xMin) * 1000) / 1000;
    const d = Math.round((blk.zMax - blk.zMin) * 1000) / 1000;
    assert.equal(w, UNIFORM_BLOCK_WIDTH, `Block ${blk.id} width expected ${UNIFORM_BLOCK_WIDTH}, got ${w}`);
    assert.equal(d, UNIFORM_BLOCK_DEPTH, `Block ${blk.id} depth expected ${UNIFORM_BLOCK_DEPTH}, got ${d}`);
  }
});

test('all town buildings fit strictly inside uniform blocks without blocking roads', () => {
  for (const b of TOWN_BUILDINGS) {
    const bx1 = b.x - b.w * 0.5;
    const bx2 = b.x + b.w * 0.5;
    const bz1 = b.z - b.d * 0.5;
    const bz2 = b.z + b.d * 0.5;
    const insideBlock = TOWN_BLOCKS.some(
      (blk) => bx1 >= blk.xMin && bx2 <= blk.xMax && bz1 >= blk.zMin && bz2 <= blk.zMax,
    );
    assert.ok(insideBlock, `Building ${b.id} must sit cleanly inside a uniform block`);
  }
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

  // Drive north along Main Avenue straight through South Gate (z = 150) onto track spur (z in [99, 120])
  let passedGateSpeed = 0;
  for (let i = 0; i < 152; i++) {
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

test('interior AABB ejection, wall velocity projection, and banner/archway colliders behave realistically', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 240);
  const b = TOWN_BUILDINGS[0];

  // 1. Kart placed directly inside a building AABB is cleanly ejected outside
  const insideBuilding = {
    ...createInitialKartState(curve),
    x: b.x,
    z: b.z,
    speed: 0,
  };
  const ejected = stepKartPhysics(
    insideBuilding,
    { accelerate: false, brakeReverse: false, steerLeft: false, steerRight: false },
    0.05,
    frames,
  );
  const outsideX =
    ejected.x <= b.x - b.w * 0.5 - 0.35 || ejected.x >= b.x + b.w * 0.5 + 0.35;
  const outsideZ =
    ejected.z <= b.z - b.d * 0.5 - 0.35 || ejected.z >= b.z + b.d * 0.5 + 0.35;
  assert.ok(outsideX || outsideZ, 'Kart spawned inside building AABB must be ejected outside');

  // 2. Head-on wall collision zeroes normal forward speed instead of reporting phantom speed
  let ramState = {
    ...createInitialKartState(curve),
    x: b.x,
    z: b.z + b.d * 0.5 + 2.2,
    yaw: Math.PI, // Facing North directly into south wall of building
    speed: 22,
  };
  for (let i = 0; i < 20; i++) {
    ramState = stepKartPhysics(
      ramState,
      { accelerate: true, brakeReverse: false, steerLeft: false, steerRight: false },
      0.05,
      frames,
    );
  }
  assert.ok(
    Math.abs(ramState.speed) < 0.8,
    `Head-on wall contact must kill forward speed instead of phantom speed, got ${ramState.speed.toFixed(2)}`,
  );

  // 3. Welcome Archway pier at x = -6.5, z = 212 blocks penetration while center road (x = 0) is open
  const pierHit = stepKartPhysics(
    { ...createInitialKartState(curve), x: -6.5, z: 213.8, yaw: Math.PI, speed: 16 },
    { accelerate: true, brakeReverse: false, steerLeft: false, steerRight: false },
    0.05,
    frames,
  );
  assert.ok(
    Math.hypot(pierHit.x - -6.5, pierHit.z - 212.0) > 1.4,
    'Welcome Archway stone pier must collide cleanly with vehicles',
  );
});

test('handbrake drift charges boost while cornering and awards exit turbo boost on release', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 240);

  // Place kart on wide straightaway moving fast, initiate drift + left turn
  let state = {
    ...createInitialKartState(curve),
    x: 0,
    z: -92,
    yaw: Math.PI * 0.5,
    speed: 26,
  };

  for (let i = 0; i < 22; i++) {
    state = stepKartPhysics(
      state,
      { accelerate: true, brakeReverse: false, steerLeft: true, steerRight: false, drift: true },
      0.05,
      frames,
    );
  }
  assert.equal(state.isDrifting, true);
  assert.ok((state.driftCharge ?? 0) >= 0.45, `Expected driftCharge >= 0.45, got ${state.driftCharge}`);

  // Release drift -> triggers exit turbo boost
  state = stepKartPhysics(
    state,
    { accelerate: true, brakeReverse: false, steerLeft: false, steerRight: false, drift: false },
    0.05,
    frames,
  );
  assert.equal(state.isDrifting, false);
  assert.ok((state.boostTimer ?? 0) > 0.3, `Expected active boostTimer on drift release, got ${state.boostTimer}`);
});
