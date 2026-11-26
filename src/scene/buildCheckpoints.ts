import * as THREE from 'three';
import type { CheckpointDef } from '../game/raceRules';
import { TRACK_HALF } from '../track/trackLayout';

export interface CheckpointsBuildResult {
  group: THREE.Group;
  updateActiveCheckpoint: (activeIndex: number, isRacing: boolean, timeSeconds: number) => void;
  dispose: () => void;
}

/**
 * Builds sleek motorsport sector bollards along both edges of each race checkpoint,
 * plus an animated ground chevron / beacon ring highlighting the next active checkpoint.
 */
export function buildCheckpointMarkers(
  checkpoints: ReadonlyArray<CheckpointDef>,
): CheckpointsBuildResult {
  const group = new THREE.Group();
  group.name = 'RACE_CHECKPOINTS';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const postBaseGeo = new THREE.CylinderGeometry(0.32, 0.4, 0.24, 12);
  const postBodyGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.9, 12);
  const beaconCapGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.45, 12);
  const gateStripeGeo = new THREE.PlaneGeometry(TRACK_HALF * 2 - 2.2, 0.75);
  gateStripeGeo.rotateX(-Math.PI / 2);

  geometries.push(postBaseGeo, postBodyGeo, beaconCapGeo, gateStripeGeo);

  const baseDarkMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.7,
    metalness: 0.3,
  });
  const bodyWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.45,
    metalness: 0.1,
  });
  materials.push(baseDarkMat, bodyWhiteMat);

  const offset = TRACK_HALF + 0.95;
  const capMats: THREE.MeshStandardMaterial[] = [];
  const stripeMats: THREE.MeshBasicMaterial[] = [];
  const capPairs: Array<[THREE.Mesh, THREE.Mesh]> = [];

  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    const cpGroup = new THREE.Group();
    cpGroup.position.set(cp.position.x, 0, cp.position.z);
    cpGroup.rotation.y = Math.atan2(cp.tangent.x, cp.tangent.z);

    const capMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
      roughness: 0.25,
    });
    const stripeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    materials.push(capMat, stripeMat);
    capMats.push(capMat);
    stripeMats.push(stripeMat);

    const caps: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const px = side * offset;
      const base = new THREE.Mesh(postBaseGeo, baseDarkMat);
      base.position.set(px, 0.12, 0);
      base.castShadow = true;

      const body = new THREE.Mesh(postBodyGeo, bodyWhiteMat);
      body.position.set(px, 1.15, 0);
      body.castShadow = true;

      const cap = new THREE.Mesh(beaconCapGeo, capMat);
      cap.position.set(px, 2.28, 0);
      caps.push(cap);

      cpGroup.add(base, body, cap);
    }
    capPairs.push([caps[0], caps[1]]);

    const gateStripe = new THREE.Mesh(gateStripeGeo, stripeMat);
    gateStripe.position.y = 0.122;
    cpGroup.add(gateStripe);

    group.add(cpGroup);
  }

  let lastStateKey = '';

  return {
    group,
    updateActiveCheckpoint: (activeIndex: number, isRacing: boolean, timeSeconds: number) => {
      const pulse = 1 + 0.18 * Math.sin(timeSeconds * 7.5);
      const stateKey = `${activeIndex}_${isRacing ? 1 : 0}`;
      const changed = stateKey !== lastStateKey;
      lastStateKey = stateKey;

      for (let i = 0; i < checkpoints.length; i++) {
        const isNext = isRacing && i === activeIndex;
        const isPassed = isRacing && i < activeIndex;

        if (changed) {
          if (isNext) {
            capMats[i].color.setHex(0x34d399);
            capMats[i].emissive.setHex(0x10b981);
            stripeMats[i].color.setHex(0x34d399);
          } else if (isPassed) {
            capMats[i].color.setHex(0x475569);
            capMats[i].emissive.setHex(0x1e293b);
            capMats[i].emissiveIntensity = 0.15;
            stripeMats[i].opacity = 0.08;
            capPairs[i][0].scale.setScalar(1);
            capPairs[i][1].scale.setScalar(1);
          } else {
            capMats[i].color.setHex(0x38bdf8);
            capMats[i].emissive.setHex(0x0284c7);
            capMats[i].emissiveIntensity = 0.35;
            stripeMats[i].color.setHex(0x38bdf8);
            stripeMats[i].opacity = 0.2;
            capPairs[i][0].scale.setScalar(1);
            capPairs[i][1].scale.setScalar(1);
          }
        }

        if (isNext) {
          capMats[i].emissiveIntensity = 1.15 + 0.65 * Math.sin(timeSeconds * 7.5);
          stripeMats[i].opacity = 0.38 + 0.2 * Math.sin(timeSeconds * 7.5);
          capPairs[i][0].scale.set(pulse, 1.15, pulse);
          capPairs[i][1].scale.set(pulse, 1.15, pulse);
        }
      }
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
