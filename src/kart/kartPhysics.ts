import * as THREE from 'three';
import {
  TRACK_HALF,
  TrackFrame,
  getBannerPlacements,
} from '../track/trackLayout';
import {
  KART_TOWN_SPAWN,
  TOWN_COLLIDERS,
  isPositionInMarketOrParkPath,
  isPositionOnTownRoad,
} from '../scene/townLayout';

export interface KartInputState {
  accelerate: boolean;
  brakeReverse: boolean;
  steerLeft: boolean;
  steerRight: boolean;
}

export interface KartState {
  x: number;
  z: number;
  yaw: number;          // Heading in radians (0 = +Z South, PI = -Z North)
  speed: number;        // Signed forward speed along heading (units/s)
  steerAngle: number;   // Smoothed visual & steering input [-1, 1]
  wheelSpin: number;    // Accumulated wheel rotation angle (radians)
  onTrack: boolean;     // True when on race track OR town paved road/parking lot
}

export const KART_PHYSICS = {
  maxForwardSpeed: 26,
  maxReverseSpeed: 9,
  offTrackMaxSpeed: 11.5,
  plazaMaxSpeed: 21,
  accelRate: 22,
  reverseAccelRate: 15,
  brakeRate: 40,
  coastDrag: 9.5,
  offTrackDrag: 28,
  maxTurnRate: 2.3,
  steerResponseRate: 12,
  kartRadius: 0.92,
  worldMinX: -174,
  worldMaxX: 174,
  worldMinZ: -196,
  worldMaxZ: 416,
} as const;

/**
 * Spawns the player kart on the Main Avenue road in the Town District,
 * facing North toward the market, park, and Stadium South Entrance.
 */
export function createInitialKartState(_curve?: THREE.CatmullRomCurve3): KartState {
  return {
    x: KART_TOWN_SPAWN.x,
    z: KART_TOWN_SPAWN.z,
    yaw: KART_TOWN_SPAWN.yaw,
    speed: 0,
    steerAngle: 0,
    wheelSpin: 0,
    onTrack: true,
  };
}

/**
 * Helper for spawning directly on the stadium starting grid if needed in tests.
 */
export function createGridKartState(curve: THREE.CatmullRomCurve3): KartState {
  const { start } = getBannerPlacements(curve);
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
 * Checks whether world XZ position is on a paved driving surface (track, town road, or parking lot).
 */
export function isPositionOnDrivableAsphalt(
  x: number,
  z: number,
  frames: ReadonlyArray<TrackFrame>,
): boolean {
  return isPositionOnTrack(x, z, frames) || isPositionOnTownRoad(x, z);
}

/**
 * Resolves smooth circle-vs-AABB collisions against town buildings, park features,
 * and stadium stand walls so the kart slides cleanly without getting stuck.
 */
function resolveStaticCollisions(
  x: number,
  z: number,
  radius: number,
): { x: number; z: number; collided: boolean } {
  let rx = x;
  let rz = z;
  let collided = false;

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < TOWN_COLLIDERS.length; i++) {
      const box = TOWN_COLLIDERS[i];
      const closestX = Math.max(box.xMin, Math.min(rx, box.xMax));
      const closestZ = Math.max(box.zMin, Math.min(rz, box.zMax));
      const dx = rx - closestX;
      const dz = rz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        collided = true;
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          rx += (dx / dist) * push;
          rz += (dz / dist) * push;
        } else {
          // Inside AABB: push out along nearest face
          const toLeft = Math.abs(rx - box.xMin);
          const toRight = Math.abs(box.xMax - rx);
          const toTop = Math.abs(rz - box.zMin);
          const toBottom = Math.abs(box.zMax - rz);
          const minEdge = Math.min(toLeft, toRight, toTop, toBottom);
          if (minEdge === toLeft) rx = box.xMin - radius;
          else if (minEdge === toRight) rx = box.xMax + radius;
          else if (minEdge === toTop) rz = box.zMin - radius;
          else rz = box.zMax + radius;
        }
      }
    }
  }

  return { x: rx, z: rz, collided };
}

/**
 * Advances the kart physics by rawDt seconds using smooth arcade controls:
 * - Full speed on race track, town roads, and parking lots
 * - Slightly moderated speed on market plazas / park paved paths
 * - Grass speed reduction when driving onto turf (fully recoverable)
 * - Smooth sliding collision against buildings, stands, and park monuments
 */
export function stepKartPhysics(
  state: KartState,
  input: KartInputState,
  rawDt: number,
  frames: ReadonlyArray<TrackFrame>,
): KartState {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  if (dt === 0) return state;

  const onAsphalt = isPositionOnDrivableAsphalt(state.x, state.z, frames);
  const onPlazaPath = !onAsphalt && isPositionInMarketOrParkPath(state.x, state.z);
  const topSpeed = onAsphalt
    ? KART_PHYSICS.maxForwardSpeed
    : onPlazaPath
      ? KART_PHYSICS.plazaMaxSpeed
      : KART_PHYSICS.offTrackMaxSpeed;

  let speed = state.speed;

  // Throttle & Brake / Reverse
  if (input.accelerate && !input.brakeReverse) {
    if (speed < 0) {
      speed = Math.min(0, speed + KART_PHYSICS.brakeRate * dt);
    } else if (speed < topSpeed) {
      speed = Math.min(topSpeed, speed + KART_PHYSICS.accelRate * dt);
    } else if (!onAsphalt) {
      speed = Math.max(topSpeed, speed - KART_PHYSICS.offTrackDrag * dt);
    }
  } else if (input.brakeReverse && !input.accelerate) {
    if (speed > 0) {
      speed = Math.max(0, speed - KART_PHYSICS.brakeRate * dt);
    } else {
      const maxRev = onAsphalt || onPlazaPath
        ? KART_PHYSICS.maxReverseSpeed
        : KART_PHYSICS.maxReverseSpeed * 0.65;
      speed = Math.max(-maxRev, speed - KART_PHYSICS.reverseAccelRate * dt);
    }
  } else {
    const drag = onAsphalt || onPlazaPath
      ? KART_PHYSICS.coastDrag
      : KART_PHYSICS.offTrackDrag * 0.75;
    if (speed > 0) {
      speed = Math.max(0, speed - drag * dt);
    } else if (speed < 0) {
      speed = Math.min(0, speed + drag * dt);
    }
  }

  // Smooth steering input
  const rawSteer = (input.steerLeft ? 1 : 0) - (input.steerRight ? 1 : 0);
  const steerBlend = 1 - Math.exp(-KART_PHYSICS.steerResponseRate * dt);
  const steerAngle = state.steerAngle + (rawSteer - state.steerAngle) * steerBlend;

  // Speed-responsive steering along heading
  const absSpeed = Math.abs(speed);
  const speedSteerFactor =
    absSpeed < 0.25
      ? 0
      : THREE.MathUtils.clamp(absSpeed / 7.5, 0.22, 1.0) *
        (1.0 - 0.14 * THREE.MathUtils.clamp((absSpeed - 14) / 12, 0, 1));
  const reverseSign = speed >= 0 ? 1 : -1;
  const yaw = state.yaw + steerAngle * KART_PHYSICS.maxTurnRate * speedSteerFactor * reverseSign * dt;

  // Move along kart heading
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  let nextX = state.x + forwardX * speed * dt;
  let nextZ = state.z + forwardZ * speed * dt;

  // Resolve building / stadium wall collisions smoothly
  const resolved = resolveStaticCollisions(nextX, nextZ, KART_PHYSICS.kartRadius);
  nextX = resolved.x;
  nextZ = resolved.z;
  if (resolved.collided) {
    speed *= 0.72;
  }

  // Keep kart inside the full town + stadium playable world
  if (nextX < KART_PHYSICS.worldMinX) {
    nextX = KART_PHYSICS.worldMinX;
    speed *= 0.6;
  } else if (nextX > KART_PHYSICS.worldMaxX) {
    nextX = KART_PHYSICS.worldMaxX;
    speed *= 0.6;
  }
  if (nextZ < KART_PHYSICS.worldMinZ) {
    nextZ = KART_PHYSICS.worldMinZ;
    speed *= 0.6;
  } else if (nextZ > KART_PHYSICS.worldMaxZ) {
    nextZ = KART_PHYSICS.worldMaxZ;
    speed *= 0.6;
  }

  const nextOnTrack = isPositionOnDrivableAsphalt(nextX, nextZ, frames) || isPositionInMarketOrParkPath(nextX, nextZ);
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
