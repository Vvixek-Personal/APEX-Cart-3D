import assert from 'node:assert/strict';
import test from 'node:test';
import { ProceduralSoundEngine, computeSimulatedGearAndRpm } from './soundEngine';

test('computeSimulatedGearAndRpm shifts smoothly from gear 1 to top gear and bounds RPM [0.18..1.0]', () => {
  const idle = computeSimulatedGearAndRpm(0, 32, 6);
  assert.equal(idle.gear, 1);
  assert.ok(idle.rpmNorm >= 0.18 && idle.rpmNorm <= 0.25);

  let prevGear = 1;
  for (const spd of [4, 10, 17, 24, 31]) {
    const res = computeSimulatedGearAndRpm(spd, 32, 6);
    assert.ok(res.gear >= prevGear, `Gear should not drop as speed increases (${spd} u/s)`);
    assert.ok(res.gear >= 1 && res.gear <= 6);
    assert.ok(res.rpmNorm >= 0.18 && res.rpmNorm <= 1.0);
    prevGear = res.gear;
  }
  assert.equal(prevGear, 6, 'Near top speed should reach 6th gear on 6-speed gearbox');
});

test('ProceduralSoundEngine degrades gracefully without Web Audio in headless Node and tracks mute state', () => {
  const engine = new ProceduralSoundEngine();
  assert.equal(engine.isMuted(), false);

  engine.setMuted(true);
  assert.equal(engine.isMuted(), true);
  engine.unlock();
  engine.playCountdownBeep(false);
  engine.playCountdownBeep(true);
  engine.playCheckpointChime();
  engine.playLapChime();
  engine.playWrongWayAlert();
  engine.playVehicleDoor(true);
  engine.playFinishFanfare();
  engine.update(
    {
      isDriving: true,
      bodyStyle: 'formula',
      speed: 28,
      maxSpeed: 36,
      throttle: true,
      braking: false,
      lateralSlip: 2.4,
      isDrifting: true,
      onKerb: true,
      onAsphalt: true,
      walkingSpeed: 0,
    },
    0.016,
  );
  engine.dispose();
});
