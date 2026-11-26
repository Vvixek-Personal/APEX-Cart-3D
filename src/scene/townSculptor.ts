import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Rich sunlit European architectural & botanical palette calibrated for crisp WebGL shading.
 */
export const TOWN_PALETTE = {
  // Stone, plazas & roads
  plazaCream: 0xe6dccb,
  plazaSand: 0xd7c8b0,
  plazaWarmStone: 0xbfb09a,
  plazaRoseStone: 0xcab0a3,
  curbStone: 0x9c9286,
  grassMeadow: 0x4ca644,
  grassSunlit: 0x67be57,
  soilWarm: 0x6e503b,
  waterPool: 0x38bdf8,
  waterDeep: 0x0284c7,

  // Facades & trim
  wallApricot: 0xeba96a,
  wallCoral: 0xd97d63,
  wallButtercup: 0xedd08a,
  wallMint: 0x89b592,
  wallSage: 0x9cb89b,
  wallLavender: 0xb2a6be,
  wallPeriwinkle: 0xa4bde0,
  wallCreamTrim: 0xf4ecdc,
  wallLimestone: 0xded3be,
  wallOchre: 0xe2b164,
  brickTerracotta: 0xbd5d42,

  // Roofs, ironwork, wood & shutters
  roofSlate: 0x3c4659,
  roofTerracotta: 0xc45a3d,
  roofCopperPatina: 0x4f9181,
  shutterTeal: 0x3f7c73,
  shutterCobalt: 0x3f6aa3,
  shutterOlive: 0x5c7f4d,
  shutterRose: 0xc44b66,
  shutterGold: 0xd99b26,
  ironworkPlum: 0x262934,
  parisGreen: 0x2a5445,
  brassWarm: 0xd9a441,
  woodOak: 0x935f39,
  woodWalnut: 0x583823,
  woodBirch: 0xcba679,

  // Windows (vivid multi-color residential glazing)
  windowWarmLit: 0xffe07a,
  windowSkyGlass: 0x73c9f5,
  windowRoseGlass: 0xf99ab0,
  windowMintGlass: 0x86e8b5,
  windowAmberGlass: 0xffc66e,
  windowDeep: 0x2c4257,

  // Awnings, umbrellas & blossoms
  awningCoral: 0xd9483b,
  awningCream: 0xf7f1e5,
  awningMint: 0x2f8f72,
  awningCobalt: 0x2f68ad,
  awningGold: 0xe6a122,
  awningPlum: 0x8a3d88,

  // Flora & trees
  trunkBark: 0x624635,
  leafSage: 0x569648,
  leafDeep: 0x387032,
  sakuraPink: 0xe88488,
  sakuraBlush: 0xf5a8ad,
  ginkgoGold: 0xebb038,
  tulipCoral: 0xef4444,
  tulipYellow: 0xfacc15,
  lavenderSprig: 0x9c72cf,
} as const;

export interface PaintOptions {
  bottomAO?: number;
  topLift?: number;
}

export interface LoftStation {
  t: number;
  xCenter?: number;
  offsetCenter?: number;
  rx: number;
  rPlus: number;
  rMinus: number;
  powerPlus?: number;
  powerMinus?: number;
  scallopLobes?: number;
  scallopAmp?: number;
  scallopPhase?: number;
}

const _baseColor = new THREE.Color();
const _tmpColor = new THREE.Color();
const _aoTint = new THREE.Color(0x465170);
const _topTint = new THREE.Color(0xfffaf0);

function signedPow(val: number, exp: number): number {
  if (exp === 1 || val === 0) return val;
  return Math.sign(val) * Math.pow(Math.abs(val), exp);
}

function computeYBounds(posArr: ArrayLike<number>, count: number): { minY: number; ySpan: number } {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const y = posArr[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minY)) return { minY: 0, ySpan: 1 };
  return { minY, ySpan: Math.max(0.001, maxY - minY) };
}

function paintIndexedInPlace(
  geom: THREE.BufferGeometry,
  hexColor: number,
  opts: PaintOptions = {},
): THREE.BufferGeometry {
  const bottomAO = opts.bottomAO ?? 0.14;
  const topLift = opts.topLift ?? 0.06;
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const norm = geom.getAttribute('normal') as THREE.BufferAttribute;
  const count = pos.count;
  const posArr = pos.array as ArrayLike<number>;
  const normArr = norm.array as ArrayLike<number>;
  const { minY, ySpan } = computeYBounds(posArr, count);

  const colors = new Float32Array(count * 3);
  _baseColor.setHex(hexColor);
  const baseR = _baseColor.r;
  const baseG = _baseColor.g;
  const baseB = _baseColor.b;
  const aoR = _aoTint.r;
  const aoG = _aoTint.g;
  const aoB = _aoTint.b;
  const topR = _topTint.r;
  const topG = _topTint.g;
  const topB = _topTint.b;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const y = posArr[i3 + 1];
    const ny = normArr[i3 + 1];
    const tY = (y - minY) / ySpan;

    let r = baseR;
    let g = baseG;
    let b = baseB;

    if (bottomAO > 0) {
      const aoFactor = Math.min(
        0.34,
        (1.0 - Math.min(1.0, tY * 1.5)) * bottomAO + Math.max(0, -ny) * (bottomAO * 0.4),
      );
      if (aoFactor > 0) {
        r += (aoR - r) * aoFactor;
        g += (aoG - g) * aoFactor;
        b += (aoB - b) * aoFactor;
      }
    }
    if (topLift > 0) {
      const lift = Math.max(0, tY - 0.45) * 1.65 * topLift + Math.max(0, ny) * (topLift * 0.25);
      if (lift > 0) {
        const clamped = Math.min(0.24, lift);
        r += (topR - r) * clamped;
        g += (topG - g) * clamped;
        b += (topB - b) * clamped;
      }
    }

    colors[i3] = r;
    colors[i3 + 1] = g;
    colors[i3 + 2] = b;
  }

  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geom;
}

export function paintGeometry(
  source: THREE.BufferGeometry,
  hexColor: number,
  opts: PaintOptions = {},
): THREE.BufferGeometry {
  if (!source.getAttribute('normal')) {
    source.computeVertexNormals();
  }
  const stripped = new THREE.BufferGeometry();
  stripped.setAttribute('position', (source.getAttribute('position') as THREE.BufferAttribute).clone());
  stripped.setAttribute('normal', (source.getAttribute('normal') as THREE.BufferAttribute).clone());
  if (source.index) {
    stripped.setIndex(source.index.clone());
    return paintIndexedInPlace(stripped, hexColor, opts);
  }
  const merged = mergeVertices(stripped, 1e-4);
  stripped.dispose();
  return paintIndexedInPlace(merged, hexColor, opts);
}

export function transformGeo(
  geom: THREE.BufferGeometry,
  opts: {
    pos?: [number, number, number];
    rot?: [number, number, number];
    scale?: [number, number, number];
  },
): THREE.BufferGeometry {
  if (opts.scale) {
    geom.scale(opts.scale[0], opts.scale[1], opts.scale[2]);
  }
  if (opts.rot) {
    if (opts.rot[0] !== 0) geom.rotateX(opts.rot[0]);
    if (opts.rot[1] !== 0) geom.rotateY(opts.rot[1]);
    if (opts.rot[2] !== 0) geom.rotateZ(opts.rot[2]);
  }
  if (opts.pos) {
    geom.translate(opts.pos[0], opts.pos[1], opts.pos[2]);
  }
  return geom;
}

export function rbox(
  w: number,
  h: number,
  d: number,
  radius: number,
  hex: number,
  segments = 1,
  paintOpts?: PaintOptions,
): THREE.BufferGeometry {
  const safeR = Math.min(radius, w * 0.45, h * 0.45, d * 0.45);
  const raw = new RoundedBoxGeometry(w, h, d, segments, safeR);
  const painted = paintGeometry(raw, hex, paintOpts);
  raw.dispose();
  return painted;
}

export function rcyl(
  rTop: number,
  rBot: number,
  h: number,
  hex: number,
  radialSegments = 12,
  paintOpts?: PaintOptions,
): THREE.BufferGeometry {
  const raw = new THREE.CylinderGeometry(rTop, rBot, h, radialSegments, 1);
  const painted = paintGeometry(raw, hex, paintOpts);
  raw.dispose();
  return painted;
}

export function smoothSphere(
  radius: number,
  hex: number,
  wSegs = 12,
  hSegs = 10,
  scale?: [number, number, number],
  paintOpts?: PaintOptions,
): THREE.BufferGeometry {
  const raw = new THREE.SphereGeometry(radius, wSegs, hSegs);
  if (scale) {
    raw.scale(scale[0], scale[1], scale[2]);
  }
  const painted = paintGeometry(raw, hex, paintOpts);
  raw.dispose();
  return painted;
}

export function lathe(
  profile: Array<[number, number]>,
  hex: number,
  segments = 24,
  paintOpts?: PaintOptions,
): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y));
  const raw = new THREE.LatheGeometry(pts, segments);
  raw.computeVertexNormals();
  const painted = paintGeometry(raw, hex, paintOpts);
  raw.dispose();
  return painted;
}

export function tube(
  points: Array<[number, number, number]>,
  radius: number,
  hex: number,
  tubularSegments = 14,
  radialSegments = 7,
  paintOpts?: PaintOptions,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const raw = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const painted = paintGeometry(raw, hex, paintOpts);
  raw.dispose();
  return painted;
}

export function taperedTube(
  points: Array<[number, number, number]>,
  rStart: number,
  rEnd: number,
  hex: number,
  tubularSegments = 12,
  radialSegments = 7,
  paintOpts?: PaintOptions,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const vertCount = (tubularSegments + 1) * radialSegments;
  const positions = new Float32Array(vertCount * 3);
  const pt = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    const rad = rStart + (rEnd - rStart) * u;
    curve.getPointAt(u, pt);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j < radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const cosV = -Math.cos(v);
      const sinV = Math.sin(v);
      normal.set(
        cosV * N.x + sinV * B.x,
        cosV * N.y + sinV * B.y,
        cosV * N.z + sinV * B.z,
      );
      const idx = i * radialSegments + j;
      positions[idx * 3] = pt.x + rad * normal.x;
      positions[idx * 3 + 1] = pt.y + rad * normal.y;
      positions[idx * 3 + 2] = pt.z + rad * normal.z;
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < tubularSegments; i++) {
    const rA = i * radialSegments;
    const rB = (i + 1) * radialSegments;
    for (let j = 0; j < radialSegments; j++) {
      const jn = (j + 1) % radialSegments;
      indices.push(rA + j, rB + j, rA + jn);
      indices.push(rA + jn, rB + j, rB + jn);
    }
  }

  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  raw.setIndex(indices);
  raw.computeVertexNormals();
  const painted = paintGeometry(raw, hex, paintOpts);
  raw.dispose();
  return painted;
}

export function loftOrganicHull(
  stations: LoftStation[],
  radialSegments = 20,
  hex: number,
  opts: PaintOptions & { axis?: 'z' | 'y' } = {},
): THREE.BufferGeometry {
  const axis = opts.axis ?? 'y';
  const rings = stations.length;
  const cols = radialSegments;
  const vertCount = rings * cols;
  const positions = new Float32Array(vertCount * 3);

  for (let r = 0; r < rings; r++) {
    const st = stations[r];
    const xc = st.xCenter ?? 0;
    const oc = st.offsetCenter ?? 0;
    const pPlus = st.powerPlus ?? 1.0;
    const pMinus = st.powerMinus ?? 1.0;
    const lobes = st.scallopLobes ?? 0;
    const amp = st.scallopAmp ?? 0;
    const phase = st.scallopPhase ?? 0;
    for (let c = 0; c < cols; c++) {
      const theta = (c / cols) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const scallop = lobes > 0 ? 1.0 + amp * Math.sin(lobes * theta + phase) : 1.0;
      const isPlus = sinT >= 0;
      const exp = isPlus ? pPlus : pMinus;
      const radOrtho = isPlus ? st.rPlus : st.rMinus;
      const lx = xc + signedPow(cosT, exp) * st.rx * scallop;
      const lo = oc + signedPow(sinT, exp) * radOrtho * scallop;
      const idx = r * cols + c;
      if (axis === 'z') {
        positions[idx * 3] = lx;
        positions[idx * 3 + 1] = lo;
        positions[idx * 3 + 2] = st.t;
      } else {
        positions[idx * 3] = lx;
        positions[idx * 3 + 1] = st.t;
        positions[idx * 3 + 2] = lo;
      }
    }
  }

  const s0 = stations[0];
  const sN = stations[rings - 1];
  const windPos = (axis === 'z') === sN.t >= s0.t;
  const indices: number[] = [];
  for (let r = 0; r < rings - 1; r++) {
    const rowA = r * cols;
    const rowB = (r + 1) * cols;
    for (let c = 0; c < cols; c++) {
      const cn = (c + 1) % cols;
      const a = rowA + c;
      const b = rowA + cn;
      const d = rowB + c;
      const e = rowB + cn;
      if (windPos) {
        indices.push(a, b, d, b, e, d);
      } else {
        indices.push(a, d, b, b, d, e);
      }
    }
  }

  const fullPositions = new Float32Array((vertCount + 2) * 3);
  fullPositions.set(positions, 0);
  const startCapIdx = vertCount;
  const endCapIdx = vertCount + 1;
  if (axis === 'z') {
    fullPositions[startCapIdx * 3] = s0.xCenter ?? 0;
    fullPositions[startCapIdx * 3 + 1] = s0.offsetCenter ?? 0;
    fullPositions[startCapIdx * 3 + 2] = s0.t;
    fullPositions[endCapIdx * 3] = sN.xCenter ?? 0;
    fullPositions[endCapIdx * 3 + 1] = sN.offsetCenter ?? 0;
    fullPositions[endCapIdx * 3 + 2] = sN.t;
  } else {
    fullPositions[startCapIdx * 3] = s0.xCenter ?? 0;
    fullPositions[startCapIdx * 3 + 1] = s0.t;
    fullPositions[startCapIdx * 3 + 2] = s0.offsetCenter ?? 0;
    fullPositions[endCapIdx * 3] = sN.xCenter ?? 0;
    fullPositions[endCapIdx * 3 + 1] = sN.t;
    fullPositions[endCapIdx * 3 + 2] = sN.offsetCenter ?? 0;
  }

  const lastRow = (rings - 1) * cols;
  for (let c = 0; c < cols; c++) {
    const cn = (c + 1) % cols;
    if (windPos) {
      indices.push(startCapIdx, cn, c);
      indices.push(endCapIdx, lastRow + c, lastRow + cn);
    } else {
      indices.push(startCapIdx, c, cn);
      indices.push(endCapIdx, lastRow + cn, lastRow + c);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(fullPositions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return paintIndexedInPlace(geom, hex, opts);
}

export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (parts.length === 0) {
    return rbox(0.1, 0.1, 0.1, 0.02, 0xffffff);
  }
  if (parts.length === 1) {
    return parts[0];
  }
  const normalized = parts.map((p) => (p.index ? p : mergeVertices(p, 1e-4)));
  const merged = mergeGeometries(normalized, false);
  for (let i = 0; i < parts.length; i++) {
    if (normalized[i] !== parts[i]) normalized[i].dispose();
    parts[i].dispose();
  }
  if (!merged) {
    throw new Error('Failed to merge sculpted geometry parts');
  }
  return merged;
}

/**
 * Builds a frustum/hipped roof slab cleanly from bottom (w x d) to top (w*topRatio x d*topRatio).
 */
export function buildPitchedHipRoofGeo(
  w: number,
  d: number,
  h: number,
  topRatio: number,
  hex: number,
): THREE.BufferGeometry {
  const hw = w * 0.5;
  const hd = d * 0.5;
  const tw = hw * topRatio;
  const td = hd * topRatio;
  const hy = h * 0.5;

  const verts = [
    // Bottom & top corners: 0..3 bottom, 4..7 top
    [-hw, -hy, hd],
    [hw, -hy, hd],
    [hw, -hy, -hd],
    [-hw, -hy, -hd],
    [-tw, hy, td],
    [tw, hy, td],
    [tw, hy, -td],
    [-tw, hy, -td],
  ];

  const quads: Array<[number, number, number, number]> = [
    [0, 1, 5, 4], // Front +Z
    [1, 2, 6, 5], // Right +X
    [2, 3, 7, 6], // Back -Z
    [3, 0, 4, 7], // Left -X
    [4, 5, 6, 7], // Top flat
    [3, 2, 1, 0], // Bottom
  ];

  const pos: number[] = [];
  for (const [a, b, c, e] of quads) {
    const va = verts[a];
    const vb = verts[b];
    const vc = verts[c];
    const ve = verts[e];
    pos.push(
      va[0], va[1], va[2], vb[0], vb[1], vb[2], vc[0], vc[1], vc[2],
      va[0], va[1], va[2], vc[0], vc[1], vc[2], ve[0], ve[1], ve[2],
    );
  }

  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  raw.computeVertexNormals();
  const painted = paintGeometry(raw, hex, { bottomAO: 0.2, topLift: 0.08 });
  raw.dispose();
  return painted;
}

export interface SculptedBuildingInput {
  index: number;
  w: number;
  d: number;
  h: number;
  wallColor: number;
  accentColor: number;
  windowPalette: ReadonlyArray<number>;
  facing: 'n' | 's' | 'e' | 'w';
  hasShopFront: boolean;
  awningColor?: number;
  roofStyle: 'mansard' | 'terracotta';
}

const SHUTTER_PALETTE = [
  TOWN_PALETTE.shutterTeal,
  TOWN_PALETTE.shutterCobalt,
  TOWN_PALETTE.shutterOlive,
  TOWN_PALETTE.shutterRose,
  TOWN_PALETTE.shutterGold,
];

const FLOWER_BLOOM_PALETTE = [
  TOWN_PALETTE.tulipCoral,
  TOWN_PALETTE.tulipYellow,
  TOWN_PALETTE.lavenderSprig,
  TOWN_PALETTE.sakuraPink,
];

/**
 * Sculpts a rich multi-part European townhouse / apartment building (plinth, corner quoins,
 * belt courses, cornice, deep multi-part windows with sills/lintels/mullions/shutters/flowerboxes,
 * Juliet balconies, shopfront awning, and mansard dormer OR terracotta chimney roof)
 * merged into a single vertex-colored BufferGeometry. Local origin is ground center (0, 0, 0).
 */
export function buildSculptedTownhouseGeo(b: SculptedBuildingInput): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const { w, d, h } = b;
  const trim = TOWN_PALETTE.wallCreamTrim;
  const stone = TOWN_PALETTE.wallLimestone;

  // 1. Stone ground plinth + main stucco body + roof cornice
  const plinthH = 1.25;
  parts.push(
    transformGeo(rbox(w + 0.35, plinthH, d + 0.35, 0.1, stone, 1, { bottomAO: 0.26 }), {
      pos: [0, plinthH * 0.5, 0],
    }),
    transformGeo(rbox(w, h, d, 0.18, b.wallColor, 1, { bottomAO: 0.14, topLift: 0.05 }), {
      pos: [0, h * 0.5, 0],
    }),
    transformGeo(rbox(w + 0.72, 0.65, d + 0.72, 0.12, trim, 1, { bottomAO: 0.18 }), {
      pos: [0, h + 0.28, 0],
    }),
    transformGeo(rbox(w + 0.36, 0.38, d + 0.36, 0.08, b.accentColor, 1), {
      pos: [0, h - 0.12, 0],
    }),
  );

  // Corner vertical pilasters / quoins
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      parts.push(
        transformGeo(rbox(0.75, h - 0.3, 0.75, 0.1, trim, 1, { bottomAO: 0.16 }), {
          pos: [sx * (w * 0.5 - 0.18), h * 0.5, sz * (d * 0.5 - 0.18)],
        }),
      );
    }
  }

  // Horizontal belt courses between floors
  const floorH = 3.7;
  const floors = Math.max(2, Math.floor((h - 1.8) / floorH));
  for (let fl = 1; fl <= floors; fl++) {
    const by = 0.6 + fl * floorH;
    if (by < h - 1.1) {
      parts.push(
        transformGeo(rbox(w + 0.26, 0.26, d + 0.26, 0.05, trim, 1, { bottomAO: 0.12 }), {
          pos: [0, by, 0],
        }),
      );
    }
  }

  // 2. Ground-floor shopfront OR arched residential entrance on the front face
  const frontAxis: 'x' | 'z' = b.facing === 'e' || b.facing === 'w' ? 'x' : 'z';
  const frontSign: -1 | 1 = b.facing === 'e' || b.facing === 's' ? 1 : -1;
  const frontYawMap = { s: 0, e: Math.PI * 0.5, n: Math.PI, w: -Math.PI * 0.5 };
  const frontYaw = frontYawMap[b.facing];
  const frontSpan = frontAxis === 'x' ? d : w;
  const frontHalfDepth = frontAxis === 'x' ? w * 0.5 : d * 0.5;

  const pushFrontOriented = (geo: THREE.BufferGeometry, lx: number, ly: number, lz: number) => {
    const pos = new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), frontYaw);
    parts.push(transformGeo(geo, { rot: [0, frontYaw, 0], pos: [pos.x, pos.y, pos.z] }));
  };

  if (b.hasShopFront) {
    const bayW = Math.min(frontSpan - 2.2, 11.5);
    const awningCol = b.awningColor ?? TOWN_PALETTE.awningCoral;
    // Shop surround & window bay
    pushFrontOriented(rbox(bayW + 0.7, 3.65, 0.36, 0.08, b.accentColor, 1), 0, 1.95, frontHalfDepth + 0.06);
    pushFrontOriented(rbox(bayW - 0.5, 2.75, 0.42, 0.05, TOWN_PALETTE.windowDeep, 1), 0, 1.92, frontHalfDepth + 0.08);
    pushFrontOriented(rbox(bayW - 1.1, 2.35, 0.46, 0.04, TOWN_PALETTE.windowSkyGlass, 1), -0.9, 1.95, frontHalfDepth + 0.1);
    // Shop door + brass handle
    pushFrontOriented(rbox(1.55, 2.65, 0.48, 0.05, TOWN_PALETTE.woodOak, 1), bayW * 0.5 - 1.25, 1.48, frontHalfDepth + 0.1);
    pushFrontOriented(smoothSphere(0.1, TOWN_PALETTE.brassWarm, 8, 6), bayW * 0.5 - 1.75, 1.45, frontHalfDepth + 0.38);
    // Striped scalloped shop awning
    const stripeCount = 5;
    const segW = (bayW + 0.6) / stripeCount;
    for (let si = 0; si < stripeCount; si++) {
      const sx = -(bayW + 0.6) * 0.5 + segW * (si + 0.5);
      const sCol = si % 2 === 0 ? awningCol : TOWN_PALETTE.awningCream;
      pushFrontOriented(
        transformGeo(rbox(segW + 0.04, 0.24, 2.4, 0.06, sCol, 1), { rot: [0.28, 0, 0] }),
        sx,
        3.9,
        frontHalfDepth + 1.12,
      );
      pushFrontOriented(
        rbox(segW + 0.04, 0.32, 0.14, 0.04, sCol, 1),
        sx,
        3.48,
        frontHalfDepth + 2.2,
      );
    }
  } else {
    // Sculpted arched-top residential portal + brass hardware + metal portico
    pushFrontOriented(rbox(2.9, 3.3, 0.38, 0.1, trim, 1), 0, 1.75, frontHalfDepth + 0.08);
    pushFrontOriented(rbox(1.9, 2.75, 0.46, 0.06, TOWN_PALETTE.woodWalnut, 1), 0, 1.5, frontHalfDepth + 0.1);
    pushFrontOriented(rbox(3.8, 0.22, 1.45, 0.06, TOWN_PALETTE.ironworkPlum, 1), 0, 3.55, frontHalfDepth + 0.72);
    pushFrontOriented(smoothSphere(0.1, TOWN_PALETTE.brassWarm, 8, 6), 0.55, 1.45, frontHalfDepth + 0.38);
  }

  // 3. Detailed multi-part windows, shutters, flowerboxes & wrought-iron balconies on ALL 4 facades
  const faces: Array<{ yaw: number; span: number; halfDepth: number; isFront: boolean }> = [
    { yaw: 0, span: w, halfDepth: d * 0.5, isFront: b.facing === 's' },
    { yaw: Math.PI, span: w, halfDepth: d * 0.5, isFront: b.facing === 'n' },
    { yaw: Math.PI * 0.5, span: d, halfDepth: w * 0.5, isFront: b.facing === 'e' },
    { yaw: -Math.PI * 0.5, span: d, halfDepth: w * 0.5, isFront: b.facing === 'w' },
  ];

  for (let fi = 0; fi < faces.length; fi++) {
    const face = faces[fi];
    const cols = Math.max(2, Math.floor((face.span - 3.2) / 4.2));
    const colSpacing = cols > 1 ? (face.span - 5.2) / (cols - 1) : 0;
    const faceAxis = new THREE.Vector3(0, 1, 0);

    const pushFaceGeo = (geo: THREE.BufferGeometry, lx: number, ly: number, lz: number) => {
      const p = new THREE.Vector3(lx, ly, lz).applyAxisAngle(faceAxis, face.yaw);
      parts.push(transformGeo(geo, { rot: [0, face.yaw, 0], pos: [p.x, p.y, p.z] }));
    };

    for (let fl = 1; fl <= floors; fl++) {
      const wy = 0.6 + fl * floorH + floorH * 0.48;
      if (wy + 1.35 > h - 0.5) continue;

      for (let ci = 0; ci < cols; ci++) {
        const wx = cols === 1 ? 0 : -((cols - 1) * colSpacing) * 0.5 + ci * colSpacing;
        const winColor = b.windowPalette[(b.index + fl * 3 + ci * 5 + fi) % b.windowPalette.length];
        const shutterCol = SHUTTER_PALETTE[(b.index + fl + ci + fi) % SHUTTER_PALETTE.length];

        // Outer frame + projecting sill + carved stone keystone + lintel header + recessed glass
        pushFaceGeo(rbox(2.15, 2.35, 0.26, 0.06, trim, 1), wx, wy, face.halfDepth + 0.05);
        pushFaceGeo(rbox(2.45, 0.24, 0.44, 0.05, stone, 1), wx, wy + 1.24, face.halfDepth + 0.14);
        // Carved stone keystone above lintel
        pushFaceGeo(rbox(0.36, 0.32, 0.34, 0.04, stone, 1), wx, wy + 1.44, face.halfDepth + 0.16);
        pushFaceGeo(rbox(2.38, 0.22, 0.46, 0.05, stone, 1), wx, wy - 1.22, face.halfDepth + 0.16);
        pushFaceGeo(rbox(1.62, 1.88, 0.3, 0.04, winColor, 1, { bottomAO: 0.05, topLift: 0.12 }), wx, wy, face.halfDepth + 0.08);
        pushFaceGeo(rbox(1.68, 0.1, 0.34, 0.02, trim, 1), wx, wy + 0.25, face.halfDepth + 0.1);
        pushFaceGeo(rbox(0.1, 1.9, 0.34, 0.02, trim, 1), wx, wy, face.halfDepth + 0.1);

        // Louvered side shutters + brass wall sconce beside window on front facade
        pushFaceGeo(rbox(0.48, 2.1, 0.18, 0.04, shutterCol, 1), wx - 1.26, wy, face.halfDepth + 0.09);
        pushFaceGeo(rbox(0.48, 2.1, 0.18, 0.04, shutterCol, 1), wx + 1.26, wy, face.halfDepth + 0.09);

        if (face.isFront && ci === 0 && fl === 2) {
          // Decorative wall lantern sconce beside window
          pushFaceGeo(rbox(0.24, 0.36, 0.28, 0.04, TOWN_PALETTE.ironworkPlum, 1), wx - 1.62, wy + 0.2, face.halfDepth + 0.18);
          pushFaceGeo(smoothSphere(0.1, TOWN_PALETTE.windowWarmLit, 8, 6), wx - 1.62, wy + 0.15, face.halfDepth + 0.34);
        }

        // Alternate Juliet balconies & flowerboxes
        if (face.isFront && fl === 1 && ci % 2 === 0) {
          pushFaceGeo(rbox(2.5, 0.18, 0.85, 0.05, stone, 1), wx, wy - 1.28, face.halfDepth + 0.42);
          pushFaceGeo(rbox(2.45, 0.09, 0.09, 0.03, TOWN_PALETTE.ironworkPlum, 1), wx, wy - 0.56, face.halfDepth + 0.82);
          for (let bi = -3; bi <= 3; bi++) {
            pushFaceGeo(
              rcyl(0.035, 0.035, 0.72, TOWN_PALETTE.ironworkPlum, 6),
              wx + bi * 0.34,
              wy - 0.92,
              face.halfDepth + 0.82,
            );
          }
        } else if ((b.index + fl + ci) % 2 === 0) {
          const bloomCol = FLOWER_BLOOM_PALETTE[(b.index + fl + ci) % FLOWER_BLOOM_PALETTE.length];
          pushFaceGeo(rbox(1.9, 0.34, 0.46, 0.06, TOWN_PALETTE.woodOak, 1), wx, wy - 1.32, face.halfDepth + 0.26);
          for (let bl = -1; bl <= 1; bl++) {
            pushFaceGeo(
              smoothSphere(0.24, bloomCol, 8, 6, [1.15, 0.85, 0.95]),
              wx + bl * 0.52,
              wy - 1.06,
              face.halfDepth + 0.28,
            );
          }
        }
      }
    }
  }

  // 4. Sculpted Roof (Parisian Mansard Slate Roof w/ Dormers OR Terracotta Hip Roof w/ Chimneys)
  const roofBaseY = h + 0.55;
  const isMansard = b.roofStyle === 'mansard';
  const roofH = isMansard ? 3.8 : 3.2;
  const topRatio = isMansard ? 0.68 : 0.26;
  const roofHex = isMansard ? TOWN_PALETTE.roofSlate : TOWN_PALETTE.roofTerracotta;

  parts.push(
    transformGeo(buildPitchedHipRoofGeo(w + 0.5, d + 0.5, roofH, topRatio, roofHex), {
      pos: [0, roofBaseY + roofH * 0.5, 0],
    }),
    transformGeo(
      rbox(w * topRatio + 0.35, 0.32, d * topRatio + 0.35, 0.08, TOWN_PALETTE.roofCopperPatina, 1),
      { pos: [0, roofBaseY + roofH + 0.1, 0] },
    ),
  );

  if (isMansard) {
    const cw = w * topRatio;
    const cd = d * topRatio;
    // Wrought-iron crest railing around flat crown
    parts.push(
      transformGeo(rbox(cw, 0.45, 0.1, 0.02, TOWN_PALETTE.ironworkPlum, 1), { pos: [0, roofBaseY + roofH + 0.44, cd * 0.48] }),
      transformGeo(rbox(cw, 0.45, 0.1, 0.02, TOWN_PALETTE.ironworkPlum, 1), { pos: [0, roofBaseY + roofH + 0.44, -cd * 0.48] }),
      transformGeo(rbox(0.1, 0.45, cd, 0.02, TOWN_PALETTE.ironworkPlum, 1), { pos: [cw * 0.48, roofBaseY + roofH + 0.44, 0] }),
      transformGeo(rbox(0.1, 0.45, cd, 0.02, TOWN_PALETTE.ironworkPlum, 1), { pos: [-cw * 0.48, roofBaseY + roofH + 0.44, 0] }),
    );
    // Roof dormers facing street
    const dCount = Math.max(1, Math.floor((frontSpan - 3.5) / 5.5));
    const dStep = dCount > 1 ? (frontSpan - 5.0) / (dCount - 1) : 0;
    for (let k = 0; k < dCount; k++) {
      const off = dCount === 1 ? 0 : -((dCount - 1) * dStep) * 0.5 + k * dStep;
      const dx = frontAxis === 'x' ? frontSign * (w * 0.42) : off;
      const dz = frontAxis === 'z' ? frontSign * (d * 0.42) : off;
      const dy = roofBaseY + 1.45;
      parts.push(
        transformGeo(rbox(1.75, 2.05, 1.75, 0.06, trim, 1), { rot: [0, frontYaw, 0], pos: [dx, dy, dz] }),
        transformGeo(rbox(1.15, 1.45, 0.25, 0.03, TOWN_PALETTE.windowWarmLit, 1), {
          rot: [0, frontYaw, 0],
          pos: [
            frontAxis === 'x' ? dx + frontSign * 0.8 : dx,
            dy,
            frontAxis === 'z' ? dz + frontSign * 0.8 : dz,
          ],
        }),
        transformGeo(buildPitchedHipRoofGeo(2.05, 2.05, 0.85, 0.15, TOWN_PALETTE.roofCopperPatina), {
          pos: [dx, dy + 1.4, dz],
        }),
      );
    }
  }

  // Twin brick chimneys + stone caps + terracotta chimney pots
  for (const side of [-1, 1] as const) {
    const chX = side * (w * 0.24);
    const chZ = -d * 0.16;
    parts.push(
      transformGeo(rbox(1.25, 2.4, 1.25, 0.08, TOWN_PALETTE.brickTerracotta, 1), {
        pos: [chX, roofBaseY + roofH * 0.72 + 0.7, chZ],
      }),
      transformGeo(rbox(1.48, 0.26, 1.48, 0.05, trim, 1), {
        pos: [chX, roofBaseY + roofH * 0.72 + 1.96, chZ],
      }),
      transformGeo(rcyl(0.2, 0.24, 0.65, TOWN_PALETTE.roofTerracotta, 8), {
        pos: [chX - 0.26, roofBaseY + roofH * 0.72 + 2.38, chZ],
      }),
      transformGeo(rcyl(0.2, 0.24, 0.65, TOWN_PALETTE.roofTerracotta, 8), {
        pos: [chX + 0.26, roofBaseY + roofH * 0.72 + 2.38, chZ],
      }),
    );
  }

  return mergeParts(parts);
}

/**
 * Sculpts an articulated European street/park tree: flared root buttresses, curved trunk,
 * 4 diverging forked limbs, and layered scalloped foliage canopies merged cleanly.
 */
export function buildOrganicTreeGeo(height: number, canopyHex: number, seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkForkY = height * 0.44;
  const leanX = Math.sin(seed * 1.7 + 0.4) * (height * 0.035);
  const leanZ = Math.cos(seed * 1.3 + 0.8) * (height * 0.035);
  const rBase = Math.max(0.28, height * 0.044);
  const rMid = rBase * 0.66;

  // Curved tapered trunk
  parts.push(
    taperedTube(
      [
        [0, 0, 0],
        [leanX * 0.35, trunkForkY * 0.38, leanZ * 0.35],
        [leanX * 0.8, trunkForkY * 0.75, leanZ * 0.8],
        [leanX, trunkForkY, leanZ],
      ],
      rBase * 1.15,
      rMid,
      TOWN_PALETTE.trunkBark,
      10,
      8,
      { bottomAO: 0.24 },
    ),
  );

  // 3 flared root buttresses hugging ground
  for (let r = 0; r < 3; r++) {
    const ra = seed * 0.9 + (r / 3) * Math.PI * 2;
    parts.push(
      taperedTube(
        [
          [Math.cos(ra) * rBase * 1.65, 0.04, Math.sin(ra) * rBase * 1.65],
          [Math.cos(ra) * rBase * 0.8, height * 0.06, Math.sin(ra) * rBase * 0.8],
          [leanX * 0.15, height * 0.14, leanZ * 0.15],
        ],
        rBase * 0.42,
        rBase * 0.18,
        TOWN_PALETTE.trunkBark,
        6,
        6,
        { bottomAO: 0.26 },
      ),
    );
  }

  const underShade = new THREE.Color(canopyHex).offsetHSL(0, 0, -0.045).getHex();
  const crownLit = new THREE.Color(canopyHex).offsetHSL(-0.01, 0.03, 0.065).getHex();

  // 4 diverging curved limbs + scalloped foliage cushions
  for (let i = 0; i < 4; i++) {
    const a = seed * 0.7 + (i / 4) * Math.PI * 2 + 0.3;
    const reach = height * (0.25 + ((i % 2) * 0.05));
    const endY = trunkForkY + height * (0.28 + (i % 2) * 0.06);
    const ex = leanX + Math.cos(a) * reach;
    const ez = leanZ + Math.sin(a) * reach;

    parts.push(
      taperedTube(
        [
          [leanX, trunkForkY * 0.92, leanZ],
          [leanX + Math.cos(a) * reach * 0.48, trunkForkY + (endY - trunkForkY) * 0.5, leanZ + Math.sin(a) * reach * 0.48],
          [ex, endY, ez],
        ],
        rMid * 0.68,
        rMid * 0.26,
        TOWN_PALETTE.trunkBark,
        7,
        6,
      ),
    );

    const padRx = height * 0.22;
    const padRy = height * 0.14;
    parts.push(
      transformGeo(
        loftOrganicHull(
          [
            { t: -padRy * 0.4, rx: padRx * 0.15, rPlus: padRx * 0.15, rMinus: padRx * 0.15, scallopLobes: 7, scallopAmp: 0.05, scallopPhase: i + seed },
            { t: -padRy * 0.1, rx: padRx, rPlus: padRx * 0.98, rMinus: padRx * 0.98, scallopLobes: 7, scallopAmp: 0.15, scallopPhase: i + seed + 0.2 },
            { t: padRy * 0.35, rx: padRx * 0.78, rPlus: padRx * 0.78, rMinus: padRx * 0.78, scallopLobes: 7, scallopAmp: 0.13, scallopPhase: i + seed + 0.4 },
            { t: padRy * 0.8, rx: padRx * 0.14, rPlus: padRx * 0.14, rMinus: padRx * 0.14, scallopLobes: 7, scallopAmp: 0.04, scallopPhase: i + seed + 0.6 },
          ],
          18,
          i % 2 === 0 ? canopyHex : underShade,
          { axis: 'y', bottomAO: 0.16, topLift: 0.1 },
        ),
        { pos: [ex, endY + padRy * 0.15, ez] },
      ),
    );
  }

  // Sunlit upper crown foliage cluster
  const topRx = height * 0.28;
  const topRy = height * 0.18;
  parts.push(
    transformGeo(
      loftOrganicHull(
        [
          { t: -topRy * 0.4, rx: topRx * 0.2, rPlus: topRx * 0.2, rMinus: topRx * 0.2, scallopLobes: 8, scallopAmp: 0.06, scallopPhase: seed },
          { t: 0, rx: topRx, rPlus: topRx, rMinus: topRx, scallopLobes: 8, scallopAmp: 0.14, scallopPhase: seed + 0.25 },
          { t: topRy * 0.48, rx: topRx * 0.7, rPlus: topRx * 0.7, rMinus: topRx * 0.7, scallopLobes: 8, scallopAmp: 0.12, scallopPhase: seed + 0.5 },
          { t: topRy * 0.88, rx: topRx * 0.14, rPlus: topRx * 0.14, rMinus: topRx * 0.14, scallopLobes: 8, scallopAmp: 0.04, scallopPhase: seed + 0.7 },
        ],
        20,
        crownLit,
        { axis: 'y', bottomAO: 0.12, topLift: 0.14 },
      ),
      { pos: [leanX, height * 0.84, leanZ] },
    ),
  );

  return mergeParts(parts);
}

/**
 * Sculpts a curved cast-iron & warm oak park bench (local origin at ground center).
 */
export function buildParkBenchGeo(woodHex: number = TOWN_PALETTE.woodOak): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const width = 2.75;

  for (const x of [-1.15, 0, 1.15]) {
    parts.push(
      tube([[x, 0.03, 0.42], [x, 0.3, 0.38], [x, 0.56, 0.34]], 0.048, TOWN_PALETTE.parisGreen, 8, 6),
      tube(
        [[x, 0.03, -0.36], [x, 0.32, -0.3], [x, 0.56, -0.28], [x, 0.95, -0.36], [x, 1.24, -0.44]],
        0.048,
        TOWN_PALETTE.parisGreen,
        10,
        6,
      ),
      tube([[x, 0.54, 0.43], [x, 0.54, 0.04], [x, 0.56, -0.29]], 0.04, TOWN_PALETTE.parisGreen, 6, 6),
    );
  }
  for (const x of [-1.15, 1.15]) {
    parts.push(
      tube([[x, 0.56, 0.4], [x, 0.82, 0.41], [x, 0.88, 0.12], [x, 0.86, -0.32]], 0.045, TOWN_PALETTE.parisGreen, 10, 6),
    );
  }
  // Oak seat slats
  for (let s = 0; s < 3; s++) {
    parts.push(
      transformGeo(rbox(width, 0.06, 0.19, 0.02, woodHex, 1), {
        pos: [0, 0.58, 0.25 - s * 0.23],
      }),
    );
  }
  // Oak backrest slats
  for (let b = 0; b < 3; b++) {
    parts.push(
      transformGeo(rbox(width, 0.15, 0.06, 0.02, woodHex, 1), {
        rot: [-0.22, 0, 0],
        pos: [0, 0.84 + b * 0.17, -0.34 - b * 0.04],
      }),
    );
  }
  return mergeParts(parts);
}

/**
 * Sculpts the carved 3-tier stone Botanical Park Fountain using LatheGeometry profiles.
 */
export function buildThreeTierFountainStoneGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // Lower octagonal/turned carved stone basin bowl
    lathe(
      [
        [0.001, 0.0],
        [4.6, 0.0],
        [4.45, 0.22],
        [4.4, 0.92],
        [3.88, 0.92],
        [3.8, 0.26],
        [0.001, 0.26],
      ],
      TOWN_PALETTE.wallLimestone,
      24,
      { bottomAO: 0.22 },
    ),
    // Lower fluted pedestal
    transformGeo(rcyl(0.76, 1.0, 1.85, TOWN_PALETTE.wallCreamTrim, 14), { pos: [0, 1.2, 0] }),
    // Middle carved stone bowl
    transformGeo(
      lathe(
        [
          [0.001, 0.0],
          [0.85, 0.0],
          [2.05, 0.34],
          [2.24, 0.62],
          [1.96, 0.62],
          [1.88, 0.28],
          [0.001, 0.28],
        ],
        TOWN_PALETTE.wallLimestone,
        20,
      ),
      { pos: [0, 2.08, 0] },
    ),
    // Upper pedestal + bowl + copper patina finial
    transformGeo(rcyl(0.45, 0.62, 1.45, TOWN_PALETTE.wallCreamTrim, 12), { pos: [0, 3.05, 0] }),
    transformGeo(
      lathe(
        [
          [0.001, 0.0],
          [0.48, 0.0],
          [1.08, 0.24],
          [1.2, 0.44],
          [1.0, 0.44],
          [0.95, 0.2],
          [0.001, 0.2],
        ],
        TOWN_PALETTE.wallLimestone,
        18,
      ),
      { pos: [0, 3.74, 0] },
    ),
    transformGeo(
      smoothSphere(0.42, TOWN_PALETTE.roofCopperPatina, 12, 10, [0.85, 1.35, 0.85]),
      { pos: [0, 4.5, 0] },
    ),
  ];
  return mergeParts(parts);
}

/**
 * Sculpts an ornate Victorian European streetlamp post (for InstancedMesh placement).
 */
export function buildVictorianLampPostGeo(): THREE.BufferGeometry {
  const dark = TOWN_PALETTE.ironworkPlum;
  const brass = TOWN_PALETTE.brassWarm;
  const parts: THREE.BufferGeometry[] = [
    transformGeo(rcyl(0.32, 0.42, 0.6, dark, 10), { pos: [0, 0.3, 0] }),
    transformGeo(rcyl(0.18, 0.28, 0.9, dark, 10), { pos: [0, 1.05, 0] }),
    transformGeo(rcyl(0.11, 0.16, 4.4, dark, 8), { pos: [0, 3.7, 0] }),
    transformGeo(rcyl(0.24, 0.12, 0.22, brass, 8), { pos: [0, 5.95, 0] }),
    // Lantern roof cap & top finial
    transformGeo(rcyl(0.06, 0.48, 0.42, dark, 6), { pos: [0, 6.82, 0] }),
    transformGeo(smoothSphere(0.1, brass, 8, 6), { pos: [0, 7.1, 0] }),
    // 4 corner cage struts
    ...[
      [-0.24, -0.24],
      [0.24, -0.24],
      [0.24, 0.24],
      [-0.24, 0.24],
    ].map(([sx, sz]) =>
      transformGeo(rcyl(0.025, 0.025, 0.65, dark, 5), { pos: [sx, 6.32, sz] }),
    ),
  ];
  return mergeParts(parts);
}
