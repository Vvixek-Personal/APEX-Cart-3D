import * as THREE from 'three';
import { buildStreetDetails } from './buildStreetDetails';
import { FIELD_HALF, PARK_HALF } from '../track/trackLayout';
import { ProceduralTextureSet } from './textures';
import {
  TOWN_BLOCKS,
  TOWN_BOUNDS,
  TOWN_BUILDINGS,
  TOWN_MARKET_STALLS,
  TOWN_PARKING_LOTS,
  TOWN_PARKS,
  TOWN_ROADS,
} from './townLayout';
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
  smoothSphere,
  transformGeo,
} from './townSculptor';

export interface MarketDistrictBuildResult {
  group: THREE.Group;
  update: (elapsedSeconds: number) => void;
  dispose: () => void;
}

function createSignCanvasTexture(
  title: string,
  subtitle: string,
  bgHex: string,
  accentHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, 988, 220);
  ctx.fillStyle = '#eee9dd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Measure before drawing: long names must never be clipped or squeezed.
  let fontSize = 64;
  do { ctx.font = `500 ${fontSize--}px "Segoe UI", Arial, sans-serif`; }
  while (ctx.measureText(title).width > 910 && fontSize > 22);
  ctx.fillText(title, 512, subtitle ? 100 : 130);
  if (subtitle) {
    ctx.fillStyle = '#cbb98f';
    ctx.font = '400 30px "Segoe UI", Arial, sans-serif';
    ctx.fillText(subtitle, 512, 174);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Builds the high-detail Town & Market District south of the stadium:
 * - 24 strictly uniform 44 x 40 city blocks framed with chamfered granite curbs
 * - Small multi-lane streets & narrow neighborhood alleys ("small small roads")
 * - Full enterable sloped asphalt road straight into the Stadium South Gate
 * - Sculpted European townhouses & ground-floor shops (rounded bevels, vertex-baked AO,
 *   corner pilasters, belt courses, colorful recessed windows, mullions, shutters,
 *   wrought-iron balconies, flowerboxes, mansard dormer & terracotta chimney roofs)
 * - Open-air Farmers' Market with turned-post stalls, striped canopies, apple pyramids & bunting
 * - Central Botanical Park with carved 3-tier LatheGeometry stone fountain, gazebo & organic trees
 */
export function buildMarketDistrict(textures: ProceduralTextureSet): MarketDistrictBuildResult {
  const group = new THREE.Group();
  group.name = 'MARKET_AND_RESIDENTIAL_DISTRICT';
  const streetDetails = buildStreetDetails();
  group.add(streetDetails.group);

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
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const getSolidMat = (color: number, roughness = 0.72, metalness = 0.05): THREE.MeshStandardMaterial => {
    const key = `${color}_${roughness}_${metalness}`;
    const existing = matCache.get(key);
    if (existing) return existing;
    const mat = trackMat(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
    matCache.set(key, mat);
    return mat;
  };

  const sculptedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.76,
      metalness: 0.04,
    }),
  );

  const groundY = TOWN_BOUNDS.groundY; // -0.85
  const roadY = TOWN_BOUNDS.roadSurfaceY; // -0.71
  const sidewalkY = TOWN_BOUNDS.sidewalkSurfaceY; // -0.64

  const townLawnMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.parkLawnColor,
      roughness: 0.9,
    }),
  );
  const asphaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.asphaltColor,
      roughnessMap: textures.asphaltRoughness,
      roughness: 0.85,
      metalness: 0.02,
    }),
  );
  const earthMat = getSolidMat(TOWN_PALETTE.soilWarm, 0.94, 0.0);
  const paintWhiteMat = getSolidMat(0xf4f7fa, 0.7, 0.0);
  const paintYellowMat = getSolidMat(0xf5c542, 0.68, 0.0);
  const waterMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: TOWN_PALETTE.waterPool,
      roughness: 0.14,
      metalness: 0.25,
      emissive: new THREE.Color(TOWN_PALETTE.waterDeep),
      emissiveIntensity: 0.22,
    }),
  );
  const lampGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff8dc,
      emissive: new THREE.Color(0xffe082),
      emissiveIntensity: 0.78,
      roughness: 0.2,
    }),
  );

  // =========================================================================
  // 1. BASE TOWN GROUND, STADIUM CONNECTOR RAMP & SMALL MULTI-LANE ROADS
  // =========================================================================
  const districtDepth = TOWN_BOUNDS.zMax - TOWN_BOUNDS.zMin + 14;
  const districtWidth = 376;
  const districtZCenter = TOWN_BOUNDS.zMin + districtDepth * 0.5 - 2;

  const groundGeo = trackGeo(new THREE.PlaneGeometry(districtWidth, districtDepth));
  groundGeo.rotateX(-Math.PI / 2);
  const groundMesh = new THREE.Mesh(groundGeo, townLawnMat);
  groundMesh.position.set(0, groundY, districtZCenter);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  const plinthGeo = trackGeo(new THREE.BoxGeometry(districtWidth - 0.4, 2.8, districtDepth - 0.4));
  const plinthMesh = new THREE.Mesh(plinthGeo, earthMat);
  plinthMesh.position.set(0, groundY - 1.75, districtZCenter);
  group.add(plinthMesh);

  // Smooth sloped asphalt connector road from Main Ave (z=212, y=-0.71) through South Gate up to Field (z=120, y=0.04)
  const rampLen = PARK_HALF - FIELD_HALF; // 92
  const rampHeightDelta = 0 - roadY; // +0.71
  const rampSlopeAngle = Math.atan2(rampHeightDelta, rampLen);
  const rampHypLen = Math.hypot(rampLen, rampHeightDelta) + 0.6;
  const connectorRampGeo = trackGeo(new THREE.BoxGeometry(9.0, 0.16, rampHypLen));
  const connectorRamp = new THREE.Mesh(connectorRampGeo, asphaltMat);
  connectorRamp.position.set(0, (roadY + 0.03) * 0.5 - 0.05, (PARK_HALF + FIELD_HALF) * 0.5);
  connectorRamp.rotation.x = -rampSlopeAngle;
  connectorRamp.receiveShadow = true;
  group.add(connectorRamp);

  // Flanking raised stone sidewalks along the Stadium South Gate corridor
  const rampWalkGeo = trackGeo(new THREE.BoxGeometry(2.6, 0.24, rampHypLen));
  const rampWalkMat = getSolidMat(TOWN_PALETTE.plazaCream, 0.8, 0.02);
  for (const side of [-1, 1]) {
    const sw = new THREE.Mesh(rampWalkGeo, rampWalkMat);
    sw.position.set(side * 5.8, (roadY + 0.03) * 0.5 - 0.01, (PARK_HALF + FIELD_HALF) * 0.5);
    sw.rotation.x = -rampSlopeAngle;
    sw.receiveShadow = true;
    group.add(sw);
  }

  // Flat inner asphalt spur connecting field entry (z=120) to track south straight (z=99)
  const innerSpurGeo = trackGeo(new THREE.BoxGeometry(9.0, 0.08, 22));
  const innerSpur = new THREE.Mesh(innerSpurGeo, asphaltMat);
  innerSpur.position.set(0, 0.02, 109.5);
  innerSpur.receiveShadow = true;
  group.add(innerSpur);

  const dashGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.02, 2.8));
  for (let z = 104; z <= 210; z += 6) {
    const t = Math.max(0, Math.min(1, (z - FIELD_HALF) / rampLen));
    const dashY = z <= FIELD_HALF ? 0.07 : t * roadY + 0.04;
    const dash = new THREE.Mesh(dashGeo, paintYellowMat);
    dash.position.set(0, dashY, z);
    if (z > FIELD_HALF) dash.rotation.x = -rampSlopeAngle;
    group.add(dash);
  }

  // Town road surfaces + lane markings
  const stripeInstances: Array<{ x: number; y: number; z: number; sx: number; sz: number; yellow: boolean }> = [];
  const stepRange = (start: number, end: number, step: number): number[] => {
    const arr: number[] = [];
    for (let v = start; v <= end; v += step) arr.push(v);
    return arr;
  };

  for (const r of TOWN_ROADS) {
    if (r.id === 'main_avenue') {
      const w = r.xMax - r.xMin;
      const d = r.zMax - PARK_HALF;
      const cz = PARK_HALF + d * 0.5;
      const roadMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.14, d)), asphaltMat);
      roadMesh.position.set((r.xMin + r.xMax) * 0.5, roadY - 0.06, cz);
      roadMesh.receiveShadow = true;
      group.add(roadMesh);

      for (const z of stepRange(215, r.zMax - 2, 5.5)) {
        stripeInstances.push({ x: 0, y: roadY + 0.02, z, sx: 0.2, sz: 2.5, yellow: true });
      }
      for (const ex of [r.xMin + 0.32, r.xMax - 0.32]) {
        const edge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.16, 0.02, d)), paintWhiteMat);
        edge.position.set(ex, roadY + 0.02, cz);
        group.add(edge);
      }
      continue;
    }

    const w = r.xMax - r.xMin;
    const d = r.zMax - r.zMin;
    const cx = (r.xMin + r.xMax) * 0.5;
    const cz = (r.zMin + r.zMax) * 0.5;

    const roadMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.14, d)), asphaltMat);
    roadMesh.position.set(cx, roadY - 0.06, cz);
    roadMesh.receiveShadow = true;
    group.add(roadMesh);

    if (r.lanes === 2) {
      if (r.axis === 'ew') {
        for (const x of stepRange(r.xMin + 4, r.xMax - 4, 6)) {
          stripeInstances.push({ x, y: roadY + 0.02, z: cz, sx: 2.5, sz: 0.18, yellow: true });
        }
      } else {
        for (const z of stepRange(r.zMin + 4, r.zMax - 4, 6)) {
          stripeInstances.push({ x: cx, y: roadY + 0.02, z, sx: 0.18, sz: 2.5, yellow: true });
        }
      }
    }
  }

  // Zebra crosswalk stripes at main street intersections
  for (const cz of [217.0, 227.5, 264.5, 274.5, 357.0, 367.0]) {
    for (let sx = -3.2; sx <= 3.2; sx += 1.1) {
      stripeInstances.push({ x: sx, y: roadY + 0.025, z: cz, sx: 0.5, sz: 2.0, yellow: false });
    }
  }
  for (const cx of [-6.4, 6.4]) {
    for (const cz of [222.0, 269.5, 362.0]) {
      for (let dz = -2.6; dz <= 2.6; dz += 1.1) {
        stripeInstances.push({ x: cx, y: roadY + 0.025, z: cz + dz, sx: 1.8, sz: 0.48, yellow: false });
      }
    }
  }

  // =========================================================================
  // 2. ALL 24 UNIFORM (44 x 40) CITY BLOCK PADS WITH SCULPTED GRANITE CURBS
  // =========================================================================
  const blockPadParts: THREE.BufferGeometry[] = [];
  const pavingHexMap = {
    cream: TOWN_PALETTE.plazaCream,
    sand: TOWN_PALETTE.plazaSand,
    cobble: TOWN_PALETTE.plazaWarmStone,
    rose: TOWN_PALETTE.plazaRoseStone,
    lawn: TOWN_PALETTE.plazaSand,
  } as const;

  for (const blk of TOWN_BLOCKS) {
    const w = blk.xMax - blk.xMin; // always 44
    const d = blk.zMax - blk.zMin; // always 40
    const cx = (blk.xMin + blk.xMax) * 0.5;
    const cz = (blk.zMin + blk.zMax) * 0.5;

    if (blk.kind === 'parking') {
      // Parking blocks keep asphalt interior, framed by raised chamfered granite curbs along outer edges
      for (const sz of [blk.zMin + 0.65, blk.zMax - 0.65]) {
        blockPadParts.push(
          transformGeo(rbox(w, 0.24, 1.3, 0.08, TOWN_PALETTE.curbStone, 1, { bottomAO: 0.22 }), {
            pos: [cx, sidewalkY - 0.05, sz],
          }),
        );
      }
      continue;
    }

    // Chamfered block sidewalk island + raised stone curb border
    blockPadParts.push(
      transformGeo(rbox(w, 0.2, d, 0.12, pavingHexMap[blk.pavingStyle], 1, { bottomAO: 0.14 }), {
        pos: [cx, sidewalkY - 0.1, cz],
      }),
      transformGeo(rbox(w + 0.16, 0.24, 0.72, 0.07, TOWN_PALETTE.curbStone, 1, { bottomAO: 0.2 }), {
        pos: [cx, sidewalkY - 0.06, blk.zMin + 0.36],
      }),
      transformGeo(rbox(w + 0.16, 0.24, 0.72, 0.07, TOWN_PALETTE.curbStone, 1, { bottomAO: 0.2 }), {
        pos: [cx, sidewalkY - 0.06, blk.zMax - 0.36],
      }),
      transformGeo(rbox(0.72, 0.24, d - 1.2, 0.07, TOWN_PALETTE.curbStone, 1, { bottomAO: 0.2 }), {
        pos: [blk.xMin + 0.36, sidewalkY - 0.06, cz],
      }),
      transformGeo(rbox(0.72, 0.24, d - 1.2, 0.07, TOWN_PALETTE.curbStone, 1, { bottomAO: 0.2 }), {
        pos: [blk.xMax - 0.36, sidewalkY - 0.06, cz],
      }),
    );
  }

  const blockPadsMesh = new THREE.Mesh(trackGeo(mergeParts(blockPadParts)), sculptedMat);
  blockPadsMesh.receiveShadow = true;
  group.add(blockPadsMesh);

  // =========================================================================
  // 3. STADIUM ENTRANCE WELCOME ARCHWAY AT z = 212
  // =========================================================================
  const archSignTex = createSignCanvasTexture(
    'STADIUM ENTRANCE',
    'RACE GATE AHEAD',
    '#1e293b',
    '#ef4444',
    4,
  );
  extraTextures.push(archSignTex);
  const archSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: archSignTex,
      roughness: 0.38,
    }),
  );

  const archBaseY = roadY;
  const archGeo = trackGeo(
    mergeParts([
      transformGeo(rbox(1.9, 9.2, 1.9, 0.12, TOWN_PALETTE.wallCreamTrim, 1), { pos: [-6.5, 4.6, 0] }),
      transformGeo(rbox(1.9, 9.2, 1.9, 0.12, TOWN_PALETTE.wallCreamTrim, 1), { pos: [6.5, 4.6, 0] }),
      transformGeo(rbox(2.4, 0.9, 2.4, 0.1, TOWN_PALETTE.ironworkPlum, 1), { pos: [-6.5, 0.45, 0] }),
      transformGeo(rbox(2.4, 0.9, 2.4, 0.1, TOWN_PALETTE.ironworkPlum, 1), { pos: [6.5, 0.45, 0] }),
      transformGeo(rbox(15.2, 2.45, 1.55, 0.12, TOWN_PALETTE.ironworkPlum, 1), { pos: [0, 8.6, 0] }),
      transformGeo(rbox(15.6, 0.36, 1.85, 0.08, TOWN_PALETTE.brassWarm, 1), { pos: [0, 9.95, 0] }),
    ]),
  );
  const archMesh = new THREE.Mesh(archGeo, sculptedMat);
  archMesh.position.set(0, archBaseY, PARK_HALF);
  archMesh.castShadow = true;
  archMesh.receiveShadow = true;
  group.add(archMesh);

  const archSignGeo = trackGeo(new THREE.PlaneGeometry(13.6, 2.0));
  const archSignFront = new THREE.Mesh(archSignGeo, archSignMat);
  archSignFront.position.set(0, archBaseY + 8.6, PARK_HALF + 0.8);
  const archSignBack = new THREE.Mesh(archSignGeo, archSignMat);
  archSignBack.position.set(0, archBaseY + 8.6, PARK_HALF - 0.8);
  archSignBack.rotation.y = Math.PI;
  group.add(archSignFront, archSignBack);

  // =========================================================================
  // 4. PARKING LOTS, TICKET KIOSK & COMPOSITE PARKED CARS
  // =========================================================================
  for (const lot of TOWN_PARKING_LOTS) {
    const w = lot.xMax - lot.xMin;
    const d = lot.zMax - lot.zMin;
    const cx = (lot.xMin + lot.xMax) * 0.5;
    const cz = (lot.zMin + lot.zMax) * 0.5;
    const lotMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.14, d)), asphaltMat);
    lotMesh.position.set(cx, roadY - 0.06, cz);
    lotMesh.receiveShadow = true;
    group.add(lotMesh);

    const bayStep = 5.4;
    for (const rowZ of [lot.zMin + 6.5, lot.zMax - 6.5]) {
      for (let x = lot.xMin + 4; x <= lot.xMax - 4; x += bayStep) {
        stripeInstances.push({ x, y: roadY + 0.02, z: rowZ, sx: 0.18, sz: 5.8, yellow: false });
      }
    }
  }

  // Sculpted parking kiosk at Stadium Main Parking (x = -7.2, z = 246)
  const kioskMesh = new THREE.Mesh(
    trackGeo(
      mergeParts([
        transformGeo(rbox(2.5, 2.75, 2.9, 0.12, TOWN_PALETTE.wallCreamTrim, 1), { pos: [0, 1.38, 0] }),
        transformGeo(rbox(3.1, 0.36, 3.5, 0.1, TOWN_PALETTE.awningCobalt, 1), { pos: [0, 2.92, 0] }),
        transformGeo(rbox(2.6, 1.0, 2.1, 0.05, TOWN_PALETTE.windowSkyGlass, 1), { pos: [0, 1.85, 0] }),
        transformGeo(rbox(0.14, 3.0, 0.14, 0.04, TOWN_PALETTE.awningCoral, 1), { rot: [-0.35, 0, 0], pos: [0, 2.45, -1.9] }),
      ]),
    ),
    sculptedMat,
  );
  kioskMesh.position.set(-7.2, roadY, 246);
  kioskMesh.castShadow = true;
  group.add(kioskMesh);
  // Note: Parked vehicles in Row 0 lots and Main Ave are spawned as interactive drivable rigs in GoKartTrackCanvas.tsx.

  // Instanced road stripes
  const yellowStripes = stripeInstances.filter((s) => s.yellow);
  const whiteStripes = stripeInstances.filter((s) => !s.yellow);
  const unitBoxGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const dummy = new THREE.Object3D();

  const buildStripeInst = (items: typeof stripeInstances, mat: THREE.Material) => {
    if (items.length === 0) return;
    const inst = new THREE.InstancedMesh(unitBoxGeo, mat, items.length);
    for (let i = 0; i < items.length; i++) {
      const s = items[i];
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(s.sx, 0.025, s.sz);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  };
  buildStripeInst(yellowStripes, paintYellowMat);
  buildStripeInst(whiteStripes, paintWhiteMat);

  // =========================================================================
  // 5. HIGH-DETAIL SCULPTED EUROPEAN TOWNHOUSES & SHOPS (MERGED SINGLE MESH)
  // =========================================================================
  const yawMap = { s: 0, e: Math.PI * 0.5, n: Math.PI, w: -Math.PI * 0.5 } as const;
  const buildingParts: THREE.BufferGeometry[] = [];

  for (let bi = 0; bi < TOWN_BUILDINGS.length; bi++) {
    const b = TOWN_BUILDINGS[bi];
    const bGeo = buildSculptedTownhouseGeo({
      index: bi,
      w: b.w,
      d: b.d,
      h: b.h,
      wallColor: b.wallColor,
      accentColor: b.accentColor,
      windowPalette: b.windowPalette,
      facing: b.facing,
      hasShopFront: b.hasShopFront,
      awningColor: b.awningColor,
      roofStyle: b.roofStyle,
    });
    transformGeo(bGeo, { pos: [b.x, sidewalkY, b.z] });
    buildingParts.push(bGeo);

    if (b.hasShopFront && b.signText) {
      const sTex = createSignCanvasTexture(b.signText, '', '#243431', '#b8a47a', 8);
      extraTextures.push(sTex);
      const sMesh = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(6.8, 1.5)),
        trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, map: sTex, roughness: 0.35 })),
      );
      const frontDist = b.facing === 'n' || b.facing === 's' ? b.d * 0.5 : b.w * 0.5;
      const fYaw = yawMap[b.facing];
      sMesh.rotation.y = fYaw;
      sMesh.position.set(
        b.x + Math.sin(fYaw) * (frontDist + 0.24),
        sidewalkY + 4.95,
        b.z + Math.cos(fYaw) * (frontDist + 0.24),
      );
      group.add(sMesh);
    }
  }

  if (buildingParts.length > 0) {
    const mergedBuildingsMesh = new THREE.Mesh(trackGeo(mergeParts(buildingParts)), sculptedMat);
    mergedBuildingsMesh.castShadow = true;
    mergedBuildingsMesh.receiveShadow = true;
    group.add(mergedBuildingsMesh);
  }

  // =========================================================================
  // 6. HIGH-DETAIL MARKET STALLS, APPLE PYRAMIDS, BUNTING, CARTS & ATM
  // =========================================================================
  const stallParts: THREE.BufferGeometry[] = [];
  for (let si = 0; si < TOWN_MARKET_STALLS.length; si++) {
    const st = TOWN_MARKET_STALLS[si];
    const localParts: THREE.BufferGeometry[] = [
      // Heavy birch counter base & oak tabletop lip
      transformGeo(rbox(4.1, 1.05, 1.9, 0.08, TOWN_PALETTE.woodBirch, 1, { bottomAO: 0.2 }), { pos: [0, 0.52, 0] }),
      transformGeo(rbox(4.45, 0.22, 2.25, 0.06, TOWN_PALETTE.woodOak, 1), { pos: [0, 1.14, 0] }),
    ];
    // 4 turned oak support posts
    for (const px of [-2.0, 2.0]) {
      for (const pz of [-0.95, 0.95]) {
        localParts.push(transformGeo(rcyl(0.09, 0.11, 3.15, TOWN_PALETTE.woodOak, 8), { pos: [px, 1.62, pz] }));
      }
    }
    // 5-stripe scalloped market canopy
    for (let stripe = 0; stripe < 5; stripe++) {
      const sx = -1.96 + stripe * 0.98;
      const col = stripe % 2 === 0 ? st.canopyColorA : st.canopyColorB;
      localParts.push(
        transformGeo(rbox(0.98, 0.16, 3.25, 0.05, col, 1), { rot: [0.18, 0, 0], pos: [sx, 3.28, 0.14] }),
        transformGeo(rbox(0.98, 0.28, 0.12, 0.04, col, 1), { pos: [sx, 2.86, 1.72] }),
      );
    }
    // Stacked goods crates + pyramid fruit/flowers atop counter
    const goodsMap: Record<typeof st.goodsType, [number, number, number]> = {
      fruit: [TOWN_PALETTE.tulipCoral, TOWN_PALETTE.tulipYellow, TOWN_PALETTE.leafSage],
      flowers: [TOWN_PALETTE.sakuraPink, TOWN_PALETTE.lavenderSprig, TOWN_PALETTE.tulipYellow],
      bakery: [TOWN_PALETTE.wallOchre, TOWN_PALETTE.wallApricot, TOWN_PALETTE.woodOak],
      textile: [TOWN_PALETTE.shutterCobalt, TOWN_PALETTE.shutterRose, TOWN_PALETTE.shutterTeal],
      drinks: [TOWN_PALETTE.windowSkyGlass, TOWN_PALETTE.awningGold, TOWN_PALETTE.leafSage],
    };
    const pal = goodsMap[st.goodsType];
    for (let ci = 0; ci < 3; ci++) {
      const cx = -1.35 + ci * 1.35;
      localParts.push(
        transformGeo(rbox(1.05, 0.34, 0.88, 0.05, TOWN_PALETTE.woodBirch, 1), { pos: [cx, 1.4, 0] }),
      );
      // Mini stacked pyramid spheres (apples/bread/blossoms) inside each crate
      for (const ox of [-0.22, 0.22]) {
        localParts.push(transformGeo(smoothSphere(0.18, pal[ci], 8, 6), { pos: [cx + ox, 1.65, 0.14] }));
        localParts.push(transformGeo(smoothSphere(0.18, pal[(ci + 1) % 3], 8, 6), { pos: [cx + ox, 1.65, -0.14] }));
      }
      localParts.push(transformGeo(smoothSphere(0.19, pal[(ci + 2) % 3], 8, 6), { pos: [cx, 1.88, 0] }));
    }

    const mergedStall = mergeParts(localParts);
    transformGeo(mergedStall, { rot: [0, st.yaw, 0], pos: [st.x, sidewalkY, st.z] });
    stallParts.push(mergedStall);
  }

  // Festive bunting banners across Row 0 Col 3 Market Promenade (x = 26.5)
  for (const bz of [233.5, 242, 250.5, 259]) {
    stallParts.push(
      transformGeo(rbox(15.6, 0.08, 0.08, 0.02, TOWN_PALETTE.ironworkPlum, 1), { pos: [26.5, sidewalkY + 4.25, bz] }),
    );
    const buntCols = [
      TOWN_PALETTE.awningCoral,
      TOWN_PALETTE.tulipYellow,
      TOWN_PALETTE.awningMint,
      TOWN_PALETTE.awningCobalt,
      TOWN_PALETTE.sakuraPink,
    ];
    for (let fi = 0; fi < 7; fi++) {
      stallParts.push(
        transformGeo(rbox(0.56, 0.65, 0.08, 0.04, buntCols[fi % buntCols.length], 1), {
          rot: [0, 0, Math.PI * 0.25],
          pos: [19.8 + fi * 2.2, sidewalkY + 3.85, bz],
        }),
      );
    }
  }

  // Market Vendor Push-Carts & Oak Barrels
  for (const [cx, cz, cyaw, uCol] of [
    [26.5, 237.5, 0.25, TOWN_PALETTE.awningCoral],
    [26.5, 255.0, -0.35, TOWN_PALETTE.awningCobalt],
    [43.2, 246.0, -Math.PI * 0.5, TOWN_PALETTE.awningGold],
  ] as const) {
    const cartParts = mergeParts([
      transformGeo(rbox(1.9, 0.85, 1.25, 0.08, TOWN_PALETTE.woodOak, 1), { pos: [0, 0.72, 0] }),
      transformGeo(rcyl(0.36, 0.36, 0.14, TOWN_PALETTE.ironworkPlum, 10), { rot: [Math.PI / 2, 0, 0], pos: [-0.55, 0.36, 0.68] }),
      transformGeo(rcyl(0.36, 0.36, 0.14, TOWN_PALETTE.ironworkPlum, 10), { rot: [Math.PI / 2, 0, 0], pos: [-0.55, 0.36, -0.68] }),
      transformGeo(rcyl(0.07, 0.07, 2.4, TOWN_PALETTE.woodBirch, 6), { pos: [0, 1.8, 0] }),
      transformGeo(rcyl(0.15, 1.65, 0.65, uCol, 8), { pos: [0, 3.0, 0] }),
      transformGeo(rcyl(0.42, 0.46, 1.05, TOWN_PALETTE.woodBirch, 10), { pos: [1.5, 0.52, 0.35] }),
    ]);
    transformGeo(cartParts, { rot: [0, cyaw, 0], pos: [cx, sidewalkY, cz] });
    stallParts.push(cartParts);
  }

  const marketMesh = new THREE.Mesh(trackGeo(mergeParts(stallParts)), sculptedMat);
  marketMesh.castShadow = true;
  marketMesh.receiveShadow = true;
  group.add(marketMesh);

  // Illuminated ATM kiosks
  for (const [ax, az, ayaw] of [
    [7.2, 246.0, -Math.PI * 0.5],
    [-7.2, 276.5, Math.PI * 0.5],
  ] as const) {
    const atm = new THREE.Group();
    atm.position.set(ax, sidewalkY, az);
    atm.rotation.y = ayaw;
    const atmBody = new THREE.Mesh(
      trackGeo(rbox(1.45, 2.45, 1.15, 0.08, TOWN_PALETTE.shutterCobalt, 1)),
      sculptedMat,
    );
    atmBody.position.y = 1.22;
    atmBody.castShadow = true;
    const atmScreen = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.92, 0.68, 0.1)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.48 })),
    );
    atmScreen.position.set(0, 1.62, 0.58);
    atm.add(atmBody, atmScreen);
    group.add(atm);
  }

  // =========================================================================
  // 7. BOTANICAL PARKS: CARVED 3-TIER FOUNTAIN, TIMBER GAZEBO, CLOCK OBELISK & BENCHES
  // =========================================================================
  const parkParts: THREE.BufferGeometry[] = [];

  for (const pk of TOWN_PARKS) {
    const w = pk.xMax - pk.xMin;
    const d = pk.zMax - pk.zMin;
    const cx = (pk.xMin + pk.xMax) * 0.5;
    const cz = (pk.zMin + pk.zMax) * 0.5;

    // Lush elevated turf lawn + stone cross paths + ornamental corner limestone piers & iron fence
    parkParts.push(
      transformGeo(rbox(w, 0.18, d, 0.08, TOWN_PALETTE.grassMeadow, 1), { pos: [cx, sidewalkY + 0.05, cz] }),
      transformGeo(rbox(w + 0.4, 0.1, 3.8, 0.05, TOWN_PALETTE.plazaCream, 1), { pos: [cx, sidewalkY + 0.12, cz] }),
      transformGeo(rbox(3.8, 0.1, d + 0.4, 0.05, TOWN_PALETTE.plazaCream, 1), { pos: [cx, sidewalkY + 0.12, cz] }),
    );

    // Ornamental perimeter limestone border & wrought-iron rails with 4 centered path openings
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const px = cx + sx * (w * 0.5 - 0.5);
        const pz = cz + sz * (d * 0.5 - 0.5);
        parkParts.push(
          transformGeo(rbox(1.1, 1.9, 1.1, 0.1, TOWN_PALETTE.wallLimestone, 1), { pos: [px, sidewalkY + 0.95, pz] }),
          transformGeo(smoothSphere(0.38, TOWN_PALETTE.wallCreamTrim, 10, 8), { pos: [px, sidewalkY + 2.08, pz] }),
        );
      }
      // Corner fence stretches leaving 5.2-unit wide path entrances centered
      const segW = w * 0.34;
      const segD = d * 0.34;
      parkParts.push(
        transformGeo(rbox(segW, 0.55, 0.45, 0.06, TOWN_PALETTE.wallLimestone, 1), { pos: [cx + sx * w * 0.31, sidewalkY + 0.28, pk.zMin + 0.35] }),
        transformGeo(rbox(segW, 0.55, 0.45, 0.06, TOWN_PALETTE.wallLimestone, 1), { pos: [cx + sx * w * 0.31, sidewalkY + 0.28, pk.zMax - 0.35] }),
        transformGeo(rbox(0.45, 0.55, segD, 0.06, TOWN_PALETTE.wallLimestone, 1), { pos: [pk.xMin + 0.35, sidewalkY + 0.28, cz + sx * d * 0.31] }),
        transformGeo(rbox(0.45, 0.55, segD, 0.06, TOWN_PALETTE.wallLimestone, 1), { pos: [pk.xMax - 0.35, sidewalkY + 0.28, cz + sx * d * 0.31] }),
      );
    }
  }

  // Row 1 Col 3 Central Botanical Park: Carved 3-Tier Limestone Fountain (x = 26.5, z = 293)
  parkParts.push(
    transformGeo(rcyl(8.4, 8.6, 0.14, TOWN_PALETTE.plazaWarmStone, 24), { pos: [26.5, sidewalkY + 0.12, 293] }),
    transformGeo(buildThreeTierFountainStoneGeo(), { pos: [26.5, sidewalkY + 0.18, 293] }),
  );
  // Shimmering water disc & arched water plume (uses reflective waterMat)
  const fountainWater = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(3.85, 3.85, 0.1, 20)), waterMat);
  fountainWater.position.set(26.5, sidewalkY + 0.88, 293);
  const fountainSpout = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.32, 0.95, 10)), waterMat);
  fountainSpout.position.set(26.5, sidewalkY + 5.15, 293);
  group.add(fountainWater, fountainSpout);

  // Row 2 Col 3 South Park: Octagonal Timber Gazebo (x = 26.5, z = 338.5)
  parkParts.push(
    transformGeo(rcyl(6.8, 7.0, 0.14, TOWN_PALETTE.plazaWarmStone, 18), { pos: [26.5, sidewalkY + 0.12, 338.5] }),
    transformGeo(rcyl(4.1, 4.3, 0.32, TOWN_PALETTE.woodOak, 8), { pos: [26.5, sidewalkY + 0.32, 338.5] }),
    transformGeo(rcyl(0.25, 4.65, 2.2, TOWN_PALETTE.roofTerracotta, 8), { pos: [26.5, sidewalkY + 4.75, 338.5] }),
    transformGeo(smoothSphere(0.38, TOWN_PALETTE.roofCopperPatina, 10, 8), { pos: [26.5, sidewalkY + 5.95, 338.5] }),
  );
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parkParts.push(
      transformGeo(rcyl(0.14, 0.16, 3.3, TOWN_PALETTE.woodBirch, 8), {
        pos: [26.5 + Math.cos(a) * 3.35, sidewalkY + 2.0, 338.5 + Math.sin(a) * 3.35],
      }),
    );
  }

  // Row 2 Col 1 West Pocket Park: Clock Obelisk (x = -77, z = 338.5)
  parkParts.push(
    transformGeo(rcyl(5.4, 5.6, 0.14, TOWN_PALETTE.plazaWarmStone, 16), { pos: [-77, sidewalkY + 0.12, 338.5] }),
    transformGeo(rbox(2.8, 0.7, 2.8, 0.1, TOWN_PALETTE.wallLimestone, 1), { pos: [-77, sidewalkY + 0.5, 338.5] }),
    transformGeo(rcyl(0.45, 0.8, 4.8, TOWN_PALETTE.wallCreamTrim, 4), { rot: [0, Math.PI * 0.25, 0], pos: [-77, sidewalkY + 3.25, 338.5] }),
    transformGeo(smoothSphere(0.46, TOWN_PALETTE.brassWarm, 10, 8), { pos: [-77, sidewalkY + 5.85, 338.5] }),
  );

  // Curved-slat sculpted Paris-green & Oak Park Benches
  const benchBaseGeo = buildParkBenchGeo(TOWN_PALETTE.woodOak);
  const benchCoords: Array<[number, number, number]> = [
    [20.2, 286.8, Math.PI * 0.25],
    [32.8, 286.8, -Math.PI * 0.25],
    [20.2, 299.2, Math.PI * 0.75],
    [32.8, 299.2, -Math.PI * 0.75],
    [13.5, 290.0, 0],
    [39.5, 290.0, 0],
    [18.5, 333.0, Math.PI * 0.5],
    [34.5, 344.0, -Math.PI * 0.5],
    [-71.0, 334.0, Math.PI * 0.5],
    [-83.0, 343.0, -Math.PI * 0.5],
  ];
  for (const [bx, bz, byaw] of benchCoords) {
    const bClone = benchBaseGeo.clone();
    transformGeo(bClone, { rot: [0, byaw, 0], pos: [bx, sidewalkY + 0.16, bz] });
    parkParts.push(bClone);
  }
  benchBaseGeo.dispose();

  // Brick-bordered Botanical Flowerbeds with dense tulip/lavender blooms
  const bedCoords: Array<[number, number, number]> = [
    [14.5, 282.0, TOWN_PALETTE.tulipCoral],
    [38.5, 282.0, TOWN_PALETTE.tulipYellow],
    [14.5, 304.0, TOWN_PALETTE.lavenderSprig],
    [38.5, 304.0, TOWN_PALETTE.sakuraPink],
    [14.5, 327.0, TOWN_PALETTE.tulipYellow],
    [38.5, 349.5, TOWN_PALETTE.tulipCoral],
    [-65.0, 327.0, TOWN_PALETTE.sakuraPink],
    [-89.0, 349.5, TOWN_PALETTE.tulipYellow],
  ];
  for (const [fx, fz, fCol] of bedCoords) {
    parkParts.push(
      transformGeo(rbox(5.0, 0.34, 2.6, 0.08, TOWN_PALETTE.brickTerracotta, 1), { pos: [fx, sidewalkY + 0.28, fz] }),
      transformGeo(rbox(4.4, 0.36, 2.0, 0.04, TOWN_PALETTE.soilWarm, 1), { pos: [fx, sidewalkY + 0.32, fz] }),
    );
    for (let bi = -2; bi <= 2; bi++) {
      parkParts.push(
        transformGeo(smoothSphere(0.45, fCol, 8, 6, [1.1, 0.85, 1.0]), {
          pos: [fx + bi * 0.88, sidewalkY + 0.62, fz + (bi % 2) * 0.32],
        }),
      );
    }
  }

  const parkMesh = new THREE.Mesh(trackGeo(mergeParts(parkParts)), sculptedMat);
  parkMesh.castShadow = true;
  parkMesh.receiveShadow = true;
  group.add(parkMesh);

  // =========================================================================
  // 8. CAFÉ PATIO TABLES, BUS SHELTER, VICTORIAN STREETLAMPS & ORGANIC TREES
  // =========================================================================
  const streetFurnitureParts: THREE.BufferGeometry[] = [];

  // Café outdoor patio umbrellas & tables outside Row 1 Col 2 Main Ave Café (x = -7.2, z = 282..298)
  for (const pz of [282, 289, 296]) {
    const uCol = pz === 289 ? TOWN_PALETTE.awningCobalt : TOWN_PALETTE.awningCoral;
    streetFurnitureParts.push(
      transformGeo(rcyl(0.06, 0.08, 2.45, TOWN_PALETTE.ironworkPlum, 6), { pos: [-7.0, sidewalkY + 1.22, pz] }),
      transformGeo(rcyl(0.88, 0.88, 0.09, TOWN_PALETTE.wallCreamTrim, 12), { pos: [-7.0, sidewalkY + 0.82, pz] }),
      transformGeo(rcyl(0.12, 1.65, 0.68, uCol, 8), { pos: [-7.0, sidewalkY + 2.58, pz] }),
    );
  }

  // Sculpted Bus Stop Shelter on West Shop Street (Row 2 Col 2 edge, x = -47.2, z = 338.5)
  streetFurnitureParts.push(
    transformGeo(rbox(0.18, 2.75, 5.2, 0.05, TOWN_PALETTE.windowSkyGlass, 1), { pos: [-46.6, sidewalkY + 1.38, 338.5] }),
    transformGeo(rbox(2.1, 0.2, 5.6, 0.08, TOWN_PALETTE.awningCobalt, 1), { pos: [-47.2, sidewalkY + 2.82, 338.5] }),
    transformGeo(rbox(0.58, 0.14, 3.6, 0.04, TOWN_PALETTE.woodOak, 1), { pos: [-47.0, sidewalkY + 0.56, 338.5] }),
    transformGeo(rcyl(0.08, 0.08, 3.1, TOWN_PALETTE.ironworkPlum, 6), { pos: [-47.5, sidewalkY + 1.55, 341.8] }),
    transformGeo(rbox(0.14, 0.85, 0.85, 0.04, TOWN_PALETTE.awningGold, 1), { pos: [-47.5, sidewalkY + 2.85, 341.8] }),
  );

  // Planters along Main Avenue edges (z = 232..392)
  for (const pz of [232, 248, 260, 278, 306, 326, 348, 374, 396]) {
    for (const px of [-6.0, 6.0]) {
      if (px < 0 && pz >= 278 && pz <= 300) continue; // Keep clear for Café patio
      if (px < 0 && pz >= 230 && pz <= 262) continue; // Keep clear for Parking lot
      streetFurnitureParts.push(
        transformGeo(rbox(1.35, 0.58, 1.35, 0.08, TOWN_PALETTE.brickTerracotta, 1), { pos: [px, sidewalkY + 0.29, pz] }),
        transformGeo(smoothSphere(0.62, pz % 16 === 0 ? TOWN_PALETTE.leafSage : TOWN_PALETTE.grassSunlit, 8, 6), {
          pos: [px, sidewalkY + 0.84, pz],
        }),
      );
    }
  }

  const furnitureMesh = new THREE.Mesh(trackGeo(mergeParts(streetFurnitureParts)), sculptedMat);
  furnitureMesh.castShadow = true;
  furnitureMesh.receiveShadow = true;
  group.add(furnitureMesh);

  // Victorian Streetlamps (InstancedMesh)
  const streetLightCoords: Array<[number, number, number]> = [];
  for (const sz of [217, 238, 262, 284, 310, 338, 368, 396]) {
    streetLightCoords.push([-5.3, sz, Math.PI * 0.5]);
    streetLightCoords.push([5.3, sz, -Math.PI * 0.5]);
  }
  for (const sx of [-126, -77, -26.5, 26.5, 77, 126]) {
    streetLightCoords.push([sx, 265.2, 0]);
    streetLightCoords.push([sx, 357.8, 0]);
  }

  const lampPostGeo = trackGeo(buildVictorianLampPostGeo());
  const lampGlassGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.58, 0.42));
  const lampPostInst = new THREE.InstancedMesh(lampPostGeo, sculptedMat, streetLightCoords.length);
  const lampGlassInst = new THREE.InstancedMesh(lampGlassGeo, lampGlowMat, streetLightCoords.length);
  lampPostInst.castShadow = true;

  for (let i = 0; i < streetLightCoords.length; i++) {
    const [lx, lz, lyaw] = streetLightCoords[i];
    dummy.position.set(lx, sidewalkY, lz);
    dummy.rotation.set(0, lyaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lampPostInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(lx, sidewalkY + 6.32, lz);
    dummy.updateMatrix();
    lampGlassInst.setMatrixAt(i, dummy.matrix);
  }
  lampPostInst.instanceMatrix.needsUpdate = true;
  lampGlassInst.instanceMatrix.needsUpdate = true;
  group.add(lampPostInst, lampGlassInst);

  // Articulated Organic Trees (3 botanical species variants: Meadow Oak, Sakura Blossom, Ginkgo Gold)
  const oakTreeGeo = trackGeo(buildOrganicTreeGeo(8.2, TOWN_PALETTE.leafSage, 1.1));
  const sakuraTreeGeo = trackGeo(buildOrganicTreeGeo(7.6, TOWN_PALETTE.sakuraPink, 2.4));
  const ginkgoTreeGeo = trackGeo(buildOrganicTreeGeo(7.8, TOWN_PALETTE.ginkgoGold, 3.7));

  const treeSpots: Array<{ x: number; z: number; scale: number; yaw: number; kind: 'oak' | 'sakura' | 'ginkgo' }> = [
    // Botanical Fountain Park (Row 1 Col 3) corners
    { x: 11.5, z: 279.0, scale: 1.02, yaw: 0.4, kind: 'sakura' },
    { x: 41.5, z: 279.0, scale: 0.96, yaw: 1.5, kind: 'oak' },
    { x: 11.5, z: 307.0, scale: 1.0, yaw: 2.3, kind: 'ginkgo' },
    { x: 41.5, z: 307.0, scale: 1.05, yaw: 0.9, kind: 'sakura' },
    // South Gazebo Park (Row 2 Col 3)
    { x: 11.5, z: 324.5, scale: 0.98, yaw: 1.1, kind: 'oak' },
    { x: 41.5, z: 324.5, scale: 0.95, yaw: 2.7, kind: 'ginkgo' },
    { x: 11.5, z: 352.5, scale: 1.04, yaw: 0.2, kind: 'sakura' },
    { x: 41.5, z: 352.5, scale: 1.0, yaw: 1.9, kind: 'oak' },
    // West Pocket Park (Row 2 Col 1)
    { x: -91.5, z: 324.5, scale: 0.95, yaw: 0.8, kind: 'sakura' },
    { x: -62.5, z: 324.5, scale: 1.0, yaw: 2.1, kind: 'oak' },
    { x: -91.5, z: 352.5, scale: 0.96, yaw: 1.4, kind: 'ginkgo' },
    { x: -62.5, z: 352.5, scale: 1.02, yaw: 2.9, kind: 'oak' },
    // Courtyard & Avenue Street Trees
    { x: -126.5, z: 246.0, scale: 0.92, yaw: 0.6, kind: 'sakura' },
    { x: -77.0, z: 246.0, scale: 0.9, yaw: 1.7, kind: 'ginkgo' },
    { x: 126.5, z: 246.0, scale: 0.94, yaw: 2.4, kind: 'oak' },
    { x: 77.0, z: 293.0, scale: 0.92, yaw: 0.5, kind: 'sakura' },
    { x: 77.0, z: 338.5, scale: 0.95, yaw: 1.8, kind: 'oak' },
    { x: -126.5, z: 338.5, scale: 0.92, yaw: 2.2, kind: 'ginkgo' },
    { x: -126.5, z: 385.5, scale: 0.96, yaw: 0.9, kind: 'oak' },
    { x: 126.5, z: 385.5, scale: 0.98, yaw: 2.6, kind: 'sakura' },
  ];

  const buildTreeInst = (kind: 'oak' | 'sakura' | 'ginkgo', geo: THREE.BufferGeometry) => {
    const subset = treeSpots.filter((t) => t.kind === kind);
    if (subset.length === 0) return;
    const inst = new THREE.InstancedMesh(geo, sculptedMat, subset.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    for (let i = 0; i < subset.length; i++) {
      const t = subset[i];
      dummy.position.set(t.x, sidewalkY + 0.08, t.z);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  };
  buildTreeInst('oak', oakTreeGeo);
  buildTreeInst('sakura', sakuraTreeGeo);
  buildTreeInst('ginkgo', ginkgoTreeGeo);

  // World-projected road UVs prevent a 200 m avenue from stretching a single
  // 256 px tile into long, blurry streaks. Shared track textures remain unchanged.
  group.updateMatrixWorld(true);
  const uvPoint = new THREE.Vector3();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.material !== asphaltMat) return;
    const positions = object.geometry.getAttribute('position');
    const uv = object.geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      uvPoint.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      uv.setXY(i, uvPoint.x / 4, uvPoint.z / 4);
    }
    uv.needsUpdate = true;
  });

  return {
    group,
    update: (elapsedSeconds: number) => {
      const pulse = 1 + Math.sin(elapsedSeconds * 5.2) * 0.14;
      fountainSpout.scale.set(1 + Math.cos(elapsedSeconds * 4.4) * 0.08, pulse, 1 + Math.cos(elapsedSeconds * 4.4) * 0.08);
      fountainSpout.position.y = sidewalkY + 5.12 + (pulse - 1) * 0.22;
      fountainWater.rotation.y = elapsedSeconds * 0.28;
    },
    dispose: () => {
      streetDetails.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of extraTextures) t.dispose();
    },
  };
}
