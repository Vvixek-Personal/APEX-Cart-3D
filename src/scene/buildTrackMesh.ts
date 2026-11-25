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
      // normal = (-tangent.z, 0, tangent.x) points left of +tangent in right-handed XZ;
      // winding (a, b, c) and (b, d, c) yields upward +Y normals.
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
  // Extend behind the START line along -tangent
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
