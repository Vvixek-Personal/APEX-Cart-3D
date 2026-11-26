import {
  DynamicCircleObstacle,
  KART_PHYSICS,
  KartInputState,
  resolveStaticCollisions,
} from '../kart/kartPhysics';
import { KART_TOWN_SPAWN } from '../scene/townLayout';

export type PlayerControlMode = 'walking' | 'driving';

export interface CharacterState {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  walkCycle: number;
  isSprinting: boolean;
  mode: PlayerControlMode;
  activeVehicleId: string | null;
}

export interface VehicleProximityTarget {
  instanceId: string;
  x: number;
  z: number;
  yaw: number;
  radius: number;
}

export const CHARACTER_PHYSICS = {
  walkSpeed: 9.2,
  sprintSpeed: 15.0,
  backwardSpeed: 5.6,
  turnRate: 2.85,
  accelRate: 36,
  decelRate: 32,
  radius: 0.56,
  enterRange: 5.8,
} as const;

/**
 * Spawns the player character on foot along Main Avenue right beside the
 * oversized Apex Mega Kart and nearby Velocity GT & Monza Arrow showcase cars.
 */
export function createInitialCharacterState(): CharacterState {
  return {
    x: KART_TOWN_SPAWN.x - 2.65,
    z: KART_TOWN_SPAWN.z + 1.8,
    yaw: Math.PI, // Facing North (-Z) looking straight at Mega Kart, cars & Stadium Gate
    speed: 0,
    walkCycle: 0,
    isSprinting: false,
    mode: 'walking',
    activeVehicleId: null,
  };
}

/**
 * Advances on-foot character movement with smooth turning, sprint, and building/car sliding collision.
 */
export function stepCharacterPhysics(
  state: CharacterState,
  input: KartInputState,
  sprint: boolean,
  rawDt: number,
  vehicleObstacles?: ReadonlyArray<DynamicCircleObstacle>,
): CharacterState {
  if (state.mode !== 'walking') return state;
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  if (dt === 0) return state;

  const turnInput = (input.steerLeft ? 1 : 0) - (input.steerRight ? 1 : 0);
  const yaw = state.yaw + turnInput * CHARACTER_PHYSICS.turnRate * dt;

  let targetSpeed = 0;
  if (input.accelerate && !input.brakeReverse) {
    targetSpeed = sprint ? CHARACTER_PHYSICS.sprintSpeed : CHARACTER_PHYSICS.walkSpeed;
  } else if (input.brakeReverse && !input.accelerate) {
    targetSpeed = -CHARACTER_PHYSICS.backwardSpeed;
  }

  let speed = state.speed;
  if (targetSpeed !== 0) {
    const step = CHARACTER_PHYSICS.accelRate * dt;
    if (speed < targetSpeed) speed = Math.min(targetSpeed, speed + step);
    else if (speed > targetSpeed) speed = Math.max(targetSpeed, speed - step);
  } else {
    const step = CHARACTER_PHYSICS.decelRate * dt;
    if (speed > 0) speed = Math.max(0, speed - step);
    else if (speed < 0) speed = Math.min(0, speed + step);
  }

  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  let nextX = state.x + forwardX * speed * dt;
  let nextZ = state.z + forwardZ * speed * dt;

  const resolved = resolveStaticCollisions(
    nextX,
    nextZ,
    CHARACTER_PHYSICS.radius,
    vehicleObstacles,
  );
  nextX = Math.max(KART_PHYSICS.worldMinX, Math.min(KART_PHYSICS.worldMaxX, resolved.x));
  nextZ = Math.max(KART_PHYSICS.worldMinZ, Math.min(KART_PHYSICS.worldMaxZ, resolved.z));

  const walkCycle =
    Math.abs(speed) > 0.25
      ? state.walkCycle + Math.abs(speed) * dt * 1.45
      : state.walkCycle;

  return {
    ...state,
    x: nextX,
    z: nextZ,
    yaw,
    speed,
    walkCycle,
    isSprinting: sprint && Math.abs(speed) > CHARACTER_PHYSICS.walkSpeed + 0.5,
  };
}

/**
 * Finds the closest drivable vehicle within range of the walking character.
 */
export function findNearestVehicle<T extends VehicleProximityTarget>(
  charX: number,
  charZ: number,
  vehicles: ReadonlyArray<T>,
  maxDist: number = CHARACTER_PHYSICS.enterRange,
): { vehicle: T; distance: number } | null {
  let best: T | null = null;
  let bestDistSq = maxDist * maxDist;

  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const dx = v.x - charX;
    const dz = v.z - charZ;
    const d2 = dx * dx + dz * dz;
    if (d2 <= bestDistSq) {
      bestDistSq = d2;
      best = v;
    }
  }

  return best ? { vehicle: best, distance: Math.sqrt(bestDistSq) } : null;
}

/**
 * Transitions the player from walking on foot into driving the target vehicle.
 */
export function enterVehicle(
  charState: CharacterState,
  vehicle: VehicleProximityTarget,
): CharacterState {
  return {
    ...charState,
    x: vehicle.x,
    z: vehicle.z,
    yaw: vehicle.yaw,
    speed: 0,
    isSprinting: false,
    mode: 'driving',
    activeVehicleId: vehicle.instanceId,
  };
}

/**
 * Exits the active vehicle, placing the player character safely beside the driver door
 * (falling back to passenger side or rear if left side is blocked by a wall).
 */
export function exitVehicle(
  charState: CharacterState,
  vehicle: VehicleProximityTarget,
  otherVehicleObstacles?: ReadonlyArray<DynamicCircleObstacle>,
): CharacterState {
  // Local +X is left/driver side when facing +Z
  const sideX = Math.cos(vehicle.yaw);
  const sideZ = -Math.sin(vehicle.yaw);
  const fwdX = Math.sin(vehicle.yaw);
  const fwdZ = Math.cos(vehicle.yaw);

  const offsets: ReadonlyArray<[number, number]> = [
    [sideX * 2.55, sideZ * 2.55],
    [-sideX * 2.55, -sideZ * 2.55],
    [-fwdX * 3.1, -fwdZ * 3.1],
    [fwdX * 3.1, fwdZ * 3.1],
  ];

  let exitX = vehicle.x + offsets[0][0];
  let exitZ = vehicle.z + offsets[0][1];

  const allObstacles: DynamicCircleObstacle[] = [
    ...(otherVehicleObstacles ?? []),
    { x: vehicle.x, z: vehicle.z, radius: vehicle.radius },
  ];

  for (const [ox, oz] of offsets) {
    const candX = vehicle.x + ox;
    const candZ = vehicle.z + oz;
    const check = resolveStaticCollisions(candX, candZ, CHARACTER_PHYSICS.radius, allObstacles);
    if (!check.collided) {
      exitX = check.x;
      exitZ = check.z;
      break;
    }
  }

  const finalCheck = resolveStaticCollisions(exitX, exitZ, CHARACTER_PHYSICS.radius, allObstacles);

  return {
    ...charState,
    x: Math.max(KART_PHYSICS.worldMinX, Math.min(KART_PHYSICS.worldMaxX, finalCheck.x)),
    z: Math.max(KART_PHYSICS.worldMinZ, Math.min(KART_PHYSICS.worldMaxZ, finalCheck.z)),
    yaw: vehicle.yaw,
    speed: 0,
    isSprinting: false,
    mode: 'walking',
    activeVehicleId: null,
  };
}
