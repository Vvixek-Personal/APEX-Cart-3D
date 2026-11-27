import * as THREE from 'three';
import { ProceduralTextureSet } from './textures';
import {
  COASTAL_BEACH_PROPS,
  COASTAL_BOUNDS,
  COASTAL_LAMPS,
  COASTAL_PLOTS,
  COASTAL_PLAZA,
  COASTAL_ROAD_CURVES,
  COASTAL_SIGNALS,
  COASTAL_TREES,
  COASTAL_VENDING,
  getCoastalGroundY,
  sampleSignalPhase,
  SIGNAL_PHASE_OFFSETS,
} from './coastalCityLayout';
import {
  TOWN_PALETTE,
  buildOrganicTreeGeo,
  buildParkBenchGeo,
  buildSculptedTownhouseGeo,
  buildThreeTierFountainStoneGeo,
  buildVictorianLampPostGeo,
  mergeParts,
  rbox,
  rcyl,
  transformGeo,
} from './townSculptor';

export interface CoastalCityBuildResult {
  group: THREE.Group;
  update: (elapsedSeconds: number, nightFactor?: number) => void;
  dispose: () => void;
}

const ROAD_Y = COASTAL_BOUNDS.roadSurfaceY; // -0.71 (top of ribbon ≈ -0.70)
const WALK_Y = COASTAL_BOUNDS.sidewalkSurfaceY; // -0.64
const GROUND_Y = COASTAL_BOUNDS.groundY; // -0.85

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function createSignCanvasTexture(
  title: string,
  bgHex: string,
  accentHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 2;
  ctx.strokeRect(9, 9, 494, 110);
  ctx.fillStyle = '#eee9dd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fontSize = 44;
  do {
    ctx.font = `500 ${fontSize--}px "Segoe UI", Arial, sans-serif`;
  } while (ctx.measureText(title).width > 452 && fontSize > 16);
  ctx.fillText(title, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

interface RoadSamplePts {
  id: string;
  width: number;
  closed: boolean;
  pts: Array<{ x: number; z: number; tx: number; tz: number }>;
}

function sampleRoad(def: (typeof COASTAL_ROAD_CURVES)[number]): RoadSamplePts {
  const len = def.curve.getLength();
  const divisions = Math.max(48, Math.round(len / 3.5));
  const pts: RoadSamplePts['pts'] = [];
  for (let i = 0; i <= divisions; i++) {
    const t = i / divisions;
    const p = def.curve.getPointAt(t);
    const tan = def.curve.getTangentAt(t);
    pts.push({ x: p.x, z: p.z, tx: tan.x, tz: tan.z });
  }
  return { id: def.id, width: def.width, closed: def.closed, pts };
}

/** Distance from (x, z) to the centerline of any road except `selfId`. */
function distToOtherRoads(
  x: number,
  z: number,
  selfId: string,
  roads: RoadSamplePts[],
): number {
  let best = Infinity;
  for (const r of roads) {
    if (r.id === selfId) continue;
    for (const p of r.pts) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < best) best = d;
    }
  }
  return best;
}

const SHOP_NAMES: Record<string, ReadonlyArray<string>> = {
  shop: [
    'COASTAL MARKET',
    'SURF & SAIL',
    'SHELL SOUVENIRS',
    'HARBOR GROCER',
    'DRIFTWOOD GIFTS',
    'TIDE POOL TOYS',
    'NET & ROPE CO.',
  ],
  cafe: [
    'CAFÉ MARINA',
    'BLUE KETTLE',
    'SUNSET ROASTERS',
    'PALM CAFÉ',
    'SALT & CITRUS',
    'SEASIDE BAKERY',
  ],
  hotel: ['HOTEL AZUL', 'GRAND BAY HOTEL', 'SANDPIPER INN'],
  market: ['COASTAL FARMERS MARKET', 'PIER FISH MARKET'],
};

const WALL_COLORS = [
  TOWN_PALETTE.wallApricot,
  TOWN_PALETTE.wallCoral,
  TOWN_PALETTE.wallButtercup,
  TOWN_PALETTE.wallMint,
  TOWN_PALETTE.wallSage,
  TOWN_PALETTE.wallLavender,
  TOWN_PALETTE.wallPeriwinkle,
  TOWN_PALETTE.wallOchre,
  TOWN_PALETTE.brickTerracotta,
];
const WINDOW_PALETTES: ReadonlyArray<ReadonlyArray<number>> = [
  [TOWN_PALETTE.windowSkyGlass, TOWN_PALETTE.windowWarmLit, TOWN_PALETTE.windowDeep],
  [TOWN_PALETTE.windowRoseGlass, TOWN_PALETTE.windowAmberGlass, TOWN_PALETTE.windowDeep],
  [TOWN_PALETTE.windowMintGlass, TOWN_PALETTE.windowWarmLit, TOWN_PALETTE.windowSkyGlass],
];
const ACCENTS = [
  TOWN_PALETTE.shutterTeal,
  TOWN_PALETTE.shutterCobalt,
  TOWN_PALETTE.shutterOlive,
  TOWN_PALETTE.shutterRose,
  TOWN_PALETTE.shutterGold,
  TOWN_PALETTE.parisGreen,
];
const AWNINGS = [
  TOWN_PALETTE.awningCoral,
  TOWN_PALETTE.awningMint,
  TOWN_PALETTE.awningCobalt,
  TOWN_PALETTE.awningGold,
  TOWN_PALETTE.awningPlum,
  TOWN_PALETTE.awningCream,
];
const YAW_MAP = { s: 0, e: Math.PI * 0.5, n: Math.PI, w: -Math.PI * 0.5 } as const;

type Facing = 'n' | 's' | 'e' | 'w';

/**
 * Builds the entire Coastal City south of the Market Town:
 * - Curved Catmull-Rom boulevards with asphalt ribbons, granite sidewalks,
 *   curbs, double-yellow / dashed lane markings and edge lines
 * - Jittered, varied plot pads with sculpted townhouses, cafés, hotels &
 *   markets (signs, awnings, shutters)
 * - Working traffic signals, street lamps, vending machines & a palm plaza
 * - A sloped sandy beach, animated ocean, pier, umbrellas, boats & tower
 */
export function buildCoastalCity(textures: ProceduralTextureSet): CoastalCityBuildResult {
  const group = new THREE.Group();
  group.name = 'COASTAL_CITY_DISTRICT';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const extraTextures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const maxAnisotropy = textures.asphaltColor.anisotropy || 8;
  const rand = seededRand(20261127);

  // =========================================================================
  // 1. ROAD RIBBONS FROM SPLINES (+ sidewalks, curbs, markings)
  // =========================================================================
  const roadDefs = COASTAL_ROAD_CURVES.map(sampleRoad);

  const roadTopPos: number[] = [];
  const roadTopUv: number[] = [];
  const roadTopIdx: number[] = [];
  const roadSidePos: number[] = [];
  const roadSideIdx: number[] = [];
  const walkPos: number[] = [];
  const walkIdx: number[] = [];
  const yellowPos: number[] = [];
  const yellowIdx: number[] = [];
  const whitePos: number[] = [];
  const whiteIdx: number[] = [];

  const pushQuad = (
    pos: number[],
    idx: number[],
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    dx: number,
    dy: number,
    dz: number,
  ) => {
    const base = pos.length / 3;
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  roadDefs.forEach((road, roadIndex) => {
    // Per-road epsilon kills z-fighting where curved roads cross.
    const eps = roadIndex * 0.0022;
    const yTop = ROAD_Y + 0.01 + eps;
    const half = road.width * 0.5;
    const walkW = 3.6;
    const n = road.pts.length;
    const last = road.closed ? n : n - 1;

    for (let i = 0; i < last; i++) {
      const a = road.pts[i];
      const b = road.pts[(i + 1) % n];
      // Normals (perpendicular in XZ)
      const anx = -a.tz;
      const anz = a.tx;
      const bnx = -b.tz;
      const bnz = b.tx;

      const aLx = a.x + anx * half;
      const aLz = a.z + anz * half;
      const aRx = a.x - anx * half;
      const aRz = a.z - anz * half;
      const bLx = b.x + bnx * half;
      const bLz = b.z + bnz * half;
      const bRx = b.x - bnx * half;
      const bRz = b.z - bnz * half;

      // Asphalt top (world-projected UVs like the Market Town)
      const base = roadTopPos.length / 3;
      roadTopPos.push(aLx, yTop, aLz, bLx, yTop, bLz, bRx, yTop, bRz, aRx, yTop, aRz);
      roadTopUv.push(aLx / 4, aLz / 4, bLx / 4, bLz / 4, bRx / 4, bRz / 4, aRx / 4, aRz / 4);
      roadTopIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);

      // Road side skirts down to the ground plane
      pushQuad(roadSidePos, roadSideIdx, aLx, yTop, aLz, bLx, yTop, bLz, bLx, GROUND_Y - 0.02, bLz, aLx, GROUND_Y - 0.02, aLz);
      pushQuad(roadSidePos, roadSideIdx, bRx, yTop, bRz, aRx, yTop, aRz, aRx, GROUND_Y - 0.02, aRz, bRx, GROUND_Y - 0.02, bRz);

      // Sidewalk ribbons + curb faces + outer skirts (both sides)
      for (const side of [1, -1]) {
        const iLx = side === 1 ? aLx : aRx;
        const iLz = side === 1 ? aLz : aRz;
        const iRx2 = side === 1 ? bLx : bRx;
        const iRz2 = side === 1 ? bLz : bRz;
        const oAx = a.x + anx * side * (half + walkW);
        const oAz = a.z + anz * side * (half + walkW);
        const oBx = b.x + bnx * side * (half + walkW);
        const oBz = b.z + bnz * side * (half + walkW);

        // Top of sidewalk
        const wBase = walkPos.length / 3;
        walkPos.push(iLx, WALK_Y + eps, iLz, iRx2, WALK_Y + eps, iRz2, oBx, WALK_Y + eps, oBz, oAx, WALK_Y + eps, oAz);
        walkIdx.push(wBase, wBase + 1, wBase + 2, wBase, wBase + 2, wBase + 3);
        // Curb face (road edge up to sidewalk)
        pushQuad(walkPos, walkIdx, iLx, yTop - eps, iLz, iRx2, yTop - eps, iRz2, iRx2, WALK_Y + eps, iRz2, iLx, WALK_Y + eps, iLz);
        // Outer face down to ground
        pushQuad(walkPos, walkIdx, oAx, WALK_Y + eps, oAz, oBx, WALK_Y + eps, oBz, oBx, GROUND_Y - 0.02, oBz, oAx, GROUND_Y - 0.02, oAz);
      }

      // Lane markings (skip inside intersections of other roads)
      const midX = (a.x + b.x) * 0.5;
      const midZ = (a.z + b.z) * 0.5;
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      const midTx = (a.tx + b.tx) * 0.5;
      const midTz = (a.tz + b.tz) * 0.5;
      const midLen = Math.hypot(midTx, midTz) || 1;
      const dirX = midTx / midLen;
      const dirZ = midTz / midLen;
      const nearJunction = distToOtherRoads(midX, midZ, road.id, roadDefs) < 14;
      if (!nearJunction && segLen > 0.05) {
        const halfSeg = segLen * 0.5;
        const dash = (offset: number, width: number, targetPos: number[], targetIdx: number[]) => {
          const mx = midX + anx * offset;
          const mz = midZ + anz * offset;
          pushQuad(
            targetPos,
            targetIdx,
            mx - dirX * halfSeg, yTop + 0.012, mz - dirZ * halfSeg,
            mx + dirX * halfSeg, yTop + 0.012, mz + dirZ * halfSeg,
            mx + dirX * halfSeg + anx * width, yTop + 0.012, mz + dirZ * halfSeg + anz * width,
            mx - dirX * halfSeg + anx * width, yTop + 0.012, mz - dirZ * halfSeg + anz * width,
          );
        };
        if (road.width >= 26) {
          // Double-yellow centerline on arterials
          dash(-0.52, 0.16, yellowPos, yellowIdx);
          dash(0.36, 0.16, yellowPos, yellowIdx);
          // Dashed white lane dividers
          if ((i & 1) === 0) {
            dash(-road.width * 0.24, 0.15, whitePos, whiteIdx);
            dash(road.width * 0.24 - 0.15, 0.15, whitePos, whiteIdx);
          }
        } else {
          // Single dashed white centerline elsewhere
          if ((i & 1) === 0) dash(-0.08, 0.16, whitePos, whiteIdx);
        }
        // Continuous white edge lines
        dash(-half + 0.7, 0.16, whitePos, whiteIdx);
        dash(half - 0.86, 0.16, whitePos, whiteIdx);
      }
    }
  });

  const roadTopGeo = trackGeo(new THREE.BufferGeometry());
  roadTopGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadTopPos, 3));
  roadTopGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadTopUv, 2));
  roadTopGeo.setIndex(roadTopIdx);
  roadTopGeo.computeVertexNormals();
  const asphaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.asphaltColor,
      roughnessMap: textures.asphaltRoughness,
      roughness: 0.85,
      metalness: 0.02,
    }),
  );
  const roadTopMesh = new THREE.Mesh(roadTopGeo, asphaltMat);
  roadTopMesh.receiveShadow = true;
  group.add(roadTopMesh);

  const roadSideGeo = trackGeo(new THREE.BufferGeometry());
  roadSideGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadSidePos, 3));
  roadSideGeo.setIndex(roadSideIdx);
  roadSideGeo.computeVertexNormals();
  const roadSideMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3f4448, roughness: 0.9 }));
  group.add(new THREE.Mesh(roadSideGeo, roadSideMat));

  const walkGeo = trackGeo(new THREE.BufferGeometry());
  walkGeo.setAttribute('position', new THREE.Float32BufferAttribute(walkPos, 3));
  walkGeo.setIndex(walkIdx);
  walkGeo.computeVertexNormals();
  const walkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: TOWN_PALETTE.plazaCream, roughness: 0.88 }),
  );
  const walkMesh = new THREE.Mesh(walkGeo, walkMat);
  walkMesh.receiveShadow = true;
  group.add(walkMesh);

  const yellowGeo = trackGeo(new THREE.BufferGeometry());
  yellowGeo.setAttribute('position', new THREE.Float32BufferAttribute(yellowPos, 3));
  yellowGeo.setIndex(yellowIdx);
  yellowGeo.computeVertexNormals();
  const yellowMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf5c542, roughness: 0.7 }));
  group.add(new THREE.Mesh(yellowGeo, yellowMat));

  const whiteGeo = trackGeo(new THREE.BufferGeometry());
  whiteGeo.setAttribute('position', new THREE.Float32BufferAttribute(whitePos, 3));
  whiteGeo.setIndex(whiteIdx);
  whiteGeo.computeVertexNormals();
  const whiteMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.7 }));
  group.add(new THREE.Mesh(whiteGeo, whiteMat));

  // =========================================================================
  // 2. BASE GROUND, PLAZA ISLAND & FOUNTAIN
  // =========================================================================
  const cityDepth = COASTAL_BOUNDS.beachStartZ - COASTAL_BOUNDS.zMin + 8;
  const cityGroundGeo = trackGeo(new THREE.PlaneGeometry(COASTAL_BOUNDS.xMax - COASTAL_BOUNDS.xMin + 30, cityDepth));
  cityGroundGeo.rotateX(-Math.PI / 2);
  const lawnMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: textures.parkLawnColor, roughness: 0.95 }),
  );
  const cityGround = new THREE.Mesh(cityGroundGeo, lawnMat);
  cityGround.position.set(0, GROUND_Y, COASTAL_BOUNDS.zMin + cityDepth * 0.5 - 4);
  cityGround.receiveShadow = true;
  group.add(cityGround);

  // Paved plaza island inside the ring road
  const islandGeo = trackGeo(new THREE.CircleGeometry(46, 56));
  islandGeo.rotateX(-Math.PI / 2);
  const islandMat = trackMat(
    new THREE.MeshStandardMaterial({ color: TOWN_PALETTE.plazaWarmStone, roughness: 0.85 }),
  );
  const island = new THREE.Mesh(islandGeo, islandMat);
  island.position.set(COASTAL_PLAZA.x, WALK_Y + 0.01, COASTAL_PLAZA.z);
  island.receiveShadow = true;
  group.add(island);

  // Central three-tier fountain
  const fountainGeo = trackGeo(buildThreeTierFountainStoneGeo());
  transformGeo(fountainGeo, { pos: [COASTAL_PLAZA.x, WALK_Y, COASTAL_PLAZA.z] });
  const fountainMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78 }),
  );
  const fountain = new THREE.Mesh(fountainGeo, fountainMat);
  fountain.castShadow = true;
  fountain.receiveShadow = true;
  group.add(fountain);

  const fountainWaterGeo = trackGeo(new THREE.CircleGeometry(4.1, 40));
  fountainWaterGeo.rotateX(-Math.PI / 2);
  const fountainWaterMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: TOWN_PALETTE.waterPool,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.92,
    }),
  );
  const fountainWater = new THREE.Mesh(fountainWaterGeo, fountainWaterMat);
  fountainWater.position.set(COASTAL_PLAZA.x, WALK_Y + 1.65, COASTAL_PLAZA.z);
  group.add(fountainWater);

  // Palm ring + benches around the plaza island
  const palmRing: Array<{ x: number; z: number; yaw: number; scale: number }> = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    palmRing.push({
      x: COASTAL_PLAZA.x + Math.cos(a) * 40,
      z: COASTAL_PLAZA.z + Math.sin(a) * 40,
      yaw: a,
      scale: 0.9 + rand() * 0.35,
    });
  }

  // =========================================================================
  // 3. VARIED BUILDINGS ON JITTERED PLOTS (+ shop signs)
  // =========================================================================
  const buildingParts: THREE.BufferGeometry[] = [];
  const padParts: THREE.BufferGeometry[] = [];
  const signMeshes: THREE.Mesh[] = [];

  const nearestRoadFacing = (x: number, z: number): Facing => {
    let best = Infinity;
    let bx = x;
    let bz = z;
    for (const r of roadDefs) {
      for (let i = 0; i < r.pts.length; i += 3) {
        const p = r.pts[i];
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < best) {
          best = d;
          bx = p.x;
          bz = p.z;
        }
      }
    }
    const dx = bx - x;
    const dz = bz - z;
    if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'e' : 'w';
    return dz > 0 ? 's' : 'n';
  };

  for (let pi = 0; pi < COASTAL_PLOTS.length; pi++) {
    const p = COASTAL_PLOTS[pi];
    const prand = seededRand(p.seed);

    // Sidewalk pad under the building
    padParts.push(
      transformGeo(
        rbox(p.w + 6, 0.23, p.d + 6, 0.12, TOWN_PALETTE.plazaCream, 1, { bottomAO: 0.2 }),
        { pos: [p.x, WALK_Y - 0.105, p.z] },
      ),
    );

    const floors = p.floors;
    const h = 3.4 * floors + 1.8;
    const wallColor = WALL_COLORS[Math.floor(p.palette * WALL_COLORS.length) % WALL_COLORS.length];
    const accentColor = ACCENTS[Math.floor(prand() * ACCENTS.length)];
    const windowPalette =
      WINDOW_PALETTES[Math.floor(prand() * WINDOW_PALETTES.length) % WINDOW_PALETTES.length];
    const roofStyle: 'mansard' | 'terracotta' =
      p.roofStyle === 'mansard' || p.roofStyle === 'flat' ? 'mansard' : 'terracotta';
    const isShop = p.kind !== 'residential';
    const facing = nearestRoadFacing(p.x, p.z);

    const bGeo = buildSculptedTownhouseGeo({
      index: pi,
      w: p.w,
      d: p.d,
      h,
      wallColor,
      accentColor,
      windowPalette,
      facing,
      hasShopFront: isShop,
      awningColor: isShop ? AWNINGS[Math.floor(prand() * AWNINGS.length)] : undefined,
      roofStyle,
    });
    transformGeo(bGeo, { pos: [p.x, WALK_Y + 0.01, p.z] });
    buildingParts.push(bGeo);

    if (isShop) {
      const names = SHOP_NAMES[p.kind] ?? SHOP_NAMES.shop;
      const name = names[Math.floor(prand() * names.length)];
      const sTex = createSignCanvasTexture(name, '#243431', '#b8a47a', maxAnisotropy);
      extraTextures.push(sTex);
      const sMat = trackMat(
        new THREE.MeshStandardMaterial({ color: 0xffffff, map: sTex, roughness: 0.35 }),
      );
      const frontDist = facing === 'n' || facing === 's' ? p.d * 0.5 : p.w * 0.5;
      const fYaw = YAW_MAP[facing];
      const signW = Math.min(7.2, (facing === 'n' || facing === 's' ? p.w : p.d) * 0.86);
      const sMesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(signW, 1.5)), sMat);
      sMesh.rotation.y = fYaw;
      sMesh.position.set(
        p.x + Math.sin(fYaw) * (frontDist + 0.26),
        WALK_Y + 4.6,
        p.z + Math.cos(fYaw) * (frontDist + 0.26),
      );
      signMeshes.push(sMesh);
      group.add(sMesh);
    }
  }

  if (buildingParts.length > 0) {
    const sculptedMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.76 }),
    );
    const merged = trackGeo(mergeParts(buildingParts));
    const mesh = new THREE.Mesh(merged, sculptedMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (padParts.length > 0) {
    const padMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88 }),
    );
    const mergedPads = trackGeo(mergeParts(padParts));
    const padMesh = new THREE.Mesh(mergedPads, padMat);
    padMesh.receiveShadow = true;
    group.add(padMesh);
  }

  // =========================================================================
  // 4. BEACH: sloped sand, seabed, animated ocean, foam, pier & props
  // =========================================================================
  const beachWidth = COASTAL_BOUNDS.xMax - COASTAL_BOUNDS.xMin + 60;
  const sandStartZ = COASTAL_BOUNDS.beachStartZ - 2;
  const sandEndZ = COASTAL_BOUNDS.shoreZ + 46; // runs under the water as seabed
  const sandDepth = sandEndZ - sandStartZ;
  const sandGeo = trackGeo(new THREE.PlaneGeometry(beachWidth, sandDepth, 48, 26));
  sandGeo.rotateX(-Math.PI / 2);
  {
    const pos = sandGeo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i);
      const wz = pos.getZ(i) + (sandStartZ + sandDepth * 0.5);
      const y = getCoastalGroundY(wx, Math.min(wz, COASTAL_BOUNDS.shoreZ));
      // Continue sloping down as seabed past the shoreline
      let yy = y;
      if (wz > COASTAL_BOUNDS.shoreZ) {
        const t = Math.min(1, (wz - COASTAL_BOUNDS.shoreZ) / 46);
        yy = THREE.MathUtils.lerp(COASTAL_BOUNDS.waterY + 0.02, -1.9, t);
      }
      pos.setY(i, yy + 0.015 + Math.sin(wx * 0.11) * 0.03 + Math.cos(wz * 0.13) * 0.03);
    }
    pos.needsUpdate = true;
    sandGeo.computeVertexNormals();
  }
  const sandMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdcc79c, roughness: 0.97 }),
  );
  const sandMesh = new THREE.Mesh(sandGeo, sandMat);
  sandMesh.position.set(0, 0, sandStartZ + sandDepth * 0.5);
  sandMesh.receiveShadow = true;
  group.add(sandMesh);

  // Animated ocean surface
  const oceanGeo = trackGeo(new THREE.PlaneGeometry(880, 340, 64, 26));
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanBase = new Float32Array(oceanGeo.getAttribute('position').array as Float32Array);
  const oceanMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2e6f8f,
      roughness: 0.14,
      metalness: 0.45,
      transparent: true,
      opacity: 0.93,
    }),
  );
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.position.set(0, COASTAL_BOUNDS.waterY, COASTAL_BOUNDS.shoreZ + 160);
  ocean.receiveShadow = false;
  group.add(ocean);

  // Pulsing foam line along the shore
  const foamGeo = trackGeo(new THREE.PlaneGeometry(beachWidth, 7, 32, 1));
  foamGeo.rotateX(-Math.PI / 2);
  const foamMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf3f8fa,
      roughness: 0.6,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  const foam = new THREE.Mesh(foamGeo, foamMat);
  foam.position.set(0, COASTAL_BOUNDS.waterY + 0.06, COASTAL_BOUNDS.shoreZ + 1.5);
  group.add(foam);

  // Pier deck riding on the layout's pile positions
  const pierParts: THREE.BufferGeometry[] = [];
  const pierPiles = COASTAL_BEACH_PROPS.filter((p) => p.kind === 'pier_pile');
  if (pierPiles.length > 0) {
    const zs = pierPiles.filter((p) => p.x < 0).map((p) => p.z);
    const zMin = Math.min(...zs) - 3;
    const zMax = Math.max(...zs) + 4;
    pierParts.push(
      transformGeo(rbox(22, 0.5, zMax - zMin, 0.1, TOWN_PALETTE.woodOak, 1, { bottomAO: 0.3 }), {
        pos: [0, 0.55, (zMin + zMax) * 0.5],
      }),
    );
    // Rails
    for (const side of [-10.4, 10.4]) {
      pierParts.push(
        transformGeo(rbox(0.3, 0.9, zMax - zMin, 0.08, TOWN_PALETTE.woodWalnut), {
          pos: [side, 1.2, (zMin + zMax) * 0.5],
        }),
      );
    }
    // Piles
    for (const pile of pierPiles) {
      pierParts.push(
        transformGeo(rcyl(0.42, 0.5, 3.2, TOWN_PALETTE.woodWalnut, 8), {
          pos: [pile.x, -0.9, pile.z],
        }),
      );
    }
  }
  if (pierParts.length > 0) {
    const pierMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.86 }),
    );
    const pierMesh = new THREE.Mesh(trackGeo(mergeParts(pierParts)), pierMat);
    pierMesh.castShadow = true;
    pierMesh.receiveShadow = true;
    group.add(pierMesh);
  }

  // Umbrellas, towels, boats & lifeguard tower (vertex-colored merge)
  const beachParts: THREE.BufferGeometry[] = [];
  const umbrellaColors = [0xd9483b, 0x2f68ad, 0xe6a122, 0x2f8f72, 0x8a3d88];
  for (const prop of COASTAL_BEACH_PROPS) {
    const y = getCoastalGroundY(prop.x, prop.z);
    if (prop.kind === 'umbrella') {
      const col = umbrellaColors[Math.floor(rand() * umbrellaColors.length)];
      beachParts.push(transformGeo(rcyl(0.06, 0.07, 2.4, 0x9aa0a6, 8), { pos: [prop.x, y + 1.2, prop.z] }));
      beachParts.push(
        transformGeo(rcyl(0.1, 1.7, 0.75, col, 10), { pos: [prop.x, y + 2.5, prop.z] }),
      );
    } else if (prop.kind === 'towel') {
      const col = umbrellaColors[Math.floor(rand() * umbrellaColors.length)];
      beachParts.push(
        transformGeo(rbox(1.5, 0.06, 2.2, 0.03, col), {
          pos: [prop.x, y + 0.05, prop.z],
          rot: [0, prop.yaw, 0],
        }),
      );
    } else if (prop.kind === 'boat') {
      beachParts.push(
        transformGeo(rbox(2.4, 0.7, 5.6, 0.3, 0xe8e4d8, 2), {
          pos: [prop.x, y + 0.4, prop.z],
          rot: [0.06, prop.yaw, 0],
        }),
      );
      beachParts.push(
        transformGeo(rbox(1.6, 0.55, 1.8, 0.18, 0x3f6aa3), {
          pos: [prop.x, y + 0.95, prop.z - 0.6],
          rot: [0, prop.yaw, 0],
        }),
      );
    } else if (prop.kind === 'lifeguard') {
      for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
        beachParts.push(
          transformGeo(rbox(0.28, 2.4, 0.28, 0.05, TOWN_PALETTE.woodOak), {
            pos: [prop.x + lx, y + 1.2, prop.z + lz],
          }),
        );
      }
      beachParts.push(
        transformGeo(rbox(3.2, 0.3, 3.2, 0.08, TOWN_PALETTE.woodBirch), {
          pos: [prop.x, y + 2.5, prop.z],
        }),
      );
      beachParts.push(
        transformGeo(rbox(3.0, 1.7, 3.0, 0.1, 0xd9483b), { pos: [prop.x, y + 3.5, prop.z] }),
      );
      beachParts.push(
        transformGeo(rbox(3.6, 0.24, 3.6, 0.06, 0x8a2f26), { pos: [prop.x, y + 4.5, prop.z] }),
      );
    }
  }
  if (beachParts.length > 0) {
    const beachMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8 }),
    );
    const beachMesh = new THREE.Mesh(trackGeo(mergeParts(beachParts)), beachMat);
    beachMesh.castShadow = true;
    group.add(beachMesh);
  }

  // =========================================================================
  // 5. STREET LAMPS, PALMS & TREES (instanced)
  // =========================================================================
  const dummy = new THREE.Object3D();

  const lampPostGeo = trackGeo(buildVictorianLampPostGeo());
  const lampGlassGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.58, 0.42));
  const lampGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff3d0,
      emissive: new THREE.Color(0xffe082),
      emissiveIntensity: 0.12,
      roughness: 0.2,
    }),
  );
  const sculptedMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78 }),
  );

  if (COASTAL_LAMPS.length > 0) {
    const lampPostInst = new THREE.InstancedMesh(lampPostGeo, sculptedMat, COASTAL_LAMPS.length);
    const lampGlassInst = new THREE.InstancedMesh(lampGlassGeo, lampGlowMat, COASTAL_LAMPS.length);
    lampPostInst.castShadow = true;
    for (let i = 0; i < COASTAL_LAMPS.length; i++) {
      const spot = COASTAL_LAMPS[i];
      const y = getCoastalGroundY(spot.x, spot.z);
      dummy.position.set(spot.x, y, spot.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      lampPostInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(spot.x, y + 6.32, spot.z);
      dummy.updateMatrix();
      lampGlassInst.setMatrixAt(i, dummy.matrix);
    }
    lampPostInst.instanceMatrix.needsUpdate = true;
    lampGlassInst.instanceMatrix.needsUpdate = true;
    group.add(lampPostInst, lampGlassInst);
  }

  // Palms (custom simple geometry) — beach line + plaza ring
  const palmParts: THREE.BufferGeometry[] = [];
  // Trunk: slightly tapered cylinder; fronds: flattened cones fanning out
  const trunkGeo = rcyl(0.16, 0.3, 6.4, 0x8a6a48, 8);
  palmParts.push(trunkGeo);
  for (let f = 0; f < 7; f++) {
    const a = (f / 7) * Math.PI * 2;
    const frond = rcyl(0.02, 0.75, 3.4, f % 2 === 0 ? 0x4e7a3c : 0x5f8f46, 5);
    transformGeo(frond, {
      pos: [Math.cos(a) * 1.5, 7.0, Math.sin(a) * 1.5],
      rot: [Math.PI / 2.4 * Math.sin(a + 1), -a + Math.PI / 2, Math.PI / 2.6 * Math.cos(a)],
    });
    palmParts.push(frond);
  }
  const palmGeo = trackGeo(mergeParts(palmParts));
  const palmSpots = [
    ...COASTAL_TREES.filter((t) => t.palm).map((t) => ({ x: t.x, z: t.z, scale: 0.85 + seededRand(t.seed)() * 0.4 })),
    ...palmRing.map((p) => ({ x: p.x, z: p.z, scale: p.scale })),
  ];
  if (palmSpots.length > 0) {
    const palmInst = new THREE.InstancedMesh(palmGeo, sculptedMat, palmSpots.length);
    palmInst.castShadow = true;
    for (let i = 0; i < palmSpots.length; i++) {
      const s = palmSpots[i];
      dummy.position.set(s.x, getCoastalGroundY(s.x, s.z), s.z);
      dummy.rotation.set(0, seededRand(i * 97 + 13)() * Math.PI * 2, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      palmInst.setMatrixAt(i, dummy.matrix);
    }
    palmInst.instanceMatrix.needsUpdate = true;
    group.add(palmInst);
  }

  // Leafy trees along the avenues (3 species like the Market Town)
  const oakGeo = trackGeo(buildOrganicTreeGeo(7.6, TOWN_PALETTE.leafSage, 1.1));
  const sakuraGeo = trackGeo(buildOrganicTreeGeo(7.0, TOWN_PALETTE.sakuraPink, 2.4));
  const ginkgoGeo = trackGeo(buildOrganicTreeGeo(7.2, TOWN_PALETTE.ginkgoGold, 3.7));
  const leafy = COASTAL_TREES.filter((t) => !t.palm);
  const species = [
    { geo: oakGeo, spots: leafy.filter((_, i) => i % 3 === 0) },
    { geo: sakuraGeo, spots: leafy.filter((_, i) => i % 3 === 1) },
    { geo: ginkgoGeo, spots: leafy.filter((_, i) => i % 3 === 2) },
  ];
  for (const sp of species) {
    if (sp.spots.length === 0) continue;
    const inst = new THREE.InstancedMesh(sp.geo, sculptedMat, sp.spots.length);
    inst.castShadow = true;
    for (let i = 0; i < sp.spots.length; i++) {
      const t = sp.spots[i];
      dummy.position.set(t.x, getCoastalGroundY(t.x, t.z), t.z);
      dummy.rotation.set(0, seededRand(t.seed)() * Math.PI * 2, 0);
      dummy.scale.setScalar(0.85 + seededRand(t.seed + 7)() * 0.4);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }

  // Benches on the plaza island
  const benchGeo = trackGeo(buildParkBenchGeo());
  const benchCount = 8;
  const benchInst = new THREE.InstancedMesh(benchGeo, sculptedMat, benchCount);
  benchInst.castShadow = true;
  for (let i = 0; i < benchCount; i++) {
    const a = (i / benchCount) * Math.PI * 2 + 0.2;
    dummy.position.set(
      COASTAL_PLAZA.x + Math.cos(a) * 33,
      WALK_Y + 0.01,
      COASTAL_PLAZA.z + Math.sin(a) * 33,
    );
    dummy.rotation.set(0, -a + Math.PI / 2, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    benchInst.setMatrixAt(i, dummy.matrix);
  }
  benchInst.instanceMatrix.needsUpdate = true;
  group.add(benchInst);

  // =========================================================================
  // 6. VENDING MACHINES (glow at night)
  // =========================================================================
  const vendBodyGeo = trackGeo(rbox(1.0, 2.0, 0.8, 0.1, 0x2b3038, 1));
  const vendPanelGeo = trackGeo(new THREE.PlaneGeometry(0.78, 1.5));
  const vendPanelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9fd8ff,
      emissive: new THREE.Color(0x66c2ff),
      emissiveIntensity: 0.25,
      roughness: 0.3,
    }),
  );
  const vendBodyMat = sculptedMat;
  if (COASTAL_VENDING.length > 0) {
    const bodyInst = new THREE.InstancedMesh(vendBodyGeo, vendBodyMat, COASTAL_VENDING.length);
    const panelInst = new THREE.InstancedMesh(vendPanelGeo, vendPanelMat, COASTAL_VENDING.length);
    bodyInst.castShadow = true;
    for (let i = 0; i < COASTAL_VENDING.length; i++) {
      const v = COASTAL_VENDING[i];
      const y = getCoastalGroundY(v.x, v.z);
      dummy.position.set(v.x, y + 1.0, v.z);
      dummy.rotation.set(0, v.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      bodyInst.setMatrixAt(i, dummy.matrix);
      // Panel faces outward from the machine front (+Z local)
      dummy.position.set(
        v.x + Math.sin(v.yaw) * 0.42,
        y + 1.05,
        v.z + Math.cos(v.yaw) * 0.42,
      );
      dummy.rotation.set(0, v.yaw, 0);
      dummy.updateMatrix();
      panelInst.setMatrixAt(i, dummy.matrix);
    }
    bodyInst.instanceMatrix.needsUpdate = true;
    panelInst.instanceMatrix.needsUpdate = true;
    group.add(bodyInst, panelInst);
  }

  // =========================================================================
  // 7. TRAFFIC SIGNALS (pole instanced; lamp heads per-color instanced)
  // =========================================================================
  const signalPoleParts: THREE.BufferGeometry[] = [];
  for (const s of COASTAL_SIGNALS) {
    // Pole + cantilever arm pointing toward the junction center
    signalPoleParts.push(
      transformGeo(rcyl(0.14, 0.2, 6.6, 0x3a4046, 8), { pos: [s.x, 3.3, s.z] }),
    );
    const armLen = 5.5;
    const ax = -Math.sin(s.yaw) * 0; // pole local: arm along local +X after yaw
    void ax;
    signalPoleParts.push(
      transformGeo(rbox(armLen, 0.24, 0.24, 0.06, 0x3a4046), {
        pos: [s.x + Math.cos(s.yaw) * armLen * 0.5, 6.4, s.z - Math.sin(s.yaw) * armLen * 0.5],
        rot: [0, -s.yaw, 0],
      }),
    );
    // Signal head box at the arm end
    signalPoleParts.push(
      transformGeo(rbox(0.7, 1.9, 0.5, 0.08, 0x23272c), {
        pos: [s.x + Math.cos(s.yaw) * armLen, 5.7, s.z - Math.sin(s.yaw) * armLen],
        rot: [0, -s.yaw, 0],
      }),
    );
  }
  if (signalPoleParts.length > 0) {
    const signalPoleMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.7, metalness: 0.3 }),
    );
    const signalPoleMesh = new THREE.Mesh(trackGeo(mergeParts(signalPoleParts)), signalPoleMat);
    signalPoleMesh.castShadow = true;
    group.add(signalPoleMesh);
  }

  // Lamp bulbs: 3 instanced meshes (red / amber / green) colored per frame
  const lampGeo = trackGeo(new THREE.SphereGeometry(0.24, 10, 8));
  const lampMats = ['red', 'amber', 'green'].map((kind) =>
    trackMat(new THREE.MeshBasicMaterial({ color: kind === 'red' ? 0x551010 : kind === 'amber' ? 0x554410 : 0x105522 })),
  );
  const lampInsts = lampMats.map(
    (m) => new THREE.InstancedMesh(lampGeo, m, COASTAL_SIGNALS.length),
  );
  const LAMP_OFFSETS: ReadonlyArray<[number, number, number]> = [
    [0, 6.25, 0.3],
    [0, 5.7, 0.3],
    [0, 5.15, 0.3],
  ];
  COASTAL_SIGNALS.forEach((s, i) => {
    const ex = s.x + Math.cos(s.yaw) * 5.5;
    const ez = s.z - Math.sin(s.yaw) * 5.5;
    lampInsts.forEach((inst, li) => {
      const [ox, oy, oz] = LAMP_OFFSETS[li];
      dummy.position.set(
        ex + Math.cos(s.yaw) * ox + Math.sin(s.yaw) * oz,
        oy,
        ez - Math.sin(s.yaw) * ox + Math.cos(s.yaw) * oz,
      );
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
  });
  lampInsts.forEach((inst) => {
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  });

  // Signal phase offsets (staggered junctions, shared with the NPC brains)
  const signalOffsets = SIGNAL_PHASE_OFFSETS;
  const lampOnColors = [new THREE.Color(0xff2b2b), new THREE.Color(0xffb020), new THREE.Color(0x2bff6a)];
  const lampOffColors = [new THREE.Color(0x4a1010), new THREE.Color(0x4a3a10), new THREE.Color(0x0e4a1e)];
  const phaseScratch: Array<'red' | 'amber' | 'green'> = COASTAL_SIGNALS.map(() => 'red');

  // =========================================================================
  // 8. UPDATE LOOP: waves, foam, signals, lamps, vending, fountain
  // =========================================================================
  const oceanPos = oceanGeo.getAttribute('position') as THREE.BufferAttribute;

  const update = (elapsedSeconds: number, nightFactor = 0) => {
    // Ocean swell
    const t = elapsedSeconds;
    for (let i = 0; i < oceanPos.count; i++) {
      const x = oceanBase[i * 3];
      const z = oceanBase[i * 3 + 2];
      oceanPos.setY(
        i,
        Math.sin(x * 0.055 + t * 1.15) * 0.22 +
          Math.sin(z * 0.07 - t * 0.9) * 0.16 +
          Math.sin((x + z) * 0.03 + t * 0.6) * 0.1,
      );
    }
    oceanPos.needsUpdate = true;

    // Foam breathes in and out with the swell
    foam.position.z = COASTAL_BOUNDS.shoreZ + 1.5 + Math.sin(t * 0.7) * 2.2;
    foamMat.opacity = 0.4 + Math.sin(t * 0.7) * 0.18;

    // Fountain water slow swirl
    fountainWater.rotation.y = t * 0.22;

    // Night glow: lamps, vending panels
    const glow = 0.12 + nightFactor * 1.35;
    lampGlowMat.emissiveIntensity = glow;
    vendPanelMat.emissiveIntensity = 0.25 + nightFactor * 1.4;

    // Traffic signal lamps
    for (let i = 0; i < COASTAL_SIGNALS.length; i++) {
      const s = COASTAL_SIGNALS[i];
      const phase = sampleSignalPhase(elapsedSeconds, signalOffsets[i], s.axis);
      if (phaseScratch[i] !== phase) {
        phaseScratch[i] = phase;
        lampInsts[0].setColorAt(i, phase === 'red' ? lampOnColors[0] : lampOffColors[0]);
        lampInsts[1].setColorAt(i, phase === 'amber' ? lampOnColors[1] : lampOffColors[1]);
        lampInsts[2].setColorAt(i, phase === 'green' ? lampOnColors[2] : lampOffColors[2]);
        lampInsts[0].instanceColor!.needsUpdate = true;
        lampInsts[1].instanceColor!.needsUpdate = true;
        lampInsts[2].instanceColor!.needsUpdate = true;
      }
    }
  };

  // Prime initial lamp colors once
  for (let i = 0; i < COASTAL_SIGNALS.length; i++) {
    lampInsts[0].setColorAt(i, lampOffColors[0]);
    lampInsts[1].setColorAt(i, lampOffColors[1]);
    lampInsts[2].setColorAt(i, lampOffColors[2]);
  }
  lampInsts.forEach((inst) => {
    inst.instanceColor!.needsUpdate = true;
  });

  return {
    group,
    update,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of extraTextures) t.dispose();
      lampInsts.forEach((inst) => inst.dispose());
    },
  };
}
