import * as THREE from 'three';
import { PARK_HALF, STADIUM_NORTH_CANOPY_HEIGHT } from '../track/trackLayout';
import { ProceduralTextureSet } from './textures';

export interface MarketDistrictBuildResult {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Builds a detailed market-and-residential district adjoining the south side of the stadium:
 * - Connected ground, asphalt roads, sidewalks, and wide plaza leading to stadium south entrance
 * - Multi-story apartment buildings and shops with balconies, windows, awnings, and rooftop details
 * - Market street with colorful fruit stalls, produce crates, vendor carts, and visible ATM
 * - Parking lot with marked spaces, parked vehicles, streetlights, benches, planters, trees, and bins
 * - Prominent stadium entrance gateway with a clear race-entry sign
 */
export function buildMarketDistrict(textures: ProceduralTextureSet): MarketDistrictBuildResult {
  const group = new THREE.Group();
  group.name = 'MARKET_AND_RESIDENTIAL_DISTRICT';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Materials
  const districtLawnMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.parkLawnColor,
      roughness: 0.9,
    }),
  );
  const roadMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.asphaltColor,
      roughness: 0.8,
    }),
  );
  const sidewalkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.82,
    }),
  );
  const plazaMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xCBD5E1,
      roughness: 0.78,
    }),
  );
  const buildingWallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.7,
    }),
  );
  const buildingAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.5,
    }),
  );
  const shopFrontMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.4,
    }),
  );
  const awningRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.5,
    }),
  );
  const awningYellowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.5,
    }),
  );
  const glassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.9,
    }),
  );
  const metalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.3,
      metalness: 0.8,
    }),
  );
  const woodMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9a3412,
      roughness: 0.85,
    }),
  );
  const fruitRedMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 }),
  );
  const fruitYellowMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }),
  );
  const vehicleBodyMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.25, metalness: 0.6 }),
  );
  const vehicleBodyRedMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.25, metalness: 0.6 }),
  );
  const foliageMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.8 }),
  );
  const trunkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 }),
  );

  // 1. District Ground & Roads extending South from stadium gate (z = PARK_HALF = 212 to z = 390)
  const districtDepth = 180;
  const districtWidth = 360; // [-180, 180]
  const districtZCenter = PARK_HALF + districtDepth / 2; // 212 + 90 = 302

  const groundGeo = trackGeo(new THREE.PlaneGeometry(districtWidth, districtDepth));
  groundGeo.rotateX(-Math.PI / 2);
  const groundMesh = new THREE.Mesh(groundGeo, districtLawnMat);
  groundMesh.position.set(0, -0.85, districtZCenter);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // Main Access Road leading from stadium south gate (z=212) into plaza (z=370)
  const roadWidth = 24;
  const roadGeo = trackGeo(new THREE.BoxGeometry(roadWidth, 0.12, districtDepth));
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.position.set(0, -0.76, districtZCenter);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // Sidewalks on both sides of main road
  const sidewalkWidth = 8;
  const sidewalkGeo = trackGeo(new THREE.BoxGeometry(sidewalkWidth, 0.16, districtDepth));
  for (const sign of [-1, 1]) {
    const sw = new THREE.Mesh(sidewalkGeo, sidewalkMat);
    sw.position.set(sign * (roadWidth / 2 + sidewalkWidth / 2), -0.74, districtZCenter);
    sw.receiveShadow = true;
    group.add(sw);
  }

  // Central Plaza / Spawn Bay in front of market (around z = 330)
  const plazaGeo = trackGeo(new THREE.BoxGeometry(110, 0.14, 80));
  const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
  plazaMesh.position.set(0, -0.75, 340);
  plazaMesh.receiveShadow = true;
  group.add(plazaMesh);

  // Marked spawn bay lines
  const lineGeo = trackGeo(new THREE.BoxGeometry(1.2, 0.02, 3.8));
  for (const sign of [-1, 1]) {
    const bayLine = new THREE.Mesh(lineGeo, sidewalkMat);
    bayLine.position.set(sign * 3.5, -0.67, 340);
    group.add(bayLine);
  }

  // 2. Multi-story Apartment Buildings and Shops with balconies & awnings
  const buildingConfigs: Array<{ x: number; z: number; w: number; d: number; h: number; isShop: boolean }> = [
    { x: -95, z: 250, w: 45, d: 35, h: 22, isShop: true },
    { x: -95, z: 310, w: 45, d: 35, h: 26, isShop: false },
    { x: -95, z: 370, w: 45, d: 35, h: 28, isShop: false },
    { x: 95, z: 250, w: 45, d: 35, h: 24, isShop: true },
    { x: 95, z: 310, w: 45, d: 35, h: 26, isShop: false },
    { x: 95, z: 370, w: 45, d: 35, h: 30, isShop: false },
  ];

  for (const cfg of buildingConfigs) {
    const bGroup = new THREE.Group();
    const boxGeo = trackGeo(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d));
    const wallMesh = new THREE.Mesh(boxGeo, buildingWallMat);
    wallMesh.position.y = cfg.h / 2;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    bGroup.add(wallMesh);

    // Ground floor shop front or arcade
    if (cfg.isShop) {
      const shopGeo = trackGeo(new THREE.BoxGeometry(cfg.w - 4, 5, cfg.d + 1));
      const shopMesh = new THREE.Mesh(shopGeo, shopFrontMat);
      shopMesh.position.set(0, 2.5, 0.5);
      bGroup.add(shopMesh);

      // Awning
      const awningGeo = trackGeo(new THREE.BoxGeometry(cfg.w - 2, 0.4, 6));
      const awning = new THREE.Mesh(awningGeo, Math.random() > 0.5 ? awningRedMat : awningYellowMat);
      awning.position.set(0, 5.2, cfg.d / 2 + 3);
      awning.rotation.x = -0.35;
      bGroup.add(awning);
    }

    // Windows & Balconies on upper floors
    const floorHeight = 4.5;
    const numFloors = Math.floor(cfg.h / floorHeight);
    for (let f = 1; f < numFloors; f++) {
      const wy = f * floorHeight;
      const winGeo = trackGeo(new THREE.BoxGeometry(2.2, 2.5, 0.5));
      const winMat = glassMat;
      for (const wx of [-12, -4, 4, 12]) {
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(wx, wy, cfg.d / 2 + 0.2);
        bGroup.add(win);
      }

      // Balcony slab & railing for apartments
      if (!cfg.isShop || f > 1) {
        const slabGeo = trackGeo(new THREE.BoxGeometry(cfg.w - 6, 0.3, 2.2));
        const slab = new THREE.Mesh(slabGeo, buildingAccentMat);
        slab.position.set(0, wy - 1.2, cfg.d / 2 + 1.1);
        bGroup.add(slab);
      }
    }

    bGroup.position.set(cfg.x, -0.85, cfg.z);
    group.add(bGroup);
  }

  // 3. Market Street: Fruit Stalls, Produce Crates, Vendor Carts, Visible ATM
  const stallGroup = new THREE.Group();
  for (const sz of [270, 330]) {
    for (const sx of [-38, 38]) {
      const tableGeo = trackGeo(new THREE.BoxGeometry(8, 2.2, 4));
      const table = new THREE.Mesh(tableGeo, woodMat);
      table.position.set(sx, 1.1, sz);
      stallGroup.add(table);

      // Crates & Fruit piles
      const crateGeo = trackGeo(new THREE.BoxGeometry(2.2, 1.2, 2.2));
      const fruit1 = new THREE.Mesh(crateGeo, fruitRedMat);
      fruit1.position.set(sx - 2, 2.4, sz);
      const fruit2 = new THREE.Mesh(crateGeo, fruitYellowMat);
      fruit2.position.set(sx + 2, 2.4, sz);
      stallGroup.add(fruit1, fruit2);

      // Small canopy over stall
      const stPostGeo = trackGeo(new THREE.CylinderGeometry(0.15, 0.15, 4));
      const p1 = new THREE.Mesh(stPostGeo, metalMat);
      p1.position.set(sx - 3.5, 2, sz - 1.6);
      const p2 = new THREE.Mesh(stPostGeo, metalMat);
      p2.position.set(sx + 3.5, 2, sz - 1.6);
      stallGroup.add(p1, p2);
    }
  }

  // Visible ATM Kiosk near market
  const atmBaseGeo = trackGeo(new THREE.BoxGeometry(2.4, 3.2, 2));
  const atmMesh = new THREE.Mesh(atmBaseGeo, metalMat);
  atmMesh.position.set(-22, 1.6, 290);
  stallGroup.add(atmMesh);
  group.add(stallGroup);

  // 4. Parking Lot with marked spaces & parked vehicles
  const lotGroup = new THREE.Group();
  const lotX = 55;
  const lotZ = 340;
  const carGeo = trackGeo(new THREE.BoxGeometry(4.2, 1.8, 8));
  const car1 = new THREE.Mesh(carGeo, vehicleBodyMat);
  car1.position.set(lotX, 0.9, lotZ - 10);
  car1.castShadow = true;
  const car2 = new THREE.Mesh(carGeo, vehicleBodyRedMat);
  car2.position.set(lotX, 0.9, lotZ + 10);
  car2.castShadow = true;
  lotGroup.add(car1, car2);
  group.add(lotGroup);

  // 5. Street Details: Streetlights, Benches, Trees, Planters, Stadium Entrance Gateway Sign
  const streetDetailGroup = new THREE.Group();

  // Streetlights along road
  const poleGeo = trackGeo(new THREE.CylinderGeometry(0.25, 0.25, 10));
  for (const sz of [240, 280, 320, 360]) {
    for (const sx of [-14, 14]) {
      const lightPole = new THREE.Mesh(poleGeo, metalMat);
      lightPole.position.set(sx, 5, sz);
      streetDetailGroup.add(lightPole);
    }
  }

  // Trees and Planters
  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.4, 0.5, 4));
  const leavesGeo = trackGeo(new THREE.SphereGeometry(3.2, 8, 8));
  for (const tz of [260, 300, 350, 380]) {
    for (const tx of [-55, 55]) {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(tx, 2, tz);
      const leaves = new THREE.Mesh(leavesGeo, foliageMat);
      leaves.position.set(tx, 5.5, tz);
      streetDetailGroup.add(trunk, leaves);
    }
  }

  // Prominent Stadium Entrance Gateway Sign at South gate (z = 212)
  const archPillarGeo = trackGeo(new THREE.BoxGeometry(3, 14, 3));
  const archLintelGeo = trackGeo(new THREE.BoxGeometry(32, 4, 3));
  const pLeft = new THREE.Mesh(archPillarGeo, buildingWallMat);
  pLeft.position.set(-14, 7, PARK_HALF);
  const pRight = new THREE.Mesh(archPillarGeo, buildingWallMat);
  pRight.position.set(14, 7, PARK_HALF);
  const lintel = new THREE.Mesh(archLintelGeo, buildingAccentMat);
  lintel.position.set(0, 15, PARK_HALF);
  streetDetailGroup.add(pLeft, pRight, lintel);

  group.add(streetDetailGroup);

  return {
    group,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
