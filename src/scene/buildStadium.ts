import * as THREE from 'three';
import {
  FIELD_HALF,
  FIELD_THICKNESS,
  STADIUM_CANOPY_INNER,
  STADIUM_CANOPY_OUTER,
  STADIUM_CONCOURSE_OUTER,
  STADIUM_FACADE_RADIUS,
  STADIUM_TOWER_HEIGHT,
  STADIUM_TOWER_RADIUS,
  evaluateStadiumPoint,
} from '../track/trackLayout';
import { ProceduralTextureSet } from './textures';

export interface StadiumBuildResult {
  group: THREE.Group;
  dispose: () => void;
}

const RING_SEGMENTS = 96; // Divisible by 8 so cardinals (0,24,48,72) & corners (12,36,60,84) match exactly

/**
 * Builds the flat open concourse floor connecting the square 240x240 grass perimeter
 * cleanly out to the curved outer stadium podium edge, plus the vertical podium skirt.
 */
function buildConcourseDeckAndSkirt(
  yTop: number,
  yBottom: number,
): { deckGeo: THREE.BufferGeometry; skirtGeo: THREE.BufferGeometry } {
  const n = RING_SEGMENTS;
  const innerInset = FIELD_HALF - 0.6;

  // Top concourse surface
  const deckPos = new Float32Array((n + 1) * 2 * 3);
  const deckNorm = new Float32Array((n + 1) * 2 * 3);
  const deckUv = new Float32Array((n + 1) * 2 * 2);
  const deckIdx: number[] = [];

  // Outer vertical podium skirt
  const skirtPos = new Float32Array((n + 1) * 2 * 3);
  const skirtNorm = new Float32Array((n + 1) * 2 * 3);
  const skirtUv = new Float32Array((n + 1) * 2 * 2);
  const skirtIdx: number[] = [];

  for (let i = 0; i <= n; i++) {
    const theta = ((i % n) / n) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    // Exact ray intersection with the inner square boundary
    const squareScale = innerInset / Math.max(Math.abs(cos), Math.abs(sin));
    const ix = cos * squareScale;
    const iz = sin * squareScale;

    // Smooth curved stadium perimeter
    const outer = evaluateStadiumPoint(theta, STADIUM_CONCOURSE_OUTER);

    const base = i * 2;
    deckPos[base * 3] = ix;
    deckPos[base * 3 + 1] = yTop;
    deckPos[base * 3 + 2] = iz;
    deckPos[(base + 1) * 3] = outer.x;
    deckPos[(base + 1) * 3 + 1] = yTop;
    deckPos[(base + 1) * 3 + 2] = outer.z;

    deckNorm[base * 3] = 0;
    deckNorm[base * 3 + 1] = 1;
    deckNorm[base * 3 + 2] = 0;
    deckNorm[(base + 1) * 3] = 0;
    deckNorm[(base + 1) * 3 + 1] = 1;
    deckNorm[(base + 1) * 3 + 2] = 0;

    deckUv[base * 2] = ix / 22;
    deckUv[base * 2 + 1] = iz / 22;
    deckUv[(base + 1) * 2] = outer.x / 22;
    deckUv[(base + 1) * 2 + 1] = outer.z / 22;

    // Outward normal for skirt
    const len = Math.hypot(outer.x, outer.z) || 1;
    const nx = outer.x / len;
    const nz = outer.z / len;

    skirtPos[base * 3] = outer.x;
    skirtPos[base * 3 + 1] = yTop;
    skirtPos[base * 3 + 2] = outer.z;
    skirtPos[(base + 1) * 3] = outer.x;
    skirtPos[(base + 1) * 3 + 1] = yBottom;
    skirtPos[(base + 1) * 3 + 2] = outer.z;

    skirtNorm[base * 3] = nx;
    skirtNorm[base * 3 + 1] = 0;
    skirtNorm[base * 3 + 2] = nz;
    skirtNorm[(base + 1) * 3] = nx;
    skirtNorm[(base + 1) * 3 + 1] = 0;
    skirtNorm[(base + 1) * 3 + 2] = nz;

    skirtUv[base * 2] = i / 8;
    skirtUv[base * 2 + 1] = 1;
    skirtUv[(base + 1) * 2] = i / 8;
    skirtUv[(base + 1) * 2 + 1] = 0;

    if (i < n) {
      const a = base;
      const b = base + 1;
      const c = base + 2;
      const d = base + 3;
      deckIdx.push(a, c, b, c, d, b);
      skirtIdx.push(a, c, b, c, d, b);
    }
  }

  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.BufferAttribute(deckPos, 3));
  deckGeo.setAttribute('normal', new THREE.BufferAttribute(deckNorm, 3));
  deckGeo.setAttribute('uv', new THREE.BufferAttribute(deckUv, 2));
  deckGeo.setIndex(deckIdx);
  deckGeo.computeBoundingSphere();

  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute('position', new THREE.BufferAttribute(skirtPos, 3));
  skirtGeo.setAttribute('normal', new THREE.BufferAttribute(skirtNorm, 3));
  skirtGeo.setAttribute('uv', new THREE.BufferAttribute(skirtUv, 2));
  skirtGeo.setIndex(skirtIdx);
  skirtGeo.computeBoundingSphere();

  return { deckGeo, skirtGeo };
}

/**
 * Builds a closed curved ring extrusion with sharp flat-faced normals for stadium
 * facade bands, roof canopy shells, fascia trims, and open concourse walkways.
 * Profile points must be ordered [ (rIn, yBot), (rIn, yTop), (rOut, yTop), (rOut, yBot) ].
 */
function buildClosedCurvedProfileGeo(
  profile: ReadonlyArray<[number, number]>,
  startIndex = 0,
  endIndex = RING_SEGMENTS,
  closed = true,
): THREE.BufferGeometry {
  const segCount = endIndex - startIndex;
  const faceCount = profile.length;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let vertCursor = 0;

  for (let f = 0; f < faceCount; f++) {
    const p0 = profile[f];
    const p1 = profile[(f + 1) % faceCount];

    const faceBase = vertCursor;
    for (let s = 0; s <= segCount; s++) {
      const idx = (startIndex + s) % RING_SEGMENTS;
      const theta = (idx / RING_SEGMENTS) * Math.PI * 2;
      const c0 = evaluateStadiumPoint(theta, p0[0]);
      const c1 = evaluateStadiumPoint(theta, p1[0]);

      positions.push(c0.x, p0[1], c0.z);
      positions.push(c1.x, p1[1], c1.z);

      uvs.push(s / 8, 0);
      uvs.push(s / 8, 1);
      vertCursor += 2;
    }

    for (let s = 0; s < segCount; s++) {
      const a = faceBase + s * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, c, d, b);
    }
  }

  // End caps when building open-portal segmented arcs (like ground-level corner walls)
  if (!closed) {
    for (const endIdx of [startIndex, endIndex]) {
      const theta = ((endIdx % RING_SEGMENTS) / RING_SEGMENTS) * Math.PI * 2;
      const capBase = vertCursor;
      for (let f = 0; f < faceCount; f++) {
        const pt = evaluateStadiumPoint(theta, profile[f][0]);
        positions.push(pt.x, profile[f][1], pt.z);
        uvs.push(f / 4, endIdx === startIndex ? 0 : 1);
        vertCursor++;
      }
      if (endIdx === startIndex) {
        indices.push(capBase, capBase + 1, capBase + 2, capBase, capBase + 2, capBase + 3);
      } else {
        indices.push(capBase, capBase + 2, capBase + 1, capBase, capBase + 3, capBase + 2);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds the lightweight open-air stadium around the 240x240 grass field:
 * - Open concourse plaza outside the grass square (no seats, no spectators)
 * - Curved outer architectural facade with wide cardinal open concourse portals
 * - Swept cantilevered stadium roof canopy with radial structural trusses
 * - Instanced inner & outer support columns and exterior architectural fins
 * - 4 corner LED floodlight towers rising outside the stadium corners
 */
export function buildStadiumArchitecture(textures: ProceduralTextureSet): StadiumBuildResult {
  const group = new THREE.Group();
  group.name = 'OPEN_AIR_STADIUM';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // Shared PBR architectural materials
  const concourseMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.concourseColor,
    roughness: 0.88,
    metalness: 0.02,
  });
  const podiumSkirtMat = new THREE.MeshStandardMaterial({
    color: 0x677282,
    roughness: 0.86,
    metalness: 0.08,
  });
  const walkwayBandMat = new THREE.MeshStandardMaterial({
    color: 0x8994a4,
    roughness: 0.82,
    metalness: 0.06,
  });
  const facadeWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xe6ecf2,
    roughness: 0.5,
    metalness: 0.08,
  });
  const columnMat = new THREE.MeshStandardMaterial({
    color: 0xcbd4df,
    roughness: 0.44,
    metalness: 0.16,
  });
  const structuralSteelMat = new THREE.MeshStandardMaterial({
    color: 0x354050,
    roughness: 0.46,
    metalness: 0.56,
  });
  const canopyRoofMat = new THREE.MeshStandardMaterial({
    color: 0xf8fbff,
    roughness: 0.44,
    metalness: 0.06,
  });
  const canopyRibMat = new THREE.MeshStandardMaterial({
    color: 0x7b8798,
    roughness: 0.52,
    metalness: 0.35,
  });
  const accentTrimMat = new THREE.MeshStandardMaterial({
    color: 0xe04637,
    roughness: 0.45,
    metalness: 0.12,
  });
  const floodlightFaceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.floodlightBank,
    emissive: new THREE.Color(0xfff5d8),
    emissiveMap: textures.floodlightBank,
    emissiveIntensity: 0.48,
    roughness: 0.25,
    metalness: 0.1,
  });

  materials.push(
    concourseMat,
    podiumSkirtMat,
    walkwayBandMat,
    facadeWhiteMat,
    columnMat,
    structuralSteelMat,
    canopyRoofMat,
    canopyRibMat,
    accentTrimMat,
    floodlightFaceMat,
  );

  // 1. Open concourse plaza deck outside grass field + outer stadium podium skirt
  const concourseY = -0.35;
  const skirtBottomY = -(FIELD_THICKNESS + 0.55);
  const { deckGeo, skirtGeo } = buildConcourseDeckAndSkirt(concourseY, skirtBottomY);
  geometries.push(deckGeo, skirtGeo);

  const deckMesh = new THREE.Mesh(deckGeo, concourseMat);
  deckMesh.receiveShadow = true;
  group.add(deckMesh);

  const skirtMesh = new THREE.Mesh(skirtGeo, podiumSkirtMat);
  skirtMesh.receiveShadow = true;
  group.add(skirtMesh);

  // Architectural concourse colonnade promenade strip beneath the roof canopy
  const walkwayBandGeo = buildClosedCurvedProfileGeo([
    [152, concourseY - 0.01],
    [152, concourseY + 0.12],
    [183, concourseY + 0.12],
    [183, concourseY - 0.01],
  ]);
  geometries.push(walkwayBandGeo);
  const walkwayBandMesh = new THREE.Mesh(walkwayBandGeo, walkwayBandMat);
  walkwayBandMesh.receiveShadow = true;
  group.add(walkwayBandMesh);

  // 2. Curved lower outer concourse parapet walls (open portals centered at N, S, E, W cardinals)
  const cornerArcs: Array<[number, number]> = [
    [4, 20],
    [28, 44],
    [52, 68],
    [76, 92],
  ];
  for (const [startIdx, endIdx] of cornerArcs) {
    const lowWallGeo = buildClosedCurvedProfileGeo(
      [
        [STADIUM_FACADE_RADIUS - 1.5, concourseY],
        [STADIUM_FACADE_RADIUS - 1.5, 2.5],
        [STADIUM_FACADE_RADIUS + 1.5, 2.5],
        [STADIUM_FACADE_RADIUS + 1.5, concourseY],
      ],
      startIdx,
      endIdx,
      false,
    );
    const lowCapGeo = buildClosedCurvedProfileGeo(
      [
        [STADIUM_FACADE_RADIUS - 1.75, 2.5],
        [STADIUM_FACADE_RADIUS - 1.75, 2.95],
        [STADIUM_FACADE_RADIUS + 1.75, 2.95],
        [STADIUM_FACADE_RADIUS + 1.75, 2.5],
      ],
      startIdx,
      endIdx,
      false,
    );
    geometries.push(lowWallGeo, lowCapGeo);

    const lowWallMesh = new THREE.Mesh(lowWallGeo, facadeWhiteMat);
    lowWallMesh.castShadow = true;
    lowWallMesh.receiveShadow = true;
    const lowCapMesh = new THREE.Mesh(lowCapGeo, structuralSteelMat);
    lowCapMesh.castShadow = true;
    lowCapMesh.receiveShadow = true;
    group.add(lowWallMesh, lowCapMesh);
  }

  // 3. Curved upper stadium facade ribbon (continuous 360° above open ground concourses)
  const upperFacadeGeo = buildClosedCurvedProfileGeo([
    [STADIUM_FACADE_RADIUS - 1.3, 10.2],
    [STADIUM_FACADE_RADIUS - 1.3, 15.1],
    [STADIUM_FACADE_RADIUS + 1.8, 15.1],
    [STADIUM_FACADE_RADIUS + 1.8, 10.2],
  ]);
  const upperTrimGeo = buildClosedCurvedProfileGeo([
    [STADIUM_FACADE_RADIUS - 1.5, 9.4],
    [STADIUM_FACADE_RADIUS - 1.5, 10.2],
    [STADIUM_FACADE_RADIUS + 2.0, 10.2],
    [STADIUM_FACADE_RADIUS + 2.0, 9.4],
  ]);
  geometries.push(upperFacadeGeo, upperTrimGeo);

  const upperFacadeMesh = new THREE.Mesh(upperFacadeGeo, facadeWhiteMat);
  upperFacadeMesh.castShadow = true;
  upperFacadeMesh.receiveShadow = true;
  const upperTrimMesh = new THREE.Mesh(upperTrimGeo, structuralSteelMat);
  upperTrimMesh.castShadow = true;
  group.add(upperTrimMesh, upperFacadeMesh);

  // 4. Swept cantilevered roof canopy ring + inner/outer dark fascia + racing-red accent stripe
  const canopyShellGeo = buildClosedCurvedProfileGeo([
    [STADIUM_CANOPY_INNER, 16.5],
    [STADIUM_CANOPY_INNER, 17.25],
    [STADIUM_CANOPY_OUTER, 15.15],
    [STADIUM_CANOPY_OUTER, 14.4],
  ]);
  const canopyInnerFasciaGeo = buildClosedCurvedProfileGeo([
    [STADIUM_CANOPY_INNER - 0.65, 16.35],
    [STADIUM_CANOPY_INNER - 0.65, 17.35],
    [STADIUM_CANOPY_INNER + 0.25, 17.35],
    [STADIUM_CANOPY_INNER + 0.25, 16.35],
  ]);
  const canopyOuterFasciaGeo = buildClosedCurvedProfileGeo([
    [STADIUM_CANOPY_OUTER - 0.25, 14.35],
    [STADIUM_CANOPY_OUTER - 0.25, 15.25],
    [STADIUM_CANOPY_OUTER + 0.45, 15.25],
    [STADIUM_CANOPY_OUTER + 0.45, 14.35],
  ]);
  const canopyAccentBandGeo = buildClosedCurvedProfileGeo([
    [STADIUM_CANOPY_INNER - 0.75, 16.7],
    [STADIUM_CANOPY_INNER - 0.75, 17.08],
    [STADIUM_CANOPY_INNER - 0.58, 17.08],
    [STADIUM_CANOPY_INNER - 0.58, 16.7],
  ]);
  geometries.push(
    canopyShellGeo,
    canopyInnerFasciaGeo,
    canopyOuterFasciaGeo,
    canopyAccentBandGeo,
  );

  const canopyShellMesh = new THREE.Mesh(canopyShellGeo, canopyRoofMat);
  canopyShellMesh.castShadow = true;
  canopyShellMesh.receiveShadow = true;
  const canopyFasciaMesh = new THREE.Mesh(canopyInnerFasciaGeo, structuralSteelMat);
  canopyFasciaMesh.castShadow = true;
  const canopyOuterFasciaMesh = new THREE.Mesh(canopyOuterFasciaGeo, structuralSteelMat);
  canopyOuterFasciaMesh.castShadow = true;
  const canopyAccentMesh = new THREE.Mesh(canopyAccentBandGeo, accentTrimMat);
  group.add(canopyShellMesh, canopyFasciaMesh, canopyOuterFasciaMesh, canopyAccentMesh);

  // 5. Instanced structural support columns, plinth collars, radial canopy trusses/top ribs, and facade fins
  const bayCount = RING_SEGMENTS / 2; // 48 structural bays around the stadium

  const outerColHeight = 15.0 - concourseY;
  const outerColGeo = new THREE.CylinderGeometry(0.78, 0.96, outerColHeight, 12);
  const innerColHeight = 16.45 - concourseY;
  const innerColGeo = new THREE.CylinderGeometry(0.58, 0.72, innerColHeight, 12);
  const colPlinthGeo = new THREE.CylinderGeometry(1.12, 1.28, 0.85, 12);
  const trussLen = STADIUM_CANOPY_OUTER - STADIUM_CANOPY_INNER + 1.2;
  const trussBeamGeo = new THREE.BoxGeometry(trussLen, 0.58, 0.62);
  const roofRibGeo = new THREE.BoxGeometry(trussLen - 0.6, 0.35, 0.45);
  const facadeFinGeo = new THREE.BoxGeometry(1.35, 6.0, 0.7);

  geometries.push(
    outerColGeo,
    innerColGeo,
    colPlinthGeo,
    trussBeamGeo,
    roofRibGeo,
    facadeFinGeo,
  );

  const outerColInst = new THREE.InstancedMesh(outerColGeo, columnMat, bayCount);
  const innerColInst = new THREE.InstancedMesh(innerColGeo, columnMat, bayCount);
  const plinthInst = new THREE.InstancedMesh(colPlinthGeo, structuralSteelMat, bayCount * 2);
  const trussInst = new THREE.InstancedMesh(trussBeamGeo, structuralSteelMat, bayCount);
  const roofRibInst = new THREE.InstancedMesh(roofRibGeo, canopyRibMat, bayCount);
  const finInst = new THREE.InstancedMesh(facadeFinGeo, structuralSteelMat, RING_SEGMENTS);

  outerColInst.castShadow = true;
  outerColInst.receiveShadow = true;
  innerColInst.castShadow = true;
  innerColInst.receiveShadow = true;
  trussInst.castShadow = true;
  finInst.castShadow = true;

  const dummy = new THREE.Object3D();
  const innerColRadius = STADIUM_CANOPY_INNER + 4.8;
  const outerColRadius = STADIUM_FACADE_RADIUS - 2.4;
  const canopySlopeAngle = Math.atan2(16.5 - 14.4, STADIUM_CANOPY_OUTER - STADIUM_CANOPY_INNER);

  for (let b = 0; b < bayCount; b++) {
    const idx = b * 2;
    const theta = (idx / RING_SEGMENTS) * Math.PI * 2;
    const pNext = evaluateStadiumPoint(theta + 0.02, outerColRadius);
    const pPrev = evaluateStadiumPoint(theta - 0.02, outerColRadius);
    const tanX = pNext.x - pPrev.x;
    const tanZ = pNext.z - pPrev.z;
    const radialOutYaw = Math.atan2(tanX, tanZ);

    // Outer structural column
    const pOuter = evaluateStadiumPoint(theta, outerColRadius);
    dummy.position.set(pOuter.x, concourseY + outerColHeight * 0.5, pOuter.z);
    dummy.rotation.set(0, radialOutYaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    outerColInst.setMatrixAt(b, dummy.matrix);

    dummy.position.set(pOuter.x, concourseY + 0.42, pOuter.z);
    dummy.updateMatrix();
    plinthInst.setMatrixAt(b * 2, dummy.matrix);

    // Inner concourse canopy column
    const pInner = evaluateStadiumPoint(theta, innerColRadius);
    dummy.position.set(pInner.x, concourseY + innerColHeight * 0.5, pInner.z);
    dummy.updateMatrix();
    innerColInst.setMatrixAt(b, dummy.matrix);

    dummy.position.set(pInner.x, concourseY + 0.42, pInner.z);
    dummy.scale.set(0.84, 1, 0.84);
    dummy.updateMatrix();
    plinthInst.setMatrixAt(b * 2 + 1, dummy.matrix);

    // Radial cantilever roof truss beam underneath + top roof rib seam
    const rMid = (STADIUM_CANOPY_INNER + STADIUM_CANOPY_OUTER) * 0.5;
    const pMid = evaluateStadiumPoint(theta, rMid);
    dummy.position.set(pMid.x, 15.35, pMid.z);
    dummy.rotation.set(0, radialOutYaw, -canopySlopeAngle);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trussInst.setMatrixAt(b, dummy.matrix);

    dummy.position.set(pMid.x, 16.28, pMid.z);
    dummy.updateMatrix();
    roofRibInst.setMatrixAt(b, dummy.matrix);
  }

  for (let i = 0; i < RING_SEGMENTS; i++) {
    const theta = (i / RING_SEGMENTS) * Math.PI * 2;
    const pNext = evaluateStadiumPoint(theta + 0.02, STADIUM_FACADE_RADIUS);
    const pPrev = evaluateStadiumPoint(theta - 0.02, STADIUM_FACADE_RADIUS);
    const finYaw = Math.atan2(pNext.x - pPrev.x, pNext.z - pPrev.z);
    const pFin = evaluateStadiumPoint(theta, STADIUM_FACADE_RADIUS + 1.85);

    dummy.position.set(pFin.x, 12.3, pFin.z);
    dummy.rotation.set(0, finYaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    finInst.setMatrixAt(i, dummy.matrix);
  }

  outerColInst.instanceMatrix.needsUpdate = true;
  innerColInst.instanceMatrix.needsUpdate = true;
  plinthInst.instanceMatrix.needsUpdate = true;
  trussInst.instanceMatrix.needsUpdate = true;
  roofRibInst.instanceMatrix.needsUpdate = true;
  finInst.instanceMatrix.needsUpdate = true;

  group.add(outerColInst, innerColInst, plinthInst, trussInst, roofRibInst, finInst);

  // 6. Four corner floodlight towers outside the curved stadium corners
  const towerBaseGeo = new THREE.BoxGeometry(6.4, 3.2, 6.4);
  const towerMastHeight = STADIUM_TOWER_HEIGHT - 7.0;
  const towerMastGeo = new THREE.CylinderGeometry(0.75, 1.35, towerMastHeight, 12);
  const towerNeckGeo = new THREE.BoxGeometry(1.45, 1.3, 7.2);
  const towerCrossBarGeo = new THREE.BoxGeometry(14.5, 0.95, 1.05);
  const floodHousingGeo = new THREE.BoxGeometry(14.0, 5.4, 1.15);
  const floodFaceGeo = new THREE.PlaneGeometry(13.2, 4.75);

  geometries.push(
    towerBaseGeo,
    towerMastGeo,
    towerNeckGeo,
    towerCrossBarGeo,
    floodHousingGeo,
    floodFaceGeo,
  );

  const cornerAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
  for (let c = 0; c < cornerAngles.length; c++) {
    const theta = cornerAngles[c];
    const pos = evaluateStadiumPoint(theta, STADIUM_TOWER_RADIUS);

    const tower = new THREE.Group();
    tower.name = `FLOODLIGHT_TOWER_${c + 1}`;
    tower.position.set(pos.x, concourseY, pos.z);
    tower.rotation.y = Math.atan2(-pos.x, -pos.z);

    const basePlinth = new THREE.Mesh(towerBaseGeo, podiumSkirtMat);
    basePlinth.position.set(0, 1.6, 0);
    basePlinth.castShadow = true;
    basePlinth.receiveShadow = true;
    tower.add(basePlinth);

    const mast = new THREE.Mesh(towerMastGeo, structuralSteelMat);
    mast.position.set(0, 3.2 + towerMastHeight * 0.5, 0);
    mast.castShadow = true;
    tower.add(mast);

    const neck = new THREE.Mesh(towerNeckGeo, structuralSteelMat);
    neck.position.set(0, STADIUM_TOWER_HEIGHT - 4.0, 2.8);
    neck.rotation.x = -0.22;
    neck.castShadow = true;
    tower.add(neck);

    const headMount = new THREE.Group();
    headMount.position.set(0, STADIUM_TOWER_HEIGHT - 2.8, 6.2);
    headMount.rotation.x = 0.52;

    const crossBar = new THREE.Mesh(towerCrossBarGeo, structuralSteelMat);
    crossBar.position.set(0, 0, -0.6);
    crossBar.castShadow = true;
    headMount.add(crossBar);

    const housing = new THREE.Mesh(floodHousingGeo, structuralSteelMat);
    housing.castShadow = true;
    headMount.add(housing);

    const lampFace = new THREE.Mesh(floodFaceGeo, floodlightFaceMat);
    lampFace.position.set(0, 0, 0.6);
    headMount.add(lampFace);

    tower.add(headMount);
    group.add(tower);
  }

  return {
    group,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
