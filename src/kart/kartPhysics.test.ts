import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTrackCurve,
  getBannerPlacements,
  sampleTrackFrames,
} from '../track/trackLayout';
import {
  KART_PHYSICS,
  KartInputState,
  KartState,
  createInitialKartState,
  isPositionOnTrack,
  stepKartPhysics,
} from './kartPhysics';

const NO_INPUT: KartInputState = {
  accelerate: false,
  brakeReverse: false,
  steerLeft: false,
  steerRight: false,
};

test('kart spawns on starting grid on-track facing the track direction', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 520);
  const { start } = getBannerPlacements(curve);
  const kart = createInitialKartState(curve);

  assert.equal(isPositionOnTrack(kart.x, kart.z, frames), true);

  const forwardX = Math.sin(kart.yaw);
  const forwardZ = Math.cos(kart.yaw);
  const alignment = forwardX * start.tangent.x + forwardZ * start.tangent.z;
  assert.ok(alignment > 0.999, `Expected kart facing track tangent, dot=${alignment}`);
});

test('kart accelerates smoothly, caps at top speed, brakes, and reverses', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 520);
  let kart = createInitialKartState(curve);

  // Accelerate along the main straight for 1.25 seconds (~20 units, still on asphalt)
  for (let i = 0; i < 75; i++) {
    kart = stepKartPhysics(
      kart,
      { ...NO_INPUT, accelerate: true },
      1 / 60,
      frames,
    );
  }
  assert.ok(
    kart.onTrack && kart.speed > 20 && kart.speed <= KART_PHYSICS.maxForwardSpeed + 0.01,
    `Expected speed capped near maxForwardSpeed on track, got ${kart.speed}`,
  );

  // Brake to stop then reverse
  for (let i = 0; i < 180; i++) {
    kart = stepKartPhysics(
      kart,
      { ...NO_INPUT, brakeReverse: true },
      1 / 60,
      frames,
    );
  }
  assert.ok(
    kart.speed < 0 && kart.speed >= -KART_PHYSICS.maxReverseSpeed - 0.01,
    `Expected negative reverse speed, got ${kart.speed}`,
  );
});

test('kart steers along heading when moving and does not turn while stationary', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 520);
  const initial = createInitialKartState(curve);

  // Stationary steering should not rotate yaw
  const stationary = stepKartPhysics(
    initial,
    { ...NO_INPUT, steerLeft: true },
    1 / 60,
    frames,
  );
  assert.equal(stationary.yaw, initial.yaw);

  // Moving steering should change yaw and displace along heading without sliding
  let moving = initial;
  for (let i = 0; i < 40; i++) {
    moving = stepKartPhysics(
      moving,
      { ...NO_INPUT, accelerate: true, steerLeft: true },
      1 / 60,
      frames,
    );
  }
  assert.ok(moving.yaw > initial.yaw + 0.15, 'Expected left steer to increase yaw');
});

test('driving onto grass reduces top speed while allowing recovery back onto track', () => {
  const curve = createTrackCurve();
  const frames = sampleTrackFrames(curve, 520);

  // Place kart clearly off-track on the grass at center (0, 0)
  let offTrackKart: KartState = {
    x: 0,
    z: 0,
    yaw: 0,
    speed: KART_PHYSICS.maxForwardSpeed,
    steerAngle: 0,
    wheelSpin: 0,
    onTrack: false,
  };
  assert.equal(isPositionOnTrack(offTrackKart.x, offTrackKart.z, frames), false);

  for (let i = 0; i < 120; i++) {
    offTrackKart = stepKartPhysics(
      offTrackKart,
      { ...NO_INPUT, accelerate: true },
      1 / 60,
      frames,
    );
  }

  assert.ok(
    offTrackKart.speed <= KART_PHYSICS.offTrackMaxSpeed + 0.05 &&
      offTrackKart.speed > 5,
    `Expected grass speed reduced to ~${KART_PHYSICS.offTrackMaxSpeed}, got ${offTrackKart.speed}`,
  );

  // Confirm widened track boundary: 7.5 units laterally from START centerline is on-track, 9.2 is grass
  const { start } = getBannerPlacements(curve);
  const wideAsphaltX = start.position.x + start.normal.x * 7.5;
  const wideAsphaltZ = start.position.z + start.normal.z * 7.5;
  const outsideGrassX = start.position.x + start.normal.x * 9.2;
  const outsideGrassZ = start.position.z + start.normal.z * 9.2;
  assert.equal(isPositionOnTrack(wideAsphaltX, wideAsphaltZ, frames), true);
  assert.equal(isPositionOnTrack(outsideGrassX, outsideGrassZ, frames), false);
});
