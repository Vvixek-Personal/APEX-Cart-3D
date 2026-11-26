import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackCurve, sampleTrackFrames } from '../track/trackLayout';
import { createInitialKartState, stepKartPhysics } from './kartPhysics';
import { VEHICLE_CATALOG } from './vehicleCatalog';
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
  for (let i = 0; i < 320 && state.z >= 114; i++) {
    state = stepKartPhysics(state, driveInput, 0.05, frames);
    if (state.z < 150 && passedGateSpeed === 0) {
      passedGateSpeed = state.speed;
    }
  }

  assert.ok(state.z < 115, `Expected kart to enter stadium field (z < 115), got z=${state.z.toFixed(2)}`);
  assert.ok(passedGateSpeed > 20, `Kart should maintain high speed through open gate, got ${passedGateSpeed.toFixed(2)}`);
  assert.ok(state.speed > 15, `Kart should remain at driving speed on track spur, got ${state.speed.toFixed(2)}`);
});

test('town includes wide GTA-scale main roads plus narrower side lanes', () => {
  const widths = TOWN_ROADS.map((r) => (r.axis === 'ns' ? r.xMax - r.xMin : r.zMax - r.zMin));
  const mainRoads = TOWN_ROADS.filter((r) => {
    const width = r.axis === 'ns' ? r.xMax - r.xMin : r.zMax - r.zMin;
    return width >= 18;
  });
  const sideLanes = TOWN_ROADS.filter((r) => {
    const width = r.axis === 'ns' ? r.xMax - r.xMin : r.zMax - r.zMin;
    return width <= 9;
  });
  const twoLaneRoads = TOWN_ROADS.filter((r) => r.lanes >= 2);
  const narrowest = Math.min(...widths);

  assert.ok(mainRoads.length >= 1, 'Town should have at least one wide main avenue');
  assert.ok(sideLanes.length >= 5, 'Town should keep several narrower side lanes');
  assert.ok(twoLaneRoads.length >= 6, 'Major streets should carry two lanes or more');
  assert.ok(narrowest >= 8, 'Even neighborhood lanes stay GTA-scale generous (>= 8 units)');
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

  // 3. Welcome Archway stone pier at x = -12, z = 212 blocks penetration while center road (x = 0) is open
  const pierHit = stepKartPhysics(
    { ...createInitialKartState(curve), x: -12, z: 213.8, yaw: Math.PI, speed: 16 },
    { accelerate: true, brakeReverse: false, steerLeft: false, steerRight: false },
    0.05,
    frames,
  );
  assert.ok(
    Math.hypot(pierHit.x - -12, pierHit.z - 212.0) > 1.4,
    'Welcome Archway stone pier must collide cleanly with vehicles',
  );
  let clearRun = { ...createInitialKartState(curve), x: 0, z: 213.8, yaw: Math.PI, speed: 16 };
  for (let i = 0; i < 3; i++) {
    clearRun = stepKartPhysics(clearRun, { accelerate: true, brakeReverse: false, steerLeft: false, steerRight: false }, 0.05, frames);
  }
  assert.ok(clearRun.z < 212.4, 'Center of the widened gate must stay open for vehicles');
});

test('handbrake slides scrub speed and releasing the handbrake never awards free turbo', () => {
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

  // Releasing the handbrake restores grip, not an arcade turbo boost.
  const releaseSpeed = state.speed;
  state = stepKartPhysics(
    state,
    { accelerate: true, brakeReverse: false, steerLeft: false, steerRight: false, drift: false },
    0.05,
    frames,
  );
  assert.equal(state.isDrifting, false);
  assert.equal(state.boostTimer, 0);
  assert.ok(state.speed - releaseSpeed <= VEHICLE_CATALOG.big_kart.stats.accelRate * .05);
});

const gas = { accelerate: true, brakeReverse: false, steerLeft: false, steerRight: false };
const coast = { ...gas, accelerate: false };

// Fixed paved position = an unbounded straight-road dynamometer. This isolates
// longitudinal tuning from intersections, building collisions and map bounds.
function roadRun(specId: string, seconds: number, hz = 60, initialSpeed = 0, input = gas) {
  let state = { ...createInitialKartState(), speed: initialSpeed };
  const stats = VEHICLE_CATALOG[specId].stats;
  let distance = 0;
  for (let frame = 0; frame < seconds * hz; frame++) {
    const before = 300;
    state = stepKartPhysics({ ...state, x: 0, z: before, yaw: Math.PI }, input, 1 / hz, [], stats);
    distance += before - state.z;
  }
  return { state, distance };
}

test('every vehicle takes more than two seconds to reach 60 km/h, with a progressive launch', () => {
  for (const spec of Object.values(VEHICLE_CATALOG)) {
    const launch = roadRun(spec.id, .1);
    const twoSeconds = roadRun(spec.id, 2);
    assert.ok(launch.state.speed < .3, `${spec.name}: no instant throttle spike`);
    assert.ok(twoSeconds.state.speed * 3.6 < 42, `${spec.name}: speed after 2s is ${twoSeconds.state.speed * 3.6}`);
    assert.ok(twoSeconds.state.speed * 3.6 > 15, `${spec.name}: must not feel stuck`);
    assert.ok(roadRun(spec.id, 12).state.speed > 60 / 3.6, `${spec.name}: 60 km/h must remain reachable`);
  }
});

test('vehicle character is preserved: formula accelerates faster than GT, then kart and cruiser', () => {
  const speed = (id: string) => roadRun(id, 2).state.speed;
  assert.ok(speed('formula_open') > speed('sport_gt'));
  assert.ok(speed('sport_gt') > speed('big_kart'));
  assert.ok(speed('big_kart') > speed('street_cruiser'));
});

test('acceleration is stable at 20, 30, 60 and 120 FPS and power tapers near top speed', () => {
  const reference = roadRun('sport_gt', 6).state.speed;
  for (const fps of [20, 30, 120]) {
    assert.ok(Math.abs(roadRun('sport_gt', 6, fps).state.speed - reference) < .15);
  }
  const top = VEHICLE_CATALOG.sport_gt.stats.maxForwardSpeed;
  const nearTop = roadRun('sport_gt', 1, 60, top - 1).state.speed;
  const launch = roadRun('sport_gt', 1).state.speed;
  assert.ok(nearTop - (top - 1) < launch);
  assert.ok(roadRun('sport_gt', 60).state.speed <= top);
});

test('lifting coasts naturally; braking from 60 km/h stops in a plausible distance', () => {
  const speed = 60 / 3.6;
  const rolling = roadRun('sport_gt', 2, 60, speed, coast);
  const braking = roadRun('sport_gt', 1.8, 60, speed, { ...coast, brakeReverse: true });
  assert.ok(rolling.state.speed > speed * .8, 'Lifting must not act like full brakes');
  assert.ok(Math.abs(braking.state.speed) < .5);
  assert.ok(braking.distance > 12 && braking.distance < 18, `Stopping distance: ${braking.distance} m`);
});

test('high-speed steering respects tire grip and the displayed speed is actual m/s', () => {
  const state = stepKartPhysics({ ...createInitialKartState(), x: 0, z: 300, speed: 25, steerAngle: 1 }, { ...gas, steerLeft: true }, 1/60, []);
  assert.ok(Math.abs(state.yawRate! * state.speed) <= 9.81);
  const moved = stepKartPhysics({ ...createInitialKartState(), x: 0, z: 300, speed: 10 }, coast, .05, []);
  assert.ok(Math.abs((300 - moved.z) / .05 - moved.speed) < 1e-8);
});
