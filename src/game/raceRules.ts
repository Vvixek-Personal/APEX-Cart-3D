import * as THREE from 'three';
import { queryNearestTrackCenterline } from '../kart/kartPhysics';
import { STADIUM_GATE_TRIGGER_Z } from '../scene/townLayout';
import { FIELD_HALF, TRACK_HALF, TrackFrame } from '../track/trackLayout';

export interface CheckpointDef {
  index: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
}

export interface RaceState {
  status: 'waiting' | 'countdown' | 'racing' | 'finished';
  countdownSeconds: number;
  lap: number;
  maxLaps: number;
  currentCheckpointIndex: number;
  totalCheckpoints: number;
  elapsedTime: number;
  currentLapTime: number;
  lastLapTime: number | null;
  bestLapTime: number | null;
  finalTime: number | null;
  isFinished: boolean;
  isWrongWay: boolean;
  activeVehicleName: string | null;
  lastKartX: number | null;
  lastKartZ: number | null;
}

export interface RaceUpdateOptions {
  isDriving?: boolean;
  vehicleName?: string | null;
  trackFrames?: ReadonlyArray<TrackFrame>;
}

export function createInitialRaceState(maxLaps = 3, totalCheckpoints = 6): RaceState {
  return {
    status: 'waiting',
    countdownSeconds: 3.5,
    lap: 1,
    maxLaps,
    currentCheckpointIndex: 0,
    totalCheckpoints,
    elapsedTime: 0,
    currentLapTime: 0,
    lastLapTime: null,
    bestLapTime: null,
    finalTime: null,
    isFinished: false,
    isWrongWay: false,
    activeVehicleName: null,
    lastKartX: null,
    lastKartZ: null,
  };
}

/**
 * Generates N checkpoints ordered along the circuit starting just after the
 * South Stadium Gate entry (u ~ 0.16) through just before the FINISH line (u ~ 0.93)
 * so both South-Gate arrivals and grid starts pass all checkpoints sequentially before FINISH.
 */
export function generateCheckpoints(frames: ReadonlyArray<TrackFrame>, count = 6): CheckpointDef[] {
  const checkpoints: CheckpointDef[] = [];
  const n = frames.length;
  if (n === 0) return checkpoints;

  const startOffsetU = 0.16;
  const spanU = 0.77; // Covers u from 0.16 to 0.93 before FINISH (~0.06)

  for (let i = 0; i < count; i++) {
    const frac = count > 1 ? i / (count - 1) : 0;
    const u = (startOffsetU + frac * spanU) % 1;
    const frameIndex = Math.floor(u * n) % n;
    const frame = frames[frameIndex];
    checkpoints.push({
      index: i,
      position: frame.position.clone(),
      tangent: frame.tangent.clone(),
    });
  }
  return checkpoints;
}

/**
 * Updates race state based on vehicle position, heading, speed, and elapsed delta time.
 * Zero heap allocations per frame when stationary or cruising in town; strictly requires
 * an active vehicle (`isDriving = true`) to trigger race start, checkpoints, or finish line.
 */
export function updateRaceState(
  state: RaceState,
  kartX: number,
  kartZ: number,
  kartSpeed: number,
  kartYaw: number,
  dt: number,
  checkpoints: ReadonlyArray<CheckpointDef>,
  finishLinePosition: THREE.Vector3,
  finishLineTangent: THREE.Vector3,
  options?: RaceUpdateOptions,
): RaceState {
  if (state.isFinished) {
    return state;
  }

  const isDriving = options?.isDriving ?? true;
  const vehicleName = options?.vehicleName ?? state.activeVehicleName;

  // 0. Waiting phase: player explores the town district freely until driving into the stadium bowl
  if (state.status === 'waiting') {
    if (isDriving && kartZ < STADIUM_GATE_TRIGGER_Z && Math.abs(kartX) <= FIELD_HALF + 5) {
      return {
        ...state,
        status: 'countdown',
        countdownSeconds: 3.5,
        activeVehicleName: vehicleName,
        lastKartX: kartX,
        lastKartZ: kartZ,
      };
    }
    return state;
  }

  // 1. Countdown phase inside stadium
  if (state.status === 'countdown') {
    const nextCountdown = state.countdownSeconds - dt;
    if (nextCountdown <= 0) {
      return {
        ...state,
        status: 'racing',
        countdownSeconds: 0,
        elapsedTime: 0,
        currentLapTime: 0,
        activeVehicleName: vehicleName,
        lastKartX: kartX,
        lastKartZ: kartZ,
      };
    }
    return {
      ...state,
      countdownSeconds: nextCountdown,
      activeVehicleName: vehicleName,
      lastKartX: kartX,
      lastKartZ: kartZ,
    };
  }

  // 2. Racing phase
  const nextElapsed = state.elapsedTime + dt;
  const nextLapTime = state.currentLapTime + dt;
  let nextLap = state.lap;
  let nextCpIndex = state.currentCheckpointIndex;
  let nextLastLap = state.lastLapTime;
  let nextBestLap = state.bestLapTime;
  let nextFinalTime = state.finalTime;
  let nextIsFinished: boolean = state.isFinished;
  let nextStatus: RaceState['status'] = state.status;
  let isWrongWay = false;

  const fwdX = Math.sin(kartYaw);
  const fwdZ = Math.cos(kartYaw);

  // Only vehicles can trigger checkpoints, wrong-way warnings, or finish line crossings
  if (isDriving) {
    const trackFrames = options?.trackFrames;
    if (
      trackFrames &&
      trackFrames.length > 0 &&
      kartSpeed > 2.5 &&
      Math.abs(kartX) <= FIELD_HALF &&
      Math.abs(kartZ) <= FIELD_HALF
    ) {
      const nearest = queryNearestTrackCenterline(kartX, kartZ, trackFrames);
      if (nearest.distance <= TRACK_HALF * 1.65) {
        const t = trackFrames[nearest.frameIndex].tangent;
        const align = fwdX * t.x + fwdZ * t.z;
        if (align < -0.45) {
          isWrongWay = true;
        }
      }
    }

    // Checkpoint progression
    if (checkpoints.length > 0 && nextCpIndex < checkpoints.length) {
      const cp = checkpoints[nextCpIndex];
      const dx = kartX - cp.position.x;
      const dz = kartZ - cp.position.z;
      const triggerRadius = TRACK_HALF * 1.65;

      if (dx * dx + dz * dz <= triggerRadius * triggerRadius) {
        const alignment = fwdX * cp.tangent.x + fwdZ * cp.tangent.z;
        if (alignment > -0.25) {
          nextCpIndex++;
        }
      }
    }

    // Lap completion check once all checkpoints are passed:
    // Uses an oriented finish-strip gate box + swept plane crossing so laps complete
    // accurately on the checkered strip rather than 13m before the gantry.
    if (nextCpIndex >= checkpoints.length) {
      const tx = finishLineTangent.x;
      const tz = finishLineTangent.z;
      const nx = -tz;
      const nz = tx;

      const relX = kartX - finishLinePosition.x;
      const relZ = kartZ - finishLinePosition.z;
      const currLong = relX * tx + relZ * tz;
      const currLat = relX * nx + relZ * nz;

      const withinTrackWidth = Math.abs(currLat) <= TRACK_HALF * 1.25;
      let inFinishGate = withinTrackWidth && currLong >= -1.6 && currLong <= 3.6;

      if (!inFinishGate && withinTrackWidth && state.lastKartX !== null && state.lastKartZ !== null) {
        const stepDistSq =
          (kartX - state.lastKartX) * (kartX - state.lastKartX) +
          (kartZ - state.lastKartZ) * (kartZ - state.lastKartZ);
        if (stepDistSq <= 144) {
          const prevLong =
            (state.lastKartX - finishLinePosition.x) * tx +
            (state.lastKartZ - finishLinePosition.z) * tz;
          if (prevLong < -1.6 && currLong > 3.6) {
            inFinishGate = true;
          }
        }
      }

      if (inFinishGate) {
        const alignmentToFinish = fwdX * tx + fwdZ * tz;
        if (alignmentToFinish > 0.15) {
          const completedLapTime = nextLapTime;
          nextLastLap = completedLapTime;
          if (nextBestLap === null || completedLapTime < nextBestLap) {
            nextBestLap = completedLapTime;
          }

          if (nextLap >= state.maxLaps) {
            nextIsFinished = true;
            nextStatus = 'finished';
            nextFinalTime = nextElapsed;
          } else {
            nextLap++;
            nextCpIndex = 0;
          }
        }
      }
    }
  }

  return {
    ...state,
    status: nextStatus,
    lap: nextLap,
    currentCheckpointIndex: nextCpIndex,
    elapsedTime: nextElapsed,
    currentLapTime: nextIsFinished
      ? state.currentLapTime
      : nextLap !== state.lap
        ? 0
        : nextLapTime,
    lastLapTime: nextLastLap,
    bestLapTime: nextBestLap,
    finalTime: nextFinalTime,
    isFinished: nextIsFinished,
    isWrongWay,
    activeVehicleName: vehicleName,
    lastKartX: isDriving ? kartX : state.lastKartX,
    lastKartZ: isDriving ? kartZ : state.lastKartZ,
  };
}
