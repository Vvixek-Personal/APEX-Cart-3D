import * as THREE from 'three';
import {
  BannerPlacement,
  FIELD_SIZE,
  FIELD_THICKNESS,
  TRACK_HALF,
  TRACK_MARGIN_INSET,
  TrackFrame,
} from '../track/trackLayout';
import { ProceduralTextureSet } from './textures';

/**
 * Builds a closed flat ribbon BufferGeometry along the sampled track frames.
 */
function buildClosedRibbonGeometry(
  frames: TrackFrame[],
  innerOffset: number,
  outerOffset: number,
  y: number,
  uvRepeatLength: number,
): THREE.BufferGeometry {
  const n = frames.length;
  const totalLen = frames[n - 1].arcLength + frames[n - 1].position.distanceTo(frames[0].position);

  const positions = new Float32Array((n + 1) * 2 * 3);
  const normals = new Float32Array((n + 1) * 2 * 3);
  const uvs = new Float32Array((n + 1) * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i <= n; i++) {
    const f = frames[i % n];
    const arc = i === n ? totalLen : f.arcLength;
    const vCoord = arc / uvRepeatLength;

    const lx = f.position.x + f.normal.x * innerOffset;
    const lz = f.position.z + f.normal.z * innerOffset;
    const rx = f.position.x + f.normal.x * outerOffset;
    const rz = f.position.z + f.normal.z * outerOffset;

    const base = i * 2;
    positions[base * 3] = lx;
    positions[base * 3 + 1] = y;
    positions[base * 3 + 2] = lz;

    positions[(base + 1) * 3] = rx;
    positions[(base + 1) * 3 + 1] = y;
    positions[(base + 1) * 3 + 2] = rz;

    normals[base * 3] = 0;
    normals[base * 3 + 1] = 1;
    normals[base * 3 + 2] = 0;

    normals[(base + 1) * 3] = 0;
    normals[(base + 1) * 3 + 1] = 1;
    normals[(base + 1) * 3 + 2] = 0;

    uvs[base * 2] = 0;
    uvs[base * 2 + 1] = vCoord;
    uvs[(base + 1) * 2] = 1;
    uvs[(base + 1) * 2 + 1] = vCoord;

    if (i < n) {
      const a = base;
      const b = base + 1;
      const c = base + 2;
      const d = base + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds FIA red-and-white corner kerbs along track sections with significant curvature,
 * keeping straightaways (including START/FINISH straight and South Gate entry) clean.
 */
function buildCornerKerbGeometry(
  frames: TrackFrame[],
  y: number,
  uvRepeatLength: number,
): THREE.BufferGeometry | null {
  const n = frames.length;
  if (n < 16) return null;

  const rawTurn = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const prev = frames[(i - 3 + n) % n];
    const next = frames[(i + 3) % n];
    // 2D cross product in XZ indicates signed curvature
    rawTurn[i] = prev.tangent.x * next.tangent.z - prev.tangent.z * next.tangent.x;
  }

  const posList: number[] = [];
  const normList: number[] = [];
  const uvList: number[] = [];
  const idxList: number[] = [];
  let vertCount = 0;

  const kerbWidth = 1.25;
  const threshold = 0.14;

  for (const side of [-1, 1] as const) {
    const innerOff = side < 0 ? -(TRACK_HALF + 0.35) : TRACK_HALF - kerbWidth + 0.35;
    const outerOff = side < 0 ? -(TRACK_HALF - kerbWidth + 0.35) : TRACK_HALF + 0.35;

    for (let i = 0; i < n; i++) {
      const fA = frames[i];
      // Keep South Gate spur junction around x ~ 0, z ~ 92 free on outer (+Z) edge
      if (Math.abs(fA.position.x) < 15.5 && fA.position.z > 84) {
        continue;
      }

      const curv = Math.abs(rawTurn[i]);
      if (curv < threshold) continue;

      const fB = frames[(i + 1) % n];
      const segLen = fA.position.distanceTo(fB.position);
      const v0 = fA.arcLength / uvRepeatLength;
      const v1 = (fA.arcLength + segLen) / uvRepeatLength;

      const axL = fA.position.x + fA.normal.x * innerOff;
      const azL = fA.position.z + fA.normal.z * innerOff;
      const axR = fA.position.x + fA.normal.x * outerOff;
      const azR = fA.position.z + fA.normal.z * outerOff;

      const bxL = fB.position.x + fB.normal.x * innerOff;
      const bzL = fB.position.z + fB.normal.z * innerOff;
      const bxR = fB.position.x + fB.normal.x * outerOff;
      const bzR = fB.position.z + fB.normal.z * outerOff;

      posList.push(
        axL, y, azL,
        axR, y, azR,
        bxL, y, bzL,
        bxR, y, bzR,
      );
      normList.push(
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
      );
      uvList.push(
        0, v0,
        1, v0,
        0, v1,
        1, v1,
      );
      idxList.push(
        vertCount, vertCount + 1, vertCount + 2,
        vertCount + 1, vertCount + 3, vertCount + 2,
      );
      vertCount += 4;
    }
  }

  if (vertCount === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posList, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normList, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvList, 2));
  geo.setIndex(idxList);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds crisp painted directional chevron arrows on the asphalt (especially at the
 * South Gate junction so arriving drivers immediately see the clockwise circuit flow).
 */
function createChevronGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // Chevron pointing toward local +Z (forward along track tangent)
  shape.moveTo(0, 1.55);
  shape.lineTo(1.75, -0.45);
  shape.lineTo(1.75, -1.35);
  shape.lineTo(0, 0.55);
  shape.lineTo(-1.75, -1.35);
  shape.lineTo(-1.75, -0.45);
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape);
  // Rotate ShapeGeometry (XY, +Y up) onto XZ (+Z forward, +Y normal)
  geo.rotateX(Math.PI / 2);
  // Flip winding so +Y is front face: scale Y or reverse index
  const idx = geo.getIndex();
  if (idx) {
    const arr = idx.array as Uint16Array;
    for (let i = 0; i < arr.length; i += 3) {
      const tmp = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = tmp;
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export interface TrackEnvironmentBuild {
  group: THREE.Group;
  dispose: () => void;
}

export function buildTrackEnvironment(
  frames: TrackFrame[],
  banners: { start: BannerPlacement; finish: BannerPlacement },
  textures: ProceduralTextureSet,
): TrackEnvironmentBuild {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // 1. Flat square bright green grass field (240 x 240)
  const grassGeo = new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE, 1, 1);
  grassGeo.rotateX(-Math.PI / 2);
  geometries.push(grassGeo);

  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.grassColor,
    roughnessMap: textures.grassRoughness,
    roughness: 0.92,
    metalness: 0.0,
  });
  materials.push(grassMat);

  const grassMesh = new THREE.Mesh(grassGeo, grassMat);
  grassMesh.position.y = 0;
  grassMesh.receiveShadow = true;
  grassMesh.castShadow = false;
  group.add(grassMesh);

  // Subtle turf rim & clean earth plinth underneath so the square field reads cleanly
  const turfLipHeight = 0.52;
  const turfLipGeo = new THREE.BoxGeometry(FIELD_SIZE + 0.3, turfLipHeight, FIELD_SIZE + 0.3);
  geometries.push(turfLipGeo);
  const turfLipMat = new THREE.MeshStandardMaterial({
    color: 0x45a938,
    roughness: 0.9,
    metalness: 0.0,
  });
  materials.push(turfLipMat);
  const turfLipMesh = new THREE.Mesh(turfLipGeo, turfLipMat);
  turfLipMesh.position.y = -turfLipHeight / 2 - 0.01;
  turfLipMesh.receiveShadow = true;
  group.add(turfLipMesh);

  const earthHeight = FIELD_THICKNESS - turfLipHeight;
  const earthGeo = new THREE.BoxGeometry(FIELD_SIZE - 0.3, earthHeight, FIELD_SIZE - 0.3);
  geometries.push(earthGeo);
  const earthMat = new THREE.MeshStandardMaterial({
    color: 0x8a6d4b,
    roughness: 0.95,
    metalness: 0.0,
  });
  materials.push(earthMat);
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthMesh.position.y = -turfLipHeight - earthHeight / 2 - 0.01;
  group.add(earthMesh);

  // 2. Subtle shoulder apron beneath the asphalt so road edges meet grass cleanly
  const apronGeo = buildClosedRibbonGeometry(
    frames,
    -(TRACK_HALF + 0.4),
    TRACK_HALF + 0.4,
    0.03,
    16.0,
  );
  geometries.push(apronGeo);
  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x2c323a,
    roughness: 0.95,
    metalness: 0.0,
  });
  materials.push(apronMat);
  const apronMesh = new THREE.Mesh(apronGeo, apronMat);
  apronMesh.receiveShadow = true;
  group.add(apronMesh);

  // 3. Main continuous wide asphalt track surface
  const asphaltGeo = buildClosedRibbonGeometry(frames, -TRACK_HALF, TRACK_HALF, 0.07, 16.0);
  geometries.push(asphaltGeo);
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.asphaltColor,
    roughnessMap: textures.asphaltRoughness,
    roughness: 0.85,
    metalness: 0.02,
  });
  materials.push(asphaltMat);
  const asphaltMesh = new THREE.Mesh(asphaltGeo, asphaltMat);
  asphaltMesh.receiveShadow = true;
  group.add(asphaltMesh);

  // 3b. Red-and-white FIA racing kerbs along corners
  const kerbGeo = buildCornerKerbGeometry(frames, 0.095, 3.6);
  if (kerbGeo) {
    geometries.push(kerbGeo);
    const kerbMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.kerbStripe,
      roughness: 0.72,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    materials.push(kerbMat);
    const kerbMesh = new THREE.Mesh(kerbGeo, kerbMat);
    kerbMesh.receiveShadow = true;
    group.add(kerbMesh);
  }

  // 4. Subtle painted edge lines along left and right edges of the track
  const lineWidth = 0.46;
  const leftEdgeOffset = -(TRACK_HALF - TRACK_MARGIN_INSET);
  const rightEdgeOffset = TRACK_HALF - TRACK_MARGIN_INSET;

  const leftLineGeo = buildClosedRibbonGeometry(
    frames,
    leftEdgeOffset - lineWidth * 0.5,
    leftEdgeOffset + lineWidth * 0.5,
    0.11,
    16.0,
  );
  const rightLineGeo = buildClosedRibbonGeometry(
    frames,
    rightEdgeOffset - lineWidth * 0.5,
    rightEdgeOffset + lineWidth * 0.5,
    0.11,
    16.0,
  );
  geometries.push(leftLineGeo, rightLineGeo);

  const edgeLineMat = new THREE.MeshStandardMaterial({
    color: 0xe9edf2,
    roughness: 0.72,
    metalness: 0.0,
    transparent: true,
    opacity: 0.86,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  materials.push(edgeLineMat);

  const leftLineMesh = new THREE.Mesh(leftLineGeo, edgeLineMat);
  const rightLineMesh = new THREE.Mesh(rightLineGeo, edgeLineMat);
  leftLineMesh.receiveShadow = true;
  rightLineMesh.receiveShadow = true;
  group.add(leftLineMesh, rightLineMesh);

  // 4b. Painted track-direction chevrons (clustered at South Gate entry u=0.13..0.16 + circuit straights)
  if (frames.length > 0) {
    const chevronGeo = createChevronGeometry();
    geometries.push(chevronGeo);
    const chevronMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    materials.push(chevronMat);

    const chevronUs = [0.132, 0.142, 0.152, 0.34, 0.58, 0.82];
    const chevronInst = new THREE.InstancedMesh(chevronGeo, chevronMat, chevronUs.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < chevronUs.length; i++) {
      const f = frames[Math.floor(chevronUs[i] * frames.length) % frames.length];
      dummy.position.set(f.position.x, 0.122, f.position.z);
      dummy.rotation.set(0, Math.atan2(f.tangent.x, f.tangent.z), 0);
      dummy.scale.setScalar(i < 3 ? 1.15 : 0.95);
      dummy.updateMatrix();
      chevronInst.setMatrixAt(i, dummy.matrix);
    }
    chevronInst.instanceMatrix.needsUpdate = true;
    group.add(chevronInst);
  }

  // 5. Subtle painted starting grid at START banner
  const startGridLength = 16.0;
  const startGridGeo = new THREE.PlaneGeometry(TRACK_HALF * 2 - 2.8, startGridLength);
  startGridGeo.rotateX(-Math.PI / 2);
  geometries.push(startGridGeo);

  const startGridMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.startGrid,
    transparent: true,
    depthWrite: false,
    roughness: 0.76,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  materials.push(startGridMat);

  const startGridMesh = new THREE.Mesh(startGridGeo, startGridMat);
  startGridMesh.position
    .copy(banners.start.position)
    .addScaledVector(banners.start.tangent, -(startGridLength * 0.5 - 0.8));
  startGridMesh.position.y = 0.125;
  startGridMesh.rotation.y = Math.atan2(banners.start.tangent.x, banners.start.tangent.z);
  startGridMesh.receiveShadow = true;
  group.add(startGridMesh);

  // 6. Subtle painted checkered finish strip directly beneath FINISH banner
  const finishStripGeo = new THREE.PlaneGeometry(TRACK_HALF * 2 - 1.6, 3.8);
  finishStripGeo.rotateX(-Math.PI / 2);
  geometries.push(finishStripGeo);

  const finishStripMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.finishStrip,
    roughness: 0.76,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  materials.push(finishStripMat);

  const finishStripMesh = new THREE.Mesh(finishStripGeo, finishStripMat);
  finishStripMesh.position.copy(banners.finish.position);
  finishStripMesh.position.y = 0.13;
  finishStripMesh.rotation.y = Math.atan2(banners.finish.tangent.x, banners.finish.tangent.z);
  finishStripMesh.receiveShadow = true;
  group.add(finishStripMesh);

  return {
    group,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
