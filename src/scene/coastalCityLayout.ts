/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coastal City — the second, organically laid-out district.
 *
 * Unlike the strict 6x4 grid of the original Market Town, this city is woven
 * from CURVED boulevards (Catmull-Rom splines) that bend and fork the way real
 * streets do: a sinuous beachfront promenade, a winding north arterial that
 * connects to the Market Town, a ring road around a central palm plaza, and a
 * scattering of cross streets. Building plots are jittered on a loose grid and
 * excluded from road corridors and the beach, giving natural variation in house
 * size, height and roofing. The southern edge dissolves into a sandy BEACH and
 * an animated ocean.
 *
 * All heights reuse the Market Town convention so the kart transitions seamlessly:
 *   road surface   y = -0.71
 *   sidewalk / pad y = -0.64
 *   open ground    y = -0.85
 *   beach          y slopes -0.64 -> -1.05 toward the water
 *   ocean surface  y = -1.05 (drivable-but-slow like grass)
 */

import * as THREE from 'three';

function isPointInRect(
  x: number,
  z: number,
  r: { xMin: number; xMax: number; zMin: number; zMax: number },
): boolean {
  return x >= r.xMin && x <= r.xMax && z >= r.zMin && z <= r.zMax;
}

export const COASTAL_BOUNDS = {
  xMin: -238,
  xMax: 238,
  zMin: 540, // overlaps the southern end of the Market Town Main Avenue for a seamless drive
  zMax: 1160,
  roadSurfaceY: -0.71,
  sidewalkSurfaceY: -0.64,
  groundY: -0.85,
  beachStartZ: 1000, // from here south the land becomes sand
  shoreZ: 1078, // water begins here
  waterY: -1.05,
} as const;

const PLAZA_CENTER = new THREE.Vector2(0, 826);
const PLAZA_RADIUS = 64;
/** Paved island inside the ring road where the fountain stands. */
const PLAZA_ISLAND_RADIUS = 46;

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface CoastalRoadDef {
  id: string;
  width: number;
  closed: boolean;
  points: Array<[number, number]>;
}

/**
 * Curved road network. Every road is a smooth spline; widths vary to read as
 * arterials, avenues and promenades. The first road deliberately starts at the
 * Market Town's southern Main Avenue so players can drive straight into the city.
 */
export const COASTAL_ROADS: ReadonlyArray<CoastalRoadDef> = [
  // North arterial: town Main Ave -> central palm plaza roundabout (gentle S-curve).
  // Terminates on the plaza ring (z = 764) so the fountain island stays clear.
  {
    id: 'north_arterial',
    width: 30,
    closed: false,
    points: [
      [0, 528],
      [0, 536],
      [6, 600],
      [-10, 680],
      [4, 758],
      [0, 764],
    ],
  },
  // Central boulevard: plaza roundabout -> beachfront (winds east then back)
  {
    id: 'central_boulevard',
    width: 27,
    closed: false,
    points: [
      [0, 888],
      [14, 930],
      [2, 975],
      [-12, 1015],
      [-4, 1058],
    ],
  },
  // Beachfront promenade: a long sinuous curve hugging the shore
  {
    id: 'beach_promenade',
    width: 24,
    closed: false,
    points: [
      [-226, 992],
      [-150, 1004],
      [-70, 996],
      [10, 1010],
      [92, 998],
      [166, 1008],
      [228, 996],
    ],
  },
  // West avenue (curving)
  {
    id: 'west_avenue',
    width: 22,
    closed: false,
    points: [
      [-168, 576],
      [-182, 660],
      [-160, 760],
      [-176, 870],
      [-150, 980],
    ],
  },
  // East avenue (curving, mirror-ish but distinct)
  {
    id: 'east_avenue',
    width: 22,
    closed: false,
    points: [
      [176, 580],
      [190, 670],
      [168, 770],
      [186, 880],
      [158, 986],
    ],
  },
  // Mid-ring cross street (wavy E-W)
  {
    id: 'mid_ring',
    width: 21,
    closed: false,
    points: [
      [-176, 760],
      [-80, 772],
      [0, 760],
      [86, 772],
      [184, 760],
    ],
  },
  // Midtown cross street (lower)
  {
    id: 'midtown_cross',
    width: 20,
    closed: false,
    points: [
      [-168, 884],
      [-70, 896],
      [20, 884],
      [110, 896],
      [186, 884],
    ],
  },
  // Upper cross street near the plaza
  {
    id: 'upper_cross',
    width: 20,
    closed: false,
    points: [
      [-176, 678],
      [-72, 690],
      [12, 678],
      [104, 690],
      [182, 678],
    ],
  },
  // Ring road looping the central palm plaza (closed spline)
  {
    id: 'plaza_ring',
    width: 18,
    closed: true,
    points: [
      [0, 760],
      [54, 792],
      [44, 884],
      [-44, 884],
      [-54, 792],
    ],
  },
  // Shore connector tying the promenade ends to the central boulevard mouth
  {
    id: 'shore_connector',
    width: 18,
    closed: false,
    points: [
      [-150, 980],
      [-70, 1010],
      [10, 1058],
      [110, 1010],
      [158, 986],
    ],
  },
];

interface RoadSample {
  def: CoastalRoadDef;
  half: number;
  pts: Float32Array; // [x0,z0, x1,z1, ...]
}

function buildRoadSamples(): RoadSample[] {
  const out: RoadSample[] = [];
  for (const def of COASTAL_ROADS) {
    const vecs = def.points.map((p) => new THREE.Vector3(p[0], 0, p[1]));
    const curve = new THREE.CatmullRomCurve3(vecs, def.closed, 'catmullrom', 0.5);
    const divisions = Math.max(40, Math.round(curve.getLength() / 4));
    const sampled = curve.getPoints(divisions);
    const arr = new Float32Array(sampled.length * 2);
    for (let i = 0; i < sampled.length; i++) {
      arr[i * 2] = sampled[i].x;
      arr[i * 2 + 1] = sampled[i].z;
    }
    out.push({ def, half: def.width * 0.5, pts: arr });
  }
  return out;
}

const ROAD_SAMPLES = buildRoadSamples();

/** Catmull‑Rom curves for mesh building (single source of truth with queries). */
export const COASTAL_ROAD_CURVES: ReadonlyArray<{
  id: string;
  width: number;
  closed: boolean;
  curve: THREE.CatmullRomCurve3;
}> = COASTAL_ROADS.map((def) => ({
  id: def.id,
  width: def.width,
  closed: def.closed,
  curve: new THREE.CatmullRomCurve3(
    def.points.map((p) => new THREE.Vector3(p[0], 0, p[1])),
    def.closed,
    'catmullrom',
    0.5,
  ),
}));

function distToPolyline(px: number, pz: number, pts: Float32Array): number {
  let best = Infinity;
  const n = pts.length / 2;
  for (let i = 0; i < n - 1; i++) {
    const ax = pts[i * 2];
    const az = pts[i * 2 + 1];
    const bx = pts[(i + 1) * 2];
    const bz = pts[(i + 1) * 2 + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 1e-6 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t;
    const cz = az + dz * t;
    const ddx = px - cx;
    const ddz = pz - cz;
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d < best) best = d;
  }
  return best;
}

export function isPositionInCoastalRegion(x: number, z: number): boolean {
  return (
    x >= COASTAL_BOUNDS.xMin - 30 &&
    x <= COASTAL_BOUNDS.xMax + 30 &&
    z >= COASTAL_BOUNDS.zMin - 20 &&
    z <= COASTAL_BOUNDS.zMax + 20
  );
}

export function isPositionOnCoastalRoad(x: number, z: number): boolean {
  if (!isPositionInCoastalRegion(x, z)) return false;
  for (let i = 0; i < ROAD_SAMPLES.length; i++) {
    const s = ROAD_SAMPLES[i];
    if (distToPolyline(x, z, s.pts) <= s.half + 1.2) return true;
  }
  return false;
}

export type CoastalPlotKind = 'residential' | 'shop' | 'cafe' | 'hotel' | 'market';

export interface CoastalPlot {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  kind: CoastalPlotKind;
  seed: number;
  /** 0..1 facade palette selector */
  palette: number;
  floors: number;
  roofStyle: 'pitched' | 'flat' | 'mansard' | 'terrace';
}

interface Rect {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

function buildPlots(): CoastalPlot[] {
  const rand = seededRand(9173);
  const plots: CoastalPlot[] = [];
  const stepX = 46;
  const stepZ = 44;
  let id = 0;
  for (let gx = COASTAL_BOUNDS.xMin + 24; gx <= COASTAL_BOUNDS.xMax - 24; gx += stepX) {
    for (let gz = 600; gz <= COASTAL_BOUNDS.beachStartZ - 18; gz += stepZ) {
      const jx = gx + (rand() - 0.5) * 16;
      const jz = gz + (rand() - 0.5) * 14;
      // Keep clear of the central palm plaza
      if (Math.hypot(jx - PLAZA_CENTER.x, jz - PLAZA_CENTER.y) < PLAZA_RADIUS + 14) continue;
      // Keep clear of road corridors
      let onRoad = false;
      for (let i = 0; i < ROAD_SAMPLES.length; i++) {
        const s = ROAD_SAMPLES[i];
        if (distToPolyline(jx, jz, s.pts) < s.half + 13) {
          onRoad = true;
          break;
        }
      }
      if (onRoad) continue;
      if (jx < COASTAL_BOUNDS.xMin + 12 || jx > COASTAL_BOUNDS.xMax - 12) continue;
      const w = 18 + rand() * 12;
      const d = 16 + rand() * 12;
      // Proximity to avenues/plaza biases toward commercial uses
      const nearAvenue =
        Math.abs(jx) > 120 || Math.hypot(jx - PLAZA_CENTER.x, jz - PLAZA_CENTER.y) < 120;
      const r = rand();
      let kind: CoastalPlotKind = 'residential';
      if (nearAvenue && r < 0.5) kind = 'shop';
      else if (nearAvenue && r < 0.66) kind = 'cafe';
      else if (r < 0.08) kind = 'hotel';
      else if (r < 0.16) kind = 'market';
      const floors =
        kind === 'hotel'
          ? 4 + Math.floor(rand() * 4)
          : kind === 'residential'
            ? 1 + Math.floor(rand() * 2)
            : kind === 'market'
              ? 1
              : 1 + Math.floor(rand() * 2);
      const roofs: CoastalPlot['roofStyle'][] = ['pitched', 'flat', 'mansard', 'terrace'];
      plots.push({
        id: `coast_plot_${id++}`,
        x: jx,
        z: jz,
        w,
        d,
        kind,
        seed: Math.floor(rand() * 1e9),
        palette: rand(),
        floors,
        roofStyle: roofs[Math.floor(rand() * roofs.length)],
      });
    }
  }
  return plots;
}

export const COASTAL_PLOTS: ReadonlyArray<CoastalPlot> = buildPlots();

const PLOT_RECTS: Rect[] = COASTAL_PLOTS.map((p) => ({
  xMin: p.x - p.w * 0.5 - 3,
  xMax: p.x + p.w * 0.5 + 3,
  zMin: p.z - p.d * 0.5 - 3,
  zMax: p.z + p.d * 0.5 + 3,
}));

export function isPositionOnCoastalPlot(x: number, z: number): boolean {
  if (!isPositionInCoastalRegion(x, z)) return false;
  for (let i = 0; i < PLOT_RECTS.length; i++) {
    if (isPointInRect(x, z, PLOT_RECTS[i])) return true;
  }
  return false;
}

export function isCoastalBeach(x: number, z: number): boolean {
  return (
    z >= COASTAL_BOUNDS.beachStartZ &&
    z < COASTAL_BOUNDS.shoreZ &&
    x >= COASTAL_BOUNDS.xMin &&
    x <= COASTAL_BOUNDS.xMax
  );
}

export function isCoastalWater(x: number, z: number): boolean {
  return z >= COASTAL_BOUNDS.shoreZ && x >= COASTAL_BOUNDS.xMin && x <= COASTAL_BOUNDS.xMax;
}

/** Paved circular plaza inside the ring road (fountain island). */
export function isPositionOnCoastalPlaza(x: number, z: number): boolean {
  if (!isPositionInCoastalRegion(x, z)) return false;
  const dx = x - PLAZA_CENTER.x;
  const dz = z - PLAZA_CENTER.y;
  return dx * dx + dz * dz <= PLAZA_ISLAND_RADIUS * PLAZA_ISLAND_RADIUS;
}

/** Smooth ground height across the Coastal City for kart & character physics. */
export function getCoastalGroundY(x: number, z: number): number {
  if (!isPositionInCoastalRegion(x, z)) return COASTAL_BOUNDS.groundY;
  if (isPositionOnCoastalRoad(x, z)) return COASTAL_BOUNDS.roadSurfaceY;
  if (isCoastalWater(x, z)) return COASTAL_BOUNDS.waterY;
  if (isCoastalBeach(x, z)) {
    const t = THREE.MathUtils.clamp(
      (z - COASTAL_BOUNDS.beachStartZ) / (COASTAL_BOUNDS.shoreZ - COASTAL_BOUNDS.beachStartZ),
      0,
      1,
    );
    return THREE.MathUtils.lerp(COASTAL_BOUNDS.sidewalkSurfaceY, COASTAL_BOUNDS.waterY + 0.02, t);
  }
  if (isPositionOnCoastalPlaza(x, z)) return COASTAL_BOUNDS.sidewalkSurfaceY;
  if (isPositionOnCoastalPlot(x, z)) return COASTAL_BOUNDS.sidewalkSurfaceY;
  return COASTAL_BOUNDS.groundY;
}

export interface CoastalSignal {
  id: string;
  x: number;
  z: number;
  /** facing yaw of the pole (radians) */
  yaw: number;
  /**
   * Which flow this signal governs: 'ns' = north-south traffic may pass when
   * green, 'ew' = east-west. NPCs and the visual lamp heads both read this.
   */
  axis: 'ns' | 'ew';
}

export interface CoastalVendingSpot {
  x: number;
  z: number;
  yaw: number;
  kind: 'drink' | 'snack' | 'icecream';
}

export interface CoastalLampSpot {
  x: number;
  z: number;
}

export interface CoastalTreeSpot {
  x: number;
  z: number;
  palm: boolean;
  seed: number;
}

export interface CoastalBeachProp {
  kind: 'umbrella' | 'towel' | 'lifeguard' | 'pier_pile' | 'boat';
  x: number;
  z: number;
  yaw: number;
}

function buildSignals(): CoastalSignal[] {
  const rand = seededRand(4421);
  // Intersections of the arterials / ring with the cross streets.
  // axis = which traffic flow the signal governs at that junction.
  const candidates: Array<[number, number, 'ns' | 'ew']> = [
    [0, 760, 'ns'],
    [0, 884, 'ns'],
    [-168, 760, 'ew'],
    [176, 760, 'ew'],
    [-160, 870, 'ew'],
    [168, 870, 'ew'],
    [-176, 678, 'ew'],
    [182, 678, 'ew'],
    [-150, 980, 'ns'],
    [158, 986, 'ns'],
    [-4, 1058, 'ns'],
    [-12, 1010, 'ns'],
  ];
  const signals: CoastalSignal[] = [];
  candidates.forEach(([x, z, axis], i) => {
    signals.push({ id: `signal_${i}`, x, z, yaw: rand() * Math.PI, axis });
  });
  return signals;
}

export type SignalPhase = 'red' | 'amber' | 'green';

/**
 * Deterministic traffic-signal cycle shared by the lamp meshes and the NPC
 * brains. 26 s cycle: NS green → NS amber → all-red → EW green → EW amber →
 * all-red. `phaseOffset` staggers junctions so they don't pulse in lockstep.
 */
export function sampleSignalPhase(
  elapsedSeconds: number,
  phaseOffset: number,
  axis: 'ns' | 'ew',
): SignalPhase {
  const CYCLE = 26;
  const t = (((elapsedSeconds + phaseOffset) % CYCLE) + CYCLE) % CYCLE;
  const nsLight: SignalPhase = t < 10 ? 'green' : t < 12.5 ? 'amber' : 'red';
  const ewLight: SignalPhase = t >= 13 && t < 23 ? 'green' : t >= 23 && t < 25.5 ? 'amber' : 'red';
  return axis === 'ns' ? nsLight : ewLight;
}

export const COASTAL_SIGNALS: ReadonlyArray<CoastalSignal> = buildSignals();

/** Per-junction stagger for the shared traffic-signal cycle. */
export const SIGNAL_PHASE_OFFSETS: ReadonlyArray<number> = COASTAL_SIGNALS.map(
  (_, i) => i * 3.7,
);

/** Unit normal (perpendicular) to the road polyline at sample index i. */
function normalAt(s: RoadSample, i: number): [number, number] {
  const n = s.pts.length / 2;
  const i0 = Math.max(0, i - 1);
  const i1 = Math.min(n - 1, i + 1);
  const tx = s.pts[i1 * 2] - s.pts[i0 * 2];
  const tz = s.pts[i1 * 2 + 1] - s.pts[i0 * 2 + 1];
  const len = Math.hypot(tx, tz) || 1;
  return [-tz / len, tx / len];
}

function buildVending(): CoastalVendingSpot[] {
  const rand = seededRand(7711);
  const spots: CoastalVendingSpot[] = [];
  const kinds: CoastalVendingSpot['kind'][] = ['drink', 'snack', 'icecream'];
  // Cluster vending along the beachfront promenade & the plaza ring, always on
  // the sidewalk just outside the curb (perpendicular offset from the spline).
  const prom = ROAD_SAMPLES.find((s) => s.def.id === 'beach_promenade');
  const ring = ROAD_SAMPLES.find((s) => s.def.id === 'plaza_ring');
  for (let i = 0; i < 26; i++) {
    const useProm = rand() > 0.4 && prom;
    const s = (useProm ? prom! : ring!) as RoadSample;
    const idx = 2 + Math.floor(rand() * (s.pts.length / 2 - 4));
    const [nx, nz] = normalAt(s, idx);
    const side = rand() > 0.5 ? 1 : -1;
    const off = (s.half + 2.6) * side;
    const x = s.pts[idx * 2] + nx * off;
    const z = s.pts[idx * 2 + 1] + nz * off;
    // Face the road
    const yaw = Math.atan2(-nx * side, -nz * side);
    spots.push({ x, z, yaw, kind: kinds[Math.floor(rand() * kinds.length)] });
  }
  return spots;
}

export const COASTAL_VENDING: ReadonlyArray<CoastalVendingSpot> = buildVending();

function buildLamps(): CoastalLampSpot[] {
  const spots: CoastalLampSpot[] = [];
  for (const s of ROAD_SAMPLES) {
    const n = s.pts.length / 2;
    for (let i = 2; i < n - 2; i += 10) {
      const [nx, nz] = normalAt(s, i);
      const x = s.pts[i * 2];
      const z = s.pts[i * 2 + 1];
      const off = s.half + 2.4;
      spots.push({ x: x + nx * off, z: z + nz * off });
      spots.push({ x: x - nx * off, z: z - nz * off });
    }
  }
  return spots;
}

export const COASTAL_LAMPS: ReadonlyArray<CoastalLampSpot> = buildLamps();

function buildTrees(): CoastalTreeSpot[] {
  const rand = seededRand(3088);
  const spots: CoastalTreeSpot[] = [];
  // Palms along the beachfront dune line
  for (let i = 0; i < 40; i++) {
    const z = COASTAL_BOUNDS.beachStartZ - 20 - rand() * 10;
    const x = -210 + rand() * 420;
    if (isPositionOnCoastalRoad(x, z)) continue;
    spots.push({ x, z, palm: true, seed: Math.floor(rand() * 1e9) });
  }
  // Mixed trees along avenues (perpendicular offset from the spline)
  for (let i = 0; i < 60; i++) {
    const s = ROAD_SAMPLES[Math.floor(rand() * ROAD_SAMPLES.length)];
    const n = s.pts.length / 2;
    const idx = 2 + Math.floor(rand() * (n - 4));
    const [nx, nz] = normalAt(s, idx);
    const off = (s.half + 4.5) * (rand() > 0.5 ? 1 : -1);
    const x = s.pts[idx * 2] + nx * off;
    const z = s.pts[idx * 2 + 1] + nz * off;
    if (isPositionOnCoastalRoad(x, z) || isPositionOnCoastalPlot(x, z)) continue;
    spots.push({ x, z, palm: rand() > 0.7, seed: Math.floor(rand() * 1e9) });
  }
  return spots;
}

export const COASTAL_TREES: ReadonlyArray<CoastalTreeSpot> = buildTrees();

function buildBeachProps(): CoastalBeachProp[] {
  const rand = seededRand(5521);
  const props: CoastalBeachProp[] = [];
  // Beach umbrellas & towels
  for (let i = 0; i < 34; i++) {
    const z = COASTAL_BOUNDS.beachStartZ + 8 + rand() * (COASTAL_BOUNDS.shoreZ - COASTAL_BOUNDS.beachStartZ - 16);
    const x = -200 + rand() * 400;
    props.push({ kind: rand() > 0.5 ? 'umbrella' : 'towel', x, z, yaw: rand() * Math.PI });
  }
  // Lifeguard tower near the central beach
  props.push({ kind: 'lifeguard', x: 6, z: COASTAL_BOUNDS.shoreZ - 22, yaw: Math.PI });
  // A few small boats pulled up on the sand
  for (let i = 0; i < 4; i++) {
    props.push({
      kind: 'boat',
      x: -150 + i * 90,
      z: COASTAL_BOUNDS.shoreZ - 10 - rand() * 6,
      yaw: (rand() - 0.5) * 0.6,
    });
  }
  // Wooden pier: two rows of piles marching straight out into the water
  for (let row = 0; row < 2; row++) {
    const px = row === 0 ? -9 : 9;
    for (let i = 0; i < 9; i++) {
      props.push({
        kind: 'pier_pile',
        x: px,
        z: COASTAL_BOUNDS.shoreZ + 3 + i * 7,
        yaw: 0,
      });
    }
  }
  return props;
}

export const COASTAL_BEACH_PROPS: ReadonlyArray<CoastalBeachProp> = buildBeachProps();

export interface TownColliderBox {
  id: string;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

/** Solid building footprints so the kart cannot drive through houses. */
export const COASTAL_COLLIDERS: ReadonlyArray<TownColliderBox> = COASTAL_PLOTS.map((p) => ({
  id: p.id,
  xMin: p.x - p.w * 0.5,
  xMax: p.x + p.w * 0.5,
  zMin: p.z - p.d * 0.5,
  zMax: p.z + p.d * 0.5,
}));

/**
 * Pedestrian ROUTINES: every NPC is assigned one of these closed loops and walks
 * it forever (with phase offsets), pausing at red signals. Loops are sampled
 * directly from the road splines so NPCs keep to the sidewalks and streets.
 */
export interface NpcRoute {
  id: string;
  loop: Array<THREE.Vector3>;
  /** Half-width of the road this route follows (sidewalk offset basis). */
  halfWidth: number;
}

function sampleLoop(defId: string, samples: number, offset = 0): THREE.Vector3[] {
  const def = COASTAL_ROAD_CURVES.find((c) => c.id === defId);
  if (!def) return [];
  const out: THREE.Vector3[] = [];
  if (def.closed) {
    for (let i = 0; i < samples; i++) {
      const t = ((i / samples + offset) % 1 + 1) % 1;
      out.push(def.curve.getPointAt(t));
    }
  } else {
    // Open spline: walk out along the road, then back along it, so the loop
    // never cuts a diagonal through buildings.
    const half = Math.max(4, Math.floor(samples / 2));
    for (let i = 0; i <= half; i++) {
      const t = THREE.MathUtils.clamp(i / half + offset * 0.02, 0, 1);
      out.push(def.curve.getPointAt(t));
    }
    for (let i = half - 1; i >= 1; i--) {
      const t = THREE.MathUtils.clamp(i / half + offset * 0.02, 0, 1);
      const p = def.curve.getPointAt(t);
      // Shift to the right-hand sidewalk on the return leg
      const tangent = def.curve.getTangentAt(t);
      const nx = -tangent.z;
      const nz = tangent.x;
      const off = def.width * 0.5 - 3.5;
      out.push(new THREE.Vector3(p.x + nx * off, 0, p.z + nz * off));
    }
  }
  return out;
}

function sampleTownPromenade(): THREE.Vector3[] {
  // Loop up the east side of Main Ave (between parked cars at ±24.5 and the
  // curb at ±30), cross at South Market St, and come back down the west side.
  const pts: Array<[number, number]> = [
    [27.5, 254],
    [27.5, 340],
    [27.5, 450],
    [-27.5, 450],
    [-27.5, 340],
    [-27.5, 254],
  ];
  return pts.map((p) => new THREE.Vector3(p[0], 0, p[1]));
}

function roadHalfWidth(defId: string): number {
  return (COASTAL_ROADS.find((r) => r.id === defId)?.width ?? 20) * 0.5;
}

export const NPC_ROUTES: ReadonlyArray<NpcRoute> = [
  { id: 'route_promenade', loop: sampleLoop('beach_promenade', 26), halfWidth: roadHalfWidth('beach_promenade') },
  { id: 'route_ring', loop: sampleLoop('plaza_ring', 22), halfWidth: roadHalfWidth('plaza_ring') },
  { id: 'route_west_ave', loop: sampleLoop('west_avenue', 20), halfWidth: roadHalfWidth('west_avenue') },
  { id: 'route_east_ave', loop: sampleLoop('east_avenue', 20), halfWidth: roadHalfWidth('east_avenue') },
  { id: 'route_north', loop: sampleLoop('north_arterial', 18), halfWidth: roadHalfWidth('north_arterial') },
  { id: 'route_shore', loop: sampleLoop('shore_connector', 20), halfWidth: roadHalfWidth('shore_connector') },
  { id: 'route_midring', loop: sampleLoop('mid_ring', 18, 0.1), halfWidth: roadHalfWidth('mid_ring') },
  // Market Town Main Avenue loop already follows the curb line
  { id: 'route_town', loop: sampleTownPromenade(), halfWidth: 0 },
];

/** World-space positions of the traffic signals, for NPC signal obedience. */
export const SIGNAL_WORLD_POS: ReadonlyArray<THREE.Vector3> = COASTAL_SIGNALS.map(
  (s) => new THREE.Vector3(s.x, 0, s.z),
);

export const COASTAL_PLAZA = { x: PLAZA_CENTER.x, z: PLAZA_CENTER.y, radius: PLAZA_RADIUS };
