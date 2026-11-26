import * as THREE from 'three';
import { FIELD_HALF, PARK_HALF } from '../track/trackLayout';
import { ProceduralTextureSet } from './textures';
import {
  TOWN_BOUNDS,
  TOWN_BUILDINGS,
  TOWN_MARKET_STALLS,
  TOWN_PARKING_LOTS,
  TOWN_PARKS,
  TOWN_ROADS,
} from './townLayout';

export interface MarketDistrictBuildResult {
  group: THREE.Group;
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
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 108, 512, 20);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 500, 116);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 34px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, subtitle ? 44 : 58);

  if (subtitle) {
    ctx.fillStyle = '#fde047';
    ctx.font = '800 20px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(subtitle, 256, 84);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Builds the connected Town & Market District south of the stadium:
 * - Small multi-lane streets, narrow neighborhood lanes & alleys ("small small roads")
 * - Full enterable asphalt connector road straight through the Stadium South Gate onto the track
 * - Marked parking lots with composite parked vehicles & ticket kiosk
 * - Multi-story residences & ground-floor shops with vivid colorful windows, shutters, flower boxes & balconies
 * - Colorful open-air Market Street with 12 detailed stalls, produce crates, bunting & ATM
 * - Central Town Park & West Pocket Park with stone paths, tiered fountain, gazebo, benches, flowerbeds & trees
 * - Rich street details: café patio umbrellas, bus shelter, streetlights, mailboxes, hydrants, bins & signs
 */
export function buildMarketDistrict(textures: ProceduralTextureSet): MarketDistrictBuildResult {
  const group = new THREE.Group();
  group.name = 'MARKET_AND_RESIDENTIAL_DISTRICT';

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

  const groundY = TOWN_BOUNDS.groundY; // -0.85
  const roadY = TOWN_BOUNDS.roadSurfaceY; // -0.71
  const sidewalkY = TOWN_BOUNDS.sidewalkSurfaceY; // -0.64

  // Shared materials
  const townLawnMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.parkLawnColor,
      roughness: 0.9,
    }),
  );
  const earthMat = getSolidMat(0x7b6043, 0.95, 0.0);
  const asphaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.asphaltColor,
      roughnessMap: textures.asphaltRoughness,
      roughness: 0.85,
      metalness: 0.02,
    }),
  );
  const sidewalkMat = getSolidMat(0xdce2ea, 0.84, 0.02);
  const marketCobbleMat = getSolidMat(0xcbd3dc, 0.82, 0.02);
  const parkPathMat = getSolidMat(0xe7dec8, 0.86, 0.0);
  const paintWhiteMat = getSolidMat(0xf4f7fa, 0.72, 0.0);
  const paintYellowMat = getSolidMat(0xf5c542, 0.68, 0.0);
  const darkMetalMat = getSolidMat(0x2b3440, 0.44, 0.6);
  const lightTrimMat = getSolidMat(0xf8fafc, 0.55, 0.05);
  const woodMat = getSolidMat(0x8c5630, 0.82, 0.04);
  const woodLightMat = getSolidMat(0xb67a48, 0.8, 0.04);
  const waterMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.14,
      metalness: 0.25,
      emissive: new THREE.Color(0x0284c7),
      emissiveIntensity: 0.18,
    }),
  );
  const glassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      roughness: 0.16,
      metalness: 0.45,
    }),
  );
  const lampGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff8dc,
      emissive: new THREE.Color(0xffe082),
      emissiveIntensity: 0.7,
      roughness: 0.2,
    }),
  );
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.36,
    }),
  );

  // =========================================================================
  // 1. TOWN BASE GROUND, CONNECTING RAMP ROAD INTO STADIUM & SMALL MULTI-LANE ROADS
  // =========================================================================
  const districtDepth = TOWN_BOUNDS.zMax - TOWN_BOUNDS.zMin + 14; // ~224
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

  // Smooth sloped asphalt connector road from Town Main Ave (z=212, y=-0.71) through South Gate up to Field (z=120, y=0.04)
  const rampLen = PARK_HALF - FIELD_HALF; // 92
  const rampHeightDelta = 0 - roadY; // +0.71
  const rampSlopeAngle = Math.atan2(rampHeightDelta, rampLen);
  const rampHypLen = Math.hypot(rampLen, rampHeightDelta) + 0.6;
  const connectorRampGeo = trackGeo(new THREE.BoxGeometry(9.6, 0.16, rampHypLen));
  const connectorRamp = new THREE.Mesh(connectorRampGeo, asphaltMat);
  connectorRamp.position.set(0, (roadY + 0.03) * 0.5 - 0.05, (PARK_HALF + FIELD_HALF) * 0.5);
  connectorRamp.rotation.x = -rampSlopeAngle;
  connectorRamp.receiveShadow = true;
  group.add(connectorRamp);

  // Flanking pedestrian sidewalks along the Stadium South Gate connector road
  const rampWalkGeo = trackGeo(new THREE.BoxGeometry(2.6, 0.22, rampHypLen));
  for (const side of [-1, 1]) {
    const sw = new THREE.Mesh(rampWalkGeo, sidewalkMat);
    sw.position.set(side * 6.1, (roadY + 0.03) * 0.5 - 0.01, (PARK_HALF + FIELD_HALF) * 0.5);
    sw.rotation.x = -rampSlopeAngle;
    sw.receiveShadow = true;
    group.add(sw);
  }

  // Flat inner asphalt spur connecting stadium field entry (z=120) cleanly to track south straight (z=99)
  const innerSpurGeo = trackGeo(new THREE.BoxGeometry(9.6, 0.08, 22));
  const innerSpur = new THREE.Mesh(innerSpurGeo, asphaltMat);
  innerSpur.position.set(0, 0.02, 109.5);
  innerSpur.receiveShadow = true;
  group.add(innerSpur);

  // Dashed lane lines along the Stadium Connector Ramp & Inner Spur
  const dashGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.02, 2.8));
  for (let z = 104; z <= 210; z += 6) {
    const t = Math.max(0, Math.min(1, (z - FIELD_HALF) / rampLen));
    const dashY = z <= FIELD_HALF ? 0.07 : t * roadY + 0.04;
    const dash = new THREE.Mesh(dashGeo, paintYellowMat);
    dash.position.set(0, dashY, z);
    if (z > FIELD_HALF) dash.rotation.x = -rampSlopeAngle;
    group.add(dash);
  }

  // Render all Town Roads from shared TOWN_ROADS layout
  const stripeInstances: Array<{ x: number; y: number; z: number; sx: number; sz: number; yellow: boolean }> = [];

  for (const r of TOWN_ROADS) {
    if (r.id === 'main_avenue') {
      // Main Avenue inside town starts at z = 212 (north of 212 is handled by the ramp/spur above)
      const w = r.xMax - r.xMin;
      const d = r.zMax - PARK_HALF;
      const cz = PARK_HALF + d * 0.5;
      const roadMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.14, d)), asphaltMat);
      roadMesh.position.set((r.xMin + r.xMax) * 0.5, roadY - 0.06, cz);
      roadMesh.receiveShadow = true;
      group.add(roadMesh);

      // Edge lines + dashed yellow center divider
      for (const z of rangeStep(215, r.zMax - 2, 5.5)) {
        stripeInstances.push({ x: 0, y: roadY + 0.02, z, sx: 0.22, sz: 2.6, yellow: true });
      }
      for (const ex of [r.xMin + 0.35, r.xMax - 0.35]) {
        const edge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.02, d)), paintWhiteMat);
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

    // Center dashed lane markings for 2-lane streets, subtle center line for narrow alleys
    if (r.lanes === 2) {
      if (r.axis === 'ew') {
        for (const x of rangeStep(r.xMin + 4, r.xMax - 4, 6)) {
          stripeInstances.push({ x, y: roadY + 0.02, z: cz, sx: 2.6, sz: 0.2, yellow: true });
        }
      } else {
        for (const z of rangeStep(r.zMin + 4, r.zMax - 4, 6)) {
          stripeInstances.push({ x: cx, y: roadY + 0.02, z, sx: 0.2, sz: 2.6, yellow: true });
        }
      }
    }
  }

  // Zebra crosswalk stripes at main intersections
  const crossZStops = [221, 234, 286, 299, 368, 381];
  for (const cz of crossZStops) {
    for (let sx = -3.6; sx <= 3.6; sx += 1.2) {
      stripeInstances.push({ x: sx, y: roadY + 0.025, z: cz, sx: 0.55, sz: 2.2, yellow: false });
    }
  }
  for (const cx of [-6.8, 6.8]) {
    for (const cz of [227.5, 292.5, 374.5]) {
      for (let dz = -3.0; dz <= 3.0; dz += 1.2) {
        stripeInstances.push({ x: cx, y: roadY + 0.025, z: cz + dz, sx: 2.0, sz: 0.52, yellow: false });
      }
    }
  }

  // Sidewalk / plaza pads for every town block
  const blockPads: Array<[number, number, number, number, THREE.Material]> = [
    // Mid-West residential/shop blocks
    [-72.5, -5.2, 297.5, 331.5, sidewalkMat],
    [-72.5, -5.2, 337.5, 369.5, sidewalkMat],
    // Market Plaza (NE block)
    [5.2, 36.2, 232.5, 287.5, marketCobbleMat],
    [41.8, 72.5, 232.5, 287.5, marketCobbleMat],
    // Outer West residential blocks
    [-110, -79.5, 232.5, 256.5, sidewalkMat],
    [-110, -79.5, 262.5, 287.5, sidewalkMat],
    [-146, -116, 232.5, 256.5, sidewalkMat],
    [-146, -116, 262.5, 287.5, sidewalkMat],
    [-110, -79.5, 297.5, 331.5, sidewalkMat],
    [-146, -116, 297.5, 331.5, sidewalkMat],
    [-146, -116, 337.5, 369.5, sidewalkMat],
    // Outer East residential blocks
    [116, 146, 232.5, 287.5, sidewalkMat],
    [79.5, 110, 297.5, 331.5, sidewalkMat],
    [116, 146, 297.5, 331.5, sidewalkMat],
    [79.5, 110, 337.5, 369.5, sidewalkMat],
    [116, 146, 337.5, 369.5, sidewalkMat],
    // South row sidewalks
    [-72.5, -5.2, 379.5, 405.5, sidewalkMat],
    [5.2, 72.5, 379.5, 405.5, sidewalkMat],
    [-146, -79.5, 379.5, 405.5, sidewalkMat],
    [79.5, 146, 379.5, 405.5, sidewalkMat],
  ];
  for (const [x1, x2, z1, z2, mat] of blockPads) {
    const pad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(x2 - x1, 0.2, z2 - z1)), mat);
    pad.position.set((x1 + x2) * 0.5, sidewalkY - 0.1, (z1 + z2) * 0.5);
    pad.receiveShadow = true;
    group.add(pad);
  }

  // =========================================================================
  // 2. STADIUM ENTRANCE WELCOME ARCHWAY AT z = 212
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
      roughness: 0.4,
    }),
  );

  const archBaseY = roadY;
  const archPillarGeo = trackGeo(new THREE.BoxGeometry(1.8, 9.2, 1.8));
  for (const sx of [-6.8, 6.8]) {
    const pillar = new THREE.Mesh(archPillarGeo, lightTrimMat);
    pillar.position.set(sx, archBaseY + 4.6, PARK_HALF);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    const baseCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.3, 0.8, 2.3)), darkMetalMat);
    baseCap.position.set(sx, archBaseY + 0.4, PARK_HALF);
    group.add(pillar, baseCap);
  }
  const archBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(15.6, 2.4, 1.5)), darkMetalMat);
  archBeam.position.set(0, archBaseY + 8.6, PARK_HALF);
  archBeam.castShadow = true;
  group.add(archBeam);

  const archSignGeo = trackGeo(new THREE.PlaneGeometry(13.8, 2.0));
  const archSignFront = new THREE.Mesh(archSignGeo, archSignMat);
  archSignFront.position.set(0, archBaseY + 8.6, PARK_HALF + 0.78);
  const archSignBack = new THREE.Mesh(archSignGeo, archSignMat);
  archSignBack.position.set(0, archBaseY + 8.6, PARK_HALF - 0.78);
  archSignBack.rotation.y = Math.PI;
  group.add(archSignFront, archSignBack);

  // =========================================================================
  // 3. PARKING LOTS WITH MARKED BAYS, TICKET KIOSK & COMPOSITE PARKED CARS
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

    // Parking stall divider lines
    const bayStep = 5.4;
    for (const rowZ of [lot.zMin + 6.5, lot.zMax - 6.5]) {
      for (let x = lot.xMin + 4; x <= lot.xMax - 4; x += bayStep) {
        stripeInstances.push({ x, y: roadY + 0.02, z: rowZ, sx: 0.18, sz: 6.2, yellow: false });
      }
    }
  }

  // Ticket booth kiosk at main parking lot entrance
  const boothGroup = new THREE.Group();
  boothGroup.position.set(-10.5, roadY, 260);
  const boothBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 2.8, 3.0)), lightTrimMat);
  boothBody.position.y = 1.4;
  boothBody.castShadow = true;
  const boothRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 0.35, 3.6)), getSolidMat(0x2563eb));
  boothRoof.position.y = 2.95;
  const boothWin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.7, 1.0, 2.2)), glassMat);
  boothWin.position.y = 1.9;
  const arm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 3.2, 0.14)), getSolidMat(0xef4444));
  arm.position.set(0, 2.6, -2.0);
  arm.rotation.x = -0.35; // Raised open!
  boothGroup.add(boothBody, boothRoof, boothWin, arm);
  group.add(boothGroup);

  // Composite multi-part parked vehicles (chassis + cabin + windows + 4 wheels + lights)
  const carBodyGeo = trackGeo(new THREE.BoxGeometry(2.1, 0.68, 4.3));
  const carCabinGeo = trackGeo(new THREE.BoxGeometry(1.85, 0.58, 2.2));
  const carGlassGeo = trackGeo(new THREE.BoxGeometry(1.9, 0.42, 1.9));
  const carWheelGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.24, 10));
  carWheelGeo.rotateZ(Math.PI / 2);
  const carShadowGeo = trackGeo(new THREE.PlaneGeometry(2.6, 4.8));
  carShadowGeo.rotateX(-Math.PI / 2);

  const parkedCars: Array<{ x: number; z: number; yaw: number; color: number }> = [
    // Main Stadium Parking Lot
    { x: -61.3, z: 243, yaw: 0, color: 0x2563eb },
    { x: -50.5, z: 243, yaw: 0, color: 0xe11d48 },
    { x: -34.3, z: 243, yaw: 0, color: 0xf59e0b },
    { x: -23.5, z: 243, yaw: 0, color: 0x0d9488 },
    { x: -55.9, z: 277, yaw: Math.PI, color: 0x64748b },
    { x: -39.7, z: 277, yaw: Math.PI, color: 0x16a34a },
    { x: -18.1, z: 277, yaw: Math.PI, color: 0xdc2626 },
    // East Market Parking Lot
    { x: 87.5, z: 243, yaw: 0, color: 0x0284c7 },
    { x: 98.5, z: 243, yaw: 0, color: 0xfbbf24 },
    { x: 92.5, z: 277, yaw: Math.PI, color: 0x7c3aed },
    { x: 103.5, z: 277, yaw: Math.PI, color: 0xe2e8f0 },
  ];

  for (const car of parkedCars) {
    const cg = new THREE.Group();
    cg.position.set(car.x, roadY, car.z);
    cg.rotation.y = car.yaw;

    const cShadow = new THREE.Mesh(carShadowGeo, shadowMat);
    cShadow.position.y = 0.02;
    const body = new THREE.Mesh(carBodyGeo, getSolidMat(car.color, 0.28, 0.45));
    body.position.y = 0.56;
    body.castShadow = true;
    const cabin = new THREE.Mesh(carCabinGeo, getSolidMat(car.color, 0.28, 0.45));
    cabin.position.set(0, 1.15, -0.15);
    cabin.castShadow = true;
    const win = new THREE.Mesh(carGlassGeo, glassMat);
    win.position.set(0, 1.15, -0.15);

    cg.add(cShadow, body, cabin, win);
    for (const wx of [-0.98, 0.98]) {
      for (const wz of [-1.35, 1.35]) {
        const wMesh = new THREE.Mesh(carWheelGeo, darkMetalMat);
        wMesh.position.set(wx, 0.32, wz);
        cg.add(wMesh);
      }
    }
    group.add(cg);
  }

  // Render all road markings & parking stripes in 2 fast InstancedMeshes
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
  // 4. COLORFUL RESIDENTIAL APARTMENTS & SHOPS (WITH COLORFUL WINDOWS, BALCONIES, FLOWER BOXES)
  // =========================================================================
  const shutterPalette = [0xef4444, 0x0284c7, 0x16a34a, 0xf59e0b, 0x7c3aed, 0x0d9488];
  const flowerColors = [0xf43f5e, 0xfacc15, 0xa855f7, 0xf97316];

  for (let bi = 0; bi < TOWN_BUILDINGS.length; bi++) {
    const b = TOWN_BUILDINGS[bi];
    const bGroup = new THREE.Group();
    bGroup.position.set(b.x, sidewalkY, b.z);

    // Main building body
    const wallMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(b.w, b.h, b.d)),
      getSolidMat(b.wallColor, 0.74, 0.03),
    );
    wallMesh.position.y = b.h * 0.5;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    bGroup.add(wallMesh);

    // Ground plinth / trim & roof parapet
    const baseBand = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(b.w + 0.4, 0.7, b.d + 0.4)),
      getSolidMat(b.accentColor, 0.65, 0.08),
    );
    baseBand.position.y = 0.35;
    const roofParapet = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(b.w + 0.6, 0.85, b.d + 0.6)),
      getSolidMat(b.accentColor, 0.6, 0.1),
    );
    roofParapet.position.y = b.h + 0.3;
    bGroup.add(baseBand, roofParapet);

    // Rooftop details (HVAC, skylight, or water tank)
    const hvac = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(3.2, 1.4, 2.6)),
      getSolidMat(0x94a3b8, 0.5, 0.4),
    );
    hvac.position.set(-b.w * 0.22, b.h + 0.7, -b.d * 0.18);
    hvac.castShadow = true;
    bGroup.add(hvac);

    if (bi % 2 === 0) {
      const tankStand = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 8)), darkMetalMat);
      tankStand.position.set(b.w * 0.24, b.h + 0.9, b.d * 0.2);
      const tank = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 10)), woodLightMat);
      tank.position.set(b.w * 0.24, b.h + 2.5, b.d * 0.2);
      tank.castShadow = true;
      bGroup.add(tankStand, tank);
    }

    // Ground-floor shopfront or residential lobby entrance
    const yawMap = { s: 0, e: Math.PI * 0.5, n: Math.PI, w: -Math.PI * 0.5 };
    const frontGroup = new THREE.Group();
    frontGroup.rotation.y = yawMap[b.facing];
    const frontFaceZ = b.facing === 'n' || b.facing === 's' ? b.d * 0.5 : b.w * 0.5;
    const frontWidth = b.facing === 'n' || b.facing === 's' ? b.w : b.d;

    if (b.hasShopFront) {
      const shopBay = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(frontWidth - 2.4, 3.6, 0.5)),
        getSolidMat(0x1e293b, 0.5, 0.2),
      );
      shopBay.position.set(0, 2.1, frontFaceZ + 0.12);
      const shopGlass = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(frontWidth - 3.6, 2.7, 0.6)),
        glassMat,
      );
      shopGlass.position.set(0, 1.9, frontFaceZ + 0.14);

      const awningColor = b.awningColor ?? 0xef4444;
      const awning = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(frontWidth - 1.6, 0.32, 2.6)),
        getSolidMat(awningColor, 0.55, 0.05),
      );
      awning.position.set(0, 3.85, frontFaceZ + 1.25);
      awning.rotation.x = 0.28;
      awning.castShadow = true;

      const awningStripe = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(frontWidth - 1.6, 0.34, 0.6)),
        lightTrimMat,
      );
      awningStripe.position.set(0, 3.55, frontFaceZ + 2.25);
      awningStripe.rotation.x = 0.28;
      frontGroup.add(shopBay, shopGlass, awning, awningStripe);

      if (b.signText) {
        const sTex = createSignCanvasTexture(b.signText, '', '#0f172a', '#38bdf8', 2);
        extraTextures.push(sTex);
        const sMesh = new THREE.Mesh(
          trackGeo(new THREE.PlaneGeometry(7.2, 1.6)),
          trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, map: sTex, roughness: 0.35 })),
        );
        sMesh.position.set(0, 4.9, frontFaceZ + 0.18);
        frontGroup.add(sMesh);
      }
    } else {
      // Residential front entrance door + canopy
      const doorFrame = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(3.2, 3.4, 0.45)),
        getSolidMat(b.accentColor, 0.6, 0.1),
      );
      doorFrame.position.set(0, 1.85, frontFaceZ + 0.12);
      const doorLeaf = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(2.2, 2.9, 0.52)),
        woodMat,
      );
      doorLeaf.position.set(0, 1.65, frontFaceZ + 0.14);
      const canopy = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(4.4, 0.25, 1.8)),
        darkMetalMat,
      );
      canopy.position.set(0, 3.65, frontFaceZ + 0.9);
      frontGroup.add(doorFrame, doorLeaf, canopy);
    }
    bGroup.add(frontGroup);

    // Colorful Residential Windows on ALL 4 facades & upper floors
    const floorH = 3.8;
    const floors = Math.floor((b.h - 2.0) / floorH);
    const frameGeo = trackGeo(new THREE.BoxGeometry(2.3, 2.35, 0.28));
    const paneGeo = trackGeo(new THREE.BoxGeometry(1.75, 1.85, 0.34));
    const shutterGeo = trackGeo(new THREE.BoxGeometry(0.45, 2.1, 0.26));
    const flowerBoxGeo = trackGeo(new THREE.BoxGeometry(2.0, 0.38, 0.55));
    const flowerBloomGeo = trackGeo(new THREE.BoxGeometry(1.7, 0.28, 0.4));

    const addWindowsOnFace = (faceYaw: number, halfSpan: number, faceDist: number, addBalconies: boolean) => {
      const fWrap = new THREE.Group();
      fWrap.rotation.y = faceYaw;
      const cols = Math.max(2, Math.floor((halfSpan * 2 - 4) / 4.8));
      const colStep = cols > 1 ? (halfSpan * 2 - 6) / (cols - 1) : 0;

      for (let fl = 1; fl <= floors; fl++) {
        const wy = 2.6 + fl * floorH;
        if (wy + 1.5 > b.h) continue;

        for (let ci = 0; ci < cols; ci++) {
          const wx = cols === 1 ? 0 : -(halfSpan - 3) + ci * colStep;
          const colorIdx = (bi + fl * 3 + ci * 5) % b.windowPalette.length;
          const winColor = b.windowPalette[colorIdx];
          const shutterColor = shutterPalette[(bi + fl + ci) % shutterPalette.length];
          const isWarmGlow = colorIdx === 0;

          const frame = new THREE.Mesh(frameGeo, lightTrimMat);
          frame.position.set(wx, wy, faceDist + 0.06);

          const paneMat = trackMat(
            new THREE.MeshStandardMaterial({
              color: winColor,
              roughness: 0.2,
              metalness: 0.25,
              emissive: new THREE.Color(winColor),
              emissiveIntensity: isWarmGlow ? 0.34 : 0.14,
            }),
          );
          const pane = new THREE.Mesh(paneGeo, paneMat);
          pane.position.set(wx, wy, faceDist + 0.08);

          // Colored side shutters
          const sMat = getSolidMat(shutterColor, 0.65, 0.05);
          const shL = new THREE.Mesh(shutterGeo, sMat);
          shL.position.set(wx - 1.32, wy, faceDist + 0.07);
          const shR = new THREE.Mesh(shutterGeo, sMat);
          shR.position.set(wx + 1.32, wy, faceDist + 0.07);
          fWrap.add(frame, pane, shL, shR);

          // Flower boxes under select colorful windows
          if ((fl + ci + bi) % 2 === 0) {
            const fBox = new THREE.Mesh(flowerBoxGeo, woodMat);
            fBox.position.set(wx, wy - 1.25, faceDist + 0.28);
            const fBloom = new THREE.Mesh(
              flowerBloomGeo,
              getSolidMat(flowerColors[(fl + ci) % flowerColors.length], 0.75, 0.0),
            );
            fBloom.position.set(wx, wy - 1.0, faceDist + 0.28);
            fWrap.add(fBox, fBloom);
          }
        }

        // Protruding balconies on upper floors
        if (addBalconies && fl >= 1) {
          const balcWidth = Math.min(halfSpan * 1.4, 8.5);
          const slab = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(balcWidth, 0.24, 1.5)),
            getSolidMat(b.accentColor, 0.65, 0.1),
          );
          slab.position.set(0, wy - 1.35, faceDist + 0.75);
          slab.castShadow = true;
          const rail = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(balcWidth, 0.72, 0.12)),
            darkMetalMat,
          );
          rail.position.set(0, wy - 0.9, faceDist + 1.45);
          fWrap.add(slab, rail);
        }
      }
      bGroup.add(fWrap);
    };

    addWindowsOnFace(0, b.w * 0.5, b.d * 0.5, b.facing === 's');
    addWindowsOnFace(Math.PI, b.w * 0.5, b.d * 0.5, b.facing === 'n');
    addWindowsOnFace(Math.PI * 0.5, b.d * 0.5, b.w * 0.5, b.facing === 'e');
    addWindowsOnFace(-Math.PI * 0.5, b.d * 0.5, b.w * 0.5, b.facing === 'w');

    group.add(bGroup);
  }

  // =========================================================================
  // 5. OPEN-AIR MARKET STALLS, BUNTING BANNERS, VENDOR CARTS & ATM
  // =========================================================================
  const stallTableGeo = trackGeo(new THREE.BoxGeometry(4.4, 1.25, 2.2));
  const stallPostGeo = trackGeo(new THREE.CylinderGeometry(0.09, 0.09, 3.2, 6));
  const stallCanopyGeo = trackGeo(new THREE.BoxGeometry(2.5, 0.18, 3.4));
  const crateGeo = trackGeo(new THREE.BoxGeometry(0.95, 0.52, 0.85));

  for (const st of TOWN_MARKET_STALLS) {
    const sg = new THREE.Group();
    sg.position.set(st.x, sidewalkY, st.z);
    sg.rotation.y = st.yaw;

    const table = new THREE.Mesh(stallTableGeo, woodMat);
    table.position.y = 0.625;
    table.castShadow = true;
    table.receiveShadow = true;
    sg.add(table);

    for (const px of [-2.0, 2.0]) {
      for (const pz of [-0.95, 0.95]) {
        const post = new THREE.Mesh(stallPostGeo, woodLightMat);
        post.position.set(px, 1.6, pz);
        post.castShadow = true;
        sg.add(post);
      }
    }

    // Two-tone striped canopy
    const canopyL = new THREE.Mesh(stallCanopyGeo, getSolidMat(st.canopyColorA, 0.6, 0.02));
    canopyL.position.set(-1.22, 3.25, 0.15);
    canopyL.rotation.x = 0.18;
    canopyL.castShadow = true;

    const canopyR = new THREE.Mesh(stallCanopyGeo, getSolidMat(st.canopyColorB, 0.6, 0.02));
    canopyR.position.set(1.22, 3.25, 0.15);
    canopyR.rotation.x = 0.18;
    canopyR.castShadow = true;
    sg.add(canopyL, canopyR);

    // Goods crates atop counter
    const goodsColors: Record<typeof st.goodsType, [number, number, number]> = {
      fruit: [0xdc2626, 0xfacc15, 0x16a34a],
      flowers: [0xec4899, 0xa855f7, 0xfde047],
      bakery: [0xd97706, 0xfbbf24, 0x92400e],
      textile: [0x2563eb, 0xe11d48, 0x14b8a6],
      drinks: [0x06b6d4, 0xf97316, 0x84cc16],
    };
    const palette = goodsColors[st.goodsType];
    for (let ci = 0; ci < 3; ci++) {
      const crate = new THREE.Mesh(crateGeo, getSolidMat(palette[ci], 0.5, 0.04));
      crate.position.set(-1.3 + ci * 1.3, 1.48, 0);
      crate.castShadow = true;
      sg.add(crate);
    }

    group.add(sg);
  }

  // Overhead festive bunting banner strips across the Market Bazaar Alley (x = 39)
  const buntingColors = [0xef4444, 0xfacc15, 0x22c55e, 0x3b82f6, 0xec4899];
  const flagGeo = trackGeo(new THREE.ConeGeometry(0.42, 0.85, 3));
  for (const bz of [240, 254, 268, 282]) {
    const cable = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18, 0.08, 0.08)), darkMetalMat);
    cable.position.set(39, sidewalkY + 4.4, bz);
    group.add(cable);
    for (let fi = 0; fi < 7; fi++) {
      const flag = new THREE.Mesh(flagGeo, getSolidMat(buntingColors[fi % buntingColors.length]));
      flag.position.set(32 + fi * 2.3, sidewalkY + 4.0, bz);
      flag.rotation.z = Math.PI;
      group.add(flag);
    }
  }

  // Visible ATM Kiosks (one by Market Square, one by Mid-West Mart)
  for (const [ax, az, ayaw] of [
    [10, 260, -Math.PI * 0.5],
    [-10, 304, Math.PI * 0.5],
  ] as const) {
    const atm = new THREE.Group();
    atm.position.set(ax, sidewalkY, az);
    atm.rotation.y = ayaw;
    const atmBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 2.5, 1.2)), getSolidMat(0x1e3a8a, 0.4, 0.3));
    atmBody.position.y = 1.25;
    atmBody.castShadow = true;
    const atmScreen = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.95, 0.72, 0.1)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.45 })),
    );
    atmScreen.position.set(0, 1.65, 0.62);
    atm.add(atmBody, atmScreen);
    group.add(atm);
  }

  // Market Square vendor push-carts, barrels, potted shrubs & market patio umbrellas
  const cartBodyGeo = trackGeo(new THREE.BoxGeometry(2.0, 0.9, 1.3));
  const cartWheelGeo = trackGeo(new THREE.CylinderGeometry(0.38, 0.38, 0.14, 10));
  cartWheelGeo.rotateX(Math.PI / 2);
  const barrelGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.5, 1.1, 8));
  for (const [cx, cz, cyaw, uCol] of [
    [18, 258, 0.3, 0xf59e0b],
    [61, 248, -0.4, 0xef4444],
    [61, 272, 0.2, 0x0ea5e9],
  ] as const) {
    const cart = new THREE.Group();
    cart.position.set(cx, sidewalkY, cz);
    cart.rotation.y = cyaw;
    const box = new THREE.Mesh(cartBodyGeo, woodMat);
    box.position.y = 0.75;
    box.castShadow = true;
    const wL = new THREE.Mesh(cartWheelGeo, darkMetalMat);
    wL.position.set(-0.6, 0.38, 0.72);
    const wR = new THREE.Mesh(cartWheelGeo, darkMetalMat);
    wR.position.set(-0.6, 0.38, -0.72);
    const pole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6)), woodLightMat);
    pole.position.set(0, 1.8, 0);
    const umb = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.7, 0.75, 8)), getSolidMat(uCol, 0.55));
    umb.position.set(0, 3.05, 0);
    umb.castShadow = true;
    const barrel = new THREE.Mesh(barrelGeo, woodLightMat);
    barrel.position.set(1.6, 0.55, 0.4);
    cart.add(box, wL, wR, pole, umb, barrel);
    group.add(cart);
  }

  // Market Square colorful planters along main road edge (x = 7.5)
  for (const pz of [238, 252, 268, 282]) {
    const planter = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.6, 0.65, 1.6)), getSolidMat(0xb45309));
    planter.position.set(7.2, sidewalkY + 0.32, pz);
    const shrub = new THREE.Mesh(
      trackGeo(new THREE.DodecahedronGeometry(0.7, 0)),
      getSolidMat(pz % 28 === 0 ? 0x22c55e : 0x16a34a),
    );
    shrub.position.set(7.2, sidewalkY + 0.9, pz);
    group.add(planter, shrub);
  }

  // =========================================================================
  // 6. CENTRAL TOWN PARK & WEST POCKET PARK (LAWN, PATHS, FOUNTAIN, GAZEBO, BENCHES, TREES)
  // =========================================================================
  for (const pk of TOWN_PARKS) {
    const w = pk.xMax - pk.xMin;
    const d = pk.zMax - pk.zMin;
    const cx = (pk.xMin + pk.xMax) * 0.5;
    const cz = (pk.zMin + pk.zMax) * 0.5;

    // Lush elevated turf lawn pad
    const lawn = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.24, d)), townLawnMat);
    lawn.position.set(cx, sidewalkY - 0.08, cz);
    lawn.receiveShadow = true;
    group.add(lawn);

    // Low decorative stone perimeter border with open path entrances
    const curbH = 0.32;
    const curbMat = getSolidMat(0xcbd5e1, 0.78, 0.02);
    const barSideNS = trackGeo(new THREE.BoxGeometry(w * 0.35, curbH, 0.6));
    const barSideEW = trackGeo(new THREE.BoxGeometry(0.6, curbH, d * 0.35));
    for (const sx of [-1, 1]) {
      const bN = new THREE.Mesh(barSideNS, curbMat);
      bN.position.set(cx + sx * w * 0.31, sidewalkY + 0.16, pk.zMin + 0.4);
      const bS = new THREE.Mesh(barSideNS, curbMat);
      bS.position.set(cx + sx * w * 0.31, sidewalkY + 0.16, pk.zMax - 0.4);
      const bW = new THREE.Mesh(barSideEW, curbMat);
      bW.position.set(pk.xMin + 0.4, sidewalkY + 0.16, cz + sx * d * 0.31);
      const bE = new THREE.Mesh(barSideEW, curbMat);
      bE.position.set(pk.xMax - 0.4, sidewalkY + 0.16, cz + sx * d * 0.31);
      group.add(bN, bS, bW, bE);
    }

    // Cross paved paths through park
    const pathEW = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.08, 4.4)), parkPathMat);
    pathEW.position.set(cx, sidewalkY + 0.05, cz);
    pathEW.receiveShadow = true;
    const pathNS = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 0.08, d)), parkPathMat);
    pathNS.position.set(cx, sidewalkY + 0.05, cz);
    pathNS.receiveShadow = true;
    group.add(pathEW, pathNS);
  }

  // Central Town Park centerpiece: Circular Plaza + Tiered Water Fountain (x=39, z=333.5)
  const fountainPlaza = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(10.5, 10.5, 0.1, 24)), parkPathMat);
  fountainPlaza.position.set(39, sidewalkY + 0.06, 333.5);
  fountainPlaza.receiveShadow = true;
  group.add(fountainPlaza);

  const fountainGroup = new THREE.Group();
  fountainGroup.position.set(39, sidewalkY + 0.08, 333.5);
  const basinWall = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(4.4, 4.7, 0.9, 12)), getSolidMat(0xe2e8f0));
  basinWall.position.y = 0.45;
  basinWall.castShadow = true;
  const waterDisc = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(3.9, 3.9, 0.12, 16)), waterMat);
  waterDisc.position.y = 0.72;
  const fPillar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.55, 0.8, 2.4, 10)), getSolidMat(0xcbd5e1));
  fPillar.position.y = 1.4;
  fPillar.castShadow = true;
  const topBowl = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.8, 0.9, 0.55, 12)), getSolidMat(0xe2e8f0));
  topBowl.position.y = 2.6;
  const spout = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.35, 1.1, 8)), waterMat);
  spout.position.y = 3.25;
  fountainGroup.add(basinWall, waterDisc, fPillar, topBowl, spout);
  group.add(fountainGroup);

  // Wooden Park Gazebo in NE corner of Central Town Park (x=60.5, z=310.5)
  const gazebo = new THREE.Group();
  gazebo.position.set(60.5, sidewalkY + 0.04, 310.5);
  const gazFloor = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(4.2, 4.4, 0.3, 8)), woodMat);
  gazFloor.position.y = 0.15;
  gazebo.add(gazFloor);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 3.4, 6)), woodLightMat);
    post.position.set(Math.cos(a) * 3.4, 1.85, Math.sin(a) * 3.4);
    post.castShadow = true;
    gazebo.add(post);
  }
  const gazRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(4.8, 2.2, 6)), getSolidMat(0xb91c1c, 0.65));
  gazRoof.position.y = 4.6;
  gazRoof.castShadow = true;
  gazebo.add(gazRoof);
  group.add(gazebo);

  // West Pocket Park clock obelisk (x=-95, z=353.5)
  const obelisk = new THREE.Group();
  obelisk.position.set(-95, sidewalkY + 0.04, 353.5);
  const obBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4, 0.8, 3.4)), getSolidMat(0xcbd5e1));
  obBase.position.y = 0.4;
  const obShaft = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.55, 0.85, 5.2, 4)), getSolidMat(0xf8fafc));
  obShaft.position.y = 3.4;
  obShaft.rotation.y = Math.PI * 0.25;
  obShaft.castShadow = true;
  const obCap = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.55, 8, 8)), paintYellowMat);
  obCap.position.y = 6.2;
  obelisk.add(obBase, obShaft, obCap);
  group.add(obelisk);

  // Park Benches & Flowerbeds
  const benchSeatGeo = trackGeo(new THREE.BoxGeometry(2.4, 0.16, 0.8));
  const benchBackGeo = trackGeo(new THREE.BoxGeometry(2.4, 0.6, 0.14));
  const benchLegGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.55, 0.75));
  const benchCoords: Array<[number, number, number]> = [
    [30, 326, Math.PI * 0.25],
    [48, 326, -Math.PI * 0.25],
    [30, 341, Math.PI * 0.75],
    [48, 341, -Math.PI * 0.75],
    [22, 330, 0],
    [56, 330, 0],
    [34, 313, Math.PI * 0.5],
    [34, 354, Math.PI * 0.5],
    [-90, 348, Math.PI * 0.5],
    [-100, 359, -Math.PI * 0.5],
  ];
  for (const [bx, bz, byaw] of benchCoords) {
    const bg = new THREE.Group();
    bg.position.set(bx, sidewalkY + 0.06, bz);
    bg.rotation.y = byaw;
    const seat = new THREE.Mesh(benchSeatGeo, woodLightMat);
    seat.position.y = 0.52;
    const back = new THREE.Mesh(benchBackGeo, woodLightMat);
    back.position.set(0, 0.85, -0.34);
    back.rotation.x = -0.15;
    const legL = new THREE.Mesh(benchLegGeo, darkMetalMat);
    legL.position.set(-0.95, 0.27, 0);
    const legR = new THREE.Mesh(benchLegGeo, darkMetalMat);
    legR.position.set(0.95, 0.27, 0);
    bg.add(seat, back, legL, legR);
    group.add(bg);
  }

  // Colorful Flowerbeds in Central Town Park & West Pocket Park
  const bedFrameGeo = trackGeo(new THREE.BoxGeometry(5.6, 0.36, 3.0));
  const bedSoilGeo = trackGeo(new THREE.BoxGeometry(5.1, 0.4, 2.5));
  const bedSpots: Array<[number, number, number]> = [
    [19, 314, 0xf43f5e],
    [19, 352, 0xfacc15],
    [58, 352, 0xa855f7],
    [24, 306, 0xf97316],
    [54, 360, 0xec4899],
    [-95, 344, 0xf43f5e],
    [-95, 363, 0xfacc15],
  ];
  for (const [fx, fz, fColor] of bedSpots) {
    const fg = new THREE.Group();
    fg.position.set(fx, sidewalkY + 0.04, fz);
    const frame = new THREE.Mesh(bedFrameGeo, getSolidMat(0xb45309));
    frame.position.y = 0.18;
    const soil = new THREE.Mesh(bedSoilGeo, earthMat);
    soil.position.y = 0.2;
    fg.add(frame, soil);
    for (let bi = -2; bi <= 2; bi++) {
      const bush = new THREE.Mesh(
        trackGeo(new THREE.DodecahedronGeometry(0.55, 0)),
        getSolidMat(fColor, 0.78, 0.0),
      );
      bush.position.set(bi * 1.0, 0.55, (bi % 2) * 0.4);
      fg.add(bush);
    }
    group.add(fg);
  }

  // =========================================================================
  // 7. STREET LIFE ("MANY THINGS"): CAFÉ PATIO TABLES, BUS SHELTER, LIGHTS, TREES, SIGNS
  // =========================================================================
  // Café outdoor patio umbrellas & tables outside Mid-West Café (x=-7.8, z=308..320)
  for (const pz of [308, 315, 322]) {
    const patio = new THREE.Group();
    patio.position.set(-7.6, sidewalkY, pz);
    const tPost = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.1, 2.5, 6)), darkMetalMat);
    tPost.position.y = 1.25;
    const tTop = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 10)), lightTrimMat);
    tTop.position.y = 0.82;
    const umbrella = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(1.75, 0.75, 8)),
      getSolidMat(pz === 315 ? 0x0284c7 : 0xe11d48, 0.55),
    );
    umbrella.position.y = 2.65;
    umbrella.castShadow = true;
    patio.add(tPost, tTop, umbrella);
    group.add(patio);
  }

  // Bus Stop Shelter along West Shop Street (x=-71.2, z=346)
  const busStop = new THREE.Group();
  busStop.position.set(-71.2, sidewalkY, 346);
  const bsBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 2.8, 5.4)), glassMat);
  bsBack.position.set(0.6, 1.4, 0);
  const bsRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.2, 0.2, 5.8)), getSolidMat(0x0284c7));
  bsRoof.position.set(-0.2, 2.85, 0);
  bsRoof.castShadow = true;
  const bsBench = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.6, 0.14, 3.8)), woodLightMat);
  bsBench.position.set(0.1, 0.55, 0);
  const bsPost = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6)), darkMetalMat);
  bsPost.position.set(-0.6, 1.6, 3.4);
  const bsSign = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.9, 0.9)), getSolidMat(0xfacc15));
  bsSign.position.set(-0.6, 2.9, 3.4);
  busStop.add(bsBack, bsRoof, bsBench, bsPost, bsSign);
  group.add(busStop);

  // Streetlights along Main Avenue, Midtown Blvd & side streets (InstancedMesh!)
  const streetLightCoords: Array<[number, number, number]> = [];
  for (const sz of [219, 248, 276, 312, 348, 388]) {
    streetLightCoords.push([-5.8, sz, Math.PI * 0.5]);
    streetLightCoords.push([5.8, sz, -Math.PI * 0.5]);
  }
  for (const sx of [-130, -95, -55, -26, 26, 55, 95, 130]) {
    streetLightCoords.push([sx, 287.2, 0]);
    streetLightCoords.push([sx, 369.2, 0]);
  }

  const poleGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.2, 6.8, 7));
  const armGeo = trackGeo(new THREE.BoxGeometry(1.6, 0.14, 0.14));
  const lampHeadGeo = trackGeo(new THREE.BoxGeometry(0.75, 0.2, 0.45));

  const poleInst = new THREE.InstancedMesh(poleGeo, darkMetalMat, streetLightCoords.length);
  const armInst = new THREE.InstancedMesh(armGeo, darkMetalMat, streetLightCoords.length);
  const lampInst = new THREE.InstancedMesh(lampHeadGeo, lampGlowMat, streetLightCoords.length);
  poleInst.castShadow = true;

  for (let i = 0; i < streetLightCoords.length; i++) {
    const [lx, lz, lyaw] = streetLightCoords[i];
    dummy.position.set(lx, sidewalkY + 3.4, lz);
    dummy.rotation.set(0, lyaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);

    const dx = Math.sin(lyaw) * 0.7;
    const dz = Math.cos(lyaw) * 0.7;
    dummy.position.set(lx + dx, sidewalkY + 6.75, lz + dz);
    dummy.updateMatrix();
    armInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(lx + dx * 1.9, sidewalkY + 6.62, lz + dz * 1.9);
    dummy.updateMatrix();
    lampInst.setMatrixAt(i, dummy.matrix);
  }
  poleInst.instanceMatrix.needsUpdate = true;
  armInst.instanceMatrix.needsUpdate = true;
  lampInst.instanceMatrix.needsUpdate = true;
  group.add(poleInst, armInst, lampInst);

  // Small street props: Fire hydrants & Mailboxes & Bins
  const hydrantGeo = trackGeo(new THREE.CylinderGeometry(0.2, 0.24, 0.9, 8));
  const hydrantMat = getSolidMat(0xdc2626, 0.4, 0.2);
  const mailboxMat = getSolidMat(0x2563eb, 0.45, 0.2);
  for (const [hx, hz] of [
    [-6.2, 240],
    [6.2, 302],
    [-72, 302],
    [72, 344],
  ] as const) {
    const hyd = new THREE.Mesh(hydrantGeo, hydrantMat);
    hyd.position.set(hx, sidewalkY + 0.45, hz);
    group.add(hyd);
  }
  for (const [mx, mz] of [
    [-6.5, 344],
    [80.5, 304],
  ] as const) {
    const mb = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.7, 1.3, 0.7)), mailboxMat);
    mb.position.set(mx, sidewalkY + 0.65, mz);
    group.add(mb);
  }

  // Lush Trees across Town Parks, Boulevards & Outer Neighborhood Perimeter (InstancedMesh)
  const treeCoords: Array<{ x: number; z: number; scale: number; tint: number }> = [
    // Central Town Park trees
    { x: 15, z: 306, scale: 1.05, tint: 0x22c55e },
    { x: 26, z: 319, scale: 0.92, tint: 0x16a34a },
    { x: 49, z: 307, scale: 1.0, tint: 0x4ade80 },
    { x: 64, z: 323, scale: 0.95, tint: 0x22c55e },
    { x: 15, z: 342, scale: 1.08, tint: 0x16a34a },
    { x: 16, z: 360, scale: 0.96, tint: 0x22c55e },
    { x: 30, z: 358, scale: 0.88, tint: 0x4ade80 },
    { x: 52, z: 346, scale: 1.04, tint: 0x15803d },
    { x: 63, z: 358, scale: 0.98, tint: 0x22c55e },
    // West Pocket Park trees
    { x: -103, z: 345, scale: 0.92, tint: 0x22c55e },
    { x: -87, z: 345, scale: 0.98, tint: 0x16a34a },
    { x: -103, z: 361, scale: 0.95, tint: 0x4ade80 },
    { x: -87, z: 361, scale: 0.9, tint: 0x22c55e },
    // Outer town perimeter tree line framing the whole district
    ...[-165, -135, -105, -75, -45, -18, 18, 45, 75, 105, 135, 165].map((x, idx) => ({
      x,
      z: 418,
      scale: 0.95 + (idx % 3) * 0.14,
      tint: idx % 2 === 0 ? 0x2c8a36 : 0x3da140,
    })),
    ...[236, 268, 304, 340, 376, 404].flatMap((z, idx) => [
      { x: -165, z, scale: 0.95 + (idx % 2) * 0.15, tint: 0x2c8a36 },
      { x: 165, z, scale: 0.95 + ((idx + 1) % 2) * 0.15, tint: 0x3da140 },
    ]),
  ];

  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.48, 3.6, 7));
  const crownLowGeo = trackGeo(new THREE.IcosahedronGeometry(2.4, 1));
  const crownTopGeo = trackGeo(new THREE.IcosahedronGeometry(1.75, 1));
  const treeFoliageMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
  const treeTrunkInst = new THREE.InstancedMesh(trunkGeo, woodMat, treeCoords.length);
  const treeCrownLowInst = new THREE.InstancedMesh(crownLowGeo, treeFoliageMat, treeCoords.length);
  const treeCrownTopInst = new THREE.InstancedMesh(crownTopGeo, treeFoliageMat, treeCoords.length);
  treeTrunkInst.castShadow = true;
  treeCrownLowInst.castShadow = true;
  treeCrownTopInst.castShadow = true;

  const tmpColor = new THREE.Color();
  for (let i = 0; i < treeCoords.length; i++) {
    const t = treeCoords[i];
    const s = t.scale;
    const baseY = Math.abs(t.x) < 155 && t.z < 408 ? sidewalkY : groundY;

    dummy.position.set(t.x, baseY + 1.8 * s, t.z);
    dummy.rotation.set(0, i * 0.7, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    treeTrunkInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(t.x, baseY + 4.4 * s, t.z);
    dummy.updateMatrix();
    treeCrownLowInst.setMatrixAt(i, dummy.matrix);
    tmpColor.setHex(t.tint);
    treeCrownLowInst.setColorAt(i, tmpColor);

    dummy.position.set(t.x, baseY + 6.3 * s, t.z);
    dummy.updateMatrix();
    treeCrownTopInst.setMatrixAt(i, dummy.matrix);
    tmpColor.setHex(t.tint).offsetHSL(0, 0, 0.06);
    treeCrownTopInst.setColorAt(i, tmpColor);
  }
  treeTrunkInst.instanceMatrix.needsUpdate = true;
  treeCrownLowInst.instanceMatrix.needsUpdate = true;
  treeCrownTopInst.instanceMatrix.needsUpdate = true;
  if (treeCrownLowInst.instanceColor) treeCrownLowInst.instanceColor.needsUpdate = true;
  if (treeCrownTopInst.instanceColor) treeCrownTopInst.instanceColor.needsUpdate = true;
  group.add(treeTrunkInst, treeCrownLowInst, treeCrownTopInst);

  return {
    group,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      extraTextures.forEach((t) => t.dispose());
    },
  };
}

function rangeStep(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let v = start; v <= end; v += step) {
    out.push(v);
  }
  return out;
}
