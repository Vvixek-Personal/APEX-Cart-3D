import * as THREE from 'three';
import {
  BANNER_CLEAR_HEIGHT,
  BANNER_POST_OFFSET,
  BannerPlacement,
} from '../track/trackLayout';
import { ProceduralTextureSet } from './textures';

export interface BannerBuildResult {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Builds both the START banner (at the starting grid) and FINISH banner (at the finish line)
 * as clean composite multi-part overhead track gantries with bottom-center pivots flush on y=0.
 */
export function buildTrackBanners(
  placements: { start: BannerPlacement; finish: BannerPlacement },
  textures: ProceduralTextureSet,
): BannerBuildResult {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // Shared PBR materials across both gantries
  const postMat = new THREE.MeshStandardMaterial({
    color: 0xe2e7ee,
    roughness: 0.28,
    metalness: 0.76,
  });
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x363d47,
    roughness: 0.72,
    metalness: 0.22,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x262c35,
    roughness: 0.48,
    metalness: 0.35,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xd9e0e8,
    roughness: 0.24,
    metalness: 0.82,
  });
  const shadowDiscMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.36,
  });
  materials.push(postMat, baseMat, frameMat, trimMat, shadowDiscMat);

  // Shared geometries scaled to span the widened track cleanly
  const postHeight = BANNER_CLEAR_HEIGHT + 0.45;
  const spanWidth = BANNER_POST_OFFSET * 2;
  const signWidth = 15.6;
  const signHeight = 3.8;
  const housingDepth = 0.52;

  const shadowDiscGeo = new THREE.CircleGeometry(1.45, 24);
  shadowDiscGeo.rotateX(-Math.PI / 2);

  const basePlinthGeo = new THREE.CylinderGeometry(0.5, 0.62, 0.34, 16);
  const postGeo = new THREE.CylinderGeometry(0.26, 0.32, postHeight, 16);
  const collarGeo = new THREE.CylinderGeometry(0.4, 0.34, 0.38, 16);
  const crossBeamGeo = new THREE.BoxGeometry(spanWidth + 0.8, 0.36, 0.36);
  const housingGeo = new THREE.BoxGeometry(signWidth + 0.36, signHeight + 0.24, housingDepth);
  const topCapGeo = new THREE.BoxGeometry(signWidth + 0.56, 0.16, housingDepth + 0.08);
  const signFaceGeo = new THREE.PlaneGeometry(signWidth, signHeight);

  geometries.push(
    shadowDiscGeo,
    basePlinthGeo,
    postGeo,
    collarGeo,
    crossBeamGeo,
    housingGeo,
    topCapGeo,
    signFaceGeo,
  );

  const buildOne = (placement: BannerPlacement, signTexture: THREE.CanvasTexture) => {
    const gantry = new THREE.Group();
    gantry.name = `${placement.id}_BANNER`;
    gantry.position.set(placement.position.x, 0, placement.position.z);
    gantry.rotation.y = Math.atan2(placement.tangent.x, placement.tangent.z);

    const signMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: signTexture,
      roughness: 0.42,
      metalness: 0.04,
    });
    materials.push(signMat);

    for (const side of [-1, 1]) {
      const px = side * BANNER_POST_OFFSET;

      const contactShadow = new THREE.Mesh(shadowDiscGeo, shadowDiscMat);
      contactShadow.position.set(px, 0.015, 0);
      gantry.add(contactShadow);

      const basePlinth = new THREE.Mesh(basePlinthGeo, baseMat);
      basePlinth.position.set(px, 0.12, 0);
      basePlinth.castShadow = true;
      basePlinth.receiveShadow = true;
      gantry.add(basePlinth);

      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, 0.24 + postHeight * 0.5, 0);
      post.castShadow = true;
      post.receiveShadow = true;
      gantry.add(post);

      const collar = new THREE.Mesh(collarGeo, trimMat);
      collar.position.set(px, postHeight + 0.24, 0);
      collar.castShadow = true;
      gantry.add(collar);
    }

    const beamY = postHeight + 0.24;
    const crossBeam = new THREE.Mesh(crossBeamGeo, postMat);
    crossBeam.position.set(0, beamY, 0);
    crossBeam.castShadow = true;
    crossBeam.receiveShadow = true;
    gantry.add(crossBeam);

    // Mount signboard housing cleanly on top of the crossbeam with deeper Z than the beam
    const signCenterY = beamY + 0.13 + (signHeight + 0.18) * 0.5;
    const housing = new THREE.Mesh(housingGeo, frameMat);
    housing.position.set(0, signCenterY, 0);
    housing.castShadow = true;
    housing.receiveShadow = true;
    gantry.add(housing);

    const topCap = new THREE.Mesh(topCapGeo, trimMat);
    topCap.position.set(0, signCenterY + (signHeight + 0.18) * 0.5 + 0.06, 0);
    topCap.castShadow = true;
    gantry.add(topCap);

    // Double-sided readable sign plates clear of the housing & beam
    const faceZ = housingDepth * 0.5 + 0.01;
    const frontFace = new THREE.Mesh(signFaceGeo, signMat);
    frontFace.position.set(0, signCenterY, faceZ);
    gantry.add(frontFace);

    const backFace = new THREE.Mesh(signFaceGeo, signMat);
    backFace.position.set(0, signCenterY, -faceZ);
    backFace.rotation.y = Math.PI;
    gantry.add(backFace);

    root.add(gantry);
  };

  buildOne(placements.start, textures.startBanner);
  buildOne(placements.finish, textures.finishBanner);

  return {
    group: root,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
