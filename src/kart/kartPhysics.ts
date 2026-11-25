import * as THREE from 'three';
import {
  FIELD_HALF,
  TRACK_HALF,
  TrackFrame,
  getBannerPlacements,
} from '../track/trackLayout';

export interface KartInputState {
  accelerate: boolean;
  brakeReverse: boolean;
  steerLeft: boolean;
  steerRight: boolean;
}

export interface KartState {
  x: number;
  z: number;
  yaw: number;          // Heading in radians (0 = +Z, +PI/2 = +X)
  speed: number;        // Signed forward speed along heading (units/s)
  steerAngle: number;   // Smoothed visual & steering input [-1, 1]
  wheelSpin: number;    // Accumulated wheel rotation angle (radians)
  onTrack: boolean;
}

export const KART_PHYSICS = {
  maxForwardSpeed: 26,
  maxReverseSpeed: 9,
  offTrackMaxSpeed: 11.5,
  accelRate: 22,
  reverseAccelRate: 15,
  brakeRate: 40,
  coastDrag: 9.5,
  offTrackDrag: 28,
  maxTurnRate: 2.3,
  steerResponseRate: 12,
  fieldMargin: 1.4,
} as const;

/**
 * Spawns the player kart on the starting grid behind the START banner,
 * facing forward along the track tangent.
 */
export function createInitialKartState(curve: THREE.CatmullRomCurve3): KartState {
  const { start } = getBannerPlacements(curve);
  // Place kart centered on the starting grid ~3.2 units behind the START gantry line
  const spawnX = start.position.x - start.tangent.x * 3.2;
  const spawnZ = start.position.z - start.tangent.z * 3.2;
  const yaw = Math.atan2(start.tangent.x, start.tangent.z);

  return {
    x: spawnX,
    z: spawnZ,
    yaw,
    speed: 0,
    steerAngle: 0,
    wheelSpin: 0,
    onTrack: true,
  };
}

/**
 * Computes minimum distance from world XZ point (x, z) to the closed track centerline.
 * Reuses the exact sampled track frames from trackLayout.ts.
 */
export function distanceToTrackCenterline(
  x: number,
  z: number,
  frames: ReadonlyArray<TrackFrame>,
): number {
  const n = frames.length;
  if (n === 0) return Infinity;

  let minDistSq = Infinity;
  for (let i = 0; i < n; i++) {
    const a = frames[i].position;
    const b = frames[(i + 1) % n].position;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lenSq = abx * abx + abz * abz;
    let t = 0;
    if (lenSq > 1e-8) {
      t = ((x - a.x) * abx + (z - a.z) * abz) / lenSq;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
    }
    const cx = a.x + abx * t;
    const cz = a.z + abz * t;
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < minDistSq) {
      minDistSq = d2;
    }
  }
  return Math.sqrt(minDistSq);
}

/**
 * Checks whether world XZ position lies on the asphalt ribbon (within TRACK_HALF).
 */
export function isPositionOnTrack(
  x: number,
  z: number,
  frames: ReadonlyArray<TrackFrame>,
): boolean {
  return distanceToTrackCenterline(x, z, frames) <= TRACK_HALF;
}

/**
 * Advances the kart physics by rawDt seconds using smooth arcade controls:
 * - Gradual acceleration, braking, reverse, and coasting
 * - Speed-responsive steering along heading (no sideways sliding)
 * - Grass speed reduction when off-track (still fully recoverable)
 */
export function stepKartPhysics(
  state: KartState,
  input: KartInputState,
  rawDt: number,
  frames: ReadonlyArray<TrackFrame>,
): KartState {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  if (dt === 0) return state;

  const onTrack = isPositionOnTrack(state.x, state.z, frames);
  const topSpeed = onTrack
    ? KART_PHYSICS.maxForwardSpeed
    : KART_PHYSICS.offTrackMaxSpeed;

  let speed = state.speed;

  // Throttle & Brake / Reverse
  if (input.accelerate && !input.brakeReverse) {
    if (speed < 0) {
      // Braking out of reverse
      speed = Math.min(0, speed + KART_PHYSICS.brakeRate * dt);
    } else if (speed < topSpeed) {
      speed = Math.min(topSpeed, speed + KART_PHYSICS.accelRate * dt);
    } else if (!onTrack) {
      // Smoothly bleed excess speed when entering grass at full speed
      speed = Math.max(topSpeed, speed - KART_PHYSICS.offTrackDrag * dt);
    }
  } else if (input.brakeReverse && !input.accelerate) {
    if (speed > 0) {
      // Braking from forward motion
      speed = Math.max(0, speed - KART_PHYSICS.brakeRate * dt);
    } else {
      // Reversing
      const maxRev = onTrack
        ? KART_PHYSICS.maxReverseSpeed
        : KART_PHYSICS.maxReverseSpeed * 0.65;
      speed = Math.max(-maxRev, speed - KART_PHYSICS.reverseAccelRate * dt);
    }
  } else {
    // Coasting deceleration
    const drag = onTrack ? KART_PHYSICS.coastDrag : KART_PHYSICS.offTrackDrag * 0.75;
    if (speed > 0) {
      speed = Math.max(0, speed - drag * dt);
    } else if (speed < 0) {
      speed = Math.min(0, speed + drag * dt);
    }
  }

  // Smooth steering input (-1 = steer right in +Y-up/heading coords, +1 = steer left)
  const rawSteer = (input.steerLeft ? 1 : 0) - (input.steerRight ? 1 : 0);
  const steerBlend = 1 - Math.exp(-KART_PHYSICS.steerResponseRate * dt);
  const steerAngle = state.steerAngle + (rawSteer - state.steerAngle) * steerBlend;

  // Speed-responsive steering: zero turn when stopped, smooth curve with speed
  const absSpeed = Math.abs(speed);
  const speedSteerFactor =
    absSpeed < 0.25
      ? 0
      : THREE.MathUtils.clamp(absSpeed / 7.5, 0.22, 1.0) *
        (1.0 - 0.14 * THREE.MathUtils.clamp((absSpeed - 14) / 12, 0, 1));
  const reverseSign = speed >= 0 ? 1 : -1;
  const yaw = state.yaw + steerAngle * KART_PHYSICS.maxTurnRate * speedSteerFactor * reverseSign * dt;

  // Move strictly along kart heading (no sideways sliding)
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  let nextX = state.x + forwardX * speed * dt;
  let nextZ = state.z + forwardZ * speed * dt;

  // Keep kart on the square field without trapping it behind invisible track walls
  const limit = FIELD_HALF - KART_PHYSICS.fieldMargin;
  if (nextX < -limit) {
    nextX = -limit;
    speed *= 0.6;
  } else if (nextX > limit) {
    nextX = limit;
    speed *= 0.6;
  }
  if (nextZ < -limit) {
    nextZ = -limit;
    speed *= 0.6;
  } else if (nextZ > limit) {
    nextZ = limit;
    speed *= 0.6;
  }

  const nextOnTrack = isPositionOnTrack(nextX, nextZ, frames);
  const wheelSpin = state.wheelSpin + (speed * dt) / 0.24;

  return {
    x: nextX,
    z: nextZ,
    yaw,
    speed,
    steerAngle,
    wheelSpin,
    onTrack: nextOnTrack,
  };
}
