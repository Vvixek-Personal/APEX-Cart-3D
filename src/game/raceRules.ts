import * as THREE from 'three';
import { STADIUM_GATE_TRIGGER_Z } from '../scene/townLayout';
import { TrackFrame, TRACK_HALF } from '../track/trackLayout';

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
  bestLapTime: number | null;
  finalTime: number | null;
  isFinished: boolean;
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
    bestLapTime: null,
    finalTime: null,
    isFinished: false,
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
 * Updates race state based on kart position, velocity, and elapsed delta time.
 */
export function updateRaceState(
  state: RaceState,
  kartX: number,
  kartZ: number,
  _kartSpeed: number,
  kartYaw: number,
  dt: number,
  checkpoints: ReadonlyArray<CheckpointDef>,
  finishLinePosition: THREE.Vector3,
  finishLineTangent: THREE.Vector3,
): RaceState {
  if (state.isFinished) {
    return state;
  }

  // 0. Waiting phase: player explores the town district freely until driving into the stadium bowl
  if (state.status === 'waiting') {
    if (kartZ < STADIUM_GATE_TRIGGER_Z && Math.abs(kartX) <= 125) {
      return {
        ...state,
        status: 'countdown',
        countdownSeconds: 3.5,
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
      };
    }
    return {
      ...state,
      countdownSeconds: nextCountdown,
    };
  }

  // 2. Racing phase
  const nextElapsed = state.elapsedTime + dt;
  const nextLapTime = state.currentLapTime + dt;
  let nextLap = state.lap;
  let nextCpIndex = state.currentCheckpointIndex;
  let nextBestLap = state.bestLapTime;
  let nextFinalTime = state.finalTime;
  let nextIsFinished: boolean = state.isFinished;
  let nextStatus: RaceState['status'] = state.status;

  const kartPos = new THREE.Vector3(kartX, 0, kartZ);
  const forwardHeading = new THREE.Vector3(Math.sin(kartYaw), 0, Math.cos(kartYaw));

  // Checkpoint progression
  if (checkpoints.length > 0 && nextCpIndex < checkpoints.length) {
    const cp = checkpoints[nextCpIndex];
    const distToCp = kartPos.distanceTo(cp.position);
    const triggerRadius = TRACK_HALF * 1.8;

    if (distToCp <= triggerRadius) {
      const alignment = forwardHeading.dot(cp.tangent);
      if (alignment > -0.3) {
        nextCpIndex++;
      }
    }
  }

  // Lap completion check once all checkpoints are passed
  if (nextCpIndex >= checkpoints.length) {
    const distToFinish = kartPos.distanceTo(finishLinePosition);
    const finishTriggerRadius = TRACK_HALF * 1.6;

    if (distToFinish <= finishTriggerRadius) {
      const alignmentToFinish = forwardHeading.dot(finishLineTangent);
      if (alignmentToFinish > 0.0) {
        const completedLapTime = nextLapTime;
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

  return {
    ...state,
    status: nextStatus,
    lap: nextLap,
    currentCheckpointIndex: nextCpIndex,
    elapsedTime: nextElapsed,
    currentLapTime: nextIsFinished ? state.currentLapTime : (nextLap !== state.lap ? 0 : nextLapTime),
    bestLapTime: nextBestLap,
    finalTime: nextFinalTime,
    isFinished: nextIsFinished,
  };
}
