import * as THREE from 'three';
import {
  FIELD_HALF,
  PARK_HALF,
  PARK_SIZE,
  STADIUM_NORTH_CANOPY_HEIGHT,
  STADIUM_TOWER_HEIGHT,
  STADIUM_TOWER_OFFSET,
} from '../track/trackLayout';
import { ProceduralTextureSet } from './textures';

export interface StadiumBuildResult {
  group: THREE.Group;
  dispose: () => void;
}

interface SeatInstanceSpec {
  x: number;
  y: number;
  z: number;
  yaw: number;
  color: THREE.Color;
}

/**
 * Builds a single merged low-poly stadium bucket seat (seat pan + backrest = 24 triangles)
 * facing local +Z with bottom pivot at y = 0.
 */
function createMergedSeatGeometry(): THREE.BufferGeometry {
  const panW = 1.15;
  const panH = 0.18;
  const panD = 0.85;
  const backH = 0.72;
  const backD = 0.16;

  // Combine two BoxGeometries manually into one BufferGeometry for single-draw-call instancing
  const boxPan = new THREE.BoxGeometry(panW, panH, panD);
  boxPan.translate(0, panH * 0.5, 0.06);

  const boxBack = new THREE.BoxGeometry(panW, backH, backD);
  boxBack.rotateX(-0.12);
  boxBack.translate(0, panH + backH * 0.45, -panD * 0.42);

  const posA = boxPan.attributes.position.array as Float32Array;
  const normA = boxPan.attributes.normal.array as Float32Array;
  const idxA = boxPan.index!.array;

  const posB = boxBack.attributes.position.array as Float32Array;
  const normB = boxBack.attributes.normal.array as Float32Array;
  const idxB = boxBack.index!.array;

  const positions = new Float32Array(posA.length + posB.length);
  positions.set(posA, 0);
  positions.set(posB, posA.length);

  const normals = new Float32Array(normA.length + normB.length);
  normals.set(normA, 0);
  normals.set(normB, normA.length);

  const vertOffset = posA.length / 3;
  const indices = new Uint16Array(idxA.length + idxB.length);
  indices.set(idxA, 0);
  for (let i = 0; i < idxB.length; i++) {
    indices[idxA.length + i] = idxB[i] + vertOffset;
  }

  boxPan.dispose();
  boxBack.dispose();

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Helper to transform local stand point (lx, ly, lz) to world XZ around (cx, cz) rotated by yaw.
 */
function toWorldXZ(
  cx: number,
  cz: number,
  yaw: number,
  lx: number,
  lz: number,
): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x: cx + lx * c + lz * s,
    z: cz - lx * s + lz * c,
  };
}

/**
 * Builds the complete stadium + landscaped outer perimeter outside the 240x240 grass field:
 * - Large multi-tier North Main Grandstand with colored seating sections, stair aisles,
 *   concourse levels, vomitory entrances, structural columns, and cantilevered roof canopy
 * - Smaller tiered stands on West and South sides with aisles, entrances, and columns
 * - Distinct East Pavilion with covered viewing deck, louvered/glazed facade, and wing canopy
 * - Scoreboard, timing display pylon, entrance gates, stadium banners, and 4 corner floodlight towers
 * - Outer landscaped green park lawn, walkways, curbed planted beds, shrubs, and perimeter trees
 */
export function buildStadiumArchitecture(textures: ProceduralTextureSet): StadiumBuildResult {
  const group = new THREE.Group();
  group.name = 'COMPLETE_STADIUM';

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

  // Shared materials
  const parkLawnMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.parkLawnColor,
      roughness: 0.92,
      metalness: 0.0,
    }),
  );
  const parkEarthMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7b6043,
      roughness: 0.95,
      metalness: 0.0,
    }),
  );
  const concourseMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.concourseColor,
      roughness: 0.86,
      metalness: 0.02,
    }),
  );
  const pathStoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd0d6de,
      roughness: 0.84,
      metalness: 0.04,
    }),
  );
  const concreteLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd9e0e8,
      roughness: 0.68,
      metalness: 0.06,
    }),
  );
  const concreteMidMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9aa5b4,
      roughness: 0.74,
      metalness: 0.08,
    }),
  );
  const facadeWhiteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf0f4f8,
      roughness: 0.45,
      metalness: 0.08,
    }),
  );
  const darkSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2d3745,
      roughness: 0.46,
      metalness: 0.56,
    }),
  );
  const canopyRoofMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fbff,
      roughness: 0.42,
      metalness: 0.06,
    }),
  );
  const canopySoffitMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc2cbd6,
      roughness: 0.58,
      metalness: 0.14,
    }),
  );
  const accentRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdc4234,
      roughness: 0.44,
      metalness: 0.1,
    }),
  );
  const woodBronzeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9c6c44,
      roughness: 0.58,
      metalness: 0.18,
    }),
  );
  const pavilionGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x6ea8cc,
      roughness: 0.18,
      metalness: 0.45,
      transparent: true,
      opacity: 0.76,
    }),
  );
  const stairAisleMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xeff3f7,
      roughness: 0.78,
      metalness: 0.02,
    }),
  );
  const darkPortalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1b222c,
      roughness: 0.9,
      metalness: 0.05,
    }),
  );
  const mulchBedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5d4531,
      roughness: 0.95,
      metalness: 0.0,
    }),
  );
  const trunkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x6d5039,
      roughness: 0.92,
      metalness: 0.0,
    }),
  );
  const foliageMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.0,
    }),
  );
  const floodlightFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.floodlightBank,
      emissive: new THREE.Color(0xfff5d8),
      emissiveMap: textures.floodlightBank,
      emissiveIntensity: 0.48,
      roughness: 0.25,
      metalness: 0.1,
    }),
  );
  const scoreboardScreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.scoreboardDisplay,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: textures.scoreboardDisplay,
      emissiveIntensity: 0.24,
      roughness: 0.3,
      metalness: 0.05,
    }),
  );
  const timingScreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.timingDisplay,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: textures.timingDisplay,
      emissiveIntensity: 0.24,
      roughness: 0.3,
      metalness: 0.05,
    }),
  );
  const stadiumBannerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.stadiumBanner,
      roughness: 0.46,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
  );
  const seatMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.46,
      metalness: 0.08,
    }),
  );
  const shadowDiscMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.34,
    }),
  );

  // =========================================================================
  // 1. OUTER LANDSCAPED PARK LAWN, STADIUM CONCOURSE APRON & APPROACH PATHS
  // =========================================================================
  const parkY = -0.85;
  const parkGeo = trackGeo(new THREE.PlaneGeometry(PARK_SIZE, PARK_SIZE));
  parkGeo.rotateX(-Math.PI / 2);
  const parkMesh = new THREE.Mesh(parkGeo, parkLawnMat);
  parkMesh.position.y = parkY;
  parkMesh.receiveShadow = true;
  group.add(parkMesh);

  const parkPlinthGeo = trackGeo(new THREE.BoxGeometry(PARK_SIZE - 0.3, 2.8, PARK_SIZE - 0.3));
  const parkPlinthMesh = new THREE.Mesh(parkPlinthGeo, parkEarthMat);
  parkPlinthMesh.position.y = parkY - 1.75; // Top sits 0.35 below parkLawn to avoid long-distance Z-fighting
  group.add(parkPlinthMesh);

  // Clean paved stadium concourse platform around the 240x240 inner grass square
  const concourseY = -0.35;
  const concourseSpan = 356; // [-178, +178], leaves neat green landscaped border outside
  const concourseGeo = trackGeo(new THREE.BoxGeometry(concourseSpan, 0.52, concourseSpan));
  const concourseMesh = new THREE.Mesh(concourseGeo, concourseMat);
  concourseMesh.position.y = concourseY - 0.26;
  concourseMesh.receiveShadow = true;
  group.add(concourseMesh);

  // Outer perimeter landscaped ring walkway around the stadium apron
  const ringWalkOuter = 186;
  const ringWalkInner = 178;
  const pathNSGeo = trackGeo(new THREE.BoxGeometry(ringWalkOuter * 2, 0.08, ringWalkOuter - ringWalkInner));
  const pathEWGeo = trackGeo(new THREE.BoxGeometry(ringWalkOuter - ringWalkInner, 0.08, ringWalkInner * 2));
  for (const s of [-1, 1]) {
    const pNS = new THREE.Mesh(pathNSGeo, pathStoneMat);
    pNS.position.set(0, parkY + 0.04, s * ((ringWalkOuter + ringWalkInner) * 0.5));
    pNS.receiveShadow = true;
    const pEW = new THREE.Mesh(pathEWGeo, pathStoneMat);
    pEW.position.set(s * ((ringWalkOuter + ringWalkInner) * 0.5), parkY + 0.04, 0);
    pEW.receiveShadow = true;
    group.add(pNS, pEW);
  }

  // Four radial entrance walkways leading from outer park edge to the 4 cardinal stadium gates
  const approachLen = PARK_HALF - 177;
  const approachWidth = 22;
  const approachGeoZ = trackGeo(new THREE.BoxGeometry(approachWidth, 0.1, approachLen));
  const approachGeoX = trackGeo(new THREE.BoxGeometry(approachLen, 0.1, approachWidth));
  for (const s of [-1, 1]) {
    const walkZ = new THREE.Mesh(approachGeoZ, pathStoneMat);
    walkZ.position.set(0, parkY + 0.05, s * (177 + approachLen * 0.5));
    walkZ.receiveShadow = true;
    const walkX = new THREE.Mesh(approachGeoX, pathStoneMat);
    walkX.position.set(s * (177 + approachLen * 0.5), parkY + 0.05, 0);
    walkX.receiveShadow = true;
    group.add(walkZ, walkX);
  }

  // Subtle perimeter curb outlining the inner 240x240 grass field cleanly on concourse
  // Leave a wide 30-unit opening at x = 0 on the South side (+Z) for the town-to-stadium road
  const curbWidth = 1.4;
  const curbLen = FIELD_HALF * 2 + curbWidth * 2;
  const curbGeoH = trackGeo(new THREE.BoxGeometry(curbLen, 0.38, curbWidth));
  const curbGeoHSplit = trackGeo(new THREE.BoxGeometry(FIELD_HALF - 15, 0.38, curbWidth));
  const curbGeoV = trackGeo(new THREE.BoxGeometry(curbWidth, 0.38, FIELD_HALF * 2));
  const northCurb = new THREE.Mesh(curbGeoH, concreteLightMat);
  northCurb.position.set(0, concourseY + 0.19, -(FIELD_HALF + curbWidth * 0.5));
  northCurb.receiveShadow = true;
  group.add(northCurb);
  for (const s of [-1, 1]) {
    const southCurbWing = new THREE.Mesh(curbGeoHSplit, concreteLightMat);
    southCurbWing.position.set(
      s * (15 + (FIELD_HALF - 15) * 0.5),
      concourseY + 0.19,
      FIELD_HALF + curbWidth * 0.5,
    );
    southCurbWing.receiveShadow = true;
    const cv = new THREE.Mesh(curbGeoV, concreteLightMat);
    cv.position.set(s * (FIELD_HALF + curbWidth * 0.5), concourseY + 0.19, 0);
    cv.receiveShadow = true;
    group.add(southCurbWing, cv);
  }

  // =========================================================================
  // 2. COLLECT SEATS FOR ONE SINGLE INSTANCED MESH + BUILD TIERED GRANDSTANDS
  // =========================================================================
  const allSeats: SeatInstanceSpec[] = [];
  const sectionColors = [
    new THREE.Color(0xd63a2e), // Crimson red
    new THREE.Color(0x2d4d74), // Deep navy blue
    new THREE.Color(0xd63a2e),
    new THREE.Color(0xe3a024), // Center gold/amber
    new THREE.Color(0x2d4d74),
    new THREE.Color(0xd63a2e),
  ];
  const minorSectionColors = [
    new THREE.Color(0x2d4d74),
    new THREE.Color(0xd63a2e),
    new THREE.Color(0xe3a024),
    new THREE.Color(0xd63a2e),
    new THREE.Color(0x2d4d74),
  ];

  // Helper to construct a stepped seating tier block cleanly inside a local stand group
  function buildSteppedTier(
    parent: THREE.Group,
    centerX: number,
    centerZ: number,
    facingYaw: number,
    standWidth: number,
    sectionCount: number,
    aisleWidth: number,
    rowCount: number,
    rowDepth: number,
    rowRise: number,
    startLocalZ: number, // Frontmost row local Z (toward track)
    baseY: number,
    colors: THREE.Color[],
  ) {
    const tierGroup = new THREE.Group();
    tierGroup.position.set(centerX, 0, centerZ);
    tierGroup.rotation.y = facingYaw;
    parent.add(tierGroup);

    const totalAisles = sectionCount - 1;
    const usableWidth = standWidth - totalAisles * aisleWidth;
    const sectionWidth = usableWidth / sectionCount;
    const seatsPerSection = Math.max(4, Math.floor((sectionWidth - 0.8) / 1.45));

    // Concrete riser step boxes + stair aisles
    const riserGeo = trackGeo(new THREE.BoxGeometry(standWidth, rowRise, rowDepth));
    const riserMesh = new THREE.InstancedMesh(riserGeo, concreteLightMat, rowCount);
    riserMesh.castShadow = true;
    riserMesh.receiveShadow = true;

    const aisleGeo = trackGeo(new THREE.BoxGeometry(aisleWidth, rowRise * 0.55, rowDepth * 0.92));
    const aisleMesh = new THREE.InstancedMesh(
      aisleGeo,
      stairAisleMat,
      rowCount * Math.max(1, totalAisles),
    );
    aisleMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let aisleIdx = 0;

    for (let r = 0; r < rowCount; r++) {
      const lz = startLocalZ - r * rowDepth;
      const ly = baseY + r * rowRise;

      dummy.position.set(0, ly + rowRise * 0.5, lz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      riserMesh.setMatrixAt(r, dummy.matrix);

      // Colored seats per section
      for (let sec = 0; sec < sectionCount; sec++) {
        const secStartX =
          -standWidth * 0.5 + sec * (sectionWidth + aisleWidth) + sectionWidth * 0.5;
        const secColor = colors[sec % colors.length];
        const spacing = (sectionWidth - 1.1) / Math.max(1, seatsPerSection - 1);

        for (let s = 0; s < seatsPerSection; s++) {
          const lx = secStartX - (sectionWidth - 1.1) * 0.5 + s * spacing;
          const world = toWorldXZ(centerX, centerZ, facingYaw, lx, lz);
          allSeats.push({
            x: world.x,
            y: ly + rowRise,
            z: world.z,
            yaw: facingYaw,
            color: secColor,
          });
        }

        // Concrete stair aisle between sections
        if (sec < totalAisles) {
          const aisleX = -standWidth * 0.5 + (sec + 1) * sectionWidth + (sec + 0.5) * aisleWidth;
          dummy.position.set(aisleX, ly + rowRise * 0.9, lz + rowDepth * 0.04);
          dummy.updateMatrix();
          aisleMesh.setMatrixAt(aisleIdx++, dummy.matrix);
        }
      }
    }

    riserMesh.instanceMatrix.needsUpdate = true;
    aisleMesh.count = aisleIdx;
    aisleMesh.instanceMatrix.needsUpdate = true;
    tierGroup.add(riserMesh, aisleMesh);

    // Subtle side cheek walls bounding the seating bowl cleanly
    const totalDepth = rowCount * rowDepth;
    const totalHeight = rowCount * rowRise;
    const sideWallGeo = trackGeo(new THREE.BoxGeometry(0.9, totalHeight + 0.8, totalDepth));
    for (const s of [-1, 1]) {
      const sideWall = new THREE.Mesh(sideWallGeo, concreteMidMat);
      sideWall.position.set(
        s * (standWidth * 0.5 + 0.45),
        baseY + totalHeight * 0.5,
        startLocalZ - totalDepth * 0.5 + rowDepth * 0.5,
      );
      sideWall.castShadow = true;
      sideWall.receiveShadow = true;
      tierGroup.add(sideWall);
    }

    return tierGroup;
  }

  // -------------------------------------------------------------------------
  // A. LARGE MULTI-TIER NORTH MAIN GRANDSTAND (-Z side, facing +Z)
  // -------------------------------------------------------------------------
  const northGroup = new THREE.Group();
  northGroup.name = 'NORTH_MAIN_GRANDSTAND';
  group.add(northGroup);

  const northWidth = 196;
  const northCenterZ = 0;

  // Lower tier: 8 rows from z = -129.5 back to z = -147.1 (y = 0.6 to 6.2)
  buildSteppedTier(
    northGroup,
    0,
    northCenterZ,
    0,
    northWidth,
    6,
    2.6,
    8,
    2.2,
    0.72,
    -129.5,
    concourseY + 0.85,
    sectionColors,
  );

  // Front fascia wall below first row
  const northFrontWallGeo = trackGeo(new THREE.BoxGeometry(northWidth + 1.8, 1.35, 1.0));
  const northFrontWall = new THREE.Mesh(northFrontWallGeo, concreteMidMat);
  northFrontWall.position.set(0, concourseY + 0.68, -128.4);
  northFrontWall.castShadow = true;
  northFrontWall.receiveShadow = true;
  northGroup.add(northFrontWall);

  // Mid-level open concourse deck (z = -146.5 to -155.5, y = 6.25)
  const midDeckGeo = trackGeo(new THREE.BoxGeometry(northWidth + 2, 0.8, 9.2));
  const midDeckMesh = new THREE.Mesh(midDeckGeo, concreteMidMat);
  midDeckMesh.position.set(0, 6.25, -150.6);
  midDeckMesh.castShadow = true;
  midDeckMesh.receiveShadow = true;
  northGroup.add(midDeckMesh);

  // Mid-level concourse front handrail + subtle red trim stripe
  const midRailGeo = trackGeo(new THREE.BoxGeometry(northWidth + 1.4, 0.9, 0.25));
  const midRailMesh = new THREE.Mesh(midRailGeo, darkSteelMat);
  midRailMesh.position.set(0, 7.1, -146.3);
  northGroup.add(midRailMesh);

  // 3 Vomitory entrance portals opening onto the mid-level concourse
  const vomFrameGeo = trackGeo(new THREE.BoxGeometry(7.8, 3.8, 2.4));
  const vomOpeningGeo = trackGeo(new THREE.BoxGeometry(5.8, 3.2, 2.6));
  for (const vx of [-56, 0, 56]) {
    const vFrame = new THREE.Mesh(vomFrameGeo, facadeWhiteMat);
    vFrame.position.set(vx, 8.5, -153.6);
    vFrame.castShadow = true;
    const vOpen = new THREE.Mesh(vomOpeningGeo, darkPortalMat);
    vOpen.position.set(vx, 8.2, -153.5);
    northGroup.add(vFrame, vOpen);
  }

  // Upper tier: 7 rows from z = -155.5 back to z = -170.9 (y = 7.4 to 14.4)
  buildSteppedTier(
    northGroup,
    0,
    northCenterZ,
    0,
    northWidth,
    6,
    2.6,
    7,
    2.2,
    1.02,
    -155.5,
    7.35,
    sectionColors,
  );

  // Under-stand structural substructure, rear concourse bays & 3 North Entrance Gates
  const northRearWallGeo = trackGeo(new THREE.BoxGeometry(northWidth + 2, 19.6, 1.4));
  const northRearWall = new THREE.Mesh(northRearWallGeo, facadeWhiteMat);
  northRearWall.position.set(0, concourseY + 9.8, -172.8);
  northRearWall.castShadow = true;
  northRearWall.receiveShadow = true;
  northGroup.add(northRearWall);

  // Recessed glazed upper rear concourse band on outer facade
  const northGlassBandGeo = trackGeo(new THREE.BoxGeometry(northWidth - 10, 4.2, 1.7));
  const northGlassBand = new THREE.Mesh(northGlassBandGeo, pavilionGlassMat);
  northGlassBand.position.set(0, 14.2, -172.8);
  northGroup.add(northGlassBand);

  // 13 Heavy architectural columns & upper facade louvers + cantilevered roof truss ribs
  const northBayCount = 13;
  const northColGeo = trackGeo(new THREE.BoxGeometry(1.7, 21.2, 2.4));
  const northColInst = new THREE.InstancedMesh(northColGeo, concreteLightMat, northBayCount);
  northColInst.castShadow = true;
  northColInst.receiveShadow = true;

  const northTrussLen = 42;
  const northTrussGeo = trackGeo(new THREE.BoxGeometry(1.15, 1.35, northTrussLen));
  const northTrussInst = new THREE.InstancedMesh(northTrussGeo, darkSteelMat, northBayCount);
  northTrussInst.castShadow = true;

  const northRoofSlope = Math.atan2(
    STADIUM_NORTH_CANOPY_HEIGHT - 20.6,
    northTrussLen,
  );
  const dummy = new THREE.Object3D();

  for (let i = 0; i < northBayCount; i++) {
    const x = -northWidth * 0.5 + (i / (northBayCount - 1)) * northWidth;
    dummy.position.set(x, concourseY + 10.6, -173.4);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    northColInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, 22.1, -153.8);
    dummy.rotation.set(-northRoofSlope, 0, 0);
    dummy.updateMatrix();
    northTrussInst.setMatrixAt(i, dummy.matrix);
  }
  northColInst.instanceMatrix.needsUpdate = true;
  northTrussInst.instanceMatrix.needsUpdate = true;
  northGroup.add(northColInst, northTrussInst);

  // Main North Cantilevered Roof Canopy Shell + front fascia & racing-red accent stripe
  const northCanopyGeo = trackGeo(new THREE.BoxGeometry(northWidth + 6, 0.75, northTrussLen));
  const northCanopyMesh = new THREE.Mesh(northCanopyGeo, canopyRoofMat);
  northCanopyMesh.position.set(0, 22.6, -153.8);
  northCanopyMesh.rotation.x = -northRoofSlope;
  northCanopyMesh.castShadow = true;
  northCanopyMesh.receiveShadow = true;
  northGroup.add(northCanopyMesh);

  const northCanopySoffitGeo = trackGeo(new THREE.BoxGeometry(northWidth + 5.6, 0.28, northTrussLen - 0.6));
  const northCanopySoffit = new THREE.Mesh(northCanopySoffitGeo, canopySoffitMat);
  northCanopySoffit.position.set(0, 22.12, -153.8);
  northCanopySoffit.rotation.x = -northRoofSlope;
  northGroup.add(northCanopySoffit);

  const northFrontFasciaGeo = trackGeo(new THREE.BoxGeometry(northWidth + 6.4, 1.35, 0.7));
  const northFrontFascia = new THREE.Mesh(northFrontFasciaGeo, darkSteelMat);
  northFrontFascia.position.set(0, STADIUM_NORTH_CANOPY_HEIGHT + 0.15, -133.0);
  northFrontFascia.castShadow = true;
  northGroup.add(northFrontFascia);

  const northFasciaAccentGeo = trackGeo(new THREE.BoxGeometry(northWidth + 6.5, 0.42, 0.78));
  const northFasciaAccent = new THREE.Mesh(northFasciaAccentGeo, accentRedMat);
  northFasciaAccent.position.set(0, STADIUM_NORTH_CANOPY_HEIGHT - 0.2, -132.98);
  northGroup.add(northFasciaAccent);

  // North Main Entrance Gate Portals (center + flanking gates facing outward -Z)
  const gateArchTopGeo = trackGeo(new THREE.BoxGeometry(20, 2.2, 4.6));
  const gatePierGeo = trackGeo(new THREE.BoxGeometry(2.4, 8.2, 4.2));
  const gateDarkVoidGeo = trackGeo(new THREE.BoxGeometry(15.2, 6.2, 2.0));
  for (const gx of [-58, 0, 58]) {
    const isCenter = gx === 0;
    const scaleX = isCenter ? 1.25 : 0.88;
    const archTop = new THREE.Mesh(gateArchTopGeo, darkSteelMat);
    archTop.scale.set(scaleX, 1, 1);
    archTop.position.set(gx, 7.8, -174.6);
    archTop.castShadow = true;

    const gateBannerStrip = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(19.6 * scaleX, 0.65, 4.75)),
      accentRedMat,
    );
    gateBannerStrip.position.set(gx, 8.4, -174.6);

    const gVoid = new THREE.Mesh(gateDarkVoidGeo, darkPortalMat);
    gVoid.scale.set(scaleX, 1, 1);
    gVoid.position.set(gx, 3.2, -173.4);

    northGroup.add(archTop, gateBannerStrip, gVoid);
    for (const ps of [-1, 1]) {
      const gPier = new THREE.Mesh(gatePierGeo, facadeWhiteMat);
      gPier.position.set(gx + ps * 8.6 * scaleX, 3.8, -174.6);
      gPier.castShadow = true;
      northGroup.add(gPier);
    }
  }

  // -------------------------------------------------------------------------
  // B. SMALLER WEST GRANDSTAND (-X side, facing +X)
  // -------------------------------------------------------------------------
  const westGroup = new THREE.Group();
  westGroup.name = 'WEST_STAND';
  group.add(westGroup);

  const westWidth = 172;
  const westYaw = Math.PI * 0.5;
  buildSteppedTier(
    westGroup,
    0,
    0,
    westYaw,
    westWidth,
    5,
    2.4,
    8,
    2.2,
    0.72,
    -129.5,
    concourseY + 0.75,
    minorSectionColors,
  );

  // West rear concourse walkway, colonnade facade & partial roof canopy
  const westRearWallGeo = trackGeo(new THREE.BoxGeometry(1.4, 12.2, westWidth + 2));
  const westRearWall = new THREE.Mesh(westRearWallGeo, facadeWhiteMat);
  westRearWall.position.set(-154.5, concourseY + 6.1, 0);
  westRearWall.castShadow = true;
  westRearWall.receiveShadow = true;
  westGroup.add(westRearWall);

  const westColGeo = trackGeo(new THREE.BoxGeometry(2.0, 12.8, 1.4));
  const westColCount = 10;
  const westColInst = new THREE.InstancedMesh(westColGeo, concreteLightMat, westColCount);
  westColInst.castShadow = true;
  for (let i = 0; i < westColCount; i++) {
    const z = -westWidth * 0.5 + (i / (westColCount - 1)) * westWidth;
    dummy.position.set(-155.0, concourseY + 6.4, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    westColInst.setMatrixAt(i, dummy.matrix);
  }
  westColInst.instanceMatrix.needsUpdate = true;
  westGroup.add(westColInst);

  const westCanopyGeo = trackGeo(new THREE.BoxGeometry(24, 0.6, westWidth + 4));
  const westCanopy = new THREE.Mesh(westCanopyGeo, canopyRoofMat);
  westCanopy.position.set(-145.5, 13.4, 0);
  westCanopy.rotation.z = -0.09;
  westCanopy.castShadow = true;
  westCanopy.receiveShadow = true;
  westGroup.add(westCanopy);

  const westFasciaGeo = trackGeo(new THREE.BoxGeometry(0.55, 0.9, westWidth + 4.4));
  const westFascia = new THREE.Mesh(westFasciaGeo, darkSteelMat);
  westFascia.position.set(-133.6, 14.3, 0);
  const westAccent = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.62, 0.32, westWidth + 4.5)),
    accentRedMat,
  );
  westAccent.position.set(-133.56, 14.05, 0);
  westGroup.add(westFascia, westAccent);

  // West Entrance Gate Portal
  const westGateTop = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(4.2, 2.0, 22)),
    darkSteelMat,
  );
  westGateTop.position.set(-156.4, 7.0, 0);
  westGateTop.castShadow = true;
  const westGateVoid = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.0, 5.8, 16)),
    darkPortalMat,
  );
  westGateVoid.position.set(-155.2, 2.9, 0);
  westGroup.add(westGateTop, westGateVoid);

  // -------------------------------------------------------------------------
  // C. SPLIT LOW-PROFILE SOUTH STAND (+Z side) WITH WIDE DRIVEABLE ENTRANCE GATE
  // -------------------------------------------------------------------------
  const southGroup = new THREE.Group();
  southGroup.name = 'SOUTH_STAND';
  group.add(southGroup);

  const southWingWidth = 74;
  const southWingCenterAbs = 52; // Spans |x| from 15 to 89, leaving [-15, +15] fully open!
  const southYaw = Math.PI;
  const southRearWallGeo = trackGeo(new THREE.BoxGeometry(southWingWidth + 2, 6.2, 1.4));
  const southRearTrimGeo = trackGeo(new THREE.BoxGeometry(southWingWidth + 2.4, 0.6, 1.8));
  const southRearStripeGeo = trackGeo(new THREE.BoxGeometry(southWingWidth + 2.5, 0.28, 1.86));

  for (const side of [-1, 1]) {
    const cx = side * southWingCenterAbs;
    buildSteppedTier(
      southGroup,
      cx,
      0,
      southYaw,
      southWingWidth,
      2,
      2.2,
      6,
      2.1,
      0.66,
      -132.5,
      concourseY + 0.65,
      minorSectionColors,
    );

    const wingWall = new THREE.Mesh(southRearWallGeo, facadeWhiteMat);
    wingWall.position.set(cx, concourseY + 3.1, 149.5);
    wingWall.castShadow = true;
    wingWall.receiveShadow = true;

    const wingTrim = new THREE.Mesh(southRearTrimGeo, darkSteelMat);
    wingTrim.position.set(cx, concourseY + 6.4, 149.5);

    const wingStripe = new THREE.Mesh(southRearStripeGeo, accentRedMat);
    wingStripe.position.set(cx, concourseY + 6.0, 149.5);

    southGroup.add(wingWall, wingTrim, wingStripe);
  }

  // Open Driveable South Stadium Entrance Archway (x in [-14, +14] completely clear!)
  const southGatePierGeo = trackGeo(new THREE.BoxGeometry(2.8, 9.6, 4.4));
  for (const side of [-1, 1]) {
    const pier = new THREE.Mesh(southGatePierGeo, facadeWhiteMat);
    pier.position.set(side * 14.2, concourseY + 4.8, 150.2);
    pier.castShadow = true;
    pier.receiveShadow = true;
    southGroup.add(pier);
  }
  const southGateTop = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(31.6, 2.2, 4.6)),
    darkSteelMat,
  );
  southGateTop.position.set(0, 9.8, 150.2);
  southGateTop.castShadow = true;
  const southGateAccent = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(31.8, 0.55, 4.75)),
    accentRedMat,
  );
  southGateAccent.position.set(0, 8.95, 150.2);
  southGroup.add(southGateTop, southGateAccent);

  // -------------------------------------------------------------------------
  // D. DISTINCT ARCHITECTURAL EAST PAVILION (+X side overlooking START/FINISH straight)
  // -------------------------------------------------------------------------
  const pavilionGroup = new THREE.Group();
  pavilionGroup.name = 'EAST_PAVILION';
  group.add(pavilionGroup);

  const pavLen = 128;
  // Ground colonnade podium & upper covered viewing terrace (y = 5.4)
  const pavDeckGeo = trackGeo(new THREE.BoxGeometry(28, 0.9, pavLen));
  const pavDeck = new THREE.Mesh(pavDeckGeo, concreteLightMat);
  pavDeck.position.set(147, 5.4, 0);
  pavDeck.castShadow = true;
  pavDeck.receiveShadow = true;
  pavilionGroup.add(pavDeck);

  // Ground support columns under projecting viewing terrace
  const pavColGeo = trackGeo(new THREE.CylinderGeometry(0.55, 0.68, 5.6, 10));
  const pavColInst = new THREE.InstancedMesh(pavColGeo, concreteLightMat, 18);
  pavColInst.castShadow = true;
  let pColIdx = 0;
  for (let i = 0; i < 9; i++) {
    const z = -56 + i * 14;
    for (const px of [134.8, 158.8]) {
      dummy.position.set(px, concourseY + 2.8, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pavColInst.setMatrixAt(pColIdx++, dummy.matrix);
    }
  }
  pavColInst.instanceMatrix.needsUpdate = true;
  pavilionGroup.add(pavColInst);

  // Front glass-and-steel balustrade along the covered viewing deck
  const pavRailGlass = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.24, 1.35, pavLen - 2)),
    pavilionGlassMat,
  );
  pavRailGlass.position.set(133.4, 6.55, 0);
  const pavRailTop = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.42, 0.2, pavLen - 1.5)),
    darkSteelMat,
  );
  pavRailTop.position.set(133.4, 7.25, 0);
  pavilionGroup.add(pavRailGlass, pavRailTop);

  // Detailed glazed & louvered Pavilion enclosure set back behind covered terrace
  const pavHallBody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(17.5, 6.4, pavLen - 22)),
    pavilionGlassMat,
  );
  pavHallBody.position.set(151.5, 9.0, 0);
  pavilionGroup.add(pavHallBody);

  // Architectural solid end wings with clean stone trim
  const pavWingGeo = trackGeo(new THREE.BoxGeometry(20, 7.2, 12));
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(pavWingGeo, facadeWhiteMat);
    wing.position.set(150.5, 9.3, s * 57);
    wing.castShadow = true;
    wing.receiveShadow = true;
    pavilionGroup.add(wing);
  }

  // Warm wood/bronze vertical architectural louver fins across pavilion facade
  const louverCount = 26;
  const louverGeo = trackGeo(new THREE.BoxGeometry(0.95, 6.7, 0.42));
  const louverInst = new THREE.InstancedMesh(louverGeo, woodBronzeMat, louverCount);
  louverInst.castShadow = true;
  for (let i = 0; i < louverCount; i++) {
    const z = -49 + (i / (louverCount - 1)) * 98;
    dummy.position.set(142.3, 9.1, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    louverInst.setMatrixAt(i, dummy.matrix);
  }
  louverInst.instanceMatrix.needsUpdate = true;
  pavilionGroup.add(louverInst);

  // Slender front canopy columns supporting the covered viewing deck roof (stop flush below canopy soffit)
  const upperPavColGeo = trackGeo(new THREE.CylinderGeometry(0.38, 0.45, 6.8, 10));
  const upperPavColInst = new THREE.InstancedMesh(upperPavColGeo, darkSteelMat, 9);
  upperPavColInst.castShadow = true;
  for (let i = 0; i < 9; i++) {
    dummy.position.set(134.5, 9.15, -56 + i * 14);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    upperPavColInst.setMatrixAt(i, dummy.matrix);
  }
  upperPavColInst.instanceMatrix.needsUpdate = true;
  pavilionGroup.add(upperPavColInst);

  // Double-wing sculpted Pavilion Roof Canopy
  const pavLowerRoof = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(31, 0.65, pavLen + 6)),
    canopyRoofMat,
  );
  pavLowerRoof.position.set(146.5, 13.6, 0);
  pavLowerRoof.rotation.z = 0.06;
  pavLowerRoof.castShadow = true;
  pavLowerRoof.receiveShadow = true;

  const pavUpperClerestory = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(14, 0.85, pavLen - 24)),
    darkSteelMat,
  );
  pavUpperClerestory.position.set(150.5, 14.7, 0);
  pavUpperClerestory.castShadow = true;

  const pavFrontTrim = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.65, 0.9, pavLen + 6.4)),
    darkSteelMat,
  );
  pavFrontTrim.position.set(131.1, 14.55, 0);
  const pavAccentTrim = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.72, 0.34, pavLen + 6.5)),
    accentRedMat,
  );
  pavAccentTrim.position.set(131.05, 14.25, 0);

  pavilionGroup.add(pavLowerRoof, pavUpperClerestory, pavFrontTrim, pavAccentTrim);

  // East Entrance Gate Portal on outer pavilion side
  const eastGateTop = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(4.2, 2.0, 22)),
    darkSteelMat,
  );
  eastGateTop.position.set(162.5, 7.0, 0);
  eastGateTop.castShadow = true;
  const eastGateVoid = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.0, 5.2, 16)),
    darkPortalMat,
  );
  eastGateVoid.position.set(161.4, 2.4, 0);
  pavilionGroup.add(eastGateTop, eastGateVoid);

  // =========================================================================
  // 3. INSTANCED EMPTY SEATS ACROSS ALL STANDS (SINGLE DRAW CALL)
  // =========================================================================
  const seatGeo = trackGeo(createMergedSeatGeometry());
  const seatInst = new THREE.InstancedMesh(seatGeo, seatMat, allSeats.length);
  seatInst.castShadow = true;
  seatInst.receiveShadow = true;

  for (let i = 0; i < allSeats.length; i++) {
    const s = allSeats[i];
    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.set(0, s.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    seatInst.setMatrixAt(i, dummy.matrix);
    seatInst.setColorAt(i, s.color);
  }
  seatInst.instanceMatrix.needsUpdate = true;
  if (seatInst.instanceColor) seatInst.instanceColor.needsUpdate = true;
  group.add(seatInst);

  // =========================================================================
  // 4. SCOREBOARD, TIMING DISPLAY, CORNER FLOODLIGHT TOWERS & STADIUM BANNERS
  // =========================================================================
  // Main Scoreboard at NW stadium corner plaza (-124, -142) angled toward track & spectator camera
  const scoreboardGroup = new THREE.Group();
  scoreboardGroup.name = 'STADIUM_SCOREBOARD';
  scoreboardGroup.position.set(-124, concourseY, -142);
  scoreboardGroup.rotation.y = Math.PI * 0.25;

  const sbLegGeo = trackGeo(new THREE.BoxGeometry(1.5, 19.5, 1.5));
  for (const lx of [-8.5, 8.5]) {
    const leg = new THREE.Mesh(sbLegGeo, darkSteelMat);
    leg.position.set(lx, 9.75, 0);
    leg.castShadow = true;
    scoreboardGroup.add(leg);
  }
  const sbHousing = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(27.5, 14.2, 1.6)),
    darkSteelMat,
  );
  sbHousing.position.set(0, 17.5, 0);
  sbHousing.castShadow = true;
  scoreboardGroup.add(sbHousing);

  const sbTopAccent = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(27.8, 0.7, 1.7)),
    accentRedMat,
  );
  sbTopAccent.position.set(0, 24.8, 0);
  scoreboardGroup.add(sbTopAccent);

  const sbFaceGeo = trackGeo(new THREE.PlaneGeometry(25.8, 12.8));
  const sbFront = new THREE.Mesh(sbFaceGeo, scoreboardScreenMat);
  sbFront.position.set(0, 17.5, 0.85);
  const sbBack = new THREE.Mesh(sbFaceGeo, scoreboardScreenMat);
  sbBack.position.set(0, 17.5, -0.85);
  sbBack.rotation.y = Math.PI;
  scoreboardGroup.add(sbFront, sbBack);
  group.add(scoreboardGroup);

  // Secondary Timing Display Tower near East Pavilion / Finish area (136, 84)
  const timingGroup = new THREE.Group();
  timingGroup.name = 'STADIUM_TIMING_DISPLAY';
  timingGroup.position.set(136, concourseY, 84);
  timingGroup.rotation.y = -Math.PI * 0.35;

  const tPylonBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(3.8, 2.2, 2.6)),
    concreteMidMat,
  );
  tPylonBase.position.set(0, 1.1, 0);
  tPylonBase.castShadow = true;
  const tBody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(6.8, 13.6, 1.4)),
    darkSteelMat,
  );
  tBody.position.set(0, 8.8, 0);
  tBody.castShadow = true;
  const tFaceGeo = trackGeo(new THREE.PlaneGeometry(6.0, 12.0));
  const tFront = new THREE.Mesh(tFaceGeo, timingScreenMat);
  tFront.position.set(0, 8.8, 0.74);
  const tBack = new THREE.Mesh(tFaceGeo, timingScreenMat);
  tBack.position.set(0, 8.8, -0.74);
  tBack.rotation.y = Math.PI;
  timingGroup.add(tPylonBase, tBody, tFront, tBack);
  group.add(timingGroup);

  // Decorative Stadium Banners around entrance plazas & outer corners
  const bannerPoleGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.24, 11.2, 8));
  const bannerFlagGeo = trackGeo(new THREE.PlaneGeometry(2.6, 5.4));
  const bannerPositions: Array<[number, number, number]> = [
    [-26, -176, 0],
    [26, -176, 0],
    [-162, -26, Math.PI * 0.5],
    [-162, 26, Math.PI * 0.5],
    [164, -24, -Math.PI * 0.5],
    [164, 24, -Math.PI * 0.5],
    [-26, 153, Math.PI],
    [26, 153, Math.PI],
  ];
  for (const [bx, bz, byaw] of bannerPositions) {
    const bWrap = new THREE.Group();
    bWrap.position.set(bx, concourseY, bz);
    bWrap.rotation.y = byaw;
    const pole = new THREE.Mesh(bannerPoleGeo, darkSteelMat);
    pole.position.set(0, 5.6, 0);
    pole.castShadow = true;
    const flag = new THREE.Mesh(bannerFlagGeo, stadiumBannerMat);
    flag.position.set(0, 7.6, -0.24);
    bWrap.add(pole, flag);
    group.add(bWrap);
  }

  // Four tall corner Floodlight Towers outside the stadium corners
  const towerBaseGeo = trackGeo(new THREE.BoxGeometry(6.8, 3.4, 6.8));
  const towerMastH = STADIUM_TOWER_HEIGHT - 7.5;
  const towerMastGeo = trackGeo(new THREE.CylinderGeometry(0.82, 1.48, towerMastH, 12));
  const towerNeckGeo = trackGeo(new THREE.BoxGeometry(1.6, 1.35, 7.8));
  const towerBarGeo = trackGeo(new THREE.BoxGeometry(15.6, 1.0, 1.1));
  const floodHousingGeo = trackGeo(new THREE.BoxGeometry(15.0, 5.8, 1.2));
  const floodFaceGeo = trackGeo(new THREE.PlaneGeometry(14.2, 5.1));

  const cornerCoords: Array<[number, number]> = [
    [-STADIUM_TOWER_OFFSET, -STADIUM_TOWER_OFFSET],
    [STADIUM_TOWER_OFFSET, -STADIUM_TOWER_OFFSET],
    [-STADIUM_TOWER_OFFSET, STADIUM_TOWER_OFFSET],
    [STADIUM_TOWER_OFFSET, STADIUM_TOWER_OFFSET],
  ];
  for (let c = 0; c < cornerCoords.length; c++) {
    const [tx, tz] = cornerCoords[c];
    const tower = new THREE.Group();
    tower.name = `FLOODLIGHT_TOWER_${c + 1}`;
    tower.position.set(tx, concourseY, tz);
    tower.rotation.y = Math.atan2(-tx, -tz);

    const basePlinth = new THREE.Mesh(towerBaseGeo, concreteMidMat);
    basePlinth.position.set(0, 1.7, 0);
    basePlinth.castShadow = true;
    basePlinth.receiveShadow = true;

    const mast = new THREE.Mesh(towerMastGeo, darkSteelMat);
    mast.position.set(0, 3.4 + towerMastH * 0.5, 0);
    mast.castShadow = true;

    const neck = new THREE.Mesh(towerNeckGeo, darkSteelMat);
    neck.position.set(0, STADIUM_TOWER_HEIGHT - 4.2, 3.0);
    neck.rotation.x = -0.22;
    neck.castShadow = true;

    const headMount = new THREE.Group();
    headMount.position.set(0, STADIUM_TOWER_HEIGHT - 3.0, 6.6);
    headMount.rotation.x = 0.52;

    const bar = new THREE.Mesh(towerBarGeo, darkSteelMat);
    bar.position.set(0, 0, -0.65);
    const housing = new THREE.Mesh(floodHousingGeo, darkSteelMat);
    housing.castShadow = true;
    const face = new THREE.Mesh(floodFaceGeo, floodlightFaceMat);
    face.position.set(0, 0, 0.62);

    headMount.add(bar, housing, face);
    tower.add(basePlinth, mast, neck, headMount);
    group.add(tower);
  }

  // =========================================================================
  // 5. OUTER PLANTED BEDS, SHRUBS & LOW-DETAIL PERIMETER TREES (OUTSIDE STADIUM)
  // =========================================================================
  // Curbed planted beds framing the 4 stadium approach walkways cleanly outside the stadium
  const bedCoords: Array<[number, number, number, number]> = [
    [-22, -193, 18, 26],
    [22, -193, 18, 26],
    [-28, 193, 16, 26],
    [28, 193, 16, 26],
    [-193, -22, 26, 18],
    [-193, 22, 26, 18],
    [193, -22, 26, 18],
    [193, 22, 26, 18],
  ];

  const shrubPositions: Array<{ x: number; z: number; scale: number; color: number }> = [];
  for (const [bx, bz, bw, bd] of bedCoords) {
    const curb = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bw + 1.2, 0.55, bd + 1.2)),
      concreteLightMat,
    );
    curb.position.set(bx, parkY + 0.27, bz);
    curb.receiveShadow = true;
    const soil = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bw, 0.62, bd)),
      mulchBedMat,
    );
    soil.position.set(bx, parkY + 0.3, bz);
    soil.receiveShadow = true;
    group.add(curb, soil);

    // Neat grid of low ornamental shrubs inside each planted bed
    const cols = bw > bd ? 4 : 3;
    const rows = bw > bd ? 3 : 4;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const sx = bx - bw * 0.34 + (c / Math.max(1, cols - 1)) * bw * 0.68;
        const sz = bz - bd * 0.34 + (r / Math.max(1, rows - 1)) * bd * 0.68;
        shrubPositions.push({
          x: sx,
          z: sz,
          scale: 0.95 + ((c + r) % 3) * 0.22,
          color: (c + r) % 2 === 0 ? 0x2e8e38 : 0x45ad42,
        });
      }
    }
  }

  // Outer perimeter low-detail trees placed strictly along the landscaped park border (|x| or |z| >= 191)
  const treePlacements: Array<{ x: number; z: number; scale: number; tint: number }> = [];
  const edgeStops = [-196, -162, -128, -94, -56, 56, 94, 128, 162, 196];
  for (let i = 0; i < edgeStops.length; i++) {
    const v = edgeStops[i];
    const tintA = i % 2 === 0 ? 0x2c8a36 : 0x3da140;
    const tintB = i % 2 === 0 ? 0x3da140 : 0x277d30;
    treePlacements.push({ x: v, z: -201, scale: 0.95 + (i % 3) * 0.14, tint: tintA });
    treePlacements.push({ x: v, z: 201, scale: 0.95 + ((i + 1) % 3) * 0.14, tint: tintB });
    if (Math.abs(v) < 185) {
      treePlacements.push({ x: -201, z: v, scale: 0.92 + (i % 3) * 0.15, tint: tintB });
      treePlacements.push({ x: 201, z: v, scale: 0.92 + ((i + 1) % 3) * 0.15, tint: tintA });
    }
  }

  // Instanced low-detail trees (trunk + 2-tier faceted foliage + contact shadow discs)
  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.42, 0.62, 4.6, 7));
  const crownLowGeo = trackGeo(new THREE.ConeGeometry(3.2, 6.4, 7));
  const crownTopGeo = trackGeo(new THREE.ConeGeometry(2.35, 5.2, 7));
  const treeShadowGeo = trackGeo(new THREE.CircleGeometry(3.6, 12));
  treeShadowGeo.rotateX(-Math.PI / 2);

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treePlacements.length);
  const crownLowInst = new THREE.InstancedMesh(crownLowGeo, foliageMat, treePlacements.length);
  const crownTopInst = new THREE.InstancedMesh(crownTopGeo, foliageMat, treePlacements.length);
  const treeShadowInst = new THREE.InstancedMesh(treeShadowGeo, shadowDiscMat, treePlacements.length);

  trunkInst.castShadow = true;
  crownLowInst.castShadow = true;
  crownTopInst.castShadow = true;

  const tmpColor = new THREE.Color();
  for (let i = 0; i < treePlacements.length; i++) {
    const t = treePlacements[i];
    const s = t.scale;

    dummy.position.set(t.x, parkY + 2.3 * s, t.z);
    dummy.rotation.set(0, (i * 0.9) % (Math.PI * 2), 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(t.x, parkY + 6.6 * s, t.z);
    dummy.updateMatrix();
    crownLowInst.setMatrixAt(i, dummy.matrix);
    tmpColor.setHex(t.tint);
    crownLowInst.setColorAt(i, tmpColor);

    dummy.position.set(t.x, parkY + 10.2 * s, t.z);
    dummy.updateMatrix();
    crownTopInst.setMatrixAt(i, dummy.matrix);
    tmpColor.setHex(t.tint).offsetHSL(0, 0, 0.05);
    crownTopInst.setColorAt(i, tmpColor);

    dummy.position.set(t.x, parkY + 0.03, t.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(s, 1, s);
    dummy.updateMatrix();
    treeShadowInst.setMatrixAt(i, dummy.matrix);
  }
  trunkInst.instanceMatrix.needsUpdate = true;
  crownLowInst.instanceMatrix.needsUpdate = true;
  crownTopInst.instanceMatrix.needsUpdate = true;
  treeShadowInst.instanceMatrix.needsUpdate = true;
  if (crownLowInst.instanceColor) crownLowInst.instanceColor.needsUpdate = true;
  if (crownTopInst.instanceColor) crownTopInst.instanceColor.needsUpdate = true;

  group.add(trunkInst, crownLowInst, crownTopInst, treeShadowInst);

  // Instanced ornamental shrubs inside the curbed planted beds
  const shrubGeo = trackGeo(new THREE.IcosahedronGeometry(1.15, 0));
  const shrubInst = new THREE.InstancedMesh(shrubGeo, foliageMat, shrubPositions.length);
  shrubInst.castShadow = true;
  shrubInst.receiveShadow = true;

  for (let i = 0; i < shrubPositions.length; i++) {
    const sh = shrubPositions[i];
    dummy.position.set(sh.x, parkY + 0.95, sh.z);
    dummy.rotation.set(0, (i * 1.1) % Math.PI, 0);
    dummy.scale.set(sh.scale, sh.scale * 0.78, sh.scale);
    dummy.updateMatrix();
    shrubInst.setMatrixAt(i, dummy.matrix);
    tmpColor.setHex(sh.color);
    shrubInst.setColorAt(i, tmpColor);
  }
  shrubInst.instanceMatrix.needsUpdate = true;
  if (shrubInst.instanceColor) shrubInst.instanceColor.needsUpdate = true;
  group.add(shrubInst);

  return {
    group,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
