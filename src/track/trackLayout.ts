import * as THREE from 'three';

export const TRACK_LAYOUT_SCALE = 2;

export const FIELD_SIZE = 120 * TRACK_LAYOUT_SCALE;
export const FIELD_HALF = FIELD_SIZE / 2;
export const FIELD_THICKNESS = 3.2;

export const TRACK_WIDTH = 8.4 * 2;
export const TRACK_HALF = TRACK_WIDTH / 2;
export const TRACK_MARGIN_INSET = 0.84;

export const BANNER_POST_OFFSET = TRACK_HALF + 1.35;
export const BANNER_CLEAR_HEIGHT = 6.2;
export const BANNER_TOTAL_HEIGHT = 10.8;

// Stadium & outer landscaped park bounds strictly outside the 240x240 grass field (FIELD_HALF = 120)
export const STADIUM_EXPONENT = 4;
export const STADIUM_CANOPY_INNER = 160;
export const STADIUM_FACADE_RADIUS = 176;
export const STADIUM_CANOPY_OUTER = 183;
export const STADIUM_CONCOURSE_OUTER = 186;
export const STADIUM_INNER_STAND_CLEAR = 128;
export const STADIUM_NORTH_CANOPY_HEIGHT = 24;
export const STADIUM_TOWER_OFFSET = 158;
export const STADIUM_TOWER_RADIUS = 179;
export const STADIUM_TOWER_HEIGHT = 44;

export const PARK_HALF = 212;
export const PARK_SIZE = PARK_HALF * 2;

/**
 * Evaluates a point on the curved stadium superellipse perimeter at angle theta.
 */
export function evaluateStadiumPoint(theta: number, radius: number): { x: number; z: number } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const exp = 2 / STADIUM_EXPONENT;
  const x = radius * Math.sign(c) * Math.pow(Math.abs(c), exp);
  const z = radius * Math.sign(s) * Math.pow(Math.abs(s), exp);
  return { x, z };
}

export interface TrackFrame {
  u: number;
  arcLength: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3; // Right-hand outward normal in XZ plane
}

export interface BannerPlacement {
  id: 'START' | 'FINISH';
  u: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface TrackGeometryMetrics {
  totalLength: number;
  minCurvatureRadius: number;
  maxAbsTrackCoord: number;
  minNonAdjacentClearance: number;
  bannerSeparation: number;
  startFacingDot: number;
  finishFacingDot: number;
}

/**
 * Base control points for a single continuous, non-overlapping go-kart circuit
 * centered around (0, 0), scaled by TRACK_LAYOUT_SCALE inside the 240x240 field.
 * Includes sweeping bends, a flowing S-curve, two crisp hairpin turns,
 * and a clean front-right main straight for the START and FINISH banners.
 */
const BASE_TRACK_CONTROL_POINTS: ReadonlyArray<[number, number]> = [
  [40, 10],   // Entry to main straight (heading +Z)
  [40, 23],   // Mid main straight
  [40, 36],   // Exit of main straight into SE sweeping curve
  [28, 47],   // SE sweeping curve
  [5, 46],    // South straight
  [-22, 46],  // SW hairpin entry
  [-42, 42],  // SW hairpin arc 1
  [-47, 32],  // SW hairpin apex
  [-41, 22],  // SW hairpin arc 2
  [-22, 20],  // SW hairpin exit heading east
  [-11, 20],  // Central curve entry
  [-3, 15],   // Central curve shoulder 1
  [-3, 5],    // Central curve shoulder 2
  [-11, 0],   // Central curve exit
  [-23, -1],  // Flowing S-bend exit
  [-35, -4],  // Central-west straight
  [-46, -15], // West bend entry
  [-45, -32], // West-northwest curve
  [-33, -44], // NW sweeping curve
  [-10, -46], // North fast sweeping straight
  [16, -45],  // NE corner entry
  [34, -45],  // NE hairpin entry
  [44, -41],  // NE hairpin arc 1
  [47, -33],  // NE hairpin apex
  [44, -25],  // NE hairpin arc 2
  [34, -22],  // NE hairpin exit
  [23, -23],  // Inner leg 1 heading west
  [12, -23],  // Inner hairpin entry
  [5, -17],   // Inner hairpin shoulder 1
  [5, -9],    // Inner hairpin shoulder 2
  [12, -3],   // Inner hairpin exit
  [24, -2],   // Inner leg 2 heading east
  [36, 3],    // Smooth entry onto main straight
];

export function createTrackCurve(): THREE.CatmullRomCurve3 {
  const pts = BASE_TRACK_CONTROL_POINTS.map(
    ([x, z]) => new THREE.Vector3(x * TRACK_LAYOUT_SCALE, 0, z * TRACK_LAYOUT_SCALE),
  );
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
}

/**
 * Evaluates a single frame on the closed track curve at parameter u in [0, 1).
 */
export function evaluateTrackFrame(
  curve: THREE.CatmullRomCurve3,
  u: number,
  arcLength = 0,
): TrackFrame {
  const wrappedU = ((u % 1) + 1) % 1;
  const position = curve.getPointAt(wrappedU);
  position.y = 0;

  const tangent = curve.getTangentAt(wrappedU);
  tangent.y = 0;
  tangent.normalize();

  // Right-hand perpendicular in XZ plane when looking along +tangent
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

  return { u: wrappedU, arcLength, position, tangent, normal };
}

export function sampleTrackFrames(
  curve: THREE.CatmullRomCurve3,
  sampleCount = 480,
): TrackFrame[] {
  const totalLength = curve.getLength();
  const frames: TrackFrame[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const u = i / sampleCount;
    frames.push(evaluateTrackFrame(curve, u, u * totalLength));
  }
  return frames;
}

/**
 * Finds the curve parameter u closest to a target world XZ point.
 */
export function findClosestU(
  curve: THREE.CatmullRomCurve3,
  targetX: number,
  targetZ: number,
  steps = 720,
): number {
  let bestU = 0;
  let bestDistSq = Infinity;
  const pt = new THREE.Vector3();
  for (let i = 0; i < steps; i++) {
    const u = i / steps;
    curve.getPointAt(u, pt);
    const dx = pt.x - targetX;
    const dz = pt.z - targetZ;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestU = u;
    }
  }
  return bestU;
}

/**
 * Computes START (starting grid) and FINISH (finish line) banner placements
 * along the main straight so both are well-separated and face the spectator camera.
 */
export function getBannerPlacements(curve: THREE.CatmullRomCurve3): {
  start: BannerPlacement;
  finish: BannerPlacement;
} {
  const startU = findClosestU(curve, 40 * TRACK_LAYOUT_SCALE, 10 * TRACK_LAYOUT_SCALE);
  const finishU = findClosestU(curve, 40 * TRACK_LAYOUT_SCALE, 31 * TRACK_LAYOUT_SCALE);
  const startFrame = evaluateTrackFrame(curve, startU);
  const finishFrame = evaluateTrackFrame(curve, finishU);

  return {
    start: {
      id: 'START',
      u: startU,
      position: startFrame.position,
      tangent: startFrame.tangent,
      normal: startFrame.normal,
    },
    finish: {
      id: 'FINISH',
      u: finishU,
      position: finishFrame.position,
      tangent: finishFrame.tangent,
      normal: finishFrame.normal,
    },
  };
}

export interface SpectatorCameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  near: number;
  far: number;
}

/**
 * High, wide, slightly angled spectator camera centered on the stadium and square field
 * with balanced framing margin around the stadium, floodlight towers, track, and banners.
 */
export function computeSpectatorCameraPose(aspect: number): SpectatorCameraPose {
  const safeAspect = Math.max(aspect, 0.4);
  const fov = 34;
  // Slightly angled from South-South-East so the square field & stadium read almost isometric
  // while keeping both START and FINISH banners angled favorably toward the viewer.
  const dir = new THREE.Vector3(0.42, 1.18, 1.0).normalize();

  // Compute minimum distance along `dir` so all stadium perimeter points, tower tops,
  // field corners, and banner tops stay cleanly inside [-0.88, 0.88] NDC on both axes.
  const target = new THREE.Vector3(0, 4.0, 0);
  const testPoints: THREE.Vector3[] = [
    new THREE.Vector3(-FIELD_HALF, 0, -FIELD_HALF),
    new THREE.Vector3(FIELD_HALF, 0, -FIELD_HALF),
    new THREE.Vector3(-FIELD_HALF, 0, FIELD_HALF),
    new THREE.Vector3(FIELD_HALF, 0, FIELD_HALF),
    new THREE.Vector3(40 * TRACK_LAYOUT_SCALE, BANNER_TOTAL_HEIGHT, 10 * TRACK_LAYOUT_SCALE),
    new THREE.Vector3(40 * TRACK_LAYOUT_SCALE, BANNER_TOTAL_HEIGHT, 31 * TRACK_LAYOUT_SCALE),
    // Outer landscaped park corners
    new THREE.Vector3(-PARK_HALF, -1.0, -PARK_HALF),
    new THREE.Vector3(PARK_HALF, -1.0, -PARK_HALF),
    new THREE.Vector3(-PARK_HALF, -1.0, PARK_HALF),
    new THREE.Vector3(PARK_HALF, -1.0, PARK_HALF),
    // Perimeter tree canopies (~14 tall along outer park edge)
    new THREE.Vector3(-PARK_HALF + 8, 14, -PARK_HALF + 8),
    new THREE.Vector3(PARK_HALF - 8, 14, -PARK_HALF + 8),
    // North multi-tier grandstand roof & scoreboard bounds
    new THREE.Vector3(-102, STADIUM_NORTH_CANOPY_HEIGHT, -174),
    new THREE.Vector3(102, STADIUM_NORTH_CANOPY_HEIGHT, -174),
    new THREE.Vector3(-124, 24, -142),
    // East pavilion & West/South stands
    new THREE.Vector3(166, 15, 0),
    new THREE.Vector3(-162, 14, 0),
    new THREE.Vector3(0, 10, 160),
    // Corner floodlight towers
    new THREE.Vector3(-STADIUM_TOWER_OFFSET, STADIUM_TOWER_HEIGHT, -STADIUM_TOWER_OFFSET),
    new THREE.Vector3(STADIUM_TOWER_OFFSET, STADIUM_TOWER_HEIGHT, -STADIUM_TOWER_OFFSET),
    new THREE.Vector3(-STADIUM_TOWER_OFFSET, STADIUM_TOWER_HEIGHT, STADIUM_TOWER_OFFSET),
    new THREE.Vector3(STADIUM_TOWER_OFFSET, STADIUM_TOWER_HEIGHT, STADIUM_TOWER_OFFSET),
  ];

  const cam = new THREE.PerspectiveCamera(fov, safeAspect, 1, 4400);
  let low = 240;
  let high = 3200;

  for (let iter = 0; iter < 34; iter++) {
    const mid = (low + high) * 0.5;
    cam.position.copy(target).addScaledVector(dir, mid);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);

    let maxAbsNdc = 0;
    for (const p of testPoints) {
      const projected = p.clone().project(cam);
      maxAbsNdc = Math.max(maxAbsNdc, Math.abs(projected.x), Math.abs(projected.y));
    }

    // Leave comfortable breathing margin around every edge (<= 0.89 NDC)
    if (maxAbsNdc > 0.89) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const distance = high;
  return {
    position: target.clone().addScaledVector(dir, distance),
    target,
    fov,
    near: Math.max(16, distance * 0.03),
    far: 4400,
  };
}

/**
 * Computes geometric quality metrics for automated verification.
 */
export function analyzeTrackGeometry(
  curve: THREE.CatmullRomCurve3,
  frames: TrackFrame[],
  spectatorPos: THREE.Vector3,
): TrackGeometryMetrics {
  const n = frames.length;
  const totalLength = curve.getLength();
  const ds = totalLength / n;

  let minCurvatureRadius = Infinity;
  let maxAbsTrackCoord = 0;

  for (let i = 0; i < n; i++) {
    const prev = frames[(i - 1 + n) % n];
    const curr = frames[i];
    const next = frames[(i + 1) % n];

    // Turning angle across 2*ds
    const dot = THREE.MathUtils.clamp(prev.tangent.dot(next.tangent), -1, 1);
    const angle = Math.acos(dot);
    if (angle > 1e-4) {
      const radius = (2 * ds) / angle;
      if (radius < minCurvatureRadius) {
        minCurvatureRadius = radius;
      }
    }

    // Outer edge containment check
    for (const sign of [-1, 1]) {
      const ex = curr.position.x + curr.normal.x * TRACK_HALF * sign;
      const ez = curr.position.z + curr.normal.z * TRACK_HALF * sign;
      maxAbsTrackCoord = Math.max(maxAbsTrackCoord, Math.abs(ex), Math.abs(ez));
    }
  }

  // Non-adjacent segment clearance check (prevents crossings or overlapping tracks)
  // Ignore points within arc-length distance <= TRACK_WIDTH * 2.4 along the loop
  const minArcGap = TRACK_WIDTH * 2.4;
  let minNonAdjacentClearance = Infinity;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const arcDiff = Math.abs(frames[j].arcLength - frames[i].arcLength);
      const loopArcDist = Math.min(arcDiff, totalLength - arcDiff);
      if (loopArcDist < minArcGap) continue;

      const d = frames[i].position.distanceTo(frames[j].position);
      if (d < minNonAdjacentClearance) {
        minNonAdjacentClearance = d;
      }
    }
  }

  const { start, finish } = getBannerPlacements(curve);
  const bannerSeparation = start.position.distanceTo(finish.position);

  const camDirXZ = new THREE.Vector3(spectatorPos.x, 0, spectatorPos.z).normalize();
  const startFacingDot = Math.abs(start.tangent.dot(camDirXZ));
  const finishFacingDot = Math.abs(finish.tangent.dot(camDirXZ));

  return {
    totalLength,
    minCurvatureRadius,
    maxAbsTrackCoord,
    minNonAdjacentClearance,
    bannerSeparation,
    startFacingDot,
    finishFacingDot,
  };
}
