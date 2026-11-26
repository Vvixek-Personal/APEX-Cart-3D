import * as THREE from 'three';
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
  const state: RaceState = {
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
  return state;
}

/**
 * Generates N evenly-spaced checkpoints along the track curve/frames.
 */
export function generateCheckpoints(frames: ReadonlyArray<TrackFrame>, count = 6): CheckpointDef[] {
  const checkpoints: CheckpointDef[] = [];
  const n = frames.length;
  if (n === 0) return checkpoints;

  for (let i = 0; i < count; i++) {
    const frameIndex = Math.floor((i * n) / count);
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
  kartSpeed: number,
  kartYaw: number,
  dt: number,
  checkpoints: ReadonlyArray<CheckpointDef>,
  finishLinePosition: THREE.Vector3,
  finishLineTangent: THREE.Vector3,
): RaceState {
  if (state.isFinished) {
    return state;
  }

  // 0. Handle waiting phase (player is in market district until crossing stadium entrance gate at z < 212)
  if (state.status === 'waiting') {
    if (kartZ < 212) {
      return {
        ...state,
        status: 'countdown',
      };
    }
    return state;
  }

  // 1. Handle countdown phase
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
  let nextStatus: 'waiting' | 'countdown' | 'racing' | 'finished' = state.status;

  const kartPos = new THREE.Vector3(kartX, 0, kartZ);
  const forwardHeading = new THREE.Vector3(Math.sin(kartYaw), 0, Math.cos(kartYaw));

  // Checkpoint collision / progression
  if (checkpoints.length > 0 && nextCpIndex < checkpoints.length) {
    const cp = checkpoints[nextCpIndex];
    const distToCp = kartPos.distanceTo(cp.position);
    const triggerRadius = TRACK_HALF * 1.8; // Generous trigger radius for high speed

    if (distToCp <= triggerRadius) {
      // Verify kart is moving forward relative to track tangent at checkpoint
      const alignment = forwardHeading.dot(cp.tangent);
      if (alignment > -0.3) {
        nextCpIndex++;
      }
    }
  }

  // Lap completion check: once all checkpoints are passed, crossing finish line completes lap
  if (nextCpIndex >= checkpoints.length) {
    const distToFinish = kartPos.distanceTo(finishLinePosition);
    const finishTriggerRadius = TRACK_HALF * 1.6;

    if (distToFinish <= finishTriggerRadius) {
      const alignmentToFinish = forwardHeading.dot(finishLineTangent);
      if (alignmentToFinish > 0.0) {
        // Lap completed!
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
          nextCpIndex = 0; // Reset checkpoints for next lap
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
