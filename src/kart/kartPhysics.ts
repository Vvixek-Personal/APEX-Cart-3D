import * as THREE from 'three';
import {
  FIELD_HALF,
  TRACK_HALF,
  TrackFrame,
  getBannerPlacements,
} from '../track/trackLayout';
import {
  KART_TOWN_SPAWN,
  TOWN_COLLIDERS,
  isPositionOnGrass,
  isPositionOnTownRoad,
} from '../scene/townLayout';
import type { VehiclePhysicsStats } from './vehicleCatalog';

export interface KartInputState {
  accelerate: boolean;
  brakeReverse: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  drift?: boolean;
}

export interface KartState {
  x: number;
  z: number;
  yaw: number;          // Heading in radians (0 = +Z South, PI = -Z North)
  speed: number;        // Signed forward speed in metres per second (1 world unit = 1 metre)
  throttle?: number;    // Smoothed engine demand [0..1]
  steerAngle: number;   // Smoothed visual & steering input [-1, 1]
  wheelSpin: number;    // Accumulated wheel rotation angle (radians)
  onTrack: boolean;     // True when on race track OR town paved road/parking lot
  lateralSpeed?: number; // Signed sideways slip speed along local +X (units/s)
  yawRate?: number;      // Current angular turn velocity (rad/s)
  pitchTilt?: number;    // Smoothed suspension squat/dive angle (rad)
  rollTilt?: number;     // Smoothed suspension cornering body roll (rad)
  isDrifting?: boolean;  // Active handbrake/powerslide state
  driftCharge?: number;  // Slide intensity [0..1] (legacy telemetry name)
  boostTimer?: number;   // Legacy telemetry; always zero (no handbrake turbo)
  onKerb?: boolean;      // True when tires ride the painted corner kerbs
}

export const KART_PHYSICS: VehiclePhysicsStats & {
  worldMinX: number;
  worldMaxX: number;
  worldMinZ: number;
  worldMaxZ: number;
} = {
  maxForwardSpeed: 28,
  maxReverseSpeed: 4.2,
  offTrackMaxSpeed: 12,
  accelRate: 7.5,
  reverseAccelRate: 3.5,
  brakeRate: 12,
  coastDrag: 1.2,
  offTrackDrag: 22,
  maxTurnRate: 1.35,
  steerResponseRate: 4.2,
  kartRadius: 1.38,
  wheelRadius: 0.44,
  worldMinX: -174,
  worldMaxX: 174,
  worldMinZ: -196,
  worldMaxZ: 424,
};

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
    lateralSpeed: 0,
    yawRate: 0,
    pitchTilt: 0,
    rollTilt: 0,
    isDrifting: false,
    driftCharge: 0,
    boostTimer: 0,
    onKerb: false,
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
    lateralSpeed: 0,
    yawRate: 0,
    pitchTilt: 0,
    rollTilt: 0,
    isDrifting: false,
    driftCharge: 0,
    boostTimer: 0,
    onKerb: false,
  };
}

export interface NearestTrackQueryResult {
  distance: number;
  frameIndex: number;
}

/**
 * Finds both minimum distance to the closed track centerline and the nearest frame index.
 */
export function queryNearestTrackCenterline(
  x: number,
  z: number,
  frames: ReadonlyArray<TrackFrame>,
): NearestTrackQueryResult {
  const n = frames.length;
  if (n === 0) return { distance: Infinity, frameIndex: 0 };

  let minDistSq = Infinity;
  let bestIdx = 0;
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
      bestIdx = t > 0.5 ? (i + 1) % n : i;
    }
  }
  return { distance: Math.sqrt(minDistSq), frameIndex: bestIdx };
}

/**
 * Computes minimum distance from world XZ point (x, z) to the closed track centerline.
 */
export function distanceToTrackCenterline(
  x: number,
  z: number,
  frames: ReadonlyArray<TrackFrame>,
): number {
  return queryNearestTrackCenterline(x, z, frames).distance;
}

/**
 * Checks whether world XZ position lies on the asphalt ribbon (within TRACK_HALF).
 * Uses fast stadium-field bounding-box rejection so town driving skips the 640-segment scan.
 */
export function isPositionOnTrack(
  x: number,
  z: number,
  frames: ReadonlyArray<TrackFrame>,
): boolean {
  if (Math.abs(x) > FIELD_HALF || Math.abs(z) > FIELD_HALF) {
    return false;
  }
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
  return isPositionOnTownRoad(x, z) || isPositionOnTrack(x, z, frames);
}

export interface DynamicCircleObstacle {
  x: number;
  z: number;
  radius: number;
}

/**
 * Resolves smooth circle-vs-AABB collisions against town buildings, park features,
 * gantries, archways, and stadium stand walls so the vehicle slides cleanly without getting stuck.
 */
export function resolveStaticCollisions(
  x: number,
  z: number,
  radius: number,
  dynamicObstacles?: ReadonlyArray<DynamicCircleObstacle>,
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

    if (dynamicObstacles) {
      for (let i = 0; i < dynamicObstacles.length; i++) {
        const obs = dynamicObstacles[i];
        const minDist = radius + obs.radius;
        const dx = rx - obs.x;
        const dz = rz - obs.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist) {
          collided = true;
          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const push = minDist - dist;
            rx += (dx / dist) * push;
            rz += (dz / dist) * push;
          } else {
            rx += minDist;
          }
        }
      }
    }
  }

  return { x: rx, z: rz, collided };
}

/**
 * Advances vehicle physics by rawDt seconds using progressive road-car dynamics:
 * - Surface-dependent grip & top speed (asphalt, cobblestone plaza, turf, and FIA kerbs)
 * - Lateral tire slip angle, cornering weight transfer, and grip-limited cornering and handbrake slip
 * - Suspension chassis squat, dive, and cornering roll angles
 * - Vector-projected wall sliding (head-on wall hits stop cleanly; glancing impacts slide smoothly)
 */
export function stepKartPhysics(
  state: KartState,
  input: KartInputState,
  rawDt: number,
  frames: ReadonlyArray<TrackFrame>,
  stats: VehiclePhysicsStats = KART_PHYSICS,
  dynamicObstacles?: ReadonlyArray<DynamicCircleObstacle>,
): KartState {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  if (dt === 0) return state;

  const inStadiumBounds = Math.abs(state.x) <= FIELD_HALF && Math.abs(state.z) <= FIELD_HALF;
  const trackDist = inStadiumBounds ? distanceToTrackCenterline(state.x, state.z, frames) : Infinity;
  const onRaceTrack = trackDist <= TRACK_HALF;
  const onKerb = inStadiumBounds && trackDist >= TRACK_HALF - 1.35 && trackDist <= TRACK_HALF + 0.65;
  const onAsphalt = onRaceTrack || isPositionOnTownRoad(state.x, state.z);
  // Footpaths, plazas, concourse & the connector corridor are paved: no speed penalty.
  // ONLY grass/turf limits speed, exactly like driving off-road.
  const onGrass = !onAsphalt && isPositionOnGrass(state.x, state.z);

  // No free energy from releasing the handbrake. Legacy HUD fields remain zero.
  const boostTimer = 0;
  const throttleTarget = input.accelerate && !input.brakeReverse ? 1 : 0;
  const throttle = (state.throttle ?? 0) + (throttleTarget - (state.throttle ?? 0)) *
    (1 - Math.exp(-(throttleTarget ? 3.2 : 9) * dt));

  const topSpeed = onAsphalt || !onGrass
    ? stats.maxForwardSpeed
    : stats.offTrackMaxSpeed;

  const prevSpeed = state.speed;
  let speed = prevSpeed;

  // Throttle & Brake / Reverse
  if (input.accelerate && !input.brakeReverse) {
    if (speed < 0) {
      speed = Math.min(0, speed + stats.brakeRate * dt);
    } else if (speed < topSpeed) {
      // Available wheel force falls as speed rises (power and aerodynamic load).
      const speedRatio = Math.max(0, speed) / Math.max(1, topSpeed);
      const wheelForce = stats.accelRate * throttle * (1 - 0.78 * speedRatio * speedRatio);
      speed = Math.min(topSpeed, speed + wheelForce * dt);
    } else if (onGrass) {
      speed = Math.max(topSpeed, speed - stats.offTrackDrag * dt);
    } else if (speed > topSpeed) {
      speed = Math.max(topSpeed, speed - stats.coastDrag * 0.8 * dt);
    }
  } else if (input.brakeReverse && !input.accelerate) {
    if (speed > 0) {
      speed = Math.max(0, speed - stats.brakeRate * dt);
    } else {
      const maxRev = onGrass ? stats.maxReverseSpeed * 0.65 : stats.maxReverseSpeed;
      speed = Math.max(-maxRev, speed - stats.reverseAccelRate * dt);
    }
  } else {
    const drag = input.accelerate && input.brakeReverse
      ? stats.brakeRate
      : onGrass
        ? stats.offTrackDrag * 0.35
        : stats.coastDrag + 0.0018 * speed * speed;
    if (speed > 0) {
      speed = Math.max(0, speed - drag * dt);
    } else if (speed < 0) {
      speed = Math.min(0, speed + drag * dt);
    }
  }

  // Smooth steering input
  const rawSteer = (input.steerLeft ? 1 : 0) - (input.steerRight ? 1 : 0);
  const steerBlend = 1 - Math.exp(-stats.steerResponseRate * dt);
  const steerAngle = state.steerAngle + (rawSteer - state.steerAngle) * steerBlend;

  // Handbrake / powerslide state
  const wantsDrift = Boolean(input.drift);
  const canSustainDrift = speed > 8.5 && (Math.abs(steerAngle) > 0.12 || Math.abs(state.lateralSpeed ?? 0) > 1.8);
  const isDrifting = wantsDrift && canSustainDrift;

  let driftCharge = state.driftCharge ?? 0;
  if (isDrifting) {
    // Scrub forward speed while the rear tires slide.
    speed = Math.max(0, speed - 2.6 * Math.abs(steerAngle) * dt);
    if (!onGrass) {
      driftCharge = Math.min(1, driftCharge + dt * 0.95);
    }
  } else {
    driftCharge = Math.max(0, driftCharge - dt * 2.5);
  }

  // Speed-responsive yaw authority with gentle, weighty GTA-style steering response
  const absSpeed = Math.abs(speed);
  const speedSteerFactor =
    absSpeed < 0.25
      ? 0
      : THREE.MathUtils.clamp(absSpeed / 9, 0.32, 1.0) *
        (1.0 - 0.34 * THREE.MathUtils.clamp((absSpeed - 15) / 27, 0, 1));
  const reverseSign = speed >= 0 ? 1 : -1;
  const driftTurnBoost = isDrifting ? 1.28 : 1.0;
  const requestedYawRate = steerAngle * stats.maxTurnRate * driftTurnBoost * speedSteerFactor * reverseSign;
  // Tire grip limits cornering acceleration instead of allowing 5g turns at speed.
  const gripLimit = onGrass ? 4.4 : 9.8;
  const maxYawRate = gripLimit / Math.max(3, absSpeed);
  const yawRate = THREE.MathUtils.clamp(requestedYawRate, -maxYawRate, maxYawRate);
  const yaw = state.yaw + yawRate * dt;

  // Lateral tire slip dynamics (local +X is left of +Z heading: sideVec = (cos(yaw), -sin(yaw)))
  let lateralSpeed = state.lateralSpeed ?? 0;
  const slipInjection = isDrifting ? 0.34 : onGrass ? 0.14 : 0.045;
  lateralSpeed -= speed * yawRate * slipInjection * dt * 8.0;
  const lateralGrip = isDrifting ? 3.2 : onGrass ? 6.5 : 16.5;
  lateralSpeed *= Math.exp(-lateralGrip * dt);
  lateralSpeed = THREE.MathUtils.clamp(lateralSpeed, -11.5, 11.5);
  if (Math.abs(lateralSpeed) < 0.01) lateralSpeed = 0;

  // World velocity combining forward heading + lateral tire slip
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const sideX = Math.cos(yaw);
  const sideZ = -Math.sin(yaw);

  let vx = forwardX * speed + sideX * lateralSpeed;
  let vz = forwardZ * speed + sideZ * lateralSpeed;

  const rawNextX = state.x + vx * dt;
  const rawNextZ = state.z + vz * dt;

  // Resolve building / stadium wall / parked vehicle collisions smoothly
  const resolved = resolveStaticCollisions(rawNextX, rawNextZ, stats.kartRadius, dynamicObstacles);
  let nextX = resolved.x;
  let nextZ = resolved.z;

  if (resolved.collided) {
    const pushX = resolved.x - rawNextX;
    const pushZ = resolved.z - rawNextZ;
    const pushLen = Math.hypot(pushX, pushZ);
    if (pushLen > 1e-6) {
      const nx = pushX / pushLen;
      const nz = pushZ / pushLen;
      const vn = vx * nx + vz * nz;
      if (vn < 0) {
        // Cancel velocity into the wall normal and apply light scrape friction along wall tangent
        vx = (vx - vn * nx) * 0.9;
        vz = (vz - vn * nz) * 0.9;
      }
      speed = vx * forwardX + vz * forwardZ;
      lateralSpeed = (vx * sideX + vz * sideZ) * 0.5;
      if (Math.abs(speed) < 0.08) speed = 0;
    } else {
      speed *= 0.5;
      lateralSpeed *= 0.5;
    }
    driftCharge = 0;
  }

  // Keep vehicle inside the full town + stadium playable world
  if (nextX < KART_PHYSICS.worldMinX) {
    nextX = KART_PHYSICS.worldMinX;
    if (vx < 0) vx = 0;
    speed = vx * forwardX + vz * forwardZ;
  } else if (nextX > KART_PHYSICS.worldMaxX) {
    nextX = KART_PHYSICS.worldMaxX;
    if (vx > 0) vx = 0;
    speed = vx * forwardX + vz * forwardZ;
  }
  if (nextZ < KART_PHYSICS.worldMinZ) {
    nextZ = KART_PHYSICS.worldMinZ;
    if (vz < 0) vz = 0;
    speed = vx * forwardX + vz * forwardZ;
  } else if (nextZ > KART_PHYSICS.worldMaxZ) {
    nextZ = KART_PHYSICS.worldMaxZ;
    if (vz > 0) vz = 0;
    speed = vx * forwardX + vz * forwardZ;
  }

  // Suspension chassis squat/dive (pitch) and cornering body roll
  const longAccel = (speed - prevSpeed) / dt;
  const latAccel = speed * yawRate;
  const kerbJitter = onKerb && absSpeed > 3 ? Math.sin(state.wheelSpin * 2.6) * 0.014 : 0;
  // Positive longAccel (accelerating) pitches nose slightly up (-rotX); braking dives nose (+rotX)
  const targetPitch = THREE.MathUtils.clamp(-longAccel * 0.0016, -0.05, 0.06);
  // Left turn (yawRate > 0) rolls chassis outward to the right (+rotZ in local space)
  const targetRoll = THREE.MathUtils.clamp(latAccel * 0.0018 + kerbJitter, -0.075, 0.075);
  const suspAlpha = 1 - Math.exp(-8.0 * dt);
  const pitchTilt = (state.pitchTilt ?? 0) + (targetPitch - (state.pitchTilt ?? 0)) * suspAlpha;
  const rollTilt = (state.rollTilt ?? 0) + (targetRoll - (state.rollTilt ?? 0)) * suspAlpha;

  const nextInStadium = Math.abs(nextX) <= FIELD_HALF && Math.abs(nextZ) <= FIELD_HALF;
  const nextTrackDist = nextInStadium ? distanceToTrackCenterline(nextX, nextZ, frames) : Infinity;
  // "onTrack" now means "on any paved surface": only grass counts as off-track grip loss
  const nextOnTrack = !isPositionOnGrass(nextX, nextZ);
  const nextOnKerb =
    nextInStadium && nextTrackDist >= TRACK_HALF - 1.35 && nextTrackDist <= TRACK_HALF + 0.65;

  const wheelSpin = state.wheelSpin + (speed * dt) / Math.max(0.15, stats.wheelRadius);

  return {
    x: nextX,
    z: nextZ,
    yaw,
    speed,
    throttle,
    steerAngle,
    wheelSpin,
    onTrack: nextOnTrack,
    lateralSpeed,
    yawRate,
    pitchTilt,
    rollTilt,
    isDrifting,
    driftCharge,
    boostTimer,
    onKerb: nextOnKerb,
  };
}
